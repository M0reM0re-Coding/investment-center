-- 008: World Brief (page 2).
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run. Safe to run more than once.
-- World stories get their OWN table, so My News (stories, alerts, search, morning brief) is never mixed up with them.

-- 1. WORLD STORIES: one row per world event, written by the robot ------------
create table if not exists public.world_stories (
  id            uuid primary key default gen_random_uuid(),
  event         text not null unique,          -- AI event label, stops repeats
  headline      text not null,
  summary       jsonb not null default '[]',   -- 2-3 fact bullets ("what happened")
  why_matters   text,                          -- one short "why it matters" line (kept apart from the facts)
  region        text,                          -- Europe / Americas / Middle East / Asia / Africa / Global
  category      text,                          -- Politics / Conflict / Climate / Economy / Science & tech / Health / Society
  outlets       text[] not null default '{}',
  n_sources     int not null default 1,
  coverage      jsonb not null default '{}',   -- outlets per region of the OUTLET, e.g. {"Europe":8,"Asia":1} (the "who covers it" bar)
  links         jsonb not null default '[]',   -- [{outlet, title, link}]
  image_url     text,
  image_credit  text,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists world_stories_published_idx on public.world_stories (published_at desc);

-- 2. WORLD VOTES: your Want / No want ------------------------------------------
create table if not exists public.world_votes (
  user_id    uuid not null references auth.users(id) on delete cascade,
  story_id   uuid not null references public.world_stories(id) on delete cascade,
  vote       smallint not null check (vote in (1, -1)),   -- 1 = Want, -1 = No want
  region     text,                                        -- copied from the story, so your taste survives
  category   text,                                        --   even after old stories are cleaned up
  created_at timestamptz not null default now(),
  primary key (user_id, story_id)
);

-- SECURITY (same rules as My News) --------------------------------------------
alter table public.world_stories enable row level security;
alter table public.world_votes   enable row level security;

drop policy if exists "logged-in can read world" on public.world_stories;
create policy "logged-in can read world" on public.world_stories
  for select to authenticated using (true);

drop policy if exists "own world votes" on public.world_votes;
create policy "own world votes" on public.world_votes
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.world_stories, public.world_votes from anon;
grant select on public.world_stories to authenticated;
grant select, insert, update, delete on public.world_votes to authenticated;
-- The robot needs an explicit grant on new tables (lesson from 006)
grant select, insert, update, delete on public.world_stories, public.world_votes to service_role;

-- 3. WORLD READ STATUS: seen (opened) / done (you pressed ✓) ------------------
create table if not exists public.world_status (
  user_id    uuid not null references auth.users(id) on delete cascade,
  story_id   uuid not null references public.world_stories(id) on delete cascade,
  status     text not null check (status in ('seen', 'done')),
  updated_at timestamptz not null default now(),
  primary key (user_id, story_id)
);
alter table public.world_status enable row level security;
drop policy if exists "own world status" on public.world_status;
create policy "own world status" on public.world_status
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.world_status from anon;
grant select, insert, update, delete on public.world_status to authenticated;
grant select, insert, update, delete on public.world_status to service_role;

-- 4. MY NEWS: which market-hours badges to show (SET open / NYSE closed ...) ---
alter table public.user_settings add column if not exists markets text[] not null default '{SET,NYSE}';

-- 5. WORLD EXTRAS (design round 21): Thailand & your stocks, map country, term explainer -----
alter table public.world_stories
  add column if not exists thailand text,                      -- one line: what it could mean for Thailand / your stocks
  add column if not exists stocks   text[] not null default '{}', -- your watchlist stocks it touches
  add column if not exists country  text,                      -- where it happens (for the map); 'Global' if many places
  add column if not exists terms    jsonb not null default '[]';  -- [{term, explain}] for the hover explainer

-- 6. DEVELOPING (World Brief AND My News): how coverage grew over time, no AI needed -------
-- growth:   [{"t": time, "n": outlets}]   one point each time the robot finds more outlets
-- timeline: [{"t": time, "text": headline}] a new angle on the story (max 8)
alter table public.world_stories
  add column if not exists growth   jsonb not null default '[]',
  add column if not exists timeline jsonb not null default '[]';
alter table public.stories
  add column if not exists growth   jsonb not null default '[]',
  add column if not exists timeline jsonb not null default '[]';
