import { thresholdLab, hysteresis, sessionPlayback, toolCompare } from "./src/figures";
import ctxData from "./src/data/ctx-data.json";
import cmpData from "./src/data/cmp-data.json";

const ROOT = import.meta.dir;
const CONTENT = `${ROOT}/content`;
const REQUIRED = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13"];
const FIGURES: Record<string, () => string> = {
  "threshold-lab": thresholdLab,
  hysteresis,
  "session-playback": sessionPlayback,
  "tool-compare": toolCompare,
};

const EXTRA_FIGURES: Record<string, string[]> = {
  "11-comparison": ["tool-compare"],
};
const BOX_TYPES = new Set(["analogy", "term", "note", "warn"]);

type Box = { type: string; title: string; html: string };
type Chapter = { id: string; no: string; main: string; sub: string; summary: string; html: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const render = (md: string) => Bun.markdown.html(md);

function extractBoxes(md: string): { md: string; boxes: Box[] } {
  const lines = md.split("\n");
  const boxes: Box[] = [];
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const open = /^:::\s*([a-zA-Z]+)\s*(.*)$/.exec(lines[i]);
    if (open && BOX_TYPES.has(open[1])) {
      const type = open[1];
      const title = open[2].trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ":::") {
        body.push(lines[i]);
        i++;
      }
      i++;
      boxes.push({ type, title, html: render(body.join("\n").trim()) });
      out.push("", `<!--BOX:${boxes.length - 1}-->`, "");
    } else {
      out.push(lines[i]);
      i++;
    }
  }
  return { md: out.join("\n"), boxes };
}

function boxHtml(b: Box) {
  const label = b.title ? `\n<span class="box-title">${esc(b.title)}</span>` : "";
  return `<div class="box ${b.type}">${label}\n${b.html}\n</div>`;
}

const wrapTables = (html: string) =>
  html.replace(/<table>[\s\S]*?<\/table>/g, (m) => `<div class="table-wrap">${m}</div>`);

const styleGoals = (html: string) =>
  html.replace(
    /<h2>이 장에서 배우는 것<\/h2>\s*<ul>([\s\S]*?)<\/ul>/,
    (_m, inner) => `<div class="goals"><h3>이 장에서 배우는 것</h3><ul>${inner}</ul></div>`,
  );

function styleClosing(html: string) {
  const idx = html.indexOf("<h2>한 줄 정리</h2>");
  if (idx < 0) return html;
  const tail = html.slice(idx).replace(/<h2>한 줄 정리<\/h2>/, "");
  const cut = tail.search(/<h2>/);
  const body = cut < 0 ? tail : tail.slice(0, cut);
  const rest = cut < 0 ? "" : tail.slice(cut);
  return `${html.slice(0, idx)}<div class="closing"><span class="box-title">한 줄 정리</span>${body}</div>${rest}`;
}

const injectBoxes = (html: string, boxes: Box[]) =>
  html.replace(/<!--BOX:(\d+)-->/g, (_m, n) => boxHtml(boxes[Number(n)]));

function injectFigures(html: string) {
  return html.replace(/<!--FIG:([a-z-]+)-->/g, (_m, name) => {
    const fn = FIGURES[name];
    if (!fn) throw new Error(`unknown figure: ${name}`);
    return fn();
  });
}

function splitTitle(raw: string) {
  let t = raw.trim();
  t = t.replace(/^\d+\s*[·.\-–]\s*/, "").trim();
  const parts = t.split(/\s+—\s+/);
  const main = (parts.shift() || t).trim();
  return { main, sub: parts.join(" — ").trim() };
}

