// Saving drawings, undo/redo, drawing settings, drawing alerts, Object tree.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// ----- saving drawings + undo / redo -----
const kcPlain = (o) => ({ name: o.name, groupId: o.groupId, lock: o.lock, visible: true, extendData: o.extendData, styles: o.styles,
  points: (o.points || []).map((p) => ({ timestamp: p.timestamp, value: p.value })), ...(kc.ov.get(o.id)?.ui ? { ui: kc.ov.get(o.id).ui } : {}) });
function kcWrap(v) {
  const o = typeof v === "string" ? { name: v } : { ...v };
  if (o.name === "fibonacciLine" && !o.extendData) o.extendData = clone(prefs().fib);
  const keep = (e) => { if (!kc.restoring && e?.overlay) { if (!kc.ov.has(e.overlay.id)) { kc.hist.push({ t: "add", id: e.overlay.id }); kc.redo = []; } kc.ov.set(e.overlay.id, kcPlain(e.overlay)); kcSave(); } return false; };
  const chain = (f, g) => (e) => { const r = f ? f(e) : false; g(e); return r; };
  o.onDrawEnd = chain(o.onDrawEnd, (e) => { keep(e); ktDone(e?.overlay); });
  o.onDrawing = chain(o.onDrawing, (e) => { const h = KT_HINT[e?.overlay?.name]; const n = (e?.overlay?.points || []).length; if (h && h[n - 1]) ktTip(h[n - 1]); });
  o.onPressedMoveEnd = chain(o.onPressedMoveEnd, keep);
  o.onRemoved = chain(o.onRemoved, (e) => { if (!kc.restoring && e?.overlay && kc.ov.has(e.overlay.id)) { if (!kc.undoing) { kc.hist.push({ t: "del", data: kc.ov.get(e.overlay.id) }); kc.redo = []; } kc.ov.delete(e.overlay.id); if (kc.sel === e.overlay.id) kc.sel = null; kcSave(); ktFloat(); } });
  o.onSelected = chain(o.onSelected, (e) => { kc.sel = e?.overlay?.id || null; ktFloat(); });
  o.onDeselected = chain(o.onDeselected, (e) => { if (kc.sel === e?.overlay?.id) kc.sel = null; setTimeout(ktFloat, 0); });
  o.onDoubleClick = chain(o.onDoubleClick, (e) => { const ov = e?.overlay; if (!ov) return; kc.sel = ov.id; if (ov.name === "fibonacciLine") fibWindow(ov.id); else ktSettings(ov.id, ov.name === "tvText" ? "text" : "style"); });
  return o;
}
function kcAddDone(v) {   // a drawing made in one go (right-click "horizontal line here"): record + save it
  const id = kc.chart.createOverlay(v);
  const ov = id && kc.chart.getOverlayById(id);
  if (ov) { kc.ov.set(id, kcPlain(ov)); kc.hist.push({ t: "add", id }); kc.redo = []; kcSave(); }
}
function kcUndo(redo = false) {
  const st = redo ? kc.redo : kc.hist, a = st.pop(); if (!a || !kc.chart) return;
  kc.undoing = true;
  try {
    if (a.t === "edit") { const now = clone(kc.ov.get(a.id)); if (now) { ktApply(a.id, a.before); (redo ? kc.hist : kc.redo).push({ t: "edit", id: a.id, before: now }); } }
    else if (a.t === "add") { const data = kc.ov.get(a.id); kc.chart.removeOverlay(a.id); kc.ov.delete(a.id); (redo ? kc.hist : kc.redo).push({ t: "del", data }); }
    else { kc.restoring = true; const id = kc.chart.createOverlay({ ...a.data }); kc.restoring = false; if (id) { kc.ov.set(id, a.data); (redo ? kc.hist : kc.redo).push({ t: "add", id }); } }
  } finally { kc.undoing = false; kc.restoring = false; }
  kcSave();
}
function kcHook(c) {
  kc.chart = c; kc.indFor = null; mkHook(c);   // news pins + event badges (charts/markers.js)
  const co = c.createOverlay.bind(c), an = c.applyNewData.bind(c);
  c.createOverlay = (v, pane) => co(Array.isArray(v) ? v.map(kcWrap) : kcWrap(v), pane);
  c.applyNewData = (d, more, cb) => { an(d, more, cb); if (d?.length) { kcInitInds(); kcRestore(); if (kc.pendingBars) setTimeout(kcZoom, 30); if (cmpList().length) setTimeout(kcCmpApply, 0); mkLoad(kc.sym).then(mkDraw); } };
  c.subscribeAction("onTooltipIconClick", (d) => {
    const n = d?.indicatorName, a = kc.active.find((x) => x.name === n); if (!a) return;
    if (d.iconId === "ic_del") kcRemoveInd(n);
    else if (d.iconId === "ic_set") indWindow(n);
    else if (d.iconId === "ic_hide" || d.iconId === "ic_show") { a.hidden = d.iconId === "ic_hide"; kcVisApply(); prefs().list = kc.active.map(({ paneId: _, ...x }) => x); kcSavePrefs(); }
  });
  let navT = 0; const nav = () => { kcRangeOff(); if (!navT) navT = setTimeout(() => { navT = 0; kcNavState(); }, 120); };
  c.subscribeAction("onZoom", nav); c.subscribeAction("onScroll", nav);
  let cmpT = 0; c.subscribeAction("onVisibleRangeChange", () => { clearTimeout(cmpT); cmpT = setTimeout(kcCmpRebase, 120); });
  c.subscribeAction("onCrosshairChange", (d) => { const p = d?.kLineData; if (p && d.y !== undefined) { const v = c.convertFromPixel([{ y: d.y }], { paneId: "candle_pane" })?.[0]?.value; kc.lastPrice = Number.isFinite(v) ? v : p.close; } });
}
function kcRestore() {
  const c = kc.chart, t = kc.sym;
  if (!c || kc.restoredFor === t) return;
  kc.restoredFor = t; kc.restoring = true; kc.hist = []; kc.redo = [];
  try {
    c.removeOverlay({ groupId: "drawing_tools" }); kc.ov.clear();
    (chOf().draw[t] || []).forEach((o) => { const id = c.createOverlay({ ...o }); if (id) kc.ov.set(id, o); });
    ktApplyVis();
  } finally { kc.restoring = false; }
}
function kcSave() {
  const t = kc.sym; clearTimeout(kc.saveT);
  kc.ov.forEach((p) => { if (p.ui?.alert?.on) { const a = ktAlertState(p); if (a && a.h !== p.ui.alert.h) p.ui = { ...p.ui, alert: a }; } });
  ktTree();
  kc.saveT = setTimeout(async () => {
    const list = [...kc.ov.values()]; chOf().draw[t] = list;
    const { error } = await sb.from("chart_drawings").upsert({ user_id: state.user.id, symbol: t, overlays: list, updated_at: new Date().toISOString() }, { onConflict: "user_id,symbol" });
    if (error) toast(`Drawing not saved: ${esc(/chart_drawings/.test(error.message) ? "run supabase/013_charts.sql first" : error.message)}`);
  }, 700);
}
const kcTheme = () => (typeof proOn === "function" && proOn() ? (proIsLight() ? "light" : "dark") : isDark() ? "dark" : "light");
function kcStyle() {   // site colours + Inter (the library asks for Helvetica Neue, which Windows doesn't have -> serif)
  const up = "#089981", dn = "#F23645", F = "Inter, system-ui, sans-serif", t = { family: F };   // TradingView's candle colours, as on your TradingView
  kc.pro?.setStyles({
    candle: { type: kc.ctype, bar: { upColor: up, downColor: dn, noChangeColor: "#888", upBorderColor: up, downBorderColor: dn, noChangeBorderColor: "#888", upWickColor: up, downWickColor: dn, noChangeWickColor: "#888" },
      area: { lineColor: "#2962FF", backgroundColor: [{ offset: 0, color: "rgba(41,98,255,.02)" }, { offset: 1, color: "rgba(41,98,255,.22)" }] },
      priceMark: { high: { textFamily: F }, low: { textFamily: F }, last: { upColor: up, downColor: dn, text: t } }, tooltip: { text: t } },
    indicator: { lastValueMark: { show: true, text: t }, tooltip: { text: t } },
    yAxis: { type: kc.log ? "log" : kc.pct ? "percentage" : "normal", tickText: t }, xAxis: { tickText: t }, crosshair: { horizontal: { text: t }, vertical: { text: t } },
    overlay: { text: t, rectText: t } });
}
function kcZoom() {   // range buttons: show the last N candles
  const c = kc.chart, n = kc.pendingBars; kc.pendingBars = 0;
  if (!c || !n) return;
  const w = (kc.box?.clientWidth || 900) - 110, len = c.getDataList().length, bars = Math.min(n, len);
  kc.zooming = true; c.setBarSpace(Math.max(1, Math.min(40, w / Math.max(10, bars)))); c.scrollToRealTime(); kcAutoY(); setTimeout(() => { kc.zooming = false; kcNavState(); }, 120);
}
function kcSetPeriod(i, keepRange) {
  if (!kc.pro) return;
  if (!keepRange) kc.range = null;
  if (i === kc.period) { if (kc.pendingBars) kcZoom(); render(false); return; }
  kc.period = i; kc.loaded = ""; kc.pro.setPeriod(KC_PERIODS[i]); kcVisApply(); ktApplyVis(); ktTree(); render(false);
}
function kcRangeClick(l) {
  const r = l === "10Y" ? ["10Y", 5, 120] : KC_RNG.find((x) => x[0] === l); if (!r) return;
  kc.range = l;
  let bars = r[2];
  if (l === "YTD") { const d0 = new Date(new Date().getFullYear(), 0, 1); bars = Math.max(5, Math.round((Date.now() - d0) / 864e5 * 5 / 7)); }
  kc.pendingBars = bars; kcSetPeriod(r[1], true);
}
async function kcMount(t) {
  const host = document.getElementById("kchost");
  if (!host) return;
  if (!kc.box) {
    kc.box = document.createElement("div"); kc.box.className = "kcbox";
    kc.box.addEventListener("contextmenu", kcMenu);
    kc.box.insertAdjacentHTML("beforeend", `<div class="kctools" role="toolbar" aria-label="Drawing tools"></div><div class="kttip" hidden></div><div class="ktfloat" hidden></div><div class="ktree" hidden></div>`);
    kc.box.querySelector(".ktree").addEventListener("click", ktTreeClick);
    ["mousedown", "pointerdown", "wheel"].forEach((ev) => kc.box.querySelector(".ktree").addEventListener(ev, (e) => e.stopPropagation(), true));
    kc.box.querySelector(".kctools").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.ktg) return ktFly(b.dataset.ktg, b);
      if (b.dataset.kt) return ktStart(b.dataset.kt);
      if (b.dataset.kto) return ktOption(b.dataset.kto, b);
    });
    kc.box.querySelector(".ktfloat").addEventListener("click", (e) => { const b = e.target.closest("[data-kf]"); if (b) { e.preventDefault(); ktFloatClick(b.dataset.kf); } });
    ["mousedown", "pointerdown"].forEach((ev) => kc.box.querySelector(".ktfloat").addEventListener(ev, (e) => e.stopPropagation(), true));
    kcNavInit(); ktRender();
  }
  if (kc.box.parentNode !== host) { host.appendChild(kc.box); requestAnimationFrame(() => kc.chart?.resize()); }   // the chart survives page redraws: it is moved, never rebuilt
  if (kc.pro && kc.sym === t) { if (kc.pro.getTheme() !== kcTheme()) { kc.pro.setTheme(kcTheme()); kcStyle(); } return; }
  const y = yahoo(t), first = !kc.pro;
  kc.sym = t; kc.restoredFor = null; kc.loaded = "";
  kc.drawP = sb.from("chart_drawings").select("symbol,overlays,indicators").in("symbol", [t, "*"]).then(({ data }) => {
    (data || []).forEach((r) => { if (r.symbol === "*") { if (r.indicators && Array.isArray(r.indicators.list)) chOf().prefs = r.indicators; } else chOf().draw[r.symbol] = r.overlays || []; });
  });
  const symbol = { ticker: y, shortName: t, name: cleanName(chName(y) || statsOf(y)?.name || t), exchange: "", pricePrecision: y.endsWith("=X") ? 4 : 2, volumePrecision: 0 };
  if (!first) { kc.pro.setSymbol(symbol); return; }
  kcNote("Loading the chart…");
  try { await kcLoad(); await kc.drawP; } catch (e) { kcNote(esc(e.message) + ". Check your connection and reload."); return; }
  if (kc.pro || !document.getElementById("kchost")) return;
  kcNote("");
  kc.pro = new window.klinechartspro.KLineChartPro({ container: kc.box, theme: kcTheme(), locale: "en-US", watermark: "", timezone: "Asia/Bangkok",
    symbol, period: KC_PERIODS[kc.period ?? 3], periods: KC_PERIODS, mainIndicators: [], subIndicators: [], datafeed: kcDatafeed, drawingBarVisible: true });
  kcStyle(); ktRender();
}


