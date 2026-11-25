// Compare symbols.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// ----- Compare symbols (round 47): extra lines on the price chart, all measured in % from the first candle on screen -----
const CMP_COL = ["#FF9800", "#2962FF", "#E91E63", "#00BCD4", "#9C27B0"];
const cmpList = () => (kc.cmp ||= safe(() => JSON.parse(localStorage.getItem("ic_cmp") || "[]"), []) || []);
const cmpSave = () => safe(() => localStorage.setItem("ic_cmp", JSON.stringify(cmpList())));
const cmpKey = (ts, timespan) => { const d = new Date(ts); return ["day", "week", "month"].includes(timespan) ? (timespan === "month" ? d.toISOString().slice(0, 7) : d.toISOString().slice(0, 10)) : Math.round(ts / 60000); };
async function kcCmpApply() {   // fetch each compared symbol for the timeframe on screen, line its candles up with ours, draw
  const c = kc.chart; if (!c) return;
  const list = c.getDataList(), per = KC_PERIODS[kc.period ?? 3], [rng, itv, join] = KC_RANGE[per.timespan + per.multiplier] || ["10y", "1d", 1], seq = (kc.cmpSeq = (kc.cmpSeq || 0) + 1);
  const cl = cmpList();
  for (let i = cl.length; i < CMP_COL.length; i++) if (kc.cmpOn?.[i]) { c.removeIndicator("candle_pane", `TV_CMP${i + 1}`); kc.cmpOn[i] = 0; }
  if (!cl.length || !list.length) { if (kc.cmpPct !== undefined) { kc.pct = kc.cmpPct; kc.cmpPct = undefined; kcStyle(); render(false); } return; }
  if (kc.cmpPct === undefined) { kc.cmpPct = kc.pct; kc.pct = true; kc.log = false; kcStyle(); }
  kc.cmpData ||= {};
  for (let i = 0; i < cl.length; i++) {
    const x = cl[i], key = `${x.y}|${rng}|${itv}`;
    if (!kc.cmpData[key]) { const { data } = await sb.rpc("get_candles", { sym: x.y, rng, itv }); if (seq !== kc.cmpSeq) return; kc.cmpData[key] = data || {}; }
    const d = kc.cmpData[key]; let bars = (d.t || []).map((t, j) => ({ timestamp: t * 1000, open: d.o?.[j], high: d.h?.[j], low: d.l?.[j], close: d.c?.[j], volume: d.v?.[j] || 0 })).filter((b) => typeof b.close === "number");
    if (join > 1) bars = kcJoin(bars, join, per.timespan === "month", d.meta?.gmtoffset);
    const m = new Map(bars.map((b) => [cmpKey(b.timestamp, per.timespan), b.close]));
    const closes = list.map((b) => m.get(cmpKey(b.timestamp, per.timespan)) ?? null);
    for (let j = 1; j < closes.length; j++) if (closes[j] === null && closes[j - 1] !== null && ["day", "week", "month"].includes(per.timespan)) closes[j] = closes[j - 1];   // holidays: carry the last close
    const ext = { sym: x.t, color: x.color, closes, base: c.getVisibleRange().from };
    if (kc.cmpOn?.[i]) c.overrideIndicator({ name: `TV_CMP${i + 1}`, extendData: ext }, "candle_pane");
    else { c.createIndicator({ name: `TV_CMP${i + 1}`, extendData: ext, styles: { lines: [LN(x.color, 2)] } }, true, { id: "candle_pane" }); (kc.cmpOn ||= [])[i] = 1; }
  }
  render(false);
}
function kcCmpRebase() {   // the % start point follows the first candle on screen (like TradingView)
  const c = kc.chart; if (!c || !kc.cmpOn?.some(Boolean)) return;
  const from = c.getVisibleRange().from;
  cmpList().forEach((x, i) => { if (!kc.cmpOn[i]) return; const ind = c.getIndicatorByPaneId("candle_pane", `TV_CMP${i + 1}`); const e = ind?.extendData; if (e && e.base !== from) c.overrideIndicator({ name: `TV_CMP${i + 1}`, extendData: { ...e, base: from } }, "candle_pane"); });
}
function kcCompareWindow() {
  const m = kcModal(`<div class="kwh"><b>Compare symbol</b><button class="x" data-k="close">✕</button></div><div class="kws"><input placeholder="Search  e.g. SMH, SPY, AMD, BTC, gold" autofocus></div>
    <div class="kwb cmpw"><div class="cur"></div><div class="res"></div></div><div class="kwf"><span class="note" style="margin:0">Up to ${CMP_COL.length}. The chart switches to % so every line starts at 0% on the left.</span><span class="sp"></span><button class="ok" data-k="close">Done</button></div>`);
  const cur = () => { const cl = cmpList(); m.querySelector(".cur").innerHTML = cl.length ? `<div class="h">ON THE CHART</div>${cl.map((x, i) => `<div class="f"><span><i class="dot" style="background:${x.color}"></i><b>${esc(x.t)}</b> <small>${esc(x.n || "")}</small></span><button class="c" data-rm="${i}">Remove</button></div>`).join("")}` : `<p class="note">Nothing compared yet. Search a symbol above.</p>`; };
  let seq = 0;
  const search = async (q) => {
    const my = ++seq, box = m.querySelector(".res");
    if (!q.trim()) { box.innerHTML = `<div class="h">SUGGESTED</div>${[["SPY", "S&P 500 ETF"], ["QQQ", "Nasdaq 100 ETF"], ["SMH", "Semiconductor ETF"], ["^SET.BK", "SET index"], ["GC=F", "Gold"], ["BTC-USD", "Bitcoin"]].map(([y, n]) => `<button class="li" data-add="${esc(y)}" data-n="${esc(n)}"><b>${esc(plainOf(y))}</b><small>${esc(n)}</small></button>`).join("")}`; return; }
    const { data } = await sb.rpc("search_symbols", { q: q.trim() }); if (my !== seq) return;
    box.innerHTML = (Array.isArray(data) ? data : []).slice(0, 12).map((r) => `<button class="li" data-add="${esc(r.symbol)}" data-n="${esc(cleanName(r.name))}"><b>${esc(plainOf(r.symbol))}</b><small>${esc(cleanName(r.name))} · ${esc(r.exchange)}</small></button>`).join("") || `<p class="note">No match.</p>`;
  };
  cur(); search("");
  m.querySelector("input").addEventListener("input", (e) => { clearTimeout(m._t); m._t = setTimeout(() => search(e.target.value), 250); });
  m.addEventListener("click", (e) => {
    const b = e.target.closest("[data-add],[data-rm],[data-k]"); if (!b) return;
    if (b.dataset.k === "close") { m.remove(); return; }
    const cl = cmpList();
    if (b.dataset.add) { const y = b.dataset.add; if (y === yahoo(kc.sym) || cl.some((x) => x.y === y)) return; if (cl.length >= CMP_COL.length) { toast(`Up to ${CMP_COL.length} symbols`); return; }
      const used = cl.map((x) => x.color); cl.push({ y, t: plainOf(y), n: b.dataset.n || "", color: CMP_COL.find((c) => !used.includes(c)) || CMP_COL[0] }); }
    if (b.dataset.rm !== undefined) { cl.splice(+b.dataset.rm, 1); kc.cmpOn = (kc.cmpOn || []).map(() => 0); CMP_COL.forEach((_, i) => kc.chart?.removeIndicator("candle_pane", `TV_CMP${i + 1}`)); }
    cmpSave(); cur(); kcCmpApply();
  });
}

