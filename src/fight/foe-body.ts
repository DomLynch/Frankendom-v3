// V3 (Dom 2026-10-26): Mixamo's Minotaur is the opponent's body. Strategy ruled that only the body changes: he is still the Centurion (id
// `veteran`) to the sim, the AI, his specials (Shield Quake), stats, level and weapons (gladius + scutum), so Gate 0 is untouched.
// src/assets/minotaur.glb is the Centurion's veteran.glb (65 joints, all 39 clips byte for byte, weapon sockets) with the Minotaur's mesh on it
// (scripts/foe-body/build-minotaur.sh). His kit is cut to the scutum (src/assets/loot/carriers-minotaur.glb): the Centurion's armour is
// shaped for the Centurion's body. ?foe=v1 draws the Centurion exactly (veteran.glb, his whole kit, his rank looks). The page picks once,
// before the rigs load, and only the body picked is fetched.
/** opponent id -> the body drawn by default in its place (rig file stem under src/assets, kit file stem under src/assets/loot). */
const BODIES: Readonly<Record<string, { body: string; kit: string }>> = { veteran: { body: 'minotaur', kit: 'carriers-minotaur' } };

let v1 = false;
/** ?foe=v1 → every opponent draws his V1 body; anything else → the BODIES row. Returns whether the V1 bodies were picked. */
export function chooseFoeBody(search: string): boolean {
  v1 = new URLSearchParams(search).get('foe') === 'v1';
  return v1;
}
/** The rig file stem drawn for `id` whose roster body is `rosterBody` ('minotaur' for the Centurion by default, 'veteran' under ?foe=v1). */
export const foeBodyFile = (id: string, rosterBody: string): string => (!v1 && BODIES[id]?.body) || rosterBody;
/** The kit file stem for `id` (under src/assets/loot): the cut kit with the new body, `carriers-<id>` as V1 has it otherwise. */
export const foeKitFile = (id: string): string => (!v1 && BODIES[id]?.kit) || `carriers-${id}`;
/** Whether `id` draws a body other than his V1 one (his rank-look files are fitted to the V1 body, so they stay off). */
export const foeBodySwapped = (id: string): boolean => !v1 && !!BODIES[id];
