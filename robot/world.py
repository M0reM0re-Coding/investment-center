"""World Brief: the most important stories worldwide, ranked by how many outlets cover them.

Runs inside run.py, at most once an hour (2 AI calls: merge headlines + write the briefs, Lite models first).
  1. Fetch world feeds: 8 outlets directly + Google News "World" for 8 countries.
     Each Google News item lists up to 5 outlets covering the same story (its "cluster"), so the outlet
     count is real coverage, not just our feed count.
  2. Group headlines into stories; count outlets, and outlets per REGION of the outlet ("who covers it" bar).
  3. Stories we already saved: just add the new outlets (no AI).
  4. The best new stories covered by 2+ outlets: one AI call writes headline, 2-3 facts, "why it matters",
     region + category. Saved to the world_stories table (supabase/008_world.sql), never mixed with My News.
Ranking by your Want / No want happens on the website, so it reacts instantly to your votes.
"""
import html
import re
from datetime import datetime, timedelta, timezone

import analyze as ai
import db
import developing
from concurrent.futures import ThreadPoolExecutor
from fetch import fetch_feed, group_stories, similarity, words
from images import stock_photo, story_image

REGIONS = ["Europe", "Americas", "Middle East", "Asia-Pacific", "Africa"]
CATEGORIES = ["Politics", "Conflict", "Economy", "Climate", "Science & tech", "Health", "Society"]
MAX_AGE_H = 30            # only stories from the last ~day
ANALYSE_PER_RUN = 5       # one AI call (batch of 5)
MIN_OUTLETS = 2           # a story covered by only one outlet is not "world news" yet
RECENT_H = 72             # saved stories we still add new outlets to
SITUATIONS = ["strike", "war", "troops", "threat", "cyber", "sanction", "tariff", "cut", "peace", "deal", "aid", "arms",
              "refugees", "summit", "test", "protest", "vote", "disaster", "outbreak"]   # map kinds (design round 23)
ONE_PLACE = {"summit", "test", "protest", "vote", "disaster", "outbreak"}
SITUATION_SCHEMA = {"type": "OBJECT", "properties": {
    "kind": {"type": "STRING", "enum": SITUATIONS + ["none"]},
    "from": {"type": "STRING", "description": "ONE country name only (who acts), e.g. 'Ukraine'. Empty for one-place kinds."},
    "to": {"type": "STRING", "description": "ONE country name only: the country where it LANDS / HAPPENS (the map point), e.g. drones hit Russian ships docked in Libya -> 'Libya'. Empty for one-place kinds."},
    "at": {"type": "STRING", "description": "ONE country name only, for one-place kinds, e.g. 'Indonesia'."},
    "many": {"type": "ARRAY", "items": {"type": "STRING"}, "description": "summit only: up to 8 country names"},
    "say": {"type": "STRING", "description": "plain sentence, max 10 words, e.g. \"Russia's missiles hit Poland\""}},
    "required": ["kind", "say"]}
# Backup sentence when the AI gives a kind + countries but no usable sentence
SAY_TEMPLATE = {"strike": "{a} struck {b}", "war": "{a} and {b} at war", "troops": "{a} sent troops into {b}", "threat": "{a} warned {b}",
                "cyber": "Cyberattack on {b} blamed on {a}", "sanction": "{a} put sanctions on {b}", "tariff": "{a} and {b} in trade fight",
                "cut": "{a} and {b} cut ties", "peace": "{a} and {b} hold peace talks", "deal": "{a} and {b} reach a deal",
                "aid": "{a} sends aid to {b}", "arms": "{a} sends weapons to {b}", "refugees": "People flee {a} for {b}",
                "summit": "Summit in {c}", "test": "{c} held a weapons test", "protest": "{c}: protests", "vote": "{c}: election",
                "disaster": "{c}: disaster", "outbreak": "{c}: disease outbreak"}
EXTRA_COLS = ("thailand", "stocks", "country", "terms", "growth", "timeline", "situation")  # supabase/009_world_extras.sql

