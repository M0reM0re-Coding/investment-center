"""Key stats + financials for the Charts page (design round 38), from Yahoo Finance's public quote data.

Once a day per stock, for your watchlist + the big stocks in catalog.json ("big_stocks").
At most 20 stocks per run, so the first day is spread over a few runs (every 30 minutes).
Saves one row per Yahoo symbol into the stock_stats table (needs supabase/013_charts.sql).
"""
import http.cookiejar
import json
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone

import db
import prices

UA = "Mozilla/5.0"
MODULES = "price,summaryDetail,defaultKeyStatistics,financialData,earnings,assetProfile,recommendationTrend,fundOwnership,calendarEvents"
# Financial statement lines for the Overview charts (round 43): revenue -> profit steps, debt / free cash flow / cash
FIN = {"rev": "TotalRevenue", "cost": "CostOfRevenue", "gross": "GrossProfit", "opex": "OperatingExpense", "opinc": "OperatingIncome",
       "tax": "TaxProvision", "net": "NetIncome", "debt": "TotalDebt", "fcf": "FreeCashFlow", "cash": "CashAndCashEquivalents"}
PER_RUN = 20


def big_stocks():
    b = prices.CATALOG.get("big_stocks") or {}
    return [t for k, v in b.items() if not k.startswith("_") for t in v]


def _opener():
    cj = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    op.addheaders = [("User-Agent", UA)]
    try:
        op.open("https://fc.yahoo.com", timeout=10)  # sets the cookie Yahoo wants (the page itself returns 404)
    except Exception:
        pass
    crumb = op.open("https://query2.finance.yahoo.com/v1/test/getcrumb", timeout=10).read().decode().strip()
    return op, crumb


def _raw(d, mod, key):
    v = (d.get(mod) or {}).get(key)
    return v.get("raw") if isinstance(v, dict) else v


def fetch(op, crumb, sym):
    url = (f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{urllib.parse.quote(sym)}"
           f"?modules={MODULES}&crumb={urllib.parse.quote(crumb)}")
    d = json.loads(op.open(url, timeout=15).read())["quoteSummary"]["result"][0]
    r = lambda m, k: _raw(d, m, k)  # noqa: E731
    fc = (d.get("earnings") or {}).get("financialsChart") or {}
    quarters = [{"q": q.get("date"), "revenue": (q.get("revenue") or {}).get("raw"), "earnings": (q.get("earnings") or {}).get("raw")}
                for q in fc.get("quarterly", [])]
    years = [{"y": q.get("date"), "revenue": (q.get("revenue") or {}).get("raw"), "earnings": (q.get("earnings") or {}).get("raw")}
             for q in fc.get("yearly", [])]
    ap = d.get("assetProfile") or {}
    trend = next((t for t in ((d.get("recommendationTrend") or {}).get("trend") or []) if t.get("period") == "0m"), None)
    out = {
        "name": r("price", "longName") or r("price", "shortName"),
        "currency": r("price", "currency"),
        "sector": r("assetProfile", "sector"), "industry": r("assetProfile", "industry"),
        "marketCap": r("price", "marketCap"),
        "pe": r("summaryDetail", "trailingPE"), "fpe": r("summaryDetail", "forwardPE"),
        "eps": r("defaultKeyStatistics", "trailingEps"),
        "divYield": r("summaryDetail", "dividendYield"), "beta": r("summaryDetail", "beta"),
        "avgVolume": r("summaryDetail", "averageVolume"),
        "revenue": r("financialData", "totalRevenue"), "revenueGrowth": r("financialData", "revenueGrowth"),
        "netIncome": r("defaultKeyStatistics", "netIncomeToCommon"),
        "margin": r("financialData", "profitMargins"), "roe": r("financialData", "returnOnEquity"),
        "debtToEquity": r("financialData", "debtToEquity"), "fcf": r("financialData", "freeCashflow"),
        "target": r("financialData", "targetMeanPrice"), "rating": r("financialData", "recommendationKey"),
        "analysts": r("financialData", "numberOfAnalystOpinions"),
        "quarters": quarters, "years": years,
        "grossMargin": r("financialData", "grossMargins"), "opMargin": r("financialData", "operatingMargins"),
        "targetLow": r("financialData", "targetLowPrice"), "targetHigh": r("financialData", "targetHighPrice"),
        "ratingMean": r("financialData", "recommendationMean"),
        "ratings": {k: trend.get(k) for k in ("strongBuy", "buy", "hold", "sell", "strongSell")} if trend else None,
        "divRate": r("summaryDetail", "dividendRate"), "exDiv": r("summaryDetail", "exDividendDate"), "payout": r("summaryDetail", "payoutRatio"),
        "ma50": r("summaryDetail", "fiftyDayAverage"), "ma200": r("summaryDetail", "twoHundredDayAverage"),
        "website": ap.get("website"), "employees": ap.get("fullTimeEmployees"),
        "hq": ", ".join(x for x in (ap.get("city"), ap.get("country")) if x) or None,
        "about": (ap.get("longBusinessSummary") or "")[:1200] or None,
    }
    ceo = next((o.get("name") for o in ap.get("companyOfficers") or [] if "CEO" in (o.get("title") or "") or "Chief Executive" in (o.get("title") or "")), None)
    ec = (d.get("earnings") or {}).get("earningsChart") or {}
    ed = (((d.get("calendarEvents") or {}).get("earnings") or {}).get("earningsDate") or [{}])[0]
    out.update({
        "ceo": ceo, "float": r("defaultKeyStatistics", "floatShares"), "shares": r("defaultKeyStatistics", "sharesOutstanding"),
        "epsQ": [{"q": x.get("date"), "a": (x.get("actual") or {}).get("raw"), "e": (x.get("estimate") or {}).get("raw")} for x in ec.get("quarterly", [])],
        "epsNext": {"q": f"{ec.get('currentQuarterEstimateDate', '')}{ec.get('currentQuarterEstimateYear', '')}", "e": (ec.get("currentQuarterEstimate") or {}).get("raw")} if ec.get("currentQuarterEstimate") else None,
        "nextEarn": ed.get("raw") if isinstance(ed, dict) else None,
        "funds": [{"n": f.get("organization"), "pct": (f.get("pctHeld") or {}).get("raw"), "val": (f.get("value") or {}).get("raw")}
                  for f in ((d.get("fundOwnership") or {}).get("ownershipList") or [])[:6]],
    })
    try:
        out["fin"] = _fin(op, sym)
    except Exception:
        pass
    try:
        rr = json.loads(op.open(f"https://query2.finance.yahoo.com/v6/finance/recommendationsbysymbol/{urllib.parse.quote(sym)}", timeout=15).read())
        out["related"] = [x["symbol"] for x in (rr.get("finance", {}).get("result") or [{}])[0].get("recommendedSymbols", [])][:6]
    except Exception:
        pass
    return {k: v for k, v in out.items() if v not in (None, "", [], {})}


