// The rig swap's one bone map (src/fight/rig-bones.ts, Dom + Strategy 2026-10-26): every bone or weapon-node lookup goes through `bone(root, name)`.
// A 65 body is looked up exactly as before (root.getObjectByName(name)); a 106 body through data/rig.json. Both sides are 106 only (Dom 2026-10-26); no URL picks a rig.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clip106Path, clip106Paths, bone, boneAs65, boneName, rigsDrawn, drawnSword, foeRigFile, gapFillFor, heldWeapon, heroRigFile, isHeldWeaponName, rigFile, rigOf, sanitizeNodeName, trackAs65, trackOn } from '../src/fight/rig-bones.ts';

const RIG = JSON.parse(readFileSync(new URL('../data/rig.json', import.meta.url), 'utf8'));
const FIGHT = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8'));
const glb = (path) => { const bytes = readFileSync(new URL(path, import.meta.url)), n = bytes.readUInt32LE(12); return JSON.parse(bytes.subarray(20, 20 + n)); };
const joints = (j) => j.skins[0].joints.map((i) => j.nodes[i].name);
// A stand-in for a loaded scene: getObjectByName over a set of names (three.js-sanitized, as GLTFLoader leaves them), counting calls.
const scene = (names) => { const calls = []; return { calls, getObjectByName: (n) => { calls.push(n); return names.includes(n) ? { name: n } : undefined; } }; };
const MIXAMO = Object.values(RIG.bones).map(sanitizeNodeName);

