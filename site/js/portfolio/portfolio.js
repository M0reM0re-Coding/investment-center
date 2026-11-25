// Portfolio page (#/portfolio, design rounds 49-50, option P2 "trade ledger").
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// Your Buy / Sell / Dividend / Opening rows live in the "trades" table (supabase/016_portfolio.sql), private to your login.
// Everything else is worked out here, the way a broker statement does it:
//   average cost = weighted average (fees added to cost); a sale doesn't change the average cost of the shares you keep;
//   realised P&L = sale money - fee - average cost x shares sold; dividends = shares x amount per share - tax withheld.
// Each stock's numbers are in its own currency. Totals are converted to THB (or USD) at TODAY's exchange rate,
// so currency gains on old purchases are not shown separately (said on the page).
const PF_FX = ["THB=X", "JPY=X", "HKD=X", "KRW=X", "GBP=X", "EUR=X"];   // units per 1 US dollar (Yahoo)
const PF_KINDS = [["buy", "Buy"], ["sell", "Sell"], ["div", "Dividend"], ["open", "Opening"]];
const pfCurOf = (y) => (/\.BK$/.test(y) ? "THB" : /\.T$/.test(y) ? "JPY" : /\.HK$/.test(y) ? "HKD" : /\.K[SQ]$/.test(y) ? "KRW"
  : /\.L$/.test(y) ? "GBp" : /\.(DE|F|PA|AS|MI|MC)$/.test(y) ? "EUR" : "USD");
