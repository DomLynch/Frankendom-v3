// BOSS SIGNATURE MECHANICS registry (Dom 2026-10-28: each ring boss gets its own fighting identity). data/rings.json bosses[].mechanic names an id; this map says which code runs it.
// A mechanic WRAPS the duel step of the held boss: it may rewrite the warden's intent and move the boss's body after the sim stepped (a dash), nothing else. Its state is plain data
// the page keeps per fight (reset on every new fight, hand-over, respawn: src/client/main.ts). All numbers are rows in data/mechanics.json.
import type * as THREE from 'three';
import RINGS from '../../../data/rings.json' with { type: 'json' };
import type { Duel, Intent } from '../duel.ts';
import { shadowDash } from './kachujin-shadow-dash.ts';

/** What a mechanic's effect is handed each frame: the state (null = none now), the sim tick, the live foe rig's anchor, both bodies. */
export type MechFrame = { tick: number; finished: boolean; anchor: THREE.Object3D | null; boss: { x: number; z: number; heading: number }; hero: { x: number; z: number } };
export type MechFx = { update(dt: number, state: unknown, frame: MechFrame): void };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Mechanic<S = any> = {
  id: string;
  create(): S;
  /** One duel tick for the held boss: `run(intent)` steps the duel with that warden intent; the mechanic returns the stepped duel (it may move the boss's body after). */
  step(state: S, duel: Duel, warden: Intent, run: (warden: Intent) => Duel): Duel;
  /** The effect, loaded the first time a boss wearing this mechanic is on screen (a lazy chunk). */
  fx?: () => Promise<(scene: THREE.Scene) => MechFx>;
};

export const MECHANICS: Readonly<Record<string, Mechanic>> = {
  [shadowDash.id]: shadowDash,   // Kachujin
};

/** The mechanic a ring boss kind wears (data/rings.json bosses[].mechanic), or undefined: trash mobs, ring 1 and the Pit have none. */
export const mechanicOfKind = (kind: string | undefined): Mechanic | undefined => {
  const id = (RINGS.bosses as readonly { kind: string; mechanic: string | null }[]).find((b) => b.kind === kind)?.mechanic;
  return id ? MECHANICS[id] : undefined;
};
