-- 010 (2026-11-24): robot upkeep. Run once in Supabase -> SQL Editor. Safe to run twice.
--
-- 1. robot_flags: AI models whose free DAILY limit is used up, and until when.
--    The robot skips them until Google resets the limits (15:00 Bangkok), instead of re-trying them every run.
create table if not exists public.robot_flags (
  model  text primary key,
  until  timestamptz not null,
  why    text
);
alter table public.robot_flags enable row level security;   -- no rules = only the robot (secret key) can touch it
revoke all on public.robot_flags from anon, authenticated;
grant select, insert, update, delete on public.robot_flags to service_role;

-- 2. 90-day cleanup: the robot deletes stories older than 90 days, but KEEPS the ones you saved,
--    wrote a note on, or put on "Later" (and World stories you voted on, since votes shape your ranking).
--    To know which ones to keep, it needs to read (only) these tables:
grant select on public.story_notes, public.story_status to service_role;
-- Deleting a story also removes its read/done marks (on delete cascade); allow that for the robot too.
grant delete on public.story_status, public.story_notes to service_role;
