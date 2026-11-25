// Charts home (#/charts) + sidebar + stocks by market.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// ---------- Charts page (design rounds 36-42; style A = our site's look) ----------
// Home (#/charts): TradingView "Markets" style: categories with symbol chips + one big chart + top movers, big-stock heat map.
// Stock page (#/charts/NVDA): the chart fills the screen; Key facts, Financials, Technicals, Forecasts, Seasonals, News, Dates are tabs.
// Chart = KLineChart Pro 0.1.1 (open source) drawing our Yahoo candles (supabase/013_charts.sql). Its own top bar is hidden: we draw a
// TradingView-style bar, bottom range bar, indicators window + settings windows (Inputs / Style / Visibility), right-click menu, shortcuts.
// The right sidebar (watchlist + important dates) folds into an icon strip; the choice is kept on this device (ic_chside).
const CH_NAMES = { "^GSPC": "S&P 500", "^NDX": "Nasdaq 100", "^DJI": "Dow Jones", "^RUT": "Russell 2000", "^SET.BK": "SET", "^SET50.BK": "SET50", "THB=X": "USD/THB",
  "^N225": "Nikkei 225", "^HSI": "Hang Seng", "000001.SS": "Shanghai", "^KS11": "KOSPI", "^GDAXI": "DAX", "^FTSE": "FTSE 100", "^FCHI": "CAC 40", "^STOXX50E": "Euro Stoxx 50",
  "GC=F": "Gold", "CL=F": "Oil (WTI)", "SI=F": "Silver", "HG=F": "Copper", "NG=F": "Natural gas", "BTC-USD": "Bitcoin", "ETH-USD": "Ethereum", "SOL-USD": "Solana",
  "BNB-USD": "BNB", "XRP-USD": "XRP", "DX-Y.NYB": "Dollar index", "EURUSD=X": "EUR/USD", "JPY=X": "USD/JPY", "GBPUSD=X": "GBP/USD" };
const CH_BADGE = { "^GSPC": "SPX", "^NDX": "NDX", "^DJI": "DJI", "^RUT": "RUT", "^SET.BK": "SET", "^SET50.BK": "S50", "^N225": "N225", "^HSI": "HSI", "^GDAXI": "DAX", "^FTSE": "UKX",
  "000001.SS": "SSE", "^KS11": "KOS", "^FCHI": "CAC", "^STOXX50E": "SX5E", "GC=F": "Au", "CL=F": "OIL", "SI=F": "Ag", "HG=F": "Cu", "NG=F": "GAS", "BTC-USD": "₿", "ETH-USD": "Ξ",
  "SOL-USD": "SOL", "BNB-USD": "BNB", "XRP-USD": "XRP", "THB=X": "฿", "EURUSD=X": "€", "JPY=X": "¥", "GBPUSD=X": "£", "DX-Y.NYB": "DXY" };
