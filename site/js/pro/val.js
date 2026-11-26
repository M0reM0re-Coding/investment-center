// Pro F4 VAL: valuation lab (plan module 06) + earnings quality / red flags (addition 5) + estimates, revisions, peers (addition 6).
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// Data: pro_data "fund_<YAHOO SYMBOL>" (robot/pro_data.py: Yahoo statements, estimates, analyst changes, peers).
// All scoring is done here so the formulas are visible. Statements are in the company's REPORTING currency (fcur);
// the share price is in the TRADING currency (cur). When they differ (e.g. TSM: TWD vs USD ADR) values are converted
// with today's FX and per-share uses "market cap ÷ price" shares, which also handles ADR ratios.
const VAL_TABS = [["dcf", "DCF"], ["quality", "QUALITY · RED FLAGS"], ["est", "ESTIMATES"], ["peers", "PEERS"]];
const valTab = () => proStore("ic_pro_vtab", "dcf");
const valKey = (y) => "fund_" + y.replace("^", "_");
const fxPerUsd = (c) => (c === "USD" ? 1 : Number(quotes[(c === "GBp" ? "GBP" : c) + "=X"]?.price) || null);
let valFxAsked = new Set();
function valFx(c) { if (!c || c === "USD" || quotes[c + "=X"] || valFxAsked.has(c)) return; valFxAsked.add(c); sb.rpc("get_quotes", { syms: [c + "=X"] }).then(({ data }) => { Object.assign(quotes, data || {}); proRefresh(); }); }

