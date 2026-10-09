// The engine's stats-by-level entry point (src/fight/): a catalogue row names an archetype and a level band, and the numbers for any (character, level) resolve HERE, through the engine directory.
// Today this re-exports src/moves.ts (SIM_FILES: moving the code would change the record-version digest, so the physical move goes with Combat's K2 sim move, Lead 2026-10-09). Nothing else
// imports moves.ts for stats from the catalogue side: a client asks `statsAt`.
import { OPPONENTS, LEVELS, opponentAt, profileAt, type Opponent } from '../moves.ts';
import type { OpponentId } from '../roster.ts';

export { OPPONENTS, LEVELS, opponentAt, profileAt };
export type { Opponent };
/** The fighter a catalogue row is at a ladder level (1..LEVELS): body numbers (health, poise, loadout) and, through profileAt, the AI profile. */
export const statsAt = (id: OpponentId, level: number): Opponent => opponentAt(OPPONENTS[id], level);