DIRECT = [  # outlet's home region = where its coverage counts in the bar
    ("BBC World", "BBC", "https://feeds.bbci.co.uk/news/world/rss.xml", "Europe"),
    ("Guardian World", "The Guardian", "https://www.theguardian.com/world/rss", "Europe"),
    ("Al Jazeera", "Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml", "Middle East"),
    ("DW World", "DW", "https://rss.dw.com/rdf/rss-en-world", "Europe"),
    ("France 24", "France 24", "https://www.france24.com/en/rss", "Europe"),
    ("NPR World", "NPR", "https://feeds.npr.org/1004/rss.xml", "Americas"),
    ("CNA Asia", "CNA", "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6511", "Asia-Pacific"),
    ("SCMP World", "South China Morning Post", "https://www.scmp.com/rss/91/feed", "Asia-Pacific"),
    # more Asian outlets (2026-11-24): most feeds above are Western, so Asian stories rarely reached 2+ outlets
    ("Nikkei Asia", "Nikkei Asia", "https://asia.nikkei.com/rss/feed/nar", "Asia-Pacific"),
    ("Japan Times", "The Japan Times", "https://www.japantimes.co.jp/feed/", "Asia-Pacific"),
    ("Straits Times Asia", "The Straits Times", "https://www.straitstimes.com/news/asia/rss.xml", "Asia-Pacific"),
    ("Yonhap", "Yonhap", "https://en.yna.co.kr/RSS/news.xml", "Asia-Pacific"),
    # Thailand (for the "Thailand" chip): world feeds rarely cover it, so read Thai English outlets too
    ("Bangkok Post Thailand", "Bangkok Post", "https://www.bangkokpost.com/rss/data/thailand.xml", "Asia-Pacific"),
    ("Bangkok Post Top", "Bangkok Post", "https://www.bangkokpost.com/rss/data/topstories.xml", "Asia-Pacific"),
    ("Khaosod English", "Khaosod English", "https://www.khaosodenglish.com/feed/", "Asia-Pacific"),
]
THAI_RX = re.compile(r"\b(Thai|Thailand|Bangkok|Phuket|Chiang Mai|Pattaya|baht)\b", re.I)
THAI_FEEDS = {"Bangkok Post Thailand", "Bangkok Post Top", "Khaosod English", "Google News Thailand"}
GN_EDITIONS = {"US": "Americas", "CA": "Americas", "GB": "Europe", "IN": "Asia-Pacific", "SG": "Asia-Pacific",
               "AU": "Asia-Pacific", "PH": "Asia-Pacific", "ZA": "Africa", "NG": "Africa"}  # (the UAE edition is a copy of the US one)

# Where well-known outlets are based. Unknown outlets count for the region of the Google News edition they came from.
OUTLET_REGION = {
    **{o: "Europe" for o in ["BBC", "The Guardian", "Reuters", "Euronews", "Financial Times", "The Independent", "The Telegraph",
                             "The Economist", "POLITICO.eu", "DW", "France 24", "Sky News", "The Times", "Channel 4",
                             "The i Paper", "Kyiv Independent", "The Kyiv Independent", "UNITED24 Media", "Le Monde",
                             "Daily Mail", "Evening Standard", "Naval News", "RFI", "Meduza", "Notes from Poland", "AFP"]},
    **{o: "Americas" for o in ["AP News", "The New York Times", "CNN", "NBC News", "CBS News", "ABC News", "NPR", "The Washington Post",
                               "Axios", "New York Post", "Bloomberg", "WSJ", "CNBC", "PBS", "Fox News", "The Daily Beast",
                               "Politico", "USA Today", "The Atlantic", "Time", "Newsweek", "CBC", "CTV News", "The Globe and Mail",
                               "Global News", "Responsible Statecraft", "Institute for the Study of War", "Visual Capitalist"]},
    **{o: "Middle East" for o in ["Al Jazeera", "The Times of Israel", "Ynetnews", "Haaretz", "Gulf News", "The National",
                                  "Arab News", "Middle East Eye", "Al Arabiya", "Khaleej Times", "Jerusalem Post", "Iran International"]},
    **{o: "Asia-Pacific" for o in ["CNA", "South China Morning Post", "The Straits Times", "The Times of India", "NDTV", "The Indian Express",
                                   "India Today", "Hindustan Times", "Asia Times", "Nikkei Asia", "The Japan Times", "Kyodo News",
                                   "Malay Mail", "ABC Australia", "The Age", "SMH.com.au", "News.com.au", "The Australian",
                                   "Lowy Institute", "Bangkok Post", "Khaosod English", "Thai PBS World", "The Diplomat",
                                   "Tuoi Tre News", "The Standard (HK)", "Fijivillage", "Yonhap", "Korea Herald", "Xinhua", "Global Times"]},
    **{o: "Africa" for o in ["News24", "Mail & Guardian", "TimesLIVE", "Business Insider Africa", "Punch Newspapers",
                             "LEADERSHIP Newspapers", "Sahara Reporters", "Premium Times", "The East African", "Daily Maverick"]},
}
ALIAS = {"Bloomberg.com": "Bloomberg", "Euronews.com": "Euronews", "ABC News & Headlines – Australian Broadcasting Corporation": "ABC Australia",
         "Reuters.com": "Reuters", "apnews.com": "AP News", "The Associated Press": "AP News"}
