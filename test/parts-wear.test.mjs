// Frankendom parts, stage 2 wear (src/parts-wear.ts the rules, src/fight/parts-wear.ts the scene work, data/parts.json `wear`): the flags, the wearable gating (the Equip button), the equip/unequip state
// machine, the slot -> unit -> region mapping against the hero's cut manifest, and the scene work on a synthetic rig (a part goes on, replaces the hero's piece, and comes off with every hero mesh visible again).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Bone, BufferAttribute, CylinderGeometry, DataTexture, Group, Mesh, MeshBasicMaterial, Skeleton, SkinnedMesh } from 'three';
import { PARTS, equip, unequip } from '../src/parts.ts';
import { FIT_ROWS, fitBodyOf, wearableDonors } from '../src/parts-fit-rows.ts';
import { canWear, isPieceOf, stemOf, unitOfSlot, wearDiff, wearFlags, wornParts } from '../src/parts-wear.ts';
import { DONOR_URLS, createWearer, donorKey } from '../src/fight/parts-wear.ts';
import { liftRow } from '../src/fight/parts-fit.ts';
import { mountParts } from '../src/fight/parts-hook.ts';
import { validateFile } from '../src/sim/validate.js';
import { validateWear } from '../src/sim/validate-parts-fit.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const RAW = read('parts'), RIG = read('rig'), PROFILES = read('profiles'), PROGRESSION = read('progression'), STARS = read('stars');
const MANIFEST = JSON.parse(readFileSync(new URL('../src/assets/psyche-106.cut.manifest.json', import.meta.url), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const W = PARTS.wear;

// ---- the flag --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('the flag: wear is ON by default; ?parts=off is the kill-switch; ?wear= forces a loadout (a list of profile:slot ids) and an empty one wears nothing', () => {
  assert.deepEqual(wearFlags(''), { on: true, force: null });
  assert.deepEqual(wearFlags('?save=off&x=1'), { on: true, force: null });
  assert.equal(wearFlags('?parts=off').on, false);
  assert.equal(wearFlags('?parts=on').on, true, 'only the off value switches it off');
  assert.deepEqual(wearFlags('?wear=pitborn:arm_left,castle-guard:leg_left').force, ['pitborn:arm_left', 'castle-guard:leg_left']);
  assert.deepEqual(wearFlags('?wear=pitborn:head,%20arachne:arm_left,').force, ['pitborn:head', 'arachne:arm_left'], 'spaces and a trailing comma are tolerated');
  assert.deepEqual(wearFlags('?wear=').force, []);
  assert.notEqual(W.flags.off.query, W.flags.force.query);
});

// ---- the gating: which parts can be worn --------------------------------------------------------------------------------------------------------------------------------------------------------
test('wearable gating: only a wearable donor body and a unit with a wear row; the torso, the weapon and the unwearable bodies (Kachujin, the Accountant, the Gourd) are not', () => {
  for (const p of wearableDonors().map((b) => b.id)) for (const slot of ['head', 'arm_left', 'arm_right', 'hand_left', 'hand_right', 'leg_left', 'leg_right', 'foot_left', 'foot_right', 'torso']) assert.equal(canWear(p, slot), true, `${p}:${slot}`);
  for (const p of ['kachujin', 'the-boss', 'pumpkinhulk']) for (const slot of ['hand_left', 'foot_right']) assert.equal(canWear(p, slot), false, `${p}:${slot} stays not wearable with its donor body`);
  for (const p of ['kachujin', 'the-boss', 'pumpkinhulk']) assert.equal(canWear(p, 'arm_left'), false, `${p} is not wearable`);
  assert.equal(canWear('pitborn', 'weapon'), false, 'the weapon slot is a reward, not a body part');
  assert.equal(canWear('nobody', 'head'), false, 'no fit row = not wearable');
  const noTorso = clone(PARTS); delete noTorso.wear.units.torso_waist;
  assert.equal(canWear('pitborn', 'torso', noTorso), false, 'a unit with no wear row is not wearable (the way the torso was before it looked right)');
  assert.deepEqual(wornParts(['pitborn:head', 'kachujin:arm_left', 'pitborn:torso', 'castle-guard:leg_left', 'junk', 'pitborn:arm_left:x']).map((p) => p.id), ['pitborn:head', 'castle-guard:leg_left', 'pitborn:torso']);
  assert.deepEqual(wornParts(['arachne:arm_left', 'pitborn:arm_left']).map((p) => p.id), ['arachne:arm_left'], 'one part per slot: the first stands');
  assert.deepEqual(wornParts({ leg_left: 'pitborn:leg_left', head: 'arachne:head' }).map((p) => p.id), ['arachne:head', 'pitborn:leg_left'], 'worn in slot order, whatever order the map has');
  assert.deepEqual(wornParts(null), []); assert.deepEqual(wornParts(undefined), []);
  const all = wornParts(['pitborn:head', 'pitborn:arm_left', 'pitborn:arm_right', 'pitborn:leg_left', 'pitborn:leg_right']);
  assert.equal(all.length, Math.min(5, W.budget.partsMax), 'the budget caps how many parts are worn at once');
  const full = wornParts(['pitborn:head', 'pitborn:arm_left', 'pitborn:arm_right', 'pitborn:hand_left', 'pitborn:hand_right', 'pitborn:leg_left', 'pitborn:leg_right', 'pitborn:foot_left', 'pitborn:foot_right', 'pitborn:torso']);
  assert.equal(full.length, W.budget.partsMax, 'every wearable slot at once is the budget');
  assert.deepEqual(wornParts(['pitborn:hand_left', 'castle-guard:foot_right']).map((p) => [p.slot, p.unit, p.collar, p.lift]), [['hand_left', 'hand_left', 'wrist_l', undefined], ['foot_right', 'foot_right', 'ankle_r', undefined]], 'hands and feet carry the wrist and ankle collars and no lift');
  const p = wornParts(['pitborn:leg_left'])[0];
  assert.deepEqual([p.profile, p.slot, p.unit, p.stem, p.source, p.collar, p.lift], ['pitborn', 'leg_left', 'leg_left', 'minotaur', 'original', 'hip_l', 'legs']);
  assert.equal(wornParts(['castle-guard:head'])[0].source, 'derived', 'Reginald and the King load the derived GLB');
});

