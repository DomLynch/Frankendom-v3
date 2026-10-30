// Frankendom parts, stage 2 fit (src/fight/parts-fit.ts, data/parts.json `fit`, data/parts-fit-rows.json, src/sim/validate-parts-fit.js): OpenTrident's synthetic long-leg-donor / short-leg-target
// test ported, the data checks (and a bad row named), the V3 profile -> OpenTrident body mapping, and the pin that no tuning number sits in the code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Bone, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3, Box3, DoubleSide } from 'three';
import { PARTS } from '../src/parts.ts';
import { FIT_ROWS, fitBodyOf, heroFitBody, isWearable, validateRows, wearableDonors } from '../src/parts-fit-rows.ts';
import { bindPiece, buildCollar, collarFor, collarRows, fitMatrices, liftRow, seamRing } from '../src/fight/parts-fit.ts';
import { validateFile } from '../src/sim/validate.js';
import { validateFit, validateFitRows } from '../src/sim/validate-parts-fit.js';
import { scan } from '../scripts/as-data/check.mjs';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const RAW = read('parts'), ROWS = read('parts-fit-rows'), PROFILES = read('profiles'), RIG = read('rig');
const clone = (o) => JSON.parse(JSON.stringify(o));
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);
const L = PARTS.fit.limits;

// ---- the synthetic pair: Hips -> Head (up), Hips -> LeftUpLeg -> LeftLeg -> LeftFoot (down) -------------------------------------------------------------------------------------------------
function makeRig(leg, head) {
  const mk = (name, x, y) => { const b = new Bone(); b.name = name; b.position.set(x, y, 0); return b; };
  const hips = mk('mixamorigHips', 0, 1), headB = mk('mixamorigHead', 0, head), up = mk('mixamorigLeftUpLeg', 0.1, 0), knee = mk('mixamorigLeftLeg', 0, -leg), foot = mk('mixamorigLeftFoot', 0, -leg);
  hips.add(headB, up); up.add(knee); knee.add(foot);
  const root = new Group(); root.add(hips); root.updateMatrixWorld(true);
  const bones = [hips, headB, up, knee, foot];
  return { root, bones, nodes: new Map(bones.map((b) => [b.name, b])) };
}
function donorPiece(rig, verts, boneIdx) {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(verts.flat(), 3));
  geo.setAttribute('skinIndex', new Uint16BufferAttribute(boneIdx.flatMap((i) => [i, 0, 0, 0]), 4));
  geo.setAttribute('skinWeight', new Float32BufferAttribute(boneIdx.flatMap(() => [1, 0, 0, 0]), 4));
  geo.setIndex([0, 1, 2]);
  const mesh = new SkinnedMesh(geo, new MeshBasicMaterial());
  rig.root.add(mesh); mesh.bind(new Skeleton(rig.bones)); return mesh;
}
const skinned = (mesh, i) => { const v = new Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i); mesh.applyBoneTransform(i, v); return v.applyMatrix4(mesh.matrixWorld); };
// OpenTrident's case has legs 1.0 m vs 0.6 m (ratio 0.6): inside its own clamps. V3 adds none, so the shipped rules run it as is.
const donor = makeRig(0.5, 0.6), target = makeRig(0.3, 0.4);
const piece = donorPiece(donor, [[0.1, 0.25, 0], [0.1, 0.5, 0], [0.1, 0, 0]], [3, 3, 4]);
const tw = (name) => new Vector3().setFromMatrixPosition(target.nodes.get(name).matrixWorld);

test('fitMatrices: the shin stretches along its axis by target/donor, the foot takes the height ratio', () => {
  const fm = fitMatrices(piece.skeleton, target.nodes);
  near(fm[3].elements[5], 0.6, 1e-6, 'shin scale along its axis');
  near(fm[4].elements[5], 0.4 / 0.6, 1e-6, 'foot scale = height ratio');
});

