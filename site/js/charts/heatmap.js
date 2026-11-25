// Stock heat map page (#/heatmap).
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// ----- Stock heat map page (#/heatmap, design round 40/41): one tile per company, size = company value, colour = today's move -----
const HM_IDX = [["@SP500", "S&P 500"], ["@SET50", "SET50"]];
function squarify(items, x, y, w, h) {   // items sorted big -> small, each {v}; returns rectangles (squarified treemap)
  const out = [], total = items.reduce((a, b) => a + b.v, 0) || 1, k = (w * h) / total;
  let rest = items.map((o) => ({ ...o, a: Math.max(o.v * k, 0.0001) }));
  const worst = (row, len) => { const s = row.reduce((a, b) => a + b.a, 0), mx = Math.max(...row.map((r) => r.a)), mn = Math.min(...row.map((r) => r.a)); return Math.max((len * len * mx) / (s * s), (s * s) / (len * len * mn)); };
  while (rest.length) {
    const len = Math.min(w, h); let row = [rest[0]], i = 1;
    while (i < rest.length && worst([...row, rest[i]], len) <= worst(row, len)) { row.push(rest[i]); i++; }
    const s = row.reduce((a, b) => a + b.a, 0);
    if (w >= h) { const cw = s / h; let yy = y; row.forEach((r) => { const rh = r.a / cw; out.push({ ...r, x, y: yy, w: cw, h: rh }); yy += rh; }); x += cw; w -= cw; }
    else { const rh = s / w; let xx = x; row.forEach((r) => { const rw = r.a / rh; out.push({ ...r, x: xx, y, w: rw, h: rh }); xx += rw; }); y += rh; h -= rh; }
    rest = rest.slice(i);
  }
  return out;
}
const HM_COL = (v) => (v === null ? "var(--chip)" : isDark()
  ? (v >= 3 ? "#0f9d58" : v >= 1 ? "#167a46" : v >= 0.1 ? "#1f5136" : v > -0.1 ? "#3a3a40" : v > -1 ? "#7a2532" : v > -3 ? "#b3263a" : "#e23b4f")
  : (v >= 3 ? "#15803d" : v >= 1 ? "#22a35a" : v >= 0.1 ? "#6cbf8a" : v > -0.1 ? "#a3a3a3" : v > -1 ? "#f08b8b" : v > -3 ? "#e05252" : "#b91c1c"));
