-- Rollback of 20261027000001_zone_server.sql: drops exactly what it created (functions first, then tables). The two roles are left in place (they may own other grants).
begin;
drop function if exists public.zone_cfg(), public.zone_rules_apply(jsonb), public.zone_spawn_view(public.zone_spawns), public.zone_spawn_state(text[], int),
  public.zone_spawn_engage(uuid, text, text, text, int, text, numeric, int), public.zone_spawn_touch(uuid, text), public.zone_settle_kill(text, int, int),
  public.zone_spawn_hit(uuid, text, text, numeric, int, int), public.zone_spawn_hit_batch(text, jsonb), public.zone_kill_report(uuid, text), public.zone_hit_log_prune();
drop table if exists public.zone_hit_batches, public.zone_kill_credit, public.zone_spawn_hits, public.zone_spawn_engages, public.zone_spawns, public.zone_weapon_rules, public.zone_config;
commit;