test('bindPiece: the donor knee and ankle land on the target joints; unfitted keeps the donor offsets', () => {
  const fitted = bindPiece(piece, piece.geometry, target.nodes); target.root.add(fitted); target.root.updateMatrixWorld(true);
  near(skinned(fitted, 1).distanceTo(tw('mixamorigLeftLeg')), 0, 1e-5, 'knee vertex on the target knee');
  near(skinned(fitted, 2).distanceTo(tw('mixamorigLeftFoot')), 0, 1e-5, 'foot vertex on the target ankle');
  near(skinned(fitted, 0).y, (tw('mixamorigLeftLeg').y + tw('mixamorigLeftFoot').y) / 2, 1e-5, 'shin midpoint stays midway');
  assert.equal(fitted.skeleton.bones[3], target.nodes.get('mixamorigLeftLeg'), 'bound to the TARGET bone by name');
  const plain = bindPiece(piece, piece.geometry, target.nodes, false); target.root.add(plain); target.root.updateMatrixWorld(true);
  assert.ok(Math.abs(skinned(plain, 0).y - (tw('mixamorigLeftLeg').y + tw('mixamorigLeftFoot').y) / 2) > 0.05, 'the unfitted shin midpoint is off (the stretch the fit removes)');
});

test('liftRow: matched legs need no lift; a clamp-bound pair reports the leftover; other units never lift', () => {
  const m = (thigh, shin) => ({ thigh_len: thigh, shin_len: shin });
  const unit = PARTS.fit.lift.unit;
  near(liftRow(unit, m(0.5, 0.5), m(0.3, 0.3)).lift_y, 0, 1e-9, 'unclamped legs: no lift');
  near(liftRow(unit, m(0.5, 0.5), m(0.3, 0.3)).scale, 0.6, 1e-9, 'unclamped scale');
  const giant = liftRow(unit, m(2.0, 2.0), m(0.3, 0.3));
  near(giant.scale, L.boneLo, 1e-9, 'clamped at boneLo'); near(giant.lift_y, 4 * L.boneLo - 0.6, 1e-9, 'giant legs: raise the root by the leftover');
  assert.deepEqual(liftRow('arms', m(2, 2), m(0.3, 0.3)), { scale: 1, lift_y: 0 });
  assert.deepEqual(liftRow(unit, {}, m(0.3, 0.3)), { scale: 1, lift_y: 0 });
  assert.deepEqual(liftRow(unit, null, m(0.3, 0.3)), { scale: 1, lift_y: 0 }, 'a body with no measure row lifts 0');
});

test('collars: five rows from a measure row, a ring centred on its joint with the row radius, a missing bone gives null', () => {
  const rows = collarRows({ height_m: 1.7, shoulder_w: 0.3, neck_len: 0.1, upper_arm_r: 0.04, thigh_r: 0.07 });
  assert.deepEqual(rows.map((r) => r.id), PARTS.fit.collar.joints.map((j) => j.id));
  assert.equal(rows.length, 5);
  assert.deepEqual(collarRows(null), []);
  const hipRow = rows.find((r) => r.id === 'hip_l'), collar = buildCollar(hipRow, target.nodes, new MeshBasicMaterial(), [0.25, 0.5]);
  target.root.add(collar); target.root.updateMatrixWorld(true);
  const pts = []; for (let i = 0; i < collar.geometry.attributes.position.count; i++) pts.push(skinned(collar, i));
  const centre = new Box3().setFromPoints(pts).getCenter(new Vector3());
  near(centre.distanceTo(tw('mixamorigLeftUpLeg')), 0, 1e-4, 'hip collar centred on the hip joint');
  near(Math.max(...pts.map((p) => Math.hypot(p.x - centre.x, p.z - centre.z))), hipRow.r, 1e-4, 'collar radius = row radius');
  assert.equal(collar.material.side, DoubleSide); assert.deepEqual([...collar.geometry.attributes.uv.array.slice(0, 2)], [0.25, 0.5]);
  assert.equal(buildCollar({ ...hipRow, bone: 'nope' }, target.nodes, new MeshBasicMaterial(), [0, 0]), null);
});

