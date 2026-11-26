// Pro FX: currencies. Board (vs USD or vs THB), currency strength, interest-rate gaps (carry), big-fund positioning, what moves the baht.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// Prices: Yahoo daily candles (get_candles, same cache as Charts). Rates: central banks from MACRO (pro_data "cb", BIS + IMF).
// Positioning: CFTC futures (pro_data "cot"). Everything here is daily, not tick-by-tick.
// [code, Yahoo symbol, how Yahoo quotes it ("usd" = USD per 1 unit, "per" = units per 1 USD), name, central bank]
const FX_CCY = [["EUR", "EURUSD=X", "usd", "Euro", "ECB"], ["JPY", "JPY=X", "per", "Japanese yen", "BoJ"], ["GBP", "GBPUSD=X", "usd", "British pound", "BoE"],
  ["CHF", "CHF=X", "per", "Swiss franc", "SNB"], ["AUD", "AUDUSD=X", "usd", "Australian dollar", "RBA"], ["CAD", "CAD=X", "per", "Canadian dollar", "BoC"],
  ["CNY", "CNY=X", "per", "Chinese yuan", "PBoC"], ["THB", "THB=X", "per", "Thai baht", "BOT"], ["SGD", "SGD=X", "per", "Singapore dollar", null],
  ["KRW", "KRW=X", "per", "Korean won", "BoK"], ["INR", "INR=X", "per", "Indian rupee", "RBI"], ["IDR", "IDR=X", "per", "Indonesian rupiah", "BI"], ["MYR", "MYR=X", "per", "Malaysian ringgit", "BNM"]];
const FX_COT = { EUR: "Euro FX", JPY: "Japanese yen", GBP: "British pound", AUD: "Australian dollar", CAD: "Canadian dollar", CHF: "Swiss franc", USD: "US dollar index" };
const FX_P = [["1W", 5], ["1M", 21], ["3M", 63], ["YTD", null], ["1Y", 250]];
const fxBase = () => proStore("ic_pro_fxbase", "USD");

// USD value of 1 unit of the currency, by day: [[date, value]]
function fxUsd(c) {
  if (c === "USD") return null;
  const row = FX_CCY.find((x) => x[0] === c), d = row && proCandles(row[1], "1y");
  if (!d) return null;
  return (d.t || []).map((ts, i) => [new Date(ts * 1000).toISOString().slice(0, 10), d.c?.[i]]).filter((x) => typeof x[1] === "number" && x[1] > 0).map(([dt, v]) => [dt, row[2] === "usd" ? v : 1 / v]);
}
// Price of 1 unit of c in the base currency (USD or THB), by day
function fxIn(c, base) {
  if (base === "USD") return fxUsd(c);
  const b = fxUsd(base); if (!b) return null;
  const mb = new Map(b);
  if (c === "USD") return b.map(([d, v]) => [d, 1 / v]);
  const a = fxUsd(c); if (!a) return null;
  return a.filter(([d]) => mb.has(d)).map(([d, v]) => [d, v / mb.get(d)]);
}
const fxRet = (s, n) => { if (!s?.length) return null; if (n === null) { const y0 = `${new Date().getUTCFullYear()}-01-01`, b = [...s].reverse().find((x) => x[0] < y0); return b ? (s.at(-1)[1] / b[1] - 1) * 100 : null; }
  return s.length > n ? (s.at(-1)[1] / s[s.length - 1 - n][1] - 1) * 100 : null; };
const fxFmt = (v) => (v >= 100 ? pN(v, 2) : v >= 1 ? pN(v, 4) : pN(v, 6));

