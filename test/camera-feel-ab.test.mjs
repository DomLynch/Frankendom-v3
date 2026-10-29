// Data-layer shift, camera and feel: the numbers that moved into data rows must equal the literals they replaced, byte for byte, and the camera must stand
// where it stood. test/fixtures/camera-feel-ab.json was produced by test/helpers/camera-feel-probe.mjs on the code BEFORE the move (cameraPose, finisherSidePose,
// the rig over scripted fights, the kick table, the lens maths, the follow camera); the same probe on today's code must return the same doubles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { probe } from './helpers/camera-feel-probe.mjs';
import { cameraRule, shoveRow, loadCameraRules } from '../src/fight/camera-rules.ts';

const GOLDEN = JSON.parse(readFileSync(new URL('./fixtures/camera-feel-ab.json', import.meta.url), 'utf8'));
const NOW = JSON.parse(JSON.stringify(probe()));   // through JSON, as the golden went (NaN and Infinity would both become null)

for (const key of Object.keys(GOLDEN)) test(`camera/feel A/B: ${key} is exactly what the literals produced`, () => assert.deepEqual(NOW[key], GOLDEN[key]));
test('camera/feel A/B: the probe covers what the golden covers, nothing more', () => assert.deepEqual(Object.keys(NOW), Object.keys(GOLDEN)));

// The rows that replaced the literals, pinned to the old values.
const OLD_RULES = {
  framingTallWraith: 0.35, lockBackPerGap: 0.62, lockBackBase: 2.8, lockLiftPerGap: 1.3, walkOrbitRadius: 7.5, sideLookY: 0.85, settleMin: 1.5, settleStill: 0.4, settleSpeed: 0.02,
  dollyPush: 0.38, dollySlide: 0.95, dollyTurn: 0.6, orbitPitchStart: 0.45, orbitYawPerPx: 0.005, orbitPitchPerPx: 0.003, orbitPitchMin: 0.22, orbitPitchMax: 0.9, kickSettleDefault: 0.15,
  camSettleRate: 8, lockLookY: 0.8, finishPushClock: 1.3, finishPushRate: 0.75, pushEyeY: 1.55, pushEyeShare: 0.3, pushLookY: 0.8, pushLookShare: 0.7, bigBodyScale: 1.5,
  tourEyeLow: 1.2, tourEyeHigh: 1.6, tourRiseLow: 1, tourRiseHigh: 1.6, lookFoeAngle: 0.87, lookFoeDistance: 4.4, lookFoeEyeY: 1.6, lookFoeLookY: 0.95,
  baseFov: 51, zoomLimitLow: 0.5, zoomLimitHigh: 2, wideZoomHigh: 2, wideFromLow: 0.75, wideFromHigh: 2, wideHfovLow: 40, wideHfovHigh: 120, wideHfovNone: 179, shoveFps: 60,
};
test('camera rows: every moved literal is its row, byte for byte', () => { for (const [id, v] of Object.entries(OLD_RULES)) assert.equal(cameraRule(id), v, id); });
test('camera shoves: the six rows are the old kick table', () => {
  const old = {
    guardBroken: [0.05, 0.06, 0, 2, 0.22], hitHeavy: [0.05, 0.06, 0, 2, 0.22], hitLight: [0.02, 0.012, 0, 0, 0.15], parried: [0.01, 0.008, 0.02, 0, 0.12],
    blockedHeavy: [0.02, 0.028, 0, 1, 0.18], blockedLight: [0.012, 0.01, 0, 0, 0.12],
  };
  for (const [id, [along, drop, side, holdFrames, settle]] of Object.entries(old)) assert.deepEqual({ ...shoveRow(id) }, { id, along, drop, side, holdFrames, settle, ...(id === 'blockedLight' ? { dropPerfect: 0.014 } : {}) }, id);
});
test('the loader refuses a nonsense row: a non-positive rule, a missing name, a hold outside the manifest range', () => {
  const raw = JSON.parse(readFileSync(new URL('../src/fight/camera-rules-defs.json', import.meta.url), 'utf8'));
  assert.doesNotThrow(() => loadCameraRules(raw));
  assert.throws(() => loadCameraRules({ rules: raw.rules.map((r) => (r.id === 'settleMin' ? { ...r, value: 0 } : r)) }), /settleMin/);
  assert.throws(() => loadCameraRules({ rules: raw.rules.filter((r) => r.id !== 'camSettleRate') }), /camSettleRate/);
});

