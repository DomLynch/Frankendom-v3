// THE ACCOUNTANT'S PARRY WALL (data/mechanics.json accountant-parry-wall, src/fight/mechanics/): the rows validate and a bad one is refused; the three lists (data, code registry, checkers) name the same ids;
// the ring row names it and the kind's fight carries it (and no other kind does); the wall's window, cooldown, parry (ZERO damage), tell cancel, kick break, special break, behind-the-back blow, death drop and
// a golden weapon's parry are pinned on the real duel step; a fight without a mechanic is untouched; and the same fight twice is the same bytes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFile, validateMechanics } from '../src/sim/validate.js';
import { validateRings } from '../src/sim/validate-rings.js';
import { MECHANICS } from '../src/fight/mechanics/index.ts';
import { SIM_HOOKS, configureSimMechanics, mechCaption, mechIntercept, mechSpecialLanded } from '../src/fight/mechanics/sim-hooks.ts';
import { ID, ROW, stageOf } from '../src/fight/mechanics/accountant-parry-wall.ts';
import { OPPONENTS } from '../src/fight/moves.ts';
import { initialDuel, stepDuel, idleIntent } from '../src/fight/duel.ts';
import { kindFightFor } from '../src/fight/spawn-kind.ts';
import { ROWS as COMMENTS } from '../src/commentator.ts';

const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const RAW = read('mechanics'), RINGS = read('rings'), PROFILES = read('profiles'), FIGHT = read('fight'), DIFF = read('difficulty'), BRAINS = read('brains');
configureSimMechanics(RAW.mechanics);   // the driver's call (src/client/main.ts): the sim imports no data/ json, so a mechanic is inert until its row is laid in
const clone = (x) => JSON.parse(JSON.stringify(x));
const it = (o = {}) => ({ ...idleIntent(), ...o });
const WALL = { ...OPPONENTS.shieldmaiden, mechanic: ID };

test('the shipped row validates; a bad row, an unknown key and an id with no checker are refused', () => {
  assert.deepEqual(validateFile('mechanics', RAW), []);
  const bad = (edit) => { const r = clone(RAW); edit(r.mechanics[ID]); return validateMechanics(r).filter((m) => m.startsWith(`mechanics.${ID}`)); };
  assert.match(bad((r) => { r.tellTicks = 5; })[0], /tellTicks/);
  assert.match(bad((r) => { r.wallTicks = 9999; })[0], /wallTicks/);
  assert.match(bad((r) => { r.cooldownTicks = r.wallTicks; })[0], /cooldownTicks/);
  assert.match(bad((r) => { r.arcDeg = 360; })[0], /arcDeg/);
  assert.match(bad((r) => { r.fx.colour = 'gold'; })[0], /fx.colour/);
  assert.match(bad((r) => { r.extra = 1; })[0], /extra: unknown key/);
  assert.match(bad((r) => { delete r.parriesToDrop; })[0], /parriesToDrop/);
  assert.match(validateFile('mechanics', { ...RAW, extra: 1 })[0], /unknown key/);
  const stray = clone(RAW); stray.mechanics.spin = { type: 'spin' };
  assert.match(validateMechanics(stray).join('\n'), /spin\.type: one of/);
  assert.match(validateMechanics(RAW, ['nobody']).join('\n'), new RegExp(`${ID}.boss: no data/profiles.json row`));
  assert.deepEqual(validateMechanics(RAW, PROFILES.profiles.map((p) => p.id)), []);
});

test('data, the registry line and the sim hooks name the same mechanic; the ring row names one that exists; the caption is a commentator event', () => {
  const data = Object.keys(RAW.mechanics).sort();
  assert.ok(MECHANICS[RAW.mechanics[ID].type], 'one registry line in src/fight/mechanics/index.ts');
  assert.equal(RAW.mechanics[ID].type, ID);
  for (const id of Object.keys(SIM_HOOKS)) assert.ok(data.includes(id), `${id}: a sim-hooks module has a data/mechanics.json row`);
  assert.ok(Object.keys(SIM_HOOKS).includes(ID));
  const named = RINGS.bosses.filter((b) => b.mechanic !== null);
  for (const b of named) assert.ok(data.includes(b.mechanic), `${b.kind}: ${b.mechanic} is a mechanics row`);
  assert.equal(RINGS.bosses.find((b) => b.kind === ROW.boss).mechanic, ID, 'the Accountant row names the wall');
  assert.ok(COMMENTS.events[ROW.caption], 'the caption is a data/commentator.json event');
  const refuse = (m) => { const r = clone(RINGS); r.bosses[0].mechanic = m; return validateRings(r, read('zones/zone1.row'), { x: 0, z: 0 }, [], read('rig'), []).filter((e) => /mechanic/.test(e)); };
  assert.equal(refuse('spin').length >= 1, true, 'an id that is no mechanic is refused');
});

