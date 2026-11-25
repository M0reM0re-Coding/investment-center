// Chart zoom / scroll / jump to today.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// ----- chart navigation like TradingView (round 44): wheel zoom on every pane, hover buttons, jump to today, auto price scale,
// double-click a scale to reset, arrow keys, Shift+click measure -----
const KC_SPACE = [1, 50];   // the library's own limits for candle width (pixels); it ignores steps past them, so we clamp
function kcGeo() {   // where things are inside the chart, in page pixels
  const c = kc.chart, el = c?.getContainer?.(); if (!el) return null;
  const r = el.getBoundingClientRect(), main = c.getSize("candle_pane", "main"), xa = c.getSize("x_axis_pane", "root");
  return { r, mainW: main?.width ?? r.width - 60, candleH: main?.height ?? r.height * 0.6, xTop: xa?.top ?? r.height - 28 };
}
function kcZoomBy(f, x) {   // f > 1 zooms in (wider candles), around page-x (or the middle)
  const c = kc.chart; if (!c) return;
  const g = kcGeo(), b = c.getBarSpace(), bar = typeof b === "object" ? b.bar : b;
  const nb = Math.max(KC_SPACE[0], Math.min(KC_SPACE[1], bar * f));
  if (!g || Math.abs(nb - bar) < 0.001) return;
  const px = x === undefined ? g.mainW / 2 : Math.max(0, Math.min(g.mainW, x - g.r.left));
  c.zoomAtCoordinate(nb / bar, { x: px, y: 0 });
}
function kcScrollBars(n) { const c = kc.chart; if (!c) return; const b = c.getBarSpace(); c.scrollByDistance(n * (typeof b === "object" ? b.bar : b)); }
function kcAutoY() {   // back to "fit the visible candles" on every pane (TradingView's A button)
  const c = kc.chart; if (!c) return;
  [c.getDrawPaneById?.("candle_pane"), ...(c.getAllDrawPanes?.() || [])].forEach((p) => { const a = p?.getAxisComponent?.(); if (a && !a.getAutoCalcTickFlag()) a.setAutoCalcTickFlag(true); });
  c.adjustPaneViewport?.(false, true, true, true); kcNavState();
}
const kcIsAuto = () => kc.chart?.getDrawPaneById?.("candle_pane")?.getAxisComponent?.()?.getAutoCalcTickFlag?.() ?? true;
function kcResetView() {   // Alt+R: TradingView's default look: ~8 px candles, latest bar on the right, price scale fitted
  const c = kc.chart; if (!c) return;
  c.setBarSpace(8); c.scrollToRealTime(); kcAutoY(); kcRangeOff();
}
function kcRangeOff() {   // a 1D / 1M / 6M... button stays lit only until you zoom or scroll by hand (like TradingView)
  if (kc.zooming || !kc.range) return;
  kc.range = null; document.querySelectorAll("[data-kcr].on,[data-chperf].on").forEach((b) => b.classList.remove("on"));
}
function kcNavState() {   // show "jump to today" when scrolled back; light up Auto while the price scale fits by itself
  const c = kc.chart; if (!c || !kc.box) return;
  const r = c.getVisibleRange?.(), n = c.getDataList().length;
  kc.box.querySelector(".kclatest")?.classList.toggle("on", !!r && n > 0 && r.realTo < n - 1);
  document.querySelector('[data-kcact="auto"]')?.classList.toggle("on", kcIsAuto());
}
function kcNavInit() {   // once per chart box (the box survives page redraws)
  const box = kc.box;
  const nav = document.createElement("div"); nav.className = "kcnav";
  nav.innerHTML = [["out", "Zoom out", "−"], ["in", "Zoom in", "+"], ["left", "Scroll left", "‹"], ["right", "Scroll right", "›"], ["reset", "Reset chart view (Alt+R)", "⟲"]]
    .map(([k, t, s]) => `<button data-nv="${k}" title="${t}" aria-label="${t}">${s}</button>`).join("");
  const latest = document.createElement("button"); latest.className = "kclatest"; latest.title = "Scroll to the latest bar"; latest.setAttribute("aria-label", latest.title); latest.textContent = "»";
  const meas = document.createElement("div"); meas.className = "kcmeasure"; meas.hidden = true;
  box.append(nav, latest, meas);
  const step = (k) => { if (k === "in") kcZoomBy(1.15); else if (k === "out") kcZoomBy(1 / 1.15); else if (k === "left") kcScrollBars(5); else if (k === "right") kcScrollBars(-5); };
  let rep = null;
  nav.addEventListener("pointerdown", (e) => {   // hold to repeat, like TradingView
    const k = e.target.closest("[data-nv]")?.dataset.nv; if (!k) return;
    e.preventDefault(); e.stopPropagation();
    if (k === "reset") return kcResetView();
    step(k); clearInterval(rep); const t0 = setTimeout(() => { rep = setInterval(() => step(k), 60); }, 350);
    const stop = () => { clearTimeout(t0); clearInterval(rep); removeEventListener("pointerup", stop); };
    addEventListener("pointerup", stop);
  });
  nav.addEventListener("mousedown", (e) => e.stopPropagation(), true);
  latest.addEventListener("mousedown", (e) => e.stopPropagation(), true);
  latest.addEventListener("click", () => { kc.chart?.scrollToRealTime(); setTimeout(kcNavState, 50); });

  // wheel: zoom on every pane and on the time scale, around the mouse; Shift+wheel or a sideways swipe scrolls in time
  box.addEventListener("wheel", (e) => {
    const g = kcGeo(); if (!g || !g.r.width || e.clientX < g.r.left || e.clientX > g.r.right || e.clientY < g.r.top || e.clientY > g.r.bottom) return;
    e.preventDefault(); e.stopPropagation();
    const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 120 : 1, dx = e.deltaX * unit, dy = e.deltaY * unit;
    if (e.shiftKey || Math.abs(dx) > Math.abs(dy)) { kc.chart.scrollByDistance(-(Math.abs(dx) > Math.abs(dy) ? dx : dy)); kcRangeOff(); return; }
    kcZoomBy(Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.0014)), e.clientX);   // one mouse-wheel notch ~ 13%; trackpad pinch is smooth
    kcRangeOff();
  }, { passive: false, capture: true });

  // double-click the price scale -> fit prices again; double-click the time scale -> reset the view
  box.addEventListener("dblclick", (e) => {
    const g = kcGeo(); if (!g) return;
    const x = e.clientX - g.r.left, y = e.clientY - g.r.top;
    if (y >= g.xTop) { kcResetView(); return; }
    if (x > g.mainW) kcAutoY();
  });
  ["mouseup", "touchend"].forEach((ev) => box.addEventListener(ev, () => setTimeout(kcNavState, 0)));
  box.addEventListener("mouseenter", () => { kc.hover = true; });
  box.addEventListener("mouseleave", () => { kc.hover = false; });

  // Shift + click: measure (price change, %, bars, days); click again to clear
  let m0 = null;
  const at = (e) => { const g = kcGeo(); if (!g) return null; const x = e.clientX - g.r.left, y = e.clientY - g.r.top; if (x < 0 || x > g.mainW || y < 0 || y > g.candleH) return null;
    const p = kc.chart.convertFromPixel([{ x, y }], { paneId: "candle_pane" })?.[0]; return p && Number.isFinite(p.value) ? { x, y, ...p, g } : null; };
  const show = (a, b) => {
    const bx = kc.box.getBoundingClientRect(), off = [a.g.r.left - bx.left, a.g.r.top - bx.top];
    const d = b.value - a.value, pct = a.value ? (d / a.value) * 100 : 0, bars = Math.round((b.dataIndex ?? 0) - (a.dataIndex ?? 0));
    const list = kc.chart.getDataList(), ts = (i) => list[Math.max(0, Math.min(list.length - 1, Math.round(i ?? 0)))]?.timestamp, days = Math.round(Math.abs((ts(b.dataIndex) - ts(a.dataIndex)) / 864e5));
    Object.assign(meas.style, { left: off[0] + Math.min(a.x, b.x) + "px", top: off[1] + Math.min(a.y, b.y) + "px", width: Math.abs(b.x - a.x) + "px", height: Math.abs(b.y - a.y) + "px" });
    meas.className = "kcmeasure " + (d >= 0 ? "up" : "dn"); meas.hidden = false;
    meas.innerHTML = `<span class="${b.y < a.y ? "t" : "b"}">${d >= 0 ? "+" : ""}${fmtPx(d)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)<br>${bars} bar${Math.abs(bars) === 1 ? "" : "s"}${days ? ` · ${days} day${days === 1 ? "" : "s"}` : ""}</span>`;
  };
  box.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (kc.measuring) { e.stopPropagation(); e.preventDefault(); kc.measuring = false; m0 = null; return; }   // second click: freeze
    if (!meas.hidden && !e.shiftKey) { meas.hidden = true; return; }                                           // next click: clear
    if (!e.shiftKey && !kc.measureArm) return;
    const a = at(e); if (!a) return;
    if (kc.measureArm) { kc.measureArm = false; ktTip(""); ktRender(); }
    e.stopPropagation(); e.preventDefault(); m0 = a; kc.measuring = true; show(a, a);
  }, true);
  box.addEventListener("mousemove", (e) => { if (!kc.measuring || !m0) return; const b = at(e); if (b) show(m0, b); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !meas.hidden) { meas.hidden = true; kc.measuring = false; m0 = null; } });
}

