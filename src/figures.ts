import ctxData from "./data/ctx-data.json";
import cmpData from "./data/cmp-data.json";

const num = (v: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);

function head(title: string, tag: string) {
  return `<div class="figure-head"><h3>${title}</h3><span class="tag">${tag}</span></div>`;
}

export function thresholdLab(): string {
  return `<figure class="figure" id="fig-threshold">
${head("컨텍스트 예산 실험실", "FORMULA / INTERACTIVE")}
<p class="cap" style="margin-top:0">값을 바꾸면 아래 경계가 문서에 적힌 공식 그대로 다시 계산됩니다. 실제 세션이나 모델을 부르지는 않습니다.</p>
<div class="ctrl-grid">
  <label class="ctrl">컨텍스트 창 C
    <select id="window-size">
      <option value="16000">16,000 tokens</option>
      <option value="32000">32,000 tokens</option>
      <option value="64000">64,000 tokens</option>
      <option value="128000">128,000 tokens</option>
      <option value="200000" selected>200,000 tokens</option>
      <option value="512000">512,000 tokens</option>
      <option value="1000000">1,000,000 tokens</option>
      <option value="2000000">2,000,000 tokens</option>
    </select>
    <small>모델이 한 번에 볼 수 있는 토큰의 최대 개수입니다.</small>
  </label>
  <label class="ctrl">직전 요약의 절약률
    <select id="yield-mode">
      <option value="base" selected>없음 / 10~50%</option>
      <option value="high">50% 초과 → 기본 임계값 −5%p</option>
    </select>
    <small>이전 임계값을 누적 조정하지 않고 기본값에서 다시 계산합니다.</small>
  </label>
  <label class="ctrl">설정된 compaction reserve
    <input id="reserve-tokens" type="number" min="0" max="131072" step="1" value="16384">
    <small>하드 리밋과 grace 계산에 쓰입니다.</small>
  </label>
  <label class="ctrl">모델 출력 한도 maxTokens
    <input id="output-tokens" type="number" min="0" max="2000000" step="1" value="32000">
    <small>긴급 축소의 프롬프트 공간 계산에 쓰입니다. 0은 유효 값 없음입니다.</small>
  </label>
  <div class="checks">
    <label class="check"><input id="reserve-scaling" type="checkbox" checked> 창 크기별 reserve scaling</label>
    <label class="check"><input id="job-pending" type="checkbox" checked> 미완성 speculative job 있음</label>
  </div>
  <div class="full">
    <div class="range-row"><label for="usage-range">판정용 컨텍스트 사용량</label><output id="usage-value">130,000 tokens · 65%</output></div>
    <input id="usage-range" type="range" min="0" max="100" step="1" value="65">
    <div class="axis"><span>0%</span><span>50%</span><span>100%</span></div>
  </div>
</div>
<div class="err" id="sim-error" hidden></div>
<div>
  <p class="cap" style="margin:0 0 12px">같은 창 C 위에 놓은 경계 <strong id="chart-window">C = 200,000</strong></p>
  <div class="rows" id="chart-rows"></div>
</div>
<div class="verdict" id="sim-state" data-tone="green">
  <h4 id="sim-state-title">계산 중</h4>
  <p id="sim-state-body"></p>
</div>
<dl class="mini" id="mini-metrics"></dl>
<div class="btnrow"><button class="btn" id="sim-reset" type="button">기본값으로 초기화</button></div>
<p class="cap">세로 표시는 입력 사용량의 위치입니다. 어떤 경계에 도달했다는 사실이 그 작업의 즉시 실행을 보장하지는 않습니다. 한 줄씩, 경계가 왜 그 자리에 있는지 확인해 보세요.</p>
</figure>`;
}

export function hysteresis(): string {
  return `<figure class="figure" id="fig-hysteresis">
${head("이전 상태를 기억하는 히스테리시스 판정", "HYSTERESIS / STATEFUL DEMO")}
<p class="cap" style="margin-top:0">비율은 앞선 변환을 거친 뒤의 메시지 추정량을 프롬프트용 창으로 나눈 값입니다. 아래 슬라이더를 움직여 보세요. 같은 90%라도 직전 상태에 따라 켜짐/꺼짐이 달라집니다.</p>
<div class="latch-row">
  <div>
    <div class="range-row"><label for="hysteresis-range">변환 후 추정 사용률</label><output id="hysteresis-value">90%</output></div>
    <input id="hysteresis-range" type="range" min="75" max="100" step="1" value="90">
    <div class="axis"><span>75%</span><span>85% 해제</span><span>95% 초과 진입</span><span>100%</span></div>
    <p class="cap" id="hysteresis-help">90% · 지금은 비활성입니다. 95%를 초과해야 켜집니다.</p>
  </div>
  <div class="latch" id="latch-status" data-on="false" role="status">OFF · 비활성</div>
</div>
<div class="steps">
  <div class="step"><strong>93%</strong><small>OFF · 아직 여유</small></div>
  <div class="step on"><strong>96%</strong><small>ON · 진입</small></div>
  <div class="step on"><strong>93%</strong><small>ON · 유지</small></div>
  <div class="step on"><strong>89%</strong><small>ON · 유지</small></div>
  <div class="step"><strong>85%</strong><small>OFF · 해제</small></div>
  <div class="step"><strong>88%</strong><small>OFF · 유지</small></div>
</div>
<div class="btnrow"><button class="btn" id="hysteresis-reset" type="button">90% · OFF로 초기화</button></div>
<p class="cap">진입과 해제의 경계를 나눠 두면 사용량이 한 임계값 주변을 오갈 때 요청 형태가 반복해서 바뀌는 일을 줄일 수 있습니다. provider가 재사용할 수 있는 프롬프트 앞부분을 안정적으로 유지하려는 이유입니다.</p>
</figure>`;
}

