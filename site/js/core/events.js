// Clicks, typing and forms for every page.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

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

