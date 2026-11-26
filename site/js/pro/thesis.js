// Pro F5 THESIS: investment thesis workspace + thesis map (cause -> effect flowchart) with shared events and
// supply-chain links (plan "Thesis workspace", "Thesis map", addition 7).
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// Saved in table "theses" (supabase/017_pro.sql, private to your login). Until that SQL is run it is kept on THIS
// device (localStorage ic_pro_th_<TICKER>) and the page says so. Ticker "*" = the shared event library.
// Map boxes: event (a real My News / World Brief story or economic event), factor (your note), stock (ticker, live price),
// rule (one of your chart drawings), scenario (bull / base / bear). Arrows: + helps, − hurts, or "supplies" (supply chain).
const TH_TYPES = [["event", "EVENT", "a real news story or economic release"], ["factor", "FACTOR", "your own note"], ["stock", "STOCK", "ticker with live price"],
  ["rule", "CHART RULE", "one of your chart drawings"], ["scenario", "SCENARIO", "bull / base / bear"]];
const th = { rows: {}, loaded: {}, db: null, lit: {}, sel: null, link: null, drag: null, pan: null, view: {}, pick: null, saveT: {} };
const thBlank = () => ({ stance: "watch", line: "", cases: { bull: {}, base: {}, bear: {} }, pro: [], con: [], miss: [], rules: [], map: { nodes: [], edges: [] } });
const thId = () => Math.random().toString(36).slice(2, 9);

function thGet(t) {
  if (th.rows[t]) return th.rows[t];
  if (!th.loaded[t]) {
    th.loaded[t] = 1;
    sb.from("theses").select("ticker,data,updated_at").in("ticker", [t, "*"]).then(({ data, error }) => {
      th.db = !error;
      if (error) { [t, "*"].forEach((k) => { th.rows[k] = safe(() => JSON.parse(localStorage.getItem("ic_pro_th_" + k)), null) || (k === "*" ? { events: [] } : thBlank()); }); }
      else { (data || []).forEach((r) => { th.rows[r.ticker] = r.data; }); if (!th.rows[t]) th.rows[t] = thBlank(); if (!th.rows["*"]) th.rows["*"] = { events: [] }; }
      thCheckLit(t); proRefresh();
    });
  }
  return null;
}
function thSave(t) {
  const d = th.rows[t]; if (!d) return;
  d.updated = new Date().toISOString();
  clearTimeout(th.saveT[t]);
  th.saveT[t] = setTimeout(async () => {
    if (th.db) { const { error } = await sb.from("theses").upsert({ user_id: state.user.id, ticker: t, data: d, updated_at: d.updated }, { onConflict: "user_id,ticker" }); if (error) toast(`Thesis not saved: ${esc(error.message)}`); }
    else safe(() => localStorage.setItem("ic_pro_th_" + t, JSON.stringify(d)));
  }, 500);
}

// ----- events that "light up": a linked story got newer updates since you last looked (Developing feature)
async function thCheckLit(t) {
  const nodes = (th.rows[t]?.map?.nodes || []).filter((n) => n.type === "event" && n.ref?.id);
  const st = nodes.filter((n) => n.ref.k === "story").map((n) => n.ref.id), wd = nodes.filter((n) => n.ref.k === "world").map((n) => n.ref.id);
  const [a, b] = await Promise.all([st.length ? sb.from("stories").select("id,updated_at,headline").in("id", st) : { data: [] }, wd.length ? sb.from("world_stories").select("id,updated_at,headline").in("id", wd) : { data: [] }]);
  [...(a.data || []), ...(b.data || [])].forEach((r) => { th.lit[r.id] = r.updated_at; });
  proRefresh();
}
const thIsLit = (n) => n.type === "event" && n.ref?.id && th.lit[n.ref.id] && (!n.seen || th.lit[n.ref.id] > n.seen);

