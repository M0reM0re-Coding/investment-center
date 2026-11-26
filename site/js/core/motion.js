// Intros + investing motion.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// ---------- motion ----------
// Numbers count up from 0 when a page opens (skipped if the device asks for less motion).
function countUp() {
  if (calm()) return;
  app.querySelectorAll("[data-count]").forEach((el) => {
    const end = Number(el.dataset.count);
    if (!Number.isFinite(end)) return;
    const t0 = performance.now(), dur = 700;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
function pop(selector) {
  app.querySelectorAll(selector).forEach((el) => { el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); });
}
let toastTimer = null;
function toast(html, go) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("button"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
  t.innerHTML = html;
  t.onclick = () => { t.classList.remove("show"); if (go) location.hash = go; };
  t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 6000);
}

// ---------- investing motion (design round 15: all 4 intros + 9 motions + extras) ----------
// Every effect is skipped when the device asks for less motion (calm()).

// Opening intro: plays once per visit; the 4 styles take turns (chart line, candles, departure board, ticker tape).
// Add ?intro to the address to see it again. Click or press any key to skip.
const lsGet = (k) => safe(() => localStorage.getItem(k), null), lsSet = (k, v) => safe(() => localStorage.setItem(k, v));
const ssGet = (k) => safe(() => sessionStorage.getItem(k), null), ssSet = (k, v) => safe(() => sessionStorage.setItem(k, v));
function lastQuotes() {
  // Real prices your browser saw last time (no made-up numbers); empty on the very first visit
  return safe(() => JSON.parse(lsGet("ic_last_quotes") || "[]"), []).filter((t) => Array.isArray(t) && t.length === 3).slice(0, 8);
}
function rememberQuotes() {
  const rows = [...MARKETS.map((m) => [m[0], m[1]]), ...(state.settings?.watchlist || []).map((t) => [yahoo(t), t])]
    .filter(([y]) => quotes[y]).slice(0, 10).map(([y, n]) => [n, fmtPx(quotes[y].price), pctTxt(quotes[y])]);
  if (rows.length) lsSet("ic_last_quotes", JSON.stringify(rows));
}
let pageReady = false;   // true once the first real page (news or login) is drawn
function playIntro(now = false) {
  if (typeof proOn === "function" && proOn()) return;   // Pro: no intros
  const force = now || /[?&]intro\b/.test(location.search);
  if (calm() || (!force && ssGet("ic_intro_seen"))) return;
  ssSet("ic_intro_seen", "1");
  const ch = charOf(), n = Number(lsGet("ic_intro_n") || 0) % (ch ? 5 : 4);
  lsSet("ic_intro_n", String(n + 1));
  const ticks = lastQuotes(), up = (t) => !String(t[2]).startsWith("-");
  const tk = (t) => `<span><b>${esc(t[0])}</b> ${esc(t[1])} <span class="${up(t) ? "u" : "d"}">${up(t) ? "▲" : "▼"} ${esc(t[2])}</span></span>`;
  const names = ticks.length ? ticks : MARKETS.map((m) => [m[1], "", ""]);
  const el = document.createElement("div");
  el.className = "intro";
  el.setAttribute("aria-hidden", "true");
  let total = 2300;
  if (season) {           // season intro: snow / petals / leaves sweep in and settle, or the sun rises
    el.classList.add("i-s", `s-${season}`);
    total = 2600;
    const kind = { winter: "snow", spring: "petal", autumn: "leaf", summer: "" }[season], leaf = ["#e0702e", "#c2541b", "#d9a13a", "#9c3d12"];
    // wind: spring petals blow left -> right, autumn leaves right -> left, snow falls gently
    const wind = { winter: () => (Math.random() * 2 - 1) * 160, spring: () => 300 + Math.random() * 400, autumn: () => -(250 + Math.random() * 400) }[season];
    const parts = kind ? Array.from({ length: season === "winter" ? 90 : 50 }, (_, k) => `<i class="${kind}" style="left:${season === "spring" ? Math.random() * 70 - 20 : season === "autumn" ? 20 + Math.random() * 90 : Math.random() * 100}%;--dx:${wind()}px;--r:${Math.random() * 720}deg;--lc:${leaf[k % 4]};--d:${1.4 + Math.random() * 1.2}s;--w:${Math.random() * .7}s;--s:${3 + Math.random() * 6}px"></i>`).join("") : "";
    el.innerHTML = `${season === "summer" ? `<div class="ssun"></div>${summerFish()}<div class="swave"></div>${summerSplash()}` : seasonScene(season)}${parts}<div class="sbrand">investment center</div>`;
  } else if (n === 4) {   // E. your mascot rises and holds up the sign with the logo on it
    el.classList.add("i-m");
    total = 2500;
    const b = SIGN[ch] || [.36, .5, .3, .14];
    el.innerHTML = `<div class="mstage"><img src="mascot/${ch}/present.png" alt=""><div class="msign" style="left:${b[0] * 100}%;top:${b[1] * 100}%;width:${b[2] * 100}%;height:${b[3] * 100}%;font-size:calc(min(560px,82vmin) * ${(b[2] / 7.2).toFixed(4)})"><span>investment<br><em>center</em></span></div></div>`;
  } else if (n === 0) {          // A. chart line
    el.classList.add("i-a");
    const p = "M0 160 L70 150 L130 156 L190 120 L250 130 L320 92 L380 104 L450 70 L510 80 L580 44 L640 52 L700 20";
    el.innerHTML = `<svg viewBox="0 0 700 200" preserveAspectRatio="none"><defs><linearGradient id="iga" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#16a34a" stop-opacity=".18"/><stop offset="1" stop-color="#16a34a" stop-opacity="0"/></linearGradient></defs>
      <path class="area" d="${p} L700 200 L0 200Z"/><path class="ln" d="${p}"/><circle class="ring" cx="700" cy="20" r="7"/><circle class="dot" cx="700" cy="20" r="7"/></svg>
      <div class="brand">investment center<em>▲ live</em></div>`;
  } else if (n === 1) {   // B. candles rise
    el.classList.add("i-b");
    const hs = [60, 90, 70, 120, 100, 150, 130, 110, 170, 150, 200, 180, 230];
    el.innerHTML = `<div class="cdls">${hs.map((h, k) => `<div class="cdl ${k % 4 === 2 || k === 6 ? "d" : "u"}" style="height:${h}px;--k:${k}"><i></i></div>`).join("")}<div class="cdl last" style="height:280px;--k:13"><i></i></div></div>
      <div class="brand">investment center<small>MARKETS · NEWS · ALERTS</small></div><div class="fill"></div>`;
  } else if (n === 2) {   // C. departure board
    el.classList.add("i-c");
    total = 2500;
    el.innerHTML = ["INVESTMENT", "  CENTER  "].map((w, r) => `<div class="rowf">${[...w].map((c, k) => `<div class="f ${r ? "acc" : ""}" data-c="${c}" data-k="${k + r * 3}"></div>`).join("")}</div>`).join("")
      + `<div class="tick">${(ticks.length ? ticks.slice(0, 4).map(tk) : names.slice(0, 4).map((t) => `<span><b>${esc(t[0])}</b></span>`)).join("")}</div>`;
    const CH = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$%";
    el.querySelectorAll(".f").forEach((f) => {
      const stop = 300 + Number(f.dataset.k) * 90; let t = 0;
      const iv = setInterval(() => { t += 60; f.textContent = t >= stop ? f.dataset.c : CH[Math.floor(Math.random() * CH.length)]; if (t >= stop) clearInterval(iv); }, 60);
    });
  } else {                // D. ticker tape
    el.classList.add("i-d");
    const row = (ticks.length ? ticks.map(tk) : names.map((t) => `<span><b>${esc(t[0])}</b></span>`)).join("");
    const tape = (c) => `<div class="tape ${c}"><div class="inner">${row}${row}${row}${row}</div></div>`;
    el.innerHTML = tape("t1") + tape("t2") + tape("t3") + `<div class="brandbox">investment center</div>`;
  }
  el.insertAdjacentHTML("beforeend", `<span class="skip">click to skip</span>`);
  document.body.appendChild(el);
  document.documentElement.classList.add("intro-on");
  let done = false;
  const finish = () => {
    if (done) return; done = true;
    el.classList.add("out");
    document.documentElement.classList.remove("intro-on");
    // the page was drawn (paused) under the intro: un-pausing makes it rise in exactly once
    if (typeof countUp === "function") countUp();
    setTimeout(() => el.remove(), 650);
    removeEventListener("keydown", finish);
  };
  el.addEventListener("click", finish);
  addEventListener("keydown", finish);
  // leave after the animation AND once your news is on the page (never longer than 5 s)
  const t0 = performance.now();
  const tryEnd = () => { if (pageReady || performance.now() - t0 > 5000) finish(); else setTimeout(tryEnd, 120); };
  setTimeout(tryEnd, total);
}

// 1. Rolling digits: when a price changes, only the digits that changed roll up (price rose) or down (fell)
function rollText(el, txt, up) {
  const old = el.textContent;
  if (calm() || old.length !== txt.length) { el.textContent = txt; return; }
  el.innerHTML = [...txt].map((c, k) => (c === old[k] ? esc(c)
    : `<span class="rd ${up ? "u" : "d"}" style="--k:${k}"><span>${esc(old[k])}</span><span>${esc(c)}</span></span>`)).join("");
  clearTimeout(el._rt);
  el._rt = setTimeout(() => { el.textContent = txt; }, 900);
}

// 9. Market open / closed (regular weekday hours; public holidays are not known, so a holiday shows "open")
function mktOpen(tz, sessions) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  if (p.weekday === "Sat" || p.weekday === "Sun") return false;
  const m = (Number(p.hour) % 24) * 60 + Number(p.minute);
  return sessions.some(([a, b]) => m >= a && m < b);
}
// Market-hours badges: you pick which ones show (Settings → Market hours). Regular sessions in local time, minutes from midnight.
const MARKETS_ALL = [
  ["SET", "Thailand", "Asia/Bangkok", [[600, 750], [870, 990]]], ["NYSE", "US stocks", "America/New_York", [[570, 960]]],
  ["LSE", "London", "Europe/London", [[480, 990]]], ["Xetra", "Germany", "Europe/Berlin", [[540, 1050]]],
  ["TSE", "Tokyo", "Asia/Tokyo", [[540, 690], [750, 930]]], ["HKEX", "Hong Kong", "Asia/Hong_Kong", [[570, 720], [780, 960]]],
  ["SSE", "Shanghai", "Asia/Shanghai", [[570, 690], [780, 900]]], ["SGX", "Singapore", "Asia/Singapore", [[540, 720], [780, 1020]]],
  ["KRX", "Korea", "Asia/Seoul", [[540, 930]]], ["NSE", "India", "Asia/Kolkata", [[555, 930]]], ["ASX", "Australia", "Australia/Sydney", [[600, 960]]],
];
const MAX_MKTS = 4;
function myMarkets() {
  const s = state.settings || {};
  const list = Array.isArray(s.markets) ? s.markets : safe(() => JSON.parse(localStorage.getItem("ic_markets")), null) || ["SET", "NYSE"];
  return MARKETS_ALL.filter((m) => list.includes(m[0]));
}
const marketBadges = () => myMarkets()
  .map(([n, , tz, s]) => { const o = mktOpen(tz, s); return `<span class="mkt ${o ? "open" : ""}" title="${n} regular hours (holidays not included)"><i></i>${n} ${o ? "open" : "closed"}</span>`; }).join("");
