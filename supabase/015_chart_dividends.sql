-- 015 (2026-11-25): dividends on the stock chart (design round 48, P1 events).
-- Same get_candles() as 013, plus 'ev' = Yahoo's dividend list ({"<unix>": {"amount": .., "date": <unix>}}), which 013 dropped.
-- Run once in Supabase -> SQL Editor. Safe to run twice.

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
          't', coalesce(r->'timestamp', '[]'::jsonb), 'o', q->'open', 'h', q->'high', 'l', q->'low', 'c', q->'close', 'v', q->'volume',
          'ev', coalesce(r->'events'->'dividends', '{}'::jsonb));   -- 015: past dividends for the chart badges
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

-- Empty the candle cache once, so charts get the new 'ev' field now instead of after the cache expires (it refills by itself).
delete from public.candle_cache;
