// Investment Center Pro: the terminal shell (design rounds 52-53, plan in FEATURES.md "Investment Center Pro").
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// Pro is a switch (PRO button, top right). While it is on, every page gets the Pro top bar + the Pro colours,
// and #/pro/... shows the Pro modules. Saved on this device: ic_pro (on/off), ic_pro_mode (auto/light/dark),
// ic_pro_dark (amber/phosphor/arctic), ic_pro_light (paper), ic_pro_tk (the active ticker every panel follows).
// Desktop only (a dense terminal doesn't fit a phone): on a phone Pro is simply off.
const PRO_MODS = [["home", "HOME"], ["macro", "MACRO"], ["fx", "FX"], ["rot", "ROT"], ["ideas", "IDEAS"], ["val", "VAL"], ["thesis", "THESIS"], ["risk", "RISK"], ["gp", "CHART"], ["crypto", "CRYPTO"], ["smart", "SMART"]];
// BOT mode (round 55): its own pages, purple accent, switch PRO | BOT in the top bar. Lives under #/pro/bot* so the
// Pro data, refresh and settings all keep working. PAPER ONLY: nothing in BOT mode can place a real order.
const BOT_MODS = [["bot", "SIGNALS"], ["bots", "STRATEGIES"], ["botp", "PAPER ACCOUNT"], ["botj", "JOURNAL"]];
const proIsBot = (mod = proMod()) => /^bot/.test(mod || "");
const PRO_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="];   // Alt + the number row, left to right
const PRO_DARK = [["amber", "Amber", "classic, default"], ["phosphor", "Phosphor", "green screen"], ["arctic", "Arctic", "navy + ice"]];
const proStore = (k, d) => safe(() => localStorage.getItem(k), null) || d;
const proSet = (k, v) => safe(() => localStorage.setItem(k, v));
const proPhone = () => safe(() => matchMedia("(max-width:760px)").matches, false);
const proOn = () => proStore("ic_pro", "0") === "1" && !proPhone();
const proMode = () => proStore("ic_pro_mode", "dark");   // Amber (dark) is the main look, so dark is the default
const proIsLight = () => { const m = proMode(); return m === "light" || (m === "auto" && !deviceDark()); };
const proScheme = () => (proIsLight() ? proStore("ic_pro_light", "paper") : proStore("ic_pro_dark", "amber"));
function applyPro() {
  const r = document.documentElement;
  if (proOn()) { r.dataset.pro = "1"; r.dataset.psc = proScheme(); } else { delete r.dataset.pro; delete r.dataset.psc; }
}
applyPro();
// Opened in Pro last time: start in Pro again
if (proOn() && (!location.hash || location.hash === "#/")) history.replaceState(null, "", "#/pro");