PRO_VIEWS.fx = () => {
  const base = fxBase(), list = [...FX_CCY.map((x) => x[0]), "USD"].filter((c) => c !== base);
  const ser = Object.fromEntries(list.map((c) => [c, fxIn(c, base)]));
  const dxy = proCandles("DX-Y.NYB", "1y"), got = Object.values(ser).filter(Boolean).length;
  const sub = `<div class="psub ptabs"><span class="ptkh"><b>FX</b> CURRENCIES</span>${["USD", "THB"].map((k) => `<button class="${k === base ? "on" : ""}" data-fxbase="${k}">PRICES IN ${k}</button>`).join("")}<span class="sp"></span><span class="pd">CHART + CALENDAR ON TOP · BOARD + STRENGTH BELOW</span></div>`;
  if (got < 3) return sub + fxTop() + `<div class="pgrid g2">${proPanel("CURRENCIES", "YAHOO · DAILY", proWait(`LOADING ${got}/${list.length}…`), "s2")}</div>`;
  const m = proGet("macro"), c = proGet("cb"), t = proGet("cot");
  // ---- board: 1 unit of each currency, priced in the base. Up = that currency got stronger vs the base.
  const cell = (v) => `<td>${v === null ? "—" : pUD(v, pPct(v, 2))}</td>`;
  const name = (cc) => (cc === "USD" ? "US dollar" : FX_CCY.find((x) => x[0] === cc)[3]);
  const board = `<table class="ptab"><tr><th class="l">CURRENCY</th><th>1 UNIT = ${base}</th><th>1D</th>${FX_P.map(([k]) => `<th>${k}</th>`).join("")}<th>1Y CHART</th><th></th></tr>
    ${list.map((cc) => { const s = ser[cc]; if (!s?.length) return `<tr><td class="l">${cc} <span class="pd">${esc(name(cc))}</span></td><td colspan="8" class="pd l">loading…</td></tr>`;
      const row = FX_CCY.find((x) => x[0] === cc), sym = cc === "USD" ? (base === "THB" ? "THB=X" : "DX-Y.NYB") : row[1];
      return `<tr><td class="l ph">${cc} <span class="pd">${esc(name(cc))}</span></td><td>${fxFmt(s.at(-1)[1])}</td>${cell(fxRet(s, 1))}${FX_P.map(([, n]) => cell(fxRet(s, n))).join("")}
        <td>${proSpark(s.map((x) => x[1]), 110, 20, fxRet(s, 250) >= 0 ? "up" : "dn")}</td><td><a class="pgo" href="#/charts/${encodeURIComponent(sym)}">CHART ›</a></td></tr>`; }).join("")}</table>
    <div class="pnote">Each row = the price of 1 unit of that currency in ${base}. <span class="up">Green</span> = that currency got <b>stronger</b> against the ${base === "THB" ? "baht" : "dollar"}. ${base === "THB" ? "Baht prices are worked out through the dollar (cross rates)." : "Yahoo quotes some pairs the other way (USD/JPY); they're flipped so every row reads the same."}</div>`;
  // ---- strength: each currency's move vs the average of all the others (USD included)
  const usd = Object.fromEntries([...FX_CCY.map((x) => x[0])].map((cc) => [cc, fxUsd(cc)]));
  const strength = (n) => { const r = { USD: 0 }; FX_CCY.forEach(([cc]) => { const s = usd[cc]; if (s && s.length > n) r[cc] = Math.log(s.at(-1)[1] / s[s.length - 1 - n][1]) * 100; });
    const avg = pMean(Object.values(r)); return Object.entries(r).map(([k, v]) => [k, v - avg]).sort((a, b) => b[1] - a[1]); };
  const st = [["1W", 5], ["1M", 21], ["3M", 63]].map(([k, n]) => [k, strength(n)]);
  const mx = Math.max(0.5, ...st.flatMap(([, l]) => l.map((x) => Math.abs(x[1]))));
  const bar = (v) => `<div class="fxbar"><i style="${v >= 0 ? "left:50%" : `right:50%`};width:${(Math.abs(v) / mx) * 50}%" class="${v >= 0 ? "u" : "d"}"></i></div>`;
  const stTab = `<table class="ptab"><tr>${st.map(([k]) => `<th class="l" colspan="3">${k}</th>`).join("")}</tr>${st[0][1].map((_, i) => `<tr>${st.map(([, l]) => { const [cc, v] = l[i] || []; return cc ? `<td class="l ph${cc === "THB" ? " pa" : ""}">${cc}</td><td class="l" style="width:90px">${bar(v)}</td><td>${pUD(v, pPct(v, 1))}</td>` : "<td></td><td></td><td></td>"; }).join("")}</tr>`).join("")}</table>
    <div class="pnote">Strongest at the top. Each currency's move against the average of all ${FX_CCY.length + 1} here, so it doesn't depend on which one you compare with.</div>`;
  // ---- rates + carry (central banks from MACRO)
  const bank = Object.fromEntries((c?.rows || []).map((r) => [r.bank, r]));
  const fed = bank.Fed, thb = bank.BOT, ref = base === "THB" ? thb : fed;
  const carry = `<table class="ptab"><tr><th class="l">CURRENCY</th><th class="l">CENTRAL BANK</th><th>POLICY RATE</th><th>vs ${base}</th><th>10Y BOND</th><th>vs ${base} 10Y</th><th>LAST MOVE</th></tr>
    ${[["USD", "Fed"], ...FX_CCY.filter((x) => x[4]).map((x) => [x[0], x[4]])].map(([cc, b]) => { const r = bank[b]; if (!r) return "";
      const d = ref && cc !== base ? r.rate - ref.rate : null, d10 = ref?.y10 && r.y10 && cc !== base ? r.y10 - ref.y10 : null;
      return `<tr class="${cc === base ? "tot" : ""}"><td class="l ph">${cc}</td><td class="l">${esc(b)}</td><td>${pN(r.rate)}%</td><td>${d === null ? "—" : pUD(d, (d > 0 ? "+" : "") + pN(d))}</td><td>${r.y10 ? pN(r.y10) + "%" : "—"}</td><td>${d10 === null ? "—" : pUD(d10, (d10 > 0 ? "+" : "") + pN(d10))}</td>
        <td class="pd">${r.chg ? `${r.chg > 0 ? "+" : ""}${pN(r.chg)} · ${esc(String(r.chg_at).slice(0, 7))}` : "—"}</td></tr>`; }).join("")}</table>
    <div class="pnote"><b>Carry</b> = the interest gap. Money tends to flow toward the higher rate (green), which supports that currency until the gap starts to close.${fed && thb ? ` Right now holding USD instead of THB earns about <b>${pN(fed.rate - thb.rate)}%</b> a year more at policy rates.` : ""}</div>`;
  // ---- positioning (CFTC)
  const cot = (t?.rows || []).filter((r) => Object.values(FX_COT).includes(r.name));
  const pos = cot.length ? `<table class="ptab"><tr><th class="l">FUTURES</th><th>NET (CONTRACTS)</th><th>1W</th><th class="l">3Y RANGE</th><th>AS OF</th></tr>${cot.map((r) => `<tr><td class="l ph">${esc(r.name)}</td><td>${pUD(r.net, r.net.toLocaleString("en-US"))}</td><td>${r.wk === null ? "—" : pUD(r.wk, (r.wk > 0 ? "+" : "") + r.wk.toLocaleString("en-US"))}</td>
    <td class="l"><div class="pbar" style="width:120px;display:inline-block;vertical-align:middle"><i style="width:${r.pctile}%"></i></div> ${r.pctile}${r.pctile >= 90 ? ' <span class="ptag y">CROWDED LONG</span>' : r.pctile <= 10 ? ' <span class="ptag y">CROWDED SHORT</span>' : ""}</td><td class="pd">${esc(r.at)}</td></tr>`).join("")}</table>
    <div class="pnote">Hedge funds' net bets on each currency (long = betting it rises vs USD). Extremes often reverse. No baht futures exist on CFTC.</div>` : t === undefined ? proWait() : proSoon("No CFTC data yet.", "");
  // ---- what moves the baht: correlation of daily changes over 3 months
  const thbS = usd.THB, drv = [["DX-Y.NYB", "Dollar index"], ["GC=F", "Gold"], ["^TNX", "US 10Y yield"], ["CNY=X", "USD/CNY"], ["EEM", "Emerging-market stocks"]];
  const baht = (() => { if (!thbS) return proWait();
    const tm = Object.fromEntries(thbS.map(([d, v]) => [d, 1 / v]));   // USD/THB (baht per dollar)
    const rows = drv.map(([y, n]) => { const d = proCandles(y, "1y"); if (!d) return { n, y, wait: 1 }; const r = proReturns([tm, proCloseMap(d)]); const k = Math.max(0, r.r[0].length - 63);
      const a = r.r[0].slice(k), b = r.r[1].slice(k); return { n, y, c: a.length > 20 ? pCorr(a, b) : null }; });
    return `<table class="ptab"><tr><th class="l">USD/THB MOVES WITH…</th><th>3M CORRELATION</th><th class="l">READ</th></tr>${rows.map((r) => `<tr><td class="l">${esc(r.n)} <span class="pd">${esc(r.y)}</span></td><td>${r.wait ? '<span class="pd">…</span>' : r.c === null ? "—" : pN(r.c)}</td>
      <td class="l pd">${r.c === null || r.c === undefined ? "" : Math.abs(r.c) < 0.2 ? "little link lately" : `${r.c > 0 ? "baht weakens when this rises" : "baht strengthens when this rises"}${Math.abs(r.c) > 0.5 ? " (strong)" : ""}`}</td></tr>`).join("")}</table>
      <div class="pnote">Daily changes over the last 3 months. +1 = always move together, 0 = no link. The baht often tracks gold (Thailand is a big gold trader) and the yuan.</div>`; })();
  // ---- USD/THB vs dollar index (rebased)
  const thbLine = thbS ? thbS.map(([d, v]) => [d, 1 / v]) : [], dx = dxy ? (dxy.t || []).map((ts, i) => [new Date(ts * 1000).toISOString().slice(0, 10), dxy.c?.[i]]).filter((x) => typeof x[1] === "number") : [];
  const reb = (s) => (s.length ? s.map(([d, v]) => [d, (v / s[0][1]) * 100]) : []);
  return sub + fxTop() + `<div class="pgrid g21">${proPanel(`FX BOARD · PRICES IN ${base}`, "YAHOO · DAILY CLOSE", board)}${proPanel("CURRENCY STRENGTH", "vs THE AVERAGE OF ALL", stTab)}</div>
    <div class="pgrid g21">${proPanel("INTEREST-RATE GAPS · CARRY", macSrc(c, "BIS + IMF"), carry)}${proPanel("USD/THB vs DOLLAR INDEX", "1Y · REBASED TO 100", proLine([{ n: "USD/THB", p: reb(thbLine) }, { n: "Dollar index", p: reb(dx) }]) + `<div class="pnote">Up = baht weaker. When USD/THB rises more than the dollar index, the baht itself is weak (Thai reasons, not just a strong dollar).</div>`)}</div>
    <div class="pgrid g2">${proPanel("BIG-FUND POSITIONING · CURRENCIES", macSrc(t, "CFTC · WEEKLY"), pos)}${proPanel("WHAT MOVES THE BAHT", "YAHOO · DAILY · 3M", baht)}</div>`;
};
document.addEventListener("click", (e) => { const b = e.target.closest("[data-fxbase]"); if (!b) return; proSet("ic_pro_fxbase", b.dataset.fxbase); render(false); });