async function toggleMarket(code) {
  const cur = myMarkets().map((m) => m[0]);
  let next = cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code];
  if (next.length > MAX_MKTS) { toast(`Up to ${MAX_MKTS} markets. Turn one off first.`); return; }
  next = MARKETS_ALL.map((m) => m[0]).filter((c) => next.includes(c));  // keep a fixed order
  if ("markets" in (state.settings || {})) {
    const old = state.settings.markets;
    state.settings.markets = next; render(false);
    const { error } = await sb.from("user_settings").update({ markets: next }).eq("user_id", state.user.id);
    if (error) { state.settings.markets = old; render(false); toast(`Not saved: ${esc(error.message)}`); }
  } else { safe(() => localStorage.setItem("ic_markets", JSON.stringify(next))); render(false); }  // before 008_world.sql: this device only
}

// 4. Heartbeat next to LIVE
const HB_PATH = "M0 9 H13 L16 9 L19 2 L23 15 L26 5 L28 9 H44";
const HEARTBEAT = `<svg class="hb" viewBox="0 0 44 16" aria-hidden="true"><path class="base" d="${HB_PATH}"/><path class="beat" pathLength="100" d="${HB_PATH}"/></svg>`;
// 8. Green chart line that draws along the bottom of a card on hover
const GLINT = `<svg class="glint" viewBox="0 0 300 30" preserveAspectRatio="none" aria-hidden="true"><path d="M0 26 L40 22 L80 24 L120 14 L160 18 L200 8 L240 12 L300 2"/></svg>`;
// 10. Slow chart line drifting behind the briefing bar
const BRIEF_BG = `<svg class="bgline" viewBox="0 0 1200 80" preserveAspectRatio="none" aria-hidden="true"><path d="M0 60 L60 52 L120 58 L180 40 L240 46 L300 30 L360 38 L420 22 L480 30 L540 18 L600 26 L660 52 L720 58 L780 40 L840 46 L900 30 L960 38 L1020 22 L1080 30 L1140 18 L1200 26"/></svg>`;

