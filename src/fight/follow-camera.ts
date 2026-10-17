// The world follow camera (the walk, every zone): behind and above the hero, easing toward its eye, looking a little ahead. It used to live inline in
// origins/preview/main.ts with Zone 1's passage hard-coded; now a zone only supplies PARAMETERS (a passage box where the camera tightens, or none).
// Nothing zone-shaped lives here: the passage (bounds AND its tighter back/up) is data the zone passes, none for a zone without one (Zone 2). The open walk's 5.2 / 2.7 is the generic default
// (Zone 1's numbers before the move, so no behaviour change). The right stick's pitch lowers the eye and raises the gaze.
import { cameraRule } from './camera-rules.ts';
import * as THREE from 'three';

/** Where the camera tightens to stay under a vault: the hero inside z in (zMin, zMax) and, when `halfWidth` is set, |x| < halfWidth; there the camera sits `back` behind and `up` above. */
export type Passage = { zMax: number; zMin: number; halfWidth?: number; back: number; up: number };
/** How far behind and above the hero the eye sits; `side` slides it to his right shoulder (m, 0 = dead behind), `ahead` is how far in front of him the gaze lands, `lookY` the height it looks at. */
export type Framing = { back: number; up: number; side?: number; ahead?: number; lookY?: number };
/** A zone's named framings (camera.presets in its row), e.g. a = over the shoulder, b = the fight frame. */
export type Presets = Readonly<Record<string, Framing>>;

/** The framing a page asks for: `choice` (a ?camera= name) wins, else the zone's own `camera.preset`; unknown or empty = the generic open walk (undefined). */
export const pickFraming = (presets: Presets | undefined, choice: string | null | undefined, zonePreset?: string): Framing | undefined => presets?.[(choice || zonePreset || '').toLowerCase()];
export type FollowState = { x: number; z: number; heading: number; pitch: number; groundY: number };
/** What a fight changes on top of a Framing (a zone's `camera.combat`, Dom 2026-10-17: the thumb buttons hide the hero and the foe is too close). mid: how far the gaze moves from the hero toward the foe (0 = as walking, 0.5 = between them);
 *  perSep / perSize: extra metres back per metre between them / per metre the foe's biggest dimension is above a man's; shiftY: the share of the screen height the picture is lifted, off the thumb buttons; fov: degrees added; zoom: a multiplier on the camera's own zoom. */
export type CombatFraming = Framing & { mid?: number; perSep?: number; perSize?: number; sizeFrom?: number; fitRate?: number; minBack?: number; maxBack?: number; shiftY?: number; fov?: number; zoom?: number };   // sizeFrom: the foe size (m) above which perSize starts, a man's height in the rows; fitRate: the most the fit (perSep, perSize) may change per second (m/s), so a lunging foe does not pump the zoom; minBack / maxBack: the camera never stands closer / further than this behind the hero, and a capped distance raises the camera instead (pitch), never into the foe or past a wall
/** One combat camera: its framing for a phone held upright and held wide, how fast it eases in and out (rates per second; the exit is slower so a kill does not snap the view), and (when `zoom` is set) the steps the player may pick between, a multiplier on back and up. */
export type CombatCam = { label: string; portrait: CombatFraming; landscape: CombatFraming; ease: { in: number; out: number }; zoom?: { steps: readonly number[]; labels: readonly string[]; start: number } };
/** The fight, per frame: the camera in use, the screen shape, the foe (where it is and its biggest dimension in metres; null = no fight), the player's zoom step and the shoulder side (1 = the framing's own, -1 = mirrored; a setting, never auto-switched). */
export type CombatInput = { cam: CombatCam; portrait: boolean; foe: { x: number; z: number; size: number } | null; zoom?: number; flip?: number };
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

const OPEN: Framing = { back: 5.2, up: 2.7 }, AHEAD = cameraRule('followAhead'), LOOK_Y = cameraRule('followLookY');

export const inPassage = (p: Passage | undefined, x: number, z: number): boolean => !!p && z < p.zMax && z > p.zMin && (p.halfWidth === undefined || Math.abs(x) < p.halfWidth);

