// Stock page: header, Overview tab, Technicals.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// ----- stock page -----
const TV_SYM = { "^GSPC": "SP:SPX", "^NDX": "NASDAQ:NDX", "^DJI": "DJ:DJI", "^RUT": "TVC:RUT", "^SET.BK": "SET:SET", "^SET50.BK": "SET:SET50", "^N225": "TVC:NI225",
  "^HSI": "TVC:HSI", "^GDAXI": "XETR:DAX", "^FTSE": "TVC:UKX", "GC=F": "COMEX:GC1!", "CL=F": "NYMEX:CL1!", "SI=F": "COMEX:SI1!", "BTC-USD": "BITSTAMP:BTCUSD", "ETH-USD": "BITSTAMP:ETHUSD", "THB=X": "FX_IDC:USDTHB", "EURUSD=X": "FX:EURUSD" };
const tvUrl = (t, y) => `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(TV_SYM[y] || (/\.BK$/.test(y) ? "SET:" + y.replace(/\.BK$/, "") : t))}`;
const CH_PANES = [["chart", "Overview"], ["facts", "Key facts"], ["fin", "Financials"], ["tech", "Technicals"], ["fc", "Forecasts"], ["seas", "Seasonals"], ["news", "News"], ["dates", "Dates"]];
const KC_TYPES = [["candle_solid", "Candles"], ["candle_stroke", "Hollow candles"], ["ohlc", "Bars"], ["area", "Line"]];
const KC_RNG = [["1D", 0, 80], ["5D", 1, 130], ["1M", 2, 165], ["3M", 3, 63], ["6M", 3, 126], ["YTD", 3, 0], ["1Y", 3, 252], ["5Y", 4, 260], ["All", 5, 9999]];
function kcBars() {
  const p = kc.period ?? 3, ty = kc.ctype || "candle_solid";
  return `<div class="kcbar">${chSearchBox(kc.sym || "Symbol")}<button class="${cmpList().length ? "on" : ""}" data-kcact="cmp" title="Compare or add symbol">＋ Compare${cmpList().length ? ` (${cmpList().length})` : ""}</button><i></i>${(() => { const fav = kcFavTf(), quick = KC_TF_GROUPS.flatMap(([, l]) => l).filter((i) => fav.includes(i) || i === p);
      return quick.map((i) => `<button class="${i === p ? "on" : ""}" data-kcp="${i}" title="${KC_TF_NAME(i)}">${KC_PERIODS[i].text}</button>`).join("")
        + `<details class="kcdd kctf"><summary title="Choose the timeframe">▾</summary><div>${KC_TF_GROUPS.map(([g, l]) => `<small>${g}</small>${l.map((i) => `<span class="tfr${i === p ? " on" : ""}"><button data-kcp="${i}">${KC_TF_NAME(i)}</button><button class="st${fav.includes(i) ? " on" : ""}" data-kctfav="${i}" title="${fav.includes(i) ? "Remove from" : "Add to"} favourites">${fav.includes(i) ? "★" : "☆"}</button></span>`).join("")}`).join("")}</div></details>`; })()}<i></i>
    <details class="kcdd"><summary>${chI("cand")} ${esc(KC_TYPES.find((x) => x[0] === ty)?.[1] || "Candles")} ▾</summary><div>${KC_TYPES.map(([v, l]) => `<button class="${v === ty ? "on" : ""}" data-kct="${v}">${l}</button>`).join("")}</div></details><i></i>
    <button data-kcact="ind" title="Indicators (Alt+I)">${chI("fx")} Indicators</button><button data-kcact="alertw" title="Create a price alert (Telegram)">${chI("bell", 16)} Alert</button><i></i>${(() => { const m = mkPref(); return `<button class="mk${m.n ? " on" : ""}" data-kcact="mkn" title="News pins: your stories about this stock (impact 6+)"><i style="background:#ff4500"></i>News</button><button class="mk${m.e ? " on" : ""}" data-kcact="mke" title="Events: earnings, dividends, Fed, CPI, jobs report"><i style="background:#3b82f6"></i>Events</button><i></i>`; })()}<button data-kcact="undo" title="Undo (Ctrl+Z)">${chI("undo")}</button><button data-kcact="redo" title="Redo (Ctrl+Y)">${chI("redo")}</button>
    <span class="sp"></span><button class="${kc.treeOpen ? "on" : ""}" data-kcact="tree" title="Object tree: all drawings and indicators">${ti("gannBox", 17)} Object tree</button><button data-kcact="shot" title="Save a picture of the chart">${chI("cam")}</button><button data-kcact="full" title="Full screen">${chI("full")}</button></div>`;
}
function kcBottom() {
  return `<div class="kcbot">${KC_RNG.map(([l]) => `<button class="${kc.range === l ? "on" : ""}" data-kcr="${l}">${l}</button>`).join("")}<span class="sp"></span><span class="kctz">Bangkok time (UTC+7)</span>
    <button class="${kc.pct ? "on" : ""}" data-kcact="pct" title="Percent scale">%</button><button class="${kcIsAuto() ? "on" : ""}" data-kcact="auto" title="Auto: fit the price scale to the visible candles (or double-click the price scale)">auto</button><button class="${kc.log ? "on" : ""}" data-kcact="log" title="Log scale">log</button></div>`;
}
function stPane(p, t, y, s, m, q) {
  const cur = s.currency || m.currency || "";
  const card = (title, body, link = "") => `<div class="chc chpane"><div class="mh"><h2>${title}</h2>${link}</div>${body}</div>`;
  const stat = (a, b) => `<div><span>${a}</span><b class="tnum">${b}</b></div>`;
  const noStats = `<p class="note" style="margin:10px 14px 14px">${chOf().ready013 === false ? "Key stats need supabase/013_charts.sql." : "Financials are collected once a day for your watchlist and the big stocks. Add this one to your watchlist (☆ Watch) to get them."}</p>`;
  if (p === "facts") {
    const r52 = m.lo52 && m.hi52 ? Math.max(0, Math.min(100, ((q?.price ?? m.price) - m.lo52) / (m.hi52 - m.lo52) * 100)) : null;
    return `<div class="stgrid">${card("Key facts", `<div class="kf">${[["Market cap", bigNum(s.marketCap, cur)], ["P/E (TTM)", s.pe ? Number(s.pe).toFixed(2) : "—"], ["Forward P/E", s.fpe ? Number(s.fpe).toFixed(2) : "—"], ["EPS (TTM)", s.eps !== undefined ? Number(s.eps).toFixed(2) : "—"],
      ["Day range", m.dayLow ? `${fmtPx(m.dayLow)} – ${fmtPx(m.dayHigh)}` : "—"], ["Volume", m.volume ? bigNum(m.volume) : "—"], ["Avg volume", bigNum(s.avgVolume)], ["Beta", s.beta ? Number(s.beta).toFixed(2) : "—"],
      ["Dividend yield", pctN(s.divYield, 2)], ["MA 50 / 200", s.ma50 ? `${fmtPx(s.ma50)} / ${fmtPx(s.ma200)}` : "—"], ["Sector", esc(s.sector || "—")], ["Industry", esc(s.industry || "—")]].map(([a, b]) => `<div><small>${a}</small><b class="tnum">${b}</b></div>`).join("")}</div>
      ${r52 !== null ? `<div class="rng"><small><span>52-week low ${fmtPx(m.lo52)}</span><span>52-week high ${fmtPx(m.hi52)}</span></small><div class="bar"><i style="left:${r52.toFixed(1)}%"></i></div></div>` : ""}`)}
      ${card("About", s.about ? `<p class="about">${esc(s.about)}</p><div class="kf k3">${[["Website", s.website ? `<a href="${esc(s.website)}" target="_blank" rel="noopener">${esc(s.website.replace(/^https?:\/\/(www\.)?/, ""))} ↗</a>` : "—"], ["Employees", s.employees ? Number(s.employees).toLocaleString("en-US") : "—"], ["Headquarters", esc(s.hq || "—")]].map(([a, b]) => `<div><small>${a}</small><b>${b}</b></div>`).join("")}</div>` : noStats)}</div>`;
  }
  if (p === "fin") {
    if (!s.revenue && !(s.quarters || []).length) return card("Financials", noStats);
    const mode = chOf().fin, rows = (mode === "y" ? s.years : s.quarters) || [], mx = Math.max(1, ...rows.flatMap((r) => [Math.abs(r.revenue || 0), Math.abs(r.earnings || 0)]));
    const bars = rows.length ? `<div class="fbars">${rows.map((r) => `<div><span class="b"><i class="rv" style="height:${Math.max(2, (r.revenue || 0) / mx * 100)}%" title="Revenue ${bigNum(r.revenue, cur)}"></i><i class="ni${(r.earnings || 0) < 0 ? " neg" : ""}" style="height:${Math.max(2, Math.abs(r.earnings || 0) / mx * 100)}%" title="Net income ${bigNum(r.earnings, cur)}"></i></span><small>${esc(r.q || r.y)}</small><em>${bigNum(r.revenue)} · ${bigNum(r.earnings)}</em></div>`).join("")}</div>
      <div class="flg"><span><i class="rv"></i>Revenue</span><span><i class="ni"></i>Net income</span></div>` : "";
    return `<div class="stgrid">${card("Revenue &amp; net income", `<div class="chsort" style="padding:0 14px 6px">${[["q", "Quarterly"], ["y", "Yearly"]].map(([v, l]) => `<button class="${v === mode ? "on" : ""}" data-chfin="${v}">${l}</button>`).join("")}</div>${bars}`)}
      ${card("Profitability &amp; health", `<div class="kf">${[["Revenue (TTM)", bigNum(s.revenue, cur) + (s.revenueGrowth !== undefined ? ` <em class="${s.revenueGrowth >= 0 ? "up" : "down"}">${s.revenueGrowth >= 0 ? "+" : ""}${pctN(s.revenueGrowth, 0)}</em>` : "")], ["Net income (TTM)", bigNum(s.netIncome, cur)],
        ["Gross margin", pctN(s.grossMargin)], ["Operating margin", pctN(s.opMargin)], ["Profit margin", pctN(s.margin)], ["Return on equity", pctN(s.roe)], ["Debt / equity", s.debtToEquity ? (s.debtToEquity / 100).toFixed(2) : "—"], ["Free cash flow", bigNum(s.fcf, cur)],
        ["Dividend / share", s.divRate ? Number(s.divRate).toFixed(2) : "—"], ["Dividend yield", pctN(s.divYield, 2)], ["Payout ratio", pctN(s.payout)], ["Ex-dividend", s.exDiv ? new Date(s.exDiv * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"]].map(([a, b]) => `<div><small>${a}</small><b class="tnum">${b}</b></div>`).join("")}</div>`)}</div>`;
  }
  if (p === "tech") return techPane(y);
  if (p === "fc") {
    if (!s.target) return card("Forecasts", `<p class="note" style="margin:10px 14px 14px">No analyst targets for ${esc(t)} (or not collected yet: only for your watchlist and the big stocks).</p>`);
    const now = q?.price ?? m.price, lo = Math.min(s.targetLow ?? s.target, now), hi = Math.max(s.targetHigh ?? s.target, now), P = (v) => ((v - lo) / (hi - lo || 1)) * 100;
    const r = s.ratings || {}, tot = ["strongBuy", "buy", "hold", "sell", "strongSell"].reduce((a, k) => a + (r[k] || 0), 0) || 1;
    const RT = [["strongBuy", "Strong buy", "#15803d"], ["buy", "Buy", "#4ade80"], ["hold", "Hold", "#a1a1aa"], ["sell", "Sell", "#f87171"], ["strongSell", "Strong sell", "#b91c1c"]];
    const up = now ? (s.target / now - 1) * 100 : null;
    return `<div class="stgrid">${card("Analysts' 1-year price target", `<div class="tgt"><p class="note" style="margin:0">${s.analysts ? `${s.analysts} analysts · ` : ""}Yahoo Finance consensus</p>
      <div class="tline"><i class="nw" style="left:${P(now)}%"></i><em style="left:${P(now)}%">Now ${fmtPx(now)}</em><i class="av" style="left:${P(s.target)}%"></i><em class="av" style="left:${P(s.target)}%;top:auto;bottom:-24px">Average ${fmtPx(s.target)}${up !== null ? ` (${up >= 0 ? "+" : ""}${up.toFixed(1)}%)` : ""}</em></div>
      <div class="tlh"><span>Low ${fmtPx(s.targetLow ?? s.target)}</span><span>High ${fmtPx(s.targetHigh ?? s.target)}</span></div></div>`)}
      ${card("Analyst rating", `<div class="tgt"><b class="rtg">${esc(String(s.rating || "—").replace("_", " "))}</b>${s.ratingMean ? `<span class="note" style="margin-left:8px">score ${Number(s.ratingMean).toFixed(2)} (1 = strong buy, 5 = strong sell)</span>` : ""}
      ${s.ratings ? `<div class="rbar">${RT.map(([k, , c]) => `<i style="width:${(r[k] || 0) / tot * 100}%;background:${c}"></i>`).join("")}</div><div class="rleg">${RT.map(([k, l, c]) => `<span><i style="background:${c}"></i>${l} ${r[k] || 0}</span>`).join("")}</div>` : ""}</div>`)}</div>`;
  }
  if (p === "seas") return seasPane(y);
  if (p === "news") {
    const news = (state.stories || []).filter((x) => (x.tickers || []).includes(t)).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 15);
    return card(`Our news on ${esc(t)}`, news.length ? `<div class="chnews">${news.map((x) => `<a class="it" href="#/story/${esc(x.id)}">${/^https:\/\//.test(x.image_url || "") ? `<img src="${esc(x.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : `<span class="qi ${impClass(x.impact_score)}">${x.impact_score}</span>`}<span><b><em class="${impClass(x.impact_score)}">${x.impact_score}</em>${esc(x.headline)}</b><small>${esc((x.outlets || [])[0] || "")} · ${ago(x.created_at)}${x.n_sources > 1 ? ` · ${x.n_sources} outlets` : ""}</small></span></a>`).join("")}</div>`
      : `<p class="note" style="margin:4px 14px 12px">No stories about ${esc(t)} in the last 3 days.</p>`, news.length ? `<a href="#/" data-stock="${esc(t)}">All in My News →</a>` : "");
  }
  if (p === "dates") {
    const t0 = isoDay(today0());
    const dates = [...(state.events || []).filter((e) => e.ticker === t && e.day >= t0).map((e) => ({ day: e.day, title: e.kind === "earnings" ? "Earnings" + (e.estimate ? " (estimated)" : "") : "Ex-dividend", key: e.kind === "earnings" })),
      ...(state.earn || []).filter((r) => r.ticker === t).map((r) => { const [v, c] = earnVerdict(r); return { day: isoDay(new Date(r.seen_at)), title: `Result: EPS ${eps(r.eps_actual)} vs ${eps(r.eps_estimate)} expected`, verdict: v, cls: c }; })];
    const dRow = (e) => { const x = dayOf(e.day), d = Math.round((x - today0()) / 864e5); return `<div class="d"><span class="dt"><small>${monTxt(x).toUpperCase()}</small>${x.getDate()}</span><span><b>${esc(e.title)}</b><span>${d > 0 ? `in ${d} day${d === 1 ? "" : "s"}` : d === 0 ? "today" : `${-d} day${d === -1 ? "" : "s"} ago`}</span></span>${e.verdict ? `<span class="chtag v ${e.cls}">${esc(e.verdict)}</span>` : e.key ? `<span class="chtag">KEY</span>` : ""}</div>`; };
    return `<div class="chc chcal chpane"><div class="mh"><h2>${esc(t)} dates</h2><a href="#/calendar">Stock calendar →</a></div>${dates.length ? dates.map(dRow).join("") : `<p class="note" style="margin:4px 14px 12px">No dates yet. Earnings dates are checked daily for your watchlist and the big stocks.</p>`}</div>`;
  }
  return "";
}
function viewChartStock(t) {
  const y = yahoo(t), q = quotes[y], s = statsOf(y) || {}, m = kc.meta && kc.metaFor === y ? kc.meta : {};
  const name = cleanName(chName(y) || s.name || m.name || state.settings.watch_names?.[t] || q?.name || t);
  const inW = (state.settings.watchlist || []).includes(t), cur = s.currency || m.currency || "", pane = chOf().pane || "chart";
  requestAnimationFrame(stMiniScroll);
  return `${header("charts")}<div class="wrap chp chs">
    <div class="chlay"><div class="chmain">
      <div class="sthd"><a class="chback" href="#/charts" title="All markets">‹</a>${chLogo(t, 48)}<div class="nm"><b>${esc(name)}</b><small>${esc(t)}${m.exchange ? ` · ${esc(m.exchange)}` : ""}${s.sector ? ` · ${esc(s.industry || s.sector)}` : ""}</small></div>
        <div class="chpx"><b>${pxSpan(y)}</b>${chSpan(y)}<small>${q?.time ? `${new Date(q.time * 1000).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ` : ""}Yahoo, may be delayed${cur ? ` · ${esc(cur)}` : ""}</small></div>
        <div class="act"><button class="${inW ? "pri" : ""}" data-chwatch="${esc(t)}">${inW ? "★ In watchlist" : "☆ Watch"}</button><a href="#/settings" data-tab-alerts="1">${chI("bell", 14)} Alert</a><a href="${esc(tvUrl(t, y))}" target="_blank" rel="noopener">TradingView ↗</a></div></div>
      <div class="sttabs">${CH_PANES.map(([k, l]) => `<button class="${k === pane ? "on" : ""}" data-chpane="${k}">${l}</button>`).join("")}</div>
      <div class="chc chbox"${pane === "chart" ? "" : " hidden"}>${kcBars()}<div id="kchost" class="kchost"></div>${kcBottom()}</div>
      ${pane === "chart" ? stOverview(t, y, s, m, q) : stPane(pane, t, y, s, m, q)}
    </div>${chSide(t)}</div>${stMini(t, y)}</div>`;
}

// ----- Overview tab (design round 43): TradingView's symbol-page order, drawn in our own card style -----
// chart -> performance tiles -> key facts / coming up / your alerts -> key stats + earnings -> similar stocks -> about
// -> 4 financial charts -> news -> technicals / analysts / target -> seasonals by year -> funds holding it
const PERF = [["1D", "1 day"], ["5D", "5 days"], ["1M", "1 month"], ["3M", "3 months"], ["6M", "6 months"], ["YTD", "Year to date"], ["1Y", "1 year"], ["5Y", "5 years"], ["10Y", "10 years"], ["All", "All time"]];
function perfOf(y, q) {
  const d = candOf(y, "5y", "1d"), mo = candOf(y, "max", "1mo"), out = {};
  const pts = (x) => (x?.t || []).map((t, i) => [t * 1000, Number(x.c?.[i])]).filter((p) => Number.isFinite(p[1]));
  const dd = pts(d), mm = pts(mo), now = q?.price ?? dd.at(-1)?.[1] ?? mm.at(-1)?.[1];
  if (!now) return out;
  const at = (list, ms) => { let v = null; for (const p of list) { if (p[0] <= ms) v = p[1]; else break; } return v; };
  const ret = (base) => (base ? (now / base - 1) * 100 : null);
  const back = (days) => Date.now() - days * 864e5;
  out["1D"] = chPct(y);
  if (dd.length) {
    const n = dd.length, last = dd[n - 1][0] > Date.now() - 864e5 * 0.6 ? n - 1 : n;   // 5 trading days back
    out["5D"] = ret(dd[Math.max(0, last - 5)][1]);
    [["1M", 30.4], ["3M", 91.3], ["6M", 182.6], ["1Y", 365.2]].forEach(([k, days]) => { out[k] = ret(at(dd, back(days))); });
    out.YTD = ret(at(dd, new Date(new Date().getFullYear(), 0, 1).getTime() - 1));
  }
  if (mm.length) { out["5Y"] = ret(at(mm, back(1826))); out["10Y"] = ret(at(mm, back(3652))); out.All = ret(mm[0][1]); }
  return out;
}
const shortN = (v) => bigNum(v).replace(/\.0(?=[TBMK])/, "");
const perLabel = (d, mode) => { const x = new Date(d); return mode === "a" ? String(x.getUTCFullYear()) : `Q${Math.ceil((x.getUTCMonth() + 1) / 3)} '${String(x.getUTCFullYear()).slice(2)}`; };
const svgWrap = (inner, h = 190) => `<svg class="ovsvg" viewBox="0 0 320 ${h}" role="img">${inner}</svg>`;
function axis(max, min = 0, h = 150, top = 12) {   // light grid lines + right-side labels; returns y() mapper
  const Y = (v) => top + (max - v) / (max - min || 1) * h;
  let g = "";
  for (let k = 0; k <= 4; k++) { const v = min + (max - min) * k / 4; g += `<line x1="0" x2="282" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="gl"/><text x="318" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end">${shortN(v)}</text>`; }
  return [Y, g];
}
function finPerf(s, mode) {
  const rows = (s.fin?.[mode] || []).filter((r) => r.rev !== undefined);
  const list = rows.length ? rows.map((r) => ({ l: perLabel(r.d, mode), rev: r.rev, net: r.net })) : ((mode === "a" ? s.years : s.quarters) || []).map((r) => ({ l: r.y || r.q, rev: r.revenue, net: r.earnings }));
  if (!list.length) return "";
  const mx = Math.max(1, ...list.map((r) => Math.max(r.rev || 0, r.net || 0))), mn = Math.min(0, ...list.map((r) => r.net || 0)), [Y, g] = axis(mx, mn), w = 282 / list.length;
  const mg = list.map((r) => (r.rev ? (r.net || 0) / r.rev : null)), mgMax = Math.max(0.01, ...mg.filter((v) => v !== null).map(Math.abs));
  let b = "";
  list.forEach((r, i) => {
    const x = i * w + w * 0.18, bw = w * 0.3;
    b += `<rect x="${x.toFixed(1)}" y="${Y(Math.max(0, r.rev || 0)).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, Y(0) - Y(Math.max(0, r.rev || 0))).toFixed(1)}" rx="2" class="rv"><title>Revenue ${bigNum(r.rev)}</title></rect>`;
    const n = r.net || 0;
    b += `<rect x="${(x + bw + 2).toFixed(1)}" y="${Y(Math.max(0, n)).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, Math.abs(Y(n) - Y(0))).toFixed(1)}" rx="2" class="${n < 0 ? "neg" : "ni"}"><title>Net income ${bigNum(n)}</title></rect>`;
    b += `<text x="${(i * w + w / 2).toFixed(1)}" y="182" text-anchor="middle">${esc(r.l)}</text>`;
  });
  const pts = mg.map((v, i) => (v === null ? null : `${(i * w + w / 2).toFixed(1)},${(12 + (1 - (v / mgMax + 1) / 2) * 150).toFixed(1)}`)).filter(Boolean);
  b += `<polyline points="${pts.join(" ")}" class="ml"/>${mg.map((v, i) => (v === null ? "" : `<circle cx="${(i * w + w / 2).toFixed(1)}" cy="${(12 + (1 - (v / mgMax + 1) / 2) * 150).toFixed(1)}" r="3" class="mld"><title>Net margin ${(v * 100).toFixed(1)}%</title></circle>`)).join("")}`;
  return svgWrap(g + b) + `<div class="ovleg"><span><i class="rv"></i>Revenue</span><span><i class="ni"></i>Net income</span><span><i class="ml"></i>Net margin</span></div>`;
}
function finSteps(s, mode) {
  const r = (s.fin?.[mode] || []).filter((x) => x.rev !== undefined && x.net !== undefined).at(-1);
  if (!r) return "";
  const cost = r.cost ?? (r.gross !== undefined ? r.rev - r.gross : null), gross = r.gross ?? (cost !== null ? r.rev - cost : null);
  const opinc = r.opinc ?? (gross !== null && r.opex !== undefined ? gross - r.opex : null), opex = r.opex ?? (gross !== null && opinc !== null ? gross - opinc : null);
  if (gross === null || opinc === null) return "";
  const tax = r.tax || 0, other = r.net - (opinc - tax);
  const st = [["Revenue", r.rev, 0, "tot"], ["Cost", -cost, r.rev, "dn"], ["Gross", gross, 0, "tot"], ["Opex", -opex, gross, "dn"], ["Op. inc", opinc, 0, "tot"], ["Tax", -tax, opinc, "dn"], ["Other", other, opinc - tax, other >= 0 ? "upx" : "dn"], ["Net", r.net, 0, "net"]];
  const mx = Math.max(1, r.rev), [Y, g] = axis(mx, Math.min(0, r.net)), w = 282 / st.length;
  let b = "";
  st.forEach(([l, v, base, c], i) => {
    const a = base, z = base + v, y1 = Y(Math.max(a, z)), y2 = Y(Math.min(a, z));
    b += `<rect x="${(i * w + w * 0.15).toFixed(1)}" y="${y1.toFixed(1)}" width="${(w * 0.7).toFixed(1)}" height="${Math.max(1, y2 - y1).toFixed(1)}" rx="2" class="${c}"><title>${l} ${bigNum(Math.abs(v))}</title></rect><text x="${(i * w + w / 2).toFixed(1)}" y="182" text-anchor="middle">${l}</text>`;
  });
  return svgWrap(g + b) + `<div class="ovleg"><span>${esc(perLabel(r.d, mode))} · from sales down to profit</span></div>`;
}
function finDebt(s, mode) {
  const rows = (s.fin?.[mode] || []).filter((x) => x.debt !== undefined || x.fcf !== undefined || x.cash !== undefined);
  if (!rows.length) return "";
  const K = [["debt", "Debt", "dn"], ["fcf", "Free cash flow", "upx"], ["cash", "Cash", "rv"]];
  const mx = Math.max(1, ...rows.flatMap((r) => K.map(([k]) => r[k] || 0))), mn = Math.min(0, ...rows.map((r) => r.fcf || 0)), [Y, g] = axis(mx, mn), w = 282 / rows.length;
  let b = "";
  rows.forEach((r, i) => {
    K.forEach(([k, l, c], j) => { const v = r[k]; if (v === undefined) return; const bw = w * 0.22; b += `<rect x="${(i * w + w * 0.14 + j * (bw + 1)).toFixed(1)}" y="${Y(Math.max(0, v)).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, Math.abs(Y(v) - Y(0))).toFixed(1)}" rx="2" class="${v < 0 && k === "fcf" ? "dn" : c}"><title>${l} ${bigNum(v)}</title></rect>`; });
    b += `<text x="${(i * w + w / 2).toFixed(1)}" y="182" text-anchor="middle">${esc(perLabel(r.d, mode))}</text>`;
  });
  return svgWrap(g + b) + `<div class="ovleg">${K.map(([, l, c]) => `<span><i class="${c}"></i>${l}</span>`).join("")}</div>`;
}
function finEps(s) {
  const q = (s.epsQ || []).slice(-4), nx = s.epsNext?.e !== undefined ? [{ q: s.epsNext.q, e: s.epsNext.e, next: true }] : [], list = [...q, ...nx];
  if (!list.length) return "";
  const vals = list.flatMap((r) => [r.a, r.e]).filter((v) => typeof v === "number"), mx = Math.max(0.01, ...vals), mn = Math.min(0, ...vals);
  const Y = (v) => 16 + (mx - v) / (mx - mn || 1) * 146, w = 282 / list.length;
  let g = "";
  for (let k = 0; k <= 4; k++) { const v = mn + (mx - mn) * k / 4; g += `<line x1="0" x2="282" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="gl"/><text x="318" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end">${v.toFixed(2)}</text>`; }
  list.forEach((r, i) => {
    const x = i * w + w / 2, lab = String(r.q || "").replace(/^(\d)Q(\d{2})(\d{2})$/, "Q$1 '$3");
    if (typeof r.e === "number") g += `<circle cx="${x.toFixed(1)}" cy="${Y(r.e).toFixed(1)}" r="7" class="est"><title>Estimate ${r.e.toFixed(2)}</title></circle>`;
    if (typeof r.a === "number") g += `<circle cx="${x.toFixed(1)}" cy="${Y(r.a).toFixed(1)}" r="7" class="${typeof r.e === "number" && r.a < r.e ? "miss" : "beat"}"><title>Actual ${r.a.toFixed(2)}${typeof r.e === "number" ? ` vs ${r.e.toFixed(2)} expected` : ""}</title></circle>`;
    g += `<text x="${x.toFixed(1)}" y="182" text-anchor="middle">${esc(lab)}${r.next ? " ·next" : ""}</text>`;
  });
  return svgWrap(g) + `<div class="ovleg"><span><i class="beat"></i>Beat</span><span><i class="miss"></i>Missed</span><span><i class="est"></i>Estimate</span></div>`;
}
function seasLines(y) {
  const d = candOf(y, "5y", "1d");
  if (!d) return `<p class="note" style="margin:10px 14px 14px">Calculating…</p>`;
  const by = {};
  (d.t || []).forEach((ts, i) => { const c = Number(d.c?.[i]); if (!Number.isFinite(c)) return; const x = new Date(ts * 1000); (by[x.getUTCFullYear()] ||= []).push([(x - Date.UTC(x.getUTCFullYear(), 0, 1)) / 864e5, c]); });
  const yrs = Object.keys(by).map(Number).sort((a, b) => b - a).slice(0, 3).reverse();
  if (!yrs.length) return `<p class="note" style="margin:10px 14px 14px">Not enough history.</p>`;
  const lines = yrs.map((yr) => { const base = by[yr - 1]?.at(-1)?.[1] ?? by[yr][0][1]; return [yr, by[yr].map(([dd, c]) => [dd, (c / base - 1) * 100])]; });
  const all = lines.flatMap(([, l]) => l.map((p) => p[1])), mx = Math.max(5, ...all), mn = Math.min(-5, ...all);
  const Y = (v) => (mx - v) / (mx - mn) * 100, cls = ["s1", "s2", "s3"].slice(-lines.length);
  const ticks = []; const step = Math.pow(10, Math.floor(Math.log10((mx - mn) / 4))) * ([1, 2, 5].find((m) => (mx - mn) / 4 <= m * Math.pow(10, Math.floor(Math.log10((mx - mn) / 4)))) || 10);
  for (let v = Math.ceil(mn / step) * step; v <= mx; v += step) ticks.push(v);
  return `<div class="seasl"><div class="sgplot"><svg viewBox="0 0 366 100" preserveAspectRatio="none">${ticks.map((v) => `<line x1="0" x2="366" y1="${Y(v).toFixed(2)}" y2="${Y(v).toFixed(2)}" class="${v === 0 ? "z" : "gl"}"/>`).join("")}
      ${lines.map(([yr, l], i) => `<polyline class="${cls[i]}" points="${l.map(([dd, v]) => `${dd.toFixed(1)},${Y(v).toFixed(2)}`).join(" ")}"><title>${yr}</title></polyline>`).join("")}</svg>
      <div class="yl">${ticks.map((v) => `<span style="top:${Y(v).toFixed(2)}%">${v > 0 ? "+" : ""}${Math.round(v)}%</span>`).join("")}</div>
      <div class="tags">${lines.map(([yr, l], i) => { const v = l.at(-1)[1]; return `<span class="${cls[i]}" style="top:${Y(v).toFixed(2)}%">${yr} ${v > 0 ? "+" : ""}${v.toFixed(1)}%</span>`; }).join("")}</div></div>
    <div class="mx">${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m) => `<span>${m}</span>`).join("")}</div></div>`;
}
function stOverview(t, y, s, m, q) {
  const ch = chOf(), cur = s.currency || m.currency || "", fm = ch.fm || (ch.fm = { perf: "a", wf: "a", debt: "a" });
  const card = (title, body, link = "", cls = "") => `<section class="chc ovc ${cls}"><div class="mh"><h2>${title}</h2>${link}</div>${body}</section>`;
  const more = (pane, label = "More") => `<a href="javascript:void 0" data-chpane="${pane}" data-chtop="1">${label} ›</a>`;
  const kv = (list, n = 4) => `<div class="kf ovkf" style="--n:${n}">${list.map(([a, b, x = ""]) => `<div><small>${a}</small><b class="tnum">${b}</b>${x}</div>`).join("")}</div>`;
  const noStats = `<p class="note" style="margin:4px 14px 14px">Collected once a day for your watchlist and the big stocks. Press ☆ Watch to add this one.</p>`;
  const P = perfOf(y, q);
  const perf = `<div class="ovperf">${PERF.map(([k, l]) => { const v = P[k]; return `<button class="${kc.range === k ? "on" : ""}" data-chperf="${k}" title="Show ${l.toLowerCase()} on the chart"><small>${l}</small><b class="tnum ${v === null || v === undefined ? "" : v >= 0 ? "up" : "down"}">${v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : v.toFixed(2)}%`}</b></button>`; }).join("")}</div>`;

  // key facts today (our own stories about this stock), coming up, your alerts + notes
  const news = (state.stories || []).filter((x) => (x.tickers || []).includes(t)).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const top = [...news].sort((a, b) => b.impact_score - a.impact_score || (a.created_at < b.created_at ? 1 : -1)).slice(0, 3), ki = Math.min(ch.kfi || 0, Math.max(0, top.length - 1)), k0 = top[ki];
  const facts = card("Key facts today", k0 ? `<div class="ovkfact"><small><em class="${impClass(k0.impact_score)}">${k0.impact_score}</em>${esc((k0.outlets || [])[0] || "")} · ${ago(k0.created_at)}</small>
      <p>${esc(k0.headline)}</p>${(k0.summary || [])[0] ? `<span>${esc(k0.summary[0])}</span>` : ""}
      <div class="nav">${top.length > 1 ? `<button data-chkf="${(ki + top.length - 1) % top.length}" aria-label="Previous">‹</button><b>${ki + 1} / ${top.length}</b><button data-chkf="${(ki + 1) % top.length}" aria-label="Next">›</button>` : ""}<a href="#/story/${esc(k0.id)}">Read the story →</a></div></div>`
    : `<p class="note" style="margin:4px 14px 14px">No stories about ${esc(t)} in the last 3 days.</p>`, news.length ? `<a href="#/" data-stock="${esc(t)}">All ${esc(t)} news (${news.length}) →</a>` : "");
  const t0 = isoDay(today0());
  const dl = [...(state.events || []).filter((e) => e.ticker === t && e.day >= t0).map((e) => ({ day: e.day, title: e.kind === "earnings" ? "Earnings" : "Ex-dividend", sub: e.kind === "earnings" ? `${e.estimate ? "Date estimated" : "Confirmed"}${s.epsNext?.e !== undefined ? ` · EPS estimate ${Number(s.epsNext.e).toFixed(2)}` : ""}` : "Own the stock the day before to get it" }))];
  if (!dl.some((e) => e.title === "Earnings") && s.nextEarn && s.nextEarn * 1000 > Date.now()) dl.push({ day: isoDay(new Date(s.nextEarn * 1000)), title: "Earnings", sub: `From Yahoo${s.epsNext?.e !== undefined ? ` · EPS estimate ${Number(s.epsNext.e).toFixed(2)}` : ""}` });
  if (!dl.some((e) => e.title === "Ex-dividend") && s.exDiv && s.exDiv * 1000 > Date.now()) dl.push({ day: isoDay(new Date(s.exDiv * 1000)), title: "Ex-dividend", sub: s.divRate ? `${Number(s.divRate).toFixed(2)} a year per share` : "" });
  dl.sort((a, b) => (a.day < b.day ? -1 : 1));
  const dRow = (e) => { const x = dayOf(e.day), d = Math.round((x - today0()) / 864e5); return `<div class="d"><span class="dt"><small>${monTxt(x).toUpperCase()}</small>${x.getDate()}</span><span><b>${esc(e.title)}</b><span>${esc(e.sub || "")}</span></span><span class="ovin">${d === 0 ? "today" : `in ${d} day${d === 1 ? "" : "s"}`}</span></div>`; };
  const coming = card("Coming up", dl.length ? dl.slice(0, 4).map(dRow).join("") : `<p class="note" style="margin:4px 14px 14px">No dates yet for ${esc(t)}.</p>`, more("dates", "All dates"), "chcal");
  if (state.alerts === undefined && !state.alertsLoading) { state.alertsLoading = true; loadAlerts().finally(() => { state.alertsLoading = false; render("soft"); }); }
  const al = Array.isArray(state.alerts) ? state.alerts.filter((a) => a.ticker === t) : [], px = q?.price;
  const nt = [...(state.notes || new Map())].map(([id, n]) => [news.find((x) => x.id === id), n]).filter(([x]) => x);
  const dr = (ch.draw[t] || ch.draw[y] || []).length;
  const icon = (k) => `<span class="dt ic">${chI(k, 16)}</span>`;
  const mine = card("Your alerts &amp; notes", [...al.map((a) => `<div class="d">${icon("bell")}<span><b>${a.kind === "move" ? `Moves ±${esc(a.value)}% in a day` : `${a.kind === "above" ? "Above" : "Below"} ${fmtPx(Number(a.value))}`}</b><span>${a.active ? "On · Telegram" : "Sent, now off"}</span></span><span class="ovin">${a.kind !== "move" && px ? `${Math.abs((Number(a.value) / px - 1) * 100).toFixed(1)}% away` : ""}</span></div>`),
    ...nt.slice(0, 2).map(([x, n]) => `<a class="d" href="#/story/${esc(x.id)}">${icon("fx")}<span><b>“${esc(n)}”</b><span>Your note on: ${esc(x.headline)}</span></span><span></span></a>`),
    dr ? `<div class="d">${icon("cand")}<span><b>${dr} drawing${dr === 1 ? "" : "s"} saved on this chart</b><span>They come back every time you open ${esc(t)}</span></span><span></span></div>` : ""].join("")
    || `<p class="note" style="margin:4px 14px 14px">No alerts or drawings yet. Right-click the chart → “Add price alert at this price”.</p>`, `<a href="#/settings" data-tab-alerts="1">Manage alerts →</a>`, "chcal");

  // key stats + latest earnings + employees
  const lastQ = (s.fin?.q || []).filter((r) => r.rev !== undefined), qn = lastQ.at(-1), qy = lastQ.length >= 5 ? lastQ.at(-5) : null, e0 = (s.epsQ || []).at(-1);
  const stats = card("Key stats", s.marketCap || s.pe ? kv([["Market cap", bigNum(s.marketCap, cur)], ["Dividend yield", pctN(s.divYield, 2)], ["P/E (TTM)", s.pe ? Number(s.pe).toFixed(2) : "—"], ["EPS (TTM)", s.eps !== undefined ? Number(s.eps).toFixed(2) : "—"],
    ["Net income (TTM)", bigNum(s.netIncome, cur)], ["Revenue (TTM)", bigNum(s.revenue, cur)], ["Shares float", bigNum(s.float)], ["Beta", s.beta ? Number(s.beta).toFixed(2) : "—"]]) : noStats, more("facts", "Key facts"));
  const earn = card("Latest earnings", e0 || qn ? kv([["Period", esc(String(e0?.q || "").replace(/^(\d)Q(\d{4})$/, "Q$1 $2") || (qn ? perLabel(qn.d, "q") : "—"))],
    ["EPS", e0?.a !== undefined ? Number(e0.a).toFixed(2) : "—", e0?.a !== undefined && e0?.e ? `<em class="${e0.a >= e0.e ? "up" : "down"}">${e0.a >= e0.e ? "beat" : "missed"} ${((e0.a / e0.e - 1) * 100).toFixed(1)}%</em>` : ""],
    ["Revenue", qn ? bigNum(qn.rev, cur) : "—", qn && qy?.rev ? `<em class="${qn.rev >= qy.rev ? "up" : "down"}">${qn.rev >= qy.rev ? "+" : ""}${((qn.rev / qy.rev - 1) * 100).toFixed(0)}% y/y</em>` : ""],
    ["Employees", s.employees ? shortN(s.employees) : "—", s.employees && s.revenue ? `<em class="muted">${bigNum(s.revenue / s.employees)} revenue each</em>` : ""]]) : noStats, more("fin", "Financials"));

  // similar stocks (Yahoo's "people also watch")
  const rel = (s.related || []).slice(0, 6);
  if (rel.some((r) => !quotes[r]) && !(ch.relAt ||= {})[y]) { ch.relAt[y] = 1; sb.rpc("get_quotes", { syms: rel }).then(({ data }) => { Object.assign(quotes, data || {}); render("soft"); }); }
  const sim = rel.length ? card("Similar stocks", `<div class="ovsim" style="--c:${rel.length}">${rel.map((r) => { const p = plainOf(r), qq = quotes[r]; return `<a href="${chHref(p)}">${chLogo(p, 30)}<span><b>${esc(p)}</b><small>${esc(cleanName(qq?.name || chName(r) || ""))}</small></span><em class="tnum">${pxSpan(r)}${chSpan(r)}</em></a>`; }).join("")}</div>`, `<span class="note">Yahoo's “people also watch”</span>`) : "";

  // about
  const about = card(`About ${esc(cleanName(s.name || t))}`, s.about || s.sector ? `${kv([["Sector", esc(s.sector || "—")], ["Industry", esc(s.industry || "—")], ["CEO", esc(s.ceo || "—")], ["Website", s.website ? `<a href="${esc(s.website)}" target="_blank" rel="noopener">${esc(s.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))} ↗</a>` : "—"],
    ["Headquarters", esc(s.hq || "—")], ["Employees", s.employees ? Number(s.employees).toLocaleString("en-US") : "—"], ["Shares outstanding", bigNum(s.shares)], ["Exchange · currency", `${esc(m.exchange || "—")} · ${esc(cur || "—")}`]])}
    ${s.about ? `<details class="ovabout"><summary><span>${esc(s.about.slice(0, 260))}${s.about.length > 260 ? "…" : ""}</span>${s.about.length > 260 ? "<b>Show more</b>" : ""}</summary><p>${esc(s.about)}</p></details>` : ""}` : noStats);

  // financials: 4 charts, each with its own Annual / Quarterly switch (like TradingView)
  const sw = (k) => `<span class="chsort">${[["a", "Annual"], ["q", "Quarterly"]].map(([v, l]) => `<button class="${fm[k] === v ? "on" : ""}" data-chfm="${k}:${v}">${l}</button>`).join("")}</span>`;
  const empty = `<p class="note" style="margin:4px 14px 14px">Not collected yet for ${esc(t)}.</p>`;
  const fins = `<div class="ovfin">${card("Revenue &amp; profit", finPerf(s, fm.perf) || empty, sw("perf"))}${card("Revenue to profit", finSteps(s, fm.wf) || empty, sw("wf"))}${card("Debt, cash flow &amp; cash", finDebt(s, fm.debt) || empty, sw("debt"))}${card("Earnings per share", finEps(s) || empty, s.nextEarn && s.nextEarn * 1000 > Date.now() ? `<span class="note">Next ${new Date(s.nextEarn * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>` : "")}</div>`;

  // news grid
  const newsC = card(`News on ${esc(t)}`, news.length ? `<div class="ovnews">${news.slice(0, 8).map((x) => `<a href="#/story/${esc(x.id)}"><small><em class="${impClass(x.impact_score)}">${x.impact_score}</em>${esc((x.outlets || [])[0] || "")} · ${ago(x.created_at)}</small><b>${esc(x.headline)}</b></a>`).join("")}</div>`
    : `<p class="note" style="margin:4px 14px 14px">No stories about ${esc(t)} in the last 3 days.</p>`, news.length ? more("news", "All news") : "");

  // technicals + analysts + price target
  const T = (() => { const d = candOf(y, "5y", "1d"); return d ? techOf(d) : null; })();
  const tech = card("Technicals", T ? `<div class="ovg">${gauge("Summary · 1 day", T.s.all, T.count([...T.osc, ...T.ma]))}</div>` : `<p class="note" style="margin:4px 14px 14px">Calculating…</p>`, more("tech", "Details"));
  const r = s.ratings || {}, tot = ["strongBuy", "buy", "hold", "sell", "strongSell"].reduce((a, k) => a + (r[k] || 0), 0);
  const RT = [["strongBuy", "Strong buy", "#15803d"], ["buy", "Buy", "#4ade80"], ["hold", "Hold", "#a1a1aa"], ["sell", "Sell", "#f87171"], ["strongSell", "Strong sell", "#b91c1c"]];
  const anl = card("Analyst rating", tot ? `<div class="tgt" style="padding-bottom:16px"><b class="rtg">${esc(String(s.rating || "—").replace("_", " "))}</b><span class="note" style="margin-left:8px">${tot} analysts</span>
      <div class="rbar">${RT.map(([k, , c]) => `<i style="width:${(r[k] || 0) / tot * 100}%;background:${c}"></i>`).join("")}</div><div class="rleg">${RT.map(([k, l, c]) => `<span><i style="background:${c}"></i>${l} ${r[k] || 0}</span>`).join("")}</div></div>` : `<p class="note" style="margin:4px 14px 14px">No analyst ratings for ${esc(t)}.</p>`, more("fc", "Forecasts"));
  const now = q?.price ?? m.price, up = s.target && now ? (s.target / now - 1) * 100 : null;
  const lo = Math.min(s.targetLow ?? s.target, now), hi = Math.max(s.targetHigh ?? s.target, now), PP = (v) => ((v - lo) / (hi - lo || 1)) * 100;
  const tgt = card("1-year price target", s.target && now ? `<div class="tgt"><b class="rtg tnum">${fmtPx(s.target)}</b> <em class="${up >= 0 ? "up" : "down"}" style="font:800 14px Inter;font-style:normal">${up >= 0 ? "+" : ""}${up.toFixed(1)}%</em><span class="note" style="display:block;margin:2px 0 0">Average of analysts' targets</span>
      <div class="tline"><i class="nw" style="left:${PP(now)}%"></i><em style="left:${PP(now)}%">Now</em><i class="av" style="left:${PP(s.target)}%"></i></div><div class="tlh"><span>Low ${fmtPx(s.targetLow ?? s.target)}</span><span>High ${fmtPx(s.targetHigh ?? s.target)}</span></div></div>` : `<p class="note" style="margin:4px 14px 14px">No price target for ${esc(t)}.</p>`);

  const seas = card("Seasonals", seasLines(y), `<span class="note">each year from 1 January</span>${more("seas", "Month table")}`);
  const fundsOk = (s.funds || []).length && !/\.BK$/.test(y);
  const funds = fundsOk ? card(`Funds holding ${esc(t)}`, `<div class="ovtb"><div class="h"><span>FUND</span><span class="n">SHARE OF ${esc(t)}</span><span class="n">VALUE</span></div>${s.funds.map((f) => `<div><span>${esc(String(f.n || "").replace(/^[A-Z &.,'-]+-(?=[A-Z][a-z])/, ""))}</span><span class="n tnum">${f.pct ? (f.pct * 100).toFixed(2) + "%" : "—"}</span><span class="n tnum">${bigNum(f.val)}</span></div>`).join("")}</div>`, `<span class="note">Yahoo, latest filings</span>`) : "";

  return `${perf}
    <div class="ovrow r3">${facts}${coming}${mine}</div>
    <div class="ovrow r2">${stats}${earn}</div>
    ${sim}${about}
    <h3 class="ovh">Financials ${more("fin", "")}</h3>${fins}
    ${newsC}
    <div class="ovrow r3">${tech}${anl}${tgt}</div>
    ${seas}${funds}`;
}
// slim price bar that stays on top while you scroll the stock page (like TradingView)
function stMini(t, y) {
  return `<div class="stmini" id="stmini" aria-hidden="true"><div class="in">${chLogo(t, 26)}<b>${esc(t)}</b><span class="tnum">${pxSpan(y)}${chSpan(y)}</span>
    <span class="tb">${CH_PANES.map(([k, l]) => `<button class="${k === (chOf().pane || "chart") ? "on" : ""}" data-chpane="${k}" data-chtop="1">${l}</button>`).join("")}</span>
    <span class="sp"></span><button data-chtop="1" data-chpane="chart">↑ Chart</button><button class="pri" data-kcact="full">${chI("full", 14)} Full chart</button></div></div>`;
}
function stMiniScroll() {
  const el = document.getElementById("stmini"), hd = document.querySelector(".sttabs");
  if (!el || !hd) return;
  const show = hd.getBoundingClientRect().bottom < (document.querySelector("header")?.offsetHeight || 0);
  el.style.top = `${document.querySelector("header")?.offsetHeight || 0}px`;
  el.classList.toggle("on", show);
}
addEventListener("scroll", stMiniScroll, { passive: true });

// ----- Technicals (TradingView-style rating, calculated here from the candles) -----
const sma = (a, n) => a.map((_, i) => (i < n - 1 ? null : a.slice(i - n + 1, i + 1).reduce((x, y) => x + y, 0) / n));
const ema = (a, n) => { const k = 2 / (n + 1), o = []; let e = null; a.forEach((v, i) => { if (v === null || v === undefined) { o.push(e); return; } e = e === null ? (i >= n - 1 ? a.slice(i - n + 1, i + 1).reduce((x, y) => x + y, 0) / n : null) : v * k + e * (1 - k); o.push(e); }); return o; };
const rma = (a, n) => { const o = []; let r = null; a.forEach((v, i) => { if (v === null) { o.push(r); return; } r = r === null ? (i >= n - 1 ? a.slice(i - n + 1, i + 1).reduce((x, y) => x + y, 0) / n : null) : (r * (n - 1) + v) / n; o.push(r); }); return o; };
const wma = (a, n) => a.map((_, i) => { if (i < n - 1) return null; let s = 0, w = 0; for (let k = 0; k < n; k++) { s += a[i - k] * (n - k); w += n - k; } return s / w; });
function rsiOf(c, n) {
  const g = c.map((v, i) => (i ? Math.max(0, v - c[i - 1]) : null)), l = c.map((v, i) => (i ? Math.max(0, c[i - 1] - v) : null));
  const ag = rma(g.map((x) => x ?? null).slice(1), n), al = rma(l.slice(1), n);
  return [null, ...ag.map((x, i) => (x === null || al[i] === null ? null : al[i] === 0 ? 100 : 100 - 100 / (1 + x / al[i])))];
}
function techOf(d) {
  const c = closes(d), h = (d?.h || []).map(Number), l = (d?.l || []).map(Number);
  if (c.length < 60) return null;
  const n = c.length - 1, px = c[n], out = { osc: [], ma: [] };
  const act = (b, s) => (b ? 1 : s ? -1 : 0);
  const r = rsiOf(c, 14); out.osc.push(["RSI (14)", r[n], act(r[n] < 30 && r[n] > r[n - 1], r[n] > 70 && r[n] < r[n - 1])]);
  const hh = (i, k) => Math.max(...h.slice(i - k + 1, i + 1)), ll = (i, k) => Math.min(...l.slice(i - k + 1, i + 1));
  const kRaw = c.map((v, i) => (i < 13 ? null : ((v - ll(i, 14)) / (hh(i, 14) - ll(i, 14) || 1)) * 100)), K = sma(kRaw.map((x) => x ?? 0), 3), D = sma(K.map((x) => x ?? 0), 3);
  out.osc.push(["Stochastic %K (14, 3, 3)", K[n], act(K[n] < 20 && K[n] > D[n], K[n] > 80 && K[n] < D[n])]);
  const tp = c.map((v, i) => (v + h[i] + l[i]) / 3), tps = sma(tp, 20), md = tp.map((_, i) => (i < 19 ? null : tp.slice(i - 19, i + 1).reduce((a, x) => a + Math.abs(x - tps[i]), 0) / 20));
  const cci = tp.map((v, i) => (md[i] ? (v - tps[i]) / (0.015 * md[i]) : null)); out.osc.push(["CCI (20)", cci[n], act(cci[n] < -100 && cci[n] > cci[n - 1], cci[n] > 100 && cci[n] < cci[n - 1])]);
  const hl2 = h.map((v, i) => (v + l[i]) / 2), ao = sma(hl2, 5).map((v, i) => (v === null || sma(hl2, 34)[i] === null ? null : v - sma(hl2, 34)[i]));
  out.osc.push(["Awesome oscillator", ao[n], act(ao[n] > 0 && ao[n] > ao[n - 1], ao[n] < 0 && ao[n] < ao[n - 1])]);
  const mom = c[n] - c[n - 10], mom1 = c[n - 1] - c[n - 11]; out.osc.push(["Momentum (10)", mom, act(mom > mom1, mom < mom1)]);
  const e12 = ema(c, 12), e26 = ema(c, 26), mac = e12.map((v, i) => (v === null || e26[i] === null ? null : v - e26[i])), sig = ema(mac, 9);
  out.osc.push(["MACD level (12, 26)", mac[n], act(mac[n] > sig[n], mac[n] < sig[n])]);
  const wr = ((hh(n, 14) - px) / (hh(n, 14) - ll(n, 14) || 1)) * -100, wr1 = ((hh(n - 1, 14) - c[n - 1]) / (hh(n - 1, 14) - ll(n - 1, 14) || 1)) * -100;
  out.osc.push(["Williams %R (14)", wr, act(wr < -80 && wr > wr1, wr > -20 && wr < wr1)]);
  [10, 20, 30, 50, 100, 200].forEach((k) => {
    if (c.length > k) { const e = ema(c, k)[n], s2 = sma(c, k)[n]; out.ma.push([`EMA (${k})`, e, act(e !== null && px > e, e !== null && px < e)]); out.ma.push([`SMA (${k})`, s2, act(s2 !== null && px > s2, s2 !== null && px < s2)]); }
  });
  const score = (list) => { const v = list.filter((x) => x[1] !== null && Number.isFinite(x[1])); return v.length ? v.reduce((a, x) => a + x[2], 0) / v.length : 0; };
  out.s = { osc: score(out.osc), ma: score(out.ma) }; out.s.all = (out.s.osc + out.s.ma) / 2;
  out.count = (list) => ({ b: list.filter((x) => x[2] === 1).length, n: list.filter((x) => x[2] === 0).length, s: list.filter((x) => x[2] === -1).length });
  return out;
}
const RATE = (v) => (v > 0.5 ? ["Strong buy", "sb"] : v > 0.1 ? ["Buy", "b"] : v >= -0.1 ? ["Neutral", "n"] : v >= -0.5 ? ["Sell", "s"] : ["Strong sell", "ss"]);
function gauge(title, v, cnt) {
  const [lab, cls] = RATE(v), a = Math.PI * (1 - (v + 1) / 2), x = 90 + 64 * Math.cos(a), y2 = 86 - 64 * Math.sin(a);
  return `<div class="gauge"><svg viewBox="0 0 180 96" width="180" height="96"><path d="M16 86 A74 74 0 0 1 164 86" fill="none" stroke="var(--chip)" stroke-width="12"/>
    <path d="M16 86 A74 74 0 0 1 46 27" fill="none" stroke="#ef4444" stroke-width="12"/><path d="M134 27 A74 74 0 0 1 164 86" fill="none" stroke="#2563eb" stroke-width="12"/>
    <line x1="90" y1="86" x2="${x.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="var(--ink)" stroke-width="3.5" stroke-linecap="round"/><circle cx="90" cy="86" r="6" fill="var(--ink)"/></svg>
    <small>${title}</small><b class="rt ${cls}">${lab}</b><span class="cnt">Sell ${cnt.s} · Neutral ${cnt.n} · Buy ${cnt.b}</span></div>`;
}
const TECH_TF = { "1H": ["3mo", "60m"], "1D": ["2y", "1d"], "1W": ["5y", "1wk"] };
function techPane(y) {
  const ch = chOf(), tf = ch.tf || "1D", [r, i] = TECH_TF[tf], d = candOf(y, r, i), T = d ? techOf(d) : null;
  const tfs = `<div class="chsort" style="padding:0 14px 6px">${Object.keys(TECH_TF).map((k) => `<button class="${k === tf ? "on" : ""}" data-chtf="${k}">${k === "1H" ? "1 hour" : k === "1D" ? "1 day" : "1 week"}</button>`).join("")}</div>`;
  if (!T) return `<div class="chc chpane"><div class="mh"><h2>Technicals</h2></div>${tfs}<p class="note" style="margin:10px 14px 14px">${d ? "Not enough price history for a rating." : "Calculating…"}</p></div>`;
  const row = ([n, v, a]) => `<div class="tr"><span>${esc(n)}</span><b class="tnum">${v === null || !Number.isFinite(v) ? "—" : Math.abs(v) >= 1000 ? fmtPx(v) : Number(v).toFixed(2)}</b><em class="rt ${a === 1 ? "b" : a === -1 ? "s" : "n"}">${a === 1 ? "Buy" : a === -1 ? "Sell" : "Neutral"}</em></div>`;
  return `<div class="chc chpane"><div class="mh"><h2>Technicals</h2><span class="note">TradingView-style rating, calculated from Yahoo candles</span></div>${tfs}
    <div class="gauges">${gauge("Oscillators", T.s.osc, T.count(T.osc))}${gauge("Summary", T.s.all, T.count([...T.osc, ...T.ma]))}${gauge("Moving averages", T.s.ma, T.count(T.ma))}</div>
    <div class="ttabs"><div><h4>Oscillators</h4>${T.osc.map(row).join("")}</div><div><h4>Moving averages</h4>${T.ma.map(row).join("")}</div></div>
    <p class="note" style="margin:6px 14px 14px">Not advice: a summary of what common indicators say right now.</p></div>`;
}
function seasPane(y) {
  const d = candOf(y, "10y", "1mo");
  if (!d) return `<div class="chc chpane"><div class="mh"><h2>Seasonals</h2></div><p class="note" style="margin:10px 14px 14px">Calculating…</p></div>`;
  const by = {};
  (d.t || []).forEach((ts, i) => { const c = d.c?.[i], p = d.c?.[i - 1]; if (typeof c !== "number" || typeof p !== "number") return; const x = new Date(ts * 1000), yr = x.getUTCFullYear(), mo = x.getUTCMonth(); (by[yr] ||= {})[mo] = (c / p - 1) * 100; });
  const years = Object.keys(by).map(Number).sort((a, b) => b - a).slice(0, 8);
  if (!years.length) return `<div class="chc chpane"><div class="mh"><h2>Seasonals</h2></div><p class="note" style="margin:10px 14px 14px">Not enough monthly history.</p></div>`;
  const col = (v) => (v === undefined ? "transparent" : v > 4 ? "#15803d" : v > 1 ? "#4ade80" : v > -1 ? "var(--chip)" : v > -4 ? "#f87171" : "#b91c1c");
  const fg = (v) => (v !== undefined && Math.abs(v) > 4 ? "#fff" : "var(--ink)");
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const avg = M.map((_, m) => { const v = years.map((yy) => by[yy][m]).filter((x) => x !== undefined); return v.length ? [v.reduce((a, x) => a + x, 0) / v.length, v.filter((x) => x > 0).length / v.length] : [undefined, 0]; });
  const cell = (v) => `<div style="background:${col(v)};color:${fg(v)}">${v === undefined ? "" : `${v > 0 ? "+" : ""}${v.toFixed(1)}`}</div>`;
  return `<div class="chc chpane"><div class="mh"><h2>Seasonals · return by month (%)</h2><span class="note">last ${years.length} years, monthly closes</span></div>
    <div class="seas"><div></div>${M.map((m) => `<div class="hd">${m}</div>`).join("")}
      ${years.map((yy) => `<div class="yr">${yy}</div>${M.map((_, m) => cell(by[yy][m])).join("")}`).join("")}
      <div class="yr b">Average</div>${avg.map(([v]) => cell(v)).join("")}<div class="yr b">Up years</div>${avg.map(([, p]) => `<div class="pp">${Math.round(p * 100)}%</div>`).join("")}</div></div>`;
}

