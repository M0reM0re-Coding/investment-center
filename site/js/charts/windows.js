// Indicator / Fibonacci settings windows, right-click menu, shortcuts.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// ----- windows: Indicators, indicator settings, Fibonacci settings, right-click menu -----
function kcModal(html, cls = "") {
  document.querySelector(".kcmodal")?.remove();
  const m = document.createElement("div"); m.className = "kcmodal"; m.innerHTML = `<div class="kcwin ${cls}">${html}</div>`;
  m.addEventListener("mousedown", (e) => { if (e.target === m) m.remove(); });
  document.body.appendChild(m);
  return m;
}
function indListWindow() {
  const p = prefs(); let cat = "fav", q = "";
  const m = kcModal(`<div class="kwh"><b>Indicators</b><button class="x" data-k="close">✕</button></div><div class="kws"><input placeholder="Search  e.g. RSI, MACD, Bollinger" autofocus></div><div class="kwb ind"><div class="cats"></div><div class="ls"></div></div>`, "kwind");
  const draw = () => {
    const all = Object.values(IND_CAT).flat(), on = new Set(kc.active.map((a) => a.name));
    const list = q ? all.filter((n) => (IND_NAME[n] + " " + n).toLowerCase().includes(q)) : cat === "fav" ? p.fav.filter((n) => IND_NAME[n]) : cat === "all" ? all : IND_CAT[cat];
    m.querySelector(".cats").innerHTML = `<small>PERSONAL</small><button data-cat="fav" class="${cat === "fav" && !q ? "on" : ""}">★ Favourites</button><small>BUILT-IN</small>${["all", ...Object.keys(IND_CAT)].map((c) => `<button data-cat="${c}" class="${cat === c && !q ? "on" : ""}">${c === "all" ? "All" : c}</button>`).join("")}`;
    m.querySelector(".ls").innerHTML = list.map((n) => `<div class="li" data-add="${n}"><button class="star${p.fav.includes(n) ? " on" : ""}" data-fav="${n}" title="Favourite">${p.fav.includes(n) ? "★" : "☆"}</button><span>${esc(IND_NAME[n])}</span><em>${on.has(n) ? "added ✓" : isMain(n) ? "on price" : "own pane"}</em></div>`).join("")
      + (cat === "fav" && !q ? IND_SOON.map(([n, w]) => `<div class="li no"><button class="star on" disabled>★</button><span>${esc(n)}</span><em>${esc(w)}</em></div>`).join("") : "")
      || `<p class="note" style="margin:14px">Nothing found.</p>`;
  };
  draw();
  m.querySelector("input").addEventListener("input", (e) => { q = e.target.value.trim().toLowerCase(); draw(); });
  m.addEventListener("click", (e) => {
    const b = e.target.closest("[data-k],[data-cat],[data-fav],[data-add]"); if (!b) return;
    if (b.dataset.k === "close") return m.remove();
    if (b.dataset.cat) { cat = b.dataset.cat; q = ""; m.querySelector("input").value = ""; return draw(); }
    if (b.dataset.fav) { const n = b.dataset.fav; p.fav = p.fav.includes(n) ? p.fav.filter((x) => x !== n) : [...p.fav, n]; kcSavePrefs(); return draw(); }
    if (b.dataset.add) { const n = b.dataset.add; if (kc.active.some((a) => a.name === n)) { toast(`${esc(IND_NAME[n])} is already on the chart. Use its ⚙ to change it.`); return; }
      kcAddInd({ name: n, ...clone(p.def[n] || IND_DEF[n] || { params: [] }) }); draw(); }
  });
}
const SRC = ["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"];
function indWindow(name) {
  const a = kc.active.find((x) => x.name === name); if (!a) return;
  const e = clone({ params: a.params, ext: a.ext, style: a.style, hideOn: a.hideOn || [] }); let tab = "in";
  const p = prefs();
  const m = kcModal(`<div class="kwh"><b>${esc(IND_NAME[name] || name)}</b><button class="x" data-k="close">✕</button></div><div class="kwt"></div><div class="kwb"></div>
    <div class="kwf"><details class="kwdd"><summary>Defaults</summary><div><button data-k="tvdef">Reset to TradingView default</button><button data-k="mydef">Save as my default</button><button data-k="myreset"${p.def[name] ? "" : " disabled"}>Reset to my default</button></div></details><span class="sp"></span><button class="c" data-k="close">Cancel</button><button class="ok" data-k="ok">Ok</button></div>`, "kwset");
  const num = (k, v, lab) => `<label class="f">${lab}<input type="number" data-p="${k}" value="${v}" min="1" max="500"></label>`;
  const sel = (k, v, opts, lab) => `<label class="f">${lab}<select data-x="${k}">${opts.map((o) => `<option ${o === v ? "selected" : ""}>${o}</option>`).join("")}</select></label>`;
  const ck = (k, v, lab, extra = "") => `<label class="f"><span class="ck"><input type="checkbox" data-s="${k}" ${v ? "checked" : ""}>${lab}</span>${extra ? `<span>${extra}</span>` : ""}</label>`;
  const col = (k, v) => `<input type="color" data-c="${k}" value="${v}">`;
  const wid = (k, v) => `<select data-w="${k}">${[1, 2, 3, 4].map((n) => `<option ${n === v ? "selected" : ""} value="${n}">${n}px</option>`).join("")}</select>`;
  const draw = () => {
    m.querySelector(".kwt").innerHTML = [["in", "Inputs"], ["st", "Style"], ["vi", "Visibility"]].map(([k, l]) => `<button class="${k === tab ? "on" : ""}" data-tab="${k}">${l}</button>`).join("");
    const x = e.ext;
    let h = "";
    if (tab === "in") {
      if (name === "TV_MACD") h = sel("src", x.src, SRC, "Source") + num(0, e.params[0], "Fast length") + num(1, e.params[1], "Slow length") + num(2, e.params[2], "Signal length") + sel("osc", x.osc, ["EMA", "SMA"], "Oscillator MA type") + sel("sig", x.sig, ["EMA", "SMA"], "Signal MA type");
      else if (name === "TV_RSI") h = `<div class="h">RSI SETTINGS</div>` + num(0, e.params[0], "RSI length") + sel("src", x.src, SRC, "Source") + `<div class="h">SMOOTHING</div>` + sel("smooth", x.smooth, ["None", "SMA", "SMA + Bollinger Bands", "EMA", "RMA", "WMA"], "Type") + num(1, e.params[1], "Length") + num(2, e.params[2], "BB StdDev");
      else if (name === "TV_VOL") h = num(0, e.params[0], "MA length") + ck("prev", x.prev, "Colour based on previous close");
      else h = (e.params.length ? e.params.map((v, i) => num(i, v, (IND_INPUTS[name] || [])[i] || `Input ${i + 1}`)).join("") : `<p class="note">This one has no inputs.</p>`)
        + (IND_FLAGS[name] || []).map(([k, l]) => ck(k, x?.[k], l)).join("");
    } else if (tab === "st") {
      if (name === "TV_MACD") h = ck("hist", x.show.hist, "Histogram") + ["h0|Growing above zero", "h1|Falling above zero", "h2|Growing below zero", "h3|Falling below zero"].map((s) => { const [k, l] = s.split("|"); return `<label class="f in">${l}<span>${col(k, x.col[k])}</span></label>`; }).join("")
        + ck("macd", x.show.macd, "MACD", col("macd", x.col.macd) + wid("macd", x.w.macd)) + ck("signal", x.show.signal, "Signal line", col("signal", x.col.signal) + wid("signal", x.w.signal)) + ck("zero", x.show.zero, "Zero line", col("zero", x.col.zero));
      else if (name === "TV_RSI") h = ck("rsi", x.show.rsi, "RSI", col("rsi", x.col.rsi) + wid("rsi", x.w.rsi)) + ck("ma", x.show.ma, "RSI-based MA", col("ma", x.col.ma) + wid("ma", x.w.ma))
        + ck("bands", x.show.bands, "Bands", col("bands", x.col.bands)) + `<label class="f in">Upper · middle · lower<span class="b3">${x.bands.map((v, i) => `<input type="number" data-b="${i}" value="${v}" min="0" max="100">`).join("")}</span></label>` + ck("fill", x.show.fill, "Background fill", col("fill", x.col.fill));
      else if (name === "TV_VOL") h = `<label class="f">Growing${col("up", x.col.up)}</label><label class="f">Falling${col("dn", x.col.dn)}</label>` + ck("showMA", x.showMA, "Volume MA", col("ma", x.col.ma));
      else if (name === "TV_ZZ") h = `<label class="f">Line<span><input type="color" data-x="color" value="${x.color || "#2962FF"}"><select data-x="w">${[1, 2, 3, 4].map((n) => `<option ${n === Number(x.w || 2) ? "selected" : ""} value="${n}">${n}px</option>`).join("")}</select></span></label>`;
      else { const st = (e.style ||= {}); st.lines ||= (kc.chart.getIndicatorByPaneId(a.paneId, name)?.styles?.lines || kc.pro.getStyles().indicator.lines).slice(0, Math.max(1, e.params.length || 3)).map((l) => ({ color: l.color, size: l.size || 1 }));
        h = st.lines.map((l, i) => `<label class="f">Line ${i + 1}<span><input type="color" data-lc="${i}" value="${/^#/.test(l.color) ? l.color.slice(0, 7) : "#2962ff"}"><select data-lw="${i}">${[1, 2, 3, 4].map((n) => `<option ${n === l.size ? "selected" : ""} value="${n}">${n}px</option>`).join("")}</select></span></label>`).join(""); }
    } else h = `<p class="note" style="margin:6px 0 10px">Show this indicator on these candle sizes:</p>` + KC_PERIODS.map((pp) => `<label class="f"><span class="ck"><input type="checkbox" data-v="${pp.text}" ${e.hideOn.includes(pp.text) ? "" : "checked"}>${pp.text === "D" ? "1 day" : pp.text === "W" ? "1 week" : pp.text === "M" ? "1 month" : pp.text}</span></label>`).join("");
    m.querySelector(".kwb").innerHTML = h;
  };
  draw();
  m.addEventListener("change", (ev) => {
    const t = ev.target, d = t.dataset, x = e.ext;
    if (d.p !== undefined) e.params[+d.p] = Math.max(1, Number(t.value) || 1);
    else if (d.x) x[d.x] = t.value;
    else if (d.s) { if (x.show && d.s in x.show) x.show[d.s] = t.checked ? 1 : 0; else x[d.s] = t.checked ? 1 : 0; }
    else if (d.c) x.col[d.c] = t.value;
    else if (d.w) x.w[d.w] = Number(t.value);
    else if (d.b !== undefined) x.bands[+d.b] = Number(t.value);
    else if (d.lc !== undefined) e.style.lines[+d.lc].color = t.value;
    else if (d.lw !== undefined) e.style.lines[+d.lw].size = Number(t.value);
    else if (d.v) e.hideOn = t.checked ? e.hideOn.filter((z) => z !== d.v) : [...e.hideOn, d.v];
  });
  m.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-k],[data-tab]"); if (!b) return;
    if (b.dataset.tab) { tab = b.dataset.tab; return draw(); }
    const k = b.dataset.k;
    if (k === "close") return m.remove();
    if (k === "tvdef" || k === "myreset") { const d = clone(k === "tvdef" ? IND_DEF[name] || { params: [] } : p.def[name]); e.params = d.params; e.ext = d.ext; e.style = d.style; b.closest("details").open = false; return draw(); }
    if (k === "mydef") { p.def[name] = clone({ params: e.params, ext: e.ext, style: e.style }); kcSavePrefs(); toast("Saved as your default for new charts"); b.closest("details").open = false; return; }
    if (k === "ok") { kcUpdateInd(name, { params: e.params, ext: e.ext, style: e.style, hideOn: e.hideOn }); m.remove(); }
  });
}
function fibWindow(id) {
  const ov = kc.chart?.getOverlayById(id); if (!ov) return;
  const p = prefs(); let f = clone(ov.extendData || p.fib);
  const m = kcModal(`<div class="kwh"><b>Fib retracement</b><button class="x" data-k="close">✕</button></div><div class="kwb fib"></div>
    <div class="kwf"><details class="kwdd up"><summary>Template</summary><div class="tl"></div></details><span class="sp"></span><button class="c" data-k="close">Cancel</button><button class="ok" data-k="ok">Ok</button></div>`, "kwfib");
  const draw = () => {
    m.querySelector(".kwb").innerHTML = `<label class="f"><span class="ck"><input type="checkbox" data-t="on" ${f.trend.on ? "checked" : ""}>Trend line</span><span><input type="color" data-t="color" value="${f.trend.color}"><select data-t="dash"><option value="1" ${f.trend.dash ? "selected" : ""}>dashed</option><option value="0" ${f.trend.dash ? "" : "selected"}>solid</option></select></span></label>
      <div class="lv">${f.levels.map(([v, c, on], i) => `<span class="${on ? "" : "off"}"><input type="checkbox" data-l="${i}" ${on ? "checked" : ""}><input type="number" step="0.001" data-lv="${i}" value="${v}"><input type="color" data-lc="${i}" value="${c}"></span>`).join("")}</div>
      <button class="add" data-k="addlv">+ Add level</button>
      <label class="f"><span class="ck"><input type="checkbox" data-o="prices" ${f.prices ? "checked" : ""}>Prices</span></label><label class="f"><span class="ck"><input type="checkbox" data-o="pct" ${f.pct ? "checked" : ""}>Levels as percents</span></label><label class="f"><span class="ck"><input type="checkbox" data-o="axis" ${f.axis === 0 || f.axis === false ? "" : "checked"}>Price labels on the price scale</span></label>
      <label class="f">Font size<select data-o="size">${[10, 11, 12, 14, 16].map((n) => `<option ${n === f.size ? "selected" : ""}>${n}</option>`).join("")}</select></label>`;
    m.querySelector(".tl").innerHTML = `<button data-k="saveT">Save as…</button><button data-k="defT">Apply defaults</button>${Object.keys(p.fibT).map((n) => `<button data-tn="${esc(n)}">${esc(n)}</button>`).join("")}<button data-k="mydefF">Use these for new Fibonacci</button>`;
  };
  draw();
  m.addEventListener("change", (ev) => {
    const t = ev.target, d = t.dataset;
    if (d.t) f.trend[d.t] = d.t === "on" ? (t.checked ? 1 : 0) : d.t === "dash" ? Number(t.value) : t.value;
    else if (d.l !== undefined) { f.levels[+d.l][2] = t.checked ? 1 : 0; t.parentNode.classList.toggle("off", !t.checked); }
    else if (d.lv !== undefined) f.levels[+d.lv][0] = Number(t.value);
    else if (d.lc !== undefined) f.levels[+d.lc][1] = t.value;
    else if (d.o) f[d.o] = d.o === "size" ? Number(t.value) : t.checked ? 1 : 0;
  });
  m.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-k],[data-tn]"); if (!b) return;
    if (b.dataset.tn) { f = clone(p.fibT[b.dataset.tn]); b.closest("details").open = false; return draw(); }
    const k = b.dataset.k;
    if (k === "close") return m.remove();
    if (k === "addlv") { f.levels.push([1.382, "#F23645", 1]); return draw(); }
    if (k === "defT") { f = clone(FIB_FOR_WAVE); b.closest("details").open = false; return draw(); }
    if (k === "saveT") { const n = (prompt("Template name", "My Fibonacci") || "").trim().slice(0, 30); if (n) { p.fibT[n] = clone(f); kcSavePrefs(); draw(); } return; }
    if (k === "mydefF") { p.fib = clone(f); kcSavePrefs(); toast("New Fibonacci drawings will use these levels"); b.closest("details").open = false; return; }
    if (k === "ok") { kc.chart.overrideOverlay({ id, extendData: clone(f) }); const o = kc.chart.getOverlayById(id); if (o) { kc.ov.set(id, kcPlain(o)); kcSave(); } m.remove(); }
  });
}
function kcMenu(e) {
  if (!kc.chart) return;
  e.preventDefault();
  const r = kc.box.getBoundingClientRect(), y = e.clientY - r.top;
  const v = kc.chart.convertFromPixel([{ x: e.clientX - r.left, y }], { paneId: "candle_pane" })?.[0]?.value, px = Number.isFinite(v) ? v : kc.chart.getDataList().at(-1)?.close;
  document.querySelector(".kcctx")?.remove();
  const m = document.createElement("div"); m.className = "kcctx"; m.style.left = Math.min(e.clientX, innerWidth - 250) + "px"; m.style.top = Math.min(e.clientY, innerHeight - 330) + "px";
  const pr = px ? fmtPx(px) : "";
  m.innerHTML = `<button data-m="reset">Reset chart view<span>Alt+R</span></button>${pr ? `<button data-m="alert">Add price alert at ${pr}</button>` : ""}<hr>
    ${pr ? `<button data-m="hline">Horizontal line at ${pr}<span>Alt+H</span></button>` : ""}<button data-m="trend">Trend line<span>Alt+T</span></button><button data-m="fib">Fibonacci retracement<span>Alt+F</span></button><hr>
    <button data-m="ind">Indicators…<span>Alt+I</span></button><button data-m="clr">Remove all drawings</button><button data-m="clri">Remove all indicators</button>`;
  document.body.appendChild(m);
  const close = () => { m.remove(); document.removeEventListener("mousedown", out, true); };
  const out = (ev) => { if (!m.contains(ev.target)) close(); };
  setTimeout(() => document.addEventListener("mousedown", out, true), 0);
  m.addEventListener("click", async (ev) => {
    const k = ev.target.closest("[data-m]")?.dataset.m; if (!k) return;
    close(); kcAction(k, px);
  });
}
async function kcAction(k, px) {
  const c = kc.chart; if (!c) return;
  px ??= kc.lastPrice ?? c.getDataList().at(-1)?.close;
  if (k === "reset") { kcResetView(); render(false); }
  else if (k === "hline" && px) kcAddDone({ name: "horizontalStraightLine", groupId: "drawing_tools", points: [{ value: px, timestamp: c.getDataList().at(-1)?.timestamp }] });
  else if (k === "trend") c.createOverlay({ name: "segment", groupId: "drawing_tools" });
  else if (k === "fib") c.createOverlay({ name: "fibonacciLine", groupId: "drawing_tools" });
  else if (k === "ind") indListWindow();
  else if (k === "clr") c.removeOverlay({ groupId: "drawing_tools" });
  else if (k === "clri") [...kc.active].forEach((a) => kcRemoveInd(a.name));
  else if (k === "alert" && px) {
    const last = c.getDataList().at(-1)?.close ?? px, kind = px >= last ? "above" : "below", t = kc.sym;
    const { error } = await sb.from("price_alerts").insert({ user_id: state.user.id, ticker: t, kind, value: +Number(px).toFixed(4) });
    toast(error ? `Alert not saved: ${esc(error.message)}` : `Alert set: ${esc(t)} ${kind} ${fmtPx(px)} (Telegram)`);
  }
}
function kcToolbar(el) {   // top bar, bottom bar and chart-type menu clicks
  if (el.dataset.kcp !== undefined) return kcSetPeriod(Number(el.dataset.kcp));
  if (el.dataset.kcr) return kcRangeClick(el.dataset.kcr);
  if (el.dataset.kct) { kc.ctype = el.dataset.kct; el.closest("details")?.removeAttribute("open"); kcStyle(); return render(false); }
  const a = el.dataset.kcact;
  if (a === "ind") return indListWindow();
  if (a === "undo" || a === "redo") return kcUndo(a === "redo");
  if (a === "auto") { kcAutoY(); return render(false); }
  if (a === "alertw") return kcAlertWindow();
  if (a === "tree") return ktTreeToggle();
  if (a === "cmp") return kcCompareWindow();
  if (a === "mkn" || a === "mke") return mkToggle(a === "mkn" ? "n" : "e");
  if (a === "pct" || a === "log") { kc[a] = !kc[a]; if (a === "pct" && kc.pct) kc.log = false; if (a === "log" && kc.log) kc.pct = false; kcStyle(); return render(false); }
  if (a === "shot" && kc.chart) { const url = kc.chart.getConvertPictureUrl(true, "png", isDark() ? "#18181b" : "#ffffff"); const l = document.createElement("a"); l.href = url; l.download = `${kc.sym || "chart"}-${isoDay(new Date())}.png`; l.click(); return; }
  if (a === "full") kcFull();
}
// Shortcuts on a stock chart (not while typing): Alt+T trend line, Alt+F Fibonacci, Alt+H horizontal line, Alt+I indicators, Alt+R reset,
// Delete removes the selected drawing, Ctrl+Z undo, Ctrl+Y (or Ctrl+Shift+Z) redo
document.addEventListener("keydown", (e) => {
  if (!kc.chart || !kcLive() || ((location.hash || "").startsWith("#/charts/") && (chOf().pane || "chart") !== "chart") || e.target.closest?.("input, textarea, select, [contenteditable]") || document.querySelector(".kcmodal")) return;
  const k = e.key.toLowerCase();
  if (e.altKey && ["t", "f", "h", "j", "v"].includes(k)) { e.preventDefault(); ktStart({ t: "segment", f: "fibonacciLine", h: "horizontalStraightLine", j: "horizontalRayLine", v: "verticalStraightLine" }[k]); }
  else if (e.altKey && ["i", "r", "a"].includes(k)) { e.preventDefault(); if (k === "a") kcAlertWindow(); else kcAction({ i: "ind", r: "reset" }[k]); }
  else if (e.key === "Escape" && (kc.tool || kc.measureArm)) { e.preventDefault(); ktStart("cursor"); }
  else if (kc.hover && !e.altKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {   // only while the mouse is on the chart
    e.preventDefault();
    if (e.key === "ArrowUp") kcZoomBy(1.15); else if (e.key === "ArrowDown") kcZoomBy(1 / 1.15); else kcScrollBars((e.key === "ArrowLeft" ? 1 : -1) * (e.ctrlKey ? 20 : 1));
  }
  else if ((e.key === "Delete" || e.key === "Backspace") && kc.sel) { e.preventDefault(); kc.chart.removeOverlay(kc.sel); }
  else if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); kcUndo(e.shiftKey); }
  else if ((e.ctrlKey || e.metaKey) && k === "y") { e.preventDefault(); kcUndo(true); }
});
// Full screen (round 46): the whole page goes full screen and the chart box is pinned over it (body.kcfull).
// Page redraws, settings windows, menus and the object tree then all keep working (before, any redraw or window left full screen).
function kcFull() {
  if ((chOf().pane || "chart") !== "chart") { chOf().pane = "chart"; render(false); }
  if (document.body.classList.contains("kcfull")) { document.body.classList.remove("kcfull"); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
  else { document.body.classList.add("kcfull"); document.documentElement.requestFullscreen?.().catch(() => {}); }   // if the browser says no, the chart still fills the window
  setTimeout(() => kc.chart?.resize(), 250);
}
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) document.body.classList.remove("kcfull"); setTimeout(() => kc.chart?.resize(), 200); });
addEventListener("hashchange", () => { if (!kcLive() && document.body.classList.contains("kcfull")) { document.body.classList.remove("kcfull"); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("kcfull") && !document.fullscreenElement && !document.querySelector(".kcmodal") && !kc.tool) { document.body.classList.remove("kcfull"); setTimeout(() => kc.chart?.resize(), 200); } });