test('the Accountant kind fights with the wall; no other kind, and not ?pitborn=v1', () => {
  const ctx = (search = '', over = {}) => ({ profiles: PROFILES.profiles, difficulty: DIFF, brains: BRAINS.brains, pick: DIFF.default, search, level: FIGHT.level, ai: FIGHT.ai, override: null, weapon: FIGHT.weapon, skill: FIGHT.skill, skill2: FIGHT.skill2, stance: FIGHT.stance, specials: FIGHT.specials, ...over });
  assert.equal(kindFightFor('the-boss', ctx()).opponent.mechanic, ID);
  assert.equal(kindFightFor('the-boss', ctx(), 2).opponent.mechanic, ID, 'a star instance too (#239: stars scale health and damage, never the wall)');
  for (const p of PROFILES.profiles.filter((p) => p.id !== 'the-boss')) assert.equal(kindFightFor(p.id, ctx()).opponent.mechanic, undefined, `${p.id} has none`);
  assert.equal(kindFightFor('the-boss', ctx('?pitborn=v1', { override: FIGHT.opponentV1.opponent })).opponent.mechanic, undefined);
});

// A standing Accountant, the hero in reach and ready; `edit` lays the first cooldown down so the wall starts at once.
function stand(edit, opponent = WALL, weapon) {
  let d = initialDuel(opponent, weapon);
  d = stepDuel(d, [it({ action: 'light' }), it()]);
  for (let i = 0; i < 60; i++) d = stepDuel(d, [it(), it()]);
  for (let i = 0; i < 300; i++) {
    const [a, b] = d.fighters;
    if (Math.hypot(a.body.x - b.body.x, a.body.z - b.body.z) < 1.2) break;
    d = stepDuel(d, [it({ move: { x: 0, z: -1, yaw: 0, run: false } }), it()]);
  }
  return edit ? edit(d) : d;
}
const ready = (d) => { const f = clone(d.fighters[1]); delete f.mC; return { ...d, fighters: [d.fighters[0], f] }; };
const step = (d, hero = it()) => stepDuel(d, [hero, it()]);
function until(d, pred, max = 600) { for (let i = 0; i < max && !pred(d); i++) d = step(d); return d; }

test('the first cooldown holds the wall off; then he plants his feet: the tell, then the window, and he neither moves nor swings', () => {
  let d = stand();
  assert.ok(d.fighters[1].mC > 0 && !d.fighters[1].mS, 'the first cooldown runs');
  d = ready(d);
  d = step(d);
  assert.equal(d.fighters[1].mS, 1, 'the wall starts on the first tick he can');
  assert.equal(mechCaption(d.fighters[1]), ROW.caption, 'the caption is said on that first tick');
  const home = { x: d.fighters[1].body.x, z: d.fighters[1].body.z };
  for (let t = 2; t <= ROW.tellTicks + ROW.wallTicks; t++) {
    d = step(d);
    assert.equal(d.fighters[1].mS, t);
    assert.equal(d.fighters[1].phase, 'ready', 'planted, not attacking');
    assert.deepEqual({ x: d.fighters[1].body.x, z: d.fighters[1].body.z }, home, 'no step');
    assert.equal(stageOf(d.fighters[1]), t > ROW.tellTicks ? 'up' : 'tell');
    assert.equal(mechCaption(d.fighters[1]), null, 'said once');
  }
  d = step(d);
  assert.equal(d.fighters[1].mS, undefined, 'the window ends');
  assert.equal(d.fighters[1].mC, ROW.cooldownTicks, 'the cooldown starts');
  const cooling = until(step(d), (x) => !x.fighters[1].mC, ROW.cooldownTicks + 5);
  assert.equal(cooling.tick - d.tick, ROW.cooldownTicks, 'exactly the cooldown, then it is ready');
  assert.equal(step(cooling).fighters[1].mS, 1, 'and he raises it again with the hero in reach');
});

