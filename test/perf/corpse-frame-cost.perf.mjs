// PERF ROW (wall-clock budget): Mac only, run with MAC_HEAVY_OK=1 and load < 12 (check `uptime`). Never in CI or hfjob. Run: npm run perf:rows
// Moved out of test/corpse-ragdoll.test.mjs (Strategy ruling B): the frame cost of four corpses and one live foe in one world, the package's 3 ms budget (same shape as its test:budget).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createPhysics } from '@frankendom/physics';
import { createThreeRig } from '@frankendom/physics/three-rig';
import { createCutRig } from '@frankendom/physics/three-cuts';
import { counterparts, makeCorpseRig, slotPosition } from '../../src/fight/ragdoll.ts';

const ROWS = JSON.parse(readFileSync(new URL('../../data/physics.json', import.meta.url), 'utf8')), C = ROWS.corpse;
const measure = JSON.parse(readFileSync(new URL(`../../node_modules/@frankendom/physics/data/bodies/${ROWS.opponents[0].measure['106'].split('/').pop()}`, import.meta.url), 'utf8'));
const TICK = 1 / ROWS.tickHz, BUDGET_MS = Number(process.env.BUDGET_MS || 3);
const skip = process.env.MAC_HEAVY_OK === '1' ? false : 'perf row: set MAC_HEAVY_OK=1 (Mac only, load < 12)';

// copies of the helpers in test/corpse-ragdoll.test.mjs (left there for its behaviour tests)
function fighter(physics, slot) {
  const rd = physics.createRagdoll(measure, { id: `f${slot}`, position: slotPosition(slot, C.slotSpacingM), motorTuning: ROWS.motorTuning, solveHinges: ROWS.solveHinges });
  const root = new THREE.Group(); root.position.set(3, 0, -2); root.rotation.y = 0.9;
  const bones = {};
  rd.row.roles.forEach((r) => {
    const b = new THREE.Object3D(), parent = r.parent ? bones[r.parent] : root, pp = r.parent ? rd.row.roles.find((x) => x.id === r.parent).rest.pivot : [0, 0, 0];
    b.name = r.id; b.position.set(r.rest.pivot[0] - pp[0], r.rest.pivot[1] - pp[1], r.rest.pivot[2] - pp[2]); parent.add(b); bones[r.id] = b;
  });
  root.updateMatrixWorld(true);
  const pristine = clone(root), map = counterparts(root, pristine), bind = { bones: Object.fromEntries(Object.entries(bones).map(([p, b]) => [p, map.get(b)])), root: pristine };
  const p0 = rd.readPose(), spawnHips = [p0[0], p0[1], p0[2]];
  return { rd, root, bones, bind, spawnHips, rig: createThreeRig(THREE, rd, bones, root, { bind }) };
}
const NO_CUT_ART = { schema: 'cut-pieces/1', regions: [], caps: [] };
const CHUNK = { createThreeRig, createCutRig };
function corpseOf(f) {
  const copy = clone(f.root), made = makeCorpseRig(CHUNK, f.rd, f.root, copy, f.bones, f.root, f.bind, f.spawnHips, NO_CUT_ART);
  copy.updateMatrixWorld(true);
  return { copy, bones: made.bones, rig: made.rig, cutRig: made.cutRig, anchor: made.anchor, rd: f.rd };
}
const kill = (physics, f) => {
  f.rd.kill({ part: 'spine2', impulse: [0, 0, 60] });
  for (let i = 0; i < ROWS.tickHz * 10 && f.rd.state !== 'frozen'; i++) physics.step(TICK);
  assert.equal(f.rd.state, 'frozen');
  f.rig.applyPose();
};

// A wall-clock row is noisy upward only, so the row is the best of RUNS fresh worlds: the cost is real only if every run is over.
const RUNS = Number(process.env.BUDGET_RUNS || 3);
async function frameCost() {
  const physics = await createPhysics({ seed: ROWS.seed, states: ROWS.states });
  const corpses = [];
  for (let k = 0; k < C.max; k++) { const f = fighter(physics, k); for (let i = 0; i < 20; i++) { f.rig.drive(); physics.step(TICK); } kill(physics, f); corpses.push({ ...corpseOf(f), f }); }
  const live = fighter(physics, C.max);
  for (let i = 0; i < 30; i++) { live.rig.drive(); physics.step(TICK); }
  const times = [], idle = [];
  for (let t = 0; t < 360; t++) {
    if (t === 120) corpses[0].f.rd.cut('arm_right', { helmet: false, impulse: [0, 6, 9] });   // a cut in progress, as the package's budget scene has
    const t0 = performance.now();
    live.rig.drive();
    if (live.rd.state !== 'frozen' || live.rd.awake || corpses.some((c) => c.f.rd.awake)) physics.step(TICK);   // the page's rule (ragdoll.ts step)
    for (const c of corpses) if (c.f.rd.awake) c.rig.applyPose();
    const ms = performance.now() - t0;
    if (t >= 30) (t < 120 ? idle : times).push(ms);
  }
  const stat = (a) => { a = a.slice().sort((x, y) => x - y); return { avg: a.reduce((s, x) => s + x, 0) / a.length, p95: a[Math.floor(a.length * 0.95)], max: a[a.length - 1] }; };
  const all = stat([...idle, ...times]), cutting = stat(times);
  console.log(`# 4 corpses + 1 live foe: avg ${all.avg.toFixed(3)} ms, p95 ${all.p95.toFixed(3)} ms, max ${all.max.toFixed(3)} ms; from the cut on: avg ${cutting.avg.toFixed(3)} ms, p95 ${cutting.p95.toFixed(3)} ms (budget ${BUDGET_MS})`);
  physics.destroy();
  return all;
}

test('frame cost: four corpses (one with a piece in flight) and one live foe, one world: under the package\'s 3 ms budget, average and p95 (best of three runs)', { skip }, async () => {
  let best;
  for (let run = 0; run < RUNS; run++) {
    const s = await frameCost();
    if (!best || s.p95 < best.p95) best = s;
    if (s.avg < BUDGET_MS && s.p95 < BUDGET_MS) break;
  }
  assert.ok(best.avg < BUDGET_MS, `average ${best.avg} ms`);
  assert.ok(best.p95 < BUDGET_MS, `p95 ${best.p95} ms`);
});