BLOCK = re.compile(r"fundsforngos|opportunities for africans|migflug|grants|scholarship|\bjobs\b", re.I)
CLUSTER_LI = re.compile(r'<li><a href="([^"]+)"[^>]*>(.*?)</a>(?:&nbsp;|\s)*<font[^>]*>(.*?)</font>', re.S)


def outlet_name(raw):
    name = html.unescape(raw or "").strip()
    name = ALIAS.get(name, name)
    name = re.split(r"\s+[|–]\s+", name)[0].strip()   # "OilPrice.com | Crude..." -> "OilPrice.com"
    return ALIAS.get(name, name)


def sources():
    feeds = [{"name": n, "outlet": o, "url": u, "region": r, "trust": 2, "max": 40} for n, o, u, r in DIRECT]
    feeds.append({"name": "Google News Thailand", "region": "Asia-Pacific", "trust": 1, "max": 40, "keep_html": True,
                  "url": "https://news.google.com/rss/search?q=Thailand+when:1d&hl=en-US&gl=US&ceid=US:en"})
    for gl, region in GN_EDITIONS.items():
        feeds.append({"name": f"Google News World {gl}", "region": region, "trust": 1, "max": 70, "keep_html": True,
                      "url": f"https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-{gl}&gl={gl}&ceid={gl}:en"})
    return feeds


def gather():
    """All world items from the last MAX_AGE_H hours, each with its cluster of other outlets."""
    now = datetime.now(timezone.utc)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(fetch_feed, sources()))
    items, seen, failed = [], set(), []
    for src, feed_items, err in results:
        if err:
            failed.append(src["name"])
        for it in feed_items:
            it["outlet"] = outlet_name(it["outlet"])
            if it["link"] in seen or BLOCK.search(it["outlet"]):
                continue
            if it["published"] and (now - it["published"]).total_seconds() > MAX_AGE_H * 3600:
                continue
            seen.add(it["link"])
            it["region"] = OUTLET_REGION.get(it["outlet"], src["region"])
            it["is_gn"] = "keep_html" in src
            it["thai_src"] = src["name"] in THAI_FEEDS
            cluster = []
            for link, title, outlet in CLUSTER_LI.findall(it.pop("desc_html", "") or ""):
                outlet = outlet_name(outlet)
                if not BLOCK.search(outlet):
                    cluster.append({"outlet": outlet, "title": html.unescape(re.sub("<[^>]+>", "", title)).strip(), "link": html.unescape(link),
                                    "region": OUTLET_REGION.get(outlet, src["region"])})
            it["cluster"] = cluster
            items.append(it)
    if failed:
        print(f"World feeds failed: {', '.join(failed)}")
    return items, now


