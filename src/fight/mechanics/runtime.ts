// What every boss mechanic hands the page (src/fight/mechanics/index.ts registers one per `type` of data/mechanics.json). The page steps it once per sim tick with the Practice and the fight's state, and draws its `group` once per frame.
import type * as THREE from 'three';
import type { Practice } from '../combat.ts';

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
};
