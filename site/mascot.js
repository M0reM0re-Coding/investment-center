// Mascots for the big-news alert (design rounds 26 + 27). Plain SVG strings, no images, no libraries.
// mascotSvg(id, mood): mood = bull | bear | breaking | serious | calm. All characters are original drawings.
// ---------- faces: same parts for every character, so all four share one expression system ----------
function face(ex, cx, cy, s, col, light) {
  const k = col, w = light || "#fff", e = 15 * s, sw = 4.2 * s;
  const L = cx - e, R = cx + e, my = cy + 17 * s;
  const eye = (x, y) => `<g class="blink"><ellipse cx="${x}" cy="${y}" rx="${4.6*s}" ry="${7*s}" fill="${k}"/><circle cx="${x+1.6*s}" cy="${y-2.6*s}" r="${1.6*s}" fill="${w}"/></g>`;
  const st = `stroke="${k}" stroke-width="${sw}" stroke-linecap="round" fill="none"`;
  if (ex === "bull") return `
    <path d="M${L-6*s} ${cy+2*s} Q${L} ${cy-8*s} ${L+6*s} ${cy+2*s}" ${st}/>
    <path d="M${R-6*s} ${cy+2*s} Q${R} ${cy-8*s} ${R+6*s} ${cy+2*s}" ${st}/>
    <path d="M${cx-10*s} ${my-3*s} Q${cx} ${my+9*s} ${cx+10*s} ${my-3*s} Z" fill="${k}"/>
    <path d="M${cx-5*s} ${my+2.5*s} Q${cx} ${my+5.5*s} ${cx+5*s} ${my+2.5*s}" fill="#ff7a6b"/>`;
  if (ex === "bear") return `${eye(L, cy+2*s)}${eye(R, cy+2*s)}
    <path d="M${L-7*s} ${cy-11*s} L${L+5*s} ${cy-14*s}" ${st}/><path d="M${R-5*s} ${cy-14*s} L${R+7*s} ${cy-11*s}" ${st}/>
    <path d="M${cx-9*s} ${my+3*s} Q${cx-4.5*s} ${my-2*s} ${cx} ${my+3*s} Q${cx+4.5*s} ${my-2*s} ${cx+9*s} ${my+3*s}" ${st}/>
    <path d="M${R+20*s} ${cy-12*s} q${4*s} ${7*s} 0 ${10*s} q${-4*s} ${-3*s} 0 ${-10*s}Z" fill="#6cc4ff"/>`;
  if (ex === "breaking") return `
    <g class="blink"><circle cx="${L}" cy="${cy}" r="${8*s}" fill="${w}" stroke="${k}" stroke-width="${2.6*s}"/><circle cx="${L}" cy="${cy}" r="${3.6*s}" fill="${k}"/></g>
    <g class="blink"><circle cx="${R}" cy="${cy}" r="${8*s}" fill="${w}" stroke="${k}" stroke-width="${2.6*s}"/><circle cx="${R}" cy="${cy}" r="${3.6*s}" fill="${k}"/></g>
    <path d="M${L-7*s} ${cy-15*s} Q${L} ${cy-20*s} ${L+7*s} ${cy-16*s}" ${st}/><path d="M${R-7*s} ${cy-16*s} Q${R} ${cy-20*s} ${R+7*s} ${cy-15*s}" ${st}/>
    <ellipse cx="${cx}" cy="${my+2*s}" rx="${5.5*s}" ry="${7*s}" fill="${k}"/>`;
  if (ex === "serious") return `
    <g class="blink"><rect x="${L-5.5*s}" y="${cy-1.5*s}" width="${11*s}" height="${5*s}" rx="${2.5*s}" fill="${k}"/></g>
    <g class="blink"><rect x="${R-5.5*s}" y="${cy-1.5*s}" width="${11*s}" height="${5*s}" rx="${2.5*s}" fill="${k}"/></g>
    <path d="M${L-7*s} ${cy-12*s} L${L+6*s} ${cy-8*s}" ${st}/><path d="M${R-6*s} ${cy-8*s} L${R+7*s} ${cy-12*s}" ${st}/>
    <path d="M${cx-8*s} ${my+1*s} L${cx+8*s} ${my+1*s}" ${st}/>`;
  // caught up: closed eyes, small smile, a little Z
  return `
    <path d="M${L-6*s} ${cy} Q${L} ${cy+6*s} ${L+6*s} ${cy}" ${st}/><path d="M${R-6*s} ${cy} Q${R} ${cy+6*s} ${R+6*s} ${cy}" ${st}/>
    <path d="M${cx-5*s} ${my} Q${cx} ${my+4*s} ${cx+5*s} ${my}" ${st}/>
    <text x="${cx+34*s}" y="${cy-26*s}" font-family="Inter Tight" font-weight="900" font-size="${18*s}" fill="${k}" opacity=".55">z</text>
    <text x="${cx+46*s}" y="${cy-40*s}" font-family="Inter Tight" font-weight="900" font-size="${13*s}" fill="${k}" opacity=".35">z</text>`;
}
// small props per mood, held in the right hand
function prop(ex, x, y) {
  if (ex === "bull") return `<g transform="translate(${x} ${y})"><rect x="-2" y="-30" width="26" height="22" rx="4" fill="#fff" stroke="#111" stroke-width="3"/><path d="M2 -13 L9 -20 L14 -16 L20 -25" stroke="#16a34a" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  if (ex === "bear") return `<g transform="translate(${x} ${y})"><rect x="-2" y="-30" width="26" height="22" rx="4" fill="#fff" stroke="#111" stroke-width="3"/><path d="M2 -25 L9 -18 L14 -22 L20 -13" stroke="#ef4444" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  if (ex === "breaking") return `<g transform="translate(${x} ${y})"><rect x="0" y="-12" width="8" height="22" rx="3" fill="#333"/><circle cx="4" cy="-18" r="9" fill="#444"/><circle cx="4" cy="-18" r="9" fill="none" stroke="#222" stroke-width="2"/><path d="M-1 -22 h10 M-1 -18 h10 M-1 -14 h10" stroke="#666" stroke-width="1.4"/></g>`;
  if (ex === "serious") return `<g transform="translate(${x} ${y})"><rect x="-4" y="-22" width="24" height="30" rx="3" fill="#fff" stroke="#111" stroke-width="3"/><path d="M1 -14 h14 M1 -8 h14 M1 -2 h9" stroke="#999" stroke-width="2.4" stroke-linecap="round"/></g>`;
  return `<g transform="translate(${x} ${y})"><path d="M0 -14 h18 v12 a9 9 0 0 1 -18 0z" fill="#fff" stroke="#111" stroke-width="3"/><path d="M18 -10 a5 5 0 0 1 0 9" stroke="#111" stroke-width="3" fill="none"/><path d="M5 -20 q3 -4 0 -8 M12 -20 q3 -4 0 -8" stroke="#bbb" stroke-width="2" fill="none" stroke-linecap="round"/></g>`;
}
// suit lower half for a round body: dark jacket with lapels, white shirt V, tie
function suit(cx, cy, r, jacket, tie) {
  const top = cy + r * 0.30, bot = cy + r;
  return `<clipPath id="c${cx}${cy}${r}${jacket.slice(1)}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
  <g clip-path="url(#c${cx}${cy}${r}${jacket.slice(1)})">
    <path d="M${cx-r} ${top+10} Q${cx} ${top-8} ${cx+r} ${top+10} L${cx+r} ${bot+4} L${cx-r} ${bot+4}Z" fill="${jacket}"/>
    <path d="M${cx-17} ${top+1} L${cx} ${top+30} L${cx+17} ${top+1}Z" fill="#fff"/>
    <path d="M${cx-17} ${top+1} L${cx-5} ${top+24} L${cx-26} ${top+12}Z M${cx+17} ${top+1} L${cx+5} ${top+24} L${cx+26} ${top+12}Z" fill="rgba(255,255,255,.18)"/>
    <path d="M${cx-4} ${top+4} L${cx+4} ${top+4} L${cx+6} ${top+26} L${cx} ${top+33} L${cx-6} ${top+26}Z" fill="${tie}"/>
    <circle cx="${cx+r*0.55}" cy="${top+28}" r="2.6" fill="rgba(255,255,255,.5)"/>
  </g>`;
}
const arms = (cx, cy, r, col, ex) => `
  <path class="wave" style="--o:${cx-r+6}px ${cy+8}px" d="M${cx-r+6} ${cy+10} q-16 ${ex==="bull"?-26:6} -22 ${ex==="bull"?-34:16}" stroke="${col}" stroke-width="11" stroke-linecap="round" fill="none"/>
  <path d="M${cx+r-6} ${cy+10} q14 6 20 14" stroke="${col}" stroke-width="11" stroke-linecap="round" fill="none"/>
  ${prop(ex, cx + r + 10, cy + 30)}`;
