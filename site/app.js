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
  cal: { filter: "All", wk: 0, sel: null, range: { days: 28, from: null, to: null }, hide: new Set() }, user: null, settings: null, stories: [], saved: new Set(), filter: "All", draft: null, fresh: new Set(),
  status: new Map(), notes: new Map(), events: [], more: new Map(), since: new Date(Date.now() - 864e5), ready005: false,
  briefing: null, searchQ: "", searchResults: null, loadingStory: null };
const calm = () => safe(() => matchMedia("(prefers-reduced-motion: reduce)").matches, false);
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
    <img src="${esc(s.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('noimg')">
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

// Stories for one filter (also used for the counts on the filter chips)
function storiesFor(f) {
  let list = state.stories;
  if (f === "Saved") list = list.filter((s) => state.saved.has(s.id));
  else if (f === "To read") list = list.filter((s) => matches(s) && !["done", "later"].includes(stOf(s)));
  else if (f === "Later") list = list.filter((s) => stOf(s) === "later");
  else if (f === "Done") list = list.filter((s) => stOf(s) === "done");
  else if (f === "My watchlist") list = list.filter((s) => (s.tickers || []).some((x) => state.settings.watchlist.includes(x)));
  else if (f !== "All") list = list.filter((s) => (s.topics || []).includes(f));
  else list = list.filter(matches);
  return list;
}
const visibleStories = () => [...storiesFor(state.filter)].sort((a, b) => rank(b) - rank(a));

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
    <circle class="now-ring" cx="${w}" cy="${y(pts[n])}" r="3" stroke="${col}"/><circle class="now" cx="${w}" cy="${y(pts[n])}" r="3" fill="${col}"/></svg>`;
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
    ? items.map((it) => `<div class="mk"><span class="nm">${esc(it.n)}</span><span class="sub">${esc(it.sub)}</span>${pxSpan(it.y)}${chSpan(it.y)}${spSpan(it.y, 74, 40)}</div>`).join("")
    : `<p class="note">Your watchlist is empty. Add stocks in Topics &amp; watchlist.</p>`;
  return `<div class="stripwrap a"><div class="strip-head"><h2>${tab === "m" ? "Markets" : "My watchlist"} <span class="delay">· Yahoo Finance, may be delayed</span>${marketBadges()}</h2>
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
  visibleStories().slice(0, 30).forEach((st) => (st.tickers || []).filter(followed).forEach((t) => s.add(yahoo(t))));
  return [...s].slice(0, 40);
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
  const it = (x) => `<span class="it"><b>${esc(x.n)}</b>${pxSpan(x.y)}${chSpan(x.y)}</span>`;
  const cell = (x) => `<div class="cell"><b>${esc(x.n)}</b><div>${pxSpan(x.y)} ${chSpan(x.y)}</div></div>`;
  return `<div class="dock ${state.dockOpen ? "open" : ""}" aria-label="Prices">
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
  const sync = () => track.parentElement.classList.toggle("more", track.scrollLeft + track.clientWidth < track.scrollWidth - 4);
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
  const [st, nt, ev] = await Promise.all([
    sb.from("story_status").select("story_id,status").limit(3000),
    sb.from("story_notes").select("story_id,note").limit(2000),
    sb.from("events").select("*").gte("day", todayISO()).order("day").limit(60),
  ]);
  state.ready005 = !st.error; // false until supabase/005_reading.sql has been run
  if (!st.error) state.status = new Map(st.data.map((r) => [r.story_id, r.status]));
  if (!nt.error) state.notes = new Map(nt.data.map((r) => [r.story_id, r.note]));
  if (!ev.error) state.events = ev.data || [];
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

// Small round actions on each photo (A style): ✓ done, ⏱ later
const acts = (s) => `<button class="chk ${stOf(s) === "done" ? "on" : ""}" data-done="${s.id}" title="${stOf(s) === "done" ? "Mark as not done" : "Done"}" aria-label="Done">${CHK}</button>
  <button class="lat ${stOf(s) === "later" ? "on" : ""}" data-later="${s.id}" title="${stOf(s) === "later" ? "Remove from later" : "Read later"}" aria-label="Read later">⏱</button>`;
const stateCls = (s) => ({ seen: " seen", done: " done", later: " later" }[stOf(s)] || "");
const metaTags = (s) => `${isNew(s) ? '<span class="newdot"></span><span class="newtag">NEW</span> · ' : ""}${isUpdated(s) ? '<span class="updtag">UPDATED</span> · ' : ""}${stOf(s) === "later" ? '<span class="latertag">⏱ LATER</span> · ' : ""}${state.notes.has(s.id) ? "📝 · " : ""}`;

// Price reaction: how the stock moved since the robot saved this story
function sinceMove(s, t) {
  const at = Number(s.prices_at?.[t]), q = quotes[yahoo(t)];
  if (!at || !q) return null;
  return ((q.price - at) / at) * 100;
}
const sinceTxt = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

function briefBar() {
  const waiting = waitingMust();
  const fresh = storiesFor("All").filter(isNew), hi = fresh.filter((s) => s.impact_score >= 7).length;
  const movers = (state.settings.watchlist || []).map((t) => [t, quotes[yahoo(t)]]).filter(([, q]) => q && q.prev)
    .sort((a, b) => Math.abs(pctOf(b[1])) - Math.abs(pctOf(a[1])));
  const mover = movers.length ? ` · ${esc(movers[0][0])} <span class="${dirOf(movers[0][1])}">${pctTxt(movers[0][1])}</span> today` : "";
  const thumb = (s) => (/^https:\/\//.test(s.image_url || "") ? `<img src="${esc(s.image_url)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : `<span class="${impClass(s.impact_score)}">${s.impact_score}</span>`);
  return `<div class="brief a">${calm() ? "" : BRIEF_BG}<div><h2>${waiting.length ? `${waiting.length} must-read${waiting.length > 1 ? "s" : ""} waiting` : "You're caught up ✓"}</h2>
      <p>Since you were away: ${fresh.length} new · ${hi} high-impact${mover}</p></div>
    <div class="thumbs">${waiting.slice(0, 4).map(thumb).join("")}</div>
    ${waiting.length ? `<button class="go" data-brief>▶ Start briefing · ~${waiting.length} min</button>` : ""}</div>`;
}

