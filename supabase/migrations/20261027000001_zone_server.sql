begin;
-- ROLLBACK: supabase/down/20261027000001_zone_server_down.sql (drops exactly what this file creates).
-- DESIGN MIGRATION, NOT APPLIED ANYWHERE (V3 live zone, phase 3: docs/ZONE-SERVER-DESIGN.md). Nothing in the game calls it yet; do not apply to a live database from this PR.
-- Shared boss health + damage-share credit. Shape: Armagedom 20261024000002_arma_world.sql (the DATABASE holds the creature's hp, so every player sees one bar and one death; the phone only
-- CLAIMS damage; credit is paid from the ledger of APPLIED damage in the same transaction as the death) with V1's zone-as-data keys (origins/server/world-spawns.ts: engage token, touch, layers).
-- Every number is a row of data/zone-server-rules.json, loaded through zone_rules_apply(); this file carries SANITY RANGES only, never a value.
-- RLS on, no policy, no grant for any client role. EVERY function below EXCEPT the admin-only ones (rows file adminOnlyFunctions = zone_rules_apply) is granted to EVERY writer role in the one grant
-- at the end (test/zone-migration.test.mjs parses this file for it).
-- LOCK ORDER (global, one rule, test-pinned): 1. the zone_spawns row (FOR UPDATE), 2. the zone_spawn_engages rows OF THAT SPAWN, 3. the per-account kill-cap advisory lock (zone_settle_kill, accounts in
-- ascending order). Nothing locks an engage row before its spawn, and nothing takes a lock of a lower number while holding a higher one.

-- The server roles. V1 created its own earlier; a fresh project needs these. NOLOGIN: the writer's connection role is granted membership out of band.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'frankendom_zone_writer') then create role frankendom_zone_writer nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'frankendom_zone_verifier') then create role frankendom_zone_verifier nologin; end if;
end $$;

-- One row, written only by zone_rules_apply from data/zone-server-rules.json. No defaults: an unloaded database refuses every call (O0010) rather than guess.
create table public.zone_config (
  id boolean primary key default true check (id),
  token_pattern text not null,
  batch_id_pattern text not null,
  engage_ttl_s int not null check (engage_ttl_s between 30 and 1800),
  max_open int not null check (max_open between 1 and 16),
  max_batch_rows int not null check (max_batch_rows between 1 and 1000),
  max_hits_per_row int not null check (max_hits_per_row between 1 and 200),
  first_hit_allowance_s numeric not null check (first_hit_allowance_s between 0.1 and 10),
  max_elapsed_s numeric not null check (max_elapsed_s between 0.1 and 30),
  dps_slack numeric not null check (dps_slack between 1 and 3),
  max_damage_mult numeric not null check (max_damage_mult between 1 and 100),
  min_share_pct numeric not null check (min_share_pct between 0 and 100),
  floor_equal_share_fraction numeric not null check (floor_equal_share_fraction between 0 and 1),   -- the floor never exceeds this fraction of an equal share (1/N), so a crowd is always paid
  renormalise boolean not null,
  hit_expiry_s int not null check (hit_expiry_s between 1 and 3600),
  kills_per_min int not null check (kills_per_min between 1 and 60),
  kills_per_hour int not null check (kills_per_hour between 1 and 3600),
  cooldown_across_layers boolean not null,
  respawn_min_s int not null check (respawn_min_s between 1 and 3600),
  respawn_max_s int not null check (respawn_max_s between 1 and 604800),
  respawn_default_s int not null check (respawn_default_s between 1 and 604800),
  log_keep_s int not null check (log_keep_s between 60 and 2592000),
  check (respawn_min_s <= respawn_default_s and respawn_default_s <= respawn_max_s)
);
-- Server-held weapon limits, one row per weapon id (base values; the progression ceiling is applied at hit time). The phone never supplies these numbers.
create table public.zone_weapon_rules (
  weapon text primary key check (weapon ~ '^[a-z0-9._:-]{1,64}$'),
  max_damage_per_hit numeric not null check (max_damage_per_hit > 0),
  max_hits_per_s numeric not null check (max_hits_per_s > 0)
);

