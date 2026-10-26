// Dom's picked strike clips (data/hero-clips.json, 2026-10-26): the hero plays them in place of V1's Attack / Return / Riposte-as-thrust /
// Heavy, and the sim sweeps the blade along them (src/fight/blade-picks.ts over V1's blade-paths.ts for those paths only). V1's timing rows
// are untouched: each clip is eased onto V1's ticks through its contact key. ?clips=v1 = V1's clips and sweeps exactly.
import ROWS from '../data/hero-clips.json' with { type: 'json' };
import { BLADE_PICKS } from './fight/blade-picks.ts';
import { setSweepOverride } from './fight/blade.ts';
import { setHeroClips, type Role } from './fight/characters.ts';
import type { WeaponId } from './fight/moves.ts';

type Row = { role: string; clip: string; from: number; to: number; contact: number };
/** where the row's contact key sits in the baked clip (0-1): the clip starts at `from` and ends at `to` */
export const sourceOf = (r: Row): number => (r.contact - r.from) / (r.to - r.from);
export const heroClipsAsked = (search: string): boolean => !/[?&]clips=v1\b/.test(search);
/** Set before the rigs are built and before the first sim step. Returns whether the picks are on. */
export function applyHeroClips(search: string): boolean {
  const on = heroClipsAsked(search);
  setHeroClips(on ? { weapon: ROWS.weapon as WeaponId, picks: ROWS.clips.map((r) => ({ role: r.role as Role, clip: r.clip, source: sourceOf(r) })) } : null);
  setSweepOverride(on ? { [ROWS.rig]: { [ROWS.weapon]: BLADE_PICKS } } : null);
  return on;
}
