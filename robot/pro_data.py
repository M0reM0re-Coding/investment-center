"""Investment Center Pro data (FEATURES.md "Investment Center Pro"). Free official sources, checked 2026-11-26.

  macro  : FRED (key) series + US Treasury yield curve + OECD leading indicator -> regime + recession lights (MACRO)
  cb     : BIS central bank policy rates + IMF forecasts (CPI, GDP, unemployment) + OECD 10Y yields via FRED (MACRO)
  cot    : CFTC futures positioning, large speculators (MACRO)
  fund_X : company statements (5 years), estimates + revisions, analyst changes, peers (VAL), Yahoo (unofficial)
  smart_X: FINRA daily short volume (US) + Yahoo option chain summary (SMART)

Saved into table pro_data (supabase/017_pro.sql) as one row per key. `--local` writes site/data/pro/<key>.json instead
(local preview before the SQL is run; that folder is git-ignored). The site does the scoring (regime is done here).
Usage:  python robot/pro_data.py --local [--only macro,cb,cot,fund,smart] [--tickers NVDA,PTT]
"""
import argparse
import csv
import io
import json
import math
import os
import sys
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
ROOT = Path(__file__).resolve().parent.parent
LOCAL = ROOT / "site" / "data" / "pro"
UA = {"User-Agent": "investment-center-robot"}