// ----- the thesis form
function thCase(d, k, label, cls) {
  const c = d.cases[k] || {};
  return `<div class="thcase ${cls}"><div class="thch">${label}<span><input class="pin" type="number" step="any" placeholder="target" value="${c.target ?? ""}" data-thf="cases.${k}.target"> <input class="pin" style="width:56px" type="number" min="0" max="100" placeholder="%" value="${c.prob ?? ""}" data-thf="cases.${k}.prob">%</span></div>
    <textarea class="pin" rows="3" placeholder="What has to happen…" data-thf="cases.${k}.text">${esc(c.text || "")}</textarea></div>`;
}
function thList(d, k, title, ph) {
  return `<div class="thl"><div class="thlh">${title}</div>${(d[k] || []).map((x, i) => `<div class="thli"><span>${esc(x)}</span><button class="px" data-thrm="${k}" data-i="${i}">×</button></div>`).join("")}
    <form data-thadd="${k}"><input class="pin" name="v" placeholder="${ph}" maxlength="200"></form></div>`;
}
function thRules(t, d) {
  const px = quotes[yahoo(t)]?.price, draw = (chOf().draw[t] || []);
  return `<table class="ptab"><tr><th class="l">RULE</th><th class="l">TRIGGER</th><th>STATUS</th><th></th></tr>${(d.rules || []).map((r, i) => {
    const lv = Number(r.price), hit = Number.isFinite(lv) && px ? (r.dir === "below" ? px <= lv : px >= lv) : null;
    return `<tr><td class="l"><span class="ptag ${r.kind === "sell" ? "r" : r.kind === "buy" ? "g" : "y"}">${esc((r.kind || "review").toUpperCase())}</span> ${esc(r.text || "")}</td>
      <td class="l">${Number.isFinite(lv) ? `price ${r.dir === "below" ? "≤" : "≥"} ${pN(lv)}` : r.draw ? "chart drawing" : "—"}</td><td>${hit === null ? '<span class="pd">manual</span>' : hit ? '<span class="ptag a">TRIGGERED</span>' : '<span class="pd">not yet</span>'}</td>
      <td><button class="px" data-thrm="rules" data-i="${i}">×</button></td></tr>`; }).join("")}</table>
    <form class="pform thrf" data-thrule="${esc(t)}"><select class="pin" name="kind"><option value="sell">Sell if</option><option value="buy">Buy if</option><option value="review">Review if</option></select>
      <span><input class="pin" name="text" placeholder="e.g. closes below the 2026 uptrend line" style="width:60%"> <select class="pin" name="dir"><option value="below">price ≤</option><option value="above">price ≥</option></select> <input class="pin" name="price" type="number" step="any" placeholder="level"> <button class="pbtn">Add</button></span></form>
    <div class="pnote">Price rules show TRIGGERED here and on HOME. For a line-based rule, draw it on the chart and turn on that drawing's alert (Telegram): ${draw.length ? `${draw.length} drawing(s) on ${esc(t)}` : "no drawings on this ticker yet"}.</div>`;
}

