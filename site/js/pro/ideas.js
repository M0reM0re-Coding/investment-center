// Pro IDEAS: stock ideas ranked by YOUR rules + the data in every other module (your thesis is one input, not the only one).
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// How a score is made (all in your browser, no AI, no paid calls; every number can be traced back):
//   1. MUST rules (yours): a stock that fails one is set aside, with the reason.
//   2. Eight factor scores, 0-100 each: VALUE (your DCF + reverse DCF), QUALITY (Piotroski, Altman, Beneish, margins),
//      GROWTH (sales, profit, analyst revisions), TREND (200-day, 6 months vs S&P), TECHNICAL (round 55: 50/200-day
//      averages, RSI, breakouts + YOUR chart drawings: support/resistance lines, Long/Short boxes), MACRO (regime + sector rotation),
//      SMART (short volume, put/call), THESIS (your stance + probability-weighted target, sell rules hit).
//   3. Weighted average with YOUR weights (a factor with no data is skipped and the others share its weight),
//      then + points for each PREFER rule met.
//   4. If your thesis and the data disagree, it says so (CONFLICT) instead of hiding it.
// Saved: theses row "#IDEAS" (rules, weights, scan list), or on this device until supabase/017_pro.sql is run.
// A screening tool that applies your own rules. Not a prediction and not investment advice.
const ID_F = [["value", "VALUE"], ["quality", "QUALITY"], ["growth", "GROWTH"], ["trend", "TREND"], ["tech", "TECHNICAL"], ["macro", "MACRO FIT"], ["smart", "SMART MONEY"], ["thesis", "YOUR THESIS"]];
const ID_W0 = { value: 20, quality: 20, growth: 15, trend: 10, tech: 15, macro: 10, smart: 5, thesis: 15 };
// metric key -> [label, unit, how to read it]
const ID_M = { fscore: ["Piotroski F-score", "/9"], altman: ["Altman Z-score", ""], beneish: ["Beneish M-score", ""], fpe: ["Forward P/E", "x"], pe: ["P/E", "x"], peg: ["PEG", ""],
  evEbitda: ["EV / EBITDA", "x"], gm: ["Gross margin", "%"], om: ["Operating margin", "%"], roe: ["Return on equity", "%"], revG: ["Sales growth", "%"], epsG: ["Profit growth", "%"],
  de: ["Debt / equity", "%"], divY: ["Dividend yield", "%"], dcfUp: ["DCF upside (your inputs; banks: residual income)", "%"], tgtUp: ["Analyst target upside", "%"], mcapB: ["Market cap (USD bn)", "B"],
  beta: ["Beta", ""], rs6: ["6M return vs S&P", "%"], above200: ["Above 200-day average (1 = yes)", ""], regimeFit: ["Sector fits macro regime (1 = yes)", ""], rsi: ["RSI 14 days (70+ overbought, 30- oversold)", ""], above50: ["Above 50-day average (1 = yes)", ""], tech: ["Technical score (0-100)", ""], stance: ["Your stance (1 bull, 0 watch, -1 bear)", ""] };
const ID_R0 = [{ k: "must", m: "fscore", op: ">=", v: 4 }, { k: "must", m: "altman", op: ">=", v: 1.81 }, { k: "prefer", m: "dcfUp", op: ">=", v: 15, pts: 5 },
  { k: "prefer", m: "above200", op: ">=", v: 1, pts: 5 }, { k: "prefer", m: "fpe", op: "<=", v: 30, pts: 3 }];
const ID_SEC = { Technology: "XLK", "Communication Services": "XLC", "Consumer Cyclical": "XLY", "Consumer Defensive": "XLP", Energy: "XLE", "Financial Services": "XLF",
  Healthcare: "XLV", Industrials: "XLI", "Basic Materials": "XLB", Utilities: "XLU", "Real Estate": "XLRE" };
