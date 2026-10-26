// Bakes the sim's cleaver sweeps from what the Minotaur visibly does (Dom 2026-10-26 on his phone: "his attacks hurt me from too far away"):
// src/assets/minotaur.glb (the Centurion's 65-joint rig and clips) with the drawn cleaver (src/assets/weapons/foe/cleaver.glb's WeaponDrawn)
// in his hand socket, exactly as the page arms him (characters.ts equipWeapon), into src/fight/blade-minotaur.ts. The same bake as
// scripts/hero-clips/bake-blades.mjs (V1's scripts/bake-blades.mjs @ 82a994d15): geometry-free load, one fixed-tick pose per age 0..total,
// hilt + tip of the weapon's contact segment in the attacker's root frame. Each path plays the clip the renderer plays for it on the
// cleaver (combat.ts clipOf -> characters.ts combatRole -> WEAPON_CLIPS.cleaver: the sword family, Thrust = Riposte), eased onto the sim's
// ticks the way the renderer eases it (swingProgress with the path's contact and `source`, clip time capped at fx.characters.clipEndMax).
//   node scripts/foe-body/bake-blades.mjs           writes src/fight/blade-minotaur.ts
//   node scripts/foe-body/bake-blades.mjs --out <file>               writes there instead (the test's freshness check)
//   node scripts/foe-body/bake-blades.mjs --check <veteran-cleaver.glb>   re-bakes V1's hero/cleaver table from V1's own file (V1
//       scripts/blade-manifest.json: src/assets/weapons/cleaver/veteran-cleaver.glb, not in V3's assets) with this script's clip map and
//       easing and reports the largest difference from blade-paths.ts per path (2026-10-26: 0.00000 m on all ten), writes nothing
// Runs in a second (no Blender, no GPU); three.js is a dependency.
import fs from 'node:fs/promises';
import { AnimationMixer, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { swingProgress } from '../../src/fight/blade.ts';
import { bladePathsByRig } from '../../src/fight/blade-paths.ts';
import { WEAPONS, total } from '../../src/fight/moves.ts';
import FX from '../../src/fight/fx-rows.json' with { type: 'json' };

globalThis.ProgressEvent = class { constructor(_, fields) { Object.assign(this, fields); } };
const load = async (file) => {   // as scripts/hero-clips/bake-blades.mjs: nodes, transforms and clips are all a bake needs
  const bytes = await fs.readFile(file), size = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + size));
  json.images = []; json.textures = []; json.materials = (json.materials || []).map((m) => ({ name: m.name }));
  json.buffers[0].uri = 'data:application/octet-stream;base64,' + bytes.subarray(28 + size).toString('base64');
  return new GLTFLoader().parseAsync(JSON.stringify(json), '');
};
const CLIP_END_MAX = FX.fxRows.find((r) => r.id === 'fx.characters.clipEndMax').fields.value;
// The clip each cleaver path plays on the opponent (combat.ts clipOf; characters.ts update's combatRole; WEAPON_CLIPS.cleaver Thrust: 'Riposte').
// heavy_counter and critical ride heavy_riposte's path; the directional heavies borrow light_right / light_left / thrust's bake (move-defs `blade`).
export const PATH_CLIPS = {
  light_right: 'Attack', light_right_chain: 'Attack', slash_riposte: 'Attack',
  light_left: 'Return', light_left_chain: 'Return',
  heavy_overhead: 'Heavy', heavy_overhead_chain: 'Heavy', heavy_riposte: 'Heavy',
  thrust: 'Riposte', riposte: 'Riposte',
};
// The page's arming (characters.ts equipWeapon): whatever the rig carries goes, the equip file's WeaponDrawn goes under hand_r.
async function armed(rigFile, equipFile) {
  const rig = await load(rigFile), part = await load(equipFile), weapon = part.scene.getObjectByName('WeaponDrawn'), hand = rig.scene.getObjectByName('hand_r');
  const carried = []; rig.scene.traverse((o) => { if (/^(SwordSheathed|SwordDrawn|WeaponDrawn|WeaponSheathed)(_\d+)?$/.test(o.name)) carried.push(o); });
  for (const o of carried) o.removeFromParent();
  const blade = weapon.clone(); hand.add(blade);
  const contact = weapon.userData.contact; if (!contact) throw new Error(`${equipFile}: WeaponDrawn has no contact extras`);
  return { rig, blade, strike: [contact.from, contact.to] };
}
function bake({ rig, blade, strike }, weaponId, clipFor, sourceOf, end) {
  const mixer = new AnimationMixer(rig.scene), weapon = WEAPONS[weaponId], paths = {};
  for (const [kind, name] of Object.entries(clipFor)) {
    const clip = rig.animations.find((c) => c.name === name); if (!clip) throw new Error(`no clip ${name}`);
    const spec = weapon.paths[kind]; if (!spec) throw new Error(`${weaponId} has no path ${kind}`);
    const length = total(spec), action = mixer.clipAction(clip).play();
    paths[kind] = Array.from({ length: length + 1 }, (_, age) => {
      mixer.setTime(Math.min(end, swingProgress(age / length, spec.windup / length, sourceOf(kind))) * clip.duration); rig.scene.updateMatrixWorld(true);
      return strike.flatMap((y) => blade.localToWorld(new Vector3(0, y, 0)).toArray().map((v) => +v.toFixed(5)));
    });
    action.stop(); mixer.uncacheClip(clip);
  }
  return paths;
}
const source = (kind) => WEAPONS.cleaver.paths[kind].source;
const check = process.argv.indexOf('--check');
if (check >= 0) {
  // V1 baked hero/cleaver from its src/assets/weapons/cleaver/veteran-cleaver.glb (scripts/blade-manifest.json: the cleaver in WeaponDrawn,
  // contact 0.14-0.86 m; not in V3's assets, pass V1's file). Re-baking it here with this script's clip map and easing must give V1's table.
  const file = process.argv[check + 1], rig = await load(file), blade = rig.scene.getObjectByName('WeaponDrawn'), c = blade.userData.contact;
  const v1 = bladePathsByRig.hero.cleaver, mine = bake({ rig, blade, strike: [c.from, c.to] }, 'cleaver', PATH_CLIPS, source, CLIP_END_MAX);
  for (const kind of Object.keys(PATH_CLIPS)) {
    const d = Math.max(...v1[kind].flatMap((pose, i) => pose.map((v, j) => Math.abs(v - mine[kind][i][j]))));
    console.log(`${kind.padEnd(22)} ${v1[kind].length}/${mine[kind].length} poses, largest difference from V1's ${d.toFixed(5)} m`);
  }
} else {
  const paths = bake(await armed('src/assets/minotaur.glb', 'src/assets/weapons/foe/cleaver.glb'), 'cleaver', PATH_CLIPS, source, CLIP_END_MAX);
  for (const kind of Object.keys(paths)) if (paths[kind].length !== bladePathsByRig.hero.cleaver[kind].length) throw new Error(`${kind}: frame count differs from V1's`);
  const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'src/fight/blade-minotaur.ts';   // --out: test/foe-reach.test.mjs re-bakes into a temp file
  await fs.writeFile(out, '// Generated by scripts/foe-body/bake-blades.mjs from src/assets/minotaur.glb + src/assets/weapons/foe/cleaver.glb. Do not hand-edit.\n'
    + "// The cleaver's sweeps as the Minotaur draws them (his Centurion clips, the drawn cleaver in hand_r), by path id, laid over V1's hero/cleaver\n"
    + '// table (blade-paths.ts) by src/fight/foe-reach.ts. Same frame count per path as V1\'s (the sim reads by age), same frame (attacker root).\n'
    + 'export const BLADE_MINOTAUR: Record<string, number[][]> = ' + JSON.stringify(paths) + ';\n');
  console.log(`cleaver@minotaur: ${Object.keys(paths).join(', ')} (${Object.values(paths).reduce((n, p) => n + p.length, 0)} fixed-tick poses)`);
}
