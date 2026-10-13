import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import { kindOf } from './damage-kinds.ts';
import { RULES, SPECIAL_SETS, specialOf } from './moves.ts';
import CONE_MANIFEST from './cone-defs.manifest.json' with { type: 'json' };
import CONE_DEFS from './cone-defs.json' with { type: 'json' };

// The BREATH CONE (Combat, top-30 item 23; PROVISIONAL numbers). A special named in cone-defs.json does not strike once on its release tick: it breathes. From the release the caster fixes his heading on the
// target, and every `every` ticks one PULSE tests the cone (the target within `range` of the caster and within `angle` degrees, centred on that heading): a pulse inside deals its weight (`ramp`, normalised) of
// the special's usual damage, so a target that stays through the whole breath takes exactly what the instant special took, and one that steps out of the cone takes less. The caster is held back from attacking
// (specialRecover) until the breath and the usual recovery are over. A sim file: integers and IEEE basic maths only, no clock. Era-keyed (cone-era.ts); `creatures` is the list of fighters that have it and is
// checked against SPECIAL_SETS at load, and `range` may not pass the special's reach (the AI casts and the commit gates on RULES.special.reach, so a longer cone needs an AI change, not a row).
type ConeRow = { id: string; angle: number; range: number; every: number; ramp: readonly number[]; damageKind: string; creatures: readonly string[] };
const CONE_TABLE = tableFromFile(CONE_MANIFEST.tables[0] as Manifest, CONE_DEFS, 'cone-defs.json');
loadRegistry([CONE_TABLE]);
export const CONES: Readonly<Record<string, ConeRow>> = Object.fromEntries((CONE_TABLE.rows as unknown as ConeRow[]).map((c) => {
  const bad = (why: string) => Error(`cone-defs "${c.id}": ${why}`);
  if (!Object.values(SPECIAL_SETS).some((set) => (set as readonly string[]).includes(c.id))) throw bad('is no special name (moves.ts SPECIAL_SETS)');
  if (!(c.angle > 0 && c.angle <= 360) || !(c.range > 0 && c.range <= RULES.special.reach)) throw bad(`angle is 0-360 degrees and range 0-${RULES.special.reach} m (the special's reach)`);
  if (!Number.isInteger(c.every) || c.every < 1) throw bad('every is a whole number of ticks >= 1');
  if (!Array.isArray(c.ramp) || !c.ramp.length || c.ramp.some((w) => !Number.isInteger(w) || w < 1)) throw bad('ramp is a list of whole weights >= 1, one per pulse');
  if (!kindOf(c.damageKind)) throw bad(`damageKind "${c.damageKind}" is no row of damage-kind-defs.json`);
  if (!Array.isArray(c.creatures) || !c.creatures.length) throw bad('creatures names the fighters that have it');
  for (const o of c.creatures) if (!((SPECIAL_SETS as Record<string, readonly string[]>)[o] ?? []).includes(c.id)) throw bad(`creature "${o}" does not have the special "${c.id}"`);
  return [c.id, c];
}));
export const coneOf = (name: string | undefined): ConeRow | undefined => (name === undefined ? undefined : CONES[name]);
/** Total ticks a breath runs from the release (the last pulse lands on it). */
export const breathTicks = (c: ConeRow): number => c.every * c.ramp.length;
/** Does a target at (dx, dz) from the caster, with the caster facing `heading`, stand in the cone? `bearing` is aim(caster, target), `dist` their distance; the caller supplies both from the sim's own maths. */
export const inCone = (c: ConeRow, dist: number, bearingOff: number): boolean => dist <= c.range && Math.abs(bearingOff) <= (c.angle / 2) * (Math.PI / 180);
/** Pulse k's damage out of the special's `total`: its ramp weight's share, the last pulse taking the rounding remainder so a full breath deals exactly `total`. */
export function pulseDamage(c: ConeRow, total: number, k: number): number {
  const sum = c.ramp.reduce((a, b) => a + b, 0);
  if (k === c.ramp.length - 1) { let done = 0; for (let i = 0; i < k; i++) done += Math.round((total * c.ramp[i]!) / sum); return Math.max(0, total - done); }
  return Math.round((total * c.ramp[k]!) / sum);
}
/** The name of the cone special a creature casts at `level`, if its special has a row (used by the record stamp). */
export const coneAt = (opponent: Parameters<typeof specialOf>[0], level: number): ConeRow | undefined => coneOf(specialOf(opponent, level) ?? undefined);
