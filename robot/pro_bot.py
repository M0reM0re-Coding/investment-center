"""Pro BOT mode, the 24/7 part: replays every RUNNING paper bot and sends a Telegram message for each new paper trade.

PAPER ONLY. Pretend money: this file never talks to a broker and cannot place real orders.

How it works (same rules as site/js/pro/bot.js, botRun - kept identical, checked by a side-by-side test):
- The website saves your bots in table theses, row ticker "#BOT": {"bots": [...], "sigLog": [...], "sigT": {...}}.
  Each bot = its own rules + the moment you pressed START (paper.from) + its own pretend cash.
- Every robot run (~30 min, day and night) this downloads the candles (Yahoo), runs each running bot's rules over every
  candle that closed since START, and finds trades it hasn't told you about yet (remembered in seen_links).
- Because it's a replay, the website and the robot always show the same trades without sharing any state.
- A signal on a candle's close fills at the next candle's open; stop-loss / take-profit fill at their price inside a candle.
- Round 56: long AND short, leverage, forex swap (interest gap, rates saved by the website), trading sessions, a pause
  around high-impact news (event times saved by the website + this week's calendar), 4-hour candles (hourly joined).

Run by hand:  python robot/pro_bot.py --local bot.json     (one bot config; prints the trades, sends nothing)
"""
import json
import sys
import urllib.parse
import urllib.request

UA = {"User-Agent": "Mozilla/5.0"}
MAX_MSGS = 8
SESS_H = {"asia": (0, 9), "london": (7, 16), "ny": (12, 21), "lnny": (7, 21)}
BASE = {"rsiN": 14, "rsiLo": 30, "rsiHi": 70, "brk": 20, "fast": 20, "slow": 50, "trendOn": True, "trendN": 200, "ideasOn": False, "ideasMin": 55,
        "stop": 8, "take": 0, "trail": 12, "exitCross": True, "maExitOn": False, "maExitN": 50, "rsiExitOn": False, "size": 25, "maxPos": 4,
        "cash": 100000, "fee": 0.1, "side": "long", "session": "all", "news": 0, "lev": 1, "swap": False}


def candles(sym, itv):
    rng = {"60m": "6mo", "4h": "1y"}.get(itv, "2y")
    url = f"https://query2.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?range={rng}&interval={'60m' if itv == '4h' else itv}"
    r = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read())["chart"]["result"][0]
    q = r["indicators"]["quote"][0]
    d = {"t": r["timestamp"], "o": q["open"], "h": q["high"], "l": q["low"], "c": q["close"]}
    return join(d, 14400) if itv == "4h" else d


def join(d, sec):
    """Join candles into sec-long buckets (UTC): hourly -> 4-hour. Same as botJoin in bot.js."""
    o = {"t": [], "o": [], "h": [], "l": [], "c": []}
    for i, ts in enumerate(d["t"]):
        if not all(isinstance(d[k][i], (int, float)) for k in "ohlc"):
            continue
        b = ts // sec * sec
        if o["t"] and o["t"][-1] == b:
            o["h"][-1] = max(o["h"][-1], d["h"][i])
            o["l"][-1] = min(o["l"][-1], d["l"][i])
            o["c"][-1] = d["c"][i]
        else:
            for k, v in (("t", b), ("o", d["o"][i]), ("h", d["h"][i]), ("l", d["l"][i]), ("c", d["c"][i])):
                o[k].append(v)
    return o


def sma(c, n):
    out, s = [None] * len(c), 0.0
    for i, x in enumerate(c):
        s += x
        if i >= n:
            s -= c[i - n]
        if i >= n - 1:
            out[i] = s / n
    return out


def rsi(c, n):
    out, g, l = [None] * len(c), 0.0, 0.0
    for i in range(1, len(c)):
        d = c[i] - c[i - 1]
        up, dn = max(0, d), max(0, -d)
        if i <= n:
            g += up / n
            l += dn / n
            if i == n:
                out[i] = 100 - 100 / (1 + g / l) if l else 100
        else:
            g = (g * (n - 1) + up) / n
            l = (l * (n - 1) + dn) / n
            out[i] = 100 - 100 / (1 + g / l) if l else 100
    return out


