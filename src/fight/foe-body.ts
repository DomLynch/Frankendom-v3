// V3 (Dom 2026-10-26): Mixamo's Minotaur is the opponent's body (since Dom's later call that day he fights as V1's Pitborn: foe-pick.ts, the
// `pitborn` row below; the `veteran` row is ?pitborn=v1's fight, the Centurion). Strategy ruled that only the body changes: the sim, the AI, his
// specials, stats, level and weapons are his own id's, so Gate 0 is untouched.
// 106 ONLY (Dom 2026-10-26: "no risk of going back to the old 65 rig"): the body drawn is the 106-joint Minotaur, src/assets/minotaur-106.glb
// (data/rig.json files). The 65 files (minotaur.glb, the Centurion's veteran.glb and both carriers-*.glb kits) stay in src/assets for the
// tests and the bakes but are never shipped (data/build.json notShipped). ?foe=v1 (V1's Centurion body) and ?shield=v1 (the 65 scutum kit)
// are gone; ?pitborn=v1 is a behaviour toggle on the same 106 body (foe-pick.ts). One body per opponent: the page picks nothing here.
/** opponent id -> the body drawn in its place (its 65 stem under src/assets, which data/rig.json `files` maps to the 106 file drawn). */
// `kit: null`: no kit drawn at all (Dom 2026-10-26: "remove the Minotaur's shield"). Visual only: the sim still fights him with the scutum's
// guard (moves.ts LOADOUT_FROM), so Gate 0 is untouched. The 106 body bakes no weapon: whatever he fights with is grafted at fk_socket_hand_r
// from its equip file (scene.ts).
import { foeRigFile } from './rig-bones.ts';   // data/rig.json (106 only): the drawn body's 106 file
type BodyRow = { body: string; kit: string | null };
const BODIES: Readonly<Record<string, BodyRow>> = {
  pitborn: { body: 'minotaur', kit: null },
  veteran: { body: 'minotaur', kit: null },
};

/** @deprecated Reads no query any more (?foe=v1 and ?shield=v1 were removed with the 65 bodies); always false. Kept so old callers compile. */
export const chooseFoeBody = (_search?: string): boolean => false;
/** The rig file stem drawn for `id` whose roster body is `rosterBody`: the body row's body on its 106 file ('minotaur-106').
 *  `stem`: the body row's 65 stem instead ('minotaur'), the name the bone and ragdoll rows key by; it is only a name: the page's loader
 *  table (scene.ts fighterUrls) holds the 106 files alone, so a 65 stem can never be fetched. */
export const foeBodyFile = (id: string, rosterBody: string, stem = false): string => ((s: string) => stem ? s : foeRigFile(s))(BODIES[id]?.body || rosterBody);
/** The kit file stem for `id` (under src/assets/loot), or null for none: the body row's (none on the Minotaur), `carriers-<id>` as V1 has it otherwise. */
export const foeKitFile = (id: string): string | null => {
  const row = BODIES[id];
  return row ? row.kit : `carriers-${id}`;
};
/** The weapon `id`'s drawn body bakes in his hand: none on a swapped (106) body, whose weapon is grafted at the socket; his roster weapon (`rosterWeapon`) otherwise. */
export const foeBakedWeapon = (id: string, rosterWeapon: string): string => (BODIES[id] ? '' : rosterWeapon);
/** Whether `id` draws a body other than his V1 one (his rank-look files are fitted to the V1 body, so they stay off). */
export const foeBodySwapped = (id: string): boolean => !!BODIES[id];
