// Stocks by market & industry page (#/stocks, design round 48 F1): S&P 500 + SET50 members, dropdown filters, sort by column titles.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// Members come from the heat map lists (robot/heatmap.py). Filters combine (several markets x several industries);
// sorts combine too: click a column title, click a 2nd one to break ties, click again to change / remove.
const SCR_MK = [["@SP500", "US · S&P 500"], ["@SET50", "Thailand · SET50"], ["@N225", "Japan · Nikkei 225"], ["@HSI", "Hong Kong · Hang Seng"],
  ["@KS200", "Korea · KOSPI 200"], ["@FTSE", "UK · FTSE 100"], ["@DAX", "Germany · DAX"]];   // same lists as the heat map (HM_IDX)
const SCR_COLS = [["name", "Company"], ["mkt", "Market"], ["sec", "Industry"], [null, "Price"], ["chg", "Chg %"], ["cap", "Mkt cap $"]];
// Same industry, different spelling in different lists (checked across all 7 markets, 2026-11-25)
const SEC_FIX = { "Food & Beverages": "Food & Beverage", Healthcare: "Health Care", "Aerospace and Defense": "Aerospace & Defence", "Consumer goods": "Consumer Goods" };
const secOf = (m) => SEC_FIX[m.sec] || m.sec;
const scrOf = () => { const ch = chOf(); const f = ch.scr || (ch.scr = safe(() => JSON.parse(localStorage.getItem("ic_scr") || "null"), null) || { mk: [], sec: [], sort: ["sec", "chg"], lim: 50 }); f.flt ||= []; return f; };
// Screener (round 49 S1 + S2). Numbers come from the robot's daily member lists (heatmap.py); Chg % from live prices.
// [label, unit, short label for tokens/columns, sort: 1 = biggest first, -1 = smallest first]
const SCR_F = { pe: ["P/E", "", "P/E", -1], fpe: ["Forward P/E", "", "FWD P/E", -1], dy: ["Dividend yield", "%", "DIV YLD", 1], cap: ["Market cap", "$B", "Mkt cap", 1],
  chg: ["Change today", "%", "Chg", 1], mov: ["Moved today, up or down", "%", "Move", 1], fh: ["From 52-week high", "%", "FROM HIGH", 1], fl: ["From 52-week low", "%", "FROM LOW", -1] };
const SCR_PRE = [   // ready-made screens; yours are added after these (saved on this device)
  { id: "div", n: "High dividend", d: "Yield ≥ 4% · P/E < 20", flt: [{ k: "dy", min: 4 }, { k: "pe", max: 20 }], sort: ["dy"] },
  { id: "val", n: "Cheap value", d: "P/E 0–12 · cap > $2B", flt: [{ k: "pe", max: 12 }, { k: "cap", min: 2 }], sort: ["pe"] },
  { id: "low", n: "Near 52-week low", d: "within 10% of the low", flt: [{ k: "fl", max: 10 }], sort: ["fl"] },
  { id: "mov", n: "Big movers today", d: "up or down ≥ 4%", flt: [{ k: "mov", min: 4 }], sort: ["chg"] }];
const scrMine = () => safe(() => JSON.parse(localStorage.getItem("ic_scrpre") || "[]"), []);
function scrVal(m, k) {   // a stock's number for filter / column k (null = Yahoo has none)
  const px = quotes[m.s] ? Number(quotes[m.s].price) : m.px, c = chPct(m.s);
  const v = k === "cap" ? (m.cap ? m.cap / 1e9 : null) : k === "chg" ? c : k === "mov" ? (c === null ? null : Math.abs(c))
    : k === "fh" ? (px && m.h52 ? (px / m.h52 - 1) * 100 : null) : k === "fl" ? (px && m.l52 ? (px / m.l52 - 1) * 100 : null) : m[k];
  if (v === undefined || v === null || !Number.isFinite(Number(v))) return null;
  return (k === "pe" || k === "fpe") && v <= 1 ? null : Number(v);   // loss-makers / Yahoo slips (same rule as robot/heatmap.py)
}
const scrFmt = (k, v) => (v === null ? "—" : k === "cap" ? "$" + bigNum(v * 1e9) : k === "pe" || k === "fpe" ? v.toFixed(1) : `${(k === "fh" || k === "fl" || k === "chg") && v > 0 ? "+" : ""}${v.toFixed(k === "dy" ? 2 : 1)}%`);
const scrTok = (x) => { const [, u, s] = SCR_F[x.k], n = (v) => (u === "$B" ? `$${v}B` : `${v}${u}`);
  return `${s === "Chg" ? "Chg" : SCR_F[x.k][0]} ${x.min !== undefined && x.max !== undefined ? `${n(x.min)}–${n(x.max)}` : x.min !== undefined ? `≥ ${n(x.min)}` : x.max !== undefined ? `≤ ${n(x.max)}` : "(any)"}`; };
