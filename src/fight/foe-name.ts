// V3 (Dom 2026-10-26): the opponent's body is Mixamo's Minotaur (foe-body.ts), so the HUD names him the Minotaur (data/fight.json `foeName`).
// Display only: the sim, the AI, his stats, specials, level and Gate 0 still see the Centurion (id `veteran`). ?foe=v1 = the Centurion's body,
// so his name too. Set by the page before the HUD paints; null = the roster's name as before.
import { bareName } from '../roster.ts';
import type { OpponentId } from '../roster.ts';

export type FoeNameRow = { opponent: string; name: string };

let row: FoeNameRow | null = null;
/** The row in force for this page: null under ?foe=v1 (the Centurion's body keeps the Centurion's name). */
export const foeNameFor = (data: FoeNameRow, search: string): FoeNameRow | null => (new URLSearchParams(search).get('foe') === 'v1' ? null : data);
export const setFoeName = (next: FoeNameRow | null): void => { row = next ? { opponent: next.opponent, name: next.name } : null; };
/** The name the HUD shows for `id` (no leading "the"): the row's name for its opponent, the roster's otherwise. Presentation only. */
export const foeDisplayName = (id: OpponentId): string => (row && row.opponent === id ? row.name : bareName(id));