test('the Equip button is offered only for a wearable part; the others stay listed as collected, with the reason; onWorn carries the new equipped map', () => {
  class El {
    constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.attrs = {}; this.style = {}; this.hidden = false; this.className = ''; this.textContent = ''; this.parent = null; }
    append(...k) { for (const c of k) { if (typeof c === 'string') this.children.push(Object.assign(new El('#text'), { textContent: c })); else { c.parent = this; this.children.push(c); } } }
    replaceChildren() { this.children = []; }
    setAttribute(k, v) { this.attrs[k] = v; }
    remove() {}
    all(out = []) { out.push(this); for (const c of this.children) c.all(out); return out; }
    text() { return [this.textContent, ...this.children.map((c) => c.text())].join(' '); }
  }
  const doc = { createElement: (t) => new El(t), body: new El('body'), head: new El('head') };
  const box = { save: { unlocked: [], parts: { 'arachne:arm_left': { n: 1, star: 0 }, 'kachujin:head': { n: 1, star: 0 }, 'pitborn:torso': { n: 1, star: 0 } } } }, worn = [];
  mountParts({ get: () => box.save, put: (s) => { box.save = s; }, profiles: PROFILES.profiles, stars: STARS, prog: PROGRESSION, onWorn: (e) => worn.push({ ...e }) }, doc);
  doc.body.all().find((e) => e.dataset.frank === 'button').onclick();
  const buttons = doc.body.all().filter((e) => e.dataset.frank === 'equip'), sheet = doc.body.all().find((e) => e.dataset.frank === 'sheet');
  assert.equal(buttons.length, 2, 'an Equip button for each wearable part: Arachne arm, Minotaur torso');
  const rows = doc.body.all().filter((e) => e.dataset.part);
  assert.equal(rows.length, 3, 'all three collected parts are still listed');
  assert.deepEqual(rows.filter((r) => r.dataset.wearable === 'false').map((r) => r.dataset.part), ['kachujin:head'], 'Kachujin is not a wearable donor');
  assert.match(sheet.text(), new RegExp(PARTS.text.notWearable));
  buttons.find((b) => b.parent?.dataset.part === 'arachne:arm_left').onclick();
  assert.deepEqual(worn, [{ arm_left: 'arachne:arm_left' }]);
});

