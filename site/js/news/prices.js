// Price strip, dock and price chips.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// ---------- prices (design round 8, option 3a) ----------
// Yahoo Finance prices via the get_quotes database helper (cached 60 s). May be delayed (Thai stocks ~15 min).
const MARKETS = [["^SET.BK", "SET", "SET Index"], ["^GSPC", "S&P 500", "US large caps"], ["^IXIC", "Nasdaq", "US tech"],
  ["GC=F", "Gold", "per ounce"], ["BTC-USD", "BTC", "Bitcoin"], ["THB=X", "USD/THB", "Thai baht"]];
const yahoo = (t) => (CFG.yahoo || {})[t] || t;          // PTT -> PTT.BK
const quotes = {};                                         // Yahoo symbol -> {price, prev, pts, name, time}
const fmtPx = (v) => (v >= 10000 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 })
  : v >= 1000 ? v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : Number(v).toFixed(2));
const pctOf = (q) => (q && q.prev ? ((q.price - q.prev) / q.prev) * 100 : 0);
const pctTxt = (q) => (q ? `${pctOf(q) >= 0 ? "+" : ""}${pctOf(q).toFixed(2)}%` : "");
const dirOf = (q) => (q ? (pctOf(q) >= 0 ? "up" : "down") : "");
const followed = (t) => CFG.tickers.includes(t) || (state.settings.watchlist || []).includes(t);

// Mini chart of today's prices; the dotted line is yesterday's close.
function spark(q, w, h) {
  const pts = (q?.pts || []).map(Number).filter(Number.isFinite);
  if (pts.length < 2) return `<svg class="spark" width="${w}" height="${h}"></svg>`;
  const all = q.prev ? [...pts, q.prev] : pts;
  const lo = Math.min(...all), hi = Math.max(...all), n = pts.length - 1, span = hi - lo || 1;
  const y = (v) => (h - 2 - ((v - lo) / span) * (h - 4)).toFixed(1);
  const d = pts.map((v, k) => `${k ? "L" : "M"}${((k / n) * w).toFixed(1)},${y(v)}`).join("");
  const col = pctOf(q) >= 0 ? "var(--up)" : "var(--down)";
  return `<svg class="spark draw" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="--len:${w * 3}">
    ${q.prev ? `<line x1="0" x2="${w}" y1="${y(q.prev)}" y2="${y(q.prev)}" stroke="#ccc" stroke-dasharray="2 3"/>` : ""}
    <path class="area" d="${d}L${w},${h}L0,${h}Z" fill="${col}"/><path class="ln" d="${d}" stroke="${col}"/>
    <circle class="now" cx="${w}" cy="${y(pts[n])}" r="3" fill="${col}"/></svg><i class="nring" style="left:${w}px;top:${y(pts[n])}px;color:${col}"></i>`;   // the pulsing ring is HTML, not SVG, so the browser can animate it without redrawing the chart
}
const pxSpan = (y) => `<span class="px tnum" data-px="${esc(y)}">${quotes[y] ? fmtPx(quotes[y].price) : "—"}</span>`;
const chSpan = (y) => `<span class="ch tnum ${dirOf(quotes[y])}" data-ch="${esc(y)}">${pctTxt(quotes[y])}</span>`;
const spSpan = (y, w, h) => `<span class="sp" data-sp="${esc(y)}" data-w="${w}" data-h="${h}">${spark(quotes[y], w, h)}</span>`;

