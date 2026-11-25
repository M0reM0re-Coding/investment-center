// Startup: config, login storage, shared state, theme / motion / season.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// Investment Center website: page 1 (My News). Plain JavaScript, no build step.
const { createClient } = supabase;   // Supabase library (loaded before this file by index.html)

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

