"""Stock index member lists (Charts -> Heat map and Stocks by market & industry, design rounds 40/41/48): once a day.

Member lists with sectors: Wikipedia (S&P 500, SET50, Hang Seng, KOSPI 200, FTSE 100, DAX) and Nikkei's own
component page (Nikkei 225). Company sizes (market cap) from Yahoo's quote data, converted to US dollars so
companies from different markets can be compared. Saved as one row per index in stock_stats (symbol "@SP500",
"@SET50", ... ; data = {"members": [...], "at": ...}), so no new table is needed.
The website colours the tiles / rows with live prices (get_quotes) while the page is open.
Not possible: SET100 (no free list; the SET website blocks robots), Nasdaq-100 / VN30 (no member table on Wikipedia).
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
WIKI = "https://en.wikipedia.org/wiki/"
NIKKEI = "https://indexes.nikkei.co.jp/en/nkave/index/component?idx=nk225"


def _hk(t):   # "SEHK: 5" -> ("0005", "0005.HK")
    n = re.sub(r"\D", "", t).zfill(4)
    return n, n + ".HK"


def _lse(t):  # "BT.A" -> ("BT.A", "BT-A.L"); "RR." -> ("RR", "RR.L")
    t = t.strip().rstrip(".")
    return t, t.replace(".", "-") + ".L"


# key: (where, (symbol column, name column, sector column), symbol -> (shown ticker, Yahoo symbol))
INDEXES = {
    "@SP500": (WIKI + "List_of_S%26P_500_companies", ("Symbol", "Security", "GICS Sector"), lambda t: (t, t.replace(".", "-"))),
    "@SET50": (WIKI + "SET50_Index_and_SET100_Index", ("Symbol", "Securities Name", "Sector"), lambda t: (t, t + ".BK")),
    "@N225": (NIKKEI, None, lambda t: (t, t + ".T")),
    "@HSI": (WIKI + "Hang_Seng_Index", ("Ticker", "Name", "Sub-index"), _hk),
    "@KS200": (WIKI + "KOSPI_200", ("Symbol", "Company", "GICS Sector"), lambda t: (t, t + ".KS")),
    "@FTSE": (WIKI + "FTSE_100_Index", ("Ticker", "Company", "FTSE industry classification benchmark sector"), _lse),
    "@DAX": (WIKI + "DAX", ("Ticker", "Company", "Prime Standard Sector"), lambda t: (t.split(".")[0], t if "." in t else t + ".DE")),
}


def _txt(c):
    c = re.sub(r"<sup[^>]*>.*?</sup>", "", c, flags=re.S)   # footnote marks like [35]
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", c))).strip()


def _get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25).read().decode("utf-8", "replace")


def wiki_rows(url, cols):
    """The first table with these column titles (and 20+ rows): [(symbol, name, sector), ...]."""
    for tb in re.findall(r"<table[^>]*>(.*?)</table>", _get(url), re.S):
        rows = [[_txt(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", r, re.S)] for r in re.findall(r"<tr[^>]*>(.*?)</tr>", tb, re.S)]
        rows = [r for r in rows if r]
        if len(rows) > 20 and all(c in rows[0] for c in cols):
            i = [rows[0].index(c) for c in cols]
            return [(r[i[0]], r[i[1]], r[i[2]]) for r in rows[1:] if len(r) > max(i) and r[i[0]]]
    return []


def nikkei_rows(url):
    """Nikkei's component page: one small table per sector, the sector name just before each table."""
    t, out = _get(url), []
    parts = re.split(r"<table", t)
    for k in range(1, len(parts)):
        before = [x for x in (_txt(s) for s in re.split(r"<[^>]+>", parts[k - 1][-800:])) if x]
        sec = before[-1] if before else ""
        for code, name in re.findall(r"<td[^>]*>\s*([0-9]{3}[0-9A-Z])\s*</td>\s*<td[^>]*>(.*?)</td>", parts[k].split("</table>")[0], re.S):
            out.append((code, _txt(name).title(), sec))
    return out


