// Pro F8 CRYPTO: leverage + on-chain + flows (plan module 03). LIVE: your browser asks the free public APIs directly
// (Bybit, OKX, Binance, DefiLlama, CoinMetrics community, mempool.space, CoinGecko). No keys, no robot.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// Not included (needs paid data): liquidation heat maps, labelled whale wallets (Arkham), real-time liquidations feed.
const CR_SYM = ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE"];
const cr = { at: 0, busy: false, d: {} };
async function crJ(u) { const r = await fetch(u); if (!r.ok) throw new Error(r.status); return r.json(); }
async function crLoad() {
  if (cr.busy) return; cr.busy = true;
  const jobs = {
    by: Promise.all(CR_SYM.map((s) => crJ(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${s}USDT`).then((j) => j.result?.list?.[0]).catch(() => null))),
    okx: Promise.all(["BTC", "ETH"].map((s) => crJ(`https://www.okx.com/api/v5/public/funding-rate?instId=${s}-USDT-SWAP`).then((j) => j.data?.[0]).catch(() => null))),
    bn: Promise.all(["BTC", "ETH"].map((s) => crJ(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${s}USDT`).catch(() => null))),
    oi: crJ("https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1d&limit=90").then((j) => j.result?.list || []).catch(() => []),
    fh: crJ("https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=200").then((j) => j.result?.list || []).catch(() => []),
    ls: crJ("https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=1d&limit=60").then((j) => j.result?.list || []).catch(() => []),
    st: crJ("https://stablecoins.llama.fi/stablecoins?includePrices=false").then((j) => j.peggedAssets || []).catch(() => []),
    tvl: crJ("https://api.llama.fi/v2/historicalChainTvl").catch(() => []),
    mv: crJ("https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=CapMVRVCur,CapMrktCurUSD&frequency=1d&page_size=730&paging_from=end").then((j) => j.data || []).catch(() => []),
    fee: crJ("https://mempool.space/api/v1/fees/recommended").catch(() => null),
    hr: crJ("https://mempool.space/api/v1/mining/hashrate/6m").catch(() => null),
    gl: crJ("https://api.coingecko.com/api/v3/global").then((j) => j.data).catch(() => null),
    // round 56: every coin's open interest (8 days) + crowd mood, and on-chain data (CoinMetrics community, free, daily)
    oiAll: Promise.all(CR_SYM.map((s) => crJ(`https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${s}USDT&intervalTime=1d&limit=8`).then((j) => [s, j.result?.list || []]).catch(() => [s, []]))).then(Object.fromEntries),
    lsAll: Promise.all(CR_SYM.map((s) => crJ(`https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=${s}USDT&period=1d&limit=1`).then((j) => [s, j.result?.list || []]).catch(() => [s, []]))).then(Object.fromEntries),
    oc: Promise.all(["btc", "eth"].map((a) => crJ(`https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=${a}&metrics=FlowInExUSD,FlowOutExUSD,SplyExNtv,TxCnt,AdrActCnt&frequency=1d&page_size=400&paging_from=end`).then((j) => [a, j.data || []]).catch(() => [a, []]))).then(Object.fromEntries),
  };
  const keys = Object.keys(jobs), vals = await Promise.all(Object.values(jobs));
  keys.forEach((k, i) => { cr.d[k] = vals[i]; });
  cr.at = Date.now(); cr.busy = false; proRefresh();
}
const crFund = (r) => (r === null || r === undefined ? null : Number(r) * 100);   // per 8h, in %

PRO_VIEWS.crypto = () => {
  if (Date.now() - cr.at > 60e3) crLoad();
  const d = cr.d;
  if (!cr.at) return `<div class="pgrid g2">${proPanel("CRYPTO", "LIVE · PUBLIC APIs", proWait("ASKING BYBIT, OKX, BINANCE, DEFILLAMA, COINMETRICS…"), "s2")}</div>`;
  const src = (s) => `${s} · LIVE ${new Date(cr.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  const by = (d.by || []).filter(Boolean);
  const fcell = (f) => `<td>${f === null ? "—" : `<span class="${f > 0.03 ? "pw" : f < 0 ? "up" : ""}">${f.toFixed(4)}%</span>`}</td>`;
  const lev = `<table class="ptab"><tr><th class="l">PERP</th><th>PRICE</th><th>24H</th><th>FUNDING / 8H</th><th>≈ YEARLY</th><th>OPEN INTEREST</th><th>24H VOLUME</th></tr>
    ${by.map((r) => { const f = crFund(r.fundingRate), ch = Number(r.price24hPcnt) * 100;
      return `<tr><td class="l ph">${esc(r.symbol.replace("USDT", ""))}</td><td>${pN(+r.lastPrice, +r.lastPrice > 100 ? 0 : 4)}</td><td>${pUD(ch, pPct(ch))}</td>${fcell(f)}<td>${f === null ? "—" : pPct(f * 3 * 365, 1)}</td><td>$${pBig(+r.openInterestValue)}</td><td>$${pBig(+r.turnover24h)}</td></tr>`; }).join("")}</table>
    <div class="pnote">Funding = what longs pay shorts every 8 hours on Bybit perpetuals. Above ~0.03% (≈ 33%/year) = crowded longs paying up (amber); negative = shorts paying (often near bottoms).</div>`;
  const cmp = `<table class="ptab"><tr><th class="l">FUNDING / 8H</th><th>BYBIT</th><th>OKX</th><th>BINANCE</th></tr>${["BTC", "ETH"].map((s, i) => `<tr><td class="l ph">${s}</td>${fcell(crFund(by.find((r) => r.symbol === s + "USDT")?.fundingRate))}${fcell(crFund(d.okx?.[i]?.fundingRate))}${fcell(crFund(d.bn?.[i]?.lastFundingRate))}</tr>`).join("")}</table>`;
  const oi = [...(d.oi || [])].reverse().map((x) => [new Date(+x.timestamp).toISOString().slice(0, 10), +x.openInterest]);
  const fh = [...(d.fh || [])].reverse().map((x) => [new Date(+x.fundingRateTimestamp).toISOString().slice(0, 10), +x.fundingRate * 100]);
  const ls = [...(d.ls || [])].reverse().map((x) => [new Date(+x.timestamp).toISOString().slice(0, 10), +x.buyRatio * 100]);
  const lsNow = ls.at(-1)?.[1];
  // stablecoins: total supply now vs 1 day / 1 week / 1 month (new dollars arriving = buying power)
  const st = d.st || [], sum = (k) => st.reduce((s, a) => s + (a[k]?.peggedUSD || 0), 0);
  const sNow = sum("circulating"), sW = sum("circulatingPrevWeek"), sM = sum("circulatingPrevMonth");
  const tvl = (d.tvl || []).slice(-730).map((x) => [new Date(x.date * 1000).toISOString().slice(0, 10), x.tvl / 1e9]);
  const mv = (d.mv || []).map((x) => [x.time.slice(0, 10), +x.CapMVRVCur]).filter((x) => Number.isFinite(x[1]));
  const mvNow = mv.at(-1)?.[1];
  const hr = d.hr?.hashrates?.map((x) => [new Date(x.timestamp * 1000).toISOString().slice(0, 10), x.avgHashrate / 1e18]) || [];
  const gl = d.gl;
  // ---- round 56: WHOLE MARKET (default) or one coin; on-chain on the market view
  const sel = crSel(), selBar = `<div class="psub ptabs">${[["mkt", "WHOLE MARKET"], ...CR_SYM.map((s) => [s, s])].map(([k, l]) => `<button class="${k === sel ? "on" : ""}" data-crsel="${k}">${l}</button>`).join("")}<span class="sp"></span><span class="pd">LIVE · BYBIT · COINGECKO · COINMETRICS · BITCOIN BLOCKS</span></div>`;
  const cards = selBar + (sel === "mkt" ? crMarketView(d) + crOnchain(d) : crCoinCards(sel, d));
  return cards + proDetails("crypto", "funding by exchange, open interest, MVRV, stablecoins, DeFi, network", `<div class="pgrid g4">
    ${proPanel("BTC DOMINANCE", "COINGECKO", gl ? `<div class="pbigw"><div><div class="pbig">${pN(gl.market_cap_percentage?.btc, 1)}%</div><small>OF ALL CRYPTO · TOTAL $${pBig(gl.total_market_cap?.usd)} ${pUD(gl.market_cap_change_percentage_24h_usd, pPct(gl.market_cap_change_percentage_24h_usd))}</small></div></div>` : proSoon("No answer.", ""))}
    ${proPanel("BTC MVRV", "COINMETRICS COMMUNITY · DAILY", mvNow ? `<div class="pbigw"><div><div class="pbig ${mvNow > 3 ? "dn" : mvNow < 1 ? "up" : ""}">${pN(mvNow)}</div><small>MARKET VALUE ÷ REALISED VALUE · ${mvNow > 3 ? "HOT (PAST TOPS > 3.5)" : mvNow < 1 ? "BELOW COST (PAST BOTTOMS)" : "MIDDLE"}</small></div></div>` : proSoon("No answer.", ""))}
    ${proPanel("STABLECOIN SUPPLY", "DEFILLAMA · DAILY", sNow ? `<div class="pbigw"><div><div class="pbig">$${pBig(sNow)}</div><small>1W ${pUD(sNow - sW, (sNow - sW > 0 ? "+" : "−") + "$" + pBig(Math.abs(sNow - sW)))} · 1M ${pUD(sNow - sM, (sNow - sM > 0 ? "+" : "−") + "$" + pBig(Math.abs(sNow - sM)))}</small></div></div>` : proSoon("No answer.", ""))}
    ${proPanel("BTC LONG / SHORT ACCOUNTS", "BYBIT · DAILY", lsNow ? `<div class="pbigw"><div><div class="pbig">${pN(lsNow, 0)}% / ${pN(100 - lsNow, 0)}%</div><small>OF BYBIT ACCOUNTS LONG / SHORT · RETAIL MOOD</small></div></div>` : proSoon("No answer.", ""))}
    </div><div class="pgrid g21">${proPanel("PERPETUALS · LEVERAGE", src("BYBIT"), lev)}${proPanel("FUNDING ACROSS EXCHANGES", src("BYBIT · OKX · BINANCE"), cmp + `<div class="pnote">Big gaps between exchanges = one venue is crowded. Binance answers your browser from Thailand; it blocks US servers, which is why this runs in your browser and not on the robot.</div>`)}</div>
    <div class="pgrid g3">${proPanel("BTC OPEN INTEREST · 90D", "BYBIT · DAILY · BTC", proLine([{ n: "Open interest (BTC)", p: oi }]) + `<div class="pnote">Rising open interest with a rising price = new money betting on it; rising open interest with a falling price = shorts piling in.</div>`)}
    ${proPanel("BTC FUNDING HISTORY", "BYBIT · EVERY 8H", proLine([{ n: "Funding %", p: fh }], { zero: true, fmt: (v) => pN(v, 3) }))}
    ${proPanel("BTC LONG ACCOUNTS %", "BYBIT · DAILY", proLine([{ n: "Long %", p: ls }], { fmt: (v) => pN(v, 0) }))}</div>
    <div class="pgrid g3">${proPanel("MVRV · 2 YEARS", "COINMETRICS COMMUNITY", proLine([{ n: "MVRV", p: mv }]))}
    ${proPanel("DEFI TOTAL VALUE LOCKED", "DEFILLAMA · $ BILLIONS", proLine([{ n: "TVL", p: tvl }], { fmt: (v) => pN(v, 0) }))}
    ${proPanel("BITCOIN NETWORK", "MEMPOOL.SPACE · LIVE", `${proLine([{ n: "Hashrate (EH/s)", p: hr }], { fmt: (v) => pN(v, 0) })}<div class="pkv"><span>Fee now (fast)</span><span>${d.fee?.fastestFee ?? "—"} sat/vB</span><span>Fee (1 hour)</span><span>${d.fee?.hourFee ?? "—"} sat/vB</span></div>
      <div class="pnote">Hashrate = mining power securing the network (falling fast = miners under stress). Labelled whale-wallet tracking needs paid data (not included).</div>`)}</div>`);
};

// ===== round 56: WHOLE MARKET (default) or ONE COIN, + ON-CHAIN (exchange flows, network use, whale transfers) =====
const crSel = () => proStore("ic_pro_crsel", "mkt");
// one coin's 4 cards (the round-55 BTC cards, for any coin in the list)
function crCoinCards(s, d) {
  const r = (d.by || []).find((x) => x?.symbol === s + "USDT"), f = crFund(r?.fundingRate), nm = `${s}`;
  const cLev = f === null ? proCard("n", `LEVERAGE · ${nm}`, "—", "No funding data.") : f > 0.03 ? proCard("a", `LEVERAGE · ${nm}`, "Longs crowded", `Long traders pay ${pN(f, 4)}% every 8 hours (≈${pN(f * 3 * 365, 0)}% a year) to stay long. When it's this high, sharp drops that wipe out leveraged longs are more likely.`)
    : f < 0 ? proCard("g", `LEVERAGE · ${nm}`, "Shorts paying", `Funding is negative (${pN(f, 4)}% / 8h): more traders bet on a fall. Crowded shorts often fuel sharp rises when they have to buy back.`)
    : proCard("g", `LEVERAGE · ${nm}`, "Normal", `Long traders pay ${pN(f, 4)}% every 8 hours (≈${pN(f * 3 * 365, 0)}% a year). Not overheated.`);
  const oiL = [...(d.oiAll?.[s] || [])].reverse(), o7 = oiL.length > 7 ? (+oiL.at(-1).openInterest / +oiL[oiL.length - 8].openInterest - 1) * 100 : null;
  const bc = proCandles(s + "-USD", "3mo"), cl = (bc?.c || []).filter((x) => typeof x === "number"), p7 = cl.length > 7 ? (cl.at(-1) / cl[cl.length - 8] - 1) * 100 : null;
  const cMoney = o7 === null || p7 === null ? proCard("n", "NEW MONEY · 7 DAYS", "—", "Waiting for open interest and price.")
    : o7 >= 0 && p7 >= 0 ? proCard("g", "NEW MONEY · 7 DAYS", "Coming in", `Open bets on ${nm} ${pPct(o7, 1)} while the price rose ${pPct(p7, 1)}: fresh buyers, not just shorts closing.`)
    : o7 >= 0 ? proCard("a", "NEW MONEY · 7 DAYS", "Shorts piling in", `Open bets ${pPct(o7, 1)} while the price fell ${pPct(p7, 1)}: new money is betting on further falls.`)
    : p7 >= 0 ? proCard("a", "NEW MONEY · 7 DAYS", "Shorts closing", `The price rose ${pPct(p7, 1)} but open bets fell ${pPct(o7, 1)}: the rise is mostly shorts buying back.`)
    : proCard("r", "NEW MONEY · 7 DAYS", "Money leaving", `Open bets ${pPct(o7, 1)} and the price ${pPct(p7, 1)}: traders are closing positions and stepping away.`);
  const ls = +((d.lsAll?.[s] || [])[0]?.buyRatio) * 100;
  const cMood = !Number.isFinite(ls) ? proCard("n", `CROWD MOOD · ${nm}`, "—", "No answer from Bybit.") : ls >= 70 ? proCard("a", `CROWD MOOD · ${nm}`, `${pN(ls, 0)}% long`, "Most small traders are betting on a rise. At extremes like this the crowd is often wrong.")
    : ls <= 40 ? proCard("g", `CROWD MOOD · ${nm}`, `${pN(ls, 0)}% long`, "Most small traders are betting on a fall: a contrarian sign that selling may be overdone.") : proCard("g", `CROWD MOOD · ${nm}`, `${pN(ls, 0)}% long`, "Small traders are fairly balanced between long and short.");
  const ch = Number(r?.price24hPcnt) * 100, sd = cl.length > 20 ? pSd(cl.slice(1).map((v, i) => (v / cl[i] - 1) * 100)) : null, x = sd ? Math.abs(ch) / sd : null;
  const cMove = !Number.isFinite(ch) ? proCard("n", "MOVE · 24H", "—", "No price.") : proCard(x >= 2 ? "r" : x >= 1.3 ? "a" : "g", "MOVE · 24H", `${nm} ${pPct(ch, 1)}`, x ? `${x >= 2 ? "Unusually big" : x >= 1.3 ? "Bigger than usual" : "A normal-sized move"}: ${pN(x, 1)}× its normal daily move. <a class="pgo" href="#/charts/${esc(s)}-USD">CHART ›</a>` : "");
  return `<div class="pcards">${cLev}${cMoney}${cMood}${cMove}</div>`;
}
// price direction (breadth) + open bets (new money or leaving) -> one plain sentence
function crStory(up, n, oCh) {
  const pUp = up >= n * 0.66, pDn = up <= n * 0.34, mIn = oCh !== null && oCh > 2, mOut = oCh !== null && oCh < -2;
  if (pUp && mIn) return "Prices up with new money coming in: buyers are in control.";
  if (pUp && mOut) return "Prices are up, but open bets are shrinking: the rise is mostly shorts buying back, not new buyers. Those rallies often fade unless new money follows.";
  if (pDn && mOut) return "Prices down while traders close positions: cutting risk, more an unwind than panic.";
  if (pDn && mIn) return "Prices down while new bets grow: shorts are piling in. If the price turns up, they may be forced to buy back fast.";
  if (pUp) return "Most coins are up, without a big change in open bets.";
  if (pDn) return "Most coins are down, without a big change in open bets.";
  return "No clear direction: coins are moving their own ways.";
}
// the whole market: every coin in the list added up
function crMarketView(d) {
  const by = (d.by || []).filter(Boolean), gl = d.gl;
  const mv = by.map((r) => ({ s: r.symbol.replace("USDT", ""), ch: Number(r.price24hPcnt) * 100, f: crFund(r.fundingRate), oi: +r.openInterestValue })).filter((m) => Number.isFinite(m.ch));
  const up = mv.filter((m) => m.ch > 0).length, dn = mv.length - up, avgF = pMean(mv.map((m) => m.f).filter(Number.isFinite)), hot = [...mv].sort((a, b) => (b.f ?? -9) - (a.f ?? -9))[0];
  const oiT = (k) => CR_SYM.reduce((a, s) => { const l = d.oiAll?.[s] || []; const v = l[k]; const px = +(by.find((r) => r.symbol === s + "USDT")?.lastPrice); return a + (v && px ? +v.openInterest * px : 0); }, 0);
  const o0 = oiT(0), o7 = oiT(7), oCh = o0 && o7 ? (o0 / o7 - 1) * 100 : null;
  const cap = gl?.total_market_cap?.usd, capCh = gl?.market_cap_change_percentage_24h_usd, dom = gl?.market_cap_percentage?.btc;
  const pAvg = pMean(mv.map((m) => m.ch));
  const risk = (dn >= mv.length - 1) + (oCh !== null && oCh < -2) + (capCh < -2), on = (up >= mv.length - 1) + (oCh !== null && oCh > 2) + (capCh > 2);
  const [word, cls] = risk >= 2 ? ["RISK-OFF", "dn"] : on >= 2 ? ["RISK-ON", "up"] : ["MIXED", "pa"];
  const verd = `<div class="pverd"><div><small>CRYPTO MARKET TODAY</small><div class="pbig ${cls}">${word}</div><small>total $${pBig(cap)} · ${pPct(capCh, 1)} in 24h</small></div>
    <div><div class="pverdt">${up} of ${mv.length} big coins are up today${oCh !== null ? `, and open leveraged bets across them are ${pPct(oCh, 1)} over 7 days` : ""}. ${crStory(up, mv.length, oCh)} Bitcoin is ${pN(dom, 1)}% of all crypto: ${dom >= 55 ? "money prefers the biggest, safest coin" : "money is spreading out into smaller coins"}. <span class="pd">Rule-based reading, not a forecast.</span></div></div></div>`;
  const cards = `<div class="pcards">${proCard(up >= dn ? "g" : "r", "BREADTH · 24H", `${up} up · ${dn} down`, `Of the ${mv.length} big coins, ${up} rose. ${dn >= mv.length - 1 ? "When almost everything falls together, it's a market-wide move, not news about one coin." : up >= mv.length - 1 ? "Almost everything is rising together: a market-wide move." : "A split market."}`)}
    ${proCard(avgF > 0.03 ? "a" : "g", "LEVERAGE · ALL COINS", avgF > 0.03 ? "Crowded longs" : avgF < 0 ? "Shorts paying" : "Mostly normal", `Average funding ${pN(avgF, 4)}% / 8h. Most crowded: <b>${esc(hot?.s || "")}</b> (${pN(hot?.f, 4)}%). <span class="pd">Pick a coin above for its details.</span>`)}
    ${proCard(oCh === null ? "n" : oCh >= 0 ? (pAvg >= 0 ? "g" : "a") : pAvg >= 0 ? "a" : "r", "NEW MONEY · ALL COINS · 7D", oCh === null ? "—" : oCh >= 0 ? "Coming in" : "Leaving", oCh === null ? "Waiting for open interest." : `Open bets across the ${CR_SYM.length} coins ${pPct(oCh, 1)} in 7 days ($${pBig(o7)} → $${pBig(o0)}).`)}
    ${proCard(dom >= 58 ? "a" : "g", "WHERE MONEY SITS", `BTC ${pN(dom, 1)}%`, `Bitcoin's share of the whole crypto market. High and rising = "flight to quality" inside crypto; falling = money moving into smaller, riskier coins ("alt season").`)}</div>`;
  const heat = `<div class="pheat">${mv.map((m) => `<button data-crsel="${esc(m.s)}" style="background:color-mix(in srgb, ${m.ch >= 0 ? "var(--pup)" : "var(--pdn)"} ${Math.min(90, 25 + Math.abs(m.ch) * 12)}%, var(--ppn))"><b>${esc(m.s)}</b>${pPct(m.ch, 1)}</button>`).join("")}<span class="pd">24h move of every coin · click one to open it</span></div>`;
  return verd + cards + heat;
}
// ON-CHAIN: CoinMetrics community (free, daily, BTC + ETH) + whale transfers (robot, every Bitcoin block)
function crOnchain(d) {
  const oc = d.oc || {}, A = (a, k) => (oc[a] || []).map((x) => [x.time.slice(0, 10), +x[k]]).filter((x) => Number.isFinite(x[1]));
  const net = (a) => { const i = A(a, "FlowInExUSD"), o = new Map(A(a, "FlowOutExUSD")); return i.filter(([t]) => o.has(t)).map(([t, v]) => [t, (v - o.get(t)) / 1e6]); };
  const bN = net("btc"), eN = net("eth"), b1 = bN.at(-1), b7 = bN.slice(-7).reduce((s, x) => s + x[1], 0);
  const sx = A("btc", "SplyExNtv"), s0 = sx.at(-1)?.[1], s30 = sx.at(-31)?.[1], sCh = s0 && s30 ? (s0 / s30 - 1) * 100 : null;
  const tx = A("btc", "TxCnt"), ad = A("btc", "AdrActCnt"), t0 = tx.at(-1)?.[1], tA = tx.length > 90 ? pMean(tx.slice(-91, -1).map((x) => x[1])) : null, a0 = ad.at(-1)?.[1];
  const W = proGet("whales"), now = Date.now() / 1000, w24 = (W?.big || []).filter((x) => now - x[0] <= 86400);
  const blk = W?.blocks || [], per = (from, to) => blk.filter((b) => now - b[1] <= from && now - b[1] > to).reduce((s, b) => s + b[2], 0);
  const days = blk.length ? (now - blk[0][1]) / 86400 : 0, n24 = per(86400, 0), avg7 = days >= 2 ? per(7 * 86400, 0) / Math.min(7, days) : null;
  const btcPx = +((d.by || []).find((r) => r?.symbol === "BTCUSDT")?.lastPrice) || null;
  const grp = []; [...w24].sort((a, b) => b[1] - a[1] || b[3] - a[3]).forEach((x) => { const g = grp.at(-1);
    if (g && g.h === x[1] && Math.abs(x[3] - g.last) / g.last <= 0.06) { g.n++; g.sum += x[3]; g.last = x[3]; } else grp.push({ h: x[1], t: x[0], id: x[2], n: 1, sum: x[3], last: x[3], top: x[3] }); });
  grp.sort((a, b) => b.sum - a.sum);
  const cards = `<div class="pcards">${proCard(!b1 ? "n" : b1[1] > 0 ? "a" : "g", "EXCHANGE FLOWS · BTC · 1 DAY", b1 ? `${b1[1] >= 0 ? "+" : "−"}$${pBig(Math.abs(b1[1]) * 1e6)} net ${b1[1] >= 0 ? "in" : "out"}` : "—", b1 ? `${esc(b1[0])}. Coins moving <b>onto</b> exchanges are usually about to be sold; moving <b>off</b> = taken home to hold. Last 7 days: ${b7 >= 0 ? "+" : "−"}$${pBig(Math.abs(b7) * 1e6)} net ${b7 >= 0 ? "in (mild selling pressure)" : "out (supportive)"}.` : "No CoinMetrics data.")}
    ${proCard(sCh === null ? "n" : sCh < 0 ? "g" : "a", "BTC HELD ON EXCHANGES", s0 ? `${pN(s0 / 1e6, 2)}M BTC ${sCh < 0 ? "▼" : "▲"}` : "—", sCh === null ? "" : `${pPct(sCh, 1)} in 30 days. ${sCh < 0 ? "Fewer coins sitting ready to sell: holders are taking coins off exchanges, a long-term supportive sign." : "More coins sitting on exchanges, ready to be sold."}`)}
    ${proCard("g", "NETWORK USE · BTC", t0 ? `${pBig(t0)} tx / day` : "—", t0 ? `${pBig(a0)} active addresses. Transactions ${tA ? `${pPct((t0 / tA - 1) * 100, 0)} vs the 90-day average` : ""}: ${tA && t0 / tA > 1.25 ? "unusually busy." : tA && t0 / tA < 0.8 ? "quiet." : "normal activity."}` : "")}
    ${proCard(!W ? "n" : avg7 && n24 > avg7 * 1.3 ? "a" : "g", `WHALE TRANSFERS · ${W?.min || 100}+ BTC · 24H`, W ? `${grp.length} moves` : "—", W ? `${n24} transactions, grouped into ${grp.length} separate moves (similar transfers in one block counted once). Transactions sending ${W.min || 100}+ BTC to one address in the last 24h${avg7 ? `, vs about ${pN(avg7, 0)} a day this week` : days < 2 ? ` (the scan started ${pN(days * 24, 0)} h ago: a weekly average appears after 2 days)` : ""}. Big holders moving coins; the owner isn't known.` : "Whale scan starts with the robot (every 30 min).")}</div>`;
  const roll = (a) => a.map((x, i) => [x[0], i >= 6 ? a.slice(i - 6, i + 1).reduce((t, y) => t + y[1], 0) : null]).filter((x) => x[1] !== null);
  const chart = proLine([{ n: "BTC: 7-day net into exchanges ($M)", p: roll(bN).slice(-365) }, { n: "ETH: 7-day net into exchanges ($M)", p: roll(eN).slice(-365) }], { zero: true, fmt: (v) => pN(v, 0) });
  const list = W ? `<table class="ptab pwrapt"><tr><th class="l">TIME (BKK)</th><th>BTC</th><th>≈ USD</th><th class="l">WHAT</th><th class="l">BLOCK</th><th></th></tr>${grp.slice(0, 14).map((g) => `<tr><td class="l">${esc(bDate(g.t, "60m"))}</td><td class="ph">${pN(g.sum, 1)}</td><td>${btcPx ? "$" + pBig(g.sum * btcPx) : "—"}</td>
      <td class="l">${g.n > 2 ? `<span class="ptag">${g.n} SIMILAR</span> ${g.n} × ~${pN(g.sum / g.n, 0)} BTC, likely one wallet splitting coins` : g.n === 2 ? "2 transfers" : "one transfer"}</td><td class="l pd">#${g.h}</td><td><a class="pgo" href="https://mempool.space/${g.n > 1 ? "block/" + g.h : "tx/" + esc(g.id)}" target="_blank" rel="noopener">VIEW ↗</a></td></tr>`).join("") || '<tr><td class="l pd" colspan="6">None in the last 24 hours.</td></tr>'}</table>` : proSoon("No whale scan yet.", "");
  return `<div class="psec">ON-CHAIN · WHAT THE BLOCKCHAINS SHOW</div>${cards}<div class="pgrid g21">${proPanel("EXCHANGE NET FLOW · 1 YEAR", "COINMETRICS COMMUNITY · DAILY · $ MILLIONS", chart + `<div class="pmean"><span class="ptag">HOW TO READ</span><span>Each point = the last 7 days added up. Above 0 = more coins moved <b>onto</b> exchanges than off (often ahead of selling). Below 0 = coins leaving exchanges to be held. Many days in a row on one side matters more than one day.</span></div>`)}
    ${proPanel("WHALE TRANSFERS · LAST 24H · BIGGEST FIRST", `BITCOIN BLOCKS · ${W?._local ? "LOCAL PREVIEW" : "ROBOT"} ${pAgo(W?.updated || W?._at)}`, list + `<div class="pmean"><span class="ptag">LIMIT</span><span>One transaction can be an exchange moving coins between its own wallets (many similar sizes in one block usually are), so a big transfer isn't automatically a buy or a sell. Who owns a wallet needs paid data (not included).</span></div>`)}</div>`;
}
document.addEventListener("click", (e) => { const b = e.target.closest("[data-crsel]"); if (!b) return; proSet("ic_pro_crsel", b.dataset.crsel); render(false); });
