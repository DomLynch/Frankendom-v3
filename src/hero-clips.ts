// Dom's picked strike clips (data/hero-clips.json, 2026-10-26): the hero plays them in place of V1's Attack / Return / Riposte-as-thrust /
// Heavy, and his picked guard (a held one-shot, the row's `hold`) in place of V1's Guard and BlockImpact. V1's timing rows are untouched: each clip is eased onto V1's ticks through its contact key. The sim keeps V1's blade sweeps under
// them by default (Strategy 2026-10-26: reach is a combat number); ?reach=clip sweeps along the picked clips (src/fight/blade-picks.ts over
// V1's blade-paths.ts for those paths only). On V1's sweeps each clip's drawn body is eased back by its row's `pullback` at contact, so the
// drawn blade tip meets V1's reach. ?clips=v1 = V1's clips and sweeps exactly. The choice is src/hero-reach.ts.
import ROWS from '../data/hero-clips.json' with { type: 'json' };
import { setSweepOverride } from './fight/blade.ts';
import { setHeroClips, type Role } from './fight/characters.ts';
import type { GuardHold } from './fight/guard-hold.ts';
import type { WeaponId } from './fight/moves.ts';
import { heroClipsAsked, pullbackFor, sweepTableFor } from './hero-reach.ts';
import { mergeSweeps, type SweepTable } from './fight/foe-reach.ts';

export { heroClipsAsked } from './hero-reach.ts';
type Row = { role: string; clip: string; from: number; to: number; contact?: number; hold?: GuardHold };
/** where the row's contact key sits in the baked clip (0-1): the clip starts at `from` and ends at `to`; a guard row (no contact key) holds its last key */
const sourceOf = (r: Row): number => r.contact === undefined ? 1 : (r.contact - r.from) / (r.to - r.from);
/** Set before the rigs are built and before the first sim step. Returns whether the picks are on. `foeSweeps`: the opponent's own override
 *  (src/fight/foe-reach.ts foeSweepsFor: the Minotaur's cleaver), laid over V1's beside the hero's. */
export function applyHeroClips(search: string, foeSweeps: SweepTable | null = null): boolean {
  const on = heroClipsAsked(search);
  setHeroClips(on ? { weapon: ROWS.weapon as WeaponId, picks: (ROWS.clips as (Row & { pullback: number })[]).map((r) => ({ role: r.role as Role, clip: r.clip, source: sourceOf(r), pullback: pullbackFor(search, r), ...(r.hold ? { hold: r.hold } : {}) })) } : null);
  applyFoeSweeps(search, foeSweeps);
  return on;
}
/** The sweep override alone (the hero's table with the opponent's laid over it): the zone re-lays it when the sim is handed to a spawn of another kind (src/client/main.ts). */
export const applyFoeSweeps = (search: string, foeSweeps: SweepTable | null): void => setSweepOverride(mergeSweeps(sweepTableFor(search), foeSweeps));
