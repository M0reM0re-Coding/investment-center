"""Crypto Fear & Greed (alternative.me, official free API), saved to market_gauges at most once an hour.

The STOCK Fear & Greed (CNN) is NOT fetched here: CNN has no public API and blocks automated requests, so the robot
leaves it alone. The website asks CNN from your own browser when you open My News (a normal page visit), and shows a
link to CNN's page if that doesn't work.
Table: market_gauges (supabase/012_follow_earnings_mood.sql).
"""
import json
import urllib.request
from datetime import datetime, timezone

import db

URL = "https://api.alternative.me/fng/?limit=31"


def _num(v):
    try:
        return round(float(v), 1)
    except (TypeError, ValueError):
        return None


def crypto():
    req = urllib.request.Request(URL, headers={"User-Agent": "investment-center-robot"})
    with urllib.request.urlopen(req, timeout=20) as r:
        d = json.loads(r.read())["data"]
    v = lambda i: _num(d[i]["value"]) if len(d) > i else None
    return {"name": "crypto", "score": v(0), "rating": d[0].get("value_classification", ""),
            "prev_close": v(1), "week_ago": v(7), "month_ago": v(30), "year_ago": None}


def run(force=False):
    now = datetime.now(timezone.utc)
    mark = f"gauges:{now.strftime('%Y-%m-%dT%H')}"
    if not force and db.seen_links([mark]):
        return
    r = crypto()
    if r["score"] is not None:
        db._req("POST", "market_gauges", [{**r, "updated_at": now.isoformat()}], params={"on_conflict": "name"},
                prefer="resolution=merge-duplicates")
    db.mark_seen({mark: None})
    print(f"Crypto Fear & Greed: {r['score']:.0f} ({r['rating']})")
