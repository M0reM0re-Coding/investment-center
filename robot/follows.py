"""Follow alerts (design round 34), every run (30 min). Table: follows (supabase/012_follow_earnings_mood.sql).

- story / world: Telegram when a followed story gains 3+ outlets or a new timeline step since the last check.
  A story that hasn't changed for 7 days stops being checked (it has gone quiet).
- place: Telegram for each NEW World story about a followed country ('country:Japan') or region ('region:Asia').
"""
import os
from datetime import datetime, timedelta, timezone

import db
import notify

GROW = 3          # outlets gained before an alert
QUIET_DAYS = 7    # stop checking after this long without changes


def _owner(params):
    uid = os.environ.get("OWNER_USER_ID")
    return {**params, "user_id": f"eq.{uid}"} if uid else params


def _hours(t):
    try:
        return (datetime.now(timezone.utc) - datetime.fromisoformat(str(t).replace("Z", "+00:00"))).total_seconds() / 3600
    except ValueError:
        return 1e9


def _link(kind, sid):
    site = os.environ.get("SITE_URL", "").rstrip("/")
    return f"{site}/#/{'story' if kind == 'story' else 'world'}/{sid}" if site else ""


def story_alerts(follows):
    sent = 0
    for kind, table in (("story", "stories"), ("world", "world_stories")):
        mine = {f["key"]: f for f in follows if f["kind"] == kind}
        if not mine:
            continue
        try:
            rows = db._req("GET", table, params={"select": "id,headline,n_sources,growth,timeline,created_at",
                                                 "id": "in.(" + ",".join(mine) + ")"}) or []
        except RuntimeError:  # growth/timeline columns missing (008 not run): outlets only
            rows = db._req("GET", table, params={"select": "id,headline,n_sources,created_at", "id": "in.(" + ",".join(mine) + ")"}) or []
        for s in rows:
            f = mine[s["id"]]
            n, tl = int(s.get("n_sources") or 0), s.get("timeline") or []
            changes = [p.get("t") for p in (s.get("growth") or []) + tl if isinstance(p, dict) and p.get("t")] or [s["created_at"]]
            if min(_hours(t) for t in changes) > QUIET_DAYS * 24:
                continue
            upd = {"last_n": n, "last_tl": len(tl)}
            if f.get("last_n") is None:   # just followed: remember where it stands, no alert
                pass
            elif n - f["last_n"] >= GROW or len(tl) > (f.get("last_tl") or 0):
                newest = tl[-1]["text"] if len(tl) > (f.get("last_tl") or 0) and tl and isinstance(tl[-1], dict) else ""
                text = (f"🔔 <b>Story you follow grew</b>\n{notify.e(s['headline'])}\nnow {n} outlets (was {f['last_n']})"
                        + (f"\nNew: “{notify.e(newest)}”" if newest else "")
                        + (f"\n{_link(kind, s['id'])}" if _link(kind, s["id"]) else ""))
                if notify.send(text):
                    sent += 1
                    upd["last_alert_at"] = datetime.now(timezone.utc).isoformat()
                else:
                    continue   # Telegram failed: keep the old numbers so the next run tries again
            elif n == f["last_n"] and len(tl) == (f.get("last_tl") or 0):
                continue       # nothing changed: no write
            db._req("PATCH", "follows", upd, params=_owner({"kind": f"eq.{kind}", "key": f"eq.{s['id']}"}))
    return sent


def place_alerts(follows):
    places = [f["key"] for f in follows if f["kind"] == "place"]
    if not places:
        return 0
    since = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat()
    rows = db._req("GET", "world_stories", params={"select": "id,headline,n_sources,region,country,created_at",
                                                   "created_at": f"gte.{since}", "order": "created_at.asc"}) or []
    marks = {r["id"]: f"place:{r['id']}" for r in rows}
    done = db.seen_links(marks.values()) if rows else set()
    sent, seen = 0, {}
    for r in rows:
        if marks[r["id"]] in done:
            continue
        hit = next((p for p in places if (p.startswith("country:") and p[8:].lower() == (r.get("country") or "").lower())
                    or (p.startswith("region:") and p[7:].lower() == (r.get("region") or "").lower())), None)
        if hit:
            text = (f"🌍 <b>New in {notify.e(hit.split(':', 1)[1])}</b>\n{notify.e(r['headline'])} · {r.get('n_sources') or 1} outlets"
                    + (f"\n{_link('world', r['id'])}" if _link("world", r["id"]) else ""))
            if not notify.send(text):
                continue   # try again next run
            sent += 1
        seen[marks[r["id"]]] = None
    if seen:
        db.mark_seen(seen)
    return sent


def run():
    follows = db._req("GET", "follows", params=_owner({"select": "kind,key,label,last_n,last_tl"})) or []
    if not follows:
        return
    a, b = story_alerts(follows), place_alerts(follows)
    print(f"Follow alerts: {len(follows)} follows checked, {a} story updates + {b} place alerts sent")
