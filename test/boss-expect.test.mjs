// CI hardening (2026-10-28): ONE data-layer test over EVERY boss. Three live breaks (the Gargantua freeze, the hero sword missing from the hashed asset names, boss weapons and Arachne's axe and shield
// gone after the rings merge) passed CI because no test asserted the resolved weapon per boss. Expected values are a data file (test/fixtures/boss-expect.json), changed deliberately; a silent change fails.
// For each boss profile: (a) the weapon row resolves through the SAME functions the scene calls (src/fight/boss-resolve.ts: bossOfBody / weaponOfBody; foe-body.ts spawnBodyFile) to the expected row, weapon,
// equip stem and off-hand; (b) the equip and off-hand stems are in FOE_EQUIP_URLS / FOE_OFFHAND_URLS (src/fight/scene.ts), the source files exist and the build ships them; (c) the body's cut GLB and manifest
// exist, are wired, and the GLB's sha256 equals the pinned physics package's data/cut-bodies.json row (expect_sha256) with a data/physics.json row; (d) the hero fights with the longsword family.
// (e) When BOSS_EXPECT_DIST=1 (the built-game boot job, after `npm run build`) the same rows are checked against the PRODUCTION build: every URL is in the content-hashed art manifest of dist's main.js and the hashed file exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bossOfBody, ownerOfBody, weaponOfBody } from '../src/fight/boss-resolve.ts';
import { spawnBodyFile } from '../src/fight/foe-body.ts';
import { foeRigFile } from '../src/fight/rig-bones.ts';
import { foeDrawnWeapon } from '../src/fight/foe-weapon.ts';
import { FOE_EQUIP_URLS, FOE_OFFHAND_URLS } from '../src/fight/scene.ts';
import { DEFAULT_WEAPON, PLAYER_WEAPONS, weaponOf } from '../src/fight/moves.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(readFileSync(path.join(root, f), 'utf8'));
const EXPECT = read('test/fixtures/boss-expect.json'), PROFILES = read('data/profiles.json'), RINGS = read('data/rings.json'), ZONE1 = read('data/zones/zone1.row.json'), RIG = read('data/rig.json'), PHYSICS = read('data/physics.json');
const CUT = read('node_modules/@frankendom/physics/data/cut-bodies.json').bodies;
const live = foeRigFile(EXPECT.liveBody);
const stem = (url) => url.match(/\/([a-z0-9-]+)\.glb$/)[1];
/** The 106 file the zone spawn of `kind` draws: the ring boss's own body, else the zone row's spawn body, else the profile's (exactly the scene's bodyOfSpawn). */
const bodyOf = (kind) => spawnBodyFile(kind, PROFILES.defaultBody, RINGS.bosses.find((b) => b.kind === kind)?.body ?? ZONE1.spawns.find((s) => s.kind === kind)?.body);
/** What the page does with body `file`, minus the closures: the row, the sim weapon, the grafted part's stem and the off-hand mesh stem. */
function resolve(file) {
  const row = bossOfBody(file, live, ''), weapon = weaponOfBody(file, live, EXPECT.bosses.gargantua.weapon, '');
  const equipKey = row ? `../assets/weapons/foe/${row.equip}.glb` : `../assets/weapons/foe/${foeDrawnWeapon(ownerOfBody(file, live) ?? 'pitborn', weapon)}.glb`;
  return { row, weapon, equipKey, equip: FOE_EQUIP_URLS[equipKey] ? stem(FOE_EQUIP_URLS[equipKey]) : null, offhand: row?.offhand?.kind === 'file' ? row.offhand.file : null };
}

test('every boss profile has an expectation row, and nothing is expected that does not exist', () => {
  const ids = PROFILES.profiles.map((p) => p.id);
  assert.deepEqual(ids.filter((i) => !(i in EXPECT.bosses)).sort(), [], 'a profile with no row in test/fixtures/boss-expect.json: add its expected weapon deliberately');
  assert.deepEqual(Object.keys(EXPECT.bosses).filter((i) => !ids.includes(i)).sort(), [], 'an expectation row for a profile that is gone');
  assert.deepEqual(EXPECT.pending.filter((i) => ids.includes(i)), [], 'a pending profile has landed: give it a row in `bosses` and take it off `pending`');
  for (const b of RINGS.bosses) assert.ok(b.kind in EXPECT.bosses, `ring boss ${b.kind} has an expectation`);
  for (const s of ZONE1.spawns) assert.ok(s.kind in EXPECT.bosses, `zone spawn ${s.id} (${s.kind}) has an expectation`);
});

