// Page frame (header, tabs) + My News, story and Settings views.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// ---------- views ----------
function header(active) {
  return `<header><div class="wrap nav">
    <a class="logo" href="#/"><i class="lmark" aria-hidden="true"></i>investment center</a>
    <nav>
      <a class="${active === "news" ? "on" : ""}" href="#/">My News</a>
      <a class="${active === "world" ? "on" : ""}" href="#/world">World Brief</a>
      <a class="${active === "charts" ? "on" : ""}" href="#/charts">Charts</a>
      <a class="${active === "portfolio" ? "on" : ""}" href="#/portfolio">Portfolio</a>
    </nav>
    <div class="r">
      <form class="hsearch" id="hsearch" role="search"><span>⌕</span><input id="hq" type="search" placeholder="Search news & notes" value="${esc(state.searchQ || "")}" autocomplete="off" maxlength="60"></form>
      <span class="live" title="Checks for new stories every 2 minutes"><i></i>LIVE</span>
      <a class="btn ghost" href="#/settings">Topics<span class="hide-sm"> &amp; watchlist</span></a>
      <a class="gear ${active === "prefs" ? "on" : ""}" href="#/prefs" title="Settings" aria-label="Settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></a>
      <button class="btn" data-act="logout">Sign out</button>
      <button class="msearch" data-act="msearch" aria-label="Search" title="Search">${ICO.search}</button>
    </div></div></header>${tabBar()}`;
}
// Thin line icons for the phone bars (same stroke style as the settings gear; no emoji)
const svgI = (d) => `<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICO = {
  news: svgI('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>'),
  cal: svgI('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  bell: svgI('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  topics: svgI('<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>'),
  check: svgI('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  clock: svgI('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  star: svgI('<path d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8z"/>'),
  starOn: `<svg viewBox="0 0 24 24" width="21" height="21" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8z"/></svg>`,
  note: svgI('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
  search: svgI('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
  chart: svgI('<path d="M4 4v16h16"/><path d="m7 15 4-5 3 3 5-6"/>'),
  globe: svgI('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5a13 13 0 0 1 0 17M12 3.5a13 13 0 0 0 0 17"/>'),
};
// Phone only (design round 18, option A): bottom tab bar instead of the desktop header links
function tabBar() {
  const h = location.hash || "#/";
  const on = (k) => ((k === "news" && (h === "#/" || h.startsWith("#/story") || h.startsWith("#/search"))) || (k === "cal" && h.startsWith("#/calendar"))
    || (k === "topics" && h === "#/settings" && !state.toAlerts) || (k === "alerts" && h === "#/settings" && state.toAlerts) || (k === "prefs" && h === "#/prefs")) ? "on" : "";
  return `<nav class="tabbar" aria-label="Pages">
    <a class="${on("news")}" href="#/">${ICO.news}News</a>
    <a class="${h.startsWith("#/world") ? "on" : ""}" href="#/world">${ICO.globe}World</a>
    <a class="${h.startsWith("#/charts") || h === "#/heatmap" || h === "#/stocks" || h === "#/portfolio" ? "on" : ""}" href="#/charts">${ICO.chart}Charts</a>
    <a class="${on("cal")}" href="#/calendar">${ICO.cal}Calendar</a>
    <a class="${on("alerts")}" href="#/settings" data-tab-alerts="1">${ICO.bell}Alerts</a>
    <a class="${on("topics")}" href="#/settings" data-tab-topics="1">${ICO.topics}Topics</a></nav>`;
}
const isPhone = () => safe(() => matchMedia("(max-width:760px)").matches, false);
safe(() => matchMedia("(max-width:760px)").addEventListener("change", () => state.user && render(false)));

// Price chips under a story: today's move, plus the move since the story was saved
const pchips = (s) => (s.tickers || []).filter(followed).slice(0, 2).filter((t) => quotes[yahoo(t)]).map((t) => {
  const v = sinceMove(s, t);
  return `<span class="pchip"><b>${esc(t)}</b>${pxSpan(yahoo(t))}${chSpan(yahoo(t))}${v === null ? "" : `<span class="since ${v >= 0 ? "up" : "down"}" title="Change since this story was added">since ${sinceTxt(v)}</span>`}</span>`;
}).join("");

// Phone only: one swipeable row of your watchlist prices (replaces the price cards and the bottom dock). Tap = that stock's news.
function mTicker() {
  const wl = state.settings.watchlist || [];
  const items = wl.length ? wl.map((t) => ({ y: yahoo(t), n: t, stock: t })) : MARKETS.map(([y, n]) => ({ y, n }));
  return `<div class="mticker a" data-sig="${esc(items.map((x) => x.y + (quotes[x.y] ? "+" : "-")).join(","))}">${items.map((x) =>
    `<button class="mt"${x.stock ? ` data-stock="${esc(x.stock)}"` : ""}><b>${esc(x.n)}</b>${chSpan(x.y)}</button>`).join("")}</div>`;
}

function viewFeed() {
  // Filter row (design round 9, option A): quick views | reading status | your topics in one sideways-scrolling row
  const fchip = (c) => `<button class="c ${c === state.filter ? "on" : ""}" data-filter="${esc(c)}">${esc(c)}<span class="count">${storiesFor(c).length}</span></button>`;
  const stockChip = state.filter.startsWith("$")
    ? `<div class="quick"><button class="c on" data-filter="All" title="Back to All">${esc(state.filter.slice(1))} news<span class="count">${storiesFor(state.filter).length}</span> ×</button></div>` : "";
  const filterRow = `<div class="fbar a"><div class="filters">${stockChip}<div class="quick">${["All", "My watchlist", "Saved", ...(state.follows.size ? ["Following"] : [])].map(fchip).join("")}</div>
    <div class="quick">${["To read", "Later", "Done"].map(fchip).join("")}</div>
    <div class="scroller"><button class="arrow prev" data-scroll="-1" title="Back" aria-label="Scroll topics back">‹</button><div class="track">${myTopics().map(fchip).join("")}</div><button class="arrow" data-scroll="1" title="More topics" aria-label="More topics">›</button></div></div>${sortDD("n")}</div>`;
  const fr = (s) => (state.fresh.has(s.id) ? " fresh" : "");
  const list = visibleStories();
  let left, trending = [];
  if (!list.length) {
    const why = { Saved: "Tap ☆ on a story to save it.", "To read": "✓ You've read everything here.", Later: "Press Later on a story to keep it for later.", Done: "Tick ✓ on a story when you've read it." }[state.filter]
      || "No stories match this filter in the last 3 days. Try another topic, or add topics in Topics &amp; watchlist.";
    left = `<div class="empty">${mascotArt(state.filter === "To read" ? "caught-up" : "waiting", "mempty")}<h2>${state.filter === "To read" ? "All caught up" : "Nothing here yet"}</h2><p>${why}</p></div>`;
  } else {
    const [h, ...rest0] = list;
    // Right column: Trending now (stories 2-6) normally; the Read first queue only in the "To read" view
    const reading = state.filter === "To read";
    const phone = isPhone(); // phone: one list in rank order (no "Trending" side column that would end up at the bottom)
    const plain = nSorts().join() !== "rec";
    trending = reading || phone ? [] : plain ? [...rest0].sort((a, b) => rank(b) - rank(a)).slice(0, 5) : rest0.slice(0, 5);
    const all = reading || phone || plain ? rest0 : rest0.slice(5);
    // Draw 30 cards at a time: drawing all ~140 froze the page for ~100 ms on every redraw (measured 2026-11-24)
    const rest = all.slice(0, state.feedLimit), hidden = all.length - rest.length;
    left = `<div class="lead-wrap a${fr(h)}${stateCls(h)}" data-id="${h.id}"><div class="mwrap">${`<a class="lead" href="#/story/${h.id}">${media(h, true)}</a>`}${acts(h)}</div>
        <a class="lead" href="#/story/${h.id}"><h1>${esc(h.headline)}</h1></a>
        <div class="rowline"><div class="meta">${metaTags(h)}${esc(h.outlets?.[0])} · ${agoAt(when(h))} · ▲ ${srcs(h.n_sources)}</div>${star(h)}</div>
        ${heroChart(h)}
        ${forYou(h)}
        <p class="why" style="margin-top:10px">${esc(h.what_it_means)}</p></div>
      ${rest.length ? `<div class="sec">More stories</div><div class="grid2">${rest.map((s) => `
        <div class="card a${fr(s)}${stateCls(s)}" data-go="${s.id}"><div class="mwrap">${media(s)}${acts(s)}</div><h3>${esc(s.headline)}</h3>
        <div class="rowline"><div class="meta"><span class="mimp ${impClass(s.impact_score)}">${esc(s.impact_score)} impact</span>${metaTags(s)}${esc(s.outlets?.[0])} · ${agoAt(when(s))} · ▲ ${s.n_sources}</div>${star(s)}</div>${forYou(s, "sm")}${pchips(s) ? `<div class="vote">${pchips(s)}</div>` : ""}</div>`).join("")}</div>` : ""}
      ${hidden > 0 ? `<div style="text-align:center;margin-top:24px"><button class="btn ghost" data-act="more-stories">Show ${Math.min(hidden, FEED_STEP)} more stories (${hidden} left)</button></div>` : ""}`;
  }
  return `${header("news")}<div class="wrap">
    ${briefBar()}
    ${weekCard()}
    ${earnCards()}
    ${mTicker()}
    ${filterRow}
    ${priceStrip()}
    <div class="page"><div class="left">${left}</div><aside class="right">${state.filter === "To read" ? queuePanel() : trendPanel(trending, nSorts().join() === "rec" ? 2 : 1)}${seasonNote()}${marketMood()}${upcomingPanel()}${econPanel()}</aside></div></div>${dock()}`;
}

// "The full story" (design round 16): 3-4 paragraphs the AI wrote from the full articles it could read.
// Stories saved before this feature have no full_story field at all: show nothing for those.
// Explain-a-term (design round 17): the first time each hard term appears on the story page it gets a dotted
// underline; pointing at it (or tapping it on a phone) opens a small box with a plain-English explanation.
function termMarker(s) {
  const terms = (Array.isArray(s.terms) ? s.terms : []).filter((t) => t && t.term && t.explain);
  const used = new Set();
  return (text) => {
    let out = esc(text);
    const spans = [];
    terms.forEach((t, i) => {
      if (used.has(i)) return;
      const needle = esc(t.term), at = out.indexOf(needle);
      if (at < 0) return;
      used.add(i);
      spans.push(`<span class="term" tabindex="0">${needle}<span class="tip" role="tooltip"><b>${needle}</b>${esc(t.explain)}</span></span>`);
      out = out.slice(0, at) + `\u0000${spans.length - 1}\u0000` + out.slice(at + needle.length); // placeholder, so later terms can't match inside a box
    });
    return out.replace(/\u0000(\d+)\u0000/g, (_, n) => spans[n]);
  };
}
const forYou = (s, cls = "") => (s.for_you ? `<p class="foryou ${cls}"><b>For you</b>${esc(s.for_you)}</p>` : "");

function fullStory(s, mark = esc) {
  const paras = Array.isArray(s.full_story) ? s.full_story.filter(Boolean) : null;
  if (!paras) return "";
  if (!paras.length) return `<div class="thin a">Based on headlines only: the full articles for this story couldn't be read (often a paywall). Open the sources on the right for the whole story.</div>`;
  const words = paras.join(" ").split(/\s+/).length, from = (s.story_from || []).join(" + ");
  return `<div class="box fs a"><h4>The full story</h4>
    <div class="by"><span class="pill2">AI-written${from ? ` from ${esc(from)}` : ""}</span><span>· ${Math.max(1, Math.round(words / 220))} min read</span></div>
    ${paras.map((p) => `<p>${mark(p)}</p>`).join("")}</div>`;
}

function viewStory(id) {
  const s = findStory(id);
  if (!s) return `${header("news")}<div class="wrap"><a class="back" href="#/">← Back</a><div class="empty"><h2>${state.loadingStory === id ? "Loading…" : "Story not found"}</h2><p>${state.loadingStory === id ? "" : "It may have been removed."}</p></div></div>`;
  const p = s.impact_parts || {};
  const sentiment = s.sentiment === "Bullish" ? "bull" : s.sentiment === "Bearish" ? "bear" : "";
  const bar = (name, v) => `<div><span>${name}</span><i><em style="width:${(v || 0) * 10}%"></em></i><b>${esc(v)}</b></div>`;
  const st = stOf(s);
  const reaction = (s.tickers || []).filter((t) => s.prices_at?.[t]).map((t) => {
    const v = sinceMove(s, t), q = quotes[yahoo(t)];
    return `<div class="rx"><b>${esc(t)}</b><span>${fmtPx(Number(s.prices_at[t]))} → ${q ? fmtPx(q.price) : "…"}</span><span class="tnum ${v === null ? "" : v >= 0 ? "up" : "down"}">${v === null ? "—" : sinceTxt(v)}</span></div>`;
  }).join("");
  const outlets = (s.outlets || []).slice(0, 3);
  const mark = termMarker(s);
  return `${header("news")}<div class="wrap">
    <a class="back a" href="#/">← Back to My News</a>
    <div class="rprog"><i></i></div>
    <div class="detail"><div>
      <div class="meta a">${metaTags(s)}${esc((s.topics || []).join(" · "))} · ${agoAt(when(s))} · ▲ ${srcs(s.n_sources)}</div>
      <h1 class="a">${esc(s.headline)}</h1>
      <div class="a" style="margin-bottom:14px"><span class="tag ${sentiment}">${esc(s.sentiment)}</span>${(s.tickers || []).map((t) => `<button class="tag clk" data-stock="${esc(t)}" title="Show all ${esc(t)} news">${esc(t)}</button>`).join("")}</div>
      <div class="sacts a">
        <button class="sbtn ${st === "done" ? "on-done" : ""}" data-sdone="${s.id}">${st === "done" ? "✓ Done" : "✓ Mark as read"}</button>
        <button class="sbtn ${st === "later" ? "on-later" : ""}" data-slater="${s.id}">${st === "later" ? "In Later" : "Read later"}</button>
        ${star(s)}
        ${followBtn("story", s.id, s.headline)}
        <details class="mute"><summary>Show less like this ▾</summary><div class="menu">
          ${(s.topics || []).map((t) => `<button data-mute-topic="${esc(t)}">Hide topic “${esc(t)}”</button>`).join("")}
          ${outlets.map((o) => `<button data-mute-source="${esc(o)}">Hide news from ${esc(o)}</button>`).join("")}
          <p class="note">Watchlist news always stays. Undo anytime in Topics &amp; watchlist.</p></div></details>
      </div>
      ${/^https:\/\//.test(s.image_url || "") ? `<figure class="hero-fig"><img class="hero-img" src="${esc(s.image_url)}" alt="" referrerpolicy="no-referrer" onerror="this.parentNode.remove()">${s.image_credit ? `<figcaption>${esc(s.image_credit)}</figcaption>` : ""}</figure>` : ""}
      <div class="impline mob-only a"><span class="badge ${impClass(s.impact_score)}"><b>${esc(s.impact_score)}</b> <small>IMPACT</small></span>
        <div class="ibars">${[["Reach", p.reach], ["Surprise", p.surprise], ["Size", p.size], ["Timing", p.timing]].map(([n, v]) => `<span>${n}<i><em style="width:${(v || 0) * 10}%"></em></i></span>`).join("")}</div></div>
      ${forYou(s, "a")}
      ${fullStory(s, mark)}
      ${fold(`Key facts (${(s.summary || []).length})`, `<ul>${(s.summary || []).map((b) => `<li>${mark(b)}</li>`).join("")}</ul>`, !s.full_story?.length)}
      ${fold("What it means", `<p>${mark(s.what_it_means)}</p>`)}
      ${(() => { const wl = `<div class="w"><b>Who could win</b>${esc((s.winners || []).join(", ") || "—")}</div><div class="l"><b>Who could lose</b>${esc((s.losers || []).join(", ") || "—")}</div>`;
        return isPhone() ? fold("Winners &amp; losers", `<div class="wl">${wl}</div>`) : `<div class="box wl a">${wl}</div>`; })()}
      ${fold("Watch next", `<p>${esc(s.watch_next)}</p>`)}
      <div class="box a"><h4>My takeaway</h4><textarea id="note" data-note="${s.id}" rows="3" maxlength="1000" placeholder="One line for future you: what did you learn, or what will you do?">${esc(state.notes.get(s.id) || "")}</textarea><p class="note" id="note-msg">Saved automatically. Only you can see it.</p></div>
      <p class="note">Summary and analysis written by AI (Gemini) from ${s.n_sources === 1 ? "1 outlet's" : s.n_sources + " outlets'"} headlines and snippets${s.full_story?.length ? `, plus the full article${(s.story_from || []).length > 1 ? "s" : ""} from ${esc((s.story_from || []).join(" and "))}` : ""}. Check the original articles before acting on it. Not investment advice.</p>
    </div>
    <aside class="side">
      <div class="box a side-imp">${tile(s)}
        <p style="margin-top:14px;font-weight:600">${esc(s.impact_reason)}</p>
        <div class="bars">${bar("Reach", p.reach)}${bar("Surprise", p.surprise)}${bar("Size", p.size)}${bar("Timing", p.timing)}</div>
        <p class="note">AI impact estimate (1–10).</p>
      </div>
      ${devBox(s, 2)}
      ${reaction ? fold("Price reaction", `${reaction}<p class="note">Price when this story was added → now (Yahoo Finance, may be delayed).</p>`) : ""}
      ${fold(`Sources (${(s.links || []).length})`, `<ul class="srcs">${(s.links || []).map((l) =>
        `<li><b>${esc(l.outlet)}</b><a href="${safeUrl(l.link)}" target="_blank" rel="noopener noreferrer">${esc(l.title)} ↗</a></li>`).join("")}</ul>`)}
    </aside></div></div>
    <div class="actbar mob-only" role="toolbar" aria-label="Story actions">
      <button class="${st === "done" ? "pri" : ""}" data-sdone="${s.id}">${ICO.check}${st === "done" ? "Read" : "Mark read"}</button>
      <button class="${st === "later" ? "on" : ""}" data-slater="${s.id}">${ICO.clock}${st === "later" ? "In Later" : "Later"}</button>
      <button class="${state.saved.has(s.id) ? "on" : ""}" data-save="${s.id}">${state.saved.has(s.id) ? ICO.starOn : ICO.star}${state.saved.has(s.id) ? "Saved" : "Save"}</button>
      <button data-act="note">${ICO.note}Note</button></div>`;
}
// A section of the story page. Desktop: an open box like before. Phone: folds open/closed (+) to keep the page short.
const foldOpen = new Map(); // remembers which sections you opened, so Done / Save (which redraw the page) don't close them
app.addEventListener("toggle", (e) => { const d = e.target; if (d.matches?.("details.fold")) foldOpen.set(d.dataset.k, d.open); }, true);
function fold(title, inner, openOnPhone = false, extra = "") {
  if (!isPhone()) return `<div class="box a ${extra}"><h4>${title}</h4>${inner}</div>`;
  const k = title.replace(/\s*\(\d+\)$/, ""), open = foldOpen.has(k) ? foldOpen.get(k) : openOnPhone;
  return `<details class="box fold a ${extra}" data-k="${esc(k)}" ${open ? "open" : ""}><summary><h4>${title}</h4><span class="pm" aria-hidden="true"></span></summary>${inner}</details>`;
}

