// Chart loading (KLineChart) + your saved chart settings.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// ----- the chart itself (loaded only when a stock page opens) -----
const KC_FILES = {
  css: ["https://cdn.jsdelivr.net/npm/@klinecharts/pro@0.1.1/dist/klinecharts-pro.css", "sha384-RoRVmKzlNPK7OcKOA5IAMaoUB0pO3CxZCULDD5ajKf6FEzDzXj0NN/AC18waF7I1"],
  core: ["https://cdn.jsdelivr.net/npm/klinecharts@9.8.12/dist/umd/klinecharts.min.js", "sha384-N0+OYSoH0p5B+LMHkqKVHtLag55VxhTNJBcpNtG3q7tLMfe7sRBr4z614UxQZOg8"],
  pro: ["https://cdn.jsdelivr.net/npm/@klinecharts/pro@0.1.1/dist/klinecharts-pro.umd.js", "sha384-Dvko2GFxD+nsobomJF4F6xR9HI0LF9zoIp7ZYZwiyuikBsZOISSdwR2sQ1/YJRqD"],
};
const kc = { pro: null, chart: null, box: null, sym: null, ov: new Map(), restoring: false, restoredFor: null, meta: null, metaFor: null, loaded: "", sub: null, saveT: null,
  period: 3, ctype: "candle_solid", range: null, pct: false, log: false, active: [], indFor: null, hist: [], redo: [], sel: null, lastPrice: null, pendingBars: 0 };
let kcLoading = null;
function kcLoad() {
  if (kcLoading) return kcLoading;
  const tag = (kind, [url, sri]) => new Promise((ok, bad) => {
    const el = document.createElement(kind === "css" ? "link" : "script");
    if (kind === "css") { el.rel = "stylesheet"; el.href = url; } else { el.src = url; el.async = false; }
    el.integrity = sri; el.crossOrigin = "anonymous"; el.referrerPolicy = "no-referrer";
    el.onload = ok; el.onerror = () => bad(new Error("Could not load the chart library"));
    document.head.appendChild(el);
  });
  kcLoading = Promise.all([tag("css", KC_FILES.css), tag("js", KC_FILES.core).then(() => {
    const k = window.klinecharts, init = k.init;   // catch the chart the Pro layer creates (drawings, indicators, events)
    k.init = (...a) => { const c = init(...a); kcHook(c); return c; };
    return tag("js", KC_FILES.pro);
  })]).then(() => { kcRegister(); kcRegisterTV(window.klinecharts); }).catch((e) => { kcLoading = null; throw e; });
  return kcLoading;
}
const KC_PERIODS = [{ multiplier: 5, timespan: "minute", text: "5m" }, { multiplier: 15, timespan: "minute", text: "15m" }, { multiplier: 1, timespan: "hour", text: "1H" },
  { multiplier: 1, timespan: "day", text: "D" }, { multiplier: 1, timespan: "week", text: "W" }, { multiplier: 1, timespan: "month", text: "M" },
  // round 44: TradingView's other timeframes (made by joining our 5m / 15m / 1h / 1-month candles)
  { multiplier: 10, timespan: "minute", text: "10m" }, { multiplier: 30, timespan: "minute", text: "30m" }, { multiplier: 45, timespan: "minute", text: "45m" },
  { multiplier: 2, timespan: "hour", text: "2H" }, { multiplier: 3, timespan: "hour", text: "3H" }, { multiplier: 4, timespan: "hour", text: "4H" },
  { multiplier: 3, timespan: "month", text: "3M" }, { multiplier: 6, timespan: "month", text: "6M" }, { multiplier: 12, timespan: "month", text: "12M" }];
// [Yahoo range, Yahoo interval, candles joined into one]. Daily + weekly = 10 years: Yahoo silently sends MONTHLY candles for range "max" (checked 2026-11-25)
const KC_RANGE = { minute5: ["1mo", "5m", 1], minute10: ["1mo", "5m", 2], minute15: ["1mo", "15m", 1], minute30: ["1mo", "15m", 2], minute45: ["1mo", "15m", 3],
  hour1: ["2y", "60m", 1], hour2: ["2y", "60m", 2], hour3: ["2y", "60m", 3], hour4: ["2y", "60m", 4], day1: ["10y", "1d", 1], week1: ["10y", "1wk", 1],
  month1: ["max", "1mo", 1], month3: ["max", "1mo", 3], month6: ["max", "1mo", 6], month12: ["max", "1mo", 12] };
