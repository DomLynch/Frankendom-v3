// The finishers as physics cuts (data/physics.json `finisherCuts`; Strategy's ruling 2026-10-26). PRESENTATION ONLY and three-free: the rows and the
// questions the ragdoll (ragdoll.ts) and the scene (scene.ts) ask of them. Under ?ragdoll=finishers the rotation picks as in V1 and the scene plays the
// finisher's own camera, blood and sound by its id (finisher-defs.json); the victim's body is the ragdoll, cut where the row says.
import type { FinisherId } from './finishers.ts';

export type FinisherCutRow = {
  unit: string | null;                                  // the package's cut unit, or null = no cut (Run Through: the blade stays)
  atS: number;                                          // seconds after the killing blow the cut is made
  push: number;                                         // multiplier on the kill's impulse
  kill: { impulse: number; lift: number } | null;       // the cut piece's push; null = cut.kill
  plane: string | null;                                 // what the unit only stands in for (a new cut plane for Strategy to rule on)
};
export type FinisherCutRows = { finisher: { default: string; query: string; values: Record<string, string> }; finisherCuts: { rows: Record<string, FinisherCutRow | undefined> } };

/** The finisher mode on this page that brings V1's finishers back with the physics body. */
export const PHYSICS_MODE = 'physics';

/** The row for finisher `id`, or undefined (a finisher with no physics body keeps its clips). */
export const finisherCutRow = (rows: FinisherCutRows, id: FinisherId | null): FinisherCutRow | undefined => (id === null ? undefined : rows.finisherCuts.rows[id]);

/** The kill's impulse for this finisher: the row's share of the plain kill's (`impulse`, the physics.json kill row's), unchanged without a row. */
export const finisherPush = (row: FinisherCutRow | undefined, impulse: number): number => impulse * (row?.push ?? 1);

/** Cuts made some seconds after the killing blow (a row's atS): add on the kill, tick each presentation frame, clear on the rematch. */
export function createLateCuts() {
  let queue: { unit: string; left: number; source: string }[] = [];
  return {
    add(unit: string, atS: number, source: string) { queue.push({ unit, left: atS, source }); },
    /** The cuts due after `dt` more seconds, in the order they were added. */
    tick(dt: number): { unit: string; source: string }[] {
      if (!queue.length) return [];
      const due: { unit: string; source: string }[] = [];
      for (const q of queue) { q.left -= dt; if (q.left <= 0) due.push(q); }
      if (due.length) queue = queue.filter((q) => q.left > 0);
      return due;
    },
    clear() { queue = []; },
    get pending() { return queue.length; },
  };
}
