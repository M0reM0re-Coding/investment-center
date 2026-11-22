// Investment Center website: page 1 (My News). Plain JavaScript, no build step.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const CFG = window.IC_CONFIG;
const sb = createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { flowType: "pkce" } });
const app = document.getElementById("app");

const state = { user: null, settings: null, stories: [], saved: new Set(), filter: "All" };

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
    <div class="n">${esc(s.impact_score)}<span>IMPACT</span></div>
    <div class="tk">${esc((s.tickers || []).slice(0, big ? 4 : 3).join(" · "))}</div>
  </div>`;
}
// Publisher's picture with the impact badge on top. If the picture fails to load, the impact tile underneath shows instead.
function media(s, big = false) {
  if (!/^https:\/\//.test(s.image_url || "")) return tile(s, big);
  return `<div class="pic">${tile(s, big)}
    <img src="${esc(s.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('noimg')">
    <span class="badge ${impClass(s.impact_score)}">${esc(s.impact_score)} <small>IMPACT</small></span></div>`;
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
function matches(s) {
  const t = new Set(state.settings.topics || []), w = new Set(state.settings.watchlist || []);
  return (s.topics || []).some((x) => t.has(x)) || (s.tickers || []).some((x) => w.has(x));
}
const rank = (s) => s.impact_score * 3 + Math.min(s.n_sources, 10) - hoursAgo(when(s)) / 6;

function visibleStories() {
  let list = state.stories;
  const f = state.filter;
  if (f === "Saved") list = list.filter((s) => state.saved.has(s.id));
  else if (f === "My watchlist") list = list.filter((s) => (s.tickers || []).some((x) => state.settings.watchlist.includes(x)));
  else if (f !== "All") list = list.filter((s) => (s.topics || []).includes(f));
  else list = list.filter(matches);
  return [...list].sort((a, b) => rank(b) - rank(a));
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
      <a class="btn ghost" href="#/settings">Topics &amp; watchlist</a>
      <button class="btn" data-act="logout">Sign out</button>
    </div></div></header>`;
}

function viewFeed() {
  const chips = ["All", ...state.settings.topics, "My watchlist", "Saved"];
  const list = visibleStories();
  let body;
  if (!list.length) {
    body = `<div class="empty"><h2>Nothing here yet</h2><p>${
      state.filter === "Saved" ? "Tap ☆ on a story to save it." : "No stories match this filter in the last 3 days. Try another topic, or add topics in Topics &amp; watchlist."
    }</p></div>`;
  } else {
    const [h, ...rest] = list;
    const trending = rest.slice(0, 5), more = rest.slice(5);
    body = `<div class="hero">
      <div><a class="lead" href="#/story/${h.id}">${media(h, true)}<h1>${esc(h.headline)}</h1></a>
      <div class="rowline"><div class="meta">${esc(h.outlets?.[0])} · ${ago(when(h))} · ▲ ${srcs(h.n_sources)}</div>${star(h)}</div>
      <p class="why" style="margin-top:10px">${esc(h.what_it_means)}</p></div>
      ${trending.length ? `<div class="trend"><h2>Trending now</h2><ol>${trending.map((s, i) => `
        <li data-go="${s.id}"><span class="num">${i + 2}</span><div><div class="meta">${esc(label(s))} · ${ago(when(s))}</div>
        <h3>${esc(s.headline)}</h3><div class="vote">▲ ${srcs(s.n_sources)} · impact ${s.impact_score}</div></div></li>`).join("")}</ol></div>` : ""}
    </div>
    ${more.length ? `<div class="sec">More stories</div><div class="grid">${more.map((s) => `
      <div class="card" data-go="${s.id}">${media(s)}<h3>${esc(s.headline)}</h3>
      <div class="rowline"><div class="meta">${esc(s.outlets?.[0])} · ${ago(when(s))} · ▲ ${s.n_sources}</div>${star(s)}</div></div>`).join("")}</div>` : ""}`;
  }
  return `${header("news")}<div class="wrap">
    <div class="chips">${chips.map((c) => `<button class="chip ${c === state.filter ? "on" : ""}" data-filter="${esc(c)}">${esc(c)}</button>`).join("")}</div>
    ${body}</div>`;
}