const idS = { cfg: null, loaded: false, sel: null, edit: false };
const idBlank = () => ({ rules: ID_R0.map((r) => ({ ...r })), w: { ...ID_W0 }, scan: [] });
function idCfg() {
  if (idS.cfg) return idS.cfg;
  if (!idS.loaded) { idS.loaded = true;
    sb.from("theses").select("data").eq("ticker", "#IDEAS").maybeSingle().then(({ data, error }) => {
      idS.db = !error; idS.cfg = (!error && data?.data) || safe(() => JSON.parse(localStorage.getItem("ic_pro_ideas")), null) || idBlank();
      if (idS.cfg.w && idS.cfg.w.tech === undefined) idS.cfg.w.tech = ID_W0.tech;   // saved before the TECHNICAL factor existed
      proRefresh(); });
  }
  return null;
}
let idT = 0;
function idSave() {
  clearTimeout(idT); idT = setTimeout(async () => {
    safe(() => localStorage.setItem("ic_pro_ideas", JSON.stringify(idS.cfg)));
    if (idS.db) { const { error } = await sb.from("theses").upsert({ user_id: state.user.id, ticker: "#IDEAS", data: idS.cfg, updated_at: new Date().toISOString() }, { onConflict: "user_id,ticker" }); if (error) toast(`Rules not saved online: ${esc(error.message)}`); }
  }, 400);
}
// Which stocks: watchlist + holdings + every thesis + your scan list
const idUniverse = (cfg) => [...new Set([...(state.settings?.watchlist || []), ...Object.keys(pfOwnedSafe()), ...Object.keys(th.rows).filter((t) => t[0] !== "*" && t[0] !== "#"), ...(cfg.scan || [])].map((t) => String(t).toUpperCase()))];
const idClamp = (v) => Math.max(0, Math.min(100, v));
const idAvg = (a) => { const v = a.filter((x) => x && Number.isFinite(x[0])); return v.length ? { s: pMean(v.map((x) => x[0])), why: v } : null; };

// ----- TECHNICAL (round 55): price rules + your own drawings on the chart (table chart_drawings, same as the Charts page) -----
let idDrawAll = null;
function idDrawings() {
  if (idDrawAll === null) { idDrawAll = {};
    sb.from("chart_drawings").select("symbol,overlays").neq("symbol", "*").then(({ data }) => { (data || []).forEach((r) => { idDrawAll[r.symbol] = r.overlays || []; }); proRefresh(); }); }
  return idDrawAll;
}
// a drawn line's price today: flat lines = their price; sloped lines (ray / straight line) are extended to today
function idLineNow(o, now) {
  const P = o.points || [];
  if (/^horizontal/.test(o.name)) return P[0]?.value ?? null;
  if ((o.name === "rayLine" || o.name === "straightLine") && P.length >= 2 && P[1].timestamp !== P[0].timestamp && now >= Math.min(P[0].timestamp, P[1].timestamp))
    return P[0].value + ((P[1].value - P[0].value) * (now - P[0].timestamp)) / (P[1].timestamp - P[0].timestamp);
  return null;
}
function idTech(t, d) {
  const ok = (d?.t || []).map((_, i) => i).filter((i) => [d.c, d.h, d.l].every((a) => typeof a?.[i] === "number"));
  if (ok.length < 60) return { f: null, mt: {} };
  const c = ok.map((i) => d.c[i]), lo = ok.map((i) => d.l[i]), px = c.at(-1), n = c.length;
  const ma = (k) => (n >= k ? pMean(c.slice(-k)) : null), m50 = ma(50), m200 = ma(200);
  const rs = typeof rsiOf === "function" ? rsiOf(c, 14) : [], r = rs.at(-1);
  const hi50 = Math.max(...c.slice(-51, -1)), lo50 = Math.min(...c.slice(-51, -1));
  const why = [];
  why.push(m200 ? [px > m50 && px > m200 ? 80 : px > m200 ? 60 : px > m50 ? 40 : 20, px > m50 && px > m200 ? "above its 50- and 200-day averages (uptrend)" : px > m200 ? "above the 200-day but below the 50-day average (pullback)" : px > m50 ? "below the 200-day, above the 50-day (trying to turn)" : "below its 50- and 200-day averages (downtrend)"]
    : [px > m50 ? 65 : 35, px > m50 ? "above its 50-day average" : "below its 50-day average"]);
  if (Number.isFinite(r)) why.push(r > 70 ? [30, `RSI ${pN(r, 0)}: overbought, buying here has worse odds`] : r < 30 ? [65, `RSI ${pN(r, 0)}: oversold, bounce odds are better`] : [r >= 50 ? 58 : 45, `RSI ${pN(r, 0)}: ${r >= 50 ? "healthy momentum" : "soft momentum"}`]);
  if (px > hi50) why.push([80, "new 50-day high (breakout)"]); else if (px < lo50) why.push([20, "new 50-day low (breakdown)"]);
  // your drawings
  const now = d.t[ok.at(-1)] * 1000, ds = (idDrawings()[t] || []).filter((o) => !o.ui?.hidden);
  const fmt = (v) => pN(v, v >= 100 ? 0 : 2), c6 = c[n - 6], lo5 = Math.min(...lo.slice(-5));
  const lv = ds.map((o) => ({ o, L: idLineNow(o, now) })).filter((x) => Number.isFinite(x.L) && x.L > 0).sort((a, b) => Math.abs(a.L - px) - Math.abs(b.L - px)).slice(0, 2);
  lv.forEach(({ L }) => { const dist = ((px - L) / px) * 100;
    if (c6 < L && px >= L) why.push([85, `broke above your line at ${fmt(L)}`]);
    else if (c6 > L && px <= L) why.push([15, `broke below your line at ${fmt(L)}`]);
    else if (dist >= 0 && dist <= 3) why.push(lo5 <= L * 1.01 ? [85, `bounced off your support line at ${fmt(L)}`] : [70, `sitting just above your support line at ${fmt(L)} (${pN(dist, 1)}% away)`]);
    else if (dist < 0 && dist >= -3) why.push([40, `your resistance line at ${fmt(L)} is ${pN(-dist, 1)}% above`]); });
  ds.filter((o) => (o.name === "tvLong" || o.name === "tvShort") && o.points?.length >= 2).slice(-1).forEach((o) => {
    const e = o.points[0].value, tg = o.points[1].value, st = o.points[2]?.value ?? e - (tg - e) / 2, long = o.name === "tvLong", rr = Math.abs(e - st) ? Math.abs(tg - e) / Math.abs(e - st) : 0;
    const plan = `entry ${fmt(e)}, stop ${fmt(st)}, target ${fmt(tg)}, reward/risk ${pN(rr, 1)}`;
    if (long) why.push(px <= st ? [10, `your Long plan's stop was hit (${plan})`] : px >= tg ? [50, `your Long target was reached (${plan})`] : [75, `inside your Long plan: ${plan}`]);
    else why.push(px >= st ? [70, `your Short plan's stop was hit (${plan})`] : px <= tg ? [50, `your Short target was reached (${plan})`] : [25, `inside your Short plan (you expect a fall): ${plan}`]);
  });
  const f = idAvg(why);
  return { f, mt: { rsi: Number.isFinite(r) ? r : null, above50: m50 ? (px > m50 ? 1 : 0) : null, tech: f ? f.s : null }, drawn: ds.length };
}

