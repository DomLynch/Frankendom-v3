// The Pitborn's cleaver sweeps where the Minotaur draws it (data/fight.json foeReach, src/fight/foe-reach.ts, src/fight/blade-minotaur.ts):
// the default page's opponent hits along the drawn blade; ?reach=v1, ?pitborn=v1 and ?foe=v1 are V1's sweeps exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLADE_MINOTAUR } from '../src/fight/blade-minotaur.ts';
import { bladePathsByRig } from '../src/fight/blade-paths.ts';
import { bladeFrames, setSweepOverride } from '../src/fight/blade.ts';
import { initialDuel, stepDuel, idleIntent } from '../src/fight/duel.ts';
import { fightOpponent } from '../src/fight/foe-pick.ts';
import { foeReachV1, foeSweepsFor, mergeSweeps } from '../src/fight/foe-reach.ts';
import { OPPONENTS, WEAPONS, opponentAt } from '../src/fight/moves.ts';
import { sweepTableFor } from '../src/hero-reach.ts';
import { validateFile } from '../src/sim/validate.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FIGHT = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8')), ROW = FIGHT.foeReach;
const V1 = bladePathsByRig.hero.cleaver, CLEAVER = WEAPONS.cleaver;
const tip = (pose) => Math.max(Math.hypot(pose[0], pose[2]), Math.hypot(pose[3], pose[5]));   // farthest of hilt and tip from the root, on the floor
const activeReach = (frames, kind) => { const s = CLEAVER.paths[kind]; return Math.max(...frames.slice(s.windup, s.windup + s.active + 1).map(tip)); };

test('the row: the Pitborn in the Minotaur, the hero rig\'s cleaver, ?reach=v1; the validator knows it', () => {
  assert.deepEqual(validateFile('fight', FIGHT), []);
  assert.deepEqual([ROW.opponent, ROW.body, ROW.rig, ROW.weapon, ROW.query, ROW.v1], ['pitborn', 'minotaur', 'hero', 'cleaver', 'reach', 'v1']);
  assert.equal(OPPONENTS[ROW.opponent].rig, ROW.rig); assert.equal(OPPONENTS[ROW.opponent].weapon, ROW.weapon);
  assert.equal(fightOpponent(FIGHT, '?order=v1'), ROW.opponent, 'the Minotaur-first page (?order=v1) fights the row\'s opponent; by default the Gargantua is first and the Minotaur is spawn 3, whose sweeps follow the hand-over (main.ts sweepOwner)');
  assert.ok(validateFile('fight', { ...FIGHT, foeReach: { ...ROW, extra: 1 } }).some((e) => /foeReach\.extra/.test(e)));
});

test('which sweeps: the Minotaur\'s by default; V1\'s under ?reach=v1 and ?pitborn=v1 (?foe=v1 is gone: the default)', () => {
  const cases = [['', null], ['?order=v1', BLADE_MINOTAUR], ['?order=v1&reach=v1', null], ['?order=v1&reach=clip', BLADE_MINOTAUR], ['?order=v1&clips=v1', BLADE_MINOTAUR], ['?order=v1&gfx=v1&reach=v1', null],
    ['?pitborn=v1', null], ['?order=v1&foe=v1', BLADE_MINOTAUR], ['?pitborn=v1&reach=v1', null], ['?order=v1&shield=v1', BLADE_MINOTAUR]];   // by default the Gargantua is the page's first foe: no Minotaur sweeps at load (they follow the hand-over to the Minotaur, main.ts sweepOwner)
  for (const [search, sweeps] of cases) {
    assert.equal(foeSweepsFor(ROW, search, fightOpponent(FIGHT, search))?.hero?.cleaver ?? null, sweeps, search || '(none)');
  }
  assert.equal(foeReachV1(ROW, '?reach=v1'), true); assert.equal(foeReachV1(ROW, '?reach=clip'), false);
  assert.throws(() => foeSweepsFor({ ...ROW, body: 'veteran' }, '', 'pitborn'), /no bake/);
});

test('the page lays both overrides: the hero\'s longsword under ?reach=clip and the Pitborn\'s cleaver, each over V1\'s for its own pair', () => {
  const both = mergeSweeps(sweepTableFor('?reach=clip'), foeSweepsFor(ROW, '?reach=clip', 'pitborn'));
  assert.ok(both.hero.longsword && both.hero.cleaver === BLADE_MINOTAUR);
  assert.equal(mergeSweeps(null, null), null);
  assert.throws(() => mergeSweeps({ hero: { cleaver: {} } }, { hero: { cleaver: {} } }), /two sweep overrides/);
  try {
    setSweepOverride(mergeSweeps(sweepTableFor(''), foeSweepsFor(ROW, '', 'pitborn')));
    assert.equal(bladeFrames('hero', 'cleaver', 'thrust'), BLADE_MINOTAUR.thrust);
    assert.equal(bladeFrames('hero', 'gladius', 'thrust'), bladePathsByRig.hero.gladius.thrust, 'every other pair stays V1\'s');
    setSweepOverride(mergeSweeps(sweepTableFor('?reach=v1'), foeSweepsFor(ROW, '?reach=v1', 'pitborn')));
    assert.equal(bladeFrames('hero', 'cleaver', 'thrust'), V1.thrust);
  } finally { setSweepOverride(null); }
});

