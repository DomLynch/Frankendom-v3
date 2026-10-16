import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import { RULES } from './moves.ts';
import { POOLS } from './pools.ts';
import BRICK_DEFS from './brick-defs.json' with { type: 'json' };
import BRICK_MANIFEST from './brick-defs.manifest.json' with { type: 'json' };
import CAST_RULES from './cast-rules.json' with { type: 'json' };
import CAST_MANIFEST from './cast-rules.manifest.json' with { type: 'json' };
import SCHOOL_DEFS from './school-defs.json' with { type: 'json' };
import SCHOOL_MANIFEST from './school-defs.manifest.json' with { type: 'json' };
import SPELL_INDEX from './spell-index.json' with { type: 'json' };
import HIT_DEFS from './spell-hit-defs.json' with { type: 'json' };
import HIT_MANIFEST from './spell-hit-defs.manifest.json' with { type: 'json' };

// Spells in fights (programme 2b, the cast half; Lead 2026-10-13). A spell is cast through the SKILL slot's special: the same press, the same windup, interrupt, cooldown, recovery and reach (RULES.special, timing is
// sacred). What it adds is effect, all from rows: a stamina cost, an outcome by the caster's skill, and the landing's damage share. Donor: EQEmu CheckFizzle (a cast's chance from skill against spell difficulty), AzerothCore
// spell_dbc (cost and effect as rows, a miss/resist outcome), Ryzom (the relative-level success table, programme 2b); shape only, no code copied.
// A sim file: pure integer and IEEE basic maths (no transcendental, no clock, no Math.random); the draw is roll.ts's seeded stream, so a replay reproduces every outcome.
// PROVISIONAL (Lead 2026-10-13, for Strategy/Dom to tune): credit, spread, the fizzle price, relDivisor and the bands are rows, not code.
export type CastOutcome = 'critfail' | 'fail' | 'partial' | 'success' | 'crit';
/** A spell resolved for one caster: plain numbers, so a duel state hashes and a replay builds exactly what the live fight built. `rel10` is the base relative level in tenths; the bands are in tenths too. */
export type Spell = {
  readonly id: string;           // the legend id (the spell row id without `spell:`, also Provenance.legendId and Backend's grimoire key)
  readonly cost: number;         // stamina spent when the cast commits (brick cost + costPerLevel x spell level)
  readonly share: number;        // the landing's share of the target's max health before the outcome multiplier
  readonly rel10: number;        // (skill + credit - 2 x cost) / relDivisor, tenths, clamped +/-500
  readonly spread10: number;     // the seeded draw moves rel by up to +/- this many tenths
  readonly critFail10: number; readonly fail10: number; readonly partial10: number; readonly crit10: number;
  readonly partialMult: number; readonly critMult: number;
  readonly hits: readonly number[];   // RV69 (spell-hit-defs.json): the landing's pulse weights, [1] = one landing on the release tick (a root with no row, or a record below hitsFrom); the weights split the SAME total
  readonly hitEvery: number;     // ticks between pulses (0 when there is one landing)
  readonly hitHolds: boolean;    // the caster is held back from attacking until the last pulse (a burst); false = the pulses run on while he fights (a damage over time)
};

type Brick = { id: string; kind: string; school: string; cost: number; costPerLevel: number; effect: { magnitude: number; perLevel: number }; success: { critFailBelow: number; failBelow: number; partialBelow: number; critFrom: number; partialMult: number; critMult: number } };
type CastRule = { id: string; spread: number; relDivisor: number; creditPerPoint: number; tenths: number; costWeight: number; drawSpan: number; levels: number; costCapFrom: number; hitsFrom: number };   // tenths: the fixed-point scale of rel and the bands; costWeight: the cost's weight in the relative level; drawSpan: the seeded unit draw maps onto +/- spread over this width; levels: the top spell level
const TABLES = [tableFromFile(SCHOOL_MANIFEST.tables[0] as Manifest, SCHOOL_DEFS, 'school-defs.json'), tableFromFile(BRICK_MANIFEST.tables[0] as Manifest, BRICK_DEFS, 'brick-defs.json'), tableFromFile(CAST_MANIFEST.tables[0] as Manifest, CAST_RULES, 'cast-rules.json'), tableFromFile(HIT_MANIFEST.tables[0] as Manifest, HIT_DEFS, 'spell-hit-defs.json')];
loadRegistry(TABLES);
export const BRICKS: Readonly<Record<string, Brick>> = Object.fromEntries((TABLES[1]!.rows as unknown as Brick[]).map((b) => [b.id, b]));
export const CAST: CastRule = (TABLES[2]!.rows as unknown as CastRule[]).find((r) => r.id === 'cast')!;
if (!CAST || !(CAST.relDivisor > 0) || CAST.spread < 0 || CAST.creditPerPoint < 0 || ![CAST.tenths, CAST.costWeight, CAST.drawSpan, CAST.levels].every((n) => Number.isInteger(n) && n > 0) || !Number.isInteger(CAST.costCapFrom) || CAST.costCapFrom < 1 || !Number.isInteger(CAST.hitsFrom) || CAST.hitsFrom < CAST.costCapFrom) throw Error('cast-rules: the cast row needs spread >= 0, relDivisor > 0, creditPerPoint >= 0, tenths / costWeight / drawSpan / levels positive integers');
const INDEX = (SPELL_INDEX as unknown as { spells: Record<string, readonly [string, number]> }).spells;
for (const [id, [root, level]] of Object.entries(INDEX)) if (!Object.hasOwn(BRICKS, root) || !Number.isInteger(level) || level < 1 || level > CAST.levels) throw Error(`spell-index "${id}": root "${root}" is a brick row and level is a rank 1-10`);
type HitRow = { id: string; every: number; ramp: readonly number[]; holds: number };
/** The pulse rows by root (spell-hit-defs.json): a root with a row lands its share as pulses instead of one strike, from record version CAST.hitsFrom. */
export const HITS: Readonly<Record<string, HitRow>> = Object.fromEntries((TABLES[3]!.rows as unknown as HitRow[]).map((h) => {
  const bad = (why: string) => Error(`spell-hit-defs "${h.id}": ${why}`);
  if (!Object.hasOwn(BRICKS, h.id)) throw bad('is no root (brick-defs.json)');
  if (!Number.isInteger(h.every) || h.every < 1) throw bad('every is a whole number of ticks >= 1');
  if (!Array.isArray(h.ramp) || h.ramp.length < 2 || h.ramp.some((w) => !Number.isInteger(w) || w < 1)) throw bad('ramp is two or more whole weights >= 1, one per pulse');
  if (h.holds !== 0 && h.holds !== 1) throw bad('holds is 0 or 1');
  return [h.id, h];
}));
export const SPELL_IDS: readonly string[] = Object.keys(INDEX);
export const isSpellId = (id: string): boolean => Object.hasOwn(INDEX, id);

