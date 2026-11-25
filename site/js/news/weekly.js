// "This week for your stocks" card on My News (design rounds 49-50, option W1: facts only, no AI).
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// Stocks you own (Portfolio) first, then your watchlist; up to 8. For each: price move over the last 7 days,
// how many stories mention it, the highest-impact one, and its next earnings / ex-dividend date.
// Data: one stories query (7 days) + one daily-candle request per stock (cached in the database), refreshed every 30 min.
const WK_MAX = 8;
const wkStocks = () => { const own = Object.keys(pfOwned()), wl = state.settings.watchlist || [];
  return [...own, ...wl.filter((t) => !own.includes(t))].slice(0, WK_MAX).map((t) => ({ t, own: own.includes(t) })); };
async function loadWeek() {
  const list = wkStocks(), w = state.week || (state.week = {});
  if (!list.length || w.loading) return;
  w.loading = true;
  try {
    const since = new Date(Date.now() - 7 * 864e5).toISOString(), ts = list.map((x) => x.t);
    const [st, ...cands] = await Promise.all([
      sb.from("stories").select("id,headline,impact_score,tickers,created_at").overlaps("tickers", ts).gte("created_at", since).order("impact_score", { ascending: false }).limit(400),
      ...ts.map((t) => sb.rpc("get_candles", { sym: yahoo(t), rng: "1mo", itv: "1d" }))]);
    w.stories = st.data || []; w.err = st.error?.message || null;
    w.then = {};
    ts.forEach((t, i) => {   // the last daily close from 7+ days ago = the starting price
      const d = cands[i].data || {}, cut = Date.now() / 1000 - 7 * 86400;
      let p = null; (d.t || []).forEach((x, j) => { if (x <= cut && typeof d.c?.[j] === "number") p = d.c[j]; });
      w.then[t] = p;
    });
    w.key = ts.join(","); w.at = Date.now();
  } finally { w.loading = false; }
  if (!location.hash || location.hash === "#/") render(false);
}
function weekCard() {
  const list = wkStocks(), w = state.week || {};
  if (!list.length) return "";
  if (!w.loading && (w.key !== list.map((x) => x.t).join(",") || Date.now() - (w.at || 0) > 30 * 60e3)) setTimeout(loadWeek, 0);
  const fold = safe(() => localStorage.getItem("ic_wkfold"), null) === "1";
  const from = new Date(Date.now() - 6 * 864e5), fmt = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const head = `<div class="wkh"><b>This week for your stocks</b><span class="note">last 7 days · ${fmt(from)} – ${fmt(new Date())}</span><span class="sp"></span>
    <button class="wkfold" data-wkfold="1" aria-expanded="${!fold}">${fold ? "▾ Show" : "▴ Fold"}</button></div>`;
  if (fold) return `<div class="chc wk a folded">${head}</div>`;
  const t0 = isoDay(today0());
  const rows = list.map(({ t, own }) => {
    const y = yahoo(t), q = quotes[y], then = w.then?.[t], mv = q && then ? (Number(q.price) / then - 1) * 100 : null;
    const mine = (w.stories || []).filter((s) => (s.tickers || []).includes(t));
    const top = mine.find((s) => s.tickers[0] === t) || mine[0];   // prefer a story mainly about this stock
    const ev = (state.events || []).filter((e) => e.ticker === t && e.day >= t0).sort((a, b) => (a.day < b.day ? -1 : 1))[0];
    const next = ev ? `${ev.kind === "earnings" ? "Earnings" : "Ex-div"} ${fmt(dayOf(ev.day))}${ev.estimate ? " (est.)" : ""}` : "—";
    return `<div class="r"><button class="nm" data-stock="${esc(t)}" title="Show ${esc(t)} news"><b>${esc(t)}</b><small>${own ? "you own" : "watchlist"}</small></button>
      <span class="n tnum ${mv === null ? "" : mv >= 0 ? "up" : "down"}">${mv === null ? (w.loading || !w.at ? "…" : "—") : `${mv > 0 ? "+" : ""}${mv.toFixed(1)}%`}</span>
      <span class="n tnum">${w.at ? mine.length : "…"}</span>
      <span class="top">${top ? `<a href="#/story/${top.id}">${esc(top.headline)}</a> <span class="note">· ${esc(top.impact_score)}</span>` : `<span class="note">${w.at ? "No stories" : "…"}</span>`}</span>
      <span class="nx">${esc(next)}</span></div>`;
  }).join("");
  return `<div class="chc wk a">${head}<div class="h"><span>STOCK</span><span class="n">7 DAYS</span><span class="n">STORIES</span><span>TOP STORY</span><span>NEXT</span></div>${rows}</div>`;
}
document.addEventListener("click", (e) => {
  if (!e.target.closest("[data-wkfold]")) return;
  const now = safe(() => localStorage.getItem("ic_wkfold"), null) === "1";
  safe(() => localStorage.setItem("ic_wkfold", now ? "0" : "1"));
  render(false);
});