function idScore(t, cfg, ctx) {
  const y = yahoo(t), F = proGet(valKey(y));
  if (F === undefined) return { t, wait: 1 };
  if (!F) return { t, nodata: 1 };
  const s = F.snap || {}; valFx(s.cur); valFx(s.fcur);   // exchange rates for companies that report in another currency (TSM: TWD)
  const q = valFlags(F, s.sector), M = valDcfModel(F, valIn(t)), r = valDcf(M), imp0 = valReverse(M), imp = imp0 === null || imp0 < -19.5 || imp0 > 79.5 ? null : imp0;
  const fin = /financial/i.test(s.sector || "");   // banks + insurers: free cash flow isn't meaningful, so no DCF for them
  const RI = fin && typeof valRiModel === "function" ? valRiModel(F, valIn(t), M) : null;   // round 55: residual income for banks + insurers
  const px = s.price, d = proCandles(y, "1y"), cl = (d?.c || []).filter((x) => typeof x === "number");
  const ma200 = cl.length >= 200 ? pMean(cl.slice(-200)) : null, r6 = cl.length > 126 ? (cl.at(-1) / cl[cl.length - 127] - 1) * 100 : null;
  const spy = ctx.spy, s6 = spy && spy.length > 126 ? (spy.at(-1)[1] / spy[spy.length - 127][1] - 1) * 100 : null;
  const etf = ID_SEC[s.sector], fit = etf ? ctx.fit.has(etf) : null, stg = etf ? ctx.stage[etf] : null;
  const est = (F.est || []).find((e) => e.p === "+1y") || (F.est || []).find((e) => e.p === "0y"), rev = est?.trend?.["30daysAgo"] ? (est.trend.current / est.trend["30daysAgo"] - 1) * 100 : null;
  const T = th.rows[t], cs = T?.cases || {}, probs = ["bull", "base", "bear"].map((k) => [Number(cs[k]?.prob), Number(cs[k]?.target)]).filter(([p, v]) => p > 0 && v > 0);
  const pw = probs.length ? probs.reduce((a, [p, v]) => a + p * v, 0) / probs.reduce((a, [p]) => a + p, 0) : null, thUp = pw && px ? (pw / px - 1) * 100 : null;
  const sell = (T?.rules || []).filter((x) => Number.isFinite(Number(x.price)) && px && x.kind === "sell" && (x.dir === "below" ? px <= x.price : px >= x.price)).length;
  const S = !/[.^=]/.test(y) ? proGet("smart_" + y) : null, sh = (S?.short || []).map(([, a, b]) => (b ? (a / b) * 100 : null)).filter(Number.isFinite);
  const usd = s.cur === "USD" ? 1 : fxPerUsd(s.cur);
  const mt = { fscore: q?.pio?.score ?? null, altman: q?.altman ?? null, beneish: q?.beneish?.m ?? null, fpe: s.fpe ?? null, pe: s.pe ?? null, peg: s.peg ?? null, evEbitda: s.evEbitda ?? null,
    gm: s.gm != null ? s.gm * 100 : null, om: s.om != null ? s.om * 100 : null, roe: s.roe != null ? s.roe * 100 : null, revG: s.revG != null ? s.revG * 100 : null, epsG: s.epsG != null ? s.epsG * 100 : null,
    de: s.de ?? null, divY: s.divY != null ? s.divY * 100 : null, dcfUp: r && px && !fin ? (r.perShare / px - 1) * 100 : RI ? RI.up : null, tgtUp: F.target?.targetMeanPrice && px ? (F.target.targetMeanPrice / px - 1) * 100 : null,
    mcapB: s.mcap && usd ? s.mcap / usd / 1e9 : null, beta: s.beta ?? null, rs6: r6 !== null && s6 !== null ? r6 - s6 : null, above200: ma200 ? (px > ma200 ? 1 : 0) : null,
    regimeFit: fit === null ? null : fit ? 1 : 0, stance: T ? { bull: 1, watch: 0, bear: -1 }[T.stance] ?? 0 : null };
  const TE = idTech(t, d); Object.assign(mt, TE.mt);
  // factor scores: [score, reason]
  const f = {
    value: idAvg([[mt.dcfUp === null ? NaN : idClamp(50 + mt.dcfUp), `DCF value ${pPct(mt.dcfUp, 0)} vs price`],
      [fin || imp === null || M.g1 === null ? NaN : idClamp(50 + (M.g1 - imp) * 2.5), `price assumes ${pPct(imp, 1, false)} growth vs ${pPct(M.g1, 1, false)} expected`],
      [mt.tgtUp === null ? NaN : idClamp(50 + mt.tgtUp), `analyst target ${pPct(mt.tgtUp, 0)}`],
      [RI ? idClamp(50 + RI.up) : NaN, `residual income value ${pPct(RI?.up, 0)} vs price (ROE ${pN(RI?.roe, 1)}% vs ${pN(RI?.ke, 1)}% required)`]]),
    quality: idAvg([[mt.fscore === null ? NaN : (mt.fscore / (q.pio.of || 9)) * 100, `Piotroski ${mt.fscore}/${q?.pio?.of}`],
      [mt.altman === null ? NaN : mt.altman > 2.99 ? 100 : mt.altman >= 1.81 ? 50 : 0, `Altman Z ${pN(mt.altman)}`],
      [mt.beneish === null ? NaN : mt.beneish > -1.78 ? 10 : mt.beneish > -2.22 ? 50 : 90, `Beneish M ${pN(mt.beneish)}`],
      [mt.om === null ? NaN : idClamp(mt.om * 2.5), `operating margin ${pN(mt.om, 0)}%`]]),
    growth: idAvg([[mt.revG === null ? NaN : idClamp(50 + mt.revG * 1.5), `sales ${pPct(mt.revG, 0)} a year`], [mt.epsG === null ? NaN : idClamp(50 + mt.epsG), `profit ${pPct(mt.epsG, 0)}`],
      [rev === null ? NaN : idClamp(50 + rev * 10), `analysts ${rev >= 0 ? "raised" : "cut"} next-year EPS ${pPct(rev, 1)} in 30 days`]]),
    trend: idAvg([[mt.above200 === null ? NaN : mt.above200 ? 75 : 25, mt.above200 ? "above its 200-day average" : "below its 200-day average"], [mt.rs6 === null ? NaN : idClamp(50 + mt.rs6 * 1.5), `${pPct(mt.rs6, 0)} vs S&P over 6 months`]]),
    tech: TE.f,
    macro: idAvg([[fit === null ? NaN : fit ? 85 : 35, `${esc(s.sector || "")} ${fit ? "fits" : "doesn't fit"} the ${esc(ctx.reg || "")} regime`],
      [!stg ? NaN : { LEADING: 90, IMPROVING: 70, WEAKENING: 40, LAGGING: 15 }[stg], `sector (${etf}) is ${stg}`]]),
    smart: idAvg([[sh.length > 3 ? idClamp(50 - (sh.at(-1) - pMean(sh)) * 3) : NaN, `short volume ${pN(sh.at(-1), 0)}% vs ${pN(pMean(sh), 0)}% avg`],
      [S?.opt?.pcV ? idClamp(100 - S.opt.pcV * 50) : NaN, `put/call ${pN(S?.opt?.pcV)}`]]),
    thesis: T && (T.stance !== "watch" || pw) ? idAvg([[{ bull: 85, watch: 50, bear: 15 }[T.stance] ?? 50, `you're ${T.stance === "bull" ? "bullish" : T.stance === "bear" ? "bearish" : "watching"}`],
      [thUp === null ? NaN : idClamp(50 + thUp), `your weighted target ${pPct(thUp, 0)}`], [sell ? 0 : NaN, `${sell} of your sell rules hit`]]) : null };
  const w = cfg.w || ID_W0, use = ID_F.filter(([k]) => f[k] && (w[k] || 0) > 0), wsum = use.reduce((a, [k]) => a + w[k], 0);
  let score = wsum ? use.reduce((a, [k]) => a + f[k].s * w[k], 0) / wsum : null;
  const dataOnly = (() => { const u = use.filter(([k]) => k !== "thesis"), ws = u.reduce((a, [k]) => a + w[k], 0); return ws ? u.reduce((a, [k]) => a + f[k].s * w[k], 0) / ws : null; })();
  // your rules
  const test = (rl) => { const v = mt[rl.m]; if (v === null || v === undefined || !Number.isFinite(v)) return null; return rl.op === ">=" ? v >= rl.v : rl.op === "<=" ? v <= rl.v : v === rl.v; };
  const rules = (cfg.rules || []).map((rl) => ({ ...rl, ok: test(rl), val: mt[rl.m] }));
  const fails = rules.filter((x) => x.k === "must" && x.ok === false), bonus = rules.filter((x) => x.k === "prefer" && x.ok).reduce((a, x) => a + (Number(x.pts) || 0), 0);
  if (score !== null) score = Math.min(100, score + bonus);
  // reasons: biggest pushes up / down (score away from 50 × weight)
  const pushes = use.flatMap(([k]) => f[k].why.map(([v, txt]) => ({ k, v, txt, p: (v - 50) * w[k] })));
  const conflict = T && dataOnly !== null ? (T.stance === "bull" && dataOnly < 45 ? "You're bullish, but the data is weak" : T.stance === "bear" && dataOnly >= 62 ? "You're bearish, but the data is strong" : null) : null;
  return { t, y, F, name: s.name, px, cur: s.cur, f, score, drawn: TE.drawn || 0, dataOnly, rules, fails, bonus, conflict, hasT: !!T, stance: T?.stance,
    pros: pushes.filter((x) => x.p > 0).sort((a, b) => b.p - a.p).slice(0, 3), cons: pushes.filter((x) => x.p < 0).sort((a, b) => a.p - b.p).slice(0, 3), mt };
}
const idVerdict = (x) => (x.fails.length ? ["FAILS YOUR RULES", "r"] : x.score >= 70 ? ["STRONG IDEA", "g"] : x.score >= 55 ? ["WORTH A LOOK", "a"] : x.score >= 40 ? ["NEUTRAL", ""] : ["AVOID FOR NOW", "r"]);
const idCell = (v) => (v === null || v === undefined ? '<td class="pd">—</td>' : `<td><span class="idsc" style="--v:${v.toFixed(0)}%"><i class="${v >= 60 ? "u" : v < 40 ? "d" : ""}"></i>${v.toFixed(0)}</span></td>`);