// ----- the map (HTML boxes over an SVG layer for arrows; drag boxes, drag background to pan, wheel to zoom)
function thNodeHtml(t, n) {
  const sel = th.sel === n.id ? " sel" : "", lit = thIsLit(n) ? " lit" : "", link = th.link === n.id ? " linking" : "";
  let body = esc(n.label || "");
  if (n.type === "stock") { const y = yahoo(n.label || ""), q = quotes[y]; body = `<b>${esc(n.label)}</b>${q ? ` ${pN(q.price)} ${pUD(q.price - q.prev, pPct(((q.price / q.prev) - 1) * 100))}` : ""}`; }
  if (n.type === "scenario") body = `<b>${esc((n.case || "base").toUpperCase())}</b> ${esc(n.label || "")}${th.rows[t]?.cases?.[n.case]?.target ? ` → ${pN(th.rows[t].cases[n.case].target)}` : ""}`;
  return `<div class="thn t-${n.type}${sel}${lit}${link}" data-node="${n.id}" style="left:${n.x}px;top:${n.y}px"><i>${(TH_TYPES.find((x) => x[0] === n.type) || [, ""])[1]}${lit ? ' · <b>NEW</b>' : ""}</i><div class="thnb" ${n.type === "factor" || n.type === "scenario" ? `contenteditable="plaintext-only" data-nedit="${n.id}"` : ""}>${body}</div>
    ${n.type === "event" && n.ref ? `<a class="thno" href="${n.ref.k === "world" ? "#/world/" : n.ref.k === "story" ? "#/story/" : "#/econ/"}${encodeURIComponent(n.ref.k === "econ" ? String(n.ref.at || "").slice(0, 10) : n.ref.id)}" title="Open">↗</a>` : ""}</div>`;
}
function thEdges(d) {
  const by = Object.fromEntries(d.map.nodes.map((n) => [n.id, n]));
  return d.map.edges.map((e, i) => {
    const a = by[e.from], b = by[e.to]; if (!a || !b) return "";
    const ax = a.x + 90, ay = a.y + 26, bx = b.x + 90, by2 = b.y + 26, mx = (ax + bx) / 2, my = (ay + by2) / 2;
    const ang = Math.atan2(by2 - ay, bx - ax), ex = bx - Math.cos(ang) * 96, ey = by2 - Math.sin(ang) * 30;
    return `<g class="the e-${e.sign === "-" ? "neg" : e.sign === "sup" ? "sup" : "pos"}" data-edge="${i}"><line x1="${ax}" y1="${ay}" x2="${ex}" y2="${ey}" marker-end="url(#tharr)"/><line class="hit" x1="${ax}" y1="${ay}" x2="${ex}" y2="${ey}"/>
      <text x="${mx}" y="${my - 5}" text-anchor="middle">${e.sign === "-" ? "− HURTS" : e.sign === "sup" ? "SUPPLIES" : "+ HELPS"}${e.note ? " · " + esc(e.note) : ""}</text></g>`; }).join("");
}
function thMap(t, d) {
  const v = th.view[t] || (th.view[t] = { x: 0, y: 0, z: 1 });
  const lib = th.rows["*"]?.events || [];
  return `<div class="thtool">${TH_TYPES.map(([k, l, h]) => `<button class="pbtn" data-thnew="${k}" title="Add: ${h}">+ ${l}</button>`).join("")}
      <span class="sp"></span><span class="pd">${th.link ? "CLICK THE BOX TO CONNECT TO (ESC = CANCEL)" : th.sel ? "SELECTED: C = connect · DEL = delete · double-click text to edit" : "Drag boxes · drag empty space to move · wheel = zoom"}</span>
      ${th.sel ? `<button class="pbtn" data-thlink="1">CONNECT →</button><button class="pbtn" data-thdel="1">DELETE</button>` : ""}<button class="pbtn" data-thfit="1">RESET VIEW</button></div>
    ${th.pick ? thPicker(t) : ""}
    <div class="thcanvas" data-thc="${esc(t)}"><div class="thworld" style="transform:translate(${v.x}px,${v.y}px) scale(${v.z})">
      <svg class="thsvg" width="4000" height="3000"><defs><marker id="tharr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z"/></marker></defs>${thEdges(d)}</svg>
      ${d.map.nodes.map((n) => thNodeHtml(t, n)).join("")}</div>
      ${d.map.nodes.length ? "" : `<div class="thhint">Start with an <b>EVENT</b> (a real headline), add the <b>STOCKS</b> it touches, connect them with arrows (+ helps, − hurts, supplies), and end in a <b>SCENARIO</b>.<br>Example: "US tariffs on Taiwan" → − TSM → supplies NVDA → BEAR case.</div>`}</div>
    ${lib.length ? `<div class="pnote"><b>Shared events</b> (reused across maps): ${lib.slice(0, 12).map((e) => `<button class="pbtn" data-thlib="${esc(e.id)}" title="Add to this map">${esc(e.label.slice(0, 40))}${e.used?.length ? ` <span class="pd">· ${esc(e.used.join(", "))}</span>` : ""}</button>`).join(" ")}</div>` : ""}`;
}
function thPicker(t) {
  const p = th.pick, draws = (chOf().draw[t] || []).map((o, i) => ({ i, name: o.name, v: o.points?.[0]?.value }));
  if (p.type === "event") return `<div class="thpick"><form data-thsearch="1"><b>FIND AN EVENT</b> <input class="pin" name="q" value="${esc(p.q || "")}" placeholder="search headlines + economic releases, e.g. tariff, CPI, Nvidia" style="width:50%" autofocus> <button class="pbtn">Search</button> <button type="button" class="pbtn" data-thpickx="1">Cancel</button></form>
    ${p.res ? (p.res.length ? `<div class="thres">${p.res.map((r, i) => `<button data-thpickr="${i}"><span class="ptag">${r.k.toUpperCase()}</span> ${esc(r.label)} <span class="pd">${esc(String(r.at || "").slice(0, 10))}</span></button>`).join("")}</div>` : '<div class="pd">Nothing found.</div>') : ""}</div>`;
  if (p.type === "stock") return `<div class="thpick"><form data-thstock="1"><b>TICKER</b> <input class="pin" name="q" placeholder="e.g. TSM, PTT, AAPL" autofocus> <button class="pbtn">Add</button> <button type="button" class="pbtn" data-thpickx="1">Cancel</button></form></div>`;
  if (p.type === "rule") return `<div class="thpick"><b>CHART DRAWING ON ${esc(t)}</b> ${draws.length ? draws.map((d) => `<button class="pbtn" data-thdraw="${d.i}">${esc(d.name)}${d.v ? " @ " + pN(d.v) : ""}</button>`).join(" ") : '<span class="pd">No drawings on this ticker yet (open CHART and draw one).</span>'} <button class="pbtn" data-thpickx="1">Cancel</button></div>`;
  if (p.type === "scenario") return `<div class="thpick"><b>WHICH CASE</b> ${["bull", "base", "bear"].map((k) => `<button class="pbtn" data-thcase="${k}">${k.toUpperCase()}</button>`).join(" ")} <button class="pbtn" data-thpickx="1">Cancel</button></div>`;
  return "";
}
function thAddNode(t, n) {
  const d = th.rows[t], v = th.view[t] || { x: 0, y: 0, z: 1 }, k = d.map.nodes.length;
  d.map.nodes.push({ id: thId(), x: Math.round((-v.x + 40 + (k % 5) * 290) / v.z), y: Math.round((-v.y + 40 + Math.floor(k / 5) * 140) / v.z), ...n });
  th.pick = null; th.sel = d.map.nodes.at(-1).id; thSave(t); render(false);
}

