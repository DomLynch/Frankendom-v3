// The world follow camera (the walk, every zone): behind and above the hero, easing toward its eye, looking a little ahead. It used to live inline in
// origins/preview/main.ts with Zone 1's passage hard-coded; now a zone only supplies PARAMETERS (a passage box where the camera tightens, or none).
// Nothing zone-shaped lives here: the passage (bounds AND its tighter back/up) is data the zone passes, none for a zone without one (Zone 2). The open walk's 5.2 / 2.7 is the generic default
// (Zone 1's numbers before the move, so no behaviour change). The right stick's pitch lowers the eye and raises the gaze.
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

const OPEN: Framing = { back: 5.2, up: 2.7 }, AHEAD = 3, LOOK_Y = 1.5;

export const inPassage = (p: Passage | undefined, x: number, z: number): boolean => !!p && z < p.zMax && z > p.zMin && (p.halfWidth === undefined || Math.abs(x) < p.halfWidth);

export function createFollowCamera(camera: THREE.Camera, opts: { passage?: Passage; open?: Framing } = {}) {
  const eye = new THREE.Vector3(), look = new THREE.Vector3(), at = new THREE.Vector3(0, 2.6, 8);
  let snap = true, passage = opts.passage;
  let open = opts.open ?? OPEN;
  return {
    /** The next frame starts at the eye, not easing from the old position (a respawn, a server placement, the first frame). */
    snap(): void { snap = true; },
    /** Another open-walk framing from now on (a preset), or the generic one. */
    setOpen(f: Framing | undefined): void { open = f ?? OPEN; },
    /** A zone's passage (or none) for the frames from now on. */
    setPassage(p: Passage | undefined): void { passage = p; },
    update(dt: number, s: FollowState): void {
      const t = passage && inPassage(passage, s.x, s.z) ? passage : open, up = t.up - s.pitch * 0.9;   // the right stick's up lowers the camera and raises the gaze
      const side = (t as Framing).side ?? 0, ahead = (t as Framing).ahead ?? AHEAD, lookY = (t as Framing).lookY ?? LOOK_Y;   // right of the hero's heading is (cos h, -sin h)
      eye.set(s.x - Math.sin(s.heading) * t.back + Math.cos(s.heading) * side, up + s.groundY, s.z - Math.cos(s.heading) * t.back - Math.sin(s.heading) * side);
      if (snap) { at.copy(eye); snap = false; } else at.lerp(eye, 1 - Math.exp(-dt * 4));
      look.set(s.x + Math.sin(s.heading) * ahead, lookY + s.pitch * 1.6 + s.groundY, s.z + Math.cos(s.heading) * ahead);
      camera.position.copy(at); camera.lookAt(look);
    },
  };
}
