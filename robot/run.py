"""Investment Center robot: one full run (this is what GitHub runs every 30 minutes).

  1. Read your topics + watchlist from Supabase (falls back to defaults)
  2. Fetch all feeds, group and rule-rank stories
  3. Keep only stories with links the robot hasn't processed before
  4. Gemini: merge duplicates (only when busy), then analyse the best new stories
  5. Save to Supabase: new events are inserted; known events just gain the new sources
  6. Remember every processed link, so the next run skips it

Run from the "Investment Center" folder:
  python robot/run.py
  python robot/run.py --max 5      (analyse at most 5 stories this run)
"""
import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import analyze as ai  # noqa: E402
import db  # noqa: E402
from fetch import collect  # noqa: E402
from images import related_photo, story_image  # noqa: E402
import prices  # noqa: E402
import re  # noqa: E402
from datetime import date, datetime, timedelta, timezone  # noqa: E402
import notify  # noqa: E402
import price_alerts  # noqa: E402
import drawing_alerts  # noqa: E402
import world  # noqa: E402
import developing  # noqa: E402
import econ  # noqa: E402
import econ_actuals  # noqa: E402
import earnings  # noqa: E402
import follows  # noqa: E402
import gauges  # noqa: E402
import stock_stats  # noqa: E402
import heatmap  # noqa: E402

GEMINI_DAILY_CAP = int(os.environ.get("GEMINI_DAILY_CAP", "300"))  # safety cap; free tier limits are separate
# 300 = ~48 merge calls + ~100 writing calls + retries. Billing is OFF on the AI Studio project, so Google can't charge.
MIN_RULE_SCORE = 4          # stories below this are skipped unless widely covered
MERGE_WHEN_MORE_THAN = 3    # merge on (almost) every run: the headline matcher misses re-worded copies of one event
                            # (test 2026-11-24: the AI folded 39 headlines into 6 stories). Uses Lite models, ~48 calls/day.


def db_counter():
    n = db.bump_usage("gemini_calls", GEMINI_DAILY_CAP)
    if n is None:
        raise ai.QuotaReached(f"daily cap of {GEMINI_DAILY_CAP} Gemini calls reached")
    return n


NEW_COLUMNS = ("image_credit", "prices_at", "upcoming",   # added by supabase/005_reading.sql
               "full_story", "story_from", "for_you", "terms",  # added by supabase/007_full_story.sql
               "growth", "timeline")                            # added by supabase/008_world.sql


def clean_upcoming(items):
    """Keep only well-formed future dates within a year (the AI is told never to guess dates)."""
    today, out = date.today(), []
    for u in items or []:
        d, what = str(u.get("date", "")), str(u.get("what", "")).strip()[:80]
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", d) and what:
            try:
                day = date.fromisoformat(d)
            except ValueError:
                continue
            if today <= day <= today + timedelta(days=365):
                out.append({"date": d, "what": what})
    return out[:3]


def to_row(s, watchlist=()):
    a = s["ai"]
    tickers = sorted(set(a["tickers"]) | set(s["tickers"]))
    img, credit = story_image(s.get("image"), s["all_links"]), None
    if not img:  # no publisher picture: a related free photo (Pexels), with the photographer's credit
        img, credit = related_photo(a.get("photo_query"), s["topics"])
    return {
        "event": a["event"], "headline": a["headline"], "summary": a["summary"],
        "what_it_means": a["what_it_means"], "winners": a["winners"], "losers": a["losers"],
        "watch_next": a["watch_next"], "impact_score": max(1, min(10, a["impact_score"])),
        "impact_reason": a["impact_reason"], "impact_parts": a["impact_parts"], "sentiment": a["sentiment"],
        "tickers": tickers, "topics": s["topics"],
        "outlets": s["outlets"], "n_sources": s["n_sources"], "links": s["all_links"],
        "rule_score": s["score"], "published_at": s["published"],
        "image_url": img, "image_credit": credit,
        "prices_at": prices.prices_now(prices.real_tickers(tickers, watchlist)),  # for "+1.6% since this news"
        "upcoming": clean_upcoming(a.get("upcoming")),
        "full_story": [p for p in (a.get("full_story") or []) if p.strip()][:5],
        "story_from": [o for o, _ in s.get("articles") or []] if a.get("full_story") else [],  # outlets the AI read
        "for_you": (a.get("for_you") or "").strip()[:240] or None,
        "terms": clean_terms(a.get("terms"), a),
        **developing.start(s["n_sources"], a["headline"], s["published"]),  # Developing (008_world.sql)
    }


def clean_terms(items, a):
    """Keep only terms that really appear in the text the site shows (so the hover box has a word to sit on)."""
    text = " ".join((a.get("summary") or []) + (a.get("full_story") or []) + [a.get("what_it_means") or ""])
    out = []
    for t in items or []:
        term, why = str(t.get("term", "")).strip(), str(t.get("explain", "")).strip()
        if 2 <= len(term) <= 40 and why and term in text and term.lower() not in {x["term"].lower() for x in out}:
            out.append({"term": term, "explain": why[:200]})
    return out[:4]


