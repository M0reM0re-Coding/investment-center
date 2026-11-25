// Topics & watchlist page (#/settings).
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

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