PRO_VIEWS.thesis = () => {
  const t = proTk(), d = thGet(t); thGet("*");
  if (!d) return proWait("LOADING THESIS…");
  if (!chOf().draw[t]) { chOf().draw[t] = []; sb.from("chart_drawings").select("symbol,overlays").eq("symbol", t).maybeSingle().then(({ data }) => { chOf().draw[t] = data?.overlays || []; proRefresh(); }); }
  if (!quotes[yahoo(t)]) sb.rpc("get_quotes", { syms: [yahoo(t), ...d.map.nodes.filter((n) => n.type === "stock").map((n) => yahoo(n.label))] }).then(({ data }) => { Object.assign(quotes, data || {}); proRefresh(); });
  const px = quotes[yahoo(t)]?.price, C = d.cases, P = ["bull", "base", "bear"].map((k) => [Number(C[k]?.target), Number(C[k]?.prob)]);
  const sumP = P.reduce((s, x) => s + (Number.isFinite(x[1]) ? x[1] : 0), 0), ev = sumP ? P.reduce((s, x) => s + (Number.isFinite(x[0]) && Number.isFinite(x[1]) ? x[0] * x[1] : 0), 0) / sumP : null;
  const note = th.db === false ? '<div class="pnote pw">Saved on THIS device only until supabase/017_pro.sql is run (then it syncs to your account).</div>' : "";
  return `${note}<div class="psub ptabs"><span class="ptkh"><b>${esc(t)}</b> ${px ? pN(px) : ""} · THESIS ${d.updated ? `· saved ${pAgo(d.updated)}` : ""}</span>
      ${["bull", "watch", "bear"].map((k) => `<button class="${d.stance === k ? "on" : ""}" data-thstance="${k}">${{ bull: "I'M BULLISH", watch: "WATCHING", bear: "I'M BEARISH" }[k]}</button>`).join("")}
      <span class="sp"></span><a class="pbtn" href="${proHref("val", t)}">VAL</a><a class="pbtn" href="#/charts/${encodeURIComponent(t)}">CHART</a></div>
    <div class="pgrid g21">
    ${proPanel(`THESIS · ${esc(t)}`, th.db ? "YOUR ACCOUNT (PRIVATE)" : "THIS DEVICE", `<div class="thline"><textarea class="pin" rows="2" placeholder="My thesis in one sentence: why this stock, why now?" data-thf="line">${esc(d.line || "")}</textarea></div>
      <div class="thcases">${thCase(d, "bull", "BULL", "up")}${thCase(d, "base", "BASE", "")}${thCase(d, "bear", "BEAR", "dn")}</div>
      <div class="pkv"><span>Probability-weighted target</span><span>${ev ? `${pN(ev)} ${px ? pUD(ev - px, `(${pPct((ev / px - 1) * 100, 0)} vs now)`) : ""}` : "—"}</span><span>Probabilities add up to</span><span class="${sumP && sumP !== 100 ? "pw" : ""}">${sumP || "—"}%</span></div>
      <div class="thlists">${thList(d, "pro", "EVIDENCE FOR", "+ add a fact that supports it")}${thList(d, "con", "EVIDENCE AGAINST", "+ add a fact against it")}${thList(d, "miss", "WHAT I DON'T KNOW YET", "+ add a missing piece")}</div>`)}
    ${proPanel("RULES · WHEN TO ACT", "YOUR RULES + LIVE PRICE", thRules(t, d))}</div>
    <div class="pgrid g2">${proPanel("THESIS MAP", "EVENTS → EFFECTS → STOCKS → SCENARIOS", thMap(t, d), "s2")}</div>`;
};

