// World Brief page (#/world).
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// ---------- World Brief (page 2; design round 20, V3: top 3 big, then a compact numbered list) ----------
// Stories come from the world_stories table (supabase/008_world.sql), written by robot/world.py once an hour.
// Ranking = outlets covering it + freshness + your taste (Want / No want). Plain maths, shown in "Why here".
const WREG = { Europe: "eu", Americas: "am", "Middle East": "me", "Asia-Pacific": "as", Africa: "af", Global: "gl" };
const WCAT_ICO = {
  Conflict: '<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/>', Climate: '<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/>',
  Economy: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>', Society: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M15 15c3 0 6 1.5 6 4"/>',
  Politics: '<path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2 10l10-6 10 6z"/>', Health: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  "Science & tech": '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
};
const W_UP = svgI('<path d="M7 10v11H3V10zM7 10l4-8a3 3 0 0 1 3 3v4h6a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.6 21H7"/>');
const W_DN = svgI('<path d="M17 14V3h4v11zM17 14l-4 8a3 3 0 0 1-3-3v-4H4a2 2 0 0 1-2-2.3l1.4-8A2 2 0 0 1 5.4 3H17"/>');
state.world = null; state.wvotes = new Map(); state.wreg = "All"; state.wlimit = 10; state.worldAt = 0; state.worldErr = "";