for (const [kind, want] of Object.entries(EXPECT.bosses)) {
  test(`${kind}: resolves to ${want.row ?? 'no row'} / weapon ${want.weapon} / equip ${want.equip} / off-hand ${want.offhand}`, () => {
    const file = bodyOf(kind);
    assert.equal(file, foeRigFile(want.body), `${kind}: the spawn draws body ${want.body}`);
    const got = resolve(file);
    assert.equal(got.row?.id ?? null, want.row, `${kind}: the boss weapon row`);
    assert.equal(got.weapon, want.weapon, `${kind}: the sim weapon (weaponOfBody)`);
    assert.equal(got.equip, want.equip, `${kind}: the equip stem the scene fetches`);
    assert.equal(got.offhand, want.offhand, `${kind}: the off-hand mesh`);
    if (got.row) assert.equal(got.row.profile == null, want.fallback, `${kind}: fallback means the archetype's row, not the profile's own`);
    // (b) the part is real: its URL is in the scene's tables, the source file exists, the build packs/ships it by name
    assert.ok(got.equip, `${kind}: ${got.equipKey} is in FOE_EQUIP_URLS (scene.ts)`);
    assert.ok(existsSync(path.join(root, `src/assets/weapons/foe/${want.equip}.glb`)), `${kind}: src/assets/weapons/foe/${want.equip}.glb exists`);
    if (want.offhand) {
      assert.ok(FOE_OFFHAND_URLS[`../assets/weapons/foe/${want.offhand}.glb`], `${kind}: the off-hand ${want.offhand} is in FOE_OFFHAND_URLS`);
      assert.ok(existsSync(path.join(root, `src/assets/weapons/foe/${want.offhand}.glb`)), `${kind}: the off-hand file exists`);
    }
    // (c) the body is cuttable: the cut GLB is the physics package's (sha256), its manifest ships and is wired, a physics row fits
    const bodyStem = file, cutRow = CUT.find((r) => r.name === bodyStem);
    assert.ok(cutRow, `${kind}: ${bodyStem} has a row in the pinned physics data/cut-bodies.json`);
    assert.equal(createHash('sha256').update(readFileSync(path.join(root, `src/assets/${bodyStem}.glb`))).digest('hex'), cutRow.expect_sha256, `${bodyStem}.glb is the cut GLB the physics row pins`);
    const manifest = read(`src/assets/${bodyStem}.cut.manifest.json`);
    assert.equal(manifest.schema, 'cut-pieces/1'); assert.equal(manifest.body, bodyStem);
    const bodyKey = bodyStem.replace(/-106$/, '');
    assert.match(readFileSync(path.join(root, 'src/fight/physics-chunk.ts'), 'utf8'), new RegExp(`'?${bodyKey}'?: \\w+Manifest`), `${bodyKey}: wired in physics-chunk.ts cutManifests`);
    assert.ok(PHYSICS.opponents.some((o) => o.body === bodyKey), `${bodyKey}: a data/physics.json opponents row`);
    assert.ok(RIG.files[bodyKey], `${bodyKey}: a data/rig.json files row`);
  });
}

test('every part a boss row names is packed in the build (the PACKED / hashed art list)', () => {
  const build = readFileSync(path.join(root, 'scripts/build.mjs'), 'utf8');
  for (const f of readdirSync(path.join(root, 'src/assets/weapons/foe')).filter((n) => n.endsWith('.glb'))) assert.ok(FOE_EQUIP_URLS[`../assets/weapons/foe/${f}`] || FOE_OFFHAND_URLS[`../assets/weapons/foe/${f}`], `${f}: shipped in src/assets/weapons/foe but in neither FOE_EQUIP_URLS nor FOE_OFFHAND_URLS`);
  assert.match(build, /src\/assets\/weapons\/foe/, 'the build copies src/assets/weapons/foe');
});

test('the hero fights with the longsword family (a golden weapon aside)', () => {
  assert.equal(DEFAULT_WEAPON, EXPECT.hero.weapon);
  assert.equal(PLAYER_WEAPONS[0], EXPECT.hero.weapon);
  assert.equal(weaponOf(DEFAULT_WEAPON).guard, EXPECT.hero.guard);
  assert.ok(EXPECT.hero.weapons.includes(DEFAULT_WEAPON));
});

// (e) the PRODUCTION build: every URL a boss needs is in the content-hashed art manifest of dist's main.js and the hashed copy is on disk.
const DIST = process.env.BOSS_EXPECT_DIST === '1';
test('the production build ships every boss part, off-hand and cut body under its hashed name', { skip: !DIST && 'set BOSS_EXPECT_DIST=1 after npm run build' }, () => {
  const mainJs = path.join(root, 'dist/b/dev/src/client/main.js');
  assert.ok(existsSync(mainJs), 'dist/b/dev/src/client/main.js (run npm run build)');
  const src = readFileSync(mainJs, 'utf8'), at = src.indexOf('"{\\"/');
  assert.ok(at >= 0, 'the art manifest is in main.js');
  const map = JSON.parse(JSON.parse(src.slice(at, src.indexOf('}"', at) + 2)));
  const need = new Set();
  for (const [kind, want] of Object.entries(EXPECT.bosses)) {
    need.add(`/src/assets/weapons/foe/${want.equip}.glb`);
    if (want.offhand) need.add(`/src/assets/weapons/foe/${want.offhand}.glb`);
    need.add(`/src/assets/${want.body}.glb`);
  }
  for (const u of Object.values(FOE_EQUIP_URLS)) need.add(`/src/assets/weapons/foe/${stem(u)}.glb`);
  for (const p of need) {
    assert.ok(map[p], `${p}: in the art manifest (hashed name)`);
    assert.ok(existsSync(path.join(root, 'dist', map[p])), `${map[p]}: exists in dist`);
    assert.ok(existsSync(path.join(root, 'dist', p)), `${p}: the plain path exists in dist`);
  }
});