// ===== round 55: the chart, the economic calendar, the event study (FN471) and forward rates (FN313) =====
// The chart is the SAME chart as the Charts page (KLineChart): drawings, text, indicators and alerts all work here and
// are saved per symbol, so a line drawn on USD/THB here also shows on #/charts/THB=X. It is moved in, never rebuilt.
// [label, Yahoo symbol, base currency, quote currency] (price = quote currency per 1 base)
const FX_PAIRS = [["USD/THB", "THB=X", "USD", "THB"], ["EUR/USD", "EURUSD=X", "EUR", "USD"], ["USD/JPY", "JPY=X", "USD", "JPY"], ["GBP/USD", "GBPUSD=X", "GBP", "USD"],
  ["AUD/USD", "AUDUSD=X", "AUD", "USD"], ["USD/CNY", "CNY=X", "USD", "CNY"], ["USD/CAD", "CAD=X", "USD", "CAD"], ["USD/CHF", "CHF=X", "USD", "CHF"],
  ["EUR/THB", "EURTHB=X", "EUR", "THB"], ["JPY/THB", "JPYTHB=X", "JPY", "THB"], ["GOLD", "GC=F", "USD", null], ["DOLLAR INDEX", "DX-Y.NYB", "USD", null]];
const fxPairSym = () => proStore("ic_pro_fxpair", "THB=X");
function fxPair() {
  const y = fxPairSym(), p = FX_PAIRS.find((x) => x[1] === y); if (p) return p;
  const m = y.match(/^([A-Z]{3})([A-Z]{3})?=X$/);   // EURJPY=X -> EUR/JPY ; MYR=X -> USD/MYR (Yahoo's short form)
  return m ? (m[2] ? [`${m[1]}/${m[2]}`, y, m[1], m[2]] : [`USD/${m[1]}`, y, "USD", m[1]]) : [y, y, null, null];
}
function fxMountChart() { if (typeof kcMount !== "function" || !document.getElementById("kchost")) return; kcMount(fxPairSym()); requestAnimationFrame(() => kc.chart?.resize()); }
const fxChartBox = () => (typeof kcBars !== "function" ? proSoon("Chart not available.", "") :
  `<div class="chc chbox pfxch">${kcBars().replace(/<form class="chsearch[\s\S]*?<\/form>/, "")}<div id="kchost" class="kchost"></div>${kcBottom()}</div>`);

