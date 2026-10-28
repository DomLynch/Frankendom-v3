// The boss signature mechanics: id -> maker. A boss row names its id in data/rings.json bosses[].mechanic; the id's numbers are a row of data/mechanics.json. A new mechanic is ONE line here, its own module
// beside this file and its row in data/mechanics.json (src/sim/validate.js MECHANIC_CHECKS checks it; test/mechanics.test.mjs pins registry and rows to the same ids).
import { RINGS } from '../../zone/rings.ts';
import { createEnvoyLatch } from './envoy-latch.ts';
import { idleIntent, type Duel, type Intent } from '../duel.ts';
import type { Mechanic } from './types.ts';

const HOLD: Intent = idleIntent();   // stands and faces (lock): the boss's own intent while a mechanic holds him
/** The stepPractice layer (combat.ts) that stands the boss still for the tick: the crouch, the lunge, the recovery. */
export const heldBoss = (_duel: Duel, _warden: Intent): Intent => HOLD;

export const MECHANICS: Readonly<Record<string, () => Mechanic>> = {
  'envoy-latch': createEnvoyLatch,
};

/** The mechanic a ring boss kind names (data/rings.json), or null. */
export const mechanicIdFor = (kind: string): string | null => RINGS.bosses.find((b) => b.kind === kind)?.mechanic ?? null;
/** A fresh mechanic for `id`; throws on an id the registry does not hold. */
export function createMechanic(id: string): Mechanic {
  const make = MECHANICS[id];
  if (!make) throw new Error(`no mechanic "${id}" in src/fight/mechanics/registry.ts`);
  return make();
}
