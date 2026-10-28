// Boss weapons (Dom + Strategy 2026-10-28; data/boss-weapons.json, src/fight/boss-weapon.ts, boss-hand.ts): Gargantua (V1 archetype executioner) wields a MAUL, Arachne (shieldmaiden) an AXE and a SHIELD.
// Pinned: the rows validate and a bad one is refused; a spawn kind of each archetype fights with the row's weapon (V1's row otherwise, byte for byte); ?bossweapon=v1 and ?pitborn=v1 put V1 back; the blade
// sweeps the sim reads for the weapon are bundled (data/fight.json bladeTables) and exist; the body to row lookup; and the drawn dressing (the part scaled, the shield board in metres on the hand) on the
// real 106 Minotaur body, the body the stills use until the new bodies land. The placeholders are data, and the tests say they are not empty.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { validateFile } from '../src/sim/validate.js';
import { BOSS_WEAPONS, bossOpponent, bossPreview, bossRowOfBody, bossWeaponFor, bossWeaponsOn, validateBossWeapons } from '../src/fight/boss-weapon.ts';
import { dressBossHand, graftOf, SHIELD_NAME } from '../src/fight/boss-hand.ts';
import { OPPONENTS, opponentAt, weaponOf } from '../src/fight/moves.ts';
import { bladePathsByRig } from '../src/fight/blade-paths.ts';
import { kindFightFor, kindPractice } from '../src/fight/spawn-kind.ts';
import { equipWeapon } from '../src/fight/characters.ts';
import { bone as boneOf, HELD } from '../src/fight/rig-bones.ts';

const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const FIGHT = read('fight'), PROFILES = read('profiles'), DIFFICULTY = read('difficulty'), BRAINS = read('brains'), RAW = read('boss-weapons');
const clone = (x) => structuredClone(x);
const row = (opponent) => BOSS_WEAPONS.rows.find((r) => r.opponent === opponent);

test('the rows validate; a bad row is refused with the rule it broke', () => {
  assert.deepEqual(validateFile('boss-weapons', RAW), []);
  assert.deepEqual(validateBossWeapons(RAW), []);
  const bad = (f) => { const r = clone(RAW); f(r); return validateBossWeapons(r).join('\n'); };
  assert.match(bad((r) => { r.rows[0].weapon = 'no-such-weapon'; }), /rows\[0\].*weapon: "no-such-weapon" is no src\/fight\/weapon-defs.json row/);
  assert.match(bad((r) => { r.rows[0].opponent = 'no-such-boss'; }), /opponent: "no-such-boss" is no archetype/);
  assert.match(bad((r) => { r.rows[1].opponent = r.rows[0].opponent; }), /has two rows/);
  assert.match(bad((r) => { r.rows[0].equip = 'no-such-file'; }), /equip: "no-such-file"/);
  assert.match(bad((r) => { r.rows[0].scale = 0; }), /scale: a number in 0.5..4/);
  assert.match(bad((r) => { r.rows[0].scale = NaN; }), /scale/);
  assert.match(bad((r) => { r.rows[0].placeholder = []; }), /placeholder: say exactly what is a stand-in/);
  const disc = { kind: 'disc', hand: 'lowerarm_l', radius: 0.25, thickness: 0.04, colour: '#6a5236', rim: '#2b2b2b', offset: [0, 0.14, -0.07], rotationDeg: [-90, 0, 0] };
  const withDisc = (f) => bad((r) => { r.rows[1].offhand = clone(disc); f(r.rows[1].offhand); });
  assert.equal(withDisc(() => {}), '', 'the old disc kind still validates');
  assert.match(withDisc((o) => { o.radius = 5; }), /offhand.radius/);
  assert.match(withDisc((o) => { o.colour = 'brown'; }), /offhand.colour/);
  assert.match(bad((r) => { r.rows[1].offhand.offset = [0, 0]; }), /offhand.offset/);
  assert.match(bad((r) => { r.rows[1].offhand.kind = 'tower'; }), /offhand.kind/);
  assert.match(bad((r) => { r.rows[1].offhand.file = 'no-such-shield'; }), /offhand.file: "no-such-shield" is no file/);
  assert.match(bad((r) => { r.rows[1].offhand.scale = 9; }), /offhand.scale/);
  assert.match(bad((r) => { r.rows[1].offhand.hand = ''; }), /offhand.hand/);
  assert.match(bad((r) => { r.rows[1].offhand.rotationDeg = [0, 0, Infinity]; }), /offhand.rotationDeg/);
  assert.match(bad((r) => { r.rows[1].grip.offset = [0, 0]; }), /grip.offset/);
  assert.match(bad((r) => { delete r.rows[1].grip; }), /grip.rotationDeg/);
  assert.match(bad((r) => { r.rows[1].material = { colour: 'iron', metalness: 0.4, roughness: 0.5 }; }), /material.colour/);
  assert.match(bad((r) => { r.rows[1].material = { colour: '#808080', metalness: 0.4, roughness: 3 }; }), /material.roughness/);
  assert.match(bad((r) => { r.rows[1].id = r.rows[0].id; }), /id: duplicate/);
  assert.deepEqual(validateFile('boss-weapons', { ...RAW, extra: 1 }), ['boss-weapons.extra: unknown key']);
  const unknownKey = clone(RAW); unknownKey.rows[0].handedness = 'two-hand';
  assert.deepEqual(validateFile('boss-weapons', unknownKey), ['boss-weapons.rows[0] (gargantua-maul).handedness: unknown key']);
});

