// Pro F2 MACRO: regime + recession lights, surprise index, rates / curve / liquidity / credit, global central banks, positioning.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// Data: pro_data "macro" (FRED, US Treasury, OECD), "cb" (BIS, IMF, FRED), "cot" (CFTC), made by robot/pro_data.py.
// Surprise index: your econ_events (actual vs forecast) - it only grows as results come in (US results via FRED since 25 Nov).
const MAC_TABS = [["overview", "OVERVIEW"], ["rates", "RATES & LIQUIDITY"], ["global", "GLOBAL & CENTRAL BANKS"], ["pos", "POSITIONING"]];
const macTab = () => proStore("ic_pro_mtab", "overview");
// Rule-of-thumb playbook per regime (common sector-rotation teaching, not a forecast)
const MAC_PLAY = {
  Goldilocks: ["Growth up, inflation down", "Tech, Consumer Discretionary, Communication", "Utilities, Energy"],
  Reflation: ["Growth up, inflation up", "Energy, Materials, Financials, Industrials", "Long bonds, Utilities"],
  Stagflation: ["Growth down, inflation up", "Energy, Staples, Gold, short bonds", "Tech, Discretionary"],
  Slowdown: ["Growth down, inflation down", "Staples, Health Care, Utilities, long Treasuries", "Cyclicals, Small caps"],
};

// Line chart: series = [{n: name, p: [[date, value], ..], c: css class}]; y axis on the right, first/last date at the bottom
function proLine(series, opt = {}) {
  const W = opt.w || 600, H = opt.h || 170, padR = 44, padB = 16, all = series.flatMap((s) => s.p.map((x) => x[1])).filter(Number.isFinite);
  if (all.length < 2) return proSoon("Not enough data yet.", "");
  let lo = Math.min(...all, opt.zero ? 0 : Infinity), hi = Math.max(...all, opt.zero ? 0 : -Infinity); if (hi === lo) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const xs = series.flatMap((s) => s.p.map((x) => +new Date(x[0]))), x0 = Math.min(...xs), x1 = Math.max(...xs) || x0 + 1;
  const X = (d) => ((+new Date(d) - x0) / ((x1 - x0) || 1)) * (W - padR), Y = (v) => H - padB - ((v - lo) / (hi - lo)) * (H - padB - 6);
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  const f = opt.fmt || ((v) => pN(v, Math.abs(hi - lo) > 50 ? 0 : 2));
  return `<svg class="pline" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="none" style="aspect-ratio:${W}/${H}">
    ${ticks.map((t) => `<line class="gr" x1="0" x2="${W - padR}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}"/><text x="${W - padR + 4}" y="${(Y(t) + 3).toFixed(1)}">${f(t)}</text>`).join("")}
    ${opt.zero && lo < 0 && hi > 0 ? `<line class="z" x1="0" x2="${W - padR}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}"/>` : ""}
    ${series.map((s, i) => `<polyline class="s${i} ${s.c || ""}" points="${s.p.filter((x) => Number.isFinite(x[1])).map((x) => `${X(x[0]).toFixed(1)},${Y(x[1]).toFixed(1)}`).join(" ")}"/>`).join("")}
    <text x="0" y="${H - 3}">${esc(new Date(x0).toISOString().slice(0, 7))}</text><text x="${W - padR}" y="${H - 3}" text-anchor="end">${esc(new Date(x1).toISOString().slice(0, 10))}</text></svg>
    ${series.length > 1 ? `<div class="pleg">${series.map((s, i) => `<span class="s${i}"><i></i>${esc(s.n)}</span>`).join("")}</div>` : ""}`;
}
const macSince = (s, days) => { if (!s?.length) return []; const cut = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10); return s.filter((x) => x[0] >= cut); };
const macBack = (s, days) => { if (!s?.length) return null; const cut = new Date(+new Date(s[s.length - 1][0]) - days * 864e5).toISOString().slice(0, 10); const o = s.filter((x) => x[0] <= cut); return o.length ? o[o.length - 1][1] : null; };
const macSrc = (d, what) => `${what} · ${d?._local ? "LOCAL PREVIEW" : "ROBOT"} ${pAgo(d?.updated || d?._at)}`;