// what every score needs once: S&P series, macro regime, sector stages (also used by BOT)
function idCtx() {
  const m = proGet("macro"), reg = m?.regime?.name, spy = rotSeries("SPY");
  const stage = {}; Object.values(ID_SEC).forEach((e) => { const s = rotSeries(e); if (!s || !spy) return; const rs = (rotRet(s, 63) ?? 0) - (rotRet(spy, 63) ?? 0), rel = rotRel(s, spy), mo = rel.length > 22 ? rel.at(-1)[1] / rel[rel.length - 22][1] - 1 : 0; stage[e] = rs >= 0 ? (mo >= 0 ? "LEADING" : "WEAKENING") : mo >= 0 ? "IMPROVING" : "LAGGING"; });
  return { spy, reg, fit: new Set(ROT_REGIME[reg] || []), stage };
}
PRO_VIEWS.ideas = () => {
  const cfg = idCfg(); if (!cfg) return proWait("LOADING YOUR RULES…");
  if (typeof thLoadAll === "function") thLoadAll();
  const ctx = idCtx();
  const uni = idUniverse(cfg), all = uni.map((t) => idScore(t, cfg, ctx));
  const ok = all.filter((x) => x.score !== undefined && x.score !== null).sort((a, b) => (a.fails.length ? 1 : 0) - (b.fails.length ? 1 : 0) || b.score - a.score);
  const wait = all.filter((x) => x.wait), none = all.filter((x) => x.nodata);
  if (!idS.sel || !ok.find((x) => x.t === idS.sel)) idS.sel = ok[0]?.t || null;
  const sel = ok.find((x) => x.t === idS.sel);
  const sub = `<div class="psub ptabs"><span class="ptkh"><b>IDEAS</b> RANKED BY YOUR RULES + THE DATA</span><span class="sp"></span><button class="${idS.edit ? "on" : ""}" data-idedit="1">${idS.edit ? "DONE EDITING" : "EDIT RULES + WEIGHTS"}</button></div>
    <div class="idsteps"><div><b>1 · SET YOUR RULES</b><span>MUST = a stock is out if it fails (e.g. Altman Z ≥ 1.81). PREFER = extra points. Press EDIT RULES + WEIGHTS.</span></div>
      <div><b>2 · DRAW ON CHARTS</b><span>Draw support / resistance lines or a Long box on any chart (F9 CHART). TECHNICAL reads them automatically.</span></div>
      <div><b>3 · READ THE LIST</b><span>Top = best fit. Click a row: every reason for and against is on the right. CONFLICT = the data disagrees with your thesis.</span></div></div>`;
  const tbl = `<table class="ptab idtab"><tr><th class="l">#</th><th class="l">STOCK</th><th>SCORE</th><th class="l">VERDICT</th>${ID_F.map(([k, l]) => `<th>${k === "thesis" ? "THESIS" : l.split(" ")[0]}</th>`).join("")}<th class="l">THESIS CHECK</th></tr>
    ${ok.map((x, i) => { const [v, c] = idVerdict(x); return `<tr class="${x.t === idS.sel ? "sel" : ""}" data-idsel="${esc(x.t)}"><td class="l pd">${x.fails.length ? "–" : i + 1}</td><td class="l"><span class="t">${esc(x.t)}</span>${x.drawn ? ' <span class="ptag" title="has your chart drawings">✎</span>' : ""} <span class="pd">${esc((x.name || "").slice(0, 22))}</span></td>
      <td class="ph">${pN(x.score, 0)}${x.bonus ? `<span class="pd"> +${x.bonus}</span>` : ""}</td><td class="l"><span class="ptag ${c}">${v}</span></td>${ID_F.map(([k]) => idCell(x.f[k]?.s)).join("")}
      <td class="l">${x.conflict ? `<span class="ptag y">CONFLICT</span>` : x.hasT ? '<span class="ptag g">AGREES</span>' : `<a class="pgo" href="${proHref("thesis", x.t)}">WRITE ONE ›</a>`}</td></tr>`; }).join("")}
    ${wait.length ? `<tr><td colspan="${ID_F.length + 5}" class="l pd"><span class="pblink">Loading ${wait.map((x) => esc(x.t)).join(", ")}…</span></td></tr>` : ""}</table>
    ${none.length ? `<div class="pnote">No company data yet for <b>${none.map((x) => esc(x.t)).join(", ")}</b>. The robot downloads it once a day for every stock in this list${location.hostname === "localhost" || location.hostname === "127.0.0.1" ? `. On this PC: <b>python robot/pro_data.py --local --only fund --tickers ${none.map((x) => esc(x.t)).join(",")}</b>` : ""}.</div>` : ""}
    <div class="pnote">Stocks checked: your watchlist, holdings, every thesis and your scan list (${uni.length}). Score 0-100: 70+ strong, 55+ worth a look, under 40 avoid for now. Each factor column is 0-100 (50 = neutral).</div>`;
  const det = sel ? idDetail(sel, cfg) : proSoon("Nothing to rank yet.", "");
  const left = `<div class="pcol">${proPanel("RANKED IDEAS", `${ok.length} SCORED · YOUR WEIGHTS · LIVE`, tbl)}${idS.edit ? idEditor(cfg) : `<div class="pgrid g2">${proPanel("YOUR RULES", idS.db ? "SAVED TO YOUR ACCOUNT" : "SAVED ON THIS PC", idRulesRO(cfg))}${proPanel("HOW THE SCORE IS MADE", "", idHow(cfg))}</div>`}</div>`;
  return sub + `<div class="pgrid g21">${left}${proPanel(sel ? `${esc(sel.t)} · WHY ` + `<a class="pgo" href="${proHref("val", sel.t)}">VAL ›</a> <a class="pgo" href="${proHref("thesis", sel.t)}">THESIS ›</a>` : "WHY", "EVERY NUMBER TRACES BACK", det)}</div>`;
};

