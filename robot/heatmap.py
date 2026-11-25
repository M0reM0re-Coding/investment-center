"""Stock heat map members (Charts -> Heat map, design round 40/41): once a day.

S&P 500 and SET50 member lists with sectors come from Wikipedia; company sizes (market cap) from Yahoo's quote data.
Saved as two rows in stock_stats: symbol "@SP500" and "@SET50" (data = {"members": [...], "at": ...}), so no new table is needed.
The website colours the tiles with live prices (get_quotes) while the page is open.
"""
import html
import json
import re
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone

import db
import stock_stats

UA = {"User-Agent": "InvestmentCenterBot/1.0 (personal dashboard)"}
INDEXES = {"@SP500": ("List_of_S%26P_500_companies", ("Symbol", "Security", "GICS Sector"), ""),
           "@SET50": ("SET50_Index_and_SET100_Index", ("Symbol", "Securities Name", "Sector"), ".BK")}


def _txt(c):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", c))).strip()


def members(page, cols, suffix):
    t = urllib.request.urlopen(urllib.request.Request("https://en.wikipedia.org/wiki/" + page, headers=UA), timeout=25).read().decode("utf-8", "replace")
    for tb in re.findall(r"<table[^>]*>(.*?)</table>", t, re.S):
        rows = [[_txt(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", r, re.S)] for r in re.findall(r"<tr[^>]*>(.*?)</tr>", tb, re.S)]
        rows = [r for r in rows if r]
        if len(rows) > 20 and all(c in rows[0] for c in cols):
            i = [rows[0].index(c) for c in cols]
            out = []
            for r in rows[1:]:
                if len(r) > max(i) and r[i[0]]:
                    t2 = r[i[0]].replace(".", "-") if not suffix else r[i[0]]
                    out.append({"t": r[i[0]], "s": t2 + suffix, "n": r[i[1]], "sec": r[i[2]]})
            return out
    return []


def caps(op, crumb, syms):
    out = {}
    for i in range(0, len(syms), 100):
        chunk = syms[i:i + 100]
        url = ("https://query2.finance.yahoo.com/v7/finance/quote?fields=marketCap,shortName&crumb=" + urllib.parse.quote(crumb)
               + "&symbols=" + urllib.parse.quote(",".join(chunk)))
        try:
            for q in json.loads(op.open(url, timeout=20).read())["quoteResponse"]["result"]:
                out[q["symbol"]] = q.get("marketCap")
        except Exception as e:
            print(f"  Heat map sizes: a Yahoo batch failed ({str(e)[:60]})")
    return out


def run(force=False):
    mark = f"heatmap:{date.today().isoformat()}"
    if not force and db.seen_links([mark]):
        return
    op, crumb = stock_stats._opener()
    rows, now = [], datetime.now(timezone.utc).isoformat()
    for key, (page, cols, suffix) in INDEXES.items():
        try:
            m = members(page, cols, suffix)
        except Exception as e:
            print(f"  Heat map {key}: member list failed ({str(e)[:80]})"); continue
        if len(m) < 20:
            print(f"  Heat map {key}: member list looks wrong ({len(m)} rows), kept the old one"); continue
        c = caps(op, crumb, [x["s"] for x in m])
        for x in m:
            x["cap"] = c.get(x["s"])
        rows.append({"symbol": key, "data": {"members": m, "at": now, "source": "Wikipedia + Yahoo Finance"}, "updated_at": now})
        print(f"Heat map {key}: {len(m)} members, {sum(1 for x in m if x.get('cap'))} with company size")
    if rows:
        db._req("POST", "stock_stats", rows, params={"on_conflict": "symbol"}, prefer="resolution=merge-duplicates")
        db.mark_seen({mark: None})


if __name__ == "__main__":
    from analyze import load_env
    load_env()
    run(force=True)