test('a blow in the window is parried for ZERO damage; sparks (Parried with wall); the attacker staggers; after the last parry the wall drops', () => {
  let d = until(ready(stand()), (x) => x.fighters[1].mS > ROW.tellTicks);
  const hp = d.fighters[1].health, heroHp = d.fighters[0].health;
  let parries = 0;
  for (let n = 0; n < ROW.parriesToDrop; n++) {
    d = until(d, (x) => x.fighters[0].phase === 'ready', 200);
    let got = null;
    d = step(d, it({ action: 'light' }));
    for (let i = 0; i < 90 && !got; i++) { got = d.events.find((e) => e.type === 'Parried'); if (!got) d = step(d); }
    assert.ok(got, `parry ${n + 1}`); assert.equal(got.wall, true); assert.equal(got.actor, 1); assert.equal(got.target, 0);
    parries++;
    assert.ok(!d.events.some((e) => e.type === 'Hit' && e.target === 1), 'no Hit on him');
    assert.equal(d.fighters[1].health, hp, 'zero damage');
    assert.equal(d.fighters[0].phase, 'hurt', 'the attacker staggers');
    assert.ok(d.fighters[1].punish > 0, 'his riposte opens');
  }
  assert.equal(parries, ROW.parriesToDrop);
  assert.equal(d.fighters[1].mS, undefined, 'the wall dropped on the last parry');
  assert.equal(d.fighters[1].mC, ROW.cooldownTicks);
  assert.equal(d.fighters[0].health, heroHp, 'the wall dealt nothing to the hero either');
});

test('a golden weapon is parried too: the wall reads the move, never the blade', () => {
  const weapons = ['longsword', 'gladius'];
  for (const w of weapons) {
    let d = until(ready(stand(undefined, WALL, w)), (x) => x.fighters[1].mS > ROW.tellTicks);
    const hp = d.fighters[1].health;
    d = step(d, it({ action: 'light' }));
    let got; for (let i = 0; i < 90 && !got; i++) { got = d.events.find((e) => e.type === 'Parried' && e.wall); if (!got) d = step(d); }
    assert.ok(got, `${w}: parried`); assert.equal(d.fighters[1].health, hp, `${w}: zero damage`);
  }
});

test('a blow in the TELL lands in full and cancels the wall (a shorter cooldown)', () => {
  let d = until(ready(stand()), (x) => x.fighters[1].mS >= 3);
  assert.ok(d.fighters[1].mS <= ROW.tellTicks);
  const hp = d.fighters[1].health;
  d = step(d, it({ action: 'light' }));
  let hit; for (let i = 0; i < 60 && !hit; i++) { hit = d.events.find((e) => e.type === 'Hit' && e.target === 1); if (!hit) d = step(d); }
  assert.ok(hit && hit.damage > 0, 'the blow landed');
  assert.ok(d.fighters[1].health < hp);
  assert.equal(d.fighters[1].mS, undefined, 'the wall is gone');
  assert.ok(d.fighters[1].mC > ROW.cancelCooldownTicks - 20 && d.fighters[1].mC <= ROW.cancelCooldownTicks, 'the cancel cooldown');
});

test('a KICK breaks the wall: no damage, he staggers, the cooldown runs', () => {
  let d = until(ready(stand()), (x) => x.fighters[1].mS > ROW.tellTicks);
  const hp = d.fighters[1].health;
  d = step(d, it({ action: 'kick' }));
  let broke; for (let i = 0; i < 60 && !broke; i++) { broke = d.events.find((e) => e.type === 'Staggered' && e.actor === 1 && e.wall); if (!broke) d = step(d); }
  assert.ok(broke, 'the wall broke'); assert.equal(broke.ticks, ROW.kickBreakStunTicks);
  assert.equal(d.fighters[1].health, hp); assert.equal(d.fighters[1].mS, undefined); assert.equal(d.fighters[1].phase, 'hurt');
  assert.equal(d.fighters[1].mC, ROW.cooldownTicks);
});