const KC_TF_GROUPS = [["MINUTES", [0, 6, 1, 7, 8]], ["HOURS", [2, 9, 10, 11]], ["DAYS", [3]], ["WEEKS", [4]], ["MONTHS", [5, 12, 13, 14]]];
const KC_TF_NAME = (i) => { const p = KC_PERIODS[i]; return `${p.multiplier} ${p.timespan}${p.multiplier > 1 ? "s" : ""}`; };
const kcFavTf = () => safe(() => JSON.parse(localStorage.getItem("ic_kctf") || "null"), null) || [0, 1, 2, 11, 3, 4, 5];
function kcJoin(out, n, monthly, gmt) {   // join n candles into one: intraday within the same trading day, months by calendar
  if (n <= 1) return out;
  const res = []; let cur = null, key = null, cnt = 0;
  out.forEach((b) => {
    const d = new Date(b.timestamp + (gmt || 0) * 1000), k = monthly ? Math.floor((d.getUTCFullYear() * 12 + d.getUTCMonth()) / n) : `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    if (k !== key || (!monthly && cnt >= n)) { if (cur) res.push(cur); cur = { ...b }; key = k; cnt = 1; return; }
    cur.high = Math.max(cur.high, b.high); cur.low = Math.min(cur.low, b.low); cur.close = b.close; cur.volume += b.volume || 0; cnt++;
  });
  if (cur) res.push(cur);
  return res;
}
const kcDatafeed = {
  async searchSymbols(q) {
    const { data } = await sb.rpc("search_symbols", { q: String(q || "").trim() || "a" });
    return (Array.isArray(data) ? data : []).map((r) => ({ ticker: r.symbol, shortName: plainOf(r.symbol), name: cleanName(r.name), exchange: r.exchange, pricePrecision: 2, volumePrecision: 0 }));
  },
  async getHistoryKLineData(symbol, period) {
    const key = symbol.ticker + "|" + period.timespan + period.multiplier;
    if (kc.loaded === key) return [];           // asked for older bars: we already sent everything Yahoo has
    const [rng, itv, join] = KC_RANGE[period.timespan + period.multiplier] || ["max", "1d", 1];
    const [{ data, error }] = await Promise.all([sb.rpc("get_candles", { sym: symbol.ticker, rng, itv }), kc.drawP]);
    kc.loaded = key;
    if (error || !data) { kcNote(error && /get_candles/.test(error.message) ? "The chart needs supabase/013_charts.sql (run it once in Supabase)." : "Yahoo didn't send chart data. Try again in a minute."); return []; }
    if (data.meta) { kc.meta = data.meta; kc.metaFor = symbol.ticker; }
    const out = [];
    (data.t || []).forEach((ts, i) => { const o = data.o?.[i], h = data.h?.[i], l = data.l?.[i], c = data.c?.[i];
      if ([o, h, l, c].every((v) => typeof v === "number")) out.push({ timestamp: ts * 1000, open: o, high: h, low: l, close: c, volume: data.v?.[i] || 0 }); });
    if (join > 1) out.splice(0, out.length, ...kcJoin(out, join, period.timespan === "month", data.meta?.gmtoffset));
    kcNote(out.length < 2 ? `Yahoo has no chart history for ${esc(kc.sym)}. <a href="${esc(tvUrl(kc.sym, symbol.ticker))}" target="_blank" rel="noopener">Open it in TradingView ↗</a>` : "");
    if ((location.hash || "").startsWith("#/charts/")) setTimeout(() => render(false), 0);   // stats from the chart data (day range, 52 weeks)
    return out;
  },
  subscribe(symbol, period, cb) {   // keep the last candle live: our cached price, once a minute
    clearInterval(kc.sub);
    kc.sub = setInterval(async () => {
      if (document.hidden || !kc.chart || !(location.hash || "").startsWith("#/charts/")) return;
      const { data } = await sb.rpc("get_quotes", { syms: [symbol.ticker] });
      const p = Number(data?.[symbol.ticker]?.price), last = kc.chart.getDataList().at(-1);
      if (Number.isFinite(p) && last) cb({ ...last, close: p, high: Math.max(last.high, p), low: Math.min(last.low, p) });
    }, 60000);
  },
  unsubscribe() { clearInterval(kc.sub); },
};
function kcNote(html) {
  if (!kc.box) return;
  let n = kc.box.querySelector(".kcnote");
  if (!html) { n?.remove(); return; }
  if (!n) { n = document.createElement("div"); n.className = "kcnote"; kc.box.appendChild(n); }
  n.innerHTML = html;
}

// ----- your settings (one row "*" in chart_drawings): indicators, favourites, own defaults, Fibonacci + templates -----
// Starting values = what the user's TradingView uses (read 2026-11-25, see FEATURES.md).
const FIB_FOR_WAVE = { levels: [[0, "#ffffff", 1], [0.3333, "#ffffff", 1], [0.382, "#ffffff", 1], [0.5, "#F23645", 1], [0.618, "#F23645", 1], [0.786, "#F23645", 1], [0.887, "#ffffff", 1], [1, "#ffffff", 1],
  [1.618, "#ffffff", 1], [2.618, "#ffffff", 1], [0.236, "#F7525F", 0], [1.272, "#81C784", 0], [1.382, "#F23645", 0], [3.618, "#9C27B0", 0]],
  trend: { on: 1, color: "#ffffff", dash: 1 }, prices: 1, pct: 1, size: 12, bg: 0 };
const IND_DEF = {
  TV_MACD: { params: [12, 26, 9], ext: { src: "close", osc: "EMA", sig: "EMA", show: { hist: 1, macd: 1, signal: 1, zero: 1 }, col: { h0: "#26A69A", h1: "#B2DFDB", h2: "#FFCDD2", h3: "#FF5252", macd: "#2962FF", signal: "#FF6D00", zero: "#787B86" }, w: { macd: 1, signal: 1 } } },
  TV_RSI: { params: [14, 14, 2], ext: { src: "close", smooth: "SMA", bands: [70, 50, 30], show: { rsi: 1, ma: 1, bands: 1, fill: 1 }, col: { rsi: "#7E57C2", ma: "#F7C548", bands: "#787B86", fill: "#7E57C2" }, w: { rsi: 1, ma: 1 } } },
  TV_VOL: { params: [20], ext: { prev: 0, showMA: 0, col: { up: "#26A69A", dn: "#EF5350", ma: "#2962FF" } } },
  TV_CDC: { params: [12, 26], ext: { bars: 1, sig: 1 } }, TV_PVO: { params: [12, 26, 9], ext: {} }, TV_ZZ: { params: [5], ext: { labels: 1, color: "#2962FF", w: 2 } },
  TV_RSIDIV: { params: [14, 5, 5], ext: { hidden: 0 } },
  MA: { params: [20, 50, 200] }, EMA: { params: [9, 21] }, SMA: { params: [12, 2] }, BOLL: { params: [20, 2] }, SAR: { params: [2, 2, 20] }, KDJ: { params: [14, 3, 3] },
  CCI: { params: [20] }, WR: { params: [14] }, OBV: { params: [30] }, DMI: { params: [14, 6] }, ROC: { params: [12, 6] }, MTM: { params: [10, 10] }, AO: { params: [5, 34] }, BIAS: { params: [6, 12, 24] },
  TRIX: { params: [12, 9] }, PSY: { params: [12, 6] }, VR: { params: [26, 6] }, PVT: { params: [] }, AVP: { params: [] }, BBI: { params: [3, 6, 12, 24] }, BRAR: { params: [26] }, EMV: { params: [14, 9] }, CR: { params: [26, 10, 20, 40, 60] }, DMA: { params: [10, 50, 10] } };
const IND_NAME = { TV_MACD: "MACD", TV_RSI: "Relative Strength Index", TV_VOL: "Volume", TV_CDC: "CDC ActionZone V3 2020", TV_PVO: "Percentage Volume Oscillator", TV_ZZ: "Zig Zag", TV_RSIDIV: "RSI divergence", MA: "Moving Average", EMA: "Exponential Moving Average", SMA: "Smoothed Moving Average", BOLL: "Bollinger Bands",
  SAR: "Parabolic SAR", KDJ: "Stochastic (KDJ)", CCI: "Commodity Channel Index", WR: "Williams %R", OBV: "On Balance Volume", DMI: "Directional Movement (DMI)", ROC: "Rate of Change", MTM: "Momentum",
  AO: "Awesome Oscillator", BIAS: "Bias", TRIX: "TRIX", PSY: "Psychological Line", VR: "Volume Ratio", PVT: "Price Volume Trend", AVP: "Average Price", BBI: "Bull and Bear Index", BRAR: "BRAR", EMV: "Ease of Movement", CR: "Energy (CR)", DMA: "Different of Moving Average" };
const IND_CAT = { Trend: ["TV_CDC", "TV_ZZ", "MA", "EMA", "SMA", "BBI", "SAR", "DMI", "TRIX", "DMA", "AVP"], Momentum: ["TV_RSI", "TV_RSIDIV", "TV_MACD", "KDJ", "CCI", "WR", "MTM", "ROC", "AO", "BIAS", "PSY", "BRAR", "CR"], Volume: ["TV_VOL", "TV_PVO", "OBV", "PVT", "VR", "EMV"], Volatility: ["BOLL"] };
const IND_MAIN = ["MA", "EMA", "SMA", "BOLL", "SAR", "BBI", "AVP", "TV_CDC", "TV_ZZ"];
// labels for the Inputs tab, and on/off switches kept in ext
const IND_INPUTS = { TV_CDC: ["Fast EMA", "Slow EMA"], TV_PVO: ["Fast length", "Slow length", "Signal length"], TV_ZZ: ["Deviation (%): smallest move that counts as a new swing"], TV_RSIDIV: ["RSI length", "Pivot lookback left", "Pivot lookback right"] };
const IND_FLAGS = { TV_CDC: [["bars", "Colour the candles by zone"], ["sig", "Buy / Sell labels"]], TV_ZZ: [["labels", "Price and % labels"]], TV_RSIDIV: [["hidden", "Also hidden divergence"]] };
const IND_SOON = [["EMASS", "Tell me what it is"]];
const clone = (o) => JSON.parse(JSON.stringify(o));
function prefs() {
  const ch = chOf();
  let p = ch.prefs;
  if (!p || !Array.isArray(p.list)) p = ch.prefs = { list: [{ name: "TV_VOL", ...clone(IND_DEF.TV_VOL) }, { name: "TV_MACD", ...clone(IND_DEF.TV_MACD) }],
    fav: ["TV_MACD", "SAR", "TV_RSI", "KDJ", "TV_VOL"], def: {}, fib: clone(FIB_FOR_WAVE), fibT: { "FOR WAVE": clone(FIB_FOR_WAVE) }, hide: {} };
  p.def ||= {}; p.fav ||= [];
  if (!p.fav47) { p.fav47 = 1; ["TV_CDC", "TV_PVO", "TV_ZZ", "TV_RSIDIV"].forEach((n) => { if (!p.fav.includes(n)) p.fav.push(n); }); }   // your TradingView favourites, now built p.fib ||= clone(FIB_FOR_WAVE); p.fibT ||= { "FOR WAVE": clone(FIB_FOR_WAVE) }; p.hide ||= {};
  return p;
}
let kcPrefT = null;
function kcSavePrefs() {
  setTimeout(ktTree, 0);
  clearTimeout(kcPrefT);
  kcPrefT = setTimeout(() => sb.from("chart_drawings").upsert({ user_id: state.user.id, symbol: "*", indicators: prefs(), updated_at: new Date().toISOString() }, { onConflict: "user_id,symbol" })
    .then(({ error }) => { if (error) toast(`Chart settings not saved: ${esc(error.message)}`); }), 600);
}

