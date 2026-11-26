// BOT mode: PAPER trading bots (pretend money). Up to 8 bots, each with its own rules and its own pretend $100k:
// backtest on past candles -> paper account that keeps trading from the moment you press START. Never places real
// orders: there is no broker connection. (Round 56: many bots, long + short, forex: spread, swap, sessions, news pause.)
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// How "24/7" works: each paper account is a REPLAY. Starting from the moment you pressed START, the same rules are run
// over every candle that has closed since. So your browser (while open) and the robot (robot/pro_bot.py, every ~30 min,
// day and night, Telegram message on each new paper trade) always get the same trades without sharing any state.
// Saved: theses row "#BOT" = { bots: [...], sigLog: [...], sigT: {...} } (or on this device until supabase/017_pro.sql).
// Fills: a signal on a candle's close is filled at the NEXT candle's open. Stop-loss / take-profit fill at their price
// inside a candle (or at the open if the price jumped past it). Fee (or forex spread) on each side.
// SHORT = sell first, buy back later: the bot gains when the price falls. Leverage 1 = no borrowed money.
const BOT_MAX = 8;
const BOT_BASE = { rsiN: 14, rsiLo: 30, rsiHi: 70, brk: 20, fast: 20, slow: 50, trendOn: true, trendN: 200, ideasOn: false, ideasMin: 55, stop: 8, take: 0, trail: 12,
  exitCross: true, maExitOn: false, maExitN: 50, rsiExitOn: false, size: 25, maxPos: 4, cash: 100000, fee: 0.1, side: "long", session: "all", news: 0, lev: 1, swap: false };
const BOT_PRESETS = {
  trend: { name: "Trend stocks", market: "stocks", syms: ["NVDA", "AMD", "TSM", "GOOGL"], itv: "1d", trig: "cross" },
  dip: { name: "Quality dip-buyer", market: "stocks", syms: ["NVDA", "AMD", "TSM", "GOOGL"], itv: "1d", trig: "rsi", ideasOn: true, ideasMin: 60, stop: 10, take: 15, trail: 0, exitCross: false, rsiExitOn: true },
  thai: { name: "Thai stocks (SET)", market: "stocks", syms: ["PTT", "SCB", "CPALL", "AOT", "ADVANC"], itv: "1d", trig: "cross", fee: 0.17 },
  crypto: { name: "Crypto 24/7", market: "crypto", syms: ["BTC-USD", "ETH-USD", "SOL-USD"], itv: "60m", trig: "breakout", brk: 48, stop: 4, trail: 5, exitCross: false, maExitOn: true, size: 30, maxPos: 3, side: "both" },
  fxtrend: { name: "Forex trend", market: "forex", syms: ["THB=X", "EURUSD=X", "JPY=X", "GBPUSD=X"], itv: "4h", trig: "cross", stop: 1.5, trail: 2, size: 25, fee: 0.005, side: "both", session: "lnny", news: 30, swap: true },
  fxcarry: { name: "Forex carry", market: "forex", syms: ["JPY=X", "AUDJPY=X", "THB=X", "EURUSD=X"], itv: "1d", trig: "always", trendN: 100, stop: 3, trail: 4, exitCross: false, size: 25, fee: 0.005, side: "carry", swap: true },
  gold: { name: "Gold swing", market: "gold", syms: ["GC=F"], itv: "1d", trig: "breakout", stop: 5, trail: 7, exitCross: false, maExitOn: true, size: 50, maxPos: 1, fee: 0.05 } };
const BOT_TRIG = [["cross", "Fast average crosses slow average"], ["rsi", "RSI turns back from oversold / overbought"], ["breakout", "Close beyond the highest / lowest close of the last N candles"], ["always", "Any time the filters below are true"]];
const BOT_SIDE = [["long", "Long only (buy, sell later)"], ["both", "Long + short"], ["short", "Short only"], ["carry", "Carry direction only (forex: the side that earns interest)"]];
const BOT_SESS = [["all", "Any time"], ["asia", "Asia (Tokyo) 00-09 UTC"], ["london", "London 07-16 UTC"], ["ny", "New York 12-21 UTC"], ["lnny", "London + New York 07-21 UTC"]];
const BOT_SESS_H = { asia: [0, 9], london: [7, 16], ny: [12, 21], lnny: [7, 21] };
const botMk = (k) => ({ ...BOT_BASE, ...BOT_PRESETS[k], id: "b" + Date.now().toString(36) + Math.floor(Math.random() * 1e3), paper: null, scores: {}, tpl: k });
const botS = { data: null, cfg: null, loaded: false, db: false, del: null };
function botLoad(d) {   // older saves (round 54-55) held ONE bot: move it into the list
  if (!d) d = { bots: [{ ...BOT_BASE, ...BOT_PRESETS.trend, id: "b1", paper: null, scores: {}, tpl: "trend" }] };
  if (!Array.isArray(d.bots)) { const { sigLog, ...one } = d; d = { bots: [{ ...BOT_BASE, ...one, id: "b1" }], sigLog: sigLog || [] }; }
  d.bots = d.bots.map((b) => ({ ...BOT_BASE, ...b }));
  d.sigLog = d.sigLog || []; d.sigT = { buy: 60, buyMin: 50, short: 38, shortIdeas: 45, shortTech: 40, cBuy: 65, cShort: 30, ...(d.sigT || {}) };
  return d;
}
function botCfg() {
  if (botS.data) { botS.cfg = botS.data.bots.find((b) => b.id === proStore("ic_pro_botcur", "")) || botS.data.bots[0]; return botS.cfg; }
  if (!botS.loaded) { botS.loaded = true;
    sb.from("theses").select("data").eq("ticker", "#BOT").maybeSingle().then(({ data, error }) => {
      botS.db = !error; botS.data = botLoad((!error && data?.data) || safe(() => JSON.parse(localStorage.getItem("ic_pro_bot")), null)); proRefresh(); });
  }
  return null;
}
let botT = 0;
function botSave() {
  clearTimeout(botT); botT = setTimeout(async () => {
    safe(() => localStorage.setItem("ic_pro_bot", JSON.stringify(botS.data)));
    if (botS.db) { const { error } = await sb.from("theses").upsert({ user_id: state.user.id, ticker: "#BOT", data: botS.data, updated_at: new Date().toISOString() }, { onConflict: "user_id,ticker" }); if (error) toast(`Bots not saved online: ${esc(error.message)}`); }
  }, 400);
}
// candles: hourly bots 6 months, 4-hour bots = 1 year of hourly candles joined in 4s, daily bots 2 years
const botRng = (c) => (c.itv === "60m" ? "6mo" : c.itv === "4h" ? "1y" : "2y");
const botItv = (c) => (c.itv === "4h" ? "60m" : c.itv);
function botJoin(d, sec) {   // join candles into sec-long buckets (UTC): hourly -> 4-hour
  if (!d?.t) return d; const o = { t: [], o: [], h: [], l: [], c: [] };
  d.t.forEach((ts, i) => { if (![d.o, d.h, d.l, d.c].every((a) => typeof a?.[i] === "number")) return; const b = Math.floor(ts / sec) * sec, k = o.t.length - 1;
    if (k >= 0 && o.t[k] === b) { o.h[k] = Math.max(o.h[k], d.h[i]); o.l[k] = Math.min(o.l[k], d.l[i]); o.c[k] = d.c[i]; }
    else { o.t.push(b); o.o.push(d.o[i]); o.h.push(d.h[i]); o.l.push(d.l[i]); o.c.push(d.c[i]); } });
  return o;
}
const botSym = (c, t) => (c.market === "stocks" ? yahoo(t) : t);
function botData(c) {   // {data, ys, got}
  const data = {}, ys = c.syms.map((t) => botSym(c, t)); let got = 0;
  ys.forEach((y) => { const d = proCandles(y, botRng(c), botItv(c)); if (d) { data[y] = c.itv === "4h" ? botJoin(d, 14400) : d; got++; } });
  return { data, ys, got };
}