function priceStrip() {
  const tab = state.priceTab || "m";
  const items = tab === "m"
    ? MARKETS.map(([y, n, sub]) => ({ y, n, sub }))
    : (state.settings.watchlist || []).map((t) => ({ y: yahoo(t), n: t, sub: cleanName(state.settings.watch_names?.[t] || quotes[yahoo(t)]?.name || "") }));
  const cards = items.length
    ? items.map((it) => `<div class="mk${tab === "m" ? "" : " clk"}" ${tab === "m" ? "" : `data-stock="${esc(it.n)}" title="Show ${esc(it.n)} news"`}><span class="nm">${esc(it.n)}</span><span class="sub">${esc(it.sub)}</span>${pxSpan(it.y)}${chSpan(it.y)}${spSpan(it.y, 74, 40)}</div>`).join("")
    : `<p class="note">Your watchlist is empty. Add stocks in Topics &amp; watchlist.</p>`;
  return `<div class="stripwrap a" data-sig="${esc([tab, ...items.map((it) => it.y + (quotes[it.y] ? "+" : "-"))].join(","))}"><div class="strip-head"><h2>${tab === "m" ? "Markets" : "My watchlist"} <span class="delay">· Yahoo Finance, may be delayed</span>${marketBadges()}</h2>
      <div class="tabs"><button class="${tab === "m" ? "on" : ""}" data-ptab="m">Markets</button><button class="${tab === "w" ? "on" : ""}" data-ptab="w">My watchlist</button></div></div>
    <div class="strip">${cards}</div></div>`;
}
function heroChart(s) {
  const t = (s.tickers || []).filter(followed).find((x) => quotes[yahoo(x)]);
  if (!t) return "";
  const y = yahoo(t), q = quotes[y];
  return `<div class="hero-chart"><span class="nm">${esc(t)}<small>${esc(cleanName(state.settings.watch_names?.[t] || q.name || ""))} · today</small></span>
    ${spSpan(y, 360, 44)}<span class="hp">${pxSpan(y)}<br>${chSpan(y)}</span></div>`;
}

