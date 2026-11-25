// Stocks by market & industry page (#/stocks, design round 48 F1): S&P 500 + SET50 members, dropdown filters, sort by column titles.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// Members come from the heat map lists (robot/heatmap.py). Filters combine (several markets x several industries);
// sorts combine too: click a column title, click a 2nd one to break ties, click again to change / remove.
const SCR_MK = [["@SP500", "US · S&P 500"], ["@SET50", "Thailand · SET50"], ["@N225", "Japan · Nikkei 225"], ["@HSI", "Hong Kong · Hang Seng"],
  ["@KS200", "Korea · KOSPI 200"], ["@FTSE", "UK · FTSE 100"], ["@DAX", "Germany · DAX"]];   // same lists as the heat map (HM_IDX)
const SCR_COLS = [["name", "Company"], ["mkt", "Market"], ["sec", "Industry"], [null, "Price"], ["chg", "Chg %"], ["cap", "Mkt cap $"]];
const SEC_FIX = { "Food & Beverages": "Food & Beverage" };   // SET uses both spellings for the same industry
const secOf = (m) => SEC_FIX[m.sec] || m.sec;
const scrOf = () => { const ch = chOf(); return ch.scr || (ch.scr = safe(() => JSON.parse(localStorage.getItem("ic_scr") || "null"), null) || { mk: [], sec: [], sort: ["sec", "chg"], lim: 50 }); };
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
  const sel = f.sec.filter((x) => secs.includes(x)), rows = sel.length ? all.filter((m) => sel.includes(m.sec)) : all;
  const chg = (m) => chPct(m.s), num = (v, dflt) => (v === null || v === undefined || !Number.isFinite(v) ? dflt : v);
  const cmp = { mkt: (a, b) => mkName[a.mk].localeCompare(mkName[b.mk]), sec: (a, b) => String(a.sec).localeCompare(String(b.sec)), chg: (a, b) => num(chg(b), -1e9) - num(chg(a), -1e9),
    chgdn: (a, b) => num(chg(a), 1e9) - num(chg(b), 1e9), cap: (a, b) => (b.cap || 0) - (a.cap || 0), name: (a, b) => String(a.t).localeCompare(String(b.t)) };
  rows.sort((a, b) => { for (const k of f.sort) { const r = cmp[k]?.(a, b) || 0; if (r) return r; } return (b.cap || 0) - (a.cap || 0); });
  const shown = rows.slice(0, f.lim || 50), grp = f.sort[0] === "sec" || f.sort[0] === "mkt";
  // prices: only the rows on screen, or every matching stock when sorting by Chg % (the order needs all of them)
  const need = ch.scrNeed = [...new Set((f.sort.some((k) => k === "chg" || k === "chgdn") ? rows : shown).map((m) => m.s))];
  if (!ch.scrLoading && (!ch.hm || need.some((s) => Date.now() - (ch.scrAsked?.[s] || 0) > 120e3))) setTimeout(() => loadScr(need), 0);
  // filter bar: Market ▾ · Industry ▾ (grouped by market, search box) · chosen ones as tokens
  const mkPop = SCR_MK.map(([k, l]) => scrBox("scrmk", k, f.mk.includes(k), l, (ch.hm?.[k]?.members || []).length)).join("");
  const secPop = `<input class="scrq" placeholder="Search industries…" autocomplete="off"><div class="scrcols">${keys.map((k) => { const c = secCount(k);
      return `<div><div class="gh">${esc(SCR_MK.find((x) => x[0] === k)[1].toUpperCase())}</div>${Object.keys(c).sort().map((s) => scrBox("scrsec", s, sel.includes(s), s, c[s])).join("")}</div>`; }).join("")}</div>
    <div class="ft"><button data-scrsec="*">Clear</button><button class="pri" data-scrdd="close">Show ${rows.length} stocks</button></div>`;
  const toks = [...f.mk.map((k) => [`data-scrmk="${k}"`, SCR_MK.find((x) => x[0] === k)[1]]), ...sel.map((s) => [`data-scrsec="${esc(s)}"`, s])];
  const bar = `<div class="scrbar">${scrDropdown("mk", "Market", "All", f.mk.length, mkPop)}${scrDropdown("sec", "Industry", "All", sel.length, secPop)}
    ${toks.map(([a, l]) => `<span class="scrtok">${esc(l)}<button ${a} title="Remove">×</button></span>`).join("")}${toks.length ? `<button class="scrclr" data-scrclr="1">Clear all</button>` : ""}
    <span class="sp"></span><span class="note" style="margin:0">${rows.length} stocks</span></div>`;
  // column titles sort: ① ② = order; Chg % goes Biggest gain ▼ -> Biggest loss ▲ -> off
  const head = SCR_COLS.map(([k, l], i) => { const cls = i >= 3 ? "n" : "";
    if (!k) return `<span class="${cls}">${l.toUpperCase()}</span>`;
    const at = k === "chg" ? f.sort.findIndex((x) => x === "chg" || x === "chgdn") : f.sort.indexOf(k), on = at >= 0;
    const mark = on ? `${f.sort.length > 1 ? `<em>${at + 1}</em>` : ""}${k === "chg" ? (f.sort[at] === "chg" ? "▼" : "▲") : ""}` : "";
    return `<button class="${cls}${on ? " on" : ""}" data-scrsort="${k}" title="${on ? "Click to change or remove" : f.sort.length ? "Click to sort ties by this" : "Sort by this"}">${l.toUpperCase()}${mark}</button>`; }).join("");
  let last = null;
  const body = !ch.hm ? `<div class="chempty">Loading the member lists…</div>` : !all.length ? `<div class="chempty">The member lists arrive with the robot's next daily run.</div>`
    : shown.map((m) => { const p = plainOf(m.s), v = chg(m), hd0 = grp ? (f.sort[0] === "sec" ? m.sec : mkName[m.mk]) : null, hd = hd0 && hd0 !== last ? `<div class="g">${esc(hd0)}</div>` : ""; last = hd0;
      return `${hd}<a class="r" href="${chHref(p)}"><span class="nm">${evLogo({ sym: p }, 24)}<span><b>${esc(m.t)}</b><small>${esc(m.n || "")}</small></span></span><span>${esc(mkName[m.mk])}</span><span class="ind">${esc(m.sec || "—")}</span>
        <span class="n tnum">${quotes[m.s] ? fmtPx(quotes[m.s].price) : "…"}</span><span class="n tnum ${v === null ? "" : v >= 0 ? "up" : "down"}">${v === null ? "…" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`}</span><span class="n tnum">${m.cap ? "$" + bigNum(m.cap) : "—"}</span></a>`; }).join("");
  return `${header("charts")}<div class="wrap chp">
    <div class="chlay"><div class="chmain">
      <div class="hmbar"><a class="chback" href="#/charts" title="Charts">‹</a><h1>Stocks by market &amp; industry</h1></div>
      <div class="chc scr">${bar}<div class="scrt"><div class="h">${head}</div>${body}</div>
        <div class="scrb"><span class="note" style="margin:0">${shown.length} of ${rows.length} stocks · click a column title to sort, a 2nd one to break ties · prices refresh every 2 minutes</span>${rows.length > shown.length ? `<button class="scp" data-scrmore="1">Show 50 more</button>` : ""}</div></div>
    </div>${chSide()}</div></div>`;
}
function scrClick(el) {
  const f = scrOf(), ch = chOf();
  const tog = (arr, v) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); };
  if (el.dataset.scrdd) { ch.scrOpen = el.dataset.scrdd === "close" || ch.scrOpen === el.dataset.scrdd ? null : el.dataset.scrdd; return render(false); }
  if (el.dataset.scrclr) { f.mk = []; f.sec = []; }
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
}
// Close an open filter list when you click anywhere else; the search box filters the list as you type (no redraw)
document.addEventListener("click", (e) => { const ch = chOf(); if (ch.scrOpen && !e.target.closest(".scrdd")) { ch.scrOpen = null; if (location.hash === "#/stocks") render(false); } });
document.addEventListener("input", (e) => {
  if (!e.target.classList?.contains("scrq")) return;
  const q = e.target.value.trim().toLowerCase();
  e.target.parentNode.querySelectorAll(".scrck").forEach((b) => { b.hidden = !!q && !b.textContent.toLowerCase().includes(q); });
});