// ----- indicators
const bSma = (c, n) => { const o = Array(c.length).fill(null); let s = 0; for (let i = 0; i < c.length; i++) { s += c[i]; if (i >= n) s -= c[i - n]; if (i >= n - 1) o[i] = s / n; } return o; };
function bRsi(c, n) {
  const o = Array(c.length).fill(null); let g = 0, l = 0;
  for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1], up = Math.max(0, d), dn = Math.max(0, -d);
    if (i <= n) { g += up / n; l += dn / n; if (i === n) o[i] = l ? 100 - 100 / (1 + g / l) : 100; }
    else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; o[i] = l ? 100 - 100 / (1 + g / l) : 100; } }
  return o;
}
// ----- the engine (same rules as robot/pro_bot.py, kept identical). data: {SYM: {t,o,h,l,c}} · from: unix seconds
// cfg.rates = {SYM: yearly interest you EARN holding it long, %} (forex swap; short = the opposite)
// cfg.newsT = {SYM: [unix seconds of high-impact events for that pair's currencies]}
function botRun(cfg, data, from = 0) {
  const S = {};
  for (const y of cfg.syms) { const d = data[y]; if (!d?.t?.length) continue;
    const idx = d.t.map((_, i) => i).filter((i) => [d.o, d.h, d.l, d.c].every((a) => typeof a?.[i] === "number"));
    const k = (a) => idx.map((i) => a[i]), c = k(d.c);
    S[y] = { t: k(d.t), o: k(d.o), h: k(d.h), l: k(d.l), c, f: bSma(c, cfg.fast), s: bSma(c, cfg.slow), tr: bSma(c, cfg.trendN), mx: bSma(c, cfg.maExitN), r: bRsi(c, cfg.rsiN), at: new Map(k(d.t).map((t, j) => [t, j])) }; }
  const ys = Object.keys(S), times = [...new Set(ys.flatMap((y) => S[y].t))].sort((a, b) => a - b).filter((t) => t >= from);
  let cash = cfg.cash; const pos = {}, pend = {}, trades = [], eq = [], last = {}, fee = (cfg.fee || 0) / 100, lev = Math.max(1, cfg.lev || 1);
  const rates = cfg.rates || {}, news = cfg.newsT || {}, sess = BOT_SESS_H[cfg.session], intraday = cfg.itv !== "1d";
  const ideasOk = (y, dir) => !cfg.ideasOn || cfg.market !== "stocks" || (dir > 0 ? (cfg.scores?.[y] ?? -1) >= cfg.ideasMin : (cfg.scores?.[y] ?? 101) <= 100 - cfg.ideasMin);
  const sideOk = (y, dir) => cfg.side === "both" || (cfg.side === "long" && dir > 0) || (cfg.side === "short" && dir < 0) || (cfg.side === "carry" && (rates[y] || 0) * dir > 0);
  const value = () => cash + Object.entries(pos).reduce((a, [y, p]) => a + p.dir * p.q * (last[y] ?? p.px), 0);
  const allowed = (y, t) => { if (intraday && sess) { const h = Math.floor((t % 86400) / 3600); if (h < sess[0] || h >= sess[1]) return false; }
    if (cfg.news > 0) { const w = cfg.news * 60; if ((news[y] || []).some((e) => e >= t - w && e <= t + w)) return false; } return true; };
  const close = (y, px, t, why) => { const p = pos[y];
    if (p.dir > 0) cash += p.q * px * (1 - fee); else cash -= p.q * px * (1 + fee);
    const pnl = p.dir > 0 ? (px * (1 - fee)) / (p.px * (1 + fee)) - 1 : (p.px * (1 - fee) - px * (1 + fee)) / p.px;
    trades.push({ y, side: p.dir > 0 ? "SELL" : "COVER", t, px, q: p.q, why, pnl, held: t - p.t, swap: p.sw }); delete pos[y]; };
  for (const t of times) {
    for (const y of ys) {
      const D = S[y], i = D.at.get(t); if (i === undefined) continue;
      // 1) orders from the last close, filled at this open
      const pd = pend[y], why0 = pend[y + "_why"];
      if ((pd === "buy" || pd === "short") && !pos[y] && Object.keys(pos).length < cfg.maxPos && allowed(y, t)) {
        const px = D.o[i], dir = pd === "buy" ? 1 : -1; let spend = value() * (cfg.size / 100) * lev;
        if (dir > 0 && lev <= 1) spend = Math.min(spend, cash);
        if (spend > 10) { const q = dir > 0 ? spend / (px * (1 + fee)) : spend / px;
          if (dir > 0) cash -= q * px * (1 + fee); else cash += q * px * (1 - fee);
          pos[y] = { q, px, t, dir, peak: px, trough: px, lt: t, sw: 0 }; trades.push({ y, side: dir > 0 ? "BUY" : "SHORT", t, px, q, why: why0 }); } }
      if (pd === "close" && pos[y]) close(y, D.o[i], t, why0);
      delete pend[y]; delete pend[y + "_why"];
      // 2) stops inside this candle
      const p = pos[y];
      if (p && p.dir > 0) {
        const stops = [];
        if (cfg.stop > 0) stops.push([p.px * (1 - cfg.stop / 100), `stop-loss −${cfg.stop}%`]);
        if (cfg.trail > 0) stops.push([p.peak * (1 - cfg.trail / 100), `trailing stop −${cfg.trail}% from the high`]);
        const hit = stops.filter(([lv]) => D.l[i] <= lv).sort((a, b) => b[0] - a[0])[0];
        if (hit) close(y, Math.min(D.o[i], hit[0]), t, hit[1]);
        else if (cfg.take > 0 && D.h[i] >= p.px * (1 + cfg.take / 100)) close(y, Math.max(D.o[i], p.px * (1 + cfg.take / 100)), t, `take-profit +${cfg.take}%`);
        else p.peak = Math.max(p.peak, D.h[i]);
      } else if (p) {
        const stops = [];
        if (cfg.stop > 0) stops.push([p.px * (1 + cfg.stop / 100), `stop-loss +${cfg.stop}% against the short`]);
        if (cfg.trail > 0) stops.push([p.trough * (1 + cfg.trail / 100), `trailing stop +${cfg.trail}% from the low`]);
        const hit = stops.filter(([lv]) => D.h[i] >= lv).sort((a, b) => a[0] - b[0])[0];
        if (hit) close(y, Math.max(D.o[i], hit[0]), t, hit[1]);
        else if (cfg.take > 0 && D.l[i] <= p.px * (1 - cfg.take / 100)) close(y, Math.min(D.o[i], p.px * (1 - cfg.take / 100)), t, `take-profit −${cfg.take}%`);
        else p.trough = Math.min(p.trough, D.l[i]);
      }
      // 3) forex swap: the interest gap, paid or earned for the time the position was open
      const q = pos[y];
      if (q && cfg.swap && rates[y]) { const amt = q.dir * q.q * D.c[i] * (rates[y] / 100) * ((t - q.lt) / 31536000); cash += amt; q.sw += amt; q.lt = t; }
      last[y] = D.c[i];
      // 4) signals on this close -> next open
      if (i < 1) continue;
      const f = D.f, s = D.s, c = D.c, r = D.r;
      if (pos[y]) {
        const L = pos[y].dir > 0;
        const why = cfg.exitCross && f[i] !== null && s[i] !== null && f[i - 1] !== null && s[i - 1] !== null && (L ? f[i - 1] >= s[i - 1] && f[i] < s[i] : f[i - 1] <= s[i - 1] && f[i] > s[i]) ? `fast average crossed ${L ? "below" : "above"} slow (${cfg.fast}/${cfg.slow})`
          : cfg.maExitOn && D.mx[i] !== null && (L ? c[i] < D.mx[i] : c[i] > D.mx[i]) ? `closed ${L ? "below" : "above"} its ${cfg.maExitN}-candle average`
          : cfg.rsiExitOn && r[i] !== null && (L ? r[i] > cfg.rsiHi : r[i] < cfg.rsiLo) ? (L ? `RSI above ${cfg.rsiHi} (overbought)` : `RSI below ${cfg.rsiLo} (oversold)`) : null;
        if (why) { pend[y] = "close"; pend[y + "_why"] = why; }
      } else {
        for (const dir of [1, -1]) {
          if (!sideOk(y, dir)) continue;
          const trig = cfg.trig === "cross" ? f[i - 1] !== null && s[i - 1] !== null && f[i] !== null && s[i] !== null && (dir > 0 ? f[i - 1] <= s[i - 1] && f[i] > s[i] : f[i - 1] >= s[i - 1] && f[i] < s[i])
            : cfg.trig === "rsi" ? r[i - 1] !== null && r[i] !== null && (dir > 0 ? r[i - 1] < cfg.rsiLo && r[i] >= cfg.rsiLo : r[i - 1] > cfg.rsiHi && r[i] <= cfg.rsiHi)
            : cfg.trig === "breakout" ? i > cfg.brk && (dir > 0 ? c[i] > Math.max(...c.slice(i - cfg.brk, i)) : c[i] < Math.min(...c.slice(i - cfg.brk, i))) : true;
          const filt = (!cfg.trendOn || (D.tr[i] !== null && (dir > 0 ? c[i] > D.tr[i] : c[i] < D.tr[i]))) && ideasOk(y, dir);
          if (trig && filt) { pend[y] = dir > 0 ? "buy" : "short";
            pend[y + "_why"] = `${{ cross: `${cfg.fast}/${cfg.slow} average cross ${dir > 0 ? "up" : "down"}`, rsi: dir > 0 ? `RSI back above ${cfg.rsiLo}` : `RSI back below ${cfg.rsiHi}`, breakout: `${cfg.brk}-candle ${dir > 0 ? "breakout" : "breakdown"}`, always: "filters true" }[cfg.trig]}${cfg.trendOn ? `, ${dir > 0 ? "above" : "below"} ${cfg.trendN}-avg` : ""}${cfg.side === "carry" ? ", earns the interest gap" : ""}${cfg.ideasOn && cfg.market === "stocks" ? `, IDEAS ${cfg.scores?.[y] ?? "?"}` : ""}`;
            break; }
        }
      }
    }
    eq.push([t, value()]);
  }
  // buy & hold the same symbols, equal money, same period
  const bh = times.map((t) => [t, ys.reduce((a, y) => { const D = S[y], j0 = D.t.findIndex((x) => x >= times[0]); let j = D.at.get(t); if (j === undefined) { j = D.t.findLastIndex((x) => x <= t); } return a + (j0 >= 0 && j >= 0 ? (cfg.cash / ys.length) * (D.c[j] / D.c[j0]) : cfg.cash / ys.length); }, 0)]);
  const sells = trades.filter((x) => x.pnl !== undefined), wins = sells.filter((x) => x.pnl > 0);
  let pk = -Infinity, dd = 0; eq.forEach(([, v]) => { pk = Math.max(pk, v); dd = Math.min(dd, v / pk - 1); });
  return { ys, trades, eq, bh, pos, cash, last, value: value(), ret: eq.length ? (eq.at(-1)[1] / cfg.cash - 1) * 100 : 0, bhRet: bh.length ? (bh.at(-1)[1] / cfg.cash - 1) * 100 : 0,
    dd: dd * 100, n: sells.length, win: sells.length ? (wins.length / sells.length) * 100 : null, avgW: wins.length ? pMean(wins.map((x) => x.pnl * 100)) : null,
    avgL: sells.length - wins.length ? pMean(sells.filter((x) => x.pnl <= 0).map((x) => x.pnl * 100)) : null, from: times[0], to: times.at(-1),
    swap: trades.reduce((a, x) => a + (x.swap || 0), 0) + Object.values(pos).reduce((a, p) => a + p.sw, 0) };
}

