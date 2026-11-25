// Stock calendar (#/calendar) + Upcoming panel on My News.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// ---------- Calendar (design rounds 12-14: B2 heat-map days, K1 key dates, stock lanes) ----------
const LVL = { key: 3, mid: 2, low: 1 }, LVL_TXT = { key: "KEY", mid: "WORTH KNOWING", low: "MINOR" };
const isoDay = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
const dayOf = (s) => new Date(s + "T00:00:00");
const today0 = () => { const x = new Date(); x.setHours(0, 0, 0, 0); return x; };
const addDays = (x, n) => { const y = new Date(x); y.setDate(y.getDate() + n); return y; };
const monday = () => addDays(today0(), -((today0().getDay() + 6) % 7));
const daysTo = (s) => Math.round((dayOf(s) - today0()) / 864e5);
const cdTxt = (s) => { const n = daysTo(s); return n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`; };
const monTxt = (x) => x.toLocaleString("en-US", { month: "short" }), wkTxt = (x) => x.toLocaleString("en-US", { weekday: "short" });
// Institutions: short badge + website (for its icon; "" = text badge)
const MACRO = [[/\bfed\b|fomc|federal reserve/i, "FED", "federalreserve.gov"], [/opec/i, "OPEC", "opec.org"],
  [/\bbot\b|bank of thailand/i, "BOT", ""], [/\becb\b|european central bank/i, "ECB", "ecb.europa.eu"], [/\bboj\b|bank of japan/i, "BOJ", "boj.or.jp"]];
const CENTRAL = /rate decision|interest rate|policy rate|fomc|federal open market|monetary policy|central bank/i;
const MARKET = "Market & economy";

// Who an event is about (logo), how important it is, and which row it goes in
function evInfo(e) {
  if (e.kind === "result") {
    const mine = (state.settings.watchlist || []).includes(e.ticker), r = e.res;
    return { sym: e.ticker, site: "", lvl: mine ? "key" : "mid", why: "", kind: "Earnings result", lane: e.ticker,
      src: `EPS ${eps(r.eps_actual)} vs ${eps(r.eps_estimate)} expected${r.revenue ? ` · revenue ${r.revenue}` : ""} · Yahoo Finance` };
  }
  if (e.kind === "macro") {
    const key = e.impact === "High";
    return { sym: e.ccy, site: "", txt: true, lvl: key ? "key" : "mid", why: key ? "High impact on Forex Factory: these releases often move currencies and stocks" : "",
      kind: "Economy", src: "Forex Factory economic calendar", lane: MARKET };
  }
  const w = state.settings.watchlist || [], s = e.story_id ? findStory(e.story_id) : null;
  let sym = e.ticker || null, site = "";
  if (!sym) { const m = MACRO.find(([rx]) => rx.test(e.title)); if (m) { sym = m[1]; site = m[2]; } }
  if (!sym) sym = (s?.tickers || []).find((t) => w.includes(t)) || null;
  const mine = w.includes(e.ticker), central = e.kind === "news" && CENTRAL.test(e.title);
  let lvl, why = "";
  if (e.kind === "earnings") { lvl = mine && !e.estimate ? "key" : mine ? "mid" : "low"; if (lvl === "key") why = "A stock in your watchlist reports results"; }
  else if (e.kind === "dividend") lvl = mine ? "mid" : "low";
  else if (central) { lvl = "key"; why = "Interest-rate decisions move the whole market"; }
  else if (s?.impact_score >= 8) { lvl = "key"; why = `From a high-impact story (${s.impact_score}/10)`; }
  else lvl = !s || s.impact_score >= 6 ? "mid" : "low";
  const kind = e.kind === "earnings" ? "Earnings" : e.kind === "dividend" ? "Ex-dividend" : central ? "Central bank" : "News";
  const src = e.kind === "news" ? "from the news" : e.estimate ? "estimated date · Yahoo Finance" : "confirmed · Yahoo Finance";
  return { sym, site, lvl, why, kind, src, lane: e.kind !== "news" ? e.ticker : w.includes(sym) ? sym : MARKET };
}
// Forex Factory economic calendar (design round 32 A): High + Medium events join the calendar as kind "macro"
const hhmm = (x) => `${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`;
const econAsEvents = () => (state.econ || []).filter((e) => e.impact === "High" || e.impact === "Medium").map((e) => {
  const x = new Date(e.at);
  return { day: isoDay(x), at: e.at, time: hhmm(x), title: `${e.currency} ${e.title}`, kind: "macro", ccy: e.currency, impact: e.impact, forecast: e.forecast, previous: e.previous, raw: e };
});
const earnAsEvents = () => (state.earn || []).filter((r) => r.price_then !== null || hoursAgo(r.seen_at) < 8 * 24).map((r) => {
  const [v] = earnVerdict(r);
  return { day: isoDay(new Date(r.seen_at)), title: `${r.ticker} results${v ? `: ${v}` : ""}${r.surprise_pct !== null ? ` ${r.surprise_pct >= 0 ? "+" : ""}${Number(r.surprise_pct).toFixed(1)}%` : ""}`, kind: "result", ticker: r.ticker, res: r };
});
// Big-company dates the robot adds for the Charts page ("Important dates") stay off the Stock calendar unless the stock is yours
const chartsOnly = (e) => e.ticker && (e.kind === "earnings" || e.kind === "dividend") && !(state.settings.watchlist || []).includes(e.ticker) && bigAll().includes(e.ticker);
const calEvents = () => { const t = isoDay(today0()), wk = isoDay(monday());
  return [...state.events.filter((e) => !chartsOnly(e)), ...earnAsEvents()].filter((e) => e.day >= (e.kind === "result" ? wk : t)).map((e) => ({ ...e, i: evInfo(e) })); };
// Economic calendar (Forex Factory) has its own box + page; this week's past days stay visible so released results show
const econEvents = () => { const wk = isoDay(monday()); return econAsEvents().filter((e) => e.day >= wk).map((e) => ({ ...e, i: evInfo(e) })); };
const fpTxt = (e, long) => [e.forecast && `${long ? "Forecast" : "F"} ${e.forecast}`, e.previous && `${long ? "Previous" : "P"} ${e.previous}`].filter(Boolean).join(" · ");
const topLvl = (list) => list.reduce((a, e) => (LVL[e.i.lvl] > LVL[a] ? e.i.lvl : a), "low");
const byLvl = (a, b) => LVL[b.i.lvl] - LVL[a.i.lvl];

// Company logo (free logo service, by ticker), an institution's site icon, or a text badge if neither loads
function evLogo(i, size) {
  const sym = i.sym || "", y = yahoo(sym), txt = esc(sym.slice(0, 4));
  if (!sym) return "";
  const src = i.txt ? "" : i.site ? `https://www.google.com/s2/favicons?domain=${i.site}&sz=64`
    : sym && !MACRO.some((m) => m[1] === sym) && /^[A-Za-z0-9.\-]{1,15}$/.test(y) ? `https://financialmodelingprep.com/image-stock/${y}.png` : "";
  return src ? `<span class="lg" style="--s:${size}px"><img src="${src}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('txt');this.parentNode.textContent='${txt}'"></span>`
    : `<span class="lg txt" style="--s:${size}px">${txt}</span>`;
}

// Countdown: hours for timed (Forex Factory) events less than a day away, otherwise days
function kdCount(e, d) {
  const h = e.at ? (new Date(e.at) - Date.now()) / 36e5 : null;
  if (h !== null && h >= 0 && h < 24) return h < 1 ? `<b>${Math.max(1, Math.round(h * 60))}</b><small>MIN</small>` : `<b>${Math.round(h)}</b><small>${Math.round(h) === 1 ? "HOUR" : "HOURS"}</small>`;
  if (h !== null && h < 0) return `<b class="sm">OUT</b>`;
  return d === 0 ? "<b class=\"sm\">TODAY</b>" : `<b>${d}</b><small>${d === 1 ? "DAY" : "DAYS"}</small>`;
}
// K1: the next key dates as countdown cards (the nearest one big and dark)
function keyDates(ev, n, any = false) {   // any = "NEXT DATES": the next dates of any level (when nothing is KEY)
  const all = ev.filter((e) => (any || e.i.lvl === "key") && e.kind !== "result" && !(e.at && new Date(e.at) < Date.now()))
    .sort((a, b) => (a.day + (a.time || "") < b.day + (b.time || "") ? -1 : 1)), ks = all.slice(0, n);
  if (!ks.length) return "";
  return `<div class="kd"><div class="kh"><span>${any ? "NEXT DATES" : "KEY DATES"}</span><small>${all.length} coming up</small></div>${ks.map((e, k) => {
    const x = dayOf(e.day), d = daysTo(e.day);
    return `<div class="kc ${k === 0 ? "first" : ""}" ${e.kind === "macro" ? "data-ecalday" : "data-calday"}="${e.day}">${evLogo(e.i, k === 0 ? 44 : 36)}
      <div class="kt"><b>${esc(e.title)}</b><small>${wkTxt(x)} ${x.getDate()} ${monTxt(x)}${e.kind === "macro" ? ` · ${e.time}` : ` · ${e.i.kind}`}</small>${e.kind === "macro" && fpTxt(e) ? `<small class="fp">${esc(fpTxt(e))}</small>` : ""}</div>
      <div class="kn">${kdCount(e, d)}</div></div>`;
  }).join("")}</div>`;
}


// My News right column: mini heat-map calendar (5 weeks) + key dates; click opens the full calendar
function upcomingPanel() {
  const ev = calEvents();   // always shown, so the full calendar is reachable even before any dates arrive
  const t0 = today0(), st = monday();
  const cell = (x) => {
    const d = isoDay(x), list = ev.filter((e) => e.day === d).sort(byLvl);
    return `<div class="c ${x < t0 ? "o" : ""} ${d === isoDay(t0) ? "today" : ""} ${list.length ? "h-" + topLvl(list) : ""}" style="--k:${Math.round((x - st) / 864e5)}"${list.length ? ` title="${esc(list.map((e) => e.title).join(" · "))}"` : ""}>${x.getDate()}${list.length ? `<span class="lgrow">${list.slice(0, 2).map((e) => evLogo(e.i, 13)).join("")}</span>` : ""}</div>`;
  };
  return `<div class="calp a" data-cal><div class="mh"><h2>Upcoming</h2><a href="#/calendar">Stock calendar →</a></div>
    <div class="mini">${["M", "T", "W", "T", "F", "S", "S"].map((w) => `<div class="w">${w}</div>`).join("")}${[...Array(35)].map((_, k) => cell(addDays(st, k))).join("")}</div>
    ${ev.length ? keyDates(ev, 3) || keyDates(ev, 3, true) : `<p class="note" style="margin-top:12px">No dates yet. Earnings and dividend dates for your watchlist are added once a day, and dates found in the news as they arrive.</p>`}</div>`;
}


function viewCalendar() {
  const c = state.cal, all = calEvents(), w = state.settings.watchlist || [], t0 = today0();
  const keep = { All: () => true, "Key only": (e) => e.i.lvl === "key", "My watchlist": (e) => w.includes(e.i.sym),
    Earnings: (e) => e.kind === "earnings" || e.kind === "result", Dividends: (e) => e.kind === "dividend", News: (e) => e.kind === "news", Results: (e) => e.kind === "result" }[c.filter] || (() => true);
  const ev = all.filter(keep), on = (d) => ev.filter((e) => e.day === d).sort(byLvl);
  const st = addDays(monday(), c.wk * 35), cells = [...Array(35)].map((_, k) => addDays(st, k));
  const cell = (x) => {
    const d = isoDay(x), list = on(d);
    return `<div class="c ${x < t0 ? "o" : ""} ${d === isoDay(t0) ? "today" : ""} ${d === c.sel ? "sel" : ""} ${list.length ? "h-" + topLvl(list) : ""}" data-calsel="${d}">
      <span class="n">${x.getDate() === 1 ? monTxt(x) + " " : ""}${x.getDate()}</span>${list.map((e) => `<span class="pill ${e.i.lvl}">${evLogo(e.i, 18)}<span>${esc(e.title)}</span></span>`).join("")}</div>`;
  };
  const sd = dayOf(c.sel), selList = on(c.sel);
  const item = (e) => `<div class="it">${evLogo(e.i, 40)}<div><span class="lvl ${e.i.lvl}">${LVL_TXT[e.i.lvl]}</span><b>${esc(e.title)}</b>
    <p>${e.i.kind}${e.time ? ` · ${e.time}` : ""}${e.kind === "macro" && fpTxt(e, true) ? ` · ${esc(fpTxt(e, true))}` : ""}${e.ticker && quotes[yahoo(e.ticker)] ? ` · ${esc(e.ticker)} ${pxSpan(yahoo(e.ticker))} ${chSpan(yahoo(e.ticker))} today` : ""}</p>
    ${e.i.why ? `<p class="why">Why key: ${esc(e.i.why)}</p>` : ""}<span class="src">${e.i.src}</span>
    ${e.story_id ? `<a class="linkbtn" href="#/story/${esc(e.story_id)}">Open the story →</a>` : ""}</div></div>`;
  // Stock lanes: one row per stock (watchlist first), market events in their own row.
  // Range = preset (1/2/4/8 weeks) or custom From-To; rows = the stocks you ticked (default: all)
  const r = c.range, maxDay = isoDay(addDays(t0, 60));
  const rFrom = r.from && r.from >= isoDay(t0) ? r.from : isoDay(t0);
  const rTo = r.to && r.to >= rFrom ? (r.to <= maxDay ? r.to : maxDay) : isoDay(addDays(dayOf(rFrom), r.days - 1));
  const span = Math.round((dayOf(rTo) - dayOf(rFrom)) / 864e5) + 1;
  const rangeDays = [...Array(span)].map((_, k) => addDays(dayOf(rFrom), k));
  const inRange = ev.filter((e) => e.day >= rFrom && e.day <= rTo);
  const lanesAll = [...new Set(inRange.slice().sort((a, b) => (a.day < b.day ? -1 : 1)).map((e) => e.i.lane))].sort((a, b) => (a === MARKET) - (b === MARKET));
  const lanes = lanesAll.filter((ln) => !c.hide.has(ln));
  const cols = `170px repeat(${span},minmax(${span > 35 ? 30 : 34}px,1fr))`;
  const dcls = (x) => `${isoDay(x) === isoDay(t0) ? "today" : ""} ${x.getDay() === 1 ? "wkst" : ""}`;
  // Keep the lanes box the same height however many rows are shown: fewer rows -> taller rows (min 360px body)
  const rowH = lanes.length ? Math.max(60, Math.floor(Math.max(360, lanes.length * 60) / lanes.length)) : 360;
  const roomy = span <= 14 ? " roomy" : "";   // bigger chips only when the day columns are wide
  const laneRow = (ln) => `<div class="lane${roomy}" style="grid-template-columns:${cols};min-height:${rowH}px"><div class="lab">${ln === MARKET ? `<span><b>${MARKET}</b><small>from the news</small></span>`
      : `${evLogo({ sym: ln }, 26)}<span><b>${esc(ln)}</b><small>${w.includes(ln) ? "watchlist" : "not in watchlist"}</small></span>`}</div>
    ${rangeDays.map((x, kk) => { const d = isoDay(x); return `<div class="${dcls(x)}">${inRange.filter((e) => e.day === d && e.i.lane === ln)
      .map((e) => `<span class="lchip ${e.i.lvl}" style="--k:${kk}" data-calsel="${d}" title="${esc(e.title)}">${ln === MARKET && e.i.site ? evLogo(e.i, 16) : ""}${esc(ln === MARKET ? (e.i.sym || e.title.split(" ").slice(0, 2).join(" ")) : e.kind === "news" ? e.title.replace(ln, "").trim().split(" ").slice(0, 2).join(" ") : e.i.kind)}</span>`).join("")}</div>`; }).join("")}</div>`;
  const fmtD = (d) => { const x = dayOf(d); return `${x.getDate()} ${monTxt(x)}`; };
  const presets = [[7, "1 week"], [14, "2 weeks"], [28, "4 weeks"], [56, "8 weeks"]];
  const laneCtl = `<div class="lctl">
      <div class="seg">${presets.map(([n, l]) => `<button class="${!r.to && r.days === n ? "on" : ""}" data-lrange="${n}">${l}</button>`).join("")}</div>
      <label class="dr">From <input type="date" id="lfrom" value="${rFrom}" min="${isoDay(t0)}" max="${maxDay}"></label>
      <label class="dr">To <input type="date" id="lto" value="${rTo}" min="${isoDay(t0)}" max="${maxDay}"></label>
      <span class="note" style="margin:0">${span} days · ${fmtD(rFrom)} – ${fmtD(rTo)}</span></div>
    ${lanesAll.length ? `<div class="lpick"><span>Show:</span>${lanesAll.map((ln) => `<button class="lp ${c.hide.has(ln) ? "" : "on"}" data-lpick="${esc(ln)}">${ln === MARKET ? "" : evLogo({ sym: ln }, 18)}${esc(ln === MARKET ? "Market & economy" : ln)}</button>`).join("")}
      ${c.hide.size ? `<button class="lp all" data-lpick="*">Show all</button>` : ""}</div>` : ""}`;
  const chips = ["All", "Key only", "My watchlist", "Earnings", "Results", "Dividends", "News"];
  return `${header("news")}<div class="wrap calv">
    <a class="back a" href="#/">← Back to My News</a>
    <h1 class="ttl a">Stock calendar</h1>
    <p class="why a">Earnings, results, dividends and dates from your news. Red = the dates that matter most. Economic releases (Forex Factory) have their own <a href="#/econ">Economic calendar</a>.</p>
    <div class="chips a">${chips.map((f) => `<button class="chip ${f === c.filter ? "on" : ""}" data-calf="${f}">${f}</button>`).join("")}</div>
    <div class="calgrid a"><div>
      <div class="mtop"><h2>${cells[0].getDate()} ${monTxt(cells[0])} – ${cells[34].getDate()} ${monTxt(cells[34])} ${cells[34].getFullYear()}</h2>
        <button data-calwk="-1" ${c.wk <= 0 ? "disabled" : ""} aria-label="Earlier">‹</button><button data-calwk="1" ${c.wk >= 1 ? "disabled" : ""} aria-label="Later">›</button></div>
      <div class="big">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<div class="w">${d}</div>`).join("")}${cells.map(cell).join("")}</div>
      <div class="legend"><span class="heat"><i class="h0"></i><i class="h-low"></i><i class="h-mid"></i><i class="h-key"></i></span> quiet → key day</div>
    </div>
    <aside class="sidecol">${keyDates(all, 4)}
      <div class="dayb"><h3>${wkTxt(sd)} ${sd.getDate()} ${monTxt(sd)}</h3><p class="note" style="margin:2px 0 0">${daysTo(c.sel) >= 0 ? cdTxt(c.sel) : "past"}</p>
      ${selList.length ? selList.map(item).join("") : `<div class="it empty1"><p>Nothing on this day.</p></div>`}</div></aside></div>
    <h2 class="sec a" id="lanes">By stock</h2>
    ${laneCtl}
    <div class="lanes a"><div class="lanes-in" style="min-width:${170 + span * (span > 35 ? 30 : 34)}px"><div class="lh" style="grid-template-columns:${cols}"><div class="lab">Stock</div>${rangeDays.map((x, k) => `<div class="${dcls(x)}">${x.getDay() === 1 || k === 0 ? `${x.getDate()} ${monTxt(x)}` : x.getDate()}</div>`).join("")}</div>
      ${lanes.length ? lanes.map(laneRow).join("") : `<div class="lane" style="min-height:360px"><div class="lab" style="grid-column:1/-1"><small>${lanesAll.length ? "No stocks selected. Tick one above." : "Nothing in this date range for this filter."}</small></div></div>`}</div></div>
    <p class="note">Dates come from Yahoo Finance (earnings, dividends, results) and from your news stories. Logos load from a free logo service.</p></div>`;
}