test('boss 2 Gargantua (executioner) wields a maul; boss 3 Arachne (shieldmaiden) an axe in one hand and a shield in the other', () => {
  const g = row('executioner'), a = row('shieldmaiden');
  assert.equal(g.weapon, 'maul'); assert.equal(weaponOf('maul').grip, 'two-hand'); assert.equal(g.offhand, null);
  assert.equal(a.weapon, 'cleaver'); assert.equal(weaponOf('cleaver').grip, 'one-hand');   // V1's axe-skill one-hander
  assert.equal(a.offhand.kind, 'file'); assert.equal(a.offhand.file, 'shield'); assert.equal(a.offhand.hand, 'lowerarm_l');   // the left forearm, not the hand: a board on the hand sat in front of her face (Dom review 2026-10-28)
  assert.deepEqual([g.equip, a.equip], ['maul', 'axe'], 'Dom picked these three library props (2026-10-28): hammer-01, axe1h-208, shield-213');
  assert.deepEqual(BOSS_WEAPONS.rows.map((r) => r.opponent).sort(), ['executioner', 'shieldmaiden']);
  assert.equal(OPPONENTS.executioner.weapon, 'scythe', "V1's row for the executioner is untouched");
  assert.equal(OPPONENTS.shieldmaiden.weapon, 'gladius', "V1's row for the shieldmaiden is untouched");
  for (const r of BOSS_WEAPONS.rows) {
    assert.ok(r.placeholder.length >= 2 && r.placeholder.every((s) => s.length > 20), `${r.id}: the stand-ins are named`);
    assert.match(r.placeholder.join(' '), /sweeps: .*not re-baked/, `${r.id}: the sweeps are said to be V1's`);
  }
  assert.match(a.placeholder.join(' '), /shield: a library prop, shield-213/);
  assert.match(a.placeholder.join(' '), /axe: a library prop, .*axe1h-208/);
  assert.match(g.placeholder.join(' '), /mesh: a library prop, .*hammer-01/);
  assert.match(g.placeholder.join(' '), /not a maul drawn for Gargantua/);
});

test('bossOpponent lays the weapon over V1\'s row for the archetype and nothing else; ?bossweapon=v1 puts V1 back; other archetypes are the same object', () => {
  const g = bossOpponent(OPPONENTS.executioner, ''), a = bossOpponent(OPPONENTS.shieldmaiden, '');
  assert.equal(g.weapon, 'maul'); assert.equal(a.weapon, 'cleaver');
  assert.deepEqual({ ...g, weapon: 'scythe' }, OPPONENTS.executioner, 'only the weapon moved (stats, guard, rig, profiles)');
  assert.deepEqual({ ...a, weapon: 'gladius' }, OPPONENTS.shieldmaiden);
  assert.equal(a.guard, OPPONENTS.shieldmaiden.guard, 'her shield guard stays: the shield is the drawing of it');
  for (const q of ['?bossweapon=v1', '?x=1&bossweapon=v1']) { assert.equal(bossOpponent(OPPONENTS.executioner, q), OPPONENTS.executioner, q); assert.equal(bossOpponent(OPPONENTS.shieldmaiden, q), OPPONENTS.shieldmaiden, q); assert.equal(bossWeaponsOn(q), false); }
  for (const id of Object.keys(OPPONENTS).filter((k) => !['executioner', 'shieldmaiden'].includes(k))) assert.equal(bossOpponent(OPPONENTS[id], ''), OPPONENTS[id], `${id}: no row, the very same object`);
  assert.equal(bossWeaponFor('executioner', '?bossweapon=executioner')?.weapon, 'maul', 'the stills flag leaves the row on');
  assert.equal(bossPreview('?bossweapon=executioner')?.id, 'gargantua-maul'); assert.equal(bossPreview('?bossweapon=shieldmaiden')?.id, 'arachne-axe-shield');
  assert.equal(bossPreview(''), undefined); assert.equal(bossPreview('?bossweapon=v1'), undefined); assert.equal(bossPreview('?bossweapon=nobody'), undefined);
});

