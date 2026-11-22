-- Investment Center: reading status, notes, mutes, events, photos, price reaction
-- Run once in Supabase > SQL Editor. Safe to run more than once.

-- 1. Your reading status per story: seen (opened), done (ticked) or later
create table if not exists public.story_status (
  user_id    uuid not null references auth.users(id) on delete cascade,
  story_id   uuid not null references public.stories(id) on delete cascade,
  status     text not null check (status in ('seen', 'done', 'later')),
  updated_at timestamptz not null default now(),
  primary key (user_id, story_id)
);
alter table public.story_status enable row level security;
drop policy if exists "own status" on public.story_status;
create policy "own status" on public.story_status
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 2. Your one-line takeaway on a story
create table if not exists public.story_notes (
  user_id    uuid not null references auth.users(id) on delete cascade,
  story_id   uuid not null references public.stories(id) on delete cascade,
  note       text not null check (length(note) <= 1000),
  updated_at timestamptz not null default now(),
  primary key (user_id, story_id)
);
alter table public.story_notes enable row level security;
drop policy if exists "own notes" on public.story_notes;
create policy "own notes" on public.story_notes
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 3. Settings: last visit (for NEW dots + "since you were away") and "show less" mutes
alter table public.user_settings
  add column if not exists last_visit_at timestamptz,
  add column if not exists prev_visit_at timestamptz,
  add column if not exists muted_topics  text[] not null default '{}',
  add column if not exists muted_sources text[] not null default '{}';

-- 4. Stories: photo credit (Pexels), stock prices when the story was added, dated events it mentions
alter table public.stories
  add column if not exists image_credit text,
  add column if not exists prices_at    jsonb not null default '{}'::jsonb,
  add column if not exists upcoming     jsonb not null default '[]'::jsonb;

-- 5. Upcoming events: earnings / ex-dividend dates (Yahoo) and dated events from the news (AI)
create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  day        date not null,
  title      text not null,
  kind       text not null check (kind in ('earnings', 'dividend', 'news')),
  ticker     text,
  story_id   uuid references public.stories(id) on delete set null,
  estimate   boolean not null default false,
  created_at timestamptz not null default now(),
  unique (day, title)
);
create index if not exists events_day_idx on public.events (day);
alter table public.events enable row level security;
drop policy if exists "logged-in can read events" on public.events;
create policy "logged-in can read events" on public.events for select to authenticated using (true);

grant select, insert, update, delete on public.story_status, public.story_notes to authenticated;
grant select on public.events to authenticated;
revoke all on public.story_status, public.story_notes, public.events from anon;