-- One row per (spawn id, layer): the ONE shared health bar of that boss in that copy of the zone. Zone ids are STRINGS: the instance id carries its zone as the `zN:` prefix, N = 0 or digits with no
-- leading zero; `z01:` does not match and is refused by this constraint, never stored as zone 1 (V1 20261022110000). The pattern is ids.instancePattern of the rows file (a test pins the two equal).
create table public.zone_spawns (
  instance text not null check (instance ~ '^z(0|[1-9][0-9]*):[a-z0-9._-]{1,64}$'),
  layer int not null check (layer >= 1),
  zone text not null generated always as (substring(instance from '^z(0|[1-9][0-9]*):')) stored,
  kind text not null check (kind ~ '^[a-z0-9._:-]{1,64}$'),   -- fixed at the first engage
  max_hp numeric not null check (max_hp > 0),                  -- fixed at the first engage
  respawn_s int not null check (respawn_s > 0),                -- from the zone row's spawn row at the first engage, clamped by the rules; never from a phone's hit
  hp numeric not null check (hp >= 0 and hp <= max_hp),
  alive boolean not null default true,
  generation int not null default 0 check (generation >= 0),   -- one per life; credit is per generation
  respawn_at timestamptz,
  killed_at timestamptz,
  primary key (instance, layer),
  check ((alive and respawn_at is null) or (not alive and hp = 0 and respawn_at is not null))
);
create index zone_spawns_zone on public.zone_spawns (zone, instance);

create table public.zone_spawn_engages (
  token text primary key,
  account uuid not null,
  character text not null,
  instance text not null,
  layer int not null,                      -- the token binds its layer; a hit that names another layer is refused 'moved'
  generation int not null,
  issued_at timestamptz not null default now(),
  last_hit_at timestamptz,
  expires_at timestamptz not null,
  used_at timestamptz,
  result text check (result in ('killed', 'dead', 'expired', 'moved')),
  foreign key (instance, layer) references public.zone_spawns (instance, layer)
);
create unique index zone_spawn_engages_one_open on public.zone_spawn_engages (account, instance, layer) where used_at is null;

-- The HIT LOG: one row per accepted batch row (not per swing), holding APPLIED damage. Credit reads rows newer than hit_expiry_s at the moment of the kill. claimed is kept to spot liars; never paid.
create table public.zone_spawn_hits (
  id bigint generated always as identity primary key,
  instance text not null,
  layer int not null,
  generation int not null,
  account uuid not null,
  character text not null,
  at timestamptz not null default now(),
  applied numeric not null check (applied > 0),
  hits int not null check (hits >= 0),
  claimed numeric not null check (claimed >= 0),
  foreign key (instance, layer) references public.zone_spawns (instance, layer)
);
create index zone_spawn_hits_life on public.zone_spawn_hits (instance, layer, generation, at);

-- The CREDIT, one row per contributor per life, written in the transaction of the death. A reward service reads paid rows; unpaid rows keep the reason. No bonus column exists.
create table public.zone_kill_credit (
  instance text not null,
  layer int not null,
  generation int not null,
  account uuid not null,
  character text not null,
  at timestamptz not null default now(),
  damage numeric not null check (damage >= 0),
  share_pct numeric not null check (share_pct between 0 and 100),   -- the true share of the counted damage
  pay_share numeric not null check (pay_share between 0 and 1),     -- the fraction of the reward this account is paid (0 when unpaid)
  paid boolean not null,
  reason text not null check (reason in ('paid', 'floor', 'cap', 'cooldown')),
  primary key (instance, layer, generation, account),
  foreign key (instance, layer) references public.zone_spawns (instance, layer)
);
create index zone_kill_credit_account on public.zone_kill_credit (account, at desc) where paid;