// ----- statement helpers: a = annual rows oldest -> newest
const vNum = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const vDiv = (a, b) => (vNum(a) === null || !vNum(b) ? null : a / b);
function valFlags(F, sector) {
  const A = (F?.fin?.a || []).filter((r) => r.TotalRevenue || r.NetIncome);
  if (A.length < 2) return null;
  const t = A[A.length - 1], p = A[A.length - 2], fin = /financial/i.test(sector || "");
  const ta = vNum(t.TotalAssets), tap = vNum(p.TotalAssets), avgTA = ta && tap ? (ta + tap) / 2 : ta;
  const out = { year: t.d, prev: p.d, fin, rows: [] };
  const row = (group, name, val, state, why, fmt = (v) => pN(v)) => out.rows.push({ group, name, val: val === null ? "n/a" : fmt(val), state: val === null ? "na" : state, why });
  // cash conversion + accruals
  const cc = vDiv(t.OperatingCashFlow, t.NetIncome);
  row("CASH", "Cash conversion (operating cash flow ÷ net income)", t.NetIncome > 0 ? cc : null, cc >= 0.9 ? "green" : cc >= 0.6 ? "amber" : "red", "Profit that doesn't turn into cash is the classic warning sign. Under 0.6 = look closer.", (v) => pN(v) + "x");
  const cc3 = A.slice(-3).filter((r) => r.NetIncome > 0 && vNum(r.OperatingCashFlow) !== null);
  if (cc3.length >= 2) { const v = cc3.reduce((s, r) => s + r.OperatingCashFlow, 0) / cc3.reduce((s, r) => s + r.NetIncome, 0); row("CASH", `Cash conversion, ${cc3.length}-year`, v, v >= 0.9 ? "green" : v >= 0.6 ? "amber" : "red", "Smooths out one odd year.", (x) => pN(x) + "x"); }
  const acc = vDiv(vNum(t.NetIncome) - vNum(t.OperatingCashFlow), avgTA);
  row("CASH", "Accruals ratio ((net income − operating cash) ÷ avg assets)", vNum(t.OperatingCashFlow) === null ? null : acc, acc <= 0.05 ? "green" : acc <= 0.1 ? "amber" : "red", "High accruals = earnings built on estimates, not cash (Sloan, 1996). Above 10% = red.", (v) => pPct(v * 100, 1, false));
  if (!fin) {
    const dso = (r) => vDiv(r.AccountsReceivable, r.TotalRevenue) === null ? null : (r.AccountsReceivable / r.TotalRevenue) * 365;
    const dio = (r) => vDiv(r.Inventory, r.CostOfRevenue) === null ? null : (r.Inventory / r.CostOfRevenue) * 365;
    const d0 = dso(t), d1 = dso(p), i0 = dio(t), i1 = dio(p);
    row("WORKING CAPITAL", `Days sales outstanding (DSO) ${d1 === null ? "" : pN(d1, 0) + " → "}`, d0, d1 === null ? "green" : d0 / d1 > 1.2 ? "red" : d0 / d1 > 1.1 ? "amber" : "green", "Customers taking longer to pay. Rising much faster than sales can mean pushed or doubtful sales.", (v) => pN(v, 0) + " days");
    row("WORKING CAPITAL", `Days inventory (DIO) ${i1 === null ? "" : pN(i1, 0) + " → "}`, i0, i1 === null ? "green" : i0 / i1 > 1.25 ? "red" : i0 / i1 > 1.1 ? "amber" : "green", "Stock piling up in the warehouse: demand slowing or write-downs ahead.", (v) => pN(v, 0) + " days");
  }
  // Piotroski F-score (9 tests, 1 point each)
  const roa = (r, base) => vDiv(r.NetIncome, base);
  const lev = (r) => vDiv(r.LongTermDebt ?? 0, r.TotalAssets), cr = (r) => vDiv(r.CurrentAssets, r.CurrentLiabilities);
  const gm = (r) => vDiv(vNum(r.TotalRevenue) - vNum(r.CostOfRevenue ?? null), r.TotalRevenue), at = (r, base) => vDiv(r.TotalRevenue, base);
  const pp = A.length >= 3 ? A[A.length - 3] : null;
  const tests = [["Return on assets > 0", roa(t, tap || ta) > 0], ["Operating cash flow > 0", vNum(t.OperatingCashFlow) > 0], ["Return on assets improved", pp ? roa(t, tap) > roa(p, pp.TotalAssets) : null],
    ["Cash flow > net income", vNum(t.OperatingCashFlow) > vNum(t.NetIncome)], ["Long-term debt ÷ assets fell", lev(t) !== null && lev(p) !== null ? lev(t) <= lev(p) : null],
    ["Current ratio improved", cr(t) !== null && cr(p) !== null ? cr(t) > cr(p) : null], ["No new shares issued", vNum(t.OrdinarySharesNumber) && vNum(p.OrdinarySharesNumber) ? t.OrdinarySharesNumber <= p.OrdinarySharesNumber * 1.005 : null],
    ["Gross margin improved", gm(t) !== null && gm(p) !== null && !fin ? gm(t) > gm(p) : null], ["Asset turnover improved", pp ? at(t, tap) > at(p, pp.TotalAssets) : null]];
  const known = tests.filter((x) => x[1] !== null), score = known.filter((x) => x[1]).length;
  out.pio = { score, of: known.length, tests };
  // Altman Z (public company version) - not meaningful for banks / insurers
  if (!fin && ta) {
    const mcap = F.snap?.mcap && F.snap?.price ? F.snap.mcap * (F.snap.fcur && F.snap.fcur !== F.snap.cur ? (fxPerUsd(F.snap.fcur) || NaN) / (fxPerUsd(F.snap.cur) || NaN) : 1) : null;
    const wc = vNum(t.CurrentAssets) - vNum(t.CurrentLiabilities), tl = vNum(t.TotalLiabilitiesNetMinorityInterest);
    const z = 1.2 * (wc / ta) + 1.4 * ((t.RetainedEarnings ?? 0) / ta) + 3.3 * ((t.EBIT ?? t.OperatingIncome ?? 0) / ta) + 0.6 * (mcap && tl ? mcap / tl : 0) + 1.0 * (t.TotalRevenue / ta);
    out.altman = Number.isFinite(z) ? z : null;
  }
  // Beneish M-score (8 variables)
  if (!fin && A.length >= 2) {
    const S = (r) => r.TotalRevenue, rcv = (r) => r.AccountsReceivable, g = (r) => (S(r) - (r.CostOfRevenue ?? 0)) / S(r);
    const aq = (r) => 1 - ((r.CurrentAssets ?? 0) + (r.NetPPE ?? 0)) / r.TotalAssets, dep = (r) => (r.ReconciledDepreciation ?? 0) / ((r.ReconciledDepreciation ?? 0) + (r.NetPPE ?? 0));
    const sga = (r) => (r.SellingGeneralAndAdministration ?? 0) / S(r), lv = (r) => ((r.CurrentLiabilities ?? 0) + (r.LongTermDebt ?? 0)) / r.TotalAssets;
    const v = { DSRI: (rcv(t) / S(t)) / (rcv(p) / S(p)), GMI: g(p) / g(t), AQI: aq(t) / aq(p), SGI: S(t) / S(p), DEPI: dep(p) / dep(t), SGAI: sga(t) / sga(p), LVGI: lv(t) / lv(p),
      TATA: ((t.NetIncome ?? 0) - (t.OperatingCashFlow ?? 0)) / t.TotalAssets };
    const ok = Object.values(v).every(Number.isFinite);
    out.beneish = ok ? { m: -4.84 + 0.92 * v.DSRI + 0.528 * v.GMI + 0.404 * v.AQI + 0.892 * v.SGI + 0.115 * v.DEPI - 0.172 * v.SGAI + 4.679 * v.TATA - 0.327 * v.LVGI, v } : null;
  }
  // debt
  const ic = vDiv(t.EBIT ?? t.OperatingIncome, t.InterestExpense);
  if (!fin) row("DEBT", "Interest cover (EBIT ÷ interest)", ic, ic >= 8 ? "green" : ic >= 3 ? "amber" : "red", "How many times profit covers the interest bill. Under 3 = little room if profit falls.", (v) => pN(v, 1) + "x");
  const nd = vNum(t.TotalDebt) === null ? null : (t.TotalDebt - (t.CashAndCashEquivalents ?? 0)) / (t.EBITDA || NaN);
  if (!fin) row("DEBT", "Net debt ÷ EBITDA", Number.isFinite(nd) ? nd : null, nd <= 2 ? "green" : nd <= 3.5 ? "amber" : "red", "Years of profit to repay debt. Below 0 = more cash than debt.", (v) => pN(v, 1) + "x");
  const dil = vNum(t.OrdinarySharesNumber) && vNum(p.OrdinarySharesNumber) ? (t.OrdinarySharesNumber / p.OrdinarySharesNumber - 1) * 100 : null;
  row("SHAREHOLDERS", "Share count change (1 year)", dil, dil <= 0.5 ? "green" : dil <= 3 ? "amber" : "red", "Rising = your slice is being diluted (stock pay, new shares). Falling = buybacks.", (v) => pPct(v, 1));
  return out;
}