const shoes = (cx, cy, r) => `<rect x="${cx-34}" y="${cy+r-6}" width="26" height="13" rx="6.5" fill="#1d1d22"/><rect x="${cx+8}" y="${cy+r-6}" width="26" height="13" rx="6.5" fill="#1d1d22"/>`;

const CH = {
  coin: {
    name: "Baht", tag: "a gold coin anchor",
    about: "A round gold coin with an engraved rim, navy suit and orange tie. Money is literally the character: easy to explain on an investment site. Warm and friendly, closest to the round-and-cute feel you like.",
    draw(ex) { const cx = 100, cy = 92, r = 64;
      return `${shoes(cx, cy, r)}${arms(cx, cy, r, "#e8a000", ex)}
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffc21a"/><circle cx="${cx}" cy="${cy}" r="${r-7}" fill="none" stroke="#e8a000" stroke-width="3" stroke-dasharray="2 5"/>
      <ellipse cx="${cx-26}" cy="${cy-34}" rx="13" ry="7" fill="#fff" opacity=".45" transform="rotate(-30 ${cx-26} ${cy-34})"/>
      ${suit(cx, cy, r, "#1e2a4a", "#ff4500")}${face(ex, cx, cy - 12, 1, "#3a2600")}`; },
  },
  anchor: {
    name: "Orbie", tag: "the news anchor",
    about: "A soft orange ball (your accent colour) in a charcoal suit, with a small antenna whose LIVE light glows on breaking news. Made for the Broadcast alert: he is literally the presenter.",
    draw(ex) { const cx = 100, cy = 92, r = 64;
      return `<path d="M${cx} ${cy-r+2} L${cx+8} ${cy-r-20}" stroke="#222" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="${cx+9}" cy="${cy-r-23}" r="7" fill="${ex==="breaking"?"#ff2d2d":ex==="serious"?"#999":"#ffb48f"}"/>
      ${ex==="breaking"?`<circle cx="${cx+9}" cy="${cy-r-23}" r="12" fill="none" stroke="#ff2d2d" stroke-width="2" opacity=".5"/>`:""}
      ${shoes(cx, cy, r)}${arms(cx, cy, r, "#e85a1c", ex)}
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="#ff7a3d"/>
      <ellipse cx="${cx-26}" cy="${cy-34}" rx="13" ry="7" fill="#fff" opacity=".35" transform="rotate(-30 ${cx-26} ${cy-34})"/>
      ${suit(cx, cy, r, "#2a2a30", "#1f6feb")}${face(ex, cx, cy - 12, 1, "#2b1205")}`; },
  },
  bull: {
    name: "Bullet", tag: "a tiny bull",
    about: "A cream round body with small horns and a dark suit: the market bull, made cute. On bearish news his horns droop. Strongest market meaning, slightly more 'finance' than cuddly.",
    draw(ex) { const cx = 100, cy = 94, r = 62, droop = ex === "bear" || ex === "serious";
      const horn = (sx) => droop
        ? `<path d="M${cx+sx*40} ${cy-42} q${sx*16} 4 ${sx*22} 20" stroke="#d9c3a0" stroke-width="11" stroke-linecap="round" fill="none"/>`
        : `<path d="M${cx+sx*38} ${cy-44} q${sx*12} -6 ${sx*14} -26" stroke="#d9c3a0" stroke-width="11" stroke-linecap="round" fill="none"/>`;
      return `${horn(-1)}${horn(1)}${shoes(cx, cy, r)}${arms(cx, cy, r, "#e2cfb2", ex)}
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="#f4e6cf"/>
      <ellipse cx="${cx}" cy="${cy+9}" rx="19" ry="9" fill="#f0c9b4"/><circle cx="${cx-7}" cy="${cy+9}" r="2.4" fill="#a86c55"/><circle cx="${cx+7}" cy="${cy+9}" r="2.4" fill="#a86c55"/>
      ${suit(cx, cy, r, "#16161a", "#ff4500")}${face(ex, cx, cy - 28, .9, "#2b2117")}`; },
  },
  globe: {
    name: "Mundo", tag: "a little world",
    about: "A round blue planet with orange continents, wearing a suit collar and tie. Ties into World Brief and the map. Most distinctive silhouette; the continents make expressions slightly busier.",
    draw(ex) { const cx = 100, cy = 92, r = 64;
      return `${shoes(cx, cy, r)}${arms(cx, cy, r, "#2f7fd6", ex)}
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="#4da3ff"/>
      <clipPath id="gl"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
      <g clip-path="url(#gl)" fill="#ff9a5c" opacity=".85">
        <path d="M30 60 q18 -14 34 -4 q8 10 -4 18 q-14 6 -20 18 q-10 -6 -10 -32z"/>
        <path d="M118 40 q22 -6 34 10 q-6 14 -22 12 q-10 -2 -12 -22z"/>
        <path d="M150 92 q10 10 4 24 q-14 -2 -16 -14z"/>
      </g>
      <ellipse cx="${cx-26}" cy="${cy-34}" rx="13" ry="7" fill="#fff" opacity=".35" transform="rotate(-30 ${cx-26} ${cy-34})"/>
      ${suit(cx, cy, r, "#1b1b22", "#ffc21a")}${face(ex, cx, cy - 12, 1, "#0b2440")}`; },
  },
};
const torso = (cx, top, jacket, tie) => `
  <path d="M${cx-34} ${top+44} Q${cx-34} ${top} ${cx} ${top} Q${cx+34} ${top} ${cx+34} ${top+44}Z" fill="${jacket}"/>
  <path d="M${cx-12} ${top} L${cx} ${top+22} L${cx+12} ${top}Z" fill="#fff"/>
  <path d="M${cx-3.5} ${top+2} L${cx+3.5} ${top+2} L${cx+5} ${top+20} L${cx} ${top+26} L${cx-5} ${top+20}Z" fill="${tie}"/>
  <rect x="${cx-28}" y="${top+42}" width="22" height="11" rx="5.5" fill="#1d1d22"/><rect x="${cx+6}" y="${top+42}" width="22" height="11" rx="5.5" fill="#1d1d22"/>`;
