// Reading status, queue, toast with Undo, notes, mutes.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

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