def build_stories(items, now):
    groups = group_stories(items)
    # Join groups that share an article (same outlet + same headline), e.g. one Guardian story in 4 Google editions
    key_of = lambda o, t: (o.lower(), re.sub(r"\W+", " ", t.lower()).strip())
    owner, merged = {}, []
    for g in groups:
        keys = {key_of(i["outlet"], i["title"]) for i in g["items"]} | {key_of(c["outlet"], c["title"]) for i in g["items"] for c in i["cluster"]}
        target = next((owner[k] for k in keys if k in owner), None)
        if target is None:
            target = {"items": []}
            merged.append(target)
        target["items"] += g["items"]
        for k in keys:
            owner.setdefault(k, target)
    stories = []
    for g in merged:
        links, regions, seen = [], {}, set()
        for i in g["items"]:
            for l in [{"outlet": i["outlet"], "title": i["title"], "link": i["link"], "region": i["region"]}] + i["cluster"]:
                k = key_of(l["outlet"], l["title"])
                if k in seen:
                    continue
                seen.add(k)
                links.append(l)
                regions.setdefault(l["outlet"], l["region"])
        coverage = {}
        for r in regions.values():
            coverage[r] = coverage.get(r, 0) + 1
        newest = max((i["published"] for i in g["items"] if i["published"]), default=now)
        lead = g["items"][0]
        direct = [i for i in g["items"] if not i["is_gn"]]
        pic = next((i for i in direct if i.get("image")), None)
        stories.append({
            "title": lead["title"], "snippet": lead["snippet"][:300], "topics": [], "tickers": [],
            "all_links": [{k: l[k] for k in ("outlet", "title", "link")} for l in links],
            "outlets": sorted(regions), "n_sources": len(regions), "coverage": coverage,
            "published": newest.isoformat(), "age_hours": (now - newest).total_seconds() / 3600,
            "image": pic["image"] if pic else None, "image_credit": pic["outlet"] if pic else None,
            "direct_links": [{"link": i["link"]} for i in direct],
            "thai": any(i["thai_src"] for i in g["items"]) or bool(THAI_RX.search(" ".join(l["title"] for l in links[:12]))),
        })
    stories.sort(key=lambda s: -(s["n_sources"] * 2 - s["age_hours"] / 6))
    return stories


WORLD_SCHEMA = {
    "type": "OBJECT",
    "properties": {"stories": {"type": "ARRAY", "items": {
        "type": "OBJECT",
        "properties": {
            "id": {"type": "INTEGER"},
            "event": {"type": "STRING"},
            "headline": {"type": "STRING"},
            "summary": {"type": "ARRAY", "items": {"type": "STRING"}},
            "why_matters": {"type": "STRING"},
            "region": {"type": "STRING", "enum": REGIONS + ["Global"]},
            "category": {"type": "STRING", "enum": CATEGORIES},
            "country": {"type": "STRING"},
            "thailand": {"type": "STRING"},
            "stocks": {"type": "ARRAY", "items": {"type": "STRING"}},
            "situation": SITUATION_SCHEMA,
            "terms": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
                "term": {"type": "STRING"}, "explain": {"type": "STRING"}}, "required": ["term", "explain"]}},
            "photo_query": {"type": "STRING"},
        },
        "required": ["id", "event", "headline", "summary", "why_matters", "region", "category", "country"],
    }}},
    "required": ["stories"],
}

