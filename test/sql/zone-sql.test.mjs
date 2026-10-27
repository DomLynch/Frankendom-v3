// The zone server SQL, EXECUTED (supabase/migrations/20261027000001_zone_server.sql) and compared with its JS twin (src/server-model/zone-model.ts).
// Runs only where ZONE_SQL_URL points at a THROWAWAY Postgres that already has test/sql/bootstrap.sql and the migration applied (the `zone-sql` CI job does that). Without the variable every test
// is skipped, so `npm test` on a laptop or in the `test` job is unchanged. This file never reads a real project's settings and never connects anywhere but ZONE_SQL_URL.
//
// TIME: the SQL takes no `now` parameter (it reads the database clock). Production code is not changed for a test; instead test/sql/bootstrap.sql adds zt.advance(ms), which shifts the STORED
// timestamps so now() reads as the scenario's virtual clock. Every SQL call and its model twin get the same virtual ms.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { parseRules, newWorld, engage, touch, hit, hitBatch, killReport, view, prune, ModelError } from '../../src/server-model/zone-model.ts';

const URL_ = process.env.ZONE_SQL_URL;
const skip = URL_ ? false : 'ZONE_SQL_URL not set (the zone-sql CI job sets it)';
const RAW = JSON.parse(readFileSync(new URL('../../data/zone-server-rules.json', import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const R = parseRules(clone(RAW));
const WRITER = R.writerRoles[0], VERIFIER = R.writerRoles[1];
const uid = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const A = uid(0xa), B = uid(0xb), C = uid(0xc);
const tok = (account, n = 0) => `tok-${account.slice(-4)}-${n}-aaaaaaaaaaaaaaaa`;
const inst = 'z1:minotaur';

let admin;   // the superuser connection (plays the migration owner and the test clock)
const connect = async () => { const c = new pg.Client({ connectionString: URL_ }); await c.connect(); await c.query("set deadlock_timeout = '300ms'"); return c; };
before(async () => { if (skip) return; admin = await connect(); });
after(async () => { if (admin) await admin.end(); });

const load = async (rules = RAW) => { await admin.query('select public.zone_rules_apply($1::jsonb)', [JSON.stringify(rules)]); };
const reset = async (rules = RAW) => {
  await admin.query('truncate public.zone_hit_batches, public.zone_kill_credit, public.zone_spawn_hits, public.zone_spawn_engages, public.zone_spawns');
  await admin.query('delete from zt.clock');
  await load(rules);
};

// ---- the pair: every call goes to the SQL (as the writer role, one transaction) and to the model with the same virtual ms, and the two answers must be equal ----
const round = (x) => (typeof x === 'number' ? Number(x.toPrecision(12)) : x);
const ts = (s, nowS, T) => T + (Date.parse(s.replace(/(\.\d{3})\d*/, '$1')) - Date.parse(nowS.replace(/(\.\d{3})\d*/, '$1')));
// SQL answer -> the model's vocabulary. Timestamps become virtual ms; numerics become numbers; credits keep the six fields the model also has.
const fromSql = (x, T, nowS) => {
  if (Array.isArray(x)) return x.map((y) => fromSql(y, T, nowS));
  if (x && typeof x === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(x)) {
      if ((k === 'expiresAt' || k === 'respawnAt') && typeof v === 'string') o[`${k}Ms`] = ts(v, nowS, T);
      else if (k === 'respawnAt' && v === null) o.respawnAtMs = null;
      else o[k] = fromSql(v, T, nowS);
    }
    return o;
  }
  return round(x);
};
const noTs = (x) => JSON.parse(JSON.stringify(x, (k, v) => (k.endsWith('Ms') ? undefined : v)));
const canonCredit =(c) => ({ account: c.account, damage: round(c.damage), sharePct: round(c.sharePct), payShare: round(c.payShare), paid: c.paid, reason: c.reason });
const canon = (x) => {
  if (Array.isArray(x)) return x.map(canon);
  if (x && typeof x === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(x)) {
      if (k === 'credits') o.credits = v.map(canonCredit);
      else if (k === 'paid' && typeof v === 'number') continue;   // the model's top-level paid COUNT has no SQL twin
      else o[k] = canon(v);
    }
    return o;
  }
  return round(x);
};

class Pair {
  constructor(rules = R) { this.w = newWorld(rules); this.T = 0; }
  // One SQL call in one transaction as `role` at virtual time t; resolves to {ok: answer} or {err: sqlstate}.
  async sql(t, text, params, role = WRITER) {
    const c = admin;
    await c.query('begin');
    try {
      await c.query('select zt.advance($1)', [t - this.T]); this.T = t;
      await c.query(`set local role ${role}`);
      const r = await c.query(`select (${text}) as r, (to_jsonb(now()) #>> '{}') as n`, params);
      await c.query('commit');
      return { ok: fromSql(r.rows[0].r, t, r.rows[0].n) };
    } catch (e) { await c.query('rollback'); return { err: e.code, message: e.message }; }
  }
  both(label, sqlRes, modelFn, ignoreTs = false) {
    let m;
    try { m = { ok: modelFn() }; } catch (e) { m = { err: e instanceof ModelError ? e.code : 'XX000', message: e.message }; }
    assert.deepEqual(sqlRes.err, m.err, `${label}: error code SQL ${sqlRes.err} (${sqlRes.message}) vs model ${m.err} (${m.message})`);
    const f = ignoreTs ? noTs : (x) => x;
    if (m.ok) assert.deepEqual(f(canon(sqlRes.ok)), f(canon(m.ok)), `${label}: SQL and model answers differ`);
    return sqlRes.err ? { err: sqlRes.err } : sqlRes.ok;
  }
  async engage(account, t, o = {}) {
    const q = { account, character: `c-${account.slice(-4)}`, token: tok(account, o.n ?? 0), instance: inst, layer: 1, kind: 'minotaur', maxHp: 100, respawnS: 300, ...o };
    delete q.n;
    const s = await this.sql(t, 'public.zone_spawn_engage($1,$2,$3,$4,$5,$6,$7,$8)', [q.account, q.character, q.token, q.instance, q.layer, q.kind, q.maxHp, q.respawnS]);
    return this.both(`engage ${account.slice(-4)} @${t}`, s, () => engage(this.w, q, t));
  }
  async hit(account, claimed, hits, t, o = {}) {
    const q = { account, token: tok(account, o.n ?? 0), weapon: 'gladius', claimed, hits, layer: 1, ...o };
    delete q.n;
    const s = await this.sql(t, 'public.zone_spawn_hit($1,$2,$3,$4,$5,$6)', [q.account, q.token, q.weapon, q.claimed, q.hits, q.layer]);
    return this.both(`hit ${account.slice(-4)} ${claimed}/${hits} @${t}`, s, () => hit(this.w, q, t));
  }
  async batch(id, rows, t) {
    const s = await this.sql(t, 'public.zone_spawn_hit_batch($1,$2::jsonb)', [id, JSON.stringify(rows)]);
    // A REPLAYED batch returns the receipt stored at the first send. Its timestamps are absolute and the test clock does not rewrite the jsonb receipt, so they are not comparable: the rest is.
    return this.both(`batch ${id} @${t}`, s, () => hitBatch(this.w, id, rows, t), this.w.batches.has(id));
  }
  async touch(account, token, t) {
    const s = await this.sql(t, 'public.zone_spawn_touch($1,$2)', [account, token]);
    return this.both(`touch @${t}`, s, () => touch(this.w, account, token, t));
  }
  async killReport(account, token, t) {
    const s = await this.sql(t, 'public.zone_kill_report($1,$2)', [account, token]);
    return this.both(`kill_report @${t}`, s, () => killReport(this.w, account, token, t));
  }
  // The stored state must equal the model's world: spawns, credit rows, token states, hit-log total.
  async state() {
    const key = (o, ks) => ks.map((k) => String(o[k])).join('|');
    const byKey = (ks) => (x, y) => (key(x, ks) < key(y, ks) ? -1 : key(x, ks) > key(y, ks) ? 1 : 0);   // one JS order for both sides (the database's collation is not ours)
    const sp = (await admin.query('select instance, layer, hp::float8 as hp, alive, generation from public.zone_spawns')).rows.map((r) => ({ ...r, hp: round(r.hp) })).sort(byKey(['instance', 'layer']));
    const mp = [...this.w.spawns.values()].map((s) => ({ instance: s.instance, layer: s.layer, hp: round(s.hp), alive: s.alive, generation: s.generation })).sort(byKey(['instance', 'layer']));
    assert.deepEqual(sp, mp, 'spawns');
    const ck = ['instance', 'layer', 'generation', 'account'];
    const cr = (await admin.query('select instance, layer, generation, account, damage::float8 as damage, share_pct::float8 as share_pct, pay_share::float8 as pay_share, paid, reason from public.zone_kill_credit')).rows
      .map((r) => ({ instance: r.instance, layer: r.layer, generation: r.generation, account: r.account, damage: round(r.damage), sharePct: round(r.share_pct), payShare: round(r.pay_share), paid: r.paid, reason: r.reason })).sort(byKey(ck));
    const mc = this.w.credits.map((c) => ({ instance: c.instance, layer: c.layer, generation: c.generation, account: c.account, damage: round(c.damage), sharePct: round(c.sharePct), payShare: round(c.payShare), paid: c.paid, reason: c.reason })).sort(byKey(ck));
    assert.deepEqual(cr, mc, 'credit rows');
    const en = (await admin.query('select token, used_at is not null as used, result from public.zone_spawn_engages')).rows.sort(byKey(['token']));
    const me = [...this.w.engages.values()].map((e) => ({ token: e.token, used: e.used, result: e.result })).sort(byKey(['token']));
    assert.deepEqual(en, me, 'engage tokens');
    const hs = (await admin.query('select coalesce(sum(applied),0)::float8 as s, count(*)::int as n from public.zone_spawn_hits')).rows[0];
    assert.deepEqual([round(hs.s), hs.n], [round(this.w.hits.reduce((n, h) => n + h.applied, 0)), this.w.hits.length], 'hit log');
  }
}

// `players`: one entry per account, in the order they swing; the spawn's hp is their total, so the last swing kills (the model suite's crowd()). 35 = gladius 14 x the 2.5 progression ceiling.
const crowd = async (damages, { rules = R, viaBatch = false, spawn = 'z1:crowd' } = {}) => {
  await reset(rules === R ? RAW : { ...clone(RAW), caps: rules.caps });
  const p = new Pair(rules), total = damages.reduce((a, b) => a + b, 0), who = damages.map((_, i) => uid(0x100 + i));
  for (const [i, a] of who.entries()) await p.engage(a, 0, { token: `crowd-token-${String(i).padStart(3, '0')}-aaaa`, instance: spawn, maxHp: total });
  const row = (a, i) => ({ account: a, token: `crowd-token-${String(i).padStart(3, '0')}-aaaa`, weapon: 'gladius', claimed: damages[i], hits: Math.max(1, Math.ceil(damages[i] / 35)), layer: 1 });
  let out;
  if (viaBatch) { out = await p.batch('crowd-batch-0001', who.map(row), 0); out = out.results.at(-1); }
  else for (const [i, a] of who.entries()) { const r = row(a, i); out = await p.hit(a, r.claimed, r.hits, 0, { token: r.token }); }
  assert.equal(out.killed, true, 'the last swing kills');
  await p.state();
  return out.credits;
};
const sum = (cs) => cs.reduce((n, c) => n + c.payShare, 0);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('migration applied: every function and table exists, the rows load, an unloaded database refuses (O0010)', { skip }, async () => {
  const fns = (await admin.query("select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname like 'zone\\_%' order by 1")).rows.map((r) => r.proname);
  assert.deepEqual(fns, ['zone_cfg', 'zone_hit_log_prune', 'zone_kill_report', 'zone_rules_apply', 'zone_settle_kill', 'zone_spawn_engage', 'zone_spawn_hit', 'zone_spawn_hit_batch', 'zone_spawn_state', 'zone_spawn_touch', 'zone_spawn_view']);
  await admin.query('truncate public.zone_hit_batches, public.zone_kill_credit, public.zone_spawn_hits, public.zone_spawn_engages, public.zone_spawns');
  await admin.query('delete from public.zone_config');
  await assert.rejects(() => admin.query('select public.zone_cfg()'), (e) => e.code === 'O0010');
  const applied = (await admin.query('select public.zone_rules_apply($1::jsonb) as r', [JSON.stringify(RAW)])).rows[0].r;
  assert.deepEqual(applied, { weapons: 3 });
  const cfg = (await admin.query('select * from public.zone_config')).rows;
  assert.equal(cfg.length, 1);
  assert.equal(cfg[0].hit_expiry_s, R.share.hitExpiryS);
  assert.equal(Number(cfg[0].min_share_pct), R.share.minSharePct);
  assert.equal(cfg[0].kills_per_min, R.caps.killsPerMin);
  await assert.rejects(() => admin.query('select public.zone_rules_apply($1::jsonb)', [JSON.stringify({ ...RAW, hit: { ...RAW.hit, retryFailedBatch: true } })]), (e) => e.code === 'O0002');
  // the schema's own patterns equal the rows file's (the migration test pins this on the text; here the live constraint is asked)
  const def = (await admin.query("select pg_get_constraintdef(oid) as d from pg_constraint where conrelid = 'public.zone_spawns'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%instance%'")).rows[0].d;
  assert.ok(def.includes(R.ids.instancePattern), def);
});

test('GRANTS: the writer and the verifier call every function except zone_rules_apply; no other role calls anything; zone_rules_apply is owner-only', { skip }, async () => {
  await reset();
  const names = (await admin.query("select p.oid::regprocedure::text as sig, proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname like 'zone\\_%'")).rows;
  for (const role of [WRITER, VERIFIER]) {
    for (const { sig, proname } of names) {
      const can = (await admin.query('select has_function_privilege($1, $2::regprocedure, $3) as ok', [role, sig, 'execute'])).rows[0].ok;
      assert.equal(can, !R.adminOnlyFunctions.includes(proname), `${role} execute on ${sig}`);
    }
  }
  for (const role of ['anon', 'authenticated', 'zone_admin', 'public']) {
    for (const { sig } of names) {
      const can = (await admin.query('select has_function_privilege($1, $2::regprocedure, $3) as ok', [role, sig, 'execute'])).rows[0].ok;
      assert.equal(can, false, `${role} execute on ${sig}`);
    }
  }
  // the real thing: set role and try
  const rows = JSON.stringify(RAW);
  for (const role of [WRITER, VERIFIER, 'anon', 'authenticated', 'zone_admin']) {
    await admin.query('begin');
    try { await admin.query(`set local role ${role}`); await assert.rejects(() => admin.query('select public.zone_rules_apply($1::jsonb)', [rows]), (e) => e.code === '42501', `${role} must not call zone_rules_apply`); } finally { await admin.query('rollback'); }
  }
  await admin.query('begin');
  try { await admin.query(`set local role ${WRITER}`); await admin.query("select public.zone_spawn_state(array['z1:x'], 1)"); await admin.query("select public.zone_hit_log_prune()"); } finally { await admin.query('rollback'); }
  // no client role touches a table directly (RLS on, no policy, no grant)
  for (const role of [WRITER, VERIFIER, 'anon', 'authenticated']) {
    await admin.query('begin');
    try { await admin.query(`set local role ${role}`); await assert.rejects(() => admin.query('select * from public.zone_spawns'), (e) => e.code === '42501', `${role} reads zone_spawns`); } finally { await admin.query('rollback'); }
  }
  const rls = (await admin.query("select relname, relrowsecurity from pg_class where relname like 'zone\\_%' and relkind = 'r' order by 1")).rows;
  assert.equal(rls.length, 7);
  assert.ok(rls.every((r) => r.relrowsecurity), 'RLS on every zone table');
});

test('z01: is refused by the live constraint and nothing is stored; z0: and z12: are real zones; the zone column is the prefix', { skip }, async () => {
  await reset();
  const p = new Pair();
  const bad = await p.sql(0, 'public.zone_spawn_engage($1,$2,$3,$4,$5,$6,$7,$8)', [A, 'c', tok(A), 'z01:minotaur', 1, 'minotaur', 100, 300]);
  assert.ok(['23502', '23514'].includes(bad.err), `refused by a constraint (the generated zone column is NULL for z01:, so not-null fires first; the model throws O0002 for the same refusal): ${bad.err}`);
  assert.equal((await admin.query('select count(*)::int as n from public.zone_spawns')).rows[0].n, 0);
  assert.equal((await admin.query('select count(*)::int as n from public.zone_spawn_engages')).rows[0].n, 0);
  await p.engage(A, 0, { instance: 'z0:rat', n: 1 });
  await p.engage(A, 0, { instance: 'z12:boss.a', n: 2 });
  const z = (await admin.query('select instance, zone from public.zone_spawns order by instance')).rows;
  assert.deepEqual(z, [{ instance: 'z0:rat', zone: '0' }, { instance: 'z12:boss.a', zone: '12' }]);
  for (const bare of ['minotaur', 'z1:', 'Z1:x', 'z1:UP']) assert.equal((await p.sql(0, 'public.zone_spawn_engage($1,$2,$3,$4,$5,$6,$7,$8)', [B, 'c', tok(B), bare, 1, 'minotaur', 100, 300])).err, bare === 'z1:UP' || bare === 'z1:' ? '23514' : '23502', bare);
});

test('SHARED HP: two accounts hit one boss and lower ONE bar; kill pays the credit in the same call; kill_report is read-only', { skip }, async () => {
  await reset();
  const p = new Pair();
  await p.engage(A, 0); await p.engage(B, 0);
  assert.equal((await p.hit(A, 30, 1, 0)).hp, 70);
  assert.equal((await p.hit(B, 30, 1, 0)).hp, 40, 'B sees A\'s damage');
  assert.equal((await p.killReport(A, tok(A), 0)).state, 'alive');
  const k = await p.hit(B, 60, 2, 1000);   // a second later: the rate ceiling allows B's second swing (at the same instant it allows none)
  assert.equal(k.killed, true);
  assert.equal(k.applied, 40, 'capped at the hp that was left');
  await p.killReport(A, tok(A), 10); await p.killReport(A, tok(A), 20);
  await p.state();
});

test('60/30/10 pays 0.6/0.3/0.1 and the shares sum to 1; the order of the same hits changes nothing (no last-hit bonus)', { skip }, async () => {
  const cs = await crowd([60, 30, 10]);
  assert.deepEqual(cs.map((c) => [c.reason, c.payShare, c.sharePct]), [['paid', 0.6, 60], ['paid', 0.3, 30], ['paid', 0.1, 10]]);
  assert.ok(Math.abs(sum(cs) - 1) < 1e-12);
  const rev = await crowd([10, 30, 60]);
  assert.deepEqual(rev.map((c) => c.payShare).sort(), [0.1, 0.3, 0.6]);
});

test('the floor row: 4% is floored (true share kept, the paid renormalise), exactly 5% is paid', { skip }, async () => {
  await reset();
  const run = async (a, b) => { await reset(); const p = new Pair(); await p.engage(A, 0); await p.engage(B, 0); await p.hit(A, a, 3, 0); const k = await p.hit(B, b, 1, 0); await p.state(); return k.credits; };
  const under = await run(96, 4);
  assert.deepEqual(under.map((c) => [c.reason, c.paid, c.payShare]), [['paid', true, 1], ['floor', false, 0]]);
  assert.equal(under[1].sharePct, 4);
  assert.deepEqual((await run(95, 5)).map((c) => [c.reason, c.payShare]), [['paid', 0.95], ['paid', 0.05]]);
});

test('WHALE: a whale at 50 and five players at 10 each are all paid; a 1% tag-along in a pair is still floored', { skip }, async () => {
  const cs = await crowd([50, 10, 10, 10, 10, 10]);
  assert.deepEqual(cs.map((c) => c.reason), Array(6).fill('paid'));
  assert.ok(Math.abs(sum(cs) - 1) < 1e-12);
  const tag = await crowd([1, 99]);
  assert.deepEqual(tag.map((c) => [c.reason, c.paid]), [['floor', false], ['paid', true]]);
});

test('21 equal players (4.76% each) are ALL paid, one by one, shares sum to 1', { skip }, async () => {
  await reset();
  const cs = await crowd(Array(21).fill(1));
  assert.equal(cs.length, 21);
  assert.deepEqual([...new Set(cs.map((c) => c.reason))], ['paid']);
  assert.ok(Math.abs(sum(cs) - 1) < 1e-9, `sum ${sum(cs)}`);
  for (const c of cs) assert.ok(Math.abs(c.payShare - 1 / 21) < 1e-12);
});

test('100 equal players, all in ONE hit batch (200-row bound), are all paid and shares sum to 1', { skip }, async () => {
  await reset();
  const cs = await crowd(Array(100).fill(1), { viaBatch: true });
  assert.equal(cs.filter((c) => c.paid).length, 100);
  assert.ok(Math.abs(sum(cs) - 1) < 1e-9);
});

test('ONE player: paid 100%; a freeloader inside a crowd is still floored (30 players at 3 and one at 1)', { skip }, async () => {
  await reset();
  assert.deepEqual((await crowd([40])).map((c) => [c.reason, c.paid, c.payShare, c.sharePct]), [['paid', true, 1, 100]]);
  await reset();
  const cs = await crowd([1, ...Array(30).fill(3)]);
  assert.deepEqual([cs[0].reason, cs[0].paid], ['floor', false]);
  assert.deepEqual([...new Set(cs.slice(1).map((c) => c.reason))], ['paid']);
  assert.ok(Math.abs(sum(cs) - 1) < 1e-9);
});

test('a kill is settled ONCE: replaying a kill (a second hit on the dead life, a second settle) pays nothing new', { skip }, async () => {
  await reset();
  const p = new Pair();
  await p.engage(A, 0);
  const k = await p.hit(A, 100, 3, 0);
  assert.equal(k.killed, true);
  assert.equal((await p.hit(A, 100, 3, 1000)).err, 'O0009', 'the token was closed by the kill');
  await p.state();
  // the settle function itself, called again by hand (a buggy caller): on conflict do nothing, so the ledger is unchanged and the stored credit is not doubled
  const before = (await admin.query('select * from public.zone_kill_credit')).rows;
  await admin.query('select public.zone_settle_kill($1,$2,$3)', [inst, 1, 0]);
  assert.deepEqual((await admin.query('select * from public.zone_kill_credit')).rows, before);
  // the same batch id resent after a kill: replayed, nothing applied
  const w = p;
  await w.engage(B, 2000, { instance: 'z1:other' });
  const rows = [{ account: B, token: tok(B), weapon: 'gladius', claimed: 100, hits: 3, layer: 1 }];
  const b1 = await w.batch('kill-batch-0001', rows, 2000);
  assert.equal(b1.results[0].killed, true);
  const b2 = await w.batch('kill-batch-0001', rows, 7000);
  assert.equal(b2.replayed, true);
  assert.deepEqual(noTs(b2.results), noTs(b1.results));
  assert.equal((await admin.query('select count(*)::int as n from public.zone_kill_credit where account = $1', [B])).rows[0].n, 1, 'paid once');
  await w.state();
});

test('a batch: a failing row is reported in its slot and does not stop the others; a failed batch is never retried (the batch id is spent); a refused batch spends no id', { skip }, async () => {
  await reset();
  const p = new Pair();
  await p.engage(A, 0); await p.engage(B, 0);
  const rows = [
    { account: A, token: tok(A), weapon: 'gladius', claimed: 30, hits: 1, layer: 1 },
    { account: B, token: 'tok-not-engaged-aaaaaaaaaaaa', weapon: 'gladius', claimed: 30, hits: 1, layer: 1 },
    { account: B, token: tok(B), weapon: 'warhammer', claimed: 30, hits: 1, layer: 1 },
    { account: B, token: tok(B), weapon: 'gladius', claimed: 30, hits: 1, layer: 2 },
    { account: B, token: tok(B), weapon: 'gladius', claimed: 30, hits: 1, layer: 1 },
  ];
  const r = await p.batch('batch-0001-aaaa', rows, 0);
  assert.equal(r.replayed, false);
  assert.deepEqual(r.results.map((x) => x.hp ?? x.error ?? x.refused), [70, 'O0009', 'weapon', 'moved', 40]);
  // the resend (a writer that retried a failed tick) applies NOTHING and returns the stored receipt
  const again = await p.batch('batch-0001-aaaa', rows, 5000);
  assert.equal(again.replayed, true);
  assert.deepEqual(again.results, r.results);
  assert.equal(Number((await admin.query('select hp from public.zone_spawns')).rows[0].hp), 40, 'applied once, not twice');
  // a refused batch (too many rows, bad id) raises before the id is spent
  const big = await p.sql(6000, 'public.zone_spawn_hit_batch($1,$2::jsonb)', ['batch-0002-aaaa', JSON.stringify(new Array(R.hit.maxBatchRows + 1).fill({}))]);
  assert.equal(big.err, 'O0002');
  assert.equal((await p.sql(6000, 'public.zone_spawn_hit_batch($1,$2::jsonb)', ['x', '[]'])).err, 'O0002');
  assert.equal((await admin.query("select count(*)::int as n from public.zone_hit_batches where batch_id = 'batch-0002-aaaa'")).rows[0].n, 0);
  // a row with a malformed account is a slot error, not a batch error
  const mal = await p.sql(7000, 'public.zone_spawn_hit_batch($1,$2::jsonb)', ['batch-0003-aaaa', JSON.stringify([{ account: 'not-a-uuid', token: tok(A), weapon: 'gladius', claimed: 1, hits: 1, layer: 1 }])]);
  assert.equal(mal.ok.results[0].error, '22P02');
  await p.state();
});

test('HIT EXPIRY at 120 s (share.hitExpiryS, strict): 130 s and exactly 120 s are out, 119.9 s is in; the expired hit still took hp', { skip }, async () => {
  for (const [gap, who] of [[130_000, [B]], [120_000, [B]], [119_900, [A, B]]]) {
    await reset();
    const p = new Pair();
    await p.engage(A, 0); await p.hit(A, 30, 1, 0);
    await p.engage(B, gap);
    const k = await p.hit(B, 70, 2, gap);
    assert.equal(k.killed, true, 'A\'s expired hit still reduced hp');
    assert.deepEqual(k.credits.map((c) => c.account), who, `gap ${gap}`);
    await p.state();
  }
});

test('RATE LIMITS: damage is capped by weapon rows, real elapsed time and the hp left; a long gap banks at most maxElapsedS; zero elapsed applies nothing', { skip }, async () => {
  await reset();
  const p = new Pair();
  await p.engage(A, 0, { maxHp: 10000 });
  const first = await p.hit(A, 1e9, 1000, 0);
  assert.ok(first.applied < 1e9 && first.killed === false);
  assert.equal((await p.hit(A, 50, 1, 0)).applied, 0, 'zero real time since the last report');
  await p.hit(A, 1, 1, 0);
  const gap = await p.hit(A, 1e9, 1000, 100_000);
  assert.ok(gap.applied <= 35 * 3 * R.hit.maxElapsedS * R.hit.dpsSlack + 1e-9);
  assert.equal((await p.hit(A, -5, 1, 105_000)).applied, 0, 'negative claims apply nothing');
  assert.equal((await p.hit(A, 5, 1, 110_000, { weapon: 'warhammer' })).refused, 'weapon');
  await p.state();
});

test('LAYERS, RESPAWN, COOLDOWN: moved is refused and writes nothing; respawn_at = now + respawn seconds; the next life is a new generation; cooldown across layers', { skip }, async () => {
  await reset();
  const p = new Pair();
  await p.engage(A, 1000);
  assert.equal((await p.hit(A, 10, 1, 2000, { layer: 2 })).refused, 'moved');
  assert.equal((await p.hit(A, 10, 1, 3000)).hp, 90);
  const k = await p.hit(A, 100, 3, 4000);
  assert.equal(k.killed, true);
  assert.equal(k.respawnAtMs, 4000 + 300_000);
  assert.deepEqual(await p.engage(B, 100_000), { refused: 'dead', respawnAtMs: 304_000 });
  const back = await p.engage(B, 304_000);
  assert.equal(back.generation, 1);
  assert.equal(back.hp, 100);
  assert.equal((await p.hit(A, 10, 1, 305_000)).err, 'O0009', 'the first life\'s token is closed');
  await p.state();
  // cooldown across layers
  await reset();
  const q = new Pair();
  await q.engage(A, 0, { maxHp: 20 });
  assert.equal((await q.hit(A, 20, 1, 0)).credits[0].paid, true);
  await q.engage(A, 5000, { maxHp: 20, layer: 2, n: 1 });
  const k2 = await q.hit(A, 20, 1, 5000, { layer: 2, n: 1 });
  assert.deepEqual([k2.credits[0].reason, k2.credits[0].paid], ['cooldown', false]);
  await q.engage(A, 400_000, { maxHp: 20, layer: 2, n: 2 });
  assert.equal((await q.hit(A, 20, 1, 400_000, { layer: 2, n: 2 })).credits[0].paid, true);
  await q.state();
});

test('MISMATCH, TOKENS, TOUCH: kind/hp/respawn fixed at the first engage; re-engage returns the open token; too-many; touch extends; spawn_state shows the lazy respawn', { skip }, async () => {
  await reset();
  const p = new Pair();
  await p.engage(A, 0, { respawnS: 1 });
  assert.equal((await admin.query('select respawn_s from public.zone_spawns')).rows[0].respawn_s, R.respawn.minS, 'clamped');
  assert.equal((await p.engage(B, 0, { respawnS: 1 })).token, tok(B));
  assert.equal((await p.engage(C, 0, { respawnS: 60 })).refused, 'mismatch');
  assert.equal((await p.engage(B, 0, { maxHp: 5000 })).refused, 'mismatch');
  assert.equal((await p.engage(B, 0, { kind: 'rat' })).refused, 'mismatch');
  const e1 = await p.engage(A, 1000, { n: 9, respawnS: 1 });
  assert.equal(e1.token, tok(A), 're-engaging the same life returns the open token');
  for (let i = 0; i < R.engage.maxOpenPerAccount - 1; i++) await p.engage(A, 1000, { instance: `z1:x${i}`, n: i + 1 });
  assert.equal((await p.engage(A, 1000, { instance: 'z1:overflow', n: 50 })).refused, 'too-many');
  await p.touch(A, tok(A), 100_000);
  assert.equal((await p.touch(B, tok(A), 100_000)).err, 'O0009');
  assert.equal((await p.touch(A, tok(A), 100_000 + R.engage.ttlS * 1000 + 1)).err, 'O0009');
  await p.state();
  // an expiry sweep on one spawn does not touch the same account's tokens on another spawn
  await reset();
  const q = new Pair();
  await q.engage(A, 0, { instance: 'z1:a', n: 1 });
  await q.engage(A, R.engage.ttlS * 1000 + 1, { instance: 'z1:b', n: 2 });
  assert.deepEqual((await admin.query('select used_at is not null as used, result from public.zone_spawn_engages where token = $1', [tok(A, 1)])).rows, [{ used: false, result: null }]);
  await q.state();
  // spawn_state: the view of a dead spawn at, before and after its respawn time
  await reset();
  const s = new Pair();
  await s.engage(A, 0, { maxHp: 20 }); await s.hit(A, 20, 1, 0);
  const st = (t) => s.sql(t, "public.zone_spawn_state(array['z1:minotaur'], 1) -> 'spawns' -> 0", []);
  const dead = (await st(100_000)).ok, alive = (await st(300_000)).ok;
  assert.deepEqual([dead.alive, dead.hp, dead.generation], [false, 0, 0]);
  const mv = view(s.w, s.w.spawns.get(`${inst}#1`), 300_000);
  assert.deepEqual([alive.alive, alive.hp, alive.generation], [mv.alive, mv.hp, mv.generation]);
});

test('KILL CAPS: seven same-instant kills of one account pay exactly killsPerMin (sequential, model equal); per-minute resets after a minute; per-hour cap; a capped account does not move the others', { skip }, async () => {
  await reset();
  const p = new Pair();
  const reasons = [];
  for (let i = 0; i < R.caps.killsPerMin + 1; i++) {
    await p.engage(A, 5000, { instance: `z1:cap${i}`, n: i, maxHp: 20 });
    reasons.push((await p.hit(A, 20, 1, 5000, { n: i })).credits[0].reason);
  }
  assert.deepEqual(reasons, [...Array(R.caps.killsPerMin).fill('paid'), 'cap']);
  assert.equal((await admin.query('select count(*)::int as n from public.zone_kill_credit where account = $1 and paid', [A])).rows[0].n, R.caps.killsPerMin);
  await p.state();
  // a minute later the minute cap is clear again (the old credits are 61 s old)
  await p.engage(A, 66_001, { instance: 'z1:later', n: 20, maxHp: 20 });
  assert.equal((await p.hit(A, 20, 1, 66_001, { n: 20 })).credits[0].paid, true);
  await p.state();
  // a capped contributor is unpaid and the other's share stays its own true share
  await reset(clone({ ...RAW, caps: { ...RAW.caps, killsPerMin: 1 } }));
  const r1 = parseRules({ ...clone(RAW), caps: { ...RAW.caps, killsPerMin: 1 } });
  const q = new Pair(r1);
  await q.engage(A, 0, { instance: 'z1:a', maxHp: 20 }); await q.hit(A, 20, 1, 0);
  await q.engage(A, 1000, { instance: 'z1:b', maxHp: 20, n: 1 }); await q.engage(B, 1000, { instance: 'z1:b', maxHp: 20 });
  await q.hit(A, 10, 1, 1000, { n: 1 });
  const kk = await q.hit(B, 10, 1, 1000);
  const by = Object.fromEntries(kk.credits.map((c) => [c.account, c]));
  assert.deepEqual([by[A].paid, by[A].reason, by[B].paid, by[B].payShare], [false, 'cap', true, 0.5]);
  await q.state();
  // the hour cap, with the minute cap out of the way
  const rows = clone({ ...RAW, caps: { ...RAW.caps, killsPerMin: 60, killsPerHour: 2 } });
  await reset(rows);
  const h = new Pair(parseRules(clone(rows)));
  const got = [];
  for (let i = 0; i < 3; i++) { const t = i * 120_000; await h.engage(A, t, { instance: `z1:m${i}`, maxHp: 20, n: i }); got.push((await h.hit(A, 20, 1, t, { n: i })).credits[0].reason); }
  assert.deepEqual(got, ['paid', 'paid', 'cap']);
  await h.state();
});

test('the VERIFIER role runs the whole path too (engage, hit, kill, report), equal to the model; a no-damage engager gets an unpaid report; an expired token is replaced by a new one; a duplicate token is refused by the database', { skip }, async () => {
  await reset();
  const p = new Pair();
  const asV = async (t, text, params) => { const r = await p.sql(t, text, params, VERIFIER); assert.equal(r.err, undefined, r.message); return r.ok; };
  // A engages through the VERIFIER role (the model gets the same engage by hand), B through the writer via the pair
  const mine = engage(p.w, { account: A, character: 'c', token: tok(A), instance: inst, layer: 1, kind: 'minotaur', maxHp: 100, respawnS: 300 }, 0);
  const e = await asV(0, 'public.zone_spawn_engage($1,$2,$3,$4,$5,$6,$7,$8)', [A, 'c', tok(A), inst, 1, 'minotaur', 100, 300]);
  assert.deepEqual([e.token, e.hp, e.generation], [mine.token, mine.hp, mine.generation]);
  await p.engage(B, 0);
  const k = await p.hit(B, 100, 3, 0);
  assert.equal(k.killed, true);
  assert.deepEqual(k.credits.map((c) => c.account), [B], 'A dealt nothing, so there is no credit row for A');
  assert.deepEqual(await p.killReport(A, tok(A), 10), { state: 'unpaid', reason: 'killed' });
  assert.deepEqual((await p.killReport(B, tok(B), 10)).state, 'settled');
  // an expired token is swept by the next engage and a NEW token is minted
  await reset();
  const q = new Pair();
  const first = await q.engage(A, 0, { maxHp: 200 });
  const second = await q.engage(A, R.engage.ttlS * 1000 + 1, { maxHp: 200, n: 1 });
  assert.notEqual(first.token, second.token);
  assert.equal((await admin.query('select result from public.zone_spawn_engages where token = $1', [first.token])).rows[0].result, 'expired');
  await q.state();
  // a token string minted twice for two accounts: the primary key refuses (the model overwrites silently; the writer mints random tokens, so this is a belt-and-braces refusal)
  const dup = await q.sql(R.engage.ttlS * 1000 + 10,'public.zone_spawn_engage($1,$2,$3,$4,$5,$6,$7,$8)', [B, 'c', second.token, inst, 1, 'minotaur', 200, 300]);   // (t is the virtual ms; the pair is already at ttl+1, so go a little later)
  assert.equal(dup.err, '23505');
});

test('prune drops old hit rows, closed tokens and spent batch ids, never the credit rows', { skip }, async () => {
  await reset();
  const p = new Pair();
  await p.engage(A, 0); await p.hit(A, 100, 3, 0);
  await p.batch('batch-prune-0001', [], 0);
  const keep = R.log.keepS * 1000;
  const r = await p.sql(keep + 1, 'public.zone_hit_log_prune()', []);
  assert.deepEqual(r.ok, { hits: 1, engages: 1, batches: 1 });
  prune(p.w, keep + 1);
  assert.equal((await admin.query('select count(*)::int as n from public.zone_kill_credit')).rows[0].n, 1);
  assert.equal(p.w.credits.length, 1);
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// CONCURRENCY: separate connections, REAL time (no clock shifting). `begin` + a call + no commit = the transaction holds its locks while the other one starts.
const session = async (role = WRITER) => { const c = await connect(); const { rows } = await c.query('select pg_backend_pid() as pid'); c.pid = rows[0].pid; await c.query('begin'); await c.query(`set local role ${role}`); return c; };
const call = (c, text, params) => c.query(`select (${text}) as r`, params).then((x) => x.rows[0].r);
const waiting = async (pid, kind = 'Lock', ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const { rows } = await admin.query('select wait_event_type from pg_stat_activity where pid = $1', [pid]);
    if (rows[0]?.wait_event_type === kind) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
};
const settled = (promise) => promise.then((v) => ({ v }), (e) => ({ e }));
const seed = async (sp, accounts, o = {}) => {   // engage accounts on spawn `sp` through the real function (autocommit, writer role)
  for (const a of accounts) { const c = await session(); await call(c, 'public.zone_spawn_engage($1,$2,$3,$4,$5,$6,$7,$8)', [a, 'c', tok(a, o.n ?? 0) + sp.replace(/\W/g, ''), sp, 1, 'minotaur', o.maxHp ?? 100, 300]); await c.query('commit'); await c.end(); }
};
const tk = (a, sp, n = 0) => tok(a, n) + sp.replace(/\W/g, '');
const hitSql = 'public.zone_spawn_hit($1,$2,$3,$4,$5,$6)';

test('CONCURRENCY 1: two accounts hit one spawn at once: the second waits on the spawn row, then sees the first\'s damage (one bar, never 100% each)', { skip }, async () => {
  await reset();
  await seed('z1:conc', [A, B]);
  const a = await session(), b = await session();
  assert.equal((await call(a, hitSql, [A, tk(A, 'z1:conc'), 'gladius', 30, 1, 1])).hp, 70);
  const pb = settled(call(b, hitSql, [B, tk(B, 'z1:conc'), 'gladius', 30, 1, 1]));
  assert.ok(await waiting(b.pid), 'B must wait on the spawn row lock held by A');
  await a.query('commit');
  const rb = await pb;
  assert.equal(rb.e, undefined, rb.e?.message);
  assert.equal(rb.v.hp, 40, 'B applied on top of A\'s committed 30');
  await b.query('commit'); await a.end(); await b.end();
  assert.equal(Number((await admin.query('select hp from public.zone_spawns')).rows[0].hp), 40);
  assert.equal((await admin.query('select count(*)::int as n from public.zone_spawn_hits')).rows[0].n, 2);
});

test('CONCURRENCY 2: the documented order spawn -> engage rows: engage vs hit of one account on one spawn, in both arrival orders, neither deadlocks', { skip }, async () => {
  for (const first of ['engage', 'hit']) {
    await reset();
    await seed('z1:ord', [A]);
    const eng = (c) => call(c, 'public.zone_spawn_engage($1,$2,$3,$4,$5,$6,$7,$8)', [A, 'c', 'unused-token-aaaaaaaaaaaa', 'z1:ord', 1, 'minotaur', 100, 300]);
    const hi = (c) => call(c, hitSql, [A, tk(A, 'z1:ord'), 'gladius', 10, 1, 1]);
    const a = await session(), b = await session();
    const [fa, fb] = first === 'engage' ? [eng, hi] : [hi, eng];
    await fa(a);
    const pb = settled(fb(b));
    assert.ok(await waiting(b.pid), `${first} first: the second call waits for the spawn row`);
    await a.query('commit');
    const rb = await pb;
    assert.equal(rb.e, undefined, `${first} first: ${rb.e?.message}`);
    await b.query('commit'); await a.end(); await b.end();
    assert.equal(Number((await admin.query('select hp from public.zone_spawns')).rows[0].hp), 90);
  }
});

test('CONCURRENCY 3: engage of one account on two spawns, and kills of two accounts on two spawns, run side by side without waiting or deadlock', { skip }, async () => {
  await reset();
  await seed('z1:s1', [A]); await seed('z1:s2', [B]);
  const a = await session(), b = await session();
  const ka = await call(a, hitSql, [A, tk(A, 'z1:s1'), 'gladius', 100, 3, 1]);
  const kb = await call(b, hitSql, [B, tk(B, 'z1:s2'), 'gladius', 100, 3, 1]);   // would hang here if it waited on A
  assert.deepEqual([ka.killed, kb.killed], [true, true]);
  await a.query('commit'); await b.query('commit'); await a.end(); await b.end();
});

test('CONCURRENCY 4: KILL CAP advisory lock: killsPerMin-1 paid kills, then two concurrent kills of one account on two spawns: exactly one is paid, the other waits on the account lock and reads the cap', { skip }, async () => {
  await reset();
  for (let i = 0; i < R.caps.killsPerMin - 1; i++) {
    const sp = `z1:pre${i}`; await seed(sp, [A], { maxHp: 20 });
    const c = await session(); assert.equal((await call(c, hitSql, [A, tk(A, sp), 'gladius', 20, 1, 1])).credits[0].reason, 'paid'); await c.query('commit'); await c.end();
  }
  await seed('z1:k6', [A], { maxHp: 20 }); await seed('z1:k7', [A], { maxHp: 20 });
  const a = await session(), b = await session();
  const r6 = await call(a, hitSql, [A, tk(A, 'z1:k6'), 'gladius', 20, 1, 1]);
  assert.equal(r6.credits[0].reason, 'paid', 'the sixth is the last one inside the cap');
  const pb = settled(call(b, hitSql, [A, tk(A, 'z1:k7'), 'gladius', 20, 1, 1]));
  assert.ok(await waiting(b.pid, 'Lock'), 'B must wait for the account\'s advisory lock');
  const lock = (await admin.query("select locktype from pg_locks where pid = $1 and not granted", [b.pid])).rows;
  assert.deepEqual(lock.map((l) => l.locktype), ['advisory']);
  await a.query('commit');
  const rb = await pb;
  assert.equal(rb.e, undefined, rb.e?.message);
  assert.deepEqual([rb.v.killed, rb.v.credits[0].paid, rb.v.credits[0].reason], [true, false, 'cap'], 'B counted A\'s committed credit row with a fresh snapshot');
  await b.query('commit'); await a.end(); await b.end();
  assert.equal((await admin.query('select count(*)::int as n from public.zone_kill_credit where account = $1 and paid', [A])).rows[0].n, R.caps.killsPerMin, 'never overshot');
});

test('CONCURRENCY 5 (KNOWN HAZARD, MEASURED): a batch that kills on spawn C (takes the account lock) then hits spawn D, against a batch holding D that then kills on E for the same account: a cross-lock cycle', { skip }, async () => {
  await reset();
  const X = uid(0x501), Y = uid(0x502), Z = uid(0x503);
  await seed('z1:c', [X], { maxHp: 20 }); await seed('z1:d', [Y, Z]); await seed('z1:e', [X], { maxHp: 20 });
  const one = (id, rows) => `public.zone_spawn_hit_batch('${id}', '${JSON.stringify(rows)}'::jsonb)`;
  const row = (account, sp, claimed, hits = 1) => ({ account, token: tk(account, sp), weapon: 'gladius', claimed, hits, layer: 1 });
  const t2 = await session(), t1 = await session();
  // T2 first: holds spawn D (a non-killing hit by Z)
  const r2a = await call(t2, one('hazard-b2-first', [row(Z, 'z1:d', 10)]), []);
  assert.equal(r2a.results[0].hp, 90);
  // T1: row 1 kills C as X (takes adv(X), holds it), row 2 hits D as Y (waits for D, held by T2)
  // each side commits (or gives up) the moment its call returns, as a real tick would: the survivor of the cycle waits for the other's locks to be released
  const finish = (c) => (r) => c.query(r.e ? 'rollback' : 'commit').then(() => r, () => r);
  const p1 = settled(call(t1, one('hazard-b1', [row(X, 'z1:c', 20), row(Y, 'z1:d', 10)]), [])).then(finish(t1));
  assert.ok(await waiting(t1.pid), 'T1 waits for spawn D');
  await new Promise((r) => setTimeout(r, 400));   // let T1 be the older waiter
  // T2 second call: kills E as X: needs adv(X), held by T1 -> cycle (T1 waits D held by T2; T2 waits adv(X) held by T1)
  const p2 = settled(call(t2, one('hazard-b2-second', [row(X, 'z1:e', 20)]), [])).then(finish(t2));
  const both = await Promise.race([Promise.all([p1, p2]), new Promise((r) => setTimeout(() => r(null), 8000))]);
  // Postgres' deadlock detector (deadlock_timeout shortened to 300 ms for this test) must break the cycle: nothing may hang.
  assert.notEqual(both, null, 'HANG: the cycle was not broken within 8 s');
  const [o1, o2] = both;
  const measured = {
    t1: o1.e ? { threw: o1.e.code } : { returned: o1.v.results.map((x) => x.error ?? (x.killed ? 'killed' : 'hp ' + x.hp)) },
    t2: o2.e ? { threw: o2.e.code } : { returned: o2.v.results.map((x) => x.error ?? (x.killed ? 'killed' : 'hp ' + x.hp)) },
  };
  console.log(`# MEASURED HAZARD: ${JSON.stringify(measured)}`);
  const deadlocks = [o1, o2].filter((o) => (o.e && o.e.code === '40P01') || (o.v && o.v.results.some((x) => x.error === '40P01'))).length;
  assert.equal(deadlocks, 1, `exactly one side is the deadlock victim, got ${JSON.stringify(measured)}`);
  for (const c of [t1, t2]) await c.end();
  const rows = (await admin.query('select reason from public.zone_kill_credit where account = $1 order by reason', [X])).rows;
  console.log(`# MEASURED credits for X after the hazard: ${JSON.stringify(rows.map((r) => r.reason))}`);
});

test('CONCURRENCY 6: the SAME batch id sent twice at once: the second waits on the id, then returns the first\'s receipt and applies nothing', { skip }, async () => {
  await reset();
  await seed('z1:dup', [A]);
  const one = "public.zone_spawn_hit_batch('dup-batch-0001', $1::jsonb)";
  const rows = JSON.stringify([{ account: A, token: tk(A, 'z1:dup'), weapon: 'gladius', claimed: 30, hits: 1, layer: 1 }]);
  const a = await session(), b = await session();
  const ra = await call(a, one, [rows]);
  assert.deepEqual([ra.replayed, ra.results[0].hp], [false, 70]);
  const pb = settled(call(b, one, [rows]));
  assert.ok(await waiting(b.pid), 'B waits on the unique batch id held by A');
  await a.query('commit');
  const rb = await pb;
  assert.equal(rb.e, undefined, rb.e?.message);
  assert.equal(rb.v.replayed, true);
  assert.equal(rb.v.results[0].hp, 70, 'the stored receipt, not a second application');
  await b.query('commit'); await a.end(); await b.end();
  assert.equal(Number((await admin.query('select hp from public.zone_spawns')).rows[0].hp), 70, 'applied once');
});

test('CONCURRENCY 7: two kills on two spawns whose contributors are the SAME two accounts take the account locks in ascending order: the second waits, no deadlock, both settle', { skip }, async () => {
  await reset();
  const X = uid(0x601), Y = uid(0x602);   // X < Y
  for (const sp of ['z1:p', 'z1:q']) {
    await seed(sp, [X, Y], { maxHp: 40 });
    const c = await session(); await call(c, hitSql, [X, tk(X, sp), 'gladius', 20, 1, 1]); await c.query('commit'); await c.end();   // X contributes 20 on each
  }
  const a = await session(), b = await session();
  const ka = await call(a, hitSql, [Y, tk(Y, 'z1:p'), 'gladius', 20, 1, 1]);   // Y's blow kills p: locks adv(X) then adv(Y)
  assert.deepEqual(ka.credits.map((c) => c.account), [X, Y]);
  const pb = settled(call(b, hitSql, [Y, tk(Y, 'z1:q'), 'gladius', 20, 1, 1]));
  assert.ok(await waiting(b.pid), 'B waits for adv(X), the FIRST lock in the order');
  await a.query('commit');
  const rb = await pb;
  assert.equal(rb.e, undefined, rb.e?.message);
  assert.deepEqual(rb.v.credits.map((c) => c.paid), [true, true]);
  await b.query('commit'); await a.end(); await b.end();
  assert.equal((await admin.query('select count(*)::int as n from public.zone_kill_credit where paid')).rows[0].n, 4);
});
