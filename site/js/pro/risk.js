// Pro F6 RISK: portfolio risk + stress test (plan module 08 + addition 8) + trade plans from the chart's Long/Short tool.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// Inputs: your trades (Portfolio, table "trades") + 1 year of daily closes per holding (get_candles, Yahoo, same cache as Charts).
// Returns are in each stock's own currency; weights use today's value in your display currency (THB / USD).
// The stress test uses simple one-factor betas (each shock is estimated on its own, then added up), so it is a rough guide.
const RISK_F = [["^GSPC", "S&P 500"], ["^TNX", "US 10Y yield"], ["CL=F", "Oil (WTI)"], ["THB=X", "USD/THB"]];
const RISK_PRESETS = [["Sell-off", { spx: -10, y10: 0, oil: 0, fx: 0 }], ["Rate shock", { spx: 0, y10: 1, oil: 0, fx: 0 }], ["Oil spike", { spx: 0, y10: 0, oil: 30, fx: 0 }],
  ["Baht weakens", { spx: 0, y10: 0, oil: 0, fx: 5 }], ["2022 repeat", { spx: -20, y10: 2, oil: 30, fx: 8 }]];
const riskSc = () => safe(() => JSON.parse(localStorage.getItem("ic_pro_stress")), null) || { spx: -10, y10: 0.5, oil: 20, fx: 5 };
let riskPlans = null;   // Long / Short drawings from chart_drawings

function riskData() {
  if (state.trades === undefined || state.trades === null) { if (!state.tradesLoading && typeof loadTrades === "function") setTimeout(loadTrades, 0); return { wait: true }; }
  const bk = pfBook(state.trades), hold = bk.hold.filter((h) => h.vShow !== null);
  if (!hold.length) return { empty: true, bk };
  if (!quotes["THB=X"] && !state.pfPx) { state.pfPx = 1; pfPrices(); }
  const syms = [...hold.map((h) => h.y), ...RISK_F.map((f) => f[0])];
  const cands = syms.map((y) => proCandles(y, "1y"));
  if (cands.some((c) => !c)) return { wait: true, got: cands.filter(Boolean).length, of: syms.length };
  const maps = cands.map(proCloseMap);
  // ^TNX: Yahoo sends the yield (4.3) or 10x the yield (43) depending on the feed: normalise to %
  const tnx = maps[hold.length + 1]; const tv = Object.values(tnx); if (tv.length && pMean(tv) > 20) Object.keys(tnx).forEach((d) => { tnx[d] /= 10; });
  const { days, r } = proReturns(maps.slice(0, hold.length + 1).concat([maps[hold.length + 2], maps[hold.length + 3]]));
  const tdays = days.slice(1), dy = tdays.map((d, i) => tnx[d] !== undefined && tnx[days[i]] !== undefined ? tnx[d] - tnx[days[i]] : 0);   // daily change in pp
  const n = hold.length, w = hold.map((h) => h.w / 100), mkt = r[n], oil = r[n + 1], fx = r[n + 2];
  const port = tdays.map((_, k) => hold.reduce((s, h, i) => s + w[i] * r[i][k], 0));
  const per = hold.map((h, i) => {
    const ri = r[i], cl = days.map((d) => maps[i][d]);
    return { ...h, vol: pSd(ri) * Math.sqrt(252) * 100, beta: pBeta(ri, mkt), bRate: pCov(ri, dy) / ((pSd(dy) ** 2) || 1), bOil: pBeta(ri, oil), dd: pMaxDD(cl),
      ret1y: (cl[cl.length - 1] / cl[0] - 1) * 100, corrP: pCorr(ri, port), r: ri };
  });
  let lvl = 1; const curve = port.map((x) => (lvl *= 1 + x));
  const sorted = [...port].sort((a, b) => a - b), q5 = sorted[Math.floor(sorted.length * 0.05)] || 0, tail = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.05)));
  const total = bk.total;
  return { bk, per, n, days: tdays.length, total, port,
    pVol: pSd(port) * Math.sqrt(252) * 100, pBeta: pBeta(port, mkt), pDD: pMaxDD([1, ...curve]), pRet: (curve[curve.length - 1] - 1) * 100,
    var95: -q5 * total, cvar: -pMean(tail) * total, hhi: 1 / w.reduce((s, x) => s + x * x, 0),
    corr: per.map((a) => per.map((b) => pCorr(a.r, b.r))) };
}

