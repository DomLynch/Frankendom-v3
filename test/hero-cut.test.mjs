// The hero is a cut GLB (parts-wear step 1, "you become what you kill"): src/assets/psyche-106.glb is OpenTrident's derived Psyche cut with the hair repaired
// (scripts/hero-body/repair-psyche-cut-hair.mjs), the same seven piece_* + cap_* meshes and manifest schema as the bosses (docs/CUT-CONTRACT.md).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { readAccessor, repackCut, unpackMeshopt } from '../scripts/cut-glb-pack.mjs';
import { optimizeGlb } from '../scripts/optimize-glb.mjs';
import RIG from '../data/rig.json' with { type: 'json' };

const asset = (f) => new URL(`../src/assets/${f}`, import.meta.url);
const raw = readFileSync(asset('psyche-106.glb'));
const parse = async (b) => { const n = b.readUInt32LE(12); return unpackMeshopt(JSON.parse(b.subarray(20, 20 + n)), b.subarray(28 + n)); };
const { d, bin } = await parse(raw);
const manifest = JSON.parse(readFileSync(asset('psyche-106.cut.manifest.json'), 'utf8'));
const hairPrims = d.meshes.flatMap((m) => m.primitives.filter((p) => d.materials[p.material].name === 'Ch22_hair').map((p) => ({ m: m.name, p })));

test('the hero file is the cut body: the manifest names every piece and cap, one 106-joint skin, no Steel draw', () => {
  assert.equal(manifest.schema, 'cut-pieces/1'); assert.equal(manifest.body, 'psyche-106'); assert.equal(RIG.files.psyche, 'psyche-106');
  assert.deepEqual(d.meshes.map((m) => m.name).sort(), [...manifest.regions.map((r) => r.mesh), ...manifest.caps.map((c) => c.mesh)].sort());
  assert.equal(manifest.regions.length, 11, 'seven pieces + the hand and foot pieces of the hands-and-feet cut (OpenTrident PR #13): piece_arm_* and piece_leg_* stop at the wrist and ankle');
  assert.deepEqual(manifest.regions.filter((r) => /^(hand|foot)_/.test(r.id)).map((r) => r.mesh).sort(), ['piece_foot_left', 'piece_foot_right', 'piece_hand_left', 'piece_hand_right']);
  assert.equal(manifest.caps.length, 12, 'no cap on the hand and foot cuts');
  assert.equal(d.skins.length, 1); assert.equal(d.skins[0].joints.length, 106);
  assert.ok(!d.nodes.some((n) => n.name === 'Steel' || n.name === 'Ch22_Eyelashes'), 'the old one-draw nodes are gone');
  assert.equal(d.animations.length, 32);
  for (const name of RIG.hide) assert.ok(!d.meshes.some((m) => m.name === name), `${name}: a hidden armour layer carries no mesh`);
});

test('hair: one hair draw, on the head piece, all of it on the Head joint (nothing drives hair in V3; the cut tool had re-bound copies to the hips, arms and legs)', () => {
  assert.deepEqual(hairPrims.map((h) => h.m), ['piece_head']);
  const p = hairPrims[0].p, sk = d.skins[0], names = sk.joints.map((j) => d.nodes[j].name);
  const J = readAccessor(d, bin, d.accessors[p.attributes.JOINTS_0], false), W = readAccessor(d, bin, d.accessors[p.attributes.WEIGHTS_0]), P = readAccessor(d, bin, d.accessors[p.attributes.POSITION]);
  let head = 0;
  for (let i = 0; i < J.length / 4; i++) { let w = 0; for (let c = 0; c < 4; c++) if (names[J[i * 4 + c]] === 'mixamorig:Head') w += W[i * 4 + c]; head += w; }
  assert.ok(head / (J.length / 4) > 0.95, `mean Head weight ${head / (J.length / 4)}`);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]); }
  assert.ok(lo[1] > 1.45 && hi[1] < 1.85 && hi[0] - lo[0] < 0.4 && hi[2] - lo[2] < 0.4, `the hair sits on the head: ${lo} .. ${hi}`);
});

test('the shipped copy packs through the cut path (uint16 indices, one skin)', async () => {
  const packed = await optimizeGlb(raw, undefined, { cut: true });
  assert.ok(packed.length < 2_000_000, `packed ${packed.length}`);
  const B = await parse(packed);
  assert.deepEqual(B.d.meshes.map((m) => m.name), d.meshes.map((m) => m.name));
  // the hf cut shares one vertex accessor between a limb piece and its hand or foot piece and writes uint32 index lists: the pack stacks each accessor once and narrows the indices; every triangle survives
  const tris = (g) => Object.fromEntries(g.d.meshes.map((m) => [m.name, m.primitives.reduce((n, p) => n + g.d.accessors[p.indices].count / 3, 0)]));
  assert.deepEqual(tris(B), tris({ d, bin }));
  assert.ok(tris(B).piece_hand_left > 0 && tris(B).piece_foot_right > 0);
  const base = d.meshes.find((m) => m.name === 'piece_arm_left').primitives[0].attributes.POSITION;
  assert.equal(d.meshes.find((m) => m.name === 'piece_hand_left').primitives[0].attributes.POSITION, base, 'the hand shares the arm piece vertex accessor');
});

test('every wear donor file (src/assets/wear, build.mjs CUT_GLBS) packs through the cut path with every triangle kept', async () => {
  const stems = ['minotaur', 'gargantua', 'arachne', 'parasite', 'anime-boy-black', 'anime-girl-blonde', 'castle-guard', 'big-vegas'];   // sporty-granny ships as written (TEXCOORD_1), as the build says
  const build = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
  for (const s of stems) {
    assert.ok(build.includes(`'${s}'`) && build.includes('src/assets/wear/${s}-106.hf.glb'), `${s} is in the build's cut pack list`);
    const A = await parse(readFileSync(asset(`wear/${s}-106.hf.glb`))), tris = (g) => g.d.meshes.map((m) => [m.name, m.primitives.reduce((n, p) => n + g.d.accessors[p.indices].count / 3, 0)]), before = tris(A);
    await repackCut(A.d, A.bin);   // the geometry half of the cut path (the texture half needs jpegtran, which the CI image lacks)
    assert.deepEqual(tris(A), before, `${s}: every triangle of every piece kept`);
    const prims = A.d.meshes.flatMap((m) => m.primitives);
    assert.ok(prims.every((p) => A.d.accessors[p.indices].componentType === 5123), `${s}: indices narrowed to uint16`);
    const hand = A.d.meshes.find((m) => m.name === 'piece_hand_left').primitives[0], arm = A.d.meshes.find((m) => m.name === 'piece_arm_left').primitives[0];
    assert.equal(hand.attributes.POSITION, arm.attributes.POSITION, `${s}: the hand shares its arm's vertex accessor, stacked once`);
  }
});
