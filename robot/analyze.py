"""Investment Center robot, milestone M2: Gemini writes summary, analysis and impact score.

What it does:
  1. Reads the ranked stories from ../out/m1_stories.json (run fetch.py first)
  2. Asks Gemini to merge headlines that are the same story (one call)
  3. Sends the top stories to Gemini in batches of 5 for: rewritten headline, detailed summary,
     analysis, impact score 1-10 with reasons, sentiment, tickers
  4. Saves to ../out/m2_analyzed.json and prints a readable version

Run from the "Investment Center" folder:
  python robot/analyze.py               (analyse the top 10 stories)
  python robot/analyze.py --top 5
  python robot/analyze.py --list-models (show which Gemini models your key can use)

Free-tier safety: stops after MAX_CALLS_PER_DAY Gemini calls per day, and stops at once
if Google answers "429 / quota exceeded". With billing OFF on your AI Studio project,
Google cannot charge you anything.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).parent.parent
OUT = ROOT / "out"
USAGE_FILE = OUT / "gemini_usage.json"
MAX_CALLS_PER_DAY = 40
BATCH_SIZE = 5   # was 10; full article text makes each story bigger, and smaller calls answer faster
# Fallback chain: each model has its OWN free daily limit on the same key (checked in AI Studio 2026-11-22).
# Best quality first (Flash-class, ~20/day each), then high-volume Lite (500/day each), then Gemma (14,400/day).
# Side-by-side test 2026-11-22: impact scores agree within ±1 across models; Flash writes the most precise
# analysis, 3.1-Lite is close behind, 3.5-Lite gives fewer facts. gemini-2.5-flash is retired (404).
DEFAULT_MODELS = ("gemini-4-hydrogen,gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3-flash-preview,"
                  "gemini-3.1-flash-lite,gemini-3.5-flash-lite,gemma-4-31b-it")
_exhausted = set()  # models skipped for the rest of this run (limit reached, gone, or too slow)
# Memory across runs (Supabase table robot_flags, supabase/010_robot_upkeep.sql). run.py plugs in
# (load_fn, mark_fn). A model whose DAILY free limit is used up is skipped until Google resets it
# (midnight Pacific time = 15:00 Bangkok), so later runs don't waste calls and minutes re-trying it.
MEMORY = None
_memory_loaded = [False]
RUN_START = time.time()
RUN_BUDGET_S = 8 * 60   # stop waiting for busy models after ~8 minutes (GitHub stops a run after 15)
API = "https://generativelanguage.googleapis.com/v1beta"


class QuotaReached(Exception):
    daily = False   # True when Google says the model's DAILY limit is used up (not just the per-minute one)


class Busy(Exception):
    """Google says the model is temporarily overloaded (HTTP 500/503)."""


class Slow(Busy):
    """No answer within the time limit. That model is skipped for the rest of this run,
    so a run can't hang for many minutes (GitHub stops a run after 15)."""


def load_env():
    """Read KEY=value lines from .env into os.environ (no extra library needed)."""
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


COUNTER = None  # run.py swaps in a Supabase-backed counter (the robot has no disk on GitHub)


def count_call():
    """Daily call counter. Refuses to go over MAX_CALLS_PER_DAY."""
    if COUNTER:
        return COUNTER()
    OUT.mkdir(exist_ok=True)
    today = date.today().isoformat()
    usage = json.loads(USAGE_FILE.read_text()) if USAGE_FILE.exists() else {}
    if usage.get("date") != today:
        usage = {"date": today, "calls": 0}
    if usage["calls"] >= MAX_CALLS_PER_DAY:
        raise QuotaReached(f"Daily safety cap of {MAX_CALLS_PER_DAY} calls reached")
    usage["calls"] += 1
    USAGE_FILE.write_text(json.dumps(usage))
    return usage["calls"]


def http(url, body=None):
    key = os.environ["GEMINI_API_KEY"]
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", "x-goog-api-key": key},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except (TimeoutError, ConnectionError) as e:  # slow or dropped answer: try the next model instead of crashing
        raise Slow(f"no answer in time ({type(e).__name__})")
    except urllib.error.HTTPError as e:
        body_text = e.read().decode(errors="replace")
        detail = body_text[:300]
        if e.code == 429:
            # Google names the limit that was hit, e.g. "GenerateRequestsPerDayPerProjectPerModel-FreeTier"
            # (daily: used up until the reset) or "...PerMinute..." (just slow down; fine again next run)
            q = QuotaReached("Google says the daily limit is used up (429)" if "PerDay" in body_text
                             else "Google says too many requests this minute (429)")
            q.daily = "PerDay" in body_text
            raise q
        if e.code in (500, 503):
            raise Busy(f"Google says the model is busy ({e.code})")
        if e.code == 404:
            raise QuotaReached(f"model not available any more (404)")  # skip it for the rest of this run
        raise RuntimeError(f"Gemini HTTP {e.code}: {detail}")
    except urllib.error.URLError as e:  # network trouble (also wraps timeouts on some systems)
        raise Busy(f"network problem ({e.reason})")


