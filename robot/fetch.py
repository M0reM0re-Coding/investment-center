"""Investment Center robot, milestone M1: read news feeds and rank them.

What it does:
  1. Reads every feed in sources.json
  2. Removes duplicate links
  3. Groups the same story reported by different outlets
  4. Scores each group with the relevance rules (keywords, tickers, coverage, trust, age)
  5. Prints the top stories and saves all of them to ../out/m1_stories.json

Run from the "Investment Center" folder:
  python robot/fetch.py

No API keys needed. Uses only Python's standard library.
"""
import html
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE.parent / "out"
USER_AGENT = "Mozilla/5.0 (compatible; InvestmentCenterBot/0.1)"
MAX_AGE_HOURS = 48          # ignore stories older than this
GROUP_SIMILARITY = 0.34     # how alike two headlines must be to count as the same story
QUOTE_PAGE = re.compile(r"stock price,? news,? quote|quote (&|and) history|stock price today|stock quote", re.I)  # price pages, not news
STOPWORDS = set("""a an the of to in on for and or as at by with from is are was be been after
over into its it this that new says say said amid vs will could may than more most up down""".split())


def load(name):
    return json.loads((HERE / name).read_text(encoding="utf-8"))


def clean(text):
    """Strip HTML tags and extra spaces from feed text."""
    text = html.unescape(text or "")
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def parse_date(text):
    try:
        d = parsedate_to_datetime(text)
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except Exception:
        return None


MEDIA = "{http://search.yahoo.com/mrss/}"


def feed_image(it):
    """Picture URL included in the feed item, if any (https only, so it loads on an https site)."""
    for tag in (MEDIA + "thumbnail", MEDIA + "content"):
        el = it.find(tag)
        if el is not None and el.get("url") and (tag.endswith("thumbnail") or "image" in (el.get("type") or el.get("medium") or "image")):
            url = el.get("url")
            break
    else:
        enc = it.find("enclosure")
        url = enc.get("url") if enc is not None and "image" in (enc.get("type") or "") else None
        if not url:
            m = re.search(r'<img[^>]+src="([^"]+)"', it.findtext("description") or "")
            url = html.unescape(m.group(1)) if m else None
    return url if url and url.startswith("https://") else None


def fetch_feed(src):
    """Download one RSS feed. Returns (source, items, error)."""
    try:
        req = urllib.request.Request(src["url"], headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=20) as r:
            root = ET.fromstring(r.read())
    except Exception as e:
        return src, [], f"{type(e).__name__}: {e}"
    items = []
    for it in root.iter("item"):
        title = clean(it.findtext("title"))
        link = (it.findtext("link") or "").strip()
        outlet = src["name"]
        source_tag = it.find("source")  # Google News names the real outlet here
        if source_tag is not None and source_tag.text:
            outlet = source_tag.text.strip()
            title = re.sub(r"\s+-\s+" + re.escape(outlet) + r"$", "", title)
        if title and link and not QUOTE_PAGE.search(title):
            items.append({
                "title": title,
                "link": link,
                "image": feed_image(it),
                "snippet": clean(it.findtext("description"))[:400],
                "published": parse_date(it.findtext("pubDate")),
                "outlet": outlet,
                "feed": src["name"],
                "trust": src.get("trust", 1),
            })
    return src, items, None


def words(title):
    return {w for w in re.findall(r"[a-z0-9]+", title.lower()) if w not in STOPWORDS and len(w) > 1}


def similarity(a, b):
    return len(a & b) / len(a | b) if a and b else 0.0


def group_stories(items):
    """Put items with very similar headlines into one group (one story)."""
    groups = []
    for item in sorted(items, key=lambda x: x["published"] or datetime.min.replace(tzinfo=timezone.utc), reverse=True):
        w = words(item["title"])
        for g in groups:
            if similarity(w, g["words"]) >= GROUP_SIMILARITY:
                g["items"].append(item)
                break
        else:
            groups.append({"words": w, "items": [item]})
    return groups


