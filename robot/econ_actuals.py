"""Actual results for big US releases, from FRED (St. Louis Fed, official free API) - design round 35, option 2.

Forex Factory's free weekly file has no "actual" values. For the US events below, the robot reads the official number
from FRED after the release time and works out the same figure Forex Factory shows (m/m %, y/y %, jobs added, level).
Other countries (and US events not in the list) keep the "Result" link to the event's Forex Factory page (option 1).

Safety check: a value only counts if FRED published it ON or AFTER the release day (the observation's realtime_start),
so last month's number can never be shown as today's result.
Needs FRED_API_KEY (free: https://fredaccount.stlouisfed.org/apikeys) in .env and as a GitHub secret. Without it: skipped.
Result (Forex Factory's colours, i.e. good for the currency): actual above forecast = better, below = worse, equal = inline;
for unemployment and jobless claims, lower is better. No forecast -> no colour.
"""
import json
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
    ET = ZoneInfo("America/New_York")
except Exception:  # no time-zone data: US Eastern standard time
    ET = timezone(timedelta(hours=-5))

# Forex Factory title (USD) -> FRED series, how to compute it. Series checked on FRED 2026-11-25.
SERIES = [
    (r"CPI m/m", "CPIAUCSL", "mom"), (r"CPI y/y", "CPIAUCSL", "yoy"),
    (r"Core CPI m/m", "CPILFESL", "mom"), (r"Core CPI y/y", "CPILFESL", "yoy"),
    (r"PCE Price Index m/m", "PCEPI", "mom"), (r"PCE Price Index y/y", "PCEPI", "yoy"),
    (r"Core PCE Price Index m/m", "PCEPILFE", "mom"), (r"Core PCE Price Index y/y", "PCEPILFE", "yoy"),
    (r"Non-Farm Employment Change", "PAYEMS", "jobs"),            # thousands of jobs added -> "227K"
    (r"Unemployment Rate", "UNRATE", "pct1"),
    (r"(Advance |Prelim |Final )?GDP q/q", "A191RL1Q225SBEA", "pct1"),   # real GDP, % change at annual rate
    (r"Retail Sales m/m", "RSAFS", "mom"), (r"Core Retail Sales m/m", "RSFSXMV", "mom"),   # core = excluding autos
    (r"PPI m/m", "PPIFIS", "mom"),                                  # final demand
    (r"Unemployment Claims", "ICSA", "claims"),                     # weekly initial claims -> "215K"
    (r"Federal Funds Rate", "DFEDTARU", "pct2"),                    # upper end of the target range
    (r"Average Hourly Earnings m/m", "CES0500000003", "mom"),
    (r"JOLTS Job Openings", "JTSJOL", "mil"),                       # thousands -> "7.52M"
    (r"Durable Goods Orders m/m", "DGORDER", "mom"), (r"Core Durable Goods Orders m/m", "ADXTNO", "mom"),
    (r"Housing Starts", "HOUST", "mil"), (r"Building Permits", "PERMIT", "mil"),
    (r"New Home Sales", "HSN1F", "thou"),
]
LOWER_IS_BETTER = re.compile(r"unemploy|jobless|claims", re.I)


def series_for(title):
    t = title.strip()
    return next(((sid, how) for pat, sid, how in SERIES if re.fullmatch(pat, t, re.I)), None)


def observations(sid, key):
    q = urllib.parse.urlencode({"series_id": sid, "api_key": key, "file_type": "json", "sort_order": "desc", "limit": 15})
    req = urllib.request.Request("https://api.stlouisfed.org/fred/series/observations?" + q, headers={"User-Agent": "investment-center-robot"})
    with urllib.request.urlopen(req, timeout=20) as r:
        obs = json.loads(r.read()).get("observations") or []
    return [o for o in obs if o.get("value") not in (None, "", ".")]   # newest first


def compute(obs, how):
    """Forex Factory-style text from FRED observations (newest first), or None.
    Changes are matched by DATE (previous month / same month last year), so a gap in the data can't shift them."""
    if not obs:
        return None
    val = {o["date"]: float(o["value"]) for o in obs}
    d0 = obs[0]["date"]
    v0 = val[d0]
    y, m = int(d0[:4]), int(d0[5:7])
    prev_m = f"{y - (m == 1)}-{12 if m == 1 else m - 1:02d}-01"
    last_y = f"{y - 1}-{m:02d}-01"
    if how in ("mom", "jobs"):
        if prev_m not in val:
            return None
        return f"{(v0 / val[prev_m] - 1) * 100:.1f}%" if how == "mom" else f"{round(v0 - val[prev_m])}K"
    if how == "yoy":
        return f"{(v0 / val[last_y] - 1) * 100:.1f}%" if last_y in val else None
    if how == "pct1":
        return f"{v0:.1f}%"
    if how == "pct2":
        return f"{v0:.2f}%"
    if how == "claims":
        return f"{round(v0 / 1000)}K"
    if how == "mil":
        return f"{v0 / 1000:.2f}M"
    if how == "thou":
        return f"{round(v0)}K"
    return None


def num(v):
    m = re.search(r"-?\d+(?:\.\d+)?", (v or "").replace(",", ""))
    return float(m.group()) if m else None


def verdict(title, actual, forecast):
    a, f = num(actual), num(forecast)
    if a is None or f is None:
        return None
    if abs(a - f) < 1e-9:
        return "inline"
    up = a > f
    return ("worse" if up else "better") if LOWER_IS_BETTER.search(title) else ("better" if up else "worse")


def run(db):
    key = os.environ.get("FRED_API_KEY")
    if not key:
        return
    now = datetime.now(timezone.utc)
    pending = db._req("GET", "econ_events", params={
        "select": "id,at,title,forecast", "currency": "eq.USD", "impact": "in.(High,Medium)", "actual": "is.null",
        "at": f"lt.{(now - timedelta(minutes=2)).isoformat()}",
        "and": f"(at.gt.{(now - timedelta(hours=36)).isoformat()})"}) or []
    pending = [(e, series_for(e["title"])) for e in pending]
    pending = [(e, s) for e, s in pending if s]
    if not pending:
        return
    cache, found = {}, 0
    for e, (sid, how) in pending:
        try:
            obs = cache[sid] if sid in cache else cache.setdefault(sid, observations(sid, key))
        except Exception as ex:
            print(f"  FRED {sid} skipped: {str(ex)[:100]}")
            cache[sid] = []
            continue
        release_day = datetime.fromisoformat(str(e["at"]).replace("Z", "+00:00")).astimezone(ET).date().isoformat()
        if not obs or obs[0].get("realtime_start", "") < release_day:
            continue   # FRED hasn't got the new number yet: try again next run
        actual = compute(obs, how)
        if not actual:
            continue
        db._req("PATCH", "econ_events", {"actual": actual, "result": verdict(e["title"], actual, e.get("forecast")),
                                         "actual_at": now.isoformat()}, params={"id": f"eq.{e['id']}"})
        found += 1
    print(f"US results (FRED): {found} of {len(pending)} released events filled")
