// Big news alert + theme mascots.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// ---------- start ----------
// ---------- Big news alert (design round 25 style B + mascots from rounds 26-27) ----------
// Impact 8-10, last 24 h, about your topics/watchlist, not read or saved for later: covers the screen once per story (per device).
const bigOn = () => lsGet("ic_bigalert") !== "off";
const mascotPref = () => lsGet("ic_mascot") || "theme";
// Theme characters: the user's own mascots, one per theme, 8 poses each (site/mascot/<theme>/<pose>.png, 480 px)
const CHARS = [["crisp", "Reporter", "Crisp"], ["newsprint", "Pigeon", "Newsprint"], ["cloud", "Cloud mage", "Cloud"], ["sage", "Sage", "Sage"],
  ["graphite", "Hood", "Graphite"], ["black", "Noir", "True black"], ["navy", "Celestial", "Midnight"],
  ["winter", "Ice queen", "Winter"], ["spring", "Blossom", "Spring"], ["summer", "Beach kid", "Summer"], ["autumn", "Autumn", "Autumn"]];
// where the blank sign is in each "present" pose (measured from the images: left, top, width, height as a share of the picture)
const SIGN = { crisp: [.390, .473, .252, .110], newsprint: [.344, .533, .335, .173], cloud: [.402, .535, .294, .131], sage: [.363, .500, .271, .150],
  graphite: [.352, .538, .344, .171], black: [.350, .488, .308, .152], navy: [.354, .479, .315, .142], winter: [.392, .540, .304, .133],
  spring: [.377, .504, .298, .140], summer: [.360, .560, .317, .158], autumn: [.363, .508, .310, .140] };
const themeChar = () => season || (isDark() ? darkStyle() : lightStyle());   // the character that matches what you see right now
function charOf() { const m = mascotPref(); return m === "none" ? null : m.startsWith("c:") ? m.slice(2) : themeChar(); }
const charImg = (c, pose, cls = "") => `<img class="mimg ${cls}" src="mascot/${c}/${pose}.png" alt="" draggable="false" onerror="this.remove()">`;
function mascotArt(pose, cls = "") {
  if (typeof proOn === "function" && proOn()) return "";   // Pro: no mascots   // the chosen mascot in a pose; "" when the user picked "No mascot"
  const m = mascotPref(), c = charOf();
  if (m === "none") return "";
  return charImg(c || themeChar(), pose, cls);   // old picks (Official/Retro, removed) fall back to the theme character
}
const bigSeen = () => safe(() => JSON.parse(lsGet("ic_big_seen") || "[]"), []);
const SERIOUS_RX = /\b(war|missiles?|airstrikes?|attacks?|killed|kills|dead|deaths?|bomb\w*|invasion|invades?|earthquake|floods?|disaster|shooting|terror\w*|explosion|hostages?)\b/i;
function bigMood(s) {   // no AI needed: the story already has sentiment and impact
  if (SERIOUS_RX.test(s.headline || "")) return "serious";
  if (Number(s.impact_score) >= 10 || Date.now() - new Date(when(s)) < 36e5) return "breaking";
  return s.sentiment === "Bullish" ? "bull" : s.sentiment === "Bearish" ? "bear" : "breaking";
}
function bigQueue() {
  const seen = new Set(bigSeen()), day = Date.now() - 864e5;
  return (state.stories || []).filter((s) => Number(s.impact_score) >= 8 && new Date(s.created_at) > day && matches(s)
      && !seen.has(s.id) && !["done", "later"].includes(stOf(s)))
    .sort((a, b) => b.impact_score - a.impact_score || (b.created_at > a.created_at ? 1 : -1)).slice(0, 3);
}
const markBigSeen = (id) => lsSet("ic_big_seen", JSON.stringify([...bigSeen().filter((x) => x !== id), id].slice(-60)));
function afterIntro(fn, n = 0) {   // wait for the opening intro to finish (max ~10 s)
  if (document.documentElement.classList.contains("intro-on") && n < 40) return setTimeout(() => afterIntro(fn, n + 1), 250);
  fn();
}
function showBig(list, preview = false) {
  if (!list.length || document.querySelector(".bigal") || (typeof proOn === "function" && proOn())) return;   // Pro: no full-screen alert (Telegram still sends)
  let i = 0;
  const el = document.createElement("div");
  el.className = "bigal";
  el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Big news");
  const ticks = lastQuotes();
  const draw = () => {
    const s = list[i], mood = bigMood(s), pic = mascotArt(`alert-${mood}`);
    const tk = ticks.map((q) => `<span><b>${esc(q[0])}</b> ${esc(q[1])} <em class="${String(q[2]).startsWith("-") ? "d" : "u"}">${esc(q[2])}</em></span>`).join("");
    el.innerHTML = `<div class="bg-dim" data-bgx="1"></div>
      ${pic ? `<div class="bg-mas">${pic}</div>` : ""}
      <div class="bg-band"><div class="bg-label">BIG NEWS</div><div class="bg-hl">${esc(s.headline)}</div></div>
      <div class="bg-low">
        ${s.what_it_means ? `<p>${esc(s.what_it_means)}</p>` : ""}
        <div class="bg-meta">Impact ${esc(s.impact_score)} of 10 · ${esc(s.n_sources)} outlet${s.n_sources > 1 ? "s" : ""} · ${agoAt(when(s))}${(s.tickers || []).length ? ` · ${s.tickers.slice(0, 4).map(esc).join(", ")}` : ""}</div>
        <div class="bg-btns"><button class="bg-read" data-bg="read">Read the story</button><button class="bg-later" data-bg="${preview ? "close" : "later"}">${preview ? "Close" : "Later"}</button>
          <span class="bg-n">${list.length > 1 ? `${i + 1} of ${list.length} · ` : ""}Esc to close</span></div>
      </div>
      ${tk ? `<div class="bg-tick"><div>${tk}${tk}</div></div>` : ""}`;
    el.style.setProperty("--bandh", `${el.querySelector(".bg-band").offsetHeight}px`);   // the black box sits right under the band
    el.classList.remove("play"); void el.offsetWidth; el.classList.add("play");
    el.querySelector(".bg-read")?.focus({ preventScroll: true });
  };
  const close = () => { removeEventListener("keydown", key); el.classList.add("out"); setTimeout(() => el.remove(), 260); };
  const next = (act) => {
    const s = list[i];
    if (!preview) {
      markBigSeen(s.id);
      if (act === "later") { setStatus(s.id, "later"); render(false); }
    }
    if (act === "read") { close(); location.hash = `#/story/${s.id}`; return; }
    if (++i < list.length) draw(); else close();
  };
  const key = (e) => { if (e.key === "Escape") next(preview ? "close" : "later"); };
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-bg]");
    if (b) next(b.dataset.bg); else if (e.target.dataset.bgx) next(preview ? "close" : "later");
  });
  addEventListener("keydown", key);
  document.body.appendChild(el);
  draw();
}