const BIG = () => CFG.big || { US: [], Thailand: [] };
const bigAll = () => Object.values(BIG()).flat();
const CH_CATS = () => [
  ["Indices", ["^GSPC", "^NDX", "^DJI", "^RUT", "^SET.BK", "^SET50.BK", "^N225", "^HSI", "^GDAXI", "^FTSE"]],
  ["Thai stocks", BIG().Thailand || []], ["US stocks", BIG().US || []],
  ["Crypto", ["BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "XRP-USD"]],
  ["Commodities", ["GC=F", "CL=F", "SI=F", "HG=F", "NG=F"]],
  ["Forex", ["THB=X", "EURUSD=X", "JPY=X", "GBPUSD=X", "DX-Y.NYB"]]];
const CH_MKTS = Object.keys(CH_NAMES).map((y) => ["", y, CH_NAMES[y]]);   // every market symbol we price
// NYSE full-day closures (official rules; checked 2026-11-25). Thai holidays are not listed (no reliable free source yet).
const US_HOLIDAYS = [["2026-11-26", "Thanksgiving"], ["2026-12-25", "Christmas"], ["2027-01-01", "New Year's Day"], ["2027-01-18", "Martin Luther King Jr. Day"],
  ["2027-02-15", "Presidents' Day"], ["2027-03-26", "Good Friday"], ["2027-05-31", "Memorial Day"], ["2027-06-18", "Juneteenth (observed)"],
  ["2027-07-05", "Independence Day (observed)"], ["2027-09-06", "Labor Day"], ["2027-11-25", "Thanksgiving"], ["2027-12-24", "Christmas (observed)"]];
const chOf = () => state.ch || (state.ch = { sort: "move", stats: {}, draw: {}, statsAt: 0, sel: {}, rng: {}, mv: {}, cand: {}, pane: "chart", fin: "q", tf: "1D" });
const chName = (y) => CH_NAMES[y] || null;
const plainOf = (y) => cleanSym(String(y || "").toUpperCase());           // PTT.BK -> PTT (when the site knows it)
const chHref = (t) => `#/charts/${encodeURIComponent(t)}`;
const statsOf = (y) => chOf().stats[y]?.data || null;
const bigNum = (v, cur) => { if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—"; const a = Math.abs(v), s = cur === "THB" ? " ฿" : "";
  return (a >= 1e12 ? (v / 1e12).toFixed(2) + "T" : a >= 1e9 ? (v / 1e9).toFixed(1) + "B" : a >= 1e6 ? (v / 1e6).toFixed(1) + "M" : a >= 1e3 ? (v / 1e3).toFixed(1) + "K" : Number(v).toFixed(2)) + s; };
const pctN = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? "—" : `${(v * 100).toFixed(d)}%`);
const CHI = {   // thin line icons (same stroke style as the rest of the site)
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  fold: '<path d="m9 6 6 6-6 6"/>', open: '<path d="m15 6-6 6 6 6"/>', search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  cand: '<path d="M8 3v18M16 3v18"/><rect x="6" y="7" width="4" height="8"/><rect x="14" y="9" width="4" height="7"/>', fx: '<path d="m3 20 5-7 4 3 8-11"/><path d="M15 5h5v5"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>', redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  cam: '<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13" r="4"/><path d="m8 7 2-3h4l2 3"/>', full: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  grid: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="5" rx="1"/><rect x="13" y="10" width="8" height="11" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/>' };
const chI = (k, s = 18) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CHI[k]}</svg>`;
const isStockSym = (y) => /^[A-Z0-9.\-]{1,15}$/.test(y) && !/=|-USD$/.test(y);
const chLogo = (t, s = 30) => (isStockSym(yahoo(t)) ? evLogo({ sym: t }, s) : `<span class="lg txt chlg" style="--s:${s}px">${esc(CH_BADGE[t] || t.replace(/^\^/, "").slice(0, 3))}</span>`);

async function loadChartData(extra = []) {
  const ch = chOf(), w = (state.settings.watchlist || []).map(yahoo);
  const syms = [...new Set([...Object.keys(CH_NAMES), ...bigAll().map(yahoo), ...w, ...extra])];
  const parts = [];
  for (let i = 0; i < syms.length; i += 40) parts.push(syms.slice(i, i + 40));
  const res = await Promise.all(parts.map((p) => sb.rpc("get_quotes", { syms: p })));
  res.forEach(({ data }) => Object.assign(quotes, data || {}));
  if (Date.now() - ch.statsAt > 10 * 60e3 || extra.some((y) => !ch.stats[y])) {   // key stats change once a day
    const { data, error } = await sb.from("stock_stats").select("symbol,data,updated_at").in("symbol", [...new Set([...bigAll().map(yahoo), ...w, ...extra])]);
    ch.ready013 = !error;
    if (!error) { (data || []).forEach((r) => { ch.stats[r.symbol] = r; }); ch.statsAt = Date.now(); }
  }
  if ((location.hash || "").startsWith("#/charts")) render("soft");
}
// Candles for the small charts and the Technicals / Seasonals tabs (cached in the database 2 min - 6 h, here 2 min)
async function chCandles(y, rng, itv) {
  const ch = chOf(), k = `${y}|${rng}|${itv}`, c = ch.cand[k];
  if (c && (c.loading || Date.now() - c.at < 120e3)) return c.data;
  ch.cand[k] = { loading: true, data: c?.data || null, at: 0 };
  const { data } = await sb.rpc("get_candles", { sym: y, rng, itv });
  ch.cand[k] = { data: data || null, at: Date.now() };
  if ((location.hash || "").startsWith("#/charts")) render("soft");
  return data;
}
const candOf = (y, rng, itv) => { const c = chOf().cand[`${y}|${rng}|${itv}`]; if (!c) chCandles(y, rng, itv); return c?.data || null; };
const closes = (d) => (d?.c || []).map(Number).filter(Number.isFinite);

function chSearchBox(small) {
  return `<form class="chsearch${small ? " sm" : ""}" id="chsearch" role="search" autocomplete="off"><span>${chI("search", 16)}</span><input id="chq" type="search" maxlength="40"
    placeholder="${small ? esc(small) : "Search any stock, index, crypto or currency…  e.g. NVDA, PTT, gold, bitcoin"}" aria-label="Search a chart">${small ? "" : "<kbd>/</kbd>"}<div class="chres" id="chres" hidden></div></form>`;
}
let chSeq = 0, chTimer = null;
async function chSearch(q) {
  const seq = ++chSeq, box = document.getElementById("chres");
  if (!box) return;
  if (!q.trim()) { box.hidden = true; return; }
  box.hidden = false; box.innerHTML = `<div class="chr dim">Searching…</div>`;
  const { data } = await sb.rpc("search_symbols", { q: q.trim() });
  if (seq !== chSeq || !document.getElementById("chres")) return;
  const list = Array.isArray(data) ? data : [];
  document.getElementById("chres").innerHTML = list.length
    ? list.map((r, i) => `<a class="chr${i ? "" : " on"}" href="${chHref(plainOf(r.symbol))}">${evLogo({ sym: plainOf(r.symbol) }, 24)}<b>${esc(plainOf(r.symbol))}</b><small>${esc(cleanName(r.name))}</small><em>${esc(r.exchange)} · ${esc(typeName(r.type))}</em></a>`).join("")
    : `<div class="chr dim">No match. Try the company name or its ticker.</div>`;
}
const chPct = (y) => { const q = quotes[y]; return q && q.prev ? pctOf(q) : null; };

// ----- right sidebar: watchlist + important dates, folds into an icon strip -----
const sideKey = () => ((location.hash || "").startsWith("#/charts/") ? "ic_chside_st" : "ic_chside");   // stock pages start folded (round 43)
const sideOpen = () => { const v = safe(() => localStorage.getItem(sideKey()), null); return sideKey() === "ic_chside_st" ? v === "open" : v !== "closed"; };
function chWatch(cur) {
  const w = state.settings.watchlist || [];
  return `<div class="chc chwl"><div class="mh"><h2>My watchlist</h2><a href="#/settings">Edit</a></div>
    ${w.length ? `<div class="h"><span>SYMBOL</span><span class="n">LAST</span><span class="n">CHG%</span></div>${w.map((t) => `<a class="r${t === cur ? " on" : ""}" href="${chHref(t)}"><span class="wn">${evLogo({ sym: t }, 22)}<span><b>${esc(t)}</b><small>${esc(cleanName(state.settings.watch_names?.[t] || quotes[yahoo(t)]?.name || ""))}</small></span></span><span class="n">${pxSpan(yahoo(t))}</span><span class="n">${chSpan(yahoo(t))}</span></a>`).join("")}`
      : `<p class="note" style="margin:4px 14px 12px">Empty. Open any stock and press ☆ Watch.</p>`}</div>`;
}
// Important dates for the whole market: big-company results, your stocks, and US market holidays (next 30 days)
function chDates() {
  const t0 = isoDay(today0()), end = isoDay(addDays(today0(), 30)), w = state.settings.watchlist || [], big = bigAll(), mega = (BIG().US || []).slice(0, 8);
  const ev = (state.events || []).filter((e) => e.day >= t0 && e.day <= end && e.ticker && (big.includes(e.ticker) || w.includes(e.ticker)) && e.kind === "earnings")
    .map((e) => ({ day: e.day, title: e.title.replace(/ earnings$/, " results"), sub: `${e.estimate ? "Date estimated" : "Confirmed"}${w.includes(e.ticker) ? " · in your watchlist" : ""}`, key: mega.includes(e.ticker) || w.includes(e.ticker), href: chHref(e.ticker) }));
  const hol = US_HOLIDAYS.filter(([d]) => d >= t0 && d <= end).map(([d, n]) => ({ day: d, title: `US market closed · ${n}`, sub: "NYSE and Nasdaq shut", closed: true }));
  const list = [...ev, ...hol].sort((a, b) => (a.day < b.day ? -1 : 1)).slice(0, 8);
  const row = (e) => { const x = dayOf(e.day); return `<${e.href ? `a href="${e.href}"` : "div"} class="d"><span class="dt"><small>${monTxt(x).toUpperCase()}</small>${x.getDate()}</span><span><b>${esc(e.title)}</b><span>${esc(e.sub)}</span></span>${e.closed ? `<span class="chtag cl">CLOSED</span>` : e.key ? `<span class="chtag">KEY</span>` : ""}</${e.href ? "a" : "div"}>`; };
  return `<div class="chc chcal" id="chdates"><div class="mh"><h2>Important dates</h2><a href="#/calendar">Stock calendar →</a></div>
    ${list.length ? list.map(row).join("") : `<p class="note" style="margin:4px 14px 12px">Nothing in the next 30 days yet. Big-company dates arrive with the robot's daily check.</p>`}
    <p class="note chfoot">Biggest US and Thai companies + your stocks, next 30 days.</p></div>`;
}
function chSide(cur) {
  const open = sideOpen();
  return `<aside class="chside${open ? "" : " folded"}">${open ? `<div class="chpanel">${chWatch(cur)}${chDates()}</div>` : ""}
    <div class="chstrip"><button class="${open ? "on" : ""}" data-chside="wl" title="My watchlist">${chI("list", 20)}</button><button data-chside="cal" title="Important dates">${chI("cal", 20)}</button>
      <a href="#/settings" data-tab-alerts="1" title="Price alerts">${chI("bell", 20)}</a><hr><button data-chside="toggle" title="${open ? "Fold the sidebar" : "Open the sidebar"}">${chI(open ? "fold" : "open", 20)}</button></div></aside>`;
}
function chSideClick(k) {
  const open = sideOpen();
  if (k === "toggle" || !open) safe(() => localStorage.setItem(sideKey(), k === "toggle" && open ? "closed" : "open"));
  render(false);
  requestAnimationFrame(() => { kc.chart?.resize(); if (k === "cal") document.getElementById("chdates")?.scrollIntoView({ behavior: calm() ? "auto" : "smooth", block: "nearest" }); });
}

// ----- home: TradingView "Markets" style -----
const CH_RANGES = { "1D": ["1d", "5m"], "1M": ["1mo", "60m"], "3M": ["3mo", "1d"], "1Y": ["1y", "1d"], "5Y": ["5y", "1wk"], All: ["max", "1mo"] };
function areaSvg(d, w, h, rng) {
  const pts = (d?.t || []).map((t, i) => [t, d.c?.[i]]).filter((p) => typeof p[1] === "number");
  if (pts.length < 2) return "";
  const v = pts.map((p) => p[1]), mn = Math.min(...v), mx = Math.max(...v), pad = (mx - mn) * 0.08 || 1;
  const X = (i) => (i / (pts.length - 1)) * w, Y = (p) => 8 + ((mx + pad - p) / (mx - mn + 2 * pad)) * (h - 16);
  const up = v.at(-1) >= v[0], col = up ? "var(--up)" : "var(--down)";
  const path = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("");
  const id = "ga" + Math.random().toString(36).slice(2, 7);
  const ticks = [mx, (mx + mn) / 2, mn].map((p) => `<span style="top:${Y(p) - 7}px">${fmtPx(p)}</span>`).join("");
  return `<div class="charea"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".22"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
    <g style="color:${col}"><path d="${path}L${w},${h}L0,${h}Z" fill="url(#${id})"/><path d="${path}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></g></svg><div class="chax">${ticks}</div></div>`;
}
function chCat([k, list], idx) {
  const ch = chOf(), sel = ch.sel[k] && list.includes(ch.sel[k]) ? ch.sel[k] : list[0], rng = ch.rng[k] || "1D", y = yahoo(sel);
  if (!sel) return "";
  const [r, i] = CH_RANGES[rng], d = candOf(y, r, i);
  const nm = (t) => cleanName(chName(yahoo(t)) || statsOf(yahoo(t))?.name || quotes[yahoo(t)]?.name || t);
  const chip = (t) => `<button class="chchip${t === sel ? " on" : ""}" data-chsel="${esc(k)}|${esc(t)}">${chLogo(t, 30)}<span><b>${esc(isStockSym(yahoo(t)) ? t : nm(t))}</b><small>${pxSpan(yahoo(t))} ${chSpan(yahoo(t))}</small></span></button>`;
  const mvk = ch.mv[k] || "up", rows = list.map((t) => ({ t, p: chPct(yahoo(t)) })).filter((x) => x.p !== null).sort((a, b) => (mvk === "up" ? b.p - a.p : a.p - b.p)).slice(0, 5);
  const big = d ? (areaSvg(d, 1000, 270, rng) || `<div class="chempty">Yahoo has no chart history for ${esc(nm(sel))}. <a href="${esc(tvUrl(sel, y))}" target="_blank" rel="noopener">Open in TradingView ↗</a></div>`) : `<div class="chempty">Loading…</div>`;
  return `<section class="chcat a" id="cat-${idx}"><h3>${esc(k)} <a href="${chHref(sel)}">›</a></h3>
    <div class="chchips">${list.map(chip).join("")}</div>
    <div class="chcatb"><div class="chc chbig"><div class="chbh"><b>${esc(nm(sel))}</b><span>${pxSpan(y)} ${chSpan(y)}</span><a href="${chHref(sel)}">Open full chart →</a></div>${big}
      <div class="chrng">${Object.keys(CH_RANGES).map((x) => `<button class="${x === rng ? "on" : ""}" data-chrng="${esc(k)}|${x}">${x}</button>`).join("")}</div></div>
      <div class="chc chmov"><div class="mh"><h2>Top movers</h2></div><div class="chsort" style="padding:0 10px 8px">${[["up", "Gainers"], ["down", "Losers"]].map(([v, l]) => `<button class="${v === mvk ? "on" : ""}" data-chmv="${esc(k)}|${v}">${l}</button>`).join("")}</div>
        ${rows.map((x) => `<a class="r" href="${chHref(x.t)}"><span class="wn">${chLogo(x.t, 22)}<span><b>${esc(isStockSym(yahoo(x.t)) ? x.t : nm(x.t))}</b><small>${esc(isStockSym(yahoo(x.t)) ? nm(x.t) : "")}</small></span></span><span class="n">${pxSpan(yahoo(x.t))}</span><span class="n">${chSpan(yahoo(x.t))}</span></a>`).join("") || `<p class="note" style="margin:4px 14px 12px">Prices loading…</p>`}</div></div></section>`;
}
const HEAT_RGB = (v) => v === null ? "var(--chip)" : v >= 2 ? "#15803d" : v >= 0.5 ? "#22a35a" : v > 0.05 ? "#6cbf8a" : v >= -0.05 ? "#9ca3af" : v > -1 ? "#f08b8b" : v > -3 ? "#e05252" : "#b91c1c";
function chHeat() {
  const grp = Object.entries(BIG()).map(([label, list]) => {
    const rows = list.map((t) => ({ t, y: yahoo(t), cap: statsOf(yahoo(t))?.marketCap || 0 })).sort((a, b) => b.cap - a.cap);
    const big = label === "US" ? 4 : 2;
    return `<div class="g">${esc(label === "Thailand" ? "THAILAND · SET" : label.toUpperCase())}</div>` + rows.map((r, i) => {
      const v = chPct(r.y);
      return `<a class="${i < big ? "b2" : "s"}" href="${chHref(r.t)}" style="background:${HEAT_RGB(v)}" title="${esc(r.t)} ${v === null ? "" : v.toFixed(2) + "%"}">${esc(r.t)}<small>${v === null ? "…" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`}</small></a>`;
    }).join("");
  }).join("");
  return `<section class="chcat a" id="cat-heat"><h3>Heat map <a href="#/heatmap">›</a></h3><div class="chc chheat"><div class="mh"><h2>Big stocks · bigger tile = bigger company</h2><a href="#/heatmap">Full heat map →</a></div><div class="chhm">${grp}</div></div></section>`;
}
function viewCharts() {
  const cats = CH_CATS();
  return `${header("charts")}<div class="wrap chp">
    ${chSearchBox()}
    <div class="chlay"><div class="chmain">
      <nav class="chcnav">${cats.map(([k], i) => `<a href="#/charts" data-chjump="cat-${i}">${esc(k)}</a>`).join("")}<a href="#/charts" data-chjump="cat-heat">Heat map</a><span class="chseg"><a href="#/stocks">${chI("list", 15)}Stocks by industry</a><a href="#/heatmap">${chI("grid", 15)}Stock heat map</a></span></nav>
      ${cats.map(chCat).join("")}${chHeat()}
      <p class="note">Prices: Yahoo Finance, may be delayed (Thai stocks ~15 min). Click anything to open its chart.</p>
    </div>${chSide()}</div></div>`;
}