WORLD_RULES = """You write a short daily world news brief for a Thai university student. Plain, neutral English.
For each story you get the headlines that different outlets used.

STRICT RULES
- Use ONLY facts in the given headlines/snippet. Never invent numbers, names, dates or quotes.
- Neutral wording: say who claims what ("Ukraine says...") when only one side reports it.
- If outlets disagree, say so.

FIELDS
- event: short lowercase label, words joined by hyphens, e.g. "ukraine-strikes-russian-ships-libya". The same event must get
  the same label. If a story is about one of the EXISTING EVENTS below, reuse that exact label.
- headline: neutral, factual, max 13 words, no clickbait.
- summary: 2-3 bullet facts ("what happened"), one sentence each, most important first.
- why_matters: ONE sentence (max 28 words) on why this matters for the world (kept separate from the facts).
- region: where the event happens: Europe, Americas, Middle East, Asia-Pacific, Africa, or Global (several regions / worldwide).
- category: Politics, Conflict, Economy, Climate, Science & tech, Health or Society (pick the closest one).
- country: the ONE country where it mainly happens, using its common English map name (e.g. "United States of America",
  "Russia", "Libya", "South Korea", "Thailand"). Use "Global" for worldwide or multi-country events (e.g. a UN summit).
- thailand: ONE sentence (max 30 words) on what it could mean for Thailand or for the READER'S WATCHLIST below
  (e.g. oil prices -> PTT; chips -> NVDA; tourism -> AOT). Say "could"/"may": never certain, never buy/sell advice.
  Empty string when there is no clear link (most stories). Do not stretch.
- stocks: tickers from the READER'S WATCHLIST that the thailand line names. Empty list if none.
- terms: 0-3 words from your summary/why_matters a student might not know (e.g. "sanctions", "ceasefire", "corvette"),
  copied EXACTLY as written there, each with a plain explanation of max 22 words.
- photo_query: 2-4 plain words for a generic stock photo that fits the story: objects or places only, no people's
  names, no logos (e.g. "oil tanker sea", "parliament building", "rocket launch", "airport empty terminal").
- situation (for the world map): what happened BETWEEN countries, or IN one place. Pick the closest kind:
    between two countries (use "from" = who acts, "to" = the country where it lands or happens, e.g. drones hitting Russian
    ships docked in Libya -> to "Libya", not "Russia"; use map names like "country"):
      strike (missiles/drones/bombing hit), war (ongoing fighting both ways), troops (troops/forces move in),
      threat (warning, threat, build-up), cyber (cyberattack), sanction (sanctions, bans), tariff (tariffs, trade fight),
      cut (ties cut, diplomats expelled), peace (peace talks, ceasefire), deal (agreement, trade deal),
      aid (aid or money sent), arms (weapons supplied), refugees (people fleeing from -> to)
    in one place (use "at"): summit (big meeting; "many" = up to 8 countries attending), test (missile/nuclear test),
      protest (protest, strike, unrest), vote (election, referendum), disaster (fire, flood, quake, crash), outbreak (disease)
  "say" = ONE plain sentence, max 10 words, past tense, naming the countries, e.g. "Russia's missiles hit Poland",
  "UK put sanctions on Myanmar's leader", "Belgium: national strike shuts airports". Only what the headlines say.
  Prefer a real kind whenever one fits: any meeting of leaders or climate/trade talks = summit; protests, strikes, riots,
  cartel violence = protest; elections, polls, coalition talks = vote; a court case or arrest between two countries can be
  "cut" or "threat". Use "none" only for stories with no event to show (e.g. a report, a court case inside one country,
  a celebrity story). Never guess who attacked whom: if the headlines don't say, use a one-place kind or "none".
"""


def clean_situation(s):
    """Keep only a well-formed situation: a known kind, the countries it needs, and a short plain sentence.
    {"kind": "none"} = the AI checked and nothing fits (so the repair step doesn't ask again; the map shows a plain pin)."""
    if isinstance(s, dict) and s.get("kind") == "none":
        return {"kind": "none"}
    if not isinstance(s, dict) or s.get("kind") not in SITUATIONS:
        return None
    say = " ".join(str(s.get("say") or "").split())[:90]

    def name(v):  # a country name: 1-4 words of letters only (models sometimes stuff a whole phrase in here)
        v = " ".join(str(v or "").split())
        return v if v and len(v) <= 40 and len(v.split()) <= 4 and re.fullmatch(r"[A-Za-z .,'()&-]+", v) else None
    out = {"kind": s["kind"], "say": say}
    if s["kind"] in ONE_PLACE:
        out["at"] = name(s.get("at"))
        if s["kind"] == "summit":
            out["many"] = [name(m) for m in (s.get("many") or []) if name(m)][:8]
        ok = out["at"]
    else:
        out["from"], out["to"] = name(s.get("from")), name(s.get("to"))
        ok = out["from"] and out["to"] and out["from"] != out["to"]
    if ok and len(say.split()) < 3:
        out["say"] = SAY_TEMPLATE[s["kind"]].format(a=out.get("from"), b=out.get("to"), c=out.get("at"))
    return out if ok else None


CATEGORY_PHOTO = {"Politics": "parliament building", "Conflict": "military checkpoint", "Economy": "city skyline finance",
                  "Climate": "storm clouds landscape", "Science & tech": "laboratory technology", "Health": "hospital corridor",
                  "Society": "city street crowd"}


def add_photo(row, query):
    """A related Unsplash photo for a story the publishers gave no picture. Returns True if one was saved."""
    img, credit = stock_photo(query) if query else (None, None)
    if not img:
        img, credit = stock_photo(CATEGORY_PHOTO.get(row.get("category"), "world map"))
    if img:
        db._req("PATCH", "world_stories", {"image_url": img, "image_credit": credit}, params={"id": f"eq.{row['id']}"})
    return bool(img)