async function loadWorld() {
  state.worldErr = "";
  const since = new Date(Date.now() - 2 * 864e5).toISOString();
  const { data, error } = await sb.from("world_stories").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(200);
  if (error) { state.world = []; state.worldErr = /world_stories/.test(error.message || "") ? "setup" : error.message; return; }
  const fresh = new Set((data || []).map((s) => s.id));
  state.world = [...(data || []), ...(state.world || []).filter((s) => s._old && !fresh.has(s.id))];  // keep older search results openable
  const v = await sb.from("world_votes").select("story_id,vote,region,category,created_at").order("created_at", { ascending: false }).limit(500);
  state.wvotes = new Map((v.data || []).map((r) => [r.story_id, r]));
  const st = await sb.from("world_status").select("story_id,status").limit(2000);
  state.wready = !st.error;   // false until the read-status part of 008_world.sql has been run
  if (!st.error) state.wstatus = new Map(st.data.map((r) => [r.story_id, r.status]));
  state.worldAt = Date.now();
}
// Read status, same idea as My News: opening a story = seen, ✓ = done (read). Done stories fade but keep their place.
state.wstatus = new Map(); state.wready = false;
const wSt = (id) => state.wstatus.get(id) || "";
async function setWorldStatus(id, status) {
  const prev = wSt(id);
  if (status === prev) return;
  state.wstatus.set(id, status);
  if (status === "done" && !calm()) app.querySelectorAll(`[data-wdone="${CSS.escape(id)}"]`).forEach((b) => burst(b));
  if (status === "done" || prev === "done") render(false);
  if (!state.wready) return;
  const { error } = await sb.from("world_status").upsert({ user_id: state.user.id, story_id: id, status, updated_at: new Date().toISOString() }, { onConflict: "user_id,story_id" });
  if (error) console.warn("world status not saved", error.message);
}
// "Top stories to read": today's top 5 by your ranking (minus No-want ones) that you haven't marked done
const wWaiting = () => wRanked().filter(({ s, own }) => own !== -1 && hoursAgo(when(s)) <= 24).slice(0, 5).map(({ s }) => s).filter((s) => wSt(s.id) !== "done");
// Read first strip (design round 22, B): today's top 5 as numbered picture cards + progress. Read = green ✓, next = orange outline.
// World robot writes new stories about once an hour (GitHub often starts it late), so this is an estimate, rounded to 5 minutes
function nextWorldTxt() {
  const newest = (state.world || []).reduce((m, s) => (s.created_at > m ? s.created_at : m), "");
  if (!newest) return "";
  const min = Math.ceil((new Date(newest).getTime() + 65 * 60e3 - Date.now()) / 60e3 / 5) * 5;
  return min > 0 ? `Next update in ≈ <b>${min} min</b>` : "Next update any minute";
}
function wReadFirst() {
  const top = wRanked().filter(({ s, own }) => own !== -1 && hoursAgo(when(s)) <= 24).slice(0, 5).map(({ s }) => s);
  if (!top.length) return "";
  const done = top.filter((s) => wSt(s.id) === "done").length, left = top.filter((s) => wSt(s.id) !== "done");
  if (!left.length) {   // design round 31, finish line 4: pill + full bar + about when the next stories arrive
    return `<div class="wrf wrfall a" data-sig="all-${top.length}"><span class="wpill">${CHK}All ${top.length} read</span>
      <span class="wtrack"><i></i>${top.slice(1).map((_, k) => `<b style="left:${((k + 1) / top.length) * 100}%"></b>`).join("")}</span><span class="wnext">${nextWorldTxt()}</span></div>`;
  }
  return `<div class="wrf a" data-sig="${esc(top.map((s) => s.id + wSt(s.id)).join(","))}"><div class="wrfh"><b>${left.length ? `Read first · ${done} of ${top.length} read` : `Read first · all ${top.length} read ✓`}</b><span class="wrfbar"><i style="width:${(done / top.length) * 100}%"></i></span></div>
    ${left.length ? `<div class="wrfs">${left.map((s, i) => `<article class="wrfc${i === 0 ? " next" : ""}" data-wgo="${s.id}" title="${esc(s.headline)}">
      <span class="k">${top.indexOf(s) + 1}</span><button class="wrfchk" data-wdone="${s.id}" title="Mark as read" aria-label="Mark as read">${CHK}</button>${wPic(s)}
      <div class="t">${esc(s.headline)}</div><div class="wrft">${agoAt(when(s))}</div></article>`).join("")}</div>` : `<div class="wrfdone">${mascotArt("caught-up")}<span>All ${top.length} read. Nice work.</span></div>`}</div>`;
}
function worldBriefBar() {
  const waiting = wWaiting();
  const fresh = (state.world || []).filter((s) => new Date(s.created_at) > state.since && !wSt(s.id));
  const wide = fresh.filter((s) => s.n_sources >= 10).length;
  const thumb = (s) => (/^https:\/\//.test(s.image_url || "") ? `<img src="${esc(s.image_url)}" alt="" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">`
    : `<span class="wthumb r-${WREG[s.region] || "gl"}">${svgI(WCAT_ICO[s.category] || WCAT_ICO.Society)}</span>`);
  return `<div class="brief a" data-sig="${esc([waiting.map((s) => s.id).join(","), fresh.length, wide].join("|"))}">${calm() ? "" : BRIEF_BG}${seasonArt()}<div>
      <h2>${waiting.length ? `${waiting.length} top ${waiting.length > 1 ? "stories" : "story"} to read` : "You're caught up ✓"}</h2>
      <p>Since you were away: ${fresh.length} new · ${wide} widely covered (10+ outlets)</p></div>
    <div class="thumbs">${waiting.length ? waiting.slice(0, 4).map(thumb).join("") : `<span class="bmas">${mascotArt("caught-up")}</span>`}</div>
    ${waiting.length ? `<button class="go" data-wbrief="1">▶ Start<span class="hide-sm"> reading</span> · ~${waiting.length} min</button>` : ""}</div>`;
}
// Your taste: each Want = +1 for that story's region and category, each No want = -1. Old votes count less
// (half after 30 days). Capped at ±5 so one topic can't take over the page.
function wTaste() {
  const t = {};
  for (const r of state.wvotes.values()) {
    const w = r.vote * Math.pow(0.5, hoursAgo(r.created_at) / 720);
    for (const k of [r.region, r.category]) if (k) t[k] = (t[k] || 0) + w;
  }
  for (const k in t) t[k] = Math.max(-5, Math.min(5, t[k]));
  return t;
}
function sortWorld(items) {   // items arrive in Recommended order; "rec" keeps that order for ties
  const unread = ({ s }) => !wSt(s.id), t = ({ s }) => tNew(s), pos = new Map(items.map((x, i) => [x, i])), desc = (f) => (a, b) => f(b) - f(a);
  const cmp = { rec: (a, b) => pos.get(a) - pos.get(b), latest: desc(t), covered: desc(({ s }) => s.n_sources), growing: desc(({ s }) => grow6(s)),
    unread: (a, b) => unread(b) - unread(a) || (unread(a) && unread(b) ? t(a) - t(b) : 0) };
  const keys = wSorts(); if (keys.join() === "rec") return items;
  return chainSort(items.slice(), keys, cmp, t);
}
function wRanked() {
  const t = wTaste();
  return (state.world || []).filter((s) => !s._old).map((s) => {   // _old = only loaded for a search result
    const own = state.wvotes.get(s.id)?.vote;
    const sc = Math.min(s.n_sources, 15) * 2 + Math.max(0, 12 - hoursAgo(when(s))) * 0.5 + ((t[s.region] || 0) + (t[s.category] || 0)) * 3 + (own === -1 ? -100 : 0);
    return { s, sc, own };
  }).sort((a, b) => b.sc - a.sc);
}
const wCov = (s) => { const c = s.coverage || {}; return Object.keys(WREG).filter((r) => c[r]).map((r) => [r, c[r]]).sort((a, b) => b[1] - a[1]); };
const wLean = (s) => { const c = wCov(s), tot = c.reduce((a, x) => a + x[1], 0); return c.length && tot >= 3 && c[0][1] / tot >= 0.75 ? `<span class="wflag">Mostly ${esc(c[0][0])} outlets</span>` : ""; };
function wBar(s, big = false) {
  const c = wCov(s), tot = c.reduce((a, x) => a + x[1], 0) || 1;
  return `<div class="wcv${big ? " wcv-big" : ""}"><div class="t"><span>Who covers it</span><b>${esc(s.n_sources)} outlets</b></div>
    <div class="wbar" role="img" aria-label="${esc(c.map(([r, n]) => `${r} ${n}`).join(", "))}">${c.map(([r, n]) => `<i class="r-${WREG[r]}" style="width:${(n / tot) * 100}%" title="${esc(r)}: ${n}"></i>`).join("")}</div></div>`;
}
const wTags = (s) => `${devTag(devInfo(s, 3))}<span class="wrg r-${WREG[s.region] || "gl"}">${esc(s.region || "Global")}</span><span class="wrg">${esc(s.category || "")}</span>${wLean(s)}`;
// "Thailand & your stocks" box: one AI line + your related stocks with today's move (tap = that stock's My News)
const wThai = (s) => (s.thailand ? `<div class="wthai a"><h4>Thailand &amp; your stocks</h4><p>${esc(s.thailand)}</p>${(s.stocks || []).length
  ? `<div class="wstk">${s.stocks.map((t) => `<button class="tag clk" data-stock="${esc(t)}" title="Show ${esc(t)} news in My News">${esc(t)} ${chSpan(yahoo(t))}</button>`).join("")}</div>${wOwn(s.stocks)}` : ""}</div>` : "");
