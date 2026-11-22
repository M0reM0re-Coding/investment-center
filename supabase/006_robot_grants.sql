-- 006: let the robot (service_role) save calendar dates.
-- 005 gave the website (authenticated) access, but this project does not give service_role
-- access to new tables automatically, so the robot got "permission denied" on public.events.
grant select, insert, update, delete on public.events to service_role;
grant usage, select on all sequences in schema public to service_role;