// A cylinder-ish ring of `n` vertices at height y and radius r around the y axis, in a Mesh with an identity matrix.
function ringMesh(r, y, n = 16) {
  const pos = [], uv = [];
  for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; pos.push(Math.cos(t) * r, y, Math.sin(t) * r); uv.push(0.25, 0.75); }
  const geo = new BufferGeometry(); geo.setAttribute('position', new Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  const mesh = new Mesh(geo, new MeshBasicMaterial()); mesh.updateMatrixWorld(true); return mesh;
}
test('seamRing: the cut ring radius and texel of the vertices in the band; too few vertices gives null; far vertices are ignored', () => {
  const S = PARTS.fit.seam, joint = new Vector3(0, 1, 0), axis = new Vector3(0, 1, 0);
  const ring = seamRing(ringMesh(0.3, 1.0), joint, axis);
  near(ring.r, 0.3, 1e-6, 'radius'); assert.deepEqual(ring.uv, [0.25, 0.75]); assert.equal(ring.n, 16);
  assert.equal(seamRing(ringMesh(0.3, 1.0 + 2 * S.bandM), joint, axis), null, 'a ring outside the band');
  assert.equal(seamRing(ringMesh(0.3, 1.0, S.minVerts - 1), joint, axis), null, 'below the minimum vertex count');
  assert.equal(seamRing(ringMesh(0.3, 1.0, S.minVerts), joint, axis).n, S.minVerts);
});

test('collarFor: a donor ring >= coverFrac x the hero ring needs no collar, else a collar at the mean radius x meanK in the donor texel', () => {
  const { coverFrac, meanK, } = PARTS.fit.limits, row = { id: 'neck', bone: 'mixamorigNeck', at: 0.5, r: 0.5, h: 0.05 };
  const hero = { r: 0.075, uv: [0, 0], n: 20 };
  assert.equal(collarFor(row, { r: 0.289, uv: [0.1, 0.2], n: 20 }, hero), null, 'a wide donor (Lord Gourd) covers the hole');
  assert.equal(collarFor(row, { r: hero.r * coverFrac, uv: [0.1, 0.2], n: 20 }, hero), null, 'exactly coverFrac still covers');
  const narrow = { r: 0.05, uv: [0.1, 0.2], n: 20 }, c = collarFor(row, narrow, hero);
  near(c.row.r, ((0.05 + 0.075) / 2) * meanK, 1e-4, 'mean radius x meanK'); assert.deepEqual(c.uv, [0.1, 0.2]); assert.equal(c.row.h, row.h); assert.equal(c.row.bone, row.bone);
  assert.deepEqual(collarFor(row, null, hero), { row, uv: null }, 'no donor ring: the stored row stands');
  assert.deepEqual(collarFor(row, narrow, null), { row, uv: [0.1, 0.2] }, 'no hero ring: the stored row, the donor texel');
});

// ---- the data -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('data/parts.json fit, data/parts-fit-rows.json and the key checks are valid', () => {
  assert.deepEqual(validateFit(PARTS.fit), []);
  assert.deepEqual(validateFile('parts', RAW), []);
  assert.deepEqual(validateFile('parts-fit-rows', ROWS), []);
  assert.deepEqual(validateRows(), []);
  assert.deepEqual(L, { boneLo: 0.4, boneHi: 2.5, heightLo: 0.6, heightHi: 1.6, coverFrac: 0.98, meanK: 1.02 }, 'the clamps and the collar-rule factors are OpenTrident\'s');
});

