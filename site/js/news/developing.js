// Developing stories (My News + World Brief).
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// ---------- Developing (My News + World Brief, design round 21) ----------
// The robot saves growth = [{t, n outlets}] and timeline = [{t, text}] each time a story gains outlets.
// "Developing" = it gained outlets in the last 24 hours: 2+ for My News (fewer outlets per story), 3+ for World Brief.
function devInfo(s, min = 2) {
  const g = Array.isArray(s.growth) ? s.growth.filter((p) => p && p.t) : [];
  if (g.length < 2) return null;
  const last = g[g.length - 1], dayAgo = g.filter((p) => hoursAgo(p.t) > 24).pop() || g[0];
  if (hoursAgo(last.t) > 24 || last.n - dayAgo.n < min) return null;
  return { day: Math.floor(hoursAgo(s.created_at || g[0].t) / 24) + 1, from: g[0].n, to: last.n, g, tl: Array.isArray(s.timeline) ? s.timeline : [] };
}
const devTag = (d) => (d ? `<span class="devtag" title="More outlets keep covering this story"><i></i>Developing · day ${d.day}</span>` : "");
function devSpark(g, w = 150, h = 40) {
  const t0 = new Date(g[0].t), t1 = new Date(g[g.length - 1].t), span = Math.max(1, t1 - t0), mx = Math.max(...g.map((p) => p.n)), mn = Math.min(...g.map((p) => p.n));
  const pts = g.map((p) => [((new Date(p.t) - t0) / span) * (w - 4) + 2, h - 3 - ((p.n - mn) / Math.max(1, mx - mn)) * (h - 6)]);
  return `<svg class="devspark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts.map((p) => p.join(",")).join(" ")}"/><circle cx="${pts[pts.length - 1][0]}" cy="${pts[pts.length - 1][1]}" r="3"/></svg>`;
}
function devBox(s, min) {
  const d = devInfo(s, min);
  if (!d) return "";
  const tm = (t) => new Date(t).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  return fold(`Developing · day ${d.day}`, `<div class="devgrow">${devSpark(d.g)}<div class="devnum">${d.from} → ${d.to}<small>outlets since ${tm(d.g[0].t)}</small></div></div>
    ${d.tl.length > 1 ? `<ul class="devtl">${d.tl.slice(-4).map((x) => `<li><b>${tm(x.t)}</b><span>${esc(x.text)}</span></li>`).join("")}</ul>` : ""}`, true, "devbox");
}
const metaTags = (s) => `${Number(s.impact_score) >= 8 && charOf() && mascotPref() !== "none" ? `<span class="mhead" title="Big news" style="background-image:url(mascot/${charOf()}/alert-${bigMood(s)}.png)"></span>` : ""}${devInfo(s) ? `${devTag(devInfo(s))} · ` : ""}${isNew(s) ? '<span class="newdot"></span><span class="newtag">NEW</span> · ' : ""}${isUpdated(s) ? '<span class="updtag">UPDATED</span> · ' : ""}${stOf(s) === "later" ? '<span class="latertag">LATER</span> · ' : ""}${state.notes.has(s.id) ? '<span class="notetag">NOTE</span> · ' : ""}`;

// Price reaction: how the stock moved since the robot saved this story
function sinceMove(s, t) {
  const at = Number(s.prices_at?.[t]), q = quotes[yahoo(t)];
  if (!at || !q) return null;
  return ((q.price - at) / at) * 100;
}
const sinceTxt = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