// ----- calendar: your econ_events table (Forex Factory, saved by the robot every 3 hours; US actuals from FRED) -----
let fxCalD = null, fxCalAt = 0;
function fxCalData() {
  if (Date.now() - fxCalAt > 10 * 60e3) { fxCalAt = Date.now();
    sb.from("econ_events").select("at,currency,impact,title,forecast,previous,actual,result,url").gte("at", new Date(Date.now() - 8 * 864e5).toISOString()).order("at").limit(800)
      .then(({ data, error }) => { fxCalD = error ? [] : data || []; proRefresh(); }); }
  return fxCalD;
}
const FX_CALF = [["pair", "PAIR CURRENCIES"], ["hm", "HIGH + MEDIUM"], ["h", "HIGH ONLY"], ["all", "EVERYTHING"]];
const fxCalF = () => proStore("ic_pro_fxcalf", "pair");
const bkk = (iso, o) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Bangkok", ...o });
const bkkDay = (iso) => new Date(new Date(iso).getTime() + 7 * 36e5).toISOString().slice(0, 10);
// Which past-release list (robot: pro_data "evdates") a calendar title belongs to (US events)
const FX_EVMAP = [[/^(core )?cpi/i, "CPI"], [/non-farm|unemployment rate|average hourly/i, "Jobs report (NFP)"], [/gdp/i, "GDP"], [/pce/i, "PCE inflation"],
  [/retail sales/i, "Retail sales"], [/ppi/i, "PPI"], [/federal funds rate|fomc statement|fomc press/i, "Fed decision (FOMC)"]];
