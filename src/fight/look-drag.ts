// The zone's look thumb (Dom 2026-10-27, on his phone: "we need the right thumb to be able to look left/right, rotate, while the left thumb is walking and moving, outside of combat").
// One finger dragging on the empty right-hand part of the screen turns the follow camera round the hero; the left stick keeps walking him relative to the camera (main.ts passes view.yaw to the
// move), so the two thumbs work at once. This module is the pure part: which pointer is the look finger, how far a drag turns the view, the dead zone that keeps a tap a tap (a tap on a corpse
// cuts it, ragdoll.listenTaps), and the glide after the finger lifts. Every number is a row (data/respawn.json look). The page decides WHEN it listens (the camera is free: nobody is fighting him).
import ROWS from '../../data/respawn.json' with { type: 'json' };

export type LookRows = {
  on: boolean; query: string; off: string;
  sensitivityDegPerPx: number;   // degrees of turn per pixel of horizontal drag
  deadzonePx: number;            // a drag shorter than this is a tap and turns nothing; past it the turn counts from where it crossed (no jump)
  minXShare: number;             // a TOUCH must start right of this share of the screen width (the left thumb's side belongs to the stick); a mouse or pen may start anywhere
  inertiaSeconds: number;        // the glide after the finger lifts decays with this time constant; 0 = it stops dead
  flingWindowMs: number;         // a finger that lifted this long after its last move is resting, not flinging: no glide
  flingSmoothing: number;        // how much of each move's turn rate enters the glide's rate (0..1; 1 = only the last move, so one jittery frame sets the fling; lower averages over the last few moves)
};
export type LookLimits = { sensitivityDegPerPx: [number, number]; deadzonePx: [number, number]; minXShare: [number, number]; inertiaSeconds: [number, number]; flingWindowMs: [number, number]; flingSmoothing: [number, number] };

/** Throws on a bad look row. */
export function validateLook(rows: LookRows, limits: LookLimits): void {
  for (const k of Object.keys(limits) as (keyof LookLimits)[]) {
    const v = rows[k] as number, [lo, hi] = limits[k];
    if (!(Number.isFinite(v) && v >= lo && v <= hi)) throw new Error(`respawn.json look.${k} ${v} is not in ${lo}..${hi}`);
  }
  if (typeof rows.on !== 'boolean') throw new Error('respawn.json look.on is true or false');
  if (!rows.query || !rows.off) throw new Error('respawn.json look.query and off are words');
}

type Shipped = { look: LookRows; limits: { lookSensitivityDegPerPx: [number, number]; lookDeadzonePx: [number, number]; lookMinXShare: [number, number]; lookInertiaSeconds: [number, number]; lookFlingWindowMs: [number, number]; lookFlingSmoothing: [number, number] } };
const SHIPPED = ROWS as unknown as Shipped;

/** The rows this page plays: null when the zone has no free camera (`free` false), the row is off, or the link says `?look=off`. Throws on a bad row. */
export function lookFor(free: boolean, search = '', rows: Shipped = SHIPPED): LookRows | null {
  const l = rows.limits;
  validateLook(rows.look, { sensitivityDegPerPx: l.lookSensitivityDegPerPx, deadzonePx: l.lookDeadzonePx, minXShare: l.lookMinXShare, inertiaSeconds: l.lookInertiaSeconds, flingWindowMs: l.lookFlingWindowMs, flingSmoothing: l.lookFlingSmoothing });
  if (!free || !rows.look.on || new URLSearchParams(search).get(rows.look.query) === rows.look.off) return null;
  return rows.look;
}

/** Radians of view turn for a horizontal drag of `dx` pixels (positive = the finger moved right; the camera rig turns its yaw the other way, as the old drag did). */
export const turnOf = (rows: LookRows, dx: number): number => (dx * rows.sensitivityDegPerPx * Math.PI) / 180;

/** Whether a press at `x` (of a screen `width` wide, by a `kind` of pointer) may start the look: a touch must be right of minXShare. */
export const startsLook = (rows: LookRows, x: number, width: number, kind: string): boolean => kind !== 'touch' || (width > 0 && x >= width * rows.minXShare);

/**
 * The look finger. One pointer id at a time; every other pointer (the stick's thumb, a button press) is never seen here. Times are milliseconds (event.timeStamp).
 * `move` returns the radians to turn now; `step` returns the glide's radians for a frame; `cancel` drops the finger and the glide (a fight starts, the page pauses).
 */
export function createLook(rows: LookRows) {
  let id: number | null = null, startX = 0, lastX = 0, lastT = 0, past = false, v = 0, seeded = false;   // v: the smoothed turn rate of the recent moves in radians per second (seeded: it has a first move)
  let glide = 0;                                                                         // radians per second left after the finger lifted
  const stop = () => { id = null; past = false; v = 0; seeded = false; };
  return {
    get active(): number | null { return id; },
    get gliding(): boolean { return Math.abs(glide) > 1e-4; },
    /** A press: true when this finger became the look finger. */
    down(pointer: number, x: number, width: number, kind: string, t: number): boolean {
      if (id !== null || !startsLook(rows, x, width, kind)) return false;
      id = pointer; startX = lastX = x; lastT = t; past = false; v = 0; seeded = false; glide = 0;
      return true;
    },
    move(pointer: number, x: number, t: number): number {
      if (pointer !== id) return 0;
      if (!past) {
        if (Math.abs(x - startX) < rows.deadzonePx) return 0;
        past = true; lastX = x; lastT = t;   // the turn counts from where the dead zone ended
        return 0;
      }
      const turn = turnOf(rows, x - lastX), dt = Math.max(1, t - lastT) / 1000;
      v = seeded ? v + (turn / dt - v) * rows.flingSmoothing : turn / dt;   // smoothed: one jittery frame (a short dt) cannot set the fling on its own
      seeded = true;
      lastX = x; lastT = t;
      return turn;
    },
    up(pointer: number, t: number): void {
      if (pointer !== id) return;
      glide = rows.inertiaSeconds > 0 && past && t - lastT <= rows.flingWindowMs ? v : 0;
      stop();
    },
    /** The system took the pointer away (pointercancel): the look ends with no glide, unlike a lift. */
    abort(pointer: number): void { if (pointer === id) { stop(); glide = 0; } },
    cancel(): void { stop(); glide = 0; },
    step(dt: number): number {
      if (!glide) return 0;
      const turn = glide * dt;
      glide *= Math.exp(-dt / Math.max(rows.inertiaSeconds, 1e-6));
      if (Math.abs(glide) < 1e-4) glide = 0;
      return turn;
    },
  };
}