// Round 49-50 I1: "You own NVDA · 31.5% of portfolio" for the named stocks you hold (Portfolio page); watchlist-only ones get a grey note
function wOwn(list) {
  if (state.trades === undefined && !state.tradesLoading) setTimeout(loadTrades, 0);
  const own = pfOwned(), held = list.filter((t) => own[t] !== undefined), rest = list.filter((t) => own[t] === undefined);
  if (!held.length) return "";
  return `<div class="wown">${held.map((t) => `<a class="own" href="#/portfolio">You own ${esc(t)}${own[t] === null ? "" : ` · ${own[t].toFixed(1)}% of portfolio`}</a>`).join("")}${rest.length ? `<span class="note">${esc(rest.join(", "))}: watchlist only</span>` : ""}</div>`;
}
// BBC feeds give 240 px thumbnails; the same picture exists at 976 px (sharp on the big top-3 cards)
const bigImg = (u) => String(u || "").replace("ichef.bbci.co.uk/ace/standard/240/", "ichef.bbci.co.uk/ace/standard/976/");
function wPic(s) {
  const tileHtml = `<span class="wfb r-${WREG[s.region] || "gl"}">${svgI(WCAT_ICO[s.category] || WCAT_ICO.Society)}</span>`;
  if (!/^https:\/\//.test(s.image_url || "")) return `<span class="wpic">${tileHtml}</span>`;
  return `<span class="wpic">${tileHtml}<img src="${esc(bigImg(s.image_url))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()"></span>`;
}
const wVote = (s, own, withDone = true) => `<span class="wvote">${withDone ? `<button class="d ${wSt(s.id) === "done" ? "on" : ""}" data-wdone="${s.id}" title="${wSt(s.id) === "done" ? "Mark as not read" : "Mark as read"}" aria-label="Mark as read" aria-pressed="${wSt(s.id) === "done"}">${CHK}</button><i class="sep"></i>` : ""}<button class="w ${own === 1 ? "on" : ""}" data-wvote="${s.id}" data-v="1" title="Want: more like this" aria-label="Want" aria-pressed="${own === 1}">${W_UP}</button><button class="x ${own === -1 ? "on" : ""}" data-wvote="${s.id}" data-v="-1" title="No want: less like this" aria-label="No want" aria-pressed="${own === -1}">${W_DN}</button></span>`;
function wWhy(s) {
  const t = wTaste(), bits = [`<b>${esc(s.n_sources)} outlets</b>`];
  for (const k of [s.region, s.category]) { const v = Math.round(t[k] || 0); if (v) bits.push(`<span class="${v > 0 ? "pl" : "mi"}">${esc(k)} ${v > 0 ? "+" : ""}${v}</span>`); }
  return `<div class="wwhy">Why here: ${bits.join(" · ")}</div>`;
}
const wLegend = () => `<div class="wlegend">${Object.entries(WREG).filter(([r]) => r !== "Global").map(([r, k]) => `<span class="r-${k}">${esc(r)}</span>`).join("")}<span class="note" style="margin:0">Bar = where the outlets are based</span></div>`;

const THAI_RX = /\b(Thai|Thailand|Bangkok|Phuket|Chiang Mai|Pattaya|baht)\b/i;
const isThaiStory = (s) => s.country === "Thailand" || THAI_RX.test([s.headline, ...(s.summary || []), s.why_matters || ""].join(" "));
function viewWorld() {
  const head = header("world");
  if (state.world === null) return `${head}<div class="wrap"><div class="empty">${mascotArt("waiting", "mempty")}<h2>Loading the world…</h2></div></div>`;
  if (state.worldErr) return `${head}<div class="wrap"><div class="empty">${mascotArt("alert-bear", "mempty")}<h2>${state.worldErr === "setup" ? "World Brief is almost ready" : "Could not load World Brief"}</h2><p>${state.worldErr === "setup" ? "Run supabase/008_world.sql in Supabase, then the robot fills this page within an hour." : esc(state.worldErr)}</p></div></div>`;
  const all = wRanked(), counts = {};
  all.forEach(({ s }) => { counts[s.region] = (counts[s.region] || 0) + 1; });
  const thaiN = all.filter(({ s }) => isThaiStory(s)).length;
  const list0 = state.wreg === "All" ? all : state.wreg === "Thailand" ? all.filter(({ s }) => isThaiStory(s)) : all.filter(({ s }) => s.region === state.wreg);
  const list = state.wview === "map" ? list0 : sortWorld(list0);
  const shown = list.slice(0, state.wlimit), newest = all.length ? Math.max(...all.map(({ s }) => new Date(s.created_at))) : null;
  const chips = ["All", "Thailand", ...Object.keys(WREG).filter((r) => counts[r])].map((r) =>
    `<button class="c ${state.wreg === r ? "on" : ""}${r === "Thailand" ? " thai" : ""}" data-wreg="${esc(r)}">${esc(r)}<span class="count">${r === "All" ? all.length : r === "Thailand" ? thaiN : counts[r]}</span></button>`).join("");
  const dim = (own, s) => (own === -1 ? " wdim" : wSt(s.id) === "done" ? " wread" : "");
  const big = ({ s, own }, i) => `<article class="wtop${i ? "" : " lead"}${dim(own, s)} a" data-wgo="${s.id}">${wPic(s)}
      <div class="kick"><span class="wnum">${i + 1}</span><span class="wtags">${wTags(s)}<span class="wtime">${agoAt(when(s))}</span></span></div>
      <h3>${esc(s.headline)}</h3>${i === 0 || !isPhone() ? `<p class="wsum">${esc((s.summary || [])[0] || "")}</p>` : ""}
      <div class="bot">${wBar(s)}${wVote(s, own)}</div>${wWhy(s)}</article>`;
  const row = ({ s, own }, i) => `<article class="wrow${dim(own, s)} a" data-wgo="${s.id}"><span class="wnum">${i + 4}</span>
      <div class="wmain"><div class="wtags">${wTags(s)}<span class="wtime">${agoAt(when(s))}</span></div><h3>${esc(s.headline)}</h3>${wWhy(s)}</div>
      ${wBar(s)}${wVote(s, own)}${wPic(s)}</article>`;
  const body = !shown.length ? (state.wreg === "Thailand"
      ? `<div class="empty"><h2>No Thailand stories yet</h2><p>The robot reads Bangkok Post, Khaosod English and Google News Thailand every hour and adds the best Thailand story each time.</p></div>`
      : `<div class="empty">${mascotArt("waiting", "mempty")}<h2>No world stories yet</h2><p>The robot checks world news once an hour.</p></div>`)
    : state.wview === "map" ? worldMap(list)
    : `<div class="wtop3">${shown.slice(0, 3).map(big).join("")}</div>${shown.slice(3).map(row).join("")}
      ${list.length > shown.length ? `<button class="btn ghost wmore a" data-wmore="1">Show ${Math.min(10, list.length - shown.length)} more</button>` : ""}${wLegend()}`;
  return `${head}<div class="wrap world">
    <div class="whead a"><h2>Today's brief</h2><small>${new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}${newest ? ` · updated ${ago(new Date(newest).toISOString())}` : ""} · ${all.length} stories</small></div>
    ${all.length ? worldBriefBar() + wReadFirst() : ""}
    <div class="fbar a"><div class="filters"><div class="quick wchips">${state.wview === "map" ? "" : chips}</div>
      <div class="wviews" role="group" aria-label="View"><button class="${state.wview === "list" ? "on" : ""}" data-wview="list" aria-pressed="${state.wview === "list"}">List</button><button class="${state.wview === "map" ? "on" : ""}" data-wview="map" aria-pressed="${state.wview === "map"}">Map</button></div></div>${state.wview === "map" ? "" : sortDD("w")}</div>
    ${body}</div>`;
}
