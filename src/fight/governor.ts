import budgets from './governor-budgets.json' with { type: 'json' };

// The client governor (top-30 row 26, Web half): draw calls and triangles per frame against a per-tier budget row (governor-budgets.json, p90 of the tier's real scenes, so today's
// play never trips it). The page samples renderer.info once per playable frame; a window is the median of `windowFrames` samples, and `overWindows` windows in a row over either budget
// pull the next lever of the ladder. One way only, for the page's lifetime (the pixel ratio is not a lever here: quality.ts lowers it on frame time, the right signal for it): there is no step back up, so it can never flap. Pure: no DOM, no three.

export type Lever = 'shadows' | 'crowd';
export interface Budget { draws: number; tris: number }
export interface GovernorRow { tiers: Record<string, Budget>; ladder: readonly Lever[]; windowFrames: number; overWindows: number }

const median = (v: number[]): number => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

export function createGovernor(row: GovernorRow, tier: 'phone' | 'full') {
  const budget = row.tiers[tier];
  let draws: number[] = [], tris: number[] = [], over = 0, level = 0;
  return {
    get level() { return level; },
    budget,
    /** One playable frame's renderer.info; returns the lever to pull now, or null. */
    sample(frameDraws: number, frameTris: number): Lever | null {
      draws.push(frameDraws); tris.push(frameTris);
      if (draws.length < row.windowFrames) return null;
      const tripped = median(draws) > budget.draws || median(tris) > budget.tris;
      draws = []; tris = [];
      over = tripped ? over + 1 : 0;
      if (over < row.overWindows || level >= row.ladder.length) return null;
      over = 0;
      return row.ladder[level++];
    },
  };
}

export const GOVERNOR_ROW = budgets as unknown as GovernorRow;
