-- Investment Center: database setup (M3)
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Safe to run more than once.

-- 1. STORIES: one row per news event, written by the robot -----------------
create table if not exists public.stories (
  id            uuid primary key default gen_random_uuid(),
  event         text not null unique,          -- Gemini's event label, stops repeats
  headline      text not null,
  summary       jsonb not null default '[]',   -- list of fact bullets
  what_it_means text,
  winners       jsonb not null default '[]',
  losers        jsonb not null default '[]',
  watch_next    text,
  impact_score  int check (impact_score between 1 and 10),
  impact_reason text,
  impact_parts  jsonb,                         -- reach / surprise / size / timing
  sentiment     text,
  tickers       text[] not null default '{}',
  topics        text[] not null default '{}',
  outlets       text[] not null default '{}',
  n_sources     int not null default 1,
  links         jsonb not null default '[]',   -- [{outlet, title, link}]
  rule_score    int,
  image_url     text,                          -- publisher's picture (linked, not copied)
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  alerted_at    timestamptz                    -- set when a Telegram alert was sent
);
create index if not exists stories_published_idx on public.stories (published_at desc);
create index if not exists stories_impact_idx on public.stories (impact_score desc);

-- 2. SEEN LINKS: lets the robot analyse only NEW articles (saves free-tier quota)
create table if not exists public.seen_links (
  link       text primary key,
  story_id   uuid references public.stories(id) on delete set null,
  first_seen timestamptz not null default now()
);

-- 3. ROBOT USAGE: daily Gemini call counter (the robot has no disk on GitHub)
create table if not exists public.robot_usage (
  day          date primary key,
  gemini_calls int not null default 0,
  alerts_sent  int not null default 0
);

-- 4. YOUR SETTINGS: topics + watchlist picked on the website ------------------
create table if not exists public.user_settings (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  topics     text[] not null default '{"SET / Thai market","Thai economy & BOT","Global macro & Fed","Big 4 / audit / IFRS","AI in finance"}',
  watchlist  text[] not null default '{"NVDA","AAPL","PTT","KBANK","CPALL"}',
  updated_at timestamptz not null default now()
);

-- 5. RATINGS: Want / No want ---------------------------------------------------
create table if not exists public.ratings (
  user_id    uuid not null references auth.users(id) on delete cascade,
  story_id   uuid not null references public.stories(id) on delete cascade,
  rating     text not null check (rating in ('want', 'no')),
  created_at timestamptz not null default now(),
  primary key (user_id, story_id)
);

-- 6. SAVED: save for later ----------------------------------------------------
create table if not exists public.saved (
  user_id    uuid not null references auth.users(id) on delete cascade,
  story_id   uuid not null references public.stories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, story_id)
);

-- SECURITY: Row Level Security on every table ---------------------------------
-- With RLS on and no matching rule, nobody can read or write (except the robot's secret key).
alter table public.stories       enable row level security;
alter table public.seen_links    enable row level security;
alter table public.robot_usage   enable row level security;
alter table public.user_settings enable row level security;
alter table public.ratings       enable row level security;
alter table public.saved         enable row level security;

-- Stories: logged-in users can READ. Only the robot writes. Logged-out visitors see nothing.
drop policy if exists "logged-in can read stories" on public.stories;
create policy "logged-in can read stories" on public.stories
  for select to authenticated using (true);

-- Your own settings / ratings / saved: only YOU can read or change YOUR rows.
drop policy if exists "own settings" on public.user_settings;
create policy "own settings" on public.user_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own ratings" on public.ratings;
create policy "own ratings" on public.ratings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own saved" on public.saved;
create policy "own saved" on public.saved
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- seen_links and robot_usage: no rules = only the robot (secret key) can touch them.

-- Table access for the API roles (RLS above still decides which ROWS)
revoke all on public.stories, public.seen_links, public.robot_usage,
              public.user_settings, public.ratings, public.saved from anon;
grant select on public.stories to authenticated;
grant select, insert, update, delete on public.user_settings, public.ratings, public.saved to authenticated;
grant all on public.stories, public.seen_links, public.robot_usage,
             public.user_settings, public.ratings, public.saved to service_role;
