// Bounty twist flags (Origins region1 spec §7 ruling 10): encounter flags the Origins side maps from an encounter id and hands in as a plain
// array. Observer only: this file is not in the record digest (not in SIM), reads a Duel and writes nothing back, so RECORD_VERSION, the
// RNG fingerprint and every ladder fight are untouched; no flag, no twist.
//   flee-at {percent, catchSeconds?}  the foe (side 1) runs when his health falls to `percent` of his bar. Fled is NOT a kill: no Killed
//     event, no finish. With catchSeconds there is a catch window: his death inside it ends it `caught` (the normal defeat), running out
//     is `Escaped`. Without catchSeconds the fight ends at once, `fled`. The caller reads these events and decides cleared / forfeit.
//   one-health-bar  v1 STUB: one foe whose bar is the sum of the foes' healths (`oneBarHealth`). Chained foes sharing a pool are v2.
import type { Duel } from './duel.ts';
import { STEP } from './sim.ts';

export type TwistFlag = { kind: 'flee-at'; percent: number; catchSeconds?: number } | { kind: 'one-health-bar' };
export type TwistEvent =
  | { tick: number; type: 'FoeFled'; atPercent: number }
  | { tick: number; type: 'CatchWindowStart'; endsAt: number }
  | { tick: number; type: 'CatchWindowEnd'; caught: boolean }
  | { tick: number; type: 'Escaped' };
export type TwistOutcome = 'fled' | 'caught' | 'escaped';
export type Twist = { fledAt: number | null; endsAt: number | null; outcome: TwistOutcome | null };
export const noTwist = (): Twist => ({ fledAt: null, endsAt: null, outcome: null });

// The bar of a one-health-bar fight: the foes' healths added into one pool; without the flag, the first foe's own bar.
export const oneBarHealth = (flags: readonly TwistFlag[], healths: readonly number[]): number =>
  flags.some(f => f.kind === 'one-health-bar') ? healths.reduce((a, b) => a + b, 0) : healths[0];

// One tick, read after the sim has stepped. Returns the next state and the events raised on this tick.
export function stepTwist(duel: Duel, flags: readonly TwistFlag[], was: Twist): { twist: Twist; events: TwistEvent[] } {
  const flee = flags.find((f): f is Extract<TwistFlag, { kind: 'flee-at' }> => f.kind === 'flee-at');
  if (!flee || was.outcome) return { twist: was, events: [] };
  const foe = duel.fighters[1], tick = duel.tick, events: TwistEvent[] = [];
  if (was.fledAt === null) {
    if (duel.finish || foe.health <= 0 || foe.health / foe.maxHealth * 100 > flee.percent) return { twist: was, events: [] };   // a killing blow is a kill, not a flight
    events.push({ tick, type: 'FoeFled', atPercent: flee.percent });
    if (flee.catchSeconds === undefined) return { twist: { fledAt: tick, endsAt: null, outcome: 'fled' }, events };
    const endsAt = tick + Math.round(flee.catchSeconds / STEP);
    events.push({ tick, type: 'CatchWindowStart', endsAt });
    return { twist: { fledAt: tick, endsAt, outcome: null }, events };
  }
  if (duel.finish?.victim === 1) {
    events.push({ tick, type: 'CatchWindowEnd', caught: true });
    return { twist: { ...was, outcome: 'caught' }, events };
  }
  if (tick >= was.endsAt!) {
    events.push({ tick, type: 'CatchWindowEnd', caught: false }, { tick, type: 'Escaped' });
    return { twist: { ...was, outcome: 'escaped' }, events };
  }
  return { twist: was, events };
}