function viewStory(id) {
  const s = state.stories.find((x) => x.id === id);
  if (!s) return `${header("news")}<div class="wrap"><a class="back" href="#/">← Back</a><div class="empty"><h2>Story not found</h2><p>It may be older than 3 days.</p></div></div>`;
  const p = s.impact_parts || {};
  const sentiment = s.sentiment === "Bullish" ? "bull" : s.sentiment === "Bearish" ? "bear" : "";
  const bar = (name, v) => `<div><span>${name}</span><i><em style="width:${(v || 0) * 10}%"></em></i><b>${esc(v)}</b></div>`;
  return `${header("news")}<div class="wrap">
    <a class="back" href="#/">← Back to My News</a>
    <div class="detail"><div>
      <div class="meta">${esc((s.topics || []).join(" · "))} · ${ago(when(s))} · ▲ ${srcs(s.n_sources)}</div>
      <h1>${esc(s.headline)}</h1>
      <div style="margin-bottom:18px"><span class="tag ${sentiment}">${esc(s.sentiment)}</span>${(s.tickers || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
      ${/^https:\/\//.test(s.image_url || "") ? `<img class="hero-img" src="${esc(s.image_url)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}
      <div class="box"><h4>Full detail</h4><ul>${(s.summary || []).map((b) => `<li>${esc(b)}</li>`).join("")}</ul></div>
      <div class="box"><h4>What it means</h4><p>${esc(s.what_it_means)}</p></div>
      <div class="box wl"><div class="w"><b>Who could win</b>${esc((s.winners || []).join(", ") || "—")}</div><div class="l"><b>Who could lose</b>${esc((s.losers || []).join(", ") || "—")}</div></div>
      <div class="box"><h4>Watch next</h4><p>${esc(s.watch_next)}</p></div>
      <p class="note">Summary and analysis written by AI (Gemini) from ${s.n_sources === 1 ? "1 outlet's" : s.n_sources + " outlets'"} headlines and snippets. Check the original articles before acting on it. Not investment advice.</p>
    </div>
    <aside class="side">
      <div class="box">${tile(s)}
        <p style="margin-top:14px;font-weight:600">${esc(s.impact_reason)}</p>
        <div class="bars">${bar("Reach", p.reach)}${bar("Surprise", p.surprise)}${bar("Size", p.size)}${bar("Timing", p.timing)}</div>
        <p class="note">AI impact estimate (1–10).</p>
        <div style="margin-top:14px">${star(s)} <span class="meta">${state.saved.has(s.id) ? "Saved" : "Save for later"}</span></div>
      </div>
      <div class="box"><h4>Sources (${(s.links || []).length})</h4><ul class="srcs">${(s.links || []).map((l) =>
        `<li><b>${esc(l.outlet)}</b><a href="${safeUrl(l.link)}" target="_blank" rel="noopener noreferrer">${esc(l.title)} ↗</a></li>`).join("")}</ul></div>
    </aside></div></div>`;
}

function viewSettings() {
  const st = state.settings;
  const options = CFG.tickers.filter((t) => !st.watchlist.includes(t));
  return `${header("")}<div class="wrap"><div class="panel">
    <a class="back" href="#/">← Back to My News</a>
    <h1 style="margin-top:16px">Topics &amp; watchlist</h1>
    <p class="why">Pick what matters to you. Saved to your account, so it's the same on every device. Telegram alerts will follow these too.</p>
    <h2 class="sec" style="margin-top:32px">Topics</h2>
    <div class="checks">${CFG.topics.map((t) => `<label><input type="checkbox" data-topic="${esc(t)}" ${st.topics.includes(t) ? "checked" : ""}> ${esc(t)}</label>`).join("")}</div>
    <h2 class="sec" style="margin-top:32px">Watchlist</h2>
    <div class="wlist">${st.watchlist.map((t) => `<span class="chip on">${esc(t)}<button data-rm="${esc(t)}" title="Remove">×</button></span>`).join("")}</div>
    <div style="margin-top:14px;display:flex;gap:8px">
      <select id="add-ticker">${options.map((t) => `<option>${esc(t)}</option>`).join("")}</select>
      <button class="btn ghost" data-act="add-ticker">Add</button>
    </div>
    <p class="note">Only tickers the robot knows how to recognise are listed. Ask Claude to add more in robot/catalog.json.</p>
    <div style="margin-top:32px"><button class="btn" data-act="save-settings">Save</button><span id="saved-msg"></span></div>
  </div></div>`;
}

function viewLogin(msg = "", err = false) {
  return `<div class="login"><div class="logo">investment center</div>
    <p class="why" style="margin-top:10px">Sign in with your email. We'll send you a one-click login link (no password).</p>
    <form id="login"><input type="email" id="email" placeholder="you@example.com" required><button class="btn">Send link</button></form>
    <p class="msg ${err ? "err" : ""}">${esc(msg)}</p></div>`;
}

// ---------- router ----------
function render() {
  if (!state.user) { app.innerHTML = viewLogin(); return; }
  const h = location.hash || "#/";
  if (h.startsWith("#/story/")) app.innerHTML = viewStory(h.slice(8));
  else if (h === "#/settings") app.innerHTML = viewSettings();
  else app.innerHTML = viewFeed();
}
window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });

// ---------- events ----------
app.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-save],[data-go],[data-filter],[data-act],[data-rm]");
  if (!el) return;
  if (el.dataset.save) {
    e.preventDefault(); e.stopPropagation();
    const id = el.dataset.save;
    if (state.saved.has(id)) { await sb.from("saved").delete().eq("story_id", id); state.saved.delete(id); }
    else { await sb.from("saved").insert({ user_id: state.user.id, story_id: id }); state.saved.add(id); }
    return render();
  }
  if (el.dataset.go) { location.hash = `#/story/${el.dataset.go}`; return; }
  if (el.dataset.filter) { state.filter = el.dataset.filter; return render(); }
  if (el.dataset.rm) { state.settings.watchlist = state.settings.watchlist.filter((t) => t !== el.dataset.rm); return render(); }
  const act = el.dataset.act;
  if (act === "logout") { await sb.auth.signOut(); return; }
  if (act === "add-ticker") {
    const t = document.getElementById("add-ticker").value;
    if (t && !state.settings.watchlist.includes(t)) state.settings.watchlist.push(t);
    return render();
  }
  if (act === "save-settings") {
    const topics = [...document.querySelectorAll("[data-topic]")].filter((c) => c.checked).map((c) => c.dataset.topic);
    const { error } = await sb.from("user_settings").update({ topics, watchlist: state.settings.watchlist, updated_at: new Date().toISOString() }).eq("user_id", state.user.id);
    if (!error) { state.settings.topics = topics; state.filter = "All"; }
    document.getElementById("saved-msg").innerHTML = error ? `<span class="msg err">Could not save: ${esc(error.message)}</span>` : `<span class="saved-ok">Saved ✓</span>`;
  }
});

app.addEventListener("submit", async (e) => {
  if (e.target.id !== "login") return;
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  app.innerHTML = error ? viewLogin(error.message, true) : viewLogin("Check your email and click the link. You can close this tab.");
});

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
    render();
  } catch (err) {
    loading = null; // allow a retry on reload
    app.innerHTML = `${header("news")}<div class="wrap"><div class="empty"><h2>Couldn't load</h2><p>${esc(err.message)}</p></div></div>`;
  }
}

sb.auth.onAuthStateChange((event, session) => {
  if (event === "INITIAL_SESSION" || event === "SIGNED_OUT") start(session);
  else if (event === "SIGNED_IN" && session?.user?.id !== state.user?.id) start(session);
});