function wantedSymbols() {
  const s = new Set(MARKETS.map((m) => m[0]));
  (state.settings.watchlist || []).forEach((t) => s.add(yahoo(t)));
  if (nSorts().includes("price")) storiesFor(state.filter).forEach((st) => Object.keys(st.prices_at || {}).forEach((t) => s.add(yahoo(t))));   // to rank by price move
  visibleStories().slice(0, 30).forEach((st) => (st.tickers || []).filter(followed).forEach((t) => s.add(yahoo(t))));
  return [...s].slice(0, nSorts().includes("price") ? 80 : 40);
}
async function loadQuotes() {
  if (!state.user || !state.settings || document.hidden) return;   // settings (watchlist) not loaded yet: start() calls this again
  const wanted = wantedSymbols();
  const missing = wanted.filter((y) => !quotes[y]);
  const { data, error } = await sb.rpc("get_quotes", { syms: wanted });
  if (error || !data) return;
  const moved = [];
  for (const [y, q] of Object.entries(data)) {
    const old = quotes[y];
    quotes[y] = q;
    if (old && Number(old.price) !== Number(q.price)) moved.push([y, Number(q.price) > Number(old.price)]);
  }
  rememberQuotes();
  const onFeed = !location.hash || location.hash === "#/";
  const typing = document.activeElement && document.activeElement.matches("input, textarea");
  // Prices that weren't on screen yet (first load, or a stock you just added): redraw the page once
  if (missing.some((y) => quotes[y])) { if (onFeed && !typing) render(false); return; }
  // Later updates change the numbers in place and flash them green/red
  moved.forEach(([y, up]) => {
    const q = quotes[y], sel = CSS.escape(y);
    app.querySelectorAll(`[data-px="${sel}"]`).forEach((el) => { rollText(el, fmtPx(q.price), up); el.classList.remove("tick-up", "tick-down"); void el.offsetWidth; el.classList.add(up ? "tick-up" : "tick-down"); });
    app.querySelectorAll(`[data-ch="${sel}"]`).forEach((el) => { el.textContent = pctTxt(q); el.classList.remove("up", "down"); el.classList.add(dirOf(q)); });
    app.querySelectorAll(`[data-sp="${sel}"]`).forEach((el) => { el.innerHTML = spark(q, +el.dataset.w, +el.dataset.h).replace('class="spark draw"', 'class="spark"'); });
  });
}
// Dark dock at the bottom (design round 8 + your reference): your watchlist stays in view once the strip scrolls away
function dock() {
  const w = (state.settings.watchlist || []).map((t) => ({ y: yahoo(t), n: t }));
  const m = MARKETS.map(([y, n]) => ({ y, n }));
  const bar = w.length ? w.slice(0, 5) : m.slice(0, 5);
  const rest = w.length ? [...m, ...w.slice(5)] : m.slice(5);
  const mine = (x) => (state.settings.watchlist || []).includes(x.n) ? ` data-stock="${esc(x.n)}" title="Show ${esc(x.n)} news"` : "";
  const it = (x) => `<span class="it${mine(x) ? " clk" : ""}"${mine(x)}><b>${esc(x.n)}</b>${pxSpan(x.y)}${chSpan(x.y)}</span>`;
  const cell = (x) => `<div class="cell${mine(x) ? " clk" : ""}"${mine(x)}><b>${esc(x.n)}</b><div>${pxSpan(x.y)} ${chSpan(x.y)}</div></div>`;
  return `<div class="dock ${state.dockOpen ? "open" : ""}" data-sig="${esc([state.dockOpen, ...[...w, ...m].map((x) => x.y + (quotes[x.y] ? "+" : "-"))].join(","))}" aria-label="Prices">
    <div class="bar"><span class="lbl">${w.length ? "MY WATCHLIST" : "MARKETS"}</span><div class="items">${calm() ? bar.map(it).join("") : (() => {
        // the whole list scrolls like an exchange ticker; repeated so the loop has no gap
        const all = w.length ? [...w, ...m] : m, half = (all.length < 8 ? [...all, ...all] : all).map(it).join("");
        return `<div class="run" style="--dur:${Math.max(24, all.length * 5)}s">${half}<span class="dup" aria-hidden="true" style="display:contents">${half}</span></div>`;
      })()}</div>
      ${rest.length ? `<button class="tg" data-dock>${state.dockOpen ? "▼ Less" : w.length ? "▲ Markets" : "▲ More"}</button>` : ""}</div>
    <div class="more" style="grid-template-columns:repeat(${Math.max(1, Math.min(rest.length, 6))},minmax(0,1fr))">${rest.map(cell).join("")}</div></div>`;
}
// Show the › button and the fade only while some topics are hidden to the right
function setupFilterRow() {
  const track = app.querySelector(".filters .track");
  if (!track) return;
  const on = track.querySelector(".c.on");
  if (on && on.offsetLeft + on.offsetWidth > track.clientWidth) track.scrollLeft = on.offsetLeft - 40; // keep the chosen topic visible
  const sync = () => {
    track.parentElement.classList.toggle("more", track.scrollLeft + track.clientWidth < track.scrollWidth - 4);
    track.parentElement.classList.toggle("less", track.scrollLeft > 4); // ‹ button once you've scrolled right
  };
  track.onscroll = sync;
  sync();
}
addEventListener("resize", setupFilterRow);
const updateDock = () => {
  const strip = app.querySelector(".stripwrap");
  document.body.classList.toggle("docked", !!strip && strip.getBoundingClientRect().bottom < 69);
  fitSide();
};
addEventListener("scroll", updateDock, { passive: true });
// Right column: sticks under the header when it fits on screen. When it is taller than the screen,
// it scrolls with the page until its bottom (the calendar) is fully visible above the dock, then sticks there.
function fitSide() {
  const el = app.querySelector(".right, .sidecol");
  if (!el) return;
  const gap = document.body.classList.contains("docked") ? 100 : 24;
  el.style.top = `${Math.min(84, Math.round(innerHeight - el.offsetHeight - gap))}px`;
}
addEventListener("resize", fitSide);
const sideWatch = typeof ResizeObserver === "function" ? new ResizeObserver(() => fitSide()) : null;