const bDate = (t, itv) => new Date(t * 1000).toLocaleString("en-GB", itv !== "1d" ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" } : { day: "2-digit", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" });
const BOT_MKT = { stocks: "Stocks", crypto: "Crypto 24/7", forex: "Forex", gold: "Gold / commodities" };
// pair currencies for a forex symbol (THB=X = USD/THB, EURUSD=X = EUR/USD), used for swap + news
function botPair(y) { const m = String(y).match(/^([A-Z]{3})([A-Z]{3})?=X$/); return m ? (m[2] ? [m[1], m[2]] : ["USD", m[1]]) : y === "GC=F" || y === "DX-Y.NYB" ? ["USD", null] : [null, null]; }
// numbers each bot needs from the rest of Pro, saved with the bot so the robot uses the same ones:
//   scores (IDEAS, stocks) · rates (forex swap: base rate − quote rate, policy rates from MACRO) · newsT (high-impact events)
function botPrep(c) {
  let ch = false; const set = (k, v) => { if (JSON.stringify(v) !== JSON.stringify(c[k] || {})) { c[k] = v; ch = true; } };
  if (c.ideasOn && c.market === "stocks" && typeof idScore === "function" && idCfg()) {
    const ctx = idCtx(), sc = {}; c.syms.forEach((t) => { const x = idScore(t, idS.cfg, ctx); if (Number.isFinite(x.score)) sc[yahoo(t)] = Math.round(x.score); });
    if (Object.keys(sc).length) set("scores", sc); }
  if (c.market === "forex" && (c.swap || c.side === "carry")) { const cb = proGet("cb"); if (cb?.rows) {
    const bank = Object.fromEntries(cb.rows.map((r) => [r.bank, r.rate])), rate = (cc) => (cc === "USD" ? bank.Fed : bank[FX_CCY.find((x) => x[0] === cc)?.[4]]);
    const rt = {}; c.syms.forEach((y) => { const [b, q] = botPair(y), rb = rate(b), rq = rate(q); if (Number.isFinite(rb) && Number.isFinite(rq)) rt[y] = Math.round((rb - rq) * 100) / 100; }); set("rates", rt); } }
  if (c.news > 0 && c.market === "forex") { const ev = proGet("evdates"), cal = typeof fxCalData === "function" ? fxCalData() : null;
    if (ev?.events && cal) { const nt = {};
      c.syms.forEach((y) => { const cc = new Set(botPair(y).filter(Boolean)), out = [];
        if (cc.has("USD")) ev.events.forEach((e) => e.days.forEach((d) => out.push(Math.floor(nyUtc(d, e.ny) / 1000))));
        cal.filter((e) => e.impact === "High" && cc.has(e.currency)).forEach((e) => out.push(Math.floor(new Date(e.at) / 1000)));
        nt[y] = [...new Set(out)].sort((a, b) => a - b); }); set("newsT", nt); } }
  if (ch) botSave();
}
function botCore(c = botCfg()) {
  if (!c) return null;
  botPrep(c);
  const { data, ys, got } = botData(c), run = { ...c, syms: ys }, ready = got >= ys.length;
  const B = ready ? botRun(run, data) : null, P = ready && c.paper ? botRun({ ...run, cash: c.paper.cash }, data, c.paper.from) : null;
  return { cfg: c, ys, got, ready, B, P };
}
const botIso = (cfg) => (t) => new Date(t * 1000).toISOString().slice(0, cfg.itv === "1d" ? 10 : 16);
const botKpi = (R) => `<div class="pbigw"><div><div class="pbig ${R.ret >= 0 ? "up" : "dn"}">${pPct(R.ret, 1)}</div><small>BOT RETURN</small></div><div><div class="pbig ${R.bhRet >= 0 ? "up" : "dn"}">${pPct(R.bhRet, 1)}</div><small>JUST HOLDING THE SAME SYMBOLS</small></div>
    <div><div class="pbig dn">${pPct(R.dd, 1)}</div><small>WORST DROP (MAX DRAWDOWN)</small></div><div><div class="pbig">${R.n}${R.n < 30 ? ' <span class="pa" title="fewer than 30 closed trades: could be luck">⚠</span>' : ""}</div><small>CLOSED TRADES · ${R.win === null ? "—" : pN(R.win, 0) + "% WON"}</small></div></div>`;
const botSideTag = (s) => `<span class="ptag ${s === "BUY" || s === "COVER" ? "g" : "r"}">${s}</span>`;
const botTrades = (R, cfg, n = 40) => `<table class="ptab"><tr><th class="l">WHEN</th><th class="l">SIDE</th><th class="l">SYMBOL</th><th>PRICE</th><th>RESULT</th><th class="l">WHY</th></tr>${[...R.trades].reverse().slice(0, n).map((x) => `<tr><td class="l pd">${esc(bDate(x.t, cfg.itv))}</td>
    <td class="l">${botSideTag(x.side)}</td><td class="l t">${esc(x.y)}</td><td>${pN(x.px, x.px < 10 ? 4 : 2)}</td><td>${x.pnl === undefined ? "" : pUD(x.pnl, pPct(x.pnl * 100, 2))}</td><td class="l pd">${esc(x.why || "")}</td></tr>`).join("") || '<tr><td class="l pd" colspan="6">No trades yet.</td></tr>'}</table>`;
