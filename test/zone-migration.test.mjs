// The zone server migration is parsed, not run (no database here): the rules both donors learned the hard way are checked on the SQL text.
// supabase/migrations/20261027000001_zone_server.sql, supabase/down/..., data/zone-server-rules.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const RULES = JSON.parse(read('data/zone-server-rules.json'));
const RAW = read('supabase/migrations/20261027000001_zone_server.sql');
const DOWN = read('supabase/down/20261027000001_zone_server_down.sql');
const strip = (sql) => sql.replace(/--[^\n]*/g, '');   // comments may say "bonus"; code may not
const SQL = strip(RAW);
const created = [...SQL.matchAll(/create (?:or replace )?function public\.([a-z_]+)\(/g)].map((m) => m[1]);
const tables = [...SQL.matchAll(/create table public\.([a-z_]+)/g)].map((m) => m[1]);
const statements = (kind) => [...SQL.matchAll(new RegExp(`${kind}[^;]*;`, 'g'))].map((m) => m[0]);

test('the migration creates the functions the design names', () => {
  assert.deepEqual(created.sort(), ['zone_cfg', 'zone_hit_log_prune', 'zone_kill_report', 'zone_rules_apply', 'zone_settle_kill', 'zone_spawn_engage', 'zone_spawn_hit', 'zone_spawn_hit_batch', 'zone_spawn_state', 'zone_spawn_touch', 'zone_spawn_view']);
});

test('TRAP: every new function is granted to EVERY writer role, in this same migration', () => {
  const grants = statements('grant execute on function');
  assert.ok(grants.length >= 1);
  for (const fn of created) {
    const g = grants.filter((s) => s.includes(`public.${fn}(`));
    assert.equal(g.length, 1, `${fn} has exactly one grant`);
    const to = g[0].split(/\bto\b/).at(-1);
    for (const role of RULES.writerRoles) assert.match(to, new RegExp(`\\b${role}\\b`), `${fn} granted to ${role}`);
  }
});

test('the writer roles in the rows file are created by the migration, and only those are granted to', () => {
  for (const role of RULES.writerRoles) assert.match(SQL, new RegExp(`create role ${role} nologin`));
  const named = new Set(statements('grant execute on function').flatMap((s) => s.split(/\bto\b/).at(-1).replace(';', '').split(',').map((x) => x.trim())));
  assert.deepEqual([...named].sort(), [...RULES.writerRoles].sort());
});

test('every function is revoked from public, anon and authenticated; no table is granted to a client role', () => {
  const revokes = statements('revoke all on function');
  for (const fn of created) {
    const r = revokes.filter((s) => s.includes(`public.${fn}(`));
    assert.equal(r.length, 1, `${fn} is revoked`);
    for (const role of ['public', 'anon', 'authenticated']) assert.match(r[0].split(/\bfrom\b/).at(-1), new RegExp(`\\b${role}\\b`));
  }
  assert.doesNotMatch(SQL, /grant\s+(select|insert|update|delete|all)[^;]*\bto\s+[^;]*\b(anon|authenticated|public)\b/i);
});

test('every table has row level security on and no policy', () => {
  assert.ok(tables.length >= 7);
  for (const t of tables) assert.match(SQL, new RegExp(`alter table public\\.${t} enable row level security`), `${t} has RLS`);
  assert.doesNotMatch(SQL, /create policy/i);
});

test('every function is security definer with an empty search_path, except the pure view', () => {
  for (const fn of created) {
    const body = SQL.slice(SQL.indexOf(`create function public.${fn}(`)).split(/\n(?:create function|revoke all)/)[0];
    assert.match(body, /set search_path = ''/, `${fn} pins search_path`);
    if (fn !== 'zone_spawn_view') assert.match(body, /security definer/, `${fn} is security definer`);
  }
});

test('TRAP: zone ids are strings and z01: is refused by the stored pattern, which equals the rows file', () => {
  const m = /instance text not null check \(instance ~ '([^']+)'\)/.exec(SQL);
  assert.ok(m, 'zone_spawns carries an instance check');
  assert.equal(m[1], RULES.ids.instancePattern);
  const re = new RegExp(m[1]);
  assert.equal(re.test('z01:minotaur'), false);
  assert.equal(re.test('z0:rat'), true);
  assert.equal(re.test('z1:minotaur'), true);
  assert.match(SQL, /zone text not null generated always as \(substring\(instance from '\^z\(0\|\[1-9\]\[0-9\]\*\):'\)\) stored/);
  assert.doesNotMatch(SQL, /coalesce\(substring\(instance/, 'no fallback to zone 1 for a key that does not parse');
  assert.doesNotMatch(SQL, /\bzone\s+(int|integer|bigint|smallint)\b/i, 'a zone id is never a number column');
});

test('every rows-file path the loader reads exists in data/zone-server-rules.json', () => {
  const paths = [...SQL.matchAll(/p_rules #>> '\{([^}]+)\}'/g)].map((m) => m[1].split(','));
  assert.ok(paths.length >= 18);
  for (const p of paths) {
    const v = p.reduce((o, k) => o?.[k], RULES);
    assert.notEqual(v, undefined, `rows file has ${p.join('.')}`);
  }
  assert.match(SQL, /p_rules -> 'weapons'/);
});

test('every config column is loaded from a row (no value lives in the SQL)', () => {
  const cols = /create table public\.zone_config \(([\s\S]*?)\n\);/.exec(SQL)[1];
  assert.doesNotMatch(cols, /\bdefault\b(?! true check)/, 'zone_config columns carry no default');
  const insertCols = /insert into public\.zone_config \(([^)]*)\)/.exec(SQL)[1].split(',').map((s) => s.trim());
  const defined = [...cols.matchAll(/^\s{2}([a-z_]+) (?:text|int|numeric|boolean)/gm)].map((m) => m[1]).filter((c) => c !== 'id');
  assert.deepEqual(insertCols.sort(), defined.sort());
});

test('TRAP: no bonus anywhere in the code, and a failed batch is never retried (the id is spent, the row is pinned)', () => {
  assert.doesNotMatch(SQL, /bonus/i);
  assert.equal(RULES.hit.retryFailedBatch, false);
  assert.match(SQL, /hit\.retryFailedBatch must be false/);
  assert.match(SQL, /insert into public\.zone_hit_batches \(batch_id\) values \(p_batch_id\) on conflict \(batch_id\) do nothing/);
  assert.match(SQL, /'replayed', true/);
  assert.match(RAW, /NEVER RETRIED/);
});

test('shared hp is single-sourced in SQL: the spawn row is locked for update and hp is subtracted in place', () => {
  const hit = SQL.slice(SQL.indexOf('create function public.zone_spawn_hit('), SQL.indexOf('create function public.zone_spawn_hit_batch('));
  assert.match(hit, /from public\.zone_spawns where instance = e\.instance and layer = e\.layer for update/);
  assert.match(hit, /update public\.zone_spawns set hp = hp - applied/);
  assert.match(hit, /least\([^;]*s\.hp\)/, 'applied is capped at the hp left');
  assert.match(hit, /respawn_at = now\(\) \+ make_interval\(secs => s\.respawn_s\)/);
  assert.match(hit, /zone_settle_kill/, 'credit is settled in the transaction of the death');
  assert.doesNotMatch(hit, /p_respawn/, 'respawn seconds never come from a hit');
  assert.match(SQL, /check \(\(alive and respawn_at is null\) or \(not alive and hp = 0 and respawn_at is not null\)\)/);
});

test('credit in SQL: per generation, hit expiry from the config, floor and renormalise from the config, idempotent per contributor', () => {
  const settle = SQL.slice(SQL.indexOf('create function public.zone_settle_kill('), SQL.indexOf('create function public.zone_spawn_hit('));
  assert.match(settle, /generation = p_generation/);
  assert.match(settle, /cfg\.hit_expiry_s/);
  assert.match(settle, /cfg\.min_share_pct \* total/);
  assert.match(settle, /cfg\.renormalise/);
  assert.match(settle, /cfg\.kills_per_min/);
  assert.match(settle, /cfg\.kills_per_hour/);
  assert.match(settle, /on conflict \(instance, layer, generation, account\) do nothing/);
  assert.doesNotMatch(settle, /order by at|killed_at|last_hit/, 'nothing about who struck last');
});

test('the rollback drops every table and function the migration creates', () => {
  for (const fn of created) assert.match(DOWN, new RegExp(`public\\.${fn}\\(`), `${fn} is dropped`);
  for (const t of tables) assert.match(DOWN, new RegExp(`public\\.${t}\\b`), `${t} is dropped`);
});

test('no key, token or secret is in the files', () => {
  for (const text of [RAW, DOWN, JSON.stringify(RULES)]) assert.doesNotMatch(text, /(eyJ[A-Za-z0-9_-]{20,}|sk_live|service_role|password\s*=)/i);
});