def fix_situations(limit=10, hours=48):
    """One AI call: fill in the map situation and/or a photo idea for recent stories that are missing them.
    Runs every hour after the new stories are saved; does nothing (no AI call) when nothing is missing."""
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    rows = db._req("GET", "world_stories", params={
        "select": "id,headline,summary,links,category,situation,image_url", "created_at": f"gte.{since}",
        "or": "(situation.is.null,image_url.is.null)", "order": "n_sources.desc", "limit": str(limit)})
    if not rows:
        return 0
    schema = {"type": "OBJECT", "properties": {"stories": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
        "id": {"type": "INTEGER"}, "situation": SITUATION_SCHEMA, "photo_query": {"type": "STRING"}},
        "required": ["id", "situation", "photo_query"]}}}, "required": ["stories"]}
    rule = WORLD_RULES[WORLD_RULES.index("- photo_query"):]
    blocks = [f"STORY id={i}\nHeadline: {r['headline']}\nFacts: {' '.join(r['summary'] or [])}\nOther headlines: "
              + " | ".join(l["title"] for l in (r["links"] or [])[:6]) for i, r in enumerate(rows)]
    out = ai.gemini_json("For each news story, fill in ONLY the map situation and the photo_query.\n" + rule + "\n\n"
                         + "\n\n".join(blocks), schema, lite_first=True)
    sits = pics = 0
    for a in out["stories"]:
        if not 0 <= a.get("id", -1) < len(rows):
            continue
        r = rows[a["id"]]
        if not r["situation"]:
            sit = clean_situation(a.get("situation")) or {"kind": "none"}
            db._req("PATCH", "world_stories", {"situation": sit}, params={"id": f"eq.{r['id']}"})
            sits += sit["kind"] != "none"
        if not r["image_url"]:
            pics += add_photo(r, (a.get("photo_query") or "").strip()[:60])
    print(f"World Brief repair: {sits} map situations and {pics} photos added for {len(rows)} stories")
    return sits + pics


def clean_terms(items, text):
    out = []
    for t in items or []:
        term, why = str(t.get("term", "")).strip(), str(t.get("explain", "")).strip()
        if 2 <= len(term) <= 40 and why and term in text and term.lower() not in {x["term"].lower() for x in out}:
            out.append({"term": term, "explain": why[:200]})
    return out[:3]


def write_briefs(stories, existing, reader=None):
    reader = reader or {}
    rules = WORLD_RULES + "\nREADER'S WATCHLIST: " + (", ".join(reader.get("watchlist") or []) or "none") + "\n"
    if existing:
        rules += "\nEXISTING EVENTS:\n" + "\n".join(f"- {r['event']}: {r['headline']}" for r in existing[:80]) + "\n"
    blocks = []
    for i, s in enumerate(stories):
        lines = "\n".join(f"- [{l['outlet']}] {l['title']}" for l in s["all_links"][:10])
        blocks.append(f"STORY id={i}\nHeadlines:\n{lines}\nSnippet: {s['snippet']}")
    out = ai.gemini_json(rules + "\n\n" + "\n\n".join(blocks), WORLD_SCHEMA, lite_first=True)
    by_id = {a["id"]: a for a in out["stories"]}
    return [(s, by_id[i]) for i, s in enumerate(stories) if i in by_id]


def matches(story, row):
    """Same story as a saved row? Shares an article, or the headline is very alike."""
    known = {(l["outlet"], l["title"]) for l in row["links"] or []}
    if any((l["outlet"], l["title"]) in known for l in story["all_links"]):
        return True
    w = words(story["title"])
    return any(similarity(w, words(t)) >= 0.5 for t in [row["headline"]] + [l["title"] for l in (row["links"] or [])[:8]])


def add_links(row, story):
    known = {(l["outlet"], l["title"]) for l in row["links"] or []}
    new = [l for l in story["all_links"] if (l["outlet"], l["title"]) not in known]
    if not new:
        return False
    links = (row["links"] or []) + new
    coverage = dict(row.get("coverage") or {})
    have = set(row["outlets"] or [])
    for o in dict.fromkeys(l["outlet"] for l in new):
        if o not in have:
            reg = OUTLET_REGION.get(o) or story.get("_regions", {}).get(o) or "Global"
            coverage[reg] = coverage.get(reg, 0) + 1
            have.add(o)
    fields = {"links": links, "outlets": sorted(have), "n_sources": len(have), "coverage": coverage, "updated_at": "now()"}
    if "growth" in row:  # Developing: remember the new outlet count + maybe a new headline for the timeline
        fields.update(developing.grow(row, len(have), [l["title"] for l in new]))
    db._req("PATCH", "world_stories", fields, params={"id": f"eq.{row['id']}"})
    row.update({k: v for k, v in fields.items() if k != "updated_at"})
    return True


