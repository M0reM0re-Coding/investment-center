// Price alerts (rules saved in Supabase).
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

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

