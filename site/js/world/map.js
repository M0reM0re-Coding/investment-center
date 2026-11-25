// World map.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// ---------- World map (design rounds 22-24): continent colours, 19 situation kinds, region bubbles, ONE line at a time ----------
// Colour = family, icon = what happened, plain sentence = who did what to whom (all from the AI's "situation" field).
// World view: one bubble per region (tap = zoom in). Zoomed: one icon per story, only the selected/hovered story gets its line.
// Map data (Natural Earth via jsDelivr) loads only when you first press "Map".
state.wview = safe(() => localStorage.getItem("ic_wview"), null) === "map" ? "map" : "list"; state.wsel = null; state.wzoom = "World"; state.whover = null;
let GEO = null, geoLoading = null;
const GEO_ALIAS = { "United States": "United States of America", USA: "United States of America", US: "United States of America", UK: "United Kingdom",
  Britain: "United Kingdom", "Czech Republic": "Czechia", "DR Congo": "Dem. Rep. Congo", "Democratic Republic of the Congo": "Dem. Rep. Congo",
  "Central African Republic": "Central African Rep.", "South Sudan": "S. Sudan", "Ivory Coast": "Côte d'Ivoire", "Bosnia and Herzegovina": "Bosnia and Herz.",
  "Dominican Republic": "Dominican Rep.", Gaza: "Palestine", "West Bank": "Palestine", "Palestinian territories": "Palestine", Burma: "Myanmar", Eswatini: "eSwatini" };
// Places shown at the capital (whole-country centres mislead: France's shape includes French Guiana, Russia's centre is in Siberia)
const GEO_CAP = { Russia: [37.6, 55.75], "United States of America": [-77, 38.9], "United Kingdom": [-0.1, 51.5], France: [2.35, 48.86], Canada: [-75.7, 45.4],
  China: [116.4, 39.9], India: [77.2, 28.6], Brazil: [-47.9, -15.8], Australia: [149.1, -35.3], Norway: [10.75, 59.9], Chile: [-70.6, -33.4],
  Indonesia: [106.8, -6.2], Japan: [139.7, 35.7], "New Zealand": [174.8, -41.3], Denmark: [12.57, 55.68], Netherlands: [4.9, 52.37], Malaysia: [101.7, 3.1],
  Singapore: [103.82, 1.35], "Hong Kong": [114.17, 22.32], Bahrain: [50.56, 26.07], Malta: [14.45, 35.9], Maldives: [73.5, 4.2], Mauritius: [57.55, -20.3],
  Vatican: [12.45, 41.9], Monaco: [7.42, 43.74], EU: [4.35, 50.85], "European Union": [4.35, 50.85], NATO: [4.35, 50.85], UN: [-73.97, 40.75], "United Nations": [-73.97, 40.75] };
const W_ME = new Set(["Iran", "Iraq", "Syria", "Israel", "Palestine", "Jordan", "Lebanon", "Saudi Arabia", "Yemen", "Oman", "United Arab Emirates", "Qatar", "Kuwait", "Turkey", "Cyprus", "Bahrain"]);
const W_AF = new Set(["Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi", "Cameroon", "Central African Rep.", "Chad", "Congo", "Dem. Rep. Congo", "Côte d'Ivoire",
  "Djibouti", "Egypt", "Eq. Guinea", "Eritrea", "eSwatini", "Ethiopia", "Gabon", "Gambia", "Ghana", "Guinea", "Guinea-Bissau", "Kenya", "Lesotho", "Liberia", "Libya",
  "Madagascar", "Malawi", "Mali", "Mauritania", "Morocco", "Mozambique", "Namibia", "Niger", "Nigeria", "Rwanda", "Senegal", "Sierra Leone", "Somalia", "Somaliland",
  "South Africa", "S. Sudan", "Sudan", "Tanzania", "Togo", "Tunisia", "Uganda", "W. Sahara", "Zambia", "Zimbabwe", "Mauritius"]);
const contOf = (n, ll) => (W_ME.has(n) ? "me" : W_AF.has(n) ? "af" : n === "Russia" ? "eu" : ll[0] < -25 ? "am" : ll[0] < 50 && ll[1] > 34 ? "eu" : "as");
const CONT_REG = { eu: "Europe", am: "Americas", me: "Middle East", as: "Asia-Pacific", af: "Africa" };
const WBOX = { Europe: [[-12, 25.5], [44, 62]], "Middle East": [[24, 11], [64, 44]], "Asia-Pacific": [[62, -42], [152, 46]], Americas: [[-128, -38], [-40, 60]], Africa: [[-20, -36], [52, 37]] };
const WRC = { Europe: [14, 50], "Middle East": [44, 30], "Asia-Pacific": [105, 10], Americas: [-90, 22], Africa: [20, 2] };
const WFAM = { conflict: ["Conflict", "--k-conflict"], pressure: ["Pressure", "--k-pressure"], deal: ["Deals", "--k-deal"], help: ["Help sent", "--k-help"],
  event: ["In one place", "--k-event"], news: ["Other news", "--k-news"] };