test('a bad fit rule or a bad row is named', () => {
  const badFit = (f) => { const p = clone(RAW.fit); f(p); return validateFit(p).join('\n'); };
  assert.match(badFit((p) => { p.limits.boneLo = 3; }), /limits\.boneLo|each Lo/);
  assert.match(badFit((p) => { p.limits.extra = 1; }), /limits\.extra: unknown key/);
  assert.match(badFit((p) => { p.collar.joints[0].rule = 'nope'; }), /not a row of collar\.rules/);
  assert.match(badFit((p) => { p.collar.rules.hip.rOf = 'nope'; }), /rOf: a measure key/);
  assert.match(badFit((p) => { p.collar.segments = 1.5; }), /collar\.segments/);
  assert.match(badFit((p) => { delete p.eps; }), /eps: an object/);
  assert.match(badFit((p) => { p.seam.minVerts = 0; }), /seam\.minVerts/);
  assert.match(badFit((p) => { p.limits.coverFrac = 1.5; }), /limits\.coverFrac/);
  assert.match(validateFile('parts', { ...RAW, fit: { ...RAW.fit, stray: 1 } }).join(), /fit\.stray: unknown key/);
  const bad = (f) => { const r = clone(ROWS); f(r); return validateFitRows(r, PARTS.fit, new Set(PROFILES.profiles.map((p) => p.id))).join('\n'); };
  assert.match(bad((r) => { r.bodies[1].measure.thigh_len = -1; }), /thigh_len: a positive number/);
  assert.match(bad((r) => { r.bodies[1].measure.bogus = 1; }), /measure\.bogus: unknown key/);
  assert.match(bad((r) => { delete r.bodies[1].measure.shin_len; }), /shin_len: required/);
  assert.match(bad((r) => { r.bodies[1].collars[0].id = 'knee'; }), /not a joint/);
  assert.match(bad((r) => { r.bodies[1].collars[0].r = 0; }), /collars\[0\]\.r: a positive radius/);
  assert.match(bad((r) => { r.bodies[1].collars[1].bone = 'mixamorigHead'; }), /bone and at must be/);
  assert.match(bad((r) => { r.bodies[1].id = 'nobody'; }), /neither the hero nor/);
  assert.match(bad((r) => { r.bodies[2].id = r.bodies[1].id; }), /unique lower-case id/);
  assert.match(bad((r) => { r.bodies[6].collars = [r.bodies[1].collars[0]]; }), /none without a measure row/);
  assert.match(bad((r) => { r.bodies[1].source = 'maybe'; }), /source: one of/);
  assert.match(bad((r) => { r.bodies[1].wearable = 'yes'; }), /wearable: true or false/);
  assert.match(bad((r) => { r.bodies[2].quality = r.bodies[1].quality; }), /rank \d+ twice/);
  assert.match(bad((r) => { r.bodies[0].wearable = true; }), /wearable: the hero row has none/);
  assert.match(bad((r) => { r.hero = 'ghost'; }), /hero: "ghost" is not a row/);
  assert.match(validateFile('parts-fit-rows', { ...ROWS, extra: 1 }).join(), /extra: unknown key/);
});

test('the stored collar rows equal what the rules give from the measure row (so the rules and the rows cannot drift)', () => {
  for (const b of FIT_ROWS.bodies) assert.deepEqual(collarRows(b.measure), b.collars, b.id);
});

