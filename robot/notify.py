"""Telegram: impact alerts + 07:00 morning brief.

Rules agreed 2026-11-22:
  - Alert when impact >= 8 (07:00-23:00 Bangkok) or >= 9 (23:00-07:00 Bangkok)
  - Only stories about the owner's topics or watchlist (from Supabase user_settings)
  - Never twice for the same event (stories.alerted_at), at most 5 alerts per day
  - Morning brief once a day, in the first run after 07:00 Bangkok
"""
import html
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import db

BANGKOK = timezone(timedelta(hours=7))
DAY_THRESHOLD, NIGHT_THRESHOLD = 8, 9
MAX_ALERTS_PER_DAY = 5
BRIEF_HOUR = 7


def send(text):
    """Send one Telegram message (HTML formatting). Returns True if Telegram accepted it."""
    data = urllib.parse.urlencode({
        "chat_id": os.environ["TELEGRAM_CHAT_ID"], "text": text,
        "parse_mode": "HTML", "disable_web_page_preview": "true",
    }).encode()
    url = f"https://api.telegram.org/bot{os.environ['TELEGRAM_BOT_TOKEN']}/sendMessage"
    try:
        with urllib.request.urlopen(url, data, timeout=20) as r:
            return json.loads(r.read()).get("ok", False)
    except Exception as e:
        print(f"  Telegram send failed: {e}")
        return False


def e(s):
    return html.escape(str(s or ""))


def owner_settings():
    uid = os.environ.get("OWNER_USER_ID")
    params = {"select": "*"}
    if uid:
        params["user_id"] = f"eq.{uid}"
    rows = db._req("GET", "user_settings", params=params)
    return rows[0] if rows else {"topics": [], "watchlist": []}


def relevant(story, settings):
    mine = set(settings.get("topics") or []) | set(settings.get("custom_topics") or [])
    watch = bool(set(story.get("tickers") or []) & set(settings.get("watchlist") or []))
    # "Show less like this": skip stories only about muted topics or only from muted sources (watchlist news still counts)
    topics, outlets = set(story.get("topics") or []), set(story.get("outlets") or [])
    if not watch and topics and topics <= set(settings.get("muted_topics") or []):
        return False
    if outlets and outlets <= set(settings.get("muted_sources") or []):
        return False
    return bool(topics & mine) or watch


def story_link(story):
    site = os.environ.get("SITE_URL", "").rstrip("/")
    if site:
        return f"{site}/#/story/{story['id']}"
    links = story.get("links") or []
    return links[0]["link"] if links else ""


def alert_text(s):
    dot = "🔴" if s["impact_score"] >= 9 else "🟠"
    facts = "\n".join(f"• {e(b)}" for b in (s.get("summary") or [])[:3])
    tickers = " · ".join(s.get("tickers") or [])
    link = story_link(s)
    return (f"{dot} <b>IMPACT {s['impact_score']}/10</b>{' · ' + e(tickers) if tickers else ''}\n"
            f"<b>{e(s['headline'])}</b>\n\n{facts}\n\n"
            f"<i>Why {s['impact_score']}: {e(s.get('impact_reason'))}</i>\n"
            f"▲ {s['n_sources']} source{'s' if s['n_sources'] != 1 else ''} · {e(s.get('sentiment'))}"
            + (f'\n<a href="{e(link)}">Read more</a>' if link else ""))


def run_alerts(now=None, force_one=False):
    """Send alerts for new high-impact stories. force_one=True sends the best recent story as a test."""
    now = now or datetime.now(BANGKOK)
    night = now.hour >= 23 or now.hour < 7
    threshold = NIGHT_THRESHOLD if night else DAY_THRESHOLD
    since = (datetime.now(timezone.utc) - timedelta(hours=6 if not force_one else 72)).isoformat()
    params = {"select": "*", "created_at": f"gte.{since}", "order": "impact_score.desc,n_sources.desc"}
    if not force_one:
        params["alerted_at"] = "is.null"
        params["impact_score"] = f"gte.{threshold}"
    stories = db._req("GET", "stories", params=params)
    settings = owner_settings()
    stories = [s for s in stories if relevant(s, settings)]
    if force_one:
        stories = stories[:1]
    sent = 0
    for s in stories:
        if not force_one and db.bump_usage("alerts_sent", MAX_ALERTS_PER_DAY) is None:
            print(f"  Alert cap of {MAX_ALERTS_PER_DAY}/day reached")
            break
        text = alert_text(s)
        if force_one:
            text = "🧪 <b>TEST ALERT</b> (this is what a real alert looks like)\n\n" + text
        if send(text):
            sent += 1
            if not force_one:
                db.update_story(s["id"], {"alerted_at": datetime.now(timezone.utc).isoformat()})
    print(f"Alerts: {sent} sent (threshold {threshold}, {'night' if night else 'day'} mode)")
    return sent


def brief_text(stories, now):
    lines = [f"☀️ <b>Morning brief</b> · {now.strftime('%a %d %b')}",
             f"{len(stories)} top stories for your topics, last 24 hours\n"]
    for i, s in enumerate(stories, 1):
        lines.append(f"<b>{i}. {e(s['headline'])}</b>\n"
                     f"Impact {s['impact_score']}/10 · ▲ {s['n_sources']} · {e(' '.join(s.get('tickers') or []))}\n"
                     f"{e((s.get('what_it_means') or '').split('. ')[0].rstrip('.'))}.\n")
    site = os.environ.get("SITE_URL", "").rstrip("/")
    if site:
        lines.append(f'<a href="{e(site)}">Open Investment Center</a>')
    return "\n".join(lines)


def maybe_brief(now=None, force=False):
    """Send the morning brief once a day, in the first run at or after 07:00 Bangkok."""
    now = now or datetime.now(BANGKOK)
    marker = f"brief:{now.date().isoformat()}"  # stored in seen_links so it's sent once per day
    if not force:
        if now.hour < BRIEF_HOUR or db.seen_links([marker]):
            return False
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    stories = db._req("GET", "stories", params={"select": "*", "created_at": f"gte.{since}"})
    settings = owner_settings()
    mine = [s for s in stories if relevant(s, settings)] or stories
    mine.sort(key=lambda s: -(s["impact_score"] * 3 + min(s["n_sources"], 10)))
    if not mine:
        return False
    ok = send(brief_text(mine[:5], now))
    if ok and not force:
        db.mark_seen({marker: None})
    print(f"Morning brief: {'sent' if ok else 'FAILED'}")
    return ok
