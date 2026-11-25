-- 013 (2026-11-25): Charts page (design round 38, style A). Run once in Supabase -> SQL Editor. Safe to run twice.
-- Needs 003_search.sql first (it switches on the "http" extension).
--   1. get_candles(symbol, range, interval) : price candles + volume from Yahoo's public chart data, cached
--   2. chart_drawings                       : your drawings and indicators per stock (only you can see them)
--   3. stock_stats                          : key stats + financials per stock (the robot fills it once a day)

-- 1. Candles ---------------------------------------------------------------------------------------------------
create table if not exists public.candle_cache (
  symbol     text not null,
  rng        text not null,
  itv        text not null,
  data       jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (symbol, rng, itv)
);
alter table public.candle_cache enable row level security;   -- no policies: only the function below touches it
revoke all on public.candle_cache from anon, authenticated;

-- get_candles('NVDA', '6mo', '1d') -> {"meta": {...}, "t": [unix seconds], "o": [], "h": [], "l": [], "c": [], "v": []}
-- Cached: 2 minutes for intraday candles, 15 minutes for daily, 6 hours for weekly / monthly.
create or replace function public.get_candles(sym text, rng text, itv text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  ttl  interval;
  res  extensions.http_response;
  r    jsonb;
  q    jsonb;
  out  jsonb;
begin
  if sym !~ '^[A-Za-z0-9.^=\-]{1,20}$' then return null; end if;
  -- only the combinations Yahoo serves
  if not ((itv in ('5m', '15m') and rng in ('1d', '5d', '1mo'))
       or (itv = '60m' and rng in ('5d', '1mo', '3mo', '6mo', '1y', '2y'))
       or (itv = '1d' and rng in ('1mo', '3mo', '6mo', 'ytd', '1y', '2y', '5y', '10y', 'max'))
       or (itv in ('1wk', '1mo') and rng in ('1y', '2y', '5y', '10y', 'max'))) then
    return null;
  end if;
  ttl := case when itv in ('5m', '15m', '60m') then interval '2 minutes'
              when itv = '1d' then interval '15 minutes' else interval '6 hours' end;

  select data into out from candle_cache c
   where c.symbol = sym and c.rng = get_candles.rng and c.itv = get_candles.itv and c.fetched_at > now() - ttl;
  if out is not null then return out; end if;

  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');
    res := extensions.http((
      'GET',
      'https://query1.finance.yahoo.com/v8/finance/chart/' || extensions.urlencode(sym)
        || '?range=' || rng || '&interval=' || itv || '&includePrePost=false&events=div%2Csplit',
      array[extensions.http_header('User-Agent', 'Mozilla/5.0')],
      null, null
    )::extensions.http_request);
    if res.status = 200 then
      r := (res.content::jsonb)->'chart'->'result'->0;
      q := r->'indicators'->'quote'->0;
      if r is not null and q is not null then
        out := jsonb_build_object(
          'meta', jsonb_build_object(
            'symbol', r->'meta'->>'symbol', 'name', coalesce(r->'meta'->>'longName', r->'meta'->>'shortName'),
            'exchange', r->'meta'->>'fullExchangeName', 'currency', r->'meta'->>'currency', 'type', r->'meta'->>'instrumentType',
            'price', r->'meta'->'regularMarketPrice', 'prev', r->'meta'->'chartPreviousClose',
            'dayHigh', r->'meta'->'regularMarketDayHigh', 'dayLow', r->'meta'->'regularMarketDayLow',
            'volume', r->'meta'->'regularMarketVolume', 'hi52', r->'meta'->'fiftyTwoWeekHigh', 'lo52', r->'meta'->'fiftyTwoWeekLow',
            'time', r->'meta'->'regularMarketTime', 'tz', r->'meta'->>'exchangeTimezoneName'),
          't', coalesce(r->'timestamp', '[]'::jsonb), 'o', q->'open', 'h', q->'high', 'l', q->'low', 'c', q->'close', 'v', q->'volume');
        insert into candle_cache (symbol, rng, itv, data, fetched_at) values (sym, rng, itv, out, now())
        on conflict on constraint candle_cache_pkey do update set data = excluded.data, fetched_at = excluded.fetched_at;
        return out;
      end if;
    end if;
  exception when others then
    null;   -- Yahoo slow or down: fall back to the last copy below
  end;
  return (select data from candle_cache c where c.symbol = sym and c.rng = get_candles.rng and c.itv = get_candles.itv);
end;
$$;
revoke all on function public.get_candles(text, text, text) from public, anon;
grant execute on function public.get_candles(text, text, text) to authenticated, service_role;

-- 2. Your drawings + indicators per stock -------------------------------------------------------------------------
create table if not exists public.chart_drawings (
  user_id    uuid not null references auth.users(id) on delete cascade,
  symbol     text not null,
  overlays   jsonb not null default '[]'::jsonb,    -- trend lines, Fibonacci, Elliott waves, ...
  indicators jsonb,                                  -- {"main": ["MA"], "sub": ["VOL", "RSI", "MACD"]}
  updated_at timestamptz not null default now(),
  primary key (user_id, symbol)
);
alter table public.chart_drawings enable row level security;
drop policy if exists "own drawings" on public.chart_drawings;
create policy "own drawings" on public.chart_drawings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.chart_drawings to authenticated;
revoke all on public.chart_drawings from anon;

-- 3. Key stats + financials (robot/stock_stats.py, once a day per stock) ---------------------------------------
create table if not exists public.stock_stats (
  symbol     text primary key,                       -- Yahoo symbol: NVDA, PTT.BK
  data       jsonb not null,                         -- market cap, P/E, EPS, dividend, revenue, margins, quarters, ...
  updated_at timestamptz not null default now()
);
alter table public.stock_stats enable row level security;
drop policy if exists "logged-in can read stats" on public.stock_stats;
create policy "logged-in can read stats" on public.stock_stats for select to authenticated using (true);
grant select on public.stock_stats to authenticated;
grant select, insert, update, delete on public.stock_stats to service_role;
revoke all on public.stock_stats from anon;