function botAcct(C) {
  const { cfg, P } = C;
  return P ? `<div class="pbigw"><div><div class="pbig ${P.value >= cfg.paper.cash ? "up" : "dn"}">$${pN(P.value, 0)}</div><small>${esc(cfg.name.toUpperCase())} · STARTED WITH $${pN(cfg.paper.cash, 0)} · ${pPct((P.value / cfg.paper.cash - 1) * 100, 2)}</small></div></div>
    <table class="ptab"><tr><th class="l">OPEN</th><th class="l">SIDE</th><th>QTY</th><th>ENTRY</th><th>NOW</th><th>P/L</th>${cfg.swap ? "<th>SWAP</th>" : ""}</tr>${Object.entries(P.pos).map(([y, p]) => { const r = p.dir * (P.last[y] / p.px - 1) * 100;
      return `<tr><td class="l t">${esc(y)}</td><td class="l">${botSideTag(p.dir > 0 ? "BUY" : "SHORT")}</td><td>${pN(p.q, p.q < 10 ? 4 : 0)}</td><td>${pN(p.px, p.px < 10 ? 4 : 2)}</td><td>${pN(P.last[y], P.last[y] < 10 ? 4 : 2)}</td><td>${pUD(r, pPct(r, 2))}</td>${cfg.swap ? `<td>${pUD(p.sw, "$" + pN(p.sw, 2))}</td>` : ""}</tr>`; }).join("") || `<tr><td class="l pd" colspan="${cfg.swap ? 7 : 6}">No open positions: waiting for a signal.</td></tr>`}
      <tr class="tot"><td class="l">Cash</td><td colspan="${cfg.swap ? 6 : 5}">$${pN(P.cash, 0)}${cfg.lev > 1 ? ` · leverage ${cfg.lev}×` : ""}</td></tr></table>`
    : proSoon(C.ready ? `Press <b>START</b>: from that moment this bot "trades" $${pN(cfg.cash, 0)} of pretend money with its rules on every new candle.` : proWait(`LOADING CANDLES ${C.got}/${C.ys.length}…`), "");
}
const bot247 = () => proPanel("24/7 + REAL MONEY", "", `<table class="ptab pwrapt"><tr><td class="l">This browser tab</td><td class="l">updates on every new candle while open</td></tr><tr><td class="l">The robot (24/7)</td><td class="l">${botS.db ? "checks every ~30 min, day and night, every running bot, and sends a Telegram message for each new paper trade (with the bot's name)" : "<span class=\"pw\">after supabase/017_pro.sql is run</span>: checks every ~30 min, day and night, every running bot, Telegram on each paper trade"}</td></tr>
      <tr><td class="l">Real orders</td><td class="l"><span class="ptag r">NOT CONNECTED</span> Nothing here can buy or sell real assets.</td></tr></table>
      <div class="pnote">Going live is possible later: a broker API (e.g. Interactive Brokers, a licensed crypto exchange, Settrade via your broker), keys you put in .env yourself, a broker test account first, loss limits and a kill switch, on an always-on computer. You'd switch it on; Claude won't.</div>`);
const botSub = (title) => { const c = botS.cfg; return `<div class="psub ptabs"><span class="ptkh"><b>${title}</b>${c ? " " + esc(c.name.toUpperCase()) : ""}</span><span class="sp"></span>${c ? (c.paper ? `<span class="ptag g pblink">● RUNNING SINCE ${esc(bDate(c.paper.from, "60m"))}</span><button data-botstop="${esc(c.id)}">STOP</button>` : `<button class="on" data-botstart="${esc(c.id)}">▶ START PAPER TRADING</button>`) : ""}</div>`; };
// bot picker (B3, B4): ALL BOTS + each bot
const botPick = (all = true) => `<div class="psub">${all ? `<button class="${proStore("ic_pro_botview", "all") === "all" ? "on" : ""}" data-botview="all">ALL BOTS</button>` : ""}${botS.data.bots.map((b) => `<button class="${(!all || proStore("ic_pro_botview", "all") === "one") && b.id === botS.cfg.id ? "on" : ""}" data-botpick="${esc(b.id)}">${b.paper ? "● " : ""}${esc(b.name)}</button>`).join("")}</div>`;

// ===== B1 SIGNALS: what the bot would BUY or SHORT today, and why =====
// Stocks = everything IDEAS checks (watchlist, holdings, theses, scan list). Confidence = half your IDEAS score, half
// TECHNICAL (price rules + your drawings). Crypto has no company data, so it's TECHNICAL only. The thresholds are yours
// to change (sigT); the starting ones are the round-55 defaults.
// Entry = last close. Stop = 2 × ATR (average daily range, 14 days) away, target = 2 × the risk (reward/risk 2),
// unless you drew a Long / Short box on that chart: then your own entry, stop and target are used.
// Size = shares so that hitting the stop loses 1% of the paper account (USD), max 25% of the account. Rule outputs, not advice.
const BOT_CRYPTO_SIG = ["BTC-USD", "ETH-USD", "SOL-USD"];
function botAtr(d, n = 14) {
  const ok = (d?.t || []).map((_, i) => i).filter((i) => [d.h, d.l, d.c].every((a) => typeof a?.[i] === "number"));
  if (ok.length < n + 2) return null;
  const tr = ok.slice(1).map((i, k) => { const p = d.c[ok[k]]; return Math.max(d.h[i] - d.l[i], Math.abs(d.h[i] - p), Math.abs(d.l[i] - p)); });
  return pMean(tr.slice(-n));
}
function botSignals(acct) {
  const cfg = idCfg(); if (!cfg) return null;
  const T = botS.data.sigT, ctx = idCtx(), out = [];
  const plan = (t, y, side, conf, why, d, sc, tech, cur = "USD") => {
    const px = [...(d?.c || [])].reverse().find((v) => typeof v === "number"), atr = botAtr(d);
    let e = px, st = null, tg = null, src = "ATR";
    const box = (idDrawings()[t] || []).filter((o) => o.name === (side === "SHORT" ? "tvShort" : "tvLong") && o.points?.length >= 2).at(-1);
    if (box && side !== "WAIT") { e = box.points[0].value; tg = box.points[1].value; st = box.points[2]?.value ?? e - (tg - e) / 2; src = "YOUR CHART"; }
    else if (atr && side !== "WAIT") { st = side === "BUY" ? e - 2 * atr : e + 2 * atr; tg = side === "BUY" ? e + 4 * atr : e - 4 * atr; }
    // the paper account is in USD: a Thai stock's risk per share (baht) is turned into dollars first
    const perUsd = cur === "USD" ? 1 : fxPerUsd(cur), risk = st !== null ? Math.abs(e - st) : null, qty = risk && perUsd ? Math.min((acct * 0.01) / (risk / perUsd), (acct * 0.25) / (e / perUsd)) : null;   // and never more than 25% of the account in one position
    out.push({ t, y, side, conf, why, px, e, st, tg, rr: risk ? Math.abs(tg - e) / risk : null, qty, src, sc, tech });
  };
  idUniverse(cfg).forEach((t) => {
    const x = idScore(t, cfg, ctx); if (x.wait || x.nodata || !Number.isFinite(x.score)) return;
    const tech = x.f.tech?.s ?? 50, conf = 0.5 * x.score + 0.5 * tech, d = proCandles(x.y, "1y");
    const side = conf >= T.buy && x.score >= T.buyMin && tech >= T.buyMin && !x.fails.length ? "BUY" : conf <= T.short && x.score <= T.shortIdeas && tech <= T.shortTech ? "SHORT" : "WAIT";
    const why = side === "SHORT" ? [...x.cons].slice(0, 2).map((p) => p.txt) : side === "BUY" ? [...x.pros].slice(0, 2).map((p) => p.txt)
      : [x.fails.length ? `fails your rule: ${ID_M[x.fails[0].m][0]}` : x.score >= 55 && tech < 50 ? "good company data, but no entry setup yet" : tech >= 55 && x.score < 50 ? "chart looks fine, but the company data is weak" : "nothing strong either way"];
    plan(t, x.y, side, side === "SHORT" ? 100 - conf : conf, why, d, x.score, tech, x.cur || "USD");
  });
  BOT_CRYPTO_SIG.forEach((y) => {
    const d = proCandles(y, "1y"); if (!d) return;
    const TE = idTech(y, d); if (!TE.f) return;
    const tech = TE.f.s, side = tech >= T.cBuy ? "BUY" : tech <= T.cShort ? "SHORT" : "WAIT";
    const why = TE.f.why.filter(([v]) => (side === "SHORT" ? v < 50 : side === "BUY" ? v > 50 : true)).slice(0, 2).map((w) => w[1]);
    plan(y.replace("-USD", ""), y, side, side === "SHORT" ? 100 - tech : tech, why.length ? why : ["no clear setup"], d, null, tech);
  });
  return out.sort((a, b) => ({ BUY: 0, SHORT: 1, WAIT: 2 }[a.side] - { BUY: 0, SHORT: 1, WAIT: 2 }[b.side]) || b.conf - a.conf);
}
// Signal log: the first time a BUY / SHORT appears it's written down with its price, so B4 JOURNAL can show how
// signals really did afterwards (saved with your bots: theses "#BOT" sigLog, max 300 entries).
function botLogSignals(sigs) {
  const c = botS.data; if (!c || !sigs) return;
  const open = new Set(c.sigLog.filter((s) => !s.closed).map((s) => `${s.y}|${s.side}`));
  let changed = false;
  sigs.filter((s) => s.side !== "WAIT" && Number.isFinite(s.px)).forEach((s) => {
    if (open.has(`${s.y}|${s.side}`)) return;
    c.sigLog.push({ y: s.y, t: s.t, side: s.side, px: s.px, st: s.st, tg: s.tg, at: Math.floor(Date.now() / 1000), conf: Math.round(s.conf) }); changed = true; });
  // a signal is "closed" when the opposite or WAIT shows up for 1+ day, or its stop / target is touched
  c.sigLog.filter((s) => !s.closed).forEach((s) => { const now = sigs.find((x) => x.y === s.y); if (!now || !Number.isFinite(now.px)) return;
    const hitS = s.st !== null && (s.side === "BUY" ? now.px <= s.st : now.px >= s.st), hitT = s.tg !== null && (s.side === "BUY" ? now.px >= s.tg : now.px <= s.tg);
    if (hitS || hitT || (now.side !== s.side && Date.now() / 1000 - s.at > 86400)) { s.closed = Math.floor(Date.now() / 1000); s.out = now.px; s.how = hitS ? "stop" : hitT ? "target" : "signal ended"; changed = true; } });
  if (c.sigLog.length > 300) { c.sigLog = c.sigLog.slice(-300); changed = true; }
  if (changed) botSave();
}