const WFAM_ORDER = ["conflict", "pressure", "deal", "help", "event", "news"];
// kind: [family, icon, name, line style, motion, two-way, one place]
const WK = {
  strike: ["conflict", "missile", "Strike", "solid", "missile", 0, 0], war: ["conflict", "swords", "War", "solid", "both", 1, 0],
  troops: ["conflict", "troops", "Troops move in", "solid", "", 0, 0], threat: ["conflict", "warn", "Threat", "dot", "", 0, 0],
  test: ["conflict", "rocket", "Weapons test", "", "ring", 0, 1], cyber: ["conflict", "cyber", "Cyberattack", "dash", "", 0, 0],
  sanction: ["pressure", "block", "Sanctions", "dash", "", 0, 0], tariff: ["pressure", "tariff", "Trade fight", "dash", "", 1, 0],
  cut: ["pressure", "broken", "Ties cut", "gap", "", 1, 0], peace: ["deal", "peace", "Peace talks", "solid", "", 1, 0],
  deal: ["deal", "deal", "Agreement", "solid", "", 1, 0], summit: ["deal", "summit", "Summit", "solid", "", 0, 1],
  aid: ["help", "aid", "Aid sent", "solid", "flow", 0, 0], arms: ["help", "arms", "Weapons supplied", "solid", "flow", 0, 0],
  refugees: ["help", "people", "People fleeing", "solid", "flow", 0, 0], protest: ["event", "protest", "Protest / strike", "", "ring", 0, 1],
  vote: ["event", "vote", "Election", "", "", 0, 1], disaster: ["event", "fire", "Disaster", "", "ring", 0, 1],
  outbreak: ["event", "virus", "Outbreak", "", "ring", 0, 1], news: ["news", "news", "News", "", "", 0, 1],
};
const WICO = {
  missile: '<path d="M14.5 4.5c2.5-1 4.5-1 5 0s-1 2.5-2 5L11 16l-3-3z"/><path d="M8 13l-3 1-1 3 3-1M11 16l-1 3-3 1 1-3"/><path d="M5 19l-2 2"/>',
  swords: '<path d="M4 4l9 9M20 4l-9 9M3 17l4 4M21 17l-4 4M6 15l3 3M18 15l-3 3"/>', troops: '<path d="M4 7l8 5 8-5M4 13l8 5 8-5"/>',
  warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>', rocket: '<path d="M12 2c3 3 4 7 4 11l-4 3-4-3c0-4 1-8 4-11z"/><path d="M8 13l-3 4h4M16 13l3 4h-4M12 16v5"/>',
  cyber: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>', block: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
  tariff: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
  broken: '<path d="M9 15l-2 2a3 3 0 0 1-4-4l2-2M15 9l2-2a3 3 0 0 1 4 4l-2 2M8 6V3M3 8h3M16 18v3M21 16h-3"/>',
  peace: '<path d="M12 3v18M12 12l-7 6M12 12l7 6"/><circle cx="12" cy="12" r="9"/>', deal: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 14l2 2 4-4"/>',
  summit: '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2 20c0-3 3-5 6-5s6 2 6 5M14 15.2c1-.2 1.5-.2 2-.2 3 0 6 2 6 5"/>',
  aid: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>', arms: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  people: '<circle cx="12" cy="5" r="2"/><path d="M10 22l2-7 3 3v4M8 12l3-4h3l2 3 3 1M11 15l-3-2"/>', protest: '<path d="M3 10v4h3l9 5V5L6 10z"/><path d="M18.5 9a3.5 3.5 0 0 1 0 6"/>',
  vote: '<path d="M4 21h16M7 3h10v11H7z"/><path d="M9.5 8.5l2 2 3.5-3.5"/>', fire: '<path d="M12 3c3 4 6 6.5 6 11a6 6 0 0 1-12 0c0-3 1.5-5 3-7 .8 2 2 3 3 3 0-3-1-5 0-7z"/>',
  virus: '<circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/>',
  news: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/>',
};
const wIcon = (k, px) => `<svg viewBox="0 0 24 24" width="${px}" height="${px}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${WICO[WK[k][1]]}</svg>`;
const wFamCol = (k) => `var(${WFAM[WK[k][0]][1]})`;
const wShort = (n) => ({ "United States of America": "US", "United Kingdom": "UK", "United Arab Emirates": "UAE" }[n] || n);