def models():
    chain = os.environ.get("GEMINI_MODELS") or os.environ.get("GEMINI_MODEL") or DEFAULT_MODELS
    return [m.strip() for m in chain.split(",") if m.strip()]


def _extract_json(text):
    """Gemma has no strict JSON mode, so cut the JSON object out of its answer."""
    start, end = text.find("{"), text.rfind("}")
    return json.loads(text[start:end + 1])


def next_reset():
    """When Google's free daily limits reset: midnight Pacific time (15:00 or 16:00 Bangkok)."""
    from datetime import datetime, timedelta
    try:
        from zoneinfo import ZoneInfo
        now = datetime.now(ZoneInfo("America/Los_Angeles"))
    except Exception:  # no time-zone data: assume Pacific standard time (UTC-8)
        from datetime import timezone
        now = datetime.now(timezone(timedelta(hours=-8)))
    return (now + timedelta(days=1)).replace(hour=0, minute=1, second=0, microsecond=0)


def _load_memory():
    """Once per run: skip models already known to be used up today."""
    if _memory_loaded[0] or not MEMORY:
        return
    _memory_loaded[0] = True
    try:
        used = MEMORY[0]()
    except Exception as e:  # e.g. the robot_flags table isn't created yet: carry on without memory
        print(f"  (model memory unavailable: {str(e)[:120]})")
        return
    if used:
        _exhausted.update(used)
        print(f"  Skipping models used up today (until the 15:00 reset): {', '.join(sorted(used))}")


def _remember_used_up(model):
    if not MEMORY:
        return
    try:
        MEMORY[1](model, next_reset().isoformat(), "daily limit")
    except Exception as e:
        print(f"  (could not save model memory: {str(e)[:120]})")


