// Which clips the hero plays and which blade sweeps the sim hits with, from the page's query (data/hero-clips.json). No rendering
// imports, so the tests and Gate 0 (test/gate0/harness.mjs) ask the same function the page does.
//   default       Dom's picked clips, V1's sweeps (`sweeps.default`: "v1"): V1's reach and hits under the new look
//   ?reach=clip   Dom's picked clips, the sweeps re-baked from them (src/fight/blade-picks.ts): the longer reach
//   ?clips=v1     V1's clips and V1's sweeps exactly, whatever ?reach= says
// ?reach=v1 is the hero's default already; it also puts the opponent's cleaver back on V1's sweeps (data/fight.json foeReach, src/fight/foe-reach.ts).
import ROWS from '../data/hero-clips.json' with { type: 'json' };
import { BLADE_PICKS } from './fight/blade-picks.ts';

export type Reach = 'v1' | 'clip';
const REACHES: readonly Reach[] = ['v1', 'clip'];
export type SweepTable = Record<string, Record<string, Record<string, number[][]>>>;

export const heroClipsAsked = (search: string): boolean => !/[?&]clips=v1\b/.test(search);
/** The sweeps the sim uses: V1's under ?clips=v1, else the query's `reach` when it names one, else the row's default. */
export function reachFor(search: string): Reach {
  if (!heroClipsAsked(search)) return 'v1';
  const asked = new URLSearchParams(search).get(ROWS.sweeps.query) as Reach | null;
  return asked && REACHES.includes(asked) ? asked : ROWS.sweeps.default as Reach;
}
/** How far a picked clip's drawn body is eased back at contact (metres): the row's `pullback` on V1's sweeps, so the drawn tip meets V1's
 *  reach; 0 under ?reach=clip, where the sweeps already follow the drawn blade. */
export const pullbackFor = (search: string, row: { pullback: number }): number => reachFor(search) === 'v1' ? row.pullback : 0;
/** The table blade.ts setSweepOverride lays over V1's for this query: null = V1's sweeps untouched. */
export const sweepTableFor = (search: string): SweepTable | null =>
  reachFor(search) === 'clip' ? { [ROWS.rig]: { [ROWS.weapon]: BLADE_PICKS } } : null;
