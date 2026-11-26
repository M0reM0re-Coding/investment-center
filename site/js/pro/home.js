// Pro F1 HOME: one screen with the headline of every module (morning check). Each panel opens its module.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

PRO_VIEWS.home = () => {
  const m = proGet("macro"), c = proGet("cb"), t = proTk(), F = proGet("fund_" + yahoo(t).replace("^", "_"));
  if (typeof thLoadAll === "function") thLoadAll();
  if (Date.now() - cr.at > 120e3) crLoad();
  const go = (mod, tk) => `<a class="pgo" href="${proHref(mod, tk)}">OPEN ›</a>`;
  // MACRO
  const reg = m?.regime, L = m?.lights || [];
  const macro = m ? `<div class="pbigw"><div><div class="pbig">${esc((reg?.name || "—").toUpperCase())}</div><small>GROWTH ${reg?.growth === "up" ? "▲" : "▼"} · INFLATION ${reg?.inflation === "up" ? "▲" : "▼"}</small></div>
    <div><div class="pbig">${L.filter((l) => l.s === "red").length}<span class="pd">/${L.length}</span></div><small>RECESSION LIGHTS RED</small></div></div>
    <table class="ptab">${L.map((l) => `<tr><td class="l"><span class="plight ${l.s}"></span>${esc(l.n)}</td><td>${typeof l.v === "number" ? pN(l.v, Math.abs(l.v) > 1000 ? 0 : 2) : ""}</td></tr>`).join("")}</table>` : m === undefined ? proWait() : proSoon("No macro data yet.", "");
  // RISK
  let risk = proSoon("Add trades in Portfolio to see your risk here.", "");
  if (state.trades?.length) { const d = riskData(); risk = d.wait ? proWait("LOADING PRICE HISTORY…") : d.empty ? risk : `<div class="pkv"><span>Value</span><span>${pfMoney(d.total, pfShow())}</span><span>Volatility (1y)</span><span>${pN(d.pVol, 1)}%</span>
    <span>Beta vs S&amp;P</span><span>${pN(d.pBeta)}</span><span>1-day VaR 95%</span><span class="dn">${pfMoney(-d.var95, pfShow())}</span><span>Biggest risk share</span><span>${esc([...d.per].sort((a, b) => b.vol * b.w * b.corrP - a.vol * a.w * a.corrP)[0]?.t || "—")}</span></div>`; }
  else if (state.trades === undefined || state.trades === null) { if (!state.tradesLoading && typeof loadTrades === "function") setTimeout(loadTrades, 0); }
  // THESIS WATCH
  const w = typeof thWatch === "function" ? thWatch() : [];
  const thesis = w.length ? `<table class="ptab"><tr><th class="l">TICKER</th><th class="l">STANCE</th><th>NEW NEWS</th><th>RULES HIT</th></tr>${w.map((x) => `<tr><td class="l"><a class="t" href="${proHref("thesis", x.t)}">${esc(x.t)}</a></td>
    <td class="l"><span class="ptag ${x.stance === "bull" ? "g" : x.stance === "bear" ? "r" : ""}">${esc((x.stance || "watch").toUpperCase())}</span></td><td>${x.lit ? `<span class="ptag y">${x.lit} NEW</span>` : '<span class="pd">—</span>'}</td><td>${x.trig ? `<span class="ptag a">${x.trig}</span>` : '<span class="pd">—</span>'}</td></tr>`).join("")}</table>`
    : proSoon(`No theses yet. Type <b>${esc(t)} THESIS</b> in the command line to write your first one.`, "");
  // ROTATION leaders (uses the cached ETF history from ROT)
  const spy = rotSeries("SPY"), rows = ROT_SEC.map(([y, n]) => { const s = rotSeries(y); return s && spy ? { y, n, v: (rotRet(s, 63) ?? 0) - (rotRet(spy, 63) ?? 0) } : null; }).filter(Boolean).sort((a, b) => b.v - a.v);
  const rot = rows.length ? `<table class="ptab">${[...rows.slice(0, 3), ...rows.slice(-3)].map((r, i) => `${i === 3 ? '<tr><td class="l pd" colspan="2">…</td></tr>' : ""}<tr><td class="l">${esc(r.n)} <span class="pd">${r.y}</span></td><td>${pUD(r.v, pPct(r.v, 1))}</td></tr>`).join("")}</table><div class="pnote">3-month return vs the S&amp;P 500.</div>` : proWait("LOADING SECTORS…");
  // CRYPTO
  const by = (cr.d.by || []).filter(Boolean), btc = by.find((r) => r.symbol === "BTCUSDT");
  const crypto = btc ? `<div class="pkv"><span>BTC</span><span>${pN(+btc.lastPrice, 0)} ${pUD(+btc.price24hPcnt, pPct(+btc.price24hPcnt * 100))}</span><span>BTC funding / 8h</span><span>${(+btc.fundingRate * 100).toFixed(4)}%</span>
    <span>BTC dominance</span><span>${pN(cr.d.gl?.market_cap_percentage?.btc, 1)}%</span><span>Long accounts (Bybit)</span><span>${pN(+(cr.d.ls?.[0]?.buyRatio || 0) * 100, 0)}%</span></div>` : proWait();
  // CENTRAL BANKS: latest moves
  const cbm = (c?.rows || []).filter((r) => r.chg).sort((a, b) => String(b.chg_at).localeCompare(String(a.chg_at))).slice(0, 6);
  const cbs = cbm.length ? `<table class="ptab">${cbm.map((r) => `<tr><td class="l">${esc(r.bank)} <span class="pd">${esc(r.name)}</span></td><td>${pN(r.rate)}%</td><td>${pUD(-r.chg, (r.chg > 0 ? "+" : "") + pN(r.chg))}</td><td class="pd">${esc(String(r.chg_at).slice(0, 10))}</td></tr>`).join("")}</table>` : c === undefined ? proWait() : proSoon("No data.", "");
  // ACTIVE TICKER
  let tk = proSoon(`No company data for ${esc(t)}.`, "");
  if (F) { const q = valFlags(F, F.snap?.sector), M = valDcfModel(F, valIn(t)), r = valDcf(M), up = r && M.price ? (r.perShare / M.price - 1) * 100 : null, imp = valReverse(M);
    tk = `<div class="pkv"><span>${esc(F.snap?.name || t)}</span><span>${pN(F.snap?.price)} ${esc(F.snap?.cur || "")}</span><span>DCF value (your inputs)</span><span>${r ? `${pN(r.perShare)} ${pUD(up, `(${pPct(up, 0)})`)}` : "—"}</span>
      <span>Growth priced in (reverse DCF)</span><span>${imp === null ? "—" : pPct(imp, 1, false)}</span><span>Piotroski F-score</span><span>${q?.pio ? `${q.pio.score}/${q.pio.of}` : "—"}</span><span>Beneish M-score</span><span class="${q?.beneish?.m > -1.78 ? "pw" : ""}">${q?.beneish ? pN(q.beneish.m) : "—"}</span>
      <span>Forward P/E</span><span>${pN(F.snap?.fpe, 1)}</span></div>`; }
  return `<div class="pgrid g3">${proPanel("MACRO " + go("macro"), "FRED + OECD", macro)}${proPanel("RISK " + go("risk"), "YOUR PORTFOLIO", risk)}${proPanel("THESIS WATCH " + go("thesis", t), "YOUR THESES", thesis)}</div>
    <div class="pgrid g4">${proPanel(`${esc(t)} AT A GLANCE ` + go("val", t), "YAHOO + YOUR DCF", tk)}${proPanel("SECTOR LEADERS / LAGGARDS " + go("rot"), "YAHOO · DAILY", rot)}${proPanel("CRYPTO " + go("crypto"), "LIVE", crypto)}${proPanel("CENTRAL BANKS · LATEST MOVES " + go("macro"), "BIS", cbs)}</div>`;
};