// Season picture for the dark brief bar (item 1): faint, on the right, behind the text
const SEASON_ART = {
  winter: `<path d="M0 100 Q60 62 130 78 T260 70 T360 74 V100Z" fill="#fff" opacity=".10"/><path d="M120 100 Q200 70 280 84 T360 82 V100Z" fill="#fff" opacity=".14"/>
    <g fill="#cfe3ff" opacity=".35"><path d="M300 86 l10 -34 l10 34z"/><path d="M322 88 l8 -26 l8 26z"/><path d="M276 90 l7 -22 l7 22z"/></g>
    <g stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".45"><path d="M210 18v14M204 21l12 8M204 29l12-8"/><path d="M330 22v10M325.5 24.5l9 5M325.5 29.5l9-5"/><path d="M250 40v8M246.5 42l7 4M246.5 46l7-4"/></g>`,
  spring: `<path d="M360 6 Q300 18 262 44 Q236 62 214 92" stroke="#7a4a3a" stroke-width="4" fill="none" stroke-linecap="round" opacity=".55"/>
    <path d="M300 22 Q286 40 290 62" stroke="#7a4a3a" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".5"/>
    ${[[262, 44], [292, 60], [236, 70], [318, 20], [276, 30], [222, 86], [340, 12]].map(([x, y]) => `<g transform="translate(${x} ${y})" opacity=".75">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-5" rx="3.6" ry="5" fill="#f7a8c0" transform="rotate(${a})"/>`).join("")}<circle r="2" fill="#ffd166"/></g>`).join("")}`,
  summer: `<circle cx="300" cy="64" r="34" fill="#ffb347" opacity=".35"/><circle cx="300" cy="64" r="22" fill="#ffd166" opacity=".45"/>
    <path d="M150 78 q15 -8 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0" stroke="#5eead4" stroke-width="2.4" fill="none" opacity=".5"/>
    <path d="M170 90 q15 -8 30 0 t30 0 t30 0 t30 0 t30 0 t30 0" stroke="#5eead4" stroke-width="2" fill="none" opacity=".35"/>`,
  autumn: `<path d="M360 4 Q310 22 272 50 Q248 68 230 96" stroke="#6b3d1e" stroke-width="4" fill="none" stroke-linecap="round" opacity=".55"/>
    ${[[272, 50, "#e0702e", 20], [300, 30, "#c2541b", -30], [248, 70, "#d9a13a", 40], [326, 18, "#e08a2e", -10], [212, 40, "#c2541b", 70], [180, 74, "#d9a13a", 110]].map(([x, y, c, r]) =>
      `<path transform="translate(${x} ${y}) rotate(${r})" d="M0 -12 L3 -5 L10 -7 L6 0 L11 4 L3 4 L2 11 L0 6 L-2 11 L-3 4 L-11 4 L-6 0 L-10 -7 L-3 -5Z" fill="${c}" opacity=".7"/>`).join("")}`,
};
// Season intro scenes (winter / spring / autumn; summer is the sunrise over the sea). Layers rise in one after another.
// summer intro: 3 fish leap out of the sea in an arc (they start and end behind the water), with a splash where they go in and out
const FISH = [[12, 320, .45, "#ff7a1a", 1], [60, 260, .85, "#ffc53d", .85], [34, 200, 1.25, "#ff9a4d", .7]];   // x %, jump width px, delay s, colour, size
const fishSvg = (c) => `<svg viewBox="0 0 64 34" aria-hidden="true"><path d="M58 17 Q42 2 20 10 L6 2 L8 17 L6 32 L20 24 Q42 32 58 17Z" fill="${c}"/><circle cx="48" cy="14" r="2.6" fill="#1b1b1b"/><path d="M36 9 Q32 17 36 25" stroke="#fff3" stroke-width="2" fill="none"/></svg>`;
const summerFish = () => FISH.map(([x, dx, w, c, k]) => `<div class="sfish" style="left:${x}%;--dx:${dx}px;--w:${w}s;--k:${k}"><i>${fishSvg(c)}</i></div>`).join("");
const summerSplash = () => FISH.map(([x, dx, w, , k]) => `<span class="ssplash" style="left:calc(${x}% + ${50 * k}px);--w:${w}s;--k:${k}"></span><span class="ssplash" style="left:calc(${x}% + ${dx + 50 * k}px);--w:${w + 1.15}s;--k:${k}"></span>`).join("");
function seasonScene(s) {
  const lay = (d, body) => `<g class="slay" style="--dl:${d}s">${body}</g>`;
  const pop = (x, y, d, body) => `<g class="spop" style="--dl:${d}s" transform="translate(${x} ${y})"><g>${body}</g></g>`;
  const flower = `${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-9" rx="6.5" ry="9" fill="#f7a8c0" transform="rotate(${a})"/>`).join("")}<circle r="4" fill="#ffd166"/>`;
  const leafG = (c) => `<path d="M0 -20 L5 -8 L17 -11 L10 0 L18 7 L5 7 L3 18 L0 10 L-3 18 L-5 7 L-18 7 L-10 0 L-17 -11 L-5 -8Z" fill="${c}"/>`;
  const pine = (x, h, c) => `<path d="M${x} ${900 - h} L${x + h * .28} 900 L${x - h * .28} 900Z" fill="${c}"/>`;
  const svg = (body) => `<svg class="sscene" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${body}</svg>`;
  if (s === "winter") return svg(`
    <defs><linearGradient id="sau" x1="0" x2="1"><stop offset="0" stop-color="#5eead4" stop-opacity="0"/><stop offset=".3" stop-color="#5eead4" stop-opacity=".55"/><stop offset=".7" stop-color="#a78bfa" stop-opacity=".45"/><stop offset="1" stop-color="#a78bfa" stop-opacity="0"/></linearGradient>
      <radialGradient id="smoon"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#e6efff"/><stop offset="1" stop-color="#e6efff" stop-opacity="0"/></radialGradient></defs>
    <path class="saur" d="M-100 260 C200 140 420 330 760 220 S1300 120 1700 240 L1700 320 C1300 210 1050 380 760 300 S200 230 -100 340Z" fill="url(#sau)"/>
    <g class="smoon"><circle cx="1260" cy="210" r="120" fill="url(#smoon)" opacity=".35"/><circle cx="1260" cy="210" r="54" fill="#f4f7ff"/><circle cx="1240" cy="196" r="9" fill="#dfe7f6"/><circle cx="1278" cy="228" r="6" fill="#dfe7f6"/></g>
    ${lay(0, `<path d="M0 640 L220 420 L360 540 L560 330 L760 560 L940 380 L1160 600 L1360 400 L1600 620 V900 H0Z" fill="#2c4a70"/>
      <path d="M220 420 L262 462 L240 470 L222 452 L196 472 L180 462Z M560 330 L612 386 L586 392 L562 372 L534 396 L512 384Z M940 380 L984 430 L958 434 L940 418 L916 436 L900 424Z M1360 400 L1408 452 L1380 456 L1362 440 L1338 458 L1320 446Z" fill="#eef4ff"/>`)}
    ${lay(.15, `<path d="M0 760 Q200 640 420 700 T860 690 T1300 700 T1600 680 V900 H0Z" fill="#1b3354"/>`)}
    ${lay(.3, `${[[90, 220], [180, 300], [270, 190], [1290, 260], [1380, 330], [1480, 230], [1560, 280]].map(([x, h]) => pine(x, h, "#0f2238")).join("")}
      <path d="M0 840 Q400 790 800 820 T1600 810 V900 H0Z" fill="#e8f0fb"/>`)}`);
  if (s === "spring") return svg(`
    <circle class="smoon" cx="1180" cy="260" r="90" fill="#fff4d6" opacity=".9"/>
    ${lay(0, `<path d="M0 700 Q300 560 640 640 T1300 600 T1600 640 V900 H0Z" fill="#c9e7b5"/>`)}
    ${lay(.15, `<path d="M0 790 Q360 680 760 760 T1600 730 V900 H0Z" fill="#9fd48d"/>`)}
    ${lay(.3, `<path d="M0 860 Q500 800 1000 850 T1600 840 V900 H0Z" fill="#7cc06c"/>
      ${[[200, 846], [420, 838], [980, 852], [1240, 846], [1460, 842]].map(([x, y]) => `<g transform="translate(${x} ${y}) scale(.7)">${flower}</g>`).join("")}`)}
    <path class="sdraw" d="M-20 60 Q260 90 420 200 Q520 270 560 380 M300 140 Q330 230 300 300 M420 200 Q520 170 600 190" stroke="#6b4434" stroke-width="16" fill="none" stroke-linecap="round"/>
    ${[[200, 92, .55], [300, 300, .7], [420, 200, .65], [560, 380, .9], [600, 190, .8], [500, 290, .85], [350, 160, .6], [140, 70, .5]].map(([x, y, d]) => pop(x, y, d, `<g transform="scale(1.9)">${flower}</g>`)).join("")}`);
  return svg(`
    <defs><radialGradient id="ssun2"><stop offset="0" stop-color="#ffe2a8"/><stop offset=".5" stop-color="#ffb35c"/><stop offset="1" stop-color="#ff8a3d" stop-opacity="0"/></radialGradient></defs>
    <g class="smoon"><circle cx="520" cy="560" r="260" fill="url(#ssun2)" opacity=".7"/><circle cx="520" cy="560" r="80" fill="#ffd28a"/></g>
    ${lay(0, `<path d="M0 640 Q260 520 560 600 T1160 560 T1600 600 V900 H0Z" fill="#8a4122"/>`)}
    ${lay(.15, `<path d="M0 740 Q320 640 700 710 T1600 690 V900 H0Z" fill="#5e2c16"/>`)}
    ${lay(.3, `<path d="M0 830 Q500 770 1000 820 T1600 800 V900 H0Z" fill="#3a1a0c"/>
      <path d="M1290 900 Q1300 700 1280 560 M1284 640 Q1200 560 1120 540 M1282 600 Q1380 520 1460 510 M1286 700 Q1380 660 1430 610" stroke="#2a1208" stroke-width="22" fill="none" stroke-linecap="round"/>`)}
    ${[[1120, 540, .7, "#e0702e"], [1170, 500, .8, "#d9a13a"], [1460, 510, .75, "#c2541b"], [1400, 470, .85, "#e08a2e"], [1430, 610, .9, "#d9a13a"], [1240, 470, .95, "#c2541b"], [1330, 450, 1, "#e0702e"], [1360, 560, 1.05, "#9c3d12"], [1200, 590, .78, "#c2541b"], [1290, 520, .88, "#d9a13a"], [1500, 560, .82, "#e0702e"], [1380, 410, .92, "#d9a13a"], [1150, 450, .98, "#9c3d12"], [1460, 440, 1.02, "#c2541b"], [1270, 410, 1.08, "#e08a2e"], [1330, 620, 1.1, "#e0702e"]].map(([x, y, d, c]) => pop(x, y, d, `<g transform="scale(1.6)">${leafG(c)}</g>`)).join("")}`);
}
const seasonArt = () => (season ?`<svg class="sart" viewBox="0 0 360 100" preserveAspectRatio="xMidYMax meet" aria-hidden="true">${SEASON_ART[season]}</svg>` : "");

// Market season note (item 2): fixed text, no AI. Months = when each line matters; the current month is marked "now".
const SEASON_NOTES = {
  winter: ["Winter in the markets", [[[12], "Last month to buy ThaiESG / RMF funds for this year's tax deduction"],
    [[12], "\"Santa rally\": stocks often drift up in the last week of the year (on average, not a rule)"],
    [[1, 2], "Q4 earnings: US big tech reports late January, Thai companies by end of February"],
    [[2], "Full-year results bring the first SET dividend announcements"]]],
  spring: ["Spring in the markets", [[[3, 4, 5], "Dividend season: many SET stocks go XD. Buy before the XD date to get the dividend"],
    [[4], "Thai AGM season: shareholders vote on dividends"],
    [[4, 5], "Q1 earnings: US from mid-April, Thai companies by mid-May"],
    [[5], "\"Sell in May\" is an old saying, not a rule"]]],
  summer: ["Summer in the markets", [[[6], "Fed meeting mid-June, with new rate projections"],
    [[7, 8], "Q2 earnings: US from mid-July, Thai companies by mid-August"],
    [[8], "Interim dividends: some SET stocks go XD in August-September"],
    [[8], "Jackson Hole: the Fed chair's late-August speech can move markets"]]],
  autumn: ["Autumn in the markets", [[[9], "September has historically been a weak month for stocks (on average)"],
    [[10, 11], "Q3 earnings: US from mid-October, Thai companies by mid-November"],
    [[11], "US Thanksgiving: thin trading, and a half day on Friday"],
    [[11], "Plan ThaiESG / RMF buys now, before the December rush"]]],
};
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function seasonNote() {
  if (!season) return "";
  const [title, items] = SEASON_NOTES[season], m = new Date().getMonth() + 1;
  return `<div class="snote a"><h4>${title}</h4><ul>${items.map(([ms, txt]) =>
    `<li class="${ms.includes(m) ? "now" : ""}"><span>${ms.length > 1 ? `${MON[ms[0] - 1]}–${MON[ms.at(-1) - 1]}` : MON[ms[0] - 1]}${ms.includes(m) ? " · now" : ""}</span>${esc(txt)}</li>`).join("")}</ul>
    <p class="note">Typical yearly patterns, not advice. Exact dates are in the calendar below.</p></div>`;
}

function briefBar() {
  const waiting = waitingMust();
  const fresh = storiesFor("All").filter(isNew), hi = fresh.filter((s) => s.impact_score >= 7).length;
  const movers = (state.settings.watchlist || []).map((t) => [t, quotes[yahoo(t)]]).filter(([, q]) => q && q.prev)
    .sort((a, b) => Math.abs(pctOf(b[1])) - Math.abs(pctOf(a[1])));
  const mover = movers.length ? ` · ${esc(movers[0][0])} <span class="${dirOf(movers[0][1])}">${pctTxt(movers[0][1])}</span> today` : "";
  const thumb = (s) => (/^https:\/\//.test(s.image_url || "") ? `<img src="${esc(s.image_url)}" alt="" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : `<span class="${impClass(s.impact_score)}">${s.impact_score}</span>`);
  return `<div class="brief a" data-sig="${esc([waiting.length, fresh.length, hi, mover].join("|"))}">${calm() ? "" : BRIEF_BG}${seasonArt()}<div><h2>${waiting.length ? `${waiting.length} must-read${waiting.length > 1 ? "s" : ""} waiting` : "You're caught up ✓"}</h2>
      <p>Since you were away: ${fresh.length} new · ${hi} high-impact${mover}</p></div>
    <div class="thumbs">${waiting.length ? waiting.slice(0, 4).map(thumb).join("") : `<span class="bmas">${mascotArt("caught-up")}</span>`}</div>
    ${waiting.length ? `<button class="go" data-brief>▶ Start<span class="hide-sm"> briefing</span> · ~${waiting.length} min</button>` : ""}</div>`;
}

