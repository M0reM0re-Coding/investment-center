"""Developing stories (World Brief and My News): remember how a story's coverage grows. No AI needed.

growth   = [{"t": time, "n": outlets}]      one point each time the robot finds more outlets (max 30)
timeline = [{"t": time, "text": headline}]  a new angle on the story: an outlet headline that reads
                                            differently from the ones we have, at most one per 2 hours (max 8)
The website decides what counts as "Developing" (see devInfo in site/app.js), so the rule can change
without touching saved data. Needs the columns from supabase/008_world.sql; before that, nothing is saved.
"""
from datetime import datetime, timedelta, timezone

from fetch import similarity, words

NEW_COLS = ("growth", "timeline")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def start(n, headline, t=None):
    t = t or now_iso()
    return {"growth": [{"t": t, "n": n}], "timeline": [{"t": t, "text": headline}]}


def grow(row, new_n, new_titles):
    """row: saved story with growth, timeline, created_at, headline, n_sources. Returns the updated columns."""
    created = row.get("created_at") or now_iso()
    g = list(row.get("growth") or []) or [{"t": created, "n": row.get("n_sources") or 1}]
    tl = list(row.get("timeline") or []) or [{"t": created, "text": row.get("headline") or ""}]
    if new_n != g[-1]["n"]:
        g.append({"t": now_iso(), "n": new_n})
    last_t = datetime.fromisoformat(str(tl[-1]["t"]).replace("Z", "+00:00"))
    if datetime.now(timezone.utc) - last_t >= timedelta(hours=2):
        known = [words(x["text"]) for x in tl] + [words(row.get("headline") or "")]
        for title in new_titles:
            w = words(title)
            if len(w) >= 4 and all(similarity(w, k) < 0.4 for k in known):
                tl.append({"t": now_iso(), "text": title[:160]})
                break
    return {"growth": g[-30:], "timeline": tl[-8:]}