test('the bake covers every path of V1\'s cleaver table, frame for frame, with a rigid blade', () => {
  assert.deepEqual(Object.keys(BLADE_MINOTAUR).sort(), Object.keys(V1).sort());
  for (const [kind, frames] of Object.entries(BLADE_MINOTAUR)) {
    assert.equal(frames.length, V1[kind].length, `${kind}: the sim reads by age`);
    const lengths = frames.map((p) => { assert.ok(p.length === 6 && p.every(Number.isFinite), kind); return Math.hypot(p[3] - p[0], p[4] - p[1], p[5] - p[2]); });
    // the 0.72 m edge (0.14-0.86 m) under the rig root's scale (0.9, 0.97, 0.97): 0.648 laid along x to 0.698 along y/z, as in V1's table
    assert.ok(Math.min(...lengths) >= 0.72 * 0.9 - 0.001 && Math.max(...lengths) <= 0.72 * 0.97 + 0.001, `${kind}: edge ${Math.min(...lengths).toFixed(3)}-${Math.max(...lengths).toFixed(3)} m`);
  }
  // every borrowed bake (the directional heavies' `blade`) and every move's path is covered
  for (const [id, spec] of Object.entries(CLEAVER.paths)) assert.ok(BLADE_MINOTAUR[spec.blade ?? id], id);
});

// Measured 2026-10-26 (farthest of hilt and tip from his root, on the floor, over the active frames): the drawn blade falls 4-10 cm short of V1's.
const REACH = { light_right: [1.10, 1.05], light_left: [1.19, 1.14], light_right_chain: [1.10, 1.06], light_left_chain: [1.20, 1.15], heavy_overhead: [1.14, 1.04],
  heavy_overhead_chain: [1.14, 1.04], thrust: [1.13, 1.05], slash_riposte: [1.10, 1.05], riposte: [1.13, 1.05], heavy_riposte: [1.14, 1.04] };
test('reach per path (active frames, to the centimetre): V1\'s, then the Minotaur\'s, never longer', () => {
  for (const [kind, [v1, minotaur]] of Object.entries(REACH)) {
    assert.ok(Math.abs(activeReach(V1[kind], kind) - v1) < 0.006, `${kind} V1 ${activeReach(V1[kind], kind).toFixed(3)}`);
    assert.ok(Math.abs(activeReach(BLADE_MINOTAUR[kind], kind) - minotaur) < 0.006, `${kind} Minotaur ${activeReach(BLADE_MINOTAUR[kind], kind).toFixed(3)}`);
  }
});

// The stills' scene (docs/stills/pitborn-reach): the hero stands still, ready, unguarded, `gap` from the Pitborn, who swings once.
function lands(action, gap, search) {
  setSweepOverride(foeSweepsFor(ROW, search, 'pitborn'));
  try {
    let d = initialDuel(opponentAt(OPPONENTS.pitborn, FIGHT.level), FIGHT.weapon);
    const [h, f] = d.fighters;
    d = { ...d, fighters: [{ ...h, phase: 'ready', body: { x: 0, z: 0, heading: 0, distance: 0 } }, { ...f, phase: 'ready', body: { x: 0, z: gap, heading: Math.PI, distance: 0 } }] };
    for (let t = 0; t < 140; t++) {
      d = stepDuel(d, [idleIntent(), { ...idleIntent(), action: t === 0 ? action : null }]);
      if (d.events.some((e) => e.type === 'Hit' && e.actor === 1)) return true;
    }
    return false;
  } finally { setSweepOverride(null); }
}
test('between the two reaches V1\'s sweep hits and the drawn blade misses (the stills\' distances)', () => {
  for (const [action, gap] of [['light_right', 1.69], ['thrust', 2.0], ['heavy', 2.16]]) {
    assert.equal(lands(action, gap, '?reach=v1'), true, `${action} from ${gap} m lands on V1's sweeps`);
    assert.equal(lands(action, gap, ''), false, `${action} from ${gap} m whiffs on the Minotaur's`);
    assert.equal(lands(action, gap - 0.2, ''), true, `${action} from ${gap - 0.2} m still lands on the Minotaur's`);
  }
});

test('blade-minotaur.ts is what scripts/foe-body/bake-blades.mjs bakes from today\'s minotaur.glb and cleaver.glb', () => {
  const dir = mkdtempSync(join(tmpdir(), 'foe-reach-')), out = join(dir, 'blade-minotaur.ts');
  try {
    execFileSync(process.execPath, ['scripts/foe-body/bake-blades.mjs', '--out', out], { cwd: ROOT, stdio: 'pipe' });
    assert.equal(readFileSync(out, 'utf8'), readFileSync(join(ROOT, 'src/fight/blade-minotaur.ts'), 'utf8'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
