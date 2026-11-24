"""Economic calendar from Forex Factory (design round 32).

Forex Factory has no official API and its website blocks scrapers. Its parent company (Fair Economy) publishes a free
weekly JSON file that many tools use: time, currency, impact, forecast, previous (no "actual" values, this week only).
It may block clients that ask too often, so the robot fetches it at most once every 3 hours.
Table: econ_events (supabase/011_econ_calendar.sql).
"""
import json
import urllib.request
from datetime import datetime, timezone

import db

URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
XML = "https://nfs.faireconomy.media/ff_calendar_thisweek.xml"   # same events + each event's Forex Factory page (times in GMT)
IMPACTS = {"High", "Medium", "Low", "Holiday"}


def fetch():
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (investment-center robot)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read())
    rows = []
    for e in data if isinstance(data, list) else []:
        try:
            at = datetime.fromisoformat(e["date"]).astimezone(timezone.utc).isoformat()
        except (KeyError, ValueError, TypeError):
            continue
        title, cur, imp = (e.get("title") or "").strip(), (e.get("country") or "").strip(), e.get("impact")
        if not title or not cur or imp not in IMPACTS:
            continue
        rows.append({"at": at, "currency": cur[:6], "impact": imp, "title": title[:200],
                     "forecast": (e.get("forecast") or "").strip()[:30] or None,
                     "previous": (e.get("previous") or "").strip()[:30] or None,
                     "updated_at": datetime.now(timezone.utc).isoformat()})
    urls = event_urls()
    for r in rows:
        u = urls.get((r["currency"], r["title"], r["at"][:16])) or urls.get((r["currency"], r["title"]))
        if u:
            r["url"] = u
    # the same event twice in one file would break the upsert
    return list({(r["at"], r["currency"], r["title"]): r for r in rows}.values())


def event_urls():
    """{(currency, title, 'YYYY-MM-DDTHH:MM' UTC) or (currency, title): forexfactory.com page} from the XML file."""
    import xml.etree.ElementTree as ET
    out = {}
    try:
        req = urllib.request.Request(XML, headers={"User-Agent": "Mozilla/5.0 (investment-center robot)"})
        with urllib.request.urlopen(req, timeout=30) as r:
            root = ET.fromstring(r.read())
    except Exception as e:
        print(f"  Forex Factory links skipped: {str(e)[:80]}")
        return out
    for ev in root.iter("event"):
        g = lambda k: (ev.findtext(k) or "").strip()
        url, cur, title = g("url"), g("country"), g("title")
        if not url.startswith("https://www.forexfactory.com/"):
            continue
        out.setdefault((cur, title), url)
        try:
            at = datetime.strptime(g("date") + " " + g("time").upper(), "%m-%d-%Y %I:%M%p").replace(tzinfo=timezone.utc)
            out[(cur, title, at.isoformat()[:16])] = url
        except ValueError:   # "All Day" / "Tentative"
            pass
    return out


def run(force=False):
    """At most once per 3-hour block (UTC 0-3, 3-6, ...), remembered in seen_links like the earnings check."""
    now = datetime.now(timezone.utc)
    mark = f"econ:{now.date().isoformat()}:{now.hour // 3}"
    if not force and db.seen_links([mark]):
        return
    rows = fetch()
    if rows:
        db._req("POST", "econ_events", rows, params={"on_conflict": "at,currency,title"},
                prefer="resolution=merge-duplicates")
    db.mark_seen({mark: None})
    hi = sum(r["impact"] == "High" for r in rows)
    print(f"Economic calendar (Forex Factory): {len(rows)} events saved, {hi} high impact")


if __name__ == "__main__":
    import os
    from pathlib import Path
    env = Path(__file__).resolve().parent.parent / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"'))
    run(force=True)
