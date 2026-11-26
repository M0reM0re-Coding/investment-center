// Router (which page to draw) + checking for new stories.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

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
  applyMotion(); if (typeof applyPro === "function") applyPro();
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
  if (h.startsWith("#/pro")) {
    if (proPhone()) { location.hash = "#/"; return; }
    if (!proOn()) { proSet("ic_pro", "1"); applyPro(); }
    setApp(viewPro(), animate);
    if (proMod() === "fx" && typeof fxMountChart === "function") fxMountChart();
  } else if (h.startsWith("#/story/")) {
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
  else if (h === "#/stocks") { setApp(viewStocks(), animate); if (Date.now() - (chOf().loadedAt || 0) > 55e3) { chOf().loadedAt = Date.now(); loadChartData(); } }
  else if (h === "#/portfolio") setApp(viewPortfolio(), animate);
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
  priceTimer = setInterval(() => { loadQuotes(); if ((location.hash || "").startsWith("#/charts") && !document.hidden) { chOf().loadedAt = Date.now(); loadChartData(kc.sym ? [yahoo(kc.sym)] : []); } if (location.hash === "#/heatmap" && !document.hidden) loadHeatmap(); if (location.hash === "#/stocks" && !document.hidden) loadScr(chOf().scrNeed); if (location.hash === "#/portfolio" && !document.hidden && state.trades) pfPrices(); }, 60000);
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) { checkNew(); loadQuotes(); } });