function queuePanel() {
  const list = storiesFor("To read").sort((a, b) => prio(b) - prio(a)), later = storiesFor("Later");
  const m = mustReads(), done = m.filter((s) => stOf(s) === "done").length;
  const th = (s) => (/^https:\/\//.test(s.image_url || "") ? `<img src="${esc(s.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='<span class=&quot;qi ${impClass(s.impact_score)}&quot;>${s.impact_score}</span>'">` : `<span class="qi ${impClass(s.impact_score)}">${s.impact_score}</span>`);
  const row = (s, k, next) => `<div class="q${next ? " next" : ""}" data-q="${s.id}"><span class="k">${k}</span>${th(s)}
    <span class="qt">${next ? '<span class="nexttag">NEXT UP</span>' : ""}<b data-go="${s.id}">${esc(s.headline)}</b><small>${s.impact_score} impact · ${esc(label(s))}${stOf(s) === "seen" ? " · opened" : ""}</small></span>
    <button class="qchk" data-qdone="${s.id}" title="Done" aria-label="Done">${CHK}</button></div>`;
  return `<div class="queue a"><h2>Read first <small>${list.length} to read</small></h2>
    ${m.length ? `<div class="prog"><div class="bar"><i style="width:${(done / m.length) * 100}%"></i></div><small>Must-reads today: ${done} of ${m.length} done</small></div>` : ""}
    ${list.length ? list.slice(0, 6).map((s, i) => row(s, i + 1, i === 0)).join("") : `<div class="caught">✓ All caught up</div>`}
    ${later.length ? `<div class="qsec">LATER (${later.length})</div>${later.slice(0, 4).map((s) => row(s, "⏱", false)).join("")}` : ""}</div>`;
}

function trendPanel(list) {
  if (!list.length) return "";
  return `<div class="trend a"><h2>Trending now</h2><ol>${list.map((s, i) => `
    <li class="${stateCls(s).trim()}" data-go="${s.id}"><span class="num">${i + 2}</span><div><div class="meta">${metaTags(s)}${esc(label(s))} · ${ago(when(s))}</div>
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
const CENTRAL = /rate decision|interest rate|policy rate|fomc|monetary policy|central bank/i;
const MARKET = "Market & economy";

// Who an event is about (logo), how important it is, and which row it goes in
function evInfo(e) {
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
const calEvents = () => { const t = isoDay(today0()); return state.events.filter((e) => e.day >= t).map((e) => ({ ...e, i: evInfo(e) })); };
const topLvl = (list) => list.reduce((a, e) => (LVL[e.i.lvl] > LVL[a] ? e.i.lvl : a), "low");
const byLvl = (a, b) => LVL[b.i.lvl] - LVL[a.i.lvl];

// Company logo (free logo service, by ticker), an institution's site icon, or a text badge if neither loads
function evLogo(i, size) {
  const sym = i.sym || "", y = yahoo(sym), txt = esc(sym.slice(0, 4));
  if (!sym) return "";
  const src = i.site ? `https://www.google.com/s2/favicons?domain=${i.site}&sz=64`
    : sym && !MACRO.some((m) => m[1] === sym) && /^[A-Za-z0-9.\-]{1,15}$/.test(y) ? `https://financialmodelingprep.com/image-stock/${y}.png` : "";
  return src ? `<span class="lg" style="--s:${size}px"><img src="${src}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('txt');this.parentNode.textContent='${txt}'"></span>`
    : `<span class="lg txt" style="--s:${size}px">${txt}</span>`;
}

// K1: the next key dates as countdown cards (the nearest one big and dark)
function keyDates(ev, n) {
  const all = ev.filter((e) => e.i.lvl === "key").sort((a, b) => (a.day < b.day ? -1 : 1)), ks = all.slice(0, n);
  if (!ks.length) return "";
  return `<div class="kd"><div class="kh"><span>KEY DATES</span><small>${all.length} coming up</small></div>${ks.map((e, k) => {
    const x = dayOf(e.day), d = daysTo(e.day);
    return `<div class="kc ${k === 0 ? "first" : ""}" data-calday="${e.day}">${evLogo(e.i, k === 0 ? 44 : 36)}
      <div class="kt"><b>${esc(e.title)}</b><small>${wkTxt(x)} ${x.getDate()} ${monTxt(x)} · ${e.i.kind}</small></div>
      <div class="kn">${d === 0 ? "<b class=\"sm\">TODAY</b>" : `<b>${d}</b><small>${d === 1 ? "DAY" : "DAYS"}</small>`}</div></div>`;
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
  return `<div class="calp a" data-cal><div class="mh"><h2>Upcoming</h2><a href="#/calendar">Full calendar →</a></div>
    <div class="mini">${["M", "T", "W", "T", "F", "S", "S"].map((w) => `<div class="w">${w}</div>`).join("")}${[...Array(35)].map((_, k) => cell(addDays(st, k))).join("")}</div>
    ${ev.length ? keyDates(ev, 3) : `<p class="note" style="margin-top:12px">No dates yet. Earnings and dividend dates for your watchlist are added once a day, and dates found in the news as they arrive.</p>`}</div>`;
}

function viewCalendar() {
  const c = state.cal, all = calEvents(), w = state.settings.watchlist || [], t0 = today0();
  const keep = { All: () => true, "Key only": (e) => e.i.lvl === "key", "My watchlist": (e) => w.includes(e.i.sym),
    Earnings: (e) => e.kind === "earnings", Dividends: (e) => e.kind === "dividend", News: (e) => e.kind === "news" }[c.filter] || (() => true);
  const ev = all.filter(keep), on = (d) => ev.filter((e) => e.day === d).sort(byLvl);
  const st = addDays(monday(), c.wk * 35), cells = [...Array(35)].map((_, k) => addDays(st, k));
  const cell = (x) => {
    const d = isoDay(x), list = on(d);
    return `<div class="c ${x < t0 ? "o" : ""} ${d === isoDay(t0) ? "today" : ""} ${d === c.sel ? "sel" : ""} ${list.length ? "h-" + topLvl(list) : ""}" data-calsel="${d}">
      <span class="n">${x.getDate() === 1 ? monTxt(x) + " " : ""}${x.getDate()}</span>${list.map((e) => `<span class="pill ${e.i.lvl}">${evLogo(e.i, 18)}<span>${esc(e.title)}</span></span>`).join("")}</div>`;
  };
  const sd = dayOf(c.sel), selList = on(c.sel);
  const item = (e) => `<div class="it">${evLogo(e.i, 40)}<div><span class="lvl ${e.i.lvl}">${LVL_TXT[e.i.lvl]}</span><b>${esc(e.title)}</b>
    <p>${e.i.kind}${e.ticker && quotes[yahoo(e.ticker)] ? ` · ${esc(e.ticker)} ${pxSpan(yahoo(e.ticker))} ${chSpan(yahoo(e.ticker))} today` : ""}</p>
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
  const chips = ["All", "Key only", "My watchlist", "Earnings", "Dividends", "News"];
  return `${header("news")}<div class="wrap calv">
    <a class="back a" href="#/">← Back to My News</a>
    <h1 class="ttl a">Calendar</h1>
    <p class="why a">Earnings, dividends and dates from your news. Red = the dates that matter most.</p>
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
    <p class="note">Dates come from Yahoo Finance (earnings, dividends) and from your news stories. Logos load from a free logo service.</p></div>`;
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
  const b = state.briefing, s = findStory(b.ids[b.i]);
  const dots = b.ids.map((id, i) => `<i class="${b.res[id] === "done" ? "ok" : b.res[id] === "later" ? "lt" : i === b.i ? "on" : ""}"></i>`).join("");
  ov.innerHTML = !s
    ? `<div class="sheet"><div class="end"><div class="big">✓</div><h2>You're caught up</h2>
        <p class="why">${storiesFor("To read").length} other stories left for when you have time.</p>
        <div class="act" style="justify-content:center"><button class="btn" data-bclose>Back to My News</button></div></div></div>`
    : `<div class="sheet slide" role="dialog" aria-label="Briefing">${media(s, true)}<div class="body">
        <div class="meta">${metaTags(s)}${esc((s.topics || []).join(" · "))} · ${ago(when(s))} · ▲ ${srcs(s.n_sources)}</div>
        <h2>${esc(s.headline)}</h2><ul>${(s.summary || []).slice(0, 4).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        <p class="why">${esc(s.what_it_means)}</p>
        <div class="act"><div class="dots">${dots}</div><button class="linkbtn" data-bopen="${s.id}">Open full story</button>
          <button class="btn ghost" data-blater="${s.id}">⏱ Later</button><button class="btn ok" data-bdone="${s.id}">✓ Done · next</button></div></div>
        <button class="x" data-bclose aria-label="Close">×</button></div>`;
}
function onBriefClick(e) {
  const el = e.target.closest("[data-bdone],[data-blater],[data-bopen],[data-bclose]");
  if (!el && e.target.id !== "brief-ov") return;
  const b = state.briefing;
  if (el?.dataset.bdone || el?.dataset.blater) {
    const id = el.dataset.bdone || el.dataset.blater, st = el.dataset.bdone ? "done" : "later";
    setStatus(id, st); b.res[id] = st; b.i++;
    return drawBriefing();
  }
  if (el?.dataset.bopen) { const id = el.dataset.bopen; state.briefing = null; drawBriefing(); location.hash = `#/story/${id}`; return; }
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
  if (next !== "seen") toastUndo(next === "done" ? "✓ Marked as read" : "⏱ Saved for later", () => { setStatus(id, prev || null); render(false); });
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
  return [...found.values()];
}

// ---------- views ----------
function header(active) {
  return `<header><div class="wrap nav">
    <a class="logo" href="#/">investment center</a>
    <nav>
      <a class="${active === "news" ? "on" : ""}" href="#/">My News</a>
      <a class="soon">World Brief<small>SOON</small></a>
      <a class="soon">Charts<small>SOON</small></a>
    </nav>
    <div class="r">
      <form class="hsearch" id="hsearch" role="search"><span>⌕</span><input id="hq" type="search" placeholder="Search news & notes" value="${esc(state.searchQ || "")}" autocomplete="off" maxlength="60"></form>
      <span class="live" title="Checks for new stories every 2 minutes"><i></i>LIVE</span>
      <a class="btn ghost" href="#/settings">Topics &amp; watchlist</a>
      <button class="btn" data-act="logout">Sign out</button>
    </div></div></header>`;
}

// Price chips under a story: today's move, plus the move since the story was saved
const pchips = (s) => (s.tickers || []).filter(followed).slice(0, 2).filter((t) => quotes[yahoo(t)]).map((t) => {
  const v = sinceMove(s, t);
  return `<span class="pchip"><b>${esc(t)}</b>${pxSpan(yahoo(t))}${chSpan(yahoo(t))}${v === null ? "" : `<span class="since ${v >= 0 ? "up" : "down"}" title="Change since this story was added">since ${sinceTxt(v)}</span>`}</span>`;
}).join("");

function viewFeed() {
  // Filter row (design round 9, option A): quick views | reading status | your topics in one sideways-scrolling row
  const fchip = (c) => `<button class="c ${c === state.filter ? "on" : ""}" data-filter="${esc(c)}">${esc(c)}<span class="count">${storiesFor(c).length}</span></button>`;
  const filterRow = `<div class="filters a"><div class="quick">${["All", "My watchlist", "Saved"].map(fchip).join("")}</div>
    <div class="quick">${["To read", "Later", "Done"].map(fchip).join("")}</div>
    <div class="scroller"><div class="track">${myTopics().map(fchip).join("")}</div><button class="arrow" data-scroll title="More topics" aria-label="More topics">›</button></div></div>`;
  const fr = (s) => (state.fresh.has(s.id) ? " fresh" : "");
  const list = visibleStories();
  let left, trending = [];
  if (!list.length) {
    const why = { Saved: "Tap ☆ on a story to save it.", "To read": "✓ You've read everything here.", Later: "Press ⏱ on a story to keep it for later.", Done: "Tick ✓ on a story when you've read it." }[state.filter]
      || "No stories match this filter in the last 3 days. Try another topic, or add topics in Topics &amp; watchlist.";
    left = `<div class="empty"><h2>${state.filter === "To read" ? "All caught up" : "Nothing here yet"}</h2><p>${why}</p></div>`;
  } else {
    const [h, ...rest0] = list;
    // Right column: Trending now (stories 2-6) normally; the Read first queue only in the "To read" view
    const reading = state.filter === "To read";
    trending = reading ? [] : rest0.slice(0, 5);
    const rest = reading ? rest0 : rest0.slice(5);
    left = `<div class="lead-wrap a${fr(h)}${stateCls(h)}" data-id="${h.id}"><div class="mwrap">${`<a class="lead" href="#/story/${h.id}">${media(h, true)}</a>`}${acts(h)}</div>
        <a class="lead" href="#/story/${h.id}"><h1>${esc(h.headline)}</h1></a>
        <div class="rowline"><div class="meta">${metaTags(h)}${esc(h.outlets?.[0])} · ${ago(when(h))} · ▲ ${srcs(h.n_sources)}</div>${star(h)}</div>
        ${heroChart(h)}
        <p class="why" style="margin-top:10px">${esc(h.what_it_means)}</p></div>
      ${rest.length ? `<div class="sec">More stories</div><div class="grid2">${rest.map((s) => `
        <div class="card a${fr(s)}${stateCls(s)}" data-go="${s.id}"><div class="mwrap">${media(s)}${acts(s)}</div><h3>${esc(s.headline)}</h3>
        <div class="rowline"><div class="meta">${metaTags(s)}${esc(s.outlets?.[0])} · ${ago(when(s))} · ▲ ${s.n_sources}</div>${star(s)}</div>${pchips(s) ? `<div class="vote">${pchips(s)}</div>` : ""}</div>`).join("")}</div>` : ""}`;
  }
  return `${header("news")}<div class="wrap">
    ${briefBar()}
    ${filterRow}
    ${priceStrip()}
    <div class="page"><div class="left">${left}</div><aside class="right">${state.filter === "To read" ? queuePanel() : trendPanel(trending)}${upcomingPanel()}</aside></div></div>${dock()}`;
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
  return `${header("news")}<div class="wrap">
    <a class="back a" href="#/">← Back to My News</a>
    <div class="rprog"><i></i></div>
    <div class="detail"><div>
      <div class="meta a">${metaTags(s)}${esc((s.topics || []).join(" · "))} · ${ago(when(s))} · ▲ ${srcs(s.n_sources)}</div>
      <h1 class="a">${esc(s.headline)}</h1>
      <div class="a" style="margin-bottom:14px"><span class="tag ${sentiment}">${esc(s.sentiment)}</span>${(s.tickers || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
      <div class="sacts a">
        <button class="sbtn ${st === "done" ? "on-done" : ""}" data-sdone="${s.id}">${st === "done" ? "✓ Done" : "✓ Mark as read"}</button>
        <button class="sbtn ${st === "later" ? "on-later" : ""}" data-slater="${s.id}">⏱ ${st === "later" ? "In Later" : "Read later"}</button>
        ${star(s)}
        <details class="mute"><summary>Show less like this ▾</summary><div class="menu">
          ${(s.topics || []).map((t) => `<button data-mute-topic="${esc(t)}">Hide topic “${esc(t)}”</button>`).join("")}
          ${outlets.map((o) => `<button data-mute-source="${esc(o)}">Hide news from ${esc(o)}</button>`).join("")}
          <p class="note">Watchlist news always stays. Undo anytime in Topics &amp; watchlist.</p></div></details>
      </div>
      ${/^https:\/\//.test(s.image_url || "") ? `<figure class="hero-fig"><img class="hero-img" src="${esc(s.image_url)}" alt="" referrerpolicy="no-referrer" onerror="this.parentNode.remove()">${s.image_credit ? `<figcaption>${esc(s.image_credit)}</figcaption>` : ""}</figure>` : ""}
      <div class="box a"><h4>Full detail</h4><ul>${(s.summary || []).map((b) => `<li>${esc(b)}</li>`).join("")}</ul></div>
      <div class="box a"><h4>What it means</h4><p>${esc(s.what_it_means)}</p></div>
      <div class="box wl a"><div class="w"><b>Who could win</b>${esc((s.winners || []).join(", ") || "—")}</div><div class="l"><b>Who could lose</b>${esc((s.losers || []).join(", ") || "—")}</div></div>
      <div class="box a"><h4>Watch next</h4><p>${esc(s.watch_next)}</p></div>
      <div class="box a"><h4>My takeaway</h4><textarea id="note" data-note="${s.id}" rows="3" maxlength="1000" placeholder="One line for future you: what did you learn, or what will you do?">${esc(state.notes.get(s.id) || "")}</textarea><p class="note" id="note-msg">Saved automatically. Only you can see it.</p></div>
      <p class="note">Summary and analysis written by AI (Gemini) from ${s.n_sources === 1 ? "1 outlet's" : s.n_sources + " outlets'"} headlines and snippets. Check the original articles before acting on it. Not investment advice.</p>
    </div>
    <aside class="side">
      <div class="box a">${tile(s)}
        <p style="margin-top:14px;font-weight:600">${esc(s.impact_reason)}</p>
        <div class="bars">${bar("Reach", p.reach)}${bar("Surprise", p.surprise)}${bar("Size", p.size)}${bar("Timing", p.timing)}</div>
        <p class="note">AI impact estimate (1–10).</p>
      </div>
      ${reaction ? `<div class="box a"><h4>Price reaction</h4>${reaction}<p class="note">Price when this story was added → now (Yahoo Finance, may be delayed).</p></div>` : ""}
      <div class="box a"><h4>Sources (${(s.links || []).length})</h4><ul class="srcs">${(s.links || []).map((l) =>
        `<li><b>${esc(l.outlet)}</b><a href="${safeUrl(l.link)}" target="_blank" rel="noopener noreferrer">${esc(l.title)} ↗</a></li>`).join("")}</ul></div>
    </aside></div></div>`;
}

function viewSearch() {
  const q = state.searchQ || "", r = state.searchResults;
  const row = (s) => `<div class="sr${stateCls(s)}" data-go="${s.id}">${/^https:\/\//.test(s.image_url || "") ? `<img src="${esc(s.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : `<span class="qi ${impClass(s.impact_score)}">${s.impact_score}</span>`}
    <div><div class="meta">${metaTags(s)}${esc((s.topics || [])[0] || "")} · ${new Date(when(s)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · impact ${s.impact_score}</div>
    <h3>${esc(s.headline)}</h3>${state.notes.has(s.id) ? `<p class="note">📝 ${esc(state.notes.get(s.id))}</p>` : ""}</div></div>`;
  return `${header("news")}<div class="wrap"><div class="panel" style="max-width:900px">
    <a class="back a" href="#/">← Back to My News</a>
    <h1 class="a" style="margin-top:16px">Search: “${esc(q)}”</h1>
    <p class="why a">All saved stories (not just the last 3 days) and your notes.</p>
    <div class="results-list a">${r === null ? `<p class="why">Searching…</p>` : r.error ? `<p class="msg err">${esc(r.error)}</p>`
      : r.length ? r.map(row).join("") : `<p class="why">No stories found. Try a company name, ticker or topic.</p>`}</div></div></div>`;
}

// Unsaved edits on the Topics & watchlist page live here until you press Save.
const makeDraft = () => ({
  topics: [...(state.settings.topics || [])],
  watchlist: [...(state.settings.watchlist || [])],
  custom_topics: [...(state.settings.custom_topics || [])],
  watch_names: { ...(state.settings.watch_names || {}) },
});
const known = (t) => CFG.tickers.includes(t);

function viewSettings() {
  const d = state.draft;
  const extra = d.watchlist.filter((t) => !known(t));
  const chip = (t) => `<span class="chip on" data-chip="${esc(t)}" title="${esc(d.watch_names[t] || "")}">${esc(t)}<button data-rm="${esc(t)}" title="Remove">×</button></span>`;
  const tchip = (t) => `<span class="chip topic" data-chip="${esc(t)}"># ${esc(t)}<button data-rm-t="${esc(t)}" title="Remove">×</button></span>`;
  return `${header("")}<div class="wrap"><div class="panel">
    <a class="back a" href="#/">← Back to My News</a>
    <h1 class="a" style="margin-top:16px">Topics &amp; watchlist</h1>
    <p class="why a">Search any stock or subject. Saved to your account, so it's the same on every device. Telegram alerts follow these too.</p>
    <div class="search a"><span class="mag">⌕</span><input id="q" placeholder="Search stocks or topics, e.g. tesla, gulf, toyota, rare earths…" autocomplete="off" maxlength="40"><div id="res"></div></div>
    <h2 class="sec a" style="margin-top:32px">My watchlist &amp; topics</h2>
    <div class="wlist a">${d.watchlist.map(chip).join("")}${d.custom_topics.map(tchip).join("")}${!d.watchlist.length && !d.custom_topics.length ? `<span class="note">Nothing yet. Search above to add stocks or topics.</span>` : ""}</div>
    <p class="note a">Your own topics: ${d.custom_topics.length} of ${MAX_CUSTOM_TOPICS}. Stocks outside the robot's built-in list get their own news search: ${Math.min(extra.length, MAX_EXTRA_TICKERS)} of ${MAX_EXTRA_TICKERS} used${extra.length > MAX_EXTRA_TICKERS ? ` (the rest still match by name, without their own search)` : ""}. These limits keep the robot inside the free tiers.</p>
    ${(state.settings.muted_topics || []).length || (state.settings.muted_sources || []).length ? `<h2 class="sec a" style="margin-top:32px">Hidden (show less)</h2>
    <div class="wlist a">${(state.settings.muted_topics || []).map((t) => `<span class="chip muted">Topic: ${esc(t)}<button data-unmute-topic="${esc(t)}" title="Show again">×</button></span>`).join("")}${(state.settings.muted_sources || []).map((o) => `<span class="chip muted">Source: ${esc(o)}<button data-unmute-source="${esc(o)}" title="Show again">×</button></span>`).join("")}</div>
    <p class="note a">Hidden from My News and Telegram alerts. News about your watchlist always shows. Press × to show again (saves straight away).</p>` : ""}
    <h2 class="sec a" style="margin-top:32px">Suggested topics</h2>
    <div class="checks">${CFG.topics.map((t) => `<label class="a"><input type="checkbox" data-topic="${esc(t)}" ${d.topics.includes(t) ? "checked" : ""}> ${esc(t)}</label>`).join("")}</div>
    <div class="a" style="margin-top:32px"><button class="btn" data-act="save-settings">Save</button><span id="saved-msg"></span></div>
  </div></div>`;
}

const typeName = (t) => ({ EQUITY: "Stock", ETF: "ETF", INDEX: "Index", CRYPTOCURRENCY: "Crypto", MUTUALFUND: "Fund" }[t] || t || "");
// Thai stocks come back from Yahoo as PTT.BK; the robot and the rest of the site use plain PTT.
// Thai stocks come back as PTT.BK; ones the robot already knows are stored as plain PTT, others keep .BK so prices still work
const cleanSym = (s) => { const u = String(s || "").toUpperCase(), base = u.replace(/\.BK$/, ""); return CFG.tickers.includes(base) ? base : u; };
const cleanName = (n) => String(n || "").replace(/^[A-Z0-9&.-]+_/, ""); // Yahoo's Thai names: "PTT_PTT" -> "PTT"

function viewResults(q, list, note = "") {
  const d = state.draft;
  const topic = q.trim().replace(/\s+/g, " ").slice(0, 40);
  let i = 0;
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
  return `<div class="results"><div class="head">STOCKS FOUND ONLINE</div>${stockRows}
    <div class="head">OR FOLLOW AS A TOPIC</div>
    <div class="row ${haveT || fullT ? "dim" : ""}" style="--i:${i}" ${haveT || fullT ? "" : `data-topic-add="${esc(topic)}"`}>
      <span class="sym">#</span><span class="nm">${esc(topic)}<small>${fullT && !haveT ? `You already follow ${MAX_CUSTOM_TOPICS} of your own topics. Remove one first.` : "The robot searches the news for this phrase"}</small></span>
      <span class="kind t">${haveT ? "ADDED" : "+ TOPIC"}</span></div></div>`;
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

function viewLogin(msg = "", err = false, email = "") {
  return `<div class="login enter"><div class="logo a">investment center</div>
    <p class="why a" style="margin-top:10px">Sign in to your news.</p>
    <form id="login" class="login-form">
      <input class="a" type="email" id="email" placeholder="Email" autocomplete="username" required value="${esc(email)}">
      <div class="pw a"><input type="password" id="password" placeholder="Password" autocomplete="current-password">
        <button type="button" class="eye" data-act="eye" title="Show password" aria-label="Show password" aria-pressed="false">${EYE}</button></div>
      <label class="remember a"><input type="checkbox" id="remember" ${remember() ? "checked" : ""}> Remember me</label>
      <button class="btn a" type="submit">Sign in</button>
    </form>
    <p class="msg ${err ? "err" : ""}">${esc(msg)}</p>
    <button class="linkbtn a" data-act="magic">Email me a login link instead</button></div>`;
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
function playIntro() {
  const force = /[?&]intro\b/.test(location.search);
  if (calm() || (!force && ssGet("ic_intro_seen"))) return;
  ssSet("ic_intro_seen", "1");
  const n = Number(lsGet("ic_intro_n") || 0) % 4;
  lsSet("ic_intro_n", String(n + 1));
  const ticks = lastQuotes(), up = (t) => !String(t[2]).startsWith("-");
  const tk = (t) => `<span><b>${esc(t[0])}</b> ${esc(t[1])} <span class="${up(t) ? "u" : "d"}">${up(t) ? "▲" : "▼"} ${esc(t[2])}</span></span>`;
  const names = ticks.length ? ticks : MARKETS.map((m) => [m[1], "", ""]);
  const el = document.createElement("div");
  el.className = "intro";
  el.setAttribute("aria-hidden", "true");
  let total = 2300;
  if (n === 0) {          // A. chart line
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
    // replay the page's rise-in so it arrives as the intro leaves
    app.classList.remove("enter"); void app.offsetWidth; app.classList.add("enter");
    if (typeof countUp === "function") countUp();
    setTimeout(() => el.remove(), 650);
    removeEventListener("keydown", finish);
  };
  el.addEventListener("click", finish);
  addEventListener("keydown", finish);
  setTimeout(finish, total);
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
const marketBadges = () => [["SET", "Asia/Bangkok", [[600, 750], [870, 990]]], ["NYSE", "America/New_York", [[570, 960]]]]
  .map(([n, tz, s]) => { const o = mktOpen(tz, s); return `<span class="mkt ${o ? "open" : ""}" title="${n} regular hours (holidays not included)"><i></i>${n} ${o ? "open" : "closed"}</span>`; }).join("");

// 4. Heartbeat next to LIVE
const HB_PATH = "M0 9 H13 L16 9 L19 2 L23 15 L26 5 L28 9 H44";
const HEARTBEAT = `<svg class="hb" viewBox="0 0 44 16" aria-hidden="true"><path class="base" d="${HB_PATH}"/><path class="beat" pathLength="100" d="${HB_PATH}"/></svg>`;
// 8. Green chart line that draws along the bottom of a card on hover
const GLINT = `<svg class="glint" viewBox="0 0 300 30" preserveAspectRatio="none" aria-hidden="true"><path d="M0 26 L40 22 L80 24 L120 14 L160 18 L200 8 L240 12 L300 2"/></svg>`;
// 10. Slow chart line drifting behind the briefing bar
const BRIEF_BG = `<svg class="bgline" viewBox="0 0 1200 80" preserveAspectRatio="none" aria-hidden="true"><path d="M0 60 L60 52 L120 58 L180 40 L240 46 L300 30 L360 38 L420 22 L480 30 L540 18 L600 26 L660 52 L720 58 L780 40 L840 46 L900 30 L960 38 L1020 22 L1080 30 L1140 18 L1200 26"/></svg>`;

// 6. Chart-line page wipe when you move to another page (feed → story, → calendar, …)
let lastView = null;
function pageWipe() {
  const key = (location.hash || "#/").split("/")[1] || "feed";
  const changed = lastView !== null && key !== lastView;
  lastView = key;
  if (!changed || calm()) return;
  document.querySelector(".pwipe")?.remove();
  const w = document.createElement("div");
  w.className = "pwipe";
  w.setAttribute("aria-hidden", "true");
  w.innerHTML = `<div class="cover"></div><svg viewBox="0 0 1000 100" preserveAspectRatio="none"><path d="M0 80 L120 66 L230 72 L360 44 L470 54 L600 28 L720 36 L860 14 L1000 8"/></svg>`;
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
function render(animate = true) {
  app.classList.toggle("enter", animate && !calm());
  if (!state.user) {
    // A failed email link comes back as #error=...; show it in plain words and tidy the address bar
    const err = new URLSearchParams((location.hash || "").replace(/^#/, "")).get("error_description");
    if (err) history.replaceState(null, "", location.pathname);
    app.innerHTML = err ? viewLogin(friendly(err), true) : viewLogin();
    return;
  }
  const h = location.hash || "#/";
  if (h !== "#/settings") state.draft = null;
  if (h.startsWith("#/story/")) {
    const id = decodeURIComponent(h.slice(8)), s = findStory(id);
    app.innerHTML = viewStory(id);
    if (s && !stOf(s)) setStatus(id, "seen");            // opening a story marks it as seen
    if (!s && state.loadingStory !== id) loadOneStory(id); // older than 3 days (e.g. from search or Telegram)
  } else if (h.startsWith("#/search/")) app.innerHTML = viewSearch();
  else if (h.startsWith("#/calendar")) {
    const d = h.slice(11), c = state.cal;
    if (/^\d{4}-\d\d-\d\d$/.test(d) && c.from !== h) { c.from = h; c.sel = d; c.wk = Math.max(0, Math.min(1, Math.floor(Math.round((dayOf(d) - monday()) / 864e5) / 35))); }
    if (!c.sel) c.sel = isoDay(today0());
    app.innerHTML = viewCalendar();
  }
  else if (h === "#/settings") { state.draft = state.draft || makeDraft(); app.innerHTML = viewSettings(); }
  else app.innerHTML = viewFeed();
  app.querySelectorAll(".a").forEach((el, i) => el.style.setProperty("--i", Math.min(i, 14)));
  updateDock();
  const side = app.querySelector(".right, .sidecol");
  if (side && sideWatch) { sideWatch.disconnect(); sideWatch.observe(side); }
  setupFilterRow();
  if (animate) countUp();
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
  priceTimer = setInterval(loadQuotes, 60000);
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) { checkNew(); loadQuotes(); } });

// ---------- events ----------
app.addEventListener("click", async (e) => {
  // Clicking outside the search box closes its results
  if (!e.target.closest(".search")) { const r = document.getElementById("res"); if (r) r.innerHTML = ""; }
  const el = e.target.closest("[data-lrange],[data-lpick],[data-calday],[data-calsel],[data-calf],[data-calwk],[data-cal],[data-done],[data-later],[data-qdone],[data-brief],[data-sdone],[data-slater],[data-mute-topic],[data-mute-source],[data-unmute-topic],[data-unmute-source],[data-save],[data-go],[data-filter],[data-ptab],[data-dock],[data-scroll],[data-act],[data-rm],[data-rm-t],[data-add],[data-topic-add]");
  if (!el) return;
  if (el.dataset.save) {
    e.preventDefault(); e.stopPropagation();
    const id = el.dataset.save;
    if (state.saved.has(id)) { await sb.from("saved").delete().eq("story_id", id); state.saved.delete(id); }
    else { await sb.from("saved").insert({ user_id: state.user.id, story_id: id }); state.saved.add(id); }
    render(false);
    return pop(`[data-save="${CSS.escape(id)}"]`);
  }
  if (el.dataset.lrange) { state.cal.range = { days: Number(el.dataset.lrange), from: null, to: null }; return render(false); }
  if (el.dataset.lpick) { const h = state.cal.hide, k = el.dataset.lpick; if (k === "*") h.clear(); else if (h.has(k)) h.delete(k); else h.add(k); return render(false); }
  if (el.dataset.calday) { location.hash = `#/calendar/${el.dataset.calday}`; return; }
  if (el.dataset.cal !== undefined) { if (!e.target.closest("a")) location.hash = "#/calendar"; return; }
  if (el.dataset.calsel) { state.cal.sel = el.dataset.calsel; return render(false); }
  if (el.dataset.calf) { state.cal.filter = el.dataset.calf; return render(false); }
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
  if (el.dataset.filter) { state.filter = el.dataset.filter; render(); return loadQuotes(); }
  if (el.dataset.scroll !== undefined) { app.querySelector(".filters .track")?.scrollBy({ left: 320, behavior: calm() ? "auto" : "smooth" }); return; }
  if (el.dataset.dock !== undefined) {
    state.dockOpen = !state.dockOpen;
    el.closest(".dock").classList.toggle("open", state.dockOpen);
    el.textContent = state.dockOpen ? "▼ Less" : (state.settings.watchlist || []).length ? "▲ Markets" : "▲ More";
    return;
  }
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
  const t = e.target.dataset?.topic;
  if (!t || !state.draft) return;
  const on = new Set(state.draft.topics);
  e.target.checked ? on.add(t) : on.delete(t);
  state.draft.topics = CFG.topics.filter((x) => on.has(x));
});

app.addEventListener("input", (e) => {
  if (e.target.dataset?.note) { const m = document.getElementById("note-msg"); if (m) m.textContent = "Saving…"; return saveNote(e.target.dataset.note, e.target.value); }
  if (e.target.id !== "q") return;
  const q = e.target.value.trim();
  clearTimeout(searchTimer);
  if (!q) { searchSeq++; document.getElementById("res").innerHTML = ""; return; }
  searchTimer = setTimeout(() => runSearch(q), 300); // wait until you stop typing
});

app.addEventListener("keydown", (e) => {
  if (e.target.id === "q" && e.key === "Escape") { e.target.value = ""; document.getElementById("res").innerHTML = ""; }
});

app.addEventListener("submit", async (e) => {
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
let loading = null; // the user id currently being loaded, so two login signals don't load twice
async function start(session) {
  const uid = session?.user?.id || null;
  if (uid && loading === uid) return;
  loading = uid;
  state.user = session?.user || null;
  if (location.search.includes("code=")) history.replaceState(null, "", location.pathname + location.hash); // tidy URL after login
  if (!state.user) return render();
  app.innerHTML = `<p class="loading">Loading your news…</p>`;
  try {
    await loadSettings();
    await loadStories();
    await loadReading();
    await Promise.race([loadQuotes(), new Promise((r) => setTimeout(r, 1500))]); // show prices with the first paint if they come quickly
    render();
    startPolling();
    if ((location.hash || "").startsWith("#/search/")) window.dispatchEvent(new HashChangeEvent("hashchange"));
  } catch (err) {
    loading = null; // allow a retry on reload
    app.innerHTML = `${header("news")}<div class="wrap"><div class="empty"><h2>Couldn't load</h2><p>${esc(err.message)}</p></div></div>`;
  }
}

lastView = (location.hash || "#/").split("/")[1] || "feed";
playIntro();

sb.auth.onAuthStateChange((event, session) => {
  if (event === "INITIAL_SESSION" || event === "SIGNED_OUT") start(session);
  else if (event === "SIGNED_IN" && session?.user?.id !== state.user?.id) start(session);
});