def get(url, headers=None, timeout=40, raw=False):
    req = urllib.request.Request(url, headers={**UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        b = r.read()
    return b if raw else json.loads(b)


def save(key, data, local):
    data = _clean({**data, "updated": datetime.now(timezone.utc).isoformat(timespec="seconds")})
    if local:
        LOCAL.mkdir(parents=True, exist_ok=True)
        (LOCAL / f"{key}.json").write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    else:
        import db
        db._req("POST", "pro_data", [{"key": key, "data": data, "updated_at": data["updated"]}], params={"on_conflict": "key"},
                prefer="resolution=merge-duplicates")
    print(f"  pro {key}: saved ({len(json.dumps(data)) // 1024} KB)")


def _clean(x):
    """NaN / infinity -> None (JSON has no NaN; the browser would fail to read the file)"""
    if isinstance(x, float):
        return x if math.isfinite(x) else None
    if isinstance(x, dict):
        return {k: _clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_clean(v) for v in x]
    return x


def sdmx(j):
    """SDMX-JSON (OECD, BIS) -> [(labels dict, [(period, value), ..oldest first])]"""
    d = j["data"]
    st = d.get("structure") or d["structures"][0]
    sdims, odim = st["dimensions"]["series"], st["dimensions"]["observation"][0]["values"]
    out = []
    for key, s in d["dataSets"][0].get("series", {}).items():
        lab = {dim["id"]: dim["values"][int(i)]["id"] for dim, i in zip(sdims, key.split(":"))}
        obs = sorted((odim[int(k)]["id"], float(v[0])) for k, v in s.get("observations", {}).items() if v and v[0] not in (None, "", "NaN"))
        out.append((lab, [(p, v) for p, v in obs if math.isfinite(v)]))
    return out


# ---------------- MACRO ----------------
FRED = {  # id: (name, how far back in years)
    "DGS3MO": ("3M T-bill", 2), "DGS2": ("2Y yield", 5), "DGS10": ("10Y yield", 5), "DGS30": ("30Y yield", 2),
    "T10Y2Y": ("10Y-2Y", 5), "T10Y3M": ("10Y-3M", 5), "DFEDTARU": ("Fed funds upper", 5), "DFEDTARL": ("Fed funds lower", 5),
    "T5YIE": ("5Y breakeven inflation", 3), "SAHMREALTIME": ("Sahm rule", 10), "BAMLH0A0HYM2": ("High-yield spread", 5),
    "BAMLC0A0CM": ("Investment-grade spread", 5), "NFCI": ("Chicago Fed financial conditions", 5), "WALCL": ("Fed balance sheet", 5),
    "RRPONTSYD": ("Reverse repo", 5), "WTREGEN": ("Treasury cash (TGA)", 5), "CPIAUCSL": ("CPI", 6), "CPILFESL": ("Core CPI", 6),
    "PCEPILFE": ("Core PCE", 6), "UNRATE": ("Unemployment rate", 10), "PAYEMS": ("Payrolls", 6), "ICSA": ("Initial claims", 3),
    "INDPRO": ("Industrial production", 6), "UMCSENT": ("Consumer sentiment", 6), "A191RL1Q225SBEA": ("Real GDP q/q annualised", 10),
    "DTWEXBGS": ("Broad dollar index", 5),
}


def fred(sid, key, years):
    q = urllib.parse.urlencode({"series_id": sid, "api_key": key, "file_type": "json", "observation_start": (date.today() - timedelta(days=365 * years)).isoformat()})
    obs = get("https://api.stlouisfed.org/fred/series/observations?" + q)["observations"]
    return [[o["date"], float(o["value"])] for o in obs if o["value"] not in (".", "")]


def yoy(series):
    """monthly level series -> y/y % series"""
    m = {d[:7]: v for d, v in series}
    out = []
    for d, v in series:
        y0 = f"{int(d[:4]) - 1}{d[4:7]}"
        if y0 in m and m[y0]:
            out.append([d, round((v / m[y0] - 1) * 100, 3)])
    return out


def treasury_curve():
    """Daily par yield curve (this year + last year) -> {date: {tenor: yield}}"""
    out = {}
    for yr in (date.today().year - 1, date.today().year):
        url = (f"https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/{yr}/all"
               f"?type=daily_treasury_yield_curve&field_tdr_date_value={yr}&page&_format=csv")
        for row in csv.DictReader(io.StringIO(get(url, timeout=90, raw=True).decode())):
            m, d, y = row.pop("Date").split("/")
            out[f"{y}-{m}-{d}"] = {k: float(v) for k, v in row.items() if v}
    return out


def oecd_cli():
    u = ("https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_STES@DF_CLI,4.1/USA+CHN+JPN+DEU+GBR+KOR+IND+G20.M.LI...AA...H"
         "?startPeriod=" + str(date.today().year - 4) + "-01&format=jsondata")
    return {lab["REF_AREA"]: obs for lab, obs in sdmx(get(u, timeout=90))}


def last(s, n=1):
    return s[-n][1] if s and len(s) >= n else None


def back(s, days):
    """value about `days` days before the last point"""
    if not s:
        return None
    cut = (date.fromisoformat(s[-1][0][:10]) - timedelta(days=days)).isoformat()
    older = [v for d, v in s if d <= cut]
    return older[-1] if older else None


def macro(local):
    key = os.environ.get("FRED_API_KEY")
    if not key:
        print("  pro macro: no FRED_API_KEY, skipped")
        return
    S = {}
    for sid, (_, yrs) in FRED.items():
        try:
            S[sid] = fred(sid, key, yrs)
        except Exception as ex:
            print(f"  FRED {sid} failed: {str(ex)[:80]}")
    for sid in ("CPIAUCSL", "CPILFESL", "PCEPILFE"):
        if S.get(sid):
            S[sid + "_YOY"] = yoy(S[sid])
    try:
        curve = treasury_curve()
    except Exception as ex:
        curve = {}
        print(f"  Treasury curve failed: {str(ex)[:80]}")
    try:
        cli = oecd_cli()
    except Exception as ex:
        cli = {}
        print(f"  OECD CLI failed: {str(ex)[:80]}")
    # Net liquidity = Fed balance sheet - TGA - reverse repo (billions). WALCL + WTREGEN are millions, RRP billions.
    liq = []
    if S.get("WALCL") and S.get("WTREGEN") and S.get("RRPONTSYD"):
        tga, rrp = dict(S["WTREGEN"]), S["RRPONTSYD"]
        for d, v in S["WALCL"]:
            t = tga.get(d)
            r = [x for dd, x in rrp if dd <= d]
            if t is not None and r:
                liq.append([d, round(v / 1000 - t / 1000 - r[-1], 1)])
    # ----- regime: growth direction (OECD CLI, now vs 3 months ago) x inflation direction (core PCE y/y, the Fed's target
    # measure: average of the last 3 months vs the 3 months before; smoother than one month, and core CPI has a gap for Oct 2025)
    us = cli.get("USA") or []
    g_now, g_3m = (us[-1][1], us[-4][1]) if len(us) >= 4 else (None, None)
    core = S.get("PCEPILFE_YOY") or []
    avg = lambda xs: round(sum(v for _, v in xs) / len(xs), 3)  # noqa: E731
    i_now, i_3m = (avg(core[-3:]), avg(core[-6:-3])) if len(core) >= 6 else (None, None)
    reg = None
    if g_now is not None and i_now is not None:
        gu, iu = g_now >= g_3m, i_now >= i_3m
        reg = {"growth": "up" if gu else "down", "inflation": "up" if iu else "down",
               "name": {(1, 0): "Goldilocks", (1, 1): "Reflation", (0, 1): "Stagflation", (0, 0): "Slowdown"}[(int(gu), int(iu))],
               "cli": g_now, "cli3m": g_3m, "core": i_now, "core3m": i_3m, "cli_at": us[-1][0], "core_at": core[-1][0],
               "core_last": core[-1][1], "core_name": "Core PCE y/y, 3-month average"}
    # ----- recession lights: green / amber / red with the reason
    L = []

    def light(name, val, state, why, src):
        L.append({"n": name, "v": val, "s": state, "why": why, "src": src})
    c3 = S.get("T10Y3M") or []
    if c3:
        v, inv = last(c3), any(x < 0 for _, x in c3[-500:])
        light("Yield curve 10Y-3M", v, "red" if v < 0 else "amber" if inv else "green",
              "inverted" if v < 0 else "positive again after an inversion (historically the late warning)" if inv else "normal, positive", "FRED T10Y3M")
    sahm = S.get("SAHMREALTIME") or []
    if sahm:
        v = last(sahm)
        light("Sahm rule", v, "red" if v >= 0.5 else "amber" if v >= 0.3 else "green", "0.50+ has marked every US recession since 1970", "FRED SAHMREALTIME")
    if us:
        light("OECD leading indicator (US)", g_now, "red" if g_now < 100 and g_now < g_3m else "amber" if g_now < 100 or g_now < g_3m else "green",
              f"{'below' if g_now < 100 else 'above'} 100 and {'falling' if g_now < g_3m else 'rising'} over 3 months", "OECD CLI")
    hy = S.get("BAMLH0A0HYM2") or []
    if hy:
        v, b3 = last(hy), back(hy, 90)
        jump = b3 is not None and v - b3 >= 1
        light("High-yield credit spread", v, "red" if v >= 5 or jump else "amber" if v >= 4 or (b3 and v - b3 >= 0.5) else "green",
              f"{v:.2f} pp over Treasuries" + (f", {v - b3:+.2f} pp in 3 months" if b3 else ""), "FRED BAMLH0A0HYM2")
    ic = S.get("ICSA") or []
    if len(ic) >= 30:
        avg4 = sum(v for _, v in ic[-4:]) / 4
        low = min(sum(v for _, v in ic[i - 4:i]) / 4 for i in range(len(ic) - 26, len(ic) + 1))
        up = (avg4 / low - 1) * 100
        light("Initial jobless claims", round(avg4), "red" if up >= 20 else "amber" if up >= 10 else "green", f"4-week average {up:+.0f}% vs its 6-month low", "FRED ICSA")
    nf = S.get("NFCI") or []
    if nf:
        v = last(nf)
        light("Financial conditions", v, "red" if v > 0.5 else "amber" if v > 0 else "green", "above 0 = tighter than average" if v > 0 else "looser than average", "FRED NFCI")
    # keep the payload small: daily series -> last 2 years daily + weekly before that
    def trim(s):
        if len(s) < 600:
            return s
        cut = (date.today() - timedelta(days=730)).isoformat()
        old = [x for i, x in enumerate(s) if x[0] < cut and i % 5 == 0]
        return old + [x for x in s if x[0] >= cut]
    save("macro", {"series": {k: trim(v) for k, v in S.items()}, "names": {k: v[0] for k, v in FRED.items()}, "curve": curve and _curve_pick(curve),
                   "cli": cli, "liq": liq, "regime": reg, "lights": L}, local)


def _curve_pick(curve):
    days = sorted(curve)
    pick = lambda dd: max((d for d in days if d <= dd), default=days[0])  # noqa: E731
    t = days[-1]
    want = {"today": t, "1m": pick((date.fromisoformat(t) - timedelta(days=30)).isoformat()), "6m": pick((date.fromisoformat(t) - timedelta(days=182)).isoformat()),
            "1y": pick((date.fromisoformat(t) - timedelta(days=365)).isoformat())}
    return {k: {"d": d, "y": curve[d]} for k, d in want.items()}


# ---------------- CENTRAL BANKS + IMF ----------------
CB = [("US", "USA", "United States", "Fed"), ("XM", "EURO", "Euro area", "ECB"), ("GB", "GBR", "United Kingdom", "BoE"), ("JP", "JPN", "Japan", "BoJ"),
      ("CN", "CHN", "China", "PBoC"), ("TH", "THA", "Thailand", "BOT"), ("KR", "KOR", "South Korea", "BoK"), ("IN", "IND", "India", "RBI"),
      ("ID", "IDN", "Indonesia", "BI"), ("MY", "MYS", "Malaysia", "BNM"), ("AU", "AUS", "Australia", "RBA"), ("CA", "CAN", "Canada", "BoC"),
      ("CH", "CHE", "Switzerland", "SNB"), ("BR", "BRA", "Brazil", "BCB")]
LONG10 = {"US": "IRLTLT01USM156N", "XM": "IRLTLT01EZM156N", "GB": "IRLTLT01GBM156N", "JP": "IRLTLT01JPM156N", "KR": "IRLTLT01KRM156N",
          "IN": "INDIRLTLT01STM", "AU": "IRLTLT01AUM156N", "CA": "IRLTLT01CAM156N", "CH": "IRLTLT01CHM156N", "BR": "IRLTLT01BRM156N"}


def cb(local):
    rows = {c: {"cc": c, "iso3": i, "name": n, "bank": b} for c, i, n, b in CB}
    try:
        u = "https://stats.bis.org/api/v1/data/WS_CBPOL/D." + "+".join(rows) + "/all?startPeriod=" + str(date.today().year - 2) + "&format=sdmx-json"
        for lab, obs in sdmx(get(u, timeout=90)):
            c = lab.get("REF_AREA")
            if c not in rows or not obs:
                continue
            r = rows[c]
            r["rate"], r["at"] = obs[-1][1], obs[-1][0]
            ch = [(p, v, obs[i - 1][1]) for i, (p, v) in enumerate(obs) if i and v != obs[i - 1][1]]
            if ch:
                r["chg_at"], r["chg"] = ch[-1][0], round(ch[-1][1] - ch[-1][2], 3)
            r["y1"] = next((v for p, v in reversed(obs) if p <= (date.today() - timedelta(days=365)).isoformat()), None)
            r["hist"] = [[p, v] for i, (p, v) in enumerate(obs) if i % 7 == 0 or i == len(obs) - 1]
    except Exception as ex:
        print(f"  BIS policy rates failed: {str(ex)[:80]}")
    yr = date.today().year
    for ind, k in (("PCPIPCH", "cpi"), ("NGDP_RPCH", "gdp"), ("LUR", "unemp")):
        try:
            vals = get(f"https://www.imf.org/external/datamapper/api/v1/{ind}", timeout=90)["values"][ind]
            for r in rows.values():
                v = vals.get(r["iso3"]) or {}
                r[k] = {str(y): v.get(str(y)) for y in (yr - 1, yr, yr + 1)}
        except Exception as ex:
            print(f"  IMF {ind} failed: {str(ex)[:80]}")
    key = os.environ.get("FRED_API_KEY")
    if key:
        for c, sid in LONG10.items():
            try:
                s = fred(sid, key, 2)
                rows[c]["y10"], rows[c]["y10_at"] = s[-1][1], s[-1][0]
            except Exception:
                pass
    save("cb", {"rows": list(rows.values()), "imf_note": "IMF World Economic Outlook (DataMapper)"}, local)


# ---------------- CFTC positioning ----------------
COT = [("13874A", "S&P 500 e-mini"), ("209742", "Nasdaq-100 e-mini"), ("043602", "US 10Y note"), ("088691", "Gold"), ("067651", "Crude oil WTI"),
       ("099741", "Euro FX"), ("097741", "Japanese yen"), ("096742", "British pound"), ("232741", "Australian dollar"),
       ("090741", "Canadian dollar"), ("092741", "Swiss franc"), ("095741", "Mexican peso"), ("098662", "US dollar index"), ("133741", "Bitcoin")]


def cot(local):
    out = []
    since = (date.today() - timedelta(days=365 * 3)).isoformat()
    for code, name in COT:
        try:
            q = urllib.parse.urlencode({"cftc_contract_market_code": code, "$where": f"report_date_as_yyyy_mm_dd >= '{since}'",
                                        "$order": "report_date_as_yyyy_mm_dd", "$limit": 400,
                                        "$select": "report_date_as_yyyy_mm_dd,noncomm_positions_long_all,noncomm_positions_short_all,open_interest_all"})
            rows = get("https://publicreporting.cftc.gov/resource/6dca-aqww.json?" + q, timeout=60)
            net = [[r["report_date_as_yyyy_mm_dd"][:10], int(float(r["noncomm_positions_long_all"])) - int(float(r["noncomm_positions_short_all"])),
                    int(float(r["open_interest_all"]))] for r in rows]
            if not net:
                continue
            vals = [n for _, n, _ in net]
            lo, hi = min(vals), max(vals)
            out.append({"code": code, "name": name, "at": net[-1][0], "net": net[-1][1], "oi": net[-1][2], "wk": net[-1][1] - net[-2][1] if len(net) > 1 else None,
                        "pctile": round((net[-1][1] - lo) / ((hi - lo) or 1) * 100), "hist": [[d, n] for d, n, _ in net[-60:]]})
        except Exception as ex:
            print(f"  CFTC {name} failed: {str(ex)[:80]}")
    save("cot", {"rows": out, "note": "Large speculators (non-commercial) net position, legacy futures-only report, weekly (Tuesday data, Friday release)."}, local)


# ---------------- COMPANY FUNDAMENTALS (VAL) ----------------
TS = ["TotalRevenue", "CostOfRevenue", "GrossProfit", "OperatingIncome", "EBIT", "EBITDA", "NetIncome", "InterestExpense", "PretaxIncome", "TaxProvision",
      "SellingGeneralAndAdministration", "ReconciledDepreciation", "DilutedEPS", "DilutedAverageShares", "OperatingCashFlow", "CapitalExpenditure",
      "FreeCashFlow", "TotalAssets", "CurrentAssets", "CurrentLiabilities", "AccountsReceivable", "Inventory", "NetPPE", "TotalDebt", "LongTermDebt",
      "CashAndCashEquivalents", "StockholdersEquity", "RetainedEarnings", "TotalLiabilitiesNetMinorityInterest", "OrdinarySharesNumber",
      "AccountsPayable", "CashDividendsPaid", "RepurchaseOfCapitalStock"]
QS = "price,summaryDetail,defaultKeyStatistics,financialData,earningsTrend,upgradeDowngradeHistory,recommendationTrend,assetProfile"


def _yahoo():
    import stock_stats
    return stock_stats._opener()


def _qs(op, crumb, sym, modules):
    u = f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{urllib.parse.quote(sym)}?modules={modules}&crumb={urllib.parse.quote(crumb)}"
    return json.loads(op.open(u, timeout=20).read())["quoteSummary"]["result"][0]


def _raw(v):
    return v.get("raw") if isinstance(v, dict) else v


def _statements(op, sym):
    types = ",".join(p + t for p in ("annual", "quarterly") for t in TS)
    u = (f"https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/{urllib.parse.quote(sym)}"
         f"?type={types}&period1=1388534400&period2={int(datetime.now().timestamp())}")
    res = json.loads(op.open(u, timeout=25).read())["timeseries"]["result"]
    out = {"a": {}, "q": {}}
    for r in res:
        t = r["meta"]["type"][0]
        per, key = ("a", t[6:]) if t.startswith("annual") else ("q", t[9:])
        for x in r.get(t) or []:
            if x and x.get("asOfDate") and (x.get("reportedValue") or {}).get("raw") is not None:
                out[per].setdefault(x["asOfDate"], {"d": x["asOfDate"]})[key] = x["reportedValue"]["raw"]
    return {p: [v for _, v in sorted(out[p].items())][-(6 if p == "a" else 8):] for p in out}


def _snap(d):
    sd, ks, fd, pr = (d.get(k) or {} for k in ("summaryDetail", "defaultKeyStatistics", "financialData", "price"))
    return {"name": _raw(pr.get("longName")) or _raw(pr.get("shortName")), "price": _raw(fd.get("currentPrice")) or _raw(pr.get("regularMarketPrice")),
            "cur": _raw(pr.get("currency")), "fcur": fd.get("financialCurrency"), "mcap": _raw(pr.get("marketCap")), "ev": _raw(ks.get("enterpriseValue")), "pe": _raw(sd.get("trailingPE")),
            "fpe": _raw(sd.get("forwardPE")) or _raw(ks.get("forwardPE")), "pb": _raw(ks.get("priceToBook")), "ps": _raw(sd.get("priceToSalesTrailing12Months")),
            "evEbitda": _raw(ks.get("enterpriseToEbitda")), "evRev": _raw(ks.get("enterpriseToRevenue")), "peg": _raw(ks.get("pegRatio")),
            "gm": _raw(fd.get("grossMargins")), "om": _raw(fd.get("operatingMargins")), "nm": _raw(fd.get("profitMargins")), "roe": _raw(fd.get("returnOnEquity")),
            "revG": _raw(fd.get("revenueGrowth")), "epsG": _raw(fd.get("earningsGrowth")), "beta": _raw(sd.get("beta")) or _raw(ks.get("beta")),
            "divY": _raw(sd.get("dividendYield")), "shares": _raw(ks.get("sharesOutstanding")), "de": _raw(fd.get("debtToEquity")),
            "sector": (d.get("assetProfile") or {}).get("sector"), "industry": (d.get("assetProfile") or {}).get("industry")}


def fund_one(op, crumb, sym):
    d = _qs(op, crumb, sym, QS)
    snap = _snap(d)
    et = [{"p": t.get("period"), "end": t.get("endDate"), "growth": _raw(t.get("growth")),
           "eps": _raw((t.get("earningsEstimate") or {}).get("avg")), "epsLo": _raw((t.get("earningsEstimate") or {}).get("low")),
           "epsHi": _raw((t.get("earningsEstimate") or {}).get("high")), "n": _raw((t.get("earningsEstimate") or {}).get("numberOfAnalysts")),
           "rev": _raw((t.get("revenueEstimate") or {}).get("avg")), "trend": {k: _raw(v) for k, v in (t.get("epsTrend") or {}).items()},
           "rev7": {k: _raw(v) for k, v in (t.get("epsRevisions") or {}).items()}} for t in (d.get("earningsTrend") or {}).get("trend", [])]
    ud = [{"d": u.get("epochGradeDate"), "firm": u.get("firm"), "to": u.get("toGrade"), "from": u.get("fromGrade"), "act": u.get("action"),
           "pt": _raw(u.get("currentPriceTarget")), "ptPrev": _raw(u.get("priorPriceTarget"))} for u in ((d.get("upgradeDowngradeHistory") or {}).get("history") or [])[:20]]
    fd = d.get("financialData") or {}
    out = {"sym": sym, "snap": snap, "est": et, "ud": ud, "rec": (d.get("recommendationTrend") or {}).get("trend"),
           "target": {k: _raw(fd.get(k)) for k in ("targetLowPrice", "targetMeanPrice", "targetMedianPrice", "targetHighPrice", "numberOfAnalystOpinions", "recommendationMean")}}
    try:
        out["fin"] = _statements(op, sym)
    except Exception as ex:
        print(f"  {sym} statements failed: {str(ex)[:60]}")
    # peers (Yahoo's "people also watch") + their valuation snapshot
    try:
        rr = json.loads(op.open(f"https://query2.finance.yahoo.com/v6/finance/recommendationsbysymbol/{urllib.parse.quote(sym)}", timeout=15).read())
        peers = [x["symbol"] for x in (rr.get("finance", {}).get("result") or [{}])[0].get("recommendedSymbols", [])][:5]
        out["peers"] = []
        for p in peers:
            try:
                out["peers"].append({"sym": p, **_snap(_qs(op, crumb, p, "price,summaryDetail,defaultKeyStatistics,financialData,assetProfile"))})
            except Exception:
                pass
    except Exception:
        pass
    return out


# ---------------- SMART MONEY lite (US only) ----------------
def finra_short(syms, days=15):
    """FINRA Reg SHO daily short volume (all US off-exchange venues file, CNMS) for the last `days` trading days."""
    want, out, d, tries = set(syms), {s: [] for s in syms}, date.today(), 0
    out["_market"] = []   # round 56: every US stock in the file added up = market-wide short share
    while tries < days + 12 and len(out["_market"]) < days:
        d -= timedelta(days=1)
        tries += 1
        if d.weekday() >= 5:
            continue
        try:
            txt = get(f"https://cdn.finra.org/equity/regsho/daily/CNMSshvol{d:%Y%m%d}.txt", raw=True, timeout=60).decode()
        except Exception:
            continue
        ms = mt = 0
        for line in txt.splitlines()[1:]:
            p = line.split("|")
            if len(p) < 5:
                continue
            try:
                sv, tv = int(float(p[2])), int(float(p[4]))
            except ValueError:
                continue
            ms, mt = ms + sv, mt + tv
            k = p[1].replace("/", "-").replace(".", "-")   # FINRA writes BRK/B, Yahoo BRK-B
            if k in want:
                out[k].append([d.isoformat(), sv, tv])   # short volume, total volume
        if mt:
            out["_market"].append([d.isoformat(), ms, mt])
    return {s: sorted(v) for s, v in out.items()}


def finra_ats(sym, weeks=12):
    """FINRA OTC transparency: weekly shares traded in dark pools (ATS) for one stock. Free, no key.
    FINRA publishes it 2 weeks (Tier 1 stocks) to 4 weeks late, so this shows who has been active, not today."""
    since = (date.today() - timedelta(weeks=weeks + 6)).isoformat()
    body = json.dumps({"limit": 200, "dateRangeFilters": [{"fieldName": "weekStartDate", "startDate": since, "endDate": date.today().isoformat()}],
                       "compareFilters": [{"compareType": "EQUAL", "fieldName": "issueSymbolIdentifier", "fieldValue": sym.replace("-", ".")},
                                          {"compareType": "EQUAL", "fieldName": "summaryTypeCode", "fieldValue": "ATS_W_SMBL"}]}).encode()
    req = urllib.request.Request("https://api.finra.org/data/group/otcMarket/name/weeklySummary", data=body,
                                 headers={"Content-Type": "application/json", "Accept": "application/json", "User-Agent": "InvestmentCenter/1.0"})
    with urllib.request.urlopen(req, timeout=40) as r:
        rows = json.loads(r.read() or b"[]")
    wk = {}
    for x in rows:   # one row per week (summed over tiers if FINRA splits it)
        w = wk.setdefault(x["weekStartDate"], [0, 0, 0])
        w[0] += x.get("totalWeeklyShareQuantity") or 0
        w[1] += x.get("totalWeeklyTradeCount") or 0
        w[2] += x.get("totalNotionalSum") or 0
    return [[d, *v] for d, v in sorted(wk.items())][-weeks:]


def _gamma(S, K, T, iv):
    if not (S and K and T > 0 and iv and iv > 0):
        return 0.0
    d1 = (math.log(S / K) + 0.5 * iv * iv * T) / (iv * math.sqrt(T))
    return math.exp(-d1 * d1 / 2) / math.sqrt(2 * math.pi) / (S * iv * math.sqrt(T))


def options(op, crumb, sym, n_exp=4):
    base = f"https://query2.finance.yahoo.com/v7/finance/options/{urllib.parse.quote(sym)}?crumb={urllib.parse.quote(crumb)}"
    first = json.loads(op.open(base, timeout=20).read())["optionChain"]["result"][0]
    S = (first.get("quote") or {}).get("regularMarketPrice")
    exps = first.get("expirationDates", [])[:n_exp]
    tot = {"cv": 0, "pv": 0, "co": 0, "po": 0}
    unusual, gex, atm = [], 0.0, None
    now = datetime.now(timezone.utc).timestamp()
    for i, ex in enumerate(exps):
        ch = first if i == 0 else json.loads(op.open(base + f"&date={ex}", timeout=20).read())["optionChain"]["result"][0]
        o = (ch.get("options") or [{}])[0]
        T = max(1, ex - now) / (365 * 86400)
        for kind, rows in (("C", o.get("calls", [])), ("P", o.get("puts", []))):
            for r in rows:
                v, oi, iv, k = r.get("volume") or 0, r.get("openInterest") or 0, r.get("impliedVolatility"), r.get("strike")
                tot["cv" if kind == "C" else "pv"] += v
                tot["co" if kind == "C" else "po"] += oi
                g = _gamma(S, k, T, iv) * oi * 100 * (S or 0) ** 2 * 0.01
                gex += g if kind == "C" else -g
                if v >= 500 and v > oi:
                    unusual.append({"k": k, "t": kind, "exp": datetime.fromtimestamp(ex, timezone.utc).date().isoformat(), "v": v, "oi": oi, "iv": iv, "last": r.get("lastPrice")})
                if i == 0 and kind == "C" and S and iv and (atm is None or abs(k - S) < abs(atm[0] - S)):
                    atm = (k, iv)
    unusual.sort(key=lambda x: -x["v"] / max(1, x["oi"]))
    return {"S": S, "exps": [datetime.fromtimestamp(e, timezone.utc).date().isoformat() for e in exps], **tot,
            "pcV": round(tot["pv"] / tot["cv"], 2) if tot["cv"] else None, "pcOI": round(tot["po"] / tot["co"], 2) if tot["co"] else None,
            "atmIV": atm[1] if atm else None, "gex": round(gex), "unusual": unusual[:12]}


# Event study (F3 FX, FN471): the last ~2 years of release days for the big US numbers, from FRED's release calendar.
# The website measures how each currency pair moved in the hours after each release (hourly candles).
# Release time in New York: 08:30 for all of these. FOMC decisions (14:00 New York) aren't a FRED release: their days
# come from the Fed's published meeting calendar (federalreserve.gov/monetarypolicy/fomccalendars.htm), typed in below.
EV_RELEASES = [("CPI", 10), ("Jobs report (NFP)", 50), ("GDP", 53), ("PCE inflation", 54), ("Retail sales", 9), ("PPI", 46)]
FOMC_DAYS = ["2024-12-18", "2025-01-29", "2025-03-19", "2025-05-07", "2025-06-18", "2025-07-30", "2025-09-17", "2025-10-29", "2025-12-10",
             "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09"]


def evdates(local):
    key = os.environ.get("FRED_API_KEY")
    if not key:
        print("  pro evdates: no FRED_API_KEY, skipped")
        return
    since = (datetime.now(timezone.utc) - timedelta(days=730)).strftime("%Y-%m-%d")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    out = []
    for name, rid in EV_RELEASES:
        q = urllib.parse.urlencode({"release_id": rid, "api_key": key, "file_type": "json", "realtime_start": since,
                                    "include_release_dates_with_no_data": "false", "sort_order": "asc", "limit": 60})
        try:
            days = [x["date"] for x in get("https://api.stlouisfed.org/fred/release/dates?" + q).get("release_dates", [])]
        except Exception as ex:
            print(f"  FRED release {rid} failed: {str(ex)[:80]}")
            continue
        out.append({"name": name, "ny": "08:30", "days": sorted(d for d in set(days) if d <= today)})
    out.append({"name": "Fed decision (FOMC)", "ny": "14:00", "days": [d for d in FOMC_DAYS if since <= d <= today]})
    save("evdates", {"events": out}, local)


# ----- round 56: F11 SMART "whole market" -----
# The 30 biggest US stocks (by market value, Nov 2026, roughly) are always on the leaderboard, plus your own US stocks.
BIG_US = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "AVGO", "TSLA", "BRK-B", "JPM", "LLY", "V", "WMT", "ORCL", "MA", "XOM", "NFLX", "COST",
          "UNH", "HD", "PG", "JNJ", "BAC", "ABBV", "AMD", "PLTR", "CRM", "KO", "MU", "CSCO"]
MKT_IDX = {"SPY": "S&P 500", "QQQ": "Nasdaq 100", "IWM": "Small caps (Russell 2000)"}


def _board_row(y, sh, o, ats, mine):
    pct = [(a / b) * 100 for _, a, b in sh if b]
    aw = [r[1] for r in ats]
    sd = (sum((x - sum(pct) / len(pct)) ** 2 for x in pct) / (len(pct) - 1)) ** 0.5 if len(pct) > 2 else None
    return {"y": y, "mine": mine, "sh": round(pct[-1], 1) if pct else None, "shAvg": round(sum(pct) / len(pct), 1) if pct else None, "shSd": round(sd, 1) if sd else None,
            "uc": sum(1 for u in (o or {}).get("unusual", []) if u["t"] == "C"), "up": sum(1 for u in (o or {}).get("unusual", []) if u["t"] == "P"),
            "pcV": (o or {}).get("pcV"), "iv": (o or {}).get("atmIV"),
            "atsJ": round(aw[-1] / (sum(aw[:-1]) / len(aw[:-1])), 2) if len(aw) > 1 and sum(aw[:-1]) else None, "atsUsd": ats[-1][3] if ats else None, "atsW": ats[-1][0] if ats else None}


def _load(key, local):
    """The last saved copy of a pro_data key (to keep a short history between runs)."""
    try:
        if local:
            return json.loads((LOCAL / f"{key}.json").read_text(encoding="utf-8"))
        import db
        r = db._req("GET", "pro_data", params={"select": "data", "key": f"eq.{key}"}) or []
        return r[0]["data"] if r else {}
    except Exception:
        return {}


def smart_market(op, crumb, short, board, local):
    prev = _load("smart_market", local) or {}
    idx = {}
    for y in MKT_IDX:
        try:
            idx[y] = options(op, crumb, y, 2)
        except Exception as ex:
            print(f"  pro options {y} failed: {str(ex)[:80]}")
    today = date.today().isoformat()
    hist = [h for h in prev.get("pcHist", []) if h[0] != today][-89:]   # put/call of the 3 index funds, one row a day (90 days)
    hist.append([today] + [idx.get(y, {}).get("pcV") if idx.get(y) else None for y in MKT_IDX] + [idx.get("SPY", {}).get("atmIV") if idx.get("SPY") else None])
    save("smart_market", {"short": short.get("_market", []), "idx": {y: ({k: v for k, v in o.items() if k != "unusual"} if o else None) for y, o in idx.items()},
                          "names": MKT_IDX, "pcHist": hist, "board": board}, local)


# ----- round 56: F10 CRYPTO whale transfers -----
# Every robot run: the newest Bitcoin blocks (mempool.space list) -> each block's full transaction list
# (blockchain.info rawblock, free, ~1-2 MB a block) -> transactions sending 100+ BTC to one address.
# Size and time only: WHO owns the wallets needs paid labelling (Whale Alert, Arkham), not included.
# One transaction can be an exchange moving coins between its own wallets, so it's activity, not a buy or a sell.
WHALE_BTC = 100


def whales(local, max_blocks=12):
    prev = _load("whales", local) or {}
    seen = {b[0] for b in prev.get("blocks", [])}
    blocks = get("https://mempool.space/api/v1/blocks")   # newest ~15 blocks: id, height, timestamp
    new = [b for b in blocks if b["height"] not in seen][:max_blocks]
    big, counts = list(prev.get("big", [])), list(prev.get("blocks", []))
    for b in sorted(new, key=lambda x: x["height"]):
        try:
            raw = get("https://blockchain.info/rawblock/" + b["id"], timeout=90)
        except Exception as ex:
            print(f"  whale block {b['height']} failed: {str(ex)[:60]}")
            continue
        n = 0
        for tx in raw.get("tx", [])[1:]:   # [0] = the miner's reward
            top = max((o.get("value", 0) for o in tx.get("out", [])), default=0) / 1e8
            if top >= WHALE_BTC:
                n += 1
                big.append([b["timestamp"], b["height"], tx.get("hash"), round(top, 2)])
        counts.append([b["height"], b["timestamp"], n])
    if not new:
        return
    cut = datetime.now(timezone.utc).timestamp() - 8 * 86400
    big = sorted([x for x in big if x[0] >= datetime.now(timezone.utc).timestamp() - 2 * 86400], key=lambda x: -x[0])[:300]   # last 48 hours
    counts = sorted([c for c in counts if c[1] >= cut], key=lambda c: c[0])
    save("whales", {"big": big, "blocks": counts, "min": WHALE_BTC}, local)


def tickers_default():
    try:
        import db
        s = db.user_settings() or {}
        wl = s.get("watchlist") or []
        held = list(db.held_tickers() or [])
        th, scan = [], []
        try:   # tickers you wrote a thesis on + the IDEAS scan list (theses row "#IDEAS"), so IDEAS can score them
            for r in db._req("GET", "theses", params={"select": "ticker,data"}) or []:
                if r["ticker"] == "#IDEAS":
                    scan += [str(x).upper() for x in (r.get("data") or {}).get("scan") or []]
                elif r["ticker"][:1] not in "*#":
                    th.append(r["ticker"])
        except Exception:
            pass
        return list(dict.fromkeys(wl + held + th + scan))[:80]   # cap: one Yahoo company download each, once a day
    except Exception:
        return ["NVDA", "AMD", "TSM"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--local", action="store_true")
    ap.add_argument("--only", default="macro,cb,cot,evdates,fund,smart")
    ap.add_argument("--tickers", default="")
    a = ap.parse_args()
    import analyze
    analyze.load_env()
    run(a.only.split(","), a.tickers.split(",") if a.tickers else None, a.local)


def run(parts, tickers=None, local=False):
    import prices
    if "macro" in parts:
        macro(local)
    if "cb" in parts:
        cb(local)
    if "cot" in parts:
        cot(local)
    if "evdates" in parts:
        evdates(local)
    if "whales" in parts:
        whales(local)
    tks = tickers or tickers_default()
    ys = list(dict.fromkeys(prices.yahoo_symbol(t) for t in tks))
    if "fund" in parts or "smart" in parts:
        op, crumb = _yahoo()
    if "fund" in parts:
        for y in ys:
            try:
                save("fund_" + y.replace("^", "_"), fund_one(op, crumb, y), local)
            except Exception as ex:
                print(f"  pro fund {y} failed: {str(ex)[:80]}")
    if "smart" in parts:
        us = [y for y in ys if "." not in y and "^" not in y and "=" not in y]
        big = [y for y in BIG_US if y not in us]   # round 56: the whole-market leaderboard also covers the biggest US stocks
        short = finra_short(us + big + list(MKT_IDX))
        board = []
        for y in us + big:
            o = None
            try:
                o = options(op, crumb, y, 4 if y in us else 2)   # your stocks: 4 expiries; the extra big ones: 2 (fewer calls)
            except Exception as ex:
                print(f"  pro options {y} failed: {str(ex)[:80]}")
            ats = []
            try:
                ats = finra_ats(y)
            except Exception as ex:
                print(f"  pro dark pool {y} failed: {str(ex)[:80]}")
            save("smart_" + y, {"short": short.get(y, []), "opt": o, "ats": ats}, local)
            board.append(_board_row(y, short.get(y, []), o, ats, y in us))
        smart_market(op, crumb, short, board, local)


def scheduled():
    """Called by run.py every robot run. Does each part only when it's due (marks in seen_links, like stock_stats):
    macro + central banks + CFTC every 6 hours, company data once a day, short volume + options once a day after the US close."""
    import db
    try:
        db._req("GET", "pro_data", params={"select": "key", "limit": "1"})
    except Exception:
        print("Pro data skipped: run supabase/017_pro.sql first")
        return
    try:
        whales(False)   # every run: new Bitcoin blocks since last time (about 3 per 30 minutes)
    except Exception as ex:
        print(f"  pro whales failed: {str(ex)[:80]}")
    now = datetime.now(timezone.utc)
    marks = {"macro": f"pro:macro:{now:%Y-%m-%d}:{now.hour // 6}", "fund": f"pro:fund:{now:%Y-%m-%d}"}
    if now.hour >= 22 or now.hour < 3:   # after the US close (FINRA posts the day's file in the evening, US time)
        marks["smart"] = f"pro:smart:{(now - timedelta(hours=6)):%Y-%m-%d}"
    done = db.seen_links(marks.values())
    parts = [k for k, m in marks.items() if m not in done]
    if not parts:
        return
    run((["macro", "cb", "cot", "evdates"] if "macro" in parts else []) + [p for p in parts if p != "macro"])
    db.mark_seen({marks[k]: None for k in parts})


if __name__ == "__main__":
    main()
