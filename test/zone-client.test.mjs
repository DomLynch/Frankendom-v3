// Live zone phase 3, step 1: the page side of shared boss health (src/zone/shared-hp-client.ts, shared-hp-http.ts, shared-hp-chunk.ts; rows data/zone-client.json; contract docs/ZONE-CLIENT-CONTRACT.md).
// Pure: a fake transport stands in for the writer. No network, no timer, no database, no game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFile } from '../src/sim/validate.js';
import { ACT, ACTIONS, CAPS, PHASE, ROWS, SERVER, createSharedHp, parseClientRows, presentBar, shownHealth } from '../src/zone/shared-hp-client.ts';
import { httpTransport } from '../src/zone/shared-hp-http.ts';
import { sharedHpUrlFor, startSharedHp } from '../src/zone/shared-hp-chunk.ts';

const RAW = JSON.parse(readFileSync(new URL('../data/zone-client.json', import.meta.url), 'utf8'));
const SRV = JSON.parse(readFileSync(new URL('../data/zone-server-rules.json', import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const T = ROWS.timing;
const INSTANCE = 'z1:minotaur';
const cap = (w) => CAPS.get(w);
const ev = (damage, weapon = 'gladius', over = {}) => ({ type: 'Hit', actor: 0, target: 1, damage, weapon, ...over });

/** A scripted writer. `over.<op>(q, log, n)` replaces an answer; the default is a healthy 100 hp boss that every hit lowers. */
function fake(over = {}) {
  const log = { engage: [], touch: [], hits: [], state: [], kill: [] };
  let hp = 100;
  const t = {
    engage: async (q) => { log.engage.push(q); return over.engage ? over.engage(q, log, log.engage.length) : { token: `token-aaaaaaaaaaaaaaaa-${log.engage.length}`, instance: q.instance, layer: q.layer, generation: 0, hp, maxHp: 100 }; },
    touch: async (q) => { log.touch.push(q); return over.touch ? over.touch(q, log, log.touch.length) : { expiresAt: 'x' }; },
    hits: async (q) => {
      log.hits.push(q);
      if (over.hits) return over.hits(q, log, log.hits.length);
      return { replayed: false, results: q.rows.map((r) => { hp = Math.max(0, hp - r.claimed); return { token: r.token, applied: r.claimed, hp, maxHp: 100, killed: hp === 0 }; }) };
    },
    state: async (q) => { log.state.push(q); return over.state ? over.state(q, log, log.state.length) : { now: 'x', spawns: [{ instance: INSTANCE, alive: hp > 0, hp, maxHp: 100, generation: 0, respawnAt: hp > 0 ? null : 'later' }] }; },
    killReport: async (q) => { log.kill.push(q); return over.kill ? over.kill(q, log, log.kill.length) : { state: 'settled', paid: true, reason: 'paid', sharePct: 60, payShare: 0.6 }; },
  };
  return { t, log, setHp: (v) => { hp = v; } };
}
function client(f, o = {}) {
  const bars = [], phases = [], kills = [];
  const c = createSharedHp({ transport: f.t, instance: INSTANCE, layer: () => 1, session: 'sess', weapon: () => 'gladius', onBar: (b) => bars.push(b), onPhase: (p) => phases.push(p), onKill: (k) => kills.push(k), ...o });
  return { c, bars, phases, kills };
}
const up = async (f, o) => { const k = client(f, o); await k.c.start(0); return k; };

test('the rows file validates (closed keys), parses against the server rows, and the pinned defaults hold', () => {
  assert.deepEqual(validateFile('zone-client', RAW), []);
  assert.equal(ROWS.query, 'sharedhp');
  assert.equal(SERVER.hit.retryFailedBatch, false, 'a failed batch is never resent: the server row is pinned false and the client has no resend path');
  assert.equal(ROWS.timing.flushMs, 250);
  assert.equal(ROWS.timing.stateMs, 250);
  assert.equal(ROWS.timing.touchMs < SERVER.engage.ttlS * 1000, true, 'the heartbeat comes before the token expires');
  assert.equal(ROWS.fallback.sql, ACT.lost);
  assert.equal(ROWS.fallback.transport, ACT.lost);
  assert.equal(parseClientRows(clone(RAW), SERVER).query, 'sharedhp');
});

test('parseClientRows refuses an unknown action, a missing refusal row, a bad batch id and a non-positive timer', () => {
  const bad = (edit, re) => { const r = clone(RAW); edit(r); assert.throws(() => parseClientRows(r, SERVER), re); };
  bad((r) => { r.refusals[0].action = 'retry'; }, /unknown action/);
  bad((r) => { r.refusals = r.refusals.filter((x) => x.id !== 'moved'); }, /no row for the server's refusal moved/);
  bad((r) => { r.refusals.push({ id: 'banned', action: 'lost' }); }, /not a refusal the server has/);
  bad((r) => { r.batch.idSep = ' '; }, /batchIdPattern/);
  bad((r) => { r.timing.flushMs = 0; }, /positive/);
  bad((r) => { r.sqlClasses[0].match = []; }, /code prefix/);
  bad((r) => { r.transportClasses[0].kinds = []; r.transportClasses[0].status = []; }, /kind or a status/);
  bad((r) => { r.fallback.sql = 'resend'; }, /unknown action/);
  bad((r) => { r.backoff.maxMs = 1; }, /maxMs at least baseMs/);
  assert.equal(ACTIONS.length, 7);
});

test('every refusal and every pay-relevant error class of the contract has a row, and each row names a known action', () => {
  for (const s of SRV.refusals) assert.ok(ROWS.refusals.some((r) => r.id === s.id), `refusal ${s.id}`);
  for (const r of [...ROWS.refusals, ...ROWS.sqlClasses, ...ROWS.transportClasses]) assert.ok(ACTIONS.includes(r.action), r.id);
  const classOf = (code) => ROWS.sqlClasses.find((c) => c.match.some((m) => code.startsWith(m)))?.id ?? 'fallback';
  // the PR #89 review: z01 (23502 in SQL, O0002 in the model) and the duplicate token (23505) are handled by CLASS, not by one exact code
  assert.equal(classOf('23502'), classOf('O0002'));
  assert.equal(classOf('23502'), 'input');
  assert.equal(classOf('23505'), 'conflict');
  assert.equal(classOf('40P01'), 'transient');
  assert.equal(classOf('40001'), 'transient');
  assert.equal(classOf('57014'), 'transient');
  assert.equal(classOf('O0009'), 'token');
  assert.equal(classOf('O0010'), 'unloaded');
  assert.equal(classOf('42501'), 'privilege');
  assert.equal(classOf('XX000'), 'fallback');
});

test('the claim: only the hero\'s Hit on the foe counts, capped per hit by the server rows, and never a non-finite number', async () => {
  const f = fake(), { c } = await up(f);
  c.hit({ type: 'Hit', actor: 1, target: 0, damage: 5, weapon: 'gladius' });          // the foe's blow on the hero
  c.hit({ type: 'Blocked', actor: 0, target: 1, damage: 5, weapon: 'gladius' });      // not a Hit
  c.hit(ev(NaN)); c.hit(ev(Infinity)); c.hit(ev(-4)); c.hit(ev(0)); c.hit(ev('9'));    // never leave the phone
  c.hit(ev(5, 'warhammer'));                                                          // a sim weapon with no server row: cannot be capped, so not claimed
  assert.equal(c.pendingHits(), 0);
  c.hit(ev(1e9));                                                                     // a huge hit is capped to the weapon's per-hit ceiling
  assert.equal(c.pendingHits(), 1);
  await c.tick(T.flushMs);
  const row = f.log.hits[0].rows[0];
  assert.equal(row.claimed, cap('gladius').maxDamage);
  assert.equal(Number.isFinite(row.claimed), true);
  assert.equal(c.counters().dropped, 6);
});

test('the claim is held to the server rate ceiling over the real time since the last send; the excess is dropped, not saved', async () => {
  const f = fake(); f.setHp(1e9);
  const { c } = await up(f);
  for (let i = 0; i < 100; i++) c.hit(ev(30));
  await c.tick(0);
  const g = cap('gladius'), first = f.log.hits[0].rows[0];
  const allowed = Math.ceil(g.maxHitsPerS * SERVER.hit.firstHitAllowanceS * SERVER.hit.dpsSlack);
  assert.equal(first.hits, allowed, 'the first report gets the first-hit allowance');
  assert.equal(first.claimed <= g.maxDamage * g.maxHitsPerS * SERVER.hit.firstHitAllowanceS * SERVER.hit.dpsSlack + 1e-9, true);
  assert.equal(c.counters().clamped, 100 - allowed);
  assert.equal(c.pendingHits(), 0, 'what was above the ceiling is gone');
  // a long quiet gap banks at most maxElapsedS
  for (let i = 0; i < 100; i++) c.hit(ev(30));
  await c.tick(10 * 60 * 1000);
  const second = f.log.hits[1].rows[0];
  assert.equal(second.hits, Math.min(SERVER.hit.maxHitsPerRow, Math.ceil(g.maxHitsPerS * SERVER.hit.maxElapsedS * SERVER.hit.dpsSlack)));
  assert.equal(second.hits <= SERVER.hit.maxHitsPerRow, true);
});

test('one row per batch: with two weapons pending the bigger claim goes, the other waits for the next flush (the database applies a second row of one token in a batch as 0)', async () => {
  const f = fake(), { c } = await up(f);
  c.hit(ev(5, 'gladius')); c.hit(ev(30, 'cleaver')); c.hit(ev(30, 'cleaver'));
  await c.tick(0);
  assert.equal(f.log.hits[0].rows.length, 1);
  assert.equal(f.log.hits[0].rows[0].weapon, 'cleaver');
  assert.equal(c.pendingHits(), 1);
  await c.tick(T.flushMs);
  assert.equal(f.log.hits[1].rows[0].weapon, 'gladius');
});

test('flush cadence: nothing before flushMs, one batch after; the batch row has the contract shape and the id is legal and never repeats', async () => {
  const f = fake(), { c } = await up(f);
  c.hit(ev(10));
  await c.tick(0);
  c.hit(ev(10));
  await c.tick(T.flushMs - 1);
  assert.equal(f.log.hits.length, 1, 'not before flushMs');
  await c.tick(T.flushMs);
  await c.tick(T.flushMs * 2); c.hit(ev(10)); await c.tick(T.flushMs * 3);
  assert.equal(f.log.hits.length, 3);
  const ids = f.log.hits.map((h) => h.batchId);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, new RegExp(SERVER.ids.batchIdPattern));
  assert.deepEqual(Object.keys(f.log.hits[0].rows[0]).sort(), ['claimed', 'hits', 'layer', 'token', 'weapon']);
  assert.equal(f.log.hits[0].rows[0].layer, 1);
  assert.equal(typeof f.log.hits[0].rows[0].token, 'string');
});

test('the shared hp is applied to the bar; inside one life the bar only goes down, so a late answer cannot raise it', async () => {
  const f = fake(), { c, bars } = await up(f);
  assert.equal(c.bar().hp, 100);
  c.hit(ev(30)); await c.tick(0);
  assert.equal(c.bar().hp, 70);
  assert.equal(c.bar().fraction, 0.7);
  // the state poll answers with an OLDER, higher value (a slow response): ignored
  f.setHp(90); await c.tick(T.stateMs); // state says 90
  assert.equal(c.bar().hp, 70);
  // another phone lowers it: the poll's lower number is taken
  f.setHp(40); await c.tick(T.stateMs * 2);
  assert.equal(c.bar().hp, 40);
  assert.equal(bars.at(-1).hp, 40);
  // a bad answer (NaN, negative max) changes nothing
  const before = c.bar();
  await createSharedHp({ transport: fake({ state: async () => ({ spawns: [{ instance: INSTANCE, alive: true, hp: NaN, maxHp: 100, generation: 0 }] }) }).t, instance: INSTANCE, layer: () => 1, session: 'sess' }).tick(0);
  assert.deepEqual(c.bar(), before);
});

test('presentation only: shownHealth takes the shared bar when it is fresh and the sim\'s own when there is none or it is stale; presentBar sets a meter', async () => {
  const sim = { hp: 55, max: 80 };
  assert.deepEqual(shownHealth(sim, null), { hp: 55, max: 80, shared: false });
  const f = fake(), { c } = await up(f);
  c.hit(ev(30)); await c.tick(0);
  assert.deepEqual(shownHealth(sim, c.bar()), { hp: 70, max: 100, shared: true });
  assert.deepEqual(shownHealth(sim, { ...c.bar(), stale: true }), { hp: 55, max: 80, shared: false });
  const m = { value: 0, max: 0 };
  assert.equal(presentBar(m, sim, c.bar()), true);
  assert.deepEqual(m, { value: 70, max: 100 });
  assert.equal(presentBar(m, sim, null), false);
  assert.deepEqual(m, { value: 55, max: 80 });
  assert.equal(c.phase(), PHASE.engaged);
});

test('a 40P01 in the result slot is a LOST ROW: counted lost, never sent again, and the next flush carries only the new hits with a new id', async () => {
  const f = fake({ hits: (q, log, n) => (n === 1 ? { replayed: false, results: [{ token: q.rows[0].token, error: '40P01', message: 'deadlock detected' }] } : { replayed: false, results: [{ token: q.rows[0].token, applied: q.rows[0].claimed, hp: 90, maxHp: 100, killed: false }] }) });
  const { c } = await up(f);
  c.hit(ev(10)); await c.tick(0);
  assert.equal(c.counters().lost, 1);
  assert.equal(c.phase(), PHASE.engaged, 'a transient code does not end the fight');
  assert.equal(c.bar().hp, 100, 'the bar did not move: that damage is lost');
  c.hit(ev(7)); await c.tick(T.flushMs);
  assert.equal(f.log.hits.length, 2);
  assert.equal(f.log.hits[1].rows[0].claimed, 7, 'only the new hit; the lost 10 is not in it');
  assert.notEqual(f.log.hits[0].batchId, f.log.hits[1].batchId);
  await c.tick(T.flushMs * 5);
  assert.equal(f.log.hits.length, 2, 'nothing is resent');
});

test('any error code in a slot is a lost row, whatever the code; the CLASS then decides what else happens', async () => {
  const run = async (code) => {
    const f = fake({ hits: (q) => ({ replayed: false, results: [{ token: q.rows[0].token, error: code, message: 'm' }] }) }), k = await up(f);
    k.c.hit(ev(10)); await k.c.tick(0);
    return { phase: k.c.phase(), lost: k.c.counters().lost, engages: f.log.engage.length, k };
  };
  for (const code of ['40P01', '40001', '57014', '55P03', '08006', 'XX000', 'P0001']) { const r = await run(code); assert.equal(r.lost, 1, code); assert.equal(r.phase, PHASE.engaged, code); }
  for (const code of ['23502', 'O0002', '22P02']) { const r = await run(code); assert.equal(r.phase, PHASE.off, `${code}: bad input is a client bug, stop sharing`); }
  assert.equal((await run('42501')).phase, PHASE.off, 'a missing grant stops sharing');
  const t = await run('O0009');
  assert.equal(t.phase, PHASE.idle, 'the token is gone: engage again');
  await t.k.c.tick(T.engageRetryMs);
  assert.equal(t.k.c.phase(), PHASE.engaged);
  assert.equal((await run('23505')).phase, PHASE.idle, 'a duplicate token: ask again for a new one');
  const un = await run('O0010');
  assert.equal(un.phase, PHASE.engaged);
  un.k.c.hit(ev(5)); await un.k.c.tick(T.flushMs);
  assert.equal(un.k.c.counters().sent, 1, 'rules not loaded: every channel backs off');
});

test('a duplicate batch id (replayed) applies nothing, is counted, and is never resent', async () => {
  const f = fake({ hits: () => ({ replayed: true, results: [] }) });
  const { c } = await up(f);
  c.hit(ev(10)); await c.tick(0);
  assert.equal(c.counters().replays, 1);
  assert.equal(c.counters().lost, 1);
  assert.equal(c.bar().hp, 100);
  await c.tick(T.flushMs * 4);
  assert.equal(f.log.hits.length, 1);
});

test('an answer with the wrong number of slots, or for another token, is a lost row and moves nothing', async () => {
  const f = fake({ hits: (q, log, n) => (n === 1 ? { replayed: false, results: [] } : { replayed: false, results: [{ token: 'someone-elses-token-aaaa', applied: 5, hp: 1, maxHp: 100, killed: false }] }) });
  const { c } = await up(f);
  c.hit(ev(10)); await c.tick(0);
  c.hit(ev(10)); await c.tick(T.flushMs);
  assert.equal(c.counters().lost, 2);
  assert.equal(c.bar().hp, 100);
});

test('offline: a whole call that fails loses the batch, every channel backs off, the bar goes stale after offlineAfter failures, and the sim\'s bar is shown instead', async () => {
  let down = true;
  const f = fake({ hits: (q) => { if (down) throw { kind: 'offline' }; return { replayed: false, results: [{ token: q.rows[0].token, applied: q.rows[0].claimed, hp: 50, maxHp: 100, killed: false }] }; }, state: () => { if (down) throw { kind: 'timeout' }; return { spawns: [] }; } });
  const { c, bars } = await up(f);
  let now = 0;
  const sends = () => f.log.hits.length;
  c.hit(ev(10)); await c.tick(now);   // the batch and the state read both fail at once
  assert.equal(sends(), 1);
  assert.equal(c.counters().lost, 1);
  c.hit(ev(10)); await c.tick(now += T.flushMs);                 // inside the backoff window: no call at all, on any channel
  assert.equal(sends(), 1);
  assert.equal(f.log.state.length, 1);
  await c.tick(now += ROWS.backoff.maxMs);                       // past it
  assert.equal(sends(), 2);
  c.hit(ev(10));
  await c.tick(now += ROWS.backoff.maxMs);
  assert.equal(c.bar().stale, true, 'offlineAfter failures in a row: the number on screen is old');
  assert.equal(shownHealth({ hp: 33, max: 100 }, c.bar()).shared, false);
  assert.equal(bars.at(-1).stale, true);
  // the backoff is capped
  for (let i = 0; i < 20; i++) { c.hit(ev(1)); await c.tick(now += ROWS.backoff.maxMs); }
  assert.equal(f.log.hits.length >= 5, true);
  down = false;
  c.hit(ev(10)); await c.tick(now += ROWS.backoff.maxMs);
  assert.equal(c.bar().stale, false);
  assert.equal(c.bar().hp, 50);
  assert.equal(c.phase(), PHASE.engaged, 'offline never ends the fight');
});

test('http 401/403 stops sharing, 429 and 5xx back off, anything else is a lost row (the transport classes)', async () => {
  const run = async (status) => {
    const f = fake({ hits: () => { throw { kind: 'status', status }; } }), k = await up(f);
    k.c.hit(ev(10)); await k.c.tick(0);
    k.c.hit(ev(10)); await k.c.tick(T.flushMs);
    return { phase: k.c.phase(), sent: f.log.hits.length, lost: k.c.counters().lost };
  };
  assert.equal((await run(401)).phase, PHASE.off);
  assert.equal((await run(403)).phase, PHASE.off);
  assert.deepEqual([(await run(429)).sent, (await run(503)).sent], [1, 1]);   // backed off: the second flush made no call
  assert.deepEqual([(await run(418)).sent, (await run(418)).phase], [2, PHASE.engaged]);   // not named: lost, carry on
});

test('refusals map to their rows: too-many waits then asks again, mismatch stops, weapon blocks only that weapon, moved asks again with the page\'s layer, token asks again', async () => {
  let layer = 1;
  const slotRefused = (refused, extra = {}) => (q) => ({ replayed: false, results: [{ token: q.rows[0].token, refused, ...extra }] });
  const mk = async (refused) => { const f = fake({ hits: slotRefused(refused) }), k = await up(f, { layer: () => layer }); k.c.hit(ev(10)); await k.c.tick(0); return { f, ...k }; };

  const mismatch = await mk('mismatch'); assert.equal(mismatch.c.phase(), PHASE.off);

  const weapon = await mk('weapon');
  weapon.c.hit(ev(10, 'gladius')); weapon.c.hit(ev(10, 'cleaver'));
  assert.equal(weapon.c.pendingHits(), 1, 'the blocked weapon is dropped, the other still counts');
  assert.equal(weapon.c.phase(), PHASE.engaged);

  const tooMany = await mk('too-many');
  assert.equal(tooMany.c.phase(), PHASE.idle);
  const delay = ROWS.refusals.find((r) => r.id === 'too-many').delayMs;
  await tooMany.c.tick(delay - 1); assert.equal(tooMany.f.log.engage.length, 1);
  await tooMany.c.tick(delay); assert.equal(tooMany.f.log.engage.length, 2);

  layer = 2;
  const moved = await mk('moved');
  layer = 3;
  await moved.c.tick(0);
  assert.equal(moved.f.log.engage.at(-1).layer, 3, 'the new engage names the layer the page is in now');
  assert.equal(moved.c.phase(), PHASE.engaged);

  layer = 1;
  const token = await mk('token');
  await token.c.tick(0);
  assert.equal(token.f.log.engage.length, 2);
});

test('the server says dead: the bar goes to 0 and pending damage is dropped; a contributor asks for its credit, a bystander does not', async () => {
  const f = fake({ hits: (q, log, n) => (n === 1 ? { replayed: false, results: [{ token: q.rows[0].token, applied: 10, hp: 60, maxHp: 100, killed: false }] } : { replayed: false, results: [{ token: q.rows[0].token, refused: 'dead', respawnAt: 'later' }] }) });
  const { c, kills } = await up(f);
  c.hit(ev(10)); await c.tick(0);           // applied 10: a contributor
  c.hit(ev(10)); await c.tick(T.flushMs);   // refused: dead (someone else struck the last blow)
  assert.equal(c.phase(), PHASE.dead);
  assert.equal(c.bar().hp, 0);
  assert.equal(c.bar().alive, false);
  assert.equal(c.pendingHits(), 0);
  c.hit(ev(10)); assert.equal(c.pendingHits(), 0, 'no claims while dead');
  await c.tick(T.flushMs * 2);
  assert.equal(f.log.kill.length, 1);
  assert.equal(kills.length, 1);
  assert.deepEqual([kills[0].paid, kills[0].reason, kills[0].sharePct, kills[0].payShare], [true, 'paid', 60, 0.6]);

  const g = fake({ hits: (q) => ({ replayed: false, results: [{ token: q.rows[0].token, refused: 'dead', respawnAt: 'later' }] }) });
  const b = await up(g);
  b.c.hit(ev(10)); await b.c.tick(0); await b.c.tick(T.flushMs * 2);
  assert.equal(b.c.phase(), PHASE.dead);
  assert.equal(g.log.kill.length, 0, 'never applied a point: nothing to be paid for');
});

test('the killing blow: killed:true takes the bar to 0, the idempotent kill_report is read (retried while it says alive), and the credit is told once', async () => {
  const f = fake({ hits: (q) => ({ replayed: false, results: [{ token: q.rows[0].token, applied: 100, hp: 0, maxHp: 100, killed: true, respawnAt: 'later', credits: [{ account: 'someone-elses-uuid' }] }] }),
    kill: (q, log, n) => (n < 3 ? { state: 'alive', hp: 1, maxHp: 100, open: true } : { state: 'settled', paid: false, reason: 'floor', sharePct: 2, payShare: 0 }) });
  const { c, kills, phases } = await up(f);
  c.hit(ev(35)); await c.tick(0);
  assert.equal(c.phase(), PHASE.dead);
  assert.equal(c.bar().hp, 0);
  await c.tick(0);
  await c.tick(ROWS.kill.retryMs);
  await c.tick(ROWS.kill.retryMs * 2);
  await c.tick(ROWS.kill.retryMs * 4);
  assert.equal(f.log.kill.length, 3);
  assert.equal(kills.length, 1);
  assert.deepEqual([kills[0].paid, kills[0].reason], [false, 'floor']);
  assert.equal(JSON.stringify(kills[0]).includes('someone-elses-uuid'), false, 'other accounts\' credit rows never reach the page note');
  assert.deepEqual(phases, ['engaging', 'engaged', 'dead']);
});

test('kill credit gives up after `tries` and says null, never "paid"; a token the server forgot ends the asking at once', async () => {
  const mk = (kill) => fake({ hits: (q) => ({ replayed: false, results: [{ token: q.rows[0].token, applied: 100, hp: 0, maxHp: 100, killed: true, respawnAt: 'later' }] }), kill });
  const f = mk(() => { throw { kind: 'offline' }; });
  const a = await up(f);
  a.c.hit(ev(35)); await a.c.tick(0);
  let now = 0;
  for (let i = 0; i < 40; i++) await a.c.tick(now += ROWS.backoff.maxMs);
  assert.equal(a.kills.length, 1);
  assert.equal(a.kills[0].paid, null);
  assert.equal(a.kills[0].state, null);
  assert.equal(f.log.kill.length, ROWS.kill.tries);
  const g = mk(() => { throw { kind: 'status', status: 409, code: 'O0009' }; });
  const b = await up(g);
  b.c.hit(ev(35)); await b.c.tick(0); await b.c.tick(0);
  assert.equal(g.log.kill.length, 1);
  assert.equal(b.kills[0].paid, null);
});

test('credit is by contribution, not the last hit: another phone kills it, the state poll shows dead, and this contributor still asks for its share', async () => {
  let dead = false;
  const f = fake({ state: () => ({ spawns: [{ instance: INSTANCE, alive: !dead, hp: dead ? 0 : 70, maxHp: 100, generation: 0, respawnAt: dead ? 'later' : null }] }),
    hits: (q) => ({ replayed: false, results: [{ token: q.rows[0].token, applied: q.rows[0].claimed, hp: 70, maxHp: 100, killed: false }] }) });
  const { c, kills } = await up(f);
  c.hit(ev(30)); await c.tick(0);
  assert.equal(c.phase(), PHASE.engaged);
  dead = true;
  await c.tick(T.stateMs);
  assert.equal(c.phase(), PHASE.dead);
  assert.equal(c.bar().hp, 0);
  await c.tick(T.stateMs + 1);
  assert.equal(kills.length, 1);
  assert.equal(f.log.kill.length, 1);
});

test('respawn: the poll shows the next generation alive, the client engages the new life after its credit is read, and the bar starts full', async () => {
  let gen = 0, alive = false;
  const f = fake({
    engage: (q, log, n) => ({ token: `token-aaaaaaaaaaaaaaaa-${n}`, instance: q.instance, layer: q.layer, generation: gen, hp: 100, maxHp: 100 }),
    hits: (q) => ({ replayed: false, results: [{ token: q.rows[0].token, applied: 100, hp: 0, maxHp: 100, killed: true, respawnAt: 'later' }] }),
    state: () => ({ spawns: [{ instance: INSTANCE, alive, hp: alive ? 100 : 0, maxHp: 100, generation: gen, respawnAt: alive ? null : 'later' }] }),
  });
  const { c } = await up(f);
  c.hit(ev(35)); await c.tick(0);
  assert.equal(c.phase(), PHASE.dead);
  let now = T.stateMs;
  await c.tick(now);   // credit read
  gen = 1; alive = true;
  await c.tick(now += T.stateMs); await c.tick(now += T.stateMs);
  assert.equal(c.phase(), PHASE.engaged);
  assert.equal(f.log.engage.length, 2);
  assert.equal(c.bar().generation, 1);
  assert.equal(c.bar().hp, 100, 'a new life resets the monotone bar');
  assert.equal(c.bar().alive, true);
});

test('an answer from a life that is over cannot lower or raise the new life\'s bar', async () => {
  const old = fake({ engage: (q) => ({ token: 't'.repeat(20), instance: q.instance, layer: q.layer, generation: 2, hp: 100, maxHp: 100 }), state: () => ({ spawns: [{ instance: INSTANCE, alive: true, hp: 5, maxHp: 100, generation: 1 }] }),
    hits: (q) => ({ replayed: false, results: [{ token: q.rows[0].token, applied: 1, hp: 3, maxHp: 100, killed: false }] }) });
  const { c } = await up(old);
  assert.equal(c.bar().generation, 2);
  await c.tick(T.stateMs);
  assert.equal(c.bar().generation, 2);
  assert.equal(c.bar().hp, 100, 'a view of life 1 does not touch life 2');
  assert.equal(c.phase(), PHASE.engaged);
});

test('a view of a NEWER life while we think we are fighting: our life ended unheard (offline); the client asks for that life\'s credit if it contributed, then engages the new life', async () => {
  let gen = 0;
  const f = fake({ engage: (q, log, n) => ({ token: `token-aaaaaaaaaaaaaaaa-${n}`, instance: q.instance, layer: q.layer, generation: gen, hp: 100, maxHp: 100 }),
    state: () => ({ spawns: [{ instance: INSTANCE, alive: true, hp: 100, maxHp: 100, generation: gen }] }),
    hits: (q) => ({ replayed: false, results: [{ token: q.rows[0].token, applied: 10, hp: 90, maxHp: 100, killed: false }] }) });
  const { c, kills } = await up(f);
  c.hit(ev(10)); await c.tick(0);
  gen = 1;
  let now = T.stateMs;
  await c.tick(now); await c.tick(now += ROWS.kill.retryMs); await c.tick(now += ROWS.kill.retryMs); await c.tick(now += ROWS.kill.retryMs);
  assert.equal(kills.length, 1, 'the old life\'s credit was asked for');
  assert.equal(f.log.kill[0].token, f.log.engage[0] ? 'token-aaaaaaaaaaaaaaaa-1' : '');
  assert.equal(c.phase(), PHASE.engaged);
  assert.equal(c.bar().generation, 1);
});

test('the heartbeat: a fighter who is not swinging touches the token every touchMs; a token the server forgot is engaged again', async () => {
  const f = fake({ touch: (q, log, n) => { if (n === 2) throw { kind: 'status', status: 409, code: 'O0009' }; return { expiresAt: 'x' }; } });
  const { c } = await up(f);
  await c.tick(T.touchMs - 1); assert.equal(f.log.touch.length, 0);
  await c.tick(T.touchMs); assert.equal(f.log.touch.length, 1);
  await c.tick(T.touchMs + 10); assert.equal(f.log.touch.length, 1);
  await c.tick(T.touchMs * 2); assert.equal(f.log.touch.length, 2);
  assert.equal(c.phase(), PHASE.idle);
  await c.tick(T.touchMs * 2 + T.engageRetryMs);
  assert.equal(c.phase(), PHASE.engaged);
  assert.equal(f.log.engage.length, 2);
});

test('engage: a lost engage is asked again after engageRetryMs; dead waits for the respawn; a stop class ends it', async () => {
  const a = fake({ engage: (q, log, n) => { if (n === 1) throw { kind: 'offline' }; return { token: 'token-aaaaaaaaaaaaaaaa', instance: q.instance, layer: q.layer, generation: 0, hp: 100, maxHp: 100 }; } });
  const k = client(a);
  await k.c.start(0);
  assert.equal(k.c.phase(), PHASE.idle);
  await k.c.tick(ROWS.timing.engageRetryMs - 1); assert.equal(a.log.engage.length, 1);
  await k.c.tick(ROWS.backoff.baseMs + ROWS.timing.engageRetryMs); assert.equal(k.c.phase(), PHASE.engaged);

  const d = fake({ engage: () => ({ refused: 'dead', respawnAt: 'later' }), state: () => ({ spawns: [{ instance: INSTANCE, alive: false, hp: 0, maxHp: 100, generation: 0, respawnAt: 'later' }] }) });
  const dk = client(d); await dk.c.start(0);
  assert.equal(dk.c.phase(), PHASE.dead);
  await dk.c.tick(T.stateMs); assert.equal(d.log.engage.length, 1, 'still dead: no second engage');

  const s = fake({ engage: () => { throw { kind: 'status', status: 400, code: '23502' }; } });
  const sk = client(s); await sk.c.start(0);
  assert.equal(sk.c.phase(), PHASE.off);
  await sk.c.tick(10 ** 6); assert.equal(s.log.engage.length, 1);
});

test('engage retry is capped: an unknown 4xx stops at once, 408/425/429 are retried, and a lost engage backs off by engageRetry rows then stops after maxTries (never an endless 2 s loop)', async () => {
  const ER = ROWS.engageRetry;
  const u = fake({ engage: () => { throw { kind: 'status', status: 418 }; } });
  const uk = client(u); await uk.c.start(0);
  assert.equal(uk.c.phase(), PHASE.off, 'an unrecoverable 4xx no table row names stops sharing');
  await uk.c.tick(10 ** 9); assert.equal(u.log.engage.length, 1, 'and never asks again');
  for (const status of [408, 425]) {
    const r = fake({ engage: () => { throw { kind: 'status', status }; } });
    const rk = client(r); await rk.c.start(0);
    assert.notEqual(rk.c.phase(), PHASE.off, `${status} can pass: it is retried`);
  }
  const f = fake({ engage: () => { throw { kind: 'weird' }; } });
  const k = client(f); await k.c.start(0);
  let at = 0;
  for (let n = 1; n < ER.maxTries; n++) {
    const wait = Math.min(T.engageRetryMs * ER.factor ** (n - 1), ER.maxMs);
    assert.equal(f.log.engage.length, n);
    await k.c.tick(at + wait - 1); assert.equal(f.log.engage.length, n, `attempt ${n + 1} is not before ${wait} ms`);
    at += wait; await k.c.tick(at); assert.equal(f.log.engage.length, n + 1);
  }
  assert.equal(f.log.engage.length, ER.maxTries);
  assert.equal(k.c.phase(), PHASE.off, 'maxTries lost engages in a row end the asking');
  await k.c.tick(at + 10 ** 9); assert.equal(f.log.engage.length, ER.maxTries, 'no further engage, ever');
});

test('engage: the wait action (zone not loaded) never counts toward maxTries; a delay-0 reengage refusal counts, waits at least minDelayMs, and ends at maxTries', async () => {
  const ER = ROWS.engageRetry;
  let loaded = false;
  const w = fake({ engage: (q, log, n) => { if (!loaded) throw { kind: 'status', status: 409, code: 'O0010' }; return { token: 'token-aaaaaaaaaaaaaaaa', instance: q.instance, layer: q.layer, generation: 0, hp: 100, maxHp: 100 }; } });
  const wk = client(w); await wk.c.start(0);
  const step = T.engageRetryMs + ROWS.backoff.baseMs;
  for (let n = 1; n <= ER.maxTries * 3; n++) await wk.c.tick(n * step);
  assert.ok(w.log.engage.length > ER.maxTries * 2, `kept asking past maxTries (${w.log.engage.length})`);
  assert.notEqual(wk.c.phase(), PHASE.off, 'a zone unloaded for a long time does not end shared hp');
  loaded = true; await wk.c.tick((ER.maxTries * 3 + 1) * step);
  assert.equal(wk.c.phase(), PHASE.engaged, 'and it engages as soon as the zone loads');

  const row = ROWS.refusals.find((x) => x.delayMs === 0 && x.action === ACT.reengage);
  assert.ok(row, 'a delay-0 reengage refusal row exists (moved / token)');
  const m = fake({ engage: () => ({ refused: row.id }) });
  const mk = client(m); await mk.c.start(0);
  let at = 0;
  for (let n = 1; n < ER.maxTries; n++) {
    assert.equal(m.log.engage.length, n);
    await mk.c.tick(at + ER.minDelayMs - 1); assert.equal(m.log.engage.length, n, `not sooner than minDelayMs (${ER.minDelayMs})`);
    at += ER.minDelayMs; await mk.c.tick(at);
  }
  assert.equal(m.log.engage.length, ER.maxTries);
  assert.equal(mk.c.phase(), PHASE.off, 'maxTries refusals in a row end the asking');
  await mk.c.tick(at + 10 ** 9); assert.equal(m.log.engage.length, ER.maxTries);
});

test('parseClientRows refuses a missing or malformed engageRetry row', () => {
  const bad = (edit, re) => { const r = clone(RAW); edit(r); assert.throws(() => parseClientRows(r, SERVER), re); };
  bad((r) => { delete r.engageRetry; }, /engageRetry/);
  bad((r) => { r.engageRetry.maxTries = 0; }, /maxTries/);
  bad((r) => { r.engageRetry.factor = 0.5; }, /factor at least 1/);
  bad((r) => { r.engageRetry.minDelayMs = 0; }, /minDelayMs/);
  bad((r) => { r.engageRetry.stopStatus = [[500, 400]]; }, /status ranges/);
});

test('stop() ends everything: no claims, no calls', async () => {
  const f = fake(), { c } = await up(f);
  c.stop();
  c.hit(ev(10)); await c.tick(10 ** 6);
  assert.equal(c.phase(), PHASE.off);
  assert.equal(f.log.hits.length + f.log.state.length + f.log.touch.length, 0);
});

test('two calls never overlap: a slow batch in flight holds the next flush until it settles', async () => {
  let release;
  const answer = (q) => ({ replayed: false, results: [{ token: q.rows[0].token, applied: 1, hp: 99, maxHp: 100, killed: false }] });
  const f = fake({ hits: (q, log, n) => (n === 1 ? new Promise((res) => { release = () => res(answer(q)); }) : answer(q)) });
  const { c } = await up(f);
  c.hit(ev(10));
  const first = c.tick(0);
  c.hit(ev(10));
  const second = c.tick(T.flushMs * 2);
  assert.equal(f.log.hits.length, 1);
  release(); await first; await second;
  c.hit(ev(10)); await c.tick(T.flushMs * 4);
  assert.equal(f.log.hits.length >= 2, true);
});

// ---- the fetch transport -----------------------------------------------------------------------------------------------------------------------------------------------------------

const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => { if (body === undefined) throw new Error('no body'); return body; } });
test('httpTransport: 2xx is the body, a refusal body is data whatever the status, other http errors reject with status and the relayed code, no answer is offline or timeout', async () => {
  const seen = [];
  const mk = (answer) => httpTransport({ base: 'https://z.example/zone/', rows: ROWS, fetch: async (url, init) => { seen.push({ url, init }); if (typeof answer === 'function') return answer(); return answer; } });
  const ok = await mk(res(200, { token: 'x' })).engage({ instance: INSTANCE, layer: 1 });
  assert.deepEqual(ok, { token: 'x' });
  assert.equal(seen[0].url, `https://z.example/zone${ROWS.routes.engage}`);
  assert.equal(seen[0].init.method, 'POST');
  assert.equal(JSON.parse(seen[0].init.body).instance, INSTANCE);
  assert.deepEqual(await mk(res(409, { refused: 'dead', respawnAt: 'r' })).engage({ instance: INSTANCE, layer: 1 }), { refused: 'dead', respawnAt: 'r' });
  assert.deepEqual(await mk(res(429, { refused: 'too-many' })).engage({ instance: INSTANCE, layer: 1 }), { refused: 'too-many' });
  await assert.rejects(mk(res(409, { error: 'O0009', message: 'gone' })).touch({ token: 't' }), { kind: 'status', status: 409, code: 'O0009' });
  await assert.rejects(mk(res(500, undefined)).hits({ batchId: 'b', rows: [] }), { kind: 'status', status: 500, code: undefined });
  await assert.rejects(mk(() => { throw Object.assign(new Error('x'), { name: 'TimeoutError' }); }).state({ instances: [], layer: 1 }), { kind: 'timeout' });
  await assert.rejects(mk(() => { throw new TypeError('Failed to fetch'); }).killReport({ token: 't' }), { kind: 'offline' });
  assert.deepEqual(Object.keys(seen[0].init.headers), ['content-type']);
});

test('httpTransport and the client together: a relayed O0009 from the wire is classed and engaged again', async () => {
  let n = 0;
  const t = httpTransport({ base: 'https://z.example/zone', rows: ROWS, fetch: async (url) => {
    if (url.endsWith(ROWS.routes.engage)) return res(200, { token: `token-aaaaaaaaaaaaaaaa-${++n}`, instance: INSTANCE, layer: 1, generation: 0, hp: 100, maxHp: 100 });
    return res(409, { error: 'O0009', message: 'engage token unknown, used or expired' });
  } });
  const c = createSharedHp({ transport: t, instance: INSTANCE, layer: () => 1, session: 'sess' });
  await c.start(0);
  await c.tick(T.touchMs);
  assert.equal(c.phase(), PHASE.idle);
  await c.tick(T.touchMs + T.engageRetryMs);
  assert.equal(c.phase(), PHASE.engaged);
  assert.equal(n, 2);
});

// ---- the flag: default OFF, no code runs without it ----------------------------------------------------------------------------------------------------------------------------------

test('the flag ?sharedhp= is OFF by default: no flag, 0, off or a malformed value start nothing and touch no timer and no network', () => {
  const loc = { protocol: 'https:', host: 'play.example' };
  for (const search of ['', '?x=1', '?sharedhp=', '?sharedhp=0', '?sharedhp=off', '?sharedhp=ftp://x', '?sharedhp=http://', '?sharedhp=javascript:alert(1)', '?sharedhp=2']) {
    assert.equal(sharedHpUrlFor(search, loc), null, search);
    let touched = 0;
    assert.equal(startSharedHp({ search, location: loc, fetch: () => { touched++; }, every: () => { touched++; return () => {}; } }), null);
    assert.equal(touched, 0);
  }
  assert.equal(sharedHpUrlFor('?sharedhp=1', loc), `https://play.example${ROWS.path}`);
  assert.equal(sharedHpUrlFor('?sharedhp=https://play.example/zone/', loc), 'https://play.example/zone', 'this page\'s own host');
  assert.equal(sharedHpUrlFor('?a=b&sharedhp=http://PLAY.example:80', loc), null, 'a different port is a different host');
});

test('?sharedhp=<url> cannot aim the fetch at an arbitrary host: only this page\'s own host or a host in data/zone-client.json hosts (default none); credentials follow', async () => {
  const loc = { protocol: 'https:', host: 'play.example' };
  assert.deepEqual(ROWS.hosts, [], 'the default is same-origin only');
  for (const s of ['?sharedhp=https://evil.example/zone', '?sharedhp=https://play.example@evil.example/zone', '?sharedhp=https://evil.example%2Fplay.example', '?sharedhp=http://localhost:8892', '?sharedhp=https://zone.example:8443/zone/']) assert.equal(sharedHpUrlFor(s, loc), null, s);
  const seen = [];
  const mk = (search) => startSharedHp({ search, location: loc, now: () => 0, session: 'sess', every: () => () => {}, fetch: async (u, init) => { seen.push({ u, c: init.credentials }); return { ok: true, status: 200, json: async () => ({ spawns: [] }) }; } });
  const own = mk('?sharedhp=1');
  await own.create({ instance: INSTANCE, layer: () => 1 }).start(0).catch(() => {});
  assert.equal(seen.at(-1).c, 'same-origin');
  ROWS.hosts.push('zone.example:8443');
  try {
    assert.equal(sharedHpUrlFor('?sharedhp=https://zone.example:8443/zone/', loc), 'https://zone.example:8443/zone');
    const far = mk('?sharedhp=https://zone.example:8443/zone');
    await far.create({ instance: INSTANCE, layer: () => 1 }).start(0).catch(() => {});
    assert.equal(seen.at(-1).c, 'include', 'cookies go cross-origin only to a host the rows name');
    assert.equal(seen.at(-1).u.startsWith('https://zone.example:8443/zone'), true);
  } finally { ROWS.hosts.pop(); }
  assert.deepEqual(ROWS.hosts, []);
  assert.throws(() => parseClientRows({ ...clone(RAW), hosts: ['Evil.Example/x'] }, SERVER), /hosts/);
});

test('the unloaded class (O0010) is a server ANSWER: every channel waits its row\'s time, the bar is never marked stale, and the answer still counts as a live line', async () => {
  const f = fake({ hits: (q) => ({ replayed: false, results: [{ token: q.rows[0].token, error: 'O0010', message: 'zone rules not loaded' }] }) });
  const { c } = await up(f);
  let now = 0;
  for (let i = 0; i < ROWS.backoff.offlineAfter * 3; i++) { c.hit(ev(5)); await c.tick(now); now += ROWS.backoff.maxMs; }
  assert.equal(c.counters().lost >= ROWS.backoff.offlineAfter, true);
  assert.equal(c.bar().stale, false);
  assert.equal(shownHealth({ hp: 1, max: 2 }, c.bar()).shared, true);
  c.hit(ev(5)); await c.tick(now); const n = f.log.hits.length;
  c.hit(ev(5)); await c.tick(now + ROWS.backoff.baseMs - 1);
  assert.equal(f.log.hits.length, n, 'inside baseMs after the answer: no call');
  assert.equal(ROWS.sqlClasses.find((x) => x.id === 'unloaded').action, ACT.wait);
});

test('the stub-boundary patterns: src/zones/x, src/zones, src/zone.ts and src/zone-x.ts are forbidden, V3\'s src/zone/x is allowed', async () => {
  const { forbidden } = await import('../scripts/stub-patterns.mjs');
  for (const t of ['src/zones/x', 'src/zones', 'src/zones.ts', 'src/zone.ts', 'src/zone-x.ts', 'src/net/x', 'src/legends/y', 'src/pit/z', 'src/core/duel']) assert.equal(forbidden(t), true, t);
  for (const t of ['src/zone/x', 'src/zone/shared-hp-client', 'src/zone', 'src/zonesish', 'src/core/registry.ts', 'src/fight/zone-loop']) assert.equal(forbidden(t), false, t);
});

test('the chunk handle is inert until used: it opens no connection by itself, creates clients that one timer drives, and stop() stops them', async () => {
  const f = fake(); let fetched = 0, fn = null, stopped = false;
  const h = startSharedHp({ search: '?sharedhp=1', location: { protocol: 'https:', host: 'h' }, fetch: () => { fetched++; throw new Error('no'); }, now: () => 0, session: 'sess', every: (cb, ms) => { fn = cb; assert.equal(ms, T.tickMs); return () => { stopped = true; }; } });
  assert.ok(h);
  assert.equal(fetched, 0);
  const c = h.create({ instance: INSTANCE, layer: () => 1 });
  assert.equal(c.phase(), PHASE.idle);
  fn();
  assert.equal(fetched, 0, 'a client that was never started calls nothing');
  assert.equal(h.clients().length, 1);
  h.stop();
  assert.equal(stopped, true);
  assert.equal(c.phase(), PHASE.off);
  assert.equal(f.log.engage.length, 0);
});

test('the as-data gate scans the client files at zero: src/zone/** is in scope and none of them is a legacy file with a baseline', () => {
  const scope = JSON.parse(readFileSync(new URL('../scripts/as-data/scope.json', import.meta.url), 'utf8'));
  assert.ok(scope.globs.includes('src/**/*.ts'), 'src/zone/** is covered by the all-of-src glob');
  for (const f of ['shared-hp-client.ts', 'shared-hp-http.ts', 'shared-hp-chunk.ts']) assert.equal(scope.legacy.includes(`src/zone/${f}`), false, f);
  const base = JSON.parse(readFileSync(new URL('../scripts/as-data/baseline.json', import.meta.url), 'utf8'));
  assert.equal(Object.keys(base.counts).some((k) => k.includes('shared-hp')), false);
  assert.equal(Object.keys(base.totals ?? {}).some((k) => k.startsWith('src/zone/')), false, 'no src/zone file has a total-ratchet row: they stay at zero');
});

test('the wiring is exactly one dynamic import in main.ts, behind the flag, and nothing in scene.ts or the sim names the client', () => {
  const main = readFileSync(new URL('../src/client/main.ts', import.meta.url), 'utf8');
  assert.match(main, /if \(\/\[\?&\]sharedhp=\/\.test\(search\)\) void import\('\.\.\/zone\/shared-hp-chunk\.ts'\)/);
  assert.equal((main.match(/^.*import\(.*shared-hp.*$/gm) ?? []).length, 1, 'one import line');
  for (const f of ['src/fight/scene.ts', 'src/fight/world-combat.ts', 'src/fight/open-fight.ts', 'src/fight/duel.ts', 'src/fight/ragdoll.ts']) {
    let text = ''; try { text = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'); } catch { continue; }
    assert.equal(/shared-hp|sharedhp|__v3SharedHp/.test(text), false, f);
  }
});