// ----- events
function thField(t, path, val) { const d = th.rows[t]; const ks = path.split("."); let o = d; ks.slice(0, -1).forEach((k) => { o = o[k] ||= {}; }); o[ks.at(-1)] = val; thSave(t); }
document.addEventListener("input", (e) => {
  const f = e.target.dataset?.thf; if (!f) return;
  const t = proTk(), v = e.target.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value;
  thField(t, f, v);
});
document.addEventListener("change", (e) => { if (e.target.dataset?.thf && e.target.type === "number") render(false); });
document.addEventListener("focusout", (e) => {
  const id = e.target.dataset?.nedit; if (!id) return;
  const t = proTk(), n = th.rows[t]?.map.nodes.find((x) => x.id === id); if (!n) return;
  n.label = e.target.innerText.trim().slice(0, 140); thSave(t);
});
document.addEventListener("submit", async (e) => {
  const f = e.target, t = proTk(), d = th.rows[t]; if (!d) return;
  if (f.dataset.thadd !== undefined) { e.preventDefault(); const v = String(new FormData(f).get("v") || "").trim(); if (v) { (d[f.dataset.thadd] ||= []).push(v.slice(0, 200)); thSave(t); render(false); } return; }
  if (f.dataset.thrule !== undefined) { e.preventDefault(); const fd = new FormData(f), p = parseFloat(fd.get("price"));
    d.rules.push({ kind: fd.get("kind"), text: String(fd.get("text") || "").slice(0, 160), dir: fd.get("dir"), price: Number.isFinite(p) ? p : null }); thSave(t); render(false); return; }
  if (f.dataset.thstock !== undefined) { e.preventDefault(); const v = String(new FormData(f).get("q") || "").trim().toUpperCase(); if (v) thAddNode(t, { type: "stock", label: v }); return; }
  if (f.dataset.thsearch !== undefined) {
    e.preventDefault(); const q = String(new FormData(f).get("q") || "").replace(/[%_,().*"\\]/g, " ").trim(); if (q.length < 2) return;
    th.pick = { type: "event", q, res: null }; render(false);
    const like = `%${q}%`;
    const [a, b, c] = await Promise.all([sb.from("stories").select("id,headline,created_at,updated_at").ilike("headline", like).order("created_at", { ascending: false }).limit(8),
      sb.from("world_stories").select("id,headline,created_at,updated_at").ilike("headline", like).order("created_at", { ascending: false }).limit(6),
      sb.from("econ_events").select("id,title,currency,at").ilike("title", like).order("at", { ascending: false }).limit(6)]);
    th.pick.res = [...(a.data || []).map((r) => ({ k: "story", id: r.id, label: r.headline, at: r.created_at, up: r.updated_at })), ...(b.data || []).map((r) => ({ k: "world", id: r.id, label: r.headline, at: r.created_at, up: r.updated_at })),
      ...(c.data || []).map((r) => ({ k: "econ", id: String(r.id), label: `${r.currency} ${r.title}`, at: r.at }))];
    render(false);
  }
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-thstance],[data-thrm],[data-thnew],[data-thpickx],[data-thpickr],[data-thdraw],[data-thcase],[data-thlink],[data-thdel],[data-thfit],[data-thlib],[data-node],[data-edge]");
  if (!b || !(location.hash || "").startsWith("#/pro/thesis")) return;
  const t = proTk(), d = th.rows[t]; if (!d) return;
  if (b.dataset.thstance) { d.stance = b.dataset.thstance; thSave(t); return render(false); }
  if (b.dataset.thrm) { d[b.dataset.thrm].splice(+b.dataset.i, 1); thSave(t); return render(false); }
  if (b.dataset.thnew) { const k = b.dataset.thnew; if (k === "factor") return thAddNode(t, { type: "factor", label: "New factor (double-click to edit)" }); th.pick = { type: k }; return render(false); }
  if (b.dataset.thpickx) { th.pick = null; return render(false); }
  if (b.dataset.thpickr) {
    const r = th.pick.res[+b.dataset.thpickr], lib = th.rows["*"] ||= { events: [] };
    let ev = lib.events.find((x) => x.ref?.id === r.id && x.ref?.k === r.k);
    if (!ev) { ev = { id: thId(), label: r.label, ref: { k: r.k, id: r.id, at: r.at }, used: [] }; lib.events.unshift(ev); }
    if (!ev.used.includes(t)) ev.used.push(t); thSave("*");
    if (r.up) th.lit[r.id] = r.up;
    return thAddNode(t, { type: "event", label: r.label, ref: ev.ref, lib: ev.id, seen: r.up || new Date().toISOString() });
  }
  if (b.dataset.thlib) { const ev = th.rows["*"].events.find((x) => x.id === b.dataset.thlib); if (!ev) return; if (!ev.used.includes(t)) ev.used.push(t); thSave("*"); return thAddNode(t, { type: "event", label: ev.label, ref: ev.ref, lib: ev.id, seen: new Date().toISOString() }); }
  if (b.dataset.thdraw) { const o = chOf().draw[t][+b.dataset.thdraw]; return thAddNode(t, { type: "rule", label: `${o.name}${o.points?.[0]?.value ? " @ " + pN(o.points[0].value) : ""} on ${t}`, draw: +b.dataset.thdraw }); }
  if (b.dataset.thcase) return thAddNode(t, { type: "scenario", case: b.dataset.thcase, label: "" });
  if (b.dataset.thlink) { th.link = th.sel; return render(false); }
  if (b.dataset.thdel) { thDelSel(t); return; }
  if (b.dataset.thfit) { th.view[t] = { x: 0, y: 0, z: 1 }; return render(false); }
  if (b.dataset.edge !== undefined) {   // click an arrow: + helps -> − hurts -> supplies -> remove
    const ed = d.map.edges[+b.dataset.edge], nx = { "+": "-", "-": "sup", sup: null }[ed.sign || "+"];
    if (nx === null) d.map.edges.splice(+b.dataset.edge, 1); else ed.sign = nx;
    thSave(t); return render(false);
  }
  if (b.dataset.node && !th.dragMoved) {
    const id = b.dataset.node, n = d.map.nodes.find((x) => x.id === id);
    if (th.link && th.link !== id) { if (!d.map.edges.some((x) => x.from === th.link && x.to === id)) d.map.edges.push({ from: th.link, to: id, sign: "+" }); th.link = null; th.sel = id; thSave(t); return render(false); }
    if (n && thIsLit(n)) { n.seen = th.lit[n.ref.id]; thSave(t); }
    if (th.sel !== id) { th.sel = id; render(false); }
  }
});
function thDelSel(t) {
  const d = th.rows[t]; if (!th.sel) return;
  d.map.nodes = d.map.nodes.filter((n) => n.id !== th.sel); d.map.edges = d.map.edges.filter((x) => x.from !== th.sel && x.to !== th.sel);
  th.sel = null; thSave(t); render(false);
}
document.addEventListener("keydown", (e) => {
  if (!(location.hash || "").startsWith("#/pro/thesis") || e.target.closest?.("input, textarea, [contenteditable]")) return;
  const t = proTk();
  if (e.key === "Escape") { th.link = null; th.pick = null; th.sel = null; render(false); }
  if ((e.key === "Delete" || e.key === "Backspace") && th.sel) { e.preventDefault(); thDelSel(t); }
  if ((e.key === "c" || e.key === "C") && th.sel) { th.link = th.sel; render(false); }
});
// drag boxes / pan / zoom (pointer events on the canvas)
document.addEventListener("pointerdown", (e) => {
  const c = e.target.closest?.(".thcanvas"); if (!c || e.button !== 0 || e.target.closest("[contenteditable], a, .the")) return;
  const t = c.dataset.thc, v = th.view[t], nd = e.target.closest("[data-node]");
  th.dragMoved = false;
  if (nd) { const n = th.rows[t].map.nodes.find((x) => x.id === nd.dataset.node); th.drag = { t, n, el: nd, sx: e.clientX, sy: e.clientY, x0: n.x, y0: n.y, z: v.z }; }
  else th.pan = { t, sx: e.clientX, sy: e.clientY, x0: v.x, y0: v.y, el: c.firstElementChild };
});
document.addEventListener("pointermove", (e) => {
  if (th.drag) { const g = th.drag, dx = (e.clientX - g.sx) / g.z, dy = (e.clientY - g.sy) / g.z; if (Math.abs(dx) + Math.abs(dy) > 3) th.dragMoved = true;
    g.n.x = Math.round(g.x0 + dx); g.n.y = Math.round(g.y0 + dy); g.el.style.left = g.n.x + "px"; g.el.style.top = g.n.y + "px";
    const svg = g.el.parentElement.querySelector(".thsvg"); if (svg) svg.innerHTML = svg.querySelector("defs").outerHTML + thEdges(th.rows[g.t]); }
  else if (th.pan) { const p = th.pan, v = th.view[p.t]; v.x = p.x0 + e.clientX - p.sx; v.y = p.y0 + e.clientY - p.sy; p.el.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.z})`; if (Math.abs(e.clientX - p.sx) > 3) th.dragMoved = true; }
});
document.addEventListener("pointerup", () => {
  if (th.drag) { if (th.dragMoved) thSave(th.drag.t); th.drag = null; setTimeout(() => { th.dragMoved = false; }, 0); }
  if (th.pan) { if (!th.dragMoved && th.sel) { th.sel = null; render(false); } th.pan = null; setTimeout(() => { th.dragMoved = false; }, 0); }
});
document.addEventListener("wheel", (e) => {
  const c = e.target.closest?.(".thcanvas"); if (!c) return;
  e.preventDefault();
  const t = c.dataset.thc, v = th.view[t], r = c.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, z = Math.min(2, Math.max(0.35, v.z * (e.deltaY < 0 ? 1.1 : 0.9)));
  v.x = mx - ((mx - v.x) * z) / v.z; v.y = my - ((my - v.y) * z) / v.z; v.z = z;
  c.firstElementChild.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.z})`;
}, { passive: false });

