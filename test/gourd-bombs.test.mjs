// LORD GOURD, PUMPKIN BOMBS (data/mechanics.json "gourd", src/fight/mechanics/gourd-bombs.ts; Dom 2026-10-28: each boss its own fighting identity). The rows, the timeline (stomp -> lob -> fuse -> burst), the radius, the damage
// (the boss's own move row through the rows' shares), the roll and the guard, the cooldown, the wipe when the fight ends, the registry, and the same through a real Practice (health floor, shove, never a finish).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFile, validateMechanics, checkGourdBombs } from '../src/sim/validate.js';
import { createGourdBombs, createGourdBombsRuntime, newCtx, GOURD, BOMB } from '../src/fight/mechanics/gourd-bombs.ts';
import { createMechanics, MECHANICS } from '../src/fight/mechanics/index.ts';
import { OPPONENTS, opponentAt } from '../src/fight/moves.ts';
import { initialPractice } from '../src/fight/combat.ts';
import { movesOf } from '../src/fight/duel.ts';
import { WEAPONS } from '../src/fight/moves.ts';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const FILE = read('mechanics'), PROFILES = read('profiles'), RINGS = read('rings');
const kinds = PROFILES.profiles.map((p) => p.id), moves = Object.keys(Object.values(WEAPONS)[0].moves);
const DT = 1 / 60;

const ctx = (over = {}) => ({ ...newCtx(), active: true, bossX: 0, bossZ: 0, bossShare: 1, heroX: 5, heroZ: 0, damage: 20, ...over });
/** Steps `core` for `secs` seconds with `c` (a function of the time may change it); returns the totals. */
function run(core, secs, c, each) {
  const tot = { damage: 0, hit: 0, dodged: 0, hitAt: [], shoveX: 0, shoveZ: 0 };
  for (let i = 0; i < Math.round(secs / DT); i++) {
    if (each) each(i * DT, c);
    const o = core.tick(DT, c);
    tot.damage += o.damage; tot.hit += o.hit; tot.dodged += o.dodged; tot.shoveX += o.shoveX; tot.shoveZ += o.shoveZ;
    if (o.hit || o.dodged) tot.hitAt.push(+(i * DT).toFixed(2));
  }
  return tot;
}
const live = (core) => [...core.view.state].filter((s) => s !== BOMB.free).length;

test('the shipped rows validate, the boss is a profile, the move is a weapon move, and bad rows are refused', () => {
  assert.deepEqual(validateFile('mechanics', FILE), []);
  assert.deepEqual(validateMechanics(FILE, kinds, moves), []);
  assert.equal(FILE.mechanics.gourd.boss, 'pumpkinhulk');
  const bad = (patch, re) => { const f = clone(FILE); patch(f.mechanics.gourd); assert.match(validateMechanics(f, kinds, moves).join('\n'), re); };
  bad((r) => { r.radiusMetres = 0; }, /radiusMetres/);
  bad((r) => { r.fuseSeconds = -1; }, /fuseSeconds/);
  bad((r) => { r.damageMove = 'no_such_move'; }, /damageMove/);
  bad((r) => { r.lethal = true; }, /lethal/);
  bad((r) => { r.countLow = 1; r.count = 3; }, /countLow/);
  bad((r) => { r.pool = 2; }, /pool/);
  bad((r) => { r.cooldownSeconds = 1; }, /cooldownSeconds/);
  bad((r) => { r.look.core = 'orange'; }, /look\.core/);
  bad((r) => { r.look.sparkle = 1; }, /look\.sparkle/);
  bad((r) => { r.mystery = 1; }, /mystery: unknown key/);
  bad((r) => { r.boss = 'nobody'; }, /no data\/profiles\.json row/);
  bad((r) => { r.type = 'spin'; }, /type/);
  const two = clone(FILE); two.mechanics.gourd2 = clone(two.mechanics.gourd);
  assert.match(validateMechanics(two, kinds, moves).join('\n'), /already has the row gourd/);
  assert.match(validateMechanics({ mechanics: [] }, kinds, moves).join('\n'), /map/);
  assert.ok(checkGourdBombs('x', { ...GOURD, look: undefined }).some((m) => /look: missing/.test(m)));
  assert.equal(RINGS.bosses.find((b) => b.kind === 'pumpkinhulk').mechanic, 'gourd');
});

test('the timeline: first stomp at firstSeconds, the lob a stomp later, the burst flight + fuse after that, on the hero who stood still', () => {
  const core = createGourdBombs(), c = ctx();
  const t = run(core, 12, c);
  const first = GOURD.firstSeconds + GOURD.stompSeconds + GOURD.flightSeconds + GOURD.fuseSeconds;
  assert.equal(t.hit, 1, 'one gourd lands on his spot; the others land a scatter away and miss');
  assert.ok(Math.abs(t.hitAt[0] - first) <= 3 * DT, `the burst came at ${t.hitAt[0]} s, not ${first}`);
  assert.equal(Math.round(t.damage), 20, 'the whole of the ctx damage, nothing else');
});

