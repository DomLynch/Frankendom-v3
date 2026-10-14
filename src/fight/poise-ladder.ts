import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import LADDER_MANIFEST from './poise-ladder-defs.manifest.json' with { type: 'json' };
import LADDER_DEFS from './poise-ladder-defs.json' with { type: 'json' };

// The poise LADDER (Combat, top-30 item 10; PROVISIONAL numbers, Lead 2026-10-13: creatures only, the player keeps poise 0 so his feel and every PvP window are unchanged). A creature's poise is the damage a
// plain clean hit must reach to move him. The hit's size against it picks a tier, all numbers from poise-ladder-defs.json:
//   shrug   dealt < flinchFrom x poise            no stagger, no knockback (today's shrug)
//   flinch  dealt < staggerFrom x poise            a short stagger: the move's stagger x flinchStagger (and a shrug while the poise-rest below runs)
//   stagger dealt >= staggerFrom x poise           the move's full stagger, and `immunity` ticks of poise-rest: a flinch in that window is a shrug, so one big hit cannot be chained into a stunlock
// Timing is sacred: the ladder moves the stagger length and who is moved, never a wind-up, window or recovery. A sim file: integers and IEEE basic maths only. Era-keyed (poise-era.ts).
type LadderRule = { id: string; flinchFrom: number; staggerFrom: number; flinchStagger: number; immunity: number };
const POISE_TABLES = [tableFromFile(LADDER_MANIFEST.tables[0] as Manifest, LADDER_DEFS, 'poise-ladder-defs.json')];
loadRegistry(POISE_TABLES);
export const LADDER: LadderRule = (POISE_TABLES[0]!.rows as unknown as LadderRule[]).find((r) => r.id === 'ladder')!;
if (!LADDER || !(LADDER.flinchFrom > 0) || !(LADDER.staggerFrom > LADDER.flinchFrom) || !(LADDER.flinchStagger > 0 && LADDER.flinchStagger <= 1) || !Number.isInteger(LADDER.immunity) || LADDER.immunity < 0) throw Error('poise-ladder-defs: the ladder row needs 0 < flinchFrom < staggerFrom, 0 < flinchStagger <= 1 and a whole immunity >= 0');

export type PoiseTier = 'shrug' | 'flinch' | 'stagger';
/** The tier of a plain clean hit of `dealt` damage on a creature of `poise` (> 0); `resting` = a full stagger's poise-rest is still running. */
export const poiseTier = (dealt: number, poise: number, resting: boolean): PoiseTier =>
  dealt < LADDER.flinchFrom * poise ? 'shrug' : dealt < LADDER.staggerFrom * poise ? (resting ? 'shrug' : 'flinch') : 'stagger';
/** A flinch's stagger length: the move's stagger scaled, never under one tick. */
export const flinchTicks = (stun: number): number => Math.max(1, Math.round(stun * LADDER.flinchStagger));
