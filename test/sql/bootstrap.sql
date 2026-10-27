-- Test-only bootstrap for the zone-sql CI job (never applied anywhere else). A plain Postgres has none of the roles Supabase provides, and the migration REVOKEs from
-- anon / authenticated, so they must exist. They are created here as plain NOLOGIN roles; the real Supabase role set (service_role, supabase_admin, ...) is NOT reproduced.
-- The two writer roles are NOT created here: the migration creates them (that is part of what the job proves).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  -- zone_admin stands for an ordinary non-writer role (a deploy role that is not the function owner): it exists to prove such a role cannot call the admin function either.
  -- The connecting superuser plays the migration owner (the function owner).
  if not exists (select 1 from pg_roles where rolname = 'zone_admin') then create role zone_admin nologin; end if;
end $$;

-- TEST-ONLY CLOCK. The migration's functions read the database clock (now()) and take no `now` parameter, and production code must not grow one for a test. So the test moves the DATA instead:
-- zt.advance(ms) is called at the start of a test transaction and shifts every stored timestamp so that, relative to this transaction's now(), the state looks exactly `ms` older than it did
-- relative to the previous test transaction's now(). A test therefore runs on a virtual clock (virtual ms since the scenario started) that the JS model is given too, and the real elapsed
-- time between two statements (a few ms) never leaks in. Only tables the migration creates are touched, only timestamp columns, and only by the superuser test connection.
create schema if not exists zt;
create table if not exists zt.clock (id boolean primary key default true check (id), prev timestamptz not null);
create or replace function zt.advance(p_ms bigint) returns void language plpgsql as $$
declare d interval;
begin
  insert into zt.clock (prev) values (now()) on conflict (id) do nothing;
  d := (now() - (select prev from zt.clock)) - make_interval(secs => p_ms / 1000.0);
  update public.zone_spawns set respawn_at = respawn_at + d, killed_at = killed_at + d;
  update public.zone_spawn_engages set issued_at = issued_at + d, last_hit_at = last_hit_at + d, expires_at = expires_at + d, used_at = used_at + d;
  update public.zone_spawn_hits set at = at + d;
  update public.zone_kill_credit set at = at + d;
  update public.zone_hit_batches set at = at + d;
  update zt.clock set prev = now();
end $$;