const sideArms = (cx, y, col, ex, reach) => `
  <path class="wave" style="--o:${cx-reach}px ${y}px" d="M${cx-reach} ${y} q-14 ${ex==="bull"?-22:8} -20 ${ex==="bull"?-30:18}" stroke="${col}" stroke-width="9" stroke-linecap="round" fill="none"/>
  <path d="M${cx+reach} ${y} q12 6 18 14" stroke="${col}" stroke-width="9" stroke-linecap="round" fill="none"/>
  ${prop(ex, cx + reach + 8, y + 22)}`;
const CH2 = {
  screen: {
    name: "Telly", tag: "the screen anchor",
    about: "An orange TV head on a small suited body; his face is drawn in light pixels on the dark screen. A broadcast presenter by design, and the face can change freely without looking cartoonish. Most 'tech news' of the four.",
    draw(ex) { const cx = 100, hy = 62;
      const glow = ex === "breaking" ? "#ff4d4d" : ex === "bull" ? "#7dffb0" : ex === "bear" ? "#ffb3a8" : "#ffe3cf";
      return `<path d="M${cx-14} ${hy-46} L${cx} ${hy-34} L${cx+16} ${hy-50}" stroke="#222" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <circle cx="${cx+16}" cy="${hy-51}" r="4.5" fill="${ex==="breaking"?"#ff2d2d":"#444"}"/>
      ${torso(cx, hy + 44, "#24242a", "#ff4500")}${sideArms(cx, hy + 58, "#24242a", ex, 32)}
      <rect x="${cx-58}" y="${hy-36}" width="116" height="84" rx="20" fill="#ff6a2b"/>
      <rect x="${cx-48}" y="${hy-27}" width="96" height="66" rx="13" fill="#141416"/>
      <path d="M${cx-48} ${hy-14} h96 M${cx-48} ${hy+2} h96 M${cx-48} ${hy+18} h96" stroke="#fff" stroke-opacity=".04" stroke-width="5"/>
      <circle cx="${cx+46}" cy="${hy+42}" r="3" fill="#ffd1b8"/>
      ${face(ex, cx, hy - 4, 1.05, glow, "#141416")}`; },
  },
  tri: {
    name: "Tri", tag: "the alert triangle",
    about: "One shape: a rounded orange warning triangle with a face and a tiny tie. The most minimal, and it doubles as your app icon or logo. Least 'cute', most brand-like.",
    draw(ex) { const cx = 100;
      const T = `M${cx} 14 Q${cx+8} 14 ${cx+14} 24 L${cx+74} 128 Q${cx+78} 142 ${cx+62} 142 L${cx-62} 142 Q${cx-78} 142 ${cx-74} 128 L${cx-14} 24 Q${cx-8} 14 ${cx} 14Z`;
      return `<rect x="${cx-30}" y="136" width="22" height="12" rx="6" fill="#1d1d22"/><rect x="${cx+8}" y="136" width="22" height="12" rx="6" fill="#1d1d22"/>
      <path d="${T}" fill="#ff5a1f"/>
      <clipPath id="tc"><path d="${T}"/></clipPath>
      <g clip-path="url(#tc)"><rect x="0" y="118" width="200" height="40" fill="#24242a"/>
        <path d="M${cx-11} 118 L${cx} 136 L${cx+11} 118Z" fill="#fff"/><path d="M${cx-3} 119 h6 l2 15 l-5 6 l-5 -6z" fill="#ffc21a"/></g>
      <path d="M${cx-24} 50 L${cx-10} 30" stroke="#fff" stroke-opacity=".35" stroke-width="7" stroke-linecap="round"/>
      ${sideArms(cx, 100, "#e8551c", ex, 52)}${face(ex, cx, 82, .9, "#2b1205")}`; },
  },
  tick: {
    name: "Tick", tag: "the ticker line",
    about: "A creature made of a price-chart line: the line is his body, the round head sits on the peak, and the line turns green or red with the mood. The most 'market' idea; the shape changes with the story, so it never looks the same twice.",
    draw(ex) { const up = ex !== "bear", col = ex === "bull" ? "#16a34a" : ex === "bear" ? "#ef4444" : ex === "serious" ? "#555" : "#ff5a1f";
      const hx = up ? 132 : 120, hy = up ? 58 : 94;
      const line = up ? `M14 150 L46 118 L70 132 L104 84 L${hx-18} ${hy+20}` : `M14 60 L46 84 L70 70 L98 112 L${hx-22} ${hy+10}`;
      return `<path d="${line}" stroke="${col}" stroke-width="13" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M${hx+28} ${hy+6} q14 ${ex==="bull"?-24:8} 20 ${ex==="bull"?-30:16}" class="wave" style="--o:${hx+28}px ${hy+6}px" stroke="${col}" stroke-width="9" stroke-linecap="round" fill="none"/>
      ${prop(ex, hx + 40, hy + 40)}
      <circle cx="${hx}" cy="${hy}" r="38" fill="${col}"/><circle cx="${hx}" cy="${hy}" r="31" fill="#fff"/>
      <path d="M${hx-10} ${hy+30} L${hx} ${hy+40} L${hx+10} ${hy+30}Z" fill="#fff"/><path d="M${hx-3} ${hy+31} h6 l1.5 11 l-4.5 5 l-4.5 -5z" fill="#24242a"/>
      ${face(ex, hx, hy - 6, .72, "#1b1b1f")}`; },
  },
  owl: {
    name: "Hoot", tag: "the night owl",
    about: "A geometric navy owl with big eye discs, orange beak and a bow tie: 'watches the news while you sleep', fitting the night alerts. Calm and wise; reads a little more like a logo than a presenter.",
    draw(ex) { const cx = 100, cy = 92;
      const B = `M${cx-56} ${cy-38} L${cx-44} ${cy-70} L${cx-24} ${cy-50} Q${cx} ${cy-58} ${cx+24} ${cy-50} L${cx+44} ${cy-70} L${cx+56} ${cy-38} Q${cx+66} ${cy+20} ${cx+44} ${cy+52} Q${cx} ${cy+70} ${cx-44} ${cy+52} Q${cx-66} ${cy+20} ${cx-56} ${cy-38}Z`;
      return `${sideArms(cx, cy + 12, "#253150", ex, 56)}
      <rect x="${cx-30}" y="${cy+52}" width="22" height="12" rx="6" fill="#ff9a3c"/><rect x="${cx+8}" y="${cy+52}" width="22" height="12" rx="6" fill="#ff9a3c"/>
      <path d="${B}" fill="#2e3a5c"/>
      <ellipse cx="${cx}" cy="${cy+28}" rx="34" ry="26" fill="#3d4b73"/>
      <path d="M${cx-20} ${cy+22} q5 5 10 0 q5 5 10 0 q5 5 10 0 M${cx-15} ${cy+34} q5 5 10 0 q5 5 10 0" stroke="#55648f" stroke-width="2.5" fill="none"/>
      <circle cx="${cx-21}" cy="${cy-16}" r="21" fill="#fff"/><circle cx="${cx+21}" cy="${cy-16}" r="21" fill="#fff"/>
      <path d="M${cx-6} ${cy+2} L${cx} ${cy+11} L${cx+6} ${cy+2}Z" fill="#ff9a3c"/>
      <path d="M${cx-14} ${cy+50} l14 -7 l14 7 l-14 7z" fill="#ff4500"/><circle cx="${cx}" cy="${cy+50}" r="3.5" fill="#c23400"/>
      ${face(ex, cx, cy - 16, 1.4, "#1a2238").replace(/(<path d="M[^"]*" (fill="#ff7a6b"|stroke="#1a2238" stroke-width="5.88" stroke-linecap="round" fill="none")\/>)\s*$/, "$1")}`; },
  },
};

const ALL = { ...CH, ...CH2 };
export const MASCOTS = [
  ["anchor", "Orbie", "the news anchor"], ["coin", "Baht", "a gold coin"], ["bull", "Bullet", "a tiny bull"], ["globe", "Mundo", "a little world"],
  ["screen", "Telly", "the screen anchor"], ["tri", "Tri", "the alert triangle"], ["tick", "Tick", "the ticker line"], ["owl", "Hoot", "the night owl"],
];
export const mascotSvg = (id, mood) => ALL[id]
  ? `<svg viewBox="-10 -10 220 190" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${ALL[id].draw(mood)}</svg>` : "";