// A spawn kind is a profile row whose opponent is an archetype; the two new bosses get theirs from the Profiles lane, so the test builds synthetic ones on the Pitborn's row.
const ctx = (over = {}) => ({ profiles: [...PROFILES.profiles, { ...PROFILES.profiles[0], id: 'gargantua', opponent: 'executioner' }, { ...PROFILES.profiles[0], id: 'arachne', opponent: 'shieldmaiden' }], difficulty: DIFFICULTY, brains: BRAINS.brains, pick: DIFFICULTY.default, search: '', level: FIGHT.level, ai: FIGHT.ai, override: null, weapon: FIGHT.weapon, skill: FIGHT.skill, skill2: FIGHT.skill2, stance: FIGHT.stance, specials: false, ...over });

test('a zone spawn of each kind fights with the row\'s weapon, and the duel holds it', () => {
  for (const [kind, id, weapon] of [['gargantua', 'executioner', 'maul'], ['arachne', 'shieldmaiden', 'cleaver']]) {
    const k = kindFightFor(kind, ctx());
    assert.equal(k.opponentId, id); assert.equal(k.opponent.weapon, weapon, `${kind} fights with the ${weapon}`);
    const p = kindPractice(k, ctx(), 1);
    assert.equal(p.duel.fighters[1].weapon, weapon, `${kind}: the sim's foe holds the ${weapon}`);
  }
  assert.equal(kindFightFor('pitborn', ctx()).opponent, OPPONENTS.pitborn, 'the default kind is the very same object as before');
});

test('?bossweapon=v1 and ?pitborn=v1 give V1\'s weapon back', () => {
  assert.equal(kindFightFor('gargantua', ctx({ search: '?bossweapon=v1' })).opponent.weapon, 'scythe');
  assert.equal(kindFightFor('arachne', ctx({ search: '?bossweapon=v1' })).opponent.weapon, 'gladius');
  assert.equal(kindFightFor('gargantua', ctx({ override: 'veteran', search: '?pitborn=v1' })).opponent.weapon, OPPONENTS.veteran.weapon, 'the Centurion fight is the Centurion, V1\'s row');
});

test('the sweeps exist and are bundled: every weapon a row names has its hero-rig blade table in data/fight.json bladeTables, for every path it can swing', () => {
  for (const r of BOSS_WEAPONS.rows) {
    const body = opponentAt(bossOpponent(OPPONENTS[r.opponent], ''), 1), later = opponentAt(bossOpponent(OPPONENTS[r.opponent], ''), 100);
    for (const o of [body, later]) {
      assert.equal(o.rig, 'hero', `${r.opponent} swings the hero rig's table`);
      assert.ok(FIGHT.bladeTables[o.rig].includes(o.weapon), `${r.id}: ${o.rig}/${o.weapon} is in bladeTables`);
      assert.ok(bladePathsByRig[o.rig][o.weapon], `${r.id}: V1 bakes ${o.rig}/${o.weapon}`);
    }
  }
});

test('the body to row lookup: only an archetype with a profile body, and not under ?bossweapon=v1', () => {
  const bodyOf = (o) => ({ executioner: 'gargantua-106', shieldmaiden: 'arachne-106', pitborn: 'minotaur-106' })[o];
  assert.equal(bossRowOfBody('gargantua-106', bodyOf, '').id, 'gargantua-maul');
  assert.equal(bossRowOfBody('arachne-106', bodyOf, '').id, 'arachne-axe-shield');
  assert.equal(bossRowOfBody('minotaur-106', bodyOf, ''), undefined, 'the Pitborn keeps his cleaver');
  assert.equal(bossRowOfBody('gargantua-106', bodyOf, '?bossweapon=v1'), undefined);
  assert.equal(bossRowOfBody('gargantua-106', () => undefined, ''), undefined, 'no profile body yet: nothing to match');
});

