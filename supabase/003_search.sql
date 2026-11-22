-- Investment Center: search any stock + custom topics (run once in Supabase > SQL Editor)
-- Safe to run more than once.

-- 1. Your own topics and the company names of stocks you add from search
alter table public.user_settings
  add column if not exists custom_topics text[] not null default '{}',
  add column if not exists watch_names  jsonb  not null default '{}'::jsonb;

-- 2. Lets the database call a web address (used only by the search below)
create extension if not exists http with schema extensions;

-- 3. search_symbols('toyota') -> up to 8 matching stocks from Yahoo Finance's public search.
--    The website can't ask Yahoo directly (browsers block it), so the database asks instead.
create or replace function public.search_symbols(q text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  res extensions.http_response;
  body jsonb;
begin
  q := trim(coalesce(q, ''));
  if length(q) < 1 or length(q) > 40 then
    return '[]'::jsonb;
  end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '6000');
  res := extensions.http((
    'GET',
    'https://query2.finance.yahoo.com/v1/finance/search?quotesCount=8&newsCount=0&q=' || extensions.urlencode(q),
    array[extensions.http_header('User-Agent', 'Mozilla/5.0')],
    null, null
  )::extensions.http_request);
  if res.status <> 200 then
    return '[]'::jsonb;
  end if;
  body := res.content::jsonb;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'symbol',   x->>'symbol',
             'name',     coalesce(x->>'shortname', x->>'longname', x->>'symbol'),
             'exchange', coalesce(x->>'exchDisp', x->>'exchange', ''),
             'type',     x->>'quoteType'))
    from jsonb_array_elements(body->'quotes') x
    where x->>'quoteType' in ('EQUITY', 'ETF', 'INDEX', 'CRYPTOCURRENCY', 'MUTUALFUND')
  ), '[]'::jsonb);
exception when others then
  return '[]'::jsonb;
end;
$$;

-- Only signed-in users (and the robot) may use it; logged-out visitors can't.
revoke all on function public.search_symbols(text) from public, anon;
grant execute on function public.search_symbols(text) to authenticated, service_role;