def save_new(rows):
    """Insert new stories. Before 005_reading.sql has been run, retry without the new columns."""
    try:
        return db.insert_stories(rows)
    except RuntimeError as e:
        if not any(c in str(e) for c in NEW_COLUMNS):
            raise
        print("  Note: run supabase/005_reading.sql and 007_full_story.sql to store photo credits, prices, events and full stories")
        return db.insert_stories([{k: v for k, v in r.items() if k not in NEW_COLUMNS} for r in rows])


def news_events(saved_rows):
    """Dated events the AI found in new stories -> the Upcoming list."""
    rows = [{"day": u["date"], "title": u["what"], "kind": "news", "story_id": r["id"]}
            for r in saved_rows for u in (r.get("upcoming") or [])]
    if rows:
        try:
            db.upsert_events(rows)
        except RuntimeError as e:
            print(f"  Events not saved: {str(e)[:120]}")


def maybe_refresh_earnings(watchlist):
    """Next earnings / ex-dividend dates (Yahoo), checked once a day PER STOCK.
    A stock you just added gets its dates on the next run (within 30 minutes), not the next day."""
    today = date.today().isoformat()
    try:
        tickers = prices.real_tickers(watchlist, watchlist)
        marks = {t: f"events:{today}:{t}" for t in tickers}
        done = db.seen_links(marks.values())
        todo = [t for t in tickers if marks[t] not in done][:30]   # earnings_events reads at most 30 per run; the rest wait for the next run
        if not todo:
            return
        rows = [e for e in prices.earnings_events(todo) if e["day"] >= today]
        if rows:
            db.upsert_events(rows)
        db.mark_seen({marks[t]: None for t in todo})
        print(f"Upcoming events: {len(rows)} earnings/dividend dates saved for {', '.join(todo)}")
    except RuntimeError as e:
        print(f"  Earnings dates not saved: {str(e)[:120]}")


