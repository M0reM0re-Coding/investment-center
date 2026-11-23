-- 009: World Brief extras + Developing + map situations.
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run. Safe to run more than once.
-- (Parts 1-2 are also at the end of 008_world.sql; running them twice changes nothing.)

-- 1. World story extras (design round 21): Thailand & your stocks, map country, term explainer
alter table public.world_stories
  add column if not exists thailand text,                         -- one line: what it could mean for Thailand / your stocks
  add column if not exists stocks   text[] not null default '{}',  -- your watchlist stocks it touches
  add column if not exists country  text,                         -- where it happens (map pin); 'Global' if many places
  add column if not exists terms    jsonb not null default '[]';   -- [{term, explain}] for the hover explainer

-- 2. Developing (World Brief AND My News): how coverage grew over time (no AI needed)
alter table public.world_stories
  add column if not exists growth   jsonb not null default '[]',   -- [{"t": time, "n": outlets}]
  add column if not exists timeline jsonb not null default '[]';   -- [{"t": time, "text": new headline}]
alter table public.stories
  add column if not exists growth   jsonb not null default '[]',
  add column if not exists timeline jsonb not null default '[]';

-- 3. Map situations (design rounds 22-24): who did what to whom, in plain words
-- {"kind": "strike", "from": "Russia", "to": "Poland", "say": "Russia's missiles hit Poland"}
-- one-place kinds use "at" instead of from/to; a summit also has "many": [countries]
alter table public.world_stories
  add column if not exists situation jsonb;