test('a hero SPECIAL breaks the wall; a blow from behind the front arc lands; a dying boss drops it; a fighter with no mechanic is untouched', () => {
  const standing = until(ready(stand()), (x) => x.fighters[1].mS > ROW.tellTicks).fighters[1];
  const broken = clone(standing); mechSpecialLanded(broken);
  assert.equal(broken.mS, undefined); assert.equal(broken.phase, 'hurt'); assert.equal(broken.stun >= ROW.specialBreakStunTicks, true); assert.equal(broken.mC, ROW.cooldownTicks);
  const D = clone(standing);
  assert.equal(mechIntercept(D, standing, 'light_right', 0), 'parry');
  assert.equal(mechIntercept(D, standing, 'kick', 0), 'break');
  assert.equal(mechIntercept(clone(standing), standing, 'light_right', (ROW.arcDeg * Math.PI) / 360 + 0.01), null, 'outside the arc it lands');
  assert.equal(mechIntercept(clone(standing), standing, 'light_right', (ROW.arcDeg * Math.PI) / 360 - 0.01), 'parry', 'inside it is parried');
  const dying = until(ready(stand()), (x) => x.fighters[1].mS > ROW.tellTicks);
  const dead = { ...dying, fighters: [dying.fighters[0], { ...dying.fighters[1], health: 0 }] };
  assert.equal(step(dead).fighters[1].mS, undefined, 'the same tick');
  let plain = stand(undefined, OPPONENTS.shieldmaiden);
  for (let i = 0; i < 700; i++) plain = step(plain);
  for (const f of plain.fighters) for (const k of ['mech', 'mS', 'mC', 'mN']) assert.ok(!(k in f), `${k} absent without a mechanic`);
});

test('the same fight twice is the same bytes (no clock, no random)', () => {
  const run = () => { let d = ready(stand()); const log = []; for (let i = 0; i < 400; i++) { d = step(d, i % 70 === 40 ? it({ action: 'light' }) : it()); log.push(d.fighters[1].mS ?? 0, d.fighters[1].mC ?? 0, d.fighters[0].health, d.fighters[1].health, d.events.length); } return JSON.stringify([log, d.fighters]); };
  assert.equal(run(), run());
});

test('the wall is DRAWN in the built scene: scene.ts builds createWallFx and feeds it every frame, and the fx shows a wall while the stage is up', async () => {
  const src = readFileSync(new URL('../src/fight/scene.ts', import.meta.url), 'utf8');
  assert.match(src, /import \{ createWallFx \} from '\.\/mechanics\/accountant-parry-wall-fx\.ts'/, 'scene.ts must import createWallFx (zone-fx.ts is not called by anything in src/)');
  assert.match(src, /const wallFx = createWallFx\(scene\)/, 'scene.ts must build the wall fx on its scene');
  assert.match(src, /wallFx\.update\(practice\.duel\.fighters\[1\]/, 'scene.ts must feed the wall fx the foe every frame');
  const THREE = await import('three');
  const { createWallFx } = await import('../src/fight/mechanics/accountant-parry-wall-fx.ts');
  const scene = new THREE.Scene(), fx = createWallFx(scene);
  assert.ok(scene.children.length >= 2, 'the fx adds its wall group and spark points to the scene');
  const at = new THREE.Vector3(1, 0, 2), boss = { mech: ID, mS: ROW.tellTicks + 5 };
  fx.update(boss, at, 0, [], 1, 1 / 60);
  const group = scene.children.find((c) => c.type === 'Group');
  assert.equal(group.visible, true, 'wall up: drawn');
  assert.ok(group.children.some((c) => c.material && c.material.opacity > 0), 'wall up: something opaque');
  fx.update(boss, at, 0, [{ type: 'Parried', wall: true }], 2, 1 / 60);
  const sparks = scene.children.find((c) => c.type === 'Points');
  assert.ok(sparks.geometry.attributes.position.array.some((v, i) => i % 3 === 1 && v > -50), 'a parry throws sparks');
  fx.update({ mech: ID, mS: 0 }, at, 0, [], 3, 1 / 60);
  assert.equal(group.visible, false, 'wall down: hidden');
});
