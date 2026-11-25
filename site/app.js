// Investment Center website: page 1 (My News). Plain JavaScript, no build step.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const CFG = window.IC_CONFIG;

// "Remember me": ticked = login kept in localStorage (survives closing the browser);
// unticked = sessionStorage (logged out when the browser closes).
const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
const remember = () => safe(() => localStorage.getItem("ic_remember"), null) !== "0";
const authStore = {
  getItem: (k) => safe(() => (remember() ? localStorage : sessionStorage).getItem(k)),
  setItem: (k, v) => safe(() => (remember() ? localStorage : sessionStorage).setItem(k, v)),
  removeItem: (k) => { safe(() => localStorage.removeItem(k)); safe(() => sessionStorage.removeItem(k)); },
};
const sb = createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { flowType: "pkce", storage: authStore, persistSession: true } });
const app = document.getElementById("app");

const state = {
  ecal: { wk: 0, sel: null, from: null }, cal: { filter: "All", wk: 0, sel: null, range: { days: 28, from: null, to: null }, hide: new Set() }, user: null, settings: null, stories: [], saved: new Set(), filter: "All", draft: null, fresh: new Set(),
  status: new Map(), notes: new Map(), events: [], econ: [], follows: new Set(), earn: [], gauges: {}, mood: [], cnn: null, more: new Map(), since: new Date(Date.now() - 864e5), ready005: false,
  briefing: null, searchQ: "", searchResults: null, loadingStory: null, feedLimit: 30 };
const FEED_STEP = 30;
// Local preview only (python -m http.server on this PC): lets Claude show sample data before the database is updated.
// Does nothing on the real site.
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.IC_PREVIEW = { state, render: (...a) => render(...a), brief: (ids) => { state.briefing = { ids, i: 0, res: {} }; drawBriefing(); },
  world: (rows) => { state.world = rows; state.worldAt = Date.now() + 864e5; state.worldErr = ""; render(); },
  login: () => { app.innerHTML = viewLogin(); } };   // see the login page without signing out  // sample World Brief rows before the table exists
// Motion setting (Settings page): "auto" follows the device, "full" always animates, "reduced" keeps things still.
const motionPref = () => safe(() => localStorage.getItem("ic_motion"), null) || "auto";
const deviceCalm = () => safe(() => matchMedia("(prefers-reduced-motion: reduce)").matches, false);
const calm = () => { const p = motionPref(); return p === "reduced" || (p !== "full" && deviceCalm()); };
const applyMotion = () => document.documentElement.classList.toggle("calm", calm());
applyMotion();
// Theme setting (Settings page): "auto" follows the device, "light" or "dark"; dark has 3 styles (design round 16)
const themePref = () => safe(() => localStorage.getItem("ic_theme"), null) || "auto";
const darkStyle = () => safe(() => localStorage.getItem("ic_dark"), null) || "graphite";
const lightStyle = () => safe(() => localStorage.getItem("ic_light"), null) || "crisp"; // design round 16: crisp / newsprint / cloud / sage
const deviceDark = () => safe(() => matchMedia("(prefers-color-scheme: dark)").matches, false);
const isDark = () => { const p = themePref(); return p === "dark" || (p === "auto" && deviceDark()); };
function applyTheme() {
  const r = document.documentElement;
  r.dataset.theme = isDark() ? "dark" : "light";
  r.dataset.dark = darkStyle();
  r.dataset.light = lightStyle();
}
applyTheme();
// Season themes (design round 29). Settings -> Season: off (default) / auto (follows the calendar) / winter / spring / summer / autumn.
// Saved on this device. On localhost, ?season=winter etc. still overrides it for previews.
const SEASONS = ["winter", "spring", "summer", "autumn"];
const seasonPref = () => safe(() => localStorage.getItem("ic_season"), null) || "off";
const calSeason = () => { const m = new Date().getMonth() + 1; return m === 12 || m <= 2 ? "winter" : m <= 5 ? "spring" : m <= 8 ? "summer" : "autumn"; };
const seasonUrl = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? new URLSearchParams(location.search).get("season") : null;
let season = null;
const SEASON_ICON = {
  winter: "<g stroke='white' stroke-width='3.4' stroke-linecap='round'><path d='M32 14v36M16.4 23l31.2 18M16.4 41l31.2-18'/><path d='M27 17l5 4 5-4M27 47l5-4 5 4'/></g>",
  spring: "<g fill='white'><circle cx='32' cy='21' r='8'/><circle cx='42.5' cy='29' r='8'/><circle cx='38.5' cy='41.5' r='8'/><circle cx='25.5' cy='41.5' r='8'/><circle cx='21.5' cy='29' r='8'/></g><circle cx='32' cy='33' r='5' fill='%23ffd166'/>",
  summer: "<circle cx='32' cy='32' r='10' fill='white'/><g stroke='white' stroke-width='3.4' stroke-linecap='round'><path d='M32 12v6M32 46v6M12 32h6M46 32h6M18 18l4 4M42 42l4 4M46 18l-4 4M22 42l-4 4'/></g>",
  autumn: "<path d='M32 12c9 8 14 17 9 27-3 6-9 9-9 9s-6-3-9-9c-5-10 0-19 9-27z' fill='white'/><path d='M32 22v32' stroke='%23c2541b' stroke-width='3' stroke-linecap='round'/>",
};
function applySeason() {
  const p = SEASONS.includes(seasonUrl) ? seasonUrl : seasonPref();
  season = p === "auto" ? calSeason() : SEASONS.includes(p) ? p : null;
  const r = document.documentElement;
  document.querySelector(".sfx")?.remove();
  document.querySelector("link[data-season-icon]")?.remove();
  if (!season) { delete r.dataset.season; return; }
  r.dataset.season = season;
  // falling snow / petals / leaves in the side margins (an inner <b> so the mouse can push it)
  const fx = document.createElement("div");
  fx.className = "sfx"; fx.setAttribute("aria-hidden", "true");
  if (season === "summer") fx.innerHTML = '<div class="sun"></div>';
  else {
    const n = season === "winter" ? 40 : 18, kind = { winter: "snow", spring: "petal", autumn: "leaf" }[season];
    const leaf = ["#c2541b", "#e08a2e", "#9c3d12", "#d9a13a"];
    // two strips, one per side margin (no full-screen fade mask: that mask made scrolling stutter, 34 vs 53 fps measured)
    const one = (k) => { const d = (season === "winter" ? 10 : 14) + Math.random() * 10;
      return `<i class="${kind}" style="left:${Math.random() * 100}%;--s:${3 + Math.random() * 4}px;--dx:${(Math.random() * 2 - 1) * 60}px;--r:${Math.random() * 540}deg;--lc:${leaf[k % 4]};--d:${d}s;--w:${-Math.random() * d}s"><b></b></i>`; };
    const half = (side) => `<div class="sfs ${side}">${Array.from({ length: Math.ceil(n / 2) }, (_, k) => one(k + (side === "r" ? 1 : 0))).join("")}</div>`;
    fx.innerHTML = half("l") + half("r");
  }
  document.body.prepend(fx);
  // a seasonal browser-tab icon
  const bg = { winter: "%232b7de9", spring: "%23dd4f7a", summer: "%23ff6a00", autumn: "%23c2541b" }[season];
  const ico = document.createElement("link"); ico.rel = "icon"; ico.dataset.seasonIcon = "1";
  ico.href = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='${bg}'/>${SEASON_ICON[season]}</svg>`;
  document.head.appendChild(ico);
}
applySeason();
// snow / petals / leaves drift away from the mouse (side margins only, where they are visible)
{
  let mx = -999, my = -999, raf = 0;
  const push = () => {
    raf = 0;
    document.querySelectorAll(".sfx i").forEach((p) => {
      const r = p.getBoundingClientRect(), dx = r.left + r.width / 2 - mx, dy = r.top + r.height / 2 - my, d = Math.hypot(dx, dy);
      const b = p.firstElementChild;
      if (d < 120) { const f = (120 - d) / 120 * 70 / (d || 1); b.style.transform = `translate(${dx * f}px,${dy * f}px)`; b.dataset.p = "1"; }
      else if (b.dataset.p) { b.style.transform = ""; delete b.dataset.p; }
    });
  };
  addEventListener("mousemove", (e) => { if (!season) return; mx = e.clientX; my = e.clientY; if (!raf) raf = requestAnimationFrame(push); }, { passive: true });
}
safe(() => matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { applyTheme(); if (location.hash === "#/prefs") render(false); }));
safe(() => matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", () => { applyMotion(); if (location.hash === "#/prefs") render(false); }));
const EYE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M2 2l20 20"/></svg>`;
const MAX_CUSTOM_TOPICS = 5, MAX_EXTRA_TICKERS = 5, MAX_WATCHLIST = 30;

// ---------- helpers ----------
// Escape all text from the database before putting it in the page (headlines come from the internet).
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? esc(u) : "#");
const hoursAgo = (iso) => (Date.now() - new Date(iso).getTime()) / 36e5;
function ago(iso) {
  if (!iso) return "";
  const h = hoursAgo(iso);
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min ago`;
  if (h < 24) return `${Math.round(h)} hr ago`;
  return `${Math.round(h / 24)} day${h >= 48 ? "s" : ""} ago`;
}
// "19 hr ago · Mon 13:20" (today: "2 hr ago · 14:05"): how old, plus when it was published (your local time)
function agoAt(iso) {
  if (!iso) return "";
  const d = new Date(iso), today = new Date().toDateString() === d.toDateString();
  const hm = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${ago(iso)} · ${today ? hm : `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${hm}`}`;
}
const impClass = (n) => (n >= 8 ? "imp-hi" : n >= 6 ? "imp-md" : n >= 4 ? "imp-lo" : "imp-min");
const label = (s) => s.tickers?.[0] || s.topics?.[0] || "News";
const when = (s) => s.published_at || s.created_at;
const srcs = (n) => `${n} source${n === 1 ? "" : "s"}`;

function tile(s, big = false) {
  return `<div class="tile ${impClass(s.impact_score)}">
    <small>${esc(s.topics?.[0] || "News")}</small>
    <div class="n"><b data-count="${esc(s.impact_score)}">${esc(s.impact_score)}</b><span>IMPACT</span></div>
    <div class="tk">${esc((s.tickers || []).slice(0, big ? 4 : 3).join(" · "))}</div>
  </div>`;
}
// Publisher's picture with the impact badge on top. If the picture fails to load, the impact tile underneath shows instead.
function media(s, big = false) {
  if (!/^https:\/\//.test(s.image_url || "")) return tile(s, big);
  return `<div class="pic">${tile(s, big)}
    <img src="${esc(s.image_url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('noimg')">
    <span class="badge ${impClass(s.impact_score)}"><b data-count="${esc(s.impact_score)}">${esc(s.impact_score)}</b> <small>IMPACT</small></span></div>`;
}
const star = (s) => `<button class="star ${state.saved.has(s.id) ? "on" : ""}" data-save="${s.id}" title="Save for later">${state.saved.has(s.id) ? "★" : "☆"}</button>`;

// ---------- data ----------
async function loadSettings() {
  const read = () => sb.from("user_settings").select("*").eq("user_id", state.user.id).maybeSingle();
  let { data, error } = await read();
  if (error) throw error;
  if (!data) {
    // First visit: create your settings row with the defaults. "Already exists" is fine, so ignore duplicates.
    const ins = await sb.from("user_settings").upsert({ user_id: state.user.id }, { onConflict: "user_id", ignoreDuplicates: true });
    if (ins.error) throw ins.error;
    ({ data, error } = await read());
    if (error) throw error;
  }
  if (!data) throw new Error("Your settings could not be created. Try reloading the page.");
  state.settings = data;
}

async function loadStories() {
  const since = new Date(Date.now() - 3 * 864e5).toISOString();
  const { data, error } = await sb.from("stories").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(300);
  if (error) throw error;
  state.stories = data || [];
  const sv = await sb.from("saved").select("story_id");
  state.saved = new Set((sv.data || []).map((r) => r.story_id));
}

// Your topics + watchlist decide what "All" shows. Ranking: impact first, then coverage, then freshness.
const myTopics = () => [...(state.settings.topics || []), ...(state.settings.custom_topics || [])];
function matches(s) {
  const t = new Set(myTopics()), w = new Set(state.settings.watchlist || []);
  return !muted(s) && ((s.topics || []).some((x) => t.has(x)) || (s.tickers || []).some((x) => w.has(x)));
}
const rank = (s) => s.impact_score * 3 + Math.min(s.n_sources, 10) - hoursAgo(when(s)) / 6;

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

// ---------- prices (design round 8, option 3a) ----------
// Yahoo Finance prices via the get_quotes database helper (cached 60 s). May be delayed (Thai stocks ~15 min).
const MARKETS = [["^SET.BK", "SET", "SET Index"], ["^GSPC", "S&P 500", "US large caps"], ["^IXIC", "Nasdaq", "US tech"],
  ["GC=F", "Gold", "per ounce"], ["BTC-USD", "BTC", "Bitcoin"], ["THB=X", "USD/THB", "Thai baht"]];
const yahoo = (t) => (CFG.yahoo || {})[t] || t;          // PTT -> PTT.BK
const quotes = {};                                         // Yahoo symbol -> {price, prev, pts, name, time}
const fmtPx = (v) => (v >= 10000 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 })
  : v >= 1000 ? v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : Number(v).toFixed(2));
const pctOf = (q) => (q && q.prev ? ((q.price - q.prev) / q.prev) * 100 : 0);
const pctTxt = (q) => (q ? `${pctOf(q) >= 0 ? "+" : ""}${pctOf(q).toFixed(2)}%` : "");
const dirOf = (q) => (q ? (pctOf(q) >= 0 ? "up" : "down") : "");
const followed = (t) => CFG.tickers.includes(t) || (state.settings.watchlist || []).includes(t);

// Mini chart of today's prices; the dotted line is yesterday's close.
function spark(q, w, h) {
  const pts = (q?.pts || []).map(Number).filter(Number.isFinite);
  if (pts.length < 2) return `<svg class="spark" width="${w}" height="${h}"></svg>`;
  const all = q.prev ? [...pts, q.prev] : pts;
  const lo = Math.min(...all), hi = Math.max(...all), n = pts.length - 1, span = hi - lo || 1;
  const y = (v) => (h - 2 - ((v - lo) / span) * (h - 4)).toFixed(1);
  const d = pts.map((v, k) => `${k ? "L" : "M"}${((k / n) * w).toFixed(1)},${y(v)}`).join("");
  const col = pctOf(q) >= 0 ? "var(--up)" : "var(--down)";
  return `<svg class="spark draw" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="--len:${w * 3}">
    ${q.prev ? `<line x1="0" x2="${w}" y1="${y(q.prev)}" y2="${y(q.prev)}" stroke="#ccc" stroke-dasharray="2 3"/>` : ""}
    <path class="area" d="${d}L${w},${h}L0,${h}Z" fill="${col}"/><path class="ln" d="${d}" stroke="${col}"/>
    <circle class="now" cx="${w}" cy="${y(pts[n])}" r="3" fill="${col}"/></svg><i class="nring" style="left:${w}px;top:${y(pts[n])}px;color:${col}"></i>`;   // the pulsing ring is HTML, not SVG, so the browser can animate it without redrawing the chart
}
const pxSpan = (y) => `<span class="px tnum" data-px="${esc(y)}">${quotes[y] ? fmtPx(quotes[y].price) : "—"}</span>`;
const chSpan = (y) => `<span class="ch tnum ${dirOf(quotes[y])}" data-ch="${esc(y)}">${pctTxt(quotes[y])}</span>`;
const spSpan = (y, w, h) => `<span class="sp" data-sp="${esc(y)}" data-w="${w}" data-h="${h}">${spark(quotes[y], w, h)}</span>`;

function priceStrip() {
  const tab = state.priceTab || "m";
  const items = tab === "m"
    ? MARKETS.map(([y, n, sub]) => ({ y, n, sub }))
    : (state.settings.watchlist || []).map((t) => ({ y: yahoo(t), n: t, sub: cleanName(state.settings.watch_names?.[t] || quotes[yahoo(t)]?.name || "") }));
  const cards = items.length
    ? items.map((it) => `<div class="mk${tab === "m" ? "" : " clk"}" ${tab === "m" ? "" : `data-stock="${esc(it.n)}" title="Show ${esc(it.n)} news"`}><span class="nm">${esc(it.n)}</span><span class="sub">${esc(it.sub)}</span>${pxSpan(it.y)}${chSpan(it.y)}${spSpan(it.y, 74, 40)}</div>`).join("")
    : `<p class="note">Your watchlist is empty. Add stocks in Topics &amp; watchlist.</p>`;
  return `<div class="stripwrap a" data-sig="${esc([tab, ...items.map((it) => it.y + (quotes[it.y] ? "+" : "-"))].join(","))}"><div class="strip-head"><h2>${tab === "m" ? "Markets" : "My watchlist"} <span class="delay">· Yahoo Finance, may be delayed</span>${marketBadges()}</h2>
      <div class="tabs"><button class="${tab === "m" ? "on" : ""}" data-ptab="m">Markets</button><button class="${tab === "w" ? "on" : ""}" data-ptab="w">My watchlist</button></div></div>
    <div class="strip">${cards}</div></div>`;
}
function heroChart(s) {
  const t = (s.tickers || []).filter(followed).find((x) => quotes[yahoo(x)]);
  if (!t) return "";
  const y = yahoo(t), q = quotes[y];
  return `<div class="hero-chart"><span class="nm">${esc(t)}<small>${esc(cleanName(state.settings.watch_names?.[t] || q.name || ""))} · today</small></span>
    ${spSpan(y, 360, 44)}<span class="hp">${pxSpan(y)}<br>${chSpan(y)}</span></div>`;
}

function wantedSymbols() {
  const s = new Set(MARKETS.map((m) => m[0]));
  (state.settings.watchlist || []).forEach((t) => s.add(yahoo(t)));
  if (nSorts().includes("price")) storiesFor(state.filter).forEach((st) => Object.keys(st.prices_at || {}).forEach((t) => s.add(yahoo(t))));   // to rank by price move
  visibleStories().slice(0, 30).forEach((st) => (st.tickers || []).filter(followed).forEach((t) => s.add(yahoo(t))));
  return [...s].slice(0, nSorts().includes("price") ? 80 : 40);
}
async function loadQuotes() {
  if (!state.user || document.hidden) return;
  const wanted = wantedSymbols();
  const missing = wanted.filter((y) => !quotes[y]);
  const { data, error } = await sb.rpc("get_quotes", { syms: wanted });
  if (error || !data) return;
  const moved = [];
  for (const [y, q] of Object.entries(data)) {
    const old = quotes[y];
    quotes[y] = q;
    if (old && Number(old.price) !== Number(q.price)) moved.push([y, Number(q.price) > Number(old.price)]);
  }
  rememberQuotes();
  const onFeed = !location.hash || location.hash === "#/";
  const typing = document.activeElement && document.activeElement.matches("input, textarea");
  // Prices that weren't on screen yet (first load, or a stock you just added): redraw the page once
  if (missing.some((y) => quotes[y])) { if (onFeed && !typing) render(false); return; }
  // Later updates change the numbers in place and flash them green/red
  moved.forEach(([y, up]) => {
    const q = quotes[y], sel = CSS.escape(y);
    app.querySelectorAll(`[data-px="${sel}"]`).forEach((el) => { rollText(el, fmtPx(q.price), up); el.classList.remove("tick-up", "tick-down"); void el.offsetWidth; el.classList.add(up ? "tick-up" : "tick-down"); });
    app.querySelectorAll(`[data-ch="${sel}"]`).forEach((el) => { el.textContent = pctTxt(q); el.classList.remove("up", "down"); el.classList.add(dirOf(q)); });
    app.querySelectorAll(`[data-sp="${sel}"]`).forEach((el) => { el.innerHTML = spark(q, +el.dataset.w, +el.dataset.h).replace('class="spark draw"', 'class="spark"'); });
  });
}
// Dark dock at the bottom (design round 8 + your reference): your watchlist stays in view once the strip scrolls away
function dock() {
  const w = (state.settings.watchlist || []).map((t) => ({ y: yahoo(t), n: t }));
  const m = MARKETS.map(([y, n]) => ({ y, n }));
  const bar = w.length ? w.slice(0, 5) : m.slice(0, 5);
  const rest = w.length ? [...m, ...w.slice(5)] : m.slice(5);
  const mine = (x) => (state.settings.watchlist || []).includes(x.n) ? ` data-stock="${esc(x.n)}" title="Show ${esc(x.n)} news"` : "";
  const it = (x) => `<span class="it${mine(x) ? " clk" : ""}"${mine(x)}><b>${esc(x.n)}</b>${pxSpan(x.y)}${chSpan(x.y)}</span>`;
  const cell = (x) => `<div class="cell${mine(x) ? " clk" : ""}"${mine(x)}><b>${esc(x.n)}</b><div>${pxSpan(x.y)} ${chSpan(x.y)}</div></div>`;
  return `<div class="dock ${state.dockOpen ? "open" : ""}" data-sig="${esc([state.dockOpen, ...[...w, ...m].map((x) => x.y + (quotes[x.y] ? "+" : "-"))].join(","))}" aria-label="Prices">
    <div class="bar"><span class="lbl">${w.length ? "MY WATCHLIST" : "MARKETS"}</span><div class="items">${calm() ? bar.map(it).join("") : (() => {
        // the whole list scrolls like an exchange ticker; repeated so the loop has no gap
        const all = w.length ? [...w, ...m] : m, half = (all.length < 8 ? [...all, ...all] : all).map(it).join("");
        return `<div class="run" style="--dur:${Math.max(24, all.length * 5)}s">${half}<span class="dup" aria-hidden="true" style="display:contents">${half}</span></div>`;
      })()}</div>
      ${rest.length ? `<button class="tg" data-dock>${state.dockOpen ? "▼ Less" : w.length ? "▲ Markets" : "▲ More"}</button>` : ""}</div>
    <div class="more" style="grid-template-columns:repeat(${Math.max(1, Math.min(rest.length, 6))},minmax(0,1fr))">${rest.map(cell).join("")}</div></div>`;
}
// Show the › button and the fade only while some topics are hidden to the right
function setupFilterRow() {
  const track = app.querySelector(".filters .track");
  if (!track) return;
  const on = track.querySelector(".c.on");
  if (on && on.offsetLeft + on.offsetWidth > track.clientWidth) track.scrollLeft = on.offsetLeft - 40; // keep the chosen topic visible
  const sync = () => {
    track.parentElement.classList.toggle("more", track.scrollLeft + track.clientWidth < track.scrollWidth - 4);
    track.parentElement.classList.toggle("less", track.scrollLeft > 4); // ‹ button once you've scrolled right
  };
  track.onscroll = sync;
  sync();
}
addEventListener("resize", setupFilterRow);
const updateDock = () => {
  const strip = app.querySelector(".stripwrap");
  document.body.classList.toggle("docked", !!strip && strip.getBoundingClientRect().bottom < 69);
  fitSide();
};
addEventListener("scroll", updateDock, { passive: true });
// Right column: sticks under the header when it fits on screen. When it is taller than the screen,
// it scrolls with the page until its bottom (the calendar) is fully visible above the dock, then sticks there.
function fitSide() {
  const el = app.querySelector(".right, .sidecol");
  if (!el) return;
  const gap = document.body.classList.contains("docked") ? 100 : 24;
  el.style.top = `${Math.min(84, Math.round(innerHeight - el.offsetHeight - gap))}px`;
}
addEventListener("resize", fitSide);
const sideWatch = typeof ResizeObserver === "function" ? new ResizeObserver(() => fitSide()) : null;

// ---------- reading status, notes, events, mutes (design round 11: D briefing + B queue + C actions in A style) ----------
const CHK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const todayISO = () => new Date().toISOString().slice(0, 10);
const findStory = (id) => state.stories.find((x) => x.id === id) || state.more.get(id);
const stOf = (s) => state.status.get(s.id) || "";
const isNew = (s) => !stOf(s) && new Date(s.created_at) > state.since;
const isUpdated = (s) => s.updated_at && new Date(s.updated_at) - new Date(s.created_at) > 15 * 60e3 && new Date(s.updated_at) > state.since;
const inWatch = (s) => (s.tickers || []).some((t) => (state.settings.watchlist || []).includes(t));
// "Show less like this": hide stories only about muted topics (unless they're about your watchlist) or only from muted sources
function muted(s) {
  const mt = state.settings.muted_topics || [], ms = state.settings.muted_sources || [];
  const t = s.topics || [], o = s.outlets || [];
  if (!inWatch(s) && t.length && t.every((x) => mt.includes(x))) return true;
  return o.length > 0 && o.every((x) => ms.includes(x));
}
// Read-first order: impact, plus a bonus for your watchlist, coverage, then freshness
const prio = (s) => s.impact_score * 3 + (inWatch(s) ? 4 : 0) + Math.min(s.n_sources, 10) * 0.5 - hoursAgo(when(s)) / 12;
const mustReads = () => storiesFor("All").filter((s) => s.impact_score >= 7 && hoursAgo(s.created_at) <= 24);
const waitingMust = () => mustReads().filter((s) => !["done", "later"].includes(stOf(s))).sort((a, b) => prio(b) - prio(a));

async function loadReading() {
  const [st, nt, ev, ec, fo, er, ga, md] = await Promise.all([
    sb.from("story_status").select("story_id,status").limit(3000),
    sb.from("story_notes").select("story_id,note").limit(2000),
    sb.from("events").select("*").gte("day", todayISO()).order("day").limit(250),
    sb.from("econ_events").select("*").gte("at", new Date(Date.now() - 36 * 36e5).toISOString()).order("at").limit(300),
    sb.from("follows").select("kind,key,label"),
    sb.from("earnings_results").select("*").gte("seen_at", new Date(Date.now() - 8 * 864e5).toISOString()).limit(100),
    sb.from("market_gauges").select("*"),
    (state.settings.watchlist || []).length
      ? sb.from("stories").select("tickers,sentiment,created_at").gte("created_at", new Date(Date.now() - 14 * 864e5).toISOString()).overlaps("tickers", state.settings.watchlist).limit(1000)
      : Promise.resolve({ data: [] }),
  ]);
  state.ready005 = !st.error; // false until supabase/005_reading.sql has been run
  if (!st.error) state.status = new Map(st.data.map((r) => [r.story_id, r.status]));
  if (!nt.error) state.notes = new Map(nt.data.map((r) => [r.story_id, r.note]));
  if (!ev.error) state.events = ev.data || [];
  if (!ec.error) state.econ = ec.data || [];   // empty until supabase/011_econ_calendar.sql has been run
  // design round 34 (empty until supabase/012_follow_earnings_mood.sql has been run)
  state.ready012 = !fo.error;
  if (!fo.error) state.follows = new Set((fo.data || []).map((f) => `${f.kind}:${f.key}`));
  if (!er.error) state.earn = er.data || [];
  if (!ga.error) state.gauges = Object.fromEntries((ga.data || []).map((g) => [g.name, g]));
  if (!md.error) state.mood = md.data || [];
  loadCnn();
  // Visits: NEW = arrived since your previous visit (a visit = coming back after 30+ minutes away)
  const s = state.settings, now = new Date();
  if (state.ready005 && "last_visit_at" in s) {
    const last = s.last_visit_at ? new Date(s.last_visit_at) : null;
    let prev = s.prev_visit_at ? new Date(s.prev_visit_at) : null;
    const upd = { last_visit_at: now.toISOString() };
    if (!last || now - last > 30 * 60e3) { prev = last; upd.prev_visit_at = last ? last.toISOString() : null; }
    sb.from("user_settings").update(upd).eq("user_id", state.user.id).then(() => {});
    state.since = prev || new Date(Date.now() - 24 * 36e5);
  } else state.since = new Date(Date.now() - 24 * 36e5);
}

async function setStatus(id, status) {
  if (status) state.status.set(id, status); else state.status.delete(id);
  if (!state.ready005) return;
  const q = status
    ? sb.from("story_status").upsert({ user_id: state.user.id, story_id: id, status, updated_at: new Date().toISOString() }, { onConflict: "user_id,story_id" })
    : sb.from("story_status").delete().eq("story_id", id);
  const { error } = await q;
  if (error) console.warn("status not saved", error.message);
}

// Small round actions on each photo (A style): ✓ done, clock = later
const acts = (s) => `<button class="chk ${stOf(s) === "done" ? "on" : ""}" data-done="${s.id}" title="${stOf(s) === "done" ? "Mark as not done" : "Done"}" aria-label="Done">${CHK}</button>
  <button class="lat ${stOf(s) === "later" ? "on" : ""}" data-later="${s.id}" title="${stOf(s) === "later" ? "Remove from later" : "Read later"}" aria-label="Read later">${ICO.clock}</button>
  <button class="fol ${isFollowing("story", s.id) ? "on" : ""}" data-follow="story" data-fkey="${s.id}" data-flabel="${esc(s.headline)}" title="${isFollowing("story", s.id) ? "Stop following" : "Follow: Telegram tells you when it grows"}" aria-label="Follow">${ICO.bell}</button>`;
const stateCls = (s) => ({ seen: " seen", done: " done", later: " later" }[stOf(s)] || "");
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

// ---------- Forex Factory economic calendar (design round 32 B: box, C: "next up" strip) ----------
const ECONF = { hm: "High + Medium", h: "High only", usd: "USD only" };
const econFilter = () => (ECONF[lsGet("ic_econf")] ? lsGet("ic_econf") : "hm");
const untilTxt = (at) => {
  const m = Math.round((new Date(at) - Date.now()) / 6e4);
  if (m < 60) return `in ${Math.max(1, m)} min`;
  if (m < 24 * 60) return `in ${Math.round(m / 60)} h`;
  const x = new Date(at); return `${wkTxt(x)} ${hhmm(x)}`;
};
// One Forex Factory row: time · currency · impact · event · Actual · Forecast · Previous
function econRow(e, next) {
  const x = new Date(e.at), past = x < Date.now(), nx = e === next;
  const act = e.actual ? `<span class="n a ${resCls(e.result)}">${esc(e.actual)}</span>` : past && (e.forecast || e.previous) ? `<span class="n a">${ffLink(e, "↗")}</span>` : `<span class="n a wait">—</span>`;
  return `<div class="erow${past && !e.actual ? " past" : ""}${nx ? " next" : ""}"><span class="tm tnum">${hhmm(x)}</span><span class="cc">${esc(e.currency)}</span><i class="dot ${e.impact === "High" ? "H" : "M"}" title="${esc(e.impact)} impact"></i>
    <span class="et"><b>${esc(e.title)}</b>${nx ? `<em>NEXT · ${untilTxt(e.at)}</em>` : ""}</span>${act}<span class="n tnum">${esc(e.forecast || "")}</span><span class="n tnum">${esc(e.previous || "")}</span></div>`;
}
const econKeep = () => ({ hm: (e) => e.impact === "High" || e.impact === "Medium", h: (e) => e.impact === "High",
  usd: (e) => e.currency === "USD" && (e.impact === "High" || e.impact === "Medium") }[econFilter()]);
const econChips = () => `<div class="echips">${Object.entries(ECONF).map(([k, l]) => `<button class="${k === econFilter() ? "on" : ""}" data-econf="${k}">${l}</button>`).join("")}</div>`;
const econHead = `<div class="ehead"><span>TIME</span><span></span><span></span><span>EVENT</span><span>ACTUAL</span><span>FCST</span><span>PREV</span></div>`;
function econPanel() {
  const keep = econKeep(), t0 = today0(), now = Date.now();
  const today = (state.econ || []).filter((e) => isoDay(new Date(e.at)) === isoDay(t0) && keep(e)).sort((a, b) => (a.at < b.at ? -1 : 1));
  const next = (state.econ || []).filter((e) => keep(e) && new Date(e.at) >= now).sort((a, b) => (a.at < b.at ? -1 : 1))[0];
  const body = !state.econ.length ? `<p class="note" style="margin-top:10px">No calendar yet. It arrives with the robot's next run (every 3 hours).</p>`
    : today.length ? `<div class="eday today">TODAY · ${wkTxt(t0).toUpperCase()} ${t0.getDate()}</div>${econHead}${today.map((e) => econRow(e, next)).join("")}`
    : `<p class="note" style="margin-top:10px">Nothing today.${next ? ` Next: <b>${esc(next.currency)} ${esc(next.title)}</b>, ${wkTxt(new Date(next.at))} ${hhmm(new Date(next.at))}.` : ""}</p>`;
  return `<div class="calp econp a" data-ecal><div class="mh"><h2>Economic calendar</h2><a href="#/econ">Full calendar →</a></div>${body}
    <p class="esrc">Forex Factory · Bangkok time · Actual: US from FRED, others ↗ Forex Factory · green = better than forecast for that currency</p></div>`;
}
// ---------- Round 35: released results. US numbers from FRED (robot/econ_actuals.py); others link to Forex Factory ----------
const RES_TXT = { better: "BETTER THAN EXPECTED", worse: "WORSE THAN EXPECTED", inline: "AS EXPECTED" };
const RES_SHORT = { better: "BETTER", worse: "WORSE", inline: "AS EXPECTED" };
const resCls = (r) => ({ better: "good", worse: "bad", inline: "inl" }[r] || "");
const released = (e) => new Date(e.at) <= Date.now();
const ffLink = (e, txt = "Result ↗") => (e.url ? `<a class="ffl" href="${esc(e.url)}" target="_blank" rel="noopener" title="See the result on Forex Factory">${txt}</a>` : "—");
// A: "Just released" cards on My News: High/Medium events released in the last 6 hours (big card = the newest High one)
function econCards() {
  const list = (state.econ || []).filter((e) => (e.impact === "High" || e.impact === "Medium") && released(e) && hoursAgo(e.at) <= 6 && (e.forecast || e.previous || e.actual))
    .sort((a, b) => (a.impact === "High") - (b.impact === "High") || (a.at < b.at ? -1 : 1)).reverse();
  if (!list.length) return "";
  const [h, ...more] = list[0].impact === "High" ? list : [null, ...list];
  const big = h ? `<div class="ear eres ${resCls(h.result)}"><div class="hd"><span class="ccb">${esc(h.currency)}</span><div class="tt"><b>${esc(h.title)}</b>
      <small>Released ${hhmm(new Date(h.at))} · ${agoAt(h.at)} · High impact</small></div>${h.result ? `<span class="vd ${resCls(h.result)}">${RES_TXT[h.result]}</span>` : ""}</div>
      <div class="nums"><div><small>ACTUAL</small><b class="tnum ${resCls(h.result)}">${h.actual ? esc(h.actual) : ffLink(h)}</b></div><div><small>FORECAST</small><b class="tnum">${esc(h.forecast || "—")}</b></div><div><small>PREVIOUS</small><b class="tnum">${esc(h.previous || "—")}</b></div></div>
      <div class="ft">${h.actual ? "Actual: FRED (St. Louis Fed) · " : "The actual is on Forex Factory · "}Forecast and previous: Forex Factory${h.url ? ` · <a href="${esc(h.url)}" target="_blank" rel="noopener">Forex Factory page ↗</a>` : ""}</div></div>` : "";
  const small = more.slice(0, 4).map((e) => `<div class="ear2"><i class="dot ${e.impact === "High" ? "H" : "M"}"></i><b>${esc(e.currency)}</b><span>${esc(e.title)} · ${e.actual
      ? `<b class="${resCls(e.result)}">${esc(e.actual)}</b> vs ${esc(e.forecast || "—")}` : `F ${esc(e.forecast || "—")} · ${ffLink(e)}`}</span>${e.result ? `<span class="vd ${resCls(e.result)}">${RES_SHORT[e.result]}</span>` : ""}</div>`).join("");
  return `<div class="earns econres a${big ? "" : " only-small"}">${big}${small ? `<div class="ear2s">${small}</div>` : ""}</div>`;
}

// C: dark strip under the brief bar: the next high-impact release with a countdown, then the next two
function econStrip() {
  const now = Date.now(), up = (state.econ || []).filter((e) => new Date(e.at) >= now);
  const hi = up.filter((e) => e.impact === "High"), list = (hi.length >= 3 ? hi : [...hi, ...up.filter((e) => e.impact === "Medium")]
    .sort((a, b) => (a.at < b.at ? -1 : 1))).slice(0, 3);
  const out = (state.econ || []).filter((e) => e.impact === "High" && released(e) && hoursAgo(e.at) <= 2 && (e.forecast || e.previous || e.actual)).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  if (!list.length && !out) return "";
  const just = out ? `<div class="lab">JUST<br>OUT</div><div class="ei jout"><b><i class="dot H"></i>${esc(out.currency)} ${esc(out.title)}</b><small>${out.actual
      ? `<span class="${resCls(out.result) === "good" ? "g" : resCls(out.result) === "bad" ? "r" : ""}">${esc(out.actual)}</span> vs ${esc(out.forecast || "—")} forecast` : `F ${esc(out.forecast || "—")} · ${ffLink(out)}`} · ${agoAt(out.at)}</small></div>` : "";
  if (!list.length) return `<div class="estrip a">${just}</div>`;
  return `<div class="estrip a" data-sig="${esc((out ? out.at + (out.actual || "") : "") + list.map((e) => e.at + e.title + untilTxt(e.at)).join("|"))}">${just}<div class="lab${out ? " sep" : ""}">NEXT<br>UP</div>${list.slice(0, out ? 2 : 3).map((e, k) => {
    const x = new Date(e.at);
    return `<div class="ei${k === 0 ? " first" : ""}"><b><i class="dot ${e.impact === "High" ? "H" : "M"}"></i>${esc(e.currency)} ${esc(e.title)}</b>
      <small><span class="cd">${untilTxt(e.at)}</span>${k ? "" : ` · ${wkTxt(x)} ${hhmm(x)}`}${e.forecast ? ` · F ${esc(e.forecast)}` : ""}${e.previous ? ` · P ${esc(e.previous)}` : ""}</small></div>`;
  }).join("")}<a class="ff" href="https://www.forexfactory.com/calendar" target="_blank" rel="noopener" title="Open Forex Factory">↗</a></div>`;
}

// ---------- Follow (design round 34): stories on both pages + World places -> Telegram alerts (robot/follows.py) ----------
const isFollowing = (kind, key) => state.follows.has(`${kind}:${key}`);
async function toggleFollow(kind, key, label) {
  if (!state.ready012) return toast("Run supabase/012_follow_earnings_mood.sql in Supabase first");
  const id = `${kind}:${key}`, on = state.follows.has(id);
  if (on) state.follows.delete(id); else state.follows.add(id);
  render("soft");
  const q = on ? sb.from("follows").delete().eq("kind", kind).eq("key", key)
    : sb.from("follows").insert({ user_id: state.user.id, kind, key, label: (label || "").slice(0, 200) });
  const { error } = await q;
  if (error) { if (on) state.follows.add(id); else state.follows.delete(id); render("soft"); return toast("Could not save: " + error.message); }
  toast(on ? "Stopped following" : kind === "place" ? `Following ${key.split(":")[1]} · new World stories there go to Telegram` : "Following · Telegram tells you when it grows");
}
const followBtn = (kind, key, label) => `<button class="sbtn ${isFollowing(kind, key) ? "on-follow" : ""}" data-follow="${kind}" data-fkey="${esc(key)}" data-flabel="${esc(label)}">${ICO.bell}${isFollowing(kind, key) ? "Following" : "Follow"}</button>`;

// ---------- Market mood: Fear & Greed + your stocks' news mood ----------
// Stock Fear & Greed comes from CNN. CNN has no public API and blocks robots, so the robot doesn't fetch it:
// your browser asks CNN when you open My News (a normal visit, cached 30 min). If CNN says no, the box links to CNN instead.
async function loadCnn() {
  const c = safe(() => JSON.parse(sessionStorage.getItem("ic_cnnfg")), null);
  if (c && Date.now() - c.t < 30 * 6e4) { state.cnn = c.d; return; }
  try {
    const r = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const f = (await r.json()).fear_and_greed;
    const d = { score: f.score, rating: f.rating, prev_close: f.previous_close, week_ago: f.previous_1_week, month_ago: f.previous_1_month, year_ago: f.previous_1_year };
    state.cnn = d; safe(() => sessionStorage.setItem("ic_cnnfg", JSON.stringify({ t: Date.now(), d })));
  } catch { state.cnn = "fail"; }
  if (location.hash === "" || location.hash === "#/") render(false);
}
const FG_BANDS = [[25, "Extreme fear", "#dc2626"], [45, "Fear", "#f97316"], [55, "Neutral", "#a3a3a3"], [75, "Greed", "#65a30d"], [101, "Extreme greed", "#16a34a"]];
const fgBand = (v) => FG_BANDS.find(([mx]) => v < mx) || FG_BANDS[4];
function fgGauge(v) {   // half circle, 5 coloured bands, needle
  const pt = (a, r) => [60 + r * Math.cos(Math.PI * (1 - a / 100)), 62 - r * Math.sin(Math.PI * (1 - a / 100))];
  let from = 0;
  const arcs = FG_BANDS.map(([mx, , col]) => { const to = Math.min(mx, 100), [x1, y1] = pt(from + 0.6, 50), [x2, y2] = pt(to - 0.6, 50); from = to;
    return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} A50 50 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${col}"/>`; }).join("");
  const [nx, ny] = pt(Math.max(0, Math.min(100, v)), 40);
  return `<svg class="fgg" viewBox="0 0 120 70" aria-hidden="true"><g fill="none" stroke-width="10">${arcs}</g><line x1="60" y1="62" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}"/><circle cx="60" cy="62" r="4"/></svg>`;
}
function marketMood() {
  const c = state.cnn, k = state.gauges.crypto, w = state.settings.watchlist || [];
  const ago = (lbl, v) => (v === null || v === undefined ? "" : `<span>${lbl} <b class="tnum">${Math.round(v)}</b></span>`);
  const stocksPart = c && c !== "fail"
    ? `<div class="fgrow">${fgGauge(c.score)}<div class="fgv"><b class="tnum" style="color:${fgBand(c.score)[2]}">${Math.round(c.score)}</b><span>${esc(fgBand(c.score)[1])}</span><small>Stocks · CNN Fear &amp; Greed</small></div></div>
       <div class="fgago">${ago("Yesterday", c.prev_close)}${ago("1 week", c.week_ago)}${ago("1 month", c.month_ago)}${ago("1 year", c.year_ago)}</div>`
    : c === "fail" ? `<p class="note" style="margin:6px 0 0">CNN didn't answer from this browser. <a href="https://edition.cnn.com/markets/fear-and-greed" target="_blank" rel="noopener">See the stock Fear &amp; Greed on CNN ↗</a></p>`
    : `<p class="note" style="margin:6px 0 0">Loading CNN Fear &amp; Greed…</p>`;
  const cryptoPart = k ? `<div class="fgcr"><span>Crypto</span><b class="tnum" style="color:${fgBand(k.score)[2]}">${Math.round(k.score)}</b><em>${esc(k.rating)}</em>${k.week_ago !== null ? `<small>1 week ago ${Math.round(k.week_ago)}</small>` : ""}</div>` : "";
  // Stock mood: share of this week's stories the AI tagged Bullish / Bearish (Neutral + Mixed in the middle), vs the week before
  const wk = (t, from, to) => state.mood.filter((r) => (r.tickers || []).includes(t) && hoursAgo(r.created_at) >= from * 24 && hoursAgo(r.created_at) < to * 24);
  const sc = (l) => (l.filter((r) => r.sentiment === "Bullish").length - l.filter((r) => r.sentiment === "Bearish").length) / Math.max(1, l.length);
  const rows = w.slice(0, 8).map((t) => {
    const cur = wk(t, 0, 7), prev = wk(t, 7, 14), bu = cur.filter((r) => r.sentiment === "Bullish").length, be = cur.filter((r) => r.sentiment === "Bearish").length;
    if (cur.length < 3) return `<div class="smood few" data-stock="${esc(t)}"><b>${esc(t)}</b><span class="note" style="margin:0">not enough news (${cur.length})</span></div>`;
    const d = prev.length >= 3 ? sc(cur) - sc(prev) : null, pc = (n) => ((n / cur.length) * 100).toFixed(0);
    const tr = d === null ? `<small class="fl">new</small>` : d > 0.15 ? `<small class="up">▲ better</small>` : d < -0.15 ? `<small class="dn">▼ worse</small>` : `<small class="fl">— same</small>`;
    return `<div class="smood" data-stock="${esc(t)}" title="Show ${esc(t)} news"><b>${esc(t)}</b><div class="sbar"><i class="u" style="width:${pc(bu)}%"></i><i class="n" style="width:${pc(cur.length - bu - be)}%"></i><i class="d" style="width:${pc(be)}%"></i></div>${tr}
      <div class="ssub">${cur.length} stories · ${bu} bullish · ${be} bearish</div></div>`;
  }).join("");
  return `<div class="mmood a"><div class="mh"><h2>Market mood</h2></div>${stocksPart}${cryptoPart}
    ${w.length ? `<div class="mml">YOUR STOCKS · NEWS MOOD, 7 DAYS</div>${rows}<p class="note" style="margin:8px 0 0">AI's guess from story tone, not advice.</p>` : ""}</div>`;
}

// ---------- Earnings result cards (design round 34): watchlist companies that reported in the last 3 days ----------
const eps = (v) => (v === null || v === undefined ? "—" : Number(v).toFixed(2));
const earnVerdict = (r) => (r.surprise_pct === null || r.surprise_pct === undefined ? ["", ""] : Math.abs(r.surprise_pct) < 0.5 ? ["IN LINE", "inl"] : r.surprise_pct > 0 ? ["BEAT", "beat"] : ["MISS", "miss"]);
const qEnd = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
function earnCards() {
  const w = state.settings.watchlist || [];
  const list = (state.earn || []).filter((r) => w.includes(r.ticker) && hoursAgo(r.seen_at) <= 72).sort((a, b) => (a.seen_at < b.seen_at ? 1 : -1));
  if (!list.length) return "";
  const move = (r) => { const q = quotes[yahoo(r.ticker)]; return r.price_then && q ? ((q.price - r.price_then) / r.price_then) * 100 : null; };
  const pct = (v) => `${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}%`;
  const [h, ...more] = list, [vt, vc] = earnVerdict(h), mv = move(h), name = cleanName(state.settings.watch_names?.[h.ticker] || "") || h.ticker;
  return `<div class="earns a"><div class="ear" data-stock="${esc(h.ticker)}">
      <div class="hd">${evLogo({ sym: h.ticker }, 42)}<div class="tt"><b>${esc(name)} · results</b><small>Quarter ended ${qEnd(h.quarter_end)} · ${agoAt(h.seen_at)}</small></div>${vt ? `<span class="vd ${vc}">${vt}</span>` : ""}</div>
      <div class="nums"><div><small>EPS ACTUAL</small><b class="tnum">${eps(h.eps_actual)}</b></div><div><small>EXPECTED</small><b class="tnum">${eps(h.eps_estimate)}</b></div>
        <div><small>SURPRISE</small><b class="tnum ${vc}">${h.surprise_pct !== null ? pct(h.surprise_pct) : "—"}</b></div></div>
      <div class="ft">${h.revenue ? `Revenue ${esc(h.revenue)} (no revenue forecast in the free data) · ` : ""}${mv !== null ? `Stock since report: <b class="${mv >= 0 ? "up" : "down"}">${pct(mv)}</b> · ` : ""}Yahoo Finance</div></div>
    ${more.length ? `<div class="ear2s">${more.map((r) => { const [t, c] = earnVerdict(r); return `<div class="ear2" data-stock="${esc(r.ticker)}"><b>${esc(r.ticker)}</b><span>EPS ${eps(r.eps_actual)} vs ${eps(r.eps_estimate)}${r.surprise_pct !== null ? ` · <b class="${c}">${pct(r.surprise_pct)}</b>` : ""}</span>${t ? `<span class="vd ${c}">${t}</span>` : ""}</div>`; }).join("")}</div>` : ""}</div>`;
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

function viewEconCal() {
  const c = state.ecal, keep = econKeep(), ev = econEvents().filter((e) => keep(e.raw)), t0 = today0(), now = Date.now();
  const on = (d) => ev.filter((e) => e.day === d).sort((a, b) => (a.at < b.at ? -1 : 1));
  const st = addDays(monday(), c.wk * 35), cells = [...Array(35)].map((_, k) => addDays(st, k));
  const cell = (x) => {
    const d = isoDay(x), list = on(d);
    return `<div class="c ${x < t0 ? "o" : ""} ${d === isoDay(t0) ? "today" : ""} ${d === c.sel ? "sel" : ""} ${list.length ? "h-" + topLvl(list) : ""}" data-ecalsel="${d}">
      <span class="n">${x.getDate() === 1 ? monTxt(x) + " " : ""}${x.getDate()}</span>${list.slice(0, 6).map((e) => `<span class="pill ${e.i.lvl}">${evLogo(e.i, 18)}<span>${esc(e.raw.title)}</span></span>`).join("")}${list.length > 6 ? `<span class="more">+${list.length - 6} more</span>` : ""}</div>`;
  };
  const sd = dayOf(c.sel), raw = (state.econ || []).filter((e) => isoDay(new Date(e.at)) === c.sel && keep(e)).sort((a, b) => (a.at < b.at ? -1 : 1));
  const next = (state.econ || []).filter((e) => keep(e) && new Date(e.at) >= now).sort((a, b) => (a.at < b.at ? -1 : 1))[0];
  return `${header("news")}<div class="wrap calv">
    <a class="back a" href="#/">← Back to My News</a>
    <h1 class="ttl a">Economic calendar</h1>
    <p class="why a">Economic releases from Forex Factory (High and Medium impact), in Bangkok time. US actuals come from FRED; for others press ↗ to see the result on Forex Factory. Your stock dates are in the <a href="#/calendar">Stock calendar</a>.</p>
    ${econStrip()}
    ${econCards()}
    <div class="a" style="margin-top:14px">${econChips()}</div>
    <div class="calgrid a"><div>
      <div class="mtop"><h2>${cells[0].getDate()} ${monTxt(cells[0])} – ${cells[34].getDate()} ${monTxt(cells[34])} ${cells[34].getFullYear()}</h2>
        <button data-ecalwk="-1" ${c.wk <= 0 ? "disabled" : ""} aria-label="Earlier">‹</button><button data-ecalwk="1" ${c.wk >= 1 ? "disabled" : ""} aria-label="Later">›</button></div>
      <div class="big">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<div class="w">${d}</div>`).join("")}${cells.map(cell).join("")}</div>
      <div class="legend"><span class="heat"><i class="h0"></i><i class="h-mid"></i><i class="h-key"></i></span> quiet → Medium → High impact day</div>
    </div>
    <aside class="sidecol">${keyDates(ev, 4)}
      <div class="dayb econp"><h3>${wkTxt(sd)} ${sd.getDate()} ${monTxt(sd)}</h3><p class="note" style="margin:2px 0 8px">${daysTo(c.sel) >= 0 ? cdTxt(c.sel) : "past"}</p>
      ${raw.length ? econHead + raw.map((e) => econRow(e, next)).join("") : `<div class="it empty1"><p>No releases on this day.</p></div>`}</div></aside></div>
    <p class="note">Forex Factory publishes one week at a time: next week's events appear when the new week starts, and past weeks stay here for 90 days. Green = better than forecast for that currency (lower is better for unemployment and jobless claims).</p></div>`;
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

// One story at a time: big photo, key points, Later / Done · next
function openBriefing() {
  const ids = waitingMust().map((s) => s.id);
  if (!ids.length) return;
  state.briefing = { ids, i: 0, res: {} };
  drawBriefing();
}
function drawBriefing() {
  let ov = document.getElementById("brief-ov");
  if (!state.briefing) { ov?.remove(); return; }
  if (!ov) {
    ov = document.createElement("div"); ov.id = "brief-ov"; ov.className = "ov";
    ov.addEventListener("click", onBriefClick);
    document.body.appendChild(ov);
  }
  const b = state.briefing, s = b.world ? (state.world || []).find((x) => x.id === b.ids[b.i]) : findStory(b.ids[b.i]);
  const dots = b.ids.map((id, i) => `<i class="${b.res[id] === "done" ? "ok" : b.res[id] === "later" ? "lt" : i === b.i ? "on" : ""}"></i>`).join("");
  if (b.world) {   // World Brief: same deck, World stories ("Skip" instead of "Later": World only has seen / read)
    ov.innerHTML = !s
      ? `<div class="sheet"><div class="end">${mascotArt("caught-up", "mend") || '<div class="big">✓</div>'}<h2>You're caught up</h2>
          <p class="why">Today's top world stories are read. ${Math.max(0, (state.world || []).filter((x) => !x._old && !wSt(x.id)).length)} more are on World Brief when you have time.</p>
          <div class="act" style="justify-content:center"><button class="btn" data-bclose>Back to World Brief</button></div></div></div>`
      : `<div class="sheet slide" role="dialog" aria-label="World briefing"><div class="pic wbpic">${wPic(s)}</div><div class="body">
          <div class="meta wbmeta"><span class="wtags">${wTags(s)}</span> ${agoAt(when(s))} · ${esc(s.n_sources)} outlets</div>
          <h2>${esc(s.headline)}</h2><ul>${(s.summary || []).slice(0, 3).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
          ${s.why_matters ? `<p class="why">${esc(s.why_matters)}</p>` : ""}${s.thailand ? `<p class="why"><b>Thailand:</b> ${esc(s.thailand)}</p>` : ""}
          <div class="act"><div class="dots">${dots}</div><button class="linkbtn" data-bopen="${s.id}">Open full story</button>
            <button class="btn ghost" data-blater="${s.id}">Skip</button><button class="btn ok" data-bdone="${s.id}">✓ Read · next</button></div></div>
          <button class="x" data-bclose aria-label="Close">×</button>
          <div class="swhint mob-only"><span>← Skip</span><span>swipe</span><span>Read →</span></div></div>`;
    if (s && isPhone()) swipeCard(ov.querySelector(".sheet"), s.id);
    return;
  }
  ov.innerHTML = !s
    ? `<div class="sheet"><div class="end">${mascotArt("caught-up", "mend") || '<div class="big">✓</div>'}<h2>You're caught up</h2>
        <p class="why">${storiesFor("To read").length} other stories left for when you have time.</p>
        <div class="act" style="justify-content:center"><button class="btn" data-bclose>Back to My News</button></div></div></div>`
    : `<div class="sheet slide" role="dialog" aria-label="Briefing">${media(s, true)}<div class="body">
        <div class="meta">${metaTags(s)}${esc((s.topics || []).join(" · "))} · ${agoAt(when(s))} · ▲ ${srcs(s.n_sources)}</div>
        <h2>${esc(s.headline)}</h2><ul>${(s.summary || []).slice(0, 4).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        <p class="why">${esc(s.what_it_means)}</p>
        <div class="act"><div class="dots">${dots}</div><button class="linkbtn" data-bopen="${s.id}">Open full story</button>
          <button class="btn ghost" data-blater="${s.id}">Later</button><button class="btn ok" data-bdone="${s.id}">✓ Done · next</button></div></div>
        <button class="x" data-bclose aria-label="Close">×</button>
        <div class="swhint mob-only"><span>← Later</span><span>swipe</span><span>Done →</span></div></div>`;
  if (s && isPhone()) swipeCard(ov.querySelector(".sheet"), s.id);
}
// Phone briefing (design round 18, B's swipe deck): drag the card right = Done, left = Later.
function swipeCard(card, id) {
  if (!card) return;
  let x0 = null, y0 = 0, dx = 0, horiz = null;
  card.addEventListener("pointerdown", (e) => { if (e.target.closest("button,a")) return; x0 = e.clientX; y0 = e.clientY; dx = 0; horiz = null; });
  card.addEventListener("pointermove", (e) => {
    if (x0 === null) return;
    dx = e.clientX - x0;
    if (horiz === null && (Math.abs(dx) > 8 || Math.abs(e.clientY - y0) > 8)) horiz = Math.abs(dx) > Math.abs(e.clientY - y0);
    if (!horiz) return; // a vertical move scrolls the card's text instead
    card.style.transition = "none";
    card.style.transform = `translateX(${dx}px) rotate(${dx / 25}deg)`;
    card.dataset.dir = dx > 40 ? "done" : dx < -40 ? "later" : "";
  });
  const end = () => {
    if (x0 === null) return;
    x0 = null; card.style.transition = "transform .25s var(--ease)";
    if (horiz && Math.abs(dx) > 90) {
      card.style.transform = `translateX(${dx > 0 ? 120 : -120}vw) rotate(${dx > 0 ? 12 : -12}deg)`;
      const st = dx > 0 ? "done" : "later", b = state.briefing;
      setTimeout(() => { briefMark(id, st); b.res[id] = st; b.i++; drawBriefing(); }, 200);
    } else { card.style.transform = ""; card.dataset.dir = ""; }
  };
  card.addEventListener("pointerup", end);
  card.addEventListener("pointercancel", end);
}
// Done / Later from the deck: My News keeps "later"; World Brief has only seen / read, so Skip = seen
const briefMark = (id, st) => (state.briefing?.world ? setWorldStatus(id, st === "done" ? "done" : "seen") : setStatus(id, st));
function onBriefClick(e) {
  const el = e.target.closest("[data-bdone],[data-blater],[data-bopen],[data-bclose]");
  if (!el && e.target.id !== "brief-ov") return;
  const b = state.briefing;
  if (el?.dataset.bdone || el?.dataset.blater) {
    const id = el.dataset.bdone || el.dataset.blater, st = el.dataset.bdone ? "done" : "later";
    briefMark(id, st); b.res[id] = st; b.i++;
    return drawBriefing();
  }
  if (el?.dataset.bopen) { const id = el.dataset.bopen, w = b.world; state.briefing = null; drawBriefing(); location.hash = w ? `#/world/${id}` : `#/story/${id}`; return; }
  state.briefing = null; drawBriefing(); render(false); // close (× / button / click outside)
}

// Toast with Undo for Done / Later
let undoFn = null;
function toastUndo(text, fn) {
  undoFn = fn;
  toast(`${text} <span class="undo">Undo</span>`, null);
  const t = document.getElementById("toast");
  t.onclick = () => { t.classList.remove("show"); if (undoFn) { const f = undoFn; undoFn = null; f(); } };
}
// Done / Later from a card or the queue. In "To read" the card shrinks away first.
function changeStatus(id, wanted, rowSel) {
  const prev = state.status.get(id) || "";
  const next = prev === wanted ? "seen" : wanted;
  const go = () => { setStatus(id, next); render(false); };
  const leaving = next !== "seen" && (state.filter === "To read" || rowSel);
  const el = leaving && !calm() ? app.querySelector(rowSel || `.card[data-go="${CSS.escape(id)}"], .lead-wrap[data-id="${CSS.escape(id)}"]`) : null;
  if (el) { el.classList.add("out"); setTimeout(go, 320); } else go();
  if (next !== "seen") toastUndo(next === "done" ? "✓ Marked as read" : "Saved for later", () => { setStatus(id, prev || null); render(false); });
}

// Notes: your one-line takeaway, saved as you type
let noteTimer = null;
function saveNote(id, text) {
  clearTimeout(noteTimer);
  noteTimer = setTimeout(async () => {
    const t = text.trim().slice(0, 1000);
    if (t) state.notes.set(id, t); else state.notes.delete(id);
    const msg = document.getElementById("note-msg");
    if (!state.ready005) { if (msg) msg.textContent = "Notes need supabase/005_reading.sql first."; return; }
    const { error } = t
      ? await sb.from("story_notes").upsert({ user_id: state.user.id, story_id: id, note: t, updated_at: new Date().toISOString() }, { onConflict: "user_id,story_id" })
      : await sb.from("story_notes").delete().eq("story_id", id);
    if (msg) msg.textContent = error ? `Not saved: ${error.message}` : t ? "Saved ✓" : "Removed";
  }, 700);
}

// "Show less like this": mute a topic or a source
async function setMute(kind, value, on) {
  const key = kind === "topic" ? "muted_topics" : "muted_sources";
  const list = new Set(state.settings[key] || []);
  on ? list.add(value) : list.delete(value);
  state.settings[key] = [...list];
  if (!(key in state.settings) || !state.ready005) return toast("Hiding needs supabase/005_reading.sql first.");
  const { error } = await sb.from("user_settings").update({ [key]: state.settings[key] }).eq("user_id", state.user.id);
  if (error) return toast(`Not saved: ${esc(error.message)}`);
  if (on) toastUndo(`Hiding ${kind === "topic" ? "topic" : "source"}: ${esc(value)}`, () => setMute(kind, value, false).then(() => render(false)));
}

// Search across all saved stories (not just the last 3 days) and your notes
async function searchStories(q) {
  const term = q.replace(/[%_,().*"\\]/g, " ").trim();
  if (term.length < 2) return [];
  const like = `%${term}%`;
  const { data, error } = await sb.from("stories").select("*").or(`headline.ilike.${like},what_it_means.ilike.${like},event.ilike.${like}`)
    .order("created_at", { ascending: false }).limit(40);
  if (error) throw error;
  const found = new Map((data || []).map((s) => [s.id, s]));
  const noteIds = [...state.notes].filter(([, n]) => n.toLowerCase().includes(term.toLowerCase())).map(([id]) => id).filter((id) => !found.has(id));
  if (noteIds.length) {
    const r = await sb.from("stories").select("*").in("id", noteIds.slice(0, 30));
    (r.data || []).forEach((s) => found.set(s.id, s));
  }
  found.forEach((s, id) => state.more.set(id, s));
  // World Brief stories too (shown as their own group). Missing table before 008_world.sql = just no world results.
  const w = await sb.from("world_stories").select("*").or(`headline.ilike.${like},why_matters.ilike.${like},country.ilike.${like}`)
    .order("created_at", { ascending: false }).limit(20);
  state.searchWorld = w.error ? [] : w.data || [];
  if (state.searchWorld.length) {   // so a result opens even if it's older than the 2 days World Brief loads
    state.world = state.world || [];
    const have = new Set(state.world.map((x) => x.id));
    state.searchWorld.forEach((x) => { if (!have.has(x.id)) state.world.push({ ...x, _old: true }); });
  }
  return [...found.values()];
}

// ---------- Charts page (design rounds 36-42; style A = our site's look) ----------
// Home (#/charts): TradingView "Markets" style: categories with symbol chips + one big chart + top movers, big-stock heat map.
// Stock page (#/charts/NVDA): the chart fills the screen; Key facts, Financials, Technicals, Forecasts, Seasonals, News, Dates are tabs.
// Chart = KLineChart Pro 0.1.1 (open source) drawing our Yahoo candles (supabase/013_charts.sql). Its own top bar is hidden: we draw a
// TradingView-style bar, bottom range bar, indicators window + settings windows (Inputs / Style / Visibility), right-click menu, shortcuts.
// The right sidebar (watchlist + important dates) folds into an icon strip; the choice is kept on this device (ic_chside).
const CH_NAMES = { "^GSPC": "S&P 500", "^NDX": "Nasdaq 100", "^DJI": "Dow Jones", "^RUT": "Russell 2000", "^SET.BK": "SET", "^SET50.BK": "SET50", "THB=X": "USD/THB",
  "^N225": "Nikkei 225", "^HSI": "Hang Seng", "000001.SS": "Shanghai", "^KS11": "KOSPI", "^GDAXI": "DAX", "^FTSE": "FTSE 100", "^FCHI": "CAC 40", "^STOXX50E": "Euro Stoxx 50",
  "GC=F": "Gold", "CL=F": "Oil (WTI)", "SI=F": "Silver", "HG=F": "Copper", "NG=F": "Natural gas", "BTC-USD": "Bitcoin", "ETH-USD": "Ethereum", "SOL-USD": "Solana",
  "BNB-USD": "BNB", "XRP-USD": "XRP", "DX-Y.NYB": "Dollar index", "EURUSD=X": "EUR/USD", "JPY=X": "USD/JPY", "GBPUSD=X": "GBP/USD" };
const CH_BADGE = { "^GSPC": "SPX", "^NDX": "NDX", "^DJI": "DJI", "^RUT": "RUT", "^SET.BK": "SET", "^SET50.BK": "S50", "^N225": "N225", "^HSI": "HSI", "^GDAXI": "DAX", "^FTSE": "UKX",
  "000001.SS": "SSE", "^KS11": "KOS", "^FCHI": "CAC", "^STOXX50E": "SX5E", "GC=F": "Au", "CL=F": "OIL", "SI=F": "Ag", "HG=F": "Cu", "NG=F": "GAS", "BTC-USD": "₿", "ETH-USD": "Ξ",
  "SOL-USD": "SOL", "BNB-USD": "BNB", "XRP-USD": "XRP", "THB=X": "฿", "EURUSD=X": "€", "JPY=X": "¥", "GBPUSD=X": "£", "DX-Y.NYB": "DXY" };
const BIG = () => CFG.big || { US: [], Thailand: [] };
const bigAll = () => Object.values(BIG()).flat();
const CH_CATS = () => [
  ["Indices", ["^GSPC", "^NDX", "^DJI", "^RUT", "^SET.BK", "^SET50.BK", "^N225", "^HSI", "^GDAXI", "^FTSE"]],
  ["Thai stocks", BIG().Thailand || []], ["US stocks", BIG().US || []],
  ["Crypto", ["BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "XRP-USD"]],
  ["Commodities", ["GC=F", "CL=F", "SI=F", "HG=F", "NG=F"]],
  ["Forex", ["THB=X", "EURUSD=X", "JPY=X", "GBPUSD=X", "DX-Y.NYB"]]];
const CH_MKTS = Object.keys(CH_NAMES).map((y) => ["", y, CH_NAMES[y]]);   // every market symbol we price
// NYSE full-day closures (official rules; checked 2026-11-25). Thai holidays are not listed (no reliable free source yet).
const US_HOLIDAYS = [["2026-11-26", "Thanksgiving"], ["2026-12-25", "Christmas"], ["2027-01-01", "New Year's Day"], ["2027-01-18", "Martin Luther King Jr. Day"],
  ["2027-02-15", "Presidents' Day"], ["2027-03-26", "Good Friday"], ["2027-05-31", "Memorial Day"], ["2027-06-18", "Juneteenth (observed)"],
  ["2027-07-05", "Independence Day (observed)"], ["2027-09-06", "Labor Day"], ["2027-11-25", "Thanksgiving"], ["2027-12-24", "Christmas (observed)"]];
const chOf = () => state.ch || (state.ch = { sort: "move", stats: {}, draw: {}, statsAt: 0, sel: {}, rng: {}, mv: {}, cand: {}, pane: "chart", fin: "q", tf: "1D" });
const chName = (y) => CH_NAMES[y] || null;
const plainOf = (y) => cleanSym(String(y || "").toUpperCase());           // PTT.BK -> PTT (when the site knows it)
const chHref = (t) => `#/charts/${encodeURIComponent(t)}`;
const statsOf = (y) => chOf().stats[y]?.data || null;
const bigNum = (v, cur) => { if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—"; const a = Math.abs(v), s = cur === "THB" ? " ฿" : "";
  return (a >= 1e12 ? (v / 1e12).toFixed(2) + "T" : a >= 1e9 ? (v / 1e9).toFixed(1) + "B" : a >= 1e6 ? (v / 1e6).toFixed(1) + "M" : a >= 1e3 ? (v / 1e3).toFixed(1) + "K" : Number(v).toFixed(2)) + s; };
const pctN = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? "—" : `${(v * 100).toFixed(d)}%`);
const CHI = {   // thin line icons (same stroke style as the rest of the site)
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  fold: '<path d="m9 6 6 6-6 6"/>', open: '<path d="m15 6-6 6 6 6"/>', search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  cand: '<path d="M8 3v18M16 3v18"/><rect x="6" y="7" width="4" height="8"/><rect x="14" y="9" width="4" height="7"/>', fx: '<path d="m3 20 5-7 4 3 8-11"/><path d="M15 5h5v5"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>', redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  cam: '<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13" r="4"/><path d="m8 7 2-3h4l2 3"/>', full: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  grid: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="5" rx="1"/><rect x="13" y="10" width="8" height="11" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/>' };
const chI = (k, s = 18) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CHI[k]}</svg>`;
const isStockSym = (y) => /^[A-Z0-9.\-]{1,15}$/.test(y) && !/=|-USD$/.test(y);
const chLogo = (t, s = 30) => (isStockSym(yahoo(t)) ? evLogo({ sym: t }, s) : `<span class="lg txt chlg" style="--s:${s}px">${esc(CH_BADGE[t] || t.replace(/^\^/, "").slice(0, 3))}</span>`);

async function loadChartData(extra = []) {
  const ch = chOf(), w = (state.settings.watchlist || []).map(yahoo);
  const syms = [...new Set([...Object.keys(CH_NAMES), ...bigAll().map(yahoo), ...w, ...extra])];
  const parts = [];
  for (let i = 0; i < syms.length; i += 40) parts.push(syms.slice(i, i + 40));
  const res = await Promise.all(parts.map((p) => sb.rpc("get_quotes", { syms: p })));
  res.forEach(({ data }) => Object.assign(quotes, data || {}));
  if (Date.now() - ch.statsAt > 10 * 60e3 || extra.some((y) => !ch.stats[y])) {   // key stats change once a day
    const { data, error } = await sb.from("stock_stats").select("symbol,data,updated_at").in("symbol", [...new Set([...bigAll().map(yahoo), ...w, ...extra])]);
    ch.ready013 = !error;
    if (!error) { (data || []).forEach((r) => { ch.stats[r.symbol] = r; }); ch.statsAt = Date.now(); }
  }
  if ((location.hash || "").startsWith("#/charts")) render("soft");
}
// Candles for the small charts and the Technicals / Seasonals tabs (cached in the database 2 min - 6 h, here 2 min)
async function chCandles(y, rng, itv) {
  const ch = chOf(), k = `${y}|${rng}|${itv}`, c = ch.cand[k];
  if (c && (c.loading || Date.now() - c.at < 120e3)) return c.data;
  ch.cand[k] = { loading: true, data: c?.data || null, at: 0 };
  const { data } = await sb.rpc("get_candles", { sym: y, rng, itv });
  ch.cand[k] = { data: data || null, at: Date.now() };
  if ((location.hash || "").startsWith("#/charts")) render("soft");
  return data;
}
const candOf = (y, rng, itv) => { const c = chOf().cand[`${y}|${rng}|${itv}`]; if (!c) chCandles(y, rng, itv); return c?.data || null; };
const closes = (d) => (d?.c || []).map(Number).filter(Number.isFinite);

function chSearchBox(small) {
  return `<form class="chsearch${small ? " sm" : ""}" id="chsearch" role="search" autocomplete="off"><span>${chI("search", 16)}</span><input id="chq" type="search" maxlength="40"
    placeholder="${small ? esc(small) : "Search any stock, index, crypto or currency…  e.g. NVDA, PTT, gold, bitcoin"}" aria-label="Search a chart">${small ? "" : "<kbd>/</kbd>"}<div class="chres" id="chres" hidden></div></form>`;
}
let chSeq = 0, chTimer = null;
async function chSearch(q) {
  const seq = ++chSeq, box = document.getElementById("chres");
  if (!box) return;
  if (!q.trim()) { box.hidden = true; return; }
  box.hidden = false; box.innerHTML = `<div class="chr dim">Searching…</div>`;
  const { data } = await sb.rpc("search_symbols", { q: q.trim() });
  if (seq !== chSeq || !document.getElementById("chres")) return;
  const list = Array.isArray(data) ? data : [];
  document.getElementById("chres").innerHTML = list.length
    ? list.map((r, i) => `<a class="chr${i ? "" : " on"}" href="${chHref(plainOf(r.symbol))}">${evLogo({ sym: plainOf(r.symbol) }, 24)}<b>${esc(plainOf(r.symbol))}</b><small>${esc(cleanName(r.name))}</small><em>${esc(r.exchange)} · ${esc(typeName(r.type))}</em></a>`).join("")
    : `<div class="chr dim">No match. Try the company name or its ticker.</div>`;
}
const chPct = (y) => { const q = quotes[y]; return q && q.prev ? pctOf(q) : null; };

// ----- right sidebar: watchlist + important dates, folds into an icon strip -----
const sideKey = () => ((location.hash || "").startsWith("#/charts/") ? "ic_chside_st" : "ic_chside");   // stock pages start folded (round 43)
const sideOpen = () => { const v = safe(() => localStorage.getItem(sideKey()), null); return sideKey() === "ic_chside_st" ? v === "open" : v !== "closed"; };
function chWatch(cur) {
  const w = state.settings.watchlist || [];
  return `<div class="chc chwl"><div class="mh"><h2>My watchlist</h2><a href="#/settings">Edit</a></div>
    ${w.length ? `<div class="h"><span>SYMBOL</span><span class="n">LAST</span><span class="n">CHG%</span></div>${w.map((t) => `<a class="r${t === cur ? " on" : ""}" href="${chHref(t)}"><span class="wn">${evLogo({ sym: t }, 22)}<span><b>${esc(t)}</b><small>${esc(cleanName(state.settings.watch_names?.[t] || quotes[yahoo(t)]?.name || ""))}</small></span></span><span class="n">${pxSpan(yahoo(t))}</span><span class="n">${chSpan(yahoo(t))}</span></a>`).join("")}`
      : `<p class="note" style="margin:4px 14px 12px">Empty. Open any stock and press ☆ Watch.</p>`}</div>`;
}
// Important dates for the whole market: big-company results, your stocks, and US market holidays (next 30 days)
function chDates() {
  const t0 = isoDay(today0()), end = isoDay(addDays(today0(), 30)), w = state.settings.watchlist || [], big = bigAll(), mega = (BIG().US || []).slice(0, 8);
  const ev = (state.events || []).filter((e) => e.day >= t0 && e.day <= end && e.ticker && (big.includes(e.ticker) || w.includes(e.ticker)) && e.kind === "earnings")
    .map((e) => ({ day: e.day, title: e.title.replace(/ earnings$/, " results"), sub: `${e.estimate ? "Date estimated" : "Confirmed"}${w.includes(e.ticker) ? " · in your watchlist" : ""}`, key: mega.includes(e.ticker) || w.includes(e.ticker), href: chHref(e.ticker) }));
  const hol = US_HOLIDAYS.filter(([d]) => d >= t0 && d <= end).map(([d, n]) => ({ day: d, title: `US market closed · ${n}`, sub: "NYSE and Nasdaq shut", closed: true }));
  const list = [...ev, ...hol].sort((a, b) => (a.day < b.day ? -1 : 1)).slice(0, 8);
  const row = (e) => { const x = dayOf(e.day); return `<${e.href ? `a href="${e.href}"` : "div"} class="d"><span class="dt"><small>${monTxt(x).toUpperCase()}</small>${x.getDate()}</span><span><b>${esc(e.title)}</b><span>${esc(e.sub)}</span></span>${e.closed ? `<span class="chtag cl">CLOSED</span>` : e.key ? `<span class="chtag">KEY</span>` : ""}</${e.href ? "a" : "div"}>`; };
  return `<div class="chc chcal" id="chdates"><div class="mh"><h2>Important dates</h2><a href="#/calendar">Stock calendar →</a></div>
    ${list.length ? list.map(row).join("") : `<p class="note" style="margin:4px 14px 12px">Nothing in the next 30 days yet. Big-company dates arrive with the robot's daily check.</p>`}
    <p class="note chfoot">Biggest US and Thai companies + your stocks, next 30 days.</p></div>`;
}
function chSide(cur) {
  const open = sideOpen();
  return `<aside class="chside${open ? "" : " folded"}">${open ? `<div class="chpanel">${chWatch(cur)}${chDates()}</div>` : ""}
    <div class="chstrip"><button class="${open ? "on" : ""}" data-chside="wl" title="My watchlist">${chI("list", 20)}</button><button data-chside="cal" title="Important dates">${chI("cal", 20)}</button>
      <a href="#/settings" data-tab-alerts="1" title="Price alerts">${chI("bell", 20)}</a><hr><button data-chside="toggle" title="${open ? "Fold the sidebar" : "Open the sidebar"}">${chI(open ? "fold" : "open", 20)}</button></div></aside>`;
}
function chSideClick(k) {
  const open = sideOpen();
  if (k === "toggle" || !open) safe(() => localStorage.setItem(sideKey(), k === "toggle" && open ? "closed" : "open"));
  render(false);
  requestAnimationFrame(() => { kc.chart?.resize(); if (k === "cal") document.getElementById("chdates")?.scrollIntoView({ behavior: calm() ? "auto" : "smooth", block: "nearest" }); });
}

// ----- home: TradingView "Markets" style -----
const CH_RANGES = { "1D": ["1d", "5m"], "1M": ["1mo", "60m"], "3M": ["3mo", "1d"], "1Y": ["1y", "1d"], "5Y": ["5y", "1wk"], All: ["max", "1mo"] };
function areaSvg(d, w, h, rng) {
  const pts = (d?.t || []).map((t, i) => [t, d.c?.[i]]).filter((p) => typeof p[1] === "number");
  if (pts.length < 2) return "";
  const v = pts.map((p) => p[1]), mn = Math.min(...v), mx = Math.max(...v), pad = (mx - mn) * 0.08 || 1;
  const X = (i) => (i / (pts.length - 1)) * w, Y = (p) => 8 + ((mx + pad - p) / (mx - mn + 2 * pad)) * (h - 16);
  const up = v.at(-1) >= v[0], col = up ? "var(--up)" : "var(--down)";
  const path = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("");
  const id = "ga" + Math.random().toString(36).slice(2, 7);
  const ticks = [mx, (mx + mn) / 2, mn].map((p) => `<span style="top:${Y(p) - 7}px">${fmtPx(p)}</span>`).join("");
  return `<div class="charea"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".22"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
    <g style="color:${col}"><path d="${path}L${w},${h}L0,${h}Z" fill="url(#${id})"/><path d="${path}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></g></svg><div class="chax">${ticks}</div></div>`;
}
function chCat([k, list], idx) {
  const ch = chOf(), sel = ch.sel[k] && list.includes(ch.sel[k]) ? ch.sel[k] : list[0], rng = ch.rng[k] || "1D", y = yahoo(sel);
  if (!sel) return "";
  const [r, i] = CH_RANGES[rng], d = candOf(y, r, i);
  const nm = (t) => cleanName(chName(yahoo(t)) || statsOf(yahoo(t))?.name || quotes[yahoo(t)]?.name || t);
  const chip = (t) => `<button class="chchip${t === sel ? " on" : ""}" data-chsel="${esc(k)}|${esc(t)}">${chLogo(t, 30)}<span><b>${esc(isStockSym(yahoo(t)) ? t : nm(t))}</b><small>${pxSpan(yahoo(t))} ${chSpan(yahoo(t))}</small></span></button>`;
  const mvk = ch.mv[k] || "up", rows = list.map((t) => ({ t, p: chPct(yahoo(t)) })).filter((x) => x.p !== null).sort((a, b) => (mvk === "up" ? b.p - a.p : a.p - b.p)).slice(0, 5);
  const big = d ? (areaSvg(d, 1000, 270, rng) || `<div class="chempty">Yahoo has no chart history for ${esc(nm(sel))}. <a href="${esc(tvUrl(sel, y))}" target="_blank" rel="noopener">Open in TradingView ↗</a></div>`) : `<div class="chempty">Loading…</div>`;
  return `<section class="chcat a" id="cat-${idx}"><h3>${esc(k)} <a href="${chHref(sel)}">›</a></h3>
    <div class="chchips">${list.map(chip).join("")}</div>
    <div class="chcatb"><div class="chc chbig"><div class="chbh"><b>${esc(nm(sel))}</b><span>${pxSpan(y)} ${chSpan(y)}</span><a href="${chHref(sel)}">Open full chart →</a></div>${big}
      <div class="chrng">${Object.keys(CH_RANGES).map((x) => `<button class="${x === rng ? "on" : ""}" data-chrng="${esc(k)}|${x}">${x}</button>`).join("")}</div></div>
      <div class="chc chmov"><div class="mh"><h2>Top movers</h2></div><div class="chsort" style="padding:0 10px 8px">${[["up", "Gainers"], ["down", "Losers"]].map(([v, l]) => `<button class="${v === mvk ? "on" : ""}" data-chmv="${esc(k)}|${v}">${l}</button>`).join("")}</div>
        ${rows.map((x) => `<a class="r" href="${chHref(x.t)}"><span class="wn">${chLogo(x.t, 22)}<span><b>${esc(isStockSym(yahoo(x.t)) ? x.t : nm(x.t))}</b><small>${esc(isStockSym(yahoo(x.t)) ? nm(x.t) : "")}</small></span></span><span class="n">${pxSpan(yahoo(x.t))}</span><span class="n">${chSpan(yahoo(x.t))}</span></a>`).join("") || `<p class="note" style="margin:4px 14px 12px">Prices loading…</p>`}</div></div></section>`;
}
const HEAT_RGB = (v) => v === null ? "var(--chip)" : v >= 2 ? "#15803d" : v >= 0.5 ? "#22a35a" : v > 0.05 ? "#6cbf8a" : v >= -0.05 ? "#9ca3af" : v > -1 ? "#f08b8b" : v > -3 ? "#e05252" : "#b91c1c";
function chHeat() {
  const grp = Object.entries(BIG()).map(([label, list]) => {
    const rows = list.map((t) => ({ t, y: yahoo(t), cap: statsOf(yahoo(t))?.marketCap || 0 })).sort((a, b) => b.cap - a.cap);
    const big = label === "US" ? 4 : 2;
    return `<div class="g">${esc(label === "Thailand" ? "THAILAND · SET" : label.toUpperCase())}</div>` + rows.map((r, i) => {
      const v = chPct(r.y);
      return `<a class="${i < big ? "b2" : "s"}" href="${chHref(r.t)}" style="background:${HEAT_RGB(v)}" title="${esc(r.t)} ${v === null ? "" : v.toFixed(2) + "%"}">${esc(r.t)}<small>${v === null ? "…" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`}</small></a>`;
    }).join("");
  }).join("");
  return `<section class="chcat a" id="cat-heat"><h3>Heat map <a href="#/heatmap">›</a></h3><div class="chc chheat"><div class="mh"><h2>Big stocks · bigger tile = bigger company</h2><a href="#/heatmap">Full heat map →</a></div><div class="chhm">${grp}</div></div></section>`;
}
// ----- Charts home: "Stocks by market & industry" (round 47). Members of the S&P 500 + SET50 (from the heat map lists),
// filters you can combine (several markets x several industries) and sorts you can combine (1st, then 2nd for ties...) -----
const SCR_MK = [["@SP500", "US · S&P 500"], ["@SET50", "Thailand · SET50"]];
const SCR_SORT = { mkt: "Market", sec: "Industry", chg: "Biggest gain", chgdn: "Biggest loss", cap: "Company size", name: "Name A→Z" };
const scrOf = () => { const ch = chOf(); return ch.scr || (ch.scr = safe(() => JSON.parse(localStorage.getItem("ic_scr") || "null"), null) || { mk: [], sec: [], sort: ["sec", "chg"], lim: 30 }); };
const scrSave = () => { const { lim: _, ...x } = scrOf(); safe(() => localStorage.setItem("ic_scr", JSON.stringify(x))); };
async function loadScr() {   // member lists (once) + prices of the chosen markets (every 2 minutes while you look)
  const ch = chOf(); if (ch.scrLoading) return;
  ch.scrLoading = true;
  try {
    if (!ch.hm) { const { data, error } = await sb.from("stock_stats").select("symbol,data,updated_at").in("symbol", HM_IDX.map((x) => x[0])); ch.hm = {}; (data || []).forEach((r) => { ch.hm[r.symbol] = r.data; }); ch.hmErr = error?.message || null; }
    const f = scrOf(), keys = f.mk.length ? f.mk : SCR_MK.map((x) => x[0]), syms = [...new Set(keys.flatMap((k) => (ch.hm[k]?.members || []).map((m) => m.s)))];
    const parts = []; for (let i = 0; i < syms.length; i += 40) parts.push(syms.slice(i, i + 40));
    for (let i = 0; i < parts.length; i += 4) { const res = await Promise.all(parts.slice(i, i + 4).map((p) => sb.rpc("get_quotes", { syms: p }))); res.forEach(({ data }) => Object.assign(quotes, data || {})); }
    ch.scrAt = Date.now();
  } finally { ch.scrLoading = false; }
  if ((location.hash || "#/charts") === "#/charts") render("soft");
}
function chScreen() {
  const ch = chOf(), f = scrOf();
  if (!ch.scrLoading && Date.now() - (ch.scrAt || 0) > 120e3) setTimeout(loadScr, 0);
  const keys = f.mk.length ? f.mk : SCR_MK.map((x) => x[0]), mkName = Object.fromEntries(SCR_MK.map(([k, l]) => [k, l.split(" · ")[0]]));
  const all = keys.flatMap((k) => (ch.hm?.[k]?.members || []).map((m) => ({ ...m, mk: k })));
  const secs = [...new Set(all.map((m) => m.sec).filter(Boolean))].sort();
  const sel = f.sec.filter((x) => secs.includes(x)), rows = sel.length ? all.filter((m) => sel.includes(m.sec)) : all;
  const chg = (m) => chPct(m.s), num = (v, dflt) => (v === null || v === undefined || !Number.isFinite(v) ? dflt : v);
  const cmp = { mkt: (a, b) => mkName[a.mk].localeCompare(mkName[b.mk]), sec: (a, b) => String(a.sec).localeCompare(String(b.sec)), chg: (a, b) => num(chg(b), -1e9) - num(chg(a), -1e9),
    chgdn: (a, b) => num(chg(a), 1e9) - num(chg(b), 1e9), cap: (a, b) => (b.cap || 0) - (a.cap || 0), name: (a, b) => String(a.t).localeCompare(String(b.t)) };
  rows.sort((a, b) => { for (const k of f.sort) { const r = cmp[k]?.(a, b) || 0; if (r) return r; } return (b.cap || 0) - (a.cap || 0); });
  const shown = rows.slice(0, f.lim || 30), grp = f.sort[0] === "sec" || f.sort[0] === "mkt";
  const pill = (attr, v, on, label, n) => `<button class="scp${on ? " on" : ""}" data-${attr}="${esc(v)}">${n ? `<em>${n}</em>` : ""}${esc(label)}</button>`;
  let last = null;
  const body = !ch.hm ? `<div class="chempty">Loading the member lists…</div>` : !all.length ? `<div class="chempty">The member lists arrive with the robot's next daily run.</div>`
    : shown.map((m) => { const p = plainOf(m.s), v = chg(m), head = grp ? (f.sort[0] === "sec" ? m.sec : mkName[m.mk]) : null, hd = head && head !== last ? `<div class="g">${esc(head)}</div>` : ""; last = head;
      return `${hd}<a class="r" href="${chHref(p)}"><span class="nm">${evLogo({ sym: p }, 24)}<span><b>${esc(m.t)}</b><small>${esc(m.n || "")}</small></span></span><span>${esc(mkName[m.mk])}</span><span class="sec">${esc(m.sec || "—")}</span>
        <span class="n tnum">${quotes[m.s] ? fmtPx(quotes[m.s].price) : "…"}</span><span class="n tnum ${v === null ? "" : v >= 0 ? "up" : "down"}">${v === null ? "…" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`}</span><span class="n tnum">${m.cap ? bigNum(m.cap) : "—"}</span></a>`; }).join("");
  return `<section class="chcat a" id="cat-scr"><h3>Stocks by market &amp; industry</h3><div class="chc scr">
    <div class="scrf"><span class="lab">Market</span>${pill("scrmk", "*", !f.mk.length, "All")}${SCR_MK.map(([k, l]) => pill("scrmk", k, f.mk.includes(k), l)).join("")}</div>
    <div class="scrf"><span class="lab">Industry</span>${pill("scrsec", "*", !sel.length, "All")}${secs.map((x) => pill("scrsec", x, sel.includes(x), x)).join("")}</div>
    <div class="scrf"><span class="lab">Sort</span>${Object.entries(SCR_SORT).map(([k, l]) => { const i = f.sort.indexOf(k); return pill("scrsort", k, i >= 0, l, i >= 0 && f.sort.length > 1 ? i + 1 : ""); }).join("")}<span class="note" style="margin:0 0 0 6px">pick several: 1 first, then 2 for ties</span></div>
    <div class="scrt"><div class="h"><span>COMPANY</span><span>MARKET</span><span>INDUSTRY</span><span class="n">PRICE</span><span class="n">CHG %</span><span class="n">MKT CAP</span></div>${body}</div>
    <div class="scrb"><span class="note" style="margin:0">${shown.length} of ${rows.length} stocks${sel.length || f.mk.length ? " match" : ""} · prices refresh every 2 minutes</span>${rows.length > shown.length ? `<button class="scp" data-scrmore="1">Show 30 more</button>` : ""}</div></div></section>`;
}
function scrClick(el) {
  const f = scrOf();
  const tog = (arr, v) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); };
  if (el.dataset.scrmk) { if (el.dataset.scrmk === "*") f.mk = []; else tog(f.mk, el.dataset.scrmk); if (f.mk.length === SCR_MK.length) f.mk = []; chOf().scrAt = 0; }
  else if (el.dataset.scrsec) { if (el.dataset.scrsec === "*") f.sec = []; else tog(f.sec, el.dataset.scrsec); }
  else if (el.dataset.scrsort) { if (el.dataset.scrsort === "chg") f.sort = f.sort.filter((x) => x !== "chgdn"); if (el.dataset.scrsort === "chgdn") f.sort = f.sort.filter((x) => x !== "chg"); tog(f.sort, el.dataset.scrsort); if (!f.sort.length) f.sort = ["cap"]; }
  else if (el.dataset.scrmore) { f.lim = (f.lim || 30) + 30; }
  if (!el.dataset.scrmore) f.lim = 30;
  scrSave(); render(false);
}
function viewCharts() {
  const cats = CH_CATS();
  return `${header("charts")}<div class="wrap chp">
    ${chSearchBox()}
    <div class="chlay"><div class="chmain">
      <nav class="chcnav">${cats.map(([k], i) => `<a href="#/charts" data-chjump="cat-${i}">${esc(k)}</a>`).join("")}<a href="#/charts" data-chjump="cat-scr">Stocks by industry</a><a href="#/charts" data-chjump="cat-heat">Heat map</a><a class="hm" href="#/heatmap">${chI("grid", 16)} Stock heat map</a></nav>
      ${cats.map(chCat).join("")}${chScreen()}${chHeat()}
      <p class="note">Prices: Yahoo Finance, may be delayed (Thai stocks ~15 min). Click anything to open its chart.</p>
    </div>${chSide()}</div></div>`;
}

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
    <button data-kcact="ind" title="Indicators (Alt+I)">${chI("fx")} Indicators</button><button data-kcact="alertw" title="Create a price alert (Telegram)">${chI("bell", 16)} Alert</button><i></i><button data-kcact="undo" title="Undo (Ctrl+Z)">${chI("undo")}</button><button data-kcact="redo" title="Redo (Ctrl+Y)">${chI("redo")}</button>
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

// ----- the chart itself (loaded only when a stock page opens) -----
const KC_FILES = {
  css: ["https://cdn.jsdelivr.net/npm/@klinecharts/pro@0.1.1/dist/klinecharts-pro.css", "sha384-RoRVmKzlNPK7OcKOA5IAMaoUB0pO3CxZCULDD5ajKf6FEzDzXj0NN/AC18waF7I1"],
  core: ["https://cdn.jsdelivr.net/npm/klinecharts@9.8.12/dist/umd/klinecharts.min.js", "sha384-N0+OYSoH0p5B+LMHkqKVHtLag55VxhTNJBcpNtG3q7tLMfe7sRBr4z614UxQZOg8"],
  pro: ["https://cdn.jsdelivr.net/npm/@klinecharts/pro@0.1.1/dist/klinecharts-pro.umd.js", "sha384-Dvko2GFxD+nsobomJF4F6xR9HI0LF9zoIp7ZYZwiyuikBsZOISSdwR2sQ1/YJRqD"],
};
const kc = { pro: null, chart: null, box: null, sym: null, ov: new Map(), restoring: false, restoredFor: null, meta: null, metaFor: null, loaded: "", sub: null, saveT: null,
  period: 3, ctype: "candle_solid", range: null, pct: false, log: false, active: [], indFor: null, hist: [], redo: [], sel: null, lastPrice: null, pendingBars: 0 };
let kcLoading = null;
function kcLoad() {
  if (kcLoading) return kcLoading;
  const tag = (kind, [url, sri]) => new Promise((ok, bad) => {
    const el = document.createElement(kind === "css" ? "link" : "script");
    if (kind === "css") { el.rel = "stylesheet"; el.href = url; } else { el.src = url; el.async = false; }
    el.integrity = sri; el.crossOrigin = "anonymous"; el.referrerPolicy = "no-referrer";
    el.onload = ok; el.onerror = () => bad(new Error("Could not load the chart library"));
    document.head.appendChild(el);
  });
  kcLoading = Promise.all([tag("css", KC_FILES.css), tag("js", KC_FILES.core).then(() => {
    const k = window.klinecharts, init = k.init;   // catch the chart the Pro layer creates (drawings, indicators, events)
    k.init = (...a) => { const c = init(...a); kcHook(c); return c; };
    return tag("js", KC_FILES.pro);
  })]).then(() => { kcRegister(); kcRegisterTV(window.klinecharts); }).catch((e) => { kcLoading = null; throw e; });
  return kcLoading;
}
const KC_PERIODS = [{ multiplier: 5, timespan: "minute", text: "5m" }, { multiplier: 15, timespan: "minute", text: "15m" }, { multiplier: 1, timespan: "hour", text: "1H" },
  { multiplier: 1, timespan: "day", text: "D" }, { multiplier: 1, timespan: "week", text: "W" }, { multiplier: 1, timespan: "month", text: "M" },
  // round 44: TradingView's other timeframes (made by joining our 5m / 15m / 1h / 1-month candles)
  { multiplier: 10, timespan: "minute", text: "10m" }, { multiplier: 30, timespan: "minute", text: "30m" }, { multiplier: 45, timespan: "minute", text: "45m" },
  { multiplier: 2, timespan: "hour", text: "2H" }, { multiplier: 3, timespan: "hour", text: "3H" }, { multiplier: 4, timespan: "hour", text: "4H" },
  { multiplier: 3, timespan: "month", text: "3M" }, { multiplier: 6, timespan: "month", text: "6M" }, { multiplier: 12, timespan: "month", text: "12M" }];
// [Yahoo range, Yahoo interval, candles joined into one]. Daily + weekly = 10 years: Yahoo silently sends MONTHLY candles for range "max" (checked 2026-11-25)
const KC_RANGE = { minute5: ["1mo", "5m", 1], minute10: ["1mo", "5m", 2], minute15: ["1mo", "15m", 1], minute30: ["1mo", "15m", 2], minute45: ["1mo", "15m", 3],
  hour1: ["2y", "60m", 1], hour2: ["2y", "60m", 2], hour3: ["2y", "60m", 3], hour4: ["2y", "60m", 4], day1: ["10y", "1d", 1], week1: ["10y", "1wk", 1],
  month1: ["max", "1mo", 1], month3: ["max", "1mo", 3], month6: ["max", "1mo", 6], month12: ["max", "1mo", 12] };
const KC_TF_GROUPS = [["MINUTES", [0, 6, 1, 7, 8]], ["HOURS", [2, 9, 10, 11]], ["DAYS", [3]], ["WEEKS", [4]], ["MONTHS", [5, 12, 13, 14]]];
const KC_TF_NAME = (i) => { const p = KC_PERIODS[i]; return `${p.multiplier} ${p.timespan}${p.multiplier > 1 ? "s" : ""}`; };
const kcFavTf = () => safe(() => JSON.parse(localStorage.getItem("ic_kctf") || "null"), null) || [0, 1, 2, 11, 3, 4, 5];
function kcJoin(out, n, monthly, gmt) {   // join n candles into one: intraday within the same trading day, months by calendar
  if (n <= 1) return out;
  const res = []; let cur = null, key = null, cnt = 0;
  out.forEach((b) => {
    const d = new Date(b.timestamp + (gmt || 0) * 1000), k = monthly ? Math.floor((d.getUTCFullYear() * 12 + d.getUTCMonth()) / n) : `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    if (k !== key || (!monthly && cnt >= n)) { if (cur) res.push(cur); cur = { ...b }; key = k; cnt = 1; return; }
    cur.high = Math.max(cur.high, b.high); cur.low = Math.min(cur.low, b.low); cur.close = b.close; cur.volume += b.volume || 0; cnt++;
  });
  if (cur) res.push(cur);
  return res;
}
const kcDatafeed = {
  async searchSymbols(q) {
    const { data } = await sb.rpc("search_symbols", { q: String(q || "").trim() || "a" });
    return (Array.isArray(data) ? data : []).map((r) => ({ ticker: r.symbol, shortName: plainOf(r.symbol), name: cleanName(r.name), exchange: r.exchange, pricePrecision: 2, volumePrecision: 0 }));
  },
  async getHistoryKLineData(symbol, period) {
    const key = symbol.ticker + "|" + period.timespan + period.multiplier;
    if (kc.loaded === key) return [];           // asked for older bars: we already sent everything Yahoo has
    const [rng, itv, join] = KC_RANGE[period.timespan + period.multiplier] || ["max", "1d", 1];
    const [{ data, error }] = await Promise.all([sb.rpc("get_candles", { sym: symbol.ticker, rng, itv }), kc.drawP]);
    kc.loaded = key;
    if (error || !data) { kcNote(error && /get_candles/.test(error.message) ? "The chart needs supabase/013_charts.sql (run it once in Supabase)." : "Yahoo didn't send chart data. Try again in a minute."); return []; }
    if (data.meta) { kc.meta = data.meta; kc.metaFor = symbol.ticker; }
    const out = [];
    (data.t || []).forEach((ts, i) => { const o = data.o?.[i], h = data.h?.[i], l = data.l?.[i], c = data.c?.[i];
      if ([o, h, l, c].every((v) => typeof v === "number")) out.push({ timestamp: ts * 1000, open: o, high: h, low: l, close: c, volume: data.v?.[i] || 0 }); });
    if (join > 1) out.splice(0, out.length, ...kcJoin(out, join, period.timespan === "month", data.meta?.gmtoffset));
    kcNote(out.length < 2 ? `Yahoo has no chart history for ${esc(kc.sym)}. <a href="${esc(tvUrl(kc.sym, symbol.ticker))}" target="_blank" rel="noopener">Open it in TradingView ↗</a>` : "");
    if ((location.hash || "").startsWith("#/charts/")) setTimeout(() => render(false), 0);   // stats from the chart data (day range, 52 weeks)
    return out;
  },
  subscribe(symbol, period, cb) {   // keep the last candle live: our cached price, once a minute
    clearInterval(kc.sub);
    kc.sub = setInterval(async () => {
      if (document.hidden || !kc.chart || !(location.hash || "").startsWith("#/charts/")) return;
      const { data } = await sb.rpc("get_quotes", { syms: [symbol.ticker] });
      const p = Number(data?.[symbol.ticker]?.price), last = kc.chart.getDataList().at(-1);
      if (Number.isFinite(p) && last) cb({ ...last, close: p, high: Math.max(last.high, p), low: Math.min(last.low, p) });
    }, 60000);
  },
  unsubscribe() { clearInterval(kc.sub); },
};
function kcNote(html) {
  if (!kc.box) return;
  let n = kc.box.querySelector(".kcnote");
  if (!html) { n?.remove(); return; }
  if (!n) { n = document.createElement("div"); n.className = "kcnote"; kc.box.appendChild(n); }
  n.innerHTML = html;
}

// ----- your settings (one row "*" in chart_drawings): indicators, favourites, own defaults, Fibonacci + templates -----
// Starting values = what the user's TradingView uses (read 2026-11-25, see FEATURES.md).
const FIB_FOR_WAVE = { levels: [[0, "#ffffff", 1], [0.3333, "#ffffff", 1], [0.382, "#ffffff", 1], [0.5, "#F23645", 1], [0.618, "#F23645", 1], [0.786, "#F23645", 1], [0.887, "#ffffff", 1], [1, "#ffffff", 1],
  [1.618, "#ffffff", 1], [2.618, "#ffffff", 1], [0.236, "#F7525F", 0], [1.272, "#81C784", 0], [1.382, "#F23645", 0], [3.618, "#9C27B0", 0]],
  trend: { on: 1, color: "#ffffff", dash: 1 }, prices: 1, pct: 1, size: 12, bg: 0 };
const IND_DEF = {
  TV_MACD: { params: [12, 26, 9], ext: { src: "close", osc: "EMA", sig: "EMA", show: { hist: 1, macd: 1, signal: 1, zero: 1 }, col: { h0: "#26A69A", h1: "#B2DFDB", h2: "#FFCDD2", h3: "#FF5252", macd: "#2962FF", signal: "#FF6D00", zero: "#787B86" }, w: { macd: 1, signal: 1 } } },
  TV_RSI: { params: [14, 14, 2], ext: { src: "close", smooth: "SMA", bands: [70, 50, 30], show: { rsi: 1, ma: 1, bands: 1, fill: 1 }, col: { rsi: "#7E57C2", ma: "#F7C548", bands: "#787B86", fill: "#7E57C2" }, w: { rsi: 1, ma: 1 } } },
  TV_VOL: { params: [20], ext: { prev: 0, showMA: 0, col: { up: "#26A69A", dn: "#EF5350", ma: "#2962FF" } } },
  TV_CDC: { params: [12, 26], ext: { bars: 1, sig: 1 } }, TV_PVO: { params: [12, 26, 9], ext: {} }, TV_ZZ: { params: [5], ext: { labels: 1, color: "#2962FF", w: 2 } },
  TV_RSIDIV: { params: [14, 5, 5], ext: { hidden: 0 } },
  MA: { params: [20, 50, 200] }, EMA: { params: [9, 21] }, SMA: { params: [12, 2] }, BOLL: { params: [20, 2] }, SAR: { params: [2, 2, 20] }, KDJ: { params: [14, 3, 3] },
  CCI: { params: [20] }, WR: { params: [14] }, OBV: { params: [30] }, DMI: { params: [14, 6] }, ROC: { params: [12, 6] }, MTM: { params: [10, 10] }, AO: { params: [5, 34] }, BIAS: { params: [6, 12, 24] },
  TRIX: { params: [12, 9] }, PSY: { params: [12, 6] }, VR: { params: [26, 6] }, PVT: { params: [] }, AVP: { params: [] }, BBI: { params: [3, 6, 12, 24] }, BRAR: { params: [26] }, EMV: { params: [14, 9] }, CR: { params: [26, 10, 20, 40, 60] }, DMA: { params: [10, 50, 10] } };
const IND_NAME = { TV_MACD: "MACD", TV_RSI: "Relative Strength Index", TV_VOL: "Volume", TV_CDC: "CDC ActionZone V3 2020", TV_PVO: "Percentage Volume Oscillator", TV_ZZ: "Zig Zag", TV_RSIDIV: "RSI divergence", MA: "Moving Average", EMA: "Exponential Moving Average", SMA: "Smoothed Moving Average", BOLL: "Bollinger Bands",
  SAR: "Parabolic SAR", KDJ: "Stochastic (KDJ)", CCI: "Commodity Channel Index", WR: "Williams %R", OBV: "On Balance Volume", DMI: "Directional Movement (DMI)", ROC: "Rate of Change", MTM: "Momentum",
  AO: "Awesome Oscillator", BIAS: "Bias", TRIX: "TRIX", PSY: "Psychological Line", VR: "Volume Ratio", PVT: "Price Volume Trend", AVP: "Average Price", BBI: "Bull and Bear Index", BRAR: "BRAR", EMV: "Ease of Movement", CR: "Energy (CR)", DMA: "Different of Moving Average" };
const IND_CAT = { Trend: ["TV_CDC", "TV_ZZ", "MA", "EMA", "SMA", "BBI", "SAR", "DMI", "TRIX", "DMA", "AVP"], Momentum: ["TV_RSI", "TV_RSIDIV", "TV_MACD", "KDJ", "CCI", "WR", "MTM", "ROC", "AO", "BIAS", "PSY", "BRAR", "CR"], Volume: ["TV_VOL", "TV_PVO", "OBV", "PVT", "VR", "EMV"], Volatility: ["BOLL"] };
const IND_MAIN = ["MA", "EMA", "SMA", "BOLL", "SAR", "BBI", "AVP", "TV_CDC", "TV_ZZ"];
// labels for the Inputs tab, and on/off switches kept in ext
const IND_INPUTS = { TV_CDC: ["Fast EMA", "Slow EMA"], TV_PVO: ["Fast length", "Slow length", "Signal length"], TV_ZZ: ["Deviation (%): smallest move that counts as a new swing"], TV_RSIDIV: ["RSI length", "Pivot lookback left", "Pivot lookback right"] };
const IND_FLAGS = { TV_CDC: [["bars", "Colour the candles by zone"], ["sig", "Buy / Sell labels"]], TV_ZZ: [["labels", "Price and % labels"]], TV_RSIDIV: [["hidden", "Also hidden divergence"]] };
const IND_SOON = [["EMASS", "Tell me what it is"]];
const clone = (o) => JSON.parse(JSON.stringify(o));
function prefs() {
  const ch = chOf();
  let p = ch.prefs;
  if (!p || !Array.isArray(p.list)) p = ch.prefs = { list: [{ name: "TV_VOL", ...clone(IND_DEF.TV_VOL) }, { name: "TV_MACD", ...clone(IND_DEF.TV_MACD) }],
    fav: ["TV_MACD", "SAR", "TV_RSI", "KDJ", "TV_VOL"], def: {}, fib: clone(FIB_FOR_WAVE), fibT: { "FOR WAVE": clone(FIB_FOR_WAVE) }, hide: {} };
  p.def ||= {}; p.fav ||= [];
  if (!p.fav47) { p.fav47 = 1; ["TV_CDC", "TV_PVO", "TV_ZZ", "TV_RSIDIV"].forEach((n) => { if (!p.fav.includes(n)) p.fav.push(n); }); }   // your TradingView favourites, now built p.fib ||= clone(FIB_FOR_WAVE); p.fibT ||= { "FOR WAVE": clone(FIB_FOR_WAVE) }; p.hide ||= {};
  return p;
}
let kcPrefT = null;
function kcSavePrefs() {
  setTimeout(ktTree, 0);
  clearTimeout(kcPrefT);
  kcPrefT = setTimeout(() => sb.from("chart_drawings").upsert({ user_id: state.user.id, symbol: "*", indicators: prefs(), updated_at: new Date().toISOString() }, { onConflict: "user_id,symbol" })
    .then(({ error }) => { if (error) toast(`Chart settings not saved: ${esc(error.message)}`); }), 600);
}

// ----- custom indicators that work like TradingView's (registered once) -----
const srcOf = (k, s) => (s === "open" ? k.open : s === "high" ? k.high : s === "low" ? k.low : s === "hl2" ? (k.high + k.low) / 2 : s === "hlc3" ? (k.high + k.low + k.close) / 3 : s === "ohlc4" ? (k.open + k.high + k.low + k.close) / 4 : k.close);
const maBy = (t, a, n) => (t === "SMA" ? sma(a, n) : t === "RMA" ? rma(a, n) : t === "WMA" ? wma(a, n) : ema(a, n));
// price tag on the right price scale, filled with the drawing's colour (text dark or white, whichever reads better)
const ktInk = (hex) => { const h = String(hex || "").replace("#", ""); if (h.length < 6) return "#fff"; const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#131722" : "#fff"; };
const ktAxisTag = (y, price, color, precision) => ({ type: "text", ignoreEvent: true, attrs: { x: 0, y, text: Number(price).toFixed(precision?.price ?? 2), align: "left", baseline: "middle" },
  styles: { style: "fill", color: ktInk(color), size: 11.5, family: "Inter, sans-serif", weight: 700, backgroundColor: color, borderColor: color, borderSize: 1, borderRadius: 2, paddingLeft: 4, paddingRight: 4, paddingTop: 3, paddingBottom: 3 } });
function kcRegister() {
  const K = window.klinecharts;
  const tip = ({ indicator, defaultStyles }) => {   // name + inputs, then hide · settings · remove (our ids, so Pro's own handler ignores them)
    const ic = defaultStyles.tooltip.icons || [], mk = (i, id) => (ic[i] ? { ...ic[i], id } : null);
    const icons = [indicator.visible ? mk(1, "ic_hide") : mk(0, "ic_show"), mk(2, "ic_set"), mk(3, "ic_del")].filter(Boolean);
    return { name: indicator.shortName, calcParamsText: indicator.calcParams.length ? ` ${indicator.calcParams.join(" ")}` : "", icons, values: null };
  };
  K.registerIndicator({
    name: "TV_MACD", shortName: "MACD", calcParams: [12, 26, 9], precision: 2, extendData: clone(IND_DEF.TV_MACD.ext),
    figures: [
      { key: "hist", title: "Hist: ", type: "bar", baseValue: 0, styles: (d, ind) => { const c = ind.extendData.col, v = d.current?.indicatorData?.hist, p = d.prev?.indicatorData?.hist; if (v === undefined) return {};
        const col = v >= 0 ? (p === undefined || v >= p ? c.h0 : c.h1) : (p === undefined || v > p ? c.h2 : c.h3); return { style: "fill", color: col, borderColor: col }; } },
      { key: "macd", title: "MACD: ", type: "line" }, { key: "signal", title: "Signal: ", type: "line" }],
    calc: (list, ind) => {
      const [f, s, g] = ind.calcParams, x = ind.extendData, a = list.map((k) => srcOf(k, x.src));
      const fa = maBy(x.osc, a, f), sa = maBy(x.osc, a, s), m = fa.map((v, i) => (v === null || sa[i] === null ? null : v - sa[i]));
      const sg0 = maBy(x.sig, m.map((v) => v ?? 0), g), first = m.findIndex((v) => v !== null), sg = sg0.map((v, i) => (i < first + g - 1 ? null : v));
      return m.map((v, i) => { const o = {}; if (v === null) return o; if (x.show.macd) o.macd = v; if (sg[i] !== null) { if (x.show.signal) o.signal = sg[i]; if (x.show.hist) o.hist = v - sg[i]; } return o; });
    },
    draw: ({ ctx, indicator, bounding, yAxis }) => { const x = indicator.extendData; if (x.show.zero) { const y = yAxis.convertToPixel(0); ctx.save(); ctx.strokeStyle = x.col.zero; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(bounding.width, y); ctx.stroke(); ctx.restore(); } return false; },
    createTooltipDataSource: tip,
  });
  K.registerIndicator({
    name: "TV_RSI", shortName: "RSI", calcParams: [14, 14, 2], precision: 2, minValue: 0, maxValue: 100, extendData: clone(IND_DEF.TV_RSI.ext),
    figures: [{ key: "rsi", title: "RSI: ", type: "line" }, { key: "ma", title: "MA: ", type: "line" }, { key: "bbu", title: "BB+: ", type: "line" }, { key: "bbl", title: "BB−: ", type: "line" }],
    calc: (list, ind) => {
      const [n, sn, sd] = ind.calcParams, x = ind.extendData, r = rsiOf(list.map((k) => srcOf(k, x.src)), n);
      const smt = x.smooth === "None" ? [] : maBy(x.smooth === "SMA + Bollinger Bands" ? "SMA" : x.smooth, r.map((v) => v ?? 50), sn);
      return r.map((v, i) => { const o = {}; if (v === null) return o; if (x.show.rsi) o.rsi = v; if (smt[i] !== null && smt[i] !== undefined && i >= n + sn && x.show.ma) { o.ma = smt[i];
        if (x.smooth === "SMA + Bollinger Bands") { const w = r.slice(i - sn + 1, i + 1), mean = smt[i], sdv = Math.sqrt(w.reduce((a, z) => a + (z - mean) ** 2, 0) / sn); o.bbu = mean + sd * sdv; o.bbl = mean - sd * sdv; } } return o; });
    },
    draw: ({ ctx, indicator, bounding, yAxis }) => {
      const x = indicator.extendData, [u, mid, lo] = x.bands, yu = yAxis.convertToPixel(u), yl = yAxis.convertToPixel(lo), ym = yAxis.convertToPixel(mid);
      ctx.save();
      if (x.show.fill) { ctx.globalAlpha = 0.1; ctx.fillStyle = x.col.fill; ctx.fillRect(0, yu, bounding.width, yl - yu); ctx.globalAlpha = 1; }
      if (x.show.bands) { ctx.strokeStyle = x.col.bands; [[yu, [4, 4]], [ym, [1, 4]], [yl, [4, 4]]].forEach(([y, d]) => { ctx.setLineDash(d); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(bounding.width, y); ctx.stroke(); }); }
      ctx.restore(); return false;
    },
    createTooltipDataSource: tip,
  });
  K.registerIndicator({
    // Volume like TradingView: bars along the bottom of the price chart (bottom 20%, own scale), not a separate panel.
    // No figures -> the volume numbers never stretch the price scale; we draw the bars ourselves.
    name: "TV_VOL", shortName: "Vol", calcParams: [20], precision: 0, extendData: clone(IND_DEF.TV_VOL.ext), figures: [],
    calc: (list, ind) => { const v = list.map((k) => k.volume || 0), m = sma(v, ind.calcParams[0] || 20); return v.map((x, i) => ({ vol: x, ma: m[i] })); },
    draw: ({ ctx, kLineDataList, indicator, visibleRange, bounding, barSpace, xAxis }) => {
      const x = indicator.extendData, res = indicator.result || [], H = bounding.height * 0.2, base = bounding.height;
      let mx = 0; for (let i = visibleRange.from; i < visibleRange.to; i++) mx = Math.max(mx, res[i]?.vol || 0);
      if (!mx) return true;
      const w = Math.max(1, barSpace.gapBar), pts = [];
      for (let i = visibleRange.from; i < visibleRange.to; i++) {
        const k = kLineDataList[i], p = kLineDataList[i - 1], v = res[i]?.vol || 0; if (!k) continue;
        const up = x.prev && p ? k.close >= p.close : k.close >= k.open, cx = xAxis.convertToPixel(i), h = (v / mx) * H;
        ctx.fillStyle = (up ? x.col.up : x.col.dn) + "80"; ctx.fillRect(cx - w / 2, base - h, w, h);
        if (x.showMA && res[i]?.ma !== null && res[i]?.ma !== undefined) pts.push([cx, base - (res[i].ma / mx) * H]);
      }
      if (pts.length > 1) { ctx.strokeStyle = x.col.ma; ctx.lineWidth = 1; ctx.beginPath(); pts.forEach(([a, b], j) => (j ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.stroke(); }
      return true;
    },
    createTooltipDataSource: (d) => {
      const t = tip(d), i = d.crosshair?.dataIndex ?? (d.indicator.result || []).length - 1, r = d.indicator.result?.[i], x = d.indicator.extendData;
      const k = d.kLineDataList[i], p = d.kLineDataList[i - 1], up = k && (x.prev && p ? k.close >= p.close : k.close >= k.open);
      const vals = r ? [{ title: { text: "", color: "#888" }, value: { text: Number(r.vol || 0).toLocaleString("en-US"), color: up ? x.col.up : x.col.dn } }] : [];
      if (r && x.showMA && r.ma !== null && r.ma !== undefined) vals.push({ title: { text: "MA: ", color: "#888" }, value: { text: Math.round(r.ma).toLocaleString("en-US"), color: x.col.ma } });
      return { ...t, values: vals };
    },
  });
  // ===== round 47: CDC ActionZone V3, Percentage Volume Oscillator, Zig Zag, RSI divergence =====
  const LBL = (ctx, x, y, text, bg, fg = "#fff", up = true) => {   // small rounded label with an arrow tip
    ctx.font = "700 11px Inter, sans-serif"; const w = ctx.measureText(text).width + 10, h = 17, yy = up ? y - h - 5 : y + 5;
    ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, yy, w, h, 3) : ctx.rect(x - w / 2, yy, w, h); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 4, up ? yy + h : yy); ctx.lineTo(x + 4, up ? yy + h : yy); ctx.lineTo(x, up ? yy + h + 4 : yy - 4); ctx.fill();
    ctx.fillStyle = fg; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, x, yy + h / 2 + 0.5);
  };
  // CDC ActionZone V3 2020 (piriya33): AP = EMA(OHLC4, 2); Fast = EMA(AP, 12); Slow = EMA(AP, 26); zone colours + Buy / Sell on the cross
  K.registerIndicator({
    name: "TV_CDC", shortName: "CDC ActionZone", calcParams: [12, 26], precision: 2, extendData: clone(IND_DEF.TV_CDC.ext),
    figures: [{ key: "fast", title: "Fast: ", type: "line" }, { key: "slow", title: "Slow: ", type: "line" }],
    styles: { lines: [LN("#FF5252", 1), LN("#2962FF", 1)] },
    calc: (list, ind) => {
      const src = list.map((k) => (k.open + k.high + k.low + k.close) / 4), ap = ema(src, 2).map((v, i) => v ?? src[i]), f = ema(ap, ind.calcParams[0]), s = ema(ap, ind.calcParams[1]);
      return list.map((_, i) => {
        if (f[i] === null || s[i] === null || ap[i] === null) return {};
        const bull = f[i] > s[i], p = ap[i], zone = bull ? (p > f[i] ? "g" : p > s[i] ? "y" : "o") : (p < f[i] ? "r" : p < s[i] ? "b" : "lb");
        const pb = i && f[i - 1] !== null && s[i - 1] !== null ? f[i - 1] > s[i - 1] : bull;
        return { fast: f[i], slow: s[i], zone, bull, sig: bull && !pb ? "buy" : !bull && pb ? "sell" : null };
      });
    },
    draw: ({ ctx, kLineDataList, indicator, visibleRange, barSpace, xAxis, yAxis }) => {
      const x = indicator.extendData, res = indicator.result || [], Z = { g: "#00C853", y: "#FFD600", o: "#FF9100", r: "#FF1744", b: "#2962FF", lb: "#00B8D4" };
      for (let i = Math.max(1, visibleRange.from); i < visibleRange.to; i++) {   // shade between the lines: green = bullish, red = bearish
        const a = res[i - 1], b = res[i]; if (!a?.fast || !b?.fast) continue;
        const x0 = xAxis.convertToPixel(i - 1), x1 = xAxis.convertToPixel(i);
        ctx.fillStyle = b.bull ? "rgba(0,200,83,0.12)" : "rgba(255,23,68,0.12)";
        ctx.beginPath(); ctx.moveTo(x0, yAxis.convertToPixel(a.fast)); ctx.lineTo(x1, yAxis.convertToPixel(b.fast)); ctx.lineTo(x1, yAxis.convertToPixel(b.slow)); ctx.lineTo(x0, yAxis.convertToPixel(a.slow)); ctx.closePath(); ctx.fill();
      }
      const w = Math.max(1, barSpace.gapBar), hw = w / 2;
      for (let i = visibleRange.from; i < visibleRange.to; i++) {
        const k = kLineDataList[i], r = res[i]; if (!k || !r?.zone) continue;
        const cx = xAxis.convertToPixel(i);
        if (x.bars) {   // colour the candles by zone, like the script's barcolor()
          const c = Z[r.zone], yo = yAxis.convertToPixel(k.open), yc = yAxis.convertToPixel(k.close);
          ctx.fillStyle = c; ctx.fillRect(cx - 0.5, yAxis.convertToPixel(k.high), 1, yAxis.convertToPixel(k.low) - yAxis.convertToPixel(k.high));
          ctx.fillRect(cx - hw, Math.min(yo, yc), w, Math.max(1, Math.abs(yc - yo)));
        }
        if (x.sig && r.sig) r.sig === "buy" ? LBL(ctx, cx, yAxis.convertToPixel(k.low), "Buy", "#00C853", "#fff", false) : LBL(ctx, cx, yAxis.convertToPixel(k.high), "Sell", "#FF1744", "#fff", true);
      }
      return false;
    },
    createTooltipDataSource: tip,
  });
  // Percentage Volume Oscillator: (EMA(vol, fast) - EMA(vol, slow)) / EMA(vol, slow) x 100, signal EMA, histogram
  K.registerIndicator({
    name: "TV_PVO", shortName: "PVO", calcParams: [12, 26, 9], precision: 2, extendData: clone(IND_DEF.TV_PVO.ext),
    figures: [{ key: "hist", title: "Hist: ", type: "bar", baseValue: 0, styles: (d) => { const v = d.current?.indicatorData?.hist, p = d.prev?.indicatorData?.hist; if (v === undefined) return {};
        const c = v >= 0 ? (p !== undefined && v < p ? "#B2DFDB" : "#26A69A") : (p !== undefined && v > p ? "#FFCDD2" : "#FF5252"); return { style: "fill", color: c, borderColor: c }; } },
      { key: "pvo", title: "PVO: ", type: "line" }, { key: "sig", title: "Signal: ", type: "line" }],
    styles: { lines: [LN("#2962FF", 1), LN("#FF6D00", 1)] },
    calc: (list, ind) => {
      const [f, s, g] = ind.calcParams, v = list.map((k) => k.volume || 0), ef = ema(v, f), es = ema(v, s);
      const pvo = v.map((_, i) => (ef[i] !== null && es[i] ? ((ef[i] - es[i]) / es[i]) * 100 : null)), first = pvo.findIndex((x) => x !== null);
      const sg = first < 0 ? [] : [...Array(first).fill(null), ...ema(pvo.slice(first), g)];
      return v.map((_, i) => (pvo[i] === null ? {} : { pvo: pvo[i], ...(sg[i] !== null && sg[i] !== undefined ? { sig: sg[i], hist: pvo[i] - sg[i] } : {}) }));
    },
    createTooltipDataSource: tip,
  });
  // Zig Zag: joins swing highs and lows that are at least "deviation %" apart and "depth" bars apart; labels price + % move
  const zigzag = (list, dev) => {   // dev = 0.05 for 5%: a swing ends when price turns back by that much
    const piv = []; if (!list.length) return { piv, last: [0, 0] };
    let dir = 0, hi = list[0].high, hiI = 0, lo = list[0].low, loI = 0;
    for (let i = 1; i < list.length; i++) {
      const k = list[i];
      if (dir === 0) {
        if (k.high > hi) { hi = k.high; hiI = i; } if (k.low < lo) { lo = k.low; loI = i; }
        if (hi >= lo * (1 + dev)) { if (hiI > loI) { piv.push([loI, lo]); dir = 1; } else { piv.push([hiI, hi]); dir = -1; } }
        continue;
      }
      if (dir === 1) { if (k.high >= hi) { hi = k.high; hiI = i; } else if (k.low <= hi * (1 - dev)) { piv.push([hiI, hi]); dir = -1; lo = k.low; loI = i; } }
      else { if (k.low <= lo) { lo = k.low; loI = i; } else if (k.high >= lo * (1 + dev)) { piv.push([loI, lo]); dir = 1; hi = k.high; hiI = i; } }
    }
    return { piv, last: dir === 1 ? [hiI, hi] : [loI, lo] };
  };
  K.registerIndicator({
    name: "TV_ZZ", shortName: "Zig Zag", calcParams: [5], precision: 2, extendData: clone(IND_DEF.TV_ZZ.ext), figures: [],
    calc: (list, ind) => { const z = zigzag(list, (ind.calcParams[0] || 5) / 100); ind.extendData._z = z; return list.map(() => ({})); },
    draw: ({ ctx, indicator, visibleRange, xAxis, yAxis }) => {
      const x = indicator.extendData, z = x._z; if (!z) return true;
      const pts = [...z.piv, z.last], col = x.color || "#2962FF";
      ctx.strokeStyle = col; ctx.lineWidth = x.w || 2; ctx.beginPath();
      let started = false;
      pts.forEach(([i, v], j) => { if (j && pts[j - 1][0] > visibleRange.to + 50) return; const px = xAxis.convertToPixel(i), py = yAxis.convertToPixel(v); if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py); });
      ctx.stroke();
      if (x.labels) pts.forEach(([i, v], j) => {
        if (!j || i < visibleRange.from || i > visibleRange.to) return;
        const pv = pts[j - 1][1], up = v > pv, ch = ((v - pv) / pv) * 100;
        LBL(ctx, xAxis.convertToPixel(i), yAxis.convertToPixel(v), `${Number(v).toFixed(2)} (${ch > 0 ? "+" : ""}${ch.toFixed(1)}%)`, up ? "#089981" : "#F23645", "#fff", up);
      });
      return true;
    },
    createTooltipDataSource: (d) => ({ ...tip(d), values: [] }),
  });
  // RSI with divergence (TradingView's Divergence rules: pivots 5 left / 5 right, 5-60 bars apart)
  K.registerIndicator({
    name: "TV_RSIDIV", shortName: "RSI divergence", calcParams: [14, 5, 5], precision: 2, minValue: 0, maxValue: 100, extendData: clone(IND_DEF.TV_RSIDIV.ext),
    figures: [{ key: "rsi", title: "RSI: ", type: "line" }],
    styles: { lines: [LN("#7E57C2", 1)] },
    calc: (list, ind) => {
      const [n, L, R] = ind.calcParams, c = list.map((k) => k.close), r = rsiOf(c, n), out = r.map((v) => (v === null || v === undefined ? {} : { rsi: v }));
      const isLow = (i) => { for (let k = i - L; k <= i + R; k++) if (k !== i && (r[k] === null || r[k] === undefined || r[k] < r[i])) return false; return r[i] !== null; };
      const isHigh = (i) => { for (let k = i - L; k <= i + R; k++) if (k !== i && (r[k] === null || r[k] === undefined || r[k] > r[i])) return false; return r[i] !== null; };
      const div = []; let pl = null, ph = null;
      for (let i = L; i < list.length - R; i++) {
        if (isLow(i)) { if (pl !== null && i - pl >= 5 && i - pl <= 60) {
            if (r[i] > r[pl] && list[i].low < list[pl].low) div.push({ a: pl, b: i, t: "bull" });
            else if (ind.extendData.hidden && r[i] < r[pl] && list[i].low > list[pl].low) div.push({ a: pl, b: i, t: "hbull" }); } pl = i; }
        if (isHigh(i)) { if (ph !== null && i - ph >= 5 && i - ph <= 60) {
            if (r[i] < r[ph] && list[i].high > list[ph].high) div.push({ a: ph, b: i, t: "bear" });
            else if (ind.extendData.hidden && r[i] > r[ph] && list[i].high < list[ph].high) div.push({ a: ph, b: i, t: "hbear" }); } ph = i; }
      }
      ind.extendData._div = div;
      return out;
    },
    draw: ({ ctx, indicator, visibleRange, xAxis, yAxis, bounding }) => {
      const x = indicator.extendData, res = indicator.result || [];
      [70, 30].forEach((v) => { const y = yAxis.convertToPixel(v); ctx.strokeStyle = "rgba(120,123,134,0.6)"; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(bounding.width, y); ctx.stroke(); });
      ctx.setLineDash([]);
      (x._div || []).forEach(({ a, b, t }) => {
        if (b < visibleRange.from || a > visibleRange.to) return;
        const bull = t === "bull" || t === "hbull", col = bull ? "#089981" : "#F23645", x0 = xAxis.convertToPixel(a), x1 = xAxis.convertToPixel(b), y0 = yAxis.convertToPixel(res[a].rsi), y1 = yAxis.convertToPixel(res[b].rsi);
        ctx.strokeStyle = col; ctx.lineWidth = 2; if (t[0] === "h") ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
        LBL(ctx, x1, y1, t === "bull" ? "Bull" : t === "bear" ? "Bear" : t === "hbull" ? "H Bull" : "H Bear", col, "#fff", !bull);
      });
      return false;
    },
    createTooltipDataSource: tip,
  });
  // Compare lines: TV_CMP1..5 (values = our close at the first candle on screen x their % change, so the % scale lines up)
  for (let n = 1; n <= 5; n++) K.registerIndicator({
    name: `TV_CMP${n}`, shortName: "", calcParams: [], precision: 2, figures: [{ key: "v", title: "", type: "line" }],
    calc: (list, ind) => {
      const x = ind.extendData || {}, cl = x.closes || []; let b = Math.max(0, Math.min(list.length - 1, x.base || 0));
      while (b < list.length - 1 && (cl[b] === null || cl[b] === undefined)) b++;
      const ref = cl[b], mref = list[b]?.close;
      return list.map((_, i) => (cl[i] === null || cl[i] === undefined || !ref || !mref ? {} : { v: (mref * cl[i]) / ref }));
    },
    createTooltipDataSource: ({ indicator, crosshair }) => {
      const x = indicator.extendData || {}, cl = x.closes || [], i = crosshair?.dataIndex ?? cl.length - 1; let b = x.base || 0;
      while (b < cl.length - 1 && (cl[b] === null || cl[b] === undefined)) b++;
      const v = cl[i], pc = v && cl[b] ? (v / cl[b] - 1) * 100 : null;
      return { name: x.sym || "", calcParamsText: "", icons: [], values: v ? [{ title: { text: "", color: x.color }, value: { text: `${fmtPx(v)}${pc === null ? "" : ` (${pc > 0 ? "+" : ""}${pc.toFixed(2)}%)`}`, color: x.color } }] : [] };
    },
  });
  // Fibonacci retracement with your levels, colours and labels (replaces the library's fixed one; settings: double-click it)
  K.registerOverlay({
    name: "fibonacciLine", totalStep: 3, needDefaultPointFigure: true, needDefaultXAxisFigure: true, needDefaultYAxisFigure: false,
    createYAxisFigures: ({ coordinates, overlay, precision }) => {
      if (coordinates.length < 2 || overlay.points.length < 2) return [];
      const f = overlay.extendData || prefs().fib, [a, b] = coordinates, p1 = overlay.points[0].value, p2 = overlay.points[1].value;
      if (f.axis === 0 || f.axis === false) return [];
      return (f.levels || []).filter((l) => l[2]).map(([lv, col]) => ktAxisTag(b.y + (a.y - b.y) * lv, p2 + (p1 - p2) * lv, col, precision));
    },
    createPointFigures: ({ coordinates, overlay, precision }) => {
      if (coordinates.length < 2) return [];
      const f = overlay.extendData || prefs().fib, [a, b] = coordinates, p1 = overlay.points[0].value, p2 = overlay.points[1].value;
      const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), out = [];
      if (f.trend?.on) out.push({ type: "line", attrs: { coordinates: [a, b] }, styles: { color: f.trend.color, style: f.trend.dash ? "dashed" : "solid", dashedValue: [5, 4] } });
      (f.levels || []).filter((l) => l[2]).forEach(([lv, col]) => {
        const price = p2 + (p1 - p2) * lv, y = b.y + (a.y - b.y) * lv;
        out.push({ type: "line", attrs: { coordinates: [{ x: x1, y }, { x: x2, y }] }, styles: { color: col } });
        const txt = `${f.pct ? `${+(lv * 100).toFixed(2)}%` : lv}${f.prices ? ` (${Number(price).toFixed(precision.price)})` : ""}`;
        out.push({ type: "text", ignoreEvent: true, attrs: { x: (x1 + x2) / 2, y: y - 2, text: txt, align: "center", baseline: "bottom" }, styles: { color: col, size: f.size || 12, family: "Inter, sans-serif", backgroundColor: "transparent", paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0 } });
      });
      return out;
    },
  });
}

// ----- active indicators on the chart -----
const isMain = (n) => IND_MAIN.includes(n);
const LN = (color, size = 1) => ({ style: "solid", smooth: false, size, color, dashedValue: [2, 2] });   // a full line style (the library needs every field)
function kcIndValue(e) {
  const st = e.style || {};
  const x = e.ext;
  const lines = e.name === "TV_MACD" ? [LN(x.col.macd, x.w.macd), LN(x.col.signal, x.w.signal)] : e.name === "TV_RSI" ? [LN(x.col.rsi, x.w.rsi), LN(x.col.ma, x.w.ma), LN(x.col.ma), LN(x.col.ma)]
    : e.name === "TV_VOL" ? [LN(x.col.ma)] : st.lines ? st.lines.map((l) => LN(l.color, l.size || 1)) : null;
  return { name: e.name, calcParams: e.params, ...(x ? { extendData: clone(x) } : {}), ...(lines ? { styles: { lines } } : {}) };
}
function kcAddInd(e, save = true) {
  const c = kc.chart; if (!c) return;
  const main = isMain(e.name) || e.name === "TV_VOL", h = 110;   // Volume sits on the price chart, like TradingView
  const paneId = c.createIndicator(kcIndValue(e), main, main ? { id: "candle_pane" } : { height: h });
  if (!paneId) return;
  kc.active.push({ ...e, paneId });
  kcVisApply();
  if (save) { prefs().list = kc.active.map(({ paneId: _, ...x }) => x); kcSavePrefs(); }
}
function kcRemoveInd(name) {
  const i = kc.active.findIndex((a) => a.name === name); if (i < 0) return;
  kc.chart.removeIndicator(kc.active[i].paneId, name); kc.active.splice(i, 1);
  prefs().list = kc.active.map(({ paneId: _, ...x }) => x); kcSavePrefs();
}
function kcUpdateInd(name, e) {
  const a = kc.active.find((x) => x.name === name); if (!a) return;
  Object.assign(a, e);
  kc.chart.overrideIndicator({ ...kcIndValue(a) }, a.paneId);
  kcVisApply();
  prefs().list = kc.active.map(({ paneId: _, ...x }) => x); kcSavePrefs();
}
function kcVisApply() {   // Visibility tab: which candle sizes an indicator shows on
  const pt = KC_PERIODS[kc.period ?? 3]?.text;
  kc.active.forEach((a) => kc.chart.overrideIndicator({ name: a.name, visible: !(a.hideOn || []).includes(pt) && !a.hidden }, a.paneId));
}
function kcInitInds() {
  if (kc.indFor === kc.chart) return;
  kc.indFor = kc.chart; kc.active = [];
  prefs().list.forEach((e) => kcAddInd(e, false));
}

// ----- saving drawings + undo / redo -----
const kcPlain = (o) => ({ name: o.name, groupId: o.groupId, lock: o.lock, visible: true, extendData: o.extendData, styles: o.styles,
  points: (o.points || []).map((p) => ({ timestamp: p.timestamp, value: p.value })), ...(kc.ov.get(o.id)?.ui ? { ui: kc.ov.get(o.id).ui } : {}) });
function kcWrap(v) {
  const o = typeof v === "string" ? { name: v } : { ...v };
  if (o.name === "fibonacciLine" && !o.extendData) o.extendData = clone(prefs().fib);
  const keep = (e) => { if (!kc.restoring && e?.overlay) { if (!kc.ov.has(e.overlay.id)) { kc.hist.push({ t: "add", id: e.overlay.id }); kc.redo = []; } kc.ov.set(e.overlay.id, kcPlain(e.overlay)); kcSave(); } return false; };
  const chain = (f, g) => (e) => { const r = f ? f(e) : false; g(e); return r; };
  o.onDrawEnd = chain(o.onDrawEnd, (e) => { keep(e); ktDone(e?.overlay); });
  o.onDrawing = chain(o.onDrawing, (e) => { const h = KT_HINT[e?.overlay?.name]; const n = (e?.overlay?.points || []).length; if (h && h[n - 1]) ktTip(h[n - 1]); });
  o.onPressedMoveEnd = chain(o.onPressedMoveEnd, keep);
  o.onRemoved = chain(o.onRemoved, (e) => { if (!kc.restoring && e?.overlay && kc.ov.has(e.overlay.id)) { if (!kc.undoing) { kc.hist.push({ t: "del", data: kc.ov.get(e.overlay.id) }); kc.redo = []; } kc.ov.delete(e.overlay.id); if (kc.sel === e.overlay.id) kc.sel = null; kcSave(); ktFloat(); } });
  o.onSelected = chain(o.onSelected, (e) => { kc.sel = e?.overlay?.id || null; ktFloat(); });
  o.onDeselected = chain(o.onDeselected, (e) => { if (kc.sel === e?.overlay?.id) kc.sel = null; setTimeout(ktFloat, 0); });
  o.onDoubleClick = chain(o.onDoubleClick, (e) => { const ov = e?.overlay; if (!ov) return; kc.sel = ov.id; if (ov.name === "fibonacciLine") fibWindow(ov.id); else ktSettings(ov.id, ov.name === "tvText" ? "text" : "style"); });
  return o;
}
function kcAddDone(v) {   // a drawing made in one go (right-click "horizontal line here"): record + save it
  const id = kc.chart.createOverlay(v);
  const ov = id && kc.chart.getOverlayById(id);
  if (ov) { kc.ov.set(id, kcPlain(ov)); kc.hist.push({ t: "add", id }); kc.redo = []; kcSave(); }
}
function kcUndo(redo = false) {
  const st = redo ? kc.redo : kc.hist, a = st.pop(); if (!a || !kc.chart) return;
  kc.undoing = true;
  try {
    if (a.t === "edit") { const now = clone(kc.ov.get(a.id)); if (now) { ktApply(a.id, a.before); (redo ? kc.hist : kc.redo).push({ t: "edit", id: a.id, before: now }); } }
    else if (a.t === "add") { const data = kc.ov.get(a.id); kc.chart.removeOverlay(a.id); kc.ov.delete(a.id); (redo ? kc.hist : kc.redo).push({ t: "del", data }); }
    else { kc.restoring = true; const id = kc.chart.createOverlay({ ...a.data }); kc.restoring = false; if (id) { kc.ov.set(id, a.data); (redo ? kc.hist : kc.redo).push({ t: "add", id }); } }
  } finally { kc.undoing = false; kc.restoring = false; }
  kcSave();
}
function kcHook(c) {
  kc.chart = c; kc.indFor = null;
  const co = c.createOverlay.bind(c), an = c.applyNewData.bind(c);
  c.createOverlay = (v, pane) => co(Array.isArray(v) ? v.map(kcWrap) : kcWrap(v), pane);
  c.applyNewData = (d, more, cb) => { an(d, more, cb); if (d?.length) { kcInitInds(); kcRestore(); if (kc.pendingBars) setTimeout(kcZoom, 30); if (cmpList().length) setTimeout(kcCmpApply, 0); } };
  c.subscribeAction("onTooltipIconClick", (d) => {
    const n = d?.indicatorName, a = kc.active.find((x) => x.name === n); if (!a) return;
    if (d.iconId === "ic_del") kcRemoveInd(n);
    else if (d.iconId === "ic_set") indWindow(n);
    else if (d.iconId === "ic_hide" || d.iconId === "ic_show") { a.hidden = d.iconId === "ic_hide"; kcVisApply(); prefs().list = kc.active.map(({ paneId: _, ...x }) => x); kcSavePrefs(); }
  });
  let navT = 0; const nav = () => { kcRangeOff(); if (!navT) navT = setTimeout(() => { navT = 0; kcNavState(); }, 120); };
  c.subscribeAction("onZoom", nav); c.subscribeAction("onScroll", nav);
  let cmpT = 0; c.subscribeAction("onVisibleRangeChange", () => { clearTimeout(cmpT); cmpT = setTimeout(kcCmpRebase, 120); });
  c.subscribeAction("onCrosshairChange", (d) => { const p = d?.kLineData; if (p && d.y !== undefined) { const v = c.convertFromPixel([{ y: d.y }], { paneId: "candle_pane" })?.[0]?.value; kc.lastPrice = Number.isFinite(v) ? v : p.close; } });
}
function kcRestore() {
  const c = kc.chart, t = kc.sym;
  if (!c || kc.restoredFor === t) return;
  kc.restoredFor = t; kc.restoring = true; kc.hist = []; kc.redo = [];
  try {
    c.removeOverlay({ groupId: "drawing_tools" }); kc.ov.clear();
    (chOf().draw[t] || []).forEach((o) => { const id = c.createOverlay({ ...o }); if (id) kc.ov.set(id, o); });
    ktApplyVis();
  } finally { kc.restoring = false; }
}
function kcSave() {
  const t = kc.sym; clearTimeout(kc.saveT);
  kc.ov.forEach((p) => { if (p.ui?.alert?.on) { const a = ktAlertState(p); if (a && a.h !== p.ui.alert.h) p.ui = { ...p.ui, alert: a }; } });
  ktTree();
  kc.saveT = setTimeout(async () => {
    const list = [...kc.ov.values()]; chOf().draw[t] = list;
    const { error } = await sb.from("chart_drawings").upsert({ user_id: state.user.id, symbol: t, overlays: list, updated_at: new Date().toISOString() }, { onConflict: "user_id,symbol" });
    if (error) toast(`Drawing not saved: ${esc(/chart_drawings/.test(error.message) ? "run supabase/013_charts.sql first" : error.message)}`);
  }, 700);
}
const kcTheme = () => (isDark() ? "dark" : "light");
function kcStyle() {   // site colours + Inter (the library asks for Helvetica Neue, which Windows doesn't have -> serif)
  const up = "#089981", dn = "#F23645", F = "Inter, system-ui, sans-serif", t = { family: F };   // TradingView's candle colours, as on your TradingView
  kc.pro?.setStyles({
    candle: { type: kc.ctype, bar: { upColor: up, downColor: dn, noChangeColor: "#888", upBorderColor: up, downBorderColor: dn, noChangeBorderColor: "#888", upWickColor: up, downWickColor: dn, noChangeWickColor: "#888" },
      area: { lineColor: "#2962FF", backgroundColor: [{ offset: 0, color: "rgba(41,98,255,.02)" }, { offset: 1, color: "rgba(41,98,255,.22)" }] },
      priceMark: { high: { textFamily: F }, low: { textFamily: F }, last: { upColor: up, downColor: dn, text: t } }, tooltip: { text: t } },
    indicator: { lastValueMark: { show: true, text: t }, tooltip: { text: t } },
    yAxis: { type: kc.log ? "log" : kc.pct ? "percentage" : "normal", tickText: t }, xAxis: { tickText: t }, crosshair: { horizontal: { text: t }, vertical: { text: t } },
    overlay: { text: t, rectText: t } });
}
function kcZoom() {   // range buttons: show the last N candles
  const c = kc.chart, n = kc.pendingBars; kc.pendingBars = 0;
  if (!c || !n) return;
  const w = (kc.box?.clientWidth || 900) - 110, len = c.getDataList().length, bars = Math.min(n, len);
  kc.zooming = true; c.setBarSpace(Math.max(1, Math.min(40, w / Math.max(10, bars)))); c.scrollToRealTime(); kcAutoY(); setTimeout(() => { kc.zooming = false; kcNavState(); }, 120);
}
function kcSetPeriod(i, keepRange) {
  if (!kc.pro) return;
  if (!keepRange) kc.range = null;
  if (i === kc.period) { if (kc.pendingBars) kcZoom(); render(false); return; }
  kc.period = i; kc.loaded = ""; kc.pro.setPeriod(KC_PERIODS[i]); kcVisApply(); ktApplyVis(); ktTree(); render(false);
}
function kcRangeClick(l) {
  const r = l === "10Y" ? ["10Y", 5, 120] : KC_RNG.find((x) => x[0] === l); if (!r) return;
  kc.range = l;
  let bars = r[2];
  if (l === "YTD") { const d0 = new Date(new Date().getFullYear(), 0, 1); bars = Math.max(5, Math.round((Date.now() - d0) / 864e5 * 5 / 7)); }
  kc.pendingBars = bars; kcSetPeriod(r[1], true);
}
async function kcMount(t) {
  const host = document.getElementById("kchost");
  if (!host) return;
  if (!kc.box) {
    kc.box = document.createElement("div"); kc.box.className = "kcbox";
    kc.box.addEventListener("contextmenu", kcMenu);
    kc.box.insertAdjacentHTML("beforeend", `<div class="kctools" role="toolbar" aria-label="Drawing tools"></div><div class="kttip" hidden></div><div class="ktfloat" hidden></div><div class="ktree" hidden></div>`);
    kc.box.querySelector(".ktree").addEventListener("click", ktTreeClick);
    ["mousedown", "pointerdown", "wheel"].forEach((ev) => kc.box.querySelector(".ktree").addEventListener(ev, (e) => e.stopPropagation(), true));
    kc.box.querySelector(".kctools").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.ktg) return ktFly(b.dataset.ktg, b);
      if (b.dataset.kt) return ktStart(b.dataset.kt);
      if (b.dataset.kto) return ktOption(b.dataset.kto, b);
    });
    kc.box.querySelector(".ktfloat").addEventListener("click", (e) => { const b = e.target.closest("[data-kf]"); if (b) { e.preventDefault(); ktFloatClick(b.dataset.kf); } });
    ["mousedown", "pointerdown"].forEach((ev) => kc.box.querySelector(".ktfloat").addEventListener(ev, (e) => e.stopPropagation(), true));
    kcNavInit(); ktRender();
  }
  if (kc.box.parentNode !== host) { host.appendChild(kc.box); requestAnimationFrame(() => kc.chart?.resize()); }   // the chart survives page redraws: it is moved, never rebuilt
  if (kc.pro && kc.sym === t) { if (kc.pro.getTheme() !== kcTheme()) { kc.pro.setTheme(kcTheme()); kcStyle(); } return; }
  const y = yahoo(t), first = !kc.pro;
  kc.sym = t; kc.restoredFor = null; kc.loaded = "";
  kc.drawP = sb.from("chart_drawings").select("symbol,overlays,indicators").in("symbol", [t, "*"]).then(({ data }) => {
    (data || []).forEach((r) => { if (r.symbol === "*") { if (r.indicators && Array.isArray(r.indicators.list)) chOf().prefs = r.indicators; } else chOf().draw[r.symbol] = r.overlays || []; });
  });
  const symbol = { ticker: y, shortName: t, name: cleanName(chName(y) || statsOf(y)?.name || t), exchange: "", pricePrecision: y.endsWith("=X") ? 4 : 2, volumePrecision: 0 };
  if (!first) { kc.pro.setSymbol(symbol); return; }
  kcNote("Loading the chart…");
  try { await kcLoad(); await kc.drawP; } catch (e) { kcNote(esc(e.message) + ". Check your connection and reload."); return; }
  if (kc.pro || !document.getElementById("kchost")) return;
  kcNote("");
  kc.pro = new window.klinechartspro.KLineChartPro({ container: kc.box, theme: kcTheme(), locale: "en-US", watermark: "", timezone: "Asia/Bangkok",
    symbol, period: KC_PERIODS[kc.period ?? 3], periods: KC_PERIODS, mainIndicators: [], subIndicators: [], datafeed: kcDatafeed, drawingBarVisible: true });
  kcStyle(); ktRender();
}

// ----- chart navigation like TradingView (round 44): wheel zoom on every pane, hover buttons, jump to today, auto price scale,
// double-click a scale to reset, arrow keys, Shift+click measure -----
const KC_SPACE = [1, 50];   // the library's own limits for candle width (pixels); it ignores steps past them, so we clamp
function kcGeo() {   // where things are inside the chart, in page pixels
  const c = kc.chart, el = c?.getContainer?.(); if (!el) return null;
  const r = el.getBoundingClientRect(), main = c.getSize("candle_pane", "main"), xa = c.getSize("x_axis_pane", "root");
  return { r, mainW: main?.width ?? r.width - 60, candleH: main?.height ?? r.height * 0.6, xTop: xa?.top ?? r.height - 28 };
}
function kcZoomBy(f, x) {   // f > 1 zooms in (wider candles), around page-x (or the middle)
  const c = kc.chart; if (!c) return;
  const g = kcGeo(), b = c.getBarSpace(), bar = typeof b === "object" ? b.bar : b;
  const nb = Math.max(KC_SPACE[0], Math.min(KC_SPACE[1], bar * f));
  if (!g || Math.abs(nb - bar) < 0.001) return;
  const px = x === undefined ? g.mainW / 2 : Math.max(0, Math.min(g.mainW, x - g.r.left));
  c.zoomAtCoordinate(nb / bar, { x: px, y: 0 });
}
function kcScrollBars(n) { const c = kc.chart; if (!c) return; const b = c.getBarSpace(); c.scrollByDistance(n * (typeof b === "object" ? b.bar : b)); }
function kcAutoY() {   // back to "fit the visible candles" on every pane (TradingView's A button)
  const c = kc.chart; if (!c) return;
  [c.getDrawPaneById?.("candle_pane"), ...(c.getAllDrawPanes?.() || [])].forEach((p) => { const a = p?.getAxisComponent?.(); if (a && !a.getAutoCalcTickFlag()) a.setAutoCalcTickFlag(true); });
  c.adjustPaneViewport?.(false, true, true, true); kcNavState();
}
const kcIsAuto = () => kc.chart?.getDrawPaneById?.("candle_pane")?.getAxisComponent?.()?.getAutoCalcTickFlag?.() ?? true;
function kcResetView() {   // Alt+R: TradingView's default look: ~8 px candles, latest bar on the right, price scale fitted
  const c = kc.chart; if (!c) return;
  c.setBarSpace(8); c.scrollToRealTime(); kcAutoY(); kcRangeOff();
}
function kcRangeOff() {   // a 1D / 1M / 6M... button stays lit only until you zoom or scroll by hand (like TradingView)
  if (kc.zooming || !kc.range) return;
  kc.range = null; document.querySelectorAll("[data-kcr].on,[data-chperf].on").forEach((b) => b.classList.remove("on"));
}
function kcNavState() {   // show "jump to today" when scrolled back; light up Auto while the price scale fits by itself
  const c = kc.chart; if (!c || !kc.box) return;
  const r = c.getVisibleRange?.(), n = c.getDataList().length;
  kc.box.querySelector(".kclatest")?.classList.toggle("on", !!r && n > 0 && r.realTo < n - 1);
  document.querySelector('[data-kcact="auto"]')?.classList.toggle("on", kcIsAuto());
}
function kcNavInit() {   // once per chart box (the box survives page redraws)
  const box = kc.box;
  const nav = document.createElement("div"); nav.className = "kcnav";
  nav.innerHTML = [["out", "Zoom out", "−"], ["in", "Zoom in", "+"], ["left", "Scroll left", "‹"], ["right", "Scroll right", "›"], ["reset", "Reset chart view (Alt+R)", "⟲"]]
    .map(([k, t, s]) => `<button data-nv="${k}" title="${t}" aria-label="${t}">${s}</button>`).join("");
  const latest = document.createElement("button"); latest.className = "kclatest"; latest.title = "Scroll to the latest bar"; latest.setAttribute("aria-label", latest.title); latest.textContent = "»";
  const meas = document.createElement("div"); meas.className = "kcmeasure"; meas.hidden = true;
  box.append(nav, latest, meas);
  const step = (k) => { if (k === "in") kcZoomBy(1.15); else if (k === "out") kcZoomBy(1 / 1.15); else if (k === "left") kcScrollBars(5); else if (k === "right") kcScrollBars(-5); };
  let rep = null;
  nav.addEventListener("pointerdown", (e) => {   // hold to repeat, like TradingView
    const k = e.target.closest("[data-nv]")?.dataset.nv; if (!k) return;
    e.preventDefault(); e.stopPropagation();
    if (k === "reset") return kcResetView();
    step(k); clearInterval(rep); const t0 = setTimeout(() => { rep = setInterval(() => step(k), 60); }, 350);
    const stop = () => { clearTimeout(t0); clearInterval(rep); removeEventListener("pointerup", stop); };
    addEventListener("pointerup", stop);
  });
  nav.addEventListener("mousedown", (e) => e.stopPropagation(), true);
  latest.addEventListener("mousedown", (e) => e.stopPropagation(), true);
  latest.addEventListener("click", () => { kc.chart?.scrollToRealTime(); setTimeout(kcNavState, 50); });

  // wheel: zoom on every pane and on the time scale, around the mouse; Shift+wheel or a sideways swipe scrolls in time
  box.addEventListener("wheel", (e) => {
    const g = kcGeo(); if (!g || !g.r.width || e.clientX < g.r.left || e.clientX > g.r.right || e.clientY < g.r.top || e.clientY > g.r.bottom) return;
    e.preventDefault(); e.stopPropagation();
    const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 120 : 1, dx = e.deltaX * unit, dy = e.deltaY * unit;
    if (e.shiftKey || Math.abs(dx) > Math.abs(dy)) { kc.chart.scrollByDistance(-(Math.abs(dx) > Math.abs(dy) ? dx : dy)); kcRangeOff(); return; }
    kcZoomBy(Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.0014)), e.clientX);   // one mouse-wheel notch ~ 13%; trackpad pinch is smooth
    kcRangeOff();
  }, { passive: false, capture: true });

  // double-click the price scale -> fit prices again; double-click the time scale -> reset the view
  box.addEventListener("dblclick", (e) => {
    const g = kcGeo(); if (!g) return;
    const x = e.clientX - g.r.left, y = e.clientY - g.r.top;
    if (y >= g.xTop) { kcResetView(); return; }
    if (x > g.mainW) kcAutoY();
  });
  ["mouseup", "touchend"].forEach((ev) => box.addEventListener(ev, () => setTimeout(kcNavState, 0)));
  box.addEventListener("mouseenter", () => { kc.hover = true; });
  box.addEventListener("mouseleave", () => { kc.hover = false; });

  // Shift + click: measure (price change, %, bars, days); click again to clear
  let m0 = null;
  const at = (e) => { const g = kcGeo(); if (!g) return null; const x = e.clientX - g.r.left, y = e.clientY - g.r.top; if (x < 0 || x > g.mainW || y < 0 || y > g.candleH) return null;
    const p = kc.chart.convertFromPixel([{ x, y }], { paneId: "candle_pane" })?.[0]; return p && Number.isFinite(p.value) ? { x, y, ...p, g } : null; };
  const show = (a, b) => {
    const bx = kc.box.getBoundingClientRect(), off = [a.g.r.left - bx.left, a.g.r.top - bx.top];
    const d = b.value - a.value, pct = a.value ? (d / a.value) * 100 : 0, bars = Math.round((b.dataIndex ?? 0) - (a.dataIndex ?? 0));
    const list = kc.chart.getDataList(), ts = (i) => list[Math.max(0, Math.min(list.length - 1, Math.round(i ?? 0)))]?.timestamp, days = Math.round(Math.abs((ts(b.dataIndex) - ts(a.dataIndex)) / 864e5));
    Object.assign(meas.style, { left: off[0] + Math.min(a.x, b.x) + "px", top: off[1] + Math.min(a.y, b.y) + "px", width: Math.abs(b.x - a.x) + "px", height: Math.abs(b.y - a.y) + "px" });
    meas.className = "kcmeasure " + (d >= 0 ? "up" : "dn"); meas.hidden = false;
    meas.innerHTML = `<span class="${b.y < a.y ? "t" : "b"}">${d >= 0 ? "+" : ""}${fmtPx(d)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)<br>${bars} bar${Math.abs(bars) === 1 ? "" : "s"}${days ? ` · ${days} day${days === 1 ? "" : "s"}` : ""}</span>`;
  };
  box.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (kc.measuring) { e.stopPropagation(); e.preventDefault(); kc.measuring = false; m0 = null; return; }   // second click: freeze
    if (!meas.hidden && !e.shiftKey) { meas.hidden = true; return; }                                           // next click: clear
    if (!e.shiftKey && !kc.measureArm) return;
    const a = at(e); if (!a) return;
    if (kc.measureArm) { kc.measureArm = false; ktTip(""); ktRender(); }
    e.stopPropagation(); e.preventDefault(); m0 = a; kc.measuring = true; show(a, a);
  }, true);
  box.addEventListener("mousemove", (e) => { if (!kc.measuring || !m0) return; const b = at(e); if (b) show(m0, b); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !meas.hidden) { meas.hidden = true; kc.measuring = false; m0 = null; } });
}

// ----- drawing toolbar like TradingView (round 44): groups with the last-used tool on top and a flyout list, then
// Measure, Magnet, Stay in drawing mode, Lock all, Hide all, Remove. Replaces the chart library's own left bar. -----
const TI = {   // 24px line icons (same stroke as the rest of the site)
  cursor: '<path d="M12 3v18M3 12h18"/>',
  segment: '<path d="M5 19 19 5"/><circle cx="5" cy="19" r="1.8"/><circle cx="19" cy="5" r="1.8"/>',
  rayLine: '<path d="M5 19 21 3"/><circle cx="5" cy="19" r="1.8"/>', straightLine: '<path d="M2 22 22 2"/>',
  horizontalStraightLine: '<path d="M2 12h20"/><circle cx="12" cy="12" r="1.8"/>', horizontalRayLine: '<path d="M6 12h16"/><circle cx="6" cy="12" r="1.8"/>',
  verticalStraightLine: '<path d="M12 2v20"/><circle cx="12" cy="12" r="1.8"/>', priceChannelLine: '<path d="M3 15 15 3M9 21 21 9"/><path d="M6 18 18 6" stroke-dasharray="2 2"/>',
  parallelStraightLine: '<path d="M3 14 14 3M10 21 21 10"/>', priceLine: '<path d="M3 12h12"/><rect x="15" y="9" width="7" height="6" rx="1"/>',
  fibonacciLine: '<path d="M3 5h18M3 10h18M3 14h18M3 19h18"/><circle cx="5" cy="19" r="1.6"/><circle cx="19" cy="5" r="1.6"/>',
  fibonacciExtension: '<path d="M3 5h18M3 11h18M3 17h18"/><path d="m4 20 6-8 5 4"/>', fibonacciSegment: '<path d="M6 5h12M6 10h12M6 14h12M6 19h12"/>',
  fibonacciSpeedResistanceFan: '<path d="M4 20 20 4M4 20l16-7M4 20l16-12M4 20 13 4"/>', fibonacciCircle: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="9.5"/>',
  fibonacciSpiral: '<path d="M12 12a2 2 0 1 1 2 2 4 4 0 0 1-6-2 6 6 0 0 1 8-6 8 8 0 0 1 4 10"/>', gannBox: '<rect x="3" y="3" width="18" height="18"/><path d="M3 3l18 18M21 3 3 21M12 3v18M3 12h18"/>',
  xabcd: '<path d="m2 18 5-12 5 9 5-11 5 14"/><path d="M2 18 12 15M7 6l10-2" stroke-dasharray="2 2"/>', abcd: '<path d="m3 18 6-12 6 8 6-10"/>',
  fiveWaves: '<path d="m2 18 4-7 3 4 5-11 3 6 5-6"/>', threeWaves: '<path d="m3 5 7 11 4-6 7 10"/>', eightWaves: '<path d="m1 16 3-5 2 3 3-9 2 5 3-6 3 9 2-4 4 9"/>', anyWaves: '<path d="m2 14 4-6 4 8 4-10 4 8 4-4"/>',
  tvLong: '<rect x="3" y="4" width="18" height="8" fill="currentColor" fill-opacity=".25"/><rect x="3" y="12" width="18" height="6"/><path d="M3 12h18"/>',
  tvShort: '<rect x="3" y="6" width="18" height="6"/><rect x="3" y="12" width="18" height="8" fill="currentColor" fill-opacity=".25"/><path d="M3 12h18"/>',
  tvPriceRange: '<path d="M12 3v18M8 7l4-4 4 4M4 3h16M4 21h16"/>', tvDateRange: '<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4M3 4v16M21 4v16"/>',
  tvDatePriceRange: '<rect x="3" y="3" width="18" height="18" stroke-dasharray="2 2"/><path d="M12 6v12M6 12h12"/>',
  rect: '<rect x="3" y="6" width="18" height="12" rx="1"/>', circle: '<circle cx="12" cy="12" r="8.5"/>', triangle: '<path d="M12 4 21 20H3z"/>',
  parallelogram: '<path d="M7 5h14l-4 14H3z"/>', arrow: '<path d="M4 20 20 4M11 4h9v9"/>',
  tvText: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>', simpleAnnotation: '<rect x="3" y="3" width="18" height="11" rx="2"/><path d="M12 14v7"/>', simpleTag: '<path d="M3 12 8 6h13v12H8z"/>',
  measure: '<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>', magnet: '<path d="M6 3v9a6 6 0 0 0 12 0V3h-4v9a2 2 0 0 1-4 0V3z"/><path d="M6 7h4M14 7h4"/>',
  stay: '<path d="M4 20 15 9l3 3L7 23"/><path d="m14 4 6 6M17 2l5 5"/>', lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>', eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 4.4-1"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>', dup: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
};
const ti = (k, s = 22) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TI[k] || TI.segment}</svg>`;
const KT_GROUPS = [
  ["cursor", "Cursor", [["cursor", "Crosshair", "Esc"]]],
  ["lines", "Trend line tools", [["segment", "Trend line", "Alt+T"], ["rayLine", "Ray"], ["straightLine", "Extended line"], ["horizontalStraightLine", "Horizontal line", "Alt+H"],
    ["horizontalRayLine", "Horizontal ray", "Alt+J"], ["verticalStraightLine", "Vertical line", "Alt+V"], ["priceChannelLine", "Parallel channel"], ["parallelStraightLine", "Parallel lines"], ["priceLine", "Price line"]]],
  ["fib", "Fibonacci & Gann tools", [["fibonacciLine", "Fib retracement", "Alt+F"], ["fibonacciExtension", "Trend-based fib extension"], ["fibonacciSegment", "Fib segment"],
    ["fibonacciSpeedResistanceFan", "Fib speed resistance fan"], ["fibonacciCircle", "Fib circles"], ["fibonacciSpiral", "Fib spiral"], ["gannBox", "Gann box"]]],
  ["pat", "Patterns", [["fiveWaves", "Elliott impulse wave (1 2 3 4 5)"], ["threeWaves", "Elliott correction wave (A B C)"], ["eightWaves", "Elliott wave (1 2 3 4 5 A B C)"],
    ["anyWaves", "Any waves (double-click to finish)"], ["xabcd", "XABCD pattern"], ["abcd", "ABCD pattern"]]],
  ["pred", "Forecasting & measuring tools", [["tvLong", "Long position"], ["tvShort", "Short position"], ["tvPriceRange", "Price range"], ["tvDateRange", "Date range"], ["tvDatePriceRange", "Date and price range"]]],
  ["shape", "Geometric shapes", [["rect", "Rectangle"], ["circle", "Circle"], ["triangle", "Triangle"], ["parallelogram", "Parallelogram"], ["arrow", "Arrow"]]],
  ["text", "Annotation tools", [["tvText", "Text"], ["simpleAnnotation", "Note with arrow"], ["simpleTag", "Price label"]]],
];
const KT_NAME = Object.fromEntries(KT_GROUPS.flatMap(([, , l]) => l.map(([k, n]) => [k, n])));
const KT_HINT = { tvLong: ["Click the entry price", "Click the target (also sets the width)", "Click the stop"], tvShort: ["Click the entry price", "Click the target (also sets the width)", "Click the stop"],
  anyWaves: ["Click each wave point, double-click to finish"], tvText: ["Click where the text goes"] };
const ktOpt = () => chOf().kt || (chOf().kt = safe(() => JSON.parse(localStorage.getItem("ic_kt") || "null"), null) || { last: {}, magnet: "", stay: false });
const ktSaveOpt = () => safe(() => localStorage.setItem("ic_kt", JSON.stringify(ktOpt())));
function ktRender() {
  const bar = kc.box?.querySelector(".kctools"); if (!bar) return;
  const o = ktOpt(), allLocked = [...kc.ov.keys()].length && [...kc.ov.keys()].every((id) => kc.chart?.getOverlayById(id)?.lock), hidden = !!kc.hideAll;
  bar.innerHTML = KT_GROUPS.map(([g, label, list]) => {
    const cur = list.find(([k]) => k === o.last[g]) || list[0], on = kc.tool ? list.some(([k]) => k === kc.tool) : g === "cursor";
    return `<div class="ktg${on ? " on" : ""}"><button class="ktb" data-kt="${cur[0]}" title="${esc(cur[1])}${cur[2] ? ` (${cur[2]})` : ""}">${ti(cur[0])}</button>${list.length > 1 ? `<button class="ktx" data-ktg="${g}" title="${esc(label)}" aria-label="${esc(label)}"><i></i></button>` : ""}</div>`;
  }).join("") + `<hr>
    <div class="ktg${kc.measureArm ? " on" : ""}"><button class="ktb" data-kto="measure" title="Measure (Shift + click on the chart)">${ti("measure")}</button></div>
    <div class="ktg${o.magnet ? " on" : ""}"><button class="ktb" data-kto="magnet" title="Magnet: ${o.magnet === "strong_magnet" ? "strong" : o.magnet ? "weak" : "off"} (points snap to open/high/low/close)">${ti("magnet")}${o.magnet === "strong_magnet" ? "<b>S</b>" : ""}</button></div>
    <div class="ktg${o.stay ? " on" : ""}"><button class="ktb" data-kto="stay" title="Stay in drawing mode">${ti("stay")}</button></div>
    <div class="ktg${allLocked ? " on" : ""}"><button class="ktb" data-kto="lock" title="${allLocked ? "Unlock" : "Lock"} all drawings">${ti(allLocked ? "lock" : "unlock")}</button></div>
    <div class="ktg${hidden ? " on" : ""}"><button class="ktb" data-kto="hide" title="${hidden ? "Show" : "Hide"} all drawings">${ti(hidden ? "eyeoff" : "eye")}</button></div>
    <div class="ktg"><button class="ktb" data-kto="remove" title="Remove drawings or indicators">${ti("trash")}</button></div>`;
}
function ktFly(g, btn) {   // the flyout list of one group
  document.querySelector(".ktfly")?.remove();
  const grp = KT_GROUPS.find((x) => x[0] === g); if (!grp) return;
  const r = btn.closest(".ktg").getBoundingClientRect(), m = document.createElement("div");
  m.className = "ktfly"; m.style.left = r.right + 6 + "px"; m.style.top = Math.min(r.top, innerHeight - 44 * grp[2].length - 50) + "px";
  m.innerHTML = `<small>${esc(grp[1].toUpperCase())}</small>` + grp[2].map(([k, n, s]) => `<button data-kt="${k}" class="${kc.tool === k ? "on" : ""}">${ti(k, 20)}<span>${esc(n)}</span>${s ? `<em>${s}</em>` : ""}</button>`).join("");
  document.body.appendChild(m);
  const out = (e) => { if (!m.contains(e.target) && !e.target.closest(".ktx")) { m.remove(); document.removeEventListener("mousedown", out, true); } };
  setTimeout(() => document.addEventListener("mousedown", out, true), 0);
  m.addEventListener("click", (e) => { const k = e.target.closest("[data-kt]")?.dataset.kt; if (k) { m.remove(); document.removeEventListener("mousedown", out, true); ktStart(k); } });
}
function ktStart(k) {   // pick a tool: the next clicks on the chart place its points
  const c = kc.chart; if (!c) return;
  if (kc.drawingId) { c.removeOverlay(kc.drawingId); kc.drawingId = null; }
  kc.measureArm = false;
  if (k === "cursor") { kc.tool = null; ktTip(""); ktRender(); return; }
  const g = KT_GROUPS.find(([, , l]) => l.some(([x]) => x === k)); if (g) { ktOpt().last[g[0]] = k; ktSaveOpt(); }
  kc.tool = k; kc.toolStep = 0;
  const def = ktDefs()[k];
  kc.drawingId = c.createOverlay({ name: k, groupId: "drawing_tools", mode: ktOpt().magnet || "normal", visible: true, ...(def?.styles ? { styles: clone(def.styles) } : {}), ...(def?.extendData ? { extendData: clone(def.extendData) } : {}) });
  ktTip((KT_HINT[k] || [])[0] || `${KT_NAME[k] || "Drawing"}: click on the chart to place it`);
  ktRender();
}
function ktDone(ov) {   // called when a drawing is finished (from kcWrap)
  kc.drawingId = null;
  if (ov?.name === "tvText") ktSettings(ov.id, "text");
  if (ktOpt().stay && kc.tool && kc.tool !== "tvText") { const k = kc.tool; setTimeout(() => ktStart(k), 0); return; }
  kc.tool = null; ktTip(""); ktRender();
}
function ktTip(t) { const el = kc.box?.querySelector(".kttip"); if (!el) return; el.textContent = t; el.hidden = !t; }
function ktOption(k, btn) {
  const c = kc.chart, o = ktOpt(); if (!c) return;
  if (k === "measure") { kc.measureArm = !kc.measureArm; kc.tool = null; ktTip(kc.measureArm ? "Click a start point on the chart (or Shift + click any time)" : ""); }
  else if (k === "magnet") { o.magnet = o.magnet === "" ? "weak_magnet" : o.magnet === "weak_magnet" ? "strong_magnet" : ""; ktSaveOpt(); toast(`Magnet ${o.magnet === "strong_magnet" ? "strong" : o.magnet ? "weak" : "off"}`); }
  else if (k === "stay") { o.stay = !o.stay; ktSaveOpt(); }
  else if (k === "lock" || k === "hide") {
    const ids = [...kc.ov.keys()], lockAll = k === "lock" && !ids.every((id) => c.getOverlayById(id)?.lock);
    if (k === "hide") kc.hideAll = !kc.hideAll;
    if (k === "hide") ktApplyVis();
    else ids.forEach((id) => { c.overrideOverlay({ id, lock: lockAll }); const p = kc.ov.get(id); if (p) p.lock = lockAll; });
    if (k === "lock") kcSave();
  } else if (k === "remove") {
    document.querySelector(".kcctx")?.remove();
    const r = btn.getBoundingClientRect(), m = document.createElement("div"); m.className = "kcctx"; m.style.left = r.right + 6 + "px"; m.style.top = r.top - 60 + "px";
    m.innerHTML = `<button data-m="clr">Remove ${kc.ov.size} drawing${kc.ov.size === 1 ? "" : "s"}</button><button data-m="clri">Remove all indicators</button><button data-m="clra">Remove drawings and indicators</button>`;
    document.body.appendChild(m);
    const close = () => { m.remove(); document.removeEventListener("mousedown", out, true); }, out = (e) => { if (!m.contains(e.target)) close(); };
    setTimeout(() => document.addEventListener("mousedown", out, true), 0);
    m.addEventListener("click", (e) => { const a = e.target.closest("[data-m]")?.dataset.m; if (!a) return; close(); if (a === "clra") { kcAction("clr"); kcAction("clri"); } else kcAction(a); });
  }
  ktRender();
}
// floating bar over a selected drawing: colour, width, line style, (settings), lock, clone, delete
const KT_COLORS = ["#2962FF", "#F23645", "#089981", "#FF9800", "#9C27B0", "#00BCD4", "#FFEB3B", "#E91E63", "#787B86", "#FFFFFF", "#131722", "#4CAF50"];
function ktFloat() {
  const box = kc.box, el = box?.querySelector(".ktfloat"); if (!el) return;
  const ov = kc.sel && kc.chart?.getOverlayById(kc.sel);
  if (!ov || kc.tool) { el.hidden = true; return; }
  const ln = ov.styles?.line || {}, col = ln.color || "#2962FF", w = ln.size || 1, st = ln.style === "dashed" ? (String(ln.dashedValue) === "1,3" ? "dot" : "dash") : "solid", fib = ov.name === "fibonacciLine", txt = ov.name === "tvText";
  el.innerHTML = `<span class="ktn">${esc(KT_NAME[ov.name] || ov.name)}</span><i></i>
    ${fib ? "" : `<details class="ktdd"><summary title="Colour"><span class="sw" style="background:${esc(col)}"></span></summary><div class="sws">${KT_COLORS.map((c) => `<button data-kf="col:${c}" style="background:${c}" title="${c}"></button>`).join("")}</div></details>`}
    ${fib || txt ? "" : `<details class="ktdd"><summary title="Line width"><span class="lw" style="height:${w}px"></span>${w}px</summary><div>${[1, 2, 3, 4].map((x) => `<button data-kf="w:${x}" class="${x === w ? "on" : ""}"><span class="lw" style="height:${x}px"></span>${x}px</button>`).join("")}</div></details>
    <details class="ktdd"><summary title="Line style">${st === "solid" ? "━" : st === "dash" ? "╍" : "┉"}</summary><div>${[["solid", "━ Solid"], ["dash", "╍ Dashed"], ["dot", "┉ Dotted"]].map(([k, l]) => `<button data-kf="st:${k}" class="${k === st ? "on" : ""}">${l}</button>`).join("")}</div></details>`}
    <button data-kf="set" title="Settings (or double-click the drawing)">${ti("gear", 18)}</button>${KT_TEXTABLE.includes(ov.name) ? `<button data-kf="edit" title="Text">${ti("tvText", 18)}</button>` : ""}
    ${KT_ALERTABLE.includes(ov.name) ? `<button data-kf="alert" class="${kc.ov.get(ov.id)?.ui?.alert?.on ? "on" : ""}" title="${kc.ov.get(ov.id)?.ui?.alert?.on ? "Alert is on: click to turn it off" : "Alert me (Telegram) when the price crosses this"}">${chI("bell", 18)}</button>` : ""}
    <button data-kf="lock" title="${ov.lock ? "Unlock" : "Lock"}">${ti(ov.lock ? "lock" : "unlock", 18)}</button><button data-kf="dup" title="Clone">${ti("dup", 18)}</button><button data-kf="del" title="Remove (Delete)">${ti("trash", 18)}</button>`;
  el.hidden = false;
}
function ktFloatClick(k) {
  const c = kc.chart, id = kc.sel, ov = id && c?.getOverlayById(id); if (!ov) return;
  const ln = { style: "solid", smooth: false, size: 1, color: "#2962FF", dashedValue: [2, 2], ...(ov.styles?.line || {}) };
  const put = (styles) => { c.overrideOverlay({ id, styles }); const p = kc.ov.get(id); if (p) { p.styles = { ...(p.styles || {}), ...styles }; kcSave(); } ktFloat(); };
  const [a, v] = k.split(":");
  if (a === "col") { const fill = v + "26"; put({ line: { ...ln, color: v }, polygon: { color: fill, borderColor: v, borderSize: ln.size, style: "stroke_fill" }, circle: { color: fill, borderColor: v, style: "stroke_fill" }, arc: { color: v }, text: { color: v } }); }
  else if (a === "w") put({ line: { ...ln, size: +v }, polygon: { ...(ov.styles?.polygon || {}), borderSize: +v } });
  else if (a === "st") put({ line: { ...ln, style: v === "solid" ? "solid" : "dashed", dashedValue: v === "dot" ? [1, 3] : [6, 4] } });
  else if (a === "set") (ov.name === "fibonacciLine" ? fibWindow(id) : ktSettings(id));
  else if (a === "edit") ktSettings(id, "text");
  else if (a === "alert") ktAlertToggle(id);
  else if (a === "lock") { c.overrideOverlay({ id, lock: !ov.lock }); const p = kc.ov.get(id); if (p) { p.lock = !ov.lock; kcSave(); } ktFloat(); ktRender(); }
  else if (a === "dup") { const p = kc.ov.get(id); if (p) { const list = c.getDataList(), bs = c.getBarSpace(), shift = (list.at(-1)?.timestamp - list.at(-2)?.timestamp || 864e5) * 5;
    kcAddDone({ ...clone(p), points: p.points.map((q) => ({ ...q, timestamp: q.timestamp + shift })) }); void bs; } }
  else if (a === "del") { c.removeOverlay(id); kc.sel = null; ktFloat(); }
  document.querySelectorAll(".ktfloat details[open]").forEach((d) => d.removeAttribute("open"));
}
function ktTextEdit(id, fresh) {
  const ov = kc.chart?.getOverlayById(id); if (!ov) return;
  const m = kcModal(`<div class="kwh"><b>Text</b><button class="x" data-k="close">✕</button></div><div class="kwb"><textarea class="kttext" rows="3" maxlength="300" placeholder="Type your note">${esc(ov.extendData?.text || "")}</textarea>
    <div class="f"><span>Size</span><span><select data-ts>${[12, 14, 16, 20, 24, 28].map((s) => `<option ${s === (ov.extendData?.size || 14) ? "selected" : ""}>${s}</option>`).join("")}</select></span></div></div>
    <div class="kwf"><span class="sp"></span><button class="c" data-k="close">Cancel</button><button class="ok" data-k="ok">Ok</button></div>`);
  const ta = m.querySelector("textarea"); setTimeout(() => ta.focus(), 0);
  m.addEventListener("click", (e) => {
    const k = e.target.closest("[data-k]")?.dataset.k; if (!k) return;
    if (k === "ok") { const t = ta.value.trim(); if (!t && fresh) { kc.chart.removeOverlay(id); m.remove(); return; }
      const ext = { ...(ov.extendData || {}), text: t || ov.extendData?.text || "Text", size: +m.querySelector("[data-ts]").value };
      kc.chart.overrideOverlay({ id, extendData: ext }); const p = kc.ov.get(id); if (p) { p.extendData = ext; kcSave(); } }
    else if (fresh && !ov.extendData?.text) kc.chart.removeOverlay(id);
    m.remove();
  });
}
// our extra drawings: Long / Short position, Price / Date / Date-and-price range, Text
function kcRegisterTV(K) {
  const F = "Inter, sans-serif", lbl = (x, y, text, bg, align = "center", baseline = "middle") => ({ type: "text", ignoreEvent: true, attrs: { x, y, text, align, baseline },
    styles: { color: "#fff", size: 12, family: F, weight: 600, backgroundColor: bg, borderRadius: 4, paddingLeft: 6, paddingRight: 6, paddingTop: 4, paddingBottom: 4, borderSize: 0 } });
  const fx = (v, p) => Number(v).toFixed(p?.price ?? 2);
  ["tvLong", "tvShort"].forEach((name) => K.registerOverlay({
    name, totalStep: 4, needDefaultPointFigure: true, needDefaultXAxisFigure: true, needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates: cs, overlay, precision }) => {
      if (cs.length < 2) return cs.length ? [{ type: "line", attrs: { coordinates: [{ x: cs[0].x - 60, y: cs[0].y }, { x: cs[0].x + 60, y: cs[0].y }] }, styles: { color: "#787B86" } }] : [];
      const [a, b, c] = cs, P = overlay.points, e = P[0].value, t = P[1].value, s = P[2]?.value ?? e - (t - e) / 2, yS = c ? c.y : a.y + (a.y - b.y) / 2;
      const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x, a.x + 40), w = x2 - x1, rr = Math.abs(e - s) ? Math.abs(t - e) / Math.abs(e - s) : 0, sign = name === "tvLong" ? 1 : -1;
      const pct = (v) => `${(((v - e) / e) * 100 * sign).toFixed(2)}%`, X = ktExt(overlay);
      const riskAmt = X.acct ? (X.riskT === "amt" ? X.risk ?? 0 : (X.acct * (X.risk ?? 1)) / 100) : 0, qty = riskAmt && Math.abs(e - s) ? riskAmt / Math.abs(e - s) : 0;
      const money = (v) => (qty ? ` · ${v >= 0 ? "+" : "−"}${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "");
      return [
        { type: "rect", attrs: { x: x1, y: Math.min(a.y, b.y), width: w, height: Math.abs(b.y - a.y) }, styles: { style: "fill", color: "rgba(8,153,129,0.22)" } },
        { type: "rect", attrs: { x: x1, y: Math.min(a.y, yS), width: w, height: Math.abs(yS - a.y) }, styles: { style: "fill", color: "rgba(242,54,69,0.22)" } },
        { type: "line", attrs: { coordinates: [{ x: x1, y: a.y }, { x: x2, y: a.y }] }, styles: { color: "#787B86" } },
        lbl((x1 + x2) / 2, b.y + (b.y < a.y ? -12 : 12), `Target: ${fx(t, precision)} (${pct(t)})${money(qty * (t - e) * sign)}`, "#089981"),
        lbl((x1 + x2) / 2, yS + (yS > a.y ? 12 : -12), `Stop: ${fx(s, precision)} (${pct(s)})${money(qty * (s - e) * sign)}`, "#F23645"),
        lbl((x1 + x2) / 2, a.y, `${name === "tvLong" ? "Long" : "Short"} ${fx(e, precision)}${qty ? ` · Qty ${qty >= 100 ? Math.floor(qty).toLocaleString("en-US") : qty.toFixed(2)}` : ""} · Risk/reward ${rr.toFixed(2)}`, "#2a2e39"),
      ];
    },
  }));
  const range = (name, kind) => K.registerOverlay({
    name, totalStep: 3, needDefaultPointFigure: true, needDefaultXAxisFigure: true, needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates: cs, overlay, precision, xAxis }) => {
      if (cs.length < 2) return [];
      const [a, b] = cs, P = overlay.points, d = P[1].value - P[0].value, up = d >= 0, col = up ? "rgba(41,98,255," : "rgba(242,54,69,";
      const i0 = xAxis?.convertFromPixel?.(a.x), i1 = xAxis?.convertFromPixel?.(b.x), bars = Number.isFinite(i0) && Number.isFinite(i1) ? Math.round(i1 - i0) : 0;
      const days = P[0].timestamp && P[1].timestamp ? Math.round(Math.abs(P[1].timestamp - P[0].timestamp) / 864e5) : 0;
      const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y), mx = (x1 + x2) / 2, my = (y1 + y2) / 2, out = [];
      out.push({ type: "rect", attrs: { x: x1, y: y1, width: Math.max(1, x2 - x1), height: Math.max(1, y2 - y1) }, styles: { style: "fill", color: col + "0.16)" } });
      if (kind !== "date") out.push({ type: "line", attrs: { coordinates: [{ x: mx, y: a.y }, { x: mx, y: b.y }] }, styles: { color: col + "1)" } },
        { type: "line", attrs: { coordinates: [{ x: mx - 5, y: b.y + (up ? 6 : -6) }, { x: mx, y: b.y }, { x: mx + 5, y: b.y + (up ? 6 : -6) }] }, styles: { color: col + "1)" } });
      if (kind !== "price") out.push({ type: "line", attrs: { coordinates: [{ x: a.x, y: my }, { x: b.x, y: my }] }, styles: { color: col + "1)" } },
        { type: "line", attrs: { coordinates: [{ x: b.x + (b.x > a.x ? -6 : 6), y: my - 5 }, { x: b.x, y: my }, { x: b.x + (b.x > a.x ? -6 : 6), y: my + 5 }] }, styles: { color: col + "1)" } });
      const t1 = `${up ? "+" : ""}${fx(d, precision)} (${up ? "+" : ""}${P[0].value ? ((d / P[0].value) * 100).toFixed(2) : "0"}%)`, t2 = `${bars} bars${days ? `, ${days}d` : ""}`;
      const text = kind === "price" ? t1 : kind === "date" ? t2 : `${t1} · ${t2}`;
      out.push(lbl(mx, (b.y > a.y ? y2 + 14 : y1 - 14), text, up ? "#2962FF" : "#F23645"));
      return out;
    },
  });
  range("tvPriceRange", "price"); range("tvDateRange", "date"); range("tvDatePriceRange", "both");
  ktRegisterLines(K);
  K.registerOverlay({
    name: "tvText", totalStep: 2, needDefaultPointFigure: true, needDefaultXAxisFigure: false, needDefaultYAxisFigure: false,
    createPointFigures: ({ coordinates: cs, overlay }) => {
      if (!cs.length) return [];
      const e = overlay.extendData || {}, col = overlay.styles?.text?.color || "#2962FF";
      return String(e.text || "Text").split("\n").map((line, i) => ({ type: "text", attrs: { x: cs[0].x, y: cs[0].y + i * ((e.size || 14) + 4), text: line, align: "left", baseline: "middle" },
        styles: { color: col, size: e.size || 14, family: F, weight: 600, backgroundColor: "transparent", paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0, borderSize: 0 } }));
    },
  });
}

// ----- round 45: deeper drawing settings (TradingView's Style / Text / Coordinates / Visibility tabs + templates) and the Object tree -----
const KT_LINES = { segment: "seg", rayLine: "ray", straightLine: "line", horizontalStraightLine: "h", horizontalRayLine: "hr", verticalStraightLine: "v" };
const KT_SHAPES = ["rect", "circle", "triangle", "parallelogram"];
const KT_TEXTABLE = [...Object.keys(KT_LINES), "rect", "tvText"];
const KT_TF = [["m", "Minutes", [0, 1, 6, 7, 8]], ["h", "Hours", [2, 9, 10, 11]], ["d", "Days", [3]], ["w", "Weeks", [4]], ["mo", "Months", [5, 12, 13, 14]]];
const ktTfNow = () => (KT_TF.find(([, , l]) => l.includes(kc.period ?? 3)) || KT_TF[2])[0];
const ktDefs = () => safe(() => JSON.parse(localStorage.getItem("ic_ktdef") || "{}"), {}) || {};
const ktExt = (o) => (o && typeof o.extendData === "object" && o.extendData && !Array.isArray(o.extendData) ? o.extendData : {});
function ktApplyVis() {   // each drawing: your eye toggle (object tree), "hide all", and which timeframes it shows on
  const c = kc.chart; if (!c) return;
  const tf = ktTfNow();
  kc.ov.forEach((p, id) => { const ui = p.ui || {}; c.overrideOverlay({ id, visible: !kc.hideAll && !ui.hidden && (ui.vis?.[tf] ?? true) }); });
}
function ktApply(id, plain) {   // put a saved state back on the chart (undo of an edit, Cancel in settings)
  const c = kc.chart; if (!c || !plain) return;
  c.overrideOverlay({ id, styles: plain.styles || {}, extendData: plain.extendData, points: plain.points, lock: !!plain.lock });
  kc.ov.set(id, clone(plain)); ktApplyVis();
}
const ktLineExtend = (a, b, l, r, w, h) => {   // stretch a line to the pane edges (extend left / right)
  const dx = b.x - a.x, dy = b.y - a.y; if (!dx && !dy) return [a, b];
  const ts = []; if (dx) ts.push(-a.x / dx, (w - a.x) / dx); if (dy) ts.push(-a.y / dy, (h - a.y) / dy);
  const inside = ts.filter((t) => { const x = a.x + dx * t, y = a.y + dy * t; return x >= -1 && x <= w + 1 && y >= -1 && y <= h + 1; });
  const lo = Math.min(...inside, 0), hi = Math.max(...inside, 1), P = (t) => ({ x: a.x + dx * t, y: a.y + dy * t });
  return [l ? P(lo) : a, r ? P(hi) : b];
};
const ktArrow = (from, to) => {   // a small arrow head at "to"
  const ang = Math.atan2(to.y - from.y, to.x - from.x), L = 10;
  return { type: "line", attrs: { coordinates: [{ x: to.x - L * Math.cos(ang - 0.45), y: to.y - L * Math.sin(ang - 0.45) }, to, { x: to.x - L * Math.cos(ang + 0.45), y: to.y - L * Math.sin(ang + 0.45) }] } };
};
const ktTextFig = (e, x, y, align, baseline, col) => String(e.text).split("\n").map((ln, i, all) => ({ type: "text", ignoreEvent: true,
  attrs: { x, y: y + (baseline === "bottom" ? -(all.length - 1 - i) : i) * ((e.ts || 13) + 3), text: ln, align, baseline },
  styles: { color: e.tc || col, size: e.ts || 13, family: "Inter, sans-serif", weight: `${e.ti ? "italic " : ""}${e.tb ? 700 : 500}`, backgroundColor: "transparent", borderSize: 0, paddingLeft: 0, paddingRight: 0, paddingTop: 2, paddingBottom: 2 } }));
function ktRegisterLines(K) {   // our versions of the line tools + rectangle: same names (old drawings keep working), more options
  Object.entries(KT_LINES).forEach(([name, kind]) => K.registerOverlay({
    name, totalStep: ["h", "hr", "v"].includes(kind) ? 2 : 3, needDefaultPointFigure: true, needDefaultXAxisFigure: true, needDefaultYAxisFigure: !["h", "hr"].includes(kind),
    createYAxisFigures: ["h", "hr"].includes(kind) ? ({ coordinates: cs, overlay, precision, defaultStyles }) => (!cs.length || !overlay.points.length || ktExt(overlay).axis === false ? []
      : [ktAxisTag(cs[0].y, overlay.points[0].value, overlay.styles?.line?.color || defaultStyles?.line?.color || "#2962FF", precision)]) : undefined,
    createPointFigures: ({ coordinates: cs, bounding, overlay, precision, xAxis }) => {
      if (!cs.length) return [];
      const e = ktExt(overlay), W = bounding.width, H = bounding.height, col = overlay.styles?.line?.color || "#2962FF";
      let a, b;
      if (kind === "h") { a = { x: 0, y: cs[0].y }; b = { x: W, y: cs[0].y }; }
      else if (kind === "hr") { a = cs[0]; b = { x: W, y: cs[0].y }; }
      else if (kind === "v") { a = { x: cs[0].x, y: 0 }; b = { x: cs[0].x, y: H }; }
      else { if (cs.length < 2) return []; [a, b] = ktLineExtend(cs[0], cs[1], e.extL ?? kind === "line", e.extR ?? (kind === "ray" || kind === "line"), W, H); }
      const out = [{ type: "line", attrs: { coordinates: [a, b] } }];
      if (!["h", "hr", "v"].includes(kind) && cs.length > 1) { if (e.arrR) out.push(ktArrow(cs[0], cs[1])); if (e.arrL) out.push(ktArrow(cs[1], cs[0])); }
      if (e.mid && cs.length > 1) out.push({ type: "circle", attrs: { x: (cs[0].x + cs[1].x) / 2, y: (cs[0].y + cs[1].y) / 2, r: 3 }, styles: { style: "fill", color: col } });
      if (e.stats && cs.length > 1 && overlay.points.length > 1) {
        const P = overlay.points, d = P[1].value - P[0].value, i0 = xAxis?.convertFromPixel?.(cs[0].x), i1 = xAxis?.convertFromPixel?.(cs[1].x);
        const bars = Number.isFinite(i0) && Number.isFinite(i1) ? Math.round(i1 - i0) : 0, days = P[0].timestamp && P[1].timestamp ? Math.round(Math.abs(P[1].timestamp - P[0].timestamp) / 864e5) : 0;
        const ang = Math.round((Math.atan2(cs[0].y - cs[1].y, cs[1].x - cs[0].x) * 180) / Math.PI);
        out.push({ type: "text", ignoreEvent: true, attrs: { x: cs[1].x + 8, y: cs[1].y, text: `${d >= 0 ? "+" : ""}${d.toFixed(precision.price)} (${P[0].value ? ((d / P[0].value) * 100).toFixed(2) : 0}%) · ${bars} bars${days ? `, ${days}d` : ""} · ${ang}°`, align: "left", baseline: "middle" },
          styles: { color: "#fff", size: 11.5, family: "Inter, sans-serif", weight: 600, backgroundColor: col, borderRadius: 4, paddingLeft: 6, paddingRight: 6, paddingTop: 3, paddingBottom: 3, borderSize: 0 } });
      }
      if (e.text) {
        const t = e.tpos === "left" ? 0.04 : e.tpos === "right" ? 0.96 : 0.5, base = kind === "v" ? { x: a.x + 6, y: H * t } : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        out.push(...ktTextFig(e, base.x, base.y + (kind === "v" ? 0 : e.tv === "below" ? 4 : -4), kind === "v" ? "left" : e.tpos === "left" ? "left" : e.tpos === "right" ? "right" : "center", kind === "v" ? "middle" : e.tv === "below" ? "top" : "bottom", col));
      }
      return out;
    },
  }));
  K.registerOverlay({
    name: "rect", totalStep: 3, needDefaultPointFigure: true, needDefaultXAxisFigure: true, needDefaultYAxisFigure: true,
    styles: { polygon: { style: "stroke_fill", color: "rgba(41,98,255,0.15)", borderColor: "#2962FF", borderSize: 1 } },
    createPointFigures: ({ coordinates: cs, overlay }) => {
      if (cs.length < 2) return [];
      const [a, b] = cs, e = ktExt(overlay), out = [{ type: "polygon", attrs: { coordinates: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }] } }];
      if (e.text) out.push(...ktTextFig(e, e.tpos === "left" ? Math.min(a.x, b.x) + 8 : e.tpos === "right" ? Math.max(a.x, b.x) - 8 : (a.x + b.x) / 2,
        e.tv === "top" ? Math.min(a.y, b.y) + 6 : e.tv === "bottom" ? Math.max(a.y, b.y) - 6 : (a.y + b.y) / 2, e.tpos || "center", e.tv === "top" ? "top" : e.tv === "bottom" ? "bottom" : "middle", overlay.styles?.polygon?.borderColor || "#2962FF"));
      return out;
    },
  });
}
// ----- alerts on drawings (round 47): the robot sends Telegram when the price crosses the line (see robot/drawing_alerts.py) -----
const KT_ALERTABLE = ["horizontalStraightLine", "horizontalRayLine", "priceLine", "segment", "rayLine", "straightLine", "fibonacciLine"];
function ktAlertState(p) {   // where the price is now vs each level (counted in candles of the timeframe on screen, like the robot does)
  const c = kc.chart, list = c?.getDataList() || []; if (!list.length) return null;
  const idx = (ts) => { let n = 0; for (const b of list) { if (b.timestamp <= ts) n++; else break; } return n - 1; };
  const P = p.points || [], now = list.length - 1, price = list[now].close; let lv = [];
  if (["horizontalStraightLine", "horizontalRayLine", "priceLine"].includes(p.name) && P[0]) lv = [P[0].value];
  else if (["segment", "rayLine", "straightLine"].includes(p.name) && P.length > 1) { const i1 = idx(P[0].timestamp), i2 = idx(P[1].timestamp); if (i1 !== i2) lv = [P[0].value + (P[1].value - P[0].value) * (now - i1) / (i2 - i1)]; }
  else if (p.name === "fibonacciLine" && P.length > 1) lv = (p.extendData?.levels || []).filter((l) => l[2]).map(([l]) => P[1].value + (P[0].value - P[1].value) * l);
  if (!lv.length) return null;
  const h = JSON.stringify([p.name, P.map((q) => [q.timestamp, +Number(q.value).toFixed(6)]), p.name === "fibonacciLine" ? (p.extendData?.levels || []).filter((l) => l[2]).map((l) => l[0]) : 0]);
  let hash = 0; for (let i = 0; i < h.length; i++) hash = (hash * 31 + h.charCodeAt(i)) | 0;
  return { on: 1, y: yahoo(kc.sym), tf: KC_PERIODS[kc.period ?? 3].text, side0: lv.map((v) => (price >= v ? "above" : "below")), h: String(hash >>> 0), lv: lv.map((v) => +v.toFixed(4)) };
}
function ktAlertToggle(id) {
  const p = kc.ov.get(id); if (!p) return;
  if (p.ui?.alert?.on) { p.ui = { ...p.ui, alert: undefined }; toast("Alert off for this drawing"); }
  else { const a = ktAlertState(p); if (!a) { toast("This drawing can't have an alert yet"); return; }
    p.ui = { ...(p.ui || {}), alert: a }; toast(`Alert on: Telegram when ${esc(kc.sym)} crosses ${a.lv.length > 1 ? `any of the ${a.lv.length} levels` : `this line (now ${fmtPx(a.lv[0])})`}. Checked every 30 min.`); }
  kcSave(); ktFloat();
}
// ----- the settings window of one drawing -----
function ktSettings(id, tab = "style") {
  const c = kc.chart, ov = c?.getOverlayById(id); if (!ov) return;
  if (ov.name === "fibonacciLine" && tab === "style") { fibWindow(id); return; }
  const name = ov.name, before = clone(kc.ov.get(id) || kcPlain(ov)), cur = clone(before);
  const isLine = !!KT_LINES[name], isShape = KT_SHAPES.includes(name), isPos = name === "tvLong" || name === "tvShort", txt = KT_TEXTABLE.includes(name), seg = ["segment", "rayLine", "straightLine"].includes(name);
  const tabs = [["style", isPos ? "Inputs & style" : "Style"], ...(txt ? [["text", "Text"]] : []), ["coords", "Coordinates"], ["vis", "Visibility"]];
  let t = tabs.some((x) => x[0] === tab) ? tab : "style";
  const ln = () => ({ style: "solid", smooth: false, size: 1, color: "#2962FF", dashedValue: [2, 2], ...(cur.styles?.line || {}) });
  const pg = () => ({ style: "stroke_fill", color: "rgba(41,98,255,0.15)", borderColor: "#2962FF", borderSize: 1, borderStyle: "solid", borderDashedValue: [2, 2], ...(cur.styles?.polygon || {}) });
  const ext = () => (cur.extendData && typeof cur.extendData === "object" && !Array.isArray(cur.extendData) ? cur.extendData : {});
  const live = () => { ktApply(id, cur); ktFloat(); };
  const colorRow = (label, key, val) => `<div class="f"><span>${label}</span><span><input type="color" data-c="${key}" value="${esc(String(val).slice(0, 7))}">${KT_COLORS.slice(0, 8).map((x) => `<button class="kwsw" data-cs="${key}:${x}" style="background:${x}" title="${x}"></button>`).join("")}</span></div>`;
  const sel = (key, val, opts) => `<select data-s="${key}">${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(val) ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const chk = (key, val, label) => `<div class="f"><label class="ck"><input type="checkbox" data-k="${key}" ${val ? "checked" : ""}> ${label}</label></div>`;
  const lineStyle = (s) => (s.style === "dashed" ? (String(s.dashedValue) === "1,3" ? "dot" : "dash") : "solid");
  const body = () => {
    const e = ext(), L = ln(), G = pg();
    if (t === "style") {
      let h = "";
      if (isShape) h += `<div class="h">BORDER</div>${colorRow("Colour", "pg.borderColor", G.borderColor)}<div class="f"><span>Width · style</span><span>${sel("pg.borderSize", G.borderSize, [[1, "1px"], [2, "2px"], [3, "3px"], [4, "4px"]])}${sel("pg.dash", G.borderStyle === "dashed" ? "dash" : "solid", [["solid", "Solid"], ["dash", "Dashed"]])}</span></div>
        <div class="h">BACKGROUND</div>${chk("pg.fill", G.style !== "stroke", "Fill the shape")}${colorRow("Colour", "pg.color", G.color)}<div class="f"><span>Opacity</span><span><input type="range" min="0" max="100" data-op value="${Math.round(((parseInt(String(G.color).slice(7, 9), 16) || 38) / 255) * 100)}"></span></div>`;
      else if (isPos) h += `<div class="h">YOUR ACCOUNT (for position size)</div><div class="f"><span>Account size</span><span><input type="number" min="0" step="any" data-n="acct" value="${e.acct ?? 100000}"></span></div>
        <div class="f"><span>Risk per trade</span><span><input type="number" min="0" step="0.1" data-n="risk" value="${e.risk ?? 1}"> ${sel("riskT", e.riskT || "pct", [["pct", "% of account"], ["amt", "amount"]])}</span></div>
        <p class="note">Labels then show the quantity and the profit / loss at the target and stop.</p>`;
      else {
        h += `<div class="h">LINE</div>${colorRow("Colour", "ln.color", L.color)}<div class="f"><span>Width · style</span><span>${sel("ln.size", L.size, [[1, "1px"], [2, "2px"], [3, "3px"], [4, "4px"]])}${sel("ln.dash", lineStyle(L), [["solid", "Solid"], ["dash", "Dashed"], ["dot", "Dotted"]])}</span></div>`;
        if (["horizontalStraightLine", "horizontalRayLine"].includes(name)) h += `<div class="h">PRICE SCALE</div>${chk("e.axis", e.axis !== false, "Price label on the scale, in the line's colour")}`;
        if (seg) h += `<div class="h">ENDS</div>${chk("e.extL", e.extL ?? name === "straightLine", "Extend left")}${chk("e.extR", e.extR ?? (name !== "segment"), "Extend right")}${chk("e.arrL", e.arrL, "Left end arrow")}${chk("e.arrR", e.arrR, "Right end arrow")}${chk("e.mid", e.mid, "Middle point")}
          <div class="h">STATS</div>${chk("e.stats", e.stats, "Show price change, %, bars, days and angle")}`;
      }
      return h;
    }
    if (t === "text") {
      const T = name === "tvText" ? { text: e.text || "", ts: e.size || 14, ...e } : e;
      return `<textarea class="kttext" rows="3" maxlength="300" data-t placeholder="Text shown on the drawing">${esc(T.text || "")}</textarea>
        ${colorRow("Colour", "e.tc", T.tc || cur.styles?.text?.color || L.color)}
        <div class="f"><span>Size</span><span>${sel("e.ts", T.ts || 13, [10, 11, 12, 13, 14, 16, 20, 24, 28, 36].map((v) => [v, v]))}</span></div>
        ${chk("e.tb", T.tb, "<b>Bold</b>")}${chk("e.ti", T.ti, "<i>Italic</i>")}
        ${name === "tvText" ? "" : `<div class="f"><span>Position</span><span>${sel("e.tpos", e.tpos || "center", [["left", "Left"], ["center", "Centre"], ["right", "Right"]])}${sel("e.tv", e.tv || (isShape ? "middle" : "above"), isShape ? [["top", "Top"], ["middle", "Middle"], ["bottom", "Bottom"]] : [["above", "Above the line"], ["below", "Below the line"]])}</span></div>`}`;
    }
    if (t === "coords") {
      const P = cur.points || [], intra = [0, 1, 2, 6, 7, 8, 9, 10, 11].includes(kc.period ?? 3);
      const dt = (ts) => { const d = new Date(ts); const z = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}${intra ? `T${z(d.getHours())}:${z(d.getMinutes())}` : ""}`; };
      return P.map((p, i) => `<div class="h">POINT ${i + 1}</div><div class="f"><span>Price</span><span><input type="number" step="any" data-pv="${i}" value="${Number(p.value).toFixed(4).replace(/\.?0+$/, "")}"></span></div>
        <div class="f"><span>${intra ? "Date and time" : "Date"}</span><span><input type="${intra ? "datetime-local" : "date"}" data-pt="${i}" value="${p.timestamp ? dt(p.timestamp) : ""}"></span></div>`).join("") || `<p class="note">This drawing has no points.</p>`;
    }
    const vis = cur.ui?.vis || {};
    return `<p class="note" style="margin:6px 0 8px">Show this drawing on these timeframes:</p>${KT_TF.map(([k, l]) => chk(`v.${k}`, vis[k] ?? true, l)).join("")}`;
  };
  const m = kcModal(`<div class="kwh"><b>${esc(KT_NAME[name] || name)}</b><button class="x" data-a="cancel">✕</button></div><div class="kwt"></div><div class="kwb ktset"></div>
    <div class="kwf"><details class="kwdd"><summary>Template ▾</summary><div><button data-a="savedef">Save as my default for ${esc(KT_NAME[name] || name)}</button><button data-a="usedef" ${ktDefs()[name] ? "" : "disabled"}>Apply my default</button><button data-a="reset">Reset to the original look</button></div></details>
      <span class="sp"></span><button class="c" data-a="cancel">Cancel</button><button class="ok" data-a="ok">Ok</button></div>`, "kwind");
  const draw = () => { m.querySelector(".kwt").innerHTML = tabs.map(([k, l]) => `<button class="${k === t ? "on" : ""}" data-tab="${k}">${l}</button>`).join(""); m.querySelector(".ktset").innerHTML = body(); };
  draw();
  const setE = (k, v) => { cur.extendData = { ...ext(), [k]: v }; };
  const setL = (patch) => { cur.styles = { ...(cur.styles || {}), line: { ...ln(), ...patch } }; };
  const setG = (patch) => { cur.styles = { ...(cur.styles || {}), polygon: { ...pg(), ...patch }, circle: { ...(cur.styles?.circle || {}), ...(patch.color ? { color: patch.color } : {}), ...(patch.borderColor ? { borderColor: patch.borderColor } : {}), ...(patch.borderSize ? { borderSize: patch.borderSize } : {}), ...(patch.style ? { style: patch.style } : {}) } }; };
  const alpha = (hex, pct) => `${String(hex).slice(0, 7)}${Math.round((pct / 100) * 255).toString(16).padStart(2, "0")}`;
  const onField = (el) => {
    const d = el.dataset;
    if (d.c || d.cs) { const [k, v] = d.cs ? d.cs.split(":") : [d.c, el.value];
      if (k === "ln.color") setL({ color: v }); else if (k === "pg.borderColor") setG({ borderColor: v });
      else if (k === "pg.color") setG({ color: alpha(v, Number(m.querySelector("[data-op]")?.value ?? 15)) }); else if (k === "e.tc") setE("tc", v); }
    else if (d.op !== undefined) setG({ color: alpha(pg().color, Number(el.value)) });
    else if (d.s) { const v = el.value;
      if (d.s === "ln.size") setL({ size: +v }); else if (d.s === "ln.dash") setL({ style: v === "solid" ? "solid" : "dashed", dashedValue: v === "dot" ? [1, 3] : [6, 4] });
      else if (d.s === "pg.borderSize") setG({ borderSize: +v }); else if (d.s === "pg.dash") setG({ borderStyle: v === "dash" ? "dashed" : "solid", borderDashedValue: [6, 4] });
      else if (d.s === "riskT") setE("riskT", v); else if (d.s.startsWith("e.")) setE(d.s.slice(2), /^\d+$/.test(v) ? +v : v); }
    else if (d.k) { const v = el.checked;
      if (d.k === "pg.fill") setG({ style: v ? "stroke_fill" : "stroke" }); else if (d.k.startsWith("e.")) setE(d.k.slice(2), v);
      else if (d.k.startsWith("v.")) { cur.ui = { ...(cur.ui || {}), vis: { ...(cur.ui?.vis || {}), [d.k.slice(2)]: v } }; } }
    else if (d.n) setE(d.n, Number(el.value));
    else if (d.t !== undefined) { if (name === "tvText") cur.extendData = { ...ext(), text: el.value || "Text" }; else setE("text", el.value); }
    else if (d.pv !== undefined || d.pt !== undefined) {
      const i = +(d.pv ?? d.pt), P = clone(cur.points || []); if (!P[i]) return;
      if (d.pv !== undefined && Number.isFinite(+el.value)) P[i].value = +el.value;
      if (d.pt !== undefined && el.value) { const ts = new Date(el.value).getTime(); if (Number.isFinite(ts)) { const list = c.getDataList(); let best = list[0]?.timestamp ?? ts; list.forEach((b) => { if (Math.abs(b.timestamp - ts) < Math.abs(best - ts)) best = b.timestamp; }); P[i].timestamp = best; } }
      cur.points = P;
    }
    if (name === "tvText" && (d.s === "e.ts")) cur.extendData = { ...ext(), size: +el.value };
    live();
  };
  m.addEventListener("input", (e) => onField(e.target));
  m.addEventListener("change", (e) => { if (e.target.matches("select,input[type=checkbox],input[type=date],input[type=datetime-local]")) onField(e.target); });
  m.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.tab) { t = b.dataset.tab; draw(); return; }
    if (b.dataset.cs) { onField(b); draw(); return; }
    const a = b.dataset.a; if (!a) return;
    if (a === "savedef") { const d = ktDefs(); d[name] = { styles: cur.styles || {}, extendData: ["tvText", "simpleAnnotation", "simpleTag", "fibonacciLine"].includes(name) ? undefined : (() => { const { text: _t, ...rest } = ext(); return rest; })() }; safe(() => localStorage.setItem("ic_ktdef", JSON.stringify(d))); toast(`Saved as your default ${esc(KT_NAME[name] || name)}`); b.closest("details")?.removeAttribute("open"); return; }
    if (a === "usedef") { const d = ktDefs()[name]; if (d) { cur.styles = clone(d.styles || {}); if (d.extendData) cur.extendData = { ...ext(), ...d.extendData }; live(); draw(); } b.closest("details")?.removeAttribute("open"); return; }
    if (a === "reset") { cur.styles = {}; if (!["tvText", "simpleAnnotation", "simpleTag", "fibonacciLine"].includes(name)) cur.extendData = ext().text ? { text: ext().text } : undefined; c.overrideOverlay({ id, styles: { line: { style: "solid", smooth: false, size: 1, color: "#2962FF", dashedValue: [2, 2] } } }); live(); draw(); b.closest("details")?.removeAttribute("open"); return; }
    if (a === "cancel") { ktApply(id, before); ktFloat(); m.remove(); return; }
    if (a === "ok") { kc.ov.set(id, clone(cur)); if (JSON.stringify(before) !== JSON.stringify(cur)) { kc.hist.push({ t: "edit", id, before }); kc.redo = []; } kcSave(); ktFloat(); m.remove(); }
  });
}
// ----- Object tree: every indicator and drawing on this chart (show / hide, lock, settings, remove; click = select) -----
function ktTreeToggle() {
  kc.treeOpen = !kc.treeOpen;
  kc.box?.classList.toggle("tree", kc.treeOpen); ktTree(); render(false);
  requestAnimationFrame(() => kc.chart?.resize());
}
function ktTree() {
  const el = kc.box?.querySelector(".ktree"); if (!el) return;
  el.hidden = !kc.treeOpen; if (!kc.treeOpen) return;
  const c = kc.chart, list = [...kc.ov.entries()].reverse(), tf = ktTfNow();
  const ind = (kc.active || []).map((a) => `<div class="tr2"><span class="ic">${chI("fx", 16)}</span><span class="nm">${esc(IND_NAME[a.name] || a.name)}<small>${esc((a.params || []).join(" "))}</small></span>
      <button data-ti="eye:${esc(a.name)}" title="${a.hidden ? "Show" : "Hide"}">${ti(a.hidden ? "eyeoff" : "eye", 16)}</button><button data-ti="set:${esc(a.name)}" title="Settings">${ti("gear", 16)}</button><button data-ti="del:${esc(a.name)}" title="Remove">${ti("trash", 16)}</button></div>`).join("");
  const dr = list.map(([id, p]) => { const ui = p.ui || {}, off = ui.hidden || (ui.vis && ui.vis[tf] === false), o = c?.getOverlayById(id), lock = o?.lock ?? p.lock, txt = p.name === "tvText" || p.name === "simpleAnnotation" ? (typeof p.extendData === "string" ? p.extendData : p.extendData?.text) : p.extendData?.text;
    return `<div class="tr2${kc.sel === id ? " on" : ""}${off ? " off" : ""}" data-tsel="${esc(id)}"><span class="ic">${ti(p.name, 16)}</span><span class="nm">${esc(KT_NAME[p.name] || p.name)}${txt ? `<small>“${esc(String(txt).slice(0, 24))}”</small>` : ""}${ui.vis && ui.vis[tf] === false ? "<small>hidden on this timeframe</small>" : ""}${ui.alert?.on ? `<small class="al">🔔 alert</small>` : ""}</span>
      <button data-td="eye:${esc(id)}" title="${ui.hidden ? "Show" : "Hide"}">${ti(ui.hidden ? "eyeoff" : "eye", 16)}</button><button data-td="lock:${esc(id)}" title="${lock ? "Unlock" : "Lock"}" class="${lock ? "on" : ""}">${ti(lock ? "lock" : "unlock", 16)}</button><button data-td="set:${esc(id)}" title="Settings">${ti("gear", 16)}</button><button data-td="del:${esc(id)}" title="Remove">${ti("trash", 16)}</button></div>`; }).join("");
  el.innerHTML = `<div class="th"><b>Object tree</b><button data-tt="close" title="Close">✕</button></div>
    <div class="tbody"><small>INDICATORS · ${(kc.active || []).length}</small>${ind || `<p class="note">None. Press Indicators to add one.</p>`}
    <small>DRAWINGS · ${kc.ov.size}</small>${dr || `<p class="note">No drawings on ${esc(kc.sym || "this chart")} yet.</p>`}</div>
    ${kc.ov.size ? `<div class="tf"><button data-tt="hide">${kc.hideAll ? "Show all" : "Hide all"}</button><button data-tt="lock">Lock / unlock all</button><button data-tt="clr">Remove all</button></div>` : ""}`;
}
function ktTreeClick(e) {
  const b = e.target.closest("button,[data-tsel]"); if (!b) return;
  const c = kc.chart; if (!c) return;
  if (b.dataset.tt) { const a = b.dataset.tt; if (a === "close") return ktTreeToggle(); if (a === "hide" || a === "lock") return ktOption(a, b); if (a === "clr") { kcAction("clr"); return; } }
  if (b.dataset.ti) { const [a, n] = b.dataset.ti.split(":"), x = kc.active.find((y) => y.name === n); if (!x) return;
    if (a === "eye") { x.hidden = !x.hidden; kcVisApply(); prefs().list = kc.active.map(({ paneId: _, ...y }) => y); kcSavePrefs(); }
    else if (a === "set") indWindow(n); else if (a === "del") kcRemoveInd(n);
    ktTree(); return; }
  if (b.dataset.td) { e.stopPropagation(); const [a, id] = [b.dataset.td.slice(0, b.dataset.td.indexOf(":")), b.dataset.td.slice(b.dataset.td.indexOf(":") + 1)], p = kc.ov.get(id); if (!p) return;
    if (a === "eye") { p.ui = { ...(p.ui || {}), hidden: !p.ui?.hidden }; ktApplyVis(); kcSave(); }
    else if (a === "lock") { const lk = !(c.getOverlayById(id)?.lock); c.overrideOverlay({ id, lock: lk }); p.lock = lk; kcSave(); }
    else if (a === "set") { kc.sel = id; ktSettings(id); }
    else if (a === "del") c.removeOverlay(id);
    ktTree(); return; }
  if (b.dataset.tsel) { const id = b.dataset.tsel, p = kc.ov.get(id); kc.sel = id; ktFloat(); ktTree();
    const ts = p?.points?.[0]?.timestamp; if (ts) { const r = c.getVisibleRange(), list = c.getDataList(), first = list[r.from]?.timestamp, last = list[Math.min(list.length - 1, r.to - 1)]?.timestamp; if (!(ts >= first && ts <= last)) c.scrollToTimestamp(ts); } }
}

// ----- Compare symbols (round 47): extra lines on the price chart, all measured in % from the first candle on screen -----
const CMP_COL = ["#FF9800", "#2962FF", "#E91E63", "#00BCD4", "#9C27B0"];
const cmpList = () => (kc.cmp ||= safe(() => JSON.parse(localStorage.getItem("ic_cmp") || "[]"), []) || []);
const cmpSave = () => safe(() => localStorage.setItem("ic_cmp", JSON.stringify(cmpList())));
const cmpKey = (ts, timespan) => { const d = new Date(ts); return ["day", "week", "month"].includes(timespan) ? (timespan === "month" ? d.toISOString().slice(0, 7) : d.toISOString().slice(0, 10)) : Math.round(ts / 60000); };
async function kcCmpApply() {   // fetch each compared symbol for the timeframe on screen, line its candles up with ours, draw
  const c = kc.chart; if (!c) return;
  const list = c.getDataList(), per = KC_PERIODS[kc.period ?? 3], [rng, itv, join] = KC_RANGE[per.timespan + per.multiplier] || ["10y", "1d", 1], seq = (kc.cmpSeq = (kc.cmpSeq || 0) + 1);
  const cl = cmpList();
  for (let i = cl.length; i < CMP_COL.length; i++) if (kc.cmpOn?.[i]) { c.removeIndicator("candle_pane", `TV_CMP${i + 1}`); kc.cmpOn[i] = 0; }
  if (!cl.length || !list.length) { if (kc.cmpPct !== undefined) { kc.pct = kc.cmpPct; kc.cmpPct = undefined; kcStyle(); render(false); } return; }
  if (kc.cmpPct === undefined) { kc.cmpPct = kc.pct; kc.pct = true; kc.log = false; kcStyle(); }
  kc.cmpData ||= {};
  for (let i = 0; i < cl.length; i++) {
    const x = cl[i], key = `${x.y}|${rng}|${itv}`;
    if (!kc.cmpData[key]) { const { data } = await sb.rpc("get_candles", { sym: x.y, rng, itv }); if (seq !== kc.cmpSeq) return; kc.cmpData[key] = data || {}; }
    const d = kc.cmpData[key]; let bars = (d.t || []).map((t, j) => ({ timestamp: t * 1000, open: d.o?.[j], high: d.h?.[j], low: d.l?.[j], close: d.c?.[j], volume: d.v?.[j] || 0 })).filter((b) => typeof b.close === "number");
    if (join > 1) bars = kcJoin(bars, join, per.timespan === "month", d.meta?.gmtoffset);
    const m = new Map(bars.map((b) => [cmpKey(b.timestamp, per.timespan), b.close]));
    const closes = list.map((b) => m.get(cmpKey(b.timestamp, per.timespan)) ?? null);
    for (let j = 1; j < closes.length; j++) if (closes[j] === null && closes[j - 1] !== null && ["day", "week", "month"].includes(per.timespan)) closes[j] = closes[j - 1];   // holidays: carry the last close
    const ext = { sym: x.t, color: x.color, closes, base: c.getVisibleRange().from };
    if (kc.cmpOn?.[i]) c.overrideIndicator({ name: `TV_CMP${i + 1}`, extendData: ext }, "candle_pane");
    else { c.createIndicator({ name: `TV_CMP${i + 1}`, extendData: ext, styles: { lines: [LN(x.color, 2)] } }, true, { id: "candle_pane" }); (kc.cmpOn ||= [])[i] = 1; }
  }
  render(false);
}
function kcCmpRebase() {   // the % start point follows the first candle on screen (like TradingView)
  const c = kc.chart; if (!c || !kc.cmpOn?.some(Boolean)) return;
  const from = c.getVisibleRange().from;
  cmpList().forEach((x, i) => { if (!kc.cmpOn[i]) return; const ind = c.getIndicatorByPaneId("candle_pane", `TV_CMP${i + 1}`); const e = ind?.extendData; if (e && e.base !== from) c.overrideIndicator({ name: `TV_CMP${i + 1}`, extendData: { ...e, base: from } }, "candle_pane"); });
}
function kcCompareWindow() {
  const m = kcModal(`<div class="kwh"><b>Compare symbol</b><button class="x" data-k="close">✕</button></div><div class="kws"><input placeholder="Search  e.g. SMH, SPY, AMD, BTC, gold" autofocus></div>
    <div class="kwb cmpw"><div class="cur"></div><div class="res"></div></div><div class="kwf"><span class="note" style="margin:0">Up to ${CMP_COL.length}. The chart switches to % so every line starts at 0% on the left.</span><span class="sp"></span><button class="ok" data-k="close">Done</button></div>`);
  const cur = () => { const cl = cmpList(); m.querySelector(".cur").innerHTML = cl.length ? `<div class="h">ON THE CHART</div>${cl.map((x, i) => `<div class="f"><span><i class="dot" style="background:${x.color}"></i><b>${esc(x.t)}</b> <small>${esc(x.n || "")}</small></span><button class="c" data-rm="${i}">Remove</button></div>`).join("")}` : `<p class="note">Nothing compared yet. Search a symbol above.</p>`; };
  let seq = 0;
  const search = async (q) => {
    const my = ++seq, box = m.querySelector(".res");
    if (!q.trim()) { box.innerHTML = `<div class="h">SUGGESTED</div>${[["SPY", "S&P 500 ETF"], ["QQQ", "Nasdaq 100 ETF"], ["SMH", "Semiconductor ETF"], ["^SET.BK", "SET index"], ["GC=F", "Gold"], ["BTC-USD", "Bitcoin"]].map(([y, n]) => `<button class="li" data-add="${esc(y)}" data-n="${esc(n)}"><b>${esc(plainOf(y))}</b><small>${esc(n)}</small></button>`).join("")}`; return; }
    const { data } = await sb.rpc("search_symbols", { q: q.trim() }); if (my !== seq) return;
    box.innerHTML = (Array.isArray(data) ? data : []).slice(0, 12).map((r) => `<button class="li" data-add="${esc(r.symbol)}" data-n="${esc(cleanName(r.name))}"><b>${esc(plainOf(r.symbol))}</b><small>${esc(cleanName(r.name))} · ${esc(r.exchange)}</small></button>`).join("") || `<p class="note">No match.</p>`;
  };
  cur(); search("");
  m.querySelector("input").addEventListener("input", (e) => { clearTimeout(m._t); m._t = setTimeout(() => search(e.target.value), 250); });
  m.addEventListener("click", (e) => {
    const b = e.target.closest("[data-add],[data-rm],[data-k]"); if (!b) return;
    if (b.dataset.k === "close") { m.remove(); return; }
    const cl = cmpList();
    if (b.dataset.add) { const y = b.dataset.add; if (y === yahoo(kc.sym) || cl.some((x) => x.y === y)) return; if (cl.length >= CMP_COL.length) { toast(`Up to ${CMP_COL.length} symbols`); return; }
      const used = cl.map((x) => x.color); cl.push({ y, t: plainOf(y), n: b.dataset.n || "", color: CMP_COL.find((c) => !used.includes(c)) || CMP_COL[0] }); }
    if (b.dataset.rm !== undefined) { cl.splice(+b.dataset.rm, 1); kc.cmpOn = (kc.cmpOn || []).map(() => 0); CMP_COL.forEach((_, i) => kc.chart?.removeIndicator("candle_pane", `TV_CMP${i + 1}`)); }
    cmpSave(); cur(); kcCmpApply();
  });
}

// "Alert" button (Alt+A): a price alert from the chart, sent to Telegram by the robot (same table as Settings -> Price alerts)
function kcAlertWindow() {
  const c = kc.chart, t = kc.sym; if (!c || !t) return;
  const last = c.getDataList().at(-1)?.close ?? 0;
  const m = kcModal(`<div class="kwh"><b>Create alert on ${esc(t)}</b><button class="x" data-k="close">✕</button></div><div class="kwb">
    <div class="f"><span>Condition</span><span><select data-ak><option value="above">Price goes above</option><option value="below">Price goes below</option><option value="move">Moves ± % in a day</option></select></span></div>
    <div class="f"><span>Value</span><span><input type="number" step="any" data-av value="${last ? Number(last).toFixed(2) : ""}"></span></div>
    <p class="note" style="margin:8px 0 0">Now ${fmtPx(last)}. Checked about every 30 minutes, sent once to Telegram.</p></div>
    <div class="kwf"><span class="sp"></span><button class="c" data-k="close">Cancel</button><button class="ok" data-k="ok">Create</button></div>`);
  m.addEventListener("click", async (e) => {
    const k = e.target.closest("[data-k]")?.dataset.k; if (!k) return;
    if (k === "ok") {
      const kind = m.querySelector("[data-ak]").value, v = Number(m.querySelector("[data-av]").value);
      if (!Number.isFinite(v) || v <= 0) { toast("Type a price above zero"); return; }
      const { error } = await sb.from("price_alerts").insert({ user_id: state.user.id, ticker: t, kind, value: +v.toFixed(4) });
      toast(error ? `Alert not saved: ${esc(error.message)}` : `Alert set: ${esc(t)} ${kind === "move" ? `moves ±${v}%` : `${kind} ${fmtPx(v)}`} (Telegram)`);
      state.alerts = undefined;
    }
    m.remove();
  });
}

// ----- windows: Indicators, indicator settings, Fibonacci settings, right-click menu -----
function kcModal(html, cls = "") {
  document.querySelector(".kcmodal")?.remove();
  const m = document.createElement("div"); m.className = "kcmodal"; m.innerHTML = `<div class="kcwin ${cls}">${html}</div>`;
  m.addEventListener("mousedown", (e) => { if (e.target === m) m.remove(); });
  document.body.appendChild(m);
  return m;
}
function indListWindow() {
  const p = prefs(); let cat = "fav", q = "";
  const m = kcModal(`<div class="kwh"><b>Indicators</b><button class="x" data-k="close">✕</button></div><div class="kws"><input placeholder="Search  e.g. RSI, MACD, Bollinger" autofocus></div><div class="kwb ind"><div class="cats"></div><div class="ls"></div></div>`, "kwind");
  const draw = () => {
    const all = Object.values(IND_CAT).flat(), on = new Set(kc.active.map((a) => a.name));
    const list = q ? all.filter((n) => (IND_NAME[n] + " " + n).toLowerCase().includes(q)) : cat === "fav" ? p.fav.filter((n) => IND_NAME[n]) : cat === "all" ? all : IND_CAT[cat];
    m.querySelector(".cats").innerHTML = `<small>PERSONAL</small><button data-cat="fav" class="${cat === "fav" && !q ? "on" : ""}">★ Favourites</button><small>BUILT-IN</small>${["all", ...Object.keys(IND_CAT)].map((c) => `<button data-cat="${c}" class="${cat === c && !q ? "on" : ""}">${c === "all" ? "All" : c}</button>`).join("")}`;
    m.querySelector(".ls").innerHTML = list.map((n) => `<div class="li" data-add="${n}"><button class="star${p.fav.includes(n) ? " on" : ""}" data-fav="${n}" title="Favourite">${p.fav.includes(n) ? "★" : "☆"}</button><span>${esc(IND_NAME[n])}</span><em>${on.has(n) ? "added ✓" : isMain(n) ? "on price" : "own pane"}</em></div>`).join("")
      + (cat === "fav" && !q ? IND_SOON.map(([n, w]) => `<div class="li no"><button class="star on" disabled>★</button><span>${esc(n)}</span><em>${esc(w)}</em></div>`).join("") : "")
      || `<p class="note" style="margin:14px">Nothing found.</p>`;
  };
  draw();
  m.querySelector("input").addEventListener("input", (e) => { q = e.target.value.trim().toLowerCase(); draw(); });
  m.addEventListener("click", (e) => {
    const b = e.target.closest("[data-k],[data-cat],[data-fav],[data-add]"); if (!b) return;
    if (b.dataset.k === "close") return m.remove();
    if (b.dataset.cat) { cat = b.dataset.cat; q = ""; m.querySelector("input").value = ""; return draw(); }
    if (b.dataset.fav) { const n = b.dataset.fav; p.fav = p.fav.includes(n) ? p.fav.filter((x) => x !== n) : [...p.fav, n]; kcSavePrefs(); return draw(); }
    if (b.dataset.add) { const n = b.dataset.add; if (kc.active.some((a) => a.name === n)) { toast(`${esc(IND_NAME[n])} is already on the chart. Use its ⚙ to change it.`); return; }
      kcAddInd({ name: n, ...clone(p.def[n] || IND_DEF[n] || { params: [] }) }); draw(); }
  });
}
const SRC = ["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"];
function indWindow(name) {
  const a = kc.active.find((x) => x.name === name); if (!a) return;
  const e = clone({ params: a.params, ext: a.ext, style: a.style, hideOn: a.hideOn || [] }); let tab = "in";
  const p = prefs();
  const m = kcModal(`<div class="kwh"><b>${esc(IND_NAME[name] || name)}</b><button class="x" data-k="close">✕</button></div><div class="kwt"></div><div class="kwb"></div>
    <div class="kwf"><details class="kwdd"><summary>Defaults</summary><div><button data-k="tvdef">Reset to TradingView default</button><button data-k="mydef">Save as my default</button><button data-k="myreset"${p.def[name] ? "" : " disabled"}>Reset to my default</button></div></details><span class="sp"></span><button class="c" data-k="close">Cancel</button><button class="ok" data-k="ok">Ok</button></div>`, "kwset");
  const num = (k, v, lab) => `<label class="f">${lab}<input type="number" data-p="${k}" value="${v}" min="1" max="500"></label>`;
  const sel = (k, v, opts, lab) => `<label class="f">${lab}<select data-x="${k}">${opts.map((o) => `<option ${o === v ? "selected" : ""}>${o}</option>`).join("")}</select></label>`;
  const ck = (k, v, lab, extra = "") => `<label class="f"><span class="ck"><input type="checkbox" data-s="${k}" ${v ? "checked" : ""}>${lab}</span>${extra ? `<span>${extra}</span>` : ""}</label>`;
  const col = (k, v) => `<input type="color" data-c="${k}" value="${v}">`;
  const wid = (k, v) => `<select data-w="${k}">${[1, 2, 3, 4].map((n) => `<option ${n === v ? "selected" : ""} value="${n}">${n}px</option>`).join("")}</select>`;
  const draw = () => {
    m.querySelector(".kwt").innerHTML = [["in", "Inputs"], ["st", "Style"], ["vi", "Visibility"]].map(([k, l]) => `<button class="${k === tab ? "on" : ""}" data-tab="${k}">${l}</button>`).join("");
    const x = e.ext;
    let h = "";
    if (tab === "in") {
      if (name === "TV_MACD") h = sel("src", x.src, SRC, "Source") + num(0, e.params[0], "Fast length") + num(1, e.params[1], "Slow length") + num(2, e.params[2], "Signal length") + sel("osc", x.osc, ["EMA", "SMA"], "Oscillator MA type") + sel("sig", x.sig, ["EMA", "SMA"], "Signal MA type");
      else if (name === "TV_RSI") h = `<div class="h">RSI SETTINGS</div>` + num(0, e.params[0], "RSI length") + sel("src", x.src, SRC, "Source") + `<div class="h">SMOOTHING</div>` + sel("smooth", x.smooth, ["None", "SMA", "SMA + Bollinger Bands", "EMA", "RMA", "WMA"], "Type") + num(1, e.params[1], "Length") + num(2, e.params[2], "BB StdDev");
      else if (name === "TV_VOL") h = num(0, e.params[0], "MA length") + ck("prev", x.prev, "Colour based on previous close");
      else h = (e.params.length ? e.params.map((v, i) => num(i, v, (IND_INPUTS[name] || [])[i] || `Input ${i + 1}`)).join("") : `<p class="note">This one has no inputs.</p>`)
        + (IND_FLAGS[name] || []).map(([k, l]) => ck(k, x?.[k], l)).join("");
    } else if (tab === "st") {
      if (name === "TV_MACD") h = ck("hist", x.show.hist, "Histogram") + ["h0|Growing above zero", "h1|Falling above zero", "h2|Growing below zero", "h3|Falling below zero"].map((s) => { const [k, l] = s.split("|"); return `<label class="f in">${l}<span>${col(k, x.col[k])}</span></label>`; }).join("")
        + ck("macd", x.show.macd, "MACD", col("macd", x.col.macd) + wid("macd", x.w.macd)) + ck("signal", x.show.signal, "Signal line", col("signal", x.col.signal) + wid("signal", x.w.signal)) + ck("zero", x.show.zero, "Zero line", col("zero", x.col.zero));
      else if (name === "TV_RSI") h = ck("rsi", x.show.rsi, "RSI", col("rsi", x.col.rsi) + wid("rsi", x.w.rsi)) + ck("ma", x.show.ma, "RSI-based MA", col("ma", x.col.ma) + wid("ma", x.w.ma))
        + ck("bands", x.show.bands, "Bands", col("bands", x.col.bands)) + `<label class="f in">Upper · middle · lower<span class="b3">${x.bands.map((v, i) => `<input type="number" data-b="${i}" value="${v}" min="0" max="100">`).join("")}</span></label>` + ck("fill", x.show.fill, "Background fill", col("fill", x.col.fill));
      else if (name === "TV_VOL") h = `<label class="f">Growing${col("up", x.col.up)}</label><label class="f">Falling${col("dn", x.col.dn)}</label>` + ck("showMA", x.showMA, "Volume MA", col("ma", x.col.ma));
      else if (name === "TV_ZZ") h = `<label class="f">Line<span><input type="color" data-x="color" value="${x.color || "#2962FF"}"><select data-x="w">${[1, 2, 3, 4].map((n) => `<option ${n === Number(x.w || 2) ? "selected" : ""} value="${n}">${n}px</option>`).join("")}</select></span></label>`;
      else { const st = (e.style ||= {}); st.lines ||= (kc.chart.getIndicatorByPaneId(a.paneId, name)?.styles?.lines || kc.pro.getStyles().indicator.lines).slice(0, Math.max(1, e.params.length || 3)).map((l) => ({ color: l.color, size: l.size || 1 }));
        h = st.lines.map((l, i) => `<label class="f">Line ${i + 1}<span><input type="color" data-lc="${i}" value="${/^#/.test(l.color) ? l.color.slice(0, 7) : "#2962ff"}"><select data-lw="${i}">${[1, 2, 3, 4].map((n) => `<option ${n === l.size ? "selected" : ""} value="${n}">${n}px</option>`).join("")}</select></span></label>`).join(""); }
    } else h = `<p class="note" style="margin:6px 0 10px">Show this indicator on these candle sizes:</p>` + KC_PERIODS.map((pp) => `<label class="f"><span class="ck"><input type="checkbox" data-v="${pp.text}" ${e.hideOn.includes(pp.text) ? "" : "checked"}>${pp.text === "D" ? "1 day" : pp.text === "W" ? "1 week" : pp.text === "M" ? "1 month" : pp.text}</span></label>`).join("");
    m.querySelector(".kwb").innerHTML = h;
  };
  draw();
  m.addEventListener("change", (ev) => {
    const t = ev.target, d = t.dataset, x = e.ext;
    if (d.p !== undefined) e.params[+d.p] = Math.max(1, Number(t.value) || 1);
    else if (d.x) x[d.x] = t.value;
    else if (d.s) { if (x.show && d.s in x.show) x.show[d.s] = t.checked ? 1 : 0; else x[d.s] = t.checked ? 1 : 0; }
    else if (d.c) x.col[d.c] = t.value;
    else if (d.w) x.w[d.w] = Number(t.value);
    else if (d.b !== undefined) x.bands[+d.b] = Number(t.value);
    else if (d.lc !== undefined) e.style.lines[+d.lc].color = t.value;
    else if (d.lw !== undefined) e.style.lines[+d.lw].size = Number(t.value);
    else if (d.v) e.hideOn = t.checked ? e.hideOn.filter((z) => z !== d.v) : [...e.hideOn, d.v];
  });
  m.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-k],[data-tab]"); if (!b) return;
    if (b.dataset.tab) { tab = b.dataset.tab; return draw(); }
    const k = b.dataset.k;
    if (k === "close") return m.remove();
    if (k === "tvdef" || k === "myreset") { const d = clone(k === "tvdef" ? IND_DEF[name] || { params: [] } : p.def[name]); e.params = d.params; e.ext = d.ext; e.style = d.style; b.closest("details").open = false; return draw(); }
    if (k === "mydef") { p.def[name] = clone({ params: e.params, ext: e.ext, style: e.style }); kcSavePrefs(); toast("Saved as your default for new charts"); b.closest("details").open = false; return; }
    if (k === "ok") { kcUpdateInd(name, { params: e.params, ext: e.ext, style: e.style, hideOn: e.hideOn }); m.remove(); }
  });
}
function fibWindow(id) {
  const ov = kc.chart?.getOverlayById(id); if (!ov) return;
  const p = prefs(); let f = clone(ov.extendData || p.fib);
  const m = kcModal(`<div class="kwh"><b>Fib retracement</b><button class="x" data-k="close">✕</button></div><div class="kwb fib"></div>
    <div class="kwf"><details class="kwdd up"><summary>Template</summary><div class="tl"></div></details><span class="sp"></span><button class="c" data-k="close">Cancel</button><button class="ok" data-k="ok">Ok</button></div>`, "kwfib");
  const draw = () => {
    m.querySelector(".kwb").innerHTML = `<label class="f"><span class="ck"><input type="checkbox" data-t="on" ${f.trend.on ? "checked" : ""}>Trend line</span><span><input type="color" data-t="color" value="${f.trend.color}"><select data-t="dash"><option value="1" ${f.trend.dash ? "selected" : ""}>dashed</option><option value="0" ${f.trend.dash ? "" : "selected"}>solid</option></select></span></label>
      <div class="lv">${f.levels.map(([v, c, on], i) => `<span class="${on ? "" : "off"}"><input type="checkbox" data-l="${i}" ${on ? "checked" : ""}><input type="number" step="0.001" data-lv="${i}" value="${v}"><input type="color" data-lc="${i}" value="${c}"></span>`).join("")}</div>
      <button class="add" data-k="addlv">+ Add level</button>
      <label class="f"><span class="ck"><input type="checkbox" data-o="prices" ${f.prices ? "checked" : ""}>Prices</span></label><label class="f"><span class="ck"><input type="checkbox" data-o="pct" ${f.pct ? "checked" : ""}>Levels as percents</span></label><label class="f"><span class="ck"><input type="checkbox" data-o="axis" ${f.axis === 0 || f.axis === false ? "" : "checked"}>Price labels on the price scale</span></label>
      <label class="f">Font size<select data-o="size">${[10, 11, 12, 14, 16].map((n) => `<option ${n === f.size ? "selected" : ""}>${n}</option>`).join("")}</select></label>`;
    m.querySelector(".tl").innerHTML = `<button data-k="saveT">Save as…</button><button data-k="defT">Apply defaults</button>${Object.keys(p.fibT).map((n) => `<button data-tn="${esc(n)}">${esc(n)}</button>`).join("")}<button data-k="mydefF">Use these for new Fibonacci</button>`;
  };
  draw();
  m.addEventListener("change", (ev) => {
    const t = ev.target, d = t.dataset;
    if (d.t) f.trend[d.t] = d.t === "on" ? (t.checked ? 1 : 0) : d.t === "dash" ? Number(t.value) : t.value;
    else if (d.l !== undefined) { f.levels[+d.l][2] = t.checked ? 1 : 0; t.parentNode.classList.toggle("off", !t.checked); }
    else if (d.lv !== undefined) f.levels[+d.lv][0] = Number(t.value);
    else if (d.lc !== undefined) f.levels[+d.lc][1] = t.value;
    else if (d.o) f[d.o] = d.o === "size" ? Number(t.value) : t.checked ? 1 : 0;
  });
  m.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-k],[data-tn]"); if (!b) return;
    if (b.dataset.tn) { f = clone(p.fibT[b.dataset.tn]); b.closest("details").open = false; return draw(); }
    const k = b.dataset.k;
    if (k === "close") return m.remove();
    if (k === "addlv") { f.levels.push([1.382, "#F23645", 1]); return draw(); }
    if (k === "defT") { f = clone(FIB_FOR_WAVE); b.closest("details").open = false; return draw(); }
    if (k === "saveT") { const n = (prompt("Template name", "My Fibonacci") || "").trim().slice(0, 30); if (n) { p.fibT[n] = clone(f); kcSavePrefs(); draw(); } return; }
    if (k === "mydefF") { p.fib = clone(f); kcSavePrefs(); toast("New Fibonacci drawings will use these levels"); b.closest("details").open = false; return; }
    if (k === "ok") { kc.chart.overrideOverlay({ id, extendData: clone(f) }); const o = kc.chart.getOverlayById(id); if (o) { kc.ov.set(id, kcPlain(o)); kcSave(); } m.remove(); }
  });
}
function kcMenu(e) {
  if (!kc.chart) return;
  e.preventDefault();
  const r = kc.box.getBoundingClientRect(), y = e.clientY - r.top;
  const v = kc.chart.convertFromPixel([{ x: e.clientX - r.left, y }], { paneId: "candle_pane" })?.[0]?.value, px = Number.isFinite(v) ? v : kc.chart.getDataList().at(-1)?.close;
  document.querySelector(".kcctx")?.remove();
  const m = document.createElement("div"); m.className = "kcctx"; m.style.left = Math.min(e.clientX, innerWidth - 250) + "px"; m.style.top = Math.min(e.clientY, innerHeight - 330) + "px";
  const pr = px ? fmtPx(px) : "";
  m.innerHTML = `<button data-m="reset">Reset chart view<span>Alt+R</span></button>${pr ? `<button data-m="alert">Add price alert at ${pr}</button>` : ""}<hr>
    ${pr ? `<button data-m="hline">Horizontal line at ${pr}<span>Alt+H</span></button>` : ""}<button data-m="trend">Trend line<span>Alt+T</span></button><button data-m="fib">Fibonacci retracement<span>Alt+F</span></button><hr>
    <button data-m="ind">Indicators…<span>Alt+I</span></button><button data-m="clr">Remove all drawings</button><button data-m="clri">Remove all indicators</button>`;
  document.body.appendChild(m);
  const close = () => { m.remove(); document.removeEventListener("mousedown", out, true); };
  const out = (ev) => { if (!m.contains(ev.target)) close(); };
  setTimeout(() => document.addEventListener("mousedown", out, true), 0);
  m.addEventListener("click", async (ev) => {
    const k = ev.target.closest("[data-m]")?.dataset.m; if (!k) return;
    close(); kcAction(k, px);
  });
}
async function kcAction(k, px) {
  const c = kc.chart; if (!c) return;
  px ??= kc.lastPrice ?? c.getDataList().at(-1)?.close;
  if (k === "reset") { kcResetView(); render(false); }
  else if (k === "hline" && px) kcAddDone({ name: "horizontalStraightLine", groupId: "drawing_tools", points: [{ value: px, timestamp: c.getDataList().at(-1)?.timestamp }] });
  else if (k === "trend") c.createOverlay({ name: "segment", groupId: "drawing_tools" });
  else if (k === "fib") c.createOverlay({ name: "fibonacciLine", groupId: "drawing_tools" });
  else if (k === "ind") indListWindow();
  else if (k === "clr") c.removeOverlay({ groupId: "drawing_tools" });
  else if (k === "clri") [...kc.active].forEach((a) => kcRemoveInd(a.name));
  else if (k === "alert" && px) {
    const last = c.getDataList().at(-1)?.close ?? px, kind = px >= last ? "above" : "below", t = kc.sym;
    const { error } = await sb.from("price_alerts").insert({ user_id: state.user.id, ticker: t, kind, value: +Number(px).toFixed(4) });
    toast(error ? `Alert not saved: ${esc(error.message)}` : `Alert set: ${esc(t)} ${kind} ${fmtPx(px)} (Telegram)`);
  }
}
function kcToolbar(el) {   // top bar, bottom bar and chart-type menu clicks
  if (el.dataset.kcp !== undefined) return kcSetPeriod(Number(el.dataset.kcp));
  if (el.dataset.kcr) return kcRangeClick(el.dataset.kcr);
  if (el.dataset.kct) { kc.ctype = el.dataset.kct; el.closest("details")?.removeAttribute("open"); kcStyle(); return render(false); }
  const a = el.dataset.kcact;
  if (a === "ind") return indListWindow();
  if (a === "undo" || a === "redo") return kcUndo(a === "redo");
  if (a === "auto") { kcAutoY(); return render(false); }
  if (a === "alertw") return kcAlertWindow();
  if (a === "tree") return ktTreeToggle();
  if (a === "cmp") return kcCompareWindow();
  if (a === "pct" || a === "log") { kc[a] = !kc[a]; if (a === "pct" && kc.pct) kc.log = false; if (a === "log" && kc.log) kc.pct = false; kcStyle(); return render(false); }
  if (a === "shot" && kc.chart) { const url = kc.chart.getConvertPictureUrl(true, "png", isDark() ? "#18181b" : "#ffffff"); const l = document.createElement("a"); l.href = url; l.download = `${kc.sym || "chart"}-${isoDay(new Date())}.png`; l.click(); return; }
  if (a === "full") kcFull();
}
// Shortcuts on a stock chart (not while typing): Alt+T trend line, Alt+F Fibonacci, Alt+H horizontal line, Alt+I indicators, Alt+R reset,
// Delete removes the selected drawing, Ctrl+Z undo, Ctrl+Y (or Ctrl+Shift+Z) redo
document.addEventListener("keydown", (e) => {
  if (!kc.chart || !(location.hash || "").startsWith("#/charts/") || (chOf().pane || "chart") !== "chart" || e.target.closest?.("input, textarea, select, [contenteditable]") || document.querySelector(".kcmodal")) return;
  const k = e.key.toLowerCase();
  if (e.altKey && ["t", "f", "h", "j", "v"].includes(k)) { e.preventDefault(); ktStart({ t: "segment", f: "fibonacciLine", h: "horizontalStraightLine", j: "horizontalRayLine", v: "verticalStraightLine" }[k]); }
  else if (e.altKey && ["i", "r", "a"].includes(k)) { e.preventDefault(); if (k === "a") kcAlertWindow(); else kcAction({ i: "ind", r: "reset" }[k]); }
  else if (e.key === "Escape" && (kc.tool || kc.measureArm)) { e.preventDefault(); ktStart("cursor"); }
  else if (kc.hover && !e.altKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {   // only while the mouse is on the chart
    e.preventDefault();
    if (e.key === "ArrowUp") kcZoomBy(1.15); else if (e.key === "ArrowDown") kcZoomBy(1 / 1.15); else kcScrollBars((e.key === "ArrowLeft" ? 1 : -1) * (e.ctrlKey ? 20 : 1));
  }
  else if ((e.key === "Delete" || e.key === "Backspace") && kc.sel) { e.preventDefault(); kc.chart.removeOverlay(kc.sel); }
  else if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); kcUndo(e.shiftKey); }
  else if ((e.ctrlKey || e.metaKey) && k === "y") { e.preventDefault(); kcUndo(true); }
});
// Full screen (round 46): the whole page goes full screen and the chart box is pinned over it (body.kcfull).
// Page redraws, settings windows, menus and the object tree then all keep working (before, any redraw or window left full screen).
function kcFull() {
  if ((chOf().pane || "chart") !== "chart") { chOf().pane = "chart"; render(false); }
  if (document.body.classList.contains("kcfull")) { document.body.classList.remove("kcfull"); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
  else { document.body.classList.add("kcfull"); document.documentElement.requestFullscreen?.().catch(() => {}); }   // if the browser says no, the chart still fills the window
  setTimeout(() => kc.chart?.resize(), 250);
}
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) document.body.classList.remove("kcfull"); setTimeout(() => kc.chart?.resize(), 200); });
addEventListener("hashchange", () => { if (!(location.hash || "").startsWith("#/charts/") && document.body.classList.contains("kcfull")) { document.body.classList.remove("kcfull"); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("kcfull") && !document.fullscreenElement && !document.querySelector(".kcmodal") && !kc.tool) { document.body.classList.remove("kcfull"); setTimeout(() => kc.chart?.resize(), 200); } });

// ----- Stock heat map page (#/heatmap, design round 40/41): one tile per company, size = company value, colour = today's move -----
const HM_IDX = [["@SP500", "S&P 500"], ["@SET50", "SET50"]];
function squarify(items, x, y, w, h) {   // items sorted big -> small, each {v}; returns rectangles (squarified treemap)
  const out = [], total = items.reduce((a, b) => a + b.v, 0) || 1, k = (w * h) / total;
  let rest = items.map((o) => ({ ...o, a: Math.max(o.v * k, 0.0001) }));
  const worst = (row, len) => { const s = row.reduce((a, b) => a + b.a, 0), mx = Math.max(...row.map((r) => r.a)), mn = Math.min(...row.map((r) => r.a)); return Math.max((len * len * mx) / (s * s), (s * s) / (len * len * mn)); };
  while (rest.length) {
    const len = Math.min(w, h); let row = [rest[0]], i = 1;
    while (i < rest.length && worst([...row, rest[i]], len) <= worst(row, len)) { row.push(rest[i]); i++; }
    const s = row.reduce((a, b) => a + b.a, 0);
    if (w >= h) { const cw = s / h; let yy = y; row.forEach((r) => { const rh = r.a / cw; out.push({ ...r, x, y: yy, w: cw, h: rh }); yy += rh; }); x += cw; w -= cw; }
    else { const rh = s / w; let xx = x; row.forEach((r) => { const rw = r.a / rh; out.push({ ...r, x: xx, y, w: rw, h: rh }); xx += rw; }); y += rh; h -= rh; }
    rest = rest.slice(i);
  }
  return out;
}
const HM_COL = (v) => (v === null ? "var(--chip)" : isDark()
  ? (v >= 3 ? "#0f9d58" : v >= 1 ? "#167a46" : v >= 0.1 ? "#1f5136" : v > -0.1 ? "#3a3a40" : v > -1 ? "#7a2532" : v > -3 ? "#b3263a" : "#e23b4f")
  : (v >= 3 ? "#15803d" : v >= 1 ? "#22a35a" : v >= 0.1 ? "#6cbf8a" : v > -0.1 ? "#a3a3a3" : v > -1 ? "#f08b8b" : v > -3 ? "#e05252" : "#b91c1c"));
async function loadHeatmap() {
  const ch = chOf(), key = ch.hmIdx || "@SP500";
  if (!ch.hm) {
    const { data, error } = await sb.from("stock_stats").select("symbol,data,updated_at").in("symbol", HM_IDX.map((x) => x[0]));
    ch.hm = {}; (data || []).forEach((r) => { ch.hm[r.symbol] = r.data; }); ch.hmErr = error?.message || null;
  }
  const mem = ch.hm[key]?.members || [], fresh = !ch.hmDrawn;
  ch.hmDrawn = true;
  if (!mem.length || Date.now() - (ch.hmAt?.[key] || 0) < 55e3) { if (fresh && (location.hash || "") === "#/heatmap") render("soft"); return; }
  (ch.hmAt ||= {})[key] = Date.now();
  const syms = mem.map((m) => m.s), parts = [];
  for (let i = 0; i < syms.length; i += 40) parts.push(syms.slice(i, i + 40));
  for (let i = 0; i < parts.length; i += 4) {   // 4 at a time, and draw as they arrive
    const res = await Promise.all(parts.slice(i, i + 4).map((p) => sb.rpc("get_quotes", { syms: p })));
    res.forEach(({ data }) => Object.assign(quotes, data || {}));
    if ((location.hash || "") === "#/heatmap") render("soft");
  }
}
function viewHeatmap() {
  const ch = chOf(), key = ch.hmIdx || "@SP500", size = ch.hmSize || "cap", d = ch.hm?.[key], mem = d?.members || [];
  const W = 1000, H = 600;
  let body;
  if (!ch.hm) body = `<div class="chempty">Loading…</div>`;
  else if (!mem.length) body = `<div class="chempty">The heat map list arrives with the robot's next daily run.${ch.hmErr ? ` (${esc(ch.hmErr)})` : ""}</div>`;
  else {
    const groups = {};
    mem.forEach((m) => { const v = size === "cap" ? m.cap || 0 : 1; if (v > 0) (groups[m.sec] ||= []).push({ ...m, v }); });
    const secs = Object.entries(groups).map(([n, l]) => ({ n, l: l.sort((a, b) => b.v - a.v), v: l.reduce((a, b) => a + b.v, 0) })).sort((a, b) => b.v - a.v);
    let html = "";
    squarify(secs, 0, 0, W, H).forEach((b) => {
      const pad = b.h > 40 && b.w > 60 ? 16 : 0;
      html += `<div class="hmsec" style="left:${b.x / W * 100}%;top:${b.y / H * 100}%;width:${b.w / W * 100}%;height:${b.h / H * 100}%"><span>${esc(b.n)}</span></div>`;
      squarify(b.l, b.x, b.y + pad, b.w, Math.max(1, b.h - pad)).forEach((t) => {
        const v = chPct(t.s), q = quotes[t.s];
        html += `<a class="hmt" href="${chHref(plainOf(t.s))}" style="left:${t.x / W * 100}%;top:${t.y / H * 100}%;width:${t.w / W * 100}%;height:${t.h / H * 100}%;background:${HM_COL(v)}"
          title="${esc(t.t)} · ${esc(t.n)}${q ? ` · ${fmtPx(q.price)}` : ""}${v !== null ? ` · ${v > 0 ? "+" : ""}${v.toFixed(2)}%` : ""}${t.cap ? ` · market cap ${bigNum(t.cap)}` : ""}"><span class="in">${evLogo({ sym: plainOf(t.s) }, 40)}<b>${esc(t.t)}</b><small>${v === null ? "" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`}</small></span></a>`;
      });
    });
    body = `<div class="hmtm">${html}</div>`;
  }
  const leg = [["−3%", -4], ["−1%", -2], ["0%", 0], ["+1%", 2], ["+3%", 4]];
  return `${header("charts")}<div class="wrap chp">
    <div class="chlay"><div class="chmain">
      <div class="hmbar"><a class="chback" href="#/charts" title="Charts">‹</a><h1>Stock heat map</h1>
        ${HM_IDX.map(([k, l]) => `<button class="pill${k === key ? " on" : ""}" data-hmidx="${k}">${l}</button>`).join("")}<i></i>
        <span class="lab">Size</span>${[["cap", "Market cap"], ["eq", "Equal"]].map(([k, l]) => `<button class="pill${k === size ? " on" : ""}" data-hmsize="${k}">${l}</button>`).join("")}
        <span class="sp"></span><span class="note" style="margin:0">Colour = today's move · live, every minute</span></div>
      <div class="chc hmwrap">${body}</div>
      <div class="hmleg">${leg.map(([l, v]) => `<span style="background:${HM_COL(v)}">${l}</span>`).join("")}<span class="note" style="margin:0 0 0 10px">${esc(d?.source || "")}${d?.at ? ` · members ${new Date(d.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""} · click a tile to open its chart</span></div>
    </div>${chSide()}</div></div>`;
}

async function toggleChartWatch(t) {
  const s = state.settings, w = [...(s.watchlist || [])], names = { ...(s.watch_names || {}) };
  const has = w.includes(t);
  if (!has && w.length >= MAX_WATCHLIST) { toast(`Your watchlist is full (${MAX_WATCHLIST}). Remove one in Topics & watchlist.`); return; }
  const next = has ? w.filter((x) => x !== t) : [...w, t];
  if (has) delete names[t]; else if (!known(t)) names[t] = cleanName(statsOf(yahoo(t))?.name || kc.meta?.name || quotes[yahoo(t)]?.name || t);
  const { error } = await sb.from("user_settings").update({ watchlist: next, watch_names: names, updated_at: new Date().toISOString() }).eq("user_id", state.user.id);
  if (error) { toast(`Could not save: ${esc(error.message)}`); return; }
  s.watchlist = next; s.watch_names = names;
  toast(has ? `${esc(t)} removed from your watchlist` : `${esc(t)} added to your watchlist ★`);
  render(false);
}

// ---------- views ----------
function header(active) {
  return `<header><div class="wrap nav">
    <a class="logo" href="#/"><i class="lmark" aria-hidden="true"></i>investment center</a>
    <nav>
      <a class="${active === "news" ? "on" : ""}" href="#/">My News</a>
      <a class="${active === "world" ? "on" : ""}" href="#/world">World Brief</a>
      <a class="${active === "charts" ? "on" : ""}" href="#/charts">Charts</a>
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
    <a class="${h.startsWith("#/charts") || h === "#/heatmap" ? "on" : ""}" href="#/charts">${ICO.chart}Charts</a>
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
  ? `<div class="wstk">${s.stocks.map((t) => `<button class="tag clk" data-stock="${esc(t)}" title="Show ${esc(t)} news in My News">${esc(t)} ${chSpan(yahoo(t))}</button>`).join("")}</div>` : ""}</div>` : "");
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

// ---------- price alerts (tier 3): rules saved in Supabase; the robot checks them every ~30 min ----------
const MAX_ALERTS = 20;
const paKind = { move: "moves ±% in a day", above: "goes above", below: "goes below" };
async function loadAlerts() {
  const { data, error } = await sb.from("price_alerts").select("*").order("created_at");
  state.alerts = error ? { error: /price_alerts/.test(error.message) ? "Price alerts need a one-time database update: run supabase/007_full_story.sql in Supabase." : error.message } : data;
  if (location.hash === "#/settings") render(false);
}
function alertsPanel() {
  const a = state.alerts;
  if (a === undefined) return `<p class="note">Loading…</p>`;
  if (a.error) return `<p class="msg err">${esc(a.error)}</p>`;
  const wl = state.settings.watchlist || [];
  const rule = (x) => x.kind === "move" ? `moves ±${esc(x.value)}% in a day` : `${paKind[x.kind]} ${fmtPx(Number(x.value))}`;
  const rows = a.map((x) => `<div class="pa-row ${x.active ? "" : "off"}">
      <b>${esc(x.ticker)}</b><span>${rule(x)}</span>
      <span class="pa-st">${x.active ? "On" : "Sent, now off"}${x.fired_note ? ` · last: ${esc(x.fired_note)} (${ago(x.fired_at)})` : ""}</span>
      ${x.active ? "" : `<button class="btn ghost sm" data-pa-on="${x.id}">Turn on again</button>`}
      <button class="pa-x" data-pa-rm="${x.id}" title="Delete alert" aria-label="Delete alert">×</button></div>`).join("");
  return `${rows || `<p class="note">No alerts yet.</p>`}
    ${wl.length ? `<div class="pa-add">
      <select id="pa-t" aria-label="Stock">${wl.map((t) => `<option>${esc(t)}</option>`).join("")}</select>
      <select id="pa-k" aria-label="When">${Object.entries(paKind).map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select>
      <input id="pa-v" type="number" min="0" step="any" placeholder="5" aria-label="Value">
      <button class="btn" data-pa-add="1" ${a.length >= MAX_ALERTS ? "disabled" : ""}>Add alert</button></div>
      <p class="note">“Moves ±%”: tells you once a day when the stock is up or down that much since yesterday's close. “Above / below”: tells you once, then turns itself off. Sent to Telegram. Checked about every 30 minutes, not instantly; prices may be delayed ~15 min. Saves straight away.</p>`
      : `<p class="note">Add stocks to your watchlist first.</p>`}`;
}

function viewSettings() {
  if (state.alerts === undefined && !state.alertsLoading) { state.alertsLoading = true; loadAlerts().finally(() => { state.alertsLoading = false; }); }
  const d = state.draft;
  const extra = d.watchlist.filter((t) => !known(t));
  const chip = (t) => `<span class="chip on" data-chip="${esc(t)}" title="${esc(d.watch_names[t] || "")}">${esc(t)}<button data-rm="${esc(t)}" title="Remove">×</button></span>`;
  const tchip = (t) => `<span class="chip topic" data-chip="${esc(t)}"># ${esc(t)}<button data-rm-t="${esc(t)}" title="Remove">×</button></span>`;
  const stchip = (t) => `<span class="chip topic" data-chip="${esc(t)}"># ${esc(t)}<button data-rm-st="${esc(t)}" title="Remove">×</button></span>`;
  const none = !d.watchlist.length && !d.custom_topics.length && !d.topics.length;
  return `${header("")}<div class="wrap"><div class="panel">
    <a class="back a" href="#/">← Back to My News</a>
    <h1 class="a" style="margin-top:16px">Topics &amp; watchlist</h1>
    <p class="why a">Search any stock or subject. Saved to your account, so it's the same on every device. Telegram alerts follow these too.</p>
    <div class="search a"><span class="mag">⌕</span><input id="q" placeholder="Search stocks or topics, e.g. tesla, gulf, bitcoin, oil, rare earths…" autocomplete="off" maxlength="40"><div id="res"></div></div>
    <p class="note a">Click the empty search box to browse all topics.</p>
    <h2 class="sec a" style="margin-top:32px">My watchlist &amp; topics</h2>
    <div class="wlist a">${d.watchlist.map(chip).join("")}${d.topics.map(stchip).join("")}${d.custom_topics.map(tchip).join("")}${none ? `<span class="note">Nothing yet. Search above to add stocks or topics.</span>` : ""}</div>
    <p class="note a">Your own topics: ${d.custom_topics.length} of ${MAX_CUSTOM_TOPICS}. Stocks outside the robot's built-in list get their own news search: ${Math.min(extra.length, MAX_EXTRA_TICKERS)} of ${MAX_EXTRA_TICKERS} used${extra.length > MAX_EXTRA_TICKERS ? ` (the rest still match by name, without their own search)` : ""}. These limits keep the robot inside the free tiers.</p>
    <h2 class="sec a" style="margin-top:32px">World places you follow</h2>
    <div class="wlist a">${[...state.follows].filter((k) => k.startsWith("place:")).map((k) => { const key = k.slice(6), [type, name] = key.split(":");
      return `<span class="chip on">🔔 ${esc(name)}${type === "region" ? " (region)" : ""}<button data-follow="place" data-fkey="${esc(key)}" data-flabel="${esc(name)}" title="Stop following">×</button></span>`; }).join("")
      || `<span class="note">None yet. Follow a country or region from any World story, or add one here.</span>`}</div>
    <div class="a placeadd"><input id="placein" list="placelist" placeholder="Country or region, e.g. Japan, Middle East" maxlength="40" autocomplete="off">
      <datalist id="placelist">${[...new Set([...Object.keys(WREG).filter((r) => r !== "Global"), ...(state.world || []).map((x) => x.country).filter((c) => c && c !== "Global")])].sort().map((x) => `<option value="${esc(x)}">`).join("")}</datalist>
      <button class="btn ghost" data-act="place-add">Follow</button></div>
    <p class="note a">Telegram sends each new World story about these places. Saved straight away.</p>
    <h2 class="sec a" style="margin-top:32px">Price alerts</h2>
    <div class="a" id="pa">${alertsPanel()}</div>
    ${(state.settings.muted_topics || []).length || (state.settings.muted_sources || []).length ? `<h2 class="sec a" style="margin-top:32px">Hidden (show less)</h2>
    <div class="wlist a">${(state.settings.muted_topics || []).map((t) => `<span class="chip muted">Topic: ${esc(t)}<button data-unmute-topic="${esc(t)}" title="Show again">×</button></span>`).join("")}${(state.settings.muted_sources || []).map((o) => `<span class="chip muted">Source: ${esc(o)}<button data-unmute-source="${esc(o)}" title="Show again">×</button></span>`).join("")}</div>
    <p class="note a">Hidden from My News and Telegram alerts. News about your watchlist always shows. Press × to show again (saves straight away).</p>` : ""}
    <div class="a" style="margin-top:32px"><button class="btn" data-act="save-settings">Save</button><span id="saved-msg"></span></div>
  </div></div>`;
}

const typeName = (t) => ({ EQUITY: "Stock", ETF: "ETF", INDEX: "Index", CRYPTOCURRENCY: "Crypto", MUTUALFUND: "Fund" }[t] || t || "");
// Thai stocks come back from Yahoo as PTT.BK; the robot and the rest of the site use plain PTT.
// Thai stocks come back as PTT.BK; ones the robot already knows are stored as plain PTT, others keep .BK so prices still work
const cleanSym = (s) => { const u = String(s || "").toUpperCase(), base = u.replace(/\.BK$/, ""); return CFG.tickers.includes(base) ? base : u; };
const cleanName = (n) => String(n || "").replace(/^[A-Z0-9&.-]+_/, ""); // Yahoo's Thai names: "PTT_PTT" -> "PTT"

// Built-in topics that match what you typed: by name or by one of the robot's keywords ("bitcoin" -> Crypto)
function topicMatches(q) {
  const s = q.trim().toLowerCase(), words = CFG.topic_words || {};
  if (!s) return CFG.topics.map((t) => ({ t, hit: "" }));
  // short searches match from the start of a word only ("ai" finds "AI in finance", not "Thai")
  const fits = (text) => { const x = text.toLowerCase(); return x.split(/[^a-z0-9฀-๿]+/).some((w) => w.startsWith(s)) || (s.length >= 3 && x.includes(s)); };
  return CFG.topics.map((t) => {
    if (fits(t)) return { t, hit: "" };
    const k = (words[t] || []).find(fits);
    return k ? { t, hit: k } : null;
  }).filter(Boolean);
}
function topicRows(q, start = 0) {
  const d = state.draft;
  return topicMatches(q).map(({ t, hit }, i) => {
    const have = d.topics.includes(t);
    return `<div class="row ${have ? "dim" : ""}" style="--i:${start + i}" ${have ? "" : `data-stopic-add="${esc(t)}"`}>
      <span class="sym">#</span><span class="nm">${esc(t)}<small>${hit ? `Matches “${esc(hit)}” · ` : ""}${(CFG.topic_words?.[t] || []).length} keywords the robot watches</small></span>
      <span class="kind t">${have ? "ADDED" : "+ TOPIC"}</span></div>`;
  }).join("");
}
// Empty search box: list every built-in topic, so you can browse them like the old checklist
const viewBrowse = () => `<div class="results"><div class="head">TOPICS</div>${topicRows("")}</div>`;

function viewResults(q, list, note = "") {
  const d = state.draft;
  const topic = q.trim().replace(/\s+/g, " ").slice(0, 40);
  const builtIn = topicMatches(topic);
  let i = builtIn.length;
  const stockRows = note
    ? `<div class="row dim"><span class="sym">…</span><span class="nm">${esc(note)}</span><span></span></div>`
    : list.length
      ? list.map((r) => {
          const sym = cleanSym(r.symbol), have = d.watchlist.includes(sym), full = d.watchlist.length >= MAX_WATCHLIST;
          return `<div class="row ${have || full ? "dim" : ""}" style="--i:${i++}" ${have || full ? "" : `data-add="${esc(sym)}" data-name="${esc(cleanName(r.name))}"`}>
            <span class="sym">${esc(sym)}</span><span class="nm">${esc(cleanName(r.name))}<small>${esc(r.exchange)} · ${esc(typeName(r.type))}</small></span>
            <span class="kind">${have ? "ADDED" : full ? "LIST FULL" : "+ WATCH"}</span></div>`;
        }).join("")
      : `<div class="row dim"><span class="sym">—</span><span class="nm">No stock matches “${esc(topic)}”</span><span></span></div>`;
  const haveT = d.custom_topics.some((t) => t.toLowerCase() === topic.toLowerCase()) || d.topics.includes(topic);
  const fullT = d.custom_topics.length >= MAX_CUSTOM_TOPICS;
  const sameAsBuiltIn = CFG.topics.some((t) => t.toLowerCase() === topic.toLowerCase());
  return `<div class="results">${builtIn.length ? `<div class="head">TOPICS</div>${topicRows(topic)}` : ""}
    <div class="head">STOCKS FOUND ONLINE</div>${stockRows}
    ${sameAsBuiltIn ? "" : `<div class="head">OR FOLLOW AS YOUR OWN TOPIC</div>
    <div class="row ${haveT || fullT ? "dim" : ""}" style="--i:${i}" ${haveT || fullT ? "" : `data-topic-add="${esc(topic)}"`}>
      <span class="sym">#</span><span class="nm">${esc(topic)}<small>${fullT && !haveT ? `You already follow ${MAX_CUSTOM_TOPICS} of your own topics. Remove one first.` : "The robot searches the news for this exact phrase"}</small></span>
      <span class="kind t">${haveT ? "ADDED" : "+ TOPIC"}</span></div>`}</div>`;
}

let searchTimer = null, searchSeq = 0;
async function runSearch(q) {
  const seq = ++searchSeq;
  const res = document.getElementById("res");
  if (!res) return;
  res.innerHTML = viewResults(q, [], "Searching…");
  const { data, error } = await sb.rpc("search_symbols", { q });
  if (seq !== searchSeq || !document.getElementById("res")) return; // a newer search started
  document.getElementById("res").innerHTML = viewResults(q, Array.isArray(data) ? data : [],
    error ? "Stock search isn't switched on yet: run supabase/003_search.sql in Supabase." : "");
}

function viewLogin(msg = "", err = false, email = "") {   // design round 31, split 3: market chart on the left, form on the right
  const q = lastQuotes().slice(0, 3);
  const quotes = (q.length ? q : MARKETS.slice(0, 3).map((m) => [m[1], "", ""])).map((x) =>
    `<div class="lq">${esc(x[0])}<b>${esc(x[1] || "·")}</b>${x[2] ? `<span class="${String(x[2]).startsWith("-") ? "d" : "u"}">${esc(x[2])}</span>` : ""}</div>`).join("");
  const line = "M0 240 L50 230 L100 236 L150 200 L200 210 L250 170 L300 182 L350 140 L400 150 L450 96 L500 110 L560 60 L600 50";
  return `<div class="login2 enter">
    <div class="lart"><div class="a"><h2>Markets, news and alerts in one place.</h2><p>Live prices, the stories behind them, and a calendar of what's next.</p></div>
      <svg class="lch" viewBox="0 0 600 300" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="lga" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ff4500" stop-opacity=".3"/><stop offset="1" stop-color="#ff4500" stop-opacity="0"/></linearGradient></defs>
        <line x1="0" y1="75" x2="600" y2="75"/><line x1="0" y1="150" x2="600" y2="150"/><line x1="0" y1="225" x2="600" y2="225"/>
        <path class="ar" d="${line} L600 300 L0 300Z" fill="url(#lga)"/><path class="ln" d="${line}"/></svg>
      <div class="lqs">${quotes}</div></div>
    <div class="lform"><div class="logo a"><i class="lmark" aria-hidden="true"></i><span>investment <em>center</em></span></div>
    <p class="why a" style="margin-top:6px">Sign in to your news.</p>
    <form id="login" class="login-form">
      <input class="a" type="email" id="email" placeholder="Email" autocomplete="username" required value="${esc(email)}">
      <div class="pw a"><input type="password" id="password" placeholder="Password" autocomplete="current-password">
        <button type="button" class="eye" data-act="eye" title="Show password" aria-label="Show password" aria-pressed="false">${EYE}</button></div>
      <label class="remember a"><input type="checkbox" id="remember" ${remember() ? "checked" : ""}> Remember me</label>
      <button class="btn a" type="submit">Sign in</button>
    </form>
    <p class="msg ${err ? "err" : ""}">${esc(msg)}</p>
    <button class="linkbtn a" data-act="magic">Email me a login link instead</button></div></div>`;
}

const friendly = (m) => /invalid login credentials/i.test(m) ? "Wrong email or password."
  : /rate limit/i.test(m) ? "Too many login emails were sent. Wait about an hour, or sign in with your password."
  : /expired|invalid/i.test(m) ? "That login link was already used or has expired. Sign in with your password, or request a new link."
  : m;

// ---------- motion ----------
// Numbers count up from 0 when a page opens (skipped if the device asks for less motion).
function countUp() {
  if (calm()) return;
  app.querySelectorAll("[data-count]").forEach((el) => {
    const end = Number(el.dataset.count);
    if (!Number.isFinite(end)) return;
    const t0 = performance.now(), dur = 700;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
function pop(selector) {
  app.querySelectorAll(selector).forEach((el) => { el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); });
}
let toastTimer = null;
function toast(html, go) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("button"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
  t.innerHTML = html;
  t.onclick = () => { t.classList.remove("show"); if (go) location.hash = go; };
  t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 6000);
}

// ---------- investing motion (design round 15: all 4 intros + 9 motions + extras) ----------
// Every effect is skipped when the device asks for less motion (calm()).

// Opening intro: plays once per visit; the 4 styles take turns (chart line, candles, departure board, ticker tape).
// Add ?intro to the address to see it again. Click or press any key to skip.
const lsGet = (k) => safe(() => localStorage.getItem(k), null), lsSet = (k, v) => safe(() => localStorage.setItem(k, v));
const ssGet = (k) => safe(() => sessionStorage.getItem(k), null), ssSet = (k, v) => safe(() => sessionStorage.setItem(k, v));
function lastQuotes() {
  // Real prices your browser saw last time (no made-up numbers); empty on the very first visit
  return safe(() => JSON.parse(lsGet("ic_last_quotes") || "[]"), []).filter((t) => Array.isArray(t) && t.length === 3).slice(0, 8);
}
function rememberQuotes() {
  const rows = [...MARKETS.map((m) => [m[0], m[1]]), ...(state.settings?.watchlist || []).map((t) => [yahoo(t), t])]
    .filter(([y]) => quotes[y]).slice(0, 10).map(([y, n]) => [n, fmtPx(quotes[y].price), pctTxt(quotes[y])]);
  if (rows.length) lsSet("ic_last_quotes", JSON.stringify(rows));
}
let pageReady = false;   // true once the first real page (news or login) is drawn
function playIntro(now = false) {
  const force = now || /[?&]intro\b/.test(location.search);
  if (calm() || (!force && ssGet("ic_intro_seen"))) return;
  ssSet("ic_intro_seen", "1");
  const ch = charOf(), n = Number(lsGet("ic_intro_n") || 0) % (ch ? 5 : 4);
  lsSet("ic_intro_n", String(n + 1));
  const ticks = lastQuotes(), up = (t) => !String(t[2]).startsWith("-");
  const tk = (t) => `<span><b>${esc(t[0])}</b> ${esc(t[1])} <span class="${up(t) ? "u" : "d"}">${up(t) ? "▲" : "▼"} ${esc(t[2])}</span></span>`;
  const names = ticks.length ? ticks : MARKETS.map((m) => [m[1], "", ""]);
  const el = document.createElement("div");
  el.className = "intro";
  el.setAttribute("aria-hidden", "true");
  let total = 2300;
  if (season) {           // season intro: snow / petals / leaves sweep in and settle, or the sun rises
    el.classList.add("i-s", `s-${season}`);
    total = 2600;
    const kind = { winter: "snow", spring: "petal", autumn: "leaf", summer: "" }[season], leaf = ["#e0702e", "#c2541b", "#d9a13a", "#9c3d12"];
    // wind: spring petals blow left -> right, autumn leaves right -> left, snow falls gently
    const wind = { winter: () => (Math.random() * 2 - 1) * 160, spring: () => 300 + Math.random() * 400, autumn: () => -(250 + Math.random() * 400) }[season];
    const parts = kind ? Array.from({ length: season === "winter" ? 90 : 50 }, (_, k) => `<i class="${kind}" style="left:${season === "spring" ? Math.random() * 70 - 20 : season === "autumn" ? 20 + Math.random() * 90 : Math.random() * 100}%;--dx:${wind()}px;--r:${Math.random() * 720}deg;--lc:${leaf[k % 4]};--d:${1.4 + Math.random() * 1.2}s;--w:${Math.random() * .7}s;--s:${3 + Math.random() * 6}px"></i>`).join("") : "";
    el.innerHTML = `${season === "summer" ? `<div class="ssun"></div>${summerFish()}<div class="swave"></div>${summerSplash()}` : seasonScene(season)}${parts}<div class="sbrand">investment center</div>`;
  } else if (n === 4) {   // E. your mascot rises and holds up the sign with the logo on it
    el.classList.add("i-m");
    total = 2500;
    const b = SIGN[ch] || [.36, .5, .3, .14];
    el.innerHTML = `<div class="mstage"><img src="mascot/${ch}/present.png" alt=""><div class="msign" style="left:${b[0] * 100}%;top:${b[1] * 100}%;width:${b[2] * 100}%;height:${b[3] * 100}%;font-size:calc(min(560px,82vmin) * ${(b[2] / 7.2).toFixed(4)})"><span>investment<br><em>center</em></span></div></div>`;
  } else if (n === 0) {          // A. chart line
    el.classList.add("i-a");
    const p = "M0 160 L70 150 L130 156 L190 120 L250 130 L320 92 L380 104 L450 70 L510 80 L580 44 L640 52 L700 20";
    el.innerHTML = `<svg viewBox="0 0 700 200" preserveAspectRatio="none"><defs><linearGradient id="iga" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#16a34a" stop-opacity=".18"/><stop offset="1" stop-color="#16a34a" stop-opacity="0"/></linearGradient></defs>
      <path class="area" d="${p} L700 200 L0 200Z"/><path class="ln" d="${p}"/><circle class="ring" cx="700" cy="20" r="7"/><circle class="dot" cx="700" cy="20" r="7"/></svg>
      <div class="brand">investment center<em>▲ live</em></div>`;
  } else if (n === 1) {   // B. candles rise
    el.classList.add("i-b");
    const hs = [60, 90, 70, 120, 100, 150, 130, 110, 170, 150, 200, 180, 230];
    el.innerHTML = `<div class="cdls">${hs.map((h, k) => `<div class="cdl ${k % 4 === 2 || k === 6 ? "d" : "u"}" style="height:${h}px;--k:${k}"><i></i></div>`).join("")}<div class="cdl last" style="height:280px;--k:13"><i></i></div></div>
      <div class="brand">investment center<small>MARKETS · NEWS · ALERTS</small></div><div class="fill"></div>`;
  } else if (n === 2) {   // C. departure board
    el.classList.add("i-c");
    total = 2500;
    el.innerHTML = ["INVESTMENT", "  CENTER  "].map((w, r) => `<div class="rowf">${[...w].map((c, k) => `<div class="f ${r ? "acc" : ""}" data-c="${c}" data-k="${k + r * 3}"></div>`).join("")}</div>`).join("")
      + `<div class="tick">${(ticks.length ? ticks.slice(0, 4).map(tk) : names.slice(0, 4).map((t) => `<span><b>${esc(t[0])}</b></span>`)).join("")}</div>`;
    const CH = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$%";
    el.querySelectorAll(".f").forEach((f) => {
      const stop = 300 + Number(f.dataset.k) * 90; let t = 0;
      const iv = setInterval(() => { t += 60; f.textContent = t >= stop ? f.dataset.c : CH[Math.floor(Math.random() * CH.length)]; if (t >= stop) clearInterval(iv); }, 60);
    });
  } else {                // D. ticker tape
    el.classList.add("i-d");
    const row = (ticks.length ? ticks.map(tk) : names.map((t) => `<span><b>${esc(t[0])}</b></span>`)).join("");
    const tape = (c) => `<div class="tape ${c}"><div class="inner">${row}${row}${row}${row}</div></div>`;
    el.innerHTML = tape("t1") + tape("t2") + tape("t3") + `<div class="brandbox">investment center</div>`;
  }
  el.insertAdjacentHTML("beforeend", `<span class="skip">click to skip</span>`);
  document.body.appendChild(el);
  document.documentElement.classList.add("intro-on");
  let done = false;
  const finish = () => {
    if (done) return; done = true;
    el.classList.add("out");
    document.documentElement.classList.remove("intro-on");
    // the page was drawn (paused) under the intro: un-pausing makes it rise in exactly once
    if (typeof countUp === "function") countUp();
    setTimeout(() => el.remove(), 650);
    removeEventListener("keydown", finish);
  };
  el.addEventListener("click", finish);
  addEventListener("keydown", finish);
  // leave after the animation AND once your news is on the page (never longer than 5 s)
  const t0 = performance.now();
  const tryEnd = () => { if (pageReady || performance.now() - t0 > 5000) finish(); else setTimeout(tryEnd, 120); };
  setTimeout(tryEnd, total);
}

// 1. Rolling digits: when a price changes, only the digits that changed roll up (price rose) or down (fell)
function rollText(el, txt, up) {
  const old = el.textContent;
  if (calm() || old.length !== txt.length) { el.textContent = txt; return; }
  el.innerHTML = [...txt].map((c, k) => (c === old[k] ? esc(c)
    : `<span class="rd ${up ? "u" : "d"}" style="--k:${k}"><span>${esc(old[k])}</span><span>${esc(c)}</span></span>`)).join("");
  clearTimeout(el._rt);
  el._rt = setTimeout(() => { el.textContent = txt; }, 900);
}

// 9. Market open / closed (regular weekday hours; public holidays are not known, so a holiday shows "open")
function mktOpen(tz, sessions) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  if (p.weekday === "Sat" || p.weekday === "Sun") return false;
  const m = (Number(p.hour) % 24) * 60 + Number(p.minute);
  return sessions.some(([a, b]) => m >= a && m < b);
}
// Market-hours badges: you pick which ones show (Settings → Market hours). Regular sessions in local time, minutes from midnight.
const MARKETS_ALL = [
  ["SET", "Thailand", "Asia/Bangkok", [[600, 750], [870, 990]]], ["NYSE", "US stocks", "America/New_York", [[570, 960]]],
  ["LSE", "London", "Europe/London", [[480, 990]]], ["Xetra", "Germany", "Europe/Berlin", [[540, 1050]]],
  ["TSE", "Tokyo", "Asia/Tokyo", [[540, 690], [750, 930]]], ["HKEX", "Hong Kong", "Asia/Hong_Kong", [[570, 720], [780, 960]]],
  ["SSE", "Shanghai", "Asia/Shanghai", [[570, 690], [780, 900]]], ["SGX", "Singapore", "Asia/Singapore", [[540, 720], [780, 1020]]],
  ["KRX", "Korea", "Asia/Seoul", [[540, 930]]], ["NSE", "India", "Asia/Kolkata", [[555, 930]]], ["ASX", "Australia", "Australia/Sydney", [[600, 960]]],
];
const MAX_MKTS = 4;
function myMarkets() {
  const s = state.settings || {};
  const list = Array.isArray(s.markets) ? s.markets : safe(() => JSON.parse(localStorage.getItem("ic_markets")), null) || ["SET", "NYSE"];
  return MARKETS_ALL.filter((m) => list.includes(m[0]));
}
const marketBadges = () => myMarkets()
  .map(([n, , tz, s]) => { const o = mktOpen(tz, s); return `<span class="mkt ${o ? "open" : ""}" title="${n} regular hours (holidays not included)"><i></i>${n} ${o ? "open" : "closed"}</span>`; }).join("");
async function toggleMarket(code) {
  const cur = myMarkets().map((m) => m[0]);
  let next = cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code];
  if (next.length > MAX_MKTS) { toast(`Up to ${MAX_MKTS} markets. Turn one off first.`); return; }
  next = MARKETS_ALL.map((m) => m[0]).filter((c) => next.includes(c));  // keep a fixed order
  if ("markets" in (state.settings || {})) {
    const old = state.settings.markets;
    state.settings.markets = next; render(false);
    const { error } = await sb.from("user_settings").update({ markets: next }).eq("user_id", state.user.id);
    if (error) { state.settings.markets = old; render(false); toast(`Not saved: ${esc(error.message)}`); }
  } else { safe(() => localStorage.setItem("ic_markets", JSON.stringify(next))); render(false); }  // before 008_world.sql: this device only
}

// 4. Heartbeat next to LIVE
const HB_PATH = "M0 9 H13 L16 9 L19 2 L23 15 L26 5 L28 9 H44";
const HEARTBEAT = `<svg class="hb" viewBox="0 0 44 16" aria-hidden="true"><path class="base" d="${HB_PATH}"/><path class="beat" pathLength="100" d="${HB_PATH}"/></svg>`;
// 8. Green chart line that draws along the bottom of a card on hover
const GLINT = `<svg class="glint" viewBox="0 0 300 30" preserveAspectRatio="none" aria-hidden="true"><path d="M0 26 L40 22 L80 24 L120 14 L160 18 L200 8 L240 12 L300 2"/></svg>`;
// 10. Slow chart line drifting behind the briefing bar
const BRIEF_BG = `<svg class="bgline" viewBox="0 0 1200 80" preserveAspectRatio="none" aria-hidden="true"><path d="M0 60 L60 52 L120 58 L180 40 L240 46 L300 30 L360 38 L420 22 L480 30 L540 18 L600 26 L660 52 L720 58 L780 40 L840 46 L900 30 L960 38 L1020 22 L1080 30 L1140 18 L1200 26"/></svg>`;

// 6. Chart-line page wipe when you move to another page (feed → story, → calendar, …)
let lastView = null, lastRendered = null;
// Page name for motion: a My News story and a World Brief story both count as "story" (quick open, no wipe)
const viewKey = () => { const h = location.hash || "#/"; return /^#\/world\/./.test(h) ? "story" : h.split("/")[1] || "feed"; };
function pageWipe() {
  const key = viewKey();
  const changed = lastView !== null && key !== lastView;
  const reading = key === "story" || lastView === "story"; // opening / leaving a story: no wipe, it made reading feel slow
  lastView = key;
  if (!changed || reading || calm()) return;
  document.querySelector(".pwipe")?.remove();
  const w = document.createElement("div");
  w.className = "pwipe";
  w.setAttribute("aria-hidden", "true");
  w.innerHTML = `<svg viewBox="0 0 1000 100" preserveAspectRatio="none"><path d="M0 80 L120 66 L230 72 L360 44 L470 54 L600 28 L720 36 L860 14 L1000 8"/></svg>`;
  document.body.appendChild(w);
  setTimeout(() => w.remove(), 800);
}

// 14. Green ▲ arrows burst out of the tick when a story is marked done
function burst(from) {
  if (calm() || !from) return;
  const r = from.getBoundingClientRect(), b = document.createElement("div");
  b.className = "burst";
  b.style.left = `${r.left + r.width / 2}px`; b.style.top = `${r.top + r.height / 2}px`;
  b.innerHTML = [...Array(9)].map((_, k) => `<i style="--a:${-90 + (k - 4) * 20}deg;--d:${44 + (k % 3) * 14}px">▲</i>`).join("") + `<b>+1 read</b>`;
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 900);
}

// 16. Reading progress line on story pages
addEventListener("scroll", () => {
  const p = document.querySelector(".rprog i");
  if (!p) return;
  const max = document.documentElement.scrollHeight - innerHeight;
  p.style.width = `${max > 0 ? Math.min(100, (scrollY / max) * 100) : 0}%`;
}, { passive: true });

// ---------- router ----------
// animate = true when a page opens (things rise in); false for small updates like saving a star.
// animate: true = page opens (rise in), "soft" = same page, new content (short fade), false = no motion
// Small updates (filters, ticks): only swap the parts of the page that changed. Untouched parts stay in place,
// so nothing blinks and running effects (ticker dock, briefing line, pulses) carry on without restarting.
const samePart = (o, n) => o.tagName === n.tagName && ((o.dataset.sig && o.dataset.sig === n.dataset.sig) || o.outerHTML === n.outerHTML);
function swapChanged(oldParent, newParent) {
  const od = [...oldParent.children], nw = [...newParent.children];
  if (od.length !== nw.length) { oldParent.replaceChildren(...nw); return; }
  nw.forEach((n, i) => {
    const o = od[i];
    if (samePart(o, n)) return;
    if (o.tagName === n.tagName && o.className === n.className && (n.classList.contains("wrap") || n.classList.contains("page"))) return swapChanged(o, n);
    o.replaceWith(n);
  });
}
function setApp(html, animate) {
  if (animate === true || !app.querySelector(".wrap")) { app.innerHTML = html; return; }
  const t = document.createElement("template");
  t.innerHTML = html;
  swapChanged(app, t.content);
}
function render(animate = true) {
  applyMotion();
  app.classList.remove("enter", "soft"); void app.offsetWidth;
  // Opening a story or coming back from one: a short, quick rise instead of the slow page entrance (felt like lag)
  const viewNow = viewKey();
  app.classList.toggle("quick", viewNow === "story" || lastRendered === "story");
  if (animate === true) lastRendered = viewNow;
  if (animate === true && !calm()) app.classList.add("enter");
  if (animate === "soft" && !calm()) app.classList.add("soft");
  if (!state.user) {
    // A failed email link comes back as #error=...; show it in plain words and tidy the address bar
    const err = new URLSearchParams((location.hash || "").replace(/^#/, "")).get("error_description");
    if (err) history.replaceState(null, "", location.pathname);
    app.innerHTML = err ? viewLogin(friendly(err), true) : viewLogin();
    return;
  }
  const h = location.hash || "#/";
  if (h !== "#/settings") { state.draft = null; state.toAlerts = false; }
  if (h.startsWith("#/story/")) {
    const id = decodeURIComponent(h.slice(8)), s = findStory(id);
    app.innerHTML = viewStory(id);
    if (s && !stOf(s)) setStatus(id, "seen");            // opening a story marks it as seen
    if (!s && state.loadingStory !== id) loadOneStory(id); // older than 3 days (e.g. from search or Telegram)
  } else if (h.startsWith("#/world")) {
    const id = decodeURIComponent(h.slice(8));
    if (state.world === null || Date.now() - state.worldAt > 10 * 60e3) {   // load on first visit, refresh after 10 min
      if (!state.worldLoading) { state.worldLoading = true; loadWorld().finally(() => { state.worldLoading = false; if ((location.hash || "").startsWith("#/world")) render(false); }); }
    }
    if (id) { app.innerHTML = viewWorldStory(id); if (state.world && !wSt(id) && state.world.some((x) => x.id === id)) setWorldStatus(id, "seen"); }  // opening = seen
    else setApp(viewWorld(), animate);
  } else if (h.startsWith("#/search/")) app.innerHTML = viewSearch();
  else if (h.startsWith("#/econ")) {
    const d = h.slice(7), c = state.ecal;
    if (/^\d{4}-\d\d-\d\d$/.test(d) && c.from !== h) { c.from = h; c.sel = d; c.wk = Math.max(0, Math.min(1, Math.floor(Math.round((dayOf(d) - monday()) / 864e5) / 35))); }
    if (!c.sel) c.sel = isoDay(today0());
    setApp(viewEconCal(), animate);
  }
  else if (h.startsWith("#/calendar")) {
    const d = h.slice(11), c = state.cal;
    if (/^\d{4}-\d\d-\d\d$/.test(d) && c.from !== h) { c.from = h; c.sel = d; c.wk = Math.max(0, Math.min(1, Math.floor(Math.round((dayOf(d) - monday()) / 864e5) / 35))); }
    if (!c.sel) c.sel = isoDay(today0());
    setApp(viewCalendar(), animate);
  }
  else if (h === "#/heatmap") { setApp(viewHeatmap(), animate); if (Date.now() - (chOf().loadedAt || 0) > 55e3) { chOf().loadedAt = Date.now(); loadChartData(); } const c = chOf(); if (!c.hm || Date.now() - (c.hmAt?.[c.hmIdx || "@SP500"] || 0) > 55e3) loadHeatmap(); }
  else if (h.startsWith("#/charts")) {
    const t = decodeURIComponent(h.slice(9)).toUpperCase(), ch = chOf();
    setApp(t ? viewChartStock(t) : viewCharts(), animate);
    if (Date.now() - (ch.loadedAt || 0) > 55e3 || (t && ch.askedFor !== t && !quotes[yahoo(t)])) { ch.loadedAt = Date.now(); ch.askedFor = t; loadChartData(t ? [yahoo(t)] : []); }
    if (t) { kcMount(t); requestAnimationFrame(() => kc.chart?.resize()); }
  }
  else if (h === "#/prefs") app.innerHTML = viewPrefs();
  else if (h === "#/settings") {
    state.draft = state.draft || makeDraft(); app.innerHTML = viewSettings();
    if (state.toAlerts && isPhone()) requestAnimationFrame(() => document.getElementById("pa")?.previousElementSibling?.scrollIntoView({ block: "start" }));
  }
  else setApp(viewFeed(), animate);
  // soft updates: charts appear already drawn (no redraw flash)
  if (animate === "soft") app.querySelectorAll(".spark.draw").forEach((el) => el.classList.remove("draw"));
  app.querySelectorAll(".a").forEach((el, i) => el.style.setProperty("--i", Math.min(i, 14)));
  updateDock();
  const side = app.querySelector(".right, .sidecol");
  if (side && sideWatch) { sideWatch.disconnect(); sideWatch.observe(side); }
  setupFilterRow();
  if (animate === true) countUp();
}
window.addEventListener("hashchange", () => {
  const h = location.hash || "";
  if (h.startsWith("#/search/") && state.user) {
    state.searchQ = decodeURIComponent(h.slice(9)); state.searchResults = null;
    searchStories(state.searchQ).then((r) => { state.searchResults = r; }).catch((e) => { state.searchResults = { error: e.message || String(e) }; })
      .finally(() => { if ((location.hash || "").startsWith("#/search/")) render(false); });
  } else state.searchQ = "";
  if (state.user) pageWipe();
  render(); window.scrollTo(0, 0); if (state.user) loadQuotes();
});
async function loadOneStory(id) {
  state.loadingStory = id;
  const { data } = await sb.from("stories").select("*").eq("id", id).maybeSingle();
  if (data) state.more.set(id, data);
  state.loadingStory = null;
  if ((location.hash || "").includes(id)) render(false);
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.briefing) { state.briefing = null; drawBriefing(); render(false); } });

// ---------- new stories (the robot adds them every 30 min; the page checks every 2 min) ----------
let pollTimer = null;
async function checkNew() {
  if (!state.user || document.hidden || !state.stories) return;
  const newest = state.stories.reduce((m, s) => (s.created_at > m ? s.created_at : m), "1970-01-01");
  const { data, error } = await sb.from("stories").select("*").gt("created_at", newest).order("created_at", { ascending: false }).limit(50);
  if (error || !data?.length) return;
  const have = new Set(state.stories.map((s) => s.id));
  const added = data.filter((s) => !have.has(s.id));
  if (!added.length) return;
  state.stories = [...added, ...state.stories];
  added.forEach((s) => state.fresh.add(s.id));
  const onFeed = !location.hash || location.hash === "#/";
  const typing = document.activeElement && document.activeElement.matches("input, textarea");
  if (onFeed && !typing) render(false);
  const mine = added.filter(matches).sort((a, b) => b.impact_score - a.impact_score);
  if (mine.length) toast(`▲ <b>${mine.length} new stor${mine.length > 1 ? "ies" : "y"}</b> · ${esc(mine[0].headline)}`, `#/story/${mine[0].id}`);
  setTimeout(() => state.fresh.clear(), 8000); // the flash only plays once
}
let priceTimer = null;
function startPolling() {
  clearInterval(pollTimer); clearInterval(priceTimer);
  pollTimer = setInterval(checkNew, 120000);
  priceTimer = setInterval(() => { loadQuotes(); if ((location.hash || "").startsWith("#/charts") && !document.hidden) { chOf().loadedAt = Date.now(); loadChartData(kc.sym ? [yahoo(kc.sym)] : []); } if (location.hash === "#/heatmap" && !document.hidden) loadHeatmap(); }, 60000);
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) { checkNew(); loadQuotes(); } });

// ---------- events ----------
app.addEventListener("click", async (e) => {
  // Clicking outside the search box closes its results
  if (!e.target.closest(".search")) { const r = document.getElementById("res"); if (r) r.innerHTML = ""; }
  const el = e.target.closest("[data-chtab],[data-chsort],[data-chwatch],[data-chside],[data-hmidx],[data-hmsize],[data-chsel],[data-chrng],[data-chmv],[data-chjump],[data-chpane],[data-chfin],[data-scrmk],[data-scrsec],[data-scrsort],[data-scrmore],[data-chperf],[data-chfm],[data-chkf],[data-chtop],[data-chtf],[data-kcp],[data-kcr],[data-kct],[data-kcact],[data-kctfav],[data-theme-pick],[data-dark-pick],[data-light-pick],[data-motion],[data-lrange],[data-lpick],[data-calday],[data-calsel],[data-calf],[data-econf],[data-ecalsel],[data-ecalwk],[data-ecalday],[data-ecal],[data-nsort],[data-wsort],[data-follow],[data-calwk],[data-cal],[data-done],[data-later],[data-qdone],[data-brief],[data-sdone],[data-slater],[data-mute-topic],[data-mute-source],[data-unmute-topic],[data-unmute-source],[data-save],[data-go],[data-filter],[data-ptab],[data-dock],[data-scroll],[data-act],[data-rm],[data-rm-t],[data-add],[data-topic-add],[data-stopic-add],[data-rm-st],[data-stock],[data-pa-add],[data-pa-rm],[data-pa-on],[data-tab-alerts],[data-tab-topics],[data-wvote],[data-wreg],[data-wmore],[data-wgo],[data-wdone],[data-wnext],[data-mkt-pick],[data-wview],[data-wzoom],[data-wsit],[data-go-world],[data-wbrief],[data-mascot],[data-bigalert],[data-season-pick]");
  if (!el) return;
  if (el.dataset.wbrief) { const ids = wWaiting().map((s) => s.id); if (ids.length) { state.briefing = { ids, i: 0, res: {}, world: true }; drawBriefing(); } return; }
  if (el.dataset.goWorld) { location.hash = `#/world/${el.dataset.goWorld}`; return; }
  if (el.dataset.wview) { state.wview = el.dataset.wview; if (state.wview === "map") state.wreg = "All"; safe(() => localStorage.setItem("ic_wview", state.wview)); render("soft"); return; }
  if (el.dataset.wzoom) { state.wzoom = el.dataset.wzoom; state.wsel = null; state.whover = null; render(false); return; }
  if (el.dataset.wsit) {   // map: first tap selects (draws its line), second tap opens the story
    const id = el.dataset.wsit;
    if (state.wsel === id) { location.hash = `#/world/${id}`; return; }
    state.wsel = id; state.whover = null;
    if (state.wzoom === "World" && GEO && GEO.at) { const it = wItems(wRanked()).find((x) => x.s.id === id); if (it && it.reg) state.wzoom = it.reg; }
    render(false); return;
  }
  if (el.dataset.mktPick) { toggleMarket(el.dataset.mktPick); return; }
  if (el.dataset.wdone) { e.preventDefault(); e.stopPropagation(); const id = el.dataset.wdone; setWorldStatus(id, wSt(id) === "done" ? "seen" : "done"); return; }
  if (el.dataset.wnext !== undefined) { const cur = el.dataset.wnext; if (cur && wSt(cur) !== "done") setWorldStatus(cur, "done"); const n = wWaiting().find((s) => s.id !== cur); location.hash = n ? `#/world/${n.id}` : "#/world"; return; }
  // World Brief
  if (el.dataset.wvote) { e.preventDefault(); e.stopPropagation(); setWorldVote(el.dataset.wvote, Number(el.dataset.v)); return; }
  if (el.dataset.wreg) { state.wreg = el.dataset.wreg; state.wlimit = 10; render("soft"); return; }
  if (el.dataset.wmore) { state.wlimit += 10; render(false); return; }
  if (el.dataset.wgo) { if (!e.target.closest("a")) location.hash = `#/world/${el.dataset.wgo}`; return; }
  if (el.dataset.save) {
    e.preventDefault(); e.stopPropagation();
    const id = el.dataset.save;
    if (state.saved.has(id)) { await sb.from("saved").delete().eq("story_id", id); state.saved.delete(id); }
    else { await sb.from("saved").insert({ user_id: state.user.id, story_id: id }); state.saved.add(id); }
    render(false);
    return pop(`[data-save="${CSS.escape(id)}"]`);
  }
  if (el.dataset.themePick || el.dataset.darkPick || el.dataset.lightPick) {
    if (el.dataset.themePick) safe(() => localStorage.setItem("ic_theme", el.dataset.themePick));
    if (el.dataset.darkPick) { safe(() => localStorage.setItem("ic_dark", el.dataset.darkPick)); if (!isDark()) safe(() => localStorage.setItem("ic_theme", "dark")); }
    if (el.dataset.lightPick) { safe(() => localStorage.setItem("ic_light", el.dataset.lightPick)); if (isDark()) safe(() => localStorage.setItem("ic_theme", "light")); }
    applyTheme();
    return render(false);
  }
  if (el.dataset.seasonPick) {
    safe(() => localStorage.setItem("ic_season", el.dataset.seasonPick));
    applySeason(); render(false);
    toast(`Season: ${esc(el.querySelector("b")?.textContent || "")} · saved on this device`);
    return;
  }
  if (el.dataset.mascot) { lsSet("ic_mascot", el.dataset.mascot); render(false); toast(`Presenter: ${esc(el.querySelector("b")?.textContent || "")} · saved on this device`); return; }
  if (el.dataset.bigalert) { lsSet("ic_bigalert", el.dataset.bigalert); render(false); return; }
  if (el.dataset.motion) {
    safe(() => localStorage.setItem("ic_motion", el.dataset.motion));
    applyMotion();
    render("soft");
    toast(`Motion: ${{ auto: "Automatic", full: "Full motion", reduced: "Reduced motion" }[el.dataset.motion]} · saved on this device`);
    return;
  }
  if (el.dataset.lrange) { state.cal.range = { days: Number(el.dataset.lrange), from: null, to: null }; return render("soft"); }
  if (el.dataset.lpick) { const h = state.cal.hide, k = el.dataset.lpick; if (k === "*") h.clear(); else if (h.has(k)) h.delete(k); else h.add(k); return render(false); }
  if (el.dataset.calday) { location.hash = `#/calendar/${el.dataset.calday}`; return; }
  if (el.dataset.cal !== undefined) { if (!e.target.closest("a")) location.hash = "#/calendar"; return; }
  if (el.dataset.calsel) { state.cal.sel = el.dataset.calsel; return render(false); }
  if (el.dataset.ecalsel) { state.ecal.sel = el.dataset.ecalsel; return render(false); }
  if (el.dataset.ecalwk) { state.ecal.wk = Math.max(0, Math.min(1, state.ecal.wk + Number(el.dataset.ecalwk))); return render(false); }
  if (el.dataset.ecalday) { location.hash = `#/econ/${el.dataset.ecalday}`; return; }
  if (el.dataset.ecal !== undefined) { if (!e.target.closest("a,button")) location.hash = "#/econ"; return; }
  if (el.dataset.calf) { state.cal.filter = el.dataset.calf; return render("soft"); }
  if (el.dataset.econf) { lsSet("ic_econf", el.dataset.econf); return render("soft"); }
  if (el.dataset.follow) { e.stopPropagation(); return toggleFollow(el.dataset.follow, el.dataset.fkey, el.dataset.flabel); }
  if (el.dataset.nsort) { sortToggle("ic_nsort", NSORT, el.dataset.nsort); state.feedLimit = FEED_STEP; render("soft"); document.querySelector(".sortdd")?.setAttribute("open", ""); if (el.dataset.nsort === "price") loadQuotes(); return; }
  if (el.dataset.wsort) { sortToggle("ic_wsort", WSORT, el.dataset.wsort); state.wlimit = 10; render("soft"); document.querySelector(".sortdd")?.setAttribute("open", ""); return; }
  if (el.dataset.calwk) { state.cal.wk = Math.max(0, Math.min(1, state.cal.wk + Number(el.dataset.calwk))); return render(false); }
  if (el.dataset.done) { e.preventDefault(); e.stopPropagation(); if (stOf({ id: el.dataset.done }) !== "done") burst(el); return changeStatus(el.dataset.done, "done"); }
  if (el.dataset.later) { e.preventDefault(); e.stopPropagation(); return changeStatus(el.dataset.later, "later"); }
  if (el.dataset.qdone) { e.stopPropagation(); burst(el); return changeStatus(el.dataset.qdone, "done", `.q[data-q="${CSS.escape(el.dataset.qdone)}"]`); }
  if (el.dataset.brief !== undefined) return openBriefing();
  if (el.dataset.sdone || el.dataset.slater) {
    const id = el.dataset.sdone || el.dataset.slater, want = el.dataset.sdone ? "done" : "later";
    await setStatus(id, stOf({ id }) === want ? "seen" : want);
    return render(false);
  }
  if (el.dataset.muteTopic || el.dataset.muteSource) {
    el.closest("details")?.removeAttribute("open");
    return setMute(el.dataset.muteTopic ? "topic" : "source", el.dataset.muteTopic || el.dataset.muteSource, true);
  }
  if (el.dataset.unmuteTopic || el.dataset.unmuteSource) {
    await setMute(el.dataset.unmuteTopic ? "topic" : "source", el.dataset.unmuteTopic || el.dataset.unmuteSource, false);
    return render(false);
  }
  if (el.dataset.go) { location.hash = `#/story/${el.dataset.go}`; return; }
  if (el.dataset.filter) { state.filter = el.dataset.filter; state.feedLimit = FEED_STEP; render("soft"); return loadQuotes(); }
  if (el.dataset.act === "msearch") { const h = app.querySelector("header"); h.classList.toggle("sopen"); if (h.classList.contains("sopen")) document.getElementById("hq")?.focus(); return; }
  if (el.dataset.act === "note") { const n = document.getElementById("note"); n?.scrollIntoView({ block: "center", behavior: calm() ? "auto" : "smooth" }); n?.focus({ preventScroll: true }); return; }
  if (el.dataset.tabAlerts || el.dataset.tabTopics) { // bottom tab bar: both live on the Topics & watchlist page
    state.toAlerts = !!el.dataset.tabAlerts;
    if (location.hash === "#/settings") { e.preventDefault(); render(false); }
    return; // otherwise the link changes the page, and render() scrolls to the alerts
  }
  if (el.dataset.paAdd) {
    const t = document.getElementById("pa-t").value, k = document.getElementById("pa-k").value, v = Number(document.getElementById("pa-v").value);
    if (!(v > 0) || (k === "move" && v > 50)) { toast(k === "move" ? "Enter a % between 0 and 50" : "Enter a price above 0"); return; }
    const { error } = await sb.from("price_alerts").insert({ user_id: state.user.id, ticker: t, kind: k, value: v });
    if (error) { toast(`Could not save: ${esc(error.message)}`); return; }
    return loadAlerts();
  }
  if (el.dataset.paRm) { await sb.from("price_alerts").delete().eq("id", el.dataset.paRm); return loadAlerts(); }
  if (el.dataset.paOn) { await sb.from("price_alerts").update({ active: true }).eq("id", el.dataset.paOn); return loadAlerts(); }
  if (el.dataset.stock) { // a stock in the prices, the dock or a story's tags: show only its news
    state.filter = "$" + el.dataset.stock; state.feedLimit = FEED_STEP;
    if (location.hash && location.hash !== "#/") { location.hash = "#/"; return; }
    render("soft"); window.scrollTo({ top: 0, behavior: calm() ? "auto" : "smooth" }); return;
  }
  if (el.dataset.act === "more-stories") { state.feedLimit += FEED_STEP; return render(false); }
  if (el.dataset.act === "place-add") {   // follow a typed country / region (matched to the region list, else a country)
    const v = (document.getElementById("placein")?.value || "").trim().replace(/\s+/g, " ");
    if (v.length < 2) return toast("Type a country or region");
    const reg = Object.keys(WREG).find((r) => r.toLowerCase() === v.toLowerCase() || (v.toLowerCase() === "asia" && r === "Asia-Pacific"));
    const known = (state.world || []).map((x) => x.country).find((c) => (c || "").toLowerCase() === v.toLowerCase());
    return toggleFollow("place", reg ? `region:${reg}` : `country:${known || v.replace(/\b\w/g, (c) => c.toUpperCase())}`, reg || known || v);
  }
  if (el.dataset.scroll !== undefined) { app.querySelector(".filters .track")?.scrollBy({ left: 320 * (Number(el.dataset.scroll) || 1), behavior: calm() ? "auto" : "smooth" }); return; }
  if (el.dataset.dock !== undefined) {
    state.dockOpen = !state.dockOpen;
    el.closest(".dock").classList.toggle("open", state.dockOpen);
    el.textContent = state.dockOpen ? "▼ Less" : (state.settings.watchlist || []).length ? "▲ Markets" : "▲ More";
    return;
  }
  if (el.dataset.chtab) { chOf().tab = el.dataset.chtab; return render(false); }
  if (el.dataset.chsort) { chOf().sort = el.dataset.chsort; return render(false); }
  if (el.dataset.chwatch) { return toggleChartWatch(el.dataset.chwatch); }
  if (el.dataset.chside) return chSideClick(el.dataset.chside);
  if (el.dataset.hmidx) { chOf().hmIdx = el.dataset.hmidx; render(false); return loadHeatmap(); }
  if (el.dataset.hmsize) { chOf().hmSize = el.dataset.hmsize; return render(false); }
  if (el.dataset.chsel || el.dataset.chrng || el.dataset.chmv) { const ch = chOf(), [k, v] = (el.dataset.chsel || el.dataset.chrng || el.dataset.chmv).split("|"); (el.dataset.chsel ? ch.sel : el.dataset.chrng ? ch.rng : ch.mv)[k] = v; return render(false); }
  if (el.dataset.chjump) { e.preventDefault(); document.getElementById(el.dataset.chjump)?.scrollIntoView({ behavior: calm() ? "auto" : "smooth", block: "start" }); return; }
  if (el.dataset.chpane || el.dataset.chtop) {   // tabs; the slim bar's buttons also go back to the top (like TradingView)
    e.preventDefault(); if (el.dataset.chpane) chOf().pane = el.dataset.chpane; render(false); requestAnimationFrame(() => kc.chart?.resize());
    if (el.dataset.chtop) scrollTo({ top: 0, behavior: calm() ? "auto" : "smooth" }); return;
  }
  if (el.dataset.chperf) { kcRangeClick(el.dataset.chperf); render(false); document.querySelector(".chbox")?.scrollIntoView({ behavior: calm() ? "auto" : "smooth", block: "start" }); return; }
  if (el.dataset.scrmk || el.dataset.scrsec || el.dataset.scrsort || el.dataset.scrmore) return scrClick(el);
  if (el.dataset.chfm) { const [k, v] = el.dataset.chfm.split(":"); (chOf().fm ||= {})[k] = v; return render(false); }
  if (el.dataset.chkf) { chOf().kfi = Number(el.dataset.chkf); return render(false); }
  if (el.dataset.chfin) { chOf().fin = el.dataset.chfin; return render(false); }
  if (el.dataset.chtf) { chOf().tf = el.dataset.chtf; return render(false); }
  if (el.dataset.kctfav) { e.preventDefault(); const i = +el.dataset.kctfav, f = kcFavTf(); safe(() => localStorage.setItem("ic_kctf", JSON.stringify(f.includes(i) ? f.filter((x) => x !== i) : [...f, i]))); render(false); document.querySelector(".kctf")?.setAttribute("open", ""); return; }
  if (el.dataset.kcp !== undefined || el.dataset.kcr || el.dataset.kct || el.dataset.kcact) { el.closest("details")?.removeAttribute("open"); return kcToolbar(el); }
  if (el.dataset.ptab) { state.priceTab = el.dataset.ptab; render(false); return loadQuotes(); }
  const d = state.draft;
  if (d && el.dataset.add) {
    const sym = el.dataset.add;
    if (!d.watchlist.includes(sym) && d.watchlist.length < MAX_WATCHLIST) {
      d.watchlist.push(sym);
      if (!known(sym)) d.watch_names[sym] = el.dataset.name || sym;
    }
    render(false); return pop(`[data-chip="${CSS.escape(sym)}"]`);
  }
  if (d && el.dataset.topicAdd) {
    const t = el.dataset.topicAdd;
    if (t && d.custom_topics.length < MAX_CUSTOM_TOPICS) d.custom_topics.push(t);
    render(false); return pop(`[data-chip="${CSS.escape(t)}"]`);
  }
  if (d && el.dataset.rm) { d.watchlist = d.watchlist.filter((t) => t !== el.dataset.rm); delete d.watch_names[el.dataset.rm]; return render(false); }
  if (d && el.dataset.rmT) { d.custom_topics = d.custom_topics.filter((t) => t !== el.dataset.rmT); return render(false); }
  if (d && el.dataset.stopicAdd) {
    const on = new Set([...d.topics, el.dataset.stopicAdd]);
    d.topics = CFG.topics.filter((x) => on.has(x)); // keep the catalog order
    render(false); return pop(`[data-chip="${CSS.escape(el.dataset.stopicAdd)}"]`);
  }
  if (d && el.dataset.rmSt) { d.topics = d.topics.filter((t) => t !== el.dataset.rmSt); return render(false); }
  const act = el.dataset.act;
  if (act === "eye") {
    const pw = document.getElementById("password");
    const show = pw.type === "password";
    pw.type = show ? "text" : "password";
    el.innerHTML = show ? EYE_OFF : EYE;
    el.title = show ? "Hide password" : "Show password";
    el.setAttribute("aria-label", el.title);
    el.setAttribute("aria-pressed", String(show));
    el.classList.toggle("on", show);
    return;
  }
  if (act === "magic") { e.preventDefault(); return sendMagicLink(); }
  if (act === "play-intro") { playIntro(true); return; }
  if (act === "big-preview") { const top = [...(state.stories || [])].sort((a, b) => b.impact_score - a.impact_score)[0]; if (top) showBig([top], true); return; }
  if (act === "logout") { clearInterval(pollTimer); clearInterval(priceTimer); await sb.auth.signOut(); return; }
  if (act === "save-settings" && d) {
    const row = { topics: d.topics, watchlist: d.watchlist, custom_topics: d.custom_topics, watch_names: d.watch_names, updated_at: new Date().toISOString() };
    let { error } = await sb.from("user_settings").update(row).eq("user_id", state.user.id);
    if (error && /custom_topics|watch_names/.test(error.message)) error = { message: "the database needs a one-time update first (run supabase/003_search.sql in Supabase)." };
    if (!error) { Object.assign(state.settings, row); state.filter = "All"; }
    document.getElementById("saved-msg").innerHTML = error ? `<span class="msg err">Could not save: ${esc(error.message)}</span>` : `<span class="saved-ok">Saved ✓</span>`;
  }
});

app.addEventListener("change", (e) => {
  // Lanes: custom From / To dates (if To ends up before From, the range resets to From + the preset length)
  if (e.target.id === "lfrom" || e.target.id === "lto") {
    const r = state.cal.range, f = document.getElementById("lfrom").value, t2 = document.getElementById("lto").value;
    state.cal.range = { days: r.days, from: f || null, to: t2 && (!f || t2 >= f) ? t2 : null };
    return render(false);
  }
});
// Empty search box on Topics & watchlist: show every topic to browse
app.addEventListener("focusin", (e) => {
  if (e.target.id === "q" && !e.target.value.trim() && state.draft) document.getElementById("res").innerHTML = viewBrowse();
});

app.addEventListener("input", (e) => {
  if (e.target.id === "chq") { clearTimeout(chTimer); const q = e.target.value; chTimer = setTimeout(() => chSearch(q), 250); return; }
  if (e.target.dataset?.note) { const m = document.getElementById("note-msg"); if (m) m.textContent = "Saving…"; return saveNote(e.target.dataset.note, e.target.value); }
  if (e.target.id !== "q") return;
  const q = e.target.value.trim();
  clearTimeout(searchTimer);
  if (!q) { searchSeq++; document.getElementById("res").innerHTML = state.draft ? viewBrowse() : ""; return; }
  searchTimer = setTimeout(() => runSearch(q), 300); // wait until you stop typing
});

app.addEventListener("keydown", (e) => {
  if (e.target.id === "chq" && e.key === "Escape") { e.target.value = ""; const r = document.getElementById("chres"); if (r) r.hidden = true; }
  if (e.target.id === "q" && e.key === "Escape") { e.target.value = ""; document.getElementById("res").innerHTML = ""; }
});

app.addEventListener("submit", async (e) => {
  if (e.target.id === "chsearch") {   // Enter: open the first match (or the ticker you typed)
    e.preventDefault();
    const first = document.querySelector("#chres a.chr"), q = document.getElementById("chq").value.trim().toUpperCase();
    if (first) location.hash = first.getAttribute("href"); else if (/^[A-Z0-9.^=\-]{1,20}$/.test(q)) location.hash = chHref(q);
    return;
  }
  if (e.target.id === "hsearch") {
    e.preventDefault();
    const q = document.getElementById("hq").value.trim();
    if (q.length >= 2) location.hash = `#/search/${encodeURIComponent(q)}`;
    return;
  }
  if (e.target.id !== "login") return;
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const keep = document.getElementById("remember").checked;
  if (!password) { app.innerHTML = viewLogin("Enter your password, or use the email link below.", true, email); return; }
  safe(() => localStorage.setItem("ic_remember", keep ? "1" : "0")); // decides where the login is stored
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) app.innerHTML = viewLogin(friendly(error.message), true, email);
  // on success, onAuthStateChange loads the news
});

async function sendMagicLink() {
  const email = (document.getElementById("email")?.value || "").trim();
  if (!email) { app.innerHTML = viewLogin("Type your email first, then click the link option.", true); return; }
  safe(() => localStorage.setItem("ic_remember", document.getElementById("remember")?.checked ? "1" : "0"));
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: false } });
  app.innerHTML = error ? viewLogin(friendly(error.message), true, email)
    : viewLogin("Check your email and click the newest link (it works once). Open it in this same browser.", false, email);
}

// ---------- start ----------
// ---------- Big news alert (design round 25 style B + mascots from rounds 26-27) ----------
// Impact 8-10, last 24 h, about your topics/watchlist, not read or saved for later: covers the screen once per story (per device).
const bigOn = () => lsGet("ic_bigalert") !== "off";
const mascotPref = () => lsGet("ic_mascot") || "theme";
// Theme characters: the user's own mascots, one per theme, 8 poses each (site/mascot/<theme>/<pose>.png, 480 px)
const CHARS = [["crisp", "Reporter", "Crisp"], ["newsprint", "Pigeon", "Newsprint"], ["cloud", "Cloud mage", "Cloud"], ["sage", "Sage", "Sage"],
  ["graphite", "Hood", "Graphite"], ["black", "Noir", "True black"], ["navy", "Celestial", "Midnight"],
  ["winter", "Ice queen", "Winter"], ["spring", "Blossom", "Spring"], ["summer", "Beach kid", "Summer"], ["autumn", "Autumn", "Autumn"]];
// where the blank sign is in each "present" pose (measured from the images: left, top, width, height as a share of the picture)
const SIGN = { crisp: [.390, .473, .252, .110], newsprint: [.344, .533, .335, .173], cloud: [.402, .535, .294, .131], sage: [.363, .500, .271, .150],
  graphite: [.352, .538, .344, .171], black: [.350, .488, .308, .152], navy: [.354, .479, .315, .142], winter: [.392, .540, .304, .133],
  spring: [.377, .504, .298, .140], summer: [.360, .560, .317, .158], autumn: [.363, .508, .310, .140] };
const themeChar = () => season || (isDark() ? darkStyle() : lightStyle());   // the character that matches what you see right now
function charOf() { const m = mascotPref(); return m === "none" ? null : m.startsWith("c:") ? m.slice(2) : themeChar(); }
const charImg = (c, pose, cls = "") => `<img class="mimg ${cls}" src="mascot/${c}/${pose}.png" alt="" draggable="false" onerror="this.remove()">`;
function mascotArt(pose, cls = "") {   // the chosen mascot in a pose; "" when the user picked "No mascot"
  const m = mascotPref(), c = charOf();
  if (m === "none") return "";
  return charImg(c || themeChar(), pose, cls);   // old picks (Official/Retro, removed) fall back to the theme character
}
const bigSeen = () => safe(() => JSON.parse(lsGet("ic_big_seen") || "[]"), []);
const SERIOUS_RX = /\b(war|missiles?|airstrikes?|attacks?|killed|kills|dead|deaths?|bomb\w*|invasion|invades?|earthquake|floods?|disaster|shooting|terror\w*|explosion|hostages?)\b/i;
function bigMood(s) {   // no AI needed: the story already has sentiment and impact
  if (SERIOUS_RX.test(s.headline || "")) return "serious";
  if (Number(s.impact_score) >= 10 || Date.now() - new Date(when(s)) < 36e5) return "breaking";
  return s.sentiment === "Bullish" ? "bull" : s.sentiment === "Bearish" ? "bear" : "breaking";
}
function bigQueue() {
  const seen = new Set(bigSeen()), day = Date.now() - 864e5;
  return (state.stories || []).filter((s) => Number(s.impact_score) >= 8 && new Date(s.created_at) > day && matches(s)
      && !seen.has(s.id) && !["done", "later"].includes(stOf(s)))
    .sort((a, b) => b.impact_score - a.impact_score || (b.created_at > a.created_at ? 1 : -1)).slice(0, 3);
}
const markBigSeen = (id) => lsSet("ic_big_seen", JSON.stringify([...bigSeen().filter((x) => x !== id), id].slice(-60)));
function afterIntro(fn, n = 0) {   // wait for the opening intro to finish (max ~10 s)
  if (document.documentElement.classList.contains("intro-on") && n < 40) return setTimeout(() => afterIntro(fn, n + 1), 250);
  fn();
}
function showBig(list, preview = false) {
  if (!list.length || document.querySelector(".bigal")) return;
  let i = 0;
  const el = document.createElement("div");
  el.className = "bigal";
  el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Big news");
  const ticks = lastQuotes();
  const draw = () => {
    const s = list[i], mood = bigMood(s), pic = mascotArt(`alert-${mood}`);
    const tk = ticks.map((q) => `<span><b>${esc(q[0])}</b> ${esc(q[1])} <em class="${String(q[2]).startsWith("-") ? "d" : "u"}">${esc(q[2])}</em></span>`).join("");
    el.innerHTML = `<div class="bg-dim" data-bgx="1"></div>
      ${pic ? `<div class="bg-mas">${pic}</div>` : ""}
      <div class="bg-band"><div class="bg-label">BIG NEWS</div><div class="bg-hl">${esc(s.headline)}</div></div>
      <div class="bg-low">
        ${s.what_it_means ? `<p>${esc(s.what_it_means)}</p>` : ""}
        <div class="bg-meta">Impact ${esc(s.impact_score)} of 10 · ${esc(s.n_sources)} outlet${s.n_sources > 1 ? "s" : ""} · ${agoAt(when(s))}${(s.tickers || []).length ? ` · ${s.tickers.slice(0, 4).map(esc).join(", ")}` : ""}</div>
        <div class="bg-btns"><button class="bg-read" data-bg="read">Read the story</button><button class="bg-later" data-bg="${preview ? "close" : "later"}">${preview ? "Close" : "Later"}</button>
          <span class="bg-n">${list.length > 1 ? `${i + 1} of ${list.length} · ` : ""}Esc to close</span></div>
      </div>
      ${tk ? `<div class="bg-tick"><div>${tk}${tk}</div></div>` : ""}`;
    el.style.setProperty("--bandh", `${el.querySelector(".bg-band").offsetHeight}px`);   // the black box sits right under the band
    el.classList.remove("play"); void el.offsetWidth; el.classList.add("play");
    el.querySelector(".bg-read")?.focus({ preventScroll: true });
  };
  const close = () => { removeEventListener("keydown", key); el.classList.add("out"); setTimeout(() => el.remove(), 260); };
  const next = (act) => {
    const s = list[i];
    if (!preview) {
      markBigSeen(s.id);
      if (act === "later") { setStatus(s.id, "later"); render(false); }
    }
    if (act === "read") { close(); location.hash = `#/story/${s.id}`; return; }
    if (++i < list.length) draw(); else close();
  };
  const key = (e) => { if (e.key === "Escape") next(preview ? "close" : "later"); };
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-bg]");
    if (b) next(b.dataset.bg); else if (e.target.dataset.bgx) next(preview ? "close" : "later");
  });
  addEventListener("keydown", key);
  document.body.appendChild(el);
  draw();
}

let loading = null; // the user id currently being loaded, so two login signals don't load twice
async function start(session) {
  const uid = session?.user?.id || null;
  if (uid && loading === uid) return;
  loading = uid;
  state.user = session?.user || null;
  if (location.search.includes("code=")) history.replaceState(null, "", location.pathname + location.hash); // tidy URL after login
  if (!state.user) { render(); pageReady = true; return; }
  app.innerHTML = `<div class="mwait">${mascotArt("waiting", "mload")}<p class="loading">Loading your news…</p></div>`;
  try {
    await loadSettings();
    await loadStories();
    await loadReading();
    await Promise.race([loadQuotes(), new Promise((r) => setTimeout(r, 1500))]); // show prices with the first paint if they come quickly
    render();
    pageReady = true;
    startPolling();
    if (bigOn()) afterIntro(() => { try { showBig(bigQueue()); } catch (e) { console.warn("big news alert", e); } });
    if ((location.hash || "").startsWith("#/search/")) window.dispatchEvent(new HashChangeEvent("hashchange"));
  } catch (err) {
    loading = null; // allow a retry on reload
    pageReady = true;
    app.innerHTML = `${header("news")}<div class="wrap"><div class="empty">${mascotArt("alert-bear", "mempty")}<h2>Couldn't load</h2><p>${esc(err.message)}</p></div></div>`;
  }
}

lastView = viewKey();
playIntro();

sb.auth.onAuthStateChange((event, session) => {
  if (event === "INITIAL_SESSION" || event === "SIGNED_OUT") start(session);
  else if (event === "SIGNED_IN" && session?.user?.id !== state.user?.id) start(session);
});

// Sort dropdown: a click anywhere else closes it
document.addEventListener("click", (e) => { const r = document.getElementById("chres"); if (r && !e.target.closest("#chsearch")) r.hidden = true; });
// "/" jumps to the chart search (Charts page only, not while typing)
document.addEventListener("keydown", (e) => { if (e.key === "/" && (location.hash || "").startsWith("#/charts") && !e.target.closest?.("input, textarea, [contenteditable]")) { const i = document.getElementById("chq"); if (i) { e.preventDefault(); i.focus(); } } });
document.addEventListener("click", (e) => document.querySelectorAll("details.sortdd[open]").forEach((d) => { if (!d.contains(e.target)) d.removeAttribute("open"); }));
