// News pins + event badges on the stock chart (design round 48, P1). A see-through layer over the price pane:
// NOT chart overlays, so they are never saved as your drawings and never show in the Object tree.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// News = your stories about this stock, impact 6+ (the robot keeps 90 days). Above the candle = good / mixed news, below = bad.
// Events = E earnings (upcoming + the ones the robot records from now on), D dividends (ex-date, from Yahoo's chart data),
// F Fed rate decision, C CPI, J US jobs report (from the economic calendar; collected since 22 Nov 2026).
const MK_COL = (s) => (s >= 9 ? "#ff4500" : s >= 8 ? "#fb3a64" : s >= 7 ? "#f59e0b" : "#8a8a93");
const MK_EV = { E: ["#f59e0b", "Earnings"], D: ["#22c55e", "Dividend (ex-date)"], F: ["#3b82f6", "Fed rate decision"], C: ["#3b82f6", "US CPI (inflation)"], J: ["#3b82f6", "US jobs report"] };
const MK_ECON = [["F", /Federal Funds Rate/i], ["C", /\bCPI\b/], ["J", /Non-Farm Employment Change/i]];
const mkPref = () => safe(() => JSON.parse(localStorage.getItem("ic_kcmk") || "null"), null) || { n: 1, e: 1 };
const mk = { sym: null, news: [], ev: [], econ: null, layer: null, tip: null, raf: 0, hideT: 0 };
const mkDayTs = (d) => Date.parse(String(d).slice(0, 10) + "T00:00:00Z");   // a date without a time -> that trading day's candle

async function mkLoad(t) {   // everything we know about this stock, once per stock
  if (mk.sym === t) return;
  mk.sym = t; mk.news = []; mk.ev = [];
  const [st, ev, er] = await Promise.all([
    sb.from("stories").select("id,headline,impact_score,sentiment,published_at,n_sources").contains("tickers", [t]).gte("impact_score", 6).order("published_at", { ascending: false }).limit(300),
    sb.from("events").select("day,kind,title,estimate").eq("ticker", t),
    sb.from("earnings_results").select("quarter_end,seen_at,eps_actual,eps_estimate,surprise_pct").eq("ticker", t),
  ]);
  if (mk.sym !== t) return;   // you opened another stock meanwhile
  if (!mk.econ) {
    const { data } = await sb.from("econ_events").select("at,title,actual,forecast").eq("currency", "USD").eq("impact", "High").order("at");
    const seen = new Set();
    mk.econ = (data || []).flatMap((r) => { const k = MK_ECON.find(([, rx]) => rx.test(r.title))?.[0], key = k + r.at.slice(0, 10);
      if (!k || seen.has(key)) return []; seen.add(key);
      return [{ k, ts: Date.parse(r.at), title: r.title, note: r.actual ? `Actual ${r.actual}${r.forecast ? ` · forecast ${r.forecast}` : ""}` : r.forecast ? `Forecast ${r.forecast}` : "" }]; });
  }
  mk.news = (st.data || []).map((s) => ({ ...s, ts: Date.parse(s.published_at) })).filter((s) => Number.isFinite(s.ts));
  const evs = [], days = new Set();
  const add = (e) => { const key = e.k + new Date(e.ts).toISOString().slice(0, 10); if (Number.isFinite(e.ts) && !days.has(key)) { days.add(key); evs.push(e); } };
  (er.data || []).forEach((r) => { if (r.seen_at && r.seen_at.slice(0, 10) !== r.quarter_end) add({ k: "E", ts: mkDayTs(r.seen_at), title: "Earnings result",
    note: r.eps_actual !== null ? `EPS ${eps(r.eps_actual)} vs estimate ${eps(r.eps_estimate)}${r.surprise_pct !== null ? ` · ${r.surprise_pct >= 0 ? "beat" : "miss"} ${Math.abs(r.surprise_pct).toFixed(1)}%` : ""}` : "" }); });
  (ev.data || []).forEach((r) => { if (r.kind === "earnings" || r.kind === "dividend") add({ k: r.kind === "earnings" ? "E" : "D", ts: mkDayTs(r.day), title: r.title, note: r.estimate ? "Date is an estimate" : "" }); });
  const s = statsOf(yahoo(t));
  if (s?.nextEarn) add({ k: "E", ts: mkDayTs(new Date(s.nextEarn * 1000).toISOString()), title: "Next earnings", note: s.epsNext?.e ? `EPS estimate ${eps(s.epsNext.e)}` : "" });
  if (s?.exDiv) add({ k: "D", ts: mkDayTs(new Date(s.exDiv * 1000).toISOString()), title: "Ex-dividend date", note: s.divRate ? `${s.divRate} per share a year` : "" });
  mk.ev = evs;
  mkDraw();
}
function mkDivs() {   // past dividends from the chart data (supabase/015 passes Yahoo's list through)
  return (kc.divs || []).map((d) => ({ k: "D", ts: mkDayTs(new Date(d.ts).toISOString()), title: "Dividend (ex-date)", note: `${d.amt} per share` }));
}

