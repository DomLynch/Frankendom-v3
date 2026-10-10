import { M } from './detmath.ts';   // never Math.<transcendental> in the sim: engines round them differently (tests/detmath.test.ts)
export const STEP = 1 / 60;
import { PLAY_SCALE, RADIUS, spawnScale } from './play-radius.ts';
export { PLAY_SCALE, RADIUS };   // the play circle (play-radius.ts): 8.55 m, 0.6 of it in Arena 1 from record version 23
export const TARGET = { x: 0, z: -2.5 };
export type State = { x: number; z: number; heading: number; distance: number };
export type Input = { x: number; z: number; yaw: number; run: boolean };
export const initialState = (): State => ({ x: 0, z: 4 * spawnScale(), heading: Math.PI, distance: 0 });
export const initialTarget = (): { x: number; z: number } => ({ x: 0, z: TARGET.z * spawnScale() });   // the opponent's start (TARGET is the full-size one)

// World coordinates only. No renderer, clock, animation, physics or browser state.
// `pace` scales the fighter's speed (moves.ts `Opponent.speed`; 1 = a man): walking, sprinting, the wind-up lunge and the backstep all follow it.
export function advance(state: State, input: Input, target: { x: number; z: number } = TARGET, pace = 1, wall: number = RADIUS): State {   // wall: this fight's circle (Duel.radius, RV40); the Pit's live one by default
  const length = M.hypot(input.x, input.z);
  if (!length || !Number.isFinite(length) || !Number.isFinite(input.yaw)) return { ...state };
  const scale = Math.min(1, length) / length;
  const dx = (input.x * M.cos(input.yaw) + input.z * M.sin(input.yaw)) * scale;
  const dz = (-input.x * M.sin(input.yaw) + input.z * M.cos(input.yaw)) * scale;
  const speed = (input.run ? 5.2 : 3) * pace;
  let x = state.x + dx * speed * STEP;
  let z = state.z + dz * speed * STEP;
  // Resolve against the other fighter, including attack step-in and retreat.
  const tx = x - target.x, tz = z - target.z;
  const gap = M.hypot(tx, tz);
  if (gap < 0.85) {
    const angle = gap > 0.00001 ? M.atan2(tx, tz) : state.heading + Math.PI;
    x = target.x + M.sin(angle) * 0.85;
    z = target.z + M.cos(angle) * 0.85;
  }
  const radius = M.hypot(x, z);
  if (radius > wall) { x *= wall / radius; z *= wall / radius; }
  if (M.hypot(x - target.x, z - target.z) < .85 - 1e-8) return { ...state };
  return { x, z, heading: M.atan2(dx, dz), distance: state.distance + M.hypot(x - state.x, z - state.z) };
}

export function wrapAngle(angle: number): number {
  return M.atan2(M.sin(angle), M.cos(angle));
}
