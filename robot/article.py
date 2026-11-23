"""Read the main text of a news article, so the AI can write a fuller story than headlines allow.

Plain download + the page's <p> paragraphs. No extra library.
Test 2026-11-24 on 60 links: ~40% readable (CNBC, BBC, Yahoo, Fool, InfoQuest, Prachachat...).
Paywalled sites (Reuters, Bloomberg, FT, WSJ, MarketWatch) refuse, and Google News links are
redirects a plain download can't follow, so those are skipped without trying.
The text is only given to the AI; the website never shows or stores the publisher's text.
"""
import html
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
SKIP = re.compile(r"news\.google\.com|reuters\.com|bloomberg\.com|ft\.com|wsj\.com|marketwatch\.com|barrons\.com|nytimes\.com", re.I)
MIN_WORDS = 120      # less than this = a cookie wall or teaser, not an article
MAX_WORDS = 900      # per article, keeps AI calls small and quick
JUNK = re.compile(r"cookie|subscribe|sign up|newsletter|all rights reserved|advertisement|javascript", re.I)


def read_article(url):
    """Main text of one article (max MAX_WORDS words), or None."""
    if not url or SKIP.search(url):
        return None
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en,th;q=0.8"})
        with urllib.request.urlopen(req, timeout=12) as r:
            if SKIP.search(r.geturl()):
                return None
            raw = r.read(3_000_000).decode("utf-8", "replace")
    except Exception:
        return None
    raw = re.sub(r"(?is)<(script|style|noscript|aside|nav|footer)[^>]*>.*?</\1>", " ", raw)
    paras = []
    for p in re.findall(r"(?is)<p[^>]*>(.*?)</p>", raw):
        t = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", p))).strip()
        if len(t) > 60 and not JUNK.search(t[:80]) and t not in paras:
            paras.append(t)
    words = " ".join(paras).split()
    return " ".join(words[:MAX_WORDS]) if len(words) >= MIN_WORDS else None


def story_texts(story, per_story=2):
    """Up to `per_story` readable articles for one story: [(outlet, text)]."""
    found = []
    for l in story["all_links"][:6]:
        text = read_article(l["link"])
        if text:
            found.append((l["outlet"], text))
            if len(found) >= per_story:
                break
    return found


def add_texts(stories):
    """Attach `articles` to each story (in parallel; a few seconds per run)."""
    with ThreadPoolExecutor(max_workers=6) as pool:
        for s, texts in zip(stories, pool.map(story_texts, stories)):
            s["articles"] = texts
    n = sum(1 for s in stories if s["articles"])
    print(f"  Full article text found for {n} of {len(stories)} stories")
    return stories
