// THE ONE BONE MAP (Dom + Strategy 2026-10-26: both fighters are on the 106-joint Mixamo rig, 106 only; docs/PLAN.md section 10).
// Every bone or weapon-node lookup the fight makes names a 65-joint bone (V1's warrior/veteran skeleton) or one of the 65 rig's weapon nodes
// (data/rig.json `held`), and goes through `bone(root, name)` here. Each fighter's loaded body says which rig it is (`rigOf`, data/rig.json
// `detect`). On a 65 body `bone` IS root.getObjectByName(name): today's behaviour, unchanged. On a 106 body the name goes through data/rig.json
// (`bones`: 65 name -> Mixamo name; `weapons`: the names tried for a weapon node, OpenTrident's socket first). Which rig each side draws:
// data/rig.json `default` ('106' both; no query key). No 65 body is loadable in production any more (?hero=v1, ?foe=v1 and the 65 load fallback
// were removed; the 65 files are not shipped, data/build.json notShipped); the 65 branch stays for the tests and tools that read the 65 files. Dom's rule: every name, map, file and default is a data row; this file only reads them.
// No three.js import (types only), so node tests read it as the page does.
import type { Object3D } from 'three';
import RIG from '../../data/rig.json' with { type: 'json' };

export type Rig = '65' | '106';
// three.js renames nodes as GLTFLoader loads them (PropertyBinding.sanitizeNodeName): whitespace to '_', and '[ ] . : /' dropped.
export const sanitizeNodeName = (name: string): string => name.replace(/\s/g, '_').replace(/[[\].:/]/g, '');
const TO_106: ReadonlyMap<string, string> = new Map(Object.entries(RIG.bones as Record<string, string>).map(([from, to]) => [from, sanitizeNodeName(to)]));
const TO_65: ReadonlyMap<string, string> = new Map([...TO_106].map(([from, to]) => [to, from]));
const WEAPONS = RIG.weapons as Record<string, readonly string[]>;
/** The 65 rig's weapon-node names (data/rig.json `held`): the weapon always in hand or a grafted part, the drawn sword, the sheathed sword. */
export const HELD = RIG.held as { readonly weapon: string; readonly sword: string; readonly sheath: string };
const HIPS_106 = sanitizeNodeName(RIG.detect['106']), HIPS_65 = RIG.detect['65'];
const FILES = RIG.files as Record<string, string>;
const GAP_FILL = RIG.gapFill as Record<string, readonly string[]>;
const isRig = (v: unknown): v is Rig => v === '65' || v === '106';
const DEFAULT = RIG.default as { hero: string; foe: string };
if (!isRig(DEFAULT.hero) || !isRig(DEFAULT.foe)) throw new Error(`data/rig.json: default must be '65' or '106' per side, got ${JSON.stringify(DEFAULT)}`);
for (const key of Object.values(HELD)) if (!WEAPONS[key]?.length) throw new Error(`data/rig.json: held node ${key} has no weapons row`);
const HELD_NAMES: ReadonlySet<string> = new Set([HELD.weapon, HELD.sword]);
const HELD_NAMES_106: ReadonlySet<string> = new Set([...HELD_NAMES, ...WEAPONS[HELD.weapon]!, ...WEAPONS[HELD.sword]!]);

// The rig of a fighter's root (or anchor), found once and kept. A root holding neither hips yet (a capsule before the art is in) is not kept and reads 65.
const rigs = new WeakMap<Object3D, Rig>();
export function rigOf(root: Object3D): Rig {
  const known = rigs.get(root);
  if (known) return known;
  const rig: Rig | undefined = root.getObjectByName(HIPS_106) ? '106' : root.getObjectByName(HIPS_65) ? '65' : undefined;
  if (rig) rigs.set(root, rig);
  return rig ?? '65';
}
/** The name `name` (a 65 bone or a 65 weapon node) has on `rig`: itself on 65; the mapped bone on 106 (a weapon node: its first try). */
export const boneName = (rig: Rig, name: string): string => rig === '106' ? TO_106.get(name) ?? WEAPONS[name]?.[0] ?? name : name;
/** The node `name` (a 65 bone or weapon-node name) names on this fighter: root.getObjectByName(name) on a 65 body, the mapped node on a 106 body. */
export function bone(root: Object3D, name: string): Object3D | undefined {
  if (rigOf(root) === '65') return root.getObjectByName(name);
  const tries = WEAPONS[name];
  if (tries) { for (const t of tries) { const found = root.getObjectByName(t); if (found) return found; } return undefined; }
  return root.getObjectByName(TO_106.get(name) ?? name);
}
/** The weapon in hand: the held weapon node (always in hand, or a grafted part), else the drawn sword's (on a 106 body, its socket first). */
export const heldWeapon = (root: Object3D): Object3D | undefined => bone(root, HELD.weapon) ?? bone(root, HELD.sword);
/** The same, sword first on a 65 body (the order special-tithe.ts reads them in); on a 106 body heldWeapon (a grafted part sits on the
 *  socket's frame and carries the contact segment). */
