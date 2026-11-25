// Start: login check, first draw, global listeners.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

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
