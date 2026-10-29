// Audit 5 microbench (CPU only, no browser): one rig's per-frame bone work, the old pattern against the new, on a synthetic 106-joint tree (106 bones + 12 meshes,
// about 8 deep, the 12 boneWorld lookups a fight frame makes). Old: a recursive getObjectByName plus a full subtree updateWorldMatrix per call. New: src/fight/rig-bones.ts `bone`
// (cached) plus one subtree refresh then chain-only refreshes, as characters.ts boneWorld does.   node scripts/bench-bone-cache.mjs
import { Mesh, Object3D, Vector3 } from 'three';
import { bone, boneLookups, sanitizeNodeName } from '../src/fight/rig-bones.ts';
import RIG from '../data/rig.json' with { type: 'json' };

const mk = (n) => { const o = new Object3D(); o.name = n; o.position.set(Math.random(), Math.random(), Math.random()); o.rotation.set(Math.random(), 0, 0); return o; };
const NAMES = ['neck_01', 'spine_02', 'calf_r', 'pelvis', 'foot_l', 'foot_r', 'Head', 'hand_r', 'hand_l', 'Head', 'foot_l', 'foot_r'];   // the 12 boneWorld calls of a frame
const on106 = (n) => sanitizeNodeName(RIG.bones[n]);
const root = mk('Root'), hips = mk(on106('pelvis')); root.add(hips);
const queue = [hips]; let count = 1;
while (count < 106) { const p = queue.shift(); for (let i = 0; i < 3 && count < 106; i++) { const c = mk(`b${count++}`); p.add(c); queue.push(c); } }
for (const n of new Set(NAMES)) if (n !== 'pelvis') queue.at(-1 - (NAMES.indexOf(n) % 5)).add(mk(on106(n)));   // the named bones sit deep in the tree, as the limbs do
for (let i = 0; i < 12; i++) root.add(new Mesh());
const out = new Vector3();
const old = () => { for (const n of NAMES) { const b = root.getObjectByName(on106(n)); root.updateWorldMatrix(true, true); b.getWorldPosition(out); } };
const fresh = () => { let first = true; for (const n of NAMES) { const b = bone(root, n); if (first) { root.updateWorldMatrix(true, true); first = false; } else b.updateWorldMatrix(true, false); b.getWorldPosition(out); } };
const ms = (f, n) => { for (let i = 0; i < 300; i++) f(); const t = performance.now(); for (let i = 0; i < n; i++) f(); return (performance.now() - t) / n; };
const results = [];
for (let r = 0; r < 5; r++) results.push([ms(old, 3000), ms(fresh, 3000)]);
for (const [o, n] of results) console.log(`old ${o.toFixed(4)} ms/frame   new ${n.toFixed(4)} ms/frame   x${(o / n).toFixed(1)}`);
console.log(`counters after the runs: ${JSON.stringify(boneLookups)}; per frame old = ${NAMES.length} recursive searches + ${NAMES.length} subtree refreshes, new = 0 searches (cached) + 1 subtree refresh + ${NAMES.length - 1} chain refreshes`);