PRO_VIEWS.bot = () => {
  const c = botCfg(); if (!c) return proWait("LOADING YOUR BOTS…");
  const T = botS.data.sigT, sigs = botSignals(c.cash);
  if (!sigs) return botSub("SIGNALS") + proWait("LOADING YOUR IDEAS RULES…");
  botLogSignals(sigs);
  const f = proStore("ic_pro_sigf", "act"), list = f === "all" ? sigs : sigs.filter((s) => s.side !== "WAIT");
  const fx = (v, ref) => (v === null || v === undefined ? "—" : pN(v, ref >= 1000 ? 0 : ref >= 10 ? 2 : 4));
  const nB = sigs.filter((s) => s.side === "BUY").length, nS = sigs.filter((s) => s.side === "SHORT").length;
  const rows = list.map((s) => `<tr><td class="l"><span class="ptag ${s.side === "BUY" ? "g" : s.side === "SHORT" ? "r" : ""}">${s.side}</span></td><td class="l"><a class="t" href="#/charts/${encodeURIComponent(s.y.endsWith("-USD") ? s.y : s.t)}">${esc(s.t)}</a></td>
    <td><span class="idsc" style="--v:${s.conf.toFixed(0)}%"><i class="${s.side === "BUY" ? "u" : s.side === "SHORT" ? "d" : ""}"></i>${s.conf.toFixed(0)}</span></td><td>${fx(s.px, s.px)}</td><td>${s.side === "WAIT" ? "—" : fx(s.e, s.px)}</td><td class="dn">${s.side === "WAIT" ? "—" : fx(s.st, s.px)}</td><td class="up">${s.side === "WAIT" ? "—" : fx(s.tg, s.px)}</td>
    <td>${s.rr ? pN(s.rr, 1) : "—"}</td><td>${s.side === "WAIT" || !s.qty ? "—" : pN(s.qty, s.qty < 10 ? 3 : 0)}</td><td class="pd">${s.side === "WAIT" ? "" : s.src}</td><td>${s.sc === null ? '<span class="pd">—</span>' : pN(s.sc, 0)}</td><td>${pN(s.tech, 0)}</td>
    <td class="l pd">${s.why.map(esc).join(" · ")}</td></tr>`).join("");
  const tbl = `<div class="psub">${[["act", `BUY + SHORT (${nB + nS})`], ["all", `EVERYTHING (${sigs.length})`]].map(([k, l]) => `<button class="${k === f ? "on" : ""}" data-sigf="${k}">${l}</button>`).join("")}</div>
    <table class="ptab"><tr><th class="l">SIGNAL</th><th class="l">SYMBOL</th><th>CONFIDENCE</th><th>PRICE</th><th>ENTRY</th><th>STOP</th><th>TARGET</th><th>R/R</th><th title="units so that hitting the stop loses 1% of a $${pN(c.cash, 0)} account">SIZE (1% RISK)</th><th>LEVELS</th><th>IDEAS</th><th>TECH</th><th class="l">WHY</th></tr>
    ${rows || `<tr><td class="l pd" colspan="13">No BUY or SHORT signal today: everything is WAIT. That's a normal answer, not a fault.</td></tr>`}</table>
    <div class="pnote"><b>CONFIDENCE</b> = half your IDEAS score + half TECHNICAL (for SHORT: how strongly both point down). <b>LEVELS</b> ATR = stop 2 × the average daily range away, target 2 × the risk; YOUR CHART = taken from the Long / Short box you drew. <b>SIZE</b> = how many shares so that a stop-out costs 1% of a $${pN(c.cash, 0)} paper account, capped at 25% of the account in one position.</div>`;
  const learn = proLearn("Position sizing (FN312 risk + FN411 risk management)", "Why size by risk, and what SHORT means", `<p><b>Risk-based sizing:</b> decide first how much you're willing to lose if you're wrong (here 1% of the account), then buy only as many shares as makes the stop-loss cost exactly that. A volatile stock gets a smaller position automatically. Ten losers in a row then cost about 10%, not the whole account.</p>
    <p><b>Reward / risk (R/R):</b> distance to target ÷ distance to stop. At 2, you can be right only 40% of the time and still make money: 4 wins × 2 − 6 losses × 1 = +2 units.</p>
    <p><b>Shorting</b> = borrowing shares, selling them now and buying them back later, hoping the price fell. The loss has no ceiling if the price keeps rising, so a stop is not optional. In Thailand, small investors short through <b>SBL</b> (securities borrowing via your broker, not available for every stock) or sell <b>single-stock futures / SET50 futures on TFEX</b>.</p>
    <p><b>Honest limits:</b> these are your rules applied mechanically. The JOURNAL (B4) shows how the signals actually did; trust them only after enough of them have played out.</p>`);
  const num = (k, w = 46) => `<input class="pin" type="number" step="1" style="width:${w}px" value="${T[k]}" data-sigt="${k}">`;
  const rules = `<table class="ptab pwrapt">
      <tr><td class="l"><span class="ptag g">BUY</span></td><td class="l">confidence ≥ ${num("buy")}, and IDEAS ≥ ${num("buyMin")} and TECHNICAL ≥ the same, and no MUST rule failed</td></tr>
      <tr><td class="l"><span class="ptag r">SHORT</span></td><td class="l">confidence ≤ ${num("short")} (shown as 100 − that), IDEAS ≤ ${num("shortIdeas")} and TECHNICAL ≤ ${num("shortTech")} (weak company <i>and</i> weak chart)</td></tr>
      <tr><td class="l"><span class="ptag">WAIT</span></td><td class="l">everything else, including good companies without an entry setup</td></tr>
      <tr><td class="l">Crypto</td><td class="l">TECHNICAL only: BUY ≥ ${num("cBuy")}, SHORT ≤ ${num("cShort")}</td></tr>
      <tr><td class="l">Also change</td><td class="l">your rules and weights in Pro → F5 IDEAS; lines / boxes on any chart</td></tr></table>
      <div class="psub"><button data-sigreset="1">BACK TO STARTING VALUES</button></div>
      <div class="pnote"><b>Your thresholds, not proven numbers:</b> the starting values (60 / 50 / 38 / 45 / 40 · 65 / 30) are reasonable defaults, nothing more. Change them, then watch B4 JOURNAL to see if your version does better. Raising BUY to 65+ gives fewer, stronger signals.</div>`;
  return botSub("SIGNALS") + `<div class="pgrid g1">${proPanel(`TODAY'S SIGNALS · ${nB} BUY · ${nS} SHORT · ${sigs.length - nB - nS} WAIT`, "YOUR IDEAS RULES + TECHNICAL + YOUR DRAWINGS · DAILY CANDLES", tbl + learn)}</div>
    <div class="pgrid g2">${proPanel("HOW THE BOT DECIDES · YOUR THRESHOLDS", "EDIT ANY NUMBER", rules)}${proPanel("WHERE SIGNALS GO", "", `<table class="ptab pwrapt"><tr><td class="l">Paper bots (B2)</td><td class="l">each bot has its own rules; a bot with "Only good IDEAS" uses the same IDEAS scores as these signals</td></tr>
      <tr><td class="l">Journal (B4)</td><td class="l">every BUY / SHORT here is logged when it first appears, and you can see how it did afterwards</td></tr>
      <tr><td class="l">Telegram</td><td class="l">for paper trades from running bots (the robot, every ~30 min)</td></tr></table>`)}</div>`;
};

// ===== B2 MY BOTS: every bot in one table + the selected bot's backtest and rules =====
PRO_VIEWS.bots = () => {
  const c0 = botCfg(); if (!c0) return proWait("LOADING YOUR BOTS…");
  const all = botS.data.bots.map((b) => botCore(b)), sel = all.find((C) => C.cfg.id === c0.id) || all[0];
  const run = all.filter((C) => C.cfg.paper), tot = run.reduce((a, C) => a + (C.P ? C.P.value : C.cfg.paper.cash), 0), start = run.reduce((a, C) => a + C.cfg.paper.cash, 0);
  const res = (C) => (C.P ? C.P : C.B), best = [...all].filter((C) => res(C)).sort((a, b) => res(b).ret - res(a).ret)[0], worst = [...all].filter((C) => res(C)).sort((a, b) => res(a).ret - res(b).ret)[0];
  const head = `<div class="pverd"><div><small>ALL RUNNING BOTS · PRETEND MONEY</small><div class="pbig ${tot >= start ? "up" : "dn"}">$${pN(tot, 0)}</div><small>${run.length} running · started with $${pN(start, 0)}${start ? ` · ${pPct((tot / start - 1) * 100, 2)}` : ""}</small></div>
    <div><div class="pverdt">${best ? `Best: <b>${esc(best.cfg.name)}</b> (${pPct(res(best).ret, 1)}${best.cfg.paper ? " paper" : " backtest"}${res(best).n < 30 ? `, only ${res(best).n} trades: too few to trust yet` : ""}). ` : ""}${worst && worst !== best ? `Worst: <b>${esc(worst.cfg.name)}</b> (${pPct(res(worst).ret, 1)}${res(worst).bhRet < res(worst).ret ? ", but it lost less than just holding" : ""}).` : ""} <span class="pd">Stopped bots show their backtest; running bots show paper results since START.</span></div></div></div>`;
  const rows = all.map((C) => { const c = C.cfg, R = res(C), on = c.id === sel.cfg.id, lt = R?.trades.at(-1);
    return `<tr class="${on ? "sel" : ""}" data-botpick="${esc(c.id)}"><td class="l"><b>${esc(c.name)}</b></td><td class="l pd">${esc(BOT_MKT[c.market] || c.market)} · ${c.itv === "1d" ? "daily" : c.itv === "4h" ? "4-hour" : "hourly"} · ${esc((BOT_SIDE.find((s) => s[0] === c.side) || BOT_SIDE[0])[1].split(" (")[0].toLowerCase())}</td>
      <td class="l pd">${esc(c.syms.join(" ").slice(0, 34))}</td><td class="l">${c.paper ? '<span class="ptag g">● RUNNING</span>' : '<span class="ptag">STOPPED</span>'}</td>
      <td>${R ? pUD(R.ret, pPct(R.ret, 1)) : "…"}${!c.paper && R ? ' <span class="pd">bt</span>' : ""}</td><td>${R ? pUD(R.ret - R.bhRet, (R.ret - R.bhRet > 0 ? "+" : "") + pN(R.ret - R.bhRet, 1)) : "—"}</td><td>${R ? R.n : "—"}${R && R.n < 30 ? ' <span class="pa">⚠</span>' : ""}</td><td>${R?.win === null || !R ? "—" : pN(R.win, 0) + "%"}</td>
      <td>${C.P ? Object.keys(C.P.pos).length : "—"}</td><td class="l pd">${lt ? `${lt.side} ${esc(lt.y)} · ${esc(bDate(lt.t, c.itv))}` : "—"}</td>
      <td class="l">${c.paper ? `<button class="pbtn" data-botstop="${esc(c.id)}">STOP</button>` : `<button class="pbtn on" data-botstart="${esc(c.id)}">▶ START</button>`} <button class="pbtn" data-botcopy="${esc(c.id)}">COPY</button> ${botS.data.bots.length > 1 ? `<button class="pbtn" data-botdel="${esc(c.id)}">${botS.del === c.id ? "SURE? DELETE" : "DELETE"}</button>` : ""}</td></tr>`; }).join("");
  const list = `<table class="ptab idtab"><tr><th class="l">BOT</th><th class="l">MARKET</th><th class="l">SYMBOLS</th><th class="l">STATUS</th><th>RETURN</th><th title="the bot's return minus just holding the same symbols">vs JUST HOLDING</th><th>TRADES</th><th>WON</th><th>OPEN</th><th class="l">LAST TRADE</th><th class="l"></th></tr>${rows}</table>
    <div class="pmean"><span class="ptag y">⚠</span><span>Fewer than 30 closed trades: the result could easily be luck. "vs JUST HOLDING" = the bot's return minus simply buying the same symbols at the start: positive means the rules actually added something. Click a row to edit that bot below.</span></div>`;
  const tpl = `<div class="psub">${Object.entries(BOT_PRESETS).map(([k, p]) => `<button data-botnew="${k}"${botS.data.bots.length >= BOT_MAX ? " disabled" : ""}>+ ${esc(p.name)}</button>`).join("")}<span class="pd" style="margin-left:8px">${botS.data.bots.length}/${BOT_MAX} bots · each starts with its own $100k</span></div>`;
  const { cfg: c, B } = sel, iso = botIso(c);
  const bt = !B ? proWait(`LOADING CANDLES ${sel.got}/${sel.ys.length}…`) : `${botKpi(B)}${proLine([{ n: "Bot", p: B.eq.map(([t, v]) => [iso(t), v]) }, { n: "Just holding", p: B.bh.map(([t, v]) => [iso(t), v]) }], { fmt: (v) => pBig(v), w: 1100, h: 280 })}
    <div class="pkv"><span>Period</span><span>${esc(bDate(B.from, c.itv))} → ${esc(bDate(B.to, c.itv))} · ${c.itv === "1d" ? "daily" : c.itv === "4h" ? "4-hour" : "hourly"} candles</span><span>Average win / loss</span><span>${pUD(1, pPct(B.avgW, 2))} / ${pUD(-1, pPct(B.avgL, 2))}</span>${c.swap ? `<span>Swap (interest) earned / paid</span><span>${pUD(B.swap, "$" + pN(B.swap, 0))}</span>` : ""}</div>
    <div class="pnote"><b>Read this carefully:</b> a backtest shows how the rules <i>would have</i> done, not what they will do. ${c.ideasOn && c.market === "stocks" ? "The IDEAS filter uses <b>today's</b> scores for the whole past, so that part looks better than it really was. " : ""}${c.news > 0 ? "The news pause knows past US releases (2 years) but other countries' events only from this week. " : ""}Tuning rules until the past looks great ("overfitting") usually fails on new data.</div>`;
  return botSub("MY BOTS") + head + `<div class="pgrid g1">${proPanel("MY BOTS", `EACH BOT = OWN RULES + OWN MONEY · MAX ${BOT_MAX}`, list + tpl)}</div>
    <div class="pgrid g21"><div class="pcol">${proPanel("BACKTEST · " + esc(c.name.toUpperCase()), `YAHOO · ${esc(sel.ys.join(" · "))}`, bt)}${B ? proPanel("BACKTEST TRADES", "LATEST FIRST", botTrades(B, c, 25)) : ""}</div>${proPanel("RULES · " + esc(c.name.toUpperCase()), botS.db ? "SAVED TO YOUR ACCOUNT" : "SAVED ON THIS PC", botForm(c))}</div>`;
};