def backfill_images():
    """One-off: find pictures for saved stories that don't have one yet."""
    rows = db._req("GET", "stories", params={"select": "id,links,topics", "image_url": "is.null", "limit": "200"})
    found = 0
    for r in rows:
        img, credit = story_image(None, r["links"] or []), None
        if not img:
            img, credit = related_photo(None, r.get("topics"))
        if img:
            db.update_story(r["id"], {"image_url": img, **({"image_credit": credit} if credit else {})})
            found += 1
    print(f"Backfill: pictures found for {found} of {len(rows)} stories without one")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ai.load_env()
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=10, help="max stories to analyse this run")
    ap.add_argument("--backfill-images", action="store_true", help="only add pictures to saved stories, then stop")
    ap.add_argument("--test-alert", action="store_true", help="send the best recent story to Telegram as a test, then stop")
    ap.add_argument("--test-brief", action="store_true", help="send the morning brief now as a test, then stop")
    ap.add_argument("--test-weekly", action="store_true", help="send the Sunday world recap now as a test, then stop")
    ap.add_argument("--cleanup-dry", action="store_true", help="show how many old rows the 90-day cleanup would delete, then stop")
    args = ap.parse_args()
    if args.backfill_images:
        return backfill_images()
    if args.test_alert:
        return notify.run_alerts(force_one=True)
    if args.test_brief:
        return notify.maybe_brief(force=True)
    if args.test_weekly:
        return notify.maybe_weekly(force=True)
    if args.cleanup_dry:
        return print("Would delete (older than 90 days, keeping saved / noted / Later / voted):", db.cleanup_old(dry=True))
    ai.COUNTER = db_counter
    ai.MEMORY = (db.used_up_models, db.mark_used_up)   # skip models used up today

    settings = db.user_settings() or {}
    _, stories = collect(watchlist=settings.get("watchlist"), verbose=False,
                         custom_topics=settings.get("custom_topics"), watch_names=settings.get("watch_names"))

    all_links = {l["link"] for s in stories for l in s["all_links"]}
    seen = db.seen_links(all_links)
    fresh = []
    for s in stories:
        new = [l for l in s["all_links"] if l["link"] not in seen]
        if new:
            fresh.append(s)
    print(f"{len(stories)} stories in feeds, {len(fresh)} with new articles")

    worth = [s for s in fresh if s["score"] >= MIN_RULE_SCORE or s["n_sources"] >= 3]
    skipped = [s for s in fresh if s not in worth]
    print(f"{len(worth)} worth analysing, {len(skipped)} low-relevance skipped")

    recent = db.recent_stories()
    by_event = {r["event"]: r for r in recent}
    link_to_story = {}

    try:
        if len(worth) > MERGE_WHEN_MORE_THAN:
            worth = ai.merge_duplicates(worth[:60])
            worth.sort(key=lambda s: (-(s["n_sources"] >= 3), -s["score"]))
        picked = ai.diverse(worth, limit=args.max, cap=2)
        reader = {"watchlist": settings.get("watchlist") or [], "watch_names": settings.get("watch_names") or {},
                  "topics": (settings.get("topics") or []) + (settings.get("custom_topics") or [])}
        analyzed = ai.drop_same_event(ai.analyze(picked, [(r["event"], r["headline"]) for r in recent], reader)) if picked else []
    except (ai.QuotaReached, RuntimeError, ValueError, KeyError) as e:
        # Analysis failed this run: save nothing new, leave these stories unseen so the next run retries them
        print(f"Stopped AI step safely: {str(e)[:200]}")
        analyzed, picked = [], []

    new_rows, updated = [], 0
    for s in analyzed:
        ev = s["ai"]["event"]
        if ev in by_event:  # known event: add the new sources, keep the existing analysis
            old = by_event[ev]
            known = {l["link"] for l in old["links"]}
            links = old["links"] + [l for l in s["all_links"] if l["link"] not in known]
            outlets = sorted({l["outlet"] for l in links})
            fields = {"links": links, "outlets": outlets, "n_sources": len(outlets), "updated_at": "now()"}
            if "growth" in old:  # Developing: remember how coverage grows (columns from 008_world.sql)
                fields.update(developing.grow(old, len(outlets), [l["title"] for l in s["all_links"] if l["link"] not in known]))
            db.update_story(old["id"], fields)
            for l in s["all_links"]:
                link_to_story[l["link"]] = old["id"]
            updated += 1
        else:
            new_rows.append((s, to_row(s, settings.get("watchlist") or [])))

    if new_rows:
        saved = save_new([row for _, row in new_rows])
        news_events(saved)
        ids = {r["event"]: r["id"] for r in saved}
        for s, row in new_rows:
            for l in s["all_links"]:
                link_to_story[l["link"]] = ids.get(row["event"])

    # Low-relevance stories are marked seen too, so they aren't re-checked every run.
    # Stories that were worth it but didn't fit this run stay unseen and get picked up next run.
    for s in skipped:
        for l in s["all_links"]:
            link_to_story.setdefault(l["link"], None)
    db.mark_seen(link_to_story)

    print(f"Saved: {len(new_rows)} new stories, {updated} existing stories got new sources, "
          f"{len(link_to_story)} links remembered")
    for s, row in sorted(new_rows, key=lambda x: -x[1]["impact_score"]):
        print(f"  impact {row['impact_score']:>2} | {row['n_sources']:>2} src | {row['headline'][:90]}")

    # Telegram: alerts for new high-impact stories, then the morning brief if it's due
    notify.run_alerts()
    notify.maybe_brief()
    try:
        notify.maybe_weekly()  # Sundays only
    except Exception as e:
        print(f"Weekly recap skipped: {str(e)[:150]}")
    try:
        price_alerts.run()
    except Exception as e:  # a price problem must never stop the rest of the run
        print(f"Price alerts skipped: {str(e)[:150]}")
    try:
        drawing_alerts.run()  # bells on chart drawings (trend lines, horizontal lines, Fibonacci levels)
    except Exception as e:
        print(f"Drawing alerts skipped: {str(e)[:150]}")
    maybe_refresh_earnings((settings.get("watchlist") or []) + stock_stats.big_stocks())   # + big stocks: Charts "Important dates"
    try:
        econ.run()  # Forex Factory economic calendar: at most every 3 hours
    except Exception as e:  # a calendar problem must never stop the rest of the run
        print(f"Economic calendar skipped: {str(e)[:150]}")
    try:
        econ_actuals.run(db)  # US results from FRED after each release (needs FRED_API_KEY)
    except Exception as e:
        print(f"US results (FRED) skipped: {str(e)[:150]}")
    for name, job in (("Earnings results", lambda: earnings.run(settings.get("watchlist") or [])),   # once a day per stock
                      ("Crypto Fear & Greed", gauges.run),                                          # once an hour
                      ("Stock stats", lambda: stock_stats.run(settings.get("watchlist") or [])),     # Charts: once a day per stock
                      ("Heat map members", heatmap.run)):                                            # Charts heat map: once a day                                          # once an hour
        try:
            job()
        except Exception as e:  # none of these may stop the rest of the run
            print(f"{name} skipped: {str(e)[:150]}")
    try:
        world.run(reader={"watchlist": settings.get("watchlist") or []})  # World Brief (page 2): at most once an hour
    except Exception as e:  # a World Brief problem must never break My News
        print(f"World Brief skipped: {str(e)[:150]}")
    try:
        follows.run()  # followed stories + places -> Telegram (needs supabase/012)
    except Exception as e:
        print(f"Follow alerts skipped: {str(e)[:150]}")
    try:  # once a day (the run between 03:00 and 04:00 Bangkok): delete rows older than 90 days
        if datetime.now(timezone.utc).hour == 20:
            print("90-day cleanup, deleted:", db.cleanup_old())
    except Exception as e:
        print(f"Cleanup skipped: {str(e)[:150]}")


if __name__ == "__main__":
    main()