function riskExposure(per) {
  const add = (o, k, v) => { o[k] = (o[k] || 0) + v; };
  const mk = {}, cu = {}, ind = {}, st = proStats(per.map((h) => h.y));
  per.forEach((h) => { add(mk, pfMarketOf(h.y), h.w); add(cu, h.cur === "GBp" ? "GBP" : h.cur, h.w); const pi = pfIndustry(h.y); add(ind, (pi && pi !== "Other" ? pi : st[h.y]?.sector) || "Not known yet", h.w); });
  const rows = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td class="l">${esc(k)}</td><td>${pN(v, 1)}%</td><td style="width:45%"><div class="pbar"><i style="width:${Math.min(100, v).toFixed(1)}%"></i></div></td></tr>`).join("");
  return `<table class="ptab"><tr><th class="l">MARKET</th><th></th><th></th></tr>${rows(mk)}<tr><th class="l">CURRENCY</th><th></th><th></th></tr>${rows(cu)}<tr><th class="l">INDUSTRY</th><th></th><th></th></tr>${rows(ind)}</table>`;
}

function riskStress(d) {
  const sc = riskSc(), cur = pfShow();
  const imp = d.per.map((h) => {
    const mk = h.beta * sc.spx, rt = h.bRate * sc.y10 * 100, oi = h.bOil * sc.oil;
    // currency: a USD stock is worth more baht when USD/THB rises (exact, not a beta); shown in THB, THB stocks don't move
    const fxm = cur === "THB" ? (h.cur === "USD" ? sc.fx : 0) : (h.cur === "THB" ? (1 / (1 + sc.fx / 100) - 1) * 100 : 0);
    const tot = mk + rt + oi + fxm;
    return { h, mk, rt, oi, fxm, tot, amt: (h.vShow * tot) / 100 };
  });
  const sum = imp.reduce((s, x) => s + x.amt, 0);
  const inp = (k, l, step) => `<label>${l}<input class="pin" type="number" step="${step}" value="${sc[k]}" data-stress="${k}"></label>`;
  return `<div class="psub">${RISK_PRESETS.map(([n, v]) => `<button data-stress-p='${JSON.stringify(v)}'>${n}</button>`).join("")}</div>
    <div class="pstr">${inp("spx", "S&amp;P 500 %", 1)}${inp("y10", "US 10Y pp", 0.25)}${inp("oil", "Oil %", 5)}${inp("fx", "USD/THB %", 1)}</div>
    <div class="pbigw"><div><div class="pbig ${sum >= 0 ? "up" : "dn"}">${pfMoney(sum, cur, true)}</div><small>ESTIMATED CHANGE · ${pPct((sum / (d.total || 1)) * 100)} OF PORTFOLIO</small></div></div>
    <table class="ptab"><tr><th class="l">HOLDING</th><th>MARKET</th><th>RATES</th><th>OIL</th><th>FX</th><th>TOTAL</th><th>${cur}</th></tr>
    ${imp.map((x) => `<tr><td class="t">${esc(x.h.t)}</td><td>${pUD(x.mk, pPct(x.mk, 1))}</td><td>${pUD(x.rt, pPct(x.rt, 1))}</td><td>${pUD(x.oi, pPct(x.oi, 1))}</td><td>${pUD(x.fxm, pPct(x.fxm, 1))}</td><td>${pUD(x.tot, pPct(x.tot, 1))}</td><td>${pUD(x.amt, pfMoney(x.amt, cur, true))}</td></tr>`).join("")}</table>
    <div class="pnote">Each column = that one shock times the stock's 1-year sensitivity (beta). The shocks overlap (oil and rates also move the S&amp;P), so the total is <b>rough</b>. FX is exact currency translation, not a guess.</div>`;
}

