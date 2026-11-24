-- 011 (2026-11-25): economic calendar from Forex Factory (design round 32: A + B + C).
-- Run once in Supabase -> SQL Editor. Safe to run twice.
--
-- The robot (robot/econ.py) copies this week's Forex Factory calendar here at most every 3 hours.
-- Data: time, currency, impact, forecast, previous. The free weekly file has no "actual" values, so after each release
-- the robot fills actual / result for big US releases from FRED (St. Louis Fed, official free API; design round 35).
-- Every event also gets its Forex Factory page link (url), shown as "Result ↗" when there's no actual.
create table if not exists public.econ_events (
  id        uuid primary key default gen_random_uuid(),
  at        timestamptz not null,              -- when it is released
  currency  text not null,                     -- USD, EUR, JPY, ...
  impact    text not null check (impact in ('High', 'Medium', 'Low', 'Holiday')),
  title     text not null,
  forecast  text,
  previous  text,
  updated_at timestamptz not null default now(),
  unique (at, currency, title)
);
-- round 35: released numbers (filled by the robot after the release time)
alter table public.econ_events add column if not exists actual    text;
alter table public.econ_events add column if not exists result    text check (result in ('better', 'worse', 'inline'));
alter table public.econ_events add column if not exists actual_at timestamptz;   -- when the robot found the actual
alter table public.econ_events add column if not exists url       text;          -- the event's page on Forex Factory
create index if not exists econ_events_at_idx on public.econ_events (at);

alter table public.econ_events enable row level security;
drop policy if exists "logged-in can read econ events" on public.econ_events;
create policy "logged-in can read econ events" on public.econ_events for select to authenticated using (true);
grant select on public.econ_events to authenticated;
grant select, insert, update, delete on public.econ_events to service_role;