def gemini_json(prompt, schema, lite_first=False):
    """One AI call that must return JSON matching `schema`. Moves down the model chain when a model's limit is hit.
    lite_first: simple jobs (grouping headlines) use the high-volume Lite models first, saving the scarce Flash calls."""
    _load_memory()
    chain = models()
    if lite_first:
        chain = [m for m in chain if "lite" in m] + [m for m in chain if "lite" not in m]
    # Round 1 tries every model; when they are all busy (503), wait and try again: overloads usually pass
    # within a minute. Round 3 only if the run still has time left.
    tries = [(r, m) for r in range(3) for m in chain]
    failed = False
    for rnd, model in tries:
        if model in _exhausted:
            continue
        if failed and time.time() - RUN_START > RUN_BUDGET_S:   # only gives up while models are failing
            print("  Models keep failing and the run is running long: stopping the AI step for now (next run retries)")
            break
        if rnd and model == next(m for m in chain if m not in _exhausted):
            wait = 20 if rnd == 1 else 45
            if time.time() - RUN_START + wait > RUN_BUDGET_S:
                print("  All models busy and the run is running long: stopping the AI step for now")
                break
            print(f"  All models busy: waiting {wait} seconds, then one more round")
            time.sleep(wait)
        n = count_call()
        if model.startswith("gemma"):
            body = {"contents": [{"role": "user", "parts": [{"text": prompt + "\n\nReturn ONLY one JSON object, no other text. JSON schema:\n" + json.dumps(schema)}]}],
                    "generationConfig": {"temperature": 0.2}}
        else:
            body = {"contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {"responseMimeType": "application/json", "responseSchema": schema, "temperature": 0.2}}
        try:
            data = http(f"{API}/models/{model}:generateContent", body)
        except QuotaReached as e:
            print(f"  {model}: {e}, switching to the next model")
            _exhausted.add(model)
            if e.daily:
                _remember_used_up(model)
            failed = True
            continue
        except Busy as e:
            print(f"  {model}: {e}, trying the next model")
            if isinstance(e, Slow):
                _exhausted.add(model)
            failed = True
            continue
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        print(f"  (AI call {n} today, model {model})")
        return _extract_json(text) if model.startswith("gemma") else json.loads(text)
    raise QuotaReached("every model in the chain is at its limit or busy right now")


def merge_duplicates(stories):
    """Ask Gemini which headlines describe the same event, then merge those groups."""
    listing = "\n".join(f"{i}: {s['title']}" for i, s in enumerate(stories))
    schema = {"type": "OBJECT", "properties": {"groups": {"type": "ARRAY", "items": {"type": "ARRAY", "items": {"type": "INTEGER"}}}}, "required": ["groups"]}
    prompt = (
        "Below are numbered news headlines. Group the numbers of headlines that are about the SAME underlying news event, "
        "so a reader would not want to read them twice. Treat these as the same event: different wording of one announcement; "
        "the same price move of the same stock/index in the same period (e.g. 'X falls 48% from peak' and 'X down 48%, worst week'); "
        "an event and articles that just react to it the same day. "
        "Treat as DIFFERENT: separate developments about the same company (e.g. a CEO resignation vs an accounting probe). "
        "Only return groups with 2 or more numbers.\n\n" + listing
    )
    groups = gemini_json(prompt, schema, lite_first=True)["groups"]
    absorbed, merged = set(), []
    for grp in groups:
        grp = sorted({i for i in grp if 0 <= i < len(stories)})
        if len(grp) < 2 or absorbed & set(grp):
            continue
        lead = dict(stories[grp[0]])
        for i in grp[1:]:
            lead["all_links"] = lead["all_links"] + stories[i]["all_links"]
            lead["topics"] = sorted(set(lead["topics"]) | set(stories[i]["topics"]))
            lead["tickers"] = sorted(set(lead["tickers"]) | set(stories[i]["tickers"]))
        lead["outlets"] = sorted({l["outlet"] for l in lead["all_links"]})
        lead["n_sources"] = len(lead["outlets"])
        merged.append((grp[0], lead))
        absorbed |= set(grp)
    result = []
    for i, s in enumerate(stories):
        if i in absorbed:
            result.extend(m for first, m in merged if first == i)
        else:
            result.append(s)
    print(f"  Merged {len(absorbed)} headlines into {len(merged)} stories")
    return result


ANALYSIS_SCHEMA = {
    "type": "OBJECT",
    "properties": {"stories": {"type": "ARRAY", "items": {
        "type": "OBJECT",
        "properties": {
            "id": {"type": "INTEGER"},
            "event": {"type": "STRING"},
            "headline": {"type": "STRING"},
            "summary": {"type": "ARRAY", "items": {"type": "STRING"}},
            "full_story": {"type": "ARRAY", "items": {"type": "STRING"}},
            "for_you": {"type": "STRING"},
            "terms": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
                "term": {"type": "STRING"}, "explain": {"type": "STRING"}}, "required": ["term", "explain"]}},
            "what_it_means": {"type": "STRING"},
            "winners": {"type": "ARRAY", "items": {"type": "STRING"}},
            "losers": {"type": "ARRAY", "items": {"type": "STRING"}},
            "watch_next": {"type": "STRING"},
            "impact_score": {"type": "INTEGER"},
            "impact_reason": {"type": "STRING"},
            "impact_parts": {"type": "OBJECT", "properties": {
                "reach": {"type": "INTEGER"}, "surprise": {"type": "INTEGER"},
                "size": {"type": "INTEGER"}, "timing": {"type": "INTEGER"}},
                "required": ["reach", "surprise", "size", "timing"]},
            "sentiment": {"type": "STRING", "enum": ["Bullish", "Bearish", "Neutral", "Mixed"]},
            "tickers": {"type": "ARRAY", "items": {"type": "STRING"}},
            "photo_query": {"type": "STRING"},
            "upcoming": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
                "date": {"type": "STRING"}, "what": {"type": "STRING"}}, "required": ["date", "what"]}},
        },
        "required": ["id", "event", "headline", "summary", "what_it_means", "winners", "losers", "watch_next",
                     "impact_score", "impact_reason", "impact_parts", "sentiment", "tickers"],
    }}},
    "required": ["stories"],
}

