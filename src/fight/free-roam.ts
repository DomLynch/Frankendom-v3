// Roll, step back and guard on the walk after a kill (Dom 2026-10-28: "outside of combat I cannot ROLL or GUARD; these must always be available").
// Before the first aggro the sim itself lets the sword-away hero take them (duel.ts freeStep). After a kill the fight sim is over (stepDuel stops when a man is
// down) and the hero's body is the stick's (zone-loop.ts roamStep); this keeps a hero-only duel beside that walk and steps the fight's OWN rules on it:
// the same legal() gate (stamina cost, exhaustion), the same roll length, i-frames and travel, the same guard window and speed. Idle, the walk is exactly
// roamStep; the duel only regenerates his stamina. The presses taken are the row data/free-moves.json actions. Presentation of the corpse and the kill
// are untouched: the page shows this hero's pose in place of the finished fight's while he rolls, steps or guards.
import ROWS from '../../data/free-moves.json' with { type: 'json' };
import { legal, stepDuel, idleIntent, type Action, type Duel, type Fighter, type Intent } from './duel.ts';
import type { State } from './sim.ts';
import { roamStep } from './zone-loop.ts';

export type FreeMovesRows = { actions: readonly Action[] };
export const FREE_MOVES = ROWS as FreeMovesRows;
const ACTIONS: readonly Action[] = ['dodge', 'backstep', 'parry'];

/** Throws on a bad row: `actions` must be a non-empty list drawn from the three free presses. */
export function validateFreeMoves(rows: FreeMovesRows = FREE_MOVES): void {
  if (!Array.isArray(rows.actions) || !rows.actions.length) throw new Error('free-moves.json actions must be a non-empty list');
  for (const a of rows.actions) if (!ACTIONS.includes(a)) throw new Error(`free-moves.json actions "${a}" is not one of ${ACTIONS.join(', ')}`);
}
validateFreeMoves();

/** The hero's hero-only duel for the walk after a kill. */
export type FreeRoam = { duel: Duel };

/** A hero who has just been let go: standing armed, the stamina and health he finished the fight with; the corpse is a still, sheathed body at its spot that bars his way as roamStep's corpse does. */
export function startFreeRoam(duel: Duel, wall: number): FreeRoam {
  const [hero, foe] = duel.fighters;
  const stand: Fighter = { ...hero, phase: 'ready', age: 0, move: null, chained: false, landed: false, chain: 0, parrying: false, guardDirection: null, exposed: 0, punish: 0, stun: 0, critical: 0, counterWindow: 0, charge: 0, charged: false, buffer: null, stall: 0, free: true };
  delete stand.special; delete stand.unsheathed;
  const corpse: Fighter = { ...foe, health: Math.max(1, foe.maxHealth), phase: 'sheathed', age: 0, move: null, buffer: null, stun: 0 };
  delete corpse.special;
  return { duel: { ...duel, finish: null, events: [], radius: wall, fighters: [stand, corpse] } };
}

/** Whether the press is one the walking hero takes (the row's list). */
let STRIKES: readonly string[] = [];
/** The strike presses a walking hero also takes while trash mobs are about (data/mobs.json hero.roamStrikes, set by the page once the mobs are built); none (the default, and every test that does not call this) = the three free presses as before. */
export const setRoamStrikes = (list: readonly string[]): void => { STRIKES = list; };
export const isFreeAction = (action: Action | null | undefined): boolean => !!action && (FREE_MOVES.actions.includes(action) || STRIKES.includes(action));

export type FreeStep = { free: FreeRoam; body: State };

/** One tick of the walk: `roam` is his body, `intent` the tick's quantized intent (stick, press, held guard and its side), `wall` the walking radius. */
export function stepFreeRoam(free: FreeRoam, roam: State, intent: Intent, wall: number): FreeStep {
  const hero = free.duel.fighters[0], corpse = free.duel.fighters[1], move = intent.move, guard = intent.guard;
  const press = isFreeAction(intent.action) ? intent.action : null;
  const acting = hero.phase !== 'ready' || press !== null || guard;
  const synced: Duel = { ...free.duel, radius: wall, fighters: [{ ...hero, body: roam }, corpse] };
  if (!acting) {   // the plain walk: roamStep moves him, the duel only gives him his breath back
    const rested = stepDuel(synced, [idleIntent(), idleIntent()]);
    const body = roamStep(roam, move, corpse.body, wall);
    return { free: { duel: { ...rested, fighters: [{ ...rested.fighters[0], body }, rested.fighters[1]] } }, body };
  }
  const next = stepDuel(synced, [{ move, action: press, guard, ...(intent.guardDirection ? { guardDirection: intent.guardDirection } : {}), lock: false }, idleIntent()]);
  return { free: { duel: next }, body: next.fighters[0].body };
}

/** What the HUD's roll and guard buttons say while he walks: lit when the fight's own gate would take the press. */
export function freeHud(free: FreeRoam): { dodge: boolean; guard: boolean; guarding: boolean } {
  const hero = free.duel.fighters[0];
  return { dodge: legal(hero, 'backstep') || legal(hero, 'dodge'), guard: legal(hero, 'parry') || hero.phase === 'guard', guarding: hero.phase === 'guard' };
}