// ----- surprise index (addition 1): your econ_events with both actual and forecast
let macEcon = null;
function macSurprise() {
  if (macEcon === null) { macEcon = []; sb.from("econ_events").select("at,currency,title,impact,forecast,actual,result").not("actual", "is", null)
    .gte("at", new Date(Date.now() - 120 * 864e5).toISOString()).order("at", { ascending: false }).limit(300).then(({ data }) => { macEcon = data || []; proRefresh(); }); }
  const rows = macEcon.filter((e) => e.result && e.forecast);
  const w = (e) => (e.impact === "High" ? 2 : 1), sc = (e) => (e.result === "better" ? 1 : e.result === "worse" ? -1 : 0);
  const by = {}; rows.forEach((e) => { (by[e.currency] ||= []).push(e); });
  const idx = Object.entries(by).map(([c, l]) => { const ww = l.reduce((s, e) => s + w(e), 0); return { c, n: l.length, v: ww ? (l.reduce((s, e) => s + w(e) * sc(e), 0) / ww) * 100 : 0 }; });
  const list = rows.slice(0, 8).map((e) => `<tr><td class="l pd">${new Date(e.at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</td><td class="l">${esc(e.currency)} ${esc(e.title)}</td><td>${esc(e.actual)}</td><td class="pd">${esc(e.forecast)}</td><td><span class="ptag ${e.result === "better" ? "g" : e.result === "worse" ? "r" : ""}">${esc(e.result.toUpperCase())}</span></td></tr>`).join("");
  return `${idx.length ? `<div class="pbigw">${idx.map((x) => `<div><div class="pbig ${x.v > 0 ? "up" : x.v < 0 ? "dn" : ""}">${x.v > 0 ? "+" : ""}${x.v.toFixed(0)}</div><small>${esc(x.c)} · ${x.n} RELEASE${x.n > 1 ? "S" : ""}</small></div>`).join("")}</div>` : ""}
    ${rows.length ? `<table class="ptab"><tr><th class="l">DAY</th><th class="l">RELEASE</th><th>ACTUAL</th><th>FCST</th><th>RESULT</th></tr>${list}</table>` : proSoon("No results with a forecast yet.", "")}
    <div class="pnote">+100 = every release beat the forecast, −100 = every one missed (High impact counts double, last 120 days). <b>Young index:</b> results are only collected since 25 Nov 2026 (US via FRED), so it fills in over the coming weeks.</div>`;
}