test('the rings are the row radius: a hero just outside is missed, just inside is hit (counting his own radius)', () => {
  const reach = GOURD.radiusMetres + GOURD.heroRadiusMetres;
  for (const [offset, hit] of [[-0.05, 1], [0.05, 0]]) {
    const core = createGourdBombs(), c = ctx();
    // stand still until the lob (the first gourd is on his spot), then step sideways to `reach + offset` from it
    const t = run(core, 8, c, (s) => { if (s > GOURD.firstSeconds + GOURD.stompSeconds + 3 * DT) c.heroZ = reach + offset; });
    assert.equal(t.hit, hit, `at ${reach + offset} m from the ring's centre`);
  }
});

test('a hero who keeps walking is never under a ring when it bursts (the aim is taken at the lob)', () => {
  const core = createGourdBombs(), c = ctx({ heroX: 5 });
  const t = run(core, 40, c, (s) => { c.heroX = 5 + s * 6; });
  assert.equal(t.hit, 0);
  assert.equal(t.damage, 0);
});

test('a roll inside its safe frames takes nothing; a raised guard takes the row share; the shove is the row knockback, away from the ring', () => {
  const rolled = run(createGourdBombs(), 8, ctx({ heroRoll: true }));
  assert.equal(rolled.damage, 0); assert.equal(rolled.dodged, 1); assert.equal(rolled.hit, 0);
  const guarded = run(createGourdBombs(), 8, ctx({ heroGuard: true }));
  assert.ok(Math.abs(guarded.damage - 20 * GOURD.guardShare) < 1e-9);
  const c = ctx({ heroX: 5, heroZ: 0 });   // the ring is on his spot at the lob; he then steps 0.5 m to its +z side, still inside it
  const open = run(createGourdBombs(), 8, c, (s) => { if (s > GOURD.firstSeconds + GOURD.stompSeconds + 3 * DT) c.heroZ = 0.5; });
  assert.ok(Math.abs(Math.hypot(open.shoveX, open.shoveZ) - GOURD.knockbackMetres) < 1e-6, 'the whole knockback, spread over the shove seconds');
  assert.ok(open.shoveZ > 0, 'away from the ring (the hero stood on its +z side)');
});

test('the cooldown: a stomp every cooldownSeconds after the last lob, and none while the hero is out of range or hurt', () => {
  const stomps = [];
  let was = 0;
  const core2 = createGourdBombs(), c2 = ctx({ heroRoll: true });
  for (let i = 0; i < Math.round(40 / DT); i++) { core2.tick(DT, c2); const now = core2.view.stomp >= 0 ? 1 : 0; if (now && !was) stomps.push(+(i * DT).toFixed(1)); was = now; }
  const step = GOURD.cooldownSeconds + GOURD.stompSeconds;
  assert.ok(Math.abs(stomps[0] - GOURD.firstSeconds) <= 0.1);
  for (let k = 1; k < stomps.length; k++) assert.ok(Math.abs(stomps[k] - stomps[k - 1] - step) <= 0.1, `stomps ${stomps.join(', ')}`);
  assert.ok(stomps.length >= 3);
  const far = run(createGourdBombs(), 30, ctx({ heroX: GOURD.engageMetres + 5 })); assert.equal(far.hit + far.dodged, 0, 'out of range: no stomp');
  const hurt = createGourdBombs(), ch = ctx({ heroHurt: true }); run(hurt, 30, ch); assert.equal(live(hurt), 0, 'a staggered hero is not stomped on'); assert.equal(hurt.view.stomp, -1);
});

test('under lowShare of his health he lobs countLow gourds, else count', () => {
  for (const [share, want] of [[1, GOURD.count], [GOURD.lowShare, GOURD.countLow]]) {
    const core = createGourdBombs(), c = ctx({ bossShare: share, heroRoll: true });
    run(core, GOURD.firstSeconds + GOURD.stompSeconds + 0.1, c);
    assert.equal(live(core), want);
  }
});

test('the fight ending wipes every gourd at once and rearms the first wait: no burst, no damage, nothing left over a corpse', () => {
  const core = createGourdBombs(), c = ctx();
  run(core, GOURD.firstSeconds + GOURD.stompSeconds + GOURD.flightSeconds + 0.3, c);   // rings on the ground, fuse burning
  assert.ok(live(core) > 0);
  c.active = false;
  const after = run(core, 6, c);
  assert.equal(live(core), 0); assert.equal(after.hit + after.dodged, 0); assert.equal(core.view.stomp, -1);
  c.active = true;
  const again = run(core, 8, c);   // a new fight starts from the first wait, not from the old fuse
  assert.ok(again.hitAt[0] > GOURD.firstSeconds);
});

