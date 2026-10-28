// The boss bodies' physics data (Gargantua, Arachne), copied from the Minotaur's: a data/physics.json opponents row fitted to the body's measure row, the physics cut GLB as the body
// file (src/assets/<stem>-106.glb, physics cut-batch rows gargantua-106 / arachne-106, sha256 enforced there) and its manifest listed in physics-chunk.ts cutManifests.
// None of it is wired to a spawn: a body missing any piece still dies the plain way (ragdoll.ts cutManifestOf / ragdollRowFor), and nothing here is in the first-visit path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { heldRagdollFor, ragdollRowFor } from '../src/fight/ragdoll.ts';
import { rigStemOf } from '../src/fight/rig-bones.ts';
import { optimizeGlb } from '../scripts/optimize-glb.mjs';
import { BOUNDS, unpackMeshopt } from '../scripts/cut-glb-pack.mjs';

const url = (p) => new URL(p, import.meta.url);
const json = (p) => JSON.parse(readFileSync(url(p), 'utf8'));
const PHYSICS = json('../data/physics.json'), RIG = json('../data/rig.json');
const CHUNK = readFileSync(url('../src/fight/physics-chunk.ts'), 'utf8'), BUILD = readFileSync(url('../scripts/build.mjs'), 'utf8');
const parse = async (raw) => { const n = raw.readUInt32LE(12); return unpackMeshopt(JSON.parse(raw.subarray(20, 20 + n)), raw.subarray(28 + n)); };

// stem -> ragdoll mass the physics package generates from the measure row (physics 7edb0ce: 125.14 and 40.16 kg), height, and the cut's piece count
const BOSSES = { gargantua: { mass: 125, height: 1.73 }, arachne: { mass: 40, height: 1.70 } };

for (const [stem, want] of Object.entries(BOSSES)) {
  const file = `${stem}-106`;

  test(`${stem}: a data/physics.json opponents row fitted to the body, found by (id, body) and by nothing else`, () => {
    // The real held-spawn path (scene.ts holdBody -> heldRagdollFor(search, opponentId, rigStemOf(file))) passes the PAGE's opponent id (the zone page's foe is 'pitborn') with the spawn's body stem.
    const PAGE_ID = 'pitborn';
    const rows = PHYSICS.opponents.filter((o) => o.body === stem);
    assert.deepEqual(rows.map((o) => o.id), ['pitborn', 'executioner'], 'one row per page id: pitborn (?order=v1, the Minotaur-first page) and executioner (the Gargantua-first page)');
    for (const r of rows) assert.deepEqual({ ...r, id: PAGE_ID }, { id: PAGE_ID, body: stem, measure: { 106: `physics/bodies/${file}.measure.json` }, helmet: false, gear: {} });
    assert.equal(rigStemOf(file), stem);
    assert.equal(ragdollRowFor(PHYSICS, '', PAGE_ID, rigStemOf(file))?.body, stem, 'the held-spawn lookup finds the row with the id the page passes');
    assert.equal(ragdollRowFor(PHYSICS, '', stem, stem), null, 'the boss stem is not the page id: no row under it');
    assert.ok(heldRagdollFor('', PAGE_ID, rigStemOf(file)), 'heldRagdollFor builds a ragdoll for the held body');
    assert.equal(heldRagdollFor('?physics=v1', PAGE_ID, rigStemOf(file)), null, '?physics=v1 is today\'s death');
    assert.equal(ragdollRowFor(PHYSICS, '', PAGE_ID)?.body, 'minotaur', 'the page\'s own foe still resolves to the Minotaur row');
    assert.equal(PHYSICS.opponents[0].id, 'pitborn', 'the Minotaur\'s row is still the first, unchanged');
    assert.equal(RIG.files[stem], file);
  });

  test(`${stem}: the measure row the build copies out of the pinned package exists and is the right body`, () => {
    const m = json(`../node_modules/@frankendom/physics/data/bodies/${file}.measure.json`);
    assert.ok(Math.abs(m.height_m - want.height) < 0.05, `height ${m.height_m}`);
  });

  test(`${stem}: the manifest is in physics-chunk.ts cutManifests and names exactly the meshes of the body file`, async () => {
    assert.match(CHUNK, new RegExp(`import ${stem}Manifest from '../assets/${file}\\.cut\\.manifest\\.json' with \\{ type: 'json' \\};`));
    assert.match(CHUNK, new RegExp(`cutManifests: Record<string, unknown> = \\{[^}]*\\b${stem}: ${stem}Manifest\\b`));
    const manifest = json(`../src/assets/${file}.cut.manifest.json`);
    assert.equal(manifest.schema, 'cut-pieces/1');
    assert.equal(manifest.body, file);
    assert.equal(manifest.rig, 'mixamo-106');
    const G = await parse(readFileSync(url(`../src/assets/${file}.glb`)));
    const names = G.d.meshes.map((m) => m.name);
    assert.deepEqual([...names].sort(), [...manifest.regions.map((r) => r.mesh), ...manifest.caps.map((c) => c.mesh)].sort(), 'every piece and cap the manifest names is in the file, and no other mesh');
    assert.ok(names.some((n) => n.startsWith('piece_')) && names.some((n) => n.startsWith('cap_')));
    assert.equal(G.d.skins[0].joints.length, 106);
    assert.ok(G.d.animations.length >= 26, `${G.d.animations.length} clips`);
  });

  test(`${stem}: the body file ships through the lossy cut path inside its bounds, and the build lists it`, async () => {
    assert.match(BUILD, new RegExp(`const CUT_GLBS = \\[[^\\]]*src/assets/${file}\\.glb`));
    const source = readFileSync(url(`../src/assets/${file}.glb`));
    const packed = await optimizeGlb(source, undefined, { cut: true });   // measures its own error and throws past BOUNDS
    assert.ok(packed.length < source.length * 0.75, `${packed.length} of ${source.length}`);
    assert.ok(gzipSync(packed, { level: 9 }).length < packed.length);
    const A = await parse(source), B = await parse(packed);
    assert.deepEqual(B.d.meshes.map((m) => m.name), A.d.meshes.map((m) => m.name));
    assert.deepEqual(B.d.animations.map((a) => a.name), A.d.animations.map((a) => a.name));
    assert.ok(BOUNDS.positionMetres <= 1e-4);
  });
}

test('the ragdoll masses: Gargantua is the big body, Arachne the slim one (physics generateRow on the measure rows)', async () => {
  const { generateRow, loadTable } = await import('@frankendom/physics');
  const table = loadTable();
  for (const [stem, want] of Object.entries(BOSSES)) {
    const m = json(`../node_modules/@frankendom/physics/data/bodies/${stem}-106.measure.json`);
    assert.ok(Math.abs(generateRow(`${stem}-106`, m, table).total_mass_kg - want.mass) < 2, stem);
  }
});
