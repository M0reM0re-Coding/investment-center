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
from images import story_image  # noqa: E402
import notify  # noqa: E402

GEMINI_DAILY_CAP = int(os.environ.get("GEMINI_DAILY_CAP", "120"))  # safety cap; free tier limits are separate
MIN_RULE_SCORE = 4          # stories below this are skipped unless widely covered
MERGE_WHEN_MORE_THAN = 25   # spend a merge call only when many new stories arrive at once


def db_counter():
    n = db.bump_usage("gemini_calls", GEMINI_DAILY_CAP)
    if n is None:
        raise ai.QuotaReached(f"daily cap of {GEMINI_DAILY_CAP} Gemini calls reached")
    return n


def to_row(s):
    a = s["ai"]
    return {
        "event": a["event"], "headline": a["headline"], "summary": a["summary"],
        "what_it_means": a["what_it_means"], "winners": a["winners"], "losers": a["losers"],
        "watch_next": a["watch_next"], "impact_score": max(1, min(10, a["impact_score"])),
        "impact_reason": a["impact_reason"], "impact_parts": a["impact_parts"], "sentiment": a["sentiment"],
        "tickers": sorted(set(a["tickers"]) | set(s["tickers"])), "topics": s["topics"],
        "outlets": s["outlets"], "n_sources": s["n_sources"], "links": s["all_links"],
        "rule_score": s["score"], "published_at": s["published"],
        "image_url": story_image(s.get("image"), s["all_links"]),
    }


def backfill_images():
    """One-off: find pictures for saved stories that don't have one yet."""
    rows = db._req("GET", "stories", params={"select": "id,links", "image_url": "is.null", "limit": "200"})
    found = 0
    for r in rows:
        img = story_image(None, r["links"] or [])
        if img:
            db.update_story(r["id"], {"image_url": img})
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
    args = ap.parse_args()
    if args.backfill_images:
        return backfill_images()
    if args.test_alert:
        return notify.run_alerts(force_one=True)
    if args.test_brief:
        return notify.maybe_brief(force=True)
    ai.COUNTER = db_counter

    settings = db.user_settings() or {}
    _, stories = collect(watchlist=settings.get("watchlist"), verbose=False)

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
        analyzed = ai.drop_same_event(ai.analyze(picked, [(r["event"], r["headline"]) for r in recent])) if picked else []
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
            db.update_story(old["id"], {"links": links, "outlets": outlets, "n_sources": len(outlets),
                                        "updated_at": "now()"})
            for l in s["all_links"]:
                link_to_story[l["link"]] = old["id"]
            updated += 1
        else:
            new_rows.append((s, to_row(s)))

    if new_rows:
        saved = db.insert_stories([row for _, row in new_rows])
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


if __name__ == "__main__":
    main()
