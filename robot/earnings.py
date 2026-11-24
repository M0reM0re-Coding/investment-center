"""Earnings results for your watchlist: EPS actual vs expected (Yahoo quoteSummary earningsHistory), once a day per stock.

Saved to earnings_results (supabase/012_follow_earnings_mood.sql). The website shows a card for 3 days after the robot first
sees a new quarter. The free data has no revenue forecast, so revenue is shown without beat / miss.
A stock seen for the first time gets its past quarters dated at the quarter end, so old results don't pop up as "new".
"""
import http.cookiejar
import json
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone

import db
import prices


def _opener():
    cj = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    op.addheaders = [("User-Agent", prices.UA)]
    try:
        op.open("https://fc.yahoo.com", timeout=10)  # sets the cookie Yahoo wants (the page itself returns 404)
    except Exception:
        pass
    crumb = op.open("https://query2.finance.yahoo.com/v1/test/getcrumb", timeout=10).read().decode().strip()
    return op, crumb


def _raw(d, k):
    v = (d.get(k) or {}).get("raw")
    return round(float(v), 4) if isinstance(v, (int, float)) else None


def fetch(op, crumb, t):
    """[{ticker, quarter_end, eps_actual, eps_estimate, surprise_pct, revenue}] for the last 4 quarters."""
    url = (f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{urllib.parse.quote(prices.yahoo_symbol(t))}"
           f"?modules=earningsHistory,earnings&crumb={urllib.parse.quote(crumb)}")
    r = json.loads(op.open(url, timeout=10).read())["quoteSummary"]["result"][0]
    hist = (r.get("earningsHistory") or {}).get("history") or []
    rev = ((r.get("earnings") or {}).get("financialsChart") or {}).get("quarterly") or []
    rows = []
    for k, h in enumerate(hist):
        q = (h.get("quarter") or {}).get("fmt")
        if not q or _raw(h, "epsActual") is None:
            continue
        sp = _raw(h, "surprisePercent")
        rv = rev[k - len(hist) + len(rev)] if len(rev) >= len(hist) - k > 0 else None  # same order, newest last
        rows.append({"ticker": t, "quarter_end": q, "eps_actual": _raw(h, "epsActual"), "eps_estimate": _raw(h, "epsEstimate"),
                     "surprise_pct": round(sp * 100, 2) if sp is not None else None,
                     "revenue": ((rv or {}).get("revenue") or {}).get("fmt")})
    return rows


def run(watchlist, force=False):
    today = date.today().isoformat()
    tickers = prices.real_tickers(watchlist, watchlist)
    marks = {t: f"earnres:{today}:{t}" for t in tickers}
    done = set() if force else db.seen_links(marks.values())
    todo = [t for t in tickers if marks[t] not in done][:30]
    if not todo:
        return
    try:
        op, crumb = _opener()
    except Exception as e:
        print(f"  Earnings results skipped (Yahoo sign-in step failed): {str(e)[:80]}")
        return
    known = {(r["ticker"], r["quarter_end"]) for r in db._req("GET", "earnings_results", params={
        "select": "ticker,quarter_end", "ticker": "in.(" + ",".join(f'"{t}"' for t in todo) + ")"}) or []}
    had = {t for t, _ in known}
    new, px = [], prices.prices_now(todo)
    for t in todo:
        try:
            rows = fetch(op, crumb, t)
        except Exception as e:
            print(f"  Earnings results for {t} skipped: {str(e)[:80]}")
            continue
        for r in rows:
            if (t, r["quarter_end"]) in known:
                continue
            if t in had:   # a new quarter for a stock we already track = a fresh report
                r.update(seen_at=datetime.now(timezone.utc).isoformat(), price_then=px.get(t))
            else:          # first time we see this stock: old quarters are not news
                r.update(seen_at=r["quarter_end"] + "T00:00:00+00:00", price_then=None)
            new.append(r)
    if new:
        db._req("POST", "earnings_results", new, params={"on_conflict": "ticker,quarter_end"}, prefer="resolution=ignore-duplicates")
    db.mark_seen({marks[t]: None for t in todo})
    fresh = [r for r in new if r["price_then"] is not None or r["ticker"] in had]
    print(f"Earnings results: {len(new)} quarters saved ({len(fresh)} new reports) for {', '.join(todo)}")
