"""Stock prices from Yahoo Finance (public chart data, may be delayed ~15 min for Thai stocks).

- prices_now(tickers): today's price per ticker, used to record the price when a story is added,
  so the website can show "+1.6% since this news".
- earnings_events(tickers): next earnings and ex-dividend dates for your watchlist (once a day).
"""
import http.cookiejar
import json
import urllib.parse
import urllib.request
from pathlib import Path

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
CATALOG = json.loads((Path(__file__).parent / "catalog.json").read_text(encoding="utf-8"))
YAHOO = {k: v for k, v in CATALOG.get("yahoo_symbols", {}).items() if not k.startswith("_")}
SAFE = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.^=-")


def yahoo_symbol(t):
    return YAHOO.get(t, t)


def real_tickers(tickers, watchlist=()):
    """Only tickers the site knows (catalog or your watchlist); skips AI labels like 'GOLD' that aren't symbols."""
    known = set(CATALOG["tickers"]) | set(watchlist or [])
    return [t for t in dict.fromkeys(tickers or []) if t in known and set(t.upper()) <= SAFE]


def prices_now(tickers):
    """{ticker: price} for up to 40 tickers, in one or two Yahoo requests. Missing ones are left out."""
    tickers = list(dict.fromkeys(tickers))[:40]
    out = {}
    for i in range(0, len(tickers), 20):
        chunk = tickers[i:i + 20]
        syms = {yahoo_symbol(t): t for t in chunk}
        url = ("https://query1.finance.yahoo.com/v7/finance/spark?range=1d&interval=1d&symbols="
               + urllib.parse.quote(",".join(syms), safe=","))
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=15) as r:
                data = json.loads(r.read())
            for item in data.get("spark", {}).get("result", []):
                meta = (item.get("response") or [{}])[0].get("meta", {})
                price = meta.get("regularMarketPrice")
                if price is not None and item.get("symbol") in syms:
                    out[syms[item["symbol"]]] = round(float(price), 4)
        except Exception as e:
            print(f"  Price lookup failed: {str(e)[:80]}")
    return out


def earnings_events(tickers):
    """[{day, title, kind, ticker, estimate}] for upcoming earnings / ex-dividend dates."""
    cj = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    op.addheaders = [("User-Agent", UA)]
    try:
        try:
            op.open("https://fc.yahoo.com", timeout=10)  # sets the cookie Yahoo wants (the page itself returns 404)
        except Exception:
            pass
        crumb = op.open("https://query2.finance.yahoo.com/v1/test/getcrumb", timeout=10).read().decode().strip()
    except Exception as e:
        print(f"  Earnings dates skipped (Yahoo sign-in step failed): {str(e)[:80]}")
        return []
    events = []
    for t in tickers[:30]:
        url = (f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{urllib.parse.quote(yahoo_symbol(t))}"
               f"?modules=calendarEvents&crumb={urllib.parse.quote(crumb)}")
        try:
            data = json.loads(op.open(url, timeout=10).read())
            ce = data["quoteSummary"]["result"][0]["calendarEvents"]
        except Exception:
            continue
        e = ce.get("earnings") or {}
        dates = [d.get("fmt") for d in e.get("earningsDate", []) if d.get("fmt")]
        if dates:
            events.append({"day": dates[0], "title": f"{t} earnings", "kind": "earnings", "ticker": t,
                           "estimate": bool(e.get("isEarningsDateEstimate"))})
        ex = (ce.get("exDividendDate") or {}).get("fmt")
        if ex:
            events.append({"day": ex, "title": f"{t} ex-dividend", "kind": "dividend", "ticker": t, "estimate": False})
    return events
