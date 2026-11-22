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