const scrSame = (a, b) => JSON.stringify(a.map((x) => [x.k, x.min, x.max])) === JSON.stringify(b.map((x) => [x.k, x.min, x.max]));
const scrSave = () => { const { lim: _, ...x } = scrOf(); safe(() => localStorage.setItem("ic_scr", JSON.stringify(x))); };
async function loadScr(syms) {   // member lists (once), then prices for the stocks this view needs (each at most every 2 minutes)
  const ch = chOf(); if (ch.scrLoading) return;
  ch.scrLoading = true;
  try {
    if (!ch.hm) { const { data, error } = await sb.from("stock_stats").select("symbol,data,updated_at").in("symbol", HM_IDX.map((x) => x[0])); ch.hm = {}; (data || []).forEach((r) => { ch.hm[r.symbol] = r.data; }); ch.hmErr = error?.message || null; }
    else if (syms?.length) {
      const now = Date.now(), ask = ch.scrAsked || (ch.scrAsked = {}), todo = syms.filter((s) => now - (ask[s] || 0) > 120e3);
      todo.forEach((s) => { ask[s] = now; });
      const parts = []; for (let i = 0; i < todo.length; i += 40) parts.push(todo.slice(i, i + 40));
      for (let i = 0; i < parts.length; i += 4) { const res = await Promise.all(parts.slice(i, i + 4).map((p) => sb.rpc("get_quotes", { syms: p }))); res.forEach(({ data }) => Object.assign(quotes, data || {})); }
    }
  } finally { ch.scrLoading = false; }
  if (location.hash === "#/stocks") render("soft");
}
function scrDropdown(key, label, value, n, inner) {   // a filter button; its list stays open while you tick boxes
  const open = chOf().scrOpen === key;
  return `<div class="scrdd${open ? " open" : ""}"><button class="scrbtn${n ? " has" : ""}" data-scrdd="${key}"><small>${label}</small>${n ? `<span class="c">${n}</span>` : esc(value)}<i>▾</i></button>${open ? `<div class="scrpop">${inner}</div>` : ""}</div>`;
}
const scrBox = (attr, v, on, label, n) => `<button class="scrck${on ? " on" : ""}" data-${attr}="${esc(v)}"><span class="cb"></span><span class="l">${esc(label)}</span>${n !== undefined ? `<em>${n}</em>` : ""}</button>`;
function viewStocks() {
  const ch = chOf(), f = scrOf();
  const keys = f.mk.length ? f.mk : SCR_MK.map((x) => x[0]), mkName = Object.fromEntries(SCR_MK.map(([k, l]) => [k, l.split(" · ")[0]]));
  const members = (k) => (ch.hm?.[k]?.members || []).map((m) => ({ ...m, sec: secOf(m), mk: k }));
  const all = keys.flatMap(members);
  const secCount = (k) => { const c = {}; members(k).forEach((m) => { if (m.sec) c[m.sec] = (c[m.sec] || 0) + 1; }); return c; };
  const secs = [...new Set(all.map((m) => m.sec).filter(Boolean))];
  const sel = f.sec.filter((x) => secs.includes(x)), base = sel.length ? all.filter((m) => sel.includes(m.sec)) : all;
  // number filters: a stock without that number is left out while the filter is on
  const pass = (m, list) => list.every((x) => { const v = scrVal(m, x.k); return v !== null && (x.min === undefined || v >= x.min) && (x.max === undefined || v <= x.max); });
  const live = (x) => x.k === "chg" || x.k === "mov";
  const pre = base.filter((m) => pass(m, f.flt.filter((x) => !live(x)))), rows = pre.filter((m) => pass(m, f.flt.filter(live)));
  const chg = (m) => chPct(m.s), num = (v, dflt) => (v === null || v === undefined || !Number.isFinite(v) ? dflt : v);
  const cmp = { mkt: (a, b) => mkName[a.mk].localeCompare(mkName[b.mk]), sec: (a, b) => String(a.sec).localeCompare(String(b.sec)), chg: (a, b) => num(chg(b), -1e9) - num(chg(a), -1e9),
    chgdn: (a, b) => num(chg(a), 1e9) - num(chg(b), 1e9), cap: (a, b) => (b.cap || 0) - (a.cap || 0), name: (a, b) => String(a.t).localeCompare(String(b.t)) };
  for (const k of ["pe", "fpe", "dy", "fh", "fl"]) { const d = SCR_F[k][3]; cmp[k] = (a, b) => { const x = scrVal(a, k), y = scrVal(b, k); return x === null ? (y === null ? 0 : 1) : y === null ? -1 : d * (y - x); }; }
  rows.sort((a, b) => { for (const k of f.sort) { const r = cmp[k]?.(a, b) || 0; if (r) return r; } return (b.cap || 0) - (a.cap || 0); });
  const shown = rows.slice(0, f.lim || 50), grp = f.sort[0] === "sec" || f.sort[0] === "mkt";
  // prices: only the rows on screen, or every candidate when sorting / filtering by today's change (the order needs all of them)
  const need = ch.scrNeed = [...new Set((f.sort.some((k) => k === "chg" || k === "chgdn") || f.flt.some(live) ? pre : shown).map((m) => m.s))];
  if (!ch.scrLoading && (!ch.hm || need.some((s) => Date.now() - (ch.scrAsked?.[s] || 0) > 120e3))) setTimeout(() => loadScr(need), 0);
  // filter bar: Market ▾ · Industry ▾ (grouped by market, search box) · chosen ones as tokens
  const mkPop = SCR_MK.map(([k, l]) => scrBox("scrmk", k, f.mk.includes(k), l, (ch.hm?.[k]?.members || []).length)).join("");
  const secPop = `<input class="scrq" placeholder="Search industries…" autocomplete="off"><div class="scrcols">${keys.map((k) => { const c = secCount(k);
      return `<div><div class="gh">${esc(SCR_MK.find((x) => x[0] === k)[1].toUpperCase())}</div>${Object.keys(c).sort().map((s) => scrBox("scrsec", s, sel.includes(s), s, c[s])).join("")}</div>`; }).join("")}</div>
    <div class="ft"><button data-scrsec="*">Clear</button><button class="pri" data-scrdd="close">Show ${rows.length} stocks</button></div>`;
  const toks = [...f.mk.map((k) => [`data-scrmk="${k}"`, SCR_MK.find((x) => x[0] === k)[1], ""]), ...sel.map((s) => [`data-scrsec="${esc(s)}"`, s, ""]),
    ...f.flt.map((x, i) => [`data-scrfdel="${i}"`, scrTok(x), " f"])];
  // "+ Filter" list: the filters you have (min / max boxes, applied when you leave the box) + the ones you can add
  const fltPop = `${f.flt.length ? f.flt.map((x, i) => { const [l, u] = SCR_F[x.k];
      return `<div class="scrfrow"><span class="l">${esc(l)}${u ? ` <em>${u}</em>` : ""}</span><input type="number" step="any" placeholder="min" data-scrfmin="${i}" value="${x.min ?? ""}"><span class="to">to</span><input type="number" step="any" placeholder="max" data-scrfmax="${i}" value="${x.max ?? ""}"><button data-scrfdel="${i}" title="Remove">×</button></div>`; }).join("") : ""}
    <div class="gh">ADD A FILTER</div><div class="scrfadd">${Object.entries(SCR_F).filter(([k]) => !f.flt.some((x) => x.k === k)).map(([k, [l, u]]) => `<button data-scrfadd="${k}">${esc(l)}${u ? ` <em>${u}</em>` : ""}</button>`).join("")}</div>
    <p class="note" style="margin:8px 2px 0">Numbers from Yahoo Finance, updated daily (Chg from live prices). Stocks without the number are left out.</p>
    <div class="ft"><button data-scrfdel="*">Clear</button><button class="pri" data-scrdd="close">Show ${rows.length} stocks</button></div>`;
  const bar = `<div class="scrbar">${scrDropdown("mk", "Market", "All", f.mk.length, mkPop)}${scrDropdown("sec", "Industry", "All", sel.length, secPop)}${scrDropdown("flt", "+ Filter", "", f.flt.length, fltPop).replace('class="scrbtn', 'class="scrbtn add')}
    ${toks.map(([a, l, c]) => `<span class="scrtok${c}">${esc(l)}<button ${a} title="Remove">×</button></span>`).join("")}${toks.length ? `<button class="scrclr" data-scrclr="1">Clear all</button>` : ""}
    <span class="sp"></span><span class="note" style="margin:0">${rows.length} stocks</span></div>`;
  // S2: ready-made screens + your saved ones (one click sets the number filters + sort; Market / Industry stay as they are)
  const presets = [...SCR_PRE, ...scrMine().map((p) => ({ ...p, mine: true }))];
  const preRow = `<div class="scrpre">${presets.map((p) => `<button class="pre${scrSame(p.flt, f.flt) && f.flt.length ? " on" : ""}" data-scrpre="${esc(p.id)}"><b>${esc(p.n)}</b><small>${esc(p.d || p.flt.map(scrTok).join(" · "))}</small>${p.mine ? `<i data-scrpdel="${esc(p.id)}" title="Delete this screen">×</i>` : ""}</button>`).join("")}
    ${ch.scrSaving ? `<span class="pre save"><input id="scrpname" maxlength="30" placeholder="Name this screen" autocomplete="off"><button data-scrpsave="go">Save</button></span>`
      : f.flt.length && !presets.some((p) => scrSame(p.flt, f.flt)) ? `<button class="pre add" data-scrpsave="1"><b>+ Save current</b><small>as my screen</small></button>` : ""}</div>`;
  // columns: the fixed ones + one per number you filter or sort by (P/E, Div yield, ...)
  const extra = [...new Set([...f.flt.map((x) => x.k), ...f.sort].filter((k) => ["pe", "fpe", "dy", "fh", "fl"].includes(k)))];
  const cols = [...SCR_COLS.slice(0, 5), ...extra.map((k) => [k, SCR_F[k][2]]), SCR_COLS[5]];
  const grid = `grid-template-columns:minmax(0,1.6fr) 90px minmax(0,1fr) 88px 80px${extra.map(() => " 78px").join("")} 92px`;
  // column titles sort: ① ② = order; Chg % goes Biggest gain ▼ -> Biggest loss ▲ -> off
  const head = cols.map(([k, l], i) => { const cls = i >= 3 ? "n" : "", x = extra.includes(k) ? " xc" : "";
    if (!k) return `<span class="${cls}">${l.toUpperCase()}</span>`;
    const at = k === "chg" ? f.sort.findIndex((x) => x === "chg" || x === "chgdn") : f.sort.indexOf(k), on = at >= 0;
    const mark = on ? `${f.sort.length > 1 ? `<em>${at + 1}</em>` : ""}${k === "chg" ? (f.sort[at] === "chg" ? "▼" : "▲") : SCR_F[k] && k !== "cap" ? (SCR_F[k][3] > 0 ? "▼" : "▲") : ""}` : "";
    return `<button class="${cls}${x}${on ? " on" : ""}" data-scrsort="${k}" title="${on ? "Click to change or remove" : f.sort.length ? "Click to sort ties by this" : "Sort by this"}">${l.toUpperCase()}${mark}</button>`; }).join("");
  let last = null;
  const body = !ch.hm ? `<div class="chempty">Loading the member lists…</div>` : !all.length ? `<div class="chempty">The member lists arrive with the robot's next daily run.</div>`
    : !shown.length ? `<div class="chempty">No stock matches all your filters${f.flt.some(live) && need.some((s) => !quotes[s]) ? " yet (still loading today's prices)" : ""}. Loosen one of them.</div>`
    : shown.map((m) => { const p = plainOf(m.s), v = chg(m), hd0 = grp ? (f.sort[0] === "sec" ? m.sec : mkName[m.mk]) : null, hd = hd0 && hd0 !== last ? `<div class="g">${esc(hd0)}</div>` : ""; last = hd0;
      return `${hd}<a class="r" href="${chHref(p)}" style="${grid}"><span class="nm">${evLogo({ sym: p }, 24)}<span><b>${esc(m.t)}</b><small>${esc(m.n || "")}</small></span></span><span>${esc(mkName[m.mk])}</span><span class="ind">${esc(m.sec || "—")}</span>
        <span class="n tnum">${quotes[m.s] ? fmtPx(quotes[m.s].price) : "…"}</span><span class="n tnum ${v === null ? "" : v >= 0 ? "up" : "down"}">${v === null ? "…" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`}</span>
        ${extra.map((k) => `<span class="n tnum xc">${scrFmt(k, scrVal(m, k))}</span>`).join("")}<span class="n tnum">${m.cap ? "$" + bigNum(m.cap) : "—"}</span></a>`; }).join("");
  return `${header("charts")}<div class="wrap chp">
    <div class="chlay"><div class="chmain">
      <div class="hmbar"><a class="chback" href="#/charts" title="Charts">‹</a><h1>Stocks by market &amp; industry</h1></div>
      <div class="chc scr">${bar}${preRow}<div class="scrt"><div class="h" style="${grid}">${head}</div>${body}</div>
        <div class="scrb"><span class="note" style="margin:0">${shown.length} of ${rows.length} stocks · click a column title to sort, a 2nd one to break ties · prices refresh every 2 minutes</span>${rows.length > shown.length ? `<button class="scp" data-scrmore="1">Show 50 more</button>` : ""}</div></div>
    </div>${chSide()}</div></div>`;
}
function scrClick(el) {
  const f = scrOf(), ch = chOf();
  const tog = (arr, v) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); };
  if (el.dataset.scrdd) { ch.scrOpen = el.dataset.scrdd === "close" || ch.scrOpen === el.dataset.scrdd ? null : el.dataset.scrdd; return render(false); }
  if (el.dataset.scrclr) { f.mk = []; f.sec = []; f.flt = []; }
  else if (el.dataset.scrfadd) { f.flt.push({ k: el.dataset.scrfadd }); ch.scrOpen = "flt"; ch.scrFocus = f.flt.length - 1; }
  else if (el.dataset.scrfdel) { if (el.dataset.scrfdel === "*") f.flt = []; else f.flt.splice(+el.dataset.scrfdel, 1); }
  else if (el.dataset.scrpdel) { safe(() => localStorage.setItem("ic_scrpre", JSON.stringify(scrMine().filter((p) => p.id !== el.dataset.scrpdel)))); }
  else if (el.dataset.scrpre) {
    const p = [...SCR_PRE, ...scrMine()].find((x) => x.id === el.dataset.scrpre);
    if (p && scrSame(p.flt, f.flt)) f.flt = [];   // click the active screen again = turn it off
    else if (p) { f.flt = p.flt.map((x) => ({ ...x })); f.sort = [...(p.sort || [])]; }
  }
  else if (el.dataset.scrpsave === "1") { ch.scrSaving = true; render(false); return document.getElementById("scrpname")?.focus(); }
  else if (el.dataset.scrpsave === "go") {
    const n = (document.getElementById("scrpname")?.value || "").trim() || `My screen ${scrMine().length + 1}`;
    safe(() => localStorage.setItem("ic_scrpre", JSON.stringify([...scrMine(), { id: "m" + Date.now(), n, flt: f.flt.map((x) => ({ ...x })), sort: [...f.sort] }])));
    ch.scrSaving = false;
  }
  else if (el.dataset.scrmk) { if (el.dataset.scrmk === "*") f.mk = []; else tog(f.mk, el.dataset.scrmk); if (f.mk.length === SCR_MK.length) f.mk = []; }
  else if (el.dataset.scrsec) { if (el.dataset.scrsec === "*") f.sec = []; else tog(f.sec, el.dataset.scrsec); }
  else if (el.dataset.scrsort) {
    const k = el.dataset.scrsort, i = k === "chg" ? f.sort.findIndex((x) => x === "chg" || x === "chgdn") : f.sort.indexOf(k);
    if (i < 0) f.sort.push(k);
    else if (f.sort[i] === "chg") f.sort[i] = "chgdn";   // gain -> loss -> off
    else f.sort.splice(i, 1);
  }
  else if (el.dataset.scrmore) { f.lim = (f.lim || 50) + 50; }
  if (!el.dataset.scrmore) f.lim = 50;
  scrSave(); render(false);
  if (ch.scrFocus !== undefined) { document.querySelector(`[data-scrfmin="${ch.scrFocus}"]`)?.focus(); ch.scrFocus = undefined; }
}
// Close an open filter list when you click anywhere else; the search box filters the list as you type (no redraw)
document.addEventListener("click", (e) => { const ch = chOf(); if (ch.scrOpen && !e.target.closest(".scrdd")) { ch.scrOpen = null; if (location.hash === "#/stocks") render(false); } });
// Filter min / max boxes: applied when you leave the box or press Enter (no redraw while typing)
document.addEventListener("change", (e) => {
  const d = e.target.dataset || {}, i = d.scrfmin ?? d.scrfmax;
  if (i === undefined) return;
  const f = scrOf(), x = f.flt[+i]; if (!x) return;
  const v = e.target.value === "" ? undefined : Number(e.target.value);
  x[d.scrfmin !== undefined ? "min" : "max"] = Number.isFinite(v) ? v : undefined;
  f.lim = 50; scrSave(); render(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.id === "scrpname") { e.preventDefault(); document.querySelector('[data-scrpsave="go"]')?.click(); }
  else if (e.key === "Escape" && chOf().scrSaving) { chOf().scrSaving = false; render(false); }
});
document.addEventListener("input", (e) => {
  if (!e.target.classList?.contains("scrq")) return;
  const q = e.target.value.trim().toLowerCase();
  e.target.parentNode.querySelectorAll(".scrck").forEach((b) => { b.hidden = !!q && !b.textContent.toLowerCase().includes(q); });
});