// ----- round 45: deeper drawing settings (TradingView's Style / Text / Coordinates / Visibility tabs + templates) and the Object tree -----
const KT_LINES = { segment: "seg", rayLine: "ray", straightLine: "line", horizontalStraightLine: "h", horizontalRayLine: "hr", verticalStraightLine: "v" };
const KT_SHAPES = ["rect", "circle", "triangle", "parallelogram"];
const KT_TEXTABLE = [...Object.keys(KT_LINES), "rect", "tvText"];
const KT_TF = [["m", "Minutes", [0, 1, 6, 7, 8]], ["h", "Hours", [2, 9, 10, 11]], ["d", "Days", [3]], ["w", "Weeks", [4]], ["mo", "Months", [5, 12, 13, 14]]];
const ktTfNow = () => (KT_TF.find(([, , l]) => l.includes(kc.period ?? 3)) || KT_TF[2])[0];
const ktDefs = () => safe(() => JSON.parse(localStorage.getItem("ic_ktdef") || "{}"), {}) || {};
const ktExt = (o) => (o && typeof o.extendData === "object" && o.extendData && !Array.isArray(o.extendData) ? o.extendData : {});
function ktApplyVis() {   // each drawing: your eye toggle (object tree), "hide all", and which timeframes it shows on
  const c = kc.chart; if (!c) return;
  const tf = ktTfNow();
  kc.ov.forEach((p, id) => { const ui = p.ui || {}; c.overrideOverlay({ id, visible: !kc.hideAll && !ui.hidden && (ui.vis?.[tf] ?? true) }); });
}
function ktApply(id, plain) {   // put a saved state back on the chart (undo of an edit, Cancel in settings)
  const c = kc.chart; if (!c || !plain) return;
  c.overrideOverlay({ id, styles: plain.styles || {}, extendData: plain.extendData, points: plain.points, lock: !!plain.lock });
  kc.ov.set(id, clone(plain)); ktApplyVis();
}
const ktLineExtend = (a, b, l, r, w, h) => {   // stretch a line to the pane edges (extend left / right)
  const dx = b.x - a.x, dy = b.y - a.y; if (!dx && !dy) return [a, b];
  const ts = []; if (dx) ts.push(-a.x / dx, (w - a.x) / dx); if (dy) ts.push(-a.y / dy, (h - a.y) / dy);
  const inside = ts.filter((t) => { const x = a.x + dx * t, y = a.y + dy * t; return x >= -1 && x <= w + 1 && y >= -1 && y <= h + 1; });
  const lo = Math.min(...inside, 0), hi = Math.max(...inside, 1), P = (t) => ({ x: a.x + dx * t, y: a.y + dy * t });
  return [l ? P(lo) : a, r ? P(hi) : b];
};
const ktArrow = (from, to) => {   // a small arrow head at "to"
  const ang = Math.atan2(to.y - from.y, to.x - from.x), L = 10;
  return { type: "line", attrs: { coordinates: [{ x: to.x - L * Math.cos(ang - 0.45), y: to.y - L * Math.sin(ang - 0.45) }, to, { x: to.x - L * Math.cos(ang + 0.45), y: to.y - L * Math.sin(ang + 0.45) }] } };
};
const ktTextFig = (e, x, y, align, baseline, col) => String(e.text).split("\n").map((ln, i, all) => ({ type: "text", ignoreEvent: true,
  attrs: { x, y: y + (baseline === "bottom" ? -(all.length - 1 - i) : i) * ((e.ts || 13) + 3), text: ln, align, baseline },
  styles: { color: e.tc || col, size: e.ts || 13, family: "Inter, sans-serif", weight: `${e.ti ? "italic " : ""}${e.tb ? 700 : 500}`, backgroundColor: "transparent", borderSize: 0, paddingLeft: 0, paddingRight: 0, paddingTop: 2, paddingBottom: 2 } }));