export function asyncTimeline(): string {
  const C = 200000;
  const ratio = 0.7;
  const T = C * ratio;
  const lead = Math.min(32768, Math.max(8192, Math.floor(T * 0.125)));
  const reserve = Math.max(16384, Math.min(Math.floor(C * 0.04), 49152));
  const start = T - lead;
  const G = Math.min(T + lead, C - reserve);
  const hard = C - reserve;
  const p = (v: number) => Math.max(0, Math.min(100, (v / hard) * 100));
  return `<figure class="figure" id="fig-async">
${head("200k 창에서 선행 생성의 위치", "TIMELINE / C = 200,000")}
<div class="tl">
  <div><span class="k">A / SNAPSHOT</span><h4>기준점 확보</h4><p>메시지 revision과 generation, 보존할 경계를 요약의 기준으로 잡습니다.</p></div>
  <div><span class="k">B / GENERATE</span><h4>백그라운드 생성</h4><p>요약 요청을 시작해 본래 작업이나 유휴 시간과 겹칩니다.</p></div>
  <div><span class="k">C / VALIDATE</span><h4>현재 대화와 대조</h4><p>generation이 달라지거나 anchor가 무효면 적용하지 않습니다.</p></div>
  <div><span class="k">D / APPLY OR HOLD</span><h4>적용 또는 보관</h4><p>유휴 적용 조건을 넘으면 적용하고, 못 넘으면 warm으로 보관합니다.</p></div>
</div>
<div class="tl-band" aria-hidden="true">
  <span class="lead" style="left:${p(start)}%;width:${p(T) - p(start)}%"></span>
  <span class="grace" style="left:${p(T)}%;width:${p(G) - p(T)}%"></span>
  <i style="left:${p(start)}%"></i><b style="left:${p(start)}%">${num(start)} 생성 시작</b>
  <i style="left:${p(T)}%"></i><b style="left:${p(T)}%">${num(T)} 임계값</b>
  <i style="left:${p(G)}%"></i><b style="left:${p(G)}%">${num(G)} grace 상한</b>
  <i style="left:${p(hard)}%"></i><b style="left:${p(hard)}%">${num(hard)} 하드 리밋</b>
</div>
<div class="tl-legend">
  <span><i style="background:var(--blue-soft)"></i>생성 시작 <b>${num(start)}</b> → 임계값 <b>${num(T)}</b></span>
  <span><i style="background:var(--amber-soft)"></i>grace 구간 임계값 <b>${num(T)}</b> → <b>${num(G)}</b></span>
  <span><i style="background:var(--paper);border:1px solid var(--line)"></i>하드 리밋 <b>${num(hard)}</b></span>
</div>
<p class="cap">lead L은 임계값 T의 12.5%를 8192~32768 사이로 제한한 값입니다. 여기서는 <b>${num(lead)}</b>토큰이라 생성이 <b>${num(start)}</b>토큰에서 시작하고, 임계값을 넘긴 뒤 grace 상한 <b>${num(G)}</b>토큰까지 미완성 job에 시간을 줍니다. 가로 길이는 생성 시간이나 비용의 비율이 아닙니다.</p>
</figure>`;
}

