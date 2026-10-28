// V3 (Dom 2026-10-26): the opponent's body is Mixamo's Minotaur (foe-body.ts), so the HUD names him the Minotaur (data/fight.json `foeName`).
// Display only: the sim, the AI, his stats, specials, level and Gate 0 see his own id (V1's Pitborn since Dom's later 10-26 call, foe-pick.ts;
// the Centurion under ?pitborn=v1), whoever fights in the Minotaur's body is named the Minotaur. (?foe=v1, the Centurion's 65 body and
// name, was removed with the 65 bodies: 106 only.) Set by the page before the HUD paints; null = the roster's name as before.
import { bareName } from '../roster.ts';
import type { OpponentId } from '../roster.ts';

export type FoeNameRow = { opponent: string; name: string };

let row: FoeNameRow | null = null;
let kindNames: Record<string, string> = {};
/** Per-kind names (data/profiles.json rows with a `name`: Gargantua, Arachne): the HUD names the spawn the sim holds by its profile row, not the page-wide row.
 * One body per opponent id (checkBodies), so the opponent id is a safe key. A row with no `name` changes nothing. */
export const setKindNames = (profiles: readonly { opponent: string; name?: string }[]): void => { kindNames = {}; for (const p of profiles) if (p.name) kindNames[p.opponent] = p.name; };
/** The row in force for this page: the name on the opponent this page fights (`opponent`, from foe-pick.ts: the Pitborn, or the Centurion under
 * ?pitborn=v1, both drawn as the Minotaur). No query changes it: every body drawn is the Minotaur. */
export const foeNameFor = (data: FoeNameRow, _search: string, opponent: string = data.opponent): FoeNameRow | null => ({ opponent, name: data.name });
export const setFoeName = (next: FoeNameRow | null): void => { row = next ? { opponent: next.opponent, name: next.name } : null; };
/** The name the HUD shows for `id` (no leading "the"): the row's name for its opponent, the roster's otherwise. Presentation only. */
export const foeDisplayName = (id: OpponentId): string => (row && row.opponent === id ? row.name : Object.hasOwn(kindNames, id) ? kindNames[id] : bareName(id));