ANALYSIS_RULES = """You are a careful financial news analyst writing for a Thai accounting/finance student who invests in Thai (SET) and US stocks.
For each story below you get every outlet's headline and snippet, and for some stories the text of 1-2 full articles.
Write in plain English.

STRICT RULES
- Use ONLY facts present in the given headlines/snippets/article text. Never invent numbers, names, dates or quotes.
- Never copy sentences from the article text: always write in your own words.
- If a detail is unclear or outlets disagree, say so (e.g. "reports differ on the size").
- If a claim comes from a single unnamed source or "media reports", say it is unconfirmed.

FIELDS
- event: a short lowercase label for the underlying event, words joined by hyphens, e.g. "nvidia-sec-accounting-probe",
  "fed-rate-decision-dec", "bitcoin-two-year-low". Stories about the same event must get the same label.
- headline: a neutral, factual rewrite (no clickbait), max 14 words.
- summary: 4-7 bullet facts, most important first, each one sentence, include the numbers given.
- full_story: ONLY when the story has ARTICLE TEXT: the story told properly in 3-4 short paragraphs, 200-300 words in total:
  (1) what happened, (2) the key numbers and details, (3) background: how we got here, (4) reactions and what people
  disagree on. Plain words; explain jargon in a few words. No analysis or advice here (that goes in what_it_means).
  When the story has NO article text, return an empty list.
- what_it_means: 2-3 sentences of analysis: why this matters for markets/investors.
- for_you: ONE sentence (max 30 words) on why this matters to THIS reader, naming the specific stock(s) or topic(s)
  from READER'S WATCHLIST/TOPICS below that it touches, e.g. "You follow KBANK: lower card repayments could lift its
  bad-debt risk." If it touches none of them, return an empty string. Never give buy/sell advice.
- terms: 2-4 finance or business terms that a student might not know, copied EXACTLY as they are written in your
  summary, full_story or what_it_means (same spelling and capitals), each with a plain-English explanation of max
  25 words, e.g. {"term": "short ETF", "explain": "A fund that rises when a stock falls, so its owners lose money
  when the stock jumps."}. Skip everyday words. Empty list if none.
- winners / losers: who could benefit / be hurt (companies, sectors, countries). Empty list if none.
- watch_next: one sentence on what to watch next.
- impact_parts, each scored 1-10:
    reach    = 1 one small company ... 10 whole global market
    surprise = 1 fully expected / already priced in ... 10 complete shock
    size     = 1 tiny amounts ... 10 huge amounts or very large % moves
    timing   = 1 effect years away ... 10 moves prices today
- impact_score: 1-10 overall market impact (not just an average; a shock with wide reach should score high).
  Calibration: routine company news 2-4; notable sector news 5-6; major market-moving 7-8; rare crisis-level 9-10.
- impact_reason: one sentence explaining the score.
- sentiment: market mood for the main asset involved.
- tickers: stock tickers clearly involved (e.g. NVDA, KBANK). Empty list if none.
- photo_query: 2-4 plain words for a generic stock photo that fits the story: objects or places only,
  no people's names, no company names or logos. e.g. "oil refinery", "semiconductor wafer", "bangkok skyline", "gold bars".
- upcoming: future events with a FULL date (day and month) written in the headlines/snippets, as
  {"date": "YYYY-MM-DD", "what": "max 8 words"}. Never guess a date. Empty list if none.
"""


def diverse(stories, limit, cap):
    """Pick the best-scored stories but at most `cap` per main ticker/topic, so one name can't flood the list.
    A widely covered story (3+ outlets) may use one extra slot, never more."""
    picked, counts = [], {}
    for s in stories:
        key = (s["tickers"] or s["topics"] or ["other"])[0]
        if counts.get(key, 0) < cap + (1 if s["n_sources"] >= 3 else 0):
            picked.append(s)
            counts[key] = counts.get(key, 0) + 1
        if len(picked) >= limit:
            break
    return picked


def drop_same_event(analyzed):
    """If Gemini labels two stories as the same event, combine them (keep the analysis of the bigger one)."""
    best = {}
    for s in sorted(analyzed, key=lambda s: -s["n_sources"]):
        ev = s["ai"]["event"]
        if ev not in best:
            best[ev] = s
            continue
        keep = best[ev]
        known = {l["link"] for l in keep["all_links"]}
        keep["all_links"] = keep["all_links"] + [l for l in s["all_links"] if l["link"] not in known]
        keep["outlets"] = sorted({l["outlet"] for l in keep["all_links"]})
        keep["n_sources"] = len(keep["outlets"])
    combined = len(analyzed) - len(best)
    if combined:
        print(f"  Combined {combined} repeat(s) of the same event")
    return list(best.values())