const proTk = () => (proStore("ic_pro_tk", "") || (state.settings?.watchlist || [])[0] || "NVDA").toUpperCase();
const proSetTk = (t) => proSet("ic_pro_tk", String(t || "").toUpperCase().replace(/[^A-Z0-9.^=\-]/g, "").slice(0, 20));
const proMod = () => { const h = location.hash || ""; if (h.startsWith("#/charts/")) return "gp"; const m = h.match(/^#\/pro\/?([a-z]*)/); return m ? m[1] || "home" : ""; };
const proHref = (mod, tk) => (mod === "gp" ? `#/charts/${encodeURIComponent(tk || proTk())}` : `#/pro${mod === "home" ? "" : "/" + mod}${tk ? "/" + encodeURIComponent(tk) : ""}`);
const proRouteTk = () => { const m = (location.hash || "").match(/^#\/pro\/[a-z]+\/([^/]+)/); return m ? decodeURIComponent(m[1]).toUpperCase() : null; };

// ----- formatting -----
const pN = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(+v) ? "—" : (+v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const pPct = (v, d = 2, sign = true) => (v === null || v === undefined || !Number.isFinite(+v) ? "—" : `${sign && v > 0 ? "+" : ""}${(+v).toFixed(d)}%`);
const pUD = (v, txt) => `<span class="${v > 0 ? "up" : v < 0 ? "dn" : ""}">${txt}</span>`;
const pBig = (v) => { if (v === null || v === undefined || !Number.isFinite(+v)) return "—"; const a = Math.abs(v), s = v < 0 ? "−" : "";
  return a >= 1e12 ? `${s}${(a / 1e12).toFixed(2)}T` : a >= 1e9 ? `${s}${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${s}${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${s}${(a / 1e3).toFixed(1)}K` : `${s}${a.toFixed(0)}`; };
const pAgo = (iso) => { if (!iso) return ""; const m = (Date.now() - new Date(iso)) / 6e4; return m < 90 ? `${Math.max(1, Math.round(m))} MIN AGO` : m < 2880 ? `${Math.round(m / 60)} H AGO` : `${Math.round(m / 1440)} D AGO`; };

// ----- the frame -----
// src = "where the numbers come from · how fresh" (shown on every panel, as agreed in the plan)
function proPanel(title, src, body, cls = "", sig = "") {
  return `<section class="ppn ${cls}"${sig ? ` data-sig="${esc(sig)}"` : ""}><div class="pph"><b>${title}</b><span class="psrc">${src || ""}</span></div><div class="ppb">${body}</div></section>`;
}
// Answer-first card (round 55, F10 CRYPTO + F11 SMART): a traffic light, a short verdict, one plain sentence.
// light: g green (fine / supportive) · a amber (watch) · r red (warning) · n grey (no signal)
const proCard = (light, k, v, s) => `<div class="pcard"><div class="k"><i class="plt ${light}"></i>${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
// The full tables behind the cards. Open / closed is remembered per page.
const proDetails = (key, label, html) => `<details class="pdet" data-pdet="${key}"${proStore("ic_pro_det_" + key, "0") === "1" ? " open" : ""}><summary><b>${proStore("ic_pro_det_" + key, "0") === "1" ? "▾ HIDE" : "▸ SHOW"} DETAILS</b> <span class="pd">${label}</span></summary>${html}</details>`;
document.addEventListener("toggle", (e) => { const d = e.target; if (!d.matches?.("details[data-pdet]")) return; proSet("ic_pro_det_" + d.dataset.pdet, d.open ? "1" : "0"); const b = d.querySelector("summary b"); if (b) b.textContent = `${d.open ? "▾ HIDE" : "▸ SHOW"} DETAILS`; }, true);
// "LEARN" box (round 55): a short lesson for a finance idea you haven't studied yet. Closed until you open it.
const proLearn = (course, title, html) => `<details class="plearn"><summary><b>LEARN</b> ${esc(title)}${course ? ` <span class="pd">· ${esc(course)}</span>` : ""}</summary><div class="plearnb">${html}</div></details>`;
const proSoon = (txt, phase) => `<div class="psoon">${txt}${phase ? `<br><b>${phase}</b>` : ""}</div>`;
const proWait = (txt = "LOADING…") => `<div class="psoon"><span class="pblink">${txt}</span></div>`;
function proTop() {
  const now = new Date().toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).toUpperCase().replace(/,/g, "");
  const mod = proMod(), bot = proIsBot(mod);
  const nav = bot ? `<nav class="pfk">${BOT_MODS.map(([k, l], i) => `<a class="${k === mod ? "on" : ""}" href="#/pro/${k}" title="Alt+${i + 1}"><em>B${i + 1}</em>${l}</a>`).join("")}<span class="sp"></span><span class="ptag pbotpaper">PAPER ONLY · NO REAL ORDERS</span><span class="pkhint">ALT+1…4 · / COMMAND · ESC</span></nav>`
    : `<nav class="pfk">${PRO_MODS.map(([k, l], i) => `<a class="${k === mod ? "on" : ""}" href="${proHref(k)}" title="Alt+${PRO_KEYS[i]}"><em>F${i + 1}</em>${l}</a>`).join("")}<span class="sp"></span><span class="pkhint">ALT+1…− · / COMMAND · ESC</span></nav>${mod === "gp" ? proOverlayBar() : ""}`;
  return `<header class="ptop"><a class="plogo" href="${bot ? "#/pro/bot" : "#/pro"}">INV·CTR <span>${bot ? "BOT" : "PRO"}</span></a>
    <form class="pcmd" id="pcmd" autocomplete="off"><b>&gt;</b><input id="pcmdq" placeholder="type a ticker + function, e.g.  NVDA VAL · RISK · MACRO · TSM MAP   ( / )" maxlength="40" spellcheck="false"><div class="pcres" id="pcres" hidden></div></form>
    <span class="ptk" title="The active ticker: panels follow it. Type another ticker to change it.">${esc(proTk())}</span>
    <span class="pclock">${now} BKK</span>
    <span class="pmode" title="Switch mode"><a class="${bot ? "" : "on"}" href="${proStore("ic_pro_lastpro", "#/pro")}">PRO</a><a class="${bot ? "on" : ""}" href="${proStore("ic_pro_lastbot", "#/pro/bot")}">BOT</a></span>
    <button class="pgear" data-pro-set="1" title="Pro settings">⚙</button>
    <button class="probtn on" data-pro-toggle="1" title="Leave Pro (back to the normal look)"><i></i>PRO</button></header>
    ${nav}`;
}
// CHART in Pro: macro lines on the price chart in one click (addition 4). Uses the chart's own Compare feature (% lines).
const PRO_OVL = [["^TNX", "US 10Y"], ["DX-Y.NYB", "DOLLAR"], ["CL=F", "OIL"], ["^VIX", "VIX"], ["GC=F", "GOLD"], ["BTC-USD", "BTC"], ["SPY", "S&P 500"]];
function proOverlayBar() {
  const on = new Set((typeof cmpList === "function" ? cmpList() : []).map((x) => x.y));
  return `<div class="pmo"><b>MACRO ON CHART</b>${PRO_OVL.map(([y, l]) => `<button class="${on.has(y) ? "on" : ""}" data-povl="${y}" data-povln="${l}">${l}</button>`).join("")}<span class="pd">% change from the first candle on screen (Compare). CPI and other monthly data aren't daily prices, so they're on MACRO instead.</span></div>`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-povl]"); if (!b || typeof cmpList !== "function") return;
  const cl = cmpList(), i = cl.findIndex((x) => x.y === b.dataset.povl);
  if (i >= 0) cl.splice(i, 1);
  else { if (cl.length >= CMP_COL.length) { toast(`Up to ${CMP_COL.length} lines: remove one first.`); return; } const used = new Set(cl.map((x) => x.color)); cl.push({ y: b.dataset.povl, t: b.dataset.povln, color: CMP_COL.find((c) => !used.has(c)) || CMP_COL[0] }); }
  cmpSave(); kcCmpApply(); render(false);
});
// Normal-mode PRO button (sits in the normal header, next to Settings)
const proBtn = () => (proPhone() ? "" : `<button class="probtn" data-pro-toggle="1" title="Investment Center Pro: the terminal">Pro <span class="k"></span></button>`);

function viewPro() {
  const mod = proMod(), tk = proRouteTk();
  if (tk && tk !== proTk()) proSetTk(tk);
  const bot = proIsBot(mod);
  document.documentElement.dataset.pbot = bot ? "1" : "";
  proSet(bot ? "ic_pro_lastbot" : "ic_pro_lastpro", location.hash || (bot ? "#/pro/bot" : "#/pro"));
  const body = (window.PRO_VIEWS && PRO_VIEWS[mod]) ? PRO_VIEWS[mod]() : proSoon("Unknown module.", "");
  return `${proTop()}<div class="wrap pwrap pm-${mod}">${body}</div><div class="pfoot"><span><b>${bot ? "ALT+1…4" : "ALT+1…−"}</b> ${bot ? "pages" : "modules"}</span><span><b>/</b> command line</span><span>panels follow <b>${esc(proTk())}</b></span><span class="sp"></span><span>${bot ? "Paper trading only · pretend money · signals are rule outputs, not investment advice" : "Sources + freshness on every panel · numbers may be delayed · not investment advice"}</span></div>`;
}
window.PRO_VIEWS = window.PRO_VIEWS || {};

// ----- data: the Pro robot jobs save into table pro_data (supabase/017_pro.sql). Before that SQL is run, the
// local preview reads data/pro/<key>.json (written by `python robot/pro_data.py --local`, never committed).
const proCache = {}, proBusy = {};
async function proFetch(key) {
  let d = null;
  const { data, error } = await sb.from("pro_data").select("data,updated_at").eq("key", key).maybeSingle();
  if (!error && data) d = { ...data.data, _at: data.updated_at };
  else { try { const r = await fetch(`data/pro/${key}.json?${Date.now()}`); if (r.ok) { d = await r.json(); d._local = 1; } } catch { /* none */ } }
  proCache[key] = { d, at: Date.now() };
  return d;
}
function proGet(key, maxAge = 15 * 60e3) {
  const c = proCache[key];
  if ((!c || Date.now() - c.at > maxAge) && !proBusy[key]) {
    proBusy[key] = 1;
    proFetch(key).catch(() => { proCache[key] = { d: null, at: Date.now() }; }).finally(() => { proBusy[key] = 0; proRefresh(); });
  }
  return c ? c.d : undefined;   // undefined = still loading, null = no data
}
let proRT = 0;
const proRefresh = () => { clearTimeout(proRT); proRT = setTimeout(() => {
  if (!proOn() || !(location.hash || "").startsWith("#/pro")) return;
  if (document.activeElement?.matches?.("input, textarea, select, [contenteditable]") || th?.drag || th?.pan) { proRefresh(); return; }
  if (kc?.box?.isConnected && kc.box.matches(":hover")) { proRefresh(); return; }   // FX chart: never redraw under your mouse (mid-drawing)   // never redraw under your typing / dragging: try again shortly
  render("soft"); }, 60); };
// Daily candles (same server cache as the Charts page: get_candles)
const proCand = {};
function proCandles(y, rng = "1y", itv = "1d") {
  const k = `${y}|${rng}|${itv}`, c = proCand[k];
  if (!c || (!c.loading && Date.now() - c.at > 15 * 60e3)) {
    proCand[k] = { loading: true, data: c?.data || null, at: 0 };
    sb.rpc("get_candles", { sym: y, rng, itv }).then(({ data }) => { proCand[k] = { data: data || null, at: Date.now() }; proRefresh(); });
  }
  return proCand[k]?.data || null;
}
// {date: close} for one candle set (dates in UTC days)
const proCloseMap = (d) => { const m = {}; (d?.t || []).forEach((ts, i) => { const c = d.c?.[i]; if (typeof c === "number") m[new Date(ts * 1000).toISOString().slice(0, 10)] = c; }); return m; };
// Daily returns on the dates every series shares
function proReturns(maps) {
  const days = Object.keys(maps[0] || {}).filter((d) => maps.every((m) => m[d] !== undefined)).sort();
  return { days, r: maps.map((m) => days.slice(1).map((d, i) => m[d] / m[days[i]] - 1)) };
}
const pMean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const pSd = (a) => { const m = pMean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const pCov = (a, b) => { const ma = pMean(a), mb = pMean(b); let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb); return s / Math.max(1, a.length - 1); };
const pCorr = (a, b) => pCov(a, b) / ((pSd(a) * pSd(b)) || 1);
const pBeta = (a, m) => pCov(a, m) / ((pSd(m) ** 2) || 1);
const pMaxDD = (closes) => { let pk = -Infinity, dd = 0; closes.forEach((c) => { pk = Math.max(pk, c); dd = Math.min(dd, c / pk - 1); }); return dd * 100; };

// Company stats (stock_stats, saved daily by the robot) for symbols the Charts page hasn't loaded yet
const proStatAsked = new Set();
function proStats(ys) {
  const ch = chOf(), need = ys.filter((y) => !ch.stats[y] && !proStatAsked.has(y));
  if (need.length) { need.forEach((y) => proStatAsked.add(y)); sb.from("stock_stats").select("symbol,data,updated_at").in("symbol", need).then(({ data }) => { (data || []).forEach((r) => { ch.stats[r.symbol] = r; }); proRefresh(); }); }
  return Object.fromEntries(ys.map((y) => [y, statsOf(y)]));
}
// Small inline line chart (sparkline) for panels
function proSpark(vals, w = 120, h = 26, cls = "") {
  const v = (vals || []).filter(Number.isFinite); if (v.length < 2) return "";
  const lo = Math.min(...v), hi = Math.max(...v), sx = w / (v.length - 1), sy = (hi - lo) || 1;
  return `<svg class="pspark ${cls}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none"><polyline points="${v.map((x, i) => `${(i * sx).toFixed(1)},${(h - 2 - ((x - lo) / sy) * (h - 4)).toFixed(1)}`).join(" ")}"/></svg>`;
}

// ----- command line -----
const PRO_FN = { HOME: "home", MACRO: "macro", ECO: "macro", REGIME: "macro", SURP: "macro", WCB: "macro", CB: "macro", CURVE: "macro", LIQ: "macro",
  ROT: "rot", SECT: "rot", VAL: "val", DCF: "val", FA: "val", RV: "val", RF: "val", EE: "val", THESIS: "thesis", MAP: "thesis",
  RISK: "risk", STRESS: "risk", PORT: "risk", GP: "gp", CHART: "gp", CRYPTO: "crypto", FUND: "crypto", SMART: "smart", SI: "smart", OPT: "smart", INS: "smart", DARK: "smart",
  FX: "fx", FOREX: "fx", FXC: "fx", WCRS: "fx", IDEAS: "ideas", EQS: "ideas", SCREEN: "ideas", BOT: "bot", SIGNAL: "bot", SIGNALS: "bot", PAPER: "botp", BT: "bots", STRAT: "bots", JOURNAL: "botj", ASSET: "rot" };
const PRO_TKMODS = new Set(["val", "thesis", "gp", "smart"]);
const PRO_FN_HELP = [["MACRO", "regime, surprise index, curve, liquidity, central banks"], ["FX", "currencies, carry, what moves the baht"], ["ROT", "sector + cross-asset rotation"], ["IDEAS", "stocks ranked by your rules + data"], ["VAL", "DCF, red flags, estimates, peers"], ["THESIS", "bull/base/bear + map"],
  ["RISK", "portfolio risk + stress test"], ["GP", "chart (same chart as Charts)"], ["CRYPTO", "funding, open interest, on-chain"], ["SMART", "short volume, options, dark pools"], ["BOT", "BOT mode: buy / short signals"], ["BT", "BOT mode: strategy + backtest"], ["PAPER", "BOT mode: paper account (24/7)"], ["JOURNAL", "BOT mode: every trade + signal results"], ["EXIT", "leave Pro"]];
function proRun(q) {
  const w = String(q || "").toUpperCase().trim().split(/\s+/).filter(Boolean);
  if (!w.length) return;
  if (w[0] === "EXIT" || w[0] === "QUIT") return proToggle(false);
  let fn = null, tk = null;
  for (const x of w) { if (PRO_FN[x] && !fn) fn = PRO_FN[x]; else if (!tk && /^[A-Z0-9.^=\-]{1,20}$/.test(x)) tk = x; }
  if (tk) proSetTk(tk);
  if (tk && fn === "smart") proSet("ic_pro_smode", "one");   // "AAPL SMART" = that stock, not the whole market
  const mod = fn || (PRO_TKMODS.has(proMod()) ? proMod() : "val");
  location.hash = proHref(mod, PRO_TKMODS.has(mod) && mod !== "gp" ? proTk() : null);
  if (!fn && !PRO_TKMODS.has(proMod())) render(false);
}
function proSuggest(q) {
  const box = document.getElementById("pcres"); if (!box) return;
  const s = String(q || "").toUpperCase().trim();
  if (!s) { box.hidden = true; return; }
  const last = s.split(/\s+/).pop();
  const fns = PRO_FN_HELP.filter(([f]) => f.startsWith(last)).map(([f, h]) => `<button type="button" data-pcpick="${esc(s.replace(/\S+$/, f))}"><b>${f}</b><span>${h}</span></button>`);
  const tks = [...new Set([...(state.settings?.watchlist || []), ...Object.keys(pfOwnedSafe())])].filter((t) => t.startsWith(last)).slice(0, 6)
    .map((t) => `<button type="button" data-pcpick="${esc(s.replace(/\S+$/, t))}"><b>${esc(t)}</b><span>set active ticker</span></button>`);
  box.innerHTML = [...tks, ...fns].join("") || `<div class="pcnone">Enter: open ${esc(s)}</div>`;
  box.hidden = false;
}
const pfOwnedSafe = () => safe(() => pfOwned(), {}) || {};

function proToggle(on) {
  if (on) { proSet("ic_pro_back", location.hash || "#/"); proSet("ic_pro", "1"); applyPro(); if ((location.hash || "").startsWith("#/pro")) render(); else location.hash = "#/pro"; }
  else {
    proSet("ic_pro", "0"); applyPro();
    const back = proStore("ic_pro_back", "#/");
    if ((location.hash || "").startsWith("#/pro")) location.hash = back.startsWith("#/pro") ? "#/" : back; else render();
  }
  if (typeof kcMount === "function" && kc?.sym && kcLive()) setTimeout(() => kcMount(kc.sym), 0);
}

// ----- Pro settings window -----
function proSettings() {
  document.querySelector(".pset")?.remove();
  const m = proMode(), dk = proStore("ic_pro_dark", "amber");
  const sw = (k, n, s, cur, attr) => `<button class="psw ${k === cur ? "on" : ""}" ${attr}="${k}"><i class="pv" data-pv="${k}"><b>INV·CTR</b><br>NVDA <u>−2.91%</u><br><em>F1</em></i><span>${n}<small>${s}</small></span></button>`;
  const el = document.createElement("div");
  el.className = "pset"; el.innerHTML = `<div class="psetw" role="dialog" aria-label="Pro settings">
    <div class="pph"><b>PRO SETTINGS</b><button class="px" data-pro-close="1" aria-label="Close">×</button></div>
    <div class="psetb"><div><h4>Pro appearance</h4><p>Separate from your normal theme. Changing this never changes My News, World Brief etc.</p>
      <div class="pseg">${[["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]].map(([k, l]) => `<button class="${k === m ? "on" : ""}" data-pro-mode="${k}">${l}</button>`).join("")}</div>
      <p class="pnote">Auto follows your device's light / dark setting.</p>
      <h4>Dark scheme</h4><div class="pswrow">${PRO_DARK.map(([k, n, s]) => sw(k, n, s, dk, "data-pro-dark")).join("")}</div>
      <h4>Light scheme</h4><div class="pswrow">${sw("paper", "Paper", "daylight terminal", "paper", "data-pro-light")}</div></div>
    <div><h4>Always off in Pro</h4><p class="poff"><s>Mascots</s> · <s>Seasons</s> · <s>Opening intros</s> · <s>Story photos</s> · <s>Playful motion</s> · <s>Normal light / dark styles</s></p>
      <h4>Shared with normal mode</h4><p>Watchlist · Topics · Price alerts · Portfolio trades · Chart drawings · Telegram alerts</p>
      <h4>Remembered</h4><p>Pro on / off and the Pro scheme are saved on this device.</p>
      <button class="pbtn" data-pro-toggle="1">Leave Pro</button></div></div></div>`;
  document.body.appendChild(el);
}

// ----- clicks + keys (own listeners, like portfolio.js) -----
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-pro-toggle],[data-pro-set],[data-pro-close],[data-pro-mode],[data-pro-dark],[data-pro-light],[data-pcpick],.pset");
  if (!t) { if (!e.target.closest("#pcmd")) { const b = document.getElementById("pcres"); if (b) b.hidden = true; } return; }
  if (t.classList.contains("pset")) { if (e.target === t) t.remove(); return; }
  e.preventDefault();
  if (t.dataset.proToggle) { document.querySelector(".pset")?.remove(); return proToggle(!proOn()); }
  if (t.dataset.proSet) return proSettings();
  if (t.dataset.proClose) return document.querySelector(".pset")?.remove();
  if (t.dataset.pcpick) { const i = document.getElementById("pcmdq"); if (i) { i.value = t.dataset.pcpick + " "; i.focus(); proSuggest(i.value); } return; }
  if (t.dataset.proMode) proSet("ic_pro_mode", t.dataset.proMode);
  if (t.dataset.proDark) { proSet("ic_pro_dark", t.dataset.proDark); if (proMode() === "light") proSet("ic_pro_mode", "dark"); }
  if (t.dataset.proLight) proSet("ic_pro_light", t.dataset.proLight);
  applyPro(); proSettings();
  if (typeof kcMount === "function" && kc?.sym && kcLive()) kcMount(kc.sym);
});
document.addEventListener("submit", (e) => {
  if (e.target.id !== "pcmd") return;
  e.preventDefault();
  const i = document.getElementById("pcmdq"); const v = i.value; i.value = ""; i.blur(); proRun(v);
});
document.addEventListener("input", (e) => { if (e.target.id === "pcmdq") proSuggest(e.target.value); });
document.addEventListener("keydown", (e) => {
  if (!proOn()) return;
  const typing = e.target.closest?.("input, textarea, select, [contenteditable]");
  if (e.altKey && !e.ctrlKey && PRO_KEYS.includes(e.key)) { e.preventDefault();
    if (proIsBot()) { const b = BOT_MODS[PRO_KEYS.indexOf(e.key)]; if (b) location.hash = "#/pro/" + b[0]; return; }
    const m = PRO_MODS[PRO_KEYS.indexOf(e.key)]; if (m) location.hash = proHref(m[0], m[0] === "gp" ? proTk() : null); return; }
  if (e.key === "Escape") { document.querySelector(".pset")?.remove(); const b = document.getElementById("pcres"); if (b) b.hidden = true; if (e.target.id === "pcmdq") e.target.blur(); return; }
  if (e.key === "/" && !typing && !(location.hash || "").startsWith("#/charts/")) { const i = document.getElementById("pcmdq"); if (i) { e.preventDefault(); i.focus(); } }
});
addEventListener("resize", () => { const was = document.documentElement.dataset.pro === "1"; applyPro(); if (was !== proOn() && state.user) render(false); });
safe(() => matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyPro));