// For HOME: theses with something new (lit events or triggered price rules)
function thWatch() {
  const out = [];
  Object.entries(th.rows).forEach(([t, d]) => {
    if (t === "*" || t[0] === "#" || !d?.map) return;
    const lit = d.map.nodes.filter(thIsLit).length, px = quotes[yahoo(t)]?.price;
    const trig = (d.rules || []).filter((r) => Number.isFinite(Number(r.price)) && px && (r.dir === "below" ? px <= r.price : px >= r.price)).length;
    out.push({ t, stance: d.stance, lit, trig, line: d.line });
  });
  return out;
}
// HOME asks for every saved thesis once
let thAllAsked = false;
function thLoadAll() {
  if (thAllAsked) return; thAllAsked = true;
  sb.from("theses").select("ticker,data").then(({ data, error }) => {
    if (error) { Object.keys(localStorage).filter((k) => k.startsWith("ic_pro_th_")).forEach((k) => { th.rows[k.slice(10)] = safe(() => JSON.parse(localStorage.getItem(k)), null); }); th.db = false; }
    else { th.db = true; (data || []).forEach((r) => { th.rows[r.ticker] = r.data; }); }
    Object.keys(th.rows).forEach((t) => { if (t !== "*" && t[0] !== "#") thCheckLit(t); });
    proRefresh();
  });
}
