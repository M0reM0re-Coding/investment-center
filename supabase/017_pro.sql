-- 017 (2026-11-26): Investment Center Pro (FEATURES.md "Investment Center Pro").
-- Run once in Supabase -> SQL Editor -> paste -> Run. Safe to run twice.
--
-- 1) pro_data: what the robot collects for Pro (robot/pro_data.py): macro, central banks, CFTC positioning,
--    company fundamentals ("fund_NVDA"), short volume + options ("smart_NVDA"). Public market data, one row per key.
--    Logged-in users can read it; only the robot (service role) writes it.
-- 2) theses: your investment theses + thesis maps (PRIVATE, row-level security: each login sees only its own rows).
--    One row per ticker; the row with ticker '*' holds your shared event library (events reused across maps).
--    The robot may READ theses (to nudge you on Telegram when a linked story develops); it never changes them.

create table if not exists public.pro_data (
  key         text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);
alter table public.pro_data enable row level security;
drop policy if exists "read pro data" on public.pro_data;
create policy "read pro data" on public.pro_data for select to authenticated using (true);
grant select on public.pro_data to authenticated;
grant select, insert, update, delete on public.pro_data to service_role;

create table if not exists public.theses (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ticker      text not null,          -- NVDA, PTT ... or '*' for the shared event library
  data        jsonb not null default '{}'::jsonb,   -- {stance, cases:{bull,base,bear}, evidence, rules, map:{nodes, edges}}
  updated_at  timestamptz not null default now(),
  primary key (user_id, ticker)
);
alter table public.theses enable row level security;
drop policy if exists "own theses" on public.theses;
create policy "own theses" on public.theses for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.theses to authenticated;
grant select on public.theses to service_role;
