// The finishers as physics cuts (data/physics.json finisherCuts, src/fight/finisher-cuts.ts; Strategy's ruling 2026-10-26). Presentation only: these pin the
// rows against finisher-defs.json (the kill cam's timing rows) and the package's six cut units, the validator, the finisher -> unit mapping, and the
// late-cut queue. The headless fight (scripts/finisher-cuts-stills.mjs) is the proof on the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { finisherCutRow, finisherPush, finisherUnits, halvesApart, createLateCuts, PHYSICS_MODE } from '../src/fight/finisher-cuts.ts';
import { finisherModeFor } from '../src/fight/ragdoll.ts';
import { validateFile } from '../src/sim/validate.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const ROWS = read('../data/physics.json'), DEFS = read('../src/fight/finisher-defs.json').finishers;
const UNITS = ['head', 'arm_left', 'arm_right', 'leg_left', 'leg_right', 'torso_waist'];
const VISUAL = ['head_split', 'belly_open'];
const byId = (id) => DEFS.find((f) => f.id === id);
const MANIFEST = read('../src/assets/minotaur-106.cut.manifest.json');

test('the physics.json validator accepts the rows and rejects an unknown key in one', () => {
  assert.deepEqual(validateFile('physics', ROWS), []);
  const bad = structuredClone(ROWS); bad.finisherCuts.rows.opened.cutPlane = 'x';
  assert.match(validateFile('physics', bad).join('\n'), /finisherCuts\.rows\.opened\.cutPlane: unknown key/);
  const unit = structuredClone(ROWS); unit.finisherCuts.rows.opened.unit = 'belly';
  assert.match(validateFile('physics', unit).join('\n'), /rows\.opened\.unit: unknown unit belly/);
  const fb = structuredClone(ROWS); fb.finisherCuts.rows.opened.fallback = 'belly_open';
  assert.match(validateFile('physics', fb).join('\n'), /rows\.opened\.fallback: must be null or a real cut unit/);
  const dup = structuredClone(ROWS); dup.finisherCuts.rows.splitCrown.also = ['head'];
  assert.match(validateFile('physics', dup).join('\n'), /rows\.splitCrown\.also/);
  const stray = structuredClone(ROWS); stray.finisherCuts.extra = 1;
  assert.match(validateFile('physics', stray).join('\n'), /finisherCuts\.extra: unknown key/);
});

test('the finisher -> cut unit mapping (M9a, physics 9056ef7): Opened = belly_open (stand-in torso_waist), Run Through = none, Split Crown = head + head_split, Decapitation = head', () => {
  const unit = (id) => finisherCutRow(ROWS, id)?.unit;
  assert.equal(unit('opened'), 'belly_open');
  assert.equal(finisherCutRow(ROWS, 'opened').fallback, 'torso_waist');
  assert.equal(unit('runThrough'), null);
  assert.equal(unit('splitCrown'), 'head');
  assert.deepEqual(finisherCutRow(ROWS, 'splitCrown').also, ['head_split']);
  assert.equal(unit('decapitation'), 'head');
  for (const id of ['hamstrung', 'execution', 'quietOne', 'plainDeath']) assert.equal(finisherCutRow(ROWS, id), undefined, `${id} keeps its clip / the plain death`);
  assert.equal(finisherCutRow(ROWS, null), undefined);
});

test('every row names a finisher of finisher-defs.json, a unit the package supports, and reuses its own camera, blood and sound rows (the kill cam is V1\'s)', () => {
  for (const [id, row] of Object.entries(ROWS.finisherCuts.rows)) {
    const def = byId(id);
    assert.ok(def, `${id} is a finisher id`);
    assert.equal(row.timing, undefined, `${id}: the camera, blood and sound are the finisher's own rows, not re-stated here`);
    assert.ok(def.camera && def.blood && def.sound, `${id}: finisher-defs.json carries camera, blood and sound`);
    assert.ok(row.unit === null || [...UNITS, ...VISUAL].includes(row.unit), `${id}: ${row.unit} is one of the six units or a visual one`);
    for (const u of [...(row.also ?? []), ...(row.fallback ? [row.fallback] : [])]) assert.ok([...UNITS, ...VISUAL].includes(u), `${id}: ${u} is a known unit`);
    if (row.fallback !== undefined) assert.ok(VISUAL.includes(row.unit) && (row.fallback === null || UNITS.includes(row.fallback)), `${id}: only a visual unit has a stand-in, and the stand-in is a real cut`);
    assert.ok(row.atS >= 0 && row.push >= 0 && (row.kill === null || (row.kill.impulse >= 0 && typeof row.kill.lift === 'number')));
    assert.ok(row.plane === null || typeof row.plane === 'string');
  }
  // the rotation's four ceremonies all have a physics body
  for (const f of DEFS.filter((f) => f.rotation && f.template !== 'fall')) assert.ok(ROWS.finisherCuts.rows[f.id], `${f.id} has a row`);
});