function valQuality(F) {
  const sector = F.snap?.sector, q = valFlags(F, sector);
  if (!q) return proSoon("Not enough statement history.", "");
  const st = (s) => `<span class="plight ${s === "na" ? "" : s}"></span>`;
  const groups = [...new Set(q.rows.map((r) => r.group))];
  const pio = q.pio, z = q.altman, b = q.beneish;
  const zone = z === null || z === undefined ? null : z > 2.99 ? ["SAFE", "g"] : z >= 1.81 ? ["GREY ZONE", "y"] : ["DISTRESS ZONE", "r"];
  const bz = b ? (b.m > -1.78 ? ["LIKELY MANIPULATOR PROFILE", "r"] : b.m > -2.22 ? ["WATCH", "y"] : ["UNLIKELY", "g"]) : null;
  return `${q.fin ? `<div class="pnote pw">${esc(F.snap.name || "")} is a financial company (${esc(sector)}). Inventory, Altman Z and Beneish M were built for non-financial companies, so they're left out.</div>` : ""}
    <div class="pgrid g3">
    ${proPanel("PIOTROSKI F-SCORE", `FY ${esc(q.year)} vs ${esc(q.prev)}`, `<div class="pbigw"><div><div class="pbig ${pio.score >= 7 ? "up" : pio.score <= 3 ? "dn" : ""}">${pio.score}/${pio.of}</div><small>${pio.score >= 7 ? "STRONG" : pio.score <= 3 ? "WEAK" : "MIDDLE"} · 9 SIMPLE HEALTH TESTS</small></div></div>
      <table class="ptab">${pio.tests.map(([n, v]) => `<tr><td class="l">${n}</td><td>${v === null ? '<span class="pd">n/a</span>' : v ? '<span class="up">✓</span>' : '<span class="dn">✗</span>'}</td></tr>`).join("")}</table>`)}
    ${proPanel("ALTMAN Z-SCORE", "BANKRUPTCY RISK · FY " + esc(q.year), zone ? `<div class="pbigw"><div><div class="pbig">${pN(z)}</div><small><span class="ptag ${zone[1]}">${zone[0]}</span></small></div></div>
      <div class="pnote">Mixes working capital, retained profit, operating profit, market value vs debt and sales, all ÷ assets. Above 2.99 = safe, below 1.81 = distress (Altman, 1968). Works best for manufacturers; read it loosely for software or asset-light firms.</div>` : proSoon(q.fin ? "Not used for financial companies." : "Missing data.", ""))}
    ${proPanel("BENEISH M-SCORE", "EARNINGS MANIPULATION FLAG · FY " + esc(q.year), bz ? `<div class="pbigw"><div><div class="pbig">${pN(b.m)}</div><small><span class="ptag ${bz[1]}">${bz[0]}</span></small></div></div>
      <table class="ptab">${Object.entries(b.v).map(([k, v]) => `<tr><td class="l">${k}</td><td>${pN(v, 3)}</td><td class="l pd">${{ DSRI: "receivables vs sales", GMI: "gross margin getting worse", AQI: "soft assets growing", SGI: "sales growth", DEPI: "slower depreciation", SGAI: "overheads vs sales", LVGI: "leverage", TATA: "accruals ÷ assets" }[k]}</td></tr>`).join("")}</table>
      <div class="pnote">Above −1.78 = looks like past manipulators (Beneish, 1999). A <b>flag to investigate</b>, never proof: fast-growing honest companies can score high (big SGI).</div>` : proSoon(q.fin ? "Not used for financial companies." : "Missing data.", ""))}
    </div><div class="pgrid g2">${proPanel("EARNINGS QUALITY CHECKLIST", `YAHOO STATEMENTS · FY ${esc(q.year)}`, `<table class="ptab">${groups.map((g) => `<tr><th class="l" colspan="3">${g}</th></tr>${q.rows.filter((r) => r.group === g).map((r) =>
      `<tr><td class="l">${st(r.state)}${esc(r.name)}</td><td class="ph">${r.val}</td><td class="l pd">${esc(r.why)}</td></tr>`).join("")}`).join("")}</table>
      <div class="pnote">Audit-style ratios from the last two annual reports (Yahoo, unofficial; check the real filing before acting). Green / amber / red thresholds are common rules of thumb.</div>`, "s2")}</div>`;
}

// ----- DCF (free cash flow to the firm, 10 years + terminal value)
const valIn = (t) => safe(() => JSON.parse(localStorage.getItem("ic_pro_dcf_" + t)), null) || {};
function valDcfModel(F, inp) {
  const s = F.snap || {}, A = F.fin?.a || [], t = A[A.length - 1] || {};
  const fcf0 = inp.fcf ?? (vNum(t.FreeCashFlow) ?? (vNum(t.OperatingCashFlow) !== null && vNum(t.CapitalExpenditure) !== null ? t.OperatingCashFlow + t.CapitalExpenditure : null));
  const m = proGet("macro"), rf = inp.rf ?? (s.cur === "USD" ? m?.series?.DGS10?.at(-1)?.[1] ?? 4.5 : s.cur === "THB" ? 2.5 : 4.0);
  const beta = inp.beta ?? Math.min(2.5, Math.max(0.5, s.beta || 1)), erp = inp.erp ?? 5;
  const ke = rf + beta * erp, debt = vNum(t.TotalDebt) ?? 0, cash = vNum(t.CashAndCashEquivalents) ?? 0;
  const tax = Math.min(0.35, Math.max(0, vDiv(t.TaxProvision, t.PretaxIncome) ?? 0.2)), kd = Math.min(12, Math.max(2, (vDiv(t.InterestExpense, debt) ?? 0.05) * 100));
  const fx = s.fcur && s.fcur !== s.cur ? (fxPerUsd(s.cur) || NaN) / (fxPerUsd(s.fcur) || NaN) : 1;   // reporting -> trading currency
  const mcapF = s.mcap ? s.mcap / fx : null;   // market cap in the reporting currency
  const we = mcapF ? mcapF / (mcapF + debt) : 0.8, wacc = inp.wacc ?? (we * ke + (1 - we) * kd * (1 - tax));
  const estG = (F.est || []).find((e) => e.p === "+1y")?.growth, g1 = inp.g1 ?? Math.round(Math.min(25, Math.max(3, (estG ?? s.revG ?? 0.08) * 100)) * 10) / 10;
  const gT = inp.gt ?? 2.5, sharesEq = s.mcap && s.price ? s.mcap / s.price : s.shares;
  return { fcf0, rf, beta, erp, ke, kd, tax, wacc, g1, gT, debt, cash, fx, sharesEq, price: s.price, cur: s.cur, fcur: s.fcur || s.cur };
}
function valDcf(M, g1 = M.g1, wacc = M.wacc, gT = M.gT) {
  if (!(M.fcf0 > 0) || !(wacc > gT)) return null;
  let f = M.fcf0, pv = 0;
  for (let y = 1; y <= 10; y++) { const g = y <= 5 ? g1 : g1 + ((gT - g1) * (y - 5)) / 5; f *= 1 + g / 100; pv += f / (1 + wacc / 100) ** y; }
  const tv = (f * (1 + gT / 100)) / (wacc / 100 - gT / 100), pvTv = tv / (1 + wacc / 100) ** 10, ev = pv + pvTv, eq = ev - M.debt + M.cash;
  return { ev, eq, pvTv, tvShare: pvTv / ev, perShare: (eq * M.fx) / M.sharesEq };
}
function valReverse(M) {   // growth (years 1-5) that today's price implies
  if (!M.price || !(M.fcf0 > 0)) return null;
  let lo = -20, hi = 80;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2, v = valDcf(M, mid)?.perShare ?? -Infinity; if (v < M.price) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
function valDcfView(F, t) {
  const inp = valIn(t), M = valDcfModel(F, inp), r = valDcf(M), imp = valReverse(M), s = F.snap || {};
  if (s.fcur && s.fcur !== s.cur) { valFx(s.fcur); valFx(s.cur); }
  const fld = (k, l, v, step, suf) => `<label>${l}</label><span><input class="pin" type="number" step="${step}" style="width:${k === "fcf" ? 150 : 80}px" value="${Number.isFinite(v) ? Math.round(v * 100) / 100 : ""}" data-dcf="${k}" data-dcft="${esc(t)}"> ${suf}${inp[k] !== undefined ? ' <button class="pbtn" data-dcfreset="' + k + '" data-dcft="' + esc(t) + '" title="Back to the automatic value">auto</button>' : ""}</span>`;
  const big = (v) => pBig(v);
  const up = r && M.price ? (r.perShare / M.price - 1) * 100 : null;
  const sens = () => { if (!r) return ""; const ws = [-1, -0.5, 0, 0.5, 1].map((d) => M.wacc + d), gs = [-1, -0.5, 0, 0.5, 1].map((d) => M.gT + d);
    return `<table class="ptab"><tr><th class="l">WACC ↓ · TERMINAL g →</th>${gs.map((g) => `<th>${pN(g, 1)}%</th>`).join("")}</tr>${ws.map((w) => `<tr><td class="l">${pN(w, 1)}%</td>${gs.map((g) => { const v = valDcf(M, M.g1, w, g)?.perShare;
      const u = v && M.price ? (v / M.price - 1) * 100 : null; return `<td style="${u === null ? "" : `background:color-mix(in srgb, ${u >= 0 ? "var(--pup)" : "var(--pdn)"} ${Math.min(55, Math.abs(u) / 1.5)}%, transparent)`}">${v ? pN(v) : "—"}</td>`; }).join("")}</tr>`).join("")}</table>`; };
  const fin = /financial/i.test(s.sector || ""), ri = `<div class="pgrid g1">${valRiPanel(F, t, M, inp)}</div>`;   // banks: residual income first
  return (fin ? ri + `<div class="pnote pw" style="margin:0;padding:6px 10px">${esc(s.name || t)} is a bank / financial company: the cash-flow DCF below is shown for reference only and isn't meaningful (deposits and loans swamp "free cash flow"). Use the residual income value above.</div>` : "") + `<div class="pgrid g3">
    ${proPanel("INPUTS", "AUTO FROM DATA · EDIT ANY", `<div class="pform">
      ${fld("fcf", `Free cash flow, last year (${esc(M.fcur)})`, M.fcf0, "any", "")}
      ${fld("g1", "Growth years 1-5", M.g1, 0.5, "%")}${fld("gt", "Terminal growth", M.gT, 0.25, "%")}
      ${fld("rf", "Risk-free rate", M.rf, 0.1, "%")}${fld("beta", "Beta", M.beta, 0.05, "")}${fld("erp", "Equity risk premium", M.erp, 0.25, "%")}
      ${fld("wacc", "WACC (discount rate)", M.wacc, 0.1, "%")}</div>
      <div class="pnote">Auto values: FCF = last annual free cash flow; growth = analysts' next-year growth (kept between 3% and 25%), else revenue growth; years 6-10 fade to terminal growth.
      Cost of equity = risk-free + beta × premium = <b>${pN(M.ke, 1)}%</b>; cost of debt ${pN(M.kd, 1)}% before ${pN(M.tax * 100, 0)}% tax. Risk-free: ${M.cur === "USD" ? "US 10Y (MACRO)" : "a fixed guess for this currency; edit it"}.</div>`)}
    ${proPanel("RESULT", `${esc(M.fcur)} MODEL${M.fx !== 1 ? ` · CONVERTED TO ${esc(M.cur)} AT TODAY'S FX` : ""}`, r ? `<div class="pbigw"><div><div class="pbig">${pN(r.perShare)}</div><small>VALUE PER SHARE (${esc(M.cur)})</small></div>
      <div><div class="pbig ${up >= 0 ? "up" : "dn"}">${pPct(up, 0)}</div><small>vs PRICE ${pN(M.price)}</small></div></div>
      <div class="pkv"><span>Enterprise value</span><span>${big(r.ev)} ${esc(M.fcur)}</span><span>− debt + cash</span><span>${big(M.cash - M.debt)}</span><span>Equity value</span><span>${big(r.eq)} ${esc(M.fcur)}</span>
      <span>Share of value from after year 10</span><span class="${r.tvShare > 0.75 ? "pw" : ""}">${pN(r.tvShare * 100, 0)}%</span></div>
      ${r.tvShare > 0.75 ? '<div class="pnote pw">More than ¾ of the value comes from after year 10: small changes to WACC or terminal growth swing the answer a lot (see the table).</div>' : ""}` :
      proSoon(M.fcf0 > 0 ? "WACC must be above terminal growth." : "Free cash flow is negative or missing, so a cash-flow DCF doesn't work here. Use the peer multiples instead, or type a normalised FCF.", ""))}
    ${proPanel("REVERSE DCF", "WHAT TODAY'S PRICE ASSUMES", imp === null ? proSoon("Needs positive free cash flow and a price.", "") : `<div class="pbigw"><div><div class="pbig">${pN(imp, 1)}%</div><small>YEARLY FCF GROWTH FOR 5 YEARS, PRICED IN</small></div></div>
      <div class="pkv"><span>Analysts' next-year growth</span><span>${pPct(((F.est || []).find((e) => e.p === "+1y")?.growth ?? NaN) * 100, 1)}</span><span>Your input (years 1-5)</span><span>${pPct(M.g1, 1)}</span></div>
      <div class="pnote">Instead of guessing a value, ask: what growth does the market already expect? If that number looks too high to you, the stock is priced for perfection.</div>`)}
    </div><div class="pgrid g2">${proPanel("SENSITIVITY · VALUE PER SHARE", "WACC × TERMINAL GROWTH", sens() + `<div class="pnote">Green = above today's price, red = below. The middle cell is your base case.</div>`)}
    ${proPanel("FREE CASH FLOW HISTORY", `YAHOO · ANNUAL · ${esc(M.fcur)}`, `<table class="ptab"><tr><th class="l">YEAR</th><th>REVENUE</th><th>OPER. CASH</th><th>CAPEX</th><th>FCF</th><th>FCF MARGIN</th></tr>${(F.fin?.a || []).map((r) => `<tr><td class="l">${esc(r.d)}</td><td>${pBig(r.TotalRevenue)}</td><td>${pBig(r.OperatingCashFlow)}</td><td>${pBig(r.CapitalExpenditure)}</td><td class="ph">${pBig(r.FreeCashFlow)}</td><td>${r.FreeCashFlow && r.TotalRevenue ? pPct((r.FreeCashFlow / r.TotalRevenue) * 100, 1, false) : "—"}</td></tr>`).join("")}</table>`)}</div>` + (fin ? "" : ri);
}

function valEst(F) {
  const s = F.snap || {}, tg = F.target || {}, E = F.est || [];
  const lab = { "0q": "This quarter", "+1q": "Next quarter", "0y": "This year", "+1y": "Next year" };
  const tr = (e) => { const c = e.trend?.current, a = e.trend?.["90daysAgo"], b = e.trend?.["30daysAgo"]; return { d90: c && a ? (c / a - 1) * 100 : null, d30: c && b ? (c / b - 1) * 100 : null }; };
  const pt = (v) => (v && s.price ? ` <span class="pd">(${pPct((v / s.price - 1) * 100, 0)})</span>` : "");
  const W = 420, x = (v) => 10 + ((v - (tg.targetLowPrice * 0.9)) / ((tg.targetHighPrice * 1.1) - (tg.targetLowPrice * 0.9))) * (W - 20);
  const range = tg.targetLowPrice && tg.targetHighPrice && s.price ? `<svg class="pline ptgt" viewBox="0 0 ${W} 46" width="100%" style="aspect-ratio:${W}/46"><line class="gr" x1="${x(tg.targetLowPrice)}" x2="${x(tg.targetHighPrice)}" y1="20" y2="20" style="stroke-width:6;stroke:var(--pln)"/>
    <line x1="${x(tg.targetMeanPrice)}" x2="${x(tg.targetMeanPrice)}" y1="12" y2="28" style="stroke:var(--pacc);stroke-width:2"/><circle cx="${x(s.price)}" cy="20" r="5" style="fill:var(--ptk)"/>
    <text x="${x(tg.targetLowPrice)}" y="42" text-anchor="middle">${pN(tg.targetLowPrice, 0)}</text><text x="${x(tg.targetMeanPrice)}" y="8" text-anchor="middle">AVG ${pN(tg.targetMeanPrice, 0)}</text><text x="${x(tg.targetHighPrice)}" y="42" text-anchor="middle">${pN(tg.targetHighPrice, 0)}</text><text x="${x(s.price)}" y="42" text-anchor="middle" style="fill:var(--ptk)">NOW ${pN(s.price, 0)}</text></svg>` : "";
  const rec = (F.rec || [])[0], recTot = rec ? ["strongBuy", "buy", "hold", "sell", "strongSell"].reduce((a, k) => a + (rec[k] || 0), 0) : 0;
  const ups = (F.ud || []).filter((u) => u.act === "up").length, downs = (F.ud || []).filter((u) => u.act === "down").length;
  return `<div class="pgrid g21">${proPanel("EPS ESTIMATES + REVISIONS", "YAHOO (ANALYST CONSENSUS) · DAILY", `<table class="ptab"><tr><th class="l">PERIOD</th><th>EPS AVG</th><th>LOW-HIGH</th><th>ANALYSTS</th><th>GROWTH</th><th>REVENUE</th><th>EPS vs 30D AGO</th><th>vs 90D AGO</th><th>REVISIONS 30D</th></tr>
    ${E.filter((e) => lab[e.p]).map((e) => { const r = tr(e); return `<tr><td class="l">${lab[e.p]} <span class="pd">${esc(e.end || "")}</span></td><td class="ph">${pN(e.eps)}</td><td class="pd">${pN(e.epsLo)}–${pN(e.epsHi)}</td><td>${e.n ?? "—"}</td><td>${pUD(e.growth, pPct((e.growth ?? NaN) * 100, 1))}</td><td>${pBig(e.rev)}</td>
      <td>${pUD(r.d30, pPct(r.d30, 1))}</td><td>${pUD(r.d90, pPct(r.d90, 1))}</td><td><span class="up">▲${e.rev7?.upLast30days ?? 0}</span> <span class="dn">▼${e.rev7?.downLast30days ?? 0}</span></td></tr>`; }).join("")}</table>
    <div class="pnote"><b>Revisions matter more than the level:</b> when analysts keep raising next year's EPS, the stock has often kept beating the market for a while (earnings revision momentum). Falling estimates are an early warning.</div>`)}
    ${proPanel("PRICE TARGETS + RATINGS", "YAHOO · DAILY", `${range}<div class="pkv"><span>Average target</span><span>${pN(tg.targetMeanPrice)}${pt(tg.targetMeanPrice)}</span><span>Analysts</span><span>${tg.numberOfAnalystOpinions ?? "—"}</span>
      <span>Rating (1 = strong buy, 5 = sell)</span><span>${pN(tg.recommendationMean)}</span>${rec ? `<span>Now: buy / hold / sell</span><span><span class="up">${(rec.strongBuy || 0) + (rec.buy || 0)}</span> / ${rec.hold || 0} / <span class="dn">${(rec.sell || 0) + (rec.strongSell || 0)}</span></span>` : ""}
      <span>Recent upgrades / downgrades</span><span><span class="up">${ups}</span> / <span class="dn">${downs}</span></span></div>
      <div class="pnote">Targets lag the price and lean optimistic; watch the direction of changes, not the level.</div>`)}</div>
    <div class="pgrid g2">${proPanel("ANALYST ACTIONS", "YAHOO · LAST 20", `<table class="ptab"><tr><th class="l">DATE</th><th class="l">FIRM</th><th class="l">ACTION</th><th class="l">RATING</th><th>TARGET</th></tr>${(F.ud || []).map((u) =>
      `<tr><td class="l pd">${u.d ? new Date(u.d * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : ""}</td><td class="l">${esc(u.firm || "")}</td><td class="l"><span class="ptag ${u.act === "up" ? "g" : u.act === "down" ? "r" : ""}">${esc((u.act || "").toUpperCase())}</span></td>
      <td class="l">${u.from && u.from !== u.to ? `${esc(u.from)} → ` : ""}${esc(u.to || "")}</td><td>${u.pt ? `${u.ptPrev && u.ptPrev !== u.pt ? `<span class="pd">${pN(u.ptPrev, 0)} →</span> ` : ""}${pN(u.pt, 0)}` : "—"}</td></tr>`).join("")}</table>`, "s2")}</div>`;
}

const valPeerList = (t, F) => safe(() => JSON.parse(localStorage.getItem("ic_pro_peers_" + t)), null) || (F.peers || []).map((p) => p.sym);
function valPeers(F, t) {
  const list = valPeerList(t, F), have = Object.fromEntries((F.peers || []).map((p) => [p.sym, p]));
  const st = proStats(list.filter((y) => !have[y]));
  const fromStats = (y) => { const s = st[y]; return s ? { sym: y, name: s.name, pe: s.pe, fpe: s.fpe, ps: null, evEbitda: null, gm: s.grossMargin, om: s.opMargin, roe: s.roe, revG: s.revenueGrowth, mcap: s.marketCap } : { sym: y, missing: true }; };
  const rows = [{ ...F.snap, sym: F.sym, me: true }, ...list.map((y) => have[y] || fromStats(y))];
  const C = [["pe", "P/E", 1], ["fpe", "FWD P/E", 1], ["evEbitda", "EV/EBITDA", 1], ["ps", "P/S", 1], ["gm", "GROSS M.", 100], ["om", "OPER. M.", 100], ["roe", "ROE", 100], ["revG", "REV GROWTH", 100]];
  const med = (k) => { const v = rows.slice(1).map((r) => r[k]).filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
  const fmt = (v, m) => (Number.isFinite(v) ? (m === 100 ? pPct(v * 100, 1, false) : pN(v, 1)) : "—");
  return `<div class="pgrid g2">${proPanel("PEER COMPARISON", "YAHOO · DAILY", `<table class="ptab"><tr><th class="l">COMPANY</th><th>MKT CAP</th>${C.map((c) => `<th>${c[1]}</th>`).join("")}<th></th></tr>
    ${rows.map((r) => `<tr class="${r.me ? "sel" : ""}"><td class="l"><a class="t" href="${proHref("val", r.sym)}">${esc(r.sym)}</a> <span class="pd">${esc((r.name || "").slice(0, 26))}</span></td>${r.missing ? `<td colspan="${C.length + 1}" class="l pd">no data yet: add it to your watchlist and the robot collects it</td>` : `<td>${pBig(r.mcap)}</td>${C.map(([k, , m]) => `<td>${fmt(r[k], m)}</td>`).join("")}`}
      <td>${r.me ? "" : `<button class="px" data-peer-rm="${esc(r.sym)}" data-peer-t="${esc(t)}" title="Remove">×</button>`}</td></tr>`).join("")}
    <tr class="tot"><td class="l">PEER MEDIAN</td><td></td>${C.map(([k, , m]) => `<td>${fmt(med(k), m)}</td>`).join("")}<td></td></tr>
    <tr><td class="l">${esc(F.sym)} vs MEDIAN</td><td></td>${C.map(([k, , m]) => { const a = rows[0][k], b = med(k); if (!Number.isFinite(a) || !Number.isFinite(b) || !b) return "<td>—</td>";
      const d = m === 100 ? (a - b) * 100 : (a / b - 1) * 100; return `<td>${pUD(m === 100 ? d : -d, m === 100 ? (d > 0 ? "+" : "") + pN(d, 1) + "pp" : pPct(d, 0))}</td>`; }).join("")}<td></td></tr></table>
    <form class="pform" data-peer-add="${esc(t)}"><label>Add a peer</label><span><input class="pin" name="p" placeholder="e.g. AVGO" style="width:120px"> <button class="pbtn">Add</button> <button type="button" class="pbtn" data-peer-auto="${esc(t)}">Reset to Yahoo's list</button></span></form>
    <div class="pnote">Yahoo's list is "people also watch", not always true competitors (for NVDA it includes Tesla and Apple): add or remove peers to match the industry. Valuation multiples: lower = cheaper (red = pricier than peers); margins and growth: higher = better.</div>`, "s2")}</div>`;
}

PRO_VIEWS.val = () => {
  const t = proTk(), y = yahoo(t), F = proGet(valKey(y)), tab = valTab();
  const sub = `<div class="psub ptabs"><span class="ptkh"><b>${esc(t)}</b> ${F?.snap ? `${esc(F.snap.name || "")} · ${esc(F.snap.industry || F.snap.sector || "")} · <span class="ph">${pN(F.snap.price)} ${esc(F.snap.cur || "")}</span> · MKT CAP ${pBig(F.snap.mcap)}` : ""}</span>
    ${VAL_TABS.map(([k, l]) => `<button class="${k === tab ? "on" : ""}" data-vtab="${k}">${l}</button>`).join("")}
    <span class="sp"></span><a class="pbtn" href="#/charts/${encodeURIComponent(t)}">CHART</a><a class="pbtn" href="${proHref("thesis", t)}">THESIS</a></div>`;
  if (F === undefined) return sub + proWait();
  if (!F) return sub + `<div class="pgrid g2">${proPanel("VALUATION · " + esc(t), "", `<div class="pempty">No company data for <b>${esc(t)}</b> yet.<br>The robot collects it for your watchlist and holdings once a day (after <b>supabase/017_pro.sql</b> is run).<br>On this PC: <b>python robot/pro_data.py --local --only fund --tickers ${esc(t)}</b><br><br>Try one that has data: ${["NVDA", "AMD", "TSM", "GOOGL", "PTT", "SCB"].map((x) => `<a href="${proHref("val", x)}">${x}</a>`).join(" · ")}</div>`, "s2")}</div>`;
  const body = tab === "quality" ? valQuality(F) : tab === "est" ? valEst(F) : tab === "peers" ? valPeers(F, t) : valDcfView(F, t);
  return sub + body + `<div class="pnote">Source: Yahoo Finance (unofficial) · ${F._local ? "local preview" : "robot"} ${pAgo(F.updated || F._at)} · statements in ${esc(F.snap?.fcur || F.snap?.cur || "")}. Not investment advice.</div>`;
};

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-vtab],[data-dcfreset],[data-peer-rm],[data-peer-auto]"); if (!b) return;
  if (b.dataset.vtab) { proSet("ic_pro_vtab", b.dataset.vtab); return render(false); }
  if (b.dataset.dcfreset) { const t = b.dataset.dcft, v = valIn(t); delete v[b.dataset.dcfreset]; proSet("ic_pro_dcf_" + t, JSON.stringify(v)); return render(false); }
  if (b.dataset.peerAuto) { safe(() => localStorage.removeItem("ic_pro_peers_" + b.dataset.peerAuto)); return render(false); }
  if (b.dataset.peerRm) { const t = b.dataset.peerT, F = proCache[valKey(yahoo(t))]?.d; proSet("ic_pro_peers_" + t, JSON.stringify(valPeerList(t, F || {}).filter((x) => x !== b.dataset.peerRm))); render(false); }
});
document.addEventListener("change", (e) => {
  const k = e.target.dataset?.dcf; if (!k) return;
  const t = e.target.dataset.dcft, v = valIn(t), n = parseFloat(e.target.value);
  if (Number.isFinite(n)) v[k] = n; else delete v[k];
  proSet("ic_pro_dcf_" + t, JSON.stringify(v)); render(false);
});
document.addEventListener("submit", (e) => {
  const f = e.target.closest("[data-peer-add]"); if (!f) return;
  e.preventDefault();
  const t = f.dataset.peerAdd, p = yahoo(String(new FormData(f).get("p") || "").trim().toUpperCase()); if (!p) return;
  const F = proCache[valKey(yahoo(t))]?.d || {}, list = valPeerList(t, F);
  if (!list.includes(p)) list.push(p);
  proSet("ic_pro_peers_" + t, JSON.stringify(list)); render(false);
});

// ===== round 55: RESIDUAL INCOME model (FN451 Equity Securities Analysis) =====
// Value = book value today + the present value of future "excess profit" (profit above what shareholders require).
// Works for banks and insurers, where free cash flow means little (it's why SCB gets no DCF).
//   residual income in year t = (ROE − cost of equity) × book value at the start of year t
//   book value grows by the profit that's kept: B(t) = B(t−1) × (1 + ROE × (1 − payout))
//   years 1-5 at your ROE, then the excess return fades to zero by year 10 (competition), nothing after.
function valRiModel(F, inp, M) {
  const A = F.fin?.a || [], t = A[A.length - 1] || {};
  const B0 = vNum(t.StockholdersEquity);
  if (!(B0 > 0) || !M.sharesEq || !M.price) return null;
  const roes = A.slice(-4).map((r, i, a) => (i && vNum(r.NetIncome) !== null && vNum(a[i - 1].StockholdersEquity) > 0 ? r.NetIncome / ((r.StockholdersEquity + a[i - 1].StockholdersEquity) / 2) : null)).filter(Number.isFinite);
  const pays = A.slice(-3).map((r) => (vNum(r.NetIncome) > 0 && vNum(r.CashDividendsPaid) !== null ? Math.abs(r.CashDividendsPaid) / r.NetIncome : null)).filter((x) => Number.isFinite(x) && x < 1.5);
  const roe = inp.roe ?? (roes.length ? Math.round(pMean(roes) * 1000) / 10 : (F.snap?.roe ?? 0.1) * 100);
  const pay = inp.pay ?? (pays.length ? Math.round(Math.min(100, pMean(pays) * 100)) : 40);
  // a very low beta (common for banks: their price moves little day to day) understates the risk shareholders carry,
  // so the automatic cost of equity uses at least the market's average risk (beta 1)
  const ke = inp.ke ?? Math.round((M.rf + Math.max(1, M.beta) * M.erp) * 10) / 10;
  let B = B0, pv = 0; const rows = [];
  for (let y = 1; y <= 10; y++) {
    const ex = y <= 5 ? roe - ke : ((roe - ke) * (10 - y)) / 5, r = ke + ex, ri = (ex / 100) * B, d = ri / (1 + ke / 100) ** y;
    rows.push({ y, B, roe: r, ri, d }); pv += d; B = B * (1 + (r / 100) * (1 - pay / 100));
  }
  const eq = B0 + pv, perShare = (eq * M.fx) / M.sharesEq, bvps = (B0 * M.fx) / M.sharesEq;
  return { B0, roe, pay, ke, rows, pv, eq, perShare, bvps, up: (perShare / M.price - 1) * 100, pb: M.price / bvps, roes };
}
function valRiPanel(F, t, M, inp) {
  const R = valRiModel(F, inp, M), fin = /financial/i.test(F.snap?.sector || "");
  const learn = proLearn("FN451 Equity Securities Analysis", "Residual income: valuing a company from its book value", `<p>A DCF values the cash a company throws off. For a <b>bank</b> that doesn't work: taking deposits and making loans <i>is</i> its business, so "free cash flow" jumps around and means little. The <b>residual income model</b> starts from the balance sheet instead.</p>
    <p><b>Idea:</b> shareholders already own the <b>book value</b> (equity on the balance sheet). The company is worth more than that only if it earns <b>more than shareholders require</b>. Residual income = profit − (cost of equity × book value) = (ROE − cost of equity) × book value.</p>
    <p><b>Example:</b> book value 100, ROE 12%, cost of equity 10% → residual income = 2 a year. Worth more than book (P/B above 1). If ROE were 8%, the bank destroys value each year and should trade <b>below</b> book.</p>
    <p><b>Quick check you can do in your head:</b> fair P/B ≈ 1 + (ROE − cost of equity) ÷ (cost of equity − growth). <b>Accounting link:</b> it rests on the "clean surplus" relation you know from accounting: closing equity = opening equity + profit − dividends.</p>
    <p><b>Limits:</b> it trusts the book value (bad loans not yet written off make it too high) and is very sensitive to the ROE you assume.</p>`);
  if (!R) return proPanel("RESIDUAL INCOME · BOOK VALUE + EXCESS PROFIT", "FN451", proSoon("Needs book value (shareholders' equity), shares and a price.", "") + learn);
  const fld = (k, l, v, step, suf) => `<label>${l}</label><span><input class="pin" type="number" step="${step}" style="width:80px" value="${Number.isFinite(v) ? Math.round(v * 100) / 100 : ""}" data-dcf="${k}" data-dcft="${esc(t)}"> ${suf}${inp[k] !== undefined ? ' <button class="pbtn" data-dcfreset="' + k + '" data-dcft="' + esc(t) + '" title="Back to the automatic value">auto</button>' : ""}</span>`;
  const g = Math.min(R.ke - 0.5, (R.roe * (1 - R.pay / 100))), jpb = R.ke > g ? 1 + (R.roe - R.ke) / (R.ke - g) : null;
  return proPanel(`RESIDUAL INCOME · BOOK VALUE + EXCESS PROFIT${fin ? " · THE RIGHT MODEL FOR A BANK" : ""}`, `FN451 · ${esc(M.fcur)} BOOKS${M.fx !== 1 ? ` → ${esc(M.cur)}` : ""}`, `<div class="pgrid g3 pri">
    <div><div class="pform">${fld("roe", "ROE, years 1-5", R.roe, 0.5, "%")}${fld("ke", "Cost of equity", R.ke, 0.1, "%")}${fld("pay", "Dividend payout", R.pay, 5, "%")}</div>
      <div class="pnote">Auto: ROE = average of the last ${R.roes.length || 0} years (net profit ÷ average equity); cost of equity = risk-free + beta × premium, with beta at least 1 (a low beta understates a bank's risk); payout = dividends ÷ profit. ${M.cur === "USD" ? "" : "Risk-free for this currency is a fixed guess: edit it in the DCF inputs below."}</div></div>
    <div><div class="pbigw"><div><div class="pbig">${pN(R.perShare)}</div><small>VALUE PER SHARE (${esc(M.cur)})</small></div><div><div class="pbig ${R.up >= 0 ? "up" : "dn"}">${pPct(R.up, 0)}</div><small>vs PRICE ${pN(M.price)}</small></div></div>
      <div class="pkv"><span>Book value per share</span><span>${pN(R.bvps)}</span><span>+ excess profit (PV)</span><span>${pN(R.perShare - R.bvps)}</span><span>Price ÷ book (P/B) now</span><span>${pN(R.pb)}×</span><span>Fair P/B, quick formula</span><span>${jpb === null ? "—" : pN(jpb) + "×"}</span></div>
      <div class="pnote">${R.roe > R.ke ? `ROE ${pN(R.roe, 1)}% is above the ${pN(R.ke, 1)}% shareholders require, so it's worth more than book.` : `ROE ${pN(R.roe, 1)}% is below the ${pN(R.ke, 1)}% shareholders require: on these numbers it destroys value and is worth less than book.`}</div></div>
    <div><table class="ptab"><tr><th class="l">YEAR</th><th>BOOK (START)</th><th>ROE</th><th>EXCESS PROFIT</th><th>TODAY'S VALUE</th></tr>${R.rows.map((r) => `<tr><td class="l">${r.y}</td><td>${pBig(r.B)}</td><td>${pN(r.roe, 1)}%</td><td>${pUD(r.ri, pBig(r.ri))}</td><td>${pBig(r.d)}</td></tr>`).join("")}
      <tr class="tot"><td class="l">Total</td><td>${pBig(R.B0)}</td><td></td><td></td><td>${pBig(R.pv)}</td></tr></table></div></div>` + learn);
}