const pfMarketOf = (y) => ({ THB: "Thailand", JPY: "Japan", HKD: "Hong Kong", KRW: "Korea", GBp: "UK", EUR: "Europe" })[pfCurOf(y)] || "US";
const PF_SIGN = { THB: "฿", USD: "$", JPY: "¥", HKD: "HK$", KRW: "₩", GBp: "p", EUR: "€" };
const pfShow = () => safe(() => localStorage.getItem("ic_pfcur"), null) === "USD" ? "USD" : "THB";
function pfToShow(v, cur) {   // an amount in a stock's currency -> the display currency (null when a rate is missing)
  if (v === null || !Number.isFinite(v)) return null;
  const rate = (c) => (c === "USD" ? 1 : Number(quotes[c + "=X"]?.price) || null);
  const c = cur === "GBp" ? "GBP" : cur, usd = rate(c) ? (cur === "GBp" ? v / 100 : v) / rate(c) : null;
  if (usd === null) return null;
  return pfShow() === "USD" ? usd : (rate("THB") ? usd * rate("THB") : null);
}
const pfMoney = (v, cur, sign) => {   // 1234.5 -> ฿1,234.50 (no decimals for big numbers)
  if (v === null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v), s = PF_SIGN[cur] || "", txt = a >= 1000 ? Math.round(a).toLocaleString("en-US") : a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "−" : sign && v > 0 ? "+" : ""}${cur === "GBp" ? txt + s : s + txt}`;
};
const pfNum = (v) => Number(v).toLocaleString("en-US", { maximumFractionDigits: 4 });

async function loadTrades() {
  if (!state.user || state.tradesLoading) return;
  state.tradesLoading = true;
  const { data, error } = await sb.from("trades").select("*").order("day").order("created_at");
  state.tradesLoading = false;
  state.tradesErr = error ? (/relation .*trades|does not exist|schema cache/i.test(error.message) ? "setup" : error.message) : null;
  state.trades = data || [];
  pfPrices();
  render(false);
}
// Prices + exchange rates for what you hold (get_quotes, cached 60 s on the server)
async function pfPrices() {
  const syms = [...new Set([...PF_FX, ...(state.trades || []).map((t) => yahoo(t.ticker))])];
  const { data } = await sb.rpc("get_quotes", { syms });
  Object.assign(quotes, data || {});
  if (location.hash === "#/portfolio") render("soft");
}

// The ledger -> holdings. Trades are replayed in date order.
function pfBook(trades) {
  const by = {}, year = String(new Date().getFullYear());
  let realised = 0, divs = 0, sells = 0, divN = 0;   // this year, display currency
  const issues = [];
  for (const t of [...trades].sort((a, b) => (a.day + a.created_at).localeCompare(b.day + b.created_at))) {
    const y = yahoo(t.ticker), cur = pfCurOf(y), h = by[t.ticker] || (by[t.ticker] = { t: t.ticker, y, cur, sh: 0, cost: 0, real: 0, div: 0 });
    const sh = Number(t.shares), px = Number(t.price), fee = Number(t.fee) || 0;
    if (t.kind === "buy" || t.kind === "open") { h.sh += sh; h.cost += sh * px + fee; }
    else if (t.kind === "sell") {
      const take = Math.min(sh, h.sh);
      if (sh > h.sh + 1e-9) issues.push(`${t.ticker} ${t.day}: sold ${pfNum(sh)} but held ${pfNum(h.sh)}`);
      const avg = h.sh ? h.cost / h.sh : 0, gain = take * px - fee - avg * take;
      h.real += gain; h.cost -= avg * take; h.sh -= take;
      if (h.sh < 1e-9) { h.sh = 0; h.cost = 0; }
      if (t.day.startsWith(year)) { realised += pfToShow(gain, cur) || 0; sells++; }
    } else if (t.kind === "div") {
      const amt = sh * px - fee; h.div += amt;
      if (t.day.startsWith(year)) { divs += pfToShow(amt, cur) || 0; divN++; }
    }
  }
  const hold = Object.values(by).filter((h) => h.sh > 0).map((h) => {
    const q = quotes[h.y], px = q ? Number(q.price) : null, value = px === null ? null : px * h.sh;
    return { ...h, avg: h.cost / h.sh, px, value, pl: value === null ? null : value - h.cost, plPct: value === null || !h.cost ? null : ((value - h.cost) / h.cost) * 100,
      vShow: pfToShow(value, h.cur), cShow: pfToShow(h.cost, h.cur), day: q && q.prev ? pfToShow((px - Number(q.prev)) * h.sh, h.cur) : null };
  });
  const total = hold.reduce((s, h) => s + (h.vShow || 0), 0), cost = hold.reduce((s, h) => s + (h.vShow === null ? 0 : h.cShow || 0), 0);
  hold.forEach((h) => { h.w = total && h.vShow !== null ? (h.vShow / total) * 100 : null; });
  hold.sort((a, b) => (b.vShow || 0) - (a.vShow || 0));
  return { hold, total, cost, realised, divs, sells, divN, issues, year, missing: hold.filter((h) => h.vShow === null).map((h) => h.t) };
}
// What you own right now (World Brief badges, weekly card): ticker -> weight %
function pfOwned() {
  if (!state.trades?.length) return {};
  return Object.fromEntries(pfBook(state.trades).hold.map((h) => [h.t, h.w]));
}

// Your whole portfolio's value in one currency (position tool "Account size", round 49 T1). null = no holdings / no rates.
function pfValueIn(cur) {
  if (!state.trades?.length) return null;
  const rate = (c) => (c === "USD" ? 1 : Number(quotes[c + "=X"]?.price) || null);
  let usd = 0;
  for (const h of pfBook(state.trades).hold) {
    if (h.value === null) continue;
    const c = h.cur === "GBp" ? "GBP" : h.cur, r = rate(c); if (!r) return null;
    usd += (h.cur === "GBp" ? h.value / 100 : h.value) / r;
  }
  const c = cur === "GBp" ? "GBP" : cur, r = rate(c);
  return r ? usd * r * (cur === "GBp" ? 100 : 1) : null;
}
// The button under "Account size" in the Long / Short position settings
function pfAcctBtn() {
  const cur = pfCurOf(yahoo(kc.sym || "")), v = pfValueIn(cur);
  return v ? `<div class="f"><span></span><span><button type="button" class="pfuse" data-pfacct="${Math.round(v)}">Use my Portfolio value (${pfMoney(v, cur)})</button></span></div>` : "";
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-pfacct]"); if (!b) return;
  const inp = b.closest(".f")?.previousElementSibling?.querySelector('[data-n="acct"]'); if (!inp) return;
  inp.value = b.dataset.pfacct; inp.dispatchEvent(new Event("input", { bubbles: true }));
});

// ----- the page -----
const PF_COLS = ["#ff4500", "#3b82f6", "#16a34a", "#f59e0b", "#8b5cf6", "#06b6d4", "#e11d48", "#84cc16", "#a855f7", "#64748b"];
function pfBars(title, parts) {   // one stacked bar + legend; parts = [[label, weight %], ...]
  const top = parts.filter((p) => p[1] > 0).sort((a, b) => b[1] - a[1]);
  const shown = top.length > 8 ? [...top.slice(0, 7), ["Other", top.slice(7).reduce((s, p) => s + p[1], 0)]] : top;
  return `<div class="pfbar"><div class="gh">${title}</div><div class="bar">${shown.map((p, i) => `<i style="width:${p[1].toFixed(2)}%;background:${PF_COLS[i % PF_COLS.length]}" title="${esc(p[0])} ${p[1].toFixed(1)}%"></i>`).join("")}</div>
    <div class="leg">${shown.map((p, i) => `<span><i style="background:${PF_COLS[i % PF_COLS.length]}"></i>${esc(p[0])} ${p[1].toFixed(1)}%</span>`).join("")}</div></div>`;
}
function pfIndustry(y) {   // from the index member lists (Stocks page); "Other" when the stock isn't in one
  const hm = chOf().hm; if (!hm) return null;
  for (const k of Object.keys(hm)) { const m = (hm[k]?.members || []).find((x) => x.s === y); if (m?.sec) return typeof secOf === "function" ? secOf(m) : m.sec; }
  return "Other";
}
function viewPortfolio() {
  if (state.trades === undefined || state.trades === null) { if (!state.tradesLoading) setTimeout(loadTrades, 0); }
  if (!chOf().hm && !chOf().scrLoading && !chOf().pfHmAsked) { chOf().pfHmAsked = true; setTimeout(() => loadScr().then(() => { if (location.hash === "#/portfolio") render("soft"); }), 0); }
  const show = pfShow(), S = show === "USD" ? "USD" : "THB";
  const head = `<div class="pfhead"><h1>Portfolio</h1><span class="note" style="margin:0">Prices from the live feed${quotes["THB=X"] ? ` · USD/THB ${Number(quotes["THB=X"].price).toFixed(2)}` : ""}</span><span class="sp"></span>
    <div class="pfseg">${["THB", "USD"].map((c) => `<button class="${c === show ? "on" : ""}" data-pfcur="${c}">${c}</button>`).join("")}</div>
    <button class="btn pri" data-pfadd="1">+ Add trade</button></div>`;
  let body;
  if (state.tradesErr === "setup") body = `<div class="chc pfempty"><h2>One step left</h2><p>Run <b>supabase/016_portfolio.sql</b> once in Supabase → SQL Editor, then reload this page.</p></div>`;
  else if (state.tradesErr) body = `<div class="chc pfempty"><h2>Couldn't load your trades</h2><p>${esc(state.tradesErr)}</p></div>`;
  else if (!state.trades) body = `<div class="chc pfempty"><p>Loading your trades…</p></div>`;
  else if (!state.trades.length) body = `<div class="chc pfempty"><h2>No trades yet</h2><p>Start with what you own today: press <b>+ Add trade</b> → <b>Opening</b>, one row per stock (shares + your average cost).
      Then record each Buy, Sell and Dividend as it happens. Only you can see these rows.</p><button class="btn pri" data-pfadd="1">+ Add trade</button></div>`;
  else {
    const b = pfBook(state.trades), plPct = b.cost ? ((b.total - b.cost) / b.cost) * 100 : null, dayTot = b.hold.reduce((s, h) => s + (h.day || 0), 0);
    const tile = (t, v, sub, cls) => `<div class="chc pftile"><small>${t}</small><b class="tnum ${cls || ""}">${v}</b><span class="${cls && /up|down/.test(cls) ? cls : "note"}">${sub}</span></div>`;
    const dir = (v) => (v > 0 ? "up" : v < 0 ? "down" : "");
    const tiles = `<div class="pftiles">${tile("VALUE", pfMoney(b.total, S), `${b.hold.length} holding${b.hold.length === 1 ? "" : "s"} · today ${pfMoney(dayTot, S, true)}`)}
      ${tile("UNREALISED P&amp;L", pfMoney(b.total - b.cost, S, true), plPct === null ? "" : `${plPct >= 0 ? "+" : "−"}${Math.abs(plPct).toFixed(2)}% on cost ${pfMoney(b.cost, S)}`, dir(b.total - b.cost))}
      ${tile(`REALISED P&amp;L · ${b.year}`, pfMoney(b.realised, S, true), `${b.sells} sale${b.sells === 1 ? "" : "s"}`, dir(b.realised))}
      ${tile(`DIVIDENDS · ${b.year}`, pfMoney(b.divs, S), `${b.divN} payment${b.divN === 1 ? "" : "s"}${b.cost ? ` · ${((b.divs / b.cost) * 100).toFixed(1)}% of cost` : ""}`)}</div>`;
    const rows = b.hold.map((h) => `<a class="r" href="${chHref(h.t)}"><span class="nm">${evLogo({ sym: h.t }, 26)}<span><b>${esc(h.t)}</b><small>${esc(cleanName(quotes[h.y]?.name || ""))} · ${pfMarketOf(h.y)}</small></span></span>
      <span class="n tnum">${pfNum(h.sh)}</span><span class="n tnum">${pfMoney(h.avg, h.cur)}</span><span class="n tnum">${h.px === null ? "…" : pfMoney(h.px, h.cur)}</span>
      <span class="n tnum">${pfMoney(h.vShow, S)}</span><span class="n tnum ${dir(h.pl)}">${h.plPct === null ? "…" : `${pfMoney(pfToShow(h.pl, h.cur), S, true)}<small>${h.plPct >= 0 ? "+" : "−"}${Math.abs(h.plPct).toFixed(1)}%</small>`}</span>
      <span class="n tnum">${h.w === null ? "—" : h.w.toFixed(1) + "%"}</span></a>`).join("");
    const holdings = `<div class="chc pft pfhold"><div class="mh"><h2>Holdings</h2></div><div class="h"><span>STOCK</span><span class="n">SHARES</span><span class="n">AVG COST</span><span class="n">PRICE</span><span class="n">VALUE (${PF_SIGN[S]})</span><span class="n">P&amp;L</span><span class="n">WEIGHT</span></div>
      ${rows || `<p class="note" style="margin:12px 16px">You sold everything. Realised P&amp;L and dividends stay in the tiles above.</p>`}</div>`;
    const sum = (f) => { const o = {}; b.hold.forEach((h) => { if (h.w !== null) { const k = f(h); o[k] = (o[k] || 0) + h.w; } }); return Object.entries(o); };
    const alloc = `<div class="chc pfalloc">${pfBars("ALLOCATION", b.hold.filter((h) => h.w !== null).map((h) => [h.t, h.w]))}${pfBars("BY MARKET", sum((h) => pfMarketOf(h.y)))}
      ${chOf().hm ? pfBars("BY INDUSTRY", sum((h) => pfIndustry(h.y) || "Other")) : `<div class="pfbar"><div class="gh">BY INDUSTRY</div><p class="note" style="margin:4px 0">Loading industries…</p></div>`}</div>`;
    const kindTag = (k) => `<span class="pftag ${k}">${{ buy: "BUY", sell: "SELL", div: "DIV", open: "OPEN" }[k]}</span>`;
    // realised per sale (replayed again so each Sell row can show its own result)
    const realOf = {}; { const run = {}; [...state.trades].sort((a, c) => (a.day + a.created_at).localeCompare(c.day + c.created_at)).forEach((t) => { const h = run[t.ticker] || (run[t.ticker] = { sh: 0, cost: 0 }), sh = +t.shares, px = +t.price, fee = +t.fee || 0;
      if (t.kind === "buy" || t.kind === "open") { h.sh += sh; h.cost += sh * px + fee; } else if (t.kind === "sell") { const take = Math.min(sh, h.sh), avg = h.sh ? h.cost / h.sh : 0; realOf[t.id] = take * px - fee - avg * take; h.cost -= avg * take; h.sh -= take; } else if (t.kind === "div") realOf[t.id] = sh * px - fee; }); }
    const del = state.pfDel;
    const tx = [...state.trades].reverse().slice(0, state.pfTxLim || 30).map((t) => { const cur = pfCurOf(yahoo(t.ticker)), r = realOf[t.id];
      return `<div class="r" data-pfedit="${t.id}" title="Click to edit"><span>${esc(fmtDayShort(t.day))}</span><span>${kindTag(t.kind)}</span><span><b>${esc(t.ticker)}</b></span><span class="n tnum">${pfNum(t.shares)}</span>
        <span class="n tnum">${pfMoney(+t.price, cur)}</span><span class="n tnum">${+t.fee ? pfMoney(+t.fee, cur) : "—"}</span><span class="n tnum ${t.kind === "sell" ? dir(r) : ""}">${r === undefined ? "—" : pfMoney(r, cur, t.kind === "sell")}</span>
        <span class="n"><button class="pfx${del === t.id ? " sure" : ""}" data-pfdel="${t.id}" title="Delete this row">${del === t.id ? "Delete?" : "×"}</button></span></div>`; }).join("");
    const ledger = `<div class="chc pft pftx"><div class="mh"><h2>Trades</h2><span class="note" style="margin:0">Buy · Sell · Dividend · Opening balance · click a row to edit</span></div>
      <div class="h"><span>DATE</span><span>TYPE</span><span>STOCK</span><span class="n">SHARES</span><span class="n">PRICE</span><span class="n">FEE / TAX</span><span class="n">REALISED</span><span></span></div>${tx}
      ${state.trades.length > (state.pfTxLim || 30) ? `<div style="text-align:center;padding:10px"><button class="btn ghost" data-pftxmore="1">Show more</button></div>` : ""}</div>`;
    const warn = [...b.issues.map((x) => `Check ${esc(x)}.`), ...(b.missing.length ? [`No price yet for ${esc(b.missing.join(", "))} (left out of the totals).`] : [])];
    body = `${tiles}${warn.length ? `<p class="pfwarn">${warn.join(" ")}</p>` : ""}<div class="pfgrid">${holdings}${alloc}</div>${ledger}
      <p class="note">Average cost = weighted average, fees included (the way Thai brokers show it). Totals use today's exchange rates, so currency gains on older purchases are not split out. Tax on sales is not tracked.</p>`;
  }
  return `${header("portfolio")}<div class="wrap chp pfp">${head}${body}</div>${state.pfWin ? pfWindow() : ""}`;
}
const fmtDayShort = (d) => { const x = new Date(d + "T00:00:00"); return isNaN(x) ? d : x.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: x.getFullYear() === new Date().getFullYear() ? undefined : "2-digit" }); };

