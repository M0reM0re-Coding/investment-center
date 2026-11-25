// Small helpers + loading data from Supabase.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

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