// Which candle a moment belongs to. News after the close counts for the next candle.
function mkIndex(list, ts) {
  if (!list.length) return -1;
  let gap = Infinity; for (let i = Math.max(1, list.length - 60); i < list.length; i++) gap = Math.min(gap, list[i].timestamp - list[i - 1].timestamp);
  const span = gap >= 864e5 && gap < 2 * 864e5 ? 7 * 36e5 : gap;   // daily candles: one ~7-hour session
  if (ts < list[0].timestamp) return -1;
  const last = list.length - 1;
  if (ts >= list[last].timestamp + span) {   // still to come: count trading days ahead (daily and longer only)
    if (gap < 864e5) return -1;
    const days = (ts - list[last].timestamp) / 864e5, ahead = gap < 2 * 864e5 ? Math.ceil(days * 5 / 7) : Math.ceil(days * 864e5 / gap);
    return last + Math.max(1, ahead);
  }
  let lo = 0, hi = last;
  while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].timestamp + span > ts) hi = m; else lo = m + 1; }
  return lo;
}

function mkDraw() { cancelAnimationFrame(mk.raf); mk.raf = requestAnimationFrame(mkPaint); }
function mkPaint() {
  const c = kc.chart, pane = c?.getDom?.("candle_pane", "main");
  if (!c || !pane || !kc.box) return;
  if (!mk.layer || mk.layer.parentNode !== kc.box) {
    mk.layer = document.createElement("div"); mk.layer.className = "kcmk"; kc.box.appendChild(mk.layer);
    mk.layer.addEventListener("mouseover", mkHover); mk.layer.addEventListener("mouseout", () => mkHide());
    mk.layer.addEventListener("click", (e) => { const p = e.target.closest(".kcpin"); if (p?.dataset.one) location.hash = "#/story/" + p.dataset.one; });
  }
  const pr = mkPref(), list = c.getDataList(), box = kc.box.getBoundingClientRect(), r = pane.getBoundingClientRect();
  Object.assign(mk.layer.style, { left: r.left - box.left + "px", top: r.top - box.top + "px", width: r.width + "px", height: r.height + "px" });
  const vr = c.getVisibleRange(), W = r.width, H = r.height, html = [];
  const xOf = (i) => c.convertToPixel({ dataIndex: i }, { paneId: "candle_pane" })?.x;
  const yOf = (v) => c.convertToPixel({ value: v }, { paneId: "candle_pane" })?.y;
  const inView = (i) => i >= 0 && i >= vr.from - 1 && i <= vr.to + 1;
  mk.groups = {};
  if (pr.n && sameSym()) {
    const g = {}; mk.news.forEach((s) => { const i = mkIndex(list, s.ts); if (i >= 0 && i < list.length && inView(i)) (g[i] = g[i] || []).push(s); });
    Object.entries(g).forEach(([i, ss]) => {
      i = Number(i); ss.sort((a, b) => b.impact_score - a.impact_score);
      const top = ss[0], bad = top.sentiment === "Bearish", k = list[i], x = xOf(i);
      if (x === undefined || x < 0 || x > W) return;
      const yc = bad ? yOf(k.low) : yOf(k.high), y = Math.max(12, Math.min(H - 34, yc + (bad ? 18 : -18))), d = top.impact_score >= 9 ? 20 : top.impact_score >= 8 ? 18 : 15;
      mk.groups["n" + i] = { i, ss };
      html.push(`<i class="kcstem" style="left:${x}px;top:${Math.min(y, yc)}px;height:${Math.abs(yc - y)}px;background:${MK_COL(top.impact_score)}"></i>`,
        `<span class="kcpin" data-g="n${i}"${ss.length === 1 ? ` data-one="${esc(top.id)}"` : ""} style="left:${x}px;top:${y}px;width:${d}px;height:${d}px;background:${MK_COL(top.impact_score)}">${top.impact_score}${ss.length > 1 ? `<b>+${ss.length - 1}</b>` : ""}</span>`);
    });
  }
  if (pr.e && sameSym()) {
    const g = {}; [...mk.ev, ...mkDivs(), ...(mk.econ || [])].forEach((e) => { const i = mkIndex(list, e.ts); if (inView(i)) (g[i] = g[i] || []).push(e); });
    Object.entries(g).forEach(([i, es]) => {
      i = Number(i); const x = xOf(i), fut = i >= list.length;
      if (x === undefined || x < 0 || x > W) return;
      es.forEach((e, j) => { mk.groups[`e${i}_${j}`] = { i, e, fut };
        html.push(`<span class="kcev${fut ? " fut" : ""}" data-g="e${i}_${j}" style="left:${x}px;top:${H - 24 - j * 21}px;background:${MK_EV[e.k][0]};color:${fut ? MK_EV[e.k][0] : "#111"}">${e.k}</span>`); });
    });
  }
  mk.layer.innerHTML = html.join("");
}
const sameSym = () => mk.sym === kc.sym;
function mkHover(e) {
  const el = e.target.closest("[data-g]"), g = el && mk.groups?.[el.dataset.g];
  if (!g) return;
  clearTimeout(mk.hideT);
  const list = kc.chart.getDataList(), k = list[g.i], p = list[g.i - 1];
  const day = k ? new Date(k.timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
  const move = k && p ? ((k.close - p.close) / p.close) * 100 : null, mv = move === null ? "" : `<div class="px">Price that day: <span class="${move >= 0 ? "up" : "down"}">${move > 0 ? "+" : ""}${move.toFixed(2)}%</span></div>`;
  let html;
  if (g.ss) html = `<div class="m">${day}${g.ss.length > 1 ? ` · ${g.ss.length} stories` : ""}</div>${g.ss.slice(0, 5).map((s) => `<a href="#/story/${esc(s.id)}"><span class="imp" style="background:${MK_COL(s.impact_score)}">${s.impact_score}</span> ${esc(s.headline)}<small>${esc(s.sentiment || "")}${s.n_sources > 1 ? ` · ${s.n_sources} outlets` : ""} · open story →</small></a>`).join("")}${g.ss.length > 5 ? `<div class="m" style="margin:4px 0 0">+ ${g.ss.length - 5} more on the News tab</div>` : ""}${mv}`;
  else { const d = new Date(g.e.ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    html = `<div class="m"><span class="imp" style="background:${MK_EV[g.e.k][0]};color:#111">${g.e.k}</span>${esc(MK_EV[g.e.k][1])} · ${d}${g.fut ? " · coming up" : ""}</div><b class="t">${esc(g.e.title)}</b>${g.e.note ? `<div>${esc(g.e.note)}</div>` : ""}${g.fut ? "" : mv}`; }
  if (!mk.tip || mk.tip.parentNode !== kc.box) {
    mk.tip = document.createElement("div"); mk.tip.className = "kcmktip"; kc.box.appendChild(mk.tip);
    mk.tip.addEventListener("mouseenter", () => clearTimeout(mk.hideT)); mk.tip.addEventListener("mouseleave", () => mkHide());
    ["mousedown", "pointerdown", "wheel"].forEach((ev) => mk.tip.addEventListener(ev, (x) => x.stopPropagation(), true));
  }
  mk.tip.innerHTML = html; mk.tip.hidden = false;
  const b = kc.box.getBoundingClientRect(), r = el.getBoundingClientRect(), tw = mk.tip.offsetWidth, th = mk.tip.offsetHeight;
  let left = r.left - b.left + r.width / 2 + 14, top = r.top - b.top - 10;
  if (left + tw > b.width - 70) left = r.left - b.left - tw - 14;
  top = Math.max(8, Math.min(top, b.height - th - 8));
  Object.assign(mk.tip.style, { left: left + "px", top: top + "px" });
}
function mkHide() { clearTimeout(mk.hideT); mk.hideT = setTimeout(() => { if (mk.tip) mk.tip.hidden = true; }, 220); }
function mkToggle(k) {   // top-bar switches "News" / "Events", kept on this device
  const p = mkPref(); p[k] = p[k] ? 0 : 1; safe(() => localStorage.setItem("ic_kcmk", JSON.stringify(p)));
  if (mk.tip) mk.tip.hidden = true;
  render(false); mkDraw();
}
function mkHook(c) {   // called once when the chart is created (charts/drawings.js kcHook)
  ["onZoom", "onScroll", "onVisibleRangeChange", "onPaneDrag"].forEach((a) => safe(() => c.subscribeAction(a, mkDraw)));
  addEventListener("resize", mkDraw);
  if (window.ResizeObserver && kc.box) new ResizeObserver(mkDraw).observe(kc.box);
}