// "Alert" button (Alt+A): a price alert from the chart, sent to Telegram by the robot (same table as Settings -> Price alerts)
function kcAlertWindow() {
  const c = kc.chart, t = kc.sym; if (!c || !t) return;
  const last = c.getDataList().at(-1)?.close ?? 0;
  const m = kcModal(`<div class="kwh"><b>Create alert on ${esc(t)}</b><button class="x" data-k="close">✕</button></div><div class="kwb">
    <div class="f"><span>Condition</span><span><select data-ak><option value="above">Price goes above</option><option value="below">Price goes below</option><option value="move">Moves ± % in a day</option></select></span></div>
    <div class="f"><span>Value</span><span><input type="number" step="any" data-av value="${last ? Number(last).toFixed(2) : ""}"></span></div>
    <p class="note" style="margin:8px 0 0">Now ${fmtPx(last)}. Checked about every 30 minutes, sent once to Telegram.</p></div>
    <div class="kwf"><span class="sp"></span><button class="c" data-k="close">Cancel</button><button class="ok" data-k="ok">Create</button></div>`);
  m.addEventListener("click", async (e) => {
    const k = e.target.closest("[data-k]")?.dataset.k; if (!k) return;
    if (k === "ok") {
      const kind = m.querySelector("[data-ak]").value, v = Number(m.querySelector("[data-av]").value);
      if (!Number.isFinite(v) || v <= 0) { toast("Type a price above zero"); return; }
      const { error } = await sb.from("price_alerts").insert({ user_id: state.user.id, ticker: t, kind, value: +v.toFixed(4) });
      toast(error ? `Alert not saved: ${esc(error.message)}` : `Alert set: ${esc(t)} ${kind === "move" ? `moves ±${v}%` : `${kind} ${fmtPx(v)}`} (Telegram)`);
      state.alerts = undefined;
    }
    m.remove();
  });
}