test('finisherUnits: a body whose cut GLB has the visual units gets them (Split Crown: head then head_split; Opened: belly_open), a body without gets the stand-ins (head; torso_waist)', () => {
  const withBoth = (u) => true, plain = (u) => !VISUAL.includes(u), only = (set) => (u) => !VISUAL.includes(u) || set.includes(u);
  const row = (id) => finisherCutRow(ROWS, id);
  assert.deepEqual(finisherUnits(row('splitCrown'), withBoth), ['head', 'head_split']);
  assert.deepEqual(finisherUnits(row('splitCrown'), plain), ['head']);
  assert.deepEqual(finisherUnits(row('opened'), withBoth), ['belly_open']);
  assert.deepEqual(finisherUnits(row('opened'), plain), ['torso_waist']);
  assert.deepEqual(finisherUnits(row('opened'), only(['head_split'])), ['torso_waist']);
  assert.deepEqual(finisherUnits(row('decapitation'), plain), ['head']);
  assert.deepEqual(finisherUnits(row('runThrough'), withBoth), []);
  assert.deepEqual(finisherUnits({ unit: 'belly_open', fallback: null, atS: 0, push: 1, kill: null, plane: null }, plain), [], 'a null fallback = no cut');
});

test('the shipped Minotaur cut manifest carries both visual units, the head halves replace piece_head, and every unit the finisher rows name is in it or is a real cut', () => {
  assert.ok(MANIFEST.optional_units.head_split.enabled && MANIFEST.optional_units.belly_open.enabled);
  const meshes = MANIFEST.regions.map((r) => r.mesh);
  assert.ok(meshes.includes('piece_head_left') && meshes.includes('piece_head_right') && !meshes.includes('piece_head'));
  for (const r of MANIFEST.regions.filter((r) => /^piece_head_/.test(r.mesh))) assert.equal(r.detached_by, 'head', 'both halves follow the head cut');
  const shown = (u) => MANIFEST.caps.filter((c) => c.shown_when_cut === u).map((c) => c.mesh).sort();
  assert.deepEqual(shown('head_split'), ['cap_split_head_left', 'cap_split_head_right']);
  assert.deepEqual(shown('belly_open'), ['cap_belly_opening']);
  assert.deepEqual(shown('head'), ['cap_neck_head_left', 'cap_neck_head_right', 'cap_neck_torso']);
  for (const row of Object.values(ROWS.finisherCuts.rows)) for (const u of finisherUnits(row, () => true)) assert.ok(UNITS.includes(u) || MANIFEST.optional_units[u]?.enabled, `${u} is carried`);
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

test('halvesApart: the split head\'s halves ease from touching to the data row\'s distance over its seconds, then hold (M9a, data/physics.json finisherCuts.halves)', () => {
  const halves = JSON.parse(readFileSync(new URL('../data/physics.json', import.meta.url), 'utf8')).finisherCuts.halves;
  assert.ok(halves.apartM > 0 && halves.overS > 0);
  assert.equal(halvesApart(halves, 0), 0);
  assert.equal(halvesApart(halves, -1), 0);
  assert.ok(halvesApart(halves, halves.overS / 4) > 0 && halvesApart(halves, halves.overS / 4) < halves.apartM);
  assert.equal(halvesApart(halves, halves.overS), halves.apartM);
  assert.equal(halvesApart(halves, 10), halves.apartM);
});
