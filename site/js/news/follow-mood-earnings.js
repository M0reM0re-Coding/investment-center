// Follow, Market mood (Fear & Greed), Earnings cards.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// ---------- Follow (design round 34): stories on both pages + World places -> Telegram alerts (robot/follows.py) ----------
const isFollowing = (kind, key) => state.follows.has(`${kind}:${key}`);
async function toggleFollow(kind, key, label) {
  if (!state.ready012) return toast("Run supabase/012_follow_earnings_mood.sql in Supabase first");
  const id = `${kind}:${key}`, on = state.follows.has(id);
  if (on) state.follows.delete(id); else state.follows.add(id);
  render("soft");
  const q = on ? sb.from("follows").delete().eq("kind", kind).eq("key", key)
    : sb.from("follows").insert({ user_id: state.user.id, kind, key, label: (label || "").slice(0, 200) });
  const { error } = await q;
  if (error) { if (on) state.follows.add(id); else state.follows.delete(id); render("soft"); return toast("Could not save: " + error.message); }
  toast(on ? "Stopped following" : kind === "place" ? `Following ${key.split(":")[1]} · new World stories there go to Telegram` : "Following · Telegram tells you when it grows");
}
const followBtn = (kind, key, label) => `<button class="sbtn ${isFollowing(kind, key) ? "on-follow" : ""}" data-follow="${kind}" data-fkey="${esc(key)}" data-flabel="${esc(label)}">${ICO.bell}${isFollowing(kind, key) ? "Following" : "Follow"}</button>`;

