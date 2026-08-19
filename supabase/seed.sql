-- Development-only seed. Reference data (rules, ranks, 9-day campaign, exercises) lives in migrations so
-- every environment has it. There is intentionally NO fake user, fake leaderboard row, or demo account here:
-- the mobile app's local demo mode is simulated on-device and never touches this database.
insert into public.app_config (key, value) values ('environment', '"development"') on conflict (key) do nothing;
