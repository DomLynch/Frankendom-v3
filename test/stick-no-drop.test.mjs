// A thumb on the left stick keeps walking through a sim hand-over (data/respawn.json input; src/fight/hand-over-input.ts). Death, respawn and the Respawn button still clear.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dropsInput, keepsInput, HAND_OVER_INPUT } from '../src/fight/hand-over-input.ts';
import { validateFile } from '../src/sim/validate.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ROWS = JSON.parse(read('../data/respawn.json'));
const code = (p) => read(p).split('\n').map((l) => l.replace(/\s\/\/ .*$/, '').replace(/^\s*\/\/.*$/, '')).join('\n');   // comment-stripped

test('the row is pinned, validates, and a stray key is refused', () => {
  assert.deepEqual(HAND_OVER_INPUT, { about: HAND_OVER_INPUT.about, keepOnHandOver: true, query: 'input', off: 'v1' });
  assert.deepEqual(validateFile('respawn', ROWS), []);
  assert.ok(validateFile('respawn', { ...ROWS, input: { ...ROWS.input, extra: 1 } }).length > 0);
});

test('?input=v1 and the row off revert to the old clear', () => {
  assert.equal(keepsInput(''), true);
  assert.equal(keepsInput('?input=v1'), false);
  assert.equal(keepsInput('?x=1&input=v1'), false);
  assert.equal(keepsInput('', { ...HAND_OVER_INPUT, keepOnHandOver: false }), false);
});

// The page's reset, run over a fake control state with the same rule main.ts uses: clear unless it is a hand-over and the page keeps input.
function pageReset(controls, keep, handOver) {
  if (dropsInput(keep, handOver)) { controls.moveX = controls.moveZ = 0; controls.moveId = null; controls.held = false; controls.clears++; }
}
const held = () => ({ moveX: 0.6, moveZ: -0.8, moveId: 7, held: true, clears: 0 });

test('a free-walk hand-over keeps the stick and the held button; the movement vector is unchanged', () => {
  const c = held(), before = { ...c };
  pageReset(c, keepsInput(''), true);   // the east boss takes the sim as he walks past it
  pageReset(c, keepsInput(''), true);   // and the next one
  assert.deepEqual(c, before);
});

test('death, respawn and the Respawn button (not a hand-over) still clear the stick', () => {
  const c = held();
  pageReset(c, keepsInput(''), false);
  assert.deepEqual(c, { moveX: 0, moveZ: 0, moveId: null, held: false, clears: 1 });
});

test('with ?input=v1 a hand-over clears as before', () => {
  const c = held();
  pageReset(c, keepsInput('?input=v1'), true);
  assert.equal(c.moveX, 0);
  assert.equal(c.clears, 1);
});

test('wiring: hand() and a walking adoptAttacker are the only hand-overs; death, respawn and the button reset with handOver false', () => {
  const src = code('../src/client/main.ts');
  assert.match(src, /const hand = \(index: number, at: \{ x: number; z: number \}\) => rematch\(poseFor\(index, at\), index, false, true\);/);
  assert.match(src, /function rematch\(pose\?: DuelPose, index = current, restart = true, handOver = false\) \{[\s\S]*?resetInput\(handOver\);/);
  assert.match(src, /const walking = roam !== null;[\s\S]*?resetInput\(walking\);/);
  assert.match(src, /if \(dropsInput\(KEEP_INPUT, handOver\)\) clearInput\(\);\s*\n\s*else \{ hitStop = 0; accumulator = 0; \}/);
  assert.match(src, /const KEEP_INPUT = !!ZONE && keepsInput\(search\);/);
  assert.match(src, /rematch\(poseFor\(who, heroStart\), who\);/, 'the death stand-up still clears');
  assert.match(src, /element\('reset-button'\)\.addEventListener\('click', \(\) => \{ if \(DEATH && heroDied\(\)\) askRespawn\(\); else rematch\(\); \}\);/, 'the Respawn button still clears (a fallen hero asks the death loop, which stands him up through the same rematch)');
  assert.match(src, /window\.addEventListener\('blur', clearInput\);/, 'blur still clears');
  assert.equal((src.match(/\bclearInput\(\)/g) || []).length, 2, 'clearInput() is called only by its definition and resetInput');
});
