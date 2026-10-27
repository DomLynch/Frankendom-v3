// Phase 3 design: the zone server's shared boss health and damage-share credit, as a pure reference model (src/server-model/zone-model.ts, rows data/zone-server-rules.json).
// The migration supabase/migrations/20261027000001_zone_server.sql must do exactly what these tests pin. No database, no game, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFile } from '../src/sim/validate.js';
import { parseRules, zoneOf, weaponCaps, checkWeaponCoverage, newWorld, engage, touch, hit, hitBatch, killReport, settle, view, prune, ModelError } from '../src/server-model/zone-model.ts';

const RAW = JSON.parse(readFileSync(new URL('../data/zone-server-rules.json', import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const R = parseRules(clone(RAW));
const rules = (edit) => { const r = clone(RAW); edit?.(r); return parseRules(r); };
const A = '00000000-0000-4000-8000-00000000000a', B = '00000000-0000-4000-8000-00000000000b', C = '00000000-0000-4000-8000-00000000000c';
const tok = (account, n = 0) => `tok-${account.slice(-1)}-${n}-aaaaaaaaaaaaaaaa`;
const inst = 'z1:minotaur';
// Engage `account` on a 100 hp Minotaur (300 s respawn) in layer 1 unless `over` says otherwise.
const eng = (w, account, t, over = {}) => engage(w, { account, character: `c-${account.slice(-1)}`, token: tok(account, over.n ?? 0), instance: inst, layer: 1, kind: 'minotaur', maxHp: 100, respawnS: 300, ...over }, t);
const swing = (w, account, damage, hits, t, over = {}) => hit(w, { account, token: tok(account, over.n ?? 0), weapon: 'gladius', claimed: damage, hits, layer: 1, ...over }, t);
const spawn = (w, i = inst, layer = 1) => w.spawns.get(`${i}#${layer}`);

test('the rows file validates (closed keys) and parses; the pinned rows hold', () => {
  assert.deepEqual(validateFile('zone-server-rules', RAW), []);
  assert.equal(R.hit.retryFailedBatch, false);
  assert.equal(R.share.hitExpiryS, 120);
  assert.equal(R.share.minSharePct, 5);
  assert.equal(R.caps.killsPerMin > 0 && R.caps.killsPerHour >= R.caps.killsPerMin, true);
  assert.ok(R.writerRoles.length >= 2);
});

test('parseRules refuses a retry row, a bonus row, a bad bound and a missing refusal label', () => {
  assert.throws(() => rules((r) => { r.hit.retryFailedBatch = true; }), /retryFailedBatch/);
  assert.throws(() => rules((r) => { r.share.lastHitBonusPct = 10; }), /bonus/);
  assert.throws(() => rules((r) => { r.share.minSharePct = 101; }), /minSharePct/);
  assert.throws(() => rules((r) => { r.respawn.defaultS = 5; }), /minS <= defaultS/);
  assert.throws(() => rules((r) => { r.refusals = r.refusals.filter((x) => x.id !== 'moved'); }), /no row for moved/);
  assert.throws(() => rules((r) => { r.weapons.push(clone(r.weapons[0])); }), /duplicate/);
});

test('zone ids are strings: z0 and z12 parse, z01: is refused, a bare name is refused', () => {
  assert.equal(zoneOf(R, 'z0:rat'), '0');
  assert.equal(zoneOf(R, 'z1:minotaur'), '1');
  assert.equal(zoneOf(R, 'z12:boss.a'), '12');
  assert.equal(zoneOf(R, 'z01:minotaur'), null);
  assert.equal(zoneOf(R, 'minotaur'), null);
  const w = newWorld(R);
  assert.throws(() => eng(w, A, 0, { instance: 'z01:minotaur' }), (e) => e instanceof ModelError && /z01: is refused/.test(e.message));
  assert.equal(w.spawns.size, 0, 'nothing stored under any zone');
});

test('weapon caps carry the progression ceiling; coverage is loud on a gap', () => {
  const c = weaponCaps(R).get('gladius');
  assert.equal(c.maxDamage, R.weapons.find((w) => w.id === 'gladius').maxDamagePerHit * R.progression.maxDamageMult);
  assert.doesNotThrow(() => checkWeaponCoverage(R, ['gladius', 'cleaver']));
  assert.throws(() => checkWeaponCoverage(R, ['gladius', 'warhammer']), /no weapon rule for: warhammer/);
});

test('SHARED HP IS SINGLE-SOURCED: two clients hit one boss and reduce ONE bar, never 100% each', () => {
  const w = newWorld(R);
  eng(w, A, 0); eng(w, B, 0);
  const a = swing(w, A, 30, 1, 0);
  assert.equal(a.hp, 70);
  const b = swing(w, B, 30, 1, 0);
  assert.equal(b.hp, 40, 'B sees A\'s damage: 100 - 30 - 30, not 70');
  assert.equal(spawn(w).hp, 40, 'one row, one number');
  // each phone reads the same bar back
  const [s1, s2] = [view(w, spawn(w), 10), view(w, spawn(w), 10)];
  assert.deepEqual(s1, s2);
  assert.equal(s1.hp, 40);
  // the damage the two clients dealt sums to what the bar lost, and no more
  assert.equal(w.hits.reduce((n, h) => n + h.applied, 0), 100 - 40);
  assert.equal(w.spawns.size, 1);
});

test('two clients who each "deal a full bar" cannot both kill: the second is paid only what is left', () => {
  const w = newWorld(R);
  eng(w, A, 0); eng(w, B, 0);
  const a = swing(w, A, 60, 2, 0), b = swing(w, B, 60, 2, 0);   // 120 claimed against 100 hp
  assert.equal(a.applied, 60);
  assert.equal(b.applied, 40, 'capped at the hp that was left');
  assert.equal(b.killed, true);
  const credits = b.credits;
  assert.equal(credits.length, 2);
  assert.deepEqual(credits.map((c) => [c.account, c.sharePct]), [[A, 60], [B, 40]]);
});

test('credit is proportional per life: 60/30/10 pay 0.6/0.3/0.1 and sum to 1', () => {
  const w = newWorld(R);
  for (const x of [A, B, C]) eng(w, x, 0);
  swing(w, A, 60, 2, 0); swing(w, B, 30, 1, 0);
  const kill = swing(w, C, 10, 1, 0);
  assert.equal(kill.killed, true);
  const by = Object.fromEntries(kill.credits.map((c) => [c.account, c]));
  assert.deepEqual([by[A].payShare, by[B].payShare, by[C].payShare], [0.6, 0.3, 0.1]);
  assert.equal(kill.credits.every((c) => c.paid && c.reason === 'paid'), true);
  assert.ok(Math.abs(kill.credits.reduce((n, c) => n + c.payShare, 0) - 1) < 1e-12);
});

test('NO last-hit bonus: the killing blow earns exactly its share, and the order of the same hits changes nothing', () => {
  const shares = (order) => {
    const w = newWorld(R);
    for (const x of [A, B, C]) eng(w, x, 0);
    const dmg = { [A]: 70, [B]: 25, [C]: 5 };
    let kill;
    for (const x of order) kill = swing(w, x, dmg[x], 2, 0);
    assert.equal(kill.killed, true);
    return Object.fromEntries(kill.credits.map((c) => [c.account, c.payShare]));
  };
  const first = shares([A, B, C]), last = shares([C, B, A]), mid = shares([B, A, C]);
  assert.deepEqual(first, last);
  assert.deepEqual(first, mid);
  assert.equal(first[C], 0.05, 'the 5 hp last blow of one order and the first of another both earn 5%');
  assert.equal(Object.keys(R.share).some((k) => /bonus/i.test(k)), false);
});

test('the floor row: under minSharePct of the counted damage is not paid; exactly at it is; the paid renormalise', () => {
  const run = (rs, a, b) => {
    const w = newWorld(rs);
    eng(w, A, 0); eng(w, B, 0);
    swing(w, A, a, 3, 0);   // 3 hits x 35 = 105 allowed, so a claim of up to 100 is not clipped
    return swing(w, B, b, 1, 0).credits;
  };
  const under = run(R, 96, 4);   // B has 4% of 100 < 5%
  assert.deepEqual(under.map((c) => [c.reason, c.paid, c.payShare]), [['paid', true, 1], ['floor', false, 0]]);
  assert.equal(under[1].sharePct, 4, 'the true share is still recorded');
  const at = run(R, 95, 5);      // exactly 5%
  assert.deepEqual(at.map((c) => [c.reason, c.payShare]), [['paid', 0.95], ['paid', 0.05]]);
  const flat = run(rules((r) => { r.share.renormalise = false; }), 96, 4);
  assert.equal(flat[0].payShare, 0.96, 'renormalise off: the true share, the dropped share is not redistributed');
  const noFloor = run(rules((r) => { r.share.minSharePct = 0; }), 96, 4);
  assert.equal(noFloor[1].paid, true);
});

test('why 5% of the total and not 0.25 of the top: a whale does not erase a 20% contributor', () => {
  // five players at 10% each plus a whale at 50%: V1's 0.25-of-top floor (12.5 of 50) would drop all five. 5%-of-total pays them all.
  const w = newWorld(rules((r) => { r.engage.maxOpenPerAccount = 16; }));
  const ids = Array.from({ length: 6 }, (_, i) => `00000000-0000-4000-8000-0000000000${(i + 1).toString().padStart(2, '0')}`);
  const wRules = w.rules;
  for (const x of ids) engage(w, { account: x, character: 'c', token: `t-${x.slice(-2)}-aaaaaaaaaaaaaaaa`, instance: inst, layer: 1, kind: 'minotaur', maxHp: 100, respawnS: 300 }, 0);
  let kill;
  ids.forEach((x, i) => { kill = hit(w, { account: x, token: `t-${x.slice(-2)}-aaaaaaaaaaaaaaaa`, weapon: 'gladius', claimed: i === 0 ? 50 : 10, hits: 2, layer: 1 }, 0); });
  assert.equal(kill.killed, true);
  assert.equal(kill.credits.filter((c) => c.paid).length, 6, 'all six paid under 5% of the total');
  const v1Floor = 0.25 * 50;
  assert.equal(kill.credits.filter((c) => c.damage >= v1Floor).length, 1, 'V1\'s rule would have paid the whale alone');
  assert.ok(wRules.share.minSharePct === 5);
});

// CROWD FLOOR: the floor is min(minSharePct, floorEqualShareFraction x 100 / N) of the counted total, so it never exceeds an equal share.
// `damages` = one entry per player, in the order they swing; the spawn has exactly their total as hp, so the last swing kills. Accounts and tokens are unique per player.
const crowd = (rs, damages, over = {}) => {
  const w = newWorld(rs), total = damages.reduce((a, b) => a + b, 0), who = damages.map((_, i) => `acct-${String(i).padStart(3, '0')}`);
  who.forEach((a, i) => engage(w, { account: a, character: `c${i}`, token: `crowd-token-${String(i).padStart(3, '0')}-aaaa`, instance: 'z1:crowd', layer: 1, kind: 'minotaur', maxHp: total, respawnS: 300, ...over }, 0));
  let out;
  who.forEach((a, i) => { out = hit(w, { account: a, token: `crowd-token-${String(i).padStart(3, '0')}-aaaa`, weapon: 'gladius', claimed: damages[i], hits: Math.max(1, Math.ceil(damages[i] / 35)), layer: 1 }, 0); });   // 35 = gladius 14 x the 2.5 ceiling
  assert.equal(out.killed, true, 'the last swing kills');
  return out.credits;
};
const sumShares = (cs) => cs.reduce((n, c) => n + c.payShare, 0);

test('CROWD FLOOR: the floor is a row, at most one equal share, and the effective floor is min(minSharePct, fraction x 100 / N)', () => {
  assert.equal(R.share.minSharePct, 5);
  assert.ok(R.share.floorEqualShareFraction > 0 && R.share.floorEqualShareFraction <= 1);
  assert.throws(() => rules((r) => { r.share.floorEqualShareFraction = 1.01; }), /floorEqualShareFraction/, 'above one equal share would be able to pay nobody');
  assert.throws(() => rules((r) => { delete r.share.floorEqualShareFraction; }), /floorEqualShareFraction/);
});

test('CROWD FLOOR: 60/30/10 pays 0.6/0.3/0.1 (the 5% row still binds a small group)', () => {
  const cs = crowd(R, [60, 30, 10]);
  assert.deepEqual(cs.map((c) => [c.reason, c.payShare]), [['paid', 0.6], ['paid', 0.3], ['paid', 0.1]]);
  assert.ok(Math.abs(sumShares(cs) - 1) < 1e-12);
});

test('CROWD FLOOR: the whale case: a whale at 50 and five players at 10 each are all paid; a 1% tag-along is still floored', () => {
  const cs = crowd(R, [50, 10, 10, 10, 10, 10]);
  assert.deepEqual(cs.map((c) => c.reason), Array(6).fill('paid'));
  assert.ok(Math.abs(sumShares(cs) - 1) < 1e-12);
  const tag = crowd(R, [1, 99]);   // 1% of the total, N = 2: floor = min(5, 25) = 5
  assert.deepEqual(tag.map((c) => [c.reason, c.paid]), [['floor', false], ['paid', true]]);
});

test('CROWD FLOOR: 21 equal players (each 4.76% < 5%) are ALL paid and the shares sum to 100%; before the fix nobody was paid', () => {
  const cs = crowd(R, Array(21).fill(1));
  assert.equal(cs.length, 21);
  assert.deepEqual([...new Set(cs.map((c) => c.reason))], ['paid']);
  assert.ok(Math.abs(sumShares(cs) - 1) < 1e-9, `shares sum to 1, got ${sumShares(cs)}`);
  for (const c of cs) assert.ok(Math.abs(c.payShare - 1 / 21) < 1e-12);
});

test('CROWD FLOOR: 100 equal players (1% each) are all paid and the shares sum to 100%', () => {
  const cs = crowd(R, Array(100).fill(1));
  assert.deepEqual([...new Set(cs.map((c) => c.reason))], ['paid']);
  assert.equal(cs.filter((c) => c.paid).length, 100);
  assert.ok(Math.abs(sumShares(cs) - 1) < 1e-9);
  const full = crowd(rules((r) => { r.share.floorEqualShareFraction = 1; }), Array(21).fill(1));
  assert.deepEqual([...new Set(full.map((c) => c.reason))], ['paid'], 'even at fraction 1 an exactly equal share clears the floor');
});

test('CROWD FLOOR: a 1-player kill pays that player 100%', () => {
  const cs = crowd(R, [40]);
  assert.deepEqual(cs.map((c) => [c.reason, c.paid, c.payShare, c.sharePct]), [['paid', true, 1, 100]]);
});

test('CROWD FLOOR: inside a crowd a real freeloader is still floored (30 players at 3, one at 1 of 91: floor = min(5, 0.5 x 100 / 31) = 1.61%)', () => {
  const cs = crowd(R, [1, ...Array(30).fill(3)]);
  assert.deepEqual([cs[0].reason, cs[0].paid], ['floor', false]);
  assert.deepEqual([...new Set(cs.slice(1).map((c) => c.reason))], ['paid']);
  assert.ok(Math.abs(sumShares(cs) - 1) < 1e-9);
});

test('KILL CAP LOGIC: one account killing on seven spawns at the same instant is paid on exactly killsPerMin of them; each settle counts every earlier credit (what the SQL advisory lock guarantees)', () => {
  const w = newWorld(rules((r) => { r.engage.maxOpenPerAccount = 16; }));
  const reasons = [];
  for (let i = 0; i < R.caps.killsPerMin + 1; i++) {
    engage(w, { account: A, character: 'ca', token: tok(A, i), instance: `z1:cap${i}`, layer: 1, kind: 'minotaur', maxHp: 20, respawnS: 300 }, 5000);
    reasons.push(hit(w, { account: A, token: tok(A, i), weapon: 'gladius', claimed: 20, hits: 1, layer: 1 }, 5000).credits[0].reason);
  }
  assert.deepEqual(reasons, [...Array(R.caps.killsPerMin).fill('paid'), 'cap']);
  assert.equal(w.credits.filter((c) => c.account === A && c.paid).length, R.caps.killsPerMin, 'never overshot');
});

test('LOCK ORDER (model side): an expiry sweep on one spawn does not touch the same account\'s tokens on another spawn, and expired tokens do not count toward the open limit', () => {
  const w = newWorld(R);
  eng(w, A, 0, { instance: 'z1:a', n: 1 });
  const t = R.engage.ttlS * 1000 + 1;
  eng(w, A, t, { instance: 'z1:b', n: 2 });
  assert.equal(w.engages.get(tok(A, 1)).used, false, 'the other spawn\'s expired token was not swept by this engage');
  assert.equal(w.engages.get(tok(A, 1)).result, null);
  for (let i = 0; i < R.engage.maxOpenPerAccount - 1; i++) assert.ok(eng(w, A, t, { instance: `z1:f${i}`, n: 10 + i }).token, 'the expired token is not counted: this fills the limit exactly');
  assert.equal(eng(w, A, t, { instance: 'z1:over', n: 99 }).refused, 'too-many');
});

test('hit expiry: a hit older than hitExpiryS at the kill took hp but earns nothing; 119.9 s still counts', () => {
  const kill = (gapMs) => {
    const w = newWorld(R);
    eng(w, A, 0); swing(w, A, 30, 1, 0);
    eng(w, B, gapMs);
    const k = swing(w, B, 70, 2, gapMs);
    assert.equal(k.killed, true, 'A\'s expired hit still reduced hp');
    return k.credits;
  };
  const late = kill(130_000);
  assert.deepEqual(late.map((c) => [c.account, c.payShare]), [[B, 1]], 'A is out');
  assert.deepEqual(kill(120_000).map((c) => c.account), [B], 'exactly hitExpiryS old is expired');
  const near = kill(119_900);
  assert.deepEqual(near.map((c) => [c.account, c.sharePct]), [[A, 30], [B, 70]]);
});

test('respawn_at = now + the spawn\'s respawn seconds; dead until then; the next life is a new generation at full hp', () => {
  const w = newWorld(R);
  eng(w, A, 1000);
  const k = swing(w, A, 100, 3, 1000);
  assert.equal(k.killed, true);
  assert.equal(k.respawnAtMs, 1000 + 300 * 1000);
  assert.equal(spawn(w).alive, false);
  assert.equal(view(w, spawn(w), 100_000).alive, false);
  assert.deepEqual(eng(w, B, 100_000), { refused: 'dead', respawnAtMs: 301_000 });
  assert.equal(view(w, spawn(w), 301_000).generation, 1, 'reads as alive again at its respawn time');
  const back = eng(w, B, 301_000);
  assert.equal(back.generation, 1);
  assert.equal(back.hp, 100);
  // the token of the first life was closed by the kill: it cannot hit the new life
  assert.throws(() => swing(w, A, 10, 1, 302_000), (e) => e.code === 'O0009');
  assert.equal(spawn(w).hp, 100);
  // and a token that somehow outlives its life (not closed) is answered 'dead', never applied to the new one
  w.engages.get(tok(A)).used = false; w.engages.get(tok(A)).expiresAtMs = 10 ** 12;
  assert.equal(swing(w, A, 10, 1, 303_000).refused, 'dead');
  assert.equal(spawn(w).hp, 100);
});

test('credit is per life: the second life starts from an empty ledger', () => {
  const w = newWorld(R);
  eng(w, A, 0); swing(w, A, 100, 3, 0);
  eng(w, A, 300_000, { n: 1 });
  eng(w, B, 300_000);
  swing(w, B, 100, 3, 300_000);
  const second = w.credits.filter((c) => c.generation === 1);
  assert.deepEqual(second.map((c) => [c.account, c.sharePct]), [[B, 100]], 'A\'s first-life damage is not in the second life');
});

test('respawn seconds are the spawn row\'s, pinned at the first engage and clamped; a later engage that disagrees is refused', () => {
  const w = newWorld(R);
  eng(w, A, 0, { respawnS: 1 });
  assert.equal(spawn(w).respawnS, R.respawn.minS);
  assert.ok(eng(w, B, 0, { respawnS: 1 }).token, 'the same row clamps to the same pinned seconds');
  assert.equal(eng(w, C, 0, { respawnS: 60 }).refused, 'mismatch', 'respawn seconds fixed at the first engage');
  assert.equal(eng(w, B, 0, { maxHp: 5000 }).refused, 'mismatch', 'max hp fixed at the first engage');
  assert.equal(eng(w, B, 0, { kind: 'rat' }).refused, 'mismatch', 'kind fixed at the first engage');
  const w2 = newWorld(R);
  eng(w2, A, 0, { respawnS: 10 ** 9 });
  assert.equal(spawn(w2).respawnS, R.respawn.maxS);
});

test('the phone only claims: damage is capped by weapon rows, real elapsed time and the hp left', () => {
  const w = newWorld(R);
  eng(w, A, 0, { maxHp: 10000 });   // a bar too big to die, so the cap (not the hp) is what limits the claim
  const cap = weaponCaps(R).get('gladius');
  const first = swing(w, A, 1e9, 1000, 0);
  const allowed = Math.min(R.hit.maxHitsPerRow, Math.ceil(cap.maxHitsPerS * R.hit.firstHitAllowanceS * R.hit.dpsSlack));
  assert.equal(first.applied, Math.min(allowed * cap.maxDamage, cap.maxDamage * cap.maxHitsPerS * R.hit.firstHitAllowanceS * R.hit.dpsSlack, 10000));
  assert.ok(first.applied < 1e9 && first.killed === false);
  assert.equal(swing(w, A, 50, 1, 0).applied, 0, 'zero real time since the last report allows nothing');
  const w2 = newWorld(R);
  eng(w2, A, 0, { maxHp: 10000 });
  swing(w2, A, 1, 1, 0);
  const gap = swing(w2, A, 1e9, 1000, 100_000);   // 100 s later (inside the token's life): a long gap banks at most maxElapsedS
  assert.ok(gap.applied <= cap.maxDamage * cap.maxHitsPerS * R.hit.maxElapsedS * R.hit.dpsSlack + 1e-9);
  assert.equal(swing(w2, A, -5, 1, 100_000 + 5_000).applied, 0, 'negative claims apply nothing');
  assert.equal(hit(w2, { account: A, token: tok(A), weapon: 'warhammer', claimed: 5, hits: 1, layer: 1 }, 110_000).refused, 'weapon');
});

test('a layer change mid-fight is "moved": refused, nothing written, the token stays open; layers are separate bars', () => {
  const w = newWorld(R);
  eng(w, A, 0);
  const moved = swing(w, A, 10, 1, 1000, { layer: 2 });
  assert.equal(moved.refused, 'moved');
  assert.equal(spawn(w).hp, 100);
  assert.equal(w.hits.length, 0);
  assert.equal(swing(w, A, 10, 1, 2000).hp, 90, 'the same token still works on its own layer');
  eng(w, B, 0, { layer: 2 });
  assert.equal(spawn(w, inst, 2).hp, 100, 'layer 2 has its own bar');
  assert.equal(w.spawns.size, 2);
});

test('a batch: a failing row is reported in its slot and does not stop the others; rows apply in order', () => {
  const w = newWorld(R);
  eng(w, A, 0); eng(w, B, 0);
  const rows = [
    { account: A, token: tok(A), weapon: 'gladius', claimed: 30, hits: 1, layer: 1 },
    { account: B, token: 'tok-not-engaged-aaaaaaaaaaaa', weapon: 'gladius', claimed: 30, hits: 1, layer: 1 },
    { account: B, token: tok(B), weapon: 'gladius', claimed: 30, hits: 1, layer: 1 },
  ];
  const r = hitBatch(w, 'batch-0001-aaaa', rows, 0);
  assert.equal(r.replayed, false);
  assert.deepEqual(r.results.map((x) => x.hp ?? x.error), [70, 'O0009', 40]);
});

test('a failed batch is never retried: a resent batch id applies nothing and returns the stored receipt', () => {
  const w = newWorld(R);
  eng(w, A, 0);
  const rows = [{ account: A, token: tok(A), weapon: 'gladius', claimed: 30, hits: 1, layer: 1 }];
  const first = hitBatch(w, 'batch-0002-aaaa', rows, 0);
  const again = hitBatch(w, 'batch-0002-aaaa', rows, 5000);
  assert.equal(again.replayed, true);
  assert.deepEqual(again.results, first.results);
  assert.equal(spawn(w).hp, 70, 'applied once, not twice');
  assert.equal(R.hit.retryFailedBatch, false);
});

test('a batch is bounded and its id must be well formed', () => {
  const w = newWorld(R);
  assert.throws(() => hitBatch(w, 'batch-0003-aaaa', new Array(R.hit.maxBatchRows + 1).fill({}), 0), /at most 200 rows/);
  assert.throws(() => hitBatch(w, 'x', [], 0), /batch id/);
  assert.equal(w.batches.size, 0, 'a refused batch spends no id');
});

test('kill caps: a capped contributor is recorded unpaid ("cap") and the others\' shares do not move', () => {
  const w = newWorld(rules((r) => { r.caps.killsPerMin = 1; }));
  const one = { instance: 'z1:a', maxHp: 20 }, two = { instance: 'z1:b', maxHp: 20 };
  eng(w, A, 0, { ...one }); swing(w, A, 20, 1, 0);
  assert.equal(w.credits.at(-1).paid, true);
  eng(w, A, 1000, { ...two, n: 1 }); eng(w, B, 1000, { ...two });
  hit(w, { account: A, token: tok(A, 1), weapon: 'gladius', claimed: 10, hits: 1, layer: 1 }, 1000);
  const k = hit(w, { account: B, token: tok(B), weapon: 'gladius', claimed: 10, hits: 1, layer: 1 }, 1000);
  const by = Object.fromEntries(k.credits.map((c) => [c.account, c]));
  assert.deepEqual([by[A].paid, by[A].reason], [false, 'cap']);
  assert.deepEqual([by[B].paid, by[B].payShare], [true, 0.5], 'B keeps its true share; A\'s is not given to B');
  // a minute later the minute cap is clear
  eng(w, A, 62_000, { instance: 'z1:c', maxHp: 20, n: 2 });
  assert.equal(hit(w, { account: A, token: tok(A, 2), weapon: 'gladius', claimed: 20, hits: 1, layer: 1 }, 62_000).credits[0].paid, true);
});

test('the per-hour cap counts paid kills over an hour', () => {
  const w = newWorld(rules((r) => { r.caps.killsPerMin = 60; r.caps.killsPerHour = 2; }));
  const paid = [];
  for (let i = 0; i < 3; i++) {
    const t = i * 120_000, ins = `z1:m${i}`;
    eng(w, A, t, { instance: ins, maxHp: 20, n: i });
    paid.push(hit(w, { account: A, token: tok(A, i), weapon: 'gladius', claimed: 20, hits: 1, layer: 1 }, t).credits[0].reason);
  }
  assert.deepEqual(paid, ['paid', 'paid', 'cap']);
});

test('cooldown across layers: paid for a spawn in one layer, not again in another inside the respawn window', () => {
  const w = newWorld(R);
  eng(w, A, 0, { maxHp: 20 }); const k1 = swing(w, A, 20, 1, 0);
  assert.equal(k1.credits[0].paid, true);
  eng(w, A, 5000, { maxHp: 20, layer: 2, n: 1 });
  const k2 = hit(w, { account: A, token: tok(A, 1), weapon: 'gladius', claimed: 20, hits: 1, layer: 2 }, 5000);
  assert.equal(k2.credits[0].reason, 'cooldown');
  assert.equal(k2.credits[0].paid, false);
  // after the respawn window it pays again
  eng(w, A, 400_000, { maxHp: 20, layer: 2, n: 2 });
  const k3 = hit(w, { account: A, token: tok(A, 2), weapon: 'gladius', claimed: 20, hits: 1, layer: 2 }, 400_000);
  assert.equal(k3.credits[0].paid, true);
});

test('engage: one open token per account per spawn (re-engage returns it), at most maxOpenPerAccount open, touch extends', () => {
  const w = newWorld(R);
  const e1 = eng(w, A, 0), e2 = eng(w, A, 1000, { n: 9 });
  assert.equal(e2.token, e1.token, 're-engaging the same life returns the open token');
  assert.equal(w.engages.size, 1);
  for (let i = 0; i < R.engage.maxOpenPerAccount - 1; i++) assert.ok(eng(w, A, 0, { instance: `z1:x${i}`, n: i + 1 }).token);
  assert.equal(eng(w, A, 0, { instance: 'z1:overflow', n: 50 }).refused, 'too-many');
  const t = touch(w, A, e1.token, 100_000);
  assert.equal(t.expiresAtMs, 100_000 + R.engage.ttlS * 1000);
  assert.throws(() => touch(w, B, e1.token, 100_000), (e) => e.code === 'O0009', 'another account\'s token is not found');
  assert.throws(() => touch(w, A, e1.token, 100_000 + R.engage.ttlS * 1000 + 1), (e) => e.code === 'O0009', 'expired');
});

test('kill_report is read-only and idempotent: it cannot kill; it returns the stored receipt', () => {
  const w = newWorld(R);
  eng(w, A, 0); eng(w, B, 0);
  swing(w, A, 30, 1, 0);
  const alive = killReport(w, A, tok(A), 0);
  assert.equal(alive.state, 'alive');
  assert.equal(spawn(w).hp, 70, 'reporting a kill did not touch hp');
  swing(w, B, 70, 2, 0);
  const r1 = killReport(w, A, tok(A), 10), r2 = killReport(w, A, tok(A), 20);
  assert.deepEqual(r1, r2);
  assert.deepEqual([r1.state, r1.paid, r1.sharePct, r1.payShare], ['settled', true, 30, 0.3]);
  assert.throws(() => killReport(w, C, tok(A), 0), (e) => e.code === 'O0009');
});

test('settle is a pure read of the hit log: no hits, no credit rows; prune drops old log rows but not credit', () => {
  const w = newWorld(R);
  eng(w, A, 0);
  assert.deepEqual(settle(w, spawn(w), 1000), []);
  swing(w, A, 100, 3, 0);
  const n = w.credits.length;
  prune(w, R.log.keepS * 1000 + 1);
  assert.equal(w.hits.length, 0);
  assert.equal(w.credits.length, n, 'the payment record stays');
});