def matcher(keyword):
    """Capitalised keywords match exactly (AI, BOT); lowercase ones match any case."""
    flags = 0 if any(c.isupper() for c in keyword) else re.IGNORECASE
    return re.compile(r"(?<![A-Za-z0-9])" + re.escape(keyword) + r"(?![A-Za-z0-9])", flags)


def score_group(g, topic_rx, ticker_rx, now, watchlist):
    """Relevance rules agreed on 2026-11-22. Used to rank stories, NOT to send alerts."""
    titles = " | ".join(i["title"] for i in g["items"])
    snippets = " | ".join(i["snippet"] for i in g["items"])
    topics_title = [t for t, rxs in topic_rx.items() if any(rx.search(titles) for rx in rxs)]
    topics_snip = [t for t, rxs in topic_rx.items() if t not in topics_title and any(rx.search(snippets) for rx in rxs)]
    tickers = [t for t, rxs in ticker_rx.items() if any(rx.search(titles + " " + snippets) for rx in rxs)]
    outlets = sorted({i["outlet"] for i in g["items"]})
    newest = max((i["published"] for i in g["items"] if i["published"]), default=now)
    age_h = max(0.0, (now - newest).total_seconds() / 3600)

    parts = {
        "keyword in headline": 3 if topics_title else 0,
        "keyword in snippet only": 1 if (topics_snip and not topics_title) else 0,
        "watchlist ticker": 3 if set(tickers) & watchlist else 0,
        "extra outlets": min(len(outlets) - 1, 5),
        "source trust": max(i["trust"] for i in g["items"]),
        "age penalty": -int(age_h // 6),
    }
    lead = g["items"][0]
    return {
        "title": lead["title"],
        "link": lead["link"],
        "snippet": lead["snippet"],
        "image": next((i["image"] for i in g["items"] if i.get("image")), None),
        "outlets": outlets,
        "n_sources": len(outlets),
        "topics": topics_title + topics_snip,
        "tickers": tickers,
        "published": newest.isoformat(),
        "age_hours": round(age_h, 1),
        "score": sum(parts.values()),
        "score_parts": parts,
        "all_links": [{"outlet": i["outlet"], "title": i["title"], "link": i["link"]} for i in g["items"]],
    }


MAX_CUSTOM_TOPICS = 5   # each one adds a Google News search per run, so keep it small
MAX_EXTRA_TICKERS = 5   # same for stocks added from search that the catalog doesn't know
LEGAL_WORDS = re.compile(r"[,.]|\b(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|pcl|public|holdings?|group|sa|ag|nv|se|adr)\b", re.I)


def google_news(query):
    from urllib.parse import quote_plus
    return f"https://news.google.com/rss/search?q={quote_plus(query)}+when:2d&hl=en-US&gl=US&ceid=US:en"


def company_name(name):
    """'TOYOTA MOTOR CORP' -> 'Toyota Motor'. Used to find news about stocks you added from search."""
    name = re.sub(r"^[A-Z0-9&.-]+_", "", name or "")  # Yahoo's Thai names look like "PTT_PTT" or "OR_PTT OIL ..."
    n = re.sub(r"\s+", " ", LEGAL_WORDS.sub(" ", name)).strip()
    return n.title() if n.isupper() else n


def personal_feeds(custom_topics, extra_tickers, watch_names):
    """Extra Google News searches for your own topics and stocks (capped).
    They only bring in more articles; a story is tagged with your topic/stock only if its text mentions it."""
    feeds = [{"name": f"Google News: {t}", "url": google_news(f'"{t}"'), "trust": 1} for t in custom_topics]
    for t in extra_tickers:
        name = company_name(watch_names.get(t, "")) or t
        feeds.append({"name": f"Google News: {t}", "url": google_news(f'"{name}"'), "trust": 1})
    return feeds


# Words too common to identify a company on their own ("Taiwan Semiconductor" must not match every "Taiwan" story)
GENERIC_FIRST = set("""taiwan china chinese thai thailand bangkok japan american america general united international
national global first new delta gulf energy bank siam asia asian pacific royal central digital advanced""".split())


def ticker_aliases(symbol, name):
    rxs = [matcher(symbol)] if len(symbol) >= 3 and symbol.isalpha() else []
    name = company_name(name)
    if len(name) >= 4:
        rxs.append(word_rx(name))
        first = name.split()[0]
        if len(name.split()) > 1 and len(first) >= 5 and first.lower() not in GENERIC_FIRST:
            rxs.append(word_rx(first))  # "Toyota Motor" -> also "Toyota"
    return rxs


def word_rx(phrase):
    return re.compile(r"(?<![A-Za-z0-9])" + re.escape(phrase) + r"(?![A-Za-z0-9])", re.I)


def collect(watchlist=None, verbose=True, custom_topics=None, watch_names=None):
    """Fetch all feeds and return (articles, ranked stories). Used by fetch.py and run.py."""
    sources = load("sources.json")
    catalog = load("catalog.json")
    watch_names = watch_names or {}
    custom_topics = [t for t in (custom_topics or []) if t and t not in catalog["topics"]][:MAX_CUSTOM_TOPICS]
    extra_tickers = [t for t in (watchlist or []) if t not in catalog["tickers"]][:MAX_EXTRA_TICKERS]
    sources = sources + personal_feeds(custom_topics, extra_tickers, watch_names)
    topic_rx = {t: [matcher(k) for k in kws] for t, kws in catalog["topics"].items()}
    for t in custom_topics:
        topic_rx[t] = [word_rx(t)]
    ticker_rx = {t: [matcher(k) for k in kws] for t, kws in catalog["tickers"].items()}
    for t in extra_tickers:
        rxs = ticker_aliases(t, watch_names.get(t, ""))
        if rxs:
            ticker_rx[t] = rxs
    now = datetime.now(timezone.utc)

    watchlist = set(watchlist or catalog["default_watchlist"])
    outlet_trust = {k: v for k, v in catalog["outlet_trust"].items() if not k.startswith("_")}

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(fetch_feed, sources))
    for _, feed_items, _ in results:
        for it in feed_items:
            if it["outlet"] in outlet_trust:
                it["trust"] = outlet_trust[it["outlet"]]

    if verbose:
        print("\nFEEDS")
    items, seen = [], set()
    for src, feed_items, err in results:
        if verbose or err:
            print(f"  {'FAIL' if err else 'ok  '}  {src['name']:<32} {len(feed_items):>3} items" + (f"   ({err[:80]})" if err else ""))
        for it in feed_items:
            if it["link"] in seen:
                continue
            if it["published"] and (now - it["published"]).total_seconds() > MAX_AGE_HOURS * 3600:
                continue
            seen.add(it["link"])
            items.append(it)

    stories = [score_group(g, topic_rx, ticker_rx, now, watchlist) for g in group_stories(items)]
    stories.sort(key=lambda s: (-s["score"], s["age_hours"]))
    return items, stories


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    items, stories = collect()
    OUT.mkdir(exist_ok=True)
    (OUT / "m1_stories.json").write_text(json.dumps(stories, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\n{len(items)} articles from the last {MAX_AGE_HOURS}h -> {len(stories)} stories after grouping")
    print("\nTOP 20  (score | sources | age | topics / tickers | headline)")
    for s in stories[:20]:
        tags = ", ".join(s["topics"][:2] + s["tickers"][:3]) or "-"
        print(f"  {s['score']:>3} | {s['n_sources']:>2} | {s['age_hours']:>4}h | {tags[:38]:<38} | {s['title'][:90]}")
    print(f"\nSaved all stories to {OUT / 'm1_stories.json'}")


if __name__ == "__main__":
    main()
