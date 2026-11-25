// Briefing deck (one story at a time, phone swipe).
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// One story at a time: big photo, key points, Later / Done · next
function openBriefing() {
  const ids = waitingMust().map((s) => s.id);
  if (!ids.length) return;
  state.briefing = { ids, i: 0, res: {} };
  drawBriefing();
}
function drawBriefing() {
  let ov = document.getElementById("brief-ov");
  if (!state.briefing) { ov?.remove(); return; }
  if (!ov) {
    ov = document.createElement("div"); ov.id = "brief-ov"; ov.className = "ov";
    ov.addEventListener("click", onBriefClick);
    document.body.appendChild(ov);
  }
  const b = state.briefing, s = b.world ? (state.world || []).find((x) => x.id === b.ids[b.i]) : findStory(b.ids[b.i]);
  const dots = b.ids.map((id, i) => `<i class="${b.res[id] === "done" ? "ok" : b.res[id] === "later" ? "lt" : i === b.i ? "on" : ""}"></i>`).join("");
  if (b.world) {   // World Brief: same deck, World stories ("Skip" instead of "Later": World only has seen / read)
    ov.innerHTML = !s
      ? `<div class="sheet"><div class="end">${mascotArt("caught-up", "mend") || '<div class="big">✓</div>'}<h2>You're caught up</h2>
          <p class="why">Today's top world stories are read. ${Math.max(0, (state.world || []).filter((x) => !x._old && !wSt(x.id)).length)} more are on World Brief when you have time.</p>
          <div class="act" style="justify-content:center"><button class="btn" data-bclose>Back to World Brief</button></div></div></div>`
      : `<div class="sheet slide" role="dialog" aria-label="World briefing"><div class="pic wbpic">${wPic(s)}</div><div class="body">
          <div class="meta wbmeta"><span class="wtags">${wTags(s)}</span> ${agoAt(when(s))} · ${esc(s.n_sources)} outlets</div>
          <h2>${esc(s.headline)}</h2><ul>${(s.summary || []).slice(0, 3).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
          ${s.why_matters ? `<p class="why">${esc(s.why_matters)}</p>` : ""}${s.thailand ? `<p class="why"><b>Thailand:</b> ${esc(s.thailand)}</p>` : ""}
          <div class="act"><div class="dots">${dots}</div><button class="linkbtn" data-bopen="${s.id}">Open full story</button>
            <button class="btn ghost" data-blater="${s.id}">Skip</button><button class="btn ok" data-bdone="${s.id}">✓ Read · next</button></div></div>
          <button class="x" data-bclose aria-label="Close">×</button>
          <div class="swhint mob-only"><span>← Skip</span><span>swipe</span><span>Read →</span></div></div>`;
    if (s && isPhone()) swipeCard(ov.querySelector(".sheet"), s.id);
    return;
  }
  ov.innerHTML = !s
    ? `<div class="sheet"><div class="end">${mascotArt("caught-up", "mend") || '<div class="big">✓</div>'}<h2>You're caught up</h2>
        <p class="why">${storiesFor("To read").length} other stories left for when you have time.</p>
        <div class="act" style="justify-content:center"><button class="btn" data-bclose>Back to My News</button></div></div></div>`
    : `<div class="sheet slide" role="dialog" aria-label="Briefing">${media(s, true)}<div class="body">
        <div class="meta">${metaTags(s)}${esc((s.topics || []).join(" · "))} · ${agoAt(when(s))} · ▲ ${srcs(s.n_sources)}</div>
        <h2>${esc(s.headline)}</h2><ul>${(s.summary || []).slice(0, 4).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        <p class="why">${esc(s.what_it_means)}</p>
        <div class="act"><div class="dots">${dots}</div><button class="linkbtn" data-bopen="${s.id}">Open full story</button>
          <button class="btn ghost" data-blater="${s.id}">Later</button><button class="btn ok" data-bdone="${s.id}">✓ Done · next</button></div></div>
        <button class="x" data-bclose aria-label="Close">×</button>
        <div class="swhint mob-only"><span>← Later</span><span>swipe</span><span>Done →</span></div></div>`;
  if (s && isPhone()) swipeCard(ov.querySelector(".sheet"), s.id);
}
// Phone briefing (design round 18, B's swipe deck): drag the card right = Done, left = Later.
function swipeCard(card, id) {
  if (!card) return;
  let x0 = null, y0 = 0, dx = 0, horiz = null;
  card.addEventListener("pointerdown", (e) => { if (e.target.closest("button,a")) return; x0 = e.clientX; y0 = e.clientY; dx = 0; horiz = null; });
  card.addEventListener("pointermove", (e) => {
    if (x0 === null) return;
    dx = e.clientX - x0;
    if (horiz === null && (Math.abs(dx) > 8 || Math.abs(e.clientY - y0) > 8)) horiz = Math.abs(dx) > Math.abs(e.clientY - y0);
    if (!horiz) return; // a vertical move scrolls the card's text instead
    card.style.transition = "none";
    card.style.transform = `translateX(${dx}px) rotate(${dx / 25}deg)`;
    card.dataset.dir = dx > 40 ? "done" : dx < -40 ? "later" : "";
  });
  const end = () => {
    if (x0 === null) return;
    x0 = null; card.style.transition = "transform .25s var(--ease)";
    if (horiz && Math.abs(dx) > 90) {
      card.style.transform = `translateX(${dx > 0 ? 120 : -120}vw) rotate(${dx > 0 ? 12 : -12}deg)`;
      const st = dx > 0 ? "done" : "later", b = state.briefing;
      setTimeout(() => { briefMark(id, st); b.res[id] = st; b.i++; drawBriefing(); }, 200);
    } else { card.style.transform = ""; card.dataset.dir = ""; }
  };
  card.addEventListener("pointerup", end);
  card.addEventListener("pointercancel", end);
}
// Done / Later from the deck: My News keeps "later"; World Brief has only seen / read, so Skip = seen
const briefMark = (id, st) => (state.briefing?.world ? setWorldStatus(id, st === "done" ? "done" : "seen") : setStatus(id, st));
function onBriefClick(e) {
  const el = e.target.closest("[data-bdone],[data-blater],[data-bopen],[data-bclose]");
  if (!el && e.target.id !== "brief-ov") return;
  const b = state.briefing;
  if (el?.dataset.bdone || el?.dataset.blater) {
    const id = el.dataset.bdone || el.dataset.blater, st = el.dataset.bdone ? "done" : "later";
    briefMark(id, st); b.res[id] = st; b.i++;
    return drawBriefing();
  }
  if (el?.dataset.bopen) { const id = el.dataset.bopen, w = b.world; state.briefing = null; drawBriefing(); location.hash = w ? `#/world/${id}` : `#/story/${id}`; return; }
  state.briefing = null; drawBriefing(); render(false); // close (× / button / click outside)
}

