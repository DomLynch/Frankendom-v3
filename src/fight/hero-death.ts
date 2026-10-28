// The hero's death and respawn loop (data/hero-death.json; Dom 2026-10-28: 'hero death and respawn, get that sorted'). Pure rules and the validator; the page (src/client/main.ts) wires them,
// the scene builds the death-only ragdoll (ragdoll.ts heroRagdollFor) and the camera rig plays the death cam (camera.ts setDeathCam). Presentation only: the sim stays stopped at the kill.
// ?herodeath=v1, the row off and ?postkill=v1 (no zone) = null: the Death-clip fall, 'You died' and the automatic stand-up as before.
import ROWS from '../../data/hero-death.json' with { type: 'json' };

export type DeathCamRows = { seconds: number; pullBackMetres: number; riseMetres: number; orbitDegrees: number; releaseSeconds: number; lookY: number };
export type HeroDeathRows = {
  on: boolean; query: string; off: string; ragdoll: boolean; line: string; button: string; keys: string[];
  respawn: { minSeconds: number; autoSeconds: number };   // the Respawn button and keys work from minSeconds after the death; he stands up by himself at autoSeconds
  cam: DeathCamRows;
};
type Range = [number, number];
export type HeroDeathLimits = Record<'minSeconds' | 'autoSeconds' | 'seconds' | 'pullBackMetres' | 'riseMetres' | 'orbitDegrees' | 'releaseSeconds' | 'lookY', Range>;
type Shipped = HeroDeathRows & { limits: HeroDeathLimits };
const SHIPPED = ROWS as unknown as Shipped;

/** Throws on a bad row (a value outside its range, a word that is not one, a respawn that cannot happen, a camera longer than the wait). */
export function validateHeroDeath(rows: Shipped): void {
  const inside = (name: string, v: unknown, [lo, hi]: Range) => { if (!(typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi)) throw new Error(`hero-death.json ${name} ${String(v)} is not in ${lo}..${hi}`); };
  const lim = rows.limits;
  inside('respawn.minSeconds', rows.respawn.minSeconds, lim.minSeconds);
  inside('respawn.autoSeconds', rows.respawn.autoSeconds, lim.autoSeconds);
  for (const k of ['seconds', 'pullBackMetres', 'riseMetres', 'orbitDegrees', 'releaseSeconds', 'lookY'] as const) inside(`cam.${k}`, rows.cam[k], lim[k]);
  if (typeof rows.on !== 'boolean' || typeof rows.ragdoll !== 'boolean') throw new Error('hero-death.json on and ragdoll are true or false');
  if (!rows.query || !rows.off) throw new Error('hero-death.json query and off are words');
  if (!rows.line || !rows.button) throw new Error('hero-death.json line and button are words');
  if (!Array.isArray(rows.keys) || rows.keys.some((k) => typeof k !== 'string' || !k)) throw new Error('hero-death.json keys are KeyboardEvent codes');
  if (rows.respawn.minSeconds > rows.respawn.autoSeconds) throw new Error(`hero-death.json respawn.minSeconds ${rows.respawn.minSeconds} is longer than autoSeconds ${rows.respawn.autoSeconds}`);
  if (rows.cam.seconds > rows.respawn.autoSeconds) throw new Error(`hero-death.json cam.seconds ${rows.cam.seconds} is longer than respawn.autoSeconds ${rows.respawn.autoSeconds}`);
}

/** The rows this page plays: null when there is no zone loop (`zone` false: ?postkill=v1), the row is off, or the link says ?herodeath=v1. Throws on a bad row. */
export function heroDeathFor(zone: boolean, search = '', rows: Shipped = SHIPPED): HeroDeathRows | null {
  validateHeroDeath(rows);
  if (!zone || !rows.on || new URLSearchParams(search).get(rows.query) === rows.off) return null;
  return rows;
}

/** Is the scene to build the death-only hero ragdoll? (The page tells the scene; ?feel=hero builds its own, with hit reactions.) */
export const wantsRagdoll = (rows: HeroDeathRows | null): boolean => !!rows && rows.ragdoll;

/** `sinceDeath` seconds into the death: may a tap or key stand him up now (the button shows)? */
export const respawnReady = (rows: HeroDeathRows, sinceDeath: number): boolean => sinceDeath >= rows.respawn.minSeconds;

/** Does he stand up this frame: he asked and it is allowed, or nobody did and the wait is over. */
export const respawnDue = (rows: HeroDeathRows, sinceDeath: number, asked: boolean): boolean => (asked && respawnReady(rows, sinceDeath)) || sinceDeath >= rows.respawn.autoSeconds;

/** Does this key stand him up? (KeyboardEvent.code, a row's list.) */
export const respawnKey = (rows: HeroDeathRows, code: string): boolean => rows.keys.includes(code);

/** The death camera's share 0..1: it rises over `cam.seconds` while he lies dead, and eases away over `cam.releaseSeconds` once he stands (the share is linear in time; the camera smooths it). */
export function deathCamStep(cam: DeathCamRows, share: number, dying: boolean, dt: number): number {
  return dying ? Math.min(1, share + dt / cam.seconds) : Math.max(0, share - dt / cam.releaseSeconds);
}

/** Where the death camera stands: the camera's own place round the fallen hero pulled back, raised and turned by `share` (smoothstepped). `from` is where the camera would have been, `at` the hero. */
export function deathCamPose(cam: DeathCamRows, share: number, from: { x: number; y: number; z: number }, at: { x: number; z: number }): { x: number; y: number; z: number; lookY: number; k: number } {
  const k = share * share * (3 - 2 * share), dx = from.x - at.x, dz = from.z - at.z;
  const r = Math.hypot(dx, dz) + cam.pullBackMetres * k, angle = Math.atan2(dx, dz) + (cam.orbitDegrees * Math.PI / 180) * k;
  return { x: at.x + Math.sin(angle) * r, y: from.y + cam.riseMetres * k, z: at.z + Math.cos(angle) * r, lookY: cam.lookY, k };
}