-- A batch id is spent once. A resend of a batch whose id was seen returns the stored receipt and applies nothing.
create table public.zone_hit_batches (
  batch_id text primary key,
  at timestamptz not null default now(),
  receipt jsonb
);

alter table public.zone_config enable row level security;
alter table public.zone_weapon_rules enable row level security;
alter table public.zone_spawns enable row level security;
alter table public.zone_spawn_engages enable row level security;
alter table public.zone_spawn_hits enable row level security;
alter table public.zone_kill_credit enable row level security;
alter table public.zone_hit_batches enable row level security;
revoke all on public.zone_config, public.zone_weapon_rules, public.zone_spawns, public.zone_spawn_engages, public.zone_spawn_hits, public.zone_kill_credit, public.zone_hit_batches from public, anon, authenticated;

-- The rules, read once per call; refuses when the rows were never loaded.
create function public.zone_cfg() returns public.zone_config language plpgsql stable security definer set search_path = '' as $$
declare cfg public.zone_config;
begin
  select * into cfg from public.zone_config;
  if not found then raise exception 'zone rules not loaded (call zone_rules_apply with data/zone-server-rules.json)' using errcode = 'O0010'; end if;
  return cfg;
end $$;

-- Load data/zone-server-rules.json (the ADMIN / MIGRATION role calls this at deploy with the file's parsed content; NO writer or verifier role may: it rewrites every cap): the ONE way a value
-- reaches the database. Replaces the config and the weapon rows. Its names are the rows file's adminOnlyFunctions; it has a revoke from every role and no grant at the end of this file.
create function public.zone_rules_apply(p_rules jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if coalesce((p_rules #>> '{hit,retryFailedBatch}')::boolean, true) then raise exception 'hit.retryFailedBatch must be false' using errcode = 'O0002'; end if;
  delete from public.zone_config;
  insert into public.zone_config (token_pattern, batch_id_pattern, engage_ttl_s, max_open, max_batch_rows, max_hits_per_row, first_hit_allowance_s, max_elapsed_s, dps_slack, max_damage_mult,
      min_share_pct, floor_equal_share_fraction, renormalise, hit_expiry_s, kills_per_min, kills_per_hour, cooldown_across_layers, respawn_min_s, respawn_max_s, respawn_default_s, log_keep_s)
    values (p_rules #>> '{ids,tokenPattern}', p_rules #>> '{ids,batchIdPattern}', (p_rules #>> '{engage,ttlS}')::int, (p_rules #>> '{engage,maxOpenPerAccount}')::int,
      (p_rules #>> '{hit,maxBatchRows}')::int, (p_rules #>> '{hit,maxHitsPerRow}')::int, (p_rules #>> '{hit,firstHitAllowanceS}')::numeric, (p_rules #>> '{hit,maxElapsedS}')::numeric,
      (p_rules #>> '{hit,dpsSlack}')::numeric, (p_rules #>> '{progression,maxDamageMult}')::numeric, (p_rules #>> '{share,minSharePct}')::numeric, (p_rules #>> '{share,floorEqualShareFraction}')::numeric, (p_rules #>> '{share,renormalise}')::boolean,
      (p_rules #>> '{share,hitExpiryS}')::int, (p_rules #>> '{caps,killsPerMin}')::int, (p_rules #>> '{caps,killsPerHour}')::int, (p_rules #>> '{caps,cooldownAcrossLayers}')::boolean,
      (p_rules #>> '{respawn,minS}')::int, (p_rules #>> '{respawn,maxS}')::int, (p_rules #>> '{respawn,defaultS}')::int, (p_rules #>> '{log,keepS}')::int);
  delete from public.zone_weapon_rules;
  insert into public.zone_weapon_rules (weapon, max_damage_per_hit, max_hits_per_s)
    select w ->> 'id', (w ->> 'maxDamagePerHit')::numeric, (w ->> 'maxHitsPerS')::numeric from jsonb_array_elements(p_rules -> 'weapons') w;
  get diagnostics n = row_count;
  return jsonb_build_object('weapons', n);
end $$;

-- A dead spawn whose respawn time has passed reads as alive again at full hp, next generation. The clock is the database's.
create function public.zone_spawn_view(s public.zone_spawns) returns jsonb language sql stable set search_path = '' as $$
  select case when s.alive or s.respawn_at <= now()
    then jsonb_build_object('instance', s.instance, 'layer', s.layer, 'zone', s.zone, 'kind', s.kind, 'alive', true, 'hp', case when s.alive then s.hp else s.max_hp end, 'maxHp', s.max_hp,
                            'respawnAt', null, 'generation', s.generation + (case when s.alive then 0 else 1 end))
    else jsonb_build_object('instance', s.instance, 'layer', s.layer, 'zone', s.zone, 'kind', s.kind, 'alive', false, 'hp', 0, 'maxHp', s.max_hp, 'respawnAt', s.respawn_at, 'generation', s.generation) end
$$;

-- Read-only: the state of the named instances in one layer and the database clock. This is what every phone in the area draws as THE bar, each tick. Never-engaged spawns are not listed (read as alive, full hp).
create function public.zone_spawn_state(p_instances text[], p_layer int) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('now', now(), 'spawns', coalesce((select jsonb_agg(public.zone_spawn_view(s) order by s.instance) from public.zone_spawns s where s.instance = any(p_instances) and s.layer = p_layer), '[]'::jsonb))
$$;

-- Engage a LIVE spawn, creating its row at the first engage from the zone row the writer derives (kind, max hp and respawn seconds are then FIXED: a later engage that disagrees is refused 'mismatch').
-- One open token per account per spawn per layer; re-engaging the same life returns it.
create function public.zone_spawn_engage(p_account uuid, p_character text, p_token text, p_instance text, p_layer int, p_kind text, p_max_hp numeric, p_respawn_s int) returns jsonb language plpgsql security definer set search_path = '' as $$
declare cfg public.zone_config; s public.zone_spawns; e public.zone_spawn_engages; rs int;
begin
  cfg := public.zone_cfg();
  if p_token !~ cfg.token_pattern then raise exception 'token: shape' using errcode = 'O0002'; end if;
  rs := least(greatest(coalesce(p_respawn_s, cfg.respawn_default_s), cfg.respawn_min_s), cfg.respawn_max_s);
  -- the instance check constraint refuses z01: here, before any row exists
  insert into public.zone_spawns (instance, layer, kind, max_hp, respawn_s, hp) values (p_instance, p_layer, p_kind, p_max_hp, rs, p_max_hp) on conflict (instance, layer) do nothing;
  select * into s from public.zone_spawns where instance = p_instance and layer = p_layer for update;
  if s.kind <> p_kind or s.max_hp <> p_max_hp or s.respawn_s <> rs then return jsonb_build_object('refused', 'mismatch'); end if;
  if not s.alive and s.respawn_at > now() then return jsonb_build_object('refused', 'dead', 'respawnAt', s.respawn_at); end if;
  if not s.alive then update public.zone_spawns set alive = true, hp = max_hp, generation = generation + 1, respawn_at = null, killed_at = null where instance = p_instance and layer = p_layer returning * into s; end if;
  -- lock order step 2: engage rows of THIS spawn only (the spawn row is already locked above); another spawn's tokens are never touched while this spawn is held
  update public.zone_spawn_engages set used_at = now(), result = 'expired' where account = p_account and instance = p_instance and layer = p_layer and used_at is null and expires_at <= now();
  select * into e from public.zone_spawn_engages where account = p_account and instance = p_instance and layer = p_layer and used_at is null;
  if found and e.generation = s.generation then
    update public.zone_spawn_engages set expires_at = now() + make_interval(secs => cfg.engage_ttl_s) where token = e.token returning * into e;
  else
    if found then update public.zone_spawn_engages set used_at = now(), result = 'dead' where token = e.token; end if;
    if (select count(*) from public.zone_spawn_engages where account = p_account and used_at is null and expires_at > now()) >= cfg.max_open then return jsonb_build_object('refused', 'too-many'); end if;
    insert into public.zone_spawn_engages (token, account, character, instance, layer, generation, expires_at) values (p_token, p_account, p_character, p_instance, p_layer, s.generation, now() + make_interval(secs => cfg.engage_ttl_s)) returning * into e;
  end if;
  return jsonb_build_object('token', e.token, 'instance', e.instance, 'layer', e.layer, 'generation', e.generation, 'hp', s.hp, 'maxHp', s.max_hp, 'expiresAt', e.expires_at);
end $$;

-- Keep a token alive without a hit.
create function public.zone_spawn_touch(p_account uuid, p_token text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare cfg public.zone_config; e public.zone_spawn_engages;
begin
  cfg := public.zone_cfg();
  update public.zone_spawn_engages set expires_at = now() + make_interval(secs => cfg.engage_ttl_s) where token = p_token and account = p_account and used_at is null and expires_at > now() returning * into e;
  if not found then raise exception 'engage token unknown, used or expired' using errcode = 'O0009'; end if;
  return jsonb_build_object('expiresAt', e.expires_at);
end $$;

-- Settle a death: credit per LIFE from the hit log, in the transaction of the death. Counted damage = hit-log rows newer than hit_expiry_s (expired hits took hp but earn nothing). A contributor
-- under the EFFECTIVE floor, min(min_share_pct, floor_equal_share_fraction x 100 / N contributors), of the counted damage is not paid ('floor'). The paid split the reward in proportion to damage; renormalise makes their shares sum to 1. No first-hit and no last-hit bonus:
-- nothing here reads order, time of the last blow or who reported. Caps and the cross-layer cooldown record the contributor unpaid with the reason and change nobody else's share.
create function public.zone_settle_kill(p_instance text, p_layer int, p_generation int) returns jsonb language plpgsql security definer set search_path = '' as $$
declare cfg public.zone_config; s public.zone_spawns; total numeric; n int; qtotal numeric; c record; share_pct numeric; pay numeric; why text; out jsonb := '[]'::jsonb;
begin
  cfg := public.zone_cfg();
  select * into s from public.zone_spawns where instance = p_instance and layer = p_layer;
  -- n = contributors with counted damage; total = their counted damage.
  select count(*), coalesce(sum(d), 0) into n, total from (select sum(applied) as d from public.zone_spawn_hits
    where instance = p_instance and layer = p_layer and generation = p_generation and at > now() - make_interval(secs => cfg.hit_expiry_s) group by account) y;
  -- The EFFECTIVE floor = min(min_share_pct, floor_equal_share_fraction x 100 / n) percent of total. Two cross-multiplied comparisons joined by OR are the same as d >= min(..) with no division;
  -- floor_equal_share_fraction <= 1 so an equal share (total / n) always clears it: 21 or 100 equal players are all paid. The model (zone-model.ts settle) uses the identical test.
  select coalesce(sum(d), 0) into qtotal from (select sum(applied) as d from public.zone_spawn_hits
    where instance = p_instance and layer = p_layer and generation = p_generation and at > now() - make_interval(secs => cfg.hit_expiry_s) group by account) x
    where total > 0 and (d * 100 >= cfg.min_share_pct * total or d * 100 * n >= cfg.floor_equal_share_fraction * 100 * total);
  for c in select account, max(character) as character, sum(applied) as damage from public.zone_spawn_hits
      where instance = p_instance and layer = p_layer and generation = p_generation and at > now() - make_interval(secs => cfg.hit_expiry_s) group by account order by account loop
    share_pct := case when total > 0 then round(c.damage * 100 / total, 2) else 0 end;
    pay := 0;
    -- lock order step 3: one advisory lock per account, taken in ascending account order (the loop's order by), held to the end of the transaction, BEFORE this account's caps are counted. A second
    -- kill of the same account on ANOTHER spawn, running at the same time, waits here, then counts with a fresh snapshot (read committed) that includes this kill's credit row: the caps cannot be overshot.
    perform pg_advisory_xact_lock(hashtextextended('zone_kill_cap:' || c.account::text, 0));
    if not (total > 0 and (c.damage * 100 >= cfg.min_share_pct * total or c.damage * 100 * n >= cfg.floor_equal_share_fraction * 100 * total)) then why := 'floor';
    elsif (select count(*) from public.zone_kill_credit where account = c.account and paid and at > now() - interval '1 minute') >= cfg.kills_per_min
       or (select count(*) from public.zone_kill_credit where account = c.account and paid and at > now() - interval '1 hour') >= cfg.kills_per_hour then why := 'cap';
    elsif cfg.cooldown_across_layers and exists (select 1 from public.zone_kill_credit where account = c.account and paid and instance = p_instance and layer <> p_layer and at > now() - make_interval(secs => s.respawn_s)) then why := 'cooldown';
    else why := 'paid'; pay := c.damage / case when cfg.renormalise then qtotal else total end;
    end if;
    insert into public.zone_kill_credit (instance, layer, generation, account, character, damage, share_pct, pay_share, paid, reason)
      values (p_instance, p_layer, p_generation, c.account, c.character, c.damage, share_pct, pay, why = 'paid', why) on conflict (instance, layer, generation, account) do nothing;
    out := out || jsonb_build_array(jsonb_build_object('account', c.account, 'damage', c.damage, 'sharePct', share_pct, 'payShare', pay, 'paid', why = 'paid', 'reason', why));
  end loop;
  return out;
end $$;

-- A hit report. p_claimed is the phone's claimed damage over p_hits swings. The database applies at most:
--   (1) hits x the weapon's max damage per hit (x the progression ceiling), hits limited by the weapon's max hits per second over the REAL time since this token's last accepted report;
--   (2) the weapon's damage-per-second ceiling over that same real time (a long gap banks at most max_elapsed_s);
--   (3) the hp that is left. The spawn row is locked FOR UPDATE, so two accounts' hits serialise onto ONE hp number: one bar, never 100% each.
-- A claimed kill does not exist: the spawn dies only when hp reaches 0, and the same call settles credit.
create function public.zone_spawn_hit(p_account uuid, p_token text, p_weapon text, p_claimed numeric, p_hits int, p_layer int) returns jsonb language plpgsql security definer set search_path = '' as $$
declare cfg public.zone_config; e public.zone_spawn_engages; s public.zone_spawns; w public.zone_weapon_rules; elapsed numeric; hits_ok int; cap numeric; applied numeric; credits jsonb;
begin
  cfg := public.zone_cfg();
  select * into w from public.zone_weapon_rules where weapon = p_weapon;
  if not found then return jsonb_build_object('refused', 'weapon'); end if;
  -- LOCK ORDER (spawn first, then engage rows, the same as zone_spawn_engage): the token is only PEEKED here (no lock) to learn which spawn it belongs to; the spawn row is locked first, then the
  -- token row is locked and read again, because it may have changed while this call waited for the spawn.
  select * into e from public.zone_spawn_engages where token = p_token and account = p_account and used_at is null and expires_at > now();
  if not found then raise exception 'engage token unknown, used or expired' using errcode = 'O0009'; end if;
  if e.layer is distinct from p_layer then return jsonb_build_object('refused', 'moved'); end if;   -- writes nothing; the token stays open until it expires
  select * into s from public.zone_spawns where instance = e.instance and layer = e.layer for update;
  select * into e from public.zone_spawn_engages where token = p_token and account = p_account and used_at is null and expires_at > now() for update;
  if not found then raise exception 'engage token unknown, used or expired' using errcode = 'O0009'; end if;
  if not (s.alive and s.generation = e.generation) then
    update public.zone_spawn_engages set used_at = now(), result = 'dead' where token = p_token;
    return jsonb_build_object('refused', 'dead', 'respawnAt', s.respawn_at);
  end if;
  cap := w.max_damage_per_hit * cfg.max_damage_mult;
  elapsed := least(coalesce(extract(epoch from (now() - e.last_hit_at)), cfg.first_hit_allowance_s), cfg.max_elapsed_s);
  hits_ok := least(greatest(p_hits, 0), cfg.max_hits_per_row, ceil(w.max_hits_per_s * elapsed * cfg.dps_slack)::int);
  applied := least(greatest(coalesce(p_claimed, 0), 0), hits_ok * cap, cap * w.max_hits_per_s * elapsed * cfg.dps_slack, s.hp);
  update public.zone_spawn_engages set last_hit_at = now(), expires_at = now() + make_interval(secs => cfg.engage_ttl_s) where token = p_token;
  if applied > 0 then
    insert into public.zone_spawn_hits (instance, layer, generation, account, character, applied, hits, claimed) values (e.instance, e.layer, e.generation, p_account, e.character, applied, hits_ok, greatest(coalesce(p_claimed, 0), 0));
  end if;
  update public.zone_spawns set hp = hp - applied where instance = e.instance and layer = e.layer returning * into s;
  if s.hp > 0 then return jsonb_build_object('applied', applied, 'hp', s.hp, 'maxHp', s.max_hp, 'killed', false); end if;

  update public.zone_spawns set alive = false, hp = 0, respawn_at = now() + make_interval(secs => s.respawn_s), killed_at = now() where instance = e.instance and layer = e.layer returning * into s;
  update public.zone_spawn_engages set used_at = now(), result = 'killed' where instance = e.instance and layer = e.layer and generation = e.generation and used_at is null;
  credits := public.zone_settle_kill(e.instance, e.layer, e.generation);
  return jsonb_build_object('applied', applied, 'hp', 0, 'maxHp', s.max_hp, 'killed', true, 'respawnAt', s.respawn_at, 'credits', credits);
end $$;

-- One presence tick = one transaction. p_batch is an array of {account, token, weapon, claimed, hits, layer} that PRESENCE has already clamped (reach, rate, weapon); each row still goes through
-- zone_spawn_hit, so the database applies its own ceiling again. A row that fails is reported in its slot and does not stop the others. Rows apply in the order given.
-- NEVER RETRIED (Armagedom server.js:141): a failed batch is dropped by the writer. Second lock: the batch id is spent on first sight, and a resend returns the stored receipt and applies nothing.
create function public.zone_spawn_hit_batch(p_batch_id text, p_batch jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare cfg public.zone_config; item jsonb; out jsonb := '[]'::jsonb; res jsonb; prev jsonb;
begin
  cfg := public.zone_cfg();
  if p_batch_id !~ cfg.batch_id_pattern then raise exception 'batch id: shape' using errcode = 'O0002'; end if;
  if jsonb_typeof(p_batch) <> 'array' or jsonb_array_length(p_batch) > cfg.max_batch_rows then raise exception 'a hit batch is an array of at most % rows', cfg.max_batch_rows using errcode = 'O0002'; end if;
  insert into public.zone_hit_batches (batch_id) values (p_batch_id) on conflict (batch_id) do nothing;
  if not found then
    select receipt into prev from public.zone_hit_batches where batch_id = p_batch_id;
    return jsonb_build_object('replayed', true, 'results', coalesce(prev, '[]'::jsonb));
  end if;
  for item in select * from jsonb_array_elements(p_batch) loop
    begin
      res := public.zone_spawn_hit((item ->> 'account')::uuid, item ->> 'token', item ->> 'weapon', (item ->> 'claimed')::numeric, coalesce((item ->> 'hits')::int, 1), (item ->> 'layer')::int);
    exception when others then
      res := jsonb_build_object('error', sqlstate, 'message', sqlerrm);
    end;
    out := out || jsonb_build_array(jsonb_build_object('token', item ->> 'token') || res);
  end loop;
  update public.zone_hit_batches set receipt = out where batch_id = p_batch_id;
  return jsonb_build_object('replayed', false, 'results', out);
end $$;

-- The phone's kill_report: READ-ONLY and idempotent. It cannot kill (only hp does) and has no min-hits or min-time to check: those V1 rules existed because a phone reported its own kill.
create function public.zone_kill_report(p_account uuid, p_token text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare e public.zone_spawn_engages; s public.zone_spawns; k public.zone_kill_credit;
begin
  select * into e from public.zone_spawn_engages where token = p_token and account = p_account;
  if not found then raise exception 'engage token unknown, used or expired' using errcode = 'O0009'; end if;
  select * into s from public.zone_spawns where instance = e.instance and layer = e.layer;
  select * into k from public.zone_kill_credit where instance = e.instance and layer = e.layer and generation = e.generation and account = p_account;
  if found then return jsonb_build_object('state', 'settled', 'paid', k.paid, 'reason', k.reason, 'sharePct', k.share_pct, 'payShare', k.pay_share); end if;
  if s.alive and s.generation = e.generation then return jsonb_build_object('state', 'alive', 'hp', s.hp, 'maxHp', s.max_hp, 'open', e.used_at is null and e.expires_at > now()); end if;
  return jsonb_build_object('state', 'unpaid', 'reason', coalesce(e.result, 'dead'));
end $$;

-- Housekeeping: drop hit-log rows, closed tokens and spent batch ids older than log_keep_s. The credit rows stay (they are the payment record).
create function public.zone_hit_log_prune() returns jsonb language plpgsql security definer set search_path = '' as $$
declare cfg public.zone_config; a int; b int; c int;
begin
  cfg := public.zone_cfg();
  delete from public.zone_spawn_hits where at < now() - make_interval(secs => cfg.log_keep_s); get diagnostics a = row_count;
  delete from public.zone_spawn_engages where used_at is not null and used_at < now() - make_interval(secs => cfg.log_keep_s); get diagnostics b = row_count;
  delete from public.zone_hit_batches where at < now() - make_interval(secs => cfg.log_keep_s); get diagnostics c = row_count;
  return jsonb_build_object('hits', a, 'engages', b, 'batches', c);
end $$;

revoke all on function public.zone_cfg(), public.zone_rules_apply(jsonb), public.zone_spawn_view(public.zone_spawns), public.zone_spawn_state(text[], int),
  public.zone_spawn_engage(uuid, text, text, text, int, text, numeric, int), public.zone_spawn_touch(uuid, text), public.zone_settle_kill(text, int, int),
  public.zone_spawn_hit(uuid, text, text, numeric, int, int), public.zone_spawn_hit_batch(text, jsonb), public.zone_kill_report(uuid, text), public.zone_hit_log_prune()
  from public, anon, authenticated;
-- zone_rules_apply rewrites every cap and weapon limit: it is ADMIN / MIGRATION only. Revoked from the writer and the verifier explicitly and granted to nobody; the owner (the role that runs
-- migrations) keeps execute as the function owner. The writer's boot does not load rows; the deploy step does.
revoke all on function public.zone_rules_apply(jsonb) from frankendom_zone_writer, frankendom_zone_verifier;
-- TRAP (both donors): every server role that calls a function gets it, in THIS migration. A function granted to one writer role and not the other fails only in production.
grant execute on function public.zone_cfg(), public.zone_spawn_view(public.zone_spawns), public.zone_spawn_state(text[], int),
  public.zone_spawn_engage(uuid, text, text, text, int, text, numeric, int), public.zone_spawn_touch(uuid, text), public.zone_settle_kill(text, int, int),
  public.zone_spawn_hit(uuid, text, text, numeric, int, int), public.zone_spawn_hit_batch(text, jsonb), public.zone_kill_report(uuid, text), public.zone_hit_log_prune()
  to frankendom_zone_writer, frankendom_zone_verifier;
commit;
