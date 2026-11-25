// Sort dropdown (My News + World Brief).
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// ---------- Sort (design round 33, S1 dropdown): the filter picks WHICH stories, the sort picks the ORDER ----------
// Saved per device (ic_nsort / ic_wsort). World has no AI impact score and no stocks, so it gets fewer options.
const NSORT = { rec: ["Recommended", "Impact + outlets + freshness"], impact: ["Highest impact", "AI score 10 → 1"], latest: ["Latest", "Newest first"],
  covered: ["Most covered", "Most outlets"], growing: ["Fastest growing", "Outlets added in the last 6 h"], price: ["Biggest price move", "Since the story was posted"],
  watch: ["My watchlist first", "Your stocks on top"], unread: ["Oldest unread first", "What has waited longest"] };
const WSORT = { rec: ["Recommended", "Outlets + freshness + your votes"], latest: NSORT.latest, covered: NSORT.covered, growing: NSORT.growing, unread: NSORT.unread };
// Round 47: sorts can be combined: a list, used in the order picked (1st, then 2nd for ties, ...). Old single values still read.
const sortList = (key, opts) => { const v = safe(() => localStorage.getItem(key)) || "", l = (v.startsWith("[") ? safe(() => JSON.parse(v), []) : [v]).filter((k) => opts[k]); return l.length ? l : ["rec"]; };
const nSorts = () => sortList("ic_nsort", NSORT), wSorts = () => sortList("ic_wsort", WSORT);
const nSort = () => nSorts()[0], wSort = () => wSorts()[0];
const sortToggle = (key, opts, k) => { const l = sortList(key, opts).filter((x) => x !== "rec" || k === "rec"); const i = l.indexOf(k); if (i >= 0) l.splice(i, 1); else l.push(k);
  lsSet(key, JSON.stringify(k === "rec" || !l.length ? ["rec"] : l.filter((x) => x !== "rec"))); };
function chainSort(list, keys, cmp, newest) {   // keys in order; each cmp[k](a, b) < 0 puts a first
  return list.sort((a, b) => { for (const k of keys) { const r = cmp[k]?.(a, b) || 0; if (r) return r; } return newest(b) - newest(a); });
}
const tNew = (s) => new Date(when(s)).getTime() || 0;
// Outlets gained in the last 6 hours (from the Developing history the robot saves)
function grow6(s) {
  const g = Array.isArray(s.growth) ? s.growth.filter((p) => p && p.t) : [];
  if (!g.length) return 0;
  const last = g[g.length - 1], base = g.filter((p) => hoursAgo(p.t) > 6).pop() || g[0];
  return hoursAgo(last.t) > 6 ? 0 : Math.max(0, last.n - base.n);
}
// Biggest move of the story's stocks since it was posted (-1 = no price known: goes last)
const priceMove = (s) => Math.max(-1, ...Object.keys(s.prices_at || {}).map((t) => sinceMove(s, t)).filter((v) => v !== null).map(Math.abs));
// key(s): bigger first; ties: newest first
function sortBy(list, key) { const k = new Map(list.map((x) => [x, key(x)])); return list.sort((a, b) => k.get(b) - k.get(a) || tNew(b) - tNew(a)); }
function sortNews(list) {
  const unread = (s) => !["seen", "done"].includes(stOf(s)), keys = nSorts(), memo = new Map(), val = (k, f) => (s) => { const m = k + s.id; if (!memo.has(m)) memo.set(m, f(s)); return memo.get(m); };
  const desc = (f) => (a, b) => f(b) - f(a);
  const cmp = { rec: desc(val("r", rank)), impact: desc((s) => s.impact_score), latest: desc(tNew), covered: desc((s) => s.n_sources), growing: desc(val("g", grow6)),
    price: desc(val("p", priceMove)), watch: desc((s) => (inWatch(s) ? 1 : 0)), unread: (a, b) => unread(b) - unread(a) || (unread(a) && unread(b) ? tNew(a) - tNew(b) : 0) };
  return chainSort(list, keys, cmp, tNew);
}
// The dropdown: a <details> element (opens and closes by itself; a click elsewhere closes it, see the end of this file)
function sortDD(kind) {   // tick several: 1 = first sort, 2 = used when 1 is a tie, ...
  const opts = kind === "w" ? WSORT : NSORT, cur = kind === "w" ? wSorts() : nSorts();
  return `<details class="sortdd"><summary title="Sort stories (pick several to combine)"><span class="si">⇅</span><span class="sl">Sort:</span> ${cur.map((k) => esc(opts[k][0])).join(" → ")}<span class="sc">▾</span></summary>
    <div class="smenu" role="menu"><p class="shint">Pick several to combine. Numbers show the order.</p>${Object.entries(opts).map(([k, [t, d]]) => { const i = cur.indexOf(k); return `<button role="menuitemcheckbox" aria-checked="${i >= 0}" class="${i >= 0 ? "on" : ""}" data-${kind}sort="${k}">
      <i>${i >= 0 ? (cur.length > 1 ? i + 1 : "✓") : ""}</i><span><b>${esc(t)}</b><small>${esc(d)}</small></span></button>`; }).join("")}
      ${cur.length > 1 || cur[0] !== "rec" ? `<button class="sreset" data-${kind}sort="rec"><span><b>Reset to Recommended</b></span></button>` : ""}</div></details>`;
}

// Stories for one filter (also used for the counts on the filter chips)
function storiesFor(f) {
  let list = state.stories;
  if (f === "Saved") list = list.filter((s) => state.saved.has(s.id));
  else if (f === "Following") list = list.filter((s) => isFollowing("story", s.id));
  else if (f === "To read") list = list.filter((s) => matches(s) && !["done", "later"].includes(stOf(s)));
  else if (f === "Later") list = list.filter((s) => stOf(s) === "later");
  else if (f === "Done") list = list.filter((s) => stOf(s) === "done");
  else if (f === "My watchlist") list = list.filter((s) => (s.tickers || []).some((x) => state.settings.watchlist.includes(x)));
  else if (f.startsWith("$")) list = list.filter((s) => (s.tickers || []).includes(f.slice(1))); // one stock (clicked in prices or tags)
  else if (f !== "All") list = list.filter((s) => (s.topics || []).includes(f));
  else list = list.filter(matches);
  return list;
}
const visibleStories = () => sortNews([...storiesFor(state.filter)]);