// 6. Chart-line page wipe when you move to another page (feed → story, → calendar, …)
let lastView = null, lastRendered = null;
// Page name for motion: a My News story and a World Brief story both count as "story" (quick open, no wipe)
const viewKey = () => { const h = location.hash || "#/"; return /^#\/world\/./.test(h) ? "story" : h.split("/")[1] || "feed"; };
function pageWipe() {
  const key = viewKey();
  const changed = lastView !== null && key !== lastView;
  const reading = key === "story" || lastView === "story"; // opening / leaving a story: no wipe, it made reading feel slow
  lastView = key;
  if (!changed || reading || calm() || (typeof proOn === "function" && proOn())) return;
  document.querySelector(".pwipe")?.remove();
  const w = document.createElement("div");
  w.className = "pwipe";
  w.setAttribute("aria-hidden", "true");
  w.innerHTML = `<svg viewBox="0 0 1000 100" preserveAspectRatio="none"><path d="M0 80 L120 66 L230 72 L360 44 L470 54 L600 28 L720 36 L860 14 L1000 8"/></svg>`;
  document.body.appendChild(w);
  setTimeout(() => w.remove(), 800);
}

// 14. Green ▲ arrows burst out of the tick when a story is marked done
function burst(from) {
  if (calm() || !from) return;
  const r = from.getBoundingClientRect(), b = document.createElement("div");
  b.className = "burst";
  b.style.left = `${r.left + r.width / 2}px`; b.style.top = `${r.top + r.height / 2}px`;
  b.innerHTML = [...Array(9)].map((_, k) => `<i style="--a:${-90 + (k - 4) * 20}deg;--d:${44 + (k % 3) * 14}px">▲</i>`).join("") + `<b>+1 read</b>`;
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 900);
}

// 16. Reading progress line on story pages
addEventListener("scroll", () => {
  const p = document.querySelector(".rprog i");
  if (!p) return;
  const max = document.documentElement.scrollHeight - innerHeight;
  p.style.width = `${max > 0 ? Math.min(100, (scrollY / max) * 100) : 0}%`;
}, { passive: true });