export const drawnSword = (root: Object3D): Object3D | undefined =>
  rigOf(root) === '65' ? root.getObjectByName(HELD.sword) ?? root.getObjectByName(HELD.weapon) : heldWeapon(root);
/** Whether a node of this name is a held-weapon node on `rig` (opened.ts keeps what hangs under it out of the cut). */
export const isHeldWeaponName = (rig: Rig, name: string): boolean => (rig === '65' ? HELD_NAMES : HELD_NAMES_106).has(name);
/** A joint name of `rig` as the 65 rig spells it (a joint the map does not hold, a 106 twist or socket, is left as it is). */
export const boneAs65 = (rig: Rig, name: string): string => rig === '65' ? name : TO_65.get(name) ?? name;
/** A 65-keyed track name ('pelvis.position') as `rig` spells it; a track of a bone the map does not hold is left as it is. */
export const trackOn = (rig: Rig, track: string): string => {
  if (rig === '65') return track;
  const dot = track.indexOf('.'), to = dot > 0 ? TO_106.get(track.slice(0, dot)) : undefined;
  return to ? to + track.slice(dot) : track;
};
/** A track name of `rig` as the 65 rig spells it (for the rows written in 65 names: data/fight.json guardWalk.lowerBones). */
export const trackAs65 = (rig: Rig, track: string): string => {
  if (rig === '65') return track;
  const dot = track.indexOf('.'), to = dot > 0 ? TO_65.get(track.slice(0, dot)) : undefined;
  return to ? to + track.slice(dot) : track;
};
/** The draws a 106 body does not show (data/rig.json hide: OpenTrident's armour layers; Dom: no armour until after alpha/beta). */
export const HIDDEN_ON_106: readonly string[] = RIG.hide;
/** On a 106 body only: the clips a role with no clip of its own plays, first found (data/rig.json gapFill; '*' for any other role). */
export const gapFillFor = (role: string): readonly string[] => GAP_FILL[role] ?? GAP_FILL['*'] ?? [];
const CLIPS_106 = RIG.clips106 as { dir: Record<string, string>; files: Record<string, string> };
/** The 106 version of a baked clip JSON (data/rig.json clips106) for the 106 body file `body` (a `files` value, 'psyche-106'): its path under
 *  src/assets ('106/psyche/special-skullcrack.json'), or undefined when that body or role has none (the body then plays what it would
 *  without the clip: a special the weapon's own strike clip, a finisher scene the plain death). A 65 body never asks: it plays the 65 file. */
export const clip106Path = (body: string | undefined, role: string): string | undefined => {
  const dir = body ? CLIPS_106.dir[body] : undefined, file = CLIPS_106.files[role];
  return dir && file ? `${dir}/${file}` : undefined;
};
/** Every 106 clip path the data names (the loader table in clips-106.ts must hold each: test/rig-bones.test.mjs). */
export const clip106Paths = (): readonly string[] => Object.keys(CLIPS_106.dir).flatMap(body => Object.keys(CLIPS_106.files).map(role => clip106Path(body, role)!));
/** Where the 65 rig's weapon frame sits in its sword hand (data/rig.json grip65: `hand`, the 65 bone an equip part hangs from unless it names
 *  its own): a 65 equip part grafted on a 106 body is re-seated from this. */
export const GRIP_65 = RIG.grip65 as { hand: string; translation: [number, number, number]; rotation: [number, number, number, number] };

// Which rig each side draws: data/rig.json `default`, and nothing else. 106 ONLY (Dom 2026-10-26, docs/PLAN.md section 10): no URL key picks a
// rig, so no query puts a fighter back on 65 (test/rig-bones.test.mjs fails if a default is not '106' or a rig query key comes back).
const heroRig: Rig = DEFAULT.hero, foeRig: Rig = DEFAULT.foe;
/** Each side's rig: data/rig.json `default` (both '106'). */
export const rigsDrawn = (): { hero: Rig; foe: Rig } => ({ hero: heroRig, foe: foeRig });
/** The file stem under src/assets drawn for a 65 body stem on `rig` (data/rig.json files): its 106 file when it has one, else the stem itself. */
export const rigFile = (stem: string, rig: Rig): string => (rig === '106' && FILES[stem]) || stem;
/** The hero's / the opponent's file stem for the 65 body stem the body rows picked (hero-body-rows.ts, foe-body.ts). */
export const heroRigFile = (stem: string): string => rigFile(stem, heroRig);
export const foeRigFile = (stem: string): string => rigFile(stem, foeRig);
/** Every 106 file stem the map can name (the loader's URL table keeps them addressable; test/rig-bones.test.mjs checks it does). */
export const rigFiles = (): readonly string[] => Object.values(FILES);