function riskPlansPanel(d) {
  if (riskPlans === null) { riskPlans = []; sb.from("chart_drawings").select("symbol,overlays").neq("symbol", "*").then(({ data }) => {
    riskPlans = []; (data || []).forEach((row) => (row.overlays || []).forEach((o) => { if ((o.name === "tvLong" || o.name === "tvShort") && o.points?.length >= 2) riskPlans.push({ t: row.symbol, o }); })); proRefresh(); }); }
  if (!riskPlans.length) return proSoon("No Long / Short drawings yet. Draw one on a chart (<b>Alt+9</b> CHART → Long position) and it shows here with what a stop-out would cost you.", "");
  const cur = pfShow(), hold = Object.fromEntries((d?.per || []).map((h) => [h.t, h]));
  return `<table class="ptab"><tr><th class="l">PLAN</th><th>ENTRY</th><th>TARGET</th><th>STOP</th><th>R/R</th><th>IF STOPPED</th><th>% PORT</th></tr>${riskPlans.map(({ t, o }) => {
    const P = o.points, e = P[0].value, tg = P[1].value, s = P[2]?.value ?? e - (tg - e) / 2, long = o.name === "tvLong", X = ktExt(o);
    const rr = Math.abs(e - s) ? Math.abs(tg - e) / Math.abs(e - s) : 0, h = hold[t];
    // shares: what you hold, else what the tool's own risk setting would buy
    const riskAmt = X.acct ? (X.riskT === "amt" ? X.risk ?? 0 : (X.acct * (X.risk ?? 1)) / 100) : 0;
    const sh = h ? h.sh : riskAmt && Math.abs(e - s) ? riskAmt / Math.abs(e - s) : 0;
    const loss = sh ? pfToShow(-Math.abs(e - s) * sh, pfCurOf(yahoo(t))) : null;
    return `<tr><td class="l"><a class="t" href="#/charts/${encodeURIComponent(t)}">${esc(t)}</a> <span class="ptag ${long ? "g" : "r"}">${long ? "LONG" : "SHORT"}</span>${h ? ' <span class="ptag">HELD</span>' : ""}</td><td>${pN(e)}</td><td>${pN(tg)}</td><td>${pN(s)}</td><td>${pN(rr)}</td>
      <td>${loss === null ? '<span class="pd">set size</span>' : pUD(loss, pfMoney(loss, cur, true))}</td><td>${loss === null || !d?.total ? "—" : pUD(loss, pPct((loss / d.total) * 100))}</td></tr>`; }).join("")}</table>
    <div class="pnote">Shares = what you hold; otherwise what the drawing's own risk setting would buy. Change it on the chart (double-click the drawing).</div>`;
}

