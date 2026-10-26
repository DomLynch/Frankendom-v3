// Dom's picked strike clips (data/hero-clips.json, 2026-10-26): the hero plays them in place of V1's Attack / Return / Riposte-as-thrust /
// Heavy. V1's timing rows are untouched: each clip is eased onto V1's ticks through its contact key. The sim keeps V1's blade sweeps under
// them by default (Strategy 2026-10-26: reach is a combat number); ?reach=clip sweeps along the picked clips (src/fight/blade-picks.ts over
// V1's blade-paths.ts for those paths only). On V1's sweeps each clip's drawn body is eased back by its row's `pullback` at contact, so the
// drawn blade tip meets V1's reach. ?clips=v1 = V1's clips and sweeps exactly. The choice is src/hero-reach.ts.
import ROWS from '../data/hero-clips.json' with { type: 'json' };
import { setSweepOverride } from './fight/blade.ts';
import { setHeroClips, type Role } from './fight/characters.ts';
import type { WeaponId } from './fight/moves.ts';
import { heroClipsAsked, pullbackFor, sweepTableFor } from './hero-reach.ts';

export { heroClipsAsked } from './hero-reach.ts';
type Row = { role: string; clip: string; from: number; to: number; contact: number };
/** where the row's contact key sits in the baked clip (0-1): the clip starts at `from` and ends at `to` */
export const sourceOf = (r: Row): number => (r.contact - r.from) / (r.to - r.from);
/** Set before the rigs are built and before the first sim step. Returns whether the picks are on. */
export function applyHeroClips(search: string): boolean {
  const on = heroClipsAsked(search);
  setHeroClips(on ? { weapon: ROWS.weapon as WeaponId, picks: ROWS.clips.map((r) => ({ role: r.role as Role, clip: r.clip, source: sourceOf(r), pullback: pullbackFor(search, r) })) } : null);
  setSweepOverride(sweepTableFor(search));
  return on;
}
