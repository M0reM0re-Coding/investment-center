# Investment Center

A personal investing news site: **My News**, **World Brief**, **Charts** and **Portfolio**.
A robot on GitHub Actions collects news and prices every 30 minutes, AI (Gemini) scores and summarises them,
Supabase stores everything, and Telegram sends alerts.

Live site: https://m0rem0re-coding.github.io/investment-center

## How the pieces fit

```
GitHub Actions (robot.yml, every 30 min)
   └─ robot/run.py ──► news feeds, Yahoo, Forex Factory, FRED, Gemini
          │
          ▼
      Supabase (database + login)  ◄── site/ (the website, GitHub Pages)
          │
          ▼
      Telegram alerts (robot/notify.py)
```

## Folders

| Folder | What's inside |
|---|---|
| `site/` | The website. `index.html` loads `config.js`, then `css/*` and `js/*` in a fixed order. No build step. |
| `site/js/<area>/` | The website code, one file per feature (see the table below). Plain scripts that share one scope, so **the order in `index.html` matters**: a file may only *run* code from earlier files while the page loads (functions called later, e.g. on a click, can live anywhere). |
| `site/css/NN-name.css` | The styles, split in their original order. **Later files win** when two rules clash, so keep the numbers in order. |
| `site/mascot/<theme>/<pose>.png` | The theme characters (8 poses per theme). |
| `robot/` | Python jobs the robot runs. `run.py` is the entry point and calls the others. |
| `robot/tools/` | Scripts you run **by hand on your PC**, never on GitHub (see below). |
| `robot/catalog.json` | Topics + tickers (also copied into `site/config.js`). |
| `robot/sources.json` | The news feeds. |
| `supabase/` | Database scripts. Run new ones once in Supabase → SQL Editor, in number order. |
| `design-loop/` | Design mockups, one HTML file per round (`round-01` … `round-47`). Reference only, not used by the site. |
| `.github/workflows/` | `robot.yml` (robot every 30 min), `pages.yml` (publishes `site/`), `keepalive.yml` (monthly commit so GitHub keeps the schedule on). |
| `out/` | Local test output. Not in git. |

## Where each feature lives

Website files are under `site/js/` and `site/css/`. Robot files are under `robot/`. Database scripts are `supabase/NNN_*.sql`.