// ---- the state machine ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('equip / unequip state machine: wearDiff names what comes off and what goes on; the same loadout changes nothing; replacing a slot swaps; clearing takes all off', () => {
  const a = wornParts(['pitborn:arm_left', 'arachne:head']), b = wornParts(['pitborn:arm_left', 'arachne:head']);
  assert.deepEqual(wearDiff(a, b), { remove: [], add: [] });
  assert.deepEqual(wearDiff([], a).add.map((p) => p.id), ['arachne:head', 'pitborn:arm_left']);
  assert.deepEqual(wearDiff(a, []).remove.map((p) => p.id), ['arachne:head', 'pitborn:arm_left']);
  const swapped = wornParts(['gargantua:arm_left', 'arachne:head']), d = wearDiff(a, swapped);
  assert.deepEqual([d.remove.map((p) => p.id), d.add.map((p) => p.id)], [['pitborn:arm_left'], ['gargantua:arm_left']]);
  // through the save's own pure equip/unequip: the loadout follows the save
  let save = { unlocked: [], parts: { 'pitborn:head': { n: 1, star: 0 }, 'arachne:arm_left': { n: 1, star: 0 } } };
  save = equip(save, 'pitborn:head'); save = equip(save, 'arachne:arm_left');
  assert.deepEqual(wornParts(save.equipped).map((p) => p.id), ['pitborn:head', 'arachne:arm_left']);
  save = unequip(save, 'head');
  assert.deepEqual(wornParts(save.equipped).map((p) => p.id), ['arachne:arm_left']);
});

// ---- the data ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('slot -> unit -> region: every slot of data/parts.json is either worn through a hero region of the cut manifest (with a stump cap and a collar joint) or listed as not wearable', () => {
  const notWearable = [];
  for (const slot of PARTS.slots) {
    const unit = unitOfSlot(slot.id);
    if (!unit) { notWearable.push(slot.id); continue; }
    const row = W.units[unit];
    if (!row) { notWearable.push(slot.id); continue; }
    const regions = MANIFEST.regions.filter((r) => r.detached_by === unit);
    assert.ok(regions.length >= 1, `${slot.id}: the hero's manifest has a region detached by ${unit}`);
    for (const r of regions) assert.ok(isPieceOf(r.mesh, row.piece ?? unit), `${r.mesh} is a piece of ${row.piece ?? unit}`);
    // Physics' hf cut (tools/cut-batch.mjs --hands-feet) gives the hero a cap on the wrist and ankle stump too (cap_wrist_*_arm, cap_ankle_*_leg), so a hand or foot has a remaining-side cap like every other unit
    const cap = MANIFEST.caps.some((c) => c.shown_when_cut === unit && !regions.some((r) => r.id === c.region));
    assert.equal(cap, true, `${slot.id}: a hero stump cap on the remaining side shows for ${unit}`);
    if (row.collar) assert.ok(PARTS.fit.collar.joints.some((j) => j.id === row.collar), `${slot.id}: collar joint ${row.collar}`);
    else assert.equal(unit, 'torso_waist', 'only the torso has no seam collar (its seams are the arms and the head, which are the hero pieces or other parts)');
    if (row.lift) assert.equal(row.lift, PARTS.fit.lift.unit);
  }
  assert.deepEqual(notWearable.sort(), ['weapon'], 'only the weapon slot (a boss-weapon reward, no hero piece); the torso went last, after the stills looked right');
  assert.equal(PARTS.slots.length, 11, 'eleven slots: head, two arms, two hands, two legs, two feet, torso, weapon');
  assert.deepEqual(['hand_left', 'hand_right', 'foot_left', 'foot_right'].map((s) => [s, W.units[unitOfSlot(s)].collar]), [['hand_left', 'wrist_l'], ['hand_right', 'wrist_r'], ['foot_left', 'ankle_l'], ['foot_right', 'ankle_r']]);
  // the arm and leg pieces of the hf hero no longer carry the hand and foot: an arm worn leaves the hero's own hand in place
  assert.deepEqual(MANIFEST.regions.filter((r) => r.detached_by === 'arm_left').map((r) => r.id), ['arm_left']);
  assert.deepEqual(MANIFEST.regions.filter((r) => r.detached_by === 'leg_right').map((r) => r.id), ['leg_right']);
  for (const j of PARTS.fit.collar.joints) assert.ok(W.heroHost[j.id], `heroHost row for ${j.id}`);
  assert.ok(Array.isArray(W.heroCollars));
});

