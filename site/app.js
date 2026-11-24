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

// Stories for one filter (also used for the counts on the filter chips)
function storiesFor(f) {
  let list = state.stories;
  if (f === "Saved") list = list.filter((s) => state.saved.has(s.id));
  else if (f === "To read") list = list.filter((s) => matches(s) && !["done", "later"].includes(stOf(s)));
  else if (f === "Later") list = list.filter((s) => stOf(s) === "later");
  else if (f === "Done") list = list.filter((s) => stOf(s) === "done");
  else if (f === "My watchlist") list = list.filter((s) => (s.tickers || []).some((x) => state.settings.watchlist.includes(x)));
  else if (f.startsWith("$")) list = list.filter((s) => (s.tickers || []).includes(f.slice(1))); // one stock (clicked in prices or tags)
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

// Small round actions on each photo (A style): ✓ done, clock = later
const acts = (s) => `<button class="chk ${stOf(s) === "done" ? "on" : ""}" data-done="${s.id}" title="${stOf(s) === "done" ? "Mark as not done" : "Done"}" aria-label="Done">${CHK}</button>
  <button class="lat ${stOf(s) === "later" ? "on" : ""}" data-later="${s.id}" title="${stOf(s) === "later" ? "Remove from later" : "Read later"}" aria-label="Read later">${ICO.clock}</button>`;
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

function trendPanel(list) {
  if (!list.length) return "";
  return `<div class="trend a"><h2>Trending now</h2><ol>${list.map((s, i) => `
    <li class="${stateCls(s).trim()}" data-go="${s.id}"><span class="num">${i + 2}</span><div><div class="meta">${metaTags(s)}${esc(label(s))} · ${agoAt(when(s))}</div>
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
  return src ? `<span class="lg" style="--s:${size}px"><img src="${src}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('txt');this.parentNode.textContent='${txt}'"></span>`
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

// ---------- views ----------
function header(active) {
  return `<header><div class="wrap nav">
    <a class="logo" href="#/"><i class="lmark" aria-hidden="true"></i>investment center</a>
    <nav>
      <a class="${active === "news" ? "on" : ""}" href="#/">My News</a>
      <a class="${active === "world" ? "on" : ""}" href="#/world">World Brief</a>
      <a class="soon">Charts<small>SOON</small></a>
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
  const filterRow = `<div class="filters a">${stockChip}<div class="quick">${["All", "My watchlist", "Saved"].map(fchip).join("")}</div>
    <div class="quick">${["To read", "Later", "Done"].map(fchip).join("")}</div>
    <div class="scroller"><button class="arrow prev" data-scroll="-1" title="Back" aria-label="Scroll topics back">‹</button><div class="track">${myTopics().map(fchip).join("")}</div><button class="arrow" data-scroll="1" title="More topics" aria-label="More topics">›</button></div></div>`;
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
    trending = reading || phone ? [] : rest0.slice(0, 5);
    const all = reading || phone ? rest0 : rest0.slice(5);
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
    ${mTicker()}
    ${filterRow}
    ${priceStrip()}
    <div class="page"><div class="left">${left}</div><aside class="right">${state.filter === "To read" ? queuePanel() : trendPanel(trending)}${seasonNote()}${upcomingPanel()}</aside></div></div>${dock()}`;
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
  const list = state.wreg === "All" ? all : state.wreg === "Thailand" ? all.filter(({ s }) => isThaiStory(s)) : all.filter(({ s }) => s.region === state.wreg);
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
    <div class="filters a"><div class="quick wchips">${state.wview === "map" ? "" : chips}</div>
      <div class="wviews" role="group" aria-label="View"><button class="${state.wview === "list" ? "on" : ""}" data-wview="list" aria-pressed="${state.wview === "list"}">List</button><button class="${state.wview === "map" ? "on" : ""}" data-wview="map" aria-pressed="${state.wview === "map"}">Map</button></div></div>
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
        ${wVote(s, own, false)}<span class="note hide-sm" style="margin:0">Want / No want tunes what World Brief puts first.</span></div>
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
  else if (h.startsWith("#/calendar")) {
    const d = h.slice(11), c = state.cal;
    if (/^\d{4}-\d\d-\d\d$/.test(d) && c.from !== h) { c.from = h; c.sel = d; c.wk = Math.max(0, Math.min(1, Math.floor(Math.round((dayOf(d) - monday()) / 864e5) / 35))); }
    if (!c.sel) c.sel = isoDay(today0());
    setApp(viewCalendar(), animate);
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
  priceTimer = setInterval(loadQuotes, 60000);
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) { checkNew(); loadQuotes(); } });

// ---------- events ----------
app.addEventListener("click", async (e) => {
  // Clicking outside the search box closes its results
  if (!e.target.closest(".search")) { const r = document.getElementById("res"); if (r) r.innerHTML = ""; }
  const el = e.target.closest("[data-theme-pick],[data-dark-pick],[data-light-pick],[data-motion],[data-lrange],[data-lpick],[data-calday],[data-calsel],[data-calf],[data-calwk],[data-cal],[data-done],[data-later],[data-qdone],[data-brief],[data-sdone],[data-slater],[data-mute-topic],[data-mute-source],[data-unmute-topic],[data-unmute-source],[data-save],[data-go],[data-filter],[data-ptab],[data-dock],[data-scroll],[data-act],[data-rm],[data-rm-t],[data-add],[data-topic-add],[data-stopic-add],[data-rm-st],[data-stock],[data-pa-add],[data-pa-rm],[data-pa-on],[data-tab-alerts],[data-tab-topics],[data-wvote],[data-wreg],[data-wmore],[data-wgo],[data-wdone],[data-wnext],[data-mkt-pick],[data-wview],[data-wzoom],[data-wsit],[data-go-world],[data-wbrief],[data-mascot],[data-bigalert],[data-season-pick]");
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
  if (el.dataset.calf) { state.cal.filter = el.dataset.calf; return render("soft"); }
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
  if (el.dataset.scroll !== undefined) { app.querySelector(".filters .track")?.scrollBy({ left: 320 * (Number(el.dataset.scroll) || 1), behavior: calm() ? "auto" : "smooth" }); return; }
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
  if (e.target.dataset?.note) { const m = document.getElementById("note-msg"); if (m) m.textContent = "Saving…"; return saveNote(e.target.dataset.note, e.target.value); }
  if (e.target.id !== "q") return;
  const q = e.target.value.trim();
  clearTimeout(searchTimer);
  if (!q) { searchSeq++; document.getElementById("res").innerHTML = state.draft ? viewBrowse() : ""; return; }
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
