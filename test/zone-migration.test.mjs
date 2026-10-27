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

test('TRAP: every new function is granted to EVERY writer role, in this same migration (except the admin-only ones, which are granted to NO role)', () => {
  const grants = statements('grant execute on function');
  assert.ok(grants.length >= 1);
  assert.deepEqual(RULES.adminOnlyFunctions, ['zone_rules_apply']);
  for (const fn of created.filter((f) => !RULES.adminOnlyFunctions.includes(f))) {
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
    const r = revokes.filter((s) => s.includes(`public.${fn}(`) && !RULES.writerRoles.some((role) => s.split(/\bfrom\b/).at(-1).includes(role)));
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

const fnBody = (name) => { const i = SQL.indexOf(`create function public.${name}(`); assert.ok(i >= 0, `${name} exists`); return SQL.slice(i).split(/\n(?:create function|revoke all)/)[0]; };
const before = (text, a, b, msg) => { const i = text.search(a), j = text.search(b); assert.ok(i >= 0, `${msg}: first pattern present`); assert.ok(j >= 0, `${msg}: second pattern present`); assert.ok(i < j, msg); };

test('CROWD FLOOR: the effective floor min(min_share_pct, fraction x 100 / N) is a config column, a rows path and in settle in the same form as the model', () => {
  assert.match(SQL, /floor_equal_share_fraction numeric not null check \(floor_equal_share_fraction between 0 and 1\)/);
  assert.match(SQL, /p_rules #>> '\{share,floorEqualShareFraction\}'/);
  assert.ok(RULES.share.floorEqualShareFraction > 0 && RULES.share.floorEqualShareFraction <= 1, 'a row, at most one equal share');
  const settle = fnBody('zone_settle_kill');
  assert.match(settle, /select count\(\*\), coalesce\(sum\(d\), 0\) into n, total from/, 'N = contributors with counted damage');
  const both = /d \* 100 >= cfg\.min_share_pct \* total or d \* 100 \* n >= cfg\.floor_equal_share_fraction \* 100 \* total/;
  assert.match(settle, both, 'qtotal uses both comparisons');
  assert.match(settle, /c\.damage \* 100 >= cfg\.min_share_pct \* total or c\.damage \* 100 \* n >= cfg\.floor_equal_share_fraction \* 100 \* total/, 'the per-contributor floor uses both comparisons');
});

test('LOCK ORDER: spawn row first, then engage rows (zone_spawn_hit and zone_spawn_engage agree); settle takes its advisory locks last', () => {
  const hit = fnBody('zone_spawn_hit');
  const spawnLock = /from public\.zone_spawns where instance = e\.instance and layer = e\.layer for update/;
  const engageLock = /from public\.zone_spawn_engages where token = p_token[^;]*for update/;
  const engagePeek = /from public\.zone_spawn_engages where token = p_token and account = p_account and used_at is null and expires_at > now\(\);/;
  before(hit, engagePeek, spawnLock, 'hit: the token is only peeked (no lock) before the spawn is locked');
  before(hit, spawnLock, engageLock, 'hit: the spawn is locked before the engage row');
  assert.equal([...hit.matchAll(/zone_spawn_engages[^;]*for update/g)].length, 1, 'hit locks the engage row exactly once, after the spawn');
  assert.doesNotMatch(hit.slice(0, hit.search(spawnLock)), /for update/, 'nothing is locked before the spawn row in the hit');
  const eng = fnBody('zone_spawn_engage');
  before(eng, /from public\.zone_spawns where instance = p_instance and layer = p_layer for update/, /update public\.zone_spawn_engages/, 'engage: the spawn is locked before any engage row is written');
  before(eng, /from public\.zone_spawns where instance = p_instance and layer = p_layer for update/, /insert into public\.zone_spawn_engages/, 'engage: the spawn is locked before an engage row is inserted');
  assert.match(eng, /update public\.zone_spawn_engages set used_at = now\(\), result = 'expired' where account = p_account and instance = p_instance and layer = p_layer and used_at is null and expires_at <= now\(\)/, 'the expiry sweep touches only this spawn\'s tokens');
  assert.doesNotMatch(eng, /update public\.zone_spawn_engages set used_at = now\(\), result = 'expired' where account = p_account and used_at/, 'no account-wide sweep under one spawn lock');
  const settle = fnBody('zone_settle_kill');
  assert.match(settle, /group by account order by account loop/, 'accounts are visited in ascending order');
  assert.doesNotMatch(settle, /for update/, 'settle takes no row lock; the spawn row is already held by the caller');
  assert.match(RAW, /LOCK ORDER \(global/, 'the order is documented in the migration');
});

test('KILL CAPS are serialised across spawns: a per-account advisory lock is taken before the caps are counted', () => {
  const settle = fnBody('zone_settle_kill');
  assert.match(settle, /perform pg_advisory_xact_lock\(hashtextextended\('zone_kill_cap:' \|\| c\.account::text, 0\)\)/);
  const loop = settle.slice(settle.search(/ loop\n/));
  before(loop, /pg_advisory_xact_lock/, /cfg\.kills_per_min/, 'the lock is taken before the per-minute count');
  before(loop, /pg_advisory_xact_lock/, /cfg\.kills_per_hour/, 'the lock is taken before the per-hour count');
  before(loop, /pg_advisory_xact_lock/, /insert into public\.zone_kill_credit/, 'the lock is held until the credit row exists (xact-scoped, released at commit)');
  assert.doesNotMatch(settle, /pg_advisory_lock\(/, 'only the transaction-scoped form: a session lock could leak past the death');
});

test('zone_rules_apply is ADMIN ONLY: granted to no role, revoked from public, anon, authenticated, the writer and the verifier', () => {
  assert.deepEqual(RULES.adminOnlyFunctions, ['zone_rules_apply']);
  for (const fn of RULES.adminOnlyFunctions) {
    for (const g of statements('grant execute on function')) assert.ok(!g.includes(`public.${fn}(`), `${fn} is in no grant`);
    const to = statements('revoke all on function').filter((s) => s.includes(`public.${fn}(`)).map((s) => s.split(/\bfrom\b/).at(-1)).join(' ');
    for (const role of ['public', 'anon', 'authenticated', ...RULES.writerRoles]) assert.match(to, new RegExp(`\\b${role}\\b`), `${fn} revoked from ${role}`);
  }
  assert.ok(RULES.writerRoles.includes('frankendom_zone_verifier'), 'the verifier is one of the roles it is kept from');
  for (const fn of created.filter((f) => !RULES.adminOnlyFunctions.includes(f))) assert.match(statements('grant execute on function').join(' '), new RegExp(`public\\.${fn}\\(`), `${fn} is still granted to the writers`);
});

test('the engage function refuses a spawn whose kind, max hp or respawn seconds differ from its first engage ("mismatch")', () => {
  const eng = fnBody('zone_spawn_engage');
  assert.match(eng, /if s\.kind <> p_kind or s\.max_hp <> p_max_hp or s\.respawn_s <> rs then return jsonb_build_object\('refused', 'mismatch'\); end if;/);
  before(eng, /for update/, /'mismatch'/, 'the check reads the locked spawn row');
  before(eng, /'mismatch'/, /'dead'/, 'the check runs before the dead and token logic');
  before(eng, /'mismatch'/, /insert into public\.zone_spawn_engages/, 'a mismatching engage never mints a token');
  assert.ok(RULES.refusals.some((r) => r.id === 'mismatch'), 'the refusal label is a row');
  assert.match(eng, /on conflict \(instance, layer\) do nothing/, 'the first engage creates the spawn and later ones never overwrite it');
});

test('no key, token or secret is in the files', () => {
  for (const text of [RAW, DOWN, JSON.stringify(RULES)]) assert.doesNotMatch(text, /(eyJ[A-Za-z0-9_-]{20,}|sk_live|service_role|password\s*=)/i);
});
