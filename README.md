# Investment Center

A personal investing news site: **My News**, **World Brief** and **Charts**.
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

## Run locally

```powershell
cd "F:\Claude Project\Investment Center\site"
python -m http.server 8080
```
Then open http://localhost:8080.

## Secrets

Keys live only in `.env` (this PC) and GitHub Secrets (the robot). `.env.example` lists the names. Never commit `.env`.