RECENT_COLS = "id,event,headline,links,outlets,n_sources,coverage,created_at"


def load_recent(now):
    """Saved world stories of the last few days. Asks for the Developing columns too, if they exist yet."""
    params = {"created_at": f"gte.{(now - timedelta(hours=RECENT_H)).isoformat()}", "order": "created_at.desc", "limit": "300"}
    try:
        return db._req("GET", "world_stories", params={"select": RECENT_COLS + ",growth,timeline", **params})
    except RuntimeError as e:
        if "growth" not in str(e) and "timeline" not in str(e):
            raise
        return db._req("GET", "world_stories", params={"select": RECENT_COLS, **params})


def due(now):
    """Once an hour is enough for world news (saves AI calls). Marker kept in seen_links, like the morning brief."""
    mark = f"world-run:{now:%Y-%m-%dT%H}"
    return (None if db.seen_links([mark]) else mark)


def run(force=False, reader=None):
    now = datetime.now(timezone.utc)
    mark = due(now)
    if not mark and not force:
        return 0
    try:
        recent = load_recent(now)
    except RuntimeError as e:
        if "world_stories" in str(e):
            print("World Brief: run supabase/008_world.sql first")
            return 0
        raise
    items, now = gather()
    stories = build_stories(items, now)
    regions = {}  # region per outlet, used when outlets are added to saved or merged stories
    for i in items:
        regions.setdefault(i["outlet"], i["region"])
        for c in i["cluster"]:
            regions.setdefault(c["outlet"], c["region"])
    for s in stories:
        s["_regions"] = regions

    updated, fresh = 0, []
    for s in stories:
        row = next((r for r in recent if matches(s, r)), None)
        if row:
            updated += add_links(row, s)
        elif s["n_sources"] >= MIN_OUTLETS or s["thai"]:   # Thailand stories may come from one outlet only
            fresh.append(s)
    print(f"World Brief: {len(items)} articles -> {len(stories)} stories; {updated} saved stories got new outlets; "
          f"{len(fresh)} new candidates")

    saved = 0
    if fresh:
        try:
            if len(fresh) > 6:
                fresh = ai.merge_duplicates(fresh[:40])
                for s in fresh:  # merged stories: recount outlets and regions
                    outs = sorted({l["outlet"] for l in s["all_links"]})
                    s["outlets"], s["n_sources"] = outs, len(outs)
                    cov = {}
                    for o in outs:
                        cov[regions.get(o, "Global")] = cov.get(regions.get(o, "Global"), 0) + 1
                    s["coverage"] = cov
                fresh.sort(key=lambda s: -(s["n_sources"] * 2 - s["age_hours"] / 6))
            wide = [s for s in fresh if s["n_sources"] >= MIN_OUTLETS]
            pick = wide[:ANALYSE_PER_RUN - 1]
            thai = next((s for s in fresh if s["thai"] and s not in pick), None)   # one slot an hour for Thailand
            pick += [thai] if thai else wide[ANALYSE_PER_RUN - 1:ANALYSE_PER_RUN]
            written = write_briefs(pick, recent, reader)
        except (ai.QuotaReached, RuntimeError, ValueError, KeyError) as e:
            print(f"World Brief: AI step stopped safely ({str(e)[:150]}); will retry next hour")
            return 0  # no marker: try again next run
        by_event = {r["event"]: r for r in recent}
        rows = []
        for s, a in written:
            if a["event"] in by_event:  # the AI says it's a story we already have: just add the outlets
                if by_event[a["event"]]:  # (None = added a moment ago in this same batch: skip the repeat)
                    add_links(by_event[a["event"]], s)
                continue
            img = s["image"] or story_image(None, s["direct_links"])
            credit = s["image_credit"] if img else None
            if not img:  # no publisher picture: a related free photo, like My News
                img, credit = stock_photo((a.get("photo_query") or "").strip()[:60] or CATEGORY_PHOTO.get(a["category"], "world map"))
            if img:  # BBC feed pictures are 240 px thumbnails; the same picture exists at 976 px
                img = img.replace("ichef.bbci.co.uk/ace/standard/240/", "ichef.bbci.co.uk/ace/standard/976/")
            watch = set((reader or {}).get("watchlist") or [])
            summary = [b for b in a["summary"] if b.strip()][:3]
            thai = (a.get("thailand") or "").strip()[:260] or None
            text = " ".join(summary + [a.get("why_matters") or ""])
            extras = {  # columns from 008 part 5-6 (dropped again below if they don't exist yet)
                "thailand": thai, "stocks": [t for t in (a.get("stocks") or []) if t in watch][:4] if thai else [],
                "country": (a.get("country") or "").strip()[:60] or None, "terms": clean_terms(a.get("terms"), text),
                "situation": clean_situation(a.get("situation")),
                **developing.start(s["n_sources"], a["headline"][:200], s["published"]),
            }
            rows.append({**extras,
                "event": a["event"][:120], "headline": a["headline"][:200],
                "summary": summary, "why_matters": (a.get("why_matters") or "").strip()[:300] or None,
                "region": a["region"] if a["region"] in REGIONS + ["Global"] else "Global",
                "category": a["category"] if a["category"] in CATEGORIES else "Society",
                "outlets": s["outlets"], "n_sources": s["n_sources"], "coverage": s["coverage"], "links": s["all_links"][:40],
                "image_url": img, "image_credit": credit, "published_at": s["published"],
            })
            by_event[a["event"]] = None
        if rows:
            try:
                db._req("POST", "world_stories", rows, params={"on_conflict": "event"}, prefer="resolution=ignore-duplicates")
            except RuntimeError as e:
                if not any(c in str(e) for c in EXTRA_COLS):
                    raise
                print("  Note: run the latest supabase/008_world.sql to save Thailand lines, map country and Developing data")
                db._req("POST", "world_stories", [{k: v for k, v in r.items() if k not in EXTRA_COLS} for r in rows],
                        params={"on_conflict": "event"}, prefer="resolution=ignore-duplicates")
            saved = len(rows)
            for r in sorted(rows, key=lambda r: -r["n_sources"]):
                print(f"  {r['n_sources']:>2} outlets | {r['region']:<12} | {r['category']:<14} | {r['headline'][:80]}")
    if mark:
        db.mark_seen({mark: None})
    print(f"World Brief: saved {saved} new stories")
    try:  # fill in missing map situations / photos (1 AI call, only when something is missing)
        fix_situations()
    except (ai.QuotaReached, RuntimeError, ValueError, KeyError) as e:
        print(f"World Brief repair skipped ({str(e)[:120]})")
    return saved