const glbJson = (url) => { const b = readFileSync(url); return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12))); };
test('hf mixing guard: the hero and every wearable donor load their hand-and-foot cut (an original arm or leg piece carries its own hand or foot, which would show twice beside a worn one)', () => {
  const regionIds = (m) => m.regions.map((r) => r.id).sort();
  const hero = JSON.parse(readFileSync(new URL('../src/assets/psyche-106.cut.manifest.json', import.meta.url), 'utf8')), HF = ['hand_left', 'hand_right', 'foot_left', 'foot_right'];
  for (const u of HF) assert.ok(regionIds(hero).includes(u), `the hero file has the ${u} region`);
  const heroMeshes = glbJson(new URL('../src/assets/psyche-106.glb', import.meta.url)).meshes.map((m) => m.name);
  for (const u of HF) assert.ok(heroMeshes.includes(`piece_${u}`), `the hero GLB has piece_${u}`);
  const keys = Object.keys(DONOR_URLS);
  assert.ok(keys.length && keys.every((k) => k.endsWith(W.mesh.source.original) && W.mesh.source.original === W.mesh.source.derived && W.mesh.source.original === '.hf'), 'every donor key is an hf file (both fit sources map to .hf)');
  for (const d of wearableDonors()) {
    const stem = RIG.files[stemOf(d.id)], p = wornParts([`${d.id}:hand_left`])[0];
    assert.ok(p && donorKey(p).endsWith('.hf'), `${d.id}: its donor file is the hf one`);
    const file = new URL(`../src/assets/wear/${stem}.hf.glb`, import.meta.url), man = JSON.parse(readFileSync(new URL(`../src/assets/wear/${stem}.hf.manifest.json`, import.meta.url), 'utf8'));
    for (const u of HF) assert.ok(regionIds(man).includes(u), `${d.id}: manifest region ${u}`);
    assert.equal(man.caps.some((c) => HF.includes(c.shown_when_cut)), false, `${d.id}: no cap on a hand or foot cut`);
    const meshes = glbJson(file).meshes.map((m) => m.name);
    for (const r of man.regions) assert.ok(meshes.includes(r.mesh), `${d.id}: ${r.mesh} is in the GLB`);
    for (const u of HF) assert.ok(meshes.includes(`piece_${u}`), `${d.id}: piece_${u}`);
  }
});

test('every wearable donor has a GLB: its stem is a data/rig.json file, the URL table has it, the hf file is in src/assets/wear (lazy, never a boss body)', () => {
  for (const d of wearableDonors()) {
    const stem = stemOf(d.id), p = wornParts([`${d.id}:head`])[0];
    assert.ok(RIG.files[stem], `${d.id}: stem ${stem} is a data/rig.json files key`);
    assert.ok(DONOR_URLS[donorKey(p)], `${d.id}: no URL for ${donorKey(p)}`);
    assert.ok(existsSync(new URL(`../src/assets/wear/${RIG.files[stem]}${W.mesh.source[d.source]}.glb`, import.meta.url)), `${d.id}: the hf GLB is in src/assets/wear`);
    assert.ok(existsSync(new URL(`../src/assets/${RIG.files[stem]}.cut.manifest.json`, import.meta.url)), `${d.id}: a cut manifest`);
  }
  assert.equal(stemOf('pitborn'), 'minotaur');
  assert.equal(fitBodyOf('pitborn').stem, 'minotaur');
  assert.deepEqual(Object.keys(DONOR_URLS).sort(), wearableDonors().map((d) => donorKey(wornParts([`${d.id}:head`])[0])).sort(), 'no donor file nobody can wear is shipped through the table');
});

test('data/parts.json wear rows validate; a bad row is named', () => {
  assert.deepEqual(validateWear(W, PARTS.fit, PARTS.slots), []);
  assert.deepEqual(validateFile('parts', RAW), []);
  const bad = (f) => { const w = clone(W); f(w); return validateWear(w, PARTS.fit, PARTS.slots).join('; '); };
  assert.match(bad((w) => { w.flags.force.query = w.flags.off.query; }), /two different query names/);
  assert.match(bad((w) => { w.units.nonsense = { collar: 'neck' }; }), /not a unit of any slot/);
  assert.match(bad((w) => { w.units.head.collar = 'knee'; }), /not a fit.collar.joints id/);
  assert.match(bad((w) => { w.units.head.lift = 'wings'; }), /not fit.lift.unit/);
  assert.match(bad((w) => { delete w.heroHost.neck; }), /heroHost.neck/);
  assert.match(bad((w) => { w.heroCollars = ['elbow']; }), /heroCollars/);
  assert.match(bad((w) => { w.budget.partsMax = 0; }), /partsMax/);
  assert.match(bad((w) => { w.mesh.join = '-'; }), /mesh.join/);
});