/** No spell costs more than the bar (Lead, 2026-10-15: harvest at level 8 was 103 against 100, so it could never commit): the cost is capped at the stamina pool's default, read from pool-defs.json. */
export const COST_CAP: number = POOLS.find((d) => d.id === 'stamina')!.default;
/** Whether the cost cap changes this spell's cost (its uncapped cost passes the bar): such a fight is stamped no lower than the cap's record version (record.ts), so a replay resolves it the same way. */
/** Whether this spell lands as pulses (its root has a spell-hit-defs row): such a fight is stamped no lower than CAST.hitsFrom (record.ts), so a replay resolves it the same way. */
export const spellUsesHits = (id: string): boolean => isSpellId(id) && Object.hasOwn(HITS, INDEX[id]![0]);
export const spellUsesCap = (id: string): boolean => { if (!isSpellId(id)) return false; const [root, level] = INDEX[id]!, b = BRICKS[root]!; return b.cost + b.costPerLevel * level > COST_CAP; };
const clampTo = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
/** The spell `id` as `skill` (0-100, the caster's skill in its school) and `spellPower` (the sheet's dial, worn quality included) cast it; undefined for an id the catalogue does not hold. */
export function resolveSpell(id: string, skill: number, spellPower = 0, recordVersion?: number): Spell | undefined {
  if (!isSpellId(id)) return undefined;
  const [root, level] = INDEX[id]!, b = BRICKS[root]!, raw = b.cost + b.costPerLevel * level, cost = recordVersion === undefined || recordVersion >= CAST.costCapFrom ? Math.min(COST_CAP, raw) : raw, credit = Math.round(spellPower * CAST.creditPerPoint), hit = (recordVersion === undefined || recordVersion >= CAST.hitsFrom) ? HITS[root] : undefined;   // a record below hitsFrom resolves one landing, exactly as before
  return {
    id, cost, share: RULES.special.damage * b.effect.magnitude * (1 + b.effect.perLevel * (level - 1)),
    rel10: clampTo(Math.round(CAST.tenths * (skill + credit - CAST.costWeight * cost) / CAST.relDivisor), -500, 500), spread10: CAST.spread * CAST.tenths,
    critFail10: b.success.critFailBelow * CAST.tenths, fail10: b.success.failBelow * CAST.tenths, partial10: b.success.partialBelow * CAST.tenths, crit10: b.success.critFrom * CAST.tenths,
    partialMult: b.success.partialMult, critMult: b.success.critMult,
    hits: hit ? hit.ramp : [1], hitEvery: hit ? hit.every : 0, hitHolds: !!hit && hit.holds === 1,
  };
}
/** The outcome of one cast: `u` is the seeded unit draw in [0, 1) (roll.ts rollUnit). */
export function castOutcome(s: Spell, u: number): CastOutcome {
  const e = clampTo(s.rel10 + Math.round((CAST.drawSpan * u - 1) * s.spread10), -500, 500);
  return e < s.critFail10 ? 'critfail' : e < s.fail10 ? 'fail' : e < s.partial10 ? 'partial' : e >= s.crit10 ? 'crit' : 'success';
}
/** What the outcome does to the landing: 0 is a fizzle (stamina spent, full cooldown, no damage). */
export const outcomeMult = (s: Spell, o: CastOutcome): number => (o === 'crit' ? s.critMult : o === 'success' ? 1 : o === 'partial' ? s.partialMult : 0);

/** Pulse k's damage out of a landing's `total`: its weight's share of `ramp`, the last pulse taking the rounding remainder so a full volley deals exactly `total` (as cone-rules.ts pulseDamage). */
export function splitDamage(ramp: readonly number[], total: number, k: number): number {
  const sum = ramp.reduce((a, b) => a + b, 0);
  if (k === ramp.length - 1) { let done = 0; for (let i = 0; i < k; i++) done += Math.round((total * ramp[i]!) / sum); return Math.max(0, total - done); }
  return Math.round((total * ramp[k]!) / sum);
}