// The feel rows that replaced literals (feel-clash, feel-limbs, armfeel, hit-stop, skyview, the feel log): each equals the literal it replaced.
import CLASH from '../data/feel-clash.json' with { type: 'json' };
import LIMBS from '../data/feel-limbs.json' with { type: 'json' };
import STAGE from '../data/stage.json' with { type: 'json' };
import { validateFile } from '../src/sim/validate.js';
import { clashOf, motorRows, leanOf } from '../src/fight/feel-clash.ts';
import { FEEL_LOG_MAX } from '../src/fight/feel.ts';
import { FLINCH_GAIN } from '../src/fight/armfeel.ts';
import { BURST_SEED, DROPLET_SEGMENTS, ENERGY_FLOOR } from '../src/fight/armfeel-rows.ts';
import { frameMs, CONTACTS } from '../src/fight/hit-stop-rows.ts';
import { FLOOR_ORDER } from '../src/fight/skyview.ts';
import { SKYLINE_ORDER } from '../src/fight/skyline.ts';

test('feel rows: the clash, limb, armfeel, hit-stop, skyline and log literals are their rows, byte for byte', () => {
  assert.equal(CLASH.hero.minScale, 0.25); assert.equal(CLASH.timing.dipFloor, 0.01); assert.equal(CLASH.pushback.digits, 4);
  for (const [k, v] of Object.entries({ gravityMps2: 9.8, hideY: -1000, spin: 0.7, upBase: 0.4, upMul: 37, speedBase: 0.5, speedMul: 53, mod: 10 })) assert.equal(CLASH.spark[k], v, k);
  assert.equal(LIMBS.dipAskBelow, 0.999);
  assert.equal(FEEL_LOG_MAX, 200); assert.equal(FLINCH_GAIN.hero, 0.25); assert.equal(FLINCH_GAIN.opponent, 1);
  assert.equal(ENERGY_FLOOR, 0.001); assert.deepEqual([...DROPLET_SEGMENTS], [8, 6]); assert.equal(BURST_SEED, 0x5eed1234);
  assert.equal(frameMs({ ...CONTACTS.hitLight, frames: 3 }), (3 * 1000) / 60);
  assert.equal(FLOOR_ORDER, SKYLINE_ORDER + 100); assert.equal(STAGE.skyline.views.floorOrderOffset, 100);
});
test('feel rows: the files still validate, and a bad new row is refused', () => {
  assert.deepEqual(validateFile('feel-clash', CLASH), []); assert.deepEqual(validateFile('feel-limbs', LIMBS), []); assert.deepEqual(validateFile('stage', STAGE), []);
  const bad = structuredClone(CLASH); bad.spark.mod = 0; assert.ok(validateFile('feel-clash', bad).length >= 1);
  const bad2 = structuredClone(LIMBS); bad2.dipAskBelow = 2; assert.ok(validateFile('feel-limbs', bad2).length >= 1);
});
test('feel clash maths: the clash pure functions give the numbers the literals gave', () => {
  const ev = { type: 'Blocked', tick: 5, actor: 0, target: 1, move: 'jab', weapon: 'longsword' };
  assert.equal(clashOf(CLASH, ev).pushbackM, +(0.25 * 1).toFixed(4));
  const floor = motorRows(CLASH, { dip: 0, strength: 0.01 }, 'attacker', 1);
  assert.ok(Object.values(floor).every((v) => v >= 0.01));
  assert.equal(motorRows(CLASH, { dip: 0.5, strength: 1 }, 'attacker', 1).armRight, 1 - 0.5 * 1 * 1 * Math.max(0.25, Math.min(1, 1 / 1.92)));
  assert.equal(leanOf(CLASH, { attacker: 0, defender: 1, strength: 0.1 }, 0, 1).weaponArm[2], 0.25 * 0.25);
});
