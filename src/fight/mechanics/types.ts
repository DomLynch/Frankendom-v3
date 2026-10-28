// The shape of a boss signature mechanic (registry.ts holds them, data/mechanics.json their rows). Types only.
import type { Intent, Practice } from '../combat.ts';
import type { Duel } from '../duel.ts';

/** What the page shows when a mechanic fires: the commentator event and its params (data/commentator.json), and the freeze in ms. */
export type Tell = { event: string; params: Record<string, string>; hitStopMs: number };
/** A node of a body's scene graph, as far as a mechanic's view touches it (three.js Object3D fits). */
export type BodyNode = { visible: boolean; getObjectByName(name: string): BodyNode | undefined };
export type Mechanic = {
  id: string;
  /** Problems with this mechanic's row in data/mechanics.json ([] = fine); `ctx.profiles` the data/profiles.json ids, `ctx.manifest` the boss body's cut manifest. */
  validate(row: unknown, ctx: { profiles?: readonly string[]; manifest?: unknown }): string[];
  /** The world layer: the boss's intent after decide() (stepPractice's `layer`). */
  layer(duel: Duel, intent: Intent): Intent;
  /** The tick's result with what the mechanic changed written into the boss's fighter (sticky tags in `phases`, so a new fight starts clean). */
  after(next: Practice): Practice;
  /** What the page shows for what changed on this tick, or null. */
  tell(prior: Practice, next: Practice): Tell | null;
  /** Draw the mechanic's state on a body root (after the cut rig's own update); `phases` is the boss fighter's. */
  view(root: BodyNode, phases: readonly string[] | undefined): void;
  /** The cut units this fight has already taken off him (a corpse cannot cut them again and they yield no part). */
  lostUnits(phases: readonly string[] | undefined): string[];
};
