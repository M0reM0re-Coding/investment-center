// Custom indicators (TradingView-style, CDC, PVO, ZigZag, RSI div) + active list.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// ----- custom indicators that work like TradingView's (registered once) -----
const srcOf = (k, s) => (s === "open" ? k.open : s === "high" ? k.high : s === "low" ? k.low : s === "hl2" ? (k.high + k.low) / 2 : s === "hlc3" ? (k.high + k.low + k.close) / 3 : s === "ohlc4" ? (k.open + k.high + k.low + k.close) / 4 : k.close);
const maBy = (t, a, n) => (t === "SMA" ? sma(a, n) : t === "RMA" ? rma(a, n) : t === "WMA" ? wma(a, n) : ema(a, n));
// price tag on the right price scale, filled with the drawing's colour (text dark or white, whichever reads better)
const ktInk = (hex) => { const h = String(hex || "").replace("#", ""); if (h.length < 6) return "#fff"; const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#131722" : "#fff"; };
const ktAxisTag = (y, price, color, precision) => ({ type: "text", ignoreEvent: true, attrs: { x: 0, y, text: Number(price).toFixed(precision?.price ?? 2), align: "left", baseline: "middle" },
  styles: { style: "fill", color: ktInk(color), size: 11.5, family: "Inter, sans-serif", weight: 700, backgroundColor: color, borderColor: color, borderSize: 1, borderRadius: 2, paddingLeft: 4, paddingRight: 4, paddingTop: 3, paddingBottom: 3 } });
function kcRegister() {
  const K = window.klinecharts;
  const tip = ({ indicator, defaultStyles }) => {   // name + inputs, then hide · settings · remove (our ids, so Pro's own handler ignores them)
    const ic = defaultStyles.tooltip.icons || [], mk = (i, id) => (ic[i] ? { ...ic[i], id } : null);
    const icons = [indicator.visible ? mk(1, "ic_hide") : mk(0, "ic_show"), mk(2, "ic_set"), mk(3, "ic_del")].filter(Boolean);
    return { name: indicator.shortName, calcParamsText: indicator.calcParams.length ? ` ${indicator.calcParams.join(" ")}` : "", icons, values: null };
  };
  K.registerIndicator({
    name: "TV_MACD", shortName: "MACD", calcParams: [12, 26, 9], precision: 2, extendData: clone(IND_DEF.TV_MACD.ext),
    figures: [
      { key: "hist", title: "Hist: ", type: "bar", baseValue: 0, styles: (d, ind) => { const c = ind.extendData.col, v = d.current?.indicatorData?.hist, p = d.prev?.indicatorData?.hist; if (v === undefined) return {};
        const col = v >= 0 ? (p === undefined || v >= p ? c.h0 : c.h1) : (p === undefined || v > p ? c.h2 : c.h3); return { style: "fill", color: col, borderColor: col }; } },
      { key: "macd", title: "MACD: ", type: "line" }, { key: "signal", title: "Signal: ", type: "line" }],
    calc: (list, ind) => {
      const [f, s, g] = ind.calcParams, x = ind.extendData, a = list.map((k) => srcOf(k, x.src));
      const fa = maBy(x.osc, a, f), sa = maBy(x.osc, a, s), m = fa.map((v, i) => (v === null || sa[i] === null ? null : v - sa[i]));
      const sg0 = maBy(x.sig, m.map((v) => v ?? 0), g), first = m.findIndex((v) => v !== null), sg = sg0.map((v, i) => (i < first + g - 1 ? null : v));
      return m.map((v, i) => { const o = {}; if (v === null) return o; if (x.show.macd) o.macd = v; if (sg[i] !== null) { if (x.show.signal) o.signal = sg[i]; if (x.show.hist) o.hist = v - sg[i]; } return o; });
    },
    draw: ({ ctx, indicator, bounding, yAxis }) => { const x = indicator.extendData; if (x.show.zero) { const y = yAxis.convertToPixel(0); ctx.save(); ctx.strokeStyle = x.col.zero; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(bounding.width, y); ctx.stroke(); ctx.restore(); } return false; },
    createTooltipDataSource: tip,
  });
  K.registerIndicator({
    name: "TV_RSI", shortName: "RSI", calcParams: [14, 14, 2], precision: 2, minValue: 0, maxValue: 100, extendData: clone(IND_DEF.TV_RSI.ext),
    figures: [{ key: "rsi", title: "RSI: ", type: "line" }, { key: "ma", title: "MA: ", type: "line" }, { key: "bbu", title: "BB+: ", type: "line" }, { key: "bbl", title: "BB−: ", type: "line" }],
    calc: (list, ind) => {
      const [n, sn, sd] = ind.calcParams, x = ind.extendData, r = rsiOf(list.map((k) => srcOf(k, x.src)), n);
      const smt = x.smooth === "None" ? [] : maBy(x.smooth === "SMA + Bollinger Bands" ? "SMA" : x.smooth, r.map((v) => v ?? 50), sn);
      return r.map((v, i) => { const o = {}; if (v === null) return o; if (x.show.rsi) o.rsi = v; if (smt[i] !== null && smt[i] !== undefined && i >= n + sn && x.show.ma) { o.ma = smt[i];
        if (x.smooth === "SMA + Bollinger Bands") { const w = r.slice(i - sn + 1, i + 1), mean = smt[i], sdv = Math.sqrt(w.reduce((a, z) => a + (z - mean) ** 2, 0) / sn); o.bbu = mean + sd * sdv; o.bbl = mean - sd * sdv; } } return o; });
    },
    draw: ({ ctx, indicator, bounding, yAxis }) => {
      const x = indicator.extendData, [u, mid, lo] = x.bands, yu = yAxis.convertToPixel(u), yl = yAxis.convertToPixel(lo), ym = yAxis.convertToPixel(mid);
      ctx.save();
      if (x.show.fill) { ctx.globalAlpha = 0.1; ctx.fillStyle = x.col.fill; ctx.fillRect(0, yu, bounding.width, yl - yu); ctx.globalAlpha = 1; }
      if (x.show.bands) { ctx.strokeStyle = x.col.bands; [[yu, [4, 4]], [ym, [1, 4]], [yl, [4, 4]]].forEach(([y, d]) => { ctx.setLineDash(d); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(bounding.width, y); ctx.stroke(); }); }
      ctx.restore(); return false;
    },
    createTooltipDataSource: tip,
  });
  K.registerIndicator({
    // Volume like TradingView: bars along the bottom of the price chart (bottom 20%, own scale), not a separate panel.
    // No figures -> the volume numbers never stretch the price scale; we draw the bars ourselves.
    name: "TV_VOL", shortName: "Vol", calcParams: [20], precision: 0, extendData: clone(IND_DEF.TV_VOL.ext), figures: [],
    calc: (list, ind) => { const v = list.map((k) => k.volume || 0), m = sma(v, ind.calcParams[0] || 20); return v.map((x, i) => ({ vol: x, ma: m[i] })); },
    draw: ({ ctx, kLineDataList, indicator, visibleRange, bounding, barSpace, xAxis }) => {
      const x = indicator.extendData, res = indicator.result || [], H = bounding.height * 0.2, base = bounding.height;
      let mx = 0; for (let i = visibleRange.from; i < visibleRange.to; i++) mx = Math.max(mx, res[i]?.vol || 0);
      if (!mx) return true;
      const w = Math.max(1, barSpace.gapBar), pts = [];
      for (let i = visibleRange.from; i < visibleRange.to; i++) {
        const k = kLineDataList[i], p = kLineDataList[i - 1], v = res[i]?.vol || 0; if (!k) continue;
        const up = x.prev && p ? k.close >= p.close : k.close >= k.open, cx = xAxis.convertToPixel(i), h = (v / mx) * H;
        ctx.fillStyle = (up ? x.col.up : x.col.dn) + "80"; ctx.fillRect(cx - w / 2, base - h, w, h);
        if (x.showMA && res[i]?.ma !== null && res[i]?.ma !== undefined) pts.push([cx, base - (res[i].ma / mx) * H]);
      }
      if (pts.length > 1) { ctx.strokeStyle = x.col.ma; ctx.lineWidth = 1; ctx.beginPath(); pts.forEach(([a, b], j) => (j ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.stroke(); }
      return true;
    },
    createTooltipDataSource: (d) => {
      const t = tip(d), i = d.crosshair?.dataIndex ?? (d.indicator.result || []).length - 1, r = d.indicator.result?.[i], x = d.indicator.extendData;
      const k = d.kLineDataList[i], p = d.kLineDataList[i - 1], up = k && (x.prev && p ? k.close >= p.close : k.close >= k.open);
      const vals = r ? [{ title: { text: "", color: "#888" }, value: { text: Number(r.vol || 0).toLocaleString("en-US"), color: up ? x.col.up : x.col.dn } }] : [];
      if (r && x.showMA && r.ma !== null && r.ma !== undefined) vals.push({ title: { text: "MA: ", color: "#888" }, value: { text: Math.round(r.ma).toLocaleString("en-US"), color: x.col.ma } });
      return { ...t, values: vals };
    },
  });
  // ===== round 47: CDC ActionZone V3, Percentage Volume Oscillator, Zig Zag, RSI divergence =====
  const LBL = (ctx, x, y, text, bg, fg = "#fff", up = true) => {   // small rounded label with an arrow tip
    ctx.font = "700 11px Inter, sans-serif"; const w = ctx.measureText(text).width + 10, h = 17, yy = up ? y - h - 5 : y + 5;
    ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, yy, w, h, 3) : ctx.rect(x - w / 2, yy, w, h); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 4, up ? yy + h : yy); ctx.lineTo(x + 4, up ? yy + h : yy); ctx.lineTo(x, up ? yy + h + 4 : yy - 4); ctx.fill();
    ctx.fillStyle = fg; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, x, yy + h / 2 + 0.5);
  };
  // CDC ActionZone V3 2020 (piriya33): AP = EMA(OHLC4, 2); Fast = EMA(AP, 12); Slow = EMA(AP, 26); zone colours + Buy / Sell on the cross
  K.registerIndicator({
    name: "TV_CDC", shortName: "CDC ActionZone", calcParams: [12, 26], precision: 2, extendData: clone(IND_DEF.TV_CDC.ext),
    figures: [{ key: "fast", title: "Fast: ", type: "line" }, { key: "slow", title: "Slow: ", type: "line" }],
    styles: { lines: [LN("#FF5252", 1), LN("#2962FF", 1)] },
    calc: (list, ind) => {
      const src = list.map((k) => (k.open + k.high + k.low + k.close) / 4), ap = ema(src, 2).map((v, i) => v ?? src[i]), f = ema(ap, ind.calcParams[0]), s = ema(ap, ind.calcParams[1]);
      return list.map((_, i) => {
        if (f[i] === null || s[i] === null || ap[i] === null) return {};
        const bull = f[i] > s[i], p = ap[i], zone = bull ? (p > f[i] ? "g" : p > s[i] ? "y" : "o") : (p < f[i] ? "r" : p < s[i] ? "b" : "lb");
        const pb = i && f[i - 1] !== null && s[i - 1] !== null ? f[i - 1] > s[i - 1] : bull;
        return { fast: f[i], slow: s[i], zone, bull, sig: bull && !pb ? "buy" : !bull && pb ? "sell" : null };
      });
    },
    draw: ({ ctx, kLineDataList, indicator, visibleRange, barSpace, xAxis, yAxis }) => {
      const x = indicator.extendData, res = indicator.result || [], Z = { g: "#00C853", y: "#FFD600", o: "#FF9100", r: "#FF1744", b: "#2962FF", lb: "#00B8D4" };
      for (let i = Math.max(1, visibleRange.from); i < visibleRange.to; i++) {   // shade between the lines: green = bullish, red = bearish
        const a = res[i - 1], b = res[i]; if (!a?.fast || !b?.fast) continue;
        const x0 = xAxis.convertToPixel(i - 1), x1 = xAxis.convertToPixel(i);
        ctx.fillStyle = b.bull ? "rgba(0,200,83,0.12)" : "rgba(255,23,68,0.12)";
        ctx.beginPath(); ctx.moveTo(x0, yAxis.convertToPixel(a.fast)); ctx.lineTo(x1, yAxis.convertToPixel(b.fast)); ctx.lineTo(x1, yAxis.convertToPixel(b.slow)); ctx.lineTo(x0, yAxis.convertToPixel(a.slow)); ctx.closePath(); ctx.fill();
      }
      const w = Math.max(1, barSpace.gapBar), hw = w / 2;
      for (let i = visibleRange.from; i < visibleRange.to; i++) {
        const k = kLineDataList[i], r = res[i]; if (!k || !r?.zone) continue;
        const cx = xAxis.convertToPixel(i);
        if (x.bars) {   // colour the candles by zone, like the script's barcolor()
          const c = Z[r.zone], yo = yAxis.convertToPixel(k.open), yc = yAxis.convertToPixel(k.close);
          ctx.fillStyle = c; ctx.fillRect(cx - 0.5, yAxis.convertToPixel(k.high), 1, yAxis.convertToPixel(k.low) - yAxis.convertToPixel(k.high));
          ctx.fillRect(cx - hw, Math.min(yo, yc), w, Math.max(1, Math.abs(yc - yo)));
        }
        if (x.sig && r.sig) r.sig === "buy" ? LBL(ctx, cx, yAxis.convertToPixel(k.low), "Buy", "#00C853", "#fff", false) : LBL(ctx, cx, yAxis.convertToPixel(k.high), "Sell", "#FF1744", "#fff", true);
      }
      return false;
    },
    createTooltipDataSource: tip,
  });
  // Percentage Volume Oscillator: (EMA(vol, fast) - EMA(vol, slow)) / EMA(vol, slow) x 100, signal EMA, histogram
  K.registerIndicator({
    name: "TV_PVO", shortName: "PVO", calcParams: [12, 26, 9], precision: 2, extendData: clone(IND_DEF.TV_PVO.ext),
    figures: [{ key: "hist", title: "Hist: ", type: "bar", baseValue: 0, styles: (d) => { const v = d.current?.indicatorData?.hist, p = d.prev?.indicatorData?.hist; if (v === undefined) return {};
        const c = v >= 0 ? (p !== undefined && v < p ? "#B2DFDB" : "#26A69A") : (p !== undefined && v > p ? "#FFCDD2" : "#FF5252"); return { style: "fill", color: c, borderColor: c }; } },
      { key: "pvo", title: "PVO: ", type: "line" }, { key: "sig", title: "Signal: ", type: "line" }],
    styles: { lines: [LN("#2962FF", 1), LN("#FF6D00", 1)] },
    calc: (list, ind) => {
      const [f, s, g] = ind.calcParams, v = list.map((k) => k.volume || 0), ef = ema(v, f), es = ema(v, s);
      const pvo = v.map((_, i) => (ef[i] !== null && es[i] ? ((ef[i] - es[i]) / es[i]) * 100 : null)), first = pvo.findIndex((x) => x !== null);
      const sg = first < 0 ? [] : [...Array(first).fill(null), ...ema(pvo.slice(first), g)];
      return v.map((_, i) => (pvo[i] === null ? {} : { pvo: pvo[i], ...(sg[i] !== null && sg[i] !== undefined ? { sig: sg[i], hist: pvo[i] - sg[i] } : {}) }));
    },
    createTooltipDataSource: tip,
  });
  // Zig Zag: joins swing highs and lows that are at least "deviation %" apart and "depth" bars apart; labels price + % move
  const zigzag = (list, dev) => {   // dev = 0.05 for 5%: a swing ends when price turns back by that much
    const piv = []; if (!list.length) return { piv, last: [0, 0] };
    let dir = 0, hi = list[0].high, hiI = 0, lo = list[0].low, loI = 0;
    for (let i = 1; i < list.length; i++) {
      const k = list[i];
      if (dir === 0) {
        if (k.high > hi) { hi = k.high; hiI = i; } if (k.low < lo) { lo = k.low; loI = i; }
        if (hi >= lo * (1 + dev)) { if (hiI > loI) { piv.push([loI, lo]); dir = 1; } else { piv.push([hiI, hi]); dir = -1; } }
        continue;
      }
      if (dir === 1) { if (k.high >= hi) { hi = k.high; hiI = i; } else if (k.low <= hi * (1 - dev)) { piv.push([hiI, hi]); dir = -1; lo = k.low; loI = i; } }
      else { if (k.low <= lo) { lo = k.low; loI = i; } else if (k.high >= lo * (1 + dev)) { piv.push([loI, lo]); dir = 1; hi = k.high; hiI = i; } }
    }
    return { piv, last: dir === 1 ? [hiI, hi] : [loI, lo] };
  };
  K.registerIndicator({
    name: "TV_ZZ", shortName: "Zig Zag", calcParams: [5], precision: 2, extendData: clone(IND_DEF.TV_ZZ.ext), figures: [],
    calc: (list, ind) => { const z = zigzag(list, (ind.calcParams[0] || 5) / 100); ind.extendData._z = z; return list.map(() => ({})); },
    draw: ({ ctx, indicator, visibleRange, xAxis, yAxis }) => {
      const x = indicator.extendData, z = x._z; if (!z) return true;
      const pts = [...z.piv, z.last], col = x.color || "#2962FF";
      ctx.strokeStyle = col; ctx.lineWidth = x.w || 2; ctx.beginPath();
      let started = false;
      pts.forEach(([i, v], j) => { if (j && pts[j - 1][0] > visibleRange.to + 50) return; const px = xAxis.convertToPixel(i), py = yAxis.convertToPixel(v); if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py); });
      ctx.stroke();
      if (x.labels) pts.forEach(([i, v], j) => {
        if (!j || i < visibleRange.from || i > visibleRange.to) return;
        const pv = pts[j - 1][1], up = v > pv, ch = ((v - pv) / pv) * 100;
        LBL(ctx, xAxis.convertToPixel(i), yAxis.convertToPixel(v), `${Number(v).toFixed(2)} (${ch > 0 ? "+" : ""}${ch.toFixed(1)}%)`, up ? "#089981" : "#F23645", "#fff", up);
      });
      return true;
    },
    createTooltipDataSource: (d) => ({ ...tip(d), values: [] }),
  });
  // RSI with divergence (TradingView's Divergence rules: pivots 5 left / 5 right, 5-60 bars apart)
  K.registerIndicator({
    name: "TV_RSIDIV", shortName: "RSI divergence", calcParams: [14, 5, 5], precision: 2, minValue: 0, maxValue: 100, extendData: clone(IND_DEF.TV_RSIDIV.ext),
    figures: [{ key: "rsi", title: "RSI: ", type: "line" }],
    styles: { lines: [LN("#7E57C2", 1)] },
    calc: (list, ind) => {
      const [n, L, R] = ind.calcParams, c = list.map((k) => k.close), r = rsiOf(c, n), out = r.map((v) => (v === null || v === undefined ? {} : { rsi: v }));
      const isLow = (i) => { for (let k = i - L; k <= i + R; k++) if (k !== i && (r[k] === null || r[k] === undefined || r[k] < r[i])) return false; return r[i] !== null; };
      const isHigh = (i) => { for (let k = i - L; k <= i + R; k++) if (k !== i && (r[k] === null || r[k] === undefined || r[k] > r[i])) return false; return r[i] !== null; };
      const div = []; let pl = null, ph = null;
      for (let i = L; i < list.length - R; i++) {
        if (isLow(i)) { if (pl !== null && i - pl >= 5 && i - pl <= 60) {
            if (r[i] > r[pl] && list[i].low < list[pl].low) div.push({ a: pl, b: i, t: "bull" });
            else if (ind.extendData.hidden && r[i] < r[pl] && list[i].low > list[pl].low) div.push({ a: pl, b: i, t: "hbull" }); } pl = i; }
        if (isHigh(i)) { if (ph !== null && i - ph >= 5 && i - ph <= 60) {
            if (r[i] < r[ph] && list[i].high > list[ph].high) div.push({ a: ph, b: i, t: "bear" });
            else if (ind.extendData.hidden && r[i] > r[ph] && list[i].high < list[ph].high) div.push({ a: ph, b: i, t: "hbear" }); } ph = i; }
      }
      ind.extendData._div = div;
      return out;
    },
    draw: ({ ctx, indicator, visibleRange, xAxis, yAxis, bounding }) => {
      const x = indicator.extendData, res = indicator.result || [];
      [70, 30].forEach((v) => { const y = yAxis.convertToPixel(v); ctx.strokeStyle = "rgba(120,123,134,0.6)"; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(bounding.width, y); ctx.stroke(); });
      ctx.setLineDash([]);
      (x._div || []).forEach(({ a, b, t }) => {
        if (b < visibleRange.from || a > visibleRange.to) return;
        const bull = t === "bull" || t === "hbull", col = bull ? "#089981" : "#F23645", x0 = xAxis.convertToPixel(a), x1 = xAxis.convertToPixel(b), y0 = yAxis.convertToPixel(res[a].rsi), y1 = yAxis.convertToPixel(res[b].rsi);
        ctx.strokeStyle = col; ctx.lineWidth = 2; if (t[0] === "h") ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
        LBL(ctx, x1, y1, t === "bull" ? "Bull" : t === "bear" ? "Bear" : t === "hbull" ? "H Bull" : "H Bear", col, "#fff", !bull);
      });
      return false;
    },
    createTooltipDataSource: tip,
  });
  // Compare lines: TV_CMP1..5 (values = our close at the first candle on screen x their % change, so the % scale lines up)
  for (let n = 1; n <= 5; n++) K.registerIndicator({
    name: `TV_CMP${n}`, shortName: "", calcParams: [], precision: 2, figures: [{ key: "v", title: "", type: "line" }],
    calc: (list, ind) => {
      const x = ind.extendData || {}, cl = x.closes || []; let b = Math.max(0, Math.min(list.length - 1, x.base || 0));
      while (b < list.length - 1 && (cl[b] === null || cl[b] === undefined)) b++;
      const ref = cl[b], mref = list[b]?.close;
      return list.map((_, i) => (cl[i] === null || cl[i] === undefined || !ref || !mref ? {} : { v: (mref * cl[i]) / ref }));
    },
    createTooltipDataSource: ({ indicator, crosshair }) => {
      const x = indicator.extendData || {}, cl = x.closes || [], i = crosshair?.dataIndex ?? cl.length - 1; let b = x.base || 0;
      while (b < cl.length - 1 && (cl[b] === null || cl[b] === undefined)) b++;
      const v = cl[i], pc = v && cl[b] ? (v / cl[b] - 1) * 100 : null;
      return { name: x.sym || "", calcParamsText: "", icons: [], values: v ? [{ title: { text: "", color: x.color }, value: { text: `${fmtPx(v)}${pc === null ? "" : ` (${pc > 0 ? "+" : ""}${pc.toFixed(2)}%)`}`, color: x.color } }] : [] };
    },
  });
  // Fibonacci retracement with your levels, colours and labels (replaces the library's fixed one; settings: double-click it)
  K.registerOverlay({
    name: "fibonacciLine", totalStep: 3, needDefaultPointFigure: true, needDefaultXAxisFigure: true, needDefaultYAxisFigure: false,
    createYAxisFigures: ({ coordinates, overlay, precision }) => {
      if (coordinates.length < 2 || overlay.points.length < 2) return [];
      const f = overlay.extendData || prefs().fib, [a, b] = coordinates, p1 = overlay.points[0].value, p2 = overlay.points[1].value;
      if (f.axis === 0 || f.axis === false) return [];
      return (f.levels || []).filter((l) => l[2]).map(([lv, col]) => ktAxisTag(b.y + (a.y - b.y) * lv, p2 + (p1 - p2) * lv, col, precision));
    },
    createPointFigures: ({ coordinates, overlay, precision }) => {
      if (coordinates.length < 2) return [];
      const f = overlay.extendData || prefs().fib, [a, b] = coordinates, p1 = overlay.points[0].value, p2 = overlay.points[1].value;
      const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), out = [];
      if (f.trend?.on) out.push({ type: "line", attrs: { coordinates: [a, b] }, styles: { color: f.trend.color, style: f.trend.dash ? "dashed" : "solid", dashedValue: [5, 4] } });
      (f.levels || []).filter((l) => l[2]).forEach(([lv, col]) => {
        const price = p2 + (p1 - p2) * lv, y = b.y + (a.y - b.y) * lv;
        out.push({ type: "line", attrs: { coordinates: [{ x: x1, y }, { x: x2, y }] }, styles: { color: col } });
        const txt = `${f.pct ? `${+(lv * 100).toFixed(2)}%` : lv}${f.prices ? ` (${Number(price).toFixed(precision.price)})` : ""}`;
        out.push({ type: "text", ignoreEvent: true, attrs: { x: (x1 + x2) / 2, y: y - 2, text: txt, align: "center", baseline: "bottom" }, styles: { color: col, size: f.size || 12, family: "Inter, sans-serif", backgroundColor: "transparent", paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0 } });
      });
      return out;
    },
  });
}

