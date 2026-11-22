"""Find a picture for a story: the article page's preview image (og:image / twitter:image).

Only reads the first part of the page. Skips Google News links (they don't lead straight to the article).
Pictures are linked, never downloaded or re-hosted.
"""
import html
import re
import urllib.request

USER_AGENT = "Mozilla/5.0 (compatible; InvestmentCenterBot/0.1)"
PATTERNS = [
    re.compile(r'<meta[^>]+(?:property|name)=["\'](?:og:image|og:image:url|twitter:image)["\'][^>]*content=["\']([^"\']+)["\']', re.I),
    re.compile(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\'](?:og:image|og:image:url|twitter:image)["\']', re.I),
]


def preview_image(url):
    if not url or "news.google.com" in url:
        return None
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=10) as r:
            page = r.read(300_000).decode("utf-8", errors="replace")
    except Exception:
        return None
    for rx in PATTERNS:
        m = rx.search(page)
        if m:
            img = html.unescape(m.group(1)).strip()
            if img.startswith("//"):
                img = "https:" + img
            return img if img.startswith("https://") else None
    return None


def story_image(feed_image, links):
    """Feed picture first, then the preview image of the first article link that has one."""
    if feed_image:
        return feed_image
    for l in links[:4]:
        img = preview_image(l.get("link"))
        if img:
            return img
    return None


# ---------- Pexels: a related free photo when the publisher has none ----------
# Needs UNSPLASH_ACCESS_KEY (free at unsplash.com/developers) or PEXELS_API_KEY (pexels.com/api).
# Unsplash is used first when both exist. Photos are linked with the photographer's credit, never re-hosted.
import json  # noqa: E402
import os  # noqa: E402
import urllib.parse  # noqa: E402

# Backup searches per topic, used when the AI's photo idea finds nothing
TOPIC_PHOTO = {
    "SET / Thai market": "bangkok skyline", "Thai economy & BOT": "thai baht money", "Global macro & Fed": "stock market screen",
    "Big 4 / audit / IFRS": "accounting documents", "AI in finance": "data center servers", "Tech & chips": "computer chip circuit",
    "Energy & oil": "oil refinery", "Banking": "bank building", "Crypto": "bitcoin coins", "Fintech": "mobile payment phone",
    "China economy": "shanghai skyline", "Commodities & gold": "gold bars",
}
_photo_cache = {}


def pexels_photo(query):
    """Return (image_url, credit) for the best landscape photo, or (None, None). Results are cached per run."""
    key = os.environ.get("PEXELS_API_KEY", "").strip()
    query = (query or "").strip()
    if not key or not query:
        return None, None
    if query in _photo_cache:
        return _photo_cache[query]
    url = "https://api.pexels.com/v1/search?" + urllib.parse.urlencode({"query": query, "orientation": "landscape", "per_page": 5})
    result = (None, None)
    try:
        req = urllib.request.Request(url, headers={"Authorization": key, "User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=15) as r:
            photos = json.loads(r.read()).get("photos", [])
        if photos:
            p = photos[0]
            img = p.get("src", {}).get("landscape") or p.get("src", {}).get("large")
            if img and img.startswith("https://"):
                result = (img, f"Photo: {p.get('photographer', 'Pexels')} / Pexels")
    except Exception as e:
        print(f"  Pexels search failed for '{query}': {str(e)[:80]}")
    _photo_cache[query] = result
    return result


UNSPLASH_MAX_PER_RUN = 20   # free (demo) plan allows 50 searches per hour; the robot runs every 30 minutes
_unsplash_calls = [0]

def _unsplash_results(query):
    """Up to 10 landscape photos for a search, as [(image_url, credit, download_location)]. Cached per run."""
    key = os.environ.get("UNSPLASH_ACCESS_KEY", "").strip()
    query = (query or "").strip()
    if not key or not query:
        return []
    cache_key = "u:" + query
    if cache_key in _photo_cache:
        return _photo_cache[cache_key]
    if _unsplash_calls[0] >= UNSPLASH_MAX_PER_RUN:
        return []
    _unsplash_calls[0] += 1
    url = "https://api.unsplash.com/search/photos?" + urllib.parse.urlencode(
        {"query": query, "orientation": "landscape", "per_page": 10, "content_filter": "high"})
    out = []
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=_unsplash_headers(key)), timeout=15) as r:
            for p in json.loads(r.read()).get("results", []):
                img = (p.get("urls") or {}).get("regular")   # Unsplash asks apps to use these links as given (hotlinking)
                if img and img.startswith("https://"):
                    out.append((img, f"Photo: {(p.get('user') or {}).get('name', 'Unsplash')} / Unsplash",
                                (p.get("links") or {}).get("download_location") or ""))
    except Exception as e:
        print(f"  Unsplash search failed for '{query}': {str(e)[:80]}")
    _photo_cache[cache_key] = out
    return out

def _unsplash_headers(key):
    return {"Authorization": f"Client-ID {key}", "Accept-Version": "v1", "User-Agent": USER_AGENT}

def unsplash_photo(query, pick=0):
    """(image_url, credit) — pick chooses a different result, so stories with the same search don't share a photo."""
    res = _unsplash_results(query)
    if not res:
        return None, None
    img, credit, dl = res[pick % len(res)]
    # Unsplash's rule: tell them when a photo is used (counts the download for the photographer)
    if dl.startswith("https://api.unsplash.com/"):
        try:
            key = os.environ.get("UNSPLASH_ACCESS_KEY", "").strip()
            urllib.request.urlopen(urllib.request.Request(dl, headers=_unsplash_headers(key)), timeout=10).read()
        except Exception:
            pass
    return img, credit

_picks = {}

def stock_photo(query):
    """Unsplash first (if its key is set), then Pexels. Each repeat of the same search gets the next photo."""
    n = _picks.get(query, 0)
    _picks[query] = n + 1
    img, credit = unsplash_photo(query, n)
    if not img:
        img, credit = pexels_photo(query)
    return img, credit

def related_photo(photo_query, topics):
    """AI photo idea first, then the story's topic backup search."""
    img, credit = stock_photo(photo_query)
    if not img:
        for t in topics or []:
            if t in TOPIC_PHOTO:
                img, credit = stock_photo(TOPIC_PHOTO[t])
                if img:
                    break
    return img, credit
