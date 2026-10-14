import { specialOf, type SpecialName } from './moves.ts';
import type { OpponentId } from '../roster.ts';
import IDENTITY from './special-identity.json' with { type: 'json' };

// Pure identity bridge: #1114 names to the accepted preview keys. FX and audio
// resolve these keys outside the simulation; this module activates nothing.
const BOSS_SPECIAL_IDS: Readonly<Record<string, string>> = Object.fromEntries((IDENTITY.rows as readonly { id: string; key: string }[]).map((r) => [r.id, r.key]));   // the rows: special name -> preview key

export type BossSpecialId = string;

// Resolve the name captured by the accepted event, independently of later UI state.
export function bossSpecialId(name: SpecialName | null): BossSpecialId | null {
  return name && Object.hasOwn(BOSS_SPECIAL_IDS, name) ? BOSS_SPECIAL_IDS[name]! : null;
}

export function bossSpecialFor(opponent: OpponentId, level: number): BossSpecialId | null {
  if (!Number.isInteger(level) || level < 1 || level > 50) return null;
  return bossSpecialId(specialOf(opponent, level));
}
