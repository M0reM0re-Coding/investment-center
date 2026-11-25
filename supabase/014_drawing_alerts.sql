-- 014: alerts on chart drawings (Charts page, round 47)
-- Lets the robot (service role) READ your saved drawings, so it can check the lines you put a bell on.
-- Your drawings stay private: the website still only shows each person their own rows (row-level security is unchanged).
-- Run once in Supabase -> SQL Editor -> paste -> Run. Safe to run again.
grant select on public.chart_drawings to service_role;