def members(key):
    url, cols, conv = INDEXES[key]
    raw = nikkei_rows(url) if cols is None else wiki_rows(url, cols)
    out = []
    for sym, name, sec in raw:
        t, s = conv(sym)
        out.append({"t": t, "s": s, "n": name, "sec": sec})
    return out


def caps(op, crumb, syms):
    """Market cap in US dollars (Yahoo gives it in the stock's own currency)."""
    raw, out = {}, {}
    for i in range(0, len(syms), 100):
        chunk = syms[i:i + 100]
        url = ("https://query2.finance.yahoo.com/v7/finance/quote?fields=marketCap,currency,regularMarketPrice&crumb=" + urllib.parse.quote(crumb)
               + "&symbols=" + urllib.parse.quote(",".join(chunk)))
        try:
            for q in json.loads(op.open(url, timeout=20).read())["quoteResponse"]["result"]:
                raw[q["symbol"]] = q
        except Exception as e:
            print(f"  Heat map sizes: a Yahoo batch failed ({str(e)[:60]})")
    curs = {(q.get("currency") or "USD").upper() for q in raw.values()} - {"USD"}
    fx = {"USD": 1.0}   # units of a currency per 1 USD ("JPY=X" -> ~150)
    fx_syms = [c + "=X" for c in curs]
    for q in json.loads(op.open("https://query2.finance.yahoo.com/v7/finance/quote?fields=regularMarketPrice&crumb=" + urllib.parse.quote(crumb)
                                + "&symbols=" + urllib.parse.quote(",".join(fx_syms)), timeout=20).read())["quoteResponse"]["result"] if fx_syms else []:
        if q.get("regularMarketPrice"):
            fx[q["symbol"][:-2]] = q["regularMarketPrice"]
    for s, q in raw.items():
        cap, cur = q.get("marketCap"), (q.get("currency") or "USD")
        if cur == "GBp":   # London prices are in pence, but Yahoo's market cap for them is in pounds (checked: 3i ~ $35B)
            cur = "GBP"
        rate = fx.get(cur.upper())
        out[s] = round(cap / rate) if cap and rate else None
    return out


def run(force=False):
    mark = f"heatmap:{date.today().isoformat()}"
    if not force and db.seen_links([mark]):
        return
    op, crumb = stock_stats._opener()
    rows, now = [], datetime.now(timezone.utc).isoformat()
    for key in INDEXES:
        try:
            m = members(key)
        except Exception as e:
            print(f"  Heat map {key}: member list failed ({str(e)[:80]})"); continue
        if len(m) < 20:
            print(f"  Heat map {key}: member list looks wrong ({len(m)} rows), kept the old one"); continue
        c = caps(op, crumb, [x["s"] for x in m])
        for x in m:
            x["cap"] = c.get(x["s"])
        src = "Nikkei Inc. + Yahoo Finance" if key == "@N225" else "Wikipedia + Yahoo Finance"
        rows.append({"symbol": key, "data": {"members": m, "at": now, "source": src, "cap_cur": "USD"}, "updated_at": now})
        print(f"Heat map {key}: {len(m)} members, {sum(1 for x in m if x.get('cap'))} with company size (USD)")
    if rows:
        db._req("POST", "stock_stats", rows, params={"on_conflict": "symbol"}, prefer="resolution=merge-duplicates")
        db.mark_seen({mark: None})


def preview():
    """python robot/heatmap.py --dry : print what would be saved, save nothing."""
    op, crumb = stock_stats._opener()
    for key in INDEXES:
        m = members(key)
        c = caps(op, crumb, [x["s"] for x in m[:6]])
        secs = sorted({x["sec"] for x in m})
        print(f"{key}: {len(m)} members, {len(secs)} sectors e.g. {secs[:4]}")
        for x in m[:3]:
            print(f"   {x['t']:8} {x['s']:10} {x['n'][:28]:28} {x['sec'][:26]:26} cap ${c.get(x['s']) or 0:,.0f}")


if __name__ == "__main__":
    import sys
    from analyze import load_env
    load_env()
    preview() if "--dry" in sys.argv else run(force=True)
