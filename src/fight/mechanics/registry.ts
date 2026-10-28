// The boss signature mechanics (data/mechanics.json rows; one module per boss in this folder). The duel (src/fight/duel.ts) knows a mechanic only through the few calls below, keyed by the
// `mech` id a Fighter carries; a fighter without one costs a single property read. A boss names its mechanic in data/rings.json bosses[].mechanic, and `mechanicOf(kind)` reads that.
// To add a boss: write its module here, add ONE line to MECHANICS, its row to data/mechanics.json and its checker to src/sim/validate-mechanics.js CHECKS (a test pins the three lists to the same ids).
import RINGS from '../../../data/rings.json' with { type: 'json' };
import type { Fighter } from '../duel.ts';
import { ID as ACCOUNTANT, mechanic as accountant } from './accountant-parry-wall.ts';

export interface Mechanic {
  /** The fields a fresh fight with this boss starts with (the id and its first cooldown). */
  init(): Partial<Fighter>;
  /** One tick on the NEW copy of the boss `f`, reading the other fighter. */
  clock(f: Fighter, foe: Fighter): void;
  /** Planted: the boss takes no step and throws no blow this tick. */
  locked(f: Fighter): boolean;
  /** A weapon blow is landing on the boss (`D` the new copy, `d` the tick's start state), `angle` radians off his heading: null = lands as usual, else the mechanic answers it. */
  intercept(D: Fighter, d: Fighter, move: string | null, angle: number): 'parry' | 'break' | null;
  /** The answer 'parry' was taken: the attacker's stun and the boss's riposte window, in ticks. */
  parried(D: Fighter): { stun: number; riposte: number };
  /** A kick or a hero special broke the mechanic's state on the boss; returns the stun he took. */
  broken(D: Fighter, source: 'kick' | 'special'): number;
  /** The commentator event id to say now, or null. */
  caption?(f: Fighter): string | null;
}

export const MECHANICS: Readonly<Record<string, Mechanic>> = {
  [ACCOUNTANT]: accountant,
};

const KINDS = new Map<string, string>((RINGS.bosses as { kind: string; mechanic: string | null }[]).flatMap((b) => (b.mechanic ? [[b.kind, b.mechanic] as [string, string]] : [])));
/** The mechanic id of a boss kind (data/rings.json), or undefined. */
export const mechanicOf = (kind: string): string | undefined => KINDS.get(kind);

/** The fields a fresh fighter with mechanic `id` starts with (an Opponent's `mechanic`; a fighter without one gets none, so every other fight is byte for byte what it was). */
export const mechFields = (id: string): Partial<Fighter> => MECHANICS[id]!.init();
export const mechClock = (f: Fighter, foe: Fighter): void => { if (f.mech) MECHANICS[f.mech]?.clock(f, foe); };
export const mechLocked = (f: Fighter): boolean => !!f.mech && !!MECHANICS[f.mech]?.locked(f);
export const mechIntercept = (D: Fighter, d: Fighter, move: string | null, angle: number): 'parry' | 'break' | null => (d.mech ? MECHANICS[d.mech]?.intercept(D, d, move, angle) ?? null : null);
export const mechParried = (D: Fighter): { stun: number; riposte: number } => MECHANICS[D.mech!]!.parried(D);
export const mechBroken = (D: Fighter, source: 'kick' | 'special'): number => MECHANICS[D.mech!]!.broken(D, source);
/** A hero special landed on `D`: any state of his mechanic that a special breaks is broken (returns nothing; a boss with no such state is untouched). */
export const mechSpecialLanded = (D: Fighter): void => { if (D.mech && D.mS && D.health) MECHANICS[D.mech]?.broken(D, 'special'); };
export const mechCaption = (f: Fighter): string | null => (f.mech ? MECHANICS[f.mech]?.caption?.(f) ?? null : null);