def top_for_brief(hours=24, n=3):
    """For the morning Telegram brief: the most-covered world stories of the last day."""
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    try:
        rows = db._req("GET", "world_stories", params={"select": "headline,n_sources,region,why_matters",
                                                        "created_at": f"gte.{since}", "order": "n_sources.desc", "limit": str(n)})
    except RuntimeError:
        return []
    return rows or []


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    ai.load_env()
    if "--dry" in sys.argv:  # feeds + grouping only: no AI, no database
        its, t = gather()
        st = build_stories(its, t)
        print(f"{len(its)} articles -> {len(st)} stories\n")
        for s in st[:25]:
            cov = ", ".join(f"{k} {v}" for k, v in sorted(s["coverage"].items(), key=lambda x: -x[1]))
            print(f"{s['n_sources']:>3} | {s['age_hours']:4.1f}h | {'pic' if s['image'] else '   '} | {s['title'][:70]} | {cov}")
    else:
        import run as robot_run  # same shared daily AI counter as the GitHub robot (Supabase, cap 300), not the old local one
        ai.COUNTER = robot_run.db_counter
        ai.MEMORY = (db.used_up_models, db.mark_used_up)   # skip models used up today
        if "--fix-situations" in sys.argv:
            fix_situations()
        else:
            st = db.user_settings() or {}
            run(force="--force" in sys.argv, reader={"watchlist": st.get("watchlist") or []})