def run(cfg, data, start=0):
    """Same engine as botRun in bot.js. Returns (trades, positions, cash, value)."""
    cfg = {**BASE, **cfg}
    S = {}
    for y in cfg["syms"]:
        d = data.get(y)
        if not d or not d.get("t"):
            continue
        idx = [i for i in range(len(d["t"])) if all(isinstance(d[k][i], (int, float)) for k in "ohlc")]
        k = lambda a: [a[i] for i in idx]  # noqa: E731
        c = k(d["c"])
        S[y] = {"t": k(d["t"]), "o": k(d["o"]), "h": k(d["h"]), "l": k(d["l"]), "c": c, "f": sma(c, cfg["fast"]), "s": sma(c, cfg["slow"]),
                "tr": sma(c, cfg["trendN"]), "mx": sma(c, cfg["maExitN"]), "r": rsi(c, cfg["rsiN"])}
        S[y]["at"] = {t: j for j, t in enumerate(S[y]["t"])}
    times = sorted({t for y in S for t in S[y]["t"] if t >= start})
    cash, pos, pend, trades, last = float(cfg["cash"]), {}, {}, [], {}
    fee, lev = (cfg.get("fee") or 0) / 100, max(1, cfg.get("lev") or 1)
    scores, rates, news = cfg.get("scores") or {}, cfg.get("rates") or {}, cfg.get("newsT") or {}
    sess, intraday = SESS_H.get(cfg.get("session")), cfg.get("itv") != "1d"

    def value():
        return cash + sum(p["dir"] * p["q"] * last.get(y, p["px"]) for y, p in pos.items())

    def ideas_ok(y, d):
        if not cfg.get("ideasOn") or cfg.get("market") != "stocks":
            return True
        return scores.get(y, -1) >= cfg["ideasMin"] if d > 0 else scores.get(y, 101) <= 100 - cfg["ideasMin"]

    def side_ok(y, d):
        s = cfg.get("side")
        return s == "both" or (s == "long" and d > 0) or (s == "short" and d < 0) or (s == "carry" and (rates.get(y) or 0) * d > 0)

    def allowed(y, t):
        if intraday and sess:
            h = (t % 86400) // 3600
            if h < sess[0] or h >= sess[1]:
                return False
        if cfg.get("news", 0) > 0:
            w = cfg["news"] * 60
            if any(t - w <= e <= t + w for e in news.get(y, [])):
                return False
        return True

    def close(y, px, t, why):
        nonlocal cash
        p = pos.pop(y)
        if p["dir"] > 0:
            cash += p["q"] * px * (1 - fee)
            pnl = (px * (1 - fee)) / (p["px"] * (1 + fee)) - 1
        else:
            cash -= p["q"] * px * (1 + fee)
            pnl = (p["px"] * (1 - fee) - px * (1 + fee)) / p["px"]
        trades.append({"y": y, "side": "SELL" if p["dir"] > 0 else "COVER", "t": t, "px": px, "why": why, "pnl": pnl})

    for t in times:
        for y, D in S.items():
            i = D["at"].get(t)
            if i is None:
                continue
            pd, why0 = pend.get(y), pend.get(y + "_why")
            if pd in ("buy", "short") and y not in pos and len(pos) < cfg["maxPos"] and allowed(y, t):
                px, d = D["o"][i], 1 if pd == "buy" else -1
                spend = value() * cfg["size"] / 100 * lev
                if d > 0 and lev <= 1:
                    spend = min(spend, cash)
                if spend > 10:
                    q = spend / (px * (1 + fee)) if d > 0 else spend / px
                    cash += -q * px * (1 + fee) if d > 0 else q * px * (1 - fee)
                    pos[y] = {"q": q, "px": px, "t": t, "dir": d, "peak": px, "trough": px, "lt": t, "sw": 0.0}
                    trades.append({"y": y, "side": "BUY" if d > 0 else "SHORT", "t": t, "px": px, "why": why0})
            if pd == "close" and y in pos:
                close(y, D["o"][i], t, why0)
            pend.pop(y, None)
            pend.pop(y + "_why", None)
            p = pos.get(y)
            if p and p["dir"] > 0:
                stops = []
                if cfg["stop"] > 0:
                    stops.append((p["px"] * (1 - cfg["stop"] / 100), f"stop-loss −{cfg['stop']}%"))
                if cfg["trail"] > 0:
                    stops.append((p["peak"] * (1 - cfg["trail"] / 100), f"trailing stop −{cfg['trail']}% from the high"))
                hit = sorted([s for s in stops if D["l"][i] <= s[0]], key=lambda s: -s[0])
                if hit:
                    close(y, min(D["o"][i], hit[0][0]), t, hit[0][1])
                elif cfg["take"] > 0 and D["h"][i] >= p["px"] * (1 + cfg["take"] / 100):
                    close(y, max(D["o"][i], p["px"] * (1 + cfg["take"] / 100)), t, f"take-profit +{cfg['take']}%")
                else:
                    p["peak"] = max(p["peak"], D["h"][i])
            elif p:
                stops = []
                if cfg["stop"] > 0:
                    stops.append((p["px"] * (1 + cfg["stop"] / 100), f"stop-loss +{cfg['stop']}% against the short"))
                if cfg["trail"] > 0:
                    stops.append((p["trough"] * (1 + cfg["trail"] / 100), f"trailing stop +{cfg['trail']}% from the low"))
                hit = sorted([s for s in stops if D["h"][i] >= s[0]], key=lambda s: s[0])
                if hit:
                    close(y, max(D["o"][i], hit[0][0]), t, hit[0][1])
                elif cfg["take"] > 0 and D["l"][i] <= p["px"] * (1 - cfg["take"] / 100):
                    close(y, min(D["o"][i], p["px"] * (1 - cfg["take"] / 100)), t, f"take-profit −{cfg['take']}%")
                else:
                    p["trough"] = min(p["trough"], D["l"][i])
            q = pos.get(y)
            if q and cfg.get("swap") and rates.get(y):
                amt = q["dir"] * q["q"] * D["c"][i] * (rates[y] / 100) * ((t - q["lt"]) / 31536000)
                cash += amt
                q["sw"] += amt
                q["lt"] = t
            last[y] = D["c"][i]
            if i < 1:
                continue
            f, s, c, r = D["f"], D["s"], D["c"], D["r"]
            if y in pos:
                L = pos[y]["dir"] > 0
                why = None
                if cfg.get("exitCross") and None not in (f[i], s[i], f[i - 1], s[i - 1]) and (
                        (f[i - 1] >= s[i - 1] and f[i] < s[i]) if L else (f[i - 1] <= s[i - 1] and f[i] > s[i])):
                    why = f"fast average crossed {'below' if L else 'above'} slow ({cfg['fast']}/{cfg['slow']})"
                elif cfg.get("maExitOn") and D["mx"][i] is not None and (c[i] < D["mx"][i] if L else c[i] > D["mx"][i]):
                    why = f"closed {'below' if L else 'above'} its {cfg['maExitN']}-candle average"
                elif cfg.get("rsiExitOn") and r[i] is not None and (r[i] > cfg["rsiHi"] if L else r[i] < cfg["rsiLo"]):
                    why = f"RSI above {cfg['rsiHi']} (overbought)" if L else f"RSI below {cfg['rsiLo']} (oversold)"
                if why:
                    pend[y], pend[y + "_why"] = "close", why
            else:
                for d in (1, -1):
                    if not side_ok(y, d):
                        continue
                    tg = cfg["trig"]
                    if tg == "cross":
                        trig = None not in (f[i - 1], s[i - 1], f[i], s[i]) and ((f[i - 1] <= s[i - 1] and f[i] > s[i]) if d > 0 else (f[i - 1] >= s[i - 1] and f[i] < s[i]))
                    elif tg == "rsi":
                        trig = r[i - 1] is not None and r[i] is not None and ((r[i - 1] < cfg["rsiLo"] <= r[i]) if d > 0 else (r[i - 1] > cfg["rsiHi"] >= r[i]))
                    elif tg == "breakout":
                        trig = i > cfg["brk"] and (c[i] > max(c[i - cfg["brk"]:i]) if d > 0 else c[i] < min(c[i - cfg["brk"]:i]))
                    else:
                        trig = True
                    filt = (not cfg.get("trendOn") or (D["tr"][i] is not None and (c[i] > D["tr"][i] if d > 0 else c[i] < D["tr"][i]))) and ideas_ok(y, d)
                    if trig and filt:
                        pend[y] = "buy" if d > 0 else "short"
                        pend[y + "_why"] = {"cross": f"{cfg['fast']}/{cfg['slow']} average cross {'up' if d > 0 else 'down'}",
                                            "rsi": f"RSI back above {cfg['rsiLo']}" if d > 0 else f"RSI back below {cfg['rsiHi']}",
                                            "breakout": f"{cfg['brk']}-candle {'breakout' if d > 0 else 'breakdown'}", "always": "filters true"}.get(tg, tg)
                        break
    return trades, pos, cash, value()