const fxEvName = (e) => (e.currency === "USD" ? FX_EVMAP.find(([r]) => r.test(e.title))?.[1] : null);

// New York clock time -> UTC milliseconds (US daylight saving: 2nd Sunday of March to 1st Sunday of November)
function nyUtc(day, hm) {
  const [y, m, d] = day.split("-").map(Number), [h, mi] = hm.split(":").map(Number);
  const sun = (mo, n) => { const f = new Date(Date.UTC(y, mo, 1)).getUTCDay(); return 1 + ((7 - f) % 7) + 7 * (n - 1); };
  const t = Date.UTC(y, m - 1, d), dst = t >= Date.UTC(y, 2, sun(2, 2)) && t < Date.UTC(y, 10, sun(10, 1));
  return Date.UTC(y, m - 1, d, h + (dst ? 4 : 5), mi);
}
// Event study: for each past release, the pair's move from the last hourly close BEFORE the release to the close
// 2 candles later (about 1.5-2 hours after). Compared with an ordinary 2-hour move over the same 2 years.
function fxEvStudy(y) {
  const ev = proGet("evdates"), d = proCandles(y, "2y", "60m");
  if (ev === undefined || !d) return undefined;
  if (!ev?.events || !d.t?.length) return null;
  const T = [], C = [];
  d.t.forEach((ts, i) => { if (typeof d.c?.[i] === "number") { T.push(ts * 1000); C.push(d.c[i]); } });
  let s = 0, n = 0; for (let i = 2; i < C.length; i++) { s += Math.abs(C[i] / C[i - 2] - 1); n++; }
  const norm = n ? (s / n) * 100 : null, out = {};
  const before = (at) => { let lo = 0, hi = T.length - 1, k = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (T[m] + 36e5 <= at) { k = m; lo = m + 1; } else hi = m - 1; } return k; };
  ev.events.forEach((e) => {
    const list = [];
    e.days.forEach((day) => { const at = nyUtc(day, e.ny), k = before(at);
      if (k < 0 || k + 2 >= T.length || at - T[k] > 3 * 36e5 || T[k + 2] - at > 4 * 36e5) return;
      list.push({ day, mv: (C[k + 2] / C[k] - 1) * 100 }); });
    if (!list.length) return;
    const abs = list.map((x) => Math.abs(x.mv)), avg = pMean(abs);
    out[e.name] = { n: list.length, avg, max: Math.max(...abs), up: list.filter((x) => x.mv > 0).length, ratio: norm ? avg / norm : null, list, ny: e.ny };
  });
  return { norm, ev: out };
}