| Feature | Page / route | Website code (`site/js/`) | Styles (`site/css/`) | Robot | Database |
|---|---|---|---|---|---|
| Startup, login storage, shared `state`, theme | – | `core/setup.js` | `01-base` | – | `schema.sql` |
| Helpers + loading data | – | `core/helpers.js` | – | – | – |
| Page frame, My News, story page, Settings views | `#/`, `#/story`, `#/prefs` | `core/views.js` | `01-base`, `07-settings-themes`, `08-story-extras` | `fetch.py`, `analyze.py`, `article.py`, `images.py` | `002`, `007` |
| Which page to draw, new-story checks | – | `core/router.js` | – | – | – |
| All clicks / typing / forms | – | `core/events.js` | – | – | – |
| Start-up + global listeners | – | `core/start.js` | – | – | – |
| Login page | – | `core/login.js` | `13-login-misc` | `tools/set_password.py` | – |
| Search | `#/search` | `core/search.js` | `04-reading` | – | `003` |
| Intros + motion | all pages | `core/motion.js` | `02-motion-basics`, `06-motion` | – | – |
| Sort dropdown | My News + World | `news/sort.js` | `14-econ-sort-follow` | – | – |
| Price strip / dock | My News | `news/prices.js` | `03-prices-filters` | `prices.py` | `004` |
| Reading status, notes, mutes, Undo | My News | `news/reading.js` | `04-reading` | – | `005` |
| Briefing deck | My News | `news/briefing.js` | `04-reading`, `09-phone` | – | – |
| Developing stories | My News + World | `news/developing.js` | `10-world` | `developing.py` | `009` |
| Follow, market mood, earnings cards | My News | `news/follow-mood-earnings.js` | `14-econ-sort-follow` | `follows.py`, `gauges.py`, `earnings.py` | `012` |
| Stock calendar + Upcoming panel | `#/calendar` | `calendar/stock-calendar.js` | `05-calendar` | `db.py` (`news_events`) | `006` |
| Economic calendar + results | `#/econ` | `calendar/econ-calendar.js` | `14-econ-sort-follow` | `econ.py`, `econ_actuals.py` | `011` |
| World Brief | `#/world` | `world/brief.js` | `10-world`, `13-login-misc` | `world.py` | `008`, `009` |
| World map | `#/world` (Map) | `world/map.js` | `10-world` | `world.py` | `009` |
| Charts home + sidebar | `#/charts` | `charts/home.js` | `15-charts`, `16-charts-pro` | `stock_stats.py` | `013` |
| Stocks by market & industry (7 markets: S&P 500, SET50, Nikkei 225, Hang Seng, KOSPI 200, FTSE 100, DAX; filter, sort by column titles) + screener ("+ Filter" P/E, yield, 52-week…, ready-made + saved screens) | `#/stocks` | `charts/stocks-page.js` | `18-chart-tools`, `19-stocks-and-markers`, `20-portfolio-screener` | `heatmap.py` (member lists + sizes in USD + P/E, yield, 52-week high/low, daily) | `013` |
| Portfolio (trade ledger: Buy / Sell / Dividend / Opening; average cost, realised / unrealised P&L, allocation) | `#/portfolio` | `portfolio/portfolio.js` | `20-portfolio-screener` | `db.held_tickers` (World Brief reads what you own) | `016` |
| "This week for your stocks" card | My News | `news/weekly.js` | `20-portfolio-screener` | – | – |
| News pins + event badges on the chart (News / Events switches) | stock page | `charts/markers.js` | `19-stocks-and-markers` | `fetch.py` + `analyze.py` (stories), `earnings.py`, `econ.py` | `015` (dividends) |
| Stock page (Overview, Technicals) | `#/charts/<TICKER>` | `charts/stock-page.js` | `16-charts-pro`, `17-stock-overview` | `stock_stats.py` | `013` |
| Chart loading + saved chart settings | stock page | `charts/chart.js` | `15-charts` | – | `013` |
| Indicators (MACD, RSI, CDC, PVO, ZigZag…) | stock page | `charts/indicators.js` | – | – | – |
| Drawings, undo, drawing settings, Object tree, drawing alerts | stock page | `charts/drawings.js` | `18-chart-tools` | `drawing_alerts.py` | `014` |
| Chart zoom / scroll | stock page | `charts/navigation.js` | `18-chart-tools` | – | – |
| Drawing toolbar | stock page | `charts/toolbar.js` | `18-chart-tools` | – | – |
| Compare symbols | stock page | `charts/compare.js` | `18-chart-tools` | – | – |
| Indicator / Fib windows, right-click menu, shortcuts | stock page | `charts/windows.js` | `16-charts-pro` | – | – |
| Heat map | `#/heatmap` | `charts/heatmap.js` | `16-charts-pro` | `heatmap.py` | `013` |
| Topics & watchlist | `#/settings` | `pages/topics-watchlist.js` | `01-base` | – | `003` |
| Price alerts | Topics & watchlist | `alerts/price-alerts.js` | `08-story-extras` | `price_alerts.py` | `007` |
| Big news alert + mascots | all pages | `alerts/big-alert.js` | `11-big-alert`, `12-seasons-mascots` | `notify.py` | – |
| Seasons, dark/light styles | Settings | `core/setup.js`, `core/views.js` | `07-settings-themes`, `12-seasons-mascots` | – | – |
| Phone + tablet layout | all pages | (inside each file) | `09-phone` | – | – |
| **Pro mode** switch, terminal top bar, F1-F11 (Alt + 1…9, 0, -), PRO / BOT mode switch, command line, Pro Settings (Amber / Phosphor / Arctic / Paper), LEARN boxes, data loading | `#/pro` (PRO button top right) | `pro/shell.js` | `21-pro` | `pro_data.py` | `017` |
| Pro HOME (one line from every module) | `#/pro` | `pro/home.js` | `21-pro` | – | – |
| Pro MACRO: overall reading for stocks + WHAT IT MEANS on each panel, regime, recession lights, surprise index, curve, liquidity, credit, bond math (price, duration, convexity, FN351), central banks + IMF, CFTC positioning | `#/pro/macro` | `pro/macro.js` | `21-pro` | `pro_data.py` (FRED, Treasury, OECD, BIS, IMF, CFTC) | `017` |
| Pro FX: the full chart (draw / write / indicators, same as Charts; HIDE / SHOW, hidden = one-line strip) for any pair, economic calendar (Forex Factory + FRED actuals), event study (FN471), forward rates + hedge calculator (FN313), currency board, strength, carry, CFTC, what moves the baht | `#/pro/fx` | `pro/fx.js` (+ `charts/*`) | `21-pro` | `pro_data.py` (`cb`, `cot`, `evdates`), `econ.py` | `017`, `011` |
| Pro IDEAS: stocks ranked by your MUST / PREFER rules + 8 data factors incl. TECHNICAL (reads your chart drawings) (thesis is one factor), conflicts flagged | `#/pro/ideas` | `pro/ideas.js` | `21-pro` | `pro_data.py` (fund for watchlist + holdings + theses + scan list) | `017` (`theses` row `#IDEAS`) |
| BOT mode (switch PRO / BOT): B1 SIGNALS buy / short / wait (your thresholds) + levels + 1%-risk size, B2 MY BOTS (up to 8 bots: stocks, Thai stocks, crypto, forex trend / carry, gold; long + short, leverage, forex swap, sessions, news pause, 4-hour candles), B3 PAPER (all bots or one), B4 JOURNAL. PAPER ONLY | `#/pro/bot`, `/bots`, `/botp`, `/botj` | `pro/bot.js` | `21-pro` | `pro_bot.py` (same engine, every robot run) | `017` (`theses` row `#BOT`) |
| Pro ROT: sector + style rotation, ALL ASSETS view (bonds, commodities, currencies, crypto, countries vs ACWI, risk-on/off), rotation map, regime link | `#/pro/rot` | `pro/rot.js` | `21-pro` | – (Yahoo via get_candles) | `013` |
| Pro VAL: DCF + reverse DCF + sensitivity, residual income (banks, FN451), red flags (Piotroski, Altman, Beneish, accruals), estimates + revisions, peers | `#/pro/val/<T>` | `pro/val.js` | `21-pro` | `pro_data.py` (Yahoo `fund_<SYM>`) | `017` |
| Pro THESIS: bull/base/bear, evidence, rules, thesis map (events, stocks, supply chain, scenarios) | `#/pro/thesis/<T>` | `pro/thesis.js` | `21-pro` | – | `017` (`theses`) |
| Pro RISK: volatility, beta, drawdown, VaR, correlation, exposure, stress test, Long/Short trade plans, efficient frontier (FN452) | `#/pro/risk` | `pro/risk.js` | `21-pro` | – | `016`, `014` |
| Pro CHART: the normal chart with Pro colours + macro lines (10Y, dollar, oil, VIX, gold, BTC) | `#/charts/<T>` while Pro is on | `pro/shell.js` (overlay bar), `charts/*` | `21-pro` | – | – |
| Pro CRYPTO: WHOLE MARKET or one coin; market verdict, breadth, leverage, new money, BTC share, coin heat strip; ON-CHAIN: exchange flows, coins on exchanges, network use (CoinMetrics), whale transfers 100+ BTC (robot scans every block) + details: funding, open interest, long/short, stablecoins, MVRV, TVL, hashrate (live, in the browser) | `#/pro/crypto` | `pro/crypto.js` | `21-pro` | – | – |
| Pro SMART: WHOLE MARKET (all-US short %, SPY/QQQ/IWM options, dark pools, leaderboard of unusual stocks: yours + 30 biggest) or ONE STOCK: 4 cards + options lab (Black-Scholes, Greeks, payoff, FN456) + details: FINRA short volume, unusual options, dark-pool (ATS) weekly volume (US) | `#/pro/smart/<T>` | `pro/smart.js` | `21-pro` | `pro_data.py` (`smart_<SYM>`) | `017` |
| Robot upkeep (model memory, 90-day cleanup) | – | – | – | `run.py`, `db.py` | `010` |

**Adding a new website file:** put it in the right folder and add a `<script defer src="js/…?v=__V__">` line in `index.html`
*before* `core/views.js` if other files use it while the page loads; otherwise anywhere before `core/start.js`.

## Hand-run tools (`robot/tools/`)

Run from the project folder in PowerShell, for example `python robot/tools/check_keys.py`.

| Tool | What it does |
|---|---|
| `check_keys.py` | Checks every key in `.env` works (prints pass/fail only). |
| `set_password.py` | Sets a website login password without email. |
| `build_site_config.py` | Rebuilds `site/config.js` from `.env` + `catalog.json` (public values only). |
| `obsidian_export.py` | Exports saved stories + notes to the Obsidian vault. |

`robot/pro_data.py --local` (not in tools/: the robot also runs it) writes Pro data to `site/data/pro/*.json` for a local preview before `017_pro.sql` is run. That folder is git-ignored.

## Run locally

```powershell
cd "F:\Claude Project\Investment Center\site"
python -m http.server 8080
```
Then open http://localhost:8080.

## Secrets

Keys live only in `.env` (this PC) and GitHub Secrets (the robot). `.env.example` lists the names. Never commit `.env`.
