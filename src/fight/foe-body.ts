// V3 (Dom 2026-10-26): Mixamo's Minotaur is the opponent's body (since Dom's later call that day he fights as V1's Pitborn: foe-pick.ts, the
// `pitborn` row below; what follows describes the Centurion, ?pitborn=v1's fight). Strategy ruled that only the body changes: he is still the Centurion (id
// `veteran`) to the sim, the AI, his specials (Shield Quake), stats, level and weapons (gladius + scutum), so Gate 0 is untouched.
// src/assets/minotaur.glb is the Centurion's veteran.glb (65 joints, all 39 clips byte for byte, weapon sockets) with the Minotaur's mesh on it
// (scripts/foe-body/build-minotaur.sh). His kit is cut to the scutum (src/assets/loot/carriers-minotaur.glb): the Centurion's armour is
// shaped for the Centurion's body. ?foe=v1 draws the Centurion exactly (veteran.glb, his whole kit, his rank looks). The page picks once,
// before the rigs load, and only the body picked is fetched.
/** opponent id -> the body drawn by default in its place (rig file stem under src/assets, kit file stem under src/assets/loot). */
// `kit: null`: no kit drawn at all (Dom 2026-10-26: "remove the Minotaur's shield"). Visual only: the sim still fights him with the scutum's
// guard (moves.ts LOADOUT_FROM), so Gate 0 is untouched. ?shield=v1 = his scutum-only kit back.
// `bakes`: the weapon the body file carries in its hand (minotaur.glb is veteran.glb's rig, so the trident); any other weapon is grafted from its
// equip file (scene.ts). Dom 2026-10-26, later: the opponent fights as V1's Pitborn (foe-pick.ts) in the Minotaur's body: no shield, no kit, his
// cleaver grafted over the trident (no shield arm). The `veteran` row is ?pitborn=v1's fight: the Centurion drawn as the Minotaur.
import { foeRigFile } from './rig-bones.ts';   // ?foerig=65|106 (data/rig.json default): which rig the drawn body is
type BodyRow ={ body: string; kit: string | null; shieldKit: string | null; bakes: string };
const BODIES: Readonly<Record<string, BodyRow>> = {
  pitborn: { body: 'minotaur', kit: null, shieldKit: null, bakes: 'trident' },
  veteran: { body: 'minotaur', kit: null, shieldKit: 'carriers-minotaur', bakes: 'trident' },
};

let v1 = false, shield = false;
/** ?foe=v1 → every opponent draws his V1 body; anything else → the BODIES row. Returns whether the V1 bodies were picked. */
export function chooseFoeBody(search: string): boolean {
  const q = new URLSearchParams(search);
  v1 = q.get('foe') === 'v1';
  shield = q.get('shield') === 'v1';
  return v1;
}
/** The rig file stem drawn for `id` whose roster body is `rosterBody` ('minotaur' for the Centurion by default, 'veteran' under ?foe=v1).
 *  Rig swap (rig-bones.ts): under ?foerig=106 (or a 106 default) a body with a 106 file draws it ('minotaur-106'); `rig65` = the 65 file regardless (the load's fallback). */
export const foeBodyFile = (id: string, rosterBody: string, rig65 = false): string => ((stem: string) => rig65 ? stem : foeRigFile(stem))((!v1 && BODIES[id]?.body) || rosterBody);
/** The kit file stem for `id` (under src/assets/loot), or null for none: the new body's row (?shield=v1 its shield kit), `carriers-<id>` as V1 has it otherwise. */
export const foeKitFile = (id: string): string | null => {
  const row = v1 ? undefined : BODIES[id];
  return row ? (shield ? row.shieldKit : row.kit) : `carriers-${id}`;
};
/** The weapon `id`'s drawn body bakes in his hand: the row's for a swapped body, his roster weapon (`rosterWeapon`) otherwise. */
export const foeBakedWeapon = (id: string, rosterWeapon: string, rig65 = false): string => {
  const row = v1 ? undefined : BODIES[id];
  if (row && !rig65 && foeRigFile(row.body) !== row.body) return '';   // a 106 body file (minotaur-106) bakes no weapon: whatever he fights with is grafted at fk_socket_hand_r
  return row?.bakes || rosterWeapon;
};
/** Whether `id` draws a body other than his V1 one (his rank-look files are fitted to the V1 body, so they stay off). */
export const foeBodySwapped = (id: string): boolean => !v1 && !!BODIES[id];