function idDetail(x, cfg) {
  const [v, c] = idVerdict(x);
  return `<div class="pbigw"><div><div class="pbig">${pN(x.score, 0)}</div><small><span class="ptag ${c}">${v}</span> · ${esc(x.name || "")} · ${pN(x.px)} ${esc(x.cur || "")}</small></div>
    <div><div class="pbig pd">${x.dataOnly === null ? "—" : pN(x.dataOnly, 0)}</div><small>DATA ONLY (NO THESIS, NO RULE POINTS)</small></div></div>
    ${x.conflict ? `<div class="pnote pw"><b>${esc(x.conflict)}.</b> The data against you: ${(x.stance === "bull" ? x.cons : x.pros).filter((p) => p.k !== "thesis").slice(0, 3).map((p) => esc(p.txt)).join("; ") || "see the factors below"}. Worth re-reading your thesis.</div>` : ""}
    ${x.fails.length ? `<div class="pnote pw"><b>Fails your MUST rule${x.fails.length > 1 ? "s" : ""}:</b> ${x.fails.map((r) => `${esc(ID_M[r.m][0])} ${r.op} ${r.v} (is ${pN(r.val)})`).join(" · ")}</div>` : ""}
    <table class="ptab"><tr><th class="l" colspan="2">FOR</th></tr>${x.pros.map((p) => `<tr><td class="l up">▲</td><td class="l">${p.txt} <span class="pd">${ID_F.find((f) => f[0] === p.k)[1]}</span></td></tr>`).join("") || '<tr><td class="l pd" colspan="2">nothing stands out</td></tr>'}
    <tr><th class="l" colspan="2">AGAINST</th></tr>${x.cons.map((p) => `<tr><td class="l dn">▼</td><td class="l">${p.txt} <span class="pd">${ID_F.find((f) => f[0] === p.k)[1]}</span></td></tr>`).join("") || '<tr><td class="l pd" colspan="2">nothing stands out</td></tr>'}</table>
    <table class="ptab"><tr><th class="l">FACTOR</th><th>SCORE</th><th>WEIGHT</th><th class="l">BASED ON</th></tr>${ID_F.map(([k, l]) => `<tr><td class="l">${l}</td>${idCell(x.f[k]?.s)}<td>${x.f[k] ? (cfg.w[k] || 0) + "%" : '<span class="pd">skipped</span>'}</td><td class="l pd">${x.f[k] ? x.f[k].why.map((w) => w[1]).join(" · ") : k === "thesis" ? "no thesis yet" : "no data"}</td></tr>`).join("")}</table>
    <table class="ptab"><tr><th class="l">YOUR RULE</th><th>VALUE</th><th>RESULT</th></tr>${x.rules.map((r) => `<tr><td class="l"><span class="ptag ${r.k === "must" ? "r" : "a"}">${r.k.toUpperCase()}</span> ${esc(ID_M[r.m][0])} ${r.op} ${r.v}</td><td>${pN(r.val)}</td><td>${r.ok === null ? '<span class="pd">no data</span>' : r.ok ? `<span class="up">✓${r.k === "prefer" ? ` +${r.pts}` : ""}</span>` : '<span class="dn">✗</span>'}</td></tr>`).join("")}</table>`;
}
const idRulesRO = (cfg) => `<table class="ptab">${(cfg.rules || []).map((r) => `<tr><td class="l"><span class="ptag ${r.k === "must" ? "r" : "a"}">${r.k.toUpperCase()}</span></td><td class="l">${esc(ID_M[r.m]?.[0] || r.m)} ${r.op} ${r.v}</td><td class="pd">${r.k === "prefer" ? `+${r.pts} pts` : "else set aside"}</td></tr>`).join("") || '<tr><td class="pd l">No rules yet.</td></tr>'}</table>
  <div class="pnote">These starter rules are examples: change them to your own with <b>EDIT RULES + WEIGHTS</b>. Scan list: ${(cfg.scan || []).length ? cfg.scan.map(esc).join(", ") : "empty (add tickers you don't own or watch yet)"}.</div>`;