export function createFollowCamera(camera: THREE.Camera, opts: { passage?: Passage; open?: Framing } = {}) {
  const eye = new THREE.Vector3(), look = new THREE.Vector3(), at = new THREE.Vector3(0, 2.6, 8);
  let snap = true, passage = opts.passage, fight = 0, fitNow = 0;   // fight: 0 walking .. 1 in a fight, eased; fitNow: the foe-size and gap fit in metres, rate-limited
  let open = opts.open ?? OPEN;
  const view = { shiftY: 0, fov: 0, zoom: 1 };   // what the page applies to its camera this frame (the follow camera only places it)
  return {
    /** The fight's extras this frame: the page lifts the picture by shiftY of the screen height, adds fov degrees and multiplies its zoom. All 0 / 0 / 1 outside a fight. */
    view,
    /** 0 (walking) .. 1 (fighting): how far the camera has eased into the combat framing. */
    fighting: (): number => fight,
    /** The next frame starts at the eye, not easing from the old position (a respawn, a server placement, the first frame). */
    snap(): void { snap = true; },
    /** Another open-walk framing from now on (a preset), or the generic one. */
    setOpen(f: Framing | undefined): void { open = f ?? OPEN; },
    /** A zone's passage (or none) for the frames from now on. */
    setPassage(p: Passage | undefined): void { passage = p; },
    update(dt: number, s: FollowState, combat?: CombatInput): void {
      const t = passage && inPassage(passage, s.x, s.z) ? passage : open;
      const goal = combat?.foe ? 1 : 0;
      if (combat) fight += (goal - fight) * (1 - Math.exp(-dt * (goal > fight ? combat.cam.ease.in : combat.cam.ease.out)));   // eased in and out, never a cut; the exit is slower than the entry
      if (fight < 1e-3) fight = 0;
      const c = combat && fight > 0 ? (combat.portrait ? combat.cam.portrait : combat.cam.landscape) : undefined;
      const sep = combat?.foe ? Math.hypot(combat.foe.x - s.x, combat.foe.z - s.z) : 0, size = Math.max(0, (combat?.foe?.size ?? 0) - (c?.sizeFrom ?? 0)), zoomK = combat?.zoom ?? 1;
      const fitGoal = c ? (c.perSep ?? 0) * sep + (c.perSize ?? 0) * size : 0;   // what the gap and the foe's size ask for
      fitNow = c?.fitRate !== undefined ? fitNow + Math.max(-c.fitRate * dt, Math.min(c.fitRate * dt, fitGoal - fitNow)) : fitGoal;   // never faster than fitRate m/s
      const rawBack = c ? (c.back + fitNow) * zoomK : t.back, capped = c ? Math.min(c.maxBack ?? Infinity, Math.max(c.minBack ?? 0, rawBack)) : t.back;   // a floor: never into the foe; a cap: never past the wall
      const cBack = capped, cUp = c ? (c.up + fitNow * 0.5) * zoomK + Math.max(0, rawBack - capped) * 0.5 : t.up;   // what the cap took off the distance goes into height instead (a steeper look), the camera stays in the room
      const back = c ? mix(t.back, cBack, fight) : t.back, up = (c ? mix(t.up, cUp, fight) : t.up) - s.pitch * 0.9;   // the right stick's up lowers the camera and raises the gaze
      const side = c ? mix((t as Framing).side ?? 0, (c.side ?? 0) * (combat?.flip ?? 1), fight) : (t as Framing).side ?? 0, ahead = c ? mix((t as Framing).ahead ?? AHEAD, c.ahead ?? AHEAD, fight) : (t as Framing).ahead ?? AHEAD, lookY = c ? mix((t as Framing).lookY ?? LOOK_Y, c.lookY ?? LOOK_Y, fight) : (t as Framing).lookY ?? LOOK_Y;   // right of the hero's heading is (cos h, -sin h)
      eye.set(s.x - Math.sin(s.heading) * back + Math.cos(s.heading) * side, up + s.groundY, s.z - Math.cos(s.heading) * back - Math.sin(s.heading) * side);
      if (snap) { at.copy(eye); snap = false; } else at.lerp(eye, 1 - Math.exp(-dt * 4));
      let lx = s.x + Math.sin(s.heading) * ahead, lz = s.z + Math.cos(s.heading) * ahead;
      if (c && combat?.foe && c.mid) { const k = fight * c.mid; lx = mix(lx, mix(s.x, combat.foe.x, 0.5), k); lz = mix(lz, mix(s.z, combat.foe.z, 0.5), k); }   // the gaze moves toward the middle of the two, so both are in frame
      look.set(lx, lookY + s.pitch * 1.6 + s.groundY, lz);
      view.shiftY = c ? fight * (c.shiftY ?? 0) : 0; view.fov = c ? fight * (c.fov ?? 0) : 0; view.zoom = c ? mix(1, c.zoom ?? 1, fight) : 1;
      camera.position.copy(at); camera.lookAt(look);
    },
  };
}
