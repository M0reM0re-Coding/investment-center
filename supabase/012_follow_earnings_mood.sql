-- 012 (2026-11-25): design round 34 + Fear & Greed. Run once in Supabase -> SQL Editor. Safe to run twice.
--   1. follows           : stories (My News / World) and places (country / region) you follow -> Telegram alerts
--   2. earnings_results  : EPS actual vs expected for your watchlist (Yahoo, once a day)
--   3. market_gauges     : Fear & Greed (CNN for stocks, alternative.me for crypto), hourly

-- 1. Follows ------------------------------------------------------------------------------------------------
create table if not exists public.follows (
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('story', 'world', 'place')),
  key           text not null,          -- story id, or 'country:Myanmar' / 'region:Asia'
  label         text,                   -- headline or place name, for the Telegram message
  last_n        int,                    -- outlets when last checked (the robot fills it)
  last_tl       int,                    -- timeline steps when last checked
  last_alert_at timestamptz,
  created_at    timestamptz not null default now(),
  primary key (user_id, kind, key)
);
alter table public.follows enable row level security;
drop policy if exists "own follows" on public.follows;
create policy "own follows" on public.follows for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.follows to authenticated;
grant select, insert, update, delete on public.follows to service_role;

-- 2. Earnings results -----------------------------------------------------------------------------------------
create table if not exists public.earnings_results (
  ticker        text not null,
  quarter_end   date not null,
  eps_actual    numeric,
  eps_estimate  numeric,
  surprise_pct  numeric,
  revenue       text,                   -- e.g. "115.84B" (no revenue forecast in the free data)
  price_then    numeric,                -- stock price when the robot first saw the result
  seen_at       timestamptz not null default now(),   -- ~ the report day (checked once a day)
  primary key (ticker, quarter_end)
);
alter table public.earnings_results enable row level security;
drop policy if exists "logged-in can read earnings" on public.earnings_results;
create policy "logged-in can read earnings" on public.earnings_results for select to authenticated using (true);
grant select on public.earnings_results to authenticated;
grant select, insert, update, delete on public.earnings_results to service_role;

-- 3. Market gauges (Fear & Greed) -----------------------------------------------------------------------------
create table if not exists public.market_gauges (
  name        text primary key,         -- 'stocks' (CNN) or 'crypto' (alternative.me)
  score       numeric not null,         -- 0 = extreme fear, 100 = extreme greed
  rating      text,
  prev_close  numeric,
  week_ago    numeric,
  month_ago   numeric,
  year_ago    numeric,
  updated_at  timestamptz not null default now()
);
alter table public.market_gauges enable row level security;
drop policy if exists "logged-in can read gauges" on public.market_gauges;
create policy "logged-in can read gauges" on public.market_gauges for select to authenticated using (true);
grant select on public.market_gauges to authenticated;
grant select, insert, update, delete on public.market_gauges to service_role;