function ktRegisterLines(K) {   // our versions of the line tools + rectangle: same names (old drawings keep working), more options
  Object.entries(KT_LINES).forEach(([name, kind]) => K.registerOverlay({
    name, totalStep: ["h", "hr", "v"].includes(kind) ? 2 : 3, needDefaultPointFigure: true, needDefaultXAxisFigure: true, needDefaultYAxisFigure: !["h", "hr"].includes(kind),
    createYAxisFigures: ["h", "hr"].includes(kind) ? ({ coordinates: cs, overlay, precision, defaultStyles }) => (!cs.length || !overlay.points.length || ktExt(overlay).axis === false ? []
      : [ktAxisTag(cs[0].y, overlay.points[0].value, overlay.styles?.line?.color || defaultStyles?.line?.color || "#2962FF", precision)]) : undefined,
    createPointFigures: ({ coordinates: cs, bounding, overlay, precision, xAxis }) => {
      if (!cs.length) return [];
      const e = ktExt(overlay), W = bounding.width, H = bounding.height, col = overlay.styles?.line?.color || "#2962FF";
      let a, b;
      if (kind === "h") { a = { x: 0, y: cs[0].y }; b = { x: W, y: cs[0].y }; }
      else if (kind === "hr") { a = cs[0]; b = { x: W, y: cs[0].y }; }
      else if (kind === "v") { a = { x: cs[0].x, y: 0 }; b = { x: cs[0].x, y: H }; }
      else { if (cs.length < 2) return []; [a, b] = ktLineExtend(cs[0], cs[1], e.extL ?? kind === "line", e.extR ?? (kind === "ray" || kind === "line"), W, H); }
      const out = [{ type: "line", attrs: { coordinates: [a, b] } }];
      if (!["h", "hr", "v"].includes(kind) && cs.length > 1) { if (e.arrR) out.push(ktArrow(cs[0], cs[1])); if (e.arrL) out.push(ktArrow(cs[1], cs[0])); }
      if (e.mid && cs.length > 1) out.push({ type: "circle", attrs: { x: (cs[0].x + cs[1].x) / 2, y: (cs[0].y + cs[1].y) / 2, r: 3 }, styles: { style: "fill", color: col } });
      if (e.stats && cs.length > 1 && overlay.points.length > 1) {
        const P = overlay.points, d = P[1].value - P[0].value, i0 = xAxis?.convertFromPixel?.(cs[0].x), i1 = xAxis?.convertFromPixel?.(cs[1].x);
        const bars = Number.isFinite(i0) && Number.isFinite(i1) ? Math.round(i1 - i0) : 0, days = P[0].timestamp && P[1].timestamp ? Math.round(Math.abs(P[1].timestamp - P[0].timestamp) / 864e5) : 0;
        const ang = Math.round((Math.atan2(cs[0].y - cs[1].y, cs[1].x - cs[0].x) * 180) / Math.PI);
        out.push({ type: "text", ignoreEvent: true, attrs: { x: cs[1].x + 8, y: cs[1].y, text: `${d >= 0 ? "+" : ""}${d.toFixed(precision.price)} (${P[0].value ? ((d / P[0].value) * 100).toFixed(2) : 0}%) · ${bars} bars${days ? `, ${days}d` : ""} · ${ang}°`, align: "left", baseline: "middle" },
          styles: { color: "#fff", size: 11.5, family: "Inter, sans-serif", weight: 600, backgroundColor: col, borderRadius: 4, paddingLeft: 6, paddingRight: 6, paddingTop: 3, paddingBottom: 3, borderSize: 0 } });
      }
      if (e.text) {
        const t = e.tpos === "left" ? 0.04 : e.tpos === "right" ? 0.96 : 0.5, base = kind === "v" ? { x: a.x + 6, y: H * t } : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        out.push(...ktTextFig(e, base.x, base.y + (kind === "v" ? 0 : e.tv === "below" ? 4 : -4), kind === "v" ? "left" : e.tpos === "left" ? "left" : e.tpos === "right" ? "right" : "center", kind === "v" ? "middle" : e.tv === "below" ? "top" : "bottom", col));
      }
      return out;
    },
  }));
  K.registerOverlay({
    name: "rect", totalStep: 3, needDefaultPointFigure: true, needDefaultXAxisFigure: true, needDefaultYAxisFigure: true,
    styles: { polygon: { style: "stroke_fill", color: "rgba(41,98,255,0.15)", borderColor: "#2962FF", borderSize: 1 } },
    createPointFigures: ({ coordinates: cs, overlay }) => {
      if (cs.length < 2) return [];
      const [a, b] = cs, e = ktExt(overlay), out = [{ type: "polygon", attrs: { coordinates: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }] } }];
      if (e.text) out.push(...ktTextFig(e, e.tpos === "left" ? Math.min(a.x, b.x) + 8 : e.tpos === "right" ? Math.max(a.x, b.x) - 8 : (a.x + b.x) / 2,
        e.tv === "top" ? Math.min(a.y, b.y) + 6 : e.tv === "bottom" ? Math.max(a.y, b.y) - 6 : (a.y + b.y) / 2, e.tpos || "center", e.tv === "top" ? "top" : e.tv === "bottom" ? "bottom" : "middle", overlay.styles?.polygon?.borderColor || "#2962FF"));
      return out;
    },
  });
}
// ----- alerts on drawings (round 47): the robot sends Telegram when the price crosses the line (see robot/drawing_alerts.py) -----
const KT_ALERTABLE = ["horizontalStraightLine", "horizontalRayLine", "priceLine", "segment", "rayLine", "straightLine", "fibonacciLine"];
function ktAlertState(p) {   // where the price is now vs each level (counted in candles of the timeframe on screen, like the robot does)
  const c = kc.chart, list = c?.getDataList() || []; if (!list.length) return null;
  const idx = (ts) => { let n = 0; for (const b of list) { if (b.timestamp <= ts) n++; else break; } return n - 1; };
  const P = p.points || [], now = list.length - 1, price = list[now].close; let lv = [];
  if (["horizontalStraightLine", "horizontalRayLine", "priceLine"].includes(p.name) && P[0]) lv = [P[0].value];
  else if (["segment", "rayLine", "straightLine"].includes(p.name) && P.length > 1) { const i1 = idx(P[0].timestamp), i2 = idx(P[1].timestamp); if (i1 !== i2) lv = [P[0].value + (P[1].value - P[0].value) * (now - i1) / (i2 - i1)]; }
  else if (p.name === "fibonacciLine" && P.length > 1) lv = (p.extendData?.levels || []).filter((l) => l[2]).map(([l]) => P[1].value + (P[0].value - P[1].value) * l);
  if (!lv.length) return null;
  const h = JSON.stringify([p.name, P.map((q) => [q.timestamp, +Number(q.value).toFixed(6)]), p.name === "fibonacciLine" ? (p.extendData?.levels || []).filter((l) => l[2]).map((l) => l[0]) : 0]);
  let hash = 0; for (let i = 0; i < h.length; i++) hash = (hash * 31 + h.charCodeAt(i)) | 0;
  return { on: 1, y: yahoo(kc.sym), tf: KC_PERIODS[kc.period ?? 3].text, side0: lv.map((v) => (price >= v ? "above" : "below")), h: String(hash >>> 0), lv: lv.map((v) => +v.toFixed(4)) };
}
function ktAlertToggle(id) {
  const p = kc.ov.get(id); if (!p) return;
  if (p.ui?.alert?.on) { p.ui = { ...p.ui, alert: undefined }; toast("Alert off for this drawing"); }
  else { const a = ktAlertState(p); if (!a) { toast("This drawing can't have an alert yet"); return; }
    p.ui = { ...(p.ui || {}), alert: a }; toast(`Alert on: Telegram when ${esc(kc.sym)} crosses ${a.lv.length > 1 ? `any of the ${a.lv.length} levels` : `this line (now ${fmtPx(a.lv[0])})`}. Checked every 30 min.`); }
  kcSave(); ktFloat();
}
// ----- the settings window of one drawing -----
function ktSettings(id, tab = "style") {
  const c = kc.chart, ov = c?.getOverlayById(id); if (!ov) return;
  if (ov.name === "fibonacciLine" && tab === "style") { fibWindow(id); return; }
  const name = ov.name, before = clone(kc.ov.get(id) || kcPlain(ov)), cur = clone(before);
  const isLine = !!KT_LINES[name], isShape = KT_SHAPES.includes(name), isPos = name === "tvLong" || name === "tvShort", txt = KT_TEXTABLE.includes(name), seg = ["segment", "rayLine", "straightLine"].includes(name);
  const tabs = [["style", isPos ? "Inputs & style" : "Style"], ...(txt ? [["text", "Text"]] : []), ["coords", "Coordinates"], ["vis", "Visibility"]];
  let t = tabs.some((x) => x[0] === tab) ? tab : "style";
  const ln = () => ({ style: "solid", smooth: false, size: 1, color: "#2962FF", dashedValue: [2, 2], ...(cur.styles?.line || {}) });
  const pg = () => ({ style: "stroke_fill", color: "rgba(41,98,255,0.15)", borderColor: "#2962FF", borderSize: 1, borderStyle: "solid", borderDashedValue: [2, 2], ...(cur.styles?.polygon || {}) });
  const ext = () => (cur.extendData && typeof cur.extendData === "object" && !Array.isArray(cur.extendData) ? cur.extendData : {});
  const live = () => { ktApply(id, cur); ktFloat(); };
  const colorRow = (label, key, val) => `<div class="f"><span>${label}</span><span><input type="color" data-c="${key}" value="${esc(String(val).slice(0, 7))}">${KT_COLORS.slice(0, 8).map((x) => `<button class="kwsw" data-cs="${key}:${x}" style="background:${x}" title="${x}"></button>`).join("")}</span></div>`;
  const sel = (key, val, opts) => `<select data-s="${key}">${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(val) ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const chk = (key, val, label) => `<div class="f"><label class="ck"><input type="checkbox" data-k="${key}" ${val ? "checked" : ""}> ${label}</label></div>`;
  const lineStyle = (s) => (s.style === "dashed" ? (String(s.dashedValue) === "1,3" ? "dot" : "dash") : "solid");
  const body = () => {
    const e = ext(), L = ln(), G = pg();
    if (t === "style") {
      let h = "";
      if (isShape) h += `<div class="h">BORDER</div>${colorRow("Colour", "pg.borderColor", G.borderColor)}<div class="f"><span>Width · style</span><span>${sel("pg.borderSize", G.borderSize, [[1, "1px"], [2, "2px"], [3, "3px"], [4, "4px"]])}${sel("pg.dash", G.borderStyle === "dashed" ? "dash" : "solid", [["solid", "Solid"], ["dash", "Dashed"]])}</span></div>
        <div class="h">BACKGROUND</div>${chk("pg.fill", G.style !== "stroke", "Fill the shape")}${colorRow("Colour", "pg.color", G.color)}<div class="f"><span>Opacity</span><span><input type="range" min="0" max="100" data-op value="${Math.round(((parseInt(String(G.color).slice(7, 9), 16) || 38) / 255) * 100)}"></span></div>`;
      else if (isPos) h += `<div class="h">YOUR ACCOUNT (for position size)</div><div class="f"><span>Account size</span><span><input type="number" min="0" step="any" data-n="acct" value="${e.acct ?? 100000}"></span></div>${pfAcctBtn()}
        <div class="f"><span>Risk per trade</span><span><input type="number" min="0" step="0.1" data-n="risk" value="${e.risk ?? 1}"> ${sel("riskT", e.riskT || "pct", [["pct", "% of account"], ["amt", "amount"]])}</span></div>
        <p class="note">Labels then show the quantity and the profit / loss at the target and stop.</p>`;
      else {
        h += `<div class="h">LINE</div>${colorRow("Colour", "ln.color", L.color)}<div class="f"><span>Width · style</span><span>${sel("ln.size", L.size, [[1, "1px"], [2, "2px"], [3, "3px"], [4, "4px"]])}${sel("ln.dash", lineStyle(L), [["solid", "Solid"], ["dash", "Dashed"], ["dot", "Dotted"]])}</span></div>`;
        if (["horizontalStraightLine", "horizontalRayLine"].includes(name)) h += `<div class="h">PRICE SCALE</div>${chk("e.axis", e.axis !== false, "Price label on the scale, in the line's colour")}`;
        if (seg) h += `<div class="h">ENDS</div>${chk("e.extL", e.extL ?? name === "straightLine", "Extend left")}${chk("e.extR", e.extR ?? (name !== "segment"), "Extend right")}${chk("e.arrL", e.arrL, "Left end arrow")}${chk("e.arrR", e.arrR, "Right end arrow")}${chk("e.mid", e.mid, "Middle point")}
          <div class="h">STATS</div>${chk("e.stats", e.stats, "Show price change, %, bars, days and angle")}`;
      }
      return h;
    }
    if (t === "text") {
      const T = name === "tvText" ? { text: e.text || "", ts: e.size || 14, ...e } : e;
      return `<textarea class="kttext" rows="3" maxlength="300" data-t placeholder="Text shown on the drawing">${esc(T.text || "")}</textarea>
        ${colorRow("Colour", "e.tc", T.tc || cur.styles?.text?.color || L.color)}
        <div class="f"><span>Size</span><span>${sel("e.ts", T.ts || 13, [10, 11, 12, 13, 14, 16, 20, 24, 28, 36].map((v) => [v, v]))}</span></div>
        ${chk("e.tb", T.tb, "<b>Bold</b>")}${chk("e.ti", T.ti, "<i>Italic</i>")}
        ${name === "tvText" ? "" : `<div class="f"><span>Position</span><span>${sel("e.tpos", e.tpos || "center", [["left", "Left"], ["center", "Centre"], ["right", "Right"]])}${sel("e.tv", e.tv || (isShape ? "middle" : "above"), isShape ? [["top", "Top"], ["middle", "Middle"], ["bottom", "Bottom"]] : [["above", "Above the line"], ["below", "Below the line"]])}</span></div>`}`;
    }
    if (t === "coords") {
      const P = cur.points || [], intra = [0, 1, 2, 6, 7, 8, 9, 10, 11].includes(kc.period ?? 3);
      const dt = (ts) => { const d = new Date(ts); const z = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}${intra ? `T${z(d.getHours())}:${z(d.getMinutes())}` : ""}`; };
      return P.map((p, i) => `<div class="h">POINT ${i + 1}</div><div class="f"><span>Price</span><span><input type="number" step="any" data-pv="${i}" value="${Number(p.value).toFixed(4).replace(/\.?0+$/, "")}"></span></div>
        <div class="f"><span>${intra ? "Date and time" : "Date"}</span><span><input type="${intra ? "datetime-local" : "date"}" data-pt="${i}" value="${p.timestamp ? dt(p.timestamp) : ""}"></span></div>`).join("") || `<p class="note">This drawing has no points.</p>`;
    }
    const vis = cur.ui?.vis || {};
    return `<p class="note" style="margin:6px 0 8px">Show this drawing on these timeframes:</p>${KT_TF.map(([k, l]) => chk(`v.${k}`, vis[k] ?? true, l)).join("")}`;
  };
  const m = kcModal(`<div class="kwh"><b>${esc(KT_NAME[name] || name)}</b><button class="x" data-a="cancel">✕</button></div><div class="kwt"></div><div class="kwb ktset"></div>
    <div class="kwf"><details class="kwdd"><summary>Template ▾</summary><div><button data-a="savedef">Save as my default for ${esc(KT_NAME[name] || name)}</button><button data-a="usedef" ${ktDefs()[name] ? "" : "disabled"}>Apply my default</button><button data-a="reset">Reset to the original look</button></div></details>
      <span class="sp"></span><button class="c" data-a="cancel">Cancel</button><button class="ok" data-a="ok">Ok</button></div>`, "kwind");
  const draw = () => { m.querySelector(".kwt").innerHTML = tabs.map(([k, l]) => `<button class="${k === t ? "on" : ""}" data-tab="${k}">${l}</button>`).join(""); m.querySelector(".ktset").innerHTML = body(); };
  draw();
  const setE = (k, v) => { cur.extendData = { ...ext(), [k]: v }; };
  const setL = (patch) => { cur.styles = { ...(cur.styles || {}), line: { ...ln(), ...patch } }; };
  const setG = (patch) => { cur.styles = { ...(cur.styles || {}), polygon: { ...pg(), ...patch }, circle: { ...(cur.styles?.circle || {}), ...(patch.color ? { color: patch.color } : {}), ...(patch.borderColor ? { borderColor: patch.borderColor } : {}), ...(patch.borderSize ? { borderSize: patch.borderSize } : {}), ...(patch.style ? { style: patch.style } : {}) } }; };
  const alpha = (hex, pct) => `${String(hex).slice(0, 7)}${Math.round((pct / 100) * 255).toString(16).padStart(2, "0")}`;
  const onField = (el) => {
    const d = el.dataset;
    if (d.c || d.cs) { const [k, v] = d.cs ? d.cs.split(":") : [d.c, el.value];
      if (k === "ln.color") setL({ color: v }); else if (k === "pg.borderColor") setG({ borderColor: v });
      else if (k === "pg.color") setG({ color: alpha(v, Number(m.querySelector("[data-op]")?.value ?? 15)) }); else if (k === "e.tc") setE("tc", v); }
    else if (d.op !== undefined) setG({ color: alpha(pg().color, Number(el.value)) });
    else if (d.s) { const v = el.value;
      if (d.s === "ln.size") setL({ size: +v }); else if (d.s === "ln.dash") setL({ style: v === "solid" ? "solid" : "dashed", dashedValue: v === "dot" ? [1, 3] : [6, 4] });
      else if (d.s === "pg.borderSize") setG({ borderSize: +v }); else if (d.s === "pg.dash") setG({ borderStyle: v === "dash" ? "dashed" : "solid", borderDashedValue: [6, 4] });
      else if (d.s === "riskT") setE("riskT", v); else if (d.s.startsWith("e.")) setE(d.s.slice(2), /^\d+$/.test(v) ? +v : v); }
    else if (d.k) { const v = el.checked;
      if (d.k === "pg.fill") setG({ style: v ? "stroke_fill" : "stroke" }); else if (d.k.startsWith("e.")) setE(d.k.slice(2), v);
      else if (d.k.startsWith("v.")) { cur.ui = { ...(cur.ui || {}), vis: { ...(cur.ui?.vis || {}), [d.k.slice(2)]: v } }; } }
    else if (d.n) setE(d.n, Number(el.value));
    else if (d.t !== undefined) { if (name === "tvText") cur.extendData = { ...ext(), text: el.value || "Text" }; else setE("text", el.value); }
    else if (d.pv !== undefined || d.pt !== undefined) {
      const i = +(d.pv ?? d.pt), P = clone(cur.points || []); if (!P[i]) return;
      if (d.pv !== undefined && Number.isFinite(+el.value)) P[i].value = +el.value;
      if (d.pt !== undefined && el.value) { const ts = new Date(el.value).getTime(); if (Number.isFinite(ts)) { const list = c.getDataList(); let best = list[0]?.timestamp ?? ts; list.forEach((b) => { if (Math.abs(b.timestamp - ts) < Math.abs(best - ts)) best = b.timestamp; }); P[i].timestamp = best; } }
      cur.points = P;
    }
    if (name === "tvText" && (d.s === "e.ts")) cur.extendData = { ...ext(), size: +el.value };
    live();
  };
  m.addEventListener("input", (e) => onField(e.target));
  m.addEventListener("change", (e) => { if (e.target.matches("select,input[type=checkbox],input[type=date],input[type=datetime-local]")) onField(e.target); });
  m.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.tab) { t = b.dataset.tab; draw(); return; }
    if (b.dataset.cs) { onField(b); draw(); return; }
    const a = b.dataset.a; if (!a) return;
    if (a === "savedef") { const d = ktDefs(); d[name] = { styles: cur.styles || {}, extendData: ["tvText", "simpleAnnotation", "simpleTag", "fibonacciLine"].includes(name) ? undefined : (() => { const { text: _t, ...rest } = ext(); return rest; })() }; safe(() => localStorage.setItem("ic_ktdef", JSON.stringify(d))); toast(`Saved as your default ${esc(KT_NAME[name] || name)}`); b.closest("details")?.removeAttribute("open"); return; }
    if (a === "usedef") { const d = ktDefs()[name]; if (d) { cur.styles = clone(d.styles || {}); if (d.extendData) cur.extendData = { ...ext(), ...d.extendData }; live(); draw(); } b.closest("details")?.removeAttribute("open"); return; }
    if (a === "reset") { cur.styles = {}; if (!["tvText", "simpleAnnotation", "simpleTag", "fibonacciLine"].includes(name)) cur.extendData = ext().text ? { text: ext().text } : undefined; c.overrideOverlay({ id, styles: { line: { style: "solid", smooth: false, size: 1, color: "#2962FF", dashedValue: [2, 2] } } }); live(); draw(); b.closest("details")?.removeAttribute("open"); return; }
    if (a === "cancel") { ktApply(id, before); ktFloat(); m.remove(); return; }
    if (a === "ok") { kc.ov.set(id, clone(cur)); if (JSON.stringify(before) !== JSON.stringify(cur)) { kc.hist.push({ t: "edit", id, before }); kc.redo = []; } kcSave(); ktFloat(); m.remove(); }
  });
}
// ----- Object tree: every indicator and drawing on this chart (show / hide, lock, settings, remove; click = select) -----
function ktTreeToggle() {
  kc.treeOpen = !kc.treeOpen;
  kc.box?.classList.toggle("tree", kc.treeOpen); ktTree(); render(false);
  requestAnimationFrame(() => kc.chart?.resize());
}
function ktTree() {
  const el = kc.box?.querySelector(".ktree"); if (!el) return;
  el.hidden = !kc.treeOpen; if (!kc.treeOpen) return;
  const c = kc.chart, list = [...kc.ov.entries()].reverse(), tf = ktTfNow();
  const ind = (kc.active || []).map((a) => `<div class="tr2"><span class="ic">${chI("fx", 16)}</span><span class="nm">${esc(IND_NAME[a.name] || a.name)}<small>${esc((a.params || []).join(" "))}</small></span>
      <button data-ti="eye:${esc(a.name)}" title="${a.hidden ? "Show" : "Hide"}">${ti(a.hidden ? "eyeoff" : "eye", 16)}</button><button data-ti="set:${esc(a.name)}" title="Settings">${ti("gear", 16)}</button><button data-ti="del:${esc(a.name)}" title="Remove">${ti("trash", 16)}</button></div>`).join("");
  const dr = list.map(([id, p]) => { const ui = p.ui || {}, off = ui.hidden || (ui.vis && ui.vis[tf] === false), o = c?.getOverlayById(id), lock = o?.lock ?? p.lock, txt = p.name === "tvText" || p.name === "simpleAnnotation" ? (typeof p.extendData === "string" ? p.extendData : p.extendData?.text) : p.extendData?.text;
    return `<div class="tr2${kc.sel === id ? " on" : ""}${off ? " off" : ""}" data-tsel="${esc(id)}"><span class="ic">${ti(p.name, 16)}</span><span class="nm">${esc(KT_NAME[p.name] || p.name)}${txt ? `<small>“${esc(String(txt).slice(0, 24))}”</small>` : ""}${ui.vis && ui.vis[tf] === false ? "<small>hidden on this timeframe</small>" : ""}${ui.alert?.on ? `<small class="al">🔔 alert</small>` : ""}</span>
      <button data-td="eye:${esc(id)}" title="${ui.hidden ? "Show" : "Hide"}">${ti(ui.hidden ? "eyeoff" : "eye", 16)}</button><button data-td="lock:${esc(id)}" title="${lock ? "Unlock" : "Lock"}" class="${lock ? "on" : ""}">${ti(lock ? "lock" : "unlock", 16)}</button><button data-td="set:${esc(id)}" title="Settings">${ti("gear", 16)}</button><button data-td="del:${esc(id)}" title="Remove">${ti("trash", 16)}</button></div>`; }).join("");
  el.innerHTML = `<div class="th"><b>Object tree</b><button data-tt="close" title="Close">✕</button></div>
    <div class="tbody"><small>INDICATORS · ${(kc.active || []).length}</small>${ind || `<p class="note">None. Press Indicators to add one.</p>`}
    <small>DRAWINGS · ${kc.ov.size}</small>${dr || `<p class="note">No drawings on ${esc(kc.sym || "this chart")} yet.</p>`}</div>
    ${kc.ov.size ? `<div class="tf"><button data-tt="hide">${kc.hideAll ? "Show all" : "Hide all"}</button><button data-tt="lock">Lock / unlock all</button><button data-tt="clr">Remove all</button></div>` : ""}`;
}
function ktTreeClick(e) {
  const b = e.target.closest("button,[data-tsel]"); if (!b) return;
  const c = kc.chart; if (!c) return;
  if (b.dataset.tt) { const a = b.dataset.tt; if (a === "close") return ktTreeToggle(); if (a === "hide" || a === "lock") return ktOption(a, b); if (a === "clr") { kcAction("clr"); return; } }
  if (b.dataset.ti) { const [a, n] = b.dataset.ti.split(":"), x = kc.active.find((y) => y.name === n); if (!x) return;
    if (a === "eye") { x.hidden = !x.hidden; kcVisApply(); prefs().list = kc.active.map(({ paneId: _, ...y }) => y); kcSavePrefs(); }
    else if (a === "set") indWindow(n); else if (a === "del") kcRemoveInd(n);
    ktTree(); return; }
  if (b.dataset.td) { e.stopPropagation(); const [a, id] = [b.dataset.td.slice(0, b.dataset.td.indexOf(":")), b.dataset.td.slice(b.dataset.td.indexOf(":") + 1)], p = kc.ov.get(id); if (!p) return;
    if (a === "eye") { p.ui = { ...(p.ui || {}), hidden: !p.ui?.hidden }; ktApplyVis(); kcSave(); }
    else if (a === "lock") { const lk = !(c.getOverlayById(id)?.lock); c.overrideOverlay({ id, lock: lk }); p.lock = lk; kcSave(); }
    else if (a === "set") { kc.sel = id; ktSettings(id); }
    else if (a === "del") c.removeOverlay(id);
    ktTree(); return; }
  if (b.dataset.tsel) { const id = b.dataset.tsel, p = kc.ov.get(id); kc.sel = id; ktFloat(); ktTree();
    const ts = p?.points?.[0]?.timestamp; if (ts) { const r = c.getVisibleRange(), list = c.getDataList(), first = list[r.from]?.timestamp, last = list[Math.min(list.length - 1, r.to - 1)]?.timestamp; if (!(ts >= first && ts <= last)) c.scrollToTimestamp(ts); } }
}

