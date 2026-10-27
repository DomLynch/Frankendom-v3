// The zone's free follow camera (Dom 2026-10-27, live: "after the kill shot the camera should go into the normal free mode so I can move around freely"; Strategy: V3 is one endless
// open world and the camera follows the hero ALWAYS). V1 had no lock in its open world: origins/preview/main.ts + follow-camera.ts put the camera behind the hero, a one-finger drag on
// empty ground looked round, and a fight eased a combat framing in and out. Here the same camera is the existing fight camera (camera.ts cameraPose: same height, distance, shoulder, zoom)
// aimed at a point a fixed gap AHEAD of the hero along the view yaw instead of at a boss, so nothing in it is a lock on a corpse. Pure rules; every number is a row (data/respawn.json freeCamera).
// ?postkill=v1 (no zone) and ?freecam=v1 never build these rows: the camera is the lock exactly as it was.
import ROWS from '../../data/respawn.json' with { type: 'json' };
import { wrapAngle } from './sim.ts';

export type FreeCameraRows = {
  on: boolean; query: string; off: string;
  gapMetres: number;           // how far ahead of the hero the camera's virtual foe stands: the pit's own start gap, so the frame is the fight camera's at the start of a fight
  handOverSeconds: number;     // the swing between the lock / finisher camera and this one, in either direction
  swingTailSeconds: number;    // seconds the hand-over swing goes on after the share stops moving, so the camera arrives
  swingRate: number;           // the swing's pull: the camera closes 1 - exp(-dt * swingRate / handOverSeconds) of the way to its place each frame
  stickEndsCeremony: boolean;  // any stick input after the kill hands him control at once (the ceremony no longer holds him for startAfterSeconds)
  fight: 'pair' | 'follow';    // pair: a fight frames the hero and the boss from behind the hero (the lock, anchored on him); follow: the free camera even in a fight
};
export type FreeCameraLimits = { gapMetres: [number, number]; handOverSeconds: [number, number]; swingTailSeconds: [number, number]; swingRate: [number, number] };

/** Throws on a bad free-camera row. */
export function validateFreeCamera(rows: FreeCameraRows, limits: FreeCameraLimits): void {
  const inside = (name: string, v: number, [lo, hi]: [number, number]) => { if (!(Number.isFinite(v) && v >= lo && v <= hi)) throw new Error(`respawn.json freeCamera.${name} ${v} is not in ${lo}..${hi}`); };
  inside('gapMetres', rows.gapMetres, limits.gapMetres);
  inside('handOverSeconds', rows.handOverSeconds, limits.handOverSeconds);
  inside('swingTailSeconds', rows.swingTailSeconds, limits.swingTailSeconds);
  inside('swingRate', rows.swingRate, limits.swingRate);
  if (typeof rows.on !== 'boolean' || typeof rows.stickEndsCeremony !== 'boolean') throw new Error('respawn.json freeCamera.on and stickEndsCeremony are true or false');
  if (rows.fight !== 'pair' && rows.fight !== 'follow') throw new Error(`respawn.json freeCamera.fight "${rows.fight}" is "pair" or "follow"`);
  if (!rows.query || !rows.off) throw new Error('respawn.json freeCamera.query and off are words');
}

type Shipped = { freeCamera: FreeCameraRows; limits: { freeCamGapMetres: [number, number]; handOverSeconds: [number, number]; swingTailSeconds: [number, number]; swingRate: [number, number] } };
const SHIPPED = ROWS as unknown as Shipped;

/** The rows this page plays: null when the zone loop is off (`zone` false: ?postkill=v1), the row is off, or the link says `?freecam=v1`. Throws on a bad row. */
export function freeCameraFor(zone: boolean, search = '', rows: Shipped = SHIPPED): FreeCameraRows | null {
  validateFreeCamera(rows.freeCamera, { gapMetres: rows.limits.freeCamGapMetres, handOverSeconds: rows.limits.handOverSeconds, swingTailSeconds: rows.limits.swingTailSeconds, swingRate: rows.limits.swingRate });
  if (!zone || !rows.freeCamera.on || new URLSearchParams(search).get(rows.freeCamera.query) === rows.freeCamera.off) return null;
  return rows.freeCamera;
}

/** What the page knows this frame. `ceremonyOver`: the kill's finisher has finished playing, or startAfterSeconds is up. `engaged`: a boss is fighting him. */
export type CameraWorld = { finished: boolean; heroStands: boolean; ceremonyOver: boolean; roaming: boolean; engaged: boolean };

/** Whether the camera follows the hero freely this frame: after a kill once he walks or the ceremony is over, and while nobody fights him. Never while his own death plays. A fight is framed by the lock unless the row says `follow`. */
export const wantsFreeCamera = (rows: FreeCameraRows | null, w: CameraWorld): boolean => {
  if (!rows) return false;
  if (w.finished) return w.heroStands && (w.roaming || w.ceremonyOver);
  return rows.fight === 'follow' || !w.engaged;
};

/** Whether the stick takes the hero's body now: after the kill the ceremony hands him over (finished, or startAfterSeconds), or any stick input does when the row says so. */
export const handsOver = (rows: FreeCameraRows | null, ceremonyOver: boolean, stick: boolean): boolean => stick && (ceremonyOver || !!rows?.stickEndsCeremony);

/** The share of the free camera (0 = the lock, 1 = free), moved toward its target over `seconds`. `first` snaps (the first frame has nothing to swing from). */
export const stepShare = (share: number, target: boolean, dt: number, seconds: number, first: boolean): number =>
  first ? (target ? 1 : 0) : Math.min(1, Math.max(0, share + (target ? dt : -dt) / seconds));

/** Where the camera's virtual foe stands: `gap` metres ahead of the hero, opposite the camera (the lock puts the camera behind the hero, away from the foe). */
export const virtualFoe = (hero: { x: number; z: number }, yaw: number, gap: number): { x: number; z: number } => ({ x: hero.x - Math.sin(yaw) * gap, z: hero.z - Math.cos(yaw) * gap });

/** `from` moved `k` (0..1) toward `to`, on the arc around `about` (angle and radius, then height) so a swing from one side of the hero to the other goes round him, never through him. */
export function swingAround(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, about: { x: number; z: number }, k: number): { x: number; y: number; z: number } {
  const fx = from.x - about.x, fz = from.z - about.z, tx = to.x - about.x, tz = to.z - about.z, fr = Math.hypot(fx, fz), tr = Math.hypot(tx, tz);
  if (fr < 1e-6 || tr < 1e-6) return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, z: from.z + (to.z - from.z) * k };
  const a = Math.atan2(fx, fz) + wrapAngle(Math.atan2(tx, tz) - Math.atan2(fx, fz)) * k, r = fr + (tr - fr) * k;
  return { x: about.x + Math.sin(a) * r, y: from.y + (to.y - from.y) * k, z: about.z + Math.cos(a) * r };
}

/** The view yaw that puts the camera directly behind a hero facing `heading` (the recenter button). */
export const yawBehind = (heading: number): number => wrapAngle(heading + Math.PI);
