"""Alerts on chart drawings (Charts page, round 47): Telegram when the price crosses a line you drew.

How it works:
- On the website you select a horizontal line, trend line (also ray / extended line) or Fibonacci and press the bell.
  The page saves ui.alert = {on, y (Yahoo symbol), tf (timeframe drawn on), side0 (above/below per level), h (fingerprint)}
  inside that drawing (table chart_drawings, needs supabase/014_drawing_alerts.sql so the robot may read it).
- Each run (~30 min) this works out where each line is NOW. A sloped line moves with time: its position is counted in
  candles of the timeframe you drew it on (like the chart shows it), and projected to the right of its last point.
- When the price is on the other side of a level than when you set the alert, one Telegram message is sent.
  Each level fires once (remembered in seen_links under the drawing's fingerprint). Move the line -> a new alert.
Not real-time: checked every ~30 minutes, Yahoo prices may be ~15 min delayed.
"""
import json
import os
import urllib.parse
import urllib.request

import db
from notify import e, send

MAX_PER_RUN = 10
UA = {"User-Agent": "Mozilla/5.0"}
# timeframe text on the chart -> (Yahoo range, Yahoo interval, candles joined into one)
TF = {"5m": ("1mo", "5m", 1), "10m": ("1mo", "5m", 2), "15m": ("1mo", "15m", 1), "30m": ("1mo", "15m", 2), "45m": ("1mo", "15m", 3),
      "1H": ("2y", "60m", 1), "2H": ("2y", "60m", 2), "3H": ("2y", "60m", 3), "4H": ("2y", "60m", 4), "D": ("10y", "1d", 1),
      "W": ("10y", "1wk", 1), "M": ("max", "1mo", 1), "3M": ("max", "1mo", 3), "6M": ("max", "1mo", 6), "12M": ("max", "1mo", 12)}
LINES = {"segment", "rayLine", "straightLine"}
FLAT = {"horizontalStraightLine", "horizontalRayLine", "priceLine"}
NAMES = {"segment": "trend line", "rayLine": "ray", "straightLine": "extended line", "horizontalStraightLine": "horizontal line",
         "horizontalRayLine": "horizontal ray", "priceLine": "price line", "fibonacciLine": "Fibonacci"}


def candles(sym, tf, cache):
    key = (sym, tf)
    if key not in cache:
        rng, itv, _ = TF.get(tf, TF["D"])
        url = f"https://query2.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?range={rng}&interval={itv}"
        r = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20).read())["chart"]["result"][0]
        closes = r["indicators"]["quote"][0]["close"]
        pts = [(t, c) for t, c in zip(r["timestamp"], closes) if c is not None]
        cache[key] = pts
    return cache[key]


def bar_index(ts_ms, bars, join):
    """Position of a time on the chart's candle axis (in candles of the drawing's timeframe)."""
    t = ts_ms / 1000
    n = sum(1 for b in bars if b[0] <= t)
    return (n - 1) / join


def levels(ov, bars, join):
    """(label, value now) for each level of this drawing."""
    pts, name = ov.get("points") or [], ov.get("name")
    if name in FLAT and pts:
        return [("", float(pts[0]["value"]))]
    if name in LINES and len(pts) >= 2:
        i1, i2, now = bar_index(pts[0]["timestamp"], bars, join), bar_index(pts[1]["timestamp"], bars, join), (len(bars) - 1) / join
        if i2 == i1:
            return []
        v1, v2 = float(pts[0]["value"]), float(pts[1]["value"])
        return [("", v1 + (v2 - v1) * (now - i1) / (i2 - i1))]
    if name == "fibonacciLine" and len(pts) >= 2:
        p1, p2 = float(pts[0]["value"]), float(pts[1]["value"])
        f = ov.get("extendData") or {}
        return [(f"{lv * 100:g}%", p2 + (p1 - p2) * lv) for lv, _c, on in (f.get("levels") or []) if on]
    return []


def run():
    params = {"select": "user_id,symbol,overlays"}
    if os.environ.get("OWNER_USER_ID"):
        params["user_id"] = f"eq.{os.environ['OWNER_USER_ID']}"
    try:
        rows = db._req("GET", "chart_drawings", params=params)
    except RuntimeError as err:
        if "42501" in str(err) or "permission" in str(err).lower():
            print("Drawing alerts: run supabase/014_drawing_alerts.sql once (lets the robot read your drawings)")
            return 0
        raise
    todo = []
    for r in rows or []:
        for ov in r.get("overlays") or []:
            a = (ov.get("ui") or {}).get("alert") or {}
            if a.get("on") and a.get("h") and a.get("y"):
                todo.append((r, ov, a))
    if not todo:
        return 0
    keys = {f"dalert:{r['user_id']}:{r['symbol']}:{a['h']}:{i}": (r, ov, a, i) for r, ov, a in todo for i in range(len(a.get("side0") or []))}
    done = db.seen_links(keys.keys())
    cache, sent, fired = {}, 0, {}
    site = os.environ.get("SITE_URL", "").rstrip("/")
    for key, (r, ov, a, i) in keys.items():
        if key in done or sent >= MAX_PER_RUN:
            continue
        try:
            bars = candles(a["y"], a.get("tf") or "D", cache)
        except Exception as err:
            print(f"  Drawing alert {r['symbol']}: no prices ({str(err)[:60]})")
            continue
        if len(bars) < 2:
            continue
        lv = levels(ov, bars, TF.get(a.get("tf") or "D", TF["D"])[2])
        if i >= len(lv):
            continue
        label, value = lv[i]
        price, side0 = bars[-1][1], a["side0"][i]
        side = "above" if price >= value else "below"
        if side == side0:
            continue
        what = NAMES.get(ov.get("name"), "drawing") + (f" {label}" if label else "")
        arrow = "📈" if side == "above" else "📉"
        text = (f"{arrow} <b>Drawing alert · {e(r['symbol'])}</b>\n"
                f"Price {price:,.2f} crossed {'above' if side == 'above' else 'below'} your {e(what)} at {value:,.2f}"
                + (f'\n<a href="{e(site)}/#/charts/{e(urllib.parse.quote(r["symbol"]))}">Open the chart</a>' if site else "")
                + "\n<i>Checked every 30 min; prices may be delayed.</i>")
        if send(text):
            sent += 1
            fired[key] = None
    if fired:
        db.mark_seen(fired)
    print(f"Drawing alerts: {len(keys)} levels watched, {sent} sent")
    return sent


if __name__ == "__main__":
    from analyze import load_env
    load_env()
    run()