// ---- the drawn dressing, on the real 106 Minotaur body ----
globalThis.ProgressEvent = class { constructor(_, f) { Object.assign(this, f); } };
const loadGlb = async (path) => {   // as scripts/foe-body/bake-blades.mjs: nodes, transforms and clips are all this needs (no images)
  const bytes = readFileSync(new URL(path, import.meta.url)), size = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + size));
  json.images = []; json.textures = []; json.materials = (json.materials || []).map((m) => ({ name: m.name }));
  json.buffers[0].uri = 'data:application/octet-stream;base64,' + bytes.subarray(28 + size).toString('base64');
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(JSON.stringify(json), '');
};
const FOE = (stem) => `../src/assets/weapons/foe/${stem}.glb`;
const armed = async (r = row('executioner')) => equipWeapon(await loadGlb('../src/assets/minotaur-106.glb'), await loadGlb(FOE(r.equip)));   // the body armed with the row's own file
const shieldScene = async () => (await loadGlb(FOE('shield'))).scene;
const dressed = async (r) => dressBossHand(await armed(r), r, r.offhand?.kind === 'file' ? await shieldScene() : undefined);
const sizeOf = (o) => { o.updateWorldMatrix(true, true); return new Box3().setFromObject(o).getSize(new Vector3()); };

test('the three library files hold the nodes the rows need: WeaponDrawn with a contact in maul and axe, BossShield in the shield', async () => {
  for (const stem of ['maul', 'axe']) {
    const w = (await loadGlb(FOE(stem))).scene.getObjectByName(HELD.weapon);
    assert.ok(w, `${stem}.glb has a ${HELD.weapon} root`);
    assert.ok(w.userData.contact && w.userData.contact.from < w.userData.contact.to, `${stem}.glb carries extras.contact`);
    assert.ok(sizeOf(w).length() > 0.3, `${stem}.glb has mesh under the grip`);
  }
  const s = (await shieldScene()).getObjectByName(SHIELD_NAME);
  assert.ok(s, 'shield.glb has a BossShield root');
  const box = sizeOf(s), dims = [box.x, box.y, box.z].sort((p, q) => p - q);
  assert.ok(dims[2] > 0.6 && dims[2] < 0.9, `shield about 0.75 m across: ${dims}`);
  assert.ok(dims[0] < 0.4 && box.z === dims[0], `shield is a dished board, shallow along its +Z face normal: ${dims}`);
});

test('the maul and axe are the picked files, scaled about the grip by the row (the drawn part, not the seat)', async () => {
  const gr = row('executioner'), ar = row('shieldmaiden');
  const plain = dressBossHand(await armed(gr), { ...gr, scale: 1 }), maul = await dressed(gr), axe = await dressed(ar);
  const len = (a) => { const w = graftOf(a.scene); return w ? sizeOf(w).length() : 0; };   // the DRAWN part (Grip106's WeaponDrawn), not the socket bone: scaling the socket left the blade as it was
  assert.ok(len(plain) > 0, 'the maul is in his hand');
  assert.ok(Math.abs(len(maul) / len(plain) - gr.scale) < 0.02, `maul ${len(maul)} vs unscaled ${len(plain)}`);
  assert.equal(len(axe) > 0, true, 'the axe is in her hand');
  // The sim's reach and sweeps are V1's tables (data/fight.json bladeTables, pinned above) and no mesh feeds them: scaling the drawing cannot move them. What stays put is the seat the part hangs from.
  const seat = (a) => a.scene.getObjectByName('Grip106');
  assert.ok(Math.abs(seat(maul).scale.x - seat(plain).scale.x) < 1e-9 && seat(maul).position.distanceTo(seat(plain).position) < 1e-9, 'the Grip106 seat is not scaled or moved; only the drawn part under it is');
  assert.equal(boneOf(maul.scene, 'hand_l').getObjectByName(SHIELD_NAME), undefined, 'the maul has no shield');
});

test('the shield file is found on the Minotaur 106 body: on lowerarm_l, in metres whatever the bone\'s own scale, and a missing node is refused', async () => {
  const r = row('shieldmaiden'), a = await dressed(r), board = boneOf(a.scene, 'lowerarm_l').getObjectByName(SHIELD_NAME);
  assert.ok(board, 'BossShield hangs from lowerarm_l');
  a.scene.updateMatrixWorld(true);
  assert.ok(Math.abs(board.getWorldScale(new Vector3()).x - r.offhand.scale) < 1e-6, `the file's metres are kept: world scale ${board.getWorldScale(new Vector3()).x}`);   // the forearm's own scale (centimetres on a Mixamo rig) is undone
  assert.ok(boneOf(a.scene, HELD.weapon), 'the axe is still in the right hand');
  assert.throws(() => dressBossHand({ scene: a.scene }, r, undefined), /has no BossShield node/);
  assert.throws(() => dressBossHand({ scene: a.scene }, { ...r, offhand: { ...r.offhand, hand: 'no_such_bone' } }, undefined), /no no_such_bone/);
});

