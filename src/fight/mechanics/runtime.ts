// What every boss mechanic hands the page (src/fight/mechanics/index.ts registers one per `type` of data/mechanics.json). The page steps it once per sim tick with the Practice and the fight's state, and draws its `group` once per frame.
import type * as THREE from 'three';
import type { Practice } from '../combat.ts';
import type { Duel, Intent } from '../duel.ts';

/** The held boss's damage multiplier (ring, star, escalation, Daily Pit: the same one its blows carry). The page sets it when it hands the sim a spawn (setMechanicScale); a mechanic whose damage has no sheet dial of its own reads it. */
export const MECHANIC_SCALE = { damage: 1 };

export type MechanicRuntime = {
  /** The data/profiles.json id this mechanic belongs to (the row's `boss`). */
  boss: string;
  /** Everything it draws, added to the scene once; null = nothing to draw. */
  group: THREE.Object3D | null;
  /** The pure core and the context it was last handed, for the tests and stills. */
  core: unknown;
  ctx: unknown;
  /** Back to the start (a new fight, a respawn). */
  reset(): void;
  /** One sim tick: `on` = this boss is the one fighting the hero now. Returns the same Practice when nothing landed, else one with the hero's health (and place) changed. */
  tick(practice: Practice, on: boolean, dt: number): Practice;
  /** Once per rendered frame: move the drawing to the core's state. */
  frame(dt: number): void;
  /** Only a mechanic that rewrites the boss's intent (Nan's Impale): stepPractice's `layer`, applied while this boss is engaged. */
  layer?(duel: Duel, warden: Intent): Intent;
  /** Only a mechanic that acts on the HERO's side before the tick (the Envoy's latch: his drain, slowed walk and the lunge): the duel and the hero's intent the tick is stepped on. The returned object may be reused: read it, never keep it. */
  pre?(duel: Duel, hero: Intent): { duel: Duel; intent: Intent };
  /** Only with `layer`: after the sim tick, the duel with any body the mechanic moves (the lunge, the drag); the same duel when nothing moved. */
  settle?(prior: Duel, stepped: Duel): Duel;
};
