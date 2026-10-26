// The finishers as physics cuts (data/physics.json finisherCuts, src/fight/finisher-cuts.ts; Strategy's ruling 2026-10-26). Presentation only: these pin the
// rows against finisher-defs.json (the kill cam's timing rows) and the package's six cut units, the validator, the finisher -> unit mapping, and the
// late-cut queue. The headless fight (scripts/finisher-cuts-stills.mjs) is the proof on the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { finisherCutRow, finisherPush, createLateCuts, PHYSICS_MODE } from '../src/fight/finisher-cuts.ts';
import { finisherModeFor } from '../src/fight/ragdoll.ts';
import { validateFile } from '../src/sim/validate.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const ROWS = read('../data/physics.json'), DEFS = read('../src/fight/finisher-defs.json').finishers;
const UNITS = ['head', 'arm_left', 'arm_right', 'leg_left', 'leg_right', 'torso_waist'];
const byId = (id) => DEFS.find((f) => f.id === id);

test('the physics.json validator accepts the rows and rejects an unknown key in one', () => {
  assert.deepEqual(validateFile('physics', ROWS), []);
  const bad = structuredClone(ROWS); bad.finisherCuts.rows.opened.cutPlane = 'x';
  assert.match(validateFile('physics', bad).join('\n'), /finisherCuts\.rows\.opened\.cutPlane: unknown key/);
  const stray = structuredClone(ROWS); stray.finisherCuts.extra = 1;
  assert.match(validateFile('physics', stray).join('\n'), /finisherCuts\.extra: unknown key/);
});

test('the finisher -> cut unit mapping (Strategy 2026-10-26): Opened = torso_waist, Run Through = none, Split Crown = head, Decapitation = head', () => {
  const unit = (id) => finisherCutRow(ROWS, id)?.unit;
  assert.equal(unit('opened'), 'torso_waist');
  assert.equal(unit('runThrough'), null);
  assert.equal(unit('splitCrown'), 'head');
  assert.equal(unit('decapitation'), 'head');
  for (const id of ['hamstrung', 'execution', 'quietOne', 'plainDeath']) assert.equal(finisherCutRow(ROWS, id), undefined, `${id} keeps its clip / the plain death`);
  assert.equal(finisherCutRow(ROWS, null), undefined);
});

test('every row names a finisher of finisher-defs.json, a unit the package supports, and reuses its own camera, blood and sound rows (the kill cam is V1\'s)', () => {
  for (const [id, row] of Object.entries(ROWS.finisherCuts.rows)) {
    const def = byId(id);
    assert.ok(def, `${id} is a finisher id`);
    assert.equal(row.timing, id, `${id} plays its own timing row`);
    assert.ok(def.camera && def.blood && def.sound, `${id}: finisher-defs.json carries camera, blood and sound`);
    assert.ok(row.unit === null || UNITS.includes(row.unit), `${id}: ${row.unit} is one of the six units`);
    assert.ok(row.atS >= 0 && row.push >= 0 && (row.kill === null || (row.kill.impulse >= 0 && typeof row.kill.lift === 'number')));
    assert.ok(row.plane === null || typeof row.plane === 'string');
  }
  // the rotation's four ceremonies all have a physics body
  for (const f of DEFS.filter((f) => f.rotation && f.template !== 'fall')) assert.ok(ROWS.finisherCuts.rows[f.id], `${f.id} has a row`);
});

test('the finishers needing a cut the six units cannot do say so in the row: Split Crown and Opened (Run Through and Decapitation need none)', () => {
  const needs = Object.entries(ROWS.finisherCuts.rows).filter(([, r]) => r.plane).map(([id]) => id).sort();
  assert.deepEqual(needs, ['opened', 'splitCrown']);
});

test('the push and the finisher mode: Run Through sags (a quarter of the kill), the others as the plain kill; ?ragdoll=finishers = the physics body, ?ragdoll=clips = V1\'s clips, default unchanged', () => {
  assert.equal(finisherPush(finisherCutRow(ROWS, 'runThrough'), 70), 17.5);
  assert.equal(finisherPush(finisherCutRow(ROWS, 'opened'), 70), 70);
  assert.equal(finisherPush(undefined, 70), 70);
  assert.equal(finisherModeFor(ROWS, ''), 'skip');
  assert.equal(finisherModeFor(ROWS, '?ragdoll=finishers'), PHYSICS_MODE);
  assert.equal(finisherModeFor(ROWS, '?ragdoll=clips'), 'keep');
  assert.equal(finisherModeFor(ROWS, '?physics=v1&ragdoll=finishers'), 'physics', 'the mode is the row\'s; ragdollRowFor gives no ragdoll under ?physics=v1, so no body and V1\'s clips play');
});

test('a late cut (atS) fires once, in order, after its seconds, and not after a clear', () => {
  const q = createLateCuts();
  q.add('head', 0.5, 'finisher'); q.add('torso_waist', 0.2, 'finisher');
  assert.deepEqual(q.tick(0.1), []);
  assert.deepEqual(q.tick(0.15).map((c) => c.unit), ['torso_waist']);
  assert.deepEqual(q.tick(0.1), []);
  assert.deepEqual(q.tick(0.3).map((c) => c.unit), ['head']);
  assert.deepEqual(q.tick(5), []);
  q.add('head', 1, 'finisher'); q.clear();
  assert.deepEqual(q.tick(5), []);
  assert.equal(q.pending, 0);
});