// OpenTrident id by name: Minotaur = profile pitborn (body minotaur, ch25), Gargantua ch43, Arachne ch47, Psyche ch22, the rest by their Mixamo name. Every body that has a cut manifest has a row.
const MAPPING = { psyche: 'ch22-nonpbr', pitborn: 'ch25-nonpbr', gargantua: 'ch43-nonpbr', arachne: 'ch47-nonpbr' };
test('the V3 mapping covers the hero and the three first donors, and every profile that has a cut GLB', () => {
  assert.equal(heroFitBody().id, 'psyche');
  for (const [id, ot] of Object.entries(MAPPING)) { const b = fitBodyOf(id); assert.equal(b.measuredOn, ot, id); assert.ok(b.measure && b.measure.height_m > 0 && b.collars.length === 5, `${id} has a measure row and five collars`); }
  const stem = (p) => RIG.files[p.id] ?? RIG.files[p.body];
  const cut = PROFILES.profiles.filter((p) => stem(p) && existsSync(new URL(`../src/assets/${stem(p)}.cut.manifest.json`, import.meta.url)));
  assert.ok(cut.length >= 12, 'the twelve cut bodies');
  for (const p of cut) assert.ok(fitBodyOf(p.id), `${p.id} has a fit row`);
  assert.ok(FIT_ROWS.bodies.filter((b) => b.id !== FIT_ROWS.hero).every((b) => PROFILES.profiles.some((p) => p.id === b.id)), 'every donor row is a profile');
  assert.equal(fitBodyOf('kachujin').measure, null, 'no measure row: lift 0, no collars');
});

test('the donor ranking: nine wearable bodies in order, quality 1..12, derived only for castle-guard, big-vegas, pumpkinhulk', () => {
  assert.deepEqual(wearableDonors().map((b) => b.id), ['castle-guard', 'anime-boy-black', 'anime-girl-blonde', 'pitborn', 'parasite', 'arachne', 'sporty-granny', 'gargantua', 'big-vegas']);
  for (const id of ['the-boss', 'kachujin', 'pumpkinhulk']) assert.equal(isWearable(id), false, `${id} is not wearable yet`);
  assert.equal(fitBodyOf('pumpkinhulk').reason, "giant pumpkin head, Dom's call");
  assert.equal(isWearable('nobody'), false);
  const donors = FIT_ROWS.bodies.filter((b) => b.id !== FIT_ROWS.hero);
  assert.deepEqual(donors.map((b) => b.quality).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(donors.filter((b) => b.source === 'derived').map((b) => b.id).sort(), ['big-vegas', 'castle-guard', 'pumpkinhulk']);
});

test('real rows: every donor leg lifts finitely, and 0.91..1.20 sized donors stay inside the clamps', () => {
  const hero = heroFitBody().measure;
  for (const b of FIT_ROWS.bodies) {
    const r = liftRow(PARTS.fit.lift.unit, b.measure, hero);
    assert.ok(Number.isFinite(r.scale) && Number.isFinite(r.lift_y), b.id);
    if (b.measure) assert.ok(r.scale >= L.boneLo && r.scale <= L.boneHi, `${b.id} scale ${r.scale}`);
    else assert.deepEqual(r, { scale: 1, lift_y: 0 });
  }
});

// ---- no hard-coded tuning in the code -----------------------------------------------------------------------------------------------------------------------------------------------
test('parts-fit.ts, parts-fit-rows.ts and parts.ts hold no tuning number or text, and carry no as-data allow or baseline row', () => {
  for (const f of ['src/fight/parts-fit.ts', 'src/parts-fit-rows.ts']) {
    const hits = scan(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
    assert.deepEqual(hits.filter((h) => h.kind === 'number').map((h) => `${f}:${h.line} ${h.literal}`), [], 'only 0 and 1 may be written in the code');
    assert.deepEqual(hits.map((h) => `${f}:${h.line} ${h.kind} ${h.literal}`), [], `${f}: no number, label or compare hit`);
  }
  const allow = readFileSync(new URL('../scripts/as-data/allow.json', import.meta.url), 'utf8'), base = readFileSync(new URL('../scripts/as-data/baseline.json', import.meta.url), 'utf8');
  for (const f of ['parts-fit.ts', 'parts-fit-rows.ts']) { assert.ok(!allow.includes(f), `no allow row for ${f}`); assert.ok(!base.includes(f), `no baseline row for ${f}`); }
  assert.ok(!/\bvalidateFit\b[^\n]*=>[^\n]*\d/.test(readFileSync(new URL('../src/parts.ts', import.meta.url), 'utf8')), 'parts.ts only calls the validator');
});
