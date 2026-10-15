import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import { WEAPONS, type MoveId, type WeaponId } from './moves.ts';
import BAND_DEFS from './band-defs.json' with { type: 'json' };
import BAND_MANIFEST from './band-defs.manifest.json' with { type: 'json' };

// Positioning bands (spec docs/specs/combat/positioning-gates.md, Strategy's rulings 2026-10-15; behind a flag, default off: a Duel without `bands` fights byte for byte as before).
// A weapon's blows have a working span from max(its minReach, the fighters' contact gap) out to its longest own blow's reach; the span is cut into three rings, inner / mid / outer, by two fractions (rows).
// A weapon has a bestBand (rows): its clean blow lands at x1.0 there and at offBandMult off it. A blow that is already a hard miss (inside minReach, out of reach) stays a miss: the factor is applied only
// to a hit that landed. Chip through a block is never scaled (the band changes what lands, not what a block costs). Edges come from the weapon's own reach and minReach, not new metres per weapon.
// A sim file: it imports only the shared row loader and the weapon rows. Pure: gap in, number out.
const RULE_T = tableFromFile(BAND_MANIFEST.tables[0] as unknown as Manifest, BAND_DEFS, 'band-defs.json');
const BAND_T = tableFromFile(BAND_MANIFEST.tables[1] as unknown as Manifest, BAND_DEFS, 'band-defs.json');
const BLOW_T = tableFromFile(BAND_MANIFEST.tables[2] as unknown as Manifest, BAND_DEFS, 'band-defs.json');
const WEAPON_T = tableFromFile(BAND_MANIFEST.tables[3] as unknown as Manifest, BAND_DEFS, 'band-defs.json');
loadRegistry([RULE_T, BAND_T, BLOW_T, WEAPON_T]);
const rule = (id: string): number => { const r = (RULE_T.rows as unknown as { id: string; value: number }[]).find((x) => x.id === id); if (!r || !(r.value >= 0)) throw Error(`band-defs: the rule "${id}" needs a row with a value >= 0`); return r.value; };
/** The ring ids from the innermost out (a row order). */
export const BANDS: readonly string[] = (BAND_T.rows as unknown as { id: string }[]).map((r) => r.id);
const CONTACT = rule('contactGap'), INNER_FRAC = rule('innerFrac'), MID_FRAC = rule('midFrac'), OFF_BAND_MULT = rule('offBandMult');
for (const must of ['contactGap', 'offBandMult', 'holdForward', 'holdBack']) if (!(rule(must) > 0)) throw Error(`band-defs: "${must}" is above 0`);
if (BANDS.length !== 3) throw Error('band-defs: exactly three bands (inner, mid, outer)');
if (!(INNER_FRAC < MID_FRAC && MID_FRAC < 1)) throw Error('band-defs: 0 < innerFrac < midFrac < 1');
if (OFF_BAND_MULT > 1) throw Error('band-defs: offBandMult is at most 1 (an off-band blow is never stronger)');
/** Weapon id -> its best band. A weapon with no row has no band: its blows are never scaled. */
export const BEST_BAND: Readonly<Record<string, string>> = Object.fromEntries((WEAPON_T.rows as unknown as { id: string; bestBand: string }[]).map((r) => {
  if (!Object.hasOwn(WEAPONS, r.id)) throw Error(`band-defs: "${r.id}" is not a weapon row`);
  if (!BANDS.includes(r.bestBand)) throw Error(`band-defs: "${r.id}" bestBand "${r.bestBand}" is not one of ${BANDS.join(', ')}`);
  return [r.id, r.bestBand];
}));
export const OFF_BAND = OFF_BAND_MULT;
/** The walk speeds of the AI's holdBand step in and back (fractions of walking speed; rows: the same walk ai.ts already uses to close in and to give ground). */
export const HOLD_FORWARD = rule('holdForward'), HOLD_BACK = rule('holdBack'), HOLD_MARGIN = rule('holdMargin'), HOLD_BACK_ON = rule('holdBackOn') > 0, HOLD_ONLY_IN_OPENING = rule('holdOnlyInOpening') > 0;   // margin: metres past a band edge before the AI steps; backOn: whether it also steps back from inside the band

/** The blows that define a weapon's working span (rows: band-defs.json spanBlows): the weapon's own blows, not the shared skill moves or the kick. */
const OWN_BLOWS: readonly MoveId[] = (BLOW_T.rows as unknown as { id: string }[]).map((r) => {
  if (!Object.hasOwn(WEAPONS.longsword.moves, r.id)) throw Error(`band-defs: spanBlows "${r.id}" is not a move id`);
  return r.id as MoveId;
});
/** [lo, hi] of a weapon's working span in metres: from its minimum reach (or the contact gap) to its longest own blow. */
export function spanOf(weapon: WeaponId): readonly [number, number] {
  const moves = WEAPONS[weapon].moves, own = OWN_BLOWS.map((id) => moves[id]);
  const hi = Math.max(...own.map((m) => m.reach)), lo = Math.max(CONTACT, ...own.map((m) => m.minReach ?? 0));
  return [Math.min(lo, hi), hi];
}
/** The ring a gap falls in for this weapon: inside the span's first fraction is inner, then mid, the rest (out to and past the reach) outer. */
export function bandAt(weapon: WeaponId, gap: number): string {
  const [lo, hi] = spanOf(weapon), span = hi - lo;
  return gap < lo + INNER_FRAC * span ? BANDS[0]! : gap < lo + MID_FRAC * span ? BANDS[1]! : BANDS[2]!;
}
/** The factor on a clean blow started at this gap: 1 in the weapon's best band (or with no band row), offBandMult elsewhere. */
export function bandFactor(weapon: WeaponId, gap: number): number {
  const best = BEST_BAND[weapon];
  return best === undefined || bandAt(weapon, gap) === best ? 1 : OFF_BAND_MULT;
}
/** The gap range [from, to) of a weapon's best band, in metres (the last ring is open-ended up to the reach); undefined for a weapon with no band row. */
export function bestRange(weapon: WeaponId): readonly [number, number] | undefined {
  const best = BEST_BAND[weapon]; if (best === undefined) return undefined;
  const [lo, hi] = spanOf(weapon), span = hi - lo, i = BANDS.indexOf(best);
  return [i === 0 ? lo : lo + (i === 1 ? INNER_FRAC : MID_FRAC) * span, i === 0 ? lo + INNER_FRAC * span : i === 1 ? lo + MID_FRAC * span : hi];
}