async function loadChapters(): Promise<Chapter[]> {
  const glob = new Bun.Glob("*.md");
  const files: string[] = [];
  for await (const f of glob.scan(CONTENT)) files.push(f);
  files.sort();

  const missing: string[] = [];
  const present = files.map((f) => f.slice(0, 2));
  for (const need of REQUIRED) {
    if (!present.includes(need)) missing.push(need);
  }
  if (missing.length && process.env.ATLAS_ALLOW_PARTIAL !== "1") {
    throw new Error(`missing chapter files for: ${missing.join(", ")}`);
  }

  const chapters: Chapter[] = [];
  for (const file of files) {
    const lines = (await Bun.file(`${CONTENT}/${file}`).text()).split("\n");

    const titleIdx = lines.findIndex((l) => l.startsWith("# "));
    if (titleIdx < 0) throw new Error(`${file}: no H1`);
    const { main, sub } = splitTitle(lines[titleIdx].slice(2));

    const sumIdx = lines.findIndex((l) => /^>\s*\*\*한 줄 요약:\*\*/.test(l));
    const summary = sumIdx >= 0 ? lines[sumIdx].replace(/^>\s*\*\*한 줄 요약:\*\*\s*/, "").trim() : "";

    let bodyMd = lines.filter((_l, idx) => idx !== titleIdx && idx !== sumIdx).join("\n");

    const extras = EXTRA_FIGURES[file.replace(/\.md$/, "")];
    if (extras) {
      for (const fig of extras) {
        if (!bodyMd.includes(`<!-- FIGURE:${fig} -->`)) {
          bodyMd = bodyMd.replace(/\n## 한 줄 정리/, `\n<!-- FIGURE:${fig} -->\n\n## 한 줄 정리`);
        }
      }
    }

    const { md, boxes } = extractBoxes(bodyMd);
    const withTokens = md.replace(/<!--\s*FIGURE:([a-z-]+)\s*-->/g, "<!--FIG:$1-->");
    let html = render(withTokens);
    html = injectBoxes(html, boxes);
    html = injectFigures(html);
    html = wrapTables(html);
    html = styleGoals(html);
    html = styleClosing(html);

    chapters.push({
      id: file.replace(/\.md$/, "").replace(/^\d+-/, ""),
      no: file.slice(0, 2),
      main,
      sub,
      summary,
      html,
    });
  }
  return chapters;
}

const HERO = `
<section class="hero" id="top">
  <p class="eyebrow">CONTEXT ATLAS · 초심자용 다시 쓰기</p>
  <h1>에이전트는 어떻게 <em>긴 대화</em>를 견디는가</h1>
  <p class="lede">
    모델은 지난 대화를 기억하지 않습니다. 하네스가 매번 처음부터 다시 보내야 합니다.
    대화가 길어지면 보내는 양도 계속 늘고, 언젠가 창이 꽉 차서 더 못 보냅니다.
    이 자료는 <strong>그때 하네스가 무엇을 어떻게 줄이는지</strong>를 다릅니다.
    원문 《컨텍스트 아틀라스》를 순서부터 다시 세워, 아무 배경지식 없이도 끝까지 읽히도록 다시 쓴 입문판입니다.
  </p>
  <div class="hero-meta">
    <span class="pill">원문을 다시 쓴 입문판</span>
    <span class="pill blue">숫자는 원문 그대로</span>
    <span class="pill blue">실측 세션 데이터 포함</span>
    <span class="pill amber">성능 실측은 아님</span>
  </div>
  <div class="howto">
    <h2>이 자료가 다루는 것</h2>
    <p style="margin:0 0 12px;font-size:14.5px;color:var(--muted)">
      원문은 에이전트 하네스의 효율을 <b>세 축</b>(보내는 토큰의 양 · 과금 단가 · 사용자의 대기 시간)으로 나눕니다.
      이 자료는 <b>그중 한 축, “보내는 토큰을 어떻게 줄이는가”만</b> 다룹니다. 프롬프트 캐시와 대기 시간 관리는 다루지 않습니다.
      직접 시키는 일을 공부하는 게 목적이라면 그 두 축은 배보다 배꼽입니다.
    </p>
    <ol>
      <li>1~3장은 준비 운동입니다. 용어가 낯설어도 여기서 다 풀어 두었으니 그냥 읽으세요.</li>
      <li>4~6장에서 큰 그림을 잡습니다. 여기까지만 이해해도 남에게 설명할 수 있습니다.</li>
      <li>7~8장이 실제 장치입니다. <b>1층 규칙 축소</b>와 <b>2층 요약 임계값</b>을 구분하는 게 핵심입니다.</li>
      <li>9~13장은 복원과 실패 관리, provider별 차이, 다른 도구와의 비교, 그리고 한계입니다.</li>
    </ol>
  </div>
</section>`;

function chapterHtml(c: Chapter, prev: Chapter | undefined, next: Chapter | undefined) {
  const nav = `<nav class="chnav">
        ${prev ? `<a class="prev" href="#${prev.id}"><span class="k">이전</span>${esc(prev.main)}</a>` : `<a class="prev dis" href="#top"><span class="k">이전</span>-</a>`}
        ${next ? `<a class="next" href="#${next.id}"><span class="k">다음</span>${esc(next.main)}</a>` : `<a class="next" href="#top"><span class="k">처음으로</span>맨 위로</a>`}
      </nav>`;
  return `<section class="chapter" id="${c.id}">
  <div class="chapter-head">
    <span class="chapter-no">${c.no}</span>
    <h2>${esc(c.main)}${c.sub ? `<span class="sub">${esc(c.sub)}</span>` : ""}</h2>
  </div>
  ${c.summary ? `<p class="summary-line"><b>한 줄 요약.</b> ${esc(c.summary)}</p>` : ""}
  <div class="body">
${c.html}
  </div>
  ${nav}
</section>`;
}

async function main() {
  const chapters = await loadChapters();
  const css = await Bun.file(`${ROOT}/src/style.css`).text();
  const js = await Bun.file(`${ROOT}/src/app.js`).text();

  const links = chapters
    .map((c) => `<li><a href="#${c.id}"><span class="n">${c.no}</span>${esc(c.main)}</a></li>`)
    .join("\n        ");

  const body = chapters.map((c, i) => chapterHtml(c, chapters[i - 1], chapters[i + 1])).join("\n\n");

  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>컨텍스트 아틀라스 입문 — 에이전트는 어떻게 긴 대화를 견디는가</title>
<meta name="description" content="에이전트 하네스가 모델에 보내는 토큰을 어떻게 줄이는지 초심자 눈높이로 다시 쓴 학습 자료. 규칙 기반 축소, 요약 임계값, 복원과 실패 관리를 순서대로 설명합니다.">
<meta name="color-scheme" content="light">
<style>${css}</style>
</head>
<body>
<div id="progress" aria-hidden="true"></div>
<header class="masthead">
  <div class="masthead-in">
    <span class="brand"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>CONTEXT ATLAS 101</span>
    <span class="spacer"></span>
    <span class="hint">초심자용 학습 자료 · ${chapters.length}장</span>
    <button class="toc-toggle" id="toc-toggle" type="button" aria-expanded="false" aria-controls="aside">목차</button>
  </div>
</header>
<div class="layout">
  <aside class="aside" id="aside">
    <div class="aside-title">이 자료의 목차</div>
    <ul class="toc">
        ${links}
    </ul>
    <div class="aside-note">
      <strong>무엇을 바꿨나</strong>
      원문의 순서를 "왜 → 무엇 → 어떻게"로 다시 세우고, 모든 전문용어를 처음 등장할 때 풀었습니다. 숫자·수식·조건은 원문을 그대로 옮겼습니다. 원문이 "실측이 아니다"라고 밝힌 부분은 여기서도 그대로 밝힙니다.
      <br><br>
      <strong>다루지 않는 것</strong>
      원문이 다루는 세 축 중 <b>프롬프트 캐시(과금 단가)</b>와 <b>대기 시간 관리</b>는 이 자료의 범위가 아닙니다. 보내는 토큰을 줄이는 로직만 다룹니다.
      <br><br>
      <strong>원문</strong>
      <a href="https://stevenahhh.github.io/context-atlas-20261005/">stevenahhh.github.io/context-atlas-20261005</a>
    </div>
  </aside>
  <main id="main">
${HERO}
${body}
  </main>
</div>
<footer class="site-foot">
  <span>컨텍스트 아틀라스 입문 · 원문을 초심자용으로 다시 쓴 자료입니다.</span>
  <span>원문: <a href="https://stevenahhh.github.io/context-atlas-20261005/">CONTEXT ATLAS — 효율적인 에이전트 하네스의 구조</a></span>
</footer>
<script type="application/json" id="ctx-data">${JSON.stringify(ctxData)}</script>
<script type="application/json" id="cmp-data">${JSON.stringify(cmpData)}</script>
<script>${js}</script>
</body>
</html>
`;

  await Bun.write(`${ROOT}/index.html`, html);
  console.log(`built index.html — ${chapters.length} chapters, ${(html.length / 1024).toFixed(0)} KB`);
}

await main();
