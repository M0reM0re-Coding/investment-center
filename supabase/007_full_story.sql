-- 007: full story, "why it matters to you", term explainer, price alerts.
-- Run once in Supabase -> SQL Editor. Safe to run more than once.

-- 1. Stories: new AI fields
alter table public.stories
  add column if not exists full_story jsonb,   -- 3-4 paragraphs written from the full articles (null = older story)
  add column if not exists story_from jsonb,   -- outlets whose articles the AI read
  add column if not exists for_you    text,    -- one line: why this matters for YOUR watchlist/topics
  add column if not exists terms      jsonb;   -- [{term, explain}] hard words, explained in plain English

-- 2. Price alerts: your rules; the robot checks them every 30 minutes and sends Telegram
create table if not exists public.price_alerts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  ticker     text not null check (length(ticker) between 1 and 20),
  kind       text not null check (kind in ('move', 'above', 'below')),  -- move = +/- % today
  value      numeric not null check (value > 0),
  active     boolean not null default true,
  fired_at   timestamptz,                  -- last time it sent a message
  fired_note text,                         -- e.g. "NVDA -5.4% today at 182.10"
  created_at timestamptz not null default now()
);
create index if not exists price_alerts_user_idx on public.price_alerts (user_id);
alter table public.price_alerts enable row level security;
drop policy if exists "own alerts" on public.price_alerts;
create policy "own alerts" on public.price_alerts
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.price_alerts to authenticated;
revoke all on public.price_alerts from anon;
-- the robot (service_role) does not get new tables automatically on this project (see 006)
grant select, insert, update, delete on public.price_alerts to service_role;