// ----- Add / edit trade window -----
function pfWindow() {
  const w = state.pfWin, y = w.ticker ? yahoo(w.ticker) : "", cur = y ? pfCurOf(y) : "", held = w.ticker && state.trades ? (pfBook(state.trades.filter((t) => t.id !== w.id)).hold.find((h) => h.t === w.ticker)) : null;
  const sh = parseFloat(w.shares), px = parseFloat(w.price), fee = parseFloat(w.fee) || 0;
  let hint = "";
  if (w.kind === "buy" && held && sh > 0 && px >= 0) hint = `New average cost: ${pfMoney((held.cost + sh * px + fee) / (held.sh + sh), cur)}`;
  else if (w.kind === "sell" && held && sh > 0 && px >= 0) hint = sh > held.sh + 1e-9 ? `You hold only ${pfNum(held.sh)} shares` : `Realised: ${pfMoney(sh * px - fee - held.avg * sh, cur, true)} (average cost ${pfMoney(held.avg, cur)})`;
  else if (w.kind === "div" && sh > 0 && px >= 0) hint = `Received: ${pfMoney(sh * px - fee, cur)}`;
  else if (w.kind === "sell" && w.ticker && !held) hint = `You don't hold ${esc(w.ticker)} on that date's ledger`;
  const label = { buy: ["Shares bought", "Price per share", "Broker fee"], sell: ["Shares sold", "Price per share", "Broker fee"], div: ["Shares held", "Dividend per share", "Tax withheld"], open: ["Shares you own", "Your average cost", "Fee (optional)"] }[w.kind];
  const picks = [...new Set([...(state.trades || []).map((t) => t.ticker), ...(state.settings.watchlist || [])])].slice(0, 10);
  return `<div class="pfmask" data-pfclose="1"></div><div class="pfwin" role="dialog" aria-label="${w.id ? "Edit trade" : "Add trade"}">
    <div class="wh"><b>${w.id ? "Edit trade" : "Add trade"}</b><button class="x" data-pfclose="1" aria-label="Close">×</button></div>
    <div class="pfseg wide">${PF_KINDS.map(([k, l]) => `<button class="${k === w.kind ? "on" : ""}" data-pfkind="${k}">${l}</button>`).join("")}</div>
    <label class="f"><span>Stock</span><span class="pfsym"><input id="pfsym" value="${esc(w.ticker || "")}" placeholder="Type a ticker or name, e.g. PTT, NVDA" autocomplete="off" maxlength="20"><div id="pfres" class="chres" hidden></div></span></label>
    ${picks.length && !w.id ? `<div class="pfpicks">${picks.map((t) => `<button class="${t === w.ticker ? "on" : ""}" data-pfpick="${esc(t)}">${esc(t)}</button>`).join("")}</div>` : ""}
    <label class="f"><span>Date</span><input type="date" data-pff="day" value="${esc(w.day)}" max="${isoDay(new Date())}"></label>
    <label class="f"><span>${label[0]}</span><input type="number" min="0" step="any" data-pff="shares" value="${esc(w.shares)}"></label>
    <label class="f"><span>${label[1]}${cur ? ` <em>(${cur === "GBp" ? "pence" : cur})</em>` : ""}</span><input type="number" min="0" step="any" data-pff="price" value="${esc(w.price)}"></label>
    <label class="f"><span>${label[2]}</span><input type="number" min="0" step="any" data-pff="fee" value="${esc(w.fee)}"></label>
    <p class="pfhint">${hint}</p>${w.err ? `<p class="pferr">${esc(w.err)}</p>` : ""}
    <div class="wf"><button class="btn ghost" data-pfclose="1">Cancel</button><button class="btn pri" data-pfsave="1"${w.saving ? " disabled" : ""}>${w.saving ? "Saving…" : "Save"}</button></div></div>`;
}
function pfOpen(t) {
  state.pfWin = t ? { id: t.id, kind: t.kind, ticker: t.ticker, day: t.day, shares: String(t.shares), price: String(t.price), fee: String(t.fee || "") }
    : { kind: state.trades?.length ? "buy" : "open", ticker: "", day: isoDay(new Date()), shares: "", price: "", fee: "" };
  render(false);
}
function pfSetTicker(t) {
  const w = state.pfWin; if (!w) return;
  w.ticker = t; const y = yahoo(t);
  const fill = () => { if (state.pfWin === w && !w.price && quotes[y] && w.kind !== "div") w.price = String(quotes[y].price); render(false); };
  if (quotes[y]) fill(); else sb.rpc("get_quotes", { syms: [y] }).then(({ data }) => { Object.assign(quotes, data || {}); fill(); });
}
async function pfSave() {
  const w = state.pfWin, sh = parseFloat(w.shares), px = parseFloat(w.price), fee = parseFloat(w.fee) || 0;
  w.err = !w.ticker ? "Pick a stock first." : !(sh > 0) ? "Shares must be more than 0." : !(px >= 0) || w.price === "" ? "Enter a price." : !w.day ? "Pick a date." : null;
  if (w.err) return render(false);
  const row = { kind: w.kind, ticker: w.ticker.toUpperCase(), day: w.day, shares: sh, price: px, fee };
  w.saving = true; render(false);
  const { error } = w.id ? await sb.from("trades").update(row).eq("id", w.id) : await sb.from("trades").insert(row);
  w.saving = false;
  if (error) { w.err = /trades/.test(error.message) && /exist|schema/.test(error.message) ? "Run supabase/016_portfolio.sql in Supabase first." : error.message; return render(false); }
  state.pfWin = null; state.trades = null; loadTrades();
}
let pfSeq = 0;
async function pfSearch(q) {
  const seq = ++pfSeq, box = document.getElementById("pfres");
  if (!box) return;
  if (!q.trim()) { box.hidden = true; return; }
  box.hidden = false; box.innerHTML = `<div class="chr dim">Searching…</div>`;
  const { data } = await sb.rpc("search_symbols", { q: q.trim() });
  if (seq !== pfSeq || !document.getElementById("pfres")) return;
  const list = (Array.isArray(data) ? data : []).filter((r) => !/=|\^/.test(r.symbol));
  document.getElementById("pfres").innerHTML = list.length
    ? list.slice(0, 8).map((r) => `<button class="chr" data-pfpick="${esc(plainOf(r.symbol))}"><b>${esc(plainOf(r.symbol))}</b><small>${esc(cleanName(r.name))}</small><em>${esc(r.exchange)}</em></button>`).join("")
    : `<div class="chr dim">No match. Try the company name or its ticker.</div>`;
}

