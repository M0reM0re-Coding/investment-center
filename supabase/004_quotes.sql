-- Investment Center: live prices for the My News price strip (run once in Supabase > SQL Editor)
-- Needs 003_search.sql first (it switches on the "http" extension). Safe to run more than once.

-- 1. Last prices we fetched, so many open tabs share one Yahoo request per minute
create table if not exists public.quote_cache (
  symbol     text primary key,
  data       jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table public.quote_cache enable row level security;  -- no policies: only the function below touches it
revoke all on public.quote_cache from anon, authenticated;

-- 2. get_quotes(array['NVDA','PTT.BK','^SET.BK']) ->
--    {"NVDA": {"price":..., "prev":..., "pts":[...today's prices...], "name":..., "time":...}, ...}
--    Prices come from Yahoo Finance's public chart data and may be delayed (Thai stocks ~15 min).
create or replace function public.get_quotes(syms text[])
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  wanted text[];
  stale  text[];
  chunk  text[];
  res    extensions.http_response;
  body   jsonb;
  item   jsonb;
  r      jsonb;
  i      int;
begin
  -- only sensible symbols, at most 40 per call
  select coalesce(array_agg(distinct s), '{}') into wanted
  from (select unnest(syms) s limit 40) x
  where s ~ '^[A-Za-z0-9.^=\-]{1,20}$';
  if cardinality(wanted) = 0 then
    return '{}'::jsonb;
  end if;

  -- refresh anything older than 60 seconds, 20 symbols per Yahoo request
  select coalesce(array_agg(w), '{}') into stale
  from unnest(wanted) w
  where not exists (select 1 from quote_cache c where c.symbol = w and c.fetched_at > now() - interval '60 seconds');

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '6000');
  i := 1;
  while i <= cardinality(stale) loop
    chunk := stale[i : i + 19];
    i := i + 20;
    begin
      res := extensions.http((
        'GET',
        'https://query1.finance.yahoo.com/v7/finance/spark?range=1d&interval=15m&symbols='
          || extensions.urlencode(array_to_string(chunk, ',')),
        array[extensions.http_header('User-Agent', 'Mozilla/5.0')],
        null, null
      )::extensions.http_request);
      if res.status = 200 then
        body := res.content::jsonb;
        for item in select * from jsonb_array_elements(body->'spark'->'result') loop
          r := item->'response'->0;
          continue when r is null or r->'meta'->>'regularMarketPrice' is null;
          insert into quote_cache (symbol, data, fetched_at)
          values (
            item->>'symbol',
            jsonb_build_object(
              'price', (r->'meta'->>'regularMarketPrice')::numeric,
              'prev',  coalesce((r->'meta'->>'chartPreviousClose')::numeric, (r->'meta'->>'previousClose')::numeric),
              'name',  coalesce(r->'meta'->>'shortName', r->'meta'->>'longName', item->>'symbol'),
              'time',  (r->'meta'->>'regularMarketTime')::bigint,
              'pts',   coalesce((select jsonb_agg(v) from jsonb_array_elements(r->'indicators'->'quote'->0->'close') v
                                 where jsonb_typeof(v) = 'number'), '[]'::jsonb)
            ),
            now()
          )
          on conflict (symbol) do update set data = excluded.data, fetched_at = excluded.fetched_at;
        end loop;
      end if;
    exception when others then
      null;  -- Yahoo slow or down: keep serving the last cached prices
    end;
  end loop;

  return coalesce((select jsonb_object_agg(symbol, data) from quote_cache where symbol = any(wanted)), '{}'::jsonb);
end;
$$;

-- Only signed-in users (and the robot) may use it.
revoke all on function public.get_quotes(text[]) from public, anon;
grant execute on function public.get_quotes(text[]) to authenticated, service_role;
