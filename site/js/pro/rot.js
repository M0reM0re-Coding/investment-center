// Pro F3 ROT: sector + style rotation (plan module 05), linked to the MACRO regime (addition 2).
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// US sector ETFs (SPDR) and style pairs, 1 year of daily closes from get_candles (Yahoo). All in the browser, no robot.
// "Relative strength" = the ETF's return minus the S&P 500's (SPY) over the same days.
const ROT_SEC = [["XLK", "Technology"], ["XLC", "Communication"], ["XLY", "Consumer Discretionary"], ["XLP", "Consumer Staples"], ["XLE", "Energy"], ["XLF", "Financials"],
  ["XLV", "Health Care"], ["XLI", "Industrials"], ["XLB", "Materials"], ["XLU", "Utilities"], ["XLRE", "Real Estate"], ["SMH", "Semiconductors"]];
const ROT_PAIRS = [["IWF", "IWD", "Growth vs Value"], ["IWM", "SPY", "Small vs Large caps"], ["RSP", "SPY", "Equal-weight vs S&P (breadth)"], ["XLY", "XLP", "Cyclicals vs Defensives"],
  ["EEM", "EFA", "Emerging vs Developed"], ["THD", "EEM", "Thailand vs Emerging"], ["SPY", "TLT", "Stocks vs Long bonds"], ["GLD", "SPY", "Gold vs Stocks"], ["BTC-USD", "SPY", "Bitcoin vs Stocks"], ["SMH", "SPY", "Semis vs Market"]];
const ROT_REGIME = { Goldilocks: ["XLK", "XLC", "XLY", "SMH"], Reflation: ["XLE", "XLB", "XLF", "XLI"], Stagflation: ["XLE", "XLP"], Slowdown: ["XLP", "XLV", "XLU"] };
const ROT_P = [["1W", 5], ["1M", 21], ["3M", 63], ["6M", 126], ["1Y", 250]];
// ALL ASSETS view: where money is going between asset types, measured against world stocks (ACWI) instead of the S&P 500.
const ROT_ASSETS = [
  ["STOCKS", [["SPY", "US stocks"], ["VGK", "Europe stocks"], ["EWJ", "Japan stocks"], ["MCHI", "China stocks"], ["EEM", "Emerging stocks"], ["THD", "Thai stocks"]]],
  ["BONDS", [["SHY", "US Treasury 1-3Y"], ["IEF", "US Treasury 7-10Y"], ["TLT", "US Treasury 20Y+"], ["TIP", "Inflation-linked (TIPS)"], ["LQD", "Corporate, inv. grade"], ["HYG", "Corporate, high yield"], ["EMB", "Emerging-market bonds"]]],
  ["COMMODITIES", [["GLD", "Gold"], ["SLV", "Silver"], ["USO", "Oil (WTI)"], ["CPER", "Copper"], ["DBA", "Farm goods"]]],
  ["CURRENCIES", [["UUP", "US dollar (vs majors)"], ["FXY", "Japanese yen"], ["FXE", "Euro"]]],
  ["CRYPTO", [["BTC-USD", "Bitcoin"], ["ETH-USD", "Ether"]]],
  ["REAL ESTATE", [["VNQ", "US REITs"]]]];
const rotView = () => proStore("ic_pro_rview", "stocks");

function rotSeries(y) { const d = proCandles(y, "1y"); if (!d) return null; return (d.c || []).map((c, i) => [d.t[i], c]).filter((x) => typeof x[1] === "number"); }
const rotRet = (s, n) => (s && s.length > n ? (s[s.length - 1][1] / s[s.length - 1 - n][1] - 1) * 100 : null);
const rotYtd = (s) => { if (!s?.length) return null; const y0 = Date.UTC(new Date().getUTCFullYear(), 0, 1) / 1000; const b = [...s].reverse().find((x) => x[0] < y0); return b ? (s[s.length - 1][1] / b[1] - 1) * 100 : null; };
// relative line: ETF / SPY rebased to 100, on dates both have
function rotRel(a, b) {
  const mb = new Map(b.map((x) => [new Date(x[0] * 1000).toISOString().slice(0, 10), x[1]]));
  const pts = a.map((x) => [new Date(x[0] * 1000).toISOString().slice(0, 10), x[1], mb.get(new Date(x[0] * 1000).toISOString().slice(0, 10))]).filter((x) => x[2]);
  if (!pts.length) return [];
  const base = pts[0][1] / pts[0][2];
  return pts.map((x) => [x[0], (x[1] / x[2] / base) * 100]);
}

