-- Investment Center: add a picture column to stories (run once in Supabase -> SQL Editor)
alter table public.stories add column if not exists image_url text;