// 106 ONLY (Dom 2026-10-26: "there's no risk of going back to the old 65 rig"; docs/PLAN.md section 10). This test is the lock: it fails if
// either default is not '106', or if a URL key that picks a rig comes back (a `query` row in data/rig.json, or the page reading ?rig= / ?foerig=).
test('106 only: both defaults are 106 and no URL key picks a rig', () => {
  assert.deepEqual(RIG.default, { hero: '106', foe: '106' });
  assert.deepEqual(rigsDrawn(), { hero: '106', foe: '106' });
  assert.equal(heroRigFile('psyche'), 'psyche-106'); assert.equal(foeRigFile('minotaur'), 'minotaur-106');
  assert.ok(!('query' in RIG), 'data/rig.json has no query row');
  const src = ['src/fight/rig-bones.ts', 'src/fight/scene.ts', 'src/fight/foe-body.ts', 'src/fight/hero-body-rows.ts', 'src/client/main.ts']
    .map((f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')).join('\n');
  for (const key of ['rig', 'foerig', 'herorig']) assert.ok(!new RegExp(`get\\(\\s*['"\`]${key}['"\`]\\s*\\)|[?&]${key}=`).test(src), `no ?${key}= read by the page`);
  assert.ok(!/chooseRigs|RIG\.query/.test(src), 'no rig chooser');
});

// 106 ONLY IN PRODUCTION (Dom 2026-10-26): no 65 body, kit or 65-keyed clip JSON is reachable from the page. data/build.json `notShipped` names
// them (they stay in src/assets for these tests and the bakes); scripts/build.mjs refuses to build if the bundle references one or one lands in
// dist/. These tests are the lock: the source (every way the build ships a src file), the loader table, the queries, and the built dist/.
const ROOT = fileURLToPath(new URL('..', import.meta.url)), DIST = join(ROOT, 'dist');
const NOT_SHIPPED = JSON.parse(readFileSync(new URL('../data/build.json', import.meta.url), 'utf8')).notShipped;
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const posix = (p) => p.split(sep).join('/');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

test('data/build.json notShipped names every 65 body, its 65-rigged kits and every 65-keyed clip JSON; all stay in the repo', () => {
  for (const stem of [...Object.keys(RIG.files), 'warrior', 'veteran']) assert.ok(NOT_SHIPPED.includes(`src/assets/${stem}.glb`), `${stem}.glb`);
  for (const kit of ['carriers-minotaur', 'carriers-veteran']) assert.ok(NOT_SHIPPED.includes(`src/assets/loot/${kit}.glb`), kit);
  for (const f of Object.values(RIG.clips106.files)) assert.ok(NOT_SHIPPED.includes(`src/assets/${f}`), `${f} (65-keyed)`);
  for (const f of ['bowpower', 'bowfan', 'bowpin', 'bowquick']) assert.ok(NOT_SHIPPED.includes(`src/assets/special-${f}.json`), `special-${f}.json (65-keyed, no 106 file)`);
  for (const p of NOT_SHIPPED) assert.ok(existsSync(join(ROOT, p)), `${p} stays in src/assets for the tests and the bakes`);
  for (const stem of Object.values(RIG.files)) assert.ok(!NOT_SHIPPED.includes(`src/assets/${stem}.glb`), `${stem}.glb (106) ships`);
});

test('no production loader reaches a 65 file: the loader table is the 106 bodies only, no source names a notShipped file, no query picks a body', () => {
  const sceneSrc = readFileSync(new URL('../src/fight/scene.ts', import.meta.url), 'utf8');
  const table = /const fighterUrls: Record<string, string> = \{([^;]*)\};/.exec(sceneSrc)?.[1];
  assert.ok(table, 'scene.ts fighterUrls found');
  assert.deepEqual([...table.matchAll(/'\.\.\/assets\/([^']+)\.glb':/g)].map((m) => m[1]).sort(), Object.values(RIG.files).sort(), 'fighterUrls: the 106 files and nothing else');
  assert.match(sceneSrc, /const carrierUrls: Record<string, string> = \{\};/, 'no kit loader (both cuts are 65-rigged)');
  // Every way scripts/build.mjs ships a src file: new URL('<relative>', import.meta.url) (a template copies its folder whole) and import('<relative>.json').
  const LOADS = /new URL\(\s*(['"`])(\.{1,2}\/[^'"`]*)\1\s*,\s*import\.meta\.url\s*\)|import\(\s*(['"`])(\.{1,2}\/[^'"`]*\.json)\3\s*\)/g;
  let loads = 0;
  for (const file of walk(join(ROOT, 'src')).filter((f) => /\.(ts|js|mjs)$/.test(f))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(LOADS)) {
      loads++;
      const spec = m[2] ?? m[4], cut = spec.indexOf('${');
      const target = posix(relative(ROOT, resolve(dirname(file), cut < 0 ? spec : spec.slice(0, spec.lastIndexOf('/', cut) + 1))));
      assert.ok(!NOT_SHIPPED.some((p) => (cut < 0 ? p === target : p.startsWith(target + '/'))), `${posix(relative(ROOT, file))} loads ${spec} (a notShipped 65 file)`);
    }
    assert.ok(!/get\(\s*['"`]foe['"`]\s*\)/.test(src), `${posix(relative(ROOT, file))}: no ?foe= read (?foe=v1 is gone)`);
    assert.ok(!/get\(\s*['"`]hero['"`]\s*\)\s*===\s*['"`]v1['"`]/.test(src), `${posix(relative(ROOT, file))}: no ?hero=v1 read`);
  }
  assert.ok(loads > 10, `the scan saw the page's loaders (${loads})`);
});

// After `npm run build` (CI runs this file again with DIST_REQUIRED=1 once the build is done): no 65 file, hashed copy, .gz twin or lazy
// .json.js module in dist/, and no bundle names one (an artUrl path, the art manifest, a lazy import specifier).
test('the built dist/ holds no 65 file and no bundle names one', (t) => {
  if (!existsSync(join(DIST, 'build.txt'))) {
    if (process.env.DIST_REQUIRED) assert.fail('no dist/: run npm run build first');
    return t.skip('no dist/ (npm run build first; CI runs it with DIST_REQUIRED=1)');
  }
  const files = walk(DIST).map((f) => posix(relative(DIST, f)));
  const shipped = files.filter((f) => NOT_SHIPPED.some((p) => {
    const dot = p.lastIndexOf('.'), stem = p.slice(0, dot), ext = p.slice(dot);
    return new RegExp(`(^|/)${esc(stem)}(\\.[0-9a-f]{8})?${esc(ext)}(\\.js)?(\\.gz)?$`).test(f);
  }));
  assert.deepEqual(shipped, [], 'no 65 file in dist/');
  for (const stem of Object.values(RIG.files)) assert.ok(files.includes(`src/assets/${stem}.glb`), `${stem}.glb (106) is in dist/`);
  const named = [];
  for (const f of files.filter((f) => f.startsWith('b/') && f.endsWith('.js'))) {
    const js = readFileSync(join(DIST, f), 'utf8');
    for (const p of NOT_SHIPPED) {
      const dot = p.lastIndexOf('.'), tail = p.slice(0, dot).replace(/^src\//, ''), ext = p.slice(dot);
      // a URL the page can fetch: root-absolute ("/src/assets/x.glb", artUrl and the art manifest) or relative ("../assets/x.json.js", a lazy
      // import). A plain "src/assets/x.glb" is a data string (catalogue-data.ts's V1 roster rows), not a loader.
      if (new RegExp(`["'\`]\\\\?(/|(\\.\\.?/)+)(src/)?${esc(tail)}(\\.[0-9a-f]{8})?${esc(ext)}(\\.js)?\\\\?["'\`]`).test(js)) named.push(`${f}: ${p}`);
    }
  }
  assert.deepEqual(named, [], 'no bundle names a 65 file');
});

test('both 106 files are in src/assets with the bone map (OpenTrident v3 deliveries)', () => {
  for (const stem of Object.values(RIG.files)) {
    const j = glb(`../src/assets/${stem}.glb`), names = j.nodes.map((n) => n.name);
    assert.ok(names.includes(RIG.detect['106']), `${stem}: has ${RIG.detect['106']}`);
    assert.ok(names.includes('fk_socket_hand_r'), `${stem}: has fk_socket_hand_r`);
    assert.deepEqual(JSON.parse(readFileSync(new URL(`../src/assets/${stem}.bones.json`, import.meta.url), 'utf8')).map, RIG.bones, `${stem}.bones.json map = data/rig.json bones`);
  }
});

test("each 106 body has its own retarget of every baked clip JSON (data/rig.json clips106): same name, duration, key times as the 65 file, keyed to the body's joints", () => {
  const SIXTY_FIVE = { Special_SkullCrack: 'special-skullcrack.json', Special_Whirlwind: 'special-whirlwind.json', Special_GroundSlam: 'special-groundslam.json', Special_Lunge: 'special-lunge.json',
    Fin_Execution: 'execution-killer.json', Death_Execution: 'execution-victim-hero.json', Fin_Hamstrung: 'hamstrung-killer.json', Death_Hamstrung: 'hamstrung-victim-hero.json' };
  assert.deepEqual(Object.keys(RIG.clips106.files).sort(), Object.keys(SIXTY_FIVE).sort());
  assert.deepEqual(Object.keys(RIG.clips106.dir).sort(), Object.values(RIG.files).sort(), 'a clips folder for every 106 body');
  const read = (p) => JSON.parse(readFileSync(new URL(`../src/assets/${p}`, import.meta.url), 'utf8'));
  for (const body of Object.values(RIG.files)) {
    const joints = new Set(glb(`../src/assets/${body}.glb`).nodes.map((n) => sanitizeNodeName(n.name)));
    for (const [role, file] of Object.entries(SIXTY_FIVE)) {
      const path = clip106Path(body, role), mine = read(path), theirs = read(file);
      assert.equal(path, `${RIG.clips106.dir[body]}/${RIG.clips106.files[role]}`);
      assert.deepEqual([mine.name, mine.duration, mine.tracks.length], [theirs.name, theirs.duration, theirs.tracks.length], path);
      mine.tracks.forEach((t, i) => {
        assert.deepEqual(t.times, theirs.tracks[i].times, `${path} ${t.name}: same key times`);
        assert.ok(joints.has(t.name.slice(0, t.name.lastIndexOf('.'))), `${path}: ${t.name} is a joint of ${body}`);
        assert.equal(trackAs65('106', t.name), theirs.tracks[i].name, `${path}: track ${i} is the 65 file's ${theirs.tracks[i].name}`);
      });
    }
  }
  assert.equal(clip106Path('psyche-106', 'Special_BowFan'), undefined, 'a role with no 106 file: none');
  assert.equal(clip106Path(undefined, 'Special_SkullCrack'), undefined, 'a body with no clips folder: none');
});

test("every 106 clip path the data names has a lazy loader (src/fight/clips-106.ts), and nothing more", async () => {
  const { CLIP_106_LOADERS } = await import('../src/fight/clips-106.ts');
  assert.deepEqual(Object.keys(CLIP_106_LOADERS).sort(), [...clip106Paths()].sort());
  const src = readFileSync(new URL('../src/fight/clips-106.ts', import.meta.url), 'utf8');
  for (const p of clip106Paths()) assert.ok(src.includes(`'${p}': () => import('../assets/${p}')`), `${p}: its key imports its own file`);
});

test('only a body with a 106 file changes: Psyche and the Minotaur (V1\'s warrior.glb / veteran.glb have none, and are not shipped)', () => {
  assert.equal(rigFile('psyche', '106'), 'psyche-106'); assert.equal(rigFile('minotaur', '106'), 'minotaur-106');
  assert.equal(rigFile('psyche', '65'), 'psyche', 'the 65 stem: a name only (tests, bakes); never in the loader table');
  assert.equal(rigFile('warrior', '106'), 'warrior', 'warrior.glb has no 106 file');
  assert.equal(rigFile('veteran', '106'), 'veteran', 'veteran.glb has no 106 file');
});

test("the map covers psyche.glb's and minotaur.glb's 65 joints, one to one, onto mixamorig names", () => {
  for (const file of ['../src/assets/psyche.glb', '../src/assets/minotaur.glb']) assert.deepEqual(Object.keys(RIG.bones).sort(), joints(glb(file)).sort(), file);
  assert.equal(new Set(MIXAMO).size, MIXAMO.length, 'no two 65 joints share a 106 joint');
  for (const [from, to] of Object.entries(RIG.bones)) assert.ok(from === 'root' ? to === 'root' : /^mixamorig:[A-Z]\w+$/.test(to), `${from} -> ${to}`);
  assert.equal(sanitizeNodeName('mixamorig:Hips'), 'mixamorigHips', 'three.js drops the colon as it loads');
});

test('a 65 body: bone(root, name) is root.getObjectByName(name), the same call and the same answer', () => {
  const names = ['pelvis', 'hand_r', 'Head', 'SwordDrawn', 'SwordSheathed'], root = scene(names);
  assert.equal(rigOf(root), '65');
  for (const n of [...names, 'WeaponDrawn', 'fk_socket_hand_r', 'mixamorigHips']) {
    root.calls.length = 0;
    assert.deepEqual(bone(root, n), names.includes(n) ? { name: n } : undefined, n);
    assert.deepEqual(root.calls, [n], `${n}: one lookup of the name itself`);
  }
  assert.equal(boneName('65', 'hand_r'), 'hand_r'); assert.equal(trackOn('65', 'pelvis.position'), 'pelvis.position'); assert.equal(trackAs65('65', 'pelvis.position'), 'pelvis.position');
  assert.ok(!isHeldWeaponName('65', 'fk_socket_hand_r'));
});

test('a 106 body: bones by their mixamorig names, the sword at fk_socket_hand_r (then the body\'s own node)', () => {
  const own = scene([...MIXAMO, 'SwordDrawn', 'SwordSheathed', 'fk_socket_hand_r', 'fk_socket_hip_r']);
  assert.equal(rigOf(own), '106');
  assert.equal(bone(own, 'pelvis').name, 'mixamorigHips'); assert.equal(bone(own, 'hand_r').name, 'mixamorigRightHand'); assert.equal(bone(own, 'Head').name, 'mixamorigHead');
  assert.equal(bone(own, 'ball_leaf_l').name, 'mixamorigLeftToe_End'); assert.equal(bone(own, 'root').name, 'root');
  assert.equal(bone(own, 'SwordDrawn').name, 'fk_socket_hand_r', "the socket first: it carries the 65 rig's sword frame");
  assert.equal(bone(own, 'SwordSheathed').name, 'SwordSheathed', "the body's own sheath node first");
  assert.equal(bone(own, 'WeaponDrawn'), undefined, 'WeaponDrawn is only ever the node itself (a grafted part)');
  assert.equal(heldWeapon(own).name, 'fk_socket_hand_r'); assert.equal(drawnSword(own).name, 'fk_socket_hand_r');
  const bare = scene([...MIXAMO, 'SwordDrawn']);
  assert.equal(bone(bare, 'SwordDrawn').name, 'SwordDrawn', 'no socket: its own sword node');
  assert.equal(bone(bare, 'SwordSheathed'), undefined);
  const grafted = scene([...MIXAMO, 'WeaponDrawn', 'fk_socket_hand_r']);
  assert.equal(heldWeapon(grafted).name, 'WeaponDrawn'); assert.equal(drawnSword(grafted).name, 'WeaponDrawn');
  assert.ok(isHeldWeaponName('106', 'fk_socket_hand_r'));
  assert.equal(boneAs65('106', 'mixamorigLeftForeArm'), 'lowerarm_l'); assert.equal(boneAs65('106', 'upperarm_twist_01_l'), 'upperarm_twist_01_l');
});

test("a 106 track reads as its 65 bone, so data/fight.json's guard-walk legs row splits a 106 clip the same way", () => {
  const legs = new RegExp(FIGHT.guardWalk.lowerBones), split = (rig, bones) => bones.map((b) => legs.test(trackAs65(rig, `${rig === '106' ? sanitizeNodeName(RIG.bones[b]) : b}.quaternion`)));
  const names = Object.keys(RIG.bones);
  assert.deepEqual(split('106', names), split('65', names));
  assert.equal(trackOn('106', 'pelvis.position'), 'mixamorigHips.position'); assert.equal(trackOn('106', 'Steel.morph'), 'Steel.morph');
});

test("OpenTrident's minotaur-106.glb: its bones.json is the map, every mapped joint is in it, the socket on the right hand, the 65 file's clips but the trident's", () => {
  const ot = JSON.parse(readFileSync(new URL('../src/assets/minotaur-106.bones.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.entries(ot.map).sort(), Object.entries(RIG.bones).sort(), 'data/rig.json bones = minotaur-106.bones.json map');
  const m = glb('../src/assets/minotaur-106.glb'), named = new Set(m.nodes.map((n) => n.name)), have = new Set(joints(m));
  for (const to of Object.values(RIG.bones)) assert.ok(have.has(to), `${to} is a joint`);
  assert.ok(have.has(RIG.detect['106']) && !named.has(RIG.detect['65']), 'detected as 106');
  const socket = m.nodes.findIndex((n) => n.name === 'fk_socket_hand_r'), parent = m.nodes.find((n) => (n.children ?? []).includes(socket));
  assert.equal(parent?.name, 'mixamorig:RightHand');
  assert.deepEqual(m.animations.map((a) => a.name), glb('../src/assets/minotaur.glb').animations.map((a) => a.name).filter((n) => !n.startsWith('Trident_')));
});

test("every 106 file data/rig.json names is addressable by the loader (scene.ts's URL table); every held node has its weapons row", () => {
  const scene = readFileSync(new URL('../src/fight/scene.ts', import.meta.url), 'utf8');
  for (const stem of Object.values(RIG.files)) assert.ok(scene.includes(`new URL('../assets/${stem}.glb', import.meta.url)`), `${stem}.glb in scene.ts fighterUrls`);
  assert.deepEqual(Object.values(RIG.held).every((k) => RIG.weapons[k]?.length), true, 'each held node has a weapons row');
});

test('gap fill (106 bodies only) names a clip for every role', () => {
  for (const role of ['Armed', 'Draw', 'Kick', 'Parry', 'Anything']) assert.ok(gapFillFor(role).length, role);
  assert.deepEqual(gapFillFor('Anything'), ['Idle']);
});