PRO_VIEWS.risk = () => {
  const d = riskData(), cur = pfShow();
  if (d.wait) return `<div class="pgrid g3">${proPanel("RISK · PORTFOLIO", "YOUR TRADES + YAHOO · DAILY", proWait(d.of ? `LOADING PRICE HISTORY ${d.got}/${d.of}…` : "LOADING YOUR TRADES…"), "s3")}</div>`;
  if (d.empty) return `<div class="pgrid g21">${proPanel("RISK · PORTFOLIO", "YOUR TRADES", `<div class="pempty">No holdings yet.<br>Add your trades in <a href="#/portfolio">Portfolio</a> (normal mode) and RISK fills in by itself:<br>volatility, beta, drawdown, value-at-risk, correlation, exposure and the stress test.</div>`)}
    ${proPanel("TRADE PLANS · LONG / SHORT", "YOUR CHART DRAWINGS", riskPlansPanel(null))}</div>
    <div class="pgrid g1">${proPanel("EFFICIENT FRONTIER · BEST MIXES OF YOUR STOCKS", "FN452 · YAHOO DAILY · 2Y · 4,000 RANDOM MIXES", riskFrontier(null))}</div>`;
  const sig = (h) => `${h.t}|${(h.w || 0).toFixed(1)}`;
  const corrCell = (v) => `<td style="background:color-mix(in srgb, ${v >= 0 ? "var(--pdn)" : "var(--pup)"} ${Math.round(Math.abs(v) * 55)}%, transparent)">${pN(v)}</td>`;
  return `<div class="pgrid g4" data-sig="${esc(d.per.map(sig).join())}">
    ${proPanel("VALUE", `${cur} · TODAY'S FX`, `<div class="pbigw"><div><div class="pbig">${pfMoney(d.total, cur)}</div><small>${d.n} HOLDINGS · ${d.days} DAYS OF DATA</small></div></div>`)}
    ${proPanel("VOLATILITY · 1Y", "ANNUALISED", `<div class="pbigw"><div><div class="pbig">${pN(d.pVol, 1)}%</div><small>S&amp;P 500 IS USUALLY 15-20%</small></div></div>`)}
    ${proPanel("BETA vs S&amp;P 500", "1Y DAILY", `<div class="pbigw"><div><div class="pbig">${pN(d.pBeta)}</div><small>1.00 = MOVES WITH THE MARKET</small></div></div>`)}
    ${proPanel("VALUE AT RISK · 1 DAY 95%", "HISTORICAL, 1Y", `<div class="pbigw"><div><div class="pbig dn">${pfMoney(-d.var95, cur)}</div><small>1 DAY IN 20 IS WORSE · AVG OF THOSE ${pfMoney(-d.cvar, cur)}</small></div></div>`)}
  </div>
  <div class="pgrid g21">
    ${proPanel("HOLDINGS · RISK", "YAHOO · DAILY · 1Y", `<table class="ptab"><tr><th class="l">TICKER</th><th>WEIGHT</th><th>VOL</th><th>BETA</th><th>MAX DD</th><th>1Y</th><th>CORR→PORT</th><th>RISK SHARE</th></tr>
      ${(() => { const cv = d.per.map((h, i) => (h.w / 100) * d.per.reduce((s, g, j) => s + (g.w / 100) * d.corr[i][j] * g.vol * h.vol, 0)), tv = cv.reduce((s, x) => s + x, 0) || 1;
        return d.per.map((h, i) => `<tr><td class="l"><a class="t" href="${proHref("val", h.t)}">${esc(h.t)}</a></td><td>${pN(h.w, 1)}%</td><td>${pN(h.vol, 1)}%</td><td>${pN(h.beta)}</td><td class="dn">${pN(h.dd, 1)}%</td><td>${pUD(h.ret1y, pPct(h.ret1y, 1))}</td><td>${pN(h.corrP)}</td><td>${pN((cv[i] / tv) * 100, 1)}%</td></tr>`).join(""); })()}
      <tr class="tot"><td class="l">PORTFOLIO</td><td>100%</td><td>${pN(d.pVol, 1)}%</td><td>${pN(d.pBeta)}</td><td class="dn">${pN(d.pDD, 1)}%</td><td>${pUD(d.pRet, pPct(d.pRet, 1))}</td><td></td><td></td></tr></table>
      <div class="pnote"><b>Risk share</b> = how much of the portfolio's ups and downs come from that holding (weight × volatility × correlation). A small weight can still carry a big share. Effective number of holdings: <b>${pN(d.hhi, 1)}</b> (1 / sum of squared weights).</div>`)}
    ${proPanel("EXPOSURE", "YOUR TRADES · TODAY", riskExposure(d.per))}
  </div>
  <div class="pgrid g2">
    ${proPanel("STRESS TEST", "1Y BETAS · ESTIMATE", riskStress(d))}
    ${proPanel("CORRELATION · 1Y DAILY", "YAHOO", d.n > 1 ? `<table class="ptab pcorr"><tr><th class="l"></th>${d.per.map((h) => `<th>${esc(h.t)}</th>`).join("")}</tr>${d.per.map((h, i) => `<tr><td class="t">${esc(h.t)}</td>${d.corr[i].map(corrCell).join("")}</tr>`).join("")}</table>
      <div class="pnote">Near 1 = they move together (less diversification). Red = high, green = moving opposite.</div>` : proSoon("Needs 2 or more holdings.", ""))}
  </div>
  <div class="pgrid g2">${proPanel("TRADE PLANS · LONG / SHORT", "YOUR CHART DRAWINGS", riskPlansPanel(d), "s2")}</div>
  <div class="pgrid g1">${proPanel("EFFICIENT FRONTIER · BEST MIXES OF YOUR STOCKS", "FN452 · YAHOO DAILY · 2Y · 4,000 RANDOM MIXES", riskFrontier(d.per))}</div>`;
};

document.addEventListener("change", (e) => {
  const k = e.target.dataset?.stress; if (!k) return;
  const sc = riskSc(); sc[k] = Number(e.target.value) || 0; proSet("ic_pro_stress", JSON.stringify(sc)); render(false);
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-stress-p]"); if (!b) return;
  proSet("ic_pro_stress", b.dataset.stressP); render(false);
});

// ===== round 55: EFFICIENT FRONTIER (FN452 Portfolio Analysis and Asset Management) =====
// 4,000 random long-only mixes of your stocks (no shorting, weights add up to 100%), each one's yearly risk
// (volatility) and return from the last 2 years of daily prices. The upper-left edge of the cloud = the efficient frontier.
// Returns are in each stock's own currency (a Thai stock's in baht). Same seed every time, so the picture doesn't jump.
const rkRand = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let rkFrontC = { k: "", v: null };
function riskFrontier(hold) {
  const src = proStore("ic_pro_frsrc", hold?.length ? "hold" : "watch");
  const list = (src === "hold" && hold?.length ? hold.map((h) => ({ t: h.t, y: h.y, w: h.w / 100 })) : (state.settings?.watchlist || []).slice(0, 10).map((t) => ({ t, y: yahoo(t), w: null }))).slice(0, 10);
  const learn = proLearn("FN452 Portfolio Analysis and Asset Management", "The efficient frontier (Markowitz) in plain words", `<p>Every mix of the same stocks has a <b>risk</b> (how much its value swings, "volatility") and a <b>return</b>. Because stocks don't all move together, a mix can be <b>less risky than its parts</b>: that's diversification, and it works best when the stocks' correlation is low.</p>
    <p>Each dot is one possible mix. The <b>efficient frontier</b> is the upper-left edge: for each level of risk, the highest return you could have had. Anything below the edge is a worse deal (same risk, less return).</p>
    <p><b>Minimum variance</b> = the least risky mix. <b>Maximum Sharpe</b> = the best return per unit of risk, where Sharpe = (return − risk-free rate) ÷ volatility. It's the mix a CFA-style textbook would hold, plus or minus cash to set the risk level.</p>
    <p><b>Big limit:</b> the returns here are the <i>past</i> 2 years. Past returns are a very noisy guess of future ones, so "max Sharpe" weights swing a lot when the data changes. The minimum-variance mix only uses risk and correlation, which are steadier, so practitioners trust it more.</p>`);
  const tabs = `<div class="psub">${[["hold", "MY HOLDINGS"], ["watch", "MY WATCHLIST"]].map(([k, l]) => `<button class="${k === src ? "on" : ""}" data-frsrc="${k}"${k === "hold" && !hold?.length ? ' disabled title="no holdings yet"' : ""}>${l}</button>`).join("")}<span class="pd" style="margin-left:8px">${list.length} stocks · up to 10</span></div>`;
  if (list.length < 2) return tabs + proSoon("Needs at least 2 stocks (holdings or watchlist).", "") + learn;
  const cands = list.map((x) => proCandles(x.y, "2y"));
  if (cands.some((c) => !c)) return tabs + proWait(`LOADING PRICES ${cands.filter(Boolean).length}/${list.length}…`) + learn;
  const { days, r } = proReturns(cands.map(proCloseMap));
  if (days.length < 120) return tabs + proSoon("Not enough shared trading days between these stocks.", "") + learn;
  const n = list.length, mu = r.map((a) => pMean(a) * 252), cov = r.map((a) => r.map((b) => pCov(a, b) * 252));
  const m = proGet("macro"), rf = (m?.series?.DGS10?.at(-1)?.[1] ?? 4) / 100;
  const stat = (w) => { let v = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) v += w[i] * w[j] * cov[i][j]; const ret = w.reduce((s, x, i) => s + x * mu[i], 0), vol = Math.sqrt(Math.max(v, 0)); return { w, ret, vol, sh: vol ? (ret - rf) / vol : 0 }; };
  const key = list.map((x) => x.y).join() + "|" + days.length;
  if (rkFrontC.k !== key) { const rnd = rkRand(55), pts = [];
    for (let k = 0; k < 4000; k++) { const e = list.map(() => (-Math.log(1 - rnd() * 0.999999)) ** (k % 3 === 0 ? 3 : 1)), s = e.reduce((a, b) => a + b, 0); pts.push(stat(e.map((x) => x / s))); }
    list.forEach((_, i) => pts.push(stat(list.map((__, j) => +(i === j)))));   // each stock on its own
    rkFrontC = { k: key, v: pts }; }
  const pts = rkFrontC.v, minV = pts.reduce((a, b) => (b.vol < a.vol ? b : a)), maxS = pts.reduce((a, b) => (b.sh > a.sh ? b : a));
  const eqw = stat(list.map(() => 1 / n)), cur = list.every((x) => x.w !== null) ? stat(list.map((x) => x.w)) : null;
  const W = 640, H = 300, vx = Math.max(...pts.map((p) => p.vol)) * 1.05, ry = [Math.min(0, ...pts.map((p) => p.ret)), Math.max(...pts.map((p) => p.ret))];
  const X = (v) => 46 + (v / vx) * (W - 90), Y = (v) => 22 + ((ry[1] - v) / ((ry[1] - ry[0]) || 1)) * (H - 50);
  const dot = (p, cls, lab) => `<circle cx="${X(p.vol).toFixed(1)}" cy="${Y(p.ret).toFixed(1)}" r="6" class="${cls}"/><text x="${(X(p.vol) + 9).toFixed(1)}" y="${(Y(p.ret) + 4).toFixed(1)}" class="${cls}">${lab}</text>`;
  const svg = `<svg class="pfront" viewBox="0 0 ${W} ${H}" width="100%">${[0, 0.25, 0.5, 0.75, 1].map((f) => `<text x="${(46 + f * (W - 90)).toFixed(0)}" y="${H - 4}" text-anchor="middle">${pN(f * vx * 100, 0)}%</text>`).join("")}
    <text x="2" y="${Y(ry[1]) + 4}">${pN(ry[1] * 100, 0)}%</text><text x="2" y="${Y(ry[0])}">${pN(ry[0] * 100, 0)}%</text><line x1="46" x2="${W - 10}" y1="${Y(0)}" y2="${Y(0)}" class="z"/>
    ${pts.slice(0, 4000).map((p) => `<circle cx="${X(p.vol).toFixed(1)}" cy="${Y(p.ret).toFixed(1)}" r="1.6" style="opacity:${(0.25 + 0.6 * Math.max(0, Math.min(1, p.sh / (maxS.sh || 1)))).toFixed(2)}"/>`).join("")}
    ${pts.slice(4000).map((p, i) => `<circle cx="${X(p.vol).toFixed(1)}" cy="${Y(p.ret).toFixed(1)}" r="3.5" class="one"/><text x="${(X(p.vol) + 6).toFixed(1)}" y="${(Y(p.ret) - 5).toFixed(1)}" class="one">${esc(list[i].t)}</text>`).join("")}
    ${dot(minV, "mv", "MIN RISK")}${dot(maxS, "ms", "MAX SHARPE")}${dot(eqw, "eq", "EQUAL")}${cur ? dot(cur, "cu", "YOURS") : ""}<text x="${W - 10}" y="${H - 18}" text-anchor="end">RISK (VOLATILITY) →</text><text x="46" y="12">RETURN / YEAR ↑</text></svg>`;
  const col = (p) => `<td>${pN(p.ret * 100, 1)}%</td><td>${pN(p.vol * 100, 1)}%</td><td>${pN(p.sh, 2)}</td>`;
  const tbl = `<table class="ptab"><tr><th class="l">MIX</th><th>RETURN / YR</th><th>RISK / YR</th><th>SHARPE</th>${list.map((x) => `<th>${esc(x.t)}</th>`).join("")}</tr>
    ${[["Min risk", minV, "mv"], ["Max Sharpe", maxS, "ms"], ["Equal weights", eqw, "eq"], ...(cur ? [["Your weights", cur, "cu"]] : [])].map(([l, p, c]) => `<tr><td class="l"><i class="pfk-${c}"></i>${l}</td>${col(p)}${p.w.map((x) => `<td class="${x >= 0.3 ? "ph" : x < 0.02 ? "pd" : ""}">${pN(x * 100, 0)}%</td>`).join("")}</tr>`).join("")}</table>`;
  return tabs + `<div class="pgrid g2 pfrg"><div>${svg}</div><div>${tbl}<div class="pnote">Past 2 years, daily prices, long-only (no shorting). Risk-free ${pN(rf * 100, 1)}% (US 10Y). ${list.some((x) => /\.BK$/.test(x.y)) ? "Thai stocks are measured in baht, US stocks in dollars (currency moves not included). " : ""}Big weights from MAX SHARPE mostly mean "this stock went up a lot in the past 2 years", not a forecast.</div></div></div>` + learn;
}
document.addEventListener("click", (e) => { const b = e.target.closest("[data-frsrc]"); if (!b || b.disabled) return; proSet("ic_pro_frsrc", b.dataset.frsrc); render(false); });