def _fin(op, sym):
    """Yearly + quarterly statement lines: {"a": [{"d": "2026-01-31", "rev": ..}, ..], "q": [..]} (oldest first)."""
    types = ",".join(p + v for p in ("annual", "quarterly") for v in FIN.values())
    url = (f"https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/{urllib.parse.quote(sym)}"
           f"?type={types}&period1=1420070400&period2={int(datetime.now().timestamp())}")
    res = json.loads(op.open(url, timeout=15).read())["timeseries"]["result"]
    back = {v: k for k, v in FIN.items()}
    out = {"a": {}, "q": {}}
    for r in res:
        t = r["meta"]["type"][0]
        per, key = ("a", t[6:]) if t.startswith("annual") else ("q", t[9:])
        for x in r.get(t) or []:
            if x and x.get("asOfDate") and (x.get("reportedValue") or {}).get("raw") is not None:
                out[per].setdefault(x["asOfDate"], {"d": x["asOfDate"]})[back[key]] = x["reportedValue"]["raw"]
    return {p: [v for _, v in sorted(out[p].items())][-5:] for p in out}


def run(watchlist):
    today = date.today().isoformat()
    tickers = prices.real_tickers(list(watchlist or []) + big_stocks(), list(watchlist or []) + big_stocks())
    syms = list(dict.fromkeys(prices.yahoo_symbol(t) for t in tickers))
    marks = {s: f"stats:{today}:{s}" for s in syms}
    done = db.seen_links(marks.values())
    todo = [s for s in syms if marks[s] not in done][:PER_RUN]
    if not todo:
        return
    op, crumb = _opener()
    rows, failed, now = [], [], datetime.now(timezone.utc).isoformat()
    for s in todo:
        try:
            rows.append({"symbol": s, "data": fetch(op, crumb, s), "updated_at": now})
        except Exception:
            failed.append(s)
    if rows:
        db._req("POST", "stock_stats", rows, params={"on_conflict": "symbol"}, prefer="resolution=merge-duplicates")
    db.mark_seen({marks[s]: None for s in todo if s not in failed})
    print(f"Stock stats: {len(rows)} saved" + (f", {len(failed)} failed ({', '.join(failed[:5])})" if failed else ""))