function fxCalPanel(pair, es) {
  const all = fxCalData();
  if (all === null) return proWait();
  if (!all.length) return proSoon("No calendar yet. The robot saves Forex Factory's week every 3 hours.", "");
  const f = fxCalF(), cc = new Set([pair[2], pair[3]].filter(Boolean));
  const keep = { pair: (e) => cc.has(e.currency) && e.impact !== "Low", hm: (e) => e.impact === "High" || e.impact === "Medium", h: (e) => e.impact === "High", all: () => true }[f] || (() => true);
  const now = Date.now(), wk0 = (() => { const t = new Date(now + 7 * 36e5); t.setUTCHours(0, 0, 0, 0); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.getTime() - 7 * 36e5; })();
  const rows = all.filter((e) => new Date(e.at) >= wk0 && keep(e));
  const next = rows.find((e) => new Date(e.at) >= now);
  const study = (e) => { const k = fxEvName(e), r = k && es?.ev?.[k]; return r ? `<td title="${esc(k)}: ${r.n} releases measured">±${pN(r.avg, 2)}% <span class="pd">${r.ratio ? pN(r.ratio, 1) + "×" : ""}</span></td>` : `<td class="pd">—</td>`; };
  let day = "";
  const body = rows.map((e) => { const d = bkkDay(e.at), hd = d !== day ? `<tr><td class="l pday" colspan="7">${esc(bkk(e.at, { weekday: "short", day: "2-digit", month: "short" }).toUpperCase())}</td></tr>` : ""; day = d;
    const past = new Date(e.at) < now, nx = e === next, until = nx ? Math.round((new Date(e.at) - now) / 36e5) : 0;
    const act = e.actual ? `<b class="${e.result === "better" ? "up" : e.result === "worse" ? "dn" : ""}">${esc(e.actual)}</b>` : past && e.url ? `<a class="pgo" href="${esc(e.url)}" target="_blank" rel="noopener">FF ↗</a>` : "—";
    return `${hd}<tr class="${nx ? "pnext" : past ? "ppast" : ""}"><td class="l">${esc(bkk(e.at, { hour: "2-digit", minute: "2-digit" }))}</td><td class="l"><i class="pimp ${esc(e.impact)}"></i> ${esc(e.currency)}</td>
      <td class="l">${esc(e.title)}${nx ? ` <span class="pa">· ${until < 1 ? "within the hour" : `in ${until}h`}</span>` : ""}</td><td>${act}</td><td>${esc(e.forecast || "")}</td><td>${esc(e.previous || "")}</td>${study(e)}</tr>`; }).join("");
  return `<div class="ptabs pfxf">${FX_CALF.map(([k, l]) => `<button class="${k === f ? "on" : ""}" data-fxcalf="${k}">${l}</button>`).join("")}</div>
    ${rows.length ? `<table class="ptab pfxcal"><tr><th class="l">BKK</th><th class="l">CCY</th><th class="l">EVENT</th><th>ACTUAL</th><th>FORECAST</th><th>PREVIOUS</th><th title="Event study: average move of ${esc(pair[0])} in the ~2 hours after this release, last 2 years">${esc(pair[0])} USUALLY MOVES</th></tr>${body}</table>` : `<div class="psoon">Nothing this week for this filter.</div>`}
    <div class="pnote"><i class="pimp High"></i> high <i class="pimp Medium"></i> medium <i class="pimp Low"></i> low impact. <b>ACTUAL</b> <span class="up">green</span> = better than forecast for that currency, <span class="dn">red</span> = worse (US results from FRED; others link to Forex Factory). <b>USUALLY MOVES</b> = the event study below: average size of the pair's move after this release, and how many times bigger than a normal 2 hours.</div>`;
}

function fxEvPanel(pair, es) {
  const learn = proLearn("FN471 Econometrics for Finance", "What is an event study?", `<p>An <b>event study</b> measures how a price reacts to a piece of news. You line up every past release of the same number, measure the price just before and just after each one, and average the moves.</p>
    <p><b>Abnormal move</b> = the move after the news compared with a normal move over the same length of time. Here: <i>× NORMAL</i> = average move after the release ÷ average move over any 2 hours. 3× means this release usually moves the pair three times more than a typical 2 hours.</p>
    <p><b>Why it helps:</b> it tells you which events are worth respecting (wider stop, smaller position, or simply wait) and which are noise. <b>Limits:</b> about 24 releases each is a small sample; it shows the <i>size</i> of the move, not its direction (that depends on actual vs forecast, and we don't have 2 years of forecasts); and markets can react differently in a new regime.</p>`);
  if (es === undefined) return proWait("MEASURING PAST RELEASES…") + learn;
  if (!es) return proSoon("No past release dates yet. The robot adds them with its next macro run (needs the FRED key). On this PC: python robot/pro_data.py --local --only evdates", "") + learn;
  const rows = Object.entries(es.ev).sort((a, b) => b[1].avg - a[1].avg);
  return `<table class="ptab"><tr><th class="l">US RELEASE</th><th>NY TIME</th><th>TIMES</th><th>AVG MOVE</th><th>× NORMAL</th><th>BIGGEST</th><th>UP / DOWN</th><th class="l">LAST 8</th></tr>
    ${rows.map(([k, r]) => { const l = r.list.slice(-8), mx = Math.max(...l.map((x) => Math.abs(x.mv)), 0.01);
      return `<tr><td class="l ph">${esc(k)}</td><td>${esc(r.ny)}</td><td>${r.n}</td><td>±${pN(r.avg, 2)}%</td><td class="${r.ratio >= 3 ? "pa" : ""}">${r.ratio ? pN(r.ratio, 1) + "×" : "—"}</td><td>±${pN(r.max, 2)}%</td><td>${r.up} / ${r.n - r.up}</td>
        <td class="l"><span class="pevb">${l.map((x) => `<i class="${x.mv >= 0 ? "u" : "d"}" style="height:${Math.max(2, (Math.abs(x.mv) / mx) * 18).toFixed(0)}px" title="${esc(x.day)}: ${pPct(x.mv, 2)}"></i>`).join("")}</span></td></tr>`; }).join("")}</table>
    <div class="pnote">${esc(pair[0])}, hourly candles, last 2 years. A normal 2 hours = ±${pN(es.norm, 3)}%. Bars: green = the pair went up after that release, red = down. Release days: FRED release calendar; Fed days: the Fed's meeting calendar.</div>` + learn;
}

