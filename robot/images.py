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
# Needs PEXELS_API_KEY (free at pexels.com/api). Photos are linked with the photographer's credit, never re-hosted.
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


def related_photo(photo_query, topics):
    """AI photo idea first, then the story's topic backup search."""
    img, credit = pexels_photo(photo_query)
    if not img:
        for t in topics or []:
            if t in TOPIC_PHOTO:
                img, credit = pexels_photo(TOPIC_PHOTO[t])
                if img:
                    break
    return img, credit