async function loadHeatmap() {
  const ch = chOf(), key = ch.hmIdx || "@SP500";
  if (!ch.hm) {
    const { data, error } = await sb.from("stock_stats").select("symbol,data,updated_at").in("symbol", HM_IDX.map((x) => x[0]));
    ch.hm = {}; (data || []).forEach((r) => { ch.hm[r.symbol] = r.data; }); ch.hmErr = error?.message || null;
  }
  const mem = ch.hm[key]?.members || [], fresh = !ch.hmDrawn;
  ch.hmDrawn = true;
  if (!mem.length || Date.now() - (ch.hmAt?.[key] || 0) < 55e3) { if (fresh && (location.hash || "") === "#/heatmap") render("soft"); return; }
  (ch.hmAt ||= {})[key] = Date.now();
  const syms = mem.map((m) => m.s), parts = [];
  for (let i = 0; i < syms.length; i += 40) parts.push(syms.slice(i, i + 40));
  for (let i = 0; i < parts.length; i += 4) {   // 4 at a time, and draw as they arrive
    const res = await Promise.all(parts.slice(i, i + 4).map((p) => sb.rpc("get_quotes", { syms: p })));
    res.forEach(({ data }) => Object.assign(quotes, data || {}));
    if ((location.hash || "") === "#/heatmap") render("soft");
  }
}
function viewHeatmap() {
  const ch = chOf(), key = ch.hmIdx || "@SP500", size = ch.hmSize || "cap", d = ch.hm?.[key], mem = d?.members || [];
  const W = 1000, H = 600;
  let body;
  if (!ch.hm) body = `<div class="chempty">Loading…</div>`;
  else if (!mem.length) body = `<div class="chempty">The heat map list arrives with the robot's next daily run.${ch.hmErr ? ` (${esc(ch.hmErr)})` : ""}</div>`;
  else {
    const groups = {};
    mem.forEach((m) => { const v = size === "cap" ? m.cap || 0 : 1; if (v > 0) (groups[m.sec] ||= []).push({ ...m, v }); });
    const secs = Object.entries(groups).map(([n, l]) => ({ n, l: l.sort((a, b) => b.v - a.v), v: l.reduce((a, b) => a + b.v, 0) })).sort((a, b) => b.v - a.v);
    let html = "";
    squarify(secs, 0, 0, W, H).forEach((b) => {
      const pad = b.h > 40 && b.w > 60 ? 16 : 0;
      html += `<div class="hmsec" style="left:${b.x / W * 100}%;top:${b.y / H * 100}%;width:${b.w / W * 100}%;height:${b.h / H * 100}%"><span>${esc(b.n)}</span></div>`;
      squarify(b.l, b.x, b.y + pad, b.w, Math.max(1, b.h - pad)).forEach((t) => {
        const v = chPct(t.s), q = quotes[t.s];
        html += `<a class="hmt" href="${chHref(plainOf(t.s))}" style="left:${t.x / W * 100}%;top:${t.y / H * 100}%;width:${t.w / W * 100}%;height:${t.h / H * 100}%;background:${HM_COL(v)}"
          title="${esc(t.t)} · ${esc(t.n)}${q ? ` · ${fmtPx(q.price)}` : ""}${v !== null ? ` · ${v > 0 ? "+" : ""}${v.toFixed(2)}%` : ""}${t.cap ? ` · market cap ${bigNum(t.cap)}` : ""}"><span class="in">${evLogo({ sym: plainOf(t.s) }, 40)}<b>${esc(t.t)}</b><small>${v === null ? "" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`}</small></span></a>`;
      });
    });
    body = `<div class="hmtm">${html}</div>`;
  }
  const leg = [["−3%", -4], ["−1%", -2], ["0%", 0], ["+1%", 2], ["+3%", 4]];
  return `${header("charts")}<div class="wrap chp">
    <div class="chlay"><div class="chmain">
      <div class="hmbar"><a class="chback" href="#/charts" title="Charts">‹</a><h1>Stock heat map</h1>
        ${HM_IDX.map(([k, l]) => `<button class="pill${k === key ? " on" : ""}" data-hmidx="${k}">${l}</button>`).join("")}<i></i>
        <span class="lab">Size</span>${[["cap", "Market cap"], ["eq", "Equal"]].map(([k, l]) => `<button class="pill${k === size ? " on" : ""}" data-hmsize="${k}">${l}</button>`).join("")}
        <span class="sp"></span><span class="note" style="margin:0">Colour = today's move · live, every minute</span></div>
      <div class="chc hmwrap">${body}</div>
      <div class="hmleg">${leg.map(([l, v]) => `<span style="background:${HM_COL(v)}">${l}</span>`).join("")}<span class="note" style="margin:0 0 0 10px">${esc(d?.source || "")}${d?.at ? ` · members ${new Date(d.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""} · click a tile to open its chart</span></div>
    </div>${chSide()}</div></div>`;
}

async function toggleChartWatch(t) {
  const s = state.settings, w = [...(s.watchlist || [])], names = { ...(s.watch_names || {}) };
  const has = w.includes(t);
  if (!has && w.length >= MAX_WATCHLIST) { toast(`Your watchlist is full (${MAX_WATCHLIST}). Remove one in Topics & watchlist.`); return; }
  const next = has ? w.filter((x) => x !== t) : [...w, t];
  if (has) delete names[t]; else if (!known(t)) names[t] = cleanName(statsOf(yahoo(t))?.name || kc.meta?.name || quotes[yahoo(t)]?.name || t);
  const { error } = await sb.from("user_settings").update({ watchlist: next, watch_names: names, updated_at: new Date().toISOString() }).eq("user_id", state.user.id);
  if (error) { toast(`Could not save: ${esc(error.message)}`); return; }
  s.watchlist = next; s.watch_names = names;
  toast(has ? `${esc(t)} removed from your watchlist` : `${esc(t)} added to your watchlist ★`);
  render(false);
}

