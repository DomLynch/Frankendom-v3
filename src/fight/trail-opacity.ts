// V3: the swing trail's opacity per clip key (data/fight.json `trail`, Dom 2026-10-26: the cuts at half, the stab 30% less), times V1's .12,
// on both fighters (characters.ts). Set by the page before the rigs are built; null (?trail=v1) = V1's .12 on every swing. A key the row
// does not name (the Pommel Strike, `about`) keeps V1's. A melee special's own trail row is not scaled.
import type { Attack } from './combat.ts';

export const TRAIL_OPACITY_V1 = .12;
let rows: Partial<Record<string, number>> | null = null;
export const setTrailOpacity = (row: Partial<Record<string, number | string>> | null): void => {
  rows = row ? Object.fromEntries(Object.entries(row).filter(([, v]) => typeof v === 'number')) as Record<string, number> : null;
};
export const swingTrailOpacity = (attack: Attack): number => TRAIL_OPACITY_V1 * (rows?.[attack] ?? 1);