// ---- the scene work on a synthetic rig --------------------------------------------------------------------------------------------------------------------------------------------------------------
const TEX = new DataTexture(new Uint8Array([200, 160, 140, 255]), 1, 1); TEX.needsUpdate = true;
const BONES = [['mixamorigHips', null, 0, 1, 0], ['mixamorigSpine', 'mixamorigHips', 0, 0.2, 0], ['mixamorigNeck', 'mixamorigSpine', 0, 0.3, 0], ['mixamorigHead', 'mixamorigNeck', 0, 0.15, 0],
  ['mixamorigLeftArm', 'mixamorigSpine', 0.15, 0.25, 0], ['mixamorigLeftForeArm', 'mixamorigLeftArm', 0.28, 0, 0], ['mixamorigRightArm', 'mixamorigSpine', -0.15, 0.25, 0], ['mixamorigRightForeArm', 'mixamorigRightArm', -0.28, 0, 0],
  ['mixamorigLeftUpLeg', 'mixamorigHips', 0.09, 0, 0], ['mixamorigLeftLeg', 'mixamorigLeftUpLeg', 0, -0.45, 0], ['mixamorigRightUpLeg', 'mixamorigHips', -0.09, 0, 0], ['mixamorigRightLeg', 'mixamorigRightUpLeg', 0, -0.45, 0]];