function rotQuad(rows, H = 300) {   // relative rotation: x = 3M relative strength, y = its 1M change (momentum)
  const W = 520, pts = rows.filter((r) => r.rs3 !== null && r.mom !== null);
  if (!pts.length) return "";
  const mx = Math.max(4, ...pts.map((p) => Math.abs(p.rs3))) * 1.15, my = Math.max(2, ...pts.map((p) => Math.abs(p.mom))) * 1.15;
  const X = (v) => W / 2 + (v / mx) * (W / 2 - 16), Y = (v) => H / 2 - (v / my) * (H / 2 - 16);
  return `<svg class="pline pquadc" viewBox="0 0 ${W} ${H}" width="100%" style="aspect-ratio:${W}/${H}">
    <line class="z" x1="${W / 2}" x2="${W / 2}" y1="0" y2="${H}"/><line class="z" x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}"/>
    <text x="${W - 6}" y="14" text-anchor="end" class="qt">LEADING</text><text x="6" y="14" class="qt">IMPROVING</text><text x="6" y="${H - 6}" class="qt">LAGGING</text><text x="${W - 6}" y="${H - 6}" text-anchor="end" class="qt">WEAKENING</text>
    ${(() => { // labels: try right, left, above, below of the dot (then further out) and take the first spot that doesn't cover another label or dot
      const dots = pts.map((p) => [X(p.rs3), Y(p.mom)]), boxes = [];
      const hit = (b) => boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) || dots.some(([x, y]) => x > b[0] - 3 && x < b[2] + 3 && y > b[1] - 3 && y < b[3] + 3) || b[0] < 0 || b[2] > W || b[1] < 16 || b[3] > H - 14;
      return pts.map((p, k) => { const [cx, cy] = dots[k], w = String(p.y).length * 6.6 + 2;
        const cand = [[7, -4], [-7 - w, -4], [-w / 2, -16], [-w / 2, 8], [7, -15], [7, 7], [-7 - w, -15], [-7 - w, 7], [12, -26], [12, 18], [-12 - w, -26], [-12 - w, 18], [-w / 2, -30], [-w / 2, 22]];
        let pick = null; for (const [dx, dy] of cand) { const b = [cx + dx, cy + dy, cx + dx + w, cy + dy + 10]; if (!hit(b)) { pick = b; break; } }
        if (!pick) pick = [cx + 7, cy - 4, cx + 7 + w, cy + 6];
        boxes.push(pick);
        const far = Math.hypot(pick[0] + w / 2 - cx, pick[1] + 5 - cy) > 24;
        return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4" class="${p.fit ? "fit" : ""}"/>${far ? `<line class="gr" x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${(pick[0] < cx ? pick[2] : pick[0]).toFixed(1)}" y2="${(pick[1] + 5).toFixed(1)}"/>` : ""}<text x="${pick[0].toFixed(1)}" y="${(pick[1] + 9).toFixed(1)}" class="lb">${esc(p.y)}</text>`; }).join(""); })()}</svg>
    <div class="pnote">Right = beating the S&amp;P over 3 months. Up = that lead is growing over the last month. Sectors usually move clockwise: Improving → Leading → Weakening → Lagging. <span class="pa">●</span> = fits the current MACRO regime.</div>`;
}

PRO_VIEWS.rot = () => {
  const v = rotView(), sub = `<div class="psub ptabs">${[["stocks", "STOCK SECTORS"], ["assets", "ALL ASSETS"]].map(([k, l]) => `<button class="${k === v ? "on" : ""}" data-rview="${k}">${l}</button>`).join("")}</div>`;
  return sub + (v === "assets" ? rotAssets() : rotStocks());
};
document.addEventListener("click", (e) => { const b = e.target.closest("[data-rview]"); if (!b) return; proSet("ic_pro_rview", b.dataset.rview); render(false); });

function rotAssets() {
  const bm = rotSeries("ACWI"), m = proGet("macro"), reg = m?.regime?.name;
  const all = ROT_ASSETS.flatMap(([g, l]) => l.map(([y, n]) => ({ g, y, n, s: rotSeries(y) })));
  const got = all.filter((x) => x.s).length + (bm ? 1 : 0);
  if (!bm) return `<div class="pgrid g2">${proPanel("CROSS-ASSET ROTATION", "YAHOO · DAILY", proWait(`LOADING ${got}/${all.length + 1}…`), "s2")}</div>`;
  const fitA = new Set({ Goldilocks: ["SPY", "EEM", "HYG", "BTC-USD", "ETH-USD", "CPER"], Reflation: ["USO", "CPER", "DBA", "TIP", "EEM", "THD", "VGK"], Stagflation: ["GLD", "SLV", "TIP", "USO", "SHY"], Slowdown: ["TLT", "IEF", "GLD", "FXY", "UUP"] }[reg] || []);
  all.forEach((r) => { r.fit = fitA.has(r.y); if (!r.s) return; ROT_P.forEach(([k, n]) => { r[k] = rotRet(r.s, n); }); r.ytd = rotYtd(r.s);
    r.rs3 = (rotRet(r.s, 63) ?? 0) - (rotRet(bm, 63) ?? 0); const rel = rotRel(r.s, bm); r.rel = rel; r.mom = rel.length > 22 ? (rel[rel.length - 1][1] / rel[rel.length - 22][1] - 1) * 100 : null; });
  const cell = (v) => `<td>${v === null || v === undefined ? "—" : pUD(v, pPct(v, 1))}</td>`;
  const heat = (v) => `<td style="background:color-mix(in srgb, ${v >= 0 ? "var(--pup)" : "var(--pdn)"} ${Math.min(60, Math.abs(v ?? 0) * 4)}%, transparent)">${v === null || v === undefined ? "—" : pPct(v, 1)}</td>`;
  const stage = (r) => (r.rs3 === null || r.mom === null ? "" : r.rs3 >= 0 ? (r.mom >= 0 ? "LEADING" : "WEAKENING") : r.mom >= 0 ? "IMPROVING" : "LAGGING");
  const tag = (st) => `<span class="ptag ${st === "LEADING" ? "g" : st === "LAGGING" ? "r" : st === "IMPROVING" ? "a" : "y"}">${st}</span>`;
  const tbl = `<table class="ptab"><tr><th class="l">ASSET</th><th class="l">ETF</th>${ROT_P.map(([k]) => `<th>${k}</th>`).join("")}<th>YTD</th><th>vs WORLD 3M</th><th>STAGE</th><th>1Y vs WORLD</th></tr>
    <tr class="tot"><td class="l">World stocks</td><td class="l t">ACWI</td>${ROT_P.map(([, n]) => cell(rotRet(bm, n))).join("")}${cell(rotYtd(bm))}<td></td><td></td><td></td></tr>
    ${ROT_ASSETS.map(([g]) => `<tr><th class="l" colspan="11">${g}</th></tr>${all.filter((r) => r.g === g).map((r) => !r.s ? `<tr><td class="l">${esc(r.n)}</td><td class="l t">${r.y}</td><td colspan="9" class="pd l">loading…</td></tr>`
      : `<tr><td class="l">${r.fit ? '<span class="pa">● </span>' : ""}${esc(r.n)}</td><td class="l t">${esc(r.y.replace("-USD", ""))}</td>${ROT_P.map(([k]) => heat(r[k])).join("")}${cell(r.ytd)}${cell(r.rs3)}<td>${tag(stage(r))}</td>
        <td>${proSpark(r.rel.map((x) => x[1]), 110, 20, (r.rel.at(-1)?.[1] ?? 100) >= 100 ? "up" : "dn")}</td></tr>`).join("")}`).join("")}</table>
    <div class="pnote">ETFs stand in for each asset (e.g. TLT = long US government bonds, GLD = gold). Returns include price only. <span class="pa">●</span> = usually helped in the current MACRO regime (${esc(reg || "—")}).</div>`;
  const live = all.filter((r) => r.s);
  // money flow by asset type: average 3M lead vs world stocks per group
  const grp = ROT_ASSETS.map(([g]) => { const l = live.filter((r) => r.g === g && r.rs3 !== null); return { g, v: l.length ? pMean(l.map((r) => r.rs3)) : null }; }).filter((x) => x.v !== null).sort((a, b) => b.v - a.v);
  const mx = Math.max(1, ...grp.map((x) => Math.abs(x.v)));
  const bars = `<table class="ptab">${grp.map((x) => `<tr><td class="l">${x.g}</td><td class="l" style="width:60%"><div style="display:flex;justify-content:${x.v >= 0 ? "flex-start" : "flex-end"};width:50%;margin-left:${x.v >= 0 ? "50%" : "0"}"><i style="display:block;height:10px;width:${(Math.abs(x.v) / mx) * 100}%;background:var(${x.v >= 0 ? "--pup" : "--pdn"})"></i></div></td><td>${pUD(x.v, pPct(x.v, 1))}</td></tr>`).join("")}</table>
    <div class="pnote">Average 3-month lead over world stocks for each asset type. Bonds + gold on top while stocks lag = money hiding (risk-off). Stocks, copper and high yield on top = risk-on.</div>`;
  const risk = (() => { const g = (y) => live.find((r) => r.y === y)?.rs3; const on = [g("SPY"), g("HYG"), g("CPER"), g("EEM")].filter((x) => x !== undefined), off = [g("TLT"), g("GLD"), g("FXY"), g("SHY")].filter((x) => x !== undefined);
    if (!on.length || !off.length) return null; return pMean(on) - pMean(off); })();
  return `<div class="pgrid g21">${proPanel("CROSS-ASSET ROTATION", "YAHOO (ETFs) · DAILY · 1Y · vs ACWI", tbl)}
    <div class="pcol">${proPanel("MONEY FLOW BY ASSET TYPE", "3M vs WORLD STOCKS", `${risk === null ? "" : `<div class="pbigw"><div><div class="pbig ${risk >= 0 ? "up" : "dn"}">${risk >= 0 ? "RISK-ON" : "RISK-OFF"}</div><small>RISKY ASSETS ${pPct(risk, 1)} VS SAFE ASSETS OVER 3 MONTHS</small></div></div>`}${bars}`)}
    ${proPanel("ROTATION MAP · ALL ASSETS", "3M LEAD × 1M MOMENTUM vs WORLD", rotQuad(live.map((r) => ({ ...r, y: r.y.replace("-USD", "") })), 420))}</div></div>`;
}

function rotStocks() {
  const spy = rotSeries("SPY"), m = proGet("macro"), reg = m?.regime?.name, fit = new Set(ROT_REGIME[reg] || []);
  const sec = ROT_SEC.map(([y, n]) => { const s = rotSeries(y); return { y, n, s, fit: fit.has(y) }; });
  const pairs = ROT_PAIRS.map(([a, b, n]) => ({ a, b, n, sa: rotSeries(a), sb: rotSeries(b) }));
  const got = [spy, ...sec.map((x) => x.s), ...pairs.flatMap((p) => [p.sa, p.sb])].filter(Boolean).length, of = 1 + sec.length + pairs.length * 2;
  if (!spy) return `<div class="pgrid g2">${proPanel("ROTATION", "YAHOO · DAILY", proWait(`LOADING ${got}/${of}…`), "s2")}</div>`;
  sec.forEach((r) => { if (!r.s) return; ROT_P.forEach(([k, n]) => { r[k] = rotRet(r.s, n); }); r.ytd = rotYtd(r.s); const rs = (n) => (rotRet(r.s, n) ?? 0) - (rotRet(spy, n) ?? 0);
    r.rs3 = rs(63); const rel = rotRel(r.s, spy); r.mom = rel.length > 22 ? (rel[rel.length - 1][1] / rel[rel.length - 22][1] - 1) * 100 : null; r.rel = rel; });
  const spyR = Object.fromEntries(ROT_P.map(([k, n]) => [k, rotRet(spy, n)]));
  const live = sec.filter((r) => r.s).sort((a, b) => (b.rs3 ?? -1e9) - (a.rs3 ?? -1e9));
  const cell = (v) => `<td>${v === null || v === undefined ? "—" : pUD(v, pPct(v, 1))}</td>`;
  const heat = (v) => `<td style="background:color-mix(in srgb, ${v >= 0 ? "var(--pup)" : "var(--pdn)"} ${Math.min(60, Math.abs(v) * 6)}%, transparent)">${v === null ? "—" : pPct(v, 1)}</td>`;
  const tbl = `<table class="ptab"><tr><th class="l">SECTOR</th><th class="l">ETF</th>${ROT_P.map(([k]) => `<th>${k}</th>`).join("")}<th>YTD</th><th>vs S&amp;P 3M</th><th>STAGE</th><th>1Y vs S&amp;P</th></tr>
    <tr class="tot"><td class="l">S&amp;P 500</td><td class="l t">SPY</td>${ROT_P.map(([k]) => cell(spyR[k])).join("")}${cell(rotYtd(spy))}<td></td><td></td><td></td></tr>
    ${live.map((r) => { const st = r.rs3 === null || r.mom === null ? "" : r.rs3 >= 0 ? (r.mom >= 0 ? "LEADING" : "WEAKENING") : r.mom >= 0 ? "IMPROVING" : "LAGGING";
      return `<tr><td class="l">${r.fit ? '<span class="pa">● </span>' : ""}${esc(r.n)}</td><td class="l t">${r.y}</td>${ROT_P.map(([k]) => heat(r[k])).join("")}${cell(r.ytd)}${cell(r.rs3)}
      <td><span class="ptag ${st === "LEADING" ? "g" : st === "LAGGING" ? "r" : st === "IMPROVING" ? "a" : "y"}">${st}</span></td><td>${proSpark(r.rel.map((x) => x[1]), 110, 20, (r.rel.at(-1)?.[1] ?? 100) >= 100 ? "up" : "dn")}</td></tr>`; }).join("")}</table>`;
  const ptbl = `<table class="ptab"><tr><th class="l">PAIR</th><th>1M</th><th>3M</th><th>1Y</th><th>1Y (RATIO)</th><th class="l">READ (3M)</th></tr>${pairs.map((p) => {
    if (!p.sa || !p.sb) return `<tr><td class="l">${esc(p.n)}</td><td colspan="5" class="pd l">loading…</td></tr>`;
    const rel = rotRel(p.sa, p.sb), r = (n) => (rel.length > n ? (rel[rel.length - 1][1] / rel[rel.length - 1 - n][1] - 1) * 100 : null), r3 = r(63);
    return `<tr><td class="l">${esc(p.n)} <span class="pd">${p.a}/${p.b}</span></td>${[r(21), r3, r(rel.length - 1)].map(cell).join("")}<td>${proSpark(rel.map((x) => x[1]), 120, 20, (rel.at(-1)?.[1] ?? 100) >= 100 ? "up" : "dn")}</td>
      <td class="l pd">${r3 === null ? "" : r3 >= 0 ? `${esc(p.n.split(" vs ")[0])} leading` : `${esc(p.n.split(" vs ")[1])} leading`}</td></tr>`; }).join("")}</table>
    <div class="pnote">Each line = first ÷ second, so rising = the first one is winning. Equal-weight vs S&amp;P falling = only a few giant stocks are carrying the index (narrow market).</div>`;
  return `<div class="pgrid g21">${proPanel("SECTOR ROTATION · US", "YAHOO (SPDR ETFs) · DAILY · 1Y", tbl)}
    ${proPanel("ROTATION MAP", "3M RELATIVE STRENGTH × 1M MOMENTUM", rotQuad(live))}</div>
    <div class="pgrid g21">${proPanel("STYLE + ASSET PAIRS", "YAHOO · DAILY", ptbl)}
    ${proPanel("REGIME LINK", "FROM MACRO (F2)", reg ? `<div class="pbigw"><div><div class="pbig">${esc(reg.toUpperCase())}</div><small>CURRENT MACRO REGIME</small></div></div>
      <div class="pkv"><span>Usually helped</span><span class="up">${esc(MAC_PLAY[reg][1])}</span><span>Usually hurt</span><span class="dn">${esc(MAC_PLAY[reg][2])}</span>
      <span>Regime sectors now leading</span><span>${live.filter((r) => r.fit && r.rs3 > 0).map((r) => r.y).join(", ") || "none"}</span><span>Regime sectors lagging</span><span>${live.filter((r) => r.fit && r.rs3 <= 0).map((r) => r.y).join(", ") || "none"}</span></div>
      <div class="pnote">When the regime's usual winners are <b>not</b> leading, either the market disagrees with the data or the regime is about to change. Worth a look either way.</div>` : proSoon("Needs MACRO data.", ""))}</div>`;
};