def analyze(stories, existing_events=None, reader=None):
    """existing_events: [(label, headline)] of recent stories, so Gemini reuses labels instead of inventing new ones.
    reader: {"watchlist": [...], "topics": [...]} for the for_you line."""
    rules = ANALYSIS_RULES
    reader = reader or {}
    names = reader.get("watch_names") or {}
    watch = [f"{t} ({names[t]})" if names.get(t) else t for t in (reader.get("watchlist") or [])]
    rules += ("\nREADER'S WATCHLIST: " + (", ".join(watch) or "none")
              + "\nREADER'S TOPICS: " + (", ".join(reader.get("topics") or []) or "none") + "\n")
    if existing_events:
        listing = "\n".join(f"- {ev}: {hl}" for ev, hl in existing_events[:80])
        rules += ("\nEXISTING EVENTS from the last few days. If a story is about one of these, you MUST reuse "
                  "that exact event label:\n" + listing + "\n")
    from article import add_texts
    add_texts(stories)
    results = []
    for start in range(0, len(stories), BATCH_SIZE):
        batch = stories[start:start + BATCH_SIZE]
        blocks = []
        for i, s in enumerate(batch, start):
            lines = [f"- [{l['outlet']}] {l['title']}" for l in s["all_links"][:8]]
            block = f"STORY id={i}\nHeadlines:\n" + "\n".join(lines) + f"\nSnippet: {s['snippet'][:400]}"
            for outlet, text in s.get("articles") or []:
                block += f"\nARTICLE TEXT ({outlet}): {text}"
            blocks.append(block if s.get("articles") else block + "\n(no article text: full_story must be empty)")
        print(f"Analysing stories {start + 1}-{start + len(batch)}...")
        out = gemini_json(rules + "\n\n" + "\n\n".join(blocks), ANALYSIS_SCHEMA)
        by_id = {a["id"]: a for a in out["stories"]}
        for i, s in enumerate(batch, start):
            a = by_id.get(i)
            if a:
                if not s.get("articles"):
                    a["full_story"] = []  # never a "full story" made up from headlines alone
                results.append({**s, "ai": a})
        time.sleep(2)  # stay well under the per-minute limit
    return results


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    load_env()
    if not os.environ.get("GEMINI_API_KEY"):
        sys.exit("No GEMINI_API_KEY found. Copy .env.example to .env and paste your key there.")
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=10)
    ap.add_argument("--list-models", action="store_true")
    args = ap.parse_args()

    if args.list_models:
        data = http(f"{API}/models?pageSize=100")
        for m in data.get("models", []):
            if "generateContent" in m.get("supportedGenerationMethods", []):
                print(m["name"].replace("models/", ""))
        return

    src = OUT / "m1_stories.json"
    if not src.exists():
        sys.exit("Run python robot/fetch.py first.")
    stories = json.loads(src.read_text(encoding="utf-8"))
    try:
        merged = merge_duplicates(stories[:60])  # merge first, so split-up stories regain their true size
        merged.sort(key=lambda s: (-(s["n_sources"] >= 3), -s["score"]))
        stories = diverse(merged, limit=args.top, cap=2)
        analyzed = drop_same_event(analyze(stories))
    except QuotaReached as e:
        sys.exit(f"Stopped safely: {e}")

    analyzed.sort(key=lambda s: -s["ai"]["impact_score"])
    (OUT / "m2_analyzed.json").write_text(json.dumps(analyzed, indent=2, ensure_ascii=False), encoding="utf-8")
    for s in analyzed:
        a = s["ai"]
        p = a["impact_parts"]
        print("\n" + "=" * 90)
        print(f"IMPACT {a['impact_score']}/10  (reach {p['reach']}, surprise {p['surprise']}, size {p['size']}, timing {p['timing']})  {a['sentiment']}  {' '.join(a['tickers'])}")
        print(f"{a['headline']}   [{s['n_sources']} sources · event: {a['event']}]")
        for b in a["summary"]:
            print(f"  - {b}")
        if a.get("full_story"):
            n = sum(len(p.split()) for p in a["full_story"])
            print(f"  FULL STORY ({n} words, from {', '.join(o for o, _ in s['articles'])}):")
            for para in a["full_story"]:
                print(f"    {para}")
        print(f"  Means: {a['what_it_means']}")
        print(f"  Winners: {', '.join(a['winners']) or '-'}   Losers: {', '.join(a['losers']) or '-'}")
        print(f"  Watch: {a['watch_next']}")
        print(f"  Why {a['impact_score']}: {a['impact_reason']}")
    print(f"\nSaved to {OUT / 'm2_analyzed.json'}")


if __name__ == "__main__":
    main()