test('the shield face points away from the palm, with a gap; the old disc kind still seats a board', async () => {
  const r = row('shieldmaiden'), a = await dressed(r), board = boneOf(a.scene, 'lowerarm_l').getObjectByName(SHIELD_NAME);
  const normal = new Vector3(0, 0, 1).applyQuaternion(board.quaternion);   // the file's face normal (+Z) in the forearm's frame
  assert.ok(normal.z < -0.99, `face normal ${normal.toArray()} must be the forearm's -Z (the back of the forearm in Mixamo's T-pose bind)`);
  assert.ok(board.position.z < 0 && board.position.z > -0.2, `the board stands ${board.position.z} m off the forearm axis`);
  assert.ok(board.position.y > 0 && board.position.y < 0.3, 'centred on the forearm, between elbow and wrist');
  const disc = { kind: 'disc', hand: 'lowerarm_l', radius: 0.25, thickness: 0.04, colour: '#6a5236', rim: '#2b2b2b', offset: [0, 0.14, -0.07], rotationDeg: [-90, 0, 0] };
  assert.ok(dressBossHand(await armed(r), { ...r, offhand: disc }).scene.getObjectByName(SHIELD_NAME).getObjectByName('BossShield.face'), 'the disc board is code-built, no file');
});

test('LEGACY disc: the shield board is on the left hand, in metres: the row\'s radius and thickness, whatever the bone\'s own scale', async () => {
  const disc = { kind: 'disc', hand: 'lowerarm_l', radius: 0.25, thickness: 0.04, colour: '#6a5236', rim: '#2b2b2b', offset: [0, 0.14, -0.07], rotationDeg: [-90, 0, 0] };
  const a = dressBossHand(await armed(), { ...row('shieldmaiden'), offhand: disc }), hand = boneOf(a.scene, 'lowerarm_l'), board = hand.getObjectByName(SHIELD_NAME);
  assert.ok(board, 'the board hangs from lowerarm_l');
  const o = disc, face = board.getObjectByName('BossShield.face'), box = new Box3().setFromObject(face).getSize(new Vector3());
  const dims = [box.x, box.y, box.z].sort((p, q) => p - q);
  assert.ok(Math.abs(dims[0] - o.thickness) < 0.005, `thickness ${dims[0]}`);
  assert.ok(Math.abs(dims[1] - 2 * o.radius) < 0.01 && Math.abs(dims[2] - 2 * o.radius) < 0.01, `diameter ${dims[1]} x ${dims[2]}`);
  assert.ok(boneOf(a.scene, HELD.weapon), 'the axe is still in the right hand');
  assert.throws(() => dressBossHand({ scene: a.scene }, { ...row('shieldmaiden'), offhand: { ...o, hand: 'no_such_bone' } }), /no no_such_bone/);
});

test('the grip row moves the DRAWN part only; a material row restyles it; the seat stays put', async () => {
  const r = { ...row('shieldmaiden'), offhand: null, grip: { offset: [0.02, 0.03, 0], rotationDeg: [0, 0, 90] }, material: { colour: '#808080', metalness: 0.5, roughness: 0.5 } };
  const plain = dressBossHand(await armed(), { ...r, grip: { offset: [0, 0, 0], rotationDeg: [0, 0, 0] }, material: null }), moved = dressBossHand(await armed(), r);
  const p = graftOf(plain.scene), m = graftOf(moved.scene);
  assert.ok(Math.abs(m.position.x - p.position.x - 0.02) < 1e-9 && Math.abs(m.position.y - p.position.y - 0.03) < 1e-9, 'offset added in the seat frame');
  assert.ok(m.quaternion.angleTo(p.quaternion) > 1.5, 'rotated about 90 degrees');
  const mat = [], keep = [];
  m.traverse((o) => { if (o.isMesh && o.name !== 'WeaponShape') mat.push(o.material.color.getHexString()); });
  assert.ok(mat.length && mat.every((c) => c === '808080'), `the drawn meshes wear the row's colour: ${mat}`);
  const s = moved.scene.getObjectByName('Grip106'), s0 = plain.scene.getObjectByName('Grip106');
  assert.ok(s.position.distanceTo(s0.position) < 1e-9 && s.quaternion.angleTo(s0.quaternion) < 1e-9, 'the seat the part hangs from is where it was: only the drawn part moved');
  void keep;
});
