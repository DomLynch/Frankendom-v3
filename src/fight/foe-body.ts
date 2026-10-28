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
// The body is a DATA ROW (Dom 2026-10-27, docs/BOSS-BODIES.md): data/profiles.json `body` per profile (its `opponent`), `defaultBody` (the Minotaur) otherwise, checked against
// data/rig.json by src/sim/validate.js checkBodies. ?<profiles.bodyQuery>=<body> (?boss=psyche) swaps it for the page (setBossBody, main.ts). The kit is still none for every body.
import PROFILES from '../../data/profiles.json' with { type: 'json' };
import RIG from '../../data/rig.json' with { type: 'json' };
import { bodyProblem, checkBodies } from '../sim/validate.js';
import { heroBodyFile } from './hero-body-rows.ts';   // the hero's stem: a boss cannot share it (validate.js bodyProblem)
type BodyRow = { body: string; kit: string | null };
const rowErrors: string[] = checkBodies(PROFILES, RIG, heroBodyFile());
if (rowErrors.length) throw new Error(`data/profiles.json bodies: ${rowErrors.join('; ')}`);
// opponent id -> body stem: the profile rows' (the veteran, ?pitborn=v1's Centurion, has no profile row: the default body)
const PROFILE_BODY: Record<string, string> = { veteran: PROFILES.defaultBody, ...Object.fromEntries(PROFILES.profiles.map((p: { opponent: string; body?: string }) => [p.opponent, p.body ?? PROFILES.defaultBody])) };
let override: string | null = null;   // ?boss=<body>
const rowOf = (id: string): BodyRow | undefined => (id in PROFILE_BODY ? { body: override ?? PROFILE_BODY[id]!, kit: null } : undefined);
/** ?boss=<body> (data/profiles.json bodyQuery): this page draws every boss in `body`, a data/rig.json files key with clips. A bad value is ignored with a console warning (never throws). Returns the body now in force, or null for the rows' own. */
export function setBossBody(search: string, warn: (m: string) => void = (m) => console.warn(m), rig: typeof RIG = RIG, hero: string = heroBodyFile()): string | null {   // rig, hero: the rows (tests pass others)
  const raw = new URLSearchParams(search).get(PROFILES.bodyQuery);
  override = null;
  if (raw === null) return null;
  const why = bodyProblem(raw, rig, hero);
  if (why) warn(`?${PROFILES.bodyQuery}=${raw} ignored: ${why}`);
  else override = raw;
  return override;
}

/** @deprecated Reads no query any more (?foe=v1 and ?shield=v1 were removed with the 65 bodies); always false. Kept so old callers compile. */
export const chooseFoeBody = (_search?: string): boolean => false;
/** The rig file stem drawn for `id` whose roster body is `rosterBody`: the body row's body on its 106 file ('minotaur-106').
 *  `stem`: the body row's 65 stem instead ('minotaur'), the name the bone and ragdoll rows key by; it is only a name: the page's loader
 *  table (scene.ts fighterUrls) holds the 106 files alone, so a 65 stem can never be fetched. */
export const foeBodyFile = (id: string, rosterBody: string, stem = false): string => ((s: string) => stem ? s : foeRigFile(s))(rowOf(id)?.body || rosterBody);
/** The 106 file stem a zone spawn of `id` draws: the spawn row's own `body` (data/zones `spawns[].body`, a data/rig.json files stem) when it has one, else exactly `foeBodyFile` (its kind's profile body).
 *  ?boss=<body> still draws every boss in one body for the page. This is the key of the scene's rig cache (scene.ts bodyRigs). */
export const spawnBodyFile = (id: string, rosterBody: string, spawnBody?: string): string => {
  if (override !== null) return foeBodyFile(id, rosterBody);
  if (spawnBody !== undefined) return foeRigFile(spawnBody);
  // A zone spawn's `kind` is a PROFILE id (gargantua, arachne), not an opponent id (executioner, shieldmaiden): PROFILE_BODY above is keyed by opponent, so look the profile row up by id first.
  const own = (PROFILES.profiles as { id: string; body?: string }[]).find((p) => p.id === id);
  return own ? foeRigFile(own.body ?? PROFILES.defaultBody) : foeBodyFile(id, rosterBody);
};
/** Problems with the per-spawn bodies of a zone's spots (empty = fine): each must pass the same check a profile body does (a rig.json files row with clips106 folder, not the hero's body). */
export const spotBodyProblems = (spots: readonly { id: string; body?: string }[], rig: typeof RIG = RIG, hero: string = heroBodyFile()): string[] =>
  spots.flatMap((s) => { const why = s.body === undefined ? null : bodyProblem(s.body, rig, hero); return why ? [`spawn ${s.id} body: ${why}`] : []; });
/** The kit file stem for `id` (under src/assets/loot), or null for none: the body row's (none on the Minotaur), `carriers-<id>` as V1 has it otherwise. */
export const foeKitFile = (id: string): string | null => {
  const row = rowOf(id);
  return row ? row.kit : `carriers-${id}`;
};
/** The weapon `id`'s drawn body bakes in his hand: none on a swapped (106) body, whose weapon is grafted at the socket; his roster weapon (`rosterWeapon`) otherwise. */
export const foeBakedWeapon = (id: string, rosterWeapon: string): string => (rowOf(id) ? '' : rosterWeapon);
/** Whether `id` draws a body other than his V1 one (his rank-look files are fitted to the V1 body, so they stay off). */
export const foeBodySwapped = (id: string): boolean => !!rowOf(id);
