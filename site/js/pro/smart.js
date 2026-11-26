// Pro F9 SMART: "smart money lite" (plan module 02): FINRA daily short volume + options summary (Yahoo chain).
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// Data: pro_data "smart_<SYMBOL>" (robot/pro_data.py), US stocks only (FINRA + US options). Delayed by nature:
// short volume is published the next day; options are a snapshot when the robot ran.
// NOT yet: SEC insider trades (Form 4) + fund holdings (13F): the SEC asks every program for a contact email,
// and Claude must ask you which one to use first (FEATURES.md).
PRO_VIEWS.smart = () => {
  const t = proTk(), y = yahoo(t), us = !/[.^=]/.test(y), mode = smartMode();
  const modes = `<button class="${mode === "mkt" ? "on" : ""}" data-smode="mkt">WHOLE MARKET</button><button class="${mode === "one" ? "on" : ""}" data-smode="one">ONE STOCK: ${esc(t)}</button><span class="pd" style="margin:0 8px">type another ticker in the command line ( / ) to switch</span>`;
  if (mode === "mkt") return `<div class="psub ptabs">${modes}<span class="sp"></span></div>` + smartMarket();
  const sub = `<div class="psub ptabs">${modes}<span class="sp"></span><a class="pbtn" href="${proHref("val", t)}">VAL</a><a class="pbtn" href="#/charts/${encodeURIComponent(t)}">CHART</a></div>`;
  if (!us) return sub + `<div class="pgrid g2">${proPanel("SMART MONEY · " + esc(t), "", `<div class="pempty">${esc(t)} isn't a US stock. FINRA short volume and US options only cover US listings.<br>For futures positioning see <a href="#/pro/macro" data-mtab="pos">MACRO → POSITIONING</a>.</div>`, "s2")}</div>`;
  const S = proGet("smart_" + y);
  if (S === undefined) return sub + proWait();
  if (!S) return sub + `<div class="pgrid g2">${proPanel("SMART MONEY · " + esc(t), "", `<div class="pempty">No data for <b>${esc(t)}</b> yet. The robot collects it for your US watchlist and holdings.<br>On this PC: <b>python robot/pro_data.py --local --only smart --tickers ${esc(t)}</b></div>`, "s2")}</div>`;
  const sh = (S.short || []).map(([d, s, tot]) => [d, tot ? (s / tot) * 100 : null, s, tot]);
  const avg = sh.length ? pMean(sh.map((x) => x[1])) : null, last = sh.at(-1);
  const o = S.opt;
  const src = (w) => `${w} · ${S._local ? "LOCAL PREVIEW" : "ROBOT"} ${pAgo(S.updated || S._at)}`;
  // ---- answer-first cards (round 55)
  const A = S.ats || [], aAvg = A.length > 1 ? pMean(A.slice(0, -1).map((r) => r[1])) : null, aL = A.at(-1), aJ = aAvg && aL ? aL[1] / aAvg : null;
  const cDark = !aL ? proCard("n", "DARK POOLS · BIG FUNDS", "—", "No dark-pool weeks yet.")
    : proCard(aJ >= 1.4 ? "a" : "g", "DARK POOLS · BIG FUNDS", aJ >= 1.4 ? "Busy week" : aJ <= 0.7 ? "Quiet week" : "Normal week", `Big funds traded $${pBig(aL[3])} of ${esc(t)} privately in the week of ${esc(aL[0])}: ${pN(aJ, 1)}× their usual. Could be buying <i>or</i> selling, and it's 2-4 weeks old.`);
  const cShort = !last ? proCard("n", "SHORT SELLING", "—", "No FINRA rows.")
    : proCard(last[1] - avg >= 10 ? "r" : last[1] - avg >= 5 ? "a" : "g", "SHORT SELLING", last[1] - avg >= 5 ? "Higher than usual" : last[1] - avg <= -5 ? "Lower than usual" : "Normal",
      `${pN(last[1], 0)}% of yesterday's off-exchange volume was marked short, vs ${pN(avg, 0)}% on average. Mostly market makers' hedging, so only big jumps matter.`);
  const uc = (o?.unusual || []).filter((u) => u.t === "C").length, up = (o?.unusual || []).filter((u) => u.t === "P").length;
  const cOpt = !o ? proCard("n", "OPTIONS BETS", "—", "No options data.")
    : proCard(uc + up === 0 ? "g" : uc > up ? "g" : "a", "OPTIONS BETS", uc + up === 0 ? "Nothing unusual" : uc > up ? "Calls heavy" : up > uc ? "Puts heavy" : "Mixed",
      uc + up ? `${uc} call and ${up} put contract${uc + up > 1 ? "s" : ""} traded more than their open interest: new bets on a ${uc > up ? "rise" : up > uc ? "fall (or protection)" : "move"}. Put/call by volume ${pN(o.pcV)}.` : `No contract traded more than its open interest. Put/call by volume ${pN(o.pcV)} (above 1 = more puts).`);
  const cIv = !o?.atmIV ? proCard("n", "EXPECTED SWING", "—", "No implied volatility.")
    : proCard(o.atmIV > 0.6 ? "a" : "g", "EXPECTED SWING", `±${pN((o.atmIV * 100) / Math.sqrt(252), 1)}% a day`, `Options are priced for ${esc(t)} to move about this much a day (implied volatility ${pN(o.atmIV * 100, 0)}% a year)${o.gex < 0 ? "; dealers' hedging may speed moves up" : ""}.`);
  const cards = `<div class="pcards">${cDark}${cShort}${cOpt}${cIv}</div>`;
  return sub + cards + smartLab(t, y, o) + proDetails("smart", "short volume history, unusual contracts, dark-pool weeks, dealer gamma", `<div class="pgrid g4">
    ${proPanel("SHORT VOLUME · LAST DAY", src("FINRA"), last ? `<div class="pbigw"><div><div class="pbig ${last[1] > 60 ? "pw" : ""}">${pN(last[1], 1)}%</div><small>OF OFF-EXCHANGE VOLUME ON ${esc(last[0])} · ${sh.length}-DAY AVG ${pN(avg, 1)}%</small></div></div>` : proSoon("No FINRA rows.", ""))}
    ${proPanel("PUT / CALL", src("YAHOO OPTIONS"), o ? `<div class="pbigw"><div><div class="pbig ${o.pcV > 1 ? "dn" : o.pcV < 0.6 ? "up" : ""}">${pN(o.pcV)}</div><small>BY VOLUME · BY OPEN INTEREST ${pN(o.pcOI)}</small></div></div>` : proSoon("No options data.", ""))}
    ${proPanel("IMPLIED VOLATILITY", src("YAHOO OPTIONS"), o?.atmIV ? `<div class="pbigw"><div><div class="pbig">${pN(o.atmIV * 100, 0)}%</div><small>AT-THE-MONEY, NEAREST EXPIRY · ≈ ±${pN((o.atmIV * 100) / Math.sqrt(252), 1)}% A DAY</small></div></div>` : proSoon("—", ""))}
    ${proPanel("DEALER GAMMA (EST.)", src("OUR ESTIMATE"), o ? `<div class="pbigw"><div><div class="pbig ${o.gex >= 0 ? "up" : "dn"}">$${pBig(o.gex)}</div><small>PER 1% MOVE · ${o.gex >= 0 ? "POSITIVE: MOVES TEND TO BE DAMPED" : "NEGATIVE: MOVES CAN SPEED UP"}</small></div></div>` : proSoon("—", ""))}
    </div><div class="pgrid g2">
    ${proPanel("FINRA SHORT VOLUME %", src("FINRA REG SHO · DAILY"), proLine([{ n: "Short % of volume", p: sh.map((x) => [x[0], x[1]]) }], { fmt: (v) => pN(v, 0) + "%" }) +
      `<table class="ptab"><tr><th class="l">DAY</th><th>SHORT VOL</th><th>TOTAL VOL</th><th>SHORT %</th></tr>${[...sh].reverse().slice(0, 6).map((x) => `<tr><td class="l">${esc(x[0])}</td><td>${pBig(x[2])}</td><td>${pBig(x[3])}</td><td>${pN(x[1], 1)}%</td></tr>`).join("")}</table>
      <div class="pnote"><b>Careful:</b> this is short <i>volume</i> (trades marked short that day, much of it market makers' normal hedging), not short <i>interest</i> (bets still open). Around 40-50% is normal for big US stocks; watch for jumps vs its own average.</div>`)}
    ${proPanel("UNUSUAL OPTIONS (VOLUME > OPEN INTEREST)", src(`YAHOO · ${o?.exps?.length || 0} NEAREST EXPIRIES`), o?.unusual?.length ? `<table class="ptab"><tr><th class="l">CONTRACT</th><th>EXPIRY</th><th>VOLUME</th><th>OPEN INT.</th><th>VOL ÷ OI</th><th>IV</th><th>LAST</th></tr>
      ${o.unusual.map((u) => `<tr><td class="l"><span class="ptag ${u.t === "C" ? "g" : "r"}">${u.t === "C" ? "CALL" : "PUT"}</span> ${pN(u.k, u.k % 1 ? 1 : 0)}</td><td>${esc(u.exp)}</td><td>${pBig(u.v)}</td><td>${pBig(u.oi)}</td><td class="ph">${pN(u.v / Math.max(1, u.oi), 1)}x</td><td>${u.iv ? pN(u.iv * 100, 0) + "%" : "—"}</td><td>${pN(u.last)}</td></tr>`).join("")}</table>
      <div class="pnote">Volume above open interest = mostly new positions opened that day. A free "lite" version of paid flow tools: no sweep / block detection, and we can't see whether it was bought or sold.</div>` : proSoon("Nothing unusual in the snapshot.", ""))}</div>
    <div class="pgrid g21">${proPanel("BIG MONEY · DARK POOLS (ATS)", src("FINRA OTC TRANSPARENCY · WEEKLY"), smartAts(S, y))}
    ${proPanel("NOT INCLUDED YET", "", `<div class="psoon">Insider buying / selling (SEC Form 4) and fund holdings (13F) are free from the SEC, but the SEC asks every program to send a contact email. <b>Waiting for you to choose which email to use.</b><br>Live block trades, option sweeps and order-book data need paid feeds (not planned).</div>`)}</div>`);
};
// Dark pools = private venues where funds trade big blocks without showing the order first. FINRA publishes the weekly
// totals 2-4 weeks late. Share of all volume = dark-pool shares ÷ the week's total volume (Yahoo daily candles).
function smartAts(S, y) {
  const a = S.ats || [];
  if (!a.length) return proSoon("No dark-pool weeks yet. The robot adds them on its next daily run.", "");
  const d = proCandles(y, "1y"), wv = {};
  (d?.t || []).forEach((ts, i) => { const x = new Date(ts * 1000), m = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate() - ((x.getUTCDay() + 6) % 7))).toISOString().slice(0, 10); wv[m] = (wv[m] || 0) + (d.v?.[i] || 0); });
  const rows = a.map(([w, sh, tr, usd]) => ({ w, sh, tr, usd, pct: wv[w] ? (sh / wv[w]) * 100 : null }));
  const avg = pMean(rows.slice(0, -1).map((r) => r.sh)), last = rows.at(-1), jump = avg ? (last.sh / avg - 1) * 100 : null;
  return `<div class="pbigw"><div><div class="pbig ${jump > 40 ? "pw" : ""}">$${pBig(last.usd)}</div><small>TRADED IN DARK POOLS, WEEK OF ${esc(last.w)} · ${pPct(jump, 0)} VS ${rows.length - 1}-WEEK AVG</small></div>
    <div><div class="pbig">${last.pct === null ? "—" : pN(last.pct, 1) + "%"}</div><small>OF ALL ${esc(y)} VOLUME THAT WEEK</small></div></div>
    ${proLine([{ n: "Dark-pool shares", p: rows.map((r) => [r.w, r.sh / 1e6]) }], { fmt: (v) => pN(v, 0) + "M", w: 1000, h: 260 })}
    <table class="ptab"><tr><th class="l">WEEK OF</th><th>SHARES</th><th>$ VALUE</th><th>TRADES</th><th>AVG TRADE</th><th>% OF VOLUME</th></tr>${[...rows].reverse().slice(0, 5).map((r) => `<tr><td class="l">${esc(r.w)}</td><td>${pBig(r.sh)}</td><td>$${pBig(r.usd)}</td><td>${pBig(r.tr)}</td><td>${pN(r.sh / Math.max(1, r.tr), 0)} sh</td><td>${r.pct === null ? "—" : pN(r.pct, 1) + "%"}</td></tr>`).join("")}</table>
    <div class="pnote">A week far above its average = big players were busy (buying <i>or</i> selling: FINRA doesn't say which). Published 2-4 weeks late, so read it as "who has been building or unloading", not as a live signal.</div>`;
}

// ===== round 55: OPTIONS LAB (FN456 Derivatives Analysis): Black-Scholes price, Greeks and a payoff chart =====
// Inputs start from the live stock price and the options market's own implied volatility (Yahoo snapshot).
// Black-Scholes assumes: European option (exercise only at expiry), no dividends, constant volatility and rate.
const pNcdf = (x) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; };
const pNpdf = (x) => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
function bsOpt(type, S, K, T, r, v) {   // T in years, r and v as decimals
  if (T <= 0) return { px: Math.max(0, type === "C" ? S - K : K - S), delta: type === "C" ? +(S > K) : -(S < K), gamma: 0, theta: 0, vega: 0, pItm: type === "C" ? +(S > K) : +(S < K) };
  const d1 = (Math.log(S / K) + (r + v * v / 2) * T) / (v * Math.sqrt(T)), d2 = d1 - v * Math.sqrt(T), df = Math.exp(-r * T);
  const px = type === "C" ? S * pNcdf(d1) - K * df * pNcdf(d2) : K * df * pNcdf(-d2) - S * pNcdf(-d1);
  const theta = (-(S * pNpdf(d1) * v) / (2 * Math.sqrt(T)) - (type === "C" ? r * K * df * pNcdf(d2) : -r * K * df * pNcdf(-d2))) / 365;
  return { px, delta: type === "C" ? pNcdf(d1) : pNcdf(d1) - 1, gamma: pNpdf(d1) / (S * v * Math.sqrt(T)), theta, vega: (S * pNpdf(d1) * Math.sqrt(T)) / 100, pItm: type === "C" ? pNcdf(d2) : pNcdf(-d2) };
}
function smartLab(t, y, o) {
  const d = proCandles(y, "1mo"), S = [...(d?.c || [])].reverse().find((v) => typeof v === "number");
  const learn = proLearn("FN456 Derivatives Analysis", "Options in 5 minutes", `<p>An <b>option</b> is the right, not the obligation, to buy (<b>call</b>) or sell (<b>put</b>) a stock at a fixed price (the <b>strike</b>) until a date (<b>expiry</b>). The buyer pays a <b>premium</b> up front: that's the most a buyer can lose. The seller collects it and takes the risk.</p>
    <p><b>Payoff at expiry</b> (the hockey-stick line on the chart): a call is worth max(0, price − strike); a put max(0, strike − price). Break-even for a bought call = strike + premium.</p>
    <p><b>Black-Scholes</b> prices the option today from 5 inputs: stock price, strike, time left, interest rate and <b>volatility</b> (how much the stock swings). More volatility or more time = a more expensive option, because there's more chance of a big move.</p>
    <p><b>The Greeks</b> = how the price reacts: <b>delta</b> ≈ change in option price for a $1 stock move (also a rough chance of ending in the money); <b>theta</b> = value lost per day as time passes; <b>vega</b> = change for a 1-point change in volatility; <b>gamma</b> = how fast delta changes.</p>
    <p><b>Limits:</b> US options are American (can be exercised early) and pay no attention to dividends here, and real volatility isn't constant, so treat the result as a fair-value estimate, not the market price.</p>`);
  if (!S) return `<div class="pgrid g1">${proPanel("OPTIONS LAB · " + esc(t), "BLACK-SCHOLES", proWait() + learn)}</div>`;
  const cb = proGet("cb"), fed = (cb?.rows || []).find((r) => r.bank === "Fed")?.rate;
  let q = safe(() => JSON.parse(localStorage.getItem("ic_pro_opt") || "null"), null);
  if (!q || q.t !== t) q = { t, type: "C", side: "B", K: +(S >= 100 ? Math.round(S / 5) * 5 : S.toFixed(S >= 10 ? 0 : 2)), days: 30, iv: o?.atmIV ? +(o.atmIV * 100).toFixed(0) : 35 };
  const r = (fed ?? 4) / 100, v = Math.max(1, +q.iv) / 100, T = Math.max(0, +q.days) / 365, sg = q.side === "B" ? 1 : -1;
  const g = bsOpt(q.type, S, +q.K, T, r, v), prem = g.px, be = q.type === "C" ? +q.K + prem : +q.K - prem;
  // payoff chart: profit per share at expiry (line) and today (dashed), stock price from 70% to 130% of now
  const W = 760, H = 230, lo = S * 0.7, hi = S * 1.3, xs = Array.from({ length: 121 }, (_, i) => lo + ((hi - lo) * i) / 120);
  const pay = xs.map((x) => sg * (Math.max(0, q.type === "C" ? x - q.K : q.K - x) - prem)), now = xs.map((x) => sg * (bsOpt(q.type, x, +q.K, T, r, v).px - prem));
  const all = [...pay, ...now, 0], ymin = Math.min(...all), ymax = Math.max(...all), X = (x) => 40 + ((x - lo) / (hi - lo)) * (W - 50), Y = (p) => 10 + ((ymax - p) / ((ymax - ymin) || 1)) * (H - 30);
  const line = (arr) => arr.map((p, i) => `${X(xs[i]).toFixed(1)},${Y(p).toFixed(1)}`).join(" ");
  const svg = `<svg class="poptsvg" viewBox="0 0 ${W} ${H}" width="100%"><line x1="40" x2="${W - 10}" y1="${Y(0)}" y2="${Y(0)}" class="z"/>
    <line x1="${X(S)}" x2="${X(S)}" y1="10" y2="${H - 20}" class="s"/><text x="${X(S) + 4}" y="20">NOW ${pN(S)}</text>
    <line x1="${X(+q.K)}" x2="${X(+q.K)}" y1="10" y2="${H - 20}" class="k"/><text x="${X(+q.K) + 4}" y="34">STRIKE ${pN(+q.K)}</text>
    <polyline points="${line(now)}" class="n"/><polyline points="${line(pay)}" class="p"/>
    <text x="40" y="${H - 4}">${pN(lo, 0)}</text><text x="${W - 60}" y="${H - 4}">${pN(hi, 0)}</text><text x="2" y="${Y(ymax) + 8}">${pN(ymax)}</text><text x="2" y="${Y(ymin)}">${pN(ymin)}</text></svg>`;
  const sel = (id, val, opts) => `<select id="${id}" class="popt">${opts.map(([k, l]) => `<option value="${k}"${String(k) === String(val) ? " selected" : ""}>${l}</option>`).join("")}</select>`;
  const inp = (id, val, step, w = 80) => `<input id="${id}" class="popt" type="number" step="${step}" value="${val}" style="width:${w}px">`;
  const maxL = q.side === "B" ? prem : q.type === "C" ? Infinity : +q.K - prem, maxG = q.side === "B" ? (q.type === "C" ? Infinity : +q.K - prem) : prem;
  const body = `<div class="poptin">${sel("optSide", q.side, [["B", "BUY"], ["S", "SELL"]])} ${sel("optType", q.type, [["C", "CALL"], ["P", "PUT"]])} strike ${inp("optK", q.K, "any")} expiring in ${inp("optD", q.days, 1, 60)} days · volatility ${inp("optV", q.iv, 1, 60)}% <span class="pd">(options market now: ${o?.atmIV ? pN(o.atmIV * 100, 0) + "%" : "—"}) · rate ${pN(r * 100)}% (Fed)</span></div>
    <div class="pgrid g2 poptg"><div>${svg}<div class="pnote"><b class="pa">Solid</b> = profit per share at expiry. <b>Dashed</b> = profit if you closed it today (Black-Scholes value). Per share: one US contract = 100 shares.</div></div>
    <div><table class="ptab"><tr><td class="l">Fair value (premium)</td><td class="ph">${pN(prem)}</td><td class="l pd">${pN(prem * 100, 0)} per contract</td></tr>
      <tr><td class="l">Break-even at expiry</td><td>${pN(be)}</td><td class="l pd">${pPct((be / S - 1) * 100, 1)} from now</td></tr>
      <tr><td class="l">Chance it ends in the money</td><td>${pN(g.pItm * 100, 0)}%</td><td class="l pd">risk-neutral N(d2)</td></tr>
      <tr><td class="l">Most you can lose</td><td class="dn">${maxL === Infinity ? "unlimited" : pN(maxL)}</td><td class="l pd">per share</td></tr>
      <tr><td class="l">Most you can make</td><td class="up">${maxG === Infinity ? "unlimited" : pN(maxG)}</td><td class="l pd">per share</td></tr>
      <tr><th class="l" colspan="3">GREEKS (FOR YOUR SIDE)</th></tr>
      <tr><td class="l">Delta</td><td>${pN(sg * g.delta)}</td><td class="l pd">option moves ≈ ${pN(Math.abs(g.delta))} per $1 of stock</td></tr>
      <tr><td class="l">Theta</td><td>${pUD(sg * g.theta, pN(sg * g.theta, 3))}</td><td class="l pd">per day from time passing</td></tr>
      <tr><td class="l">Vega</td><td>${pN(sg * g.vega, 3)}</td><td class="l pd">per 1-point change in volatility</td></tr>
      <tr><td class="l">Gamma</td><td>${pN(sg * g.gamma, 4)}</td><td class="l pd">change in delta per $1</td></tr></table></div></div>`;
  return `<div class="pgrid g1">${proPanel(`OPTIONS LAB · ${esc(t)} ${pN(S)}`, "BLACK-SCHOLES · YOUR INPUTS · A CALCULATOR, NOT A TRADE", body + learn)}</div>`;
}
document.addEventListener("change", (e) => {
  if (!e.target.classList?.contains("popt")) return;
  const g = (id) => document.getElementById(id)?.value;
  proSet("ic_pro_opt", JSON.stringify({ t: proTk(), side: g("optSide"), type: g("optType"), K: +g("optK") || 0, days: Math.max(0, +g("optD") || 0), iv: Math.max(1, +g("optV") || 30) }));
  render(false);
});

// ===== round 56: WHOLE MARKET view (the default) or ONE STOCK =====
// Robot (pro_data.py smart job, once a day after the US close) saves "smart_market":
//   short = every US stock in FINRA's daily file added up · idx = options on SPY / QQQ / IWM · pcHist = their put/call by day
//   board = your US stocks + the 30 biggest US stocks: short % vs own average, unusual calls / puts, dark-pool week vs average
// "Every transaction" isn't available free (billions of trades a day, paid feeds); these are the free totals.
const smartMode = () => proStore("ic_pro_smode", "mkt");
// Each stock vs ITS OWN normal: one stock's daily short % swings ±8 points by itself, so "unusual" = 1.5 × its own
// usual swing (z-score). Dark pools vs the rest of the market that week (a busy week for everyone isn't news).
function smartRead(b, atsMed) {   // what is unusual about one leaderboard row, in words
  const d = b.sh !== null && b.shAvg !== null ? b.sh - b.shAvg : 0, z = b.shSd ? d / b.shSd : d / 8, why = [], uc = b.uc || 0, up = b.up || 0;
  const rel = b.atsJ && atsMed ? b.atsJ / atsMed : null;
  if (uc >= 3 && uc >= up * 2) why.push(["calls heavy", "g", "BETS ON A RISE"]);
  else if (up >= 3 && up >= uc * 2) why.push(["puts heavy", "y", "HEDGING / BETS ON A FALL"]);
  else if (uc + up >= 12) why.push(["calls and puts both very busy", "", "BIG MOVE EXPECTED"]);
  if (z >= 1.5) why.push([`short volume ${pN(b.sh, 0)}% vs its usual ${pN(b.shAvg, 0)}% (${pN(z, 1)}× its normal swing)`, "r", "SHORTING UP"]);
  else if (z <= -1.5) why.push([`short volume unusually low (${pN(b.sh, 0)}%)`, "g", "SHORTS BACKING OFF"]);
  if (rel >= 1.4) why.push([`dark pool ${pN(b.atsJ, 1)}× its normal, busier than most`, "", "BIG FUNDS BUSY"]);
  const score = Math.max(0, Math.abs(z) - 1) * 2 + (uc >= up * 2 || up >= uc * 2 ? Math.max(uc, up) / 3 : 0) + Math.max(0, (rel || 1) - 1) * 4;
  return { score, why, z, rel, tag: why[0] || ["", "", "NORMAL"] };
}
function smartMarket() {
  const M = proGet("smart_market");
  if (M === undefined) return proWait();
  if (!M) return `<div class="pgrid g1">${proPanel("WHOLE MARKET", "", `<div class="pempty">No market data yet. The robot adds it on its next run after the US close.<br>On this PC: <b>python robot/pro_data.py --local --only smart</b></div>`)}</div>`;
  const src = `FINRA + YAHOO · ${M._local ? "LOCAL PREVIEW" : "ROBOT"} ${pAgo(M.updated || M._at)}`;
  const sh = (M.short || []).map(([d, s, t]) => [d, t ? (s / t) * 100 : null]).filter((x) => x[1] !== null), shL = sh.at(-1)?.[1], shA = sh.length ? pMean(sh.map((x) => x[1])) : null, shD = shL - shA;
  const spy = M.idx?.SPY, H = (M.pcHist || []).filter((h) => Number.isFinite(h[1])), pcA = H.length >= 5 ? pMean(H.slice(0, -1).map((h) => h[1])) : null, pcD = spy?.pcV && pcA ? spy.pcV - pcA : null;
  const aj0 = (M.board || []).map((b) => b.atsJ).filter(Number.isFinite).sort((x, y) => x - y), atsMed = aj0.length ? aj0[Math.floor(aj0.length / 2)] : null;
  const B = (M.board || []).map((b) => ({ ...b, R: smartRead(b, atsMed) })), big10 = B.filter((b) => !b.mine || ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "AVGO", "TSLA", "BRK-B", "JPM"].includes(b.y)).slice(0, 10);
  const aj = big10.map((b) => b.atsJ).filter(Number.isFinite), ajM = aj.length ? pMean(aj) : null;
  // overall mood: hedging signs vs relaxed signs
  const caut = (shD >= 1.5) + (pcD !== null ? pcD >= 0.15 : spy?.pcV >= 1.3) + (spy?.atmIV >= 0.25), calm = (shD <= -1.5) + (pcD !== null ? pcD <= -0.15 : spy?.pcV && spy.pcV <= 0.9) + (spy?.atmIV && spy.atmIV <= 0.14);
  const [word, cls] = caut >= 2 ? ["CAUTIOUS", "pa"] : calm >= 2 ? ["RELAXED · RISK-ON", "up"] : ["NORMAL", ""];
  const mood = `<div class="pverd"><div><small>BIG MONEY MOOD · US STOCKS</small><div class="pbig ${cls}">${word}</div><small>from short selling, index options and dark pools</small></div>
    <div><div class="pverdt">${word === "CAUTIOUS" ? "Investors are paying up for protection and/or short selling is above normal. Read it as \"big players are hedging\", not as a crash signal: hedging often peaks near short-term lows." : word === "RELAXED · RISK-ON" ? "Little demand for protection and below-normal short selling: investors are comfortable. Comfortable markets can keep rising, but they're also the ones that get surprised." : "Short selling and demand for protection are close to normal: no strong message from big money today."} <span class="pd">Rule-based reading of yesterday's data, not a forecast.</span></div></div></div>`;
  const cards = `<div class="pcards">${proCard(shD >= 1.5 ? "a" : shD <= -1.5 ? "g" : "g", "SHORT SELLING · ALL US STOCKS", Number.isFinite(shL) ? `${pN(shL, 1)}%` : "—", Number.isFinite(shL) ? `Share of yesterday's off-exchange volume marked short, across <b>every</b> US stock in FINRA's file, vs ${pN(shA, 1)}% on average (${sh.length} days). ${shD >= 1.5 ? "Above normal." : shD <= -1.5 ? "Below normal." : "About normal."}` : "No FINRA file.")}
    ${proCard(pcD !== null ? (pcD >= 0.15 ? "a" : "g") : "n", "OPTIONS MOOD · S&P 500 (SPY)", spy?.pcV ? `Put/call ${pN(spy.pcV)}` : "—", spy?.pcV ? (pcA !== null ? `vs ${pN(pcA)} on average over ${H.length - 1} days. ${pcD >= 0.15 ? "More puts than usual: investors are buying protection." : pcD <= -0.15 ? "Fewer puts than usual: investors feel safe." : "About normal."}` : `More than 1 = more puts (protection) than calls. The average builds up one day at a time (${H.length} so far).`) : "No options data.")}
    ${proCard(spy?.atmIV >= 0.25 ? "a" : "g", "EXPECTED SWING · S&P 500", spy?.atmIV ? `±${pN((spy.atmIV * 100) / Math.sqrt(252), 1)}% a day` : "—", spy?.atmIV ? `Options price the S&P 500 at ${pN(spy.atmIV * 100, 0)}% a year (a VIX-like reading). ${spy.atmIV >= 0.25 ? "Nervous market." : spy.atmIV <= 0.14 ? "Very calm market." : "Normal range."}` : "")}
    ${proCard(ajM >= 1.3 ? "a" : "g", "DARK POOLS · BIGGEST 10", ajM ? `${pN(ajM, 1)}× normal` : "—", ajM ? `Big funds traded the 10 largest stocks privately at ${pN(ajM, 1)}× their usual weekly amount (week of ${esc(big10.find((b) => b.atsW)?.atsW || "")}, 2-4 weeks old). Buying or selling isn't known.` : "No dark-pool weeks yet.")}</div>`;
  const f = proStore("ic_pro_sboard", "all"), rows = B.filter((b) => f === "all" || b.mine).sort((a, b) => b.R.score - a.R.score);
  const board = `<div class="psub">${[["all", `ALL (${B.length})`], ["mine", `YOUR STOCKS (${B.filter((b) => b.mine).length})`]].map(([k, l]) => `<button class="${k === f ? "on" : ""}" data-sboard="${k}">${l}</button>`).join("")}</div>
    <table class="ptab idtab pwrapt"><tr><th class="l">#</th><th class="l">STOCK</th><th class="l">WHAT'S UNUSUAL</th><th>SHORT %</th><th>vs ITS AVG</th><th>UNUSUAL CALLS / PUTS</th><th>PUT/CALL</th><th>DARK POOL vs ITS AVG</th><th class="l">READ</th></tr>
    ${rows.map((b, i) => `<tr data-sgo="${esc(b.y)}"><td class="l pd">${i + 1}</td><td class="l"><span class="t">${esc(b.y)}</span>${b.mine ? ' <span class="ptag">YOURS</span>' : ""}</td><td class="l">${b.R.why.map((w) => esc(w[0])).join(" · ") || '<span class="pd">nothing stands out</span>'}</td>
      <td>${b.sh === null ? "—" : pN(b.sh, 0) + "%"}</td><td>${b.sh === null ? "—" : `<span class="${b.R.z >= 1.5 ? "dn" : b.R.z <= -1.5 ? "up" : "pd"}">${(b.sh - b.shAvg > 0 ? "+" : "") + pN(b.sh - b.shAvg, 1)}</span>`}</td><td>${b.uc ?? 0} / ${b.up ?? 0}</td><td>${pN(b.pcV)}</td><td>${b.atsJ ? pN(b.atsJ, 1) + "×" : "—"}</td>
      <td class="l"><span class="ptag ${b.R.tag[1]}">${b.R.tag[2]}</span></td></tr>`).join("") || '<tr><td class="l pd" colspan="9">No stocks yet.</td></tr>'}</table>
    <div class="pmean"><span class="ptag">HOW TO READ</span><span>Each stock is compared with its <i>own</i> normal (short volume: 1.5× its usual day-to-day swing; dark pools: vs the rest of the market that week). Sorted by how unusual it is today. Click a row to open that stock's own view. Unusual = traded more than the open contracts (new bets); we can't see if they were bought or sold.</span></div>`;
  const idx = `<table class="ptab pwrapt"><tr><th class="l">INDEX FUND</th><th>P/C VOL</th><th>P/C OPEN</th><th>SWING / DAY</th><th class="l">GAMMA</th></tr>${Object.entries(M.names || {}).map(([y, n]) => { const o = M.idx?.[y];
    return `<tr><td class="l"><span class="t">${esc(y)}</span> <span class="pd">${esc(n)}</span></td><td>${pN(o?.pcV)}</td><td>${pN(o?.pcOI)}</td><td>${o?.atmIV ? "±" + pN((o.atmIV * 100) / Math.sqrt(252), 1) + "%" : "—"}</td><td class="l">${o ? (o.gex >= 0 ? '<span class="up">+ damped</span>' : '<span class="dn">− faster</span>') : "—"}</td></tr>`; }).join("")}</table>
    <div class="pnote">Dealer gamma: + = option dealers' hedging tends to calm moves; − = it can speed them up.</div>`;
  return mood + cards + `<div class="pgrid g21">${proPanel("LEADERBOARD · MOST UNUSUAL TODAY", "YOUR US STOCKS + THE 30 BIGGEST · " + src, board)}<div class="pcol">${proPanel("INDEX OPTIONS", src, idx)}${proPanel("SHORT SELLING · ALL US STOCKS", "FINRA DAILY FILE · " + src, proLine([{ n: "Short % (all stocks)", p: sh }], { fmt: (v) => pN(v, 1) + "%" }) + `<div class="pnote">Normal is around 45-50%; most of it is market makers hedging. What matters is a jump vs this line's own average.</div>`)}</div></div>`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-smode],[data-sboard],[data-sgo]"); if (!b) return;
  if (b.dataset.smode) proSet("ic_pro_smode", b.dataset.smode);
  if (b.dataset.sboard) proSet("ic_pro_sboard", b.dataset.sboard);
  if (b.dataset.sgo) { proSetTk(b.dataset.sgo); proSet("ic_pro_smode", "one"); location.hash = proHref("smart", b.dataset.sgo); return; }
  render(false);
});