// ----- forward rates (covered interest parity, FN313) -----
function fxFwdPanel(pair) {
  const learn = proLearn("FN313 International Finance", "Forward rates and hedging (covered interest parity)", `<p>A <b>forward</b> is a contract made today to swap currencies at a fixed rate on a future date. Its price isn't a forecast: it comes from the <b>interest-rate gap</b>.</p>
    <p><b>Covered interest parity:</b> forward = spot × (1 + quote-currency rate × T) ÷ (1 + base-currency rate × T). Example: USD/THB spot 32.30, US rate 4.0%, Thai rate 1.25%, 1 year: forward = 32.30 × 1.0125 ÷ 1.04 ≈ <b>31.45</b>. The dollar is "cheaper" forward because otherwise you'd earn the extra US interest for free; if it weren't, banks could make a riskless profit (arbitrage).</p>
    <p><b>Why it matters to you:</b> a Thai exporter who will receive dollars in 3 months can lock the forward rate today and remove the currency risk; the gap vs spot is the <b>cost (or gain) of hedging</b>. An investor holding US stocks pays roughly the same gap per year to hedge them back to baht.</p>
    <p><b>Limits:</b> this uses central-bank policy rates. Banks use interbank rates and add a spread, so your bank's quote will differ a little.</p>`);
  if (!pair[2] || !pair[3]) return proSoon(`${esc(pair[0])} isn't a currency pair, so there's no interest-rate forward.`, "") + learn;
  const c = proGet("cb"), d = proCandles(pair[1], "1y");
  if (c === undefined || !d) return proWait() + learn;
  const bank = Object.fromEntries((c?.rows || []).map((r) => [r.bank, r])), rate = (cc) => (cc === "USD" ? bank.Fed : bank[FX_CCY.find((x) => x[0] === cc)?.[4]])?.rate;
  const rb = rate(pair[2]), rq = rate(pair[3]), S = [...(d.c || [])].reverse().find((v) => typeof v === "number");
  if (rb === undefined || rq === undefined || !S) return proSoon(`No policy rate for ${esc(rb === undefined ? pair[2] : pair[3])} in MACRO's central-bank data.`, "") + learn;
  const fw = (T) => S * (1 + (rq / 100) * T) / (1 + (rb / 100) * T);
  const h = safe(() => JSON.parse(localStorage.getItem("ic_pro_fxh") || "null"), null) || { amt: 100000, m: 3 };
  const F = fw(h.m / 12);
  return `<div class="pbigw"><div><div class="pbig">${fxFmt(S)}</div><small>SPOT ${esc(pair[0])} · ${pair[2]} ${pN(rb)}% vs ${pair[3]} ${pN(rq)}% (POLICY RATES)</small></div></div>
    <table class="ptab"><tr><th class="l">TERM</th><th>FORWARD</th><th>POINTS</th><th>vs SPOT / YEAR</th><th class="l">MEANING</th></tr>
    ${[["1 MONTH", 1 / 12], ["3 MONTHS", 0.25], ["6 MONTHS", 0.5], ["1 YEAR", 1]].map(([l, T]) => { const f = fw(T), a = (f / S - 1) / T * 100;
      return `<tr><td class="l">${l}</td><td>${fxFmt(f)}</td><td>${pUD(f - S, (f - S > 0 ? "+" : "") + pN(f - S, S >= 20 ? 3 : 5))}</td><td>${pUD(a, pPct(a, 2))}</td><td class="l pd">${pair[2]} at a forward ${a < 0 ? "discount (its rates are higher)" : "premium (its rates are lower)"}</td></tr>`; }).join("")}</table>
    <div class="pfxh">HEDGE CALCULATOR · I will receive <input id="fxhA" type="number" min="0" step="1000" value="${+h.amt || 0}"> ${pair[2]} in
      <select id="fxhM">${[1, 3, 6, 12].map((m) => `<option value="${m}"${m === h.m ? " selected" : ""}>${m} month${m > 1 ? "s" : ""}</option>`).join("")}</select>
      → lock about <b>${pN((+h.amt || 0) * F, 0)} ${pair[3]}</b> <span class="pd">(vs ${pN((+h.amt || 0) * S, 0)} at today's spot: ${pUD(F - S, pPct((F / S - 1) * 100, 2))})</span></div>` + learn;
}
document.addEventListener("change", (e) => {
  if (e.target.id !== "fxhA" && e.target.id !== "fxhM") return;
  proSet("ic_pro_fxh", JSON.stringify({ amt: +document.getElementById("fxhA").value || 0, m: +document.getElementById("fxhM").value || 3 })); render(false);
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-fxpair],[data-fxcalf]"); if (!b) return;
  if (b.dataset.fxpair) proSet("ic_pro_fxpair", b.dataset.fxpair); else proSet("ic_pro_fxcalf", b.dataset.fxcalf);
  render(false);
});
document.addEventListener("submit", (e) => {
  if (e.target.id !== "fxpairf") return; e.preventDefault();
  const q = (document.getElementById("fxpairq").value || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (q.length === 6 || q.length === 3) { proSet("ic_pro_fxpair", `${q}=X`); render(false); } else toast("Type 6 letters (EURJPY) or 3 (MYR = USD/MYR).");
});
// Chart hidden (round 56): a one-line strip instead: price, today's move, 1-month line, next big event for the pair
function fxStrip(pair, es) {
  const d = proCandles(pair[1], "1mo"), c = (d?.c || []).filter((x) => typeof x === "number");
  if (c.length < 2) return proWait();
  const ch = (c.at(-1) / c.at(-2) - 1) * 100, cc = new Set([pair[2], pair[3]].filter(Boolean));
  const nx = (fxCalData() || []).find((e) => new Date(e.at) >= Date.now() && cc.has(e.currency) && e.impact === "High");
  const k = nx && fxEvName(nx), r = k && es?.ev?.[k];
  return `<div class="pfxstrip"><b class="pa">${esc(pair[0])}</b><span class="pbig">${fxFmt(c.at(-1))}</span>${pUD(ch, pPct(ch, 2) + " today")}${proSpark(c, 170, 24, c.at(-1) >= c[0] ? "up" : "dn")}<span class="pd">1M</span><span class="sp"></span>
    ${nx ? `<span class="pd">NEXT:</span><span class="ptag r">HIGH</span><span>${esc(nx.currency)} ${esc(nx.title)} · ${esc(bkk(nx.at, { weekday: "short", hour: "2-digit", minute: "2-digit" }))}${r ? ` · usually moves ${esc(pair[0])} ±${pN(r.avg, 2)}%` : ""}</span>` : '<span class="pd">no high-impact event left this week for this pair</span>'}</div>`;
}
document.addEventListener("click", (e) => { const b = e.target.closest("[data-fxchart]"); if (!b) return; proSet("ic_pro_fxchart", b.dataset.fxchart); render(false); });
function fxTop() {
  const pair = fxPair(), es = fxEvStudy(pair[1]), show = proStore("ic_pro_fxchart", "1") === "1";
  const tabs = `<div class="ptabs pfxp">${FX_PAIRS.map(([l, y]) => `<button class="${y === pair[1] ? "on" : ""}" data-fxpair="${y}">${l}</button>`).join("")}
    <form id="fxpairf" class="pfxq" autocomplete="off"><input id="fxpairq" maxlength="7" placeholder="OTHER: EURJPY"></form><span class="sp"></span><button class="pbtn${show ? "" : " on"}" data-fxchart="${show ? "0" : "1"}">${show ? "▾ HIDE CHART" : "▸ SHOW CHART"}</button> <a class="pbtn" href="#/charts/${encodeURIComponent(pair[1])}">FULL CHART PAGE ›</a></div>`;
  return `<div class="pgrid g1">${proPanel(`${esc(pair[0])} · CHART`, show ? "YAHOO · SAME CHART AS CHARTS: DRAW, WRITE, INDICATORS · DRAWINGS SAVED" : "CHART HIDDEN · YOUR DRAWINGS ARE KEPT", tabs + (show ? fxChartBox() : fxStrip(pair, es)))}</div>
    <div class="pgrid g1">${proPanel("ECONOMIC CALENDAR · THIS WEEK", "FOREX FACTORY · BANGKOK TIME · US ACTUALS: FRED", fxCalPanel(pair, es))}</div>
    <div class="pgrid g2">${proPanel(`EVENT STUDY · HOW ${esc(pair[0])} REACTS TO US NEWS`, "FRED + FED CALENDAR · YAHOO HOURLY · 2Y", fxEvPanel(pair, es))}${proPanel(`FORWARD RATES · ${esc(pair[0])}`, "COVERED INTEREST PARITY · POLICY RATES", fxFwdPanel(pair))}</div>`;
}