function macOverview(m) {
  const r = m.regime, S = m.series || {};
  const quad = r ? `<div class="pquad">${[["Reflation", "GROWTH ↑ INFL ↑"], ["Goldilocks", "GROWTH ↑ INFL ↓"], ["Stagflation", "GROWTH ↓ INFL ↑"], ["Slowdown", "GROWTH ↓ INFL ↓"]].map(([n, s]) =>
    `<div class="${n === r.name ? "on" : ""}"><b>${n.toUpperCase()}</b><small>${s}</small></div>`).join("")}</div>
    <div class="pkv"><span>Growth: OECD leading indicator (US)</span><span>${pN(r.cli)} vs ${pN(r.cli3m)} 3M AGO ${r.growth === "up" ? "▲" : "▼"}</span>
    <span>Inflation: ${esc(r.core_name || "core inflation")}</span><span>${pN(r.core)}% vs ${pN(r.core3m)}% ${r.inflation === "up" ? "▲" : "▼"}</span>
    <span>Usually helped</span><span class="up">${esc(MAC_PLAY[r.name][1])}</span><span>Usually hurt</span><span class="dn">${esc(MAC_PLAY[r.name][2])}</span></div>
    <div class="pnote">A rule of thumb from how sectors behaved in past regimes, <b>not a forecast</b>. Data to ${esc(r.cli_at)} (CLI) and ${esc(String(r.core_at).slice(0, 7))} (PCE).</div>` : proSoon("Regime needs FRED + OECD data.", "");
  const lights = (m.lights || []).map((l) => `<tr><td class="l"><span class="plight ${l.s}"></span>${esc(l.n)}</td><td>${typeof l.v === "number" ? pN(l.v, Math.abs(l.v) > 1000 ? 0 : 2) : "—"}</td><td class="l pd">${esc(l.why)}</td></tr>`).join("");
  const nRed = (m.lights || []).filter((l) => l.s === "red").length, nAmb = (m.lights || []).filter((l) => l.s === "amber").length;
  const key = [["DFEDTARU", "Fed funds (upper)", 2], ["DGS2", "US 2Y", 2], ["DGS10", "US 10Y", 2], ["T10Y2Y", "2s10s spread", 2], ["T5YIE", "5Y breakeven inflation", 2],
    ["CPIAUCSL_YOY", "CPI y/y", 2], ["CPILFESL_YOY", "Core CPI y/y", 2], ["PCEPILFE_YOY", "Core PCE y/y", 2], ["UNRATE", "Unemployment", 1], ["ICSA", "Initial claims", 0],
    ["A191RL1Q225SBEA", "Real GDP q/q ann.", 1], ["UMCSENT", "Consumer sentiment", 1], ["DTWEXBGS", "Dollar index (broad)", 2]];
  const krow = ([id, n, d]) => { const s = S[id]; if (!s?.length) return ""; const v = s[s.length - 1][1], b = macBack(s, 31), ch = b === null ? null : v - b;
    return `<tr><td class="l">${n}</td><td class="ph">${pN(v, d)}</td><td>${ch === null ? "—" : pUD(ch, (ch > 0 ? "+" : "") + pN(ch, d))}</td><td>${proSpark(macSince(s, 730).map((x) => x[1]), 110, 20)}</td><td class="pd">${esc(s[s.length - 1][0].slice(0, 10))}</td></tr>`; };
  // market-implied path (rough): 2Y yield vs the Fed funds midpoint, in 0.25 steps
  const ff = S.DFEDTARU?.length && S.DFEDTARL?.length ? (S.DFEDTARU.at(-1)[1] + S.DFEDTARL.at(-1)[1]) / 2 : null, y2 = S.DGS2?.at(-1)?.[1];
  const steps = ff !== null && y2 ? (y2 - ff) / 0.25 : null;
  return `<div class="pgrid g3">
    ${proPanel("REGIME", macSrc(m, "OECD + FRED"), quad)}
    ${proPanel(`RECESSION LIGHTS · ${nRed} RED · ${nAmb} AMBER`, macSrc(m, "FRED + OECD"), `<table class="ptab">${lights}</table><div class="pnote">Each light alone is a weak signal; several red together is what mattered before past recessions.</div>`)}
    ${proPanel("ECONOMIC SURPRISE INDEX", "YOUR ECON CALENDAR · ACTUAL vs FORECAST", macSurprise())}
  </div><div class="pgrid g21">
    ${proPanel("US MACRO DASHBOARD", macSrc(m, "FRED"), `<table class="ptab"><tr><th class="l">SERIES</th><th>LAST</th><th>1M CHG</th><th>2Y</th><th>AS OF</th></tr>${key.map(krow).join("")}</table>`)}
    ${proPanel("FED PATH · MARKET ESTIMATE", "FRED · DAILY · ROUGH", ff === null ? proSoon("Needs FRED data.", "") : `<div class="pbigw"><div><div class="pbig ${steps < 0 ? "dn" : "up"}">${steps > 0 ? "+" : ""}${pN(steps, 1)}</div><small>QUARTER-POINT ${steps < 0 ? "CUTS" : "HIKES"} PRICED, ~2 YEARS</small></div></div>
      <div class="pkv"><span>Fed funds midpoint</span><span>${pN(ff)}%</span><span>US 2Y yield</span><span>${pN(y2)}%</span><span>Gap</span><span>${pN((y2 - ff) * 100, 0)} bp</span></div>
      <div class="pnote">The 2-year yield roughly averages where traders think the Fed rate will be over 2 years. Gap ÷ 0.25 = moves priced. <b>An estimate</b>, not CME FedWatch (that uses futures prices we can't get free).</div>`)}
  </div>`;
}

function macRates(m) {
  const S = m.series || {}, cv = m.curve;
  const T = ["1 Mo", "3 Mo", "6 Mo", "1 Yr", "2 Yr", "3 Yr", "5 Yr", "7 Yr", "10 Yr", "20 Yr", "30 Yr"];
  let curve = proSoon("No Treasury curve.", "");
  if (cv?.today) {
    const all = Object.values(cv).flatMap((c) => T.map((t) => c.y[t])).filter(Number.isFinite), lo = Math.min(...all) - 0.15, hi = Math.max(...all) + 0.15;
    const W = 600, H = 190, X = (i) => 10 + (i / (T.length - 1)) * (W - 60), Y = (v) => H - 20 - ((v - lo) / (hi - lo)) * (H - 30);
    curve = `<svg class="pline" viewBox="0 0 ${W} ${H}" width="100%" style="aspect-ratio:${W}/${H}">${[lo + 0.15, (lo + hi) / 2, hi - 0.15].map((t) => `<line class="gr" x1="0" x2="${W - 50}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${W - 46}" y="${Y(t) + 3}">${pN(t)}%</text>`).join("")}
      ${["1y", "6m", "1m", "today"].map((k, j) => cv[k] ? `<polyline class="c${j}" points="${T.map((t, i) => (Number.isFinite(cv[k].y[t]) ? `${X(i)},${Y(cv[k].y[t])}` : "")).filter(Boolean).join(" ")}"/>` : "").join("")}
      ${T.map((t, i) => `<text x="${X(i)}" y="${H - 4}" text-anchor="middle">${t.replace(" Mo", "M").replace(" Yr", "Y")}</text>`).join("")}</svg>
      <div class="pleg">${["1y", "6m", "1m", "today"].map((k, j) => cv[k] ? `<span class="c${j}"><i></i>${k.toUpperCase()} (${esc(cv[k].d)})</span>` : "").join("")}</div>`;
  }
  const liq = m.liq || [];
  const sp = [["T10Y2Y", "10Y − 2Y"], ["T10Y3M", "10Y − 3M"]];
  return `<div class="pgrid g2">
    ${proPanel("US TREASURY YIELD CURVE", macSrc(m, "US TREASURY · DAILY"), curve)}
    ${proPanel("CURVE SPREADS", macSrc(m, "FRED · DAILY"), proLine(sp.map(([id, n], i) => ({ n, p: macSince(S[id], 1095) })), { zero: true }) + `<div class="pnote">Below 0 = inverted (short rates above long rates), the classic recession warning. The warning usually "fires" when the curve turns positive again.</div>`)}
    ${proPanel("NET LIQUIDITY", macSrc(m, "FRED · WEEKLY · $ BILLIONS"), liq.length ? proLine([{ n: "Fed balance sheet − TGA − reverse repo", p: macSince(liq, 1095) }], { fmt: (v) => pN(v / 1000, 2) + "T" }) +
      `<div class="pkv"><span>Now</span><span>$${pN(liq.at(-1)[1] / 1000, 2)}T</span><span>3 months ago</span><span>$${pN((macBack(liq, 91) || 0) / 1000, 2)}T</span><span>Fed balance sheet</span><span>$${pN((S.WALCL?.at(-1)?.[1] || 0) / 1e6, 2)}T</span><span>Treasury cash (TGA)</span><span>$${pN((S.WTREGEN?.at(-1)?.[1] || 0) / 1e3, 0)}B</span><span>Reverse repo</span><span>$${pN(S.RRPONTSYD?.at(-1)?.[1], 0)}B</span></div>
      <div class="pnote">Money the Fed has put in the system minus what sits idle at the Treasury and in reverse repo. Rising often lines up with stocks rising (a popular, imperfect gauge).</div>` : proSoon("Needs FRED data.", ""))}
    ${proPanel("CREDIT SPREADS", macSrc(m, "FRED (ICE BofA) · DAILY"), proLine([{ n: "High yield", p: macSince(S.BAMLH0A0HYM2, 1095) }, { n: "Investment grade", p: macSince(S.BAMLC0A0CM, 1095) }]) +
      `<div class="pnote">Extra yield companies pay over Treasuries. Widening = lenders getting nervous; it often moves before stocks.</div>`)}
    ${proPanel("POLICY RATE vs 2Y vs 10Y", macSrc(m, "FRED · DAILY"), proLine([{ n: "Fed funds upper", p: macSince(S.DFEDTARU, 1460) }, { n: "2Y", p: macSince(S.DGS2, 1460) }, { n: "10Y", p: macSince(S.DGS10, 1460) }]))}
    ${proPanel("INFLATION", macSrc(m, "FRED · MONTHLY"), proLine([{ n: "CPI y/y", p: macSince(S.CPIAUCSL_YOY, 1460) }, { n: "Core CPI y/y", p: macSince(S.CPILFESL_YOY, 1460) }, { n: "Core PCE y/y", p: macSince(S.PCEPILFE_YOY, 1460) }]) +
      `<div class="pnote">The Fed's target is 2% core PCE. October 2025 CPI was never published (US government shutdown), so CPI lines skip that month.</div>`)}
  </div>`;
}

let macFx = null;
function macGlobal(c, m) {
  const FX = { XM: "EUR=X", GB: "GBP=X", JP: "JPY=X", CN: "CNY=X", TH: "THB=X", KR: "KRW=X", IN: "INR=X", ID: "IDR=X", MY: "MYR=X", AU: "AUD=X", CA: "CAD=X", CH: "CHF=X", BR: "BRL=X" };
  if (macFx === null) { macFx = {}; sb.rpc("get_quotes", { syms: Object.values(FX) }).then(({ data }) => { macFx = data || {}; Object.assign(quotes, macFx); proRefresh(); }); }
  const yr = new Date().getFullYear(), rows = (c?.rows || []);
  const fx = (cc) => { const q = quotes[FX[cc]]; if (!q?.price || !q.prev) return "—"; const ch = (q.price / q.prev - 1) * 100; return `${pN(q.price, q.price > 100 ? 1 : 4)} ${pUD(-ch, pPct(-ch))}`; };
  const tbl = `<table class="ptab"><tr><th class="l">COUNTRY</th><th class="l">BANK</th><th>POLICY RATE</th><th>LAST MOVE</th><th>1Y CHG</th><th>10Y</th><th>REAL RATE*</th><th>CPI ${yr}e</th><th>CPI ${yr + 1}e</th><th>GDP ${yr}e</th><th>GDP ${yr + 1}e</th><th>UNEMP</th><th>FX vs USD (1D, + = stronger)</th></tr>
    ${rows.map((r) => { const cpi = r.cpi?.[yr]; const real = Number.isFinite(r.rate) && Number.isFinite(cpi) ? r.rate - cpi : null;
      return `<tr class="${r.cc === "TH" ? "sel" : ""}"><td class="l ph">${esc(r.name)}</td><td class="l pd">${esc(r.bank)}</td><td class="ph">${pN(r.rate)}%</td>
      <td>${r.chg ? `${pUD(-r.chg, (r.chg > 0 ? "+" : "") + pN(r.chg))} <span class="pd">${esc(String(r.chg_at).slice(0, 7))}</span>` : "—"}</td>
      <td>${Number.isFinite(r.y1) ? pUD(-(r.rate - r.y1), (r.rate - r.y1 > 0 ? "+" : "") + pN(r.rate - r.y1)) : "—"}</td><td>${Number.isFinite(r.y10) ? pN(r.y10) + "%" : "—"}</td>
      <td>${real === null ? "—" : pUD(real, pN(real))}</td><td>${pN(cpi, 1)}</td><td>${pN(r.cpi?.[yr + 1], 1)}</td><td>${pN(r.gdp?.[yr], 1)}</td><td>${pN(r.gdp?.[yr + 1], 1)}</td><td>${pN(r.unemp?.[yr], 1)}</td><td>${r.cc === "US" ? "—" : fx(r.cc)}</td></tr>`; }).join("")}</table>
    <div class="pnote">Policy rates: BIS (daily). Forecasts: IMF World Economic Outlook. 10Y: OECD via FRED (monthly; none for China, Thailand, Indonesia, Malaysia). *Real rate = policy rate − this year's IMF inflation forecast: above 0 = tight money.</div>`;
  const cli = m?.cli || {}, NM = { USA: "US", CHN: "China", JPN: "Japan", DEU: "Germany", GBR: "UK", KOR: "Korea", IND: "India", G20: "G20" };
  const clis = Object.entries(cli).map(([k, s]) => { const v = s.at(-1)?.[1], b = s.at(-4)?.[1];
    return `<tr><td class="l">${NM[k] || k}</td><td class="ph">${pN(v)}</td><td>${b ? pUD(v - b, (v - b > 0 ? "+" : "") + pN(v - b)) : "—"}</td><td>${proSpark(s.map((x) => x[1]), 120, 20)}</td><td>${v >= 100 ? '<span class="ptag g">ABOVE TREND</span>' : '<span class="ptag r">BELOW TREND</span>'}</td></tr>`; }).join("");
  return `<div class="pgrid g2">${proPanel("CENTRAL BANKS + GLOBAL SCOREBOARD", macSrc(c, "BIS + IMF + OECD"), c ? tbl : proWait(), "s2")}
    ${proPanel("OECD LEADING INDICATORS", macSrc(m, "OECD · MONTHLY"), `<table class="ptab"><tr><th class="l">ECONOMY</th><th>CLI</th><th>3M CHG</th><th>4Y</th><th></th></tr>${clis}</table><div class="pnote">Built to turn 6-9 months before the economy. 100 = long-term trend.</div>`)}
    ${proPanel("POLICY RATES · 2 YEARS", macSrc(c, "BIS · DAILY"), proLine(rows.filter((r) => ["US", "XM", "JP", "TH", "CN", "GB"].includes(r.cc) && r.hist).map((r) => ({ n: r.name, p: r.hist }))))}</div>`;
}

function macPos(t) {
  const rows = t?.rows || [];
  return `<div class="pgrid g2">${proPanel("CFTC POSITIONING · LARGE SPECULATORS", macSrc(t, "CFTC · WEEKLY"), `<table class="ptab"><tr><th class="l">MARKET</th><th>NET CONTRACTS</th><th>1W CHG</th><th class="l">3Y RANGE (0 = MOST SHORT, 100 = MOST LONG)</th><th>1Y</th><th>AS OF</th></tr>
    ${rows.map((r) => `<tr><td class="l ph">${esc(r.name)}</td><td>${pUD(r.net, r.net.toLocaleString("en-US"))}</td><td>${r.wk === null ? "—" : pUD(r.wk, (r.wk > 0 ? "+" : "") + r.wk.toLocaleString("en-US"))}</td>
      <td class="l"><div class="pbar" style="width:220px;display:inline-block;vertical-align:middle"><i style="width:${r.pctile}%"></i></div> ${r.pctile}${r.pctile >= 90 ? ' <span class="ptag y">CROWDED LONG</span>' : r.pctile <= 10 ? ' <span class="ptag y">CROWDED SHORT</span>' : ""}</td>
      <td>${proSpark(r.hist.map((x) => x[1]), 110, 20)}</td><td class="pd">${esc(r.at)}</td></tr>`).join("")}</table>
    <div class="pnote">Hedge funds and other speculators (the "non-commercial" group). Extremes are contrarian signals: when everyone is already long, there are few buyers left. Tuesday data, published Friday.</div>`, "s2")}</div>`;
}

PRO_VIEWS.macro = () => {
  const m = proGet("macro"), tab = macTab();
  const sub = `<div class="psub ptabs">${MAC_TABS.map(([k, l]) => `<button class="${k === tab ? "on" : ""}" data-mtab="${k}">${l}</button>`).join("")}</div>`;
  if (m === undefined) return sub + `<div class="pgrid g2">${proPanel("MACRO", "", proWait(), "s2")}</div>`;
  if (!m) return sub + `<div class="pgrid g2">${proPanel("MACRO", "", `<div class="pempty">No macro data yet.<br>Run <b>supabase/017_pro.sql</b> once, then the robot fills it (or on this PC: <b>python robot/pro_data.py --local</b>).</div>`, "s2")}</div>`;
  if (tab === "rates") { const sg = macSignals(m), S = m.series || {}, t3 = S.T10Y3M?.at(-1)?.[1];
    let h = macRates(m);
    h = macAddMean(h, "US TREASURY YIELD CURVE", Number.isFinite(t3) ? macMean(t3 < 0 ? ["r", `Short-term rates are above long-term rates (10Y − 3M = ${pN(t3)}): an "inverted" curve, which came before most US recessions.`] : t3 < 0.5 ? ["a", `The curve is only just positive (10Y − 3M = ${pN(t3)}). Recessions have often started soon after an inversion ends, so it's not an all-clear yet.`] : ["g", `Long-term rates are comfortably above short-term ones (10Y − 3M = ${pN(t3)}): a normal, healthy curve.`]) : "");
    h = macAddMean(h, "NET LIQUIDITY", macMean(sg.liq)); h = macAddMean(h, "CREDIT SPREADS", macMean(sg.credit));
    h = macAddMean(h, "POLICY RATE vs 2Y vs 10Y", macMean(sg.rates)); h = macAddMean(h, "INFLATION", macMean(sg.infl));
    return sub + macVerdict(m) + h + macBond(m); }
  if (tab === "global") { const c = proGet("cb"); return sub + macGlobal(c, m); }
  if (tab === "pos") { const t = proGet("cot"); return sub + (t === undefined ? proWait() : macPos(t)); }
  const sg = macSignals(m); let h = macOverview(m);
  h = macAddMean(h, "REGIME", macMean(sg.growth, sg.infl ? ` <span class="pd">Inflation: ${sg.infl[1]}</span>` : ""));
  h = macAddMean(h, "RECESSION LIGHTS", macMean(sg.rec));
  { const S = m.series || {}, ff = S.DFEDTARU?.length && S.DFEDTARL?.length ? (S.DFEDTARU.at(-1)[1] + S.DFEDTARL.at(-1)[1]) / 2 : null, y2 = S.DGS2?.at(-1)?.[1], st = ff !== null && y2 ? (y2 - ff) / 0.25 : null;
    if (st !== null) h = macAddMean(h, "FED PATH", macMean(st >= 1 ? ["r", `Traders price about ${pN(st, 0)} rate <b>hikes</b> over 2 years: money gets more expensive, a headwind for stocks (and support for the dollar vs the baht).`]
      : st <= -1 ? ["g", `Traders price about ${pN(-st, 0)} rate <b>cuts</b> over 2 years: cheaper money ahead, which usually helps stocks${st <= -4 ? ", unless the cuts come because of a recession" : ""}.`]
      : ["a", "Traders expect the Fed to stay about where it is: no big push either way."])); }
  return sub + macVerdict(m) + h;
};
document.addEventListener("click", (e) => { const b = e.target.closest("[data-mtab]"); if (!b) return; proSet("ic_pro_mtab", b.dataset.mtab); render(false); });

// ===== round 55: BOND MATH (FN351 Fixed-Income Securities Analysis): price, yield, duration, convexity =====
// A plain fixed-coupon bond. Starts from a US Treasury at today's yield (MACRO curve); every input can be changed.
function bondCalc(face, cpn, yrs, ytm, freq = 2) {
  const n = Math.max(1, Math.round(yrs * freq)), c = (face * cpn) / 100 / freq, y = ytm / 100 / freq;
  let px = 0, mac = 0, cvx = 0;
  for (let k = 1; k <= n; k++) { const cf = c + (k === n ? face : 0), df = (1 + y) ** -k; px += cf * df; mac += (k / freq) * cf * df; cvx += cf * df * k * (k + 1); }
  mac /= px; const mod = mac / (1 + y), conv = cvx / (px * (1 + y) ** 2 * freq * freq);
  return { px, mac, mod, conv, dv01: (mod * px) / 10000 };
}
function macBond(m) {
  const cv = m.curve?.today?.y || {}, TEN = [["2 Yr", 2], ["5 Yr", 5], ["10 Yr", 10], ["30 Yr", 30]];
  const q = safe(() => JSON.parse(localStorage.getItem("ic_pro_bond") || "null"), null) || { yrs: 10, cpn: cv["10 Yr"] ?? 4.5, ytm: cv["10 Yr"] ?? 4.5 };
  const B = bondCalc(100, q.cpn, q.yrs, q.ytm), shocks = [-2, -1, -0.5, 0.5, 1, 2];
  const inp = (k, v, step) => `<input class="pbond" data-bond="${k}" type="number" step="${step}" value="${v}" style="width:70px">`;
  const learn = proLearn("FN351 Fixed-Income Securities Analysis", "Bond prices, yield and duration", `<p>A bond pays a fixed <b>coupon</b> every period and gives back its face value (100) at <b>maturity</b>. Its <b>price</b> = every future payment discounted at the market's <b>yield</b>. So when yields go <b>up</b>, the price goes <b>down</b>: the coupons are fixed, and new bonds now pay more.</p>
    <p><b>Duration</b> answers "how much will it move?". <b>Modified duration</b> ≈ the % price change for a 1-point change in yield: duration 8 → yields +1% ≈ price −8%. Longer maturity and lower coupon = higher duration = more interest-rate risk. (Macaulay duration is the average time, in years, you wait for your money.)</p>
    <p><b>Convexity</b> is the curve in that relationship: for a big move, price change ≈ −duration × Δy + ½ × convexity × Δy². It's why the price rises a bit more when yields fall than it drops when they rise.</p>
    <p><b>Why you care:</b> bond funds and even bank stocks are hit by rate moves; this is how much. <b>DV01</b> = the money change for a 0.01% yield move (traders' unit of rate risk).</p>`);
  const presets = TEN.filter(([k]) => Number.isFinite(cv[k])).map(([k, y]) => `<button data-bondp="${y}|${cv[k]}">US ${k.replace(" Yr", "Y")} AT ${pN(cv[k])}%</button>`).join("");
  const body = `<div class="psub">${presets}<span class="pd" style="margin-left:8px">start from a US Treasury at today's yield, then change anything</span></div>
    <div class="pgrid g2 pfrg"><div><div class="pform"><label>Years to maturity</label><span>${inp("yrs", q.yrs, 1)}</span><label>Coupon (per year)</label><span>${inp("cpn", q.cpn, 0.125)} %</span><label>Yield to maturity</label><span>${inp("ytm", q.ytm, 0.05)} % <span class="pd">semi-annual coupons, face 100</span></span></div>
      <div class="pbigw"><div><div class="pbig">${pN(B.px, 2)}</div><small>PRICE PER 100 ${B.px > 100.005 ? "(ABOVE PAR: COUPON > YIELD)" : B.px < 99.995 ? "(BELOW PAR: COUPON < YIELD)" : "(AT PAR)"}</small></div><div><div class="pbig">${pN(B.mod, 2)}</div><small>MODIFIED DURATION</small></div></div>
      <div class="pkv"><span>Macaulay duration</span><span>${pN(B.mac, 2)} years</span><span>Convexity</span><span>${pN(B.conv, 1)}</span><span>DV01 (per 100 face)</span><span>${pN(B.dv01, 4)}</span><span>Per $1,000,000 bond</span><span>$${pN(B.dv01 * 10000, 0)} per 0.01%</span></div></div>
    <div><table class="ptab"><tr><th class="l">IF YIELDS MOVE</th><th>NEW YIELD</th><th>EXACT PRICE</th><th>CHANGE</th><th>DURATION ONLY</th><th>+ CONVEXITY</th></tr>
      ${shocks.map((d) => { const P = bondCalc(100, q.cpn, q.yrs, q.ytm + d).px, a1 = -B.mod * d, a2 = a1 + 0.5 * B.conv * (d / 100) ** 2 * 100;
        return `<tr><td class="l">${d > 0 ? "+" : ""}${pN(d, 1)}%</td><td>${pN(q.ytm + d)}%</td><td>${pN(P)}</td><td>${pUD(P - B.px, pPct((P / B.px - 1) * 100, 2))}</td><td class="pd">${pPct(a1, 2)}</td><td class="pd">${pPct(a2, 2)}</td></tr>`; }).join("")}</table>
      <div class="pnote">"Duration only" is the straight-line estimate; adding convexity gets close to the exact price. The gap grows with bigger moves and longer bonds.</div></div></div>`;
  return `<div class="pgrid g1">${proPanel("BOND MATH · PRICE, DURATION, CONVEXITY", "FN351 · STARTS FROM THE US TREASURY CURVE", body + learn)}</div>`;
}
document.addEventListener("change", (e) => {
  if (!e.target.classList?.contains("pbond")) return;
  const g = (k) => parseFloat(document.querySelector(`[data-bond="${k}"]`)?.value);
  proSet("ic_pro_bond", JSON.stringify({ yrs: Math.min(50, Math.max(0.5, g("yrs") || 10)), cpn: Math.max(0, g("cpn") || 0), ytm: Math.max(-1, Number.isFinite(g("ytm")) ? g("ytm") : 4) })); render(false);
});
document.addEventListener("click", (e) => { const b = e.target.closest("[data-bondp]"); if (!b) return; const [y, r] = b.dataset.bondp.split("|").map(Number); proSet("ic_pro_bond", JSON.stringify({ yrs: y, cpn: r, ytm: r })); render(false); });

// ===== round 56: WHAT IT MEANS. Six readings for STOCKS (not "good / bad": strong data can be bad for stocks when it
// keeps rates high). Each = [tag, sentence]. tag: "g" supportive · "a" mixed · "r" risky. Plain rules, shown in the text.
const MAC_T = { g: ["SUPPORTIVE", "g"], a: ["MIXED", "y"], r: ["RISKY", "r"] };
function macSignals(m) {
  const S = m.series || {}, r = m.regime, last = (id) => S[id]?.at(-1)?.[1], back = (id, d) => macBack(S[id], d), out = {};
  const lights = m.lights || [], red = lights.filter((l) => l.s === "red").length, amb = lights.filter((l) => l.s === "amber").length, sahm = lights.find((l) => /sahm/i.test(l.n));
  if (r) out.growth = r.growth === "up" ? ["g", `Leading indicators are rising (${pN(r.cli)} vs ${pN(r.cli3m)} three months ago): the economy is picking up, which supports company profits.`]
    : sahm?.s === "red" ? ["r", "Leading indicators are falling and unemployment has jumped (Sahm rule red): a classic recession pattern, bad for profits."]
    : ["a", `Leading indicators are slipping (${pN(r.cli)} vs ${pN(r.cli3m)}), but jobs are holding up: slower growth, not a recession yet.`];
  const pc = last("PCEPILFE_YOY"), pc3 = back("PCEPILFE_YOY", 92);
  if (Number.isFinite(pc)) out.infl = pc <= 2.5 && (pc3 === null || pc <= pc3) ? ["g", `Core inflation is ${pN(pc, 1)}% and not rising, close to the Fed's 2% goal: room for rate cuts, which helps stocks (growth stocks most).`]
    : pc >= 3 || (pc3 !== null && pc - pc3 >= 0.2) ? ["r", `Core inflation is ${pN(pc, 1)}%${pc3 !== null ? ` (${pc >= pc3 ? "up" : "down"} from ${pN(pc3, 1)}% 3 months ago)` : ""}, well above the 2% goal: the Fed has less room to cut, a headwind for stocks.`]
    : ["a", `Core inflation is ${pN(pc, 1)}%, above the 2% goal but not getting worse: rate cuts are possible but slow.`];
  const y10 = last("DGS10"), y10b = back("DGS10", 92);
  if (Number.isFinite(y10)) { const d = y10b === null ? 0 : y10 - y10b;
    out.rates = d >= 0.3 || y10 >= 4.75 ? ["r", `The US 10-year yield is ${pN(y10)}%${y10b !== null ? ` (${d >= 0 ? "+" : ""}${pN(d)} in 3 months)` : ""}. High long-term rates make future profits worth less today and make bonds a real alternative to stocks.`]
      : d <= -0.3 ? ["g", `The US 10-year yield fell to ${pN(y10)}% (${pN(d)} in 3 months): cheaper money and higher stock valuations.`]
      : ["a", `The US 10-year yield is ${pN(y10)}%, little changed in 3 months: neither a headwind nor a tailwind right now.`]; }
  const hy = last("BAMLH0A0HYM2"), hyb = back("BAMLH0A0HYM2", 92);
  if (Number.isFinite(hy)) { const d = hyb === null ? 0 : hy - hyb;
    out.credit = hy >= 5 || d >= 1 ? ["r", `Risky companies now pay ${pN(hy)} points more than the government to borrow${d >= 1 ? ` (+${pN(d)} in 3 months)` : ""}: lenders are nervous. This often moves before stocks fall.`]
      : hy <= 3.5 && d < 0.5 ? ["g", `Risky companies pay only ${pN(hy)} points more than the government to borrow: lenders are calm and money is easy to get.`]
      : ["a", `Credit spreads are ${pN(hy)} points${d > 0.2 ? ", edging up" : ""}: normal, worth watching.`]; }
  const lq = m.liq || [], l0 = lq.at(-1)?.[1], l3 = macBack(lq, 91);
  if (l0 && l3) { const p = (l0 / l3 - 1) * 100;
    out.liq = p >= 2 ? ["g", `Net liquidity rose ${pPct(p, 1)} in 3 months: more money in the system, which has tended to lift stocks and crypto.`]
      : p <= -3 ? ["r", `Net liquidity fell ${pPct(p, 1)} in 3 months: money is being drained from the system, a headwind for risky assets.`]
      : ["a", `Net liquidity is about flat (${pPct(p, 1)} in 3 months): no push either way.`]; }
  if (lights.length) out.rec = red >= 2 ? ["r", `${red} recession lights are red. Several red together is what came before past recessions.`]
    : red === 1 || amb >= 2 ? ["a", `${red} red and ${amb} amber lights: some warning signs, not the full pattern of a recession.`]
    : ["g", "Almost all recession lights are green: no sign of a recession in this data."];
  return out;
}
const MAC_SIGN = [["growth", "GROWTH"], ["infl", "INFLATION"], ["rates", "RATES"], ["credit", "CREDIT"], ["liq", "LIQUIDITY"], ["rec", "RECESSION LIGHTS"]];
const macMean = (sg, extra = "") => (sg ? `<div class="pmean"><span class="ptag ${MAC_T[sg[0]][1]}">${MAC_T[sg[0]][0]}</span><span><b>For stocks:</b> ${sg[1]}${extra}</span></div>` : "");
function macVerdict(m) {
  const sg = macSignals(m), got = MAC_SIGN.filter(([k]) => sg[k]);
  if (!got.length) return "";
  const n = (t) => got.filter(([k]) => sg[k][0] === t).length, sc = n("g") - n("r");
  const [word, cls] = sc >= 2 ? ["SUPPORTIVE", "up"] : sc <= -2 ? ["RISKY", "dn"] : sc > 0 ? ["MIXED · LEAN POSITIVE", "pa"] : sc < 0 ? ["MIXED · LEAN CAUTIOUS", "pa"] : ["MIXED", "pa"];
  const good = got.filter(([k]) => sg[k][0] === "g").map(([, l]) => l.toLowerCase()), bad = got.filter(([k]) => sg[k][0] === "r").map(([, l]) => l.toLowerCase());
  const why = `${good.length ? `Supportive: ${good.join(", ")}. ` : ""}${bad.length ? `Risky: ${bad.join(", ")}. ` : ""}${sc >= 2 ? "When most signals line up like this, stocks have usually had the wind behind them." : sc <= -2 ? "When several signals are risky together, defensive sectors and quality companies with real profits usually hold up better." : "In a mixed picture, quality companies with real profits usually hold up better than speculative ones."}`;
  return `<div class="pverd"><div><small>OVERALL FOR STOCKS</small><div class="pbig ${cls}">${word}</div><small>${got.length} signals: ${n("g")} supportive · ${n("a")} mixed · ${n("r")} risky</small></div>
    <div><div class="pverdt">${why} <span class="pd">A reading of today's data with simple rules (each explained below), not a forecast and not advice.</span></div>
      <div class="pverds">${got.map(([k, l]) => `<div><small>${l}</small><span class="ptag ${MAC_T[sg[k][0]][1]}">${MAC_T[sg[k][0]][0]}</span></div>`).join("")}</div></div></div>`;
}
// put a "what it means" line at the bottom of a panel, found by its title
function macAddMean(html, title, line) {
  if (!line) return html;
  const i = html.indexOf(`<b>${title}`); if (i < 0) return html;
  const j = html.indexOf("</div></section>", i); if (j < 0) return html;
  return html.slice(0, j) + line + html.slice(j);
}