// ---------- Market mood: Fear & Greed + your stocks' news mood ----------
// Stock Fear & Greed comes from CNN. CNN has no public API and blocks robots, so the robot doesn't fetch it:
// your browser asks CNN when you open My News (a normal visit, cached 30 min). If CNN says no, the box links to CNN instead.
async function loadCnn() {
  const c = safe(() => JSON.parse(sessionStorage.getItem("ic_cnnfg")), null);
  if (c && Date.now() - c.t < 30 * 6e4) { state.cnn = c.d; return; }
  try {
    const r = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const f = (await r.json()).fear_and_greed;
    const d = { score: f.score, rating: f.rating, prev_close: f.previous_close, week_ago: f.previous_1_week, month_ago: f.previous_1_month, year_ago: f.previous_1_year };
    state.cnn = d; safe(() => sessionStorage.setItem("ic_cnnfg", JSON.stringify({ t: Date.now(), d })));
  } catch { state.cnn = "fail"; }
  if (location.hash === "" || location.hash === "#/") render(false);
}
const FG_BANDS = [[25, "Extreme fear", "#dc2626"], [45, "Fear", "#f97316"], [55, "Neutral", "#a3a3a3"], [75, "Greed", "#65a30d"], [101, "Extreme greed", "#16a34a"]];
const fgBand = (v) => FG_BANDS.find(([mx]) => v < mx) || FG_BANDS[4];
function fgGauge(v) {   // half circle, 5 coloured bands, needle
  const pt = (a, r) => [60 + r * Math.cos(Math.PI * (1 - a / 100)), 62 - r * Math.sin(Math.PI * (1 - a / 100))];
  let from = 0;
  const arcs = FG_BANDS.map(([mx, , col]) => { const to = Math.min(mx, 100), [x1, y1] = pt(from + 0.6, 50), [x2, y2] = pt(to - 0.6, 50); from = to;
    return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} A50 50 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${col}"/>`; }).join("");
  const [nx, ny] = pt(Math.max(0, Math.min(100, v)), 40);
  return `<svg class="fgg" viewBox="0 0 120 70" aria-hidden="true"><g fill="none" stroke-width="10">${arcs}</g><line x1="60" y1="62" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}"/><circle cx="60" cy="62" r="4"/></svg>`;
}
function marketMood() {
  const c = state.cnn, k = state.gauges.crypto, w = state.settings.watchlist || [];
  const ago = (lbl, v) => (v === null || v === undefined ? "" : `<span>${lbl} <b class="tnum">${Math.round(v)}</b></span>`);
  const stocksPart = c && c !== "fail"
    ? `<div class="fgrow">${fgGauge(c.score)}<div class="fgv"><b class="tnum" style="color:${fgBand(c.score)[2]}">${Math.round(c.score)}</b><span>${esc(fgBand(c.score)[1])}</span><small>Stocks · CNN Fear &amp; Greed</small></div></div>
       <div class="fgago">${ago("Yesterday", c.prev_close)}${ago("1 week", c.week_ago)}${ago("1 month", c.month_ago)}${ago("1 year", c.year_ago)}</div>`
    : c === "fail" ? `<p class="note" style="margin:6px 0 0">CNN didn't answer from this browser. <a href="https://edition.cnn.com/markets/fear-and-greed" target="_blank" rel="noopener">See the stock Fear &amp; Greed on CNN ↗</a></p>`
    : `<p class="note" style="margin:6px 0 0">Loading CNN Fear &amp; Greed…</p>`;
  const cryptoPart = k ? `<div class="fgcr"><span>Crypto</span><b class="tnum" style="color:${fgBand(k.score)[2]}">${Math.round(k.score)}</b><em>${esc(k.rating)}</em>${k.week_ago !== null ? `<small>1 week ago ${Math.round(k.week_ago)}</small>` : ""}</div>` : "";
  // Stock mood: share of this week's stories the AI tagged Bullish / Bearish (Neutral + Mixed in the middle), vs the week before
  const wk = (t, from, to) => state.mood.filter((r) => (r.tickers || []).includes(t) && hoursAgo(r.created_at) >= from * 24 && hoursAgo(r.created_at) < to * 24);
  const sc = (l) => (l.filter((r) => r.sentiment === "Bullish").length - l.filter((r) => r.sentiment === "Bearish").length) / Math.max(1, l.length);
  const rows = w.slice(0, 8).map((t) => {
    const cur = wk(t, 0, 7), prev = wk(t, 7, 14), bu = cur.filter((r) => r.sentiment === "Bullish").length, be = cur.filter((r) => r.sentiment === "Bearish").length;
    if (cur.length < 3) return `<div class="smood few" data-stock="${esc(t)}"><b>${esc(t)}</b><span class="note" style="margin:0">not enough news (${cur.length})</span></div>`;
    const d = prev.length >= 3 ? sc(cur) - sc(prev) : null, pc = (n) => ((n / cur.length) * 100).toFixed(0);
    const tr = d === null ? `<small class="fl">new</small>` : d > 0.15 ? `<small class="up">▲ better</small>` : d < -0.15 ? `<small class="dn">▼ worse</small>` : `<small class="fl">— same</small>`;
    return `<div class="smood" data-stock="${esc(t)}" title="Show ${esc(t)} news"><b>${esc(t)}</b><div class="sbar"><i class="u" style="width:${pc(bu)}%"></i><i class="n" style="width:${pc(cur.length - bu - be)}%"></i><i class="d" style="width:${pc(be)}%"></i></div>${tr}
      <div class="ssub">${cur.length} stories · ${bu} bullish · ${be} bearish</div></div>`;
  }).join("");
  return `<div class="mmood a"><div class="mh"><h2>Market mood</h2></div>${stocksPart}${cryptoPart}
    ${w.length ? `<div class="mml">YOUR STOCKS · NEWS MOOD, 7 DAYS</div>${rows}<p class="note" style="margin:8px 0 0">AI's guess from story tone, not advice.</p>` : ""}</div>`;
}

// ---------- Earnings result cards (design round 34): watchlist companies that reported in the last 3 days ----------
const eps = (v) => (v === null || v === undefined ? "—" : Number(v).toFixed(2));
const earnVerdict = (r) => (r.surprise_pct === null || r.surprise_pct === undefined ? ["", ""] : Math.abs(r.surprise_pct) < 0.5 ? ["IN LINE", "inl"] : r.surprise_pct > 0 ? ["BEAT", "beat"] : ["MISS", "miss"]);
const qEnd = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
function earnCards() {
  const w = state.settings.watchlist || [];
  const list = (state.earn || []).filter((r) => w.includes(r.ticker) && hoursAgo(r.seen_at) <= 72).sort((a, b) => (a.seen_at < b.seen_at ? 1 : -1));
  if (!list.length) return "";
  const move = (r) => { const q = quotes[yahoo(r.ticker)]; return r.price_then && q ? ((q.price - r.price_then) / r.price_then) * 100 : null; };
  const pct = (v) => `${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}%`;
  const [h, ...more] = list, [vt, vc] = earnVerdict(h), mv = move(h), name = cleanName(state.settings.watch_names?.[h.ticker] || "") || h.ticker;
  return `<div class="earns a"><div class="ear" data-stock="${esc(h.ticker)}">
      <div class="hd">${evLogo({ sym: h.ticker }, 42)}<div class="tt"><b>${esc(name)} · results</b><small>Quarter ended ${qEnd(h.quarter_end)} · ${agoAt(h.seen_at)}</small></div>${vt ? `<span class="vd ${vc}">${vt}</span>` : ""}</div>
      <div class="nums"><div><small>EPS ACTUAL</small><b class="tnum">${eps(h.eps_actual)}</b></div><div><small>EXPECTED</small><b class="tnum">${eps(h.eps_estimate)}</b></div>
        <div><small>SURPRISE</small><b class="tnum ${vc}">${h.surprise_pct !== null ? pct(h.surprise_pct) : "—"}</b></div></div>
      <div class="ft">${h.revenue ? `Revenue ${esc(h.revenue)} (no revenue forecast in the free data) · ` : ""}${mv !== null ? `Stock since report: <b class="${mv >= 0 ? "up" : "down"}">${pct(mv)}</b> · ` : ""}Yahoo Finance</div></div>
    ${more.length ? `<div class="ear2s">${more.map((r) => { const [t, c] = earnVerdict(r); return `<div class="ear2" data-stock="${esc(r.ticker)}"><b>${esc(r.ticker)}</b><span>EPS ${eps(r.eps_actual)} vs ${eps(r.eps_estimate)}${r.surprise_pct !== null ? ` · <b class="${c}">${pct(r.surprise_pct)}</b>` : ""}</span>${t ? `<span class="vd ${c}">${t}</span>` : ""}</div>`; }).join("")}</div>` : ""}</div>`;
}

