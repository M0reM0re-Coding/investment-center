// Drawing toolbar.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// ----- drawing toolbar like TradingView (round 44): groups with the last-used tool on top and a flyout list, then
// Measure, Magnet, Stay in drawing mode, Lock all, Hide all, Remove. Replaces the chart library's own left bar. -----
const TI = {   // 24px line icons (same stroke as the rest of the site)
  cursor: '<path d="M12 3v18M3 12h18"/>',
  segment: '<path d="M5 19 19 5"/><circle cx="5" cy="19" r="1.8"/><circle cx="19" cy="5" r="1.8"/>',
  rayLine: '<path d="M5 19 21 3"/><circle cx="5" cy="19" r="1.8"/>', straightLine: '<path d="M2 22 22 2"/>',
  horizontalStraightLine: '<path d="M2 12h20"/><circle cx="12" cy="12" r="1.8"/>', horizontalRayLine: '<path d="M6 12h16"/><circle cx="6" cy="12" r="1.8"/>',
  verticalStraightLine: '<path d="M12 2v20"/><circle cx="12" cy="12" r="1.8"/>', priceChannelLine: '<path d="M3 15 15 3M9 21 21 9"/><path d="M6 18 18 6" stroke-dasharray="2 2"/>',
  parallelStraightLine: '<path d="M3 14 14 3M10 21 21 10"/>', priceLine: '<path d="M3 12h12"/><rect x="15" y="9" width="7" height="6" rx="1"/>',
  fibonacciLine: '<path d="M3 5h18M3 10h18M3 14h18M3 19h18"/><circle cx="5" cy="19" r="1.6"/><circle cx="19" cy="5" r="1.6"/>',
  fibonacciExtension: '<path d="M3 5h18M3 11h18M3 17h18"/><path d="m4 20 6-8 5 4"/>', fibonacciSegment: '<path d="M6 5h12M6 10h12M6 14h12M6 19h12"/>',
  fibonacciSpeedResistanceFan: '<path d="M4 20 20 4M4 20l16-7M4 20l16-12M4 20 13 4"/>', fibonacciCircle: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="9.5"/>',
  fibonacciSpiral: '<path d="M12 12a2 2 0 1 1 2 2 4 4 0 0 1-6-2 6 6 0 0 1 8-6 8 8 0 0 1 4 10"/>', gannBox: '<rect x="3" y="3" width="18" height="18"/><path d="M3 3l18 18M21 3 3 21M12 3v18M3 12h18"/>',
  xabcd: '<path d="m2 18 5-12 5 9 5-11 5 14"/><path d="M2 18 12 15M7 6l10-2" stroke-dasharray="2 2"/>', abcd: '<path d="m3 18 6-12 6 8 6-10"/>',
  fiveWaves: '<path d="m2 18 4-7 3 4 5-11 3 6 5-6"/>', threeWaves: '<path d="m3 5 7 11 4-6 7 10"/>', eightWaves: '<path d="m1 16 3-5 2 3 3-9 2 5 3-6 3 9 2-4 4 9"/>', anyWaves: '<path d="m2 14 4-6 4 8 4-10 4 8 4-4"/>',
  tvLong: '<rect x="3" y="4" width="18" height="8" fill="currentColor" fill-opacity=".25"/><rect x="3" y="12" width="18" height="6"/><path d="M3 12h18"/>',
  tvShort: '<rect x="3" y="6" width="18" height="6"/><rect x="3" y="12" width="18" height="8" fill="currentColor" fill-opacity=".25"/><path d="M3 12h18"/>',
  tvPriceRange: '<path d="M12 3v18M8 7l4-4 4 4M4 3h16M4 21h16"/>', tvDateRange: '<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4M3 4v16M21 4v16"/>',
  tvDatePriceRange: '<rect x="3" y="3" width="18" height="18" stroke-dasharray="2 2"/><path d="M12 6v12M6 12h12"/>',
  rect: '<rect x="3" y="6" width="18" height="12" rx="1"/>', circle: '<circle cx="12" cy="12" r="8.5"/>', triangle: '<path d="M12 4 21 20H3z"/>',
  parallelogram: '<path d="M7 5h14l-4 14H3z"/>', arrow: '<path d="M4 20 20 4M11 4h9v9"/>',
  tvText: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>', simpleAnnotation: '<rect x="3" y="3" width="18" height="11" rx="2"/><path d="M12 14v7"/>', simpleTag: '<path d="M3 12 8 6h13v12H8z"/>',
  measure: '<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>', magnet: '<path d="M6 3v9a6 6 0 0 0 12 0V3h-4v9a2 2 0 0 1-4 0V3z"/><path d="M6 7h4M14 7h4"/>',
  stay: '<path d="M4 20 15 9l3 3L7 23"/><path d="m14 4 6 6M17 2l5 5"/>', lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>', eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 4.4-1"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>', dup: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
};
const ti = (k, s = 22) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TI[k] || TI.segment}</svg>`;
const KT_GROUPS = [
  ["cursor", "Cursor", [["cursor", "Crosshair", "Esc"]]],
  ["lines", "Trend line tools", [["segment", "Trend line", "Alt+T"], ["rayLine", "Ray"], ["straightLine", "Extended line"], ["horizontalStraightLine", "Horizontal line", "Alt+H"],
    ["horizontalRayLine", "Horizontal ray", "Alt+J"], ["verticalStraightLine", "Vertical line", "Alt+V"], ["priceChannelLine", "Parallel channel"], ["parallelStraightLine", "Parallel lines"], ["priceLine", "Price line"]]],
  ["fib", "Fibonacci & Gann tools", [["fibonacciLine", "Fib retracement", "Alt+F"], ["fibonacciExtension", "Trend-based fib extension"], ["fibonacciSegment", "Fib segment"],
    ["fibonacciSpeedResistanceFan", "Fib speed resistance fan"], ["fibonacciCircle", "Fib circles"], ["fibonacciSpiral", "Fib spiral"], ["gannBox", "Gann box"]]],
  ["pat", "Patterns", [["fiveWaves", "Elliott impulse wave (1 2 3 4 5)"], ["threeWaves", "Elliott correction wave (A B C)"], ["eightWaves", "Elliott wave (1 2 3 4 5 A B C)"],
    ["anyWaves", "Any waves (double-click to finish)"], ["xabcd", "XABCD pattern"], ["abcd", "ABCD pattern"]]],
  ["pred", "Forecasting & measuring tools", [["tvLong", "Long position"], ["tvShort", "Short position"], ["tvPriceRange", "Price range"], ["tvDateRange", "Date range"], ["tvDatePriceRange", "Date and price range"]]],
  ["shape", "Geometric shapes", [["rect", "Rectangle"], ["circle", "Circle"], ["triangle", "Triangle"], ["parallelogram", "Parallelogram"], ["arrow", "Arrow"]]],
  ["text", "Annotation tools", [["tvText", "Text"], ["simpleAnnotation", "Note with arrow"], ["simpleTag", "Price label"]]],
];
const KT_NAME = Object.fromEntries(KT_GROUPS.flatMap(([, , l]) => l.map(([k, n]) => [k, n])));
const KT_HINT = { tvLong: ["Click the entry price", "Click the target (also sets the width)", "Click the stop"], tvShort: ["Click the entry price", "Click the target (also sets the width)", "Click the stop"],
  anyWaves: ["Click each wave point, double-click to finish"], tvText: ["Click where the text goes"] };
const ktOpt = () => chOf().kt || (chOf().kt = safe(() => JSON.parse(localStorage.getItem("ic_kt") || "null"), null) || { last: {}, magnet: "", stay: false });
const ktSaveOpt = () => safe(() => localStorage.setItem("ic_kt", JSON.stringify(ktOpt())));
function ktRender() {
  const bar = kc.box?.querySelector(".kctools"); if (!bar) return;
  const o = ktOpt(), allLocked = [...kc.ov.keys()].length && [...kc.ov.keys()].every((id) => kc.chart?.getOverlayById(id)?.lock), hidden = !!kc.hideAll;
  bar.innerHTML = KT_GROUPS.map(([g, label, list]) => {
    const cur = list.find(([k]) => k === o.last[g]) || list[0], on = kc.tool ? list.some(([k]) => k === kc.tool) : g === "cursor";
    return `<div class="ktg${on ? " on" : ""}"><button class="ktb" data-kt="${cur[0]}" title="${esc(cur[1])}${cur[2] ? ` (${cur[2]})` : ""}">${ti(cur[0])}</button>${list.length > 1 ? `<button class="ktx" data-ktg="${g}" title="${esc(label)}" aria-label="${esc(label)}"><i></i></button>` : ""}</div>`;
  }).join("") + `<hr>
    <div class="ktg${kc.measureArm ? " on" : ""}"><button class="ktb" data-kto="measure" title="Measure (Shift + click on the chart)">${ti("measure")}</button></div>
    <div class="ktg${o.magnet ? " on" : ""}"><button class="ktb" data-kto="magnet" title="Magnet: ${o.magnet === "strong_magnet" ? "strong" : o.magnet ? "weak" : "off"} (points snap to open/high/low/close)">${ti("magnet")}${o.magnet === "strong_magnet" ? "<b>S</b>" : ""}</button></div>
    <div class="ktg${o.stay ? " on" : ""}"><button class="ktb" data-kto="stay" title="Stay in drawing mode">${ti("stay")}</button></div>
    <div class="ktg${allLocked ? " on" : ""}"><button class="ktb" data-kto="lock" title="${allLocked ? "Unlock" : "Lock"} all drawings">${ti(allLocked ? "lock" : "unlock")}</button></div>
    <div class="ktg${hidden ? " on" : ""}"><button class="ktb" data-kto="hide" title="${hidden ? "Show" : "Hide"} all drawings">${ti(hidden ? "eyeoff" : "eye")}</button></div>
    <div class="ktg"><button class="ktb" data-kto="remove" title="Remove drawings or indicators">${ti("trash")}</button></div>`;
}
function ktFly(g, btn) {   // the flyout list of one group
  document.querySelector(".ktfly")?.remove();
  const grp = KT_GROUPS.find((x) => x[0] === g); if (!grp) return;
  const r = btn.closest(".ktg").getBoundingClientRect(), m = document.createElement("div");
  m.className = "ktfly"; m.style.left = r.right + 6 + "px"; m.style.top = Math.min(r.top, innerHeight - 44 * grp[2].length - 50) + "px";
  m.innerHTML = `<small>${esc(grp[1].toUpperCase())}</small>` + grp[2].map(([k, n, s]) => `<button data-kt="${k}" class="${kc.tool === k ? "on" : ""}">${ti(k, 20)}<span>${esc(n)}</span>${s ? `<em>${s}</em>` : ""}</button>`).join("");
  document.body.appendChild(m);
  const out = (e) => { if (!m.contains(e.target) && !e.target.closest(".ktx")) { m.remove(); document.removeEventListener("mousedown", out, true); } };
  setTimeout(() => document.addEventListener("mousedown", out, true), 0);
  m.addEventListener("click", (e) => { const k = e.target.closest("[data-kt]")?.dataset.kt; if (k) { m.remove(); document.removeEventListener("mousedown", out, true); ktStart(k); } });
}
function ktStart(k) {   // pick a tool: the next clicks on the chart place its points
  const c = kc.chart; if (!c) return;
  if (kc.drawingId) { c.removeOverlay(kc.drawingId); kc.drawingId = null; }
  kc.measureArm = false;
  if (k === "cursor") { kc.tool = null; ktTip(""); ktRender(); return; }
  const g = KT_GROUPS.find(([, , l]) => l.some(([x]) => x === k)); if (g) { ktOpt().last[g[0]] = k; ktSaveOpt(); }
  kc.tool = k; kc.toolStep = 0;
  const def = ktDefs()[k];
  kc.drawingId = c.createOverlay({ name: k, groupId: "drawing_tools", mode: ktOpt().magnet || "normal", visible: true, ...(def?.styles ? { styles: clone(def.styles) } : {}), ...(def?.extendData ? { extendData: clone(def.extendData) } : {}) });
  ktTip((KT_HINT[k] || [])[0] || `${KT_NAME[k] || "Drawing"}: click on the chart to place it`);
  ktRender();
}
function ktDone(ov) {   // called when a drawing is finished (from kcWrap)
  kc.drawingId = null;
  if (ov?.name === "tvText") ktSettings(ov.id, "text");
  if (ktOpt().stay && kc.tool && kc.tool !== "tvText") { const k = kc.tool; setTimeout(() => ktStart(k), 0); return; }
  kc.tool = null; ktTip(""); ktRender();
}
function ktTip(t) { const el = kc.box?.querySelector(".kttip"); if (!el) return; el.textContent = t; el.hidden = !t; }
function ktOption(k, btn) {
  const c = kc.chart, o = ktOpt(); if (!c) return;
  if (k === "measure") { kc.measureArm = !kc.measureArm; kc.tool = null; ktTip(kc.measureArm ? "Click a start point on the chart (or Shift + click any time)" : ""); }
  else if (k === "magnet") { o.magnet = o.magnet === "" ? "weak_magnet" : o.magnet === "weak_magnet" ? "strong_magnet" : ""; ktSaveOpt(); toast(`Magnet ${o.magnet === "strong_magnet" ? "strong" : o.magnet ? "weak" : "off"}`); }
  else if (k === "stay") { o.stay = !o.stay; ktSaveOpt(); }
  else if (k === "lock" || k === "hide") {
    const ids = [...kc.ov.keys()], lockAll = k === "lock" && !ids.every((id) => c.getOverlayById(id)?.lock);
    if (k === "hide") kc.hideAll = !kc.hideAll;
    if (k === "hide") ktApplyVis();
    else ids.forEach((id) => { c.overrideOverlay({ id, lock: lockAll }); const p = kc.ov.get(id); if (p) p.lock = lockAll; });
    if (k === "lock") kcSave();
  } else if (k === "remove") {
    document.querySelector(".kcctx")?.remove();
    const r = btn.getBoundingClientRect(), m = document.createElement("div"); m.className = "kcctx"; m.style.left = r.right + 6 + "px"; m.style.top = r.top - 60 + "px";
    m.innerHTML = `<button data-m="clr">Remove ${kc.ov.size} drawing${kc.ov.size === 1 ? "" : "s"}</button><button data-m="clri">Remove all indicators</button><button data-m="clra">Remove drawings and indicators</button>`;
    document.body.appendChild(m);
    const close = () => { m.remove(); document.removeEventListener("mousedown", out, true); }, out = (e) => { if (!m.contains(e.target)) close(); };
    setTimeout(() => document.addEventListener("mousedown", out, true), 0);
    m.addEventListener("click", (e) => { const a = e.target.closest("[data-m]")?.dataset.m; if (!a) return; close(); if (a === "clra") { kcAction("clr"); kcAction("clri"); } else kcAction(a); });
  }
  ktRender();
}
// floating bar over a selected drawing: colour, width, line style, (settings), lock, clone, delete
const KT_COLORS = ["#2962FF", "#F23645", "#089981", "#FF9800", "#9C27B0", "#00BCD4", "#FFEB3B", "#E91E63", "#787B86", "#FFFFFF", "#131722", "#4CAF50"];
function ktFloat() {
  const box = kc.box, el = box?.querySelector(".ktfloat"); if (!el) return;
  const ov = kc.sel && kc.chart?.getOverlayById(kc.sel);
  if (!ov || kc.tool) { el.hidden = true; return; }
  const ln = ov.styles?.line || {}, col = ln.color || "#2962FF", w = ln.size || 1, st = ln.style === "dashed" ? (String(ln.dashedValue) === "1,3" ? "dot" : "dash") : "solid", fib = ov.name === "fibonacciLine", txt = ov.name === "tvText";
  el.innerHTML = `<span class="ktn">${esc(KT_NAME[ov.name] || ov.name)}</span><i></i>
    ${fib ? "" : `<details class="ktdd"><summary title="Colour"><span class="sw" style="background:${esc(col)}"></span></summary><div class="sws">${KT_COLORS.map((c) => `<button data-kf="col:${c}" style="background:${c}" title="${c}"></button>`).join("")}</div></details>`}
    ${fib || txt ? "" : `<details class="ktdd"><summary title="Line width"><span class="lw" style="height:${w}px"></span>${w}px</summary><div>${[1, 2, 3, 4].map((x) => `<button data-kf="w:${x}" class="${x === w ? "on" : ""}"><span class="lw" style="height:${x}px"></span>${x}px</button>`).join("")}</div></details>
    <details class="ktdd"><summary title="Line style">${st === "solid" ? "━" : st === "dash" ? "╍" : "┉"}</summary><div>${[["solid", "━ Solid"], ["dash", "╍ Dashed"], ["dot", "┉ Dotted"]].map(([k, l]) => `<button data-kf="st:${k}" class="${k === st ? "on" : ""}">${l}</button>`).join("")}</div></details>`}
    <button data-kf="set" title="Settings (or double-click the drawing)">${ti("gear", 18)}</button>${KT_TEXTABLE.includes(ov.name) ? `<button data-kf="edit" title="Text">${ti("tvText", 18)}</button>` : ""}
    ${KT_ALERTABLE.includes(ov.name) ? `<button data-kf="alert" class="${kc.ov.get(ov.id)?.ui?.alert?.on ? "on" : ""}" title="${kc.ov.get(ov.id)?.ui?.alert?.on ? "Alert is on: click to turn it off" : "Alert me (Telegram) when the price crosses this"}">${chI("bell", 18)}</button>` : ""}
    <button data-kf="lock" title="${ov.lock ? "Unlock" : "Lock"}">${ti(ov.lock ? "lock" : "unlock", 18)}</button><button data-kf="dup" title="Clone">${ti("dup", 18)}</button><button data-kf="del" title="Remove (Delete)">${ti("trash", 18)}</button>`;
  el.hidden = false;
}
function ktFloatClick(k) {
  const c = kc.chart, id = kc.sel, ov = id && c?.getOverlayById(id); if (!ov) return;
  const ln = { style: "solid", smooth: false, size: 1, color: "#2962FF", dashedValue: [2, 2], ...(ov.styles?.line || {}) };
  const put = (styles) => { c.overrideOverlay({ id, styles }); const p = kc.ov.get(id); if (p) { p.styles = { ...(p.styles || {}), ...styles }; kcSave(); } ktFloat(); };
  const [a, v] = k.split(":");
  if (a === "col") { const fill = v + "26"; put({ line: { ...ln, color: v }, polygon: { color: fill, borderColor: v, borderSize: ln.size, style: "stroke_fill" }, circle: { color: fill, borderColor: v, style: "stroke_fill" }, arc: { color: v }, text: { color: v } }); }
  else if (a === "w") put({ line: { ...ln, size: +v }, polygon: { ...(ov.styles?.polygon || {}), borderSize: +v } });
  else if (a === "st") put({ line: { ...ln, style: v === "solid" ? "solid" : "dashed", dashedValue: v === "dot" ? [1, 3] : [6, 4] } });
  else if (a === "set") (ov.name === "fibonacciLine" ? fibWindow(id) : ktSettings(id));
  else if (a === "edit") ktSettings(id, "text");
  else if (a === "alert") ktAlertToggle(id);
  else if (a === "lock") { c.overrideOverlay({ id, lock: !ov.lock }); const p = kc.ov.get(id); if (p) { p.lock = !ov.lock; kcSave(); } ktFloat(); ktRender(); }
  else if (a === "dup") { const p = kc.ov.get(id); if (p) { const list = c.getDataList(), bs = c.getBarSpace(), shift = (list.at(-1)?.timestamp - list.at(-2)?.timestamp || 864e5) * 5;
    kcAddDone({ ...clone(p), points: p.points.map((q) => ({ ...q, timestamp: q.timestamp + shift })) }); void bs; } }
  else if (a === "del") { c.removeOverlay(id); kc.sel = null; ktFloat(); }
  document.querySelectorAll(".ktfloat details[open]").forEach((d) => d.removeAttribute("open"));
}
function ktTextEdit(id, fresh) {
  const ov = kc.chart?.getOverlayById(id); if (!ov) return;
  const m = kcModal(`<div class="kwh"><b>Text</b><button class="x" data-k="close">✕</button></div><div class="kwb"><textarea class="kttext" rows="3" maxlength="300" placeholder="Type your note">${esc(ov.extendData?.text || "")}</textarea>
    <div class="f"><span>Size</span><span><select data-ts>${[12, 14, 16, 20, 24, 28].map((s) => `<option ${s === (ov.extendData?.size || 14) ? "selected" : ""}>${s}</option>`).join("")}</select></span></div></div>
    <div class="kwf"><span class="sp"></span><button class="c" data-k="close">Cancel</button><button class="ok" data-k="ok">Ok</button></div>`);
  const ta = m.querySelector("textarea"); setTimeout(() => ta.focus(), 0);
  m.addEventListener("click", (e) => {
    const k = e.target.closest("[data-k]")?.dataset.k; if (!k) return;
    if (k === "ok") { const t = ta.value.trim(); if (!t && fresh) { kc.chart.removeOverlay(id); m.remove(); return; }
      const ext = { ...(ov.extendData || {}), text: t || ov.extendData?.text || "Text", size: +m.querySelector("[data-ts]").value };
      kc.chart.overrideOverlay({ id, extendData: ext }); const p = kc.ov.get(id); if (p) { p.extendData = ext; kcSave(); } }
    else if (fresh && !ov.extendData?.text) kc.chart.removeOverlay(id);
    m.remove();
  });
}
// our extra drawings: Long / Short position, Price / Date / Date-and-price range, Text
function kcRegisterTV(K) {
  const F = "Inter, sans-serif", lbl = (x, y, text, bg, align = "center", baseline = "middle") => ({ type: "text", ignoreEvent: true, attrs: { x, y, text, align, baseline },
    styles: { color: "#fff", size: 12, family: F, weight: 600, backgroundColor: bg, borderRadius: 4, paddingLeft: 6, paddingRight: 6, paddingTop: 4, paddingBottom: 4, borderSize: 0 } });
  const fx = (v, p) => Number(v).toFixed(p?.price ?? 2);
  ["tvLong", "tvShort"].forEach((name) => K.registerOverlay({
    name, totalStep: 4, needDefaultPointFigure: true, needDefaultXAxisFigure: true, needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates: cs, overlay, precision }) => {
      if (cs.length < 2) return cs.length ? [{ type: "line", attrs: { coordinates: [{ x: cs[0].x - 60, y: cs[0].y }, { x: cs[0].x + 60, y: cs[0].y }] }, styles: { color: "#787B86" } }] : [];
      const [a, b, c] = cs, P = overlay.points, e = P[0].value, t = P[1].value, s = P[2]?.value ?? e - (t - e) / 2, yS = c ? c.y : a.y + (a.y - b.y) / 2;
      const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x, a.x + 40), w = x2 - x1, rr = Math.abs(e - s) ? Math.abs(t - e) / Math.abs(e - s) : 0, sign = name === "tvLong" ? 1 : -1;
      const pct = (v) => `${(((v - e) / e) * 100 * sign).toFixed(2)}%`, X = ktExt(overlay);
      const riskAmt = X.acct ? (X.riskT === "amt" ? X.risk ?? 0 : (X.acct * (X.risk ?? 1)) / 100) : 0, qty = riskAmt && Math.abs(e - s) ? riskAmt / Math.abs(e - s) : 0;
      const money = (v) => (qty ? ` · ${v >= 0 ? "+" : "−"}${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "");
      return [
        { type: "rect", attrs: { x: x1, y: Math.min(a.y, b.y), width: w, height: Math.abs(b.y - a.y) }, styles: { style: "fill", color: "rgba(8,153,129,0.22)" } },
        { type: "rect", attrs: { x: x1, y: Math.min(a.y, yS), width: w, height: Math.abs(yS - a.y) }, styles: { style: "fill", color: "rgba(242,54,69,0.22)" } },
        { type: "line", attrs: { coordinates: [{ x: x1, y: a.y }, { x: x2, y: a.y }] }, styles: { color: "#787B86" } },
        lbl((x1 + x2) / 2, b.y + (b.y < a.y ? -12 : 12), `Target: ${fx(t, precision)} (${pct(t)})${money(qty * (t - e) * sign)}`, "#089981"),
        lbl((x1 + x2) / 2, yS + (yS > a.y ? 12 : -12), `Stop: ${fx(s, precision)} (${pct(s)})${money(qty * (s - e) * sign)}`, "#F23645"),
        lbl((x1 + x2) / 2, a.y, `${name === "tvLong" ? "Long" : "Short"} ${fx(e, precision)}${qty ? ` · Qty ${qty >= 100 ? Math.floor(qty).toLocaleString("en-US") : qty.toFixed(2)}` : ""} · Risk/reward ${rr.toFixed(2)}`, "#2a2e39"),
      ];
    },
  }));
  const range = (name, kind) => K.registerOverlay({
    name, totalStep: 3, needDefaultPointFigure: true, needDefaultXAxisFigure: true, needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates: cs, overlay, precision, xAxis }) => {
      if (cs.length < 2) return [];
      const [a, b] = cs, P = overlay.points, d = P[1].value - P[0].value, up = d >= 0, col = up ? "rgba(41,98,255," : "rgba(242,54,69,";
      const i0 = xAxis?.convertFromPixel?.(a.x), i1 = xAxis?.convertFromPixel?.(b.x), bars = Number.isFinite(i0) && Number.isFinite(i1) ? Math.round(i1 - i0) : 0;
      const days = P[0].timestamp && P[1].timestamp ? Math.round(Math.abs(P[1].timestamp - P[0].timestamp) / 864e5) : 0;
      const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y), mx = (x1 + x2) / 2, my = (y1 + y2) / 2, out = [];
      out.push({ type: "rect", attrs: { x: x1, y: y1, width: Math.max(1, x2 - x1), height: Math.max(1, y2 - y1) }, styles: { style: "fill", color: col + "0.16)" } });
      if (kind !== "date") out.push({ type: "line", attrs: { coordinates: [{ x: mx, y: a.y }, { x: mx, y: b.y }] }, styles: { color: col + "1)" } },
        { type: "line", attrs: { coordinates: [{ x: mx - 5, y: b.y + (up ? 6 : -6) }, { x: mx, y: b.y }, { x: mx + 5, y: b.y + (up ? 6 : -6) }] }, styles: { color: col + "1)" } });
      if (kind !== "price") out.push({ type: "line", attrs: { coordinates: [{ x: a.x, y: my }, { x: b.x, y: my }] }, styles: { color: col + "1)" } },
        { type: "line", attrs: { coordinates: [{ x: b.x + (b.x > a.x ? -6 : 6), y: my - 5 }, { x: b.x, y: my }, { x: b.x + (b.x > a.x ? -6 : 6), y: my + 5 }] }, styles: { color: col + "1)" } });
      const t1 = `${up ? "+" : ""}${fx(d, precision)} (${up ? "+" : ""}${P[0].value ? ((d / P[0].value) * 100).toFixed(2) : "0"}%)`, t2 = `${bars} bars${days ? `, ${days}d` : ""}`;
      const text = kind === "price" ? t1 : kind === "date" ? t2 : `${t1} · ${t2}`;
      out.push(lbl(mx, (b.y > a.y ? y2 + 14 : y1 - 14), text, up ? "#2962FF" : "#F23645"));
      return out;
    },
  });
  range("tvPriceRange", "price"); range("tvDateRange", "date"); range("tvDatePriceRange", "both");
  ktRegisterLines(K);
  K.registerOverlay({
    name: "tvText", totalStep: 2, needDefaultPointFigure: true, needDefaultXAxisFigure: false, needDefaultYAxisFigure: false,
    createPointFigures: ({ coordinates: cs, overlay }) => {
      if (!cs.length) return [];
      const e = overlay.extendData || {}, col = overlay.styles?.text?.color || "#2962FF";
      return String(e.text || "Text").split("\n").map((line, i) => ({ type: "text", attrs: { x: cs[0].x, y: cs[0].y + i * ((e.size || 14) + 4), text: line, align: "left", baseline: "middle" },
        styles: { color: col, size: e.size || 14, family: F, weight: 600, backgroundColor: "transparent", paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0, borderSize: 0 } }));
    },
  });
}

