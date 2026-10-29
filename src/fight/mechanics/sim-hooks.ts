// The SIM-LEVEL hooks of a boss mechanic (the Accountant's parry wall). The registry of the page's mechanics is index.ts (ONE line per row of data/mechanics.json, the same for every boss); a mechanic that
// must change how a blow resolves also has a module with these hooks, because the duel (src/fight/duel.ts) knows a mechanic only through the few calls below, keyed by the `mech` id a Fighter carries
// (a fighter without one costs a single property read). This file imports no three.js and no data/ json (the sim is `src/` alone at Gate 0); index.ts's runtime for the same id needs no table line of its own beyond index.ts.
// A boss names its mechanic in data/rings.json bosses[].mechanic, and `mechanicOf(kind)` (kinds.ts) reads that. A hooks module is added to SIM_HOOKS below; a test pins every SIM_HOOKS id to a data row and a registry line.
import type { Fighter } from '../duel.ts';
import { ID as ACCOUNTANT, mechanic as accountant } from './accountant-parry-wall.ts';

/** The answers of intercept() the duel reads, and the two combat event type ids it pushes for a wall (the EventType union in duel.ts): named once here so the duel names no literal of its own. */
export const WALL_HIT = { parry: 'parry', break: 'break' } as const;
export const WALL_EVENT = { parried: 'Parried', staggered: 'Staggered' } as const;

export interface Mechanic {
  /** Lay this mechanic's data/mechanics.json row into the module (the driver calls it once, before any fight; unconfigured = inert). */
  configure(row: never): void;
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

export const SIM_HOOKS: Readonly<Record<string, Mechanic>> = {
  [ACCOUNTANT]: accountant,
};
const MECHANICS = SIM_HOOKS;

/** The driver's one call, before any fight or effect is built: lay every data/mechanics.json row (id -> row) that has a hooks module into it. A row with no hooks module is a page-level mechanic (index.ts) and is skipped; a module with no row stays inert. */
export function configureSimMechanics(rows: Readonly<Record<string, unknown>>): void {
  for (const [id, row] of Object.entries(rows)) MECHANICS[id]?.configure(row as never);
}

/** The fields a fresh fighter with mechanic `id` starts with (an Opponent's `mechanic`; a fighter without one gets none, so every other fight is byte for byte what it was). */
export const mechFields = (id: string): Partial<Fighter> => MECHANICS[id]?.init() ?? {};
export const mechClock = (f: Fighter, foe: Fighter): void => { if (f.mech) MECHANICS[f.mech]?.clock(f, foe); };
export const mechLocked = (f: Fighter): boolean => !!f.mech && !!MECHANICS[f.mech]?.locked(f);
export const mechIntercept = (D: Fighter, d: Fighter, move: string | null, angle: number): 'parry' | 'break' | null => (d.mech ? MECHANICS[d.mech]?.intercept(D, d, move, angle) ?? null : null);
export const mechParried = (D: Fighter): { stun: number; riposte: number } => MECHANICS[D.mech!]!.parried(D);
export const mechBroken = (D: Fighter, source: 'kick' | 'special'): number => MECHANICS[D.mech!]!.broken(D, source);
/** A hero special landed on `D`: any state of his mechanic that a special breaks is broken (returns nothing; a boss with no such state is untouched). */
export const mechSpecialLanded = (D: Fighter): void => { if (D.mech && D.mS && D.health) MECHANICS[D.mech]?.broken(D, 'special'); };
export const mechCaption = (f: Fighter): string | null => (f.mech ? MECHANICS[f.mech]?.caption?.(f) ?? null : null);
