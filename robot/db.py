"""Tiny Supabase helper (REST API, standard library only). Used by the robot with the secret key."""
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone


def _req(method, path, body=None, params=None, prefer=None):
    url = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/" + path
    if params:
        url += "?" + urllib.parse.urlencode(params, safe="(),.*:\"")
    headers = {"apikey": os.environ["SUPABASE_SERVICE_ROLE_KEY"], "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Supabase {method} {path}: HTTP {e.code} {e.read().decode(errors='replace')[:300]}")


def _quote(v):
    return '"' + str(v).replace("\\", "\\\\").replace('"', '\\"') + '"'


def seen_links(links):
    """Return the subset of `links` already processed."""
    found, links = set(), list(links)
    for i in range(0, len(links), 40):  # small chunks keep the URL short
        chunk = links[i:i + 40]
        rows = _req("GET", "seen_links", params={"select": "link", "link": "in.(" + ",".join(_quote(l) for l in chunk) + ")"})
        found |= {r["link"] for r in rows}
    return found


def mark_seen(link_to_story):
    rows = [{"link": l, "story_id": sid} for l, sid in link_to_story.items()]
    for i in range(0, len(rows), 200):
        _req("POST", "seen_links", rows[i:i + 200], params={"on_conflict": "link"}, prefer="resolution=ignore-duplicates")


def recent_stories(hours=72):
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    cols = "id,event,headline,links,outlets,n_sources,impact_score,alerted_at,created_at"
    params = {"created_at": f"gte.{since}", "order": "created_at.desc", "limit": "500"}
    try:  # growth/timeline (Developing) exist once supabase/008_world.sql has been run
        return _req("GET", "stories", params={"select": cols + ",growth,timeline", **params})
    except RuntimeError as e:
        if "growth" not in str(e) and "timeline" not in str(e):
            raise
        return _req("GET", "stories", params={"select": cols, **params})


def insert_stories(rows):
    return _req("POST", "stories", rows, params={"on_conflict": "event"},
                prefer="resolution=merge-duplicates,return=representation")


def update_story(story_id, fields):
    _req("PATCH", "stories", fields, params={"id": f"eq.{story_id}"})


def user_settings():
    """The owner's settings. select=* so it still works before 003_search.sql adds the new columns."""
    params = {"select": "*", "limit": "1"}
    if os.environ.get("OWNER_USER_ID"):
        params["user_id"] = f"eq.{os.environ['OWNER_USER_ID']}"
    rows = _req("GET", "user_settings", params=params)
    return rows[0] if rows else None


def bump_usage(field, limit):
    """Add 1 to today's counter. Returns the new value, or None if the limit is already reached."""
    today = date.today().isoformat()
    rows = _req("GET", "robot_usage", params={"select": "*", "day": f"eq.{today}"})
    row = rows[0] if rows else {"day": today, "gemini_calls": 0, "alerts_sent": 0}
    if row[field] >= limit:
        return None
    row[field] += 1
    _req("POST", "robot_usage", row, params={"on_conflict": "day"}, prefer="resolution=merge-duplicates")
    return row[field]


def upsert_events(rows):
    """Upcoming events; the same day + title is stored once."""
    _req("POST", "events", rows, params={"on_conflict": "day,title"}, prefer="resolution=merge-duplicates")