// ===== B3 PAPER ACCOUNT: all bots together, or one =====
PRO_VIEWS.botp = () => {
  const c0 = botCfg(); if (!c0) return proWait("LOADING YOUR BOTS…");
  if (proStore("ic_pro_botview", "all") === "all") {
    const run = botS.data.bots.filter((b) => b.paper).map((b) => botCore(b));
    const tot = run.reduce((a, C) => a + (C.P ? C.P.value : C.cfg.paper.cash), 0), start = run.reduce((a, C) => a + C.cfg.paper.cash, 0);
    const tbl = `<table class="ptab"><tr><th class="l">BOT</th><th class="l">SINCE</th><th>STARTED</th><th>NOW</th><th>RESULT</th><th>OPEN</th><th>CLOSED TRADES</th><th class="l">LAST TRADE</th></tr>${run.map((C) => { const P = C.P, lt = P?.trades.at(-1);
      return `<tr data-botpick="${esc(C.cfg.id)}" style="cursor:pointer"><td class="l"><b>${esc(C.cfg.name)}</b></td><td class="l pd">${esc(bDate(C.cfg.paper.from, "60m"))}</td><td>$${pN(C.cfg.paper.cash, 0)}</td><td>${P ? "$" + pN(P.value, 0) : "…"}</td><td>${P ? pUD(P.ret, pPct(P.ret, 2)) : "…"}</td><td>${P ? Object.keys(P.pos).length : "—"}</td><td>${P ? P.n : "—"}</td><td class="l pd">${lt ? `${lt.side} ${esc(lt.y)} · ${esc(bDate(lt.t, C.cfg.itv))}` : "—"}</td></tr>`; }).join("") || '<tr><td class="l pd" colspan="8">No bot is running. Start one in B2 MY BOTS.</td></tr>'}</table>`;
    return botSub("PAPER ACCOUNT") + botPick() + `<div class="pverd"><div><small>ALL RUNNING BOTS</small><div class="pbig ${tot >= start ? "up" : "dn"}">$${pN(tot, 0)}</div><small>${run.length} bots · started with $${pN(start, 0)}${start ? ` · ${pPct((tot / start - 1) * 100, 2)}` : ""}</small></div><div><div class="pverdt">Each bot keeps its own pretend money, so one bot's losses never hide inside another's results. Click a bot to see its positions and trades.</div></div></div>
      <div class="pgrid g21">${proPanel("RUNNING BOTS", "REPLAYED FROM EACH START TIME", tbl)}${bot247()}</div>`;
  }
  const C = botCore(), { cfg, P } = C, iso = botIso(cfg);
  const eq = P && P.eq.length > 1 ? proLine([{ n: "Paper account", p: P.eq.map(([t, v]) => [iso(t), v]) }, { n: "Just holding", p: P.bh.map(([t, v]) => [iso(t), v]) }], { fmt: (v) => pBig(v), w: 1100, h: 260 }) : "";
  return botSub("PAPER ACCOUNT") + botPick() + `<div class="pgrid g21"><div class="pcol">${proPanel("PAPER ACCOUNT · " + esc(cfg.name.toUpperCase()), P ? "REPLAYED FROM YOUR START TIME · LIVE CANDLES" : "", (P ? botKpi(P) : "") + botAcct(C) + eq)}${proPanel("PAPER TRADES", "LATEST FIRST", P ? botTrades(P, cfg) : proSoon("This bot isn't running.", ""))}</div>
    <div class="pcol">${bot247()}${proPanel("RULES IN USE", "", `<div class="pkv"><span>Market</span><span>${esc(BOT_MKT[cfg.market] || cfg.market)}</span><span>Symbols</span><span>${esc(cfg.syms.join(", "))}</span><span>Candles</span><span>${cfg.itv === "1d" ? "daily" : cfg.itv === "4h" ? "4-hour" : "hourly"}</span><span>Direction</span><span>${esc((BOT_SIDE.find((s) => s[0] === cfg.side) || BOT_SIDE[0])[1])}</span></div><div class="pnote">Change them in <a class="pgo" href="#/pro/bots">B2 MY BOTS ›</a>. Changing the rules replays the paper account with the new rules from your start time.</div>`)}</div></div>`;
};