/** A rig: the 12 bones above under one root, a hf cut body's eleven pieces (a tube round each limb joint, `radius` wide) and its twelve caps, named by the hero's manifest. */
function makeBody(radius = 0.05, name = 'hero') {
  const root = new Group(); root.name = name;
  const bones = new Map();
  for (const [n, parent, x, y, z] of BONES) { const b = new Bone(); b.name = n; b.position.set(x, y, z); (parent ? bones.get(parent) : root).add(b); bones.set(n, b); }
  root.updateMatrixWorld(true);
  const list = [...bones.values()], index = (n) => list.findIndex((b) => b.name === n);
  const tube = (meshName, bone, axis, length = 0.3) => {   // an open tube along `axis` through the bone's joint, skinned to that bone
    const geo = new CylinderGeometry(radius, radius, length, 16, 4, true); if (axis === 'x') geo.rotateZ(Math.PI / 2);
    const b = bones.get(bone), p = b.getWorldPosition(b.position.clone()); geo.translate(p.x, p.y, p.z);
    const n = geo.attributes.position.count; geo.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(n * 4).map((_, i) => (i % 4 === 0 ? index(bone) : 0)), 4)); geo.setAttribute('skinWeight', new BufferAttribute(new Float32Array(n * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
    const mesh = new SkinnedMesh(geo, new MeshBasicMaterial({ map: TEX })); mesh.name = meshName; mesh.bind(new Skeleton(list), mesh.matrixWorld); return mesh;
  };
  const piece = { piece_root: ['mixamorigHips', 'y'], piece_upper_torso: ['mixamorigSpine', 'y'], piece_arm_left: ['mixamorigLeftArm', 'x'], piece_arm_right: ['mixamorigRightArm', 'x'], piece_leg_left: ['mixamorigLeftUpLeg', 'y'], piece_leg_right: ['mixamorigRightUpLeg', 'y'],
    piece_hand_left: ['mixamorigLeftForeArm', 'x'], piece_hand_right: ['mixamorigRightForeArm', 'x'], piece_foot_left: ['mixamorigLeftLeg', 'y'], piece_foot_right: ['mixamorigRightLeg', 'y'] };   // the hf cut: hands and feet are pieces of their own
  for (const [n, [bone, axis]] of Object.entries(piece)) root.add(tube(n, bone, axis));
  const head = new Group(); head.name = 'piece_head'; head.add(tube('piece_head_a', 'mixamorigHead', 'y', 0.2)); head.add(tube('piece_head_b', 'mixamorigHead', 'y', 0.2)); root.add(head);
  for (const c of MANIFEST.caps) { const cap = new Mesh(new CylinderGeometry(0.03, 0.03, 0.01, 6), new MeshBasicMaterial()); cap.name = c.mesh; cap.visible = false; root.add(cap); }
  root.updateMatrixWorld(true);
  return { root, bones, list };
}
const donorBody = (radius, name) => { const d = makeBody(radius, name); d.root.traverse((o) => { if (o.name.startsWith('cap_')) o.visible = true; }); const g = new Group(); g.add(d.root); return d.root; };
function stage(over = {}) {
  const bind = makeBody().root, live = makeBody().root, anchor = new Group(); anchor.add(live);
  const donors = { 'minotaur-106.hf': donorBody(0.09, 'minotaur'), 'arachne-106.hf': donorBody(0.03, 'arachne'), 'castle-guard-106.hf': donorBody(0.06, 'reginald') }, loaded = [], errors = [];
  const wearer = createWearer({ anchor, bind, rows: over.rows, load: async (key) => { loaded.push(key); if (over.fail === key) throw new Error(`no ${key}`); return donors[key]; }, report: (e) => errors.push(String(e.message ?? e)) });
  const vis = (n) => live.getObjectByName(n).visible, worn = () => live.children.filter((c) => c.userData.worn);
  return { bind, live, anchor, donors, loaded, errors, wearer, vis, worn };
}
const HERO_PIECES = MANIFEST.regions.map((r) => r.mesh);

test('wear: a donor arm replaces the hero arm (piece hidden, stump cap shown, donor piece on the HERO bones, a collar on the thinner donor); nothing is fetched until a part is worn', async () => {
  const s = stage();
  assert.equal(s.loaded.length, 0, 'creating the wearer fetches nothing');
  await s.wearer.apply(wornParts(['arachne:arm_left']));
  assert.deepEqual(s.loaded, ['arachne-106.hf']);
  assert.equal(s.vis('piece_arm_left'), false); assert.equal(s.vis('piece_arm_right'), true); assert.equal(s.vis('piece_head'), true);
  assert.equal(s.vis('cap_shoulder_left_torso'), true, 'the hero keeps its own stump cap on the torso side');
  assert.equal(s.vis('cap_shoulder_left_arm'), false, 'the cap of the replaced piece stays hidden');
  const parts = s.worn(), piece = parts.find((m) => m.name.startsWith('wear_')), collar = parts.find((m) => m.name.startsWith('wearcollar_'));
  assert.ok(piece, 'the donor piece is on the hero'); assert.ok(collar, 'a donor ring narrower than the hero hole gets a collar');
  assert.ok(piece.skeleton.bones.every((b) => s.live.getObjectByName(b.name) === b), 'skinned to the LIVE hero bones, never the bind copy or the donor');
  assert.equal(collar.skeleton.bones[0], s.live.getObjectByName('mixamorigLeftArm'));
  assert.equal(parts.some((m) => m.name.startsWith('cap_')), false);
  assert.deepEqual(s.wearer.worn().map((p) => p.id), ['arachne:arm_left']);
  assert.equal(s.wearer.draws().wear, parts.length);
});

test('a donor row tune: collarR / collarH scale the seam collar, thick slims the worn piece around its bone; a donor with no tune row is worn exactly as before', async () => {
  const width = (s, prefix, axis) => { const c = s.worn().find((m) => m.name.startsWith(prefix)); c.geometry.computeBoundingBox(); const b = c.geometry.boundingBox; return b.max[axis] - b.min[axis]; };
  const plain = stage(); await plain.wearer.apply(wornParts(['arachne:arm_left']));
  const rows = clone(FIT_ROWS); fitBodyOf('arachne', rows).tune = { arm_left: { thick: 0.5, collarR: 0.5, collarH: 0.5, uv: [0.25, 0.75] } };
  const tuned = stage({ rows }); await tuned.wearer.apply(wornParts(['arachne:arm_left']));
  const ratio = width(tuned, 'wearcollar_', 'y') / width(plain, 'wearcollar_', 'y');
  assert.ok(Math.abs(ratio - 0.5) < 0.02, `the collar is half as wide (${ratio})`);
  assert.ok(width(tuned, 'wearcollar_', 'x') < width(plain, 'wearcollar_', 'x'), 'and shorter along the arm');
  const uvOf = (s) => { const u = s.worn().find((m) => m.name.startsWith('wearcollar_')).geometry.attributes.uv; return [u.getX(0), u.getY(0)]; };
  assert.deepEqual(uvOf(tuned), [0.25, 0.75], 'the collar is drawn in the texel the row names'); assert.notDeepEqual(uvOf(plain), [0.25, 0.75]);
  const piece = (s) => s.worn().find((m) => m.name === 'wear_arachne:arm_left');
  assert.ok(Math.abs(piece(tuned).skeleton.boneInverses[4].elements[5] / piece(plain).skeleton.boneInverses[4].elements[5] - 0.5) < 1e-9, 'the piece\'s thickness scale is x0.5 on the arm bone');
  const other = stage({ rows }); await other.wearer.apply(wornParts(['castle-guard:leg_left']));
  const base = stage(); await base.wearer.apply(wornParts(['castle-guard:leg_left']));
  assert.deepEqual(other.worn().map((m) => m.name), base.worn().map((m) => m.name), 'a donor the tune row does not name is untouched');
});

test('a donor limb as wide as the hero hole covers it: no collar, no hero stump cap; two head pieces (the Minotaur) are both worn', async () => {
  const s = stage();
  await s.wearer.apply(wornParts(['pitborn:arm_left']));
  assert.equal(s.worn().some((m) => m.name.startsWith('wearcollar_')), false, 'a wide donor ring needs no collar');
  assert.equal(s.vis('cap_shoulder_left_torso'), false, 'the donor covers the hole: no stump cap showing through');
  assert.equal(s.vis('piece_arm_left'), false);
  s.donors['minotaur-106.hf'].add(Object.assign(new Group(), { name: 'piece_head_left' }), Object.assign(new Group(), { name: 'piece_head_right' }));
  for (const side of ['piece_head_left', 'piece_head_right']) { const g = s.donors['minotaur-106.hf'].getObjectByName(side), src = s.donors['minotaur-106.hf'].getObjectByName('piece_arm_left'); g.add(new SkinnedMesh(src.geometry, src.material)); g.children[0].bind(src.skeleton, src.bindMatrix); }
  await s.wearer.apply(wornParts(['pitborn:head']));
  assert.equal(s.worn().filter((m) => m.name === 'wear_pitborn:head').length, 4, 'the donor body has piece_head (two primitives) plus piece_head_left and piece_head_right: every primitive of every piece of the unit is worn');
  assert.equal(s.vis('piece_head'), false);
});

test('unequip restores the hero: every hero piece visible, every cap hidden, no worn mesh left, the donor freed; replacing a slot frees the old donor', async () => {
  const s = stage(), freed = [];
  for (const [key, d] of Object.entries(s.donors)) d.traverse((o) => o.geometry?.addEventListener('dispose', () => freed.push(key)));
  await s.wearer.apply(wornParts(['arachne:arm_left', 'pitborn:head', 'castle-guard:leg_right']));
  assert.equal(s.wearer.worn().length, 3);
  for (const n of ['piece_arm_left', 'piece_head', 'piece_leg_right']) assert.equal(s.vis(n), false, `${n} hidden while worn`);
  const before = s.wearer.draws().hero;
  await s.wearer.apply(wornParts(['pitborn:head', 'castle-guard:leg_right']));
  assert.ok(freed.includes('arachne-106.hf'), 'the arachne donor was freed with its last part');
  assert.equal(s.vis('piece_arm_left'), true); assert.equal(s.vis('cap_shoulder_left_torso'), false);
  assert.ok(s.wearer.draws().hero < before);
  await s.wearer.apply([]);
  for (const n of HERO_PIECES) assert.equal(s.vis(n), true, `${n} visible again`);
  for (const c of MANIFEST.caps) assert.equal(s.vis(c.mesh), false, `${c.mesh} hidden again`);
  assert.equal(s.worn().length, 0); assert.deepEqual(s.wearer.worn(), []);
  assert.ok(freed.includes('minotaur-106.hf') && freed.includes('castle-guard-106.hf'), 'every donor freed once nothing wears it');
  // replace in the same slot: the old donor goes, the new one comes
  const s2 = stage(), freed2 = [];
  s2.donors['arachne-106.hf'].traverse((o) => o.geometry?.addEventListener('dispose', () => freed2.push('arachne')));
  await s2.wearer.apply(wornParts(['arachne:arm_left']));
  await s2.wearer.apply(wornParts(['pitborn:arm_left']));
  assert.ok(freed2.length > 0, 'the replaced donor was freed'); assert.deepEqual(s2.wearer.worn().map((p) => p.id), ['pitborn:arm_left']);
  assert.equal(s2.worn().filter((m) => m.name.includes('arachne')).length, 0);
});

test('the torso: the donor piece_upper_torso (the unit torso_waist is the region upper_torso) replaces the hero torso, the hero waist stump shows, no collar; off again restores', async () => {
  const s = stage();
  await s.wearer.apply(wornParts(['arachne:torso']));
  assert.equal(s.vis('piece_upper_torso'), false); assert.equal(s.vis('piece_root'), true);
  assert.equal(s.vis('cap_waist_root'), true, 'the hero root keeps its own waist stump cap'); assert.equal(s.vis('cap_waist_torso'), false);
  assert.deepEqual(s.worn().map((m) => m.name), ['wear_arachne:torso'], 'one draw, no collar');
  await s.wearer.apply([]);
  assert.equal(s.vis('piece_upper_torso'), true); assert.equal(s.vis('cap_waist_root'), false);
});

test('calls queue and the last loadout wins; the same loadout twice changes nothing; a donor that fails to load is reported and the hero is left whole', async () => {
  const s = stage();
  const a = s.wearer.apply(wornParts(['arachne:arm_left'])), b = s.wearer.apply(wornParts(['pitborn:arm_left'])), c = s.wearer.apply(wornParts(['pitborn:arm_left']));
  await Promise.all([a, b, c]);
  assert.deepEqual(s.wearer.worn().map((p) => p.id), ['pitborn:arm_left']);
  assert.equal(s.loaded.filter((k) => k === 'minotaur-106.hf').length, 1, 'the second identical call fetched nothing');
  const f = stage({ fail: 'arachne-106.hf' });
  await f.wearer.apply(wornParts(['arachne:arm_left', 'pitborn:head']));
  assert.equal(f.errors.length, 1); assert.match(f.errors[0], /no arachne-106\.hf/);
  assert.equal(f.vis('piece_arm_left'), true, 'a failed part leaves the hero piece in place');
  assert.deepEqual(f.wearer.worn().map((p) => p.id), ['pitborn:head'], 'the other part still goes on');
  s.wearer.dispose(); assert.deepEqual(s.wearer.worn(), []); for (const n of HERO_PIECES) assert.equal(s.vis(n), true);
});

test('leg parts carry the lift row: a leg the fit clamps lifts the hero root, and taking it off puts the root back; legs inside the clamps lift nothing', async () => {
  const s = stage(), y0 = s.live.position.y;
  await s.wearer.apply(wornParts(['pitborn:leg_left']));
  assert.equal(s.live.position.y, y0, 'the Minotaur leg is inside the clamps: no lift');
  const tall = clone(FIT_ROWS), t = fitBodyOf('pitborn', tall).measure; t.thigh_len = 3; t.shin_len = 3;   // a leg 7x the hero's: the clamp bites
  const hero = FIT_ROWS.bodies.find((b) => b.id === FIT_ROWS.hero).measure, want = liftRow('legs', t, hero);
  assert.ok(want.lift_y > 1, `a clamp-bound leg lifts the root (${want.lift_y})`);
  const s2 = stage({ rows: tall });
  await s2.wearer.apply(wornParts(['pitborn:leg_left']));
  assert.ok(Math.abs(s2.live.position.y - (y0 + want.lift_y)) < 1e-9, 'the root is raised by the row');
  await s2.wearer.apply(wornParts(['pitborn:head']));
  assert.equal(s2.live.position.y, y0, 'taking the leg off puts the root back');
  const arm = stage({ rows: tall });
  await arm.wearer.apply(wornParts(['pitborn:arm_left']));
  assert.equal(arm.live.position.y, y0, 'an arm never lifts');
});

test('hands and feet: a donor hand or foot replaces only the hero hand or foot (no stump cap, no lift); a donor arm or leg leaves the hero hand and foot in place; all five loadout parts come off clean', async () => {
  const s = stage();
  await s.wearer.apply(wornParts(['arachne:arm_left']));
  assert.equal(s.vis('piece_arm_left'), false); assert.equal(s.vis('piece_hand_left'), true, 'a worn arm carries no hand (hf): the hero hand stays');
  await s.wearer.apply(wornParts(['arachne:arm_left', 'pitborn:hand_left']));
  assert.equal(s.vis('piece_hand_left'), false); assert.equal(s.vis('piece_hand_right'), true); assert.equal(s.vis('piece_arm_left'), false);
  assert.ok(s.worn().some((m) => m.name === 'wear_pitborn:hand_left') && !s.worn().some((m) => m.name.startsWith('cap_')), 'the donor hand is on the hero bones, no cap');
  const y0 = s.live.position.y;
  await s.wearer.apply(wornParts(['castle-guard:foot_left', 'castle-guard:leg_right', 'pitborn:head', 'arachne:arm_left', 'pitborn:hand_left']));
  assert.equal(s.vis('piece_foot_left'), false); assert.equal(s.vis('piece_foot_right'), true, 'a worn leg carries no foot: the hero foot stays'); assert.equal(s.vis('piece_leg_right'), false);
  assert.ok(Math.abs(s.live.position.y - y0) < 1e-9, 'inside the clamps nothing lifts (and a foot has no lift row of its own)');
  assert.equal(s.wearer.worn().length, 5, 'head, arm, hand, leg, foot');
  const bones = s.worn().find((m) => m.name === 'wear_castle-guard:foot_left').skeleton.bones;
  assert.ok(bones.every((b) => s.live.getObjectByName(b.name) === b), 'the donor foot is skinned to the LIVE hero bones');
  await s.wearer.apply([]);
  for (const n of HERO_PIECES) assert.equal(s.vis(n), true, `${n} visible again`);
  assert.equal(s.worn().length, 0);
});

test('the flag is registered where flags are parsed: data/parts.json wear.flags names the two queries, and the page reads them through wearFlags', () => {
  const main = readFileSync(new URL('../src/client/main.ts', import.meta.url), 'utf8');
  assert.match(main, /wearFlags\(search\)/); assert.match(main, /view\.wear\(/);
  assert.deepEqual(Object.keys(W.flags).sort(), ['force', 'off']);
});