// ----- active indicators on the chart -----
const isMain = (n) => IND_MAIN.includes(n);
const LN = (color, size = 1) => ({ style: "solid", smooth: false, size, color, dashedValue: [2, 2] });   // a full line style (the library needs every field)
function kcIndValue(e) {
  const st = e.style || {};
  const x = e.ext;
  const lines = e.name === "TV_MACD" ? [LN(x.col.macd, x.w.macd), LN(x.col.signal, x.w.signal)] : e.name === "TV_RSI" ? [LN(x.col.rsi, x.w.rsi), LN(x.col.ma, x.w.ma), LN(x.col.ma), LN(x.col.ma)]
    : e.name === "TV_VOL" ? [LN(x.col.ma)] : st.lines ? st.lines.map((l) => LN(l.color, l.size || 1)) : null;
  return { name: e.name, calcParams: e.params, ...(x ? { extendData: clone(x) } : {}), ...(lines ? { styles: { lines } } : {}) };
}
function kcAddInd(e, save = true) {
  const c = kc.chart; if (!c) return;
  const main = isMain(e.name) || e.name === "TV_VOL", h = 110;   // Volume sits on the price chart, like TradingView
  const paneId = c.createIndicator(kcIndValue(e), main, main ? { id: "candle_pane" } : { height: h });
  if (!paneId) return;
  kc.active.push({ ...e, paneId });
  kcVisApply();
  if (save) { prefs().list = kc.active.map(({ paneId: _, ...x }) => x); kcSavePrefs(); }
}
function kcRemoveInd(name) {
  const i = kc.active.findIndex((a) => a.name === name); if (i < 0) return;
  kc.chart.removeIndicator(kc.active[i].paneId, name); kc.active.splice(i, 1);
  prefs().list = kc.active.map(({ paneId: _, ...x }) => x); kcSavePrefs();
}
function kcUpdateInd(name, e) {
  const a = kc.active.find((x) => x.name === name); if (!a) return;
  Object.assign(a, e);
  kc.chart.overrideIndicator({ ...kcIndValue(a) }, a.paneId);
  kcVisApply();
  prefs().list = kc.active.map(({ paneId: _, ...x }) => x); kcSavePrefs();
}
function kcVisApply() {   // Visibility tab: which candle sizes an indicator shows on
  const pt = KC_PERIODS[kc.period ?? 3]?.text;
  kc.active.forEach((a) => kc.chart.overrideIndicator({ name: a.name, visible: !(a.hideOn || []).includes(pt) && !a.hidden }, a.paneId));
}
function kcInitInds() {
  if (kc.indFor === kc.chart) return;
  kc.indFor = kc.chart; kc.active = [];
  prefs().list.forEach((e) => kcAddInd(e, false));
}