const idHow = (cfg) => `<table class="ptab"><tr><th class="l">FACTOR</th><th>WEIGHT</th><th class="l">FROM</th></tr>${ID_F.map(([k, l]) => `<tr><td class="l">${l}</td><td>${cfg.w[k] || 0}%</td><td class="l pd">${{ value: "VAL: your DCF, reverse DCF, analyst target", quality: "VAL: Piotroski, Altman, Beneish, margin", growth: "sales + profit growth, analyst EPS revisions", trend: "200-day average, 6M vs S&P", tech: "50/200-day, RSI, breakouts + your chart drawings", macro: "MACRO regime + ROT sector stage", smart: "SMART: short volume, put/call (US only)", thesis: "THESIS: stance, weighted target, sell rules" }[k]}</td></tr>`).join("")}</table>
  <div class="pnote">Your thesis counts for ${cfg.w.thesis || 0}% at most, so a stock you love can still rank low if the data disagrees, and a stock with no thesis can rank high. A screening tool that applies your rules, not a prediction and not investment advice.</div>`;
function idEditor(cfg) {
  const opt = (sel, list) => list.map(([v, l]) => `<option value="${v}" ${v === sel ? "selected" : ""}>${esc(l)}</option>`).join("");
  const rules = `<table class="ptab">${(cfg.rules || []).map((r, i) => `<tr><td class="l"><select class="pin" data-idr="${i}" data-f="k">${opt(r.k, [["must", "MUST"], ["prefer", "PREFER"]])}</select></td>
    <td class="l"><select class="pin" style="max-width:210px" data-idr="${i}" data-f="m">${opt(r.m, Object.entries(ID_M).map(([k, [l]]) => [k, l]))}</select></td><td><select class="pin" data-idr="${i}" data-f="op">${opt(r.op, [[">=", "≥"], ["<=", "≤"]])}</select></td>
    <td><input class="pin" style="width:64px" type="number" step="any" value="${r.v}" data-idr="${i}" data-f="v"></td><td>${r.k === "prefer" ? `+<input class="pin" style="width:40px" type="number" value="${r.pts ?? 5}" data-idr="${i}" data-f="pts"> pts` : ""}</td><td><button class="px" data-idrm="${i}">×</button></td></tr>`).join("")}</table>
    <div class="psub"><button data-idadd="must">+ MUST RULE</button><button data-idadd="prefer">+ PREFER RULE</button><button data-idreset="1">BACK TO STARTER RULES</button></div>
    <div class="pnote"><b>MUST</b> = a stock that fails is set aside (shown at the bottom with the reason). No data = not failed. <b>PREFER</b> = extra points when met.</div>`;
  const w = `<table class="ptab">${ID_F.map(([k, l]) => `<tr><td class="l">${l}</td><td class="l"><input type="range" min="0" max="40" step="5" value="${cfg.w[k] || 0}" data-idw="${k}"> <b>${cfg.w[k] || 0}%</b></td></tr>`).join("")}</table>
    <div class="pnote">Weights don't need to add up to 100; they're shared out over the factors that have data.</div>
    <div class="pph" style="margin-top:8px"><b>SCAN LIST</b><span class="psrc">STOCKS TO CHECK THAT YOU DON'T OWN OR WATCH</span></div>
    <form id="idscan" class="psub"><input class="pin" name="t" placeholder="e.g. MSFT, ASML, CPALL.BK" style="flex:1"><button>ADD</button></form>
    <div class="psub">${(cfg.scan || []).map((t) => `<button data-idscanrm="${esc(t)}">${esc(t)} ×</button>`).join("") || '<span class="pd">empty</span>'}</div>`;
  return `<div class="pgrid g2">${proPanel("YOUR RULES · EDIT", idS.db ? "SAVED TO YOUR ACCOUNT" : "SAVED ON THIS PC", rules)}${proPanel("WEIGHTS + SCAN LIST · EDIT", "", w)}</div>`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-idsel],[data-idedit],[data-idrm],[data-idadd],[data-idreset],[data-idscanrm]"); if (!b || !idS.cfg) return;
  if (b.dataset.idsel) { idS.sel = b.dataset.idsel; return render(false); }
  if (b.dataset.idedit) { idS.edit = !idS.edit; return render(false); }
  if (b.dataset.idrm) idS.cfg.rules.splice(+b.dataset.idrm, 1);
  if (b.dataset.idadd) idS.cfg.rules.push(b.dataset.idadd === "must" ? { k: "must", m: "fscore", op: ">=", v: 5 } : { k: "prefer", m: "dcfUp", op: ">=", v: 10, pts: 5 });
  if (b.dataset.idreset) idS.cfg.rules = ID_R0.map((r) => ({ ...r }));
  if (b.dataset.idscanrm) idS.cfg.scan = idS.cfg.scan.filter((t) => t !== b.dataset.idscanrm);
  idSave(); render(false);
});
document.addEventListener("change", (e) => {
  const r = e.target.closest("[data-idr],[data-idw]"); if (!r || !idS.cfg) return;
  if (r.dataset.idw) idS.cfg.w[r.dataset.idw] = Number(r.value);
  else { const x = idS.cfg.rules[+r.dataset.idr], f = r.dataset.f; x[f] = f === "v" || f === "pts" ? Number(r.value) : r.value; if (f === "k" && r.value === "prefer" && x.pts == null) x.pts = 5; }
  idSave(); render(false);
});
document.addEventListener("submit", (e) => {
  if (e.target.id !== "idscan") return; e.preventDefault();
  const v = String(new FormData(e.target).get("t") || "").toUpperCase().split(/[\s,]+/).map((t) => t.replace(/[^A-Z0-9.^=\-]/g, "")).filter(Boolean);
  idS.cfg.scan = [...new Set([...(idS.cfg.scan || []), ...v])].slice(0, 60); idSave(); render(false);
});