document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-pfadd],[data-pfclose],[data-pfkind],[data-pfpick],[data-pfsave],[data-pfedit],[data-pfdel],[data-pfcur],[data-pftxmore]");
  if (!el || !app.contains(el)) { if (state.pfDel && location.hash === "#/portfolio") { state.pfDel = null; render(false); } return; }
  const d = el.dataset;
  if (d.pfdel) { e.preventDefault(); e.stopPropagation();
    if (state.pfDel !== d.pfdel) { state.pfDel = d.pfdel; return render(false); }
    state.pfDel = null; const { error } = await sb.from("trades").delete().eq("id", d.pfdel);
    if (error) toast(`Couldn't delete: ${esc(error.message)}`); state.trades = null; return loadTrades(); }
  if (state.pfDel) state.pfDel = null;
  if (d.pfadd) pfOpen();
  else if (d.pfclose) { state.pfWin = null; render(false); }
  else if (d.pfkind) { state.pfWin.kind = d.pfkind; state.pfWin.err = null; render(false); }
  else if (d.pfpick) pfSetTicker(d.pfpick);
  else if (d.pfsave) pfSave();
  else if (d.pfedit) { const t = (state.trades || []).find((x) => x.id === d.pfedit); if (t) pfOpen(t); }
  else if (d.pfcur) { safe(() => localStorage.setItem("ic_pfcur", d.pfcur)); render(false); }
  else if (d.pftxmore) { state.pfTxLim = (state.pfTxLim || 30) + 30; render(false); }
});
document.addEventListener("input", (e) => {
  const w = state.pfWin; if (!w) return;
  if (e.target.id === "pfsym") { const v = e.target.value.toUpperCase().trim(); clearTimeout(pfSearch.t); pfSearch.t = setTimeout(() => pfSearch(v), 250); w.ticker = ""; return; }
  const f = e.target.dataset?.pff; if (!f) return;
  w[f] = e.target.value; w.err = null;
  const hint = app.querySelector(".pfhint"), tmp = document.createElement("div");   // update the hint line only (no redraw, keeps the cursor)
  tmp.innerHTML = pfWindow(); const nh = tmp.querySelector(".pfhint"); if (hint && nh) hint.innerHTML = nh.innerHTML;
});
document.addEventListener("keydown", (e) => {
  if (!state.pfWin) return;
  if (e.key === "Escape") { state.pfWin = null; render(false); }
  else if (e.key === "Enter" && e.target.id === "pfsym") { e.preventDefault(); const v = e.target.value.toUpperCase().trim(); const first = document.querySelector("#pfres [data-pfpick]"); pfSetTicker(first ? first.dataset.pfpick : v); }
});
