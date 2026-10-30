// BOSS SIGNATURE MECHANICS (data/mechanics.json, src/fight/mechanics/reginald-limb-loss.ts): Sir Reginald's LIMB LOSS. His armour fails limb by limb at health shares that are rows; a lost limb takes a family of moves away
// (no sword arm = shield shoves only; no leg = no heavy, and he limps), shows as a missing piece in the cut GLB, and never breaks the corpse's cuts or the parts a cut yields.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFile, validateMechanics, checkReginaldLimbLoss } from '../src/sim/validate.js';
import { MECHANICS, createMechanics } from '../src/fight/mechanics/index.ts';
import { stepShaped } from '../src/fight/attacker-bout.ts';
import { ROW, anyLost, applyLimbs, bodyMechanicFor, limbFailed, limbIntent, limbLost, limbManifestProblems, limbTell, lostUnits, markLimbs } from '../src/fight/mechanics/reginald-limb-loss.ts';
import { PROFILES, initialPractice } from '../src/fight/combat.ts';
import { idleIntent, legal } from '../src/fight/duel.ts';
import { OPPONENTS } from '../src/fight/moves.ts';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const MECH = read('mechanics'), RINGS = read('rings'), PROFILE_ROWS = read('profiles'), COMMENT = read('commentator');
const MANIFEST = JSON.parse(readFileSync(new URL('../src/assets/castle-guard-106.cut.manifest.json', import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const ids = PROFILE_ROWS.profiles.map((p) => p.id);

test('the row validates, the registry has its maker, the ring boss names it, and its limbs match the cut manifest', () => {
  assert.deepEqual(validateFile('mechanics', MECH), []);
  assert.deepEqual(validateMechanics(MECH, ids), []);
  assert.ok(MECHANICS['reginald-limb-loss'], 'one registry line');
  const boss = RINGS.bosses.find((b) => b.kind === 'castle-guard');
  assert.equal(boss.mechanic, 'reginald-limb-loss');
  assert.equal(MECH.mechanics[boss.mechanic].boss, 'castle-guard');
  assert.deepEqual(limbManifestProblems(ROW, MANIFEST), []);
  const reg = createMechanics(), m = reg.of('castle-guard');
  assert.equal(m.boss, 'castle-guard');
  assert.equal(m.group, null, 'nothing drawn on the ground');
  assert.ok(m.layer && m.settle && m.tell && m.pure, 'a pure layer + settle + tell');
  assert.equal(reg.of('sporty-granny').pure, undefined, 'Nan holds state: only the held boss runs her move');
  assert.equal(bodyMechanicFor('castle-guard')?.lostUnits(['limb:arm_right']).join(), 'arm_right');
  assert.equal(bodyMechanicFor('kachujin'), null, 'a boss with no limb loss costs nothing');
});

test('a bad row is refused with the field named', () => {
  const bad = (edit, re) => { const r = clone(MECH.mechanics['reginald-limb-loss']); edit(r); assert.match([...checkReginaldLimbLoss('reginald-limb-loss', r), ...limbManifestProblems(r, MANIFEST)].join('\n'), re); };
  bad((r) => { r.limbs[0].belowPct = 120; }, /belowPct/);
  bad((r) => { r.limbs[1].belowPct = 80; }, /must fall/);
  bad((r) => { r.limbs[0].speedMult = 0; }, /speedMult/);
  bad((r) => { r.limbs[0].forbids = ['spin']; }, /forbids/);
  bad((r) => { r.limbs[0].swapTo = 'light'; }, /swapTo/);
  bad((r) => { r.limbs[0].piece = 'piece_head'; }, /manifest has no region/);
  bad((r) => { r.limbs[0].stumpCaps = ['cap_shoulder_right_arm']; }, /not a stump cap/);
  bad((r) => { r.limbs[0].hitStopMs = 9999; }, /hitStopMs/);
  bad((r) => { r.limbs[0].colour = 'red'; }, /unknown key/);
  bad((r) => { r.extra = 1; }, /extra: unknown key/);
  const f = clone(MECH); f.mechanics['reginald-limb-loss'].limbs[0].belowPct = 0;
  assert.match(validateMechanics(f, ids).join('\n'), /belowPct/, 'the file validator runs the row checker');
  const two = clone(MECH); two.mechanics['reginald-2'] = clone(two.mechanics['reginald-limb-loss']);
  assert.match(validateMechanics(two, ids).join('\n'), /already has the row/, 'one signature move per boss');
});

test('the commentator has the tell: an always-said priority line with the limb param', () => {
  const row = COMMENT.events.limb_loss;
  assert.ok(row.priority && row.probability === 1 && row.cooldownSeconds === 0 && row.params.includes('limb'));
  assert.deepEqual(validateFile('commentator', COMMENT), []);
});

// a fight on the real sim: the shieldmaiden (Sir Reginald's archetype) against an idle hero
const fresh = () => initialPractice(731, OPPONENTS.shieldmaiden);
const withHealth = (p, share) => ({ ...p, duel: { ...p.duel, fighters: [p.duel.fighters[0], { ...p.duel.fighters[1], health: Math.floor(p.duel.fighters[1].maxHealth * share) }] } });

test('the limbs fail at their shares, once, in order, and slow him down; a whole fight and a fresh one carry nothing', () => {
  const p = fresh(), speed = p.duel.fighters[1].speed;
  assert.equal(markLimbs(p), p, 'full health: the same object');
  const arm = markLimbs(withHealth(p, 0.6));
  assert.ok(limbLost(arm.duel.fighters[1].phases, 0) && !limbLost(arm.duel.fighters[1].phases, 1));
  assert.equal(arm.duel.fighters[1].speed, speed * ROW.limbs[0].speedMult);
  assert.equal(markLimbs(arm), arm, 'sticky: nothing new at the same health');
  const both = markLimbs(withHealth(arm, 0.2));
  assert.ok(limbLost(both.duel.fighters[1].phases, 0) && limbLost(both.duel.fighters[1].phases, 1));
  assert.equal(both.duel.fighters[1].speed, speed * ROW.limbs[0].speedMult * ROW.limbs[1].speedMult);
  assert.deepEqual(lostUnits(both.duel.fighters[1].phases), ['arm_right', 'leg_right'], 'the units a corpse cannot cut again');
  assert.equal(limbFailed(arm, both)?.id, 'leg_right');
  assert.equal(limbFailed(both, both), null);
  assert.deepEqual(limbTell(arm, both), { event: 'limb_loss', params: { limb: 'right leg' }, hitStopMs: 140 });
  assert.equal(limbTell(both, both), null);
  const dead = withHealth(p, 0); assert.equal(markLimbs(dead), dead, 'a dead boss loses nothing');
  assert.ok(!anyLost(fresh().duel.fighters[1].phases), 'a new fight is whole by construction');
});

test('no sword arm: every swing and special he decides on becomes a shield shove; no leg: no heavy, a light instead', () => {
  const p = fresh(), foe = (q) => q.duel.fighters[1];
  const armLost = markLimbs(withHealth(p, 0.6)), legOnly = { ...p, duel: { ...p.duel, fighters: [p.duel.fighters[0], { ...foe(p), phases: ['limb:leg_right'] }] } };
  for (const a of ROW.limbs[0].forbids) {
    const out = limbIntent(armLost.duel, { ...idleIntent(), action: a });
    assert.ok(out.action === 'kick' || out.action === null, `${a} -> ${out.action}`);
    assert.equal(out.action, legal(foe(armLost), 'kick') ? 'kick' : null);
  }
  for (const a of ['heavy', 'heavy_left', 'heavy_right', 'heavy_thrust']) assert.equal(limbIntent(legOnly.duel, { ...idleIntent(), action: a }).action, legal(foe(legOnly), 'light') ? 'light' : null);
  const keep = { ...idleIntent(), action: 'light' };
  assert.equal(limbIntent(legOnly.duel, keep), keep, 'the leg alone takes no light swing away: the same object');
  const idle = idleIntent();
  assert.equal(limbIntent(armLost.duel, idle), idle, 'no action, no change');
  assert.equal(limbIntent(p.duel, { ...idleIntent(), action: 'heavy' }).action, 'heavy', 'whole: untouched');
});

test('a real duel on the sim (layer, then settle, as the page and the attackers step it): under the arm share he throws nothing but kicks, under the leg share no heavy; the same run twice is the same fight', () => {
  const mech = createMechanics().of('castle-guard');
  const run = (share) => {
    let p = withHealth(fresh(), share);
    const log = [];
    for (let t = 0; t < 1500; t++) {
      p = stepShaped(p, p.duel.fighters[0].phase === 'sheathed' ? { ...idleIntent(), action: 'light' } : idleIntent(), PROFILES.normal, mech);   // a press draws (auto-start.ts) while the hero is sheathed, then he stands
      for (const e of p.duel.events) if (e.actor === 1 && e.type === 'AttackStarted') log.push(e.move);
      if (p.duel.fighters[0].health <= 0) break;
    }
    return { log, phases: p.duel.fighters[1].phases };
  };
  const whole = run(1), armless = run(0.6), again = run(0.6), legless = run(0.2);
  assert.ok(whole.log.length > 0, 'the control boss does attack');
  assert.ok(whole.log.some((m) => m !== 'kick'), 'whole, he swings');
  assert.ok(armless.log.every((m) => m === 'kick'), `armless throws ${[...new Set(armless.log)]}`);
  assert.deepEqual(armless, again, 'deterministic');
  assert.ok(legless.log.every((m) => !String(m).startsWith('heavy')), `legless throws ${[...new Set(legless.log)]}`);
  assert.ok(limbLost(legless.phases, 1));
  const p = fresh();
  assert.equal(stepShaped(p, idleIntent(), PROFILES.normal, null).duel.tick, p.duel.tick + 1, 'no mechanic: stepPractice');
});

test('the view hides the piece and shows the stump cap of a lost limb, restores it when whole, and touches nothing when nothing is lost', () => {
  const node = (name, visible = true) => ({ name, visible });
  const nodes = Object.fromEntries(['piece_arm_right', 'piece_leg_right', 'cap_shoulder_right_torso', 'cap_hip_right_root', 'piece_head'].map((n) => [n, node(n, !n.startsWith('cap'))]));
  let lookups = 0;
  const root = { visible: true, getObjectByName: (n) => { lookups++; return nodes[n]; } };
  applyLimbs(root, undefined);
  assert.equal(lookups, 0, 'a whole body with nothing lost: no lookups');
  applyLimbs(root, ['limb:arm_right']);
  assert.equal(nodes.piece_arm_right.visible, false);
  assert.equal(nodes.cap_shoulder_right_torso.visible, true);
  assert.equal(nodes.piece_leg_right.visible, true, 'the other limb is left alone');
  assert.equal(nodes.piece_head.visible, true, 'no other region is touched');
  applyLimbs(root, ['limb:arm_right', 'limb:leg_right']);
  assert.equal(nodes.piece_leg_right.visible, false);
  assert.equal(nodes.cap_hip_right_root.visible, true);
  applyLimbs(root, undefined);   // a new fight on the same body
  assert.ok(nodes.piece_arm_right.visible && nodes.piece_leg_right.visible);
  assert.ok(!nodes.cap_shoulder_right_torso.visible && !nodes.cap_hip_right_root.visible);
});

test('the corpse: lost units are cut-proof and the other six-region cuts stay open (static guard on the ragdoll wiring)', () => {
  const src = readFileSync(new URL('../src/fight/ragdoll.ts', import.meta.url), 'utf8');
  assert.match(src, /lostUnits\.includes\(unit\)\) return null/, 'the live death cut refuses a unit already gone: no event, no part');
  assert.match(src, /done: new Set\(\[\.\.\.\(rd\?\.cuts \?\? \[\]\), \.\.\.lostUnits\]\)/, 'a corpse counts them done, never as cut');
  assert.match(src, /c\.draw\?\.\(c\.root\)/, 'a corpse cut re-draws the lost limbs gone');
  const units = lostUnits(['limb:arm_right', 'limb:leg_right']);
  const six = ['head', 'arm_left', 'arm_right', 'leg_left', 'leg_right', 'torso_waist'];
  assert.deepEqual(six.filter((u) => !units.includes(u)), ['head', 'arm_left', 'leg_left', 'torso_waist'], 'four regions stay cuttable on the corpse, the lost two yield nothing');
  assert.ok(six.every((u) => MANIFEST.regions.some((r) => r.detached_by === u)), 'the manifest still has all six');
});