def _syms(cfg):
    import prices
    return [prices.yahoo_symbol(t) if cfg.get("market", "stocks") == "stocks" else t for t in cfg["syms"]]


def _bots(data):
    """Bots from the saved row: round 56 = {"bots": [...]}, older saves = one bot."""
    if isinstance(data.get("bots"), list):
        return data["bots"]
    one = {k: v for k, v in data.items() if k != "sigLog"}
    return [{**one, "id": "b1"}] if one else []


def scheduled():
    import db
    from notify import e, send
    try:
        rows = db._req("GET", "theses", params={"select": "user_id,data", "ticker": "eq.#BOT"}) or []
    except Exception:
        print("Paper bots skipped: run supabase/017_pro.sql first")
        return
    cache = {}
    for row in rows:
        for b in _bots(row.get("data") or {}):
            paper = b.get("paper")
            if not paper:
                continue
            cfg = {**BASE, **b, "syms": _syms(b), "cash": paper.get("cash") or b.get("cash", 100000)}
            data = {}
            for y in cfg["syms"]:
                k = (y, cfg.get("itv", "1d"))
                if k not in cache:
                    try:
                        cache[k] = candles(y, k[1])
                    except Exception as ex:
                        print(f"  paper bot candles {y} failed: {str(ex)[:80]}")
                        cache[k] = None
                if cache[k]:
                    data[y] = cache[k]
            trades, pos, cash, val = run(cfg, data, int(paper["from"]))
            bid = b.get("id", "b1")
            marks = {f"bot:{bid}:{paper['from']}:{x['y']}:{x['side']}:{x['t']}": x for x in trades}
            done = db.seen_links(list(marks)) if marks else set()
            new = [x for m, x in marks.items() if m not in done]
            for x in new[-MAX_MSGS:]:
                res = f" · {x['pnl'] * 100:+.2f}%" if "pnl" in x else ""
                send(f"🤖 <b>PAPER {x['side']}</b> {e(x['y'])} at {x['px']:,.4f}{res}\n<i>{e(x.get('why'))}</i>\n"
                     f"{e(b.get('name', 'Bot'))} · account ${val:,.0f} (started ${cfg['cash']:,.0f}) · pretend money, no real order")
            if new:
                db.mark_seen({m: None for m in marks})
                print(f"  paper bot {b.get('name')}: {len(new)} new paper trade(s)")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--local":
        sys.path.insert(0, __file__.rsplit("\\", 1)[0].rsplit("/", 1)[0])
        cfg = {**BASE, **json.load(open(sys.argv[2], encoding="utf-8"))}
        cfg["syms"] = _syms(cfg)
        data = {y: candles(y, cfg.get("itv", "1d")) for y in cfg["syms"]}
        trades, pos, cash, val = run(cfg, data, int((cfg.get("paper") or {}).get("from", 0)))
        print(json.dumps({"trades": len(trades), "last": trades[-3:], "open": list(pos), "value": round(val, 2), "ret_pct": round((val / cfg["cash"] - 1) * 100, 2)}, indent=1, ensure_ascii=False))