test('the pool is the row size and a cast never overruns it; two runs of the same inputs are the same bytes', () => {
  const a = createGourdBombs(), b = createGourdBombs(), ca = ctx({ bossShare: 0.1, heroRoll: true }), cb = ctx({ bossShare: 0.1, heroRoll: true });
  assert.equal(a.view.state.length, GOURD.pool);
  run(a, 60, ca); run(b, 60, cb);
  assert.deepEqual([...a.view.x], [...b.view.x]); assert.deepEqual([...a.view.state], [...b.view.state]);
});

test('through a real Practice: the hero loses the move row x share, never reaches 0, is shoved, and the fight is not finished', () => {
  const p0 = initialPractice(7, opponentAt(OPPONENTS.pitborn, 18)), [h, f] = p0.duel.fighters;
  const placed = (hx) => ({ ...p0, duel: { ...p0.duel, fighters: [{ ...h, health: 3, body: { ...h.body, x: hx, z: 0 } }, { ...f, body: { ...f.body, x: 0, z: 0 } }] } });
  const rt = createGourdBombsRuntime();
  let p = placed(5);
  const base = movesOf(f)[GOURD.damageMove].damage * GOURD.damageShare;
  assert.ok(base > 0);
  let low = p.playerHealth, hits = 0, moved = 0;
  for (let i = 0; i < Math.round(9 / DT); i++) {
    const next = rt.tick(p, true, DT);
    if (next.duel.fighters[0].health < p.duel.fighters[0].health) hits++;
    moved = Math.max(moved, Math.abs(next.duel.fighters[0].body.x - 5));
    low = Math.min(low, next.playerHealth);
    p = next;
  }
  assert.equal(hits, 1);
  assert.equal(p.playerHealth, GOURD.floorHealth, 'a 3 hp hero is left at the floor, not killed');
  assert.equal(p.duel.fighters[0].health, p.playerHealth);
  assert.equal(p.finish, null);
  assert.ok(moved > 0 && moved <= GOURD.knockbackMetres + 1e-6, 'shoved by at most the knockback');
  assert.equal(p.fighter, p.duel.fighters[0].body, 'the view of his body follows');
});

test('through a real Practice: a boss that is down, a hero that is dead, or a finished fight runs nothing and returns the same object', () => {
  const p0 = initialPractice(7, opponentAt(OPPONENTS.pitborn, 18));
  const rt = createGourdBombsRuntime();
  const finished = { ...p0, finish: { victim: 1 } };
  for (let i = 0; i < Math.round(8 / DT); i++) assert.equal(rt.tick(finished, true, DT), finished);
  const down = { ...p0, duel: { ...p0.duel, fighters: [p0.duel.fighters[0], { ...p0.duel.fighters[1], health: 0 }] } };
  for (let i = 0; i < Math.round(8 / DT); i++) assert.equal(rt.tick(down, true, DT), down);
  for (let i = 0; i < Math.round(8 / DT); i++) assert.equal(rt.tick(p0, false, DT), p0, 'not this boss\'s fight');
  assert.equal(rt.core.view.stomp, -1); assert.equal(live(rt.core), 0);
});

test('the registry: one runtime per row, the fighting boss\'s runs and the others wipe, a row of an unknown type is refused', () => {
  assert.ok(MECHANICS['gourd-bombs']);
  const m = createMechanics();
  assert.ok(m.of('pumpkinhulk')); assert.equal(m.of('nobody'), undefined);
  assert.throws(() => createMechanics({ x: { type: 'no-such-type' } }), /no code for type/);
  const p0 = initialPractice(7, opponentAt(OPPONENTS.pitborn, 18));
  const rt = m.of('pumpkinhulk');
  for (let i = 0; i < Math.round(5 / DT); i++) m.tick({ ...p0, duel: { ...p0.duel, fighters: [{ ...p0.duel.fighters[0], body: { ...p0.duel.fighters[0].body, x: 4, z: 0 } }, { ...p0.duel.fighters[1], body: { ...p0.duel.fighters[1].body, x: 0, z: 0 } }] } }, 'pumpkinhulk', true, DT);
  assert.ok(rt.core.view.stomp >= 0 || live(rt.core) > 0, 'his fight: the stomp or the gourds are up');
  m.tick(p0, 'kachujin', true, DT);
  assert.equal(live(rt.core), 0); assert.equal(rt.core.view.stomp, -1, 'another boss is fighting: Lord Gourd\'s gourds are gone');
});