function queuePanel() {
  const list = storiesFor("To read").sort((a, b) => prio(b) - prio(a)), later = storiesFor("Later");
  const m = mustReads(), done = m.filter((s) => stOf(s) === "done").length;
  const th = (s) => (/^https:\/\//.test(s.image_url || "") ? `<img src="${esc(s.image_url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.outerHTML='<span class=&quot;qi ${impClass(s.impact_score)}&quot;>${s.impact_score}</span>'">` : `<span class="qi ${impClass(s.impact_score)}">${s.impact_score}</span>`);
  const row = (s, k, next) => `<div class="q${next ? " next" : ""}" data-q="${s.id}"><span class="k">${k}</span>${th(s)}
    <span class="qt">${next ? '<span class="nexttag">NEXT UP</span>' : ""}<b data-go="${s.id}">${esc(s.headline)}</b><small>${s.impact_score} impact · ${esc(label(s))}${stOf(s) === "seen" ? " · opened" : ""}</small></span>
    <button class="qchk" data-qdone="${s.id}" title="Done" aria-label="Done">${CHK}</button></div>`;
  return `<div class="queue a"><h2>Read first <small>${list.length} to read</small></h2>
    ${m.length ? `<div class="prog"><div class="bar"><i style="width:${(done / m.length) * 100}%"></i></div><small>Must-reads today: ${done} of ${m.length} done</small></div>` : ""}
    ${list.length ? list.slice(0, 6).map((s, i) => row(s, i + 1, i === 0)).join("") : `<div class="caught">✓ All caught up</div>`}
    ${later.length ? `<div class="qsec">LATER (${later.length})</div>${later.slice(0, 4).map((s) => row(s, ICO.clock, false)).join("")}` : ""}</div>`;
}

function trendPanel(list, start = 2) {
  if (!list.length) return "";
  return `<div class="trend a"><h2>Trending now</h2><ol>${list.map((s, i) => `
    <li class="${stateCls(s).trim()}" data-go="${s.id}"><span class="num">${i + start}</span><div><div class="meta">${metaTags(s)}${esc(label(s))} · ${agoAt(when(s))}</div>
    <h3>${esc(s.headline)}</h3><div class="vote">▲ ${srcs(s.n_sources)} · impact ${s.impact_score}</div></div></li>`).join("")}</ol></div>`;
}

