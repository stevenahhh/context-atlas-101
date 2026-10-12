(function () {
  "use strict";
  var root = document.documentElement;
  root.classList.add("js");

  var fmt = function (v) { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v); };
  var pct = function (v) { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(v) + "%"; };
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }
  function $(id) { return document.getElementById(id); }
  var progress = $("progress");
  if (progress) {
    var updateProgress = function () {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var ratio = max > 0 ? doc.scrollTop / max : 0;
      progress.style.width = Math.max(0, Math.min(100, ratio * 100)) + "%";
    };
    addEventListener("scroll", updateProgress, { passive: true });
    addEventListener("resize", updateProgress);
    updateProgress();
  }
  var tocToggle = $("toc-toggle");
  var aside = $("aside");
  on(tocToggle, "click", function () {
    var open = aside.classList.toggle("open");
    tocToggle.setAttribute("aria-expanded", String(open));
  });
  document.querySelectorAll(".toc a").forEach(function (a) {
    a.addEventListener("click", function () {
      if (window.innerWidth <= 1060 && aside) { aside.classList.remove("open"); tocToggle.setAttribute("aria-expanded", "false"); }
    });
  });
  var links = [].slice.call(document.querySelectorAll(".toc a"));
  var byHash = {};
  links.forEach(function (a) { byHash[a.getAttribute("href")] = a; });
  var chapters = [].slice.call(document.querySelectorAll("section.chapter"));
  if (chapters.length && "IntersectionObserver" in window) {
    var spy = new IntersectionObserver(function (entries) {
      var vis = entries.filter(function (e) { return e.isIntersecting; })
        .sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; });
      if (!vis.length) return;
      var id = "#" + vis[0].target.id;
      links.forEach(function (a) {
        if (a.getAttribute("href") === id) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
    }, { rootMargin: "-10% 0px -70% 0px", threshold: 0 });
    chapters.forEach(function (s) { spy.observe(s); });
  }
  var sim = {
    windowSize: $("window-size"), yieldMode: $("yield-mode"),
    reserve: $("reserve-tokens"), output: $("output-tokens"),
    scaling: $("reserve-scaling"), pending: $("job-pending"), usage: $("usage-range")
  };

  function geometry(C, highYield, configuredReserve, maxOutput, scaleReserve) {
    var baseRatio = C <= 16000 ? 0.45 : C <= 32000 ? 0.5 : C <= 64000 ? 0.55 : C <= 128000 ? 0.6 : C <= 512000 ? 0.7 : 0.8;
    var ratio = Math.min(0.85, Math.max(0.4, baseRatio - (highYield ? 0.05 : 0)));
    var threshold = C * ratio;
    var lead = Math.min(32768, Math.max(8192, Math.floor(threshold * 0.125)));
    var reserve = scaleReserve ? Math.max(configuredReserve, Math.min(Math.floor(C * 0.04), 49152)) : configuredReserve;
    var promptWindow = maxOutput > 0 ? C - Math.min(maxOutput, Math.floor(C * 0.5)) : C;
    return {
      C: C, baseRatio: baseRatio, ratio: ratio, threshold: threshold, lead: lead,
      reserve: reserve, promptWindow: promptWindow,
      admission: Math.min(50000, Math.max(8192, Math.floor(C * 0.05))),
      warm: C * 0.5,
      reminder: Math.max(0, threshold - 2 * lead),
      speculative: Math.max(0, threshold - lead),
      grace: Math.min(threshold + lead, C - reserve),
      hard: C - reserve,
      upstream: C - configuredReserve,
      emergencyEngage: Math.floor(promptWindow * 0.95),
      emergencyRelease: Math.floor(promptWindow * 0.85)
    };
  }

  function verdict(g, usage, pending) {
    if (g.reserve >= g.C) return { tone: "red", title: "이 조합에서는 정상 실행으로 보기 어렵습니다", body: "유효 compaction reserve가 창 크기 이상입니다. 이 설정이면 하드 리밋 판정에 곧바로 걸릴 수 있으니 reserve를 낮춰 보세요." };
    if (usage + g.reserve >= g.C) return { tone: "red", title: "하드 리밋 분기", body: "입력 사용량과 유효 reserve의 합이 창 이상입니다. grace보다 먼저 blocking compaction 경로로 들어갑니다. 실제로 요약이 적용되는지는 job 결과, 소유권, 실패 상태라는 추가 조건을 더 봐야 합니다." };
    if (usage >= g.threshold) {
      if (pending && usage < g.grace) return { tone: "blue", title: "임계값 도달 · grace로 blocking 유예", body: "미완성 job이 있고 grace 상한보다 아래이므로 proactive blocking을 미룹니다. 이미 완료된 job에는 이 유예가 적용되지 않습니다." };
      return { tone: "amber", title: "Proactive blocking 분기", body: pending ? "요약 임계값 이상이고 grace 상한에도 도달했습니다. blocking 경로가 기존 job을 기다리거나 그 결과를 소비할 수 있습니다." : "요약 임계값 이상이고 미완성 job이 없습니다. grace 유예 없이 blocking 경로를 실행합니다." };
    }
    if (usage >= g.speculative) return { tone: "blue", title: pending ? "Speculative 구간 · 기존 job 유지" : "Speculative 생성 시작 조건 충족", body: pending ? "이미 job이 있으면 중복해서 새로 만들지 않습니다." : "임계값에서 lead만큼 앞선 지점에 도달했습니다. 이 예시의 일반 관리 경로에서는 요약을 백그라운드로 시작할 수 있습니다." };
    if (usage >= g.warm) return { tone: "green", title: "아직 pre-turn speculative 시작점 전", body: "여기서는 아직 선행 생성을 시작하지 않습니다. 다만 50% reduction gate와 agent_end의 유휴 warm 하한에는 도달했습니다." };
    return { tone: "green", title: "어느 임계값에도 닿지 않았습니다", body: "이 입력에서는 하드 리밋, proactive, speculative 분기의 시작 조건에 도달하지 않았습니다. 크기를 넘는 도구 출력을 자르는 admission은 이와 별개로 매 요청 동작할 수 있습니다." };
  }

  var ROW_DEFS = [
    ["warm", "축소 · 유휴 warm 하한 (창의 50%)", "var(--green)"],
    ["reminder", "토큰 예산 리마인더 시작", "var(--blue)"],
    ["speculative", "Speculative 생성 시작 (T − lead)", "var(--blue)"],
    ["threshold", "요약 임계값 T", "var(--amber)"],
    ["grace", "Grace 상한 G", "var(--amber)"],
    ["hard", "하드 리밋 (C − reserve)", "var(--red)"],
    ["upstream", "pi 기준선 (같은 reserve 설정)", "var(--muted)"]
  ];

  function renderSimulator() {
    if (!sim.windowSize || !sim.usage) return;
    var errorEl = $("sim-error");
    var invalid = [sim.reserve, sim.output].some(function (i) { return !i || i.value === "" || !i.validity.valid; });
    if (invalid) {
      if (errorEl) { errorEl.hidden = false; errorEl.textContent = "reserve는 0~131,072, 출력 한도는 0~2,000,000 사이의 정수로 입력하세요. 차트는 마지막으로 유효했던 입력을 그대로 보여 줍니다."; }
      return;
    }
    if (errorEl) errorEl.hidden = true;

    var g = geometry(Number(sim.windowSize.value), sim.yieldMode.value === "high", Number(sim.reserve.value), Number(sim.output.value), sim.scaling.checked);
    var usage = Math.round(g.C * Number(sim.usage.value) / 100);

    var usageOut = $("usage-value");
    if (usageOut) usageOut.textContent = fmt(usage) + " tokens · " + pct(Number(sim.usage.value));
    var chartWindow = $("chart-window");
    if (chartWindow) chartWindow.textContent = "C = " + fmt(g.C);

    var host = $("chart-rows");
    if (host) {
      host.replaceChildren();
      ROW_DEFS.forEach(function (def) {
        var value = g[def[0]];
        var row = document.createElement("div");
        row.className = "mrow";
        var name = document.createElement("span");
        name.className = "mname"; name.textContent = def[1];
        var track = document.createElement("div");
        track.className = "mtrack"; track.setAttribute("aria-hidden", "true");
        track.style.setProperty("--w", Math.max(0, Math.min(100, value / g.C * 100)) + "%");
        track.style.setProperty("--u", Number(sim.usage.value) + "%");
        track.style.setProperty("--c", def[2]);
        var fill = document.createElement("span"); fill.className = "mfill";
        var now = document.createElement("span"); now.className = "mnow";
        track.append(fill, now);
        var val = document.createElement("span");
        val.className = "mval"; val.textContent = fmt(value);
        var small = document.createElement("small");
        small.textContent = pct(value / g.C * 100);
        val.append(small);
        row.append(name, track, val);
        host.append(row);
      });
    }

    var v = verdict(g, usage, sim.pending.checked);
    var stateEl = $("sim-state");
    if (stateEl) stateEl.dataset.tone = v.tone;
    var titleEl = $("sim-state-title");
    if (titleEl) titleEl.textContent = v.title;
    var bodyEl = $("sim-state-body");
    if (bodyEl) {
      var remaining = g.threshold - usage;
      var inReminder = remaining > 0 && remaining <= 2 * g.lead;
      bodyEl.textContent = v.body + (inReminder ? " 지금은 리마인더 조건 구간입니다. 임계값까지 약 " + fmt(remaining) + "토큰이 남았습니다. 실제 안내는 generation당 한 번 나갑니다." : "");
    }

    var mini = $("mini-metrics");
    if (mini) {
      var stats = [
        ["적용 임계 비율", pct(g.ratio * 100)],
        ["Speculative lead", fmt(g.lead)],
        ["유효 compaction reserve", fmt(g.reserve)],
        ["도구 텍스트 admission cap", fmt(g.admission)],
        ["프롬프트용 창 P", fmt(g.promptWindow)],
        ["긴급 축소 진입 / 해제", fmt(g.emergencyEngage) + " / " + fmt(g.emergencyRelease)]
      ];
      mini.replaceChildren();
      stats.forEach(function (s) {
        var wrap = document.createElement("div");
        var dt = document.createElement("dt"); dt.textContent = s[0];
        var dd = document.createElement("dd"); dd.textContent = s[1];
        wrap.append(dt, dd); mini.append(wrap);
      });
    }
  }

  if (sim.windowSize) {
    Object.keys(sim).forEach(function (k) { on(sim[k], "input", renderSimulator); });
    on($("sim-reset"), "click", function () {
      sim.windowSize.value = "200000"; sim.yieldMode.value = "base";
      sim.reserve.value = "16384"; sim.output.value = "32000";
      sim.scaling.checked = true; sim.pending.checked = true; sim.usage.value = "65";
      renderSimulator();
    });
    renderSimulator();
  }
  var hRange = $("hysteresis-range");
  if (hRange) {
    var engaged = false;
    var renderHysteresis = function () {
      var ratio = Number(hRange.value);
      engaged = engaged ? ratio > 85 : ratio > 95;
      var out = $("hysteresis-value");
      if (out) out.textContent = ratio + "%";
      var status = $("latch-status");
      if (status) {
        status.dataset.on = String(engaged);
        status.textContent = engaged ? "ON · 축소 유지" : "OFF · 비활성";
      }
      var help = $("hysteresis-help");
      if (help) {
        help.textContent = engaged
          ? ratio + "% · 한 번 켜진 latch는 85% 이하로 내려가야 해제됩니다."
          : ratio + "% · 지금은 비활성입니다. 95%를 초과해야 켜집니다.";
      }
    };
    on(hRange, "input", renderHysteresis);
    on($("hysteresis-reset"), "click", function () { engaged = false; hRange.value = "90"; renderHysteresis(); });
    renderHysteresis();
  }
  var EV_COLORS = { 0: "#315d87", 1: "#245b45", 2: "#58645f", 3: "#933e35" };
  var EV_HEIGHTS = { 0: 22, 1: 13, 2: 8, 3: 6 };
  var CMP_COLORS = { 0: "#315d87", 1: "#245b45", 2: "#58645f", 3: "#933e35" };
  var CMP_HEIGHTS = { 0: 13, 1: 8, 2: 6, 3: 5 };

  function readData(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }

  function buildSessionPlayer(rootEl, D) {
    var fill = rootEl.querySelector(".pb-fill");
    var ghost = rootEl.querySelector(".pb-ghost");
    var chip = rootEl.querySelector(".pb-chip");
    var nowEl = rootEl.querySelector(".pb-now output");
    var clockEl = rootEl.querySelector(".pb-clock");
    var btn = rootEl.querySelector("button");
    var head = rootEl.querySelector(".pb-playhead");
    var bar = rootEl.querySelector(".pb-bar");
    var canvas = rootEl.querySelector(".pb-strip");
    var ctx = canvas.getContext("2d");

    var evT = new Float64Array(D.ev.length);
    var evR = new Uint8Array(D.ev.length);
    var acc = 0;
    for (var i = 0; i < D.ev.length; i++) { acc += D.ev[i][0] * 1000; evT[i] = acc; evR[i] = D.ev[i][1]; }

    var calls = D.calls, comps = D.comps, DUR = D.durMs, AXIS = D.axis;
    var BASE = 30000, HOLD = 360, TOTAL = BASE + comps.length * HOLD;
    var holds = [];
    var shift = 0;
    comps.forEach(function (c) {
      var s = (c.t / DUR) * BASE + shift;
      holds.push({ start: s, end: s + HOLD, t: c.t });
      shift += HOLD;
    });

    var evPtr = 0, callPtr = 0, compPtr = 0, dimT = -1, W = 0, H = 0, dpr = 1;
    var playing = false, finished = false, elapsed = 0, lastNow = 0, raf = 0, dipTimer = 0, chipTimer = 0, flashTimer = 0;

    function toPct(v) { return Math.max(0, Math.min(100, (v / AXIS) * 100)); }
    function mapT(el) {
      var sh = 0;
      for (var k = 0; k < holds.length; k++) {
        var h = holds[k];
        if (el <= h.start) return ((el - sh) / BASE) * DUR;
        if (el <= h.end) return h.t;
        sh += HOLD;
      }
      return ((el - sh) / BASE) * DUR;
    }
    function drawTick(idx) {
      var x = (evT[idx] / DUR) * W;
      var r = evR[idx];
      ctx.globalAlpha = dimT >= 0 && evT[idx] < dimT ? 0.22 : (r === 2 ? 0.5 : 0.82);
      ctx.fillStyle = EV_COLORS[r] || EV_COLORS[3];
      var h = (EV_HEIGHTS[r] || 6) * dpr;
      ctx.fillRect(x, H - h, Math.max(1, 1.4 * dpr), h);
    }
    function redrawTicks() {
      ctx.clearRect(0, 0, W, H);
      for (var k = 0; k < evPtr; k++) drawTick(k);
      for (var j = 0; j < compPtr; j++) {
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "#87531c";
        ctx.fillRect((comps[j].t / DUR) * W, 0, Math.max(1, 1.2 * dpr), H);
      }
      ctx.globalAlpha = 1;
    }
    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(1, Math.floor((canvas.clientWidth || 700) * dpr));
      H = Math.max(1, Math.floor(34 * dpr));
      canvas.width = W; canvas.height = H;
      redrawTicks();
    }
    function setPrompt(p) { fill.style.width = toPct(p) + "%"; if (nowEl) nowEl.textContent = fmt(p); }
    function maybeDip(p) {
      var prev = parseFloat(fill.dataset.prev || "0");
      if (prev > 0 && p < prev * 0.995) {
        fill.classList.add("dip");
        clearTimeout(dipTimer);
        dipTimer = setTimeout(function () { fill.classList.remove("dip"); }, 160);
      }
      fill.dataset.prev = String(p);
    }
    function cross(i) {
      var c = comps[i];
      ghost.style.width = fill.style.width;
      ghost.style.opacity = "1";
      clearTimeout(chipTimer);
      setTimeout(function () { ghost.style.opacity = "0"; }, 80);
      if (chip) {
        chip.textContent = "컴팩션 #" + c.i + " · " + fmt(c.before) + " → " + (c.after == null ? "?" : fmt(c.after));
        chip.hidden = false; chip.classList.add("show");
        chipTimer = setTimeout(function () { chip.classList.remove("show"); }, 2400);
      }
      bar.classList.add("flash");
      clearTimeout(flashTimer);
      flashTimer = setTimeout(function () { bar.classList.remove("flash"); }, 640);
      dimT = c.keptT == null ? c.t : c.keptT;
      redrawTicks();
    }
    function frame(now) {
      if (!playing) return;
      elapsed += now - lastNow; lastNow = now;
      if (elapsed >= TOTAL) { elapsed = TOTAL; playing = false; finished = true; finish(); return; }
      var st = mapT(elapsed);
      while (compPtr < comps.length && comps[compPtr].t <= st) cross(compPtr++);
      while (callPtr + 1 < calls.length && calls[callPtr + 1][0] * 1000 <= st) callPtr++;
      var p = calls[callPtr] ? calls[callPtr][1] : 0;
      maybeDip(p); setPrompt(p);
      while (evPtr < evT.length && evT[evPtr] <= st) { drawTick(evPtr); evPtr++; }
      head.style.left = Math.min(100, (st / DUR) * 100) + "%";
      var hrs = st / 3600e3;
      if (clockEl) clockEl.textContent = "활동 " + Math.floor(hrs) + "시간 " + String(Math.floor((hrs % 1) * 60)).padStart(2, "0") + "분";
      raf = requestAnimationFrame(frame);
    }
    function reset() {
      cancelAnimationFrame(raf); playing = false; finished = false; elapsed = 0;
      evPtr = 0; callPtr = 0; compPtr = 0; dimT = -1;
      fill.dataset.prev = "0";
      setPrompt(calls[0][1]);
      head.style.left = "0%";
      if (clockEl) clockEl.textContent = "활동 0분";
      if (chip) { chip.hidden = true; chip.classList.remove("show"); }
      if (btn) btn.textContent = "재생";
      resize();
    }
    function finish() {
      callPtr = calls.length - 1; compPtr = comps.length;
      while (evPtr < evT.length) { drawTick(evPtr); evPtr++; }
      redrawTicks();
      setPrompt(calls[calls.length - 1][1]);
      head.style.left = "100%";
      if (clockEl) clockEl.textContent = "활동 " + Math.floor(DUR / 3600e3) + "시간 경과";
      if (chip) { chip.hidden = true; chip.classList.remove("show"); }
      if (btn) btn.textContent = "처음부터";
    }
    function play() {
      if (reduceMotion || playing) return;
      if (finished) reset();
      playing = true; lastNow = performance.now();
      if (btn) btn.textContent = "일시정지";
      raf = requestAnimationFrame(frame);
    }
    function pause() {
      if (!playing) return;
      playing = false; cancelAnimationFrame(raf);
      if (btn) btn.textContent = "재생";
    }
    on(btn, "click", function () { if (playing) pause(); else play(); });
    addEventListener("beforeprint", function () { pause(); finish(); });
    addEventListener("resize", function () { resize(); });
    if (reduceMotion) {
      if (btn) btn.hidden = true;
      finish();
    } else {
      reset();
      if ("IntersectionObserver" in window) {
        var io = new IntersectionObserver(function (es) {
          if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); play(); }
        }, { threshold: 0.3 });
        io.observe(rootEl);
      }
    }
  }

  var ctxRoot = $("ctx-anim");
  var ctxData = readData("ctx-data");
  if (ctxRoot && ctxData) buildSessionPlayer(ctxRoot, ctxData);
  function buildCompare() {
    var cmpRoot = $("cmp-anim");
    var D = readData("cmp-data");
    if (!cmpRoot || !D) return;
    var btn = $("cmp-toggle");
    var TOTAL = 30000;
    var tools = new Map(D.tools.map(function (t) { return [t.id, t]; }));
    var players = [];

    [].slice.call(cmpRoot.querySelectorAll(".cmp-row")).forEach(function (row) {
      var tool = tools.get(row.dataset.tool);
      if (!tool) return;
      var fill = row.querySelector(".cmp-fill");
      var ghost = row.querySelector(".cmp-ghost");
      var chip = row.querySelector(".cmp-chip");
      var nowEl = row.querySelector(".cmp-now");
      var clockEl = row.querySelector(".cmp-elapsed");
      var head = row.querySelector(".cmp-playhead");
      var canvas = row.querySelector(".cmp-strip");
      var ctx = canvas.getContext("2d");
      var evT = new Float64Array(tool.ev.length), evR = new Uint8Array(tool.ev.length);
      var acc = 0;
      for (var i = 0; i < tool.ev.length; i++) { acc += tool.ev[i][0] * 1000; evT[i] = acc; evR[i] = tool.ev[i][1]; }
      var calls = tool.calls, comps = tool.comps, DUR = Math.max(1, tool.durMs), AXIS = D.axis;
      var evPtr = 0, callPtr = 0, compPtr = 0, dimT = -1, W = 0, H = 0, dpr = 1, chipTimer = 0;
      var pctOf = function (v) { return Math.max(0, Math.min(100, (v / AXIS) * 100)); };
      var clock = function (ms) { var h = ms / 3600e3; return "활동 " + Math.floor(h) + "시간 " + String(Math.floor((h % 1) * 60)).padStart(2, "0") + "분"; };
      var drawTick = function (idx) {
        var r = evR[idx];
        ctx.globalAlpha = dimT >= 0 && evT[idx] < dimT ? 0.22 : (r === 2 ? 0.5 : 0.82);
        ctx.fillStyle = CMP_COLORS[r] || CMP_COLORS[3];
        var h = (CMP_HEIGHTS[r] || 5) * dpr;
        ctx.fillRect((evT[idx] / DUR) * W, H - h, Math.max(1, 1.3 * dpr), h);
      };
      var redraw = function () {
        ctx.clearRect(0, 0, W, H);
        for (var k = 0; k < evPtr; k++) drawTick(k);
        ctx.globalAlpha = 0.9; ctx.fillStyle = "#87531c";
        for (var j = 0; j < compPtr; j++) ctx.fillRect((comps[j].t / DUR) * W, 0, Math.max(1, 1.1 * dpr), H);
        ctx.globalAlpha = 1;
      };
      var resize = function () {
        dpr = Math.min(2, window.devicePixelRatio || 1);
        W = Math.max(1, Math.floor((canvas.clientWidth || 600) * dpr));
        H = Math.max(1, Math.floor(22 * dpr));
        canvas.width = W; canvas.height = H; redraw();
      };
      var player = {
        id: tool.id, resize: resize,
        tick: function (sT) {
          while (compPtr < comps.length && comps[compPtr].t <= sT) {
            var c = comps[compPtr];
            ghost.style.width = fill.style.width; ghost.style.opacity = "1";
            setTimeout(function () { ghost.style.opacity = "0"; }, 80);
            if (chip) {
              chip.textContent = "컴팩션 #" + c.i + " · " + fmt(c.before) + " → " + (c.after == null ? "?" : fmt(c.after));
              chip.hidden = false; chip.classList.add("show");
              clearTimeout(chipTimer);
              chipTimer = setTimeout(function () { chip.classList.remove("show"); }, 2400);
            }
            dimT = c.keptT == null ? c.t : c.keptT;
            compPtr++; redraw();
          }
          while (callPtr + 1 < calls.length && calls[callPtr + 1][0] * 1000 <= sT) callPtr++;
          var v = calls[callPtr] ? calls[callPtr][1] : 0;
          fill.style.width = pctOf(v) + "%";
          if (nowEl) nowEl.textContent = fmt(v);
          while (evPtr < evT.length && evT[evPtr] <= sT) { drawTick(evPtr); evPtr++; }
          head.style.left = Math.min(100, (sT / DUR) * 100) + "%";
          if (clockEl) clockEl.textContent = clock(sT);
        },
        reset: function () {
          evPtr = 0; callPtr = 0; compPtr = 0; dimT = -1;
          fill.style.width = pctOf(calls[0][1]) + "%";
          if (nowEl) nowEl.textContent = fmt(calls[0][1]);
          head.style.left = "0%";
          if (clockEl) clockEl.textContent = "활동 0분";
          if (chip) { chip.hidden = true; chip.classList.remove("show"); }
          resize();
        },
        final: function () {
          callPtr = calls.length - 1; evPtr = evT.length; compPtr = comps.length;
          dimT = comps.length ? (comps[comps.length - 1].keptT == null ? comps[comps.length - 1].t : comps[comps.length - 1].keptT) : -1;
          var last = calls[calls.length - 1][1];
          fill.style.width = pctOf(last) + "%";
          if (nowEl) nowEl.textContent = fmt(last);
          head.style.left = "100%";
          if (clockEl) clockEl.textContent = clock(DUR);
          redraw();
        }
      };
      players.push(player);
    });

    var playing = false, elapsed = 0, lastNow = 0, raf = 0;
    var finish = function () {
      cancelAnimationFrame(raf); playing = false;
      players.forEach(function (p) { p.final(); });
      if (btn) btn.textContent = "처음부터";
    };
    var resetAll = function () {
      cancelAnimationFrame(raf); playing = false; elapsed = 0;
      players.forEach(function (p) { p.reset(); });
      if (btn) btn.textContent = "재생";
    };
    var frame = function (now) {
      if (!playing) return;
      elapsed += now - lastNow; lastNow = now;
      if (elapsed >= TOTAL) { elapsed = TOTAL; finish(); return; }
      var frac = elapsed / TOTAL;
      players.forEach(function (p) { p.tick(frac * Math.max(1, tools.get(p.id).durMs)); });
      raf = requestAnimationFrame(frame);
    };
    var play = function () {
      if (reduceMotion || playing) return;
      if (btn && btn.textContent === "처음부터") resetAll();
      playing = true; lastNow = performance.now();
      if (btn) btn.textContent = "일시정지";
      raf = requestAnimationFrame(frame);
    };
    var pause = function () { if (!playing) return; playing = false; cancelAnimationFrame(raf); if (btn) btn.textContent = "재생"; };
    on(btn, "click", function () { if (playing) pause(); else play(); });
    addEventListener("beforeprint", function () { pause(); finish(); });
    addEventListener("resize", function () { players.forEach(function (p) { p.resize(); }); });
    if (reduceMotion) { if (btn) btn.hidden = true; finish(); }
    else {
      resetAll();
      if ("IntersectionObserver" in window) {
        var io = new IntersectionObserver(function (es) {
          if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); play(); }
        }, { threshold: 0.22 });
        io.observe(cmpRoot);
      }
    }
  }
  buildCompare();
})();