function loadGeo() {
  if (GEO || geoLoading) return geoLoading;
  geoLoading = Promise.all([import("https://cdn.jsdelivr.net/npm/d3-geo@3.1.1/+esm"), import("https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm"),
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json").then((r) => r.json())])
    .then(([d3, topo, world]) => {
      const land = topo.feature(world, world.objects.countries).features.filter((f) => f.properties.name !== "Antarctica");
      const at = {}, cont = {};
      land.forEach((f) => { const c = d3.geoCentroid(f); at[f.properties.name] = c; cont[f.properties.name] = contOf(f.properties.name, c); });
      GEO = { d3, land, at, cont, cache: {} };
      if ((location.hash || "").startsWith("#/world") && state.wview === "map") render(false);
    }).catch(() => { geoLoading = null; GEO = { err: true }; render(false); });
  return geoLoading;
}
const geoName = (n) => GEO_ALIAS[n] || n;
const geoLL = (n) => { if (!n || !GEO || !GEO.at) return null; const k = geoName(n); return GEO_CAP[k] || GEO.at[k] || null; };
const geoReg = (n) => { const k = geoName(n), ll = geoLL(n); return ll ? CONT_REG[GEO.cont[k] || contOf(k, ll)] : null; };

// One map item per story: its situation, or (no situation) a plain "news" icon at its country. Global stories have no place.
function wItems(list) {
  return list.map(({ s, own }) => {
    const sit = s.situation && WK[s.situation.kind] ? s.situation : null;
    let it = null;
    if (sit && WK[sit.kind][6]) { if (geoLL(sit.at)) it = { k: sit.kind, at: sit.at, many: (sit.many || []).filter(geoLL) }; }
    else if (sit) { if (geoLL(sit.from) && geoLL(sit.to)) it = { k: sit.kind, a: sit.from, b: sit.to }; }
    if (!it && s.country && s.country !== "Global" && geoLL(s.country)) it = { k: "news", at: s.country, many: [] };
    if (!it) return null;
    const where = it.at || it.b;
    return { ...it, s, own, say: (sit && sit.say) || s.headline, reg: geoReg(where) || s.region };
  }).filter(Boolean);
}
function wProj(z, W, H, extra = []) {   // extra: places that must also fit (both ends of the selected story's line)
  const key = `${z}|${W}|${H}|${extra.map((p) => p.join(",")).join(";")}`, c = GEO.cache[key];
  if (c) return c;
  const d3 = GEO.d3;
  const proj = z === "World" ? d3.geoNaturalEarth1().fitExtent([[6, 6], [W - 6, H - 6]], { type: "FeatureCollection", features: GEO.land })
    : d3.geoMercator().fitExtent([[24, 30], [W - 24, H - 24]], { type: "MultiPoint", coordinates: [...WBOX[z], ...extra] });
  const path = d3.geoPath(proj);
  const out = { proj, land: GEO.land.map((f) => ({ n: f.properties.name, d: path(f) })).filter((x) => x.d) };
  GEO.cache[key] = out;
  return out;
}
// Ring segment for the region bubbles (share of each family)
function wArc(cx, cy, r0, r1, a0, a1) {
  if (a1 - a0 >= Math.PI * 2 - 1e-6) return `<circle cx="${cx}" cy="${cy}" r="${(r0 + r1) / 2}" fill="none" stroke-width="${r1 - r0}" STROKE/>`;
  const p = (r, a) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`, L = a1 - a0 > Math.PI ? 1 : 0;
  return `<path d="M${p(r1, a0)} A${r1},${r1} 0 ${L} 1 ${p(r1, a1)} L${p(r0, a1)} A${r0},${r0} 0 ${L} 0 ${p(r0, a0)}Z" FILL/>`;
}
function wMapSvg(items, sel) {
  const phone = isPhone(), W = phone ? 360 : 640, H = phone ? 240 : 430, z = state.wzoom, zoomed = z !== "World";
  const act = items.find((x) => x.s.id === state.whover) || sel;
  // a line that starts in another region (e.g. Ukraine -> Libya while zoomed on Africa): widen the zoom so both ends show
  const ends = zoomed && act && act.reg === z && act.a ? [geoLL(act.a), geoLL(act.b)].filter(Boolean) : [];
  const { proj, land } = wProj(z, W, H, ends), P = (n) => proj(geoLL(n));
  const lineOn = act && zoomed && act.reg === z;
  const hit = new Set(lineOn ? [act.a, act.b, act.at, ...(act.many || [])].filter(Boolean).map(geoName) : []);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Map of today's world stories"><defs>${WFAM_ORDER.map((f) => `<marker id="wah-${f}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="var(${WFAM[f][1]})"/></marker>`).join("")}</defs>`;
  s += `<g class="wland">${land.map((l) => `<path class="c-${GEO.cont[l.n] || "as"}${hit.has(l.n) ? " hit" : ""}" d="${l.d}"><title>${esc(l.n)}</title></path>`).join("")}</g>`;
  if (lineOn) {   // the ONE line: the selected (or hovered) story
    const x = act, [fam, , , ls, mv, two, one] = WK[x.k], c = wFamCol(x.k);
    const nm = (n, px, py, up) => `<text class="wcn" x="${px.toFixed(1)}" y="${(py + (up ? -11 : 20)).toFixed(1)}">${esc(wShort(n))}</text>`;
    if (one) {
      const [px, py] = P(x.at);
      (x.many || []).forEach((m) => { const [mx, my] = P(m); s += `<path class="wln" d="M${mx},${my} L${px},${py}" style="stroke:${c}" stroke-width="2"/><circle cx="${mx}" cy="${my}" r="4" style="fill:${c}" class="wdot"/>`; });
      if (mv === "ring") s += `<circle class="wring" cx="${px}" cy="${py}" r="14" style="stroke:${c}"/>`;
    } else {
      const [x1, y1] = P(x.a), [x2, y2] = P(x.b), dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, bend = Math.min(70, len * 0.3);
      const cx = (x1 + x2) / 2 - (dy / len) * bend, cy = (y1 + y2) / 2 + (dx / len) * bend, d = `M${x1.toFixed(1)},${y1.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
      const mk = ["peace", "deal", "tariff", "cut"].includes(x.k) ? "" : `marker-end="url(#wah-${fam})"${two ? ` marker-start="url(#wah-${fam})"` : ""}`;
      s += `<path class="wln${ls === "dot" ? " dot" : ls === "dash" ? " dash" : ls === "gap" ? " gap" : ""}" d="${d}" style="stroke:${c}" ${ls === "gap" ? 'pathLength="100"' : ""} ${mk}/>`;
      if (mv === "missile" || mv === "both") s += `<path class="wmv-missile" d="${d}" pathLength="400" style="stroke:${c}"/><circle class="wboom" cx="${x2}" cy="${y2}" r="11" style="fill:${c}"/>`;
      if (mv === "flow") s += `<path class="wmv-flow" d="${d}" style="stroke:${c}"/>`;
      s += `<circle class="wdot" cx="${x1}" cy="${y1}" r="5" style="fill:${c}"/><circle class="wdot" cx="${x2}" cy="${y2}" r="5" style="fill:${c}"/>${nm(x.a, x1, y1, y1 <= y2)}${nm(x.b, x2, y2, y2 < y1)}`;
    }
  }
  if (!zoomed) {   // world view: one bubble per region with news; the ring shows the mix of families
    const sm = phone;
    const bs = Object.keys(WBOX).map((r) => { const xs = items.filter((x) => x.reg === r); if (!xs.length) return null; const [bx, by] = proj(WRC[r]); return { r, xs, bx, by, R: Math.min(sm ? 30 : 46, (sm ? 13 : 18) + xs.length * (sm ? 1.6 : 3.2)) }; }).filter(Boolean);
    for (let it = 0; it < 200; it++) bs.forEach((a, i) => bs.forEach((b, j) => { if (i >= j) return; const dx = b.bx - a.bx, dy = b.by - a.by, dd = Math.hypot(dx, dy) || 0.01, min = a.R + b.R + (sm ? 6 : 34); if (dd < min) { const m = (min - dd) / 2, ux = dx / dd, uy = dy / dd; a.bx -= ux * m; a.by -= uy * m; b.bx += ux * m; b.by += uy * m; } }));
    bs.forEach(({ r, xs, bx, by, R }) => {
      let a0 = -Math.PI / 2, ring = "";
      WFAM_ORDER.forEach((f) => { const n = xs.filter((x) => WK[x.k][0] === f).length; if (!n) return; const a1 = a0 + (n / xs.length) * Math.PI * 2, col = `var(${WFAM[f][1]})`;
        ring += wArc(bx, by, R - (sm ? 4 : 6), R, a0, a1).replace("FILL", `style="fill:${col}"`).replace("STROKE", `style="stroke:${col}"`); a0 = a1; });
      s += `<g class="wbub" data-wzoom="${esc(r)}" role="button" aria-label="${esc(r)}: ${xs.length} stories"><circle class="face" cx="${bx}" cy="${by}" r="${R}"/>${ring}<text class="n" x="${bx}" y="${by}"${sm ? ' style="font-size:14px"' : ""}>${xs.length}</text>${sm ? "" : `<text class="t" x="${bx}" y="${by + R + 14}">${esc(r)}</text>`}</g>`;
    });
  } else {        // zoomed: one icon per story where it happened (two-way: middle; selected: middle of its line), pushed apart so they never stack
    const R = phone ? 11 : 14, xs = items.filter((x) => x.reg === z);
    const pts = xs.map((x) => {
      const two = WK[x.k][5], one = WK[x.k][6];
      let p;
      if (one) p = P(x.at);
      else if (x === act || two) {
        const a = P(x.a), b = P(x.b), dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, bend = Math.min(70, len * 0.3);
        const cx = (a[0] + b[0]) / 2 - (dy / len) * bend, cy = (a[1] + b[1]) / 2 + (dx / len) * bend;
        p = [0.25 * a[0] + 0.5 * cx + 0.25 * b[0], 0.25 * a[1] + 0.5 * cy + 0.25 * b[1]];
      } else p = P(x.b);
      return { x, px: p[0], py: p[1], ox: p[0], oy: p[1] };
    });
    for (let it = 0; it < 250; it++) pts.forEach((a, i) => pts.forEach((b, j) => { if (i >= j) return; const dx = b.px - a.px, dy = b.py - a.py, dd = Math.hypot(dx, dy) || 0.01, min = R * 2 + 4; if (dd < min) { const m = (min - dd) / 2, ux = dx / dd, uy = dy / dd; a.px -= ux * m; a.py -= uy * m; b.px += ux * m; b.py += uy * m; } }));
    pts.forEach((p) => { p.px = Math.max(R + 2, Math.min(W - R - 2, p.px)); p.py = Math.max(R + 2, Math.min(H - R - 2, p.py)); });
    pts.forEach((p) => {
      const c = wFamCol(p.x.k), isA = act === p.x, moved = Math.hypot(p.px - p.ox, p.py - p.oy) > 3, r = isA ? R + 3 : R;
      s += `${moved ? `<line x1="${p.ox}" y1="${p.oy}" x2="${p.px}" y2="${p.py}" style="stroke:${c}" class="wlead"/><circle cx="${p.ox}" cy="${p.oy}" r="2.5" style="fill:${c}"/>` : ""}<g class="wico${act && !isA ? " dim" : ""}${isA ? " sel" : ""}" data-wsit="${p.x.s.id}" transform="translate(${p.px.toFixed(1)},${p.py.toFixed(1)})"><title>${esc(p.x.say)}</title><circle class="bg" r="${r}" style="fill:${c}"/><g transform="translate(${(-r * 0.62).toFixed(1)},${(-r * 0.62).toFixed(1)})" class="wicog">${wIcon(p.x.k, (r * 1.24).toFixed(1))}</g></g>`;
    });
  }
  return s + "</svg>";
}
function worldMap(list) {
  if (!GEO) { loadGeo(); return `<div class="wmapload">Loading the map…</div>`; }
  if (GEO.err) return `<div class="wmapload">The map could not load (no internet?). <button class="btn ghost" data-wview="list">Back to the list</button></div>`;
  const items = wItems(list.slice(0, Math.max(state.wlimit, 30))), z = state.wzoom;
  const regs = Object.keys(WBOX).filter((r) => items.some((x) => x.reg === r));
  if (z !== "World" && !regs.includes(z)) state.wzoom = "World";
  const inView = state.wzoom === "World" ? items : items.filter((x) => x.reg === state.wzoom);
  // selected story: the one you picked, else the top story that has a situation (strikes first), else the top story
  let sel = inView.find((x) => x.s.id === state.wsel);
  if (!sel) sel = inView.find((x) => x.k === "strike") || inView.find((x) => x.k !== "news") || inView[0] || null;
  const noPlace = Math.min(list.length, Math.max(state.wlimit, 30)) - items.length;
  const chips = ["World", ...regs].map((r) => `<button class="${state.wzoom === r ? "on" : ""}" data-wzoom="${esc(r)}">${esc(r)}<small>${r === "World" ? items.length : items.filter((x) => x.reg === r).length}</small></button>`).join("");
  const rows = WFAM_ORDER.map((f) => { const xs = inView.filter((x) => WK[x.k][0] === f); if (!xs.length) return "";
    return `<h5 style="color:var(${WFAM[f][1]})"><i style="background:var(${WFAM[f][1]})"></i>${WFAM[f][0]} · ${xs.length}</h5>${xs.map((x) => `<div class="wsit${sel === x ? " sel" : ""}${x.own === -1 ? " wdim" : wSt(x.s.id) === "done" ? " wread" : ""}" data-wsit="${x.s.id}">
      <span class="ic" style="background:${wFamCol(x.k)}">${wIcon(x.k, 17)}</span><div><b>${esc(x.say)}</b><small>${agoAt(when(x.s))} · ${esc(x.s.n_sources)} outlets · ${esc(x.reg || "")}${sel === x ? ` · <span class="wopen">tap again to open</span>` : ""}</small></div></div>`).join("")}`; }).join("");
  const tag = sel ? (() => { const s = sel.s, alert = sel.k === "strike" && hoursAgo(when(s)) <= 12;
    return `<div class="wtag" data-wgo="${s.id}">${alert ? `<div class="k alert"><i></i>ALERT · STRIKE · ${esc(ago(when(s)).toUpperCase())}</div>` : `<div class="k" style="color:${wFamCol(sel.k)}">${esc(WK[sel.k][2].toUpperCase())} · ${esc(ago(when(s)).toUpperCase())}</div>`}
      <b>${esc(sel.say)}</b><small>${esc(s.n_sources)} outlets · Open story →</small></div>`; })() : "";
  return `<div class="wzoom a">${chips}</div>
    <div class="wmap2 a"><div><div class="wmapbox">${state.wzoom !== "World" ? `<button class="wback" data-wzoom="World">‹ World</button>` : ""}<div class="wmapsvg">${wMapSvg(items, sel)}</div></div>${tag}
      ${state.wzoom === "World" ? `<p class="note">Tap a bubble to zoom in. The ring shows the mix: mostly red = mostly conflict.</p>` : ""}
      ${noPlace ? `<p class="note">${noPlace} worldwide ${noPlace > 1 ? "stories have" : "story has"} no single place on the map (see the list view).</p>` : ""}</div>
    <div class="wsits">${rows || `<p class="note">Nothing here today.</p>`}</div></div>
    <div class="wfams">${WFAM_ORDER.map((f) => `<span><i style="background:var(${WFAM[f][1]})"></i>${WFAM[f][0]}</span>`).join("")}</div>`;
}
// Hovering a sentence (or an icon) draws its line, without redrawing the rest of the page
app.addEventListener("mouseover", (e) => {
  if (state.wview !== "map" || !(location.hash || "").startsWith("#/world") || !GEO || GEO.err) return;
  const t = e.target.closest?.("[data-wsit]"), id = t ? t.dataset.wsit : null;
  if (id === state.whover) return;
  state.whover = id;
  const box = app.querySelector(".wmapsvg");
  if (!box) return;
  const list = state.wreg === "All" ? wRanked() : wRanked().filter(({ s }) => s.region === state.wreg);
  const items = wItems(list.slice(0, Math.max(state.wlimit, 30)));
  const inView = state.wzoom === "World" ? items : items.filter((x) => x.reg === state.wzoom);
  const sel = inView.find((x) => x.s.id === state.wsel) || inView.find((x) => x.k === "strike") || inView.find((x) => x.k !== "news") || inView[0] || null;
  box.innerHTML = wMapSvg(items, sel);
});

const placeBtn = (type, name) => { const key = `${type}:${name}`, on = isFollowing("place", key);
  return `<button class="pl ${on ? "on" : ""}" data-follow="place" data-fkey="${esc(key)}" data-flabel="${esc(name)}">${ICO.bell}${on ? "Following" : "Follow"} ${esc(name)}${type === "region" ? " <em>(region)</em>" : ""}</button>`; };
function viewWorldStory(id) {
  const head = header("world"), found = (state.world || []).find((s) => s.id === id);
  const hit = found && { s: found, own: state.wvotes.get(id)?.vote };
  if (!hit) return `${head}<div class="wrap"><a class="back" href="#/world">← Back to World Brief</a><div class="empty"><h2>${state.world === null ? "Loading…" : "Story not found"}</h2></div></div>`;
  const { s, own } = hit, c = wCov(s);
  return `${head}<div class="wrap">
    <a class="back a" href="#/world">← Back to World Brief</a>
    <div class="detail"><div>
      <div class="wtags a">${wTags(s)}<span class="wtime">${agoAt(when(s))}</span></div>
      <h1 class="a">${esc(s.headline)}</h1>
      <div class="a wsacts">${(() => { const next = wWaiting().filter((x) => x.id !== s.id).length;
        return wSt(s.id) === "done" ? `<button class="sbtn on-done" data-wdone="${s.id}">✓ Read</button>${next ? `<button class="sbtn" data-wnext="${s.id}">Next top story →</button>` : ""}`
          : `<button class="sbtn" data-wnext="${s.id}">${next ? "✓ Read · next story →" : "✓ Mark as read"}</button>`; })()}
        ${wVote(s, own, false)}${followBtn("world", s.id, s.headline)}<span class="note hide-sm" style="margin:0">Want / No want tunes what World Brief puts first.</span></div>
      <div class="a wplaces">${s.country && s.country !== "Global" ? placeBtn("country", s.country) : ""}${s.region && s.region !== "Global" ? placeBtn("region", s.region) : ""}</div>
      ${/^https:\/\//.test(s.image_url || "") ? `<figure class="hero-fig"><img class="hero-img" src="${esc(bigImg(s.image_url))}" alt="" referrerpolicy="no-referrer" onerror="this.parentNode.remove()">${s.image_credit ? `<figcaption>${esc(s.image_credit)}</figcaption>` : ""}</figure>` : ""}
      ${wThai(s)}
      ${(() => { const mark = termMarker(s); return `${fold("What happened", `<ul>${(s.summary || []).map((b) => `<li>${mark(b)}</li>`).join("")}</ul>`, true)}
      ${s.why_matters ? fold("Why it matters", `<p>${mark(s.why_matters)}</p>`, true) : ""}`; })()}
      <p class="note">Written by AI (Gemini) from the headlines of ${esc(s.n_sources)} outlets. Check the original articles for details.</p>
    </div>
    <aside class="side">
      ${devBox(s, 3)}
      <div class="box a">${wBar(s, true)}<ul class="wcovl">${c.map(([r, n]) => `<li><span class="dot r-${WREG[r]}"></span>${esc(r)}<b>${n}</b></li>`).join("")}</ul>${wLean(s) ? `<p class="note">${wLean(s)} Other regions may see this story differently.</p>` : ""}</div>
      ${fold(`Sources (${(s.links || []).length})`, `<ul class="srcs">${(s.links || []).map((l) =>
        `<li><b>${esc(l.outlet)}</b><a href="${safeUrl(l.link)}" target="_blank" rel="noopener noreferrer">${esc(l.title)} ↗</a></li>`).join("")}</ul>`)}
    </aside></div></div>`;
}
async function setWorldVote(id, v) {
  const s = (state.world || []).find((x) => x.id === id);
  if (!s) return;
  const prev = state.wvotes.get(id);
  if (prev?.vote === v) state.wvotes.delete(id);  // pressing the same button again = take the vote back
  else state.wvotes.set(id, { story_id: id, vote: v, region: s.region, category: s.category, created_at: new Date().toISOString() });
  render(false);
  const now = state.wvotes.get(id);
  const r = now ? await sb.from("world_votes").upsert({ user_id: state.user.id, story_id: id, vote: v, region: s.region, category: s.category }, { onConflict: "user_id,story_id" })
    : await sb.from("world_votes").delete().eq("story_id", id);
  if (r.error) { if (prev) state.wvotes.set(id, prev); else state.wvotes.delete(id); render(false); toast(`Vote not saved: ${esc(r.error.message)}`); }
  else if (v === -1 && now) toast("Moved down. Similar stories will rank lower.");
}

function viewSearch() {
  const q = state.searchQ || "", r = state.searchResults;
  const row = (s) => `<div class="sr${stateCls(s)}" data-go="${s.id}">${/^https:\/\//.test(s.image_url || "") ? `<img src="${esc(s.image_url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : `<span class="qi ${impClass(s.impact_score)}">${s.impact_score}</span>`}
    <div><div class="meta">${metaTags(s)}${esc((s.topics || [])[0] || "")} · ${new Date(when(s)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · impact ${s.impact_score}</div>
    <h3>${esc(s.headline)}</h3>${state.notes.has(s.id) ? `<p class="note"><b>Note:</b> ${esc(state.notes.get(s.id))}</p>` : ""}</div></div>`;
  const wRows = () => { const w = state.searchWorld || []; return w.length ? `<h2 class="sec srhead">World Brief · ${w.length}</h2>${w.map((s) => `<div class="sr" data-go-world="${s.id}">${wPic(s)}
    <div><div class="meta"><span class="kindw">WORLD</span> ${esc(s.region || "")} · ${esc(s.category || "")} · ${new Date(when(s)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · ${esc(s.n_sources)} outlets</div>
    <h3>${esc(s.headline)}</h3></div></div>`).join("")}` : ""; };
  return `${header("news")}<div class="wrap"><div class="panel" style="max-width:900px">
    <a class="back a" href="#/">← Back to My News</a>
    <h1 class="a" style="margin-top:16px">Search: “${esc(q)}”</h1>
    <p class="why a">All saved stories (not just the last 3 days) and your notes.</p>
    <div class="results-list a">${r === null ? `<p class="why">Searching…</p>` : r.error ? `<p class="msg err">${esc(r.error)}</p>`
      : r.length || (state.searchWorld || []).length ? `${r.length ? `<h2 class="sec srhead">My News · ${r.length}</h2>${r.map(row).join("")}` : ""}${wRows()}`
      : `<p class="why">No stories found. Try a company name, ticker, topic or country.</p>`}</div></div></div>`;
}

// Unsaved edits on the Topics & watchlist page live here until you press Save.
const makeDraft = () => ({
  topics: [...(state.settings.topics || [])],
  watchlist: [...(state.settings.watchlist || [])],
  custom_topics: [...(state.settings.custom_topics || [])],
  watch_names: { ...(state.settings.watch_names || {}) },
});
const known = (t) => CFG.tickers.includes(t);

// Settings page (gear icon): display preferences saved on this device
function viewPrefs() {
  const p = motionPref(), dev = deviceCalm();
  const tp = themePref();
  const topt = (k, title, sub) => `<button class="mopt ${tp === k ? "on" : ""}" data-theme-pick="${k}" aria-pressed="${tp === k}">
      <span class="radio"></span><span><b>${title}</b><small>${sub}</small></span></button>`;
  const opt = (k, title, sub) => `<button class="mopt ${p === k ? "on" : ""}" data-motion="${k}" aria-pressed="${p === k}">
      <span class="radio"></span><span><b>${title}</b><small>${sub}</small></span></button>`;
  return `${header("prefs")}<div class="wrap"><div class="panel">
    <a class="back a" href="#/">← Back to My News</a>
    <h1 class="a" style="margin-top:16px">Settings</h1>
    <p class="why a">Saved on this device only.</p>
    <h2 class="sec a" style="margin-top:32px">Theme</h2>
    <div class="mopts a">
      ${topt("auto", "Automatic", `Follow this device. Right now your device is in <b>${deviceDark() ? "dark" : "light"} mode</b>.`)}
      ${topt("light", "Light", "White pages, like a newspaper.")}
      ${topt("dark", "Dark", "Dark pages: easier on the eyes at night.")}
    </div>
    <h3 class="a" style="margin-top:20px;font:800 15px 'Inter Tight'">Light style</h3>
    <div class="dpick a">${[["crisp", "Crisp white", "Clean white, like a newspaper", ["#ffffff", "#f3f3f3", "#111111"]], ["newsprint", "Newsprint", "Warm cream paper, serif headlines", ["#f6f1e7", "#fffaf0", "#231d15"]], ["cloud", "Cloud", "Grey page, floating white cards", ["#eef1f5", "#ffffff", "#0f172a"]], ["sage", "Sage", "Soft green-grey, low glare", ["#eef2ec", "#f8faf6", "#17211a"]]]
      .map(([k, n, sub, c]) => `<button class="dsw ${lightStyle() === k ? "on" : ""}" data-light-pick="${k}"><span class="sw" style="background:${c[0]};border:1px solid #0000001a"><i style="background:${c[1]}"></i><i style="background:${c[2]}"></i><i style="background:#ff4500"></i></span><b>${n}</b><small>${sub}</small></button>`).join("")}</div>
    <h3 class="a" style="margin-top:20px;font:800 15px 'Inter Tight'">Dark style</h3>
    <div class="dpick a">${[["graphite", "Graphite", "Soft charcoal greys", ["#0f0f10", "#18181b", "#222226"]], ["black", "True black", "Pure black, high contrast", ["#000", "#0b0b0c", "#151517"]], ["navy", "Midnight", "Deep blue, trading-terminal feel", ["#0a0f1c", "#101829", "#16203a"]]]
      .map(([k, n, sub, c]) => `<button class="dsw ${darkStyle() === k ? "on" : ""}" data-dark-pick="${k}"><span class="sw" style="background:${c[0]}"><i style="background:${c[1]}"></i><i style="background:${c[2]}"></i><i style="background:#ff4500"></i></span><b>${n}</b><small>${sub}</small></button>`).join("")}</div>
    <h2 class="sec a" style="margin-top:32px">Season</h2>
    <p class="why a">Seasonal colours, falling snow / petals / leaves at the sides, a seasonal opening intro, a picture in the brief bar and a "… in the markets" note. Works with Light and Dark.</p>
    <div class="spick a">${[["off", "Off", "Your normal theme", ["#ffffff", "#111111", "#ff4500"]], ["auto", "Automatic", `Follows the calendar (now: ${calSeason()})`, null],
      ["winter", "Winter", "Icy blue, snowfall", ["#eef4fa", "#2b7de9", "#0f2233"]], ["spring", "Spring", "Blossom pink, petals", ["#fcf6f5", "#dd4f7a", "#9fd48d"]],
      ["summer", "Summer", "Sunny sand, sea teal", ["#fff9ee", "#ff6a00", "#14b8a6"]], ["autumn", "Autumn", "Rust, falling leaves", ["#f7efe3", "#c2541b", "#d9a13a"]]]
      .map(([k, n, sub, c]) => { const on = seasonPref() === k;
        const sw = c ? `<span class="sw" style="background:${c[0]};border:1px solid #0000001a"><i style="background:${c[1]}"></i><i style="background:${c[2]}"></i></span>`
          : `<span class="sw auto"><i style="background:#2b7de9"></i><i style="background:#dd4f7a"></i><i style="background:#ff6a00"></i><i style="background:#c2541b"></i></span>`;
        return `<button class="dsw ${on ? "on" : ""}" data-season-pick="${k}" aria-pressed="${on}">${sw}<b>${n}</b><small>${sub}</small></button>`; }).join("")}</div>
    <h2 class="sec a" style="margin-top:32px">Market hours</h2>
    <p class="why a">Pick up to ${MAX_MKTS} markets to show as open / closed next to Markets on My News. ${"markets" in (state.settings || {}) ? "Saved to your account, so phone and computer match." : "Saved on this device."}</p>
    <div class="mktpick a">${MARKETS_ALL.map(([n, city, tz, s]) => { const on = myMarkets().some((m) => m[0] === n), o = mktOpen(tz, s);
      return `<button class="mkp ${on ? "on" : ""}" data-mkt-pick="${n}" aria-pressed="${on}"><span class="ck">${on ? CHK : ""}</span><span><b>${n}</b><small>${city}</small></span><span class="mkt ${o ? "open" : ""}"><i></i>${o ? "open" : "closed"}</span></button>`; }).join("")}</div>
    <h2 class="sec a" style="margin-top:32px">Big news alert</h2>
    <p class="why a">When a story with impact 8 or higher about your topics or watchlist arrives, it covers the screen once, the next time you open the site. Pick who presents it.</p>
    <div class="mopts a">
      <button class="mopt ${bigOn() ? "on" : ""}" data-bigalert="on" aria-pressed="${bigOn()}"><span class="radio"></span><span><b>On</b><small>Show big news full screen once, then it stays in your feed as usual.</small></span></button>
      <button class="mopt ${bigOn() ? "" : "on"}" data-bigalert="off" aria-pressed="${!bigOn()}"><span class="radio"></span><span><b>Off</b><small>Big news only appears in the feed (Telegram alerts are not affected).</small></span></button>
    </div>
    ${[["Theme characters", [["theme", "Follows my theme", `now: ${(CHARS.find((x) => x[0] === themeChar()) || CHARS[0])[1]}`], ...CHARS.map(([k, n, th]) => [`c:${k}`, n, `${th} theme`])]],
      ["Or none", [["none", "No mascot", "just the news band"]]]].map(([h, list]) => `
    <h3 class="a" style="margin-top:20px;font:800 15px 'Inter Tight'">${h}</h3>
    <div class="mscpick a">${list.map(([id, n, sub]) => `<button class="msc ${(id === "theme" ? charOf() && !mascotPref().startsWith("c:") : mascotPref() === id) ? "on" : ""}" data-mascot="${id}">
      ${id === "none" ? `<span class="msc-none">BIG NEWS</span>` : id === "theme" ? charImg(themeChar(), "hello", "pick") : charImg(id.slice(2), "hello", "pick")}<b>${n}</b><small>${sub}</small></button>`).join("")}</div>`).join("")}
    <div class="a" style="margin-top:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn ghost" data-act="big-preview" ${state.stories?.length ? "" : "disabled"}>▶ Preview with today's top story</button>
      <span class="note" style="margin:0">The face follows the news: happy for bullish, worried for bearish, alert for breaking, never smiling for war or disasters.</span>
    </div>
    <h2 class="sec a" style="margin-top:32px">Motion</h2>
    <div class="mopts a">
      ${opt("auto", "Automatic", `Follow this device's setting. Right now your device asks for <b>${dev ? "less motion" : "normal motion"}</b>, so motion is <b>${dev ? "reduced" : "on"}</b>.`)}
      ${opt("full", "Full motion", "Opening intro, rolling prices, charts drawing in, page transitions and all other effects.")}
      ${opt("reduced", "Reduced motion", "No intro and no moving effects. Everything appears straight away. Easier on the eyes and on older computers.")}
    </div>
    <div class="a" style="margin-top:20px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn ghost" data-act="play-intro" ${calm() ? "disabled" : ""}>▶ Play the opening intro</button>
      <span class="note" id="motion-msg" style="margin:0">${calm() ? "The intro is off while motion is reduced." : "Plays the next of the 4 intros."}</span>
    </div>
    <div class="mob-only" style="margin-top:32px"><h2 class="sec">Account</h2><button class="btn" data-act="logout" style="margin-top:10px">Sign out</button></div>
  </div></div>`;
}