export function sessionPlayback(): string {
  const axis = ctxData.axis;
  const stats = ctxData.stats;
  const comps = ctxData.comps;
  const first = ctxData.calls[0][1];
  const last = ctxData.calls[ctxData.calls.length - 1][1];
  const grid = [100000, 200000, 300000]
    .map((v) => `<i style="left:${(v / axis) * 100}%"></i><b style="left:${(v / axis) * 100}%">${v / 1000}k</b>`)
    .join("");
  return `<figure class="figure" id="fig-session">
${head("실제 세션 하나를 처음부터 끝까지 재생", "MEASURED / PLAYBACK")}
<div id="ctx-anim">
  <div class="pb-head">
    <p class="pb-now"><output id="ctx-now">${num(first)}</output><span>토큰 (프롬프트)</span></p>
    <p class="pb-clock">활동 0분</p>
  </div>
  <div class="pb-bar-wrap">
    <div class="pb-bar" id="ctx-bar">
      <span class="pb-fill" style="width:${(first / axis) * 100}%"></span>
      <span class="pb-ghost"></span>
      <span class="pb-grid" aria-hidden="true">${grid}</span>
    </div>
    <span class="pb-chip" id="ctx-chip" hidden>컴팩션</span>
  </div>
  <div class="pb-strip-wrap">
    <canvas class="pb-strip" id="ctx-strip" role="img" aria-label="메시지 ${num(stats.messages)}개의 도착 순서를 찍은 띠"></canvas>
    <span class="pb-playhead"></span>
  </div>
  <div class="pb-legend">
    <span><i class="dot user"></i>사용자</span>
    <span><i class="dot asst"></i>어시스턴트</span>
    <span><i class="dot tool"></i>도구 결과</span>
    <span style="font-family:var(--mono)">축: 0 ~ ${num(axis)} 토큰</span>
  </div>
  <div class="btnrow"><button class="btn primary" id="ctx-toggle" type="button">재생</button></div>
  <dl class="mini" style="grid-template-columns:repeat(5,minmax(0,1fr))">
    <div><dt>모델 호출</dt><dd>${num(stats.calls)}</dd></div>
    <div><dt>메시지</dt><dd>${num(stats.messages)}</dd></div>
    <div><dt>컴팩션</dt><dd>${stats.comps}회</dd></div>
    <div><dt>최대 프롬프트</dt><dd>${num(stats.maxPrompt)}</dd></div>
    <div><dt>기간</dt><dd>약 ${stats.spanH}시간</dd></div>
  </dl>
  <p class="cap">
    세션 시작 <b>33,845</b> · 첫 컴팩션 직전 <b>238,875</b> · 세션 최대 <b>307,310</b> · 마지막 호출 <b>63,379</b>.
    값은 세션 로그의 제공자 사용량 필드(입력 + 캐시 읽기)를 그대로 쓴 실측입니다. 컴팩션 ${comps.length}건의 전후 수치도 로그에 기록된 값입니다.
    야간처럼 메시지가 없는 긴 빈 구간(10분 초과 25곳, 합계 36.4시간, 최장 17.4시간)은 잘라내고 활동 시간(약 13.8시간)만 이어 붙였습니다.
    프롬프트 값이 비어 있는 호출 78개는 재생에서 건너뜁니다. 세션 이름과 식별자는 표시하지 않습니다.
  </p>
</div>
</figure>`;
}

export function toolCompare(): string {
  const rows = cmpData.tools
    .map((t) => {
      const windowNote = t.window ? `창 ${num(t.window)}` : "창 미기록";
      return `<div class="cmp-row" data-tool="${t.id}">
  <div class="cmp-head">
    <span><b class="cmp-name">${t.name}</b> <span class="cmp-meta">${t.model} · ${windowNote}</span></span>
    <span class="cmp-elapsed">활동 0분</span>
  </div>
  <div class="pb-bar-wrap" style="margin-top:8px">
    <div class="pb-bar" style="height:34px">
      <span class="cmp-fill" style="width:0%"></span>
      <span class="cmp-ghost"></span>
      <span class="pb-grid" aria-hidden="true"><i style="left:23.53%"></i><b style="left:23.53%">200k</b><i style="left:47.06%"></i><b style="left:47.06%">400k</b><i style="left:70.59%"></i><b style="left:70.59%">600k</b><i style="left:94.12%"></i><b style="left:94.12%">800k</b></span>
    </div>
    <span class="cmp-chip" hidden>컴팩션</span>
  </div>
  <div class="pb-strip-wrap" style="margin-top:6px">
    <canvas class="cmp-strip" role="img" aria-label="${t.name} 세션의 메시지 도착 순서"></canvas>
    <span class="cmp-playhead" style="left:0%"></span>
  </div>
  <p class="cap" style="margin-top:8px">현재 <span class="cmp-now">0</span> 토큰 (프롬프트)</p>
</div>`;
    })
    .join("\n");
  return `<figure class="figure" id="fig-compare">
${head("세 도구의 가장 긴 세션을 같은 문법으로 재생", "MEASURED / PLAYBACK")}
<div id="cmp-anim">
  ${rows}
  <div class="btnrow"><button class="btn primary" id="cmp-toggle" type="button">재생</button></div>
  <div class="pb-legend">
    <span><i class="dot user"></i>사용자</span>
    <span><i class="dot asst"></i>어시스턴트</span>
    <span><i class="dot tool"></i>도구/결과</span>
    <span style="font-family:var(--mono)">공통 축: 0 ~ ${num(cmpData.axis)} 토큰</span>
  </div>
  <p class="cap">가로축은 각자의 활동 시간(10분 초과 빈 구간 제거)이고, 재생은 진행률을 맞춰 함께 흐릅니다. 표본은 도구당 세션 하나씩이며 작업 내용이 달라 일반 성능 비교가 아닙니다. 비교의 초점은 창이 차오르는 기울기와 도달 지점입니다.</p>
</div>
</figure>`;
}
