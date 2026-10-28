// The boss mechanics registry: one line per `type` of data/mechanics.json (the row's numbers are read by that type's code; src/sim/validate.js MECHANIC_TYPES checks them). The page asks `createMechanics()` for a
// runtime per row and steps the one whose `boss` is the foe it is fighting. A new boss mechanic is a module here, one line below, one line in validate.js, and its row.
import ROWS from '../../../data/mechanics.json' with { type: 'json' };
import type { Practice } from '../combat.ts';
import type { MechanicRuntime } from './runtime.ts';
import { MECHANIC_SCALE } from './runtime.ts';
import { createGourdBombsRuntime } from './gourd-bombs.ts';
import { createKingAuraRuntime } from './king-aura.ts';
import { createNanImpaleRuntime } from './nan-impale.ts';

export const MECHANICS: Readonly<Record<string, (row: never) => MechanicRuntime>> = {
  'gourd-bombs': createGourdBombsRuntime as (row: never) => MechanicRuntime,
  'king-aura': createKingAuraRuntime as (row: never) => MechanicRuntime,
  'nan-impale': createNanImpaleRuntime as (row: never) => MechanicRuntime,
};

/** The page hands the sim a spawn: `damage` is its multiplier (ring, star, Daily Pit), read by a mechanic that scales with it (the King's aura). */
export function setMechanicScale(damage: number): void { MECHANIC_SCALE.damage = damage; }

/** The page's one handle: a runtime per row of data/mechanics.json, keyed by the boss it belongs to. */
export function createMechanics(rows: Readonly<Record<string, { type: string }>> = ROWS.mechanics) {
  const byBoss = new Map<string, MechanicRuntime>(), list: MechanicRuntime[] = [];
  for (const [id, row] of Object.entries(rows)) {
    const make = MECHANICS[row.type];
    if (!make) throw new Error(`data/mechanics.json ${id}: no code for type "${row.type}"`);
    const m = make(row as never); byBoss.set(m.boss, m); list.push(m);
  }
  return {
    list: list as readonly MechanicRuntime[],
    /** The mechanic of `boss`, or undefined. */
    of: (boss: string): MechanicRuntime | undefined => byBoss.get(boss),
    /** One sim tick: the fighting boss's mechanic runs; every other one is told the fight is not its own (it wipes itself). */
    tick(practice: Practice, boss: string, engaged: boolean, dt: number): Practice {
      let out = practice;
      for (const m of list) out = m.tick(out, engaged && m.boss === boss, dt);
      return out;
    },
    frame(dt: number): void { for (const m of list) m.frame(dt); },
  };
}