// ===== B4 JOURNAL: closed paper trades (all bots or one) + how the B1 signals really did =====
PRO_VIEWS.botj = () => {
  const c0 = botCfg(); if (!c0) return proWait("LOADING YOUR BOTS…");
  const allV = proStore("ic_pro_botview", "all") === "all", Cs = (allV ? botS.data.bots.filter((b) => b.paper) : [c0]).map((b) => botCore(b));
  const sells = Cs.flatMap((C) => (C.P ? C.P.trades.filter((x) => x.pnl !== undefined).map((x) => ({ ...x, bot: C.cfg.name, itv: C.cfg.itv })) : [])).sort((a, b) => a.t - b.t);
  const by = {}; sells.forEach((x) => { const k = String(x.why || "other").replace(/[−+-]?\d+(\.\d+)?%/g, "x%"); (by[k] = by[k] || []).push(x.pnl * 100); });
  const exp = sells.length ? pMean(sells.map((x) => x.pnl * 100)) : null;
  const paper = `<div class="pbigw"><div><div class="pbig">${sells.length}${sells.length < 30 ? ' <span class="pa">⚠</span>' : ""}</div><small>CLOSED PAPER TRADES · ${allV ? "ALL RUNNING BOTS" : esc(c0.name.toUpperCase())}</small></div><div><div class="pbig ${exp >= 0 ? "up" : "dn"}">${exp === null ? "—" : pPct(exp, 2)}</div><small>AVERAGE RESULT PER TRADE (EXPECTANCY)</small></div></div>
    <table class="ptab"><tr><th class="l">CLOSED BY</th><th>TRADES</th><th>AVERAGE</th><th>WON</th></tr>${Object.entries(by).map(([k, v]) => `<tr><td class="l">${esc(k)}</td><td>${v.length}</td><td>${pUD(pMean(v), pPct(pMean(v), 2))}</td><td>${pN((v.filter((x) => x > 0).length / v.length) * 100, 0)}%</td></tr>`).join("") || '<tr><td class="l pd" colspan="4">No closed paper trades yet.</td></tr>'}</table>
    <table class="ptab"><tr><th class="l">CLOSED</th>${allV ? '<th class="l">BOT</th>' : ""}<th class="l">SIDE</th><th class="l">SYMBOL</th><th>RESULT</th><th class="l">WHY</th></tr>${[...sells].reverse().slice(0, 25).map((x) => `<tr><td class="l pd">${esc(bDate(x.t, x.itv))}</td>${allV ? `<td class="l">${esc(x.bot)}</td>` : ""}<td class="l">${botSideTag(x.side)}</td><td class="l t">${esc(x.y)}</td><td>${pUD(x.pnl, pPct(x.pnl * 100, 2))}</td><td class="l pd">${esc(x.why || "")}</td></tr>`).join("")}</table>`;
  const L = (botS.data.sigLog || []).map((s) => { const now = s.closed ? s.out : [...(proCandles(s.y, "1y")?.c || [])].reverse().find((v) => typeof v === "number");
    const r = now ? (s.side === "BUY" ? now / s.px - 1 : 1 - now / s.px) * 100 : null; return { ...s, now, r }; });
  const grp = (side) => { const v = L.filter((s) => s.side === side && s.r !== null); return v.length ? { n: v.length, avg: pMean(v.map((s) => s.r)), won: (v.filter((s) => s.r > 0).length / v.length) * 100 } : null; };
  const sig = `<table class="ptab"><tr><th class="l">SIGNAL</th><th>SIGNALS</th><th>AVERAGE SINCE</th><th>RIGHT SO FAR</th></tr>${[["BUY", grp("BUY")], ["SHORT", grp("SHORT")]].map(([k, x]) => `<tr><td class="l"><span class="ptag ${k === "BUY" ? "g" : "r"}">${k}</span></td><td>${x ? x.n : 0}</td><td>${x ? pUD(x.avg, pPct(x.avg, 2)) : "—"}</td><td>${x ? pN(x.won, 0) + "%" : "—"}</td></tr>`).join("")}</table>
    <table class="ptab"><tr><th class="l">SINCE</th><th class="l">SIGNAL</th><th class="l">SYMBOL</th><th>CONF.</th><th>PRICE THEN</th><th>NOW / OUT</th><th>RESULT</th><th class="l">STATUS</th></tr>${[...L].reverse().slice(0, 40).map((s) => `<tr><td class="l pd">${esc(bDate(s.at, "60m"))}</td><td class="l"><span class="ptag ${s.side === "BUY" ? "g" : "r"}">${s.side}</span></td><td class="l t">${esc(s.t)}</td><td>${s.conf ?? "—"}</td><td>${pN(s.px)}</td><td>${s.now ? pN(s.now) : "—"}</td><td>${s.r === null ? "—" : pUD(s.r, pPct(s.r, 2))}</td><td class="l pd">${s.closed ? `closed: ${esc(s.how)}` : "open"}</td></tr>`).join("") || '<tr><td class="l pd" colspan="8">No signals logged yet. Open B1 SIGNALS: each new BUY / SHORT is written down here with its price.</td></tr>'}</table>
    <div class="pnote">A signal counts from the price when it first appeared. For SHORT, a falling price is a gain. Closed when its stop or target is touched, or when the signal changes for more than a day. Needs weeks of signals before the numbers mean much.</div>`;
  const learn = proLearn("FN312 Investments", "Expectancy: the number that decides if a system works", `<p><b>Expectancy</b> = average result per trade = (win rate × average win) − (loss rate × average loss). A system with 35% winners can be great if the winners are big; one with 80% winners can lose money if the few losers are huge.</p>
    <p><b>Sample size matters:</b> 10 trades tell you almost nothing; you want 30-50+ before trusting the average, and they should cover different market moods (up, down, sideways).</p>`);
  return botSub("JOURNAL") + botPick() + `<div class="pgrid g2">${proPanel("PAPER TRADES · RESULTS", allV ? "ALL RUNNING BOTS · SINCE EACH START" : "THIS BOT · SINCE START", paper)}${proPanel("SIGNALS · DID THEY WORK?", "B1 SIGNALS, LOGGED WHEN THEY FIRST APPEARED", sig + learn)}</div>`;
};
function botForm(c) {
  const num = (k, w = 58, st = "any") => `<input class="pin" type="number" step="${st}" style="width:${w}px" value="${c[k]}" data-botf="${k}">`;
  const chk = (k) => `<input type="checkbox" ${c[k] ? "checked" : ""} data-botf="${k}">`;
  const sel = (k, list) => `<select class="pin" data-botf="${k}">${list.map(([v, l]) => `<option value="${v}" ${String(c[k]) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  const fx = c.market === "forex";
  return `<table class="ptab botf pwrapt">
    <tr><th class="l" colspan="2">THIS BOT</th></tr>
    <tr><td class="l">Name</td><td class="l"><input class="pin" style="width:100%;text-align:left" maxlength="40" value="${esc(c.name)}" data-botf="name"></td></tr>
    <tr><td class="l">Market</td><td class="l">${sel("market", Object.entries(BOT_MKT))} ${sel("itv", [["1d", "Daily candles"], ["4h", "4-hour candles"], ["60m", "Hourly candles"]])}</td></tr>
    <tr><td class="l">Symbols</td><td class="l"><input class="pin" style="width:100%;text-align:left" value="${esc(c.syms.join(", "))}" data-botf="syms"></td></tr>
    <tr><td class="l pd" colspan="2">${fx ? "Forex: Yahoo codes, e.g. THB=X (USD/THB), EURUSD=X, JPY=X (USD/JPY), GBPUSD=X, AUDJPY=X" : c.market === "crypto" ? "Crypto: BTC-USD, ETH-USD, SOL-USD…" : c.market === "gold" ? "Gold GC=F, silver SI=F, oil CL=F" : "Stocks: NVDA, PTT, SCB…"}</td></tr>
    <tr><td class="l">Direction</td><td class="l">${sel("side", BOT_SIDE)}</td></tr>
    <tr><th class="l" colspan="2">ENTER WHEN</th></tr>
    <tr><td class="l">Trigger</td><td class="l">${sel("trig", BOT_TRIG)}</td></tr>
    <tr><td class="l pd">settings</td><td class="l pd">${c.trig === "cross" ? `fast ${num("fast", 46, 1)} slow ${num("slow", 46, 1)} candles` : c.trig === "rsi" ? `RSI ${num("rsiN", 40, 1)} · oversold ${num("rsiLo", 46, 1)} · overbought ${num("rsiHi", 46, 1)}` : c.trig === "breakout" ? `last ${num("brk", 46, 1)} candles` : "—"}</td></tr>
    <tr><td class="l">${chk("trendOn")} Only with the trend</td><td class="l pd">long above / short below the ${num("trendN", 60, 1)}-candle average</td></tr>
    ${c.market === "stocks" ? `<tr><td class="l">${chk("ideasOn")} Only good IDEAS</td><td class="l pd">long if IDEAS ≥ ${num("ideasMin", 46, 1)} · short if ≤ 100 − that</td></tr>` : ""}
    ${c.itv !== "1d" ? `<tr><td class="l">Session</td><td class="l">${sel("session", BOT_SESS)}</td></tr>` : ""}
    ${fx ? `<tr><td class="l">News pause</td><td class="l pd">no new trade ${num("news", 46, 5)} min before / after a high-impact event for the pair's currencies (0 = off)</td></tr>` : ""}
    <tr><th class="l" colspan="2">EXIT WHEN (any)</th></tr>
    <tr><td class="l">Stop-loss</td><td class="l pd">${num("stop", 46)}% against you (0 = off)</td></tr>
    <tr><td class="l">Trailing stop</td><td class="l pd">${num("trail", 46)}% back from the best price since entry (0 = off)</td></tr>
    <tr><td class="l">Take-profit</td><td class="l pd">${num("take", 46)}% in your favour (0 = off)</td></tr>
    <tr><td class="l">${chk("exitCross")} Averages cross back</td><td class="l pd">fast crosses slow the other way</td></tr>
    <tr><td class="l">${chk("maExitOn")} Close beyond average</td><td class="l pd">${num("maExitN", 46, 1)} candles</td></tr>
    <tr><td class="l">${chk("rsiExitOn")} RSI extreme</td><td class="l pd">long: above overbought · short: below oversold</td></tr>
    <tr><th class="l" colspan="2">MONEY</th></tr>
    <tr><td class="l">Per trade</td><td class="l pd">${num("size", 46)}% of the account · max ${num("maxPos", 40, 1)} open · ${fx ? "spread" : "fee"} ${num("fee", 56)}%/side</td></tr>
    <tr><td class="l">Leverage</td><td class="l pd">${num("lev", 46, 1)}× (1 = none: no borrowed money)${c.lev > 1 ? ' <span class="dn">losses grow by the same factor</span>' : ""}</td></tr>
    ${fx ? `<tr><td class="l">${chk("swap")} Swap / carry</td><td class="l pd">earn or pay the interest gap each day a position is open (policy rates from MACRO)${c.rates && Object.keys(c.rates).length ? ": " + Object.entries(c.rates).map(([y, r]) => `${esc(y.replace("=X", ""))} long ${r > 0 ? "+" : ""}${pN(r)}%/yr`).join(" · ") : ""}</td></tr>` : ""}
    <tr><td class="l">Starting cash</td><td class="l pd">$${num("cash", 90, 1000)}</td></tr></table>`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-botstart],[data-botstop],[data-sigf],[data-botpick],[data-botview],[data-botnew],[data-botcopy],[data-botdel],[data-sigreset]"); if (!b || !botS.data) return;
  if (b.dataset.sigf) { proSet("ic_pro_sigf", b.dataset.sigf); return render(false); }
  if (b.dataset.botview) { proSet("ic_pro_botview", b.dataset.botview); return render(false); }
  if (b.dataset.botpick && !e.target.closest("button:not([data-botpick])")) { proSet("ic_pro_botcur", b.dataset.botpick); proSet("ic_pro_botview", "one"); botS.del = null; return render(false); }
  const find = (id) => botS.data.bots.find((x) => x.id === id);
  if (b.dataset.botstart) { const c = find(b.dataset.botstart); if (c) c.paper = { from: Math.floor(Date.now() / 1000), cash: c.cash }; }
  if (b.dataset.botstop) { const c = find(b.dataset.botstop); if (c) c.paper = null; }
  if (b.dataset.botnew && botS.data.bots.length < BOT_MAX) { const c = botMk(b.dataset.botnew); botS.data.bots.push(c); proSet("ic_pro_botcur", c.id); }
  if (b.dataset.botcopy && botS.data.bots.length < BOT_MAX) { const o = find(b.dataset.botcopy), c = { ...JSON.parse(JSON.stringify(o)), id: botMk("trend").id, name: o.name + " (copy)", paper: null }; botS.data.bots.push(c); proSet("ic_pro_botcur", c.id); }
  else if (b.dataset.botcopy) toast(`Up to ${BOT_MAX} bots: delete one first.`);
  if (b.dataset.botdel) { if (botS.del !== b.dataset.botdel) { botS.del = b.dataset.botdel; return render(false); } botS.data.bots = botS.data.bots.filter((x) => x.id !== b.dataset.botdel); botS.del = null; }
  if (b.dataset.sigreset) botS.data.sigT = { buy: 60, buyMin: 50, short: 38, shortIdeas: 45, shortTech: 40, cBuy: 65, cShort: 30 };
  botSave(); render(false);
});
document.addEventListener("change", (e) => {
  const st = e.target.closest("[data-sigt]");
  if (st && botS.data) { const v = Number(st.value); if (Number.isFinite(v)) botS.data.sigT[st.dataset.sigt] = Math.max(0, Math.min(100, v)); botSave(); return render(false); }
  const el = e.target.closest("[data-botf]"); if (!el || !botS.cfg) return;
  const k = el.dataset.botf, c = botS.cfg;
  if (c.paper && !["cash", "name"].includes(k)) toast("Rules changed: this bot's paper account is replayed with the new rules from its start time.");
  c[k] = el.type === "checkbox" ? el.checked : k === "syms" ? el.value.toUpperCase().split(/[\s,]+/).map((t) => t.replace(/[^A-Z0-9.^=\-]/g, "")).filter(Boolean).slice(0, 12)
    : ["market", "itv", "trig", "side", "session", "name"].includes(k) ? el.value.slice(0, 40) : Number(el.value);
  if (k === "lev") c.lev = Math.max(1, Math.min(20, Math.round(c.lev) || 1));
  if (k === "market") { const d = { crypto: ["BTC-USD", "ETH-USD", "SOL-USD"], forex: ["THB=X", "EURUSD=X", "JPY=X"], gold: ["GC=F"] }[el.value];
    if (d && !c.syms.some((s) => (el.value === "crypto" ? /-USD$/ : el.value === "forex" ? /=X$/ : /=F$/).test(s))) c.syms = d;
    if (el.value === "forex" && c.fee >= 0.05) c.fee = 0.005; }
  botSave(); render(false);
});
// new candles while the tab is open: proCandles refreshes after 15 min; ask again every minute for hourly / 4-hour bots
setInterval(() => { if (!proIsBot() || !botS.data) return; let any = false;
  botS.data.bots.filter((c) => c.paper && c.itv !== "1d").forEach((c) => c.syms.forEach((t) => { const k = `${botSym(c, t)}|${botRng(c)}|${botItv(c)}`; if (proCand[k] && Date.now() - proCand[k].at > 120e3) { proCand[k].at = 0; any = true; } }));
  if (any) proRefresh(); }, 60e3);
