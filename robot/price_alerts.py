"""Price alerts: your rules from the website, checked every robot run (every ~30 min), sent to Telegram.

Kinds (table public.price_alerts, made by supabase/007_full_story.sql):
  move  = the stock moved at least VALUE % (up or down) since yesterday's close. Max once per Bangkok day.
  above = price is at or above VALUE. Fires once, then switches itself off (turn it on again on the website).
  below = price is at or below VALUE. Same as above.
Not real-time: GitHub starts the robot every 30 min (sometimes a few minutes late), and Yahoo prices
for Thai stocks can be ~15 min delayed.
"""
import os
from datetime import datetime, timezone

import db
import prices
from notify import BANGKOK, e, send

MAX_PER_RUN = 10  # safety: never flood Telegram


def due(alert, price, prev, today):
    """Return a short note if this alert should fire now, else None."""
    t, v = alert["ticker"], float(alert["value"])
    if alert["kind"] == "move":
        if not prev:
            return None
        fired = alert.get("fired_at")
        if fired and datetime.fromisoformat(fired).astimezone(BANGKOK).date() == today:
            return None  # already told you today
        pct = (price - prev) / prev * 100
        return f"{t} {pct:+.1f}% today, now {price:,.2f}" if abs(pct) >= v else None
    if alert["kind"] == "above" and price >= v:
        return f"{t} is at {price:,.2f}, above your {v:,.2f}"
    if alert["kind"] == "below" and price <= v:
        return f"{t} is at {price:,.2f}, below your {v:,.2f}"
    return None


def run():
    params = {"select": "*", "active": "is.true"}
    if os.environ.get("OWNER_USER_ID"):  # Telegram goes to the owner's chat only
        params["user_id"] = f"eq.{os.environ['OWNER_USER_ID']}"
    try:
        alerts = db._req("GET", "price_alerts", params=params)
    except RuntimeError as err:
        if "price_alerts" in str(err):
            print("Price alerts: run supabase/007_full_story.sql first")
            return 0
        raise
    if not alerts:
        return 0
    q = prices.quotes([a["ticker"] for a in alerts])
    today, sent = datetime.now(BANGKOK).date(), 0
    for a in alerts:
        if a["ticker"] not in q or sent >= MAX_PER_RUN:
            continue
        price, prev = q[a["ticker"]]
        note = due(a, price, prev, today)
        if not note:
            continue
        icon = "📈" if (a["kind"] == "above" or (a["kind"] == "move" and prev and price >= prev)) else "📉"
        site = os.environ.get("SITE_URL", "").rstrip("/")
        text = (f"{icon} <b>Price alert · {e(a['ticker'])}</b>\n{e(note)}"
                + (f'\n<a href="{e(site)}/#/">Open Investment Center</a>' if site else "")
                + "\n<i>Checked every 30 min; prices may be delayed.</i>")
        if send(text):
            sent += 1
            fields = {"fired_at": datetime.now(timezone.utc).isoformat(), "fired_note": note[:120]}
            if a["kind"] != "move":
                fields["active"] = False  # one-shot: switch off until you turn it on again
            db._req("PATCH", "price_alerts", fields, params={"id": f"eq.{a['id']}"})
    print(f"Price alerts: {len(alerts)} active, {sent} sent")
    return sent
