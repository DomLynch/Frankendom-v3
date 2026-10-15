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
};

type Brick = { id: string; kind: string; school: string; cost: number; costPerLevel: number; effect: { magnitude: number; perLevel: number }; success: { critFailBelow: number; failBelow: number; partialBelow: number; critFrom: number; partialMult: number; critMult: number } };
type CastRule = { id: string; spread: number; relDivisor: number; creditPerPoint: number; costCapFrom: number };
const TABLES = [tableFromFile(SCHOOL_MANIFEST.tables[0] as Manifest, SCHOOL_DEFS, 'school-defs.json'), tableFromFile(BRICK_MANIFEST.tables[0] as Manifest, BRICK_DEFS, 'brick-defs.json'), tableFromFile(CAST_MANIFEST.tables[0] as Manifest, CAST_RULES, 'cast-rules.json')];
loadRegistry(TABLES);
export const BRICKS: Readonly<Record<string, Brick>> = Object.fromEntries((TABLES[1]!.rows as unknown as Brick[]).map((b) => [b.id, b]));
export const CAST: CastRule = (TABLES[2]!.rows as unknown as CastRule[]).find((r) => r.id === 'cast')!;
if (!CAST || !(CAST.relDivisor > 0) || CAST.spread < 0 || CAST.creditPerPoint < 0 || !Number.isInteger(CAST.costCapFrom) || CAST.costCapFrom < 1) throw Error('cast-rules: the cast row needs spread >= 0, relDivisor > 0, creditPerPoint >= 0, costCapFrom a record version >= 1');
const INDEX = (SPELL_INDEX as unknown as { spells: Record<string, readonly [string, number]> }).spells;
for (const [id, [root, level]] of Object.entries(INDEX)) if (!Object.hasOwn(BRICKS, root) || !Number.isInteger(level) || level < 1 || level > 10) throw Error(`spell-index "${id}": root "${root}" is a brick row and level is a rank 1-10`);
export const SPELL_IDS: readonly string[] = Object.keys(INDEX);
export const isSpellId = (id: string): boolean => Object.hasOwn(INDEX, id);

/** No spell costs more than the bar (Lead, 2026-10-15: harvest at level 8 was 103 against 100, so it could never commit): the cost is capped at the stamina pool's default, read from pool-defs.json. */
export const COST_CAP: number = POOLS.find((d) => d.id === 'stamina')!.default;
/** Whether the cost cap changes this spell's cost (its uncapped cost passes the bar): such a fight is stamped no lower than the cap's record version (record.ts), so a replay resolves it the same way. */
export const spellUsesCap = (id: string): boolean => { if (!isSpellId(id)) return false; const [root, level] = INDEX[id]!, b = BRICKS[root]!; return b.cost + b.costPerLevel * level > COST_CAP; };
const clampTo = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
/** The spell `id` as `skill` (0-100, the caster's skill in its school) and `spellPower` (the sheet's dial, worn quality included) cast it; undefined for an id the catalogue does not hold. */
export function resolveSpell(id: string, skill: number, spellPower = 0, recordVersion?: number): Spell | undefined {
  if (!isSpellId(id)) return undefined;
  const [root, level] = INDEX[id]!, b = BRICKS[root]!, raw = b.cost + b.costPerLevel * level, cost = recordVersion === undefined || recordVersion >= CAST.costCapFrom ? Math.min(COST_CAP, raw) : raw, credit = Math.round(spellPower * CAST.creditPerPoint);
  return {
    id, cost, share: RULES.special.damage * b.effect.magnitude * (1 + b.effect.perLevel * (level - 1)),
    rel10: clampTo(Math.round(10 * (skill + credit - 2 * cost) / CAST.relDivisor), -500, 500), spread10: CAST.spread * 10,
    critFail10: b.success.critFailBelow * 10, fail10: b.success.failBelow * 10, partial10: b.success.partialBelow * 10, crit10: b.success.critFrom * 10,
    partialMult: b.success.partialMult, critMult: b.success.critMult,
  };
}
/** The outcome of one cast: `u` is the seeded unit draw in [0, 1) (roll.ts rollUnit). */
export function castOutcome(s: Spell, u: number): CastOutcome {
  const e = clampTo(s.rel10 + Math.round((2 * u - 1) * s.spread10), -500, 500);
  return e < s.critFail10 ? 'critfail' : e < s.fail10 ? 'fail' : e < s.partial10 ? 'partial' : e >= s.crit10 ? 'crit' : 'success';
}
/** What the outcome does to the landing: 0 is a fizzle (stamina spent, full cooldown, no damage). */
export const outcomeMult = (s: Spell, o: CastOutcome): number => (o === 'crit' ? s.critMult : o === 'success' ? 1 : o === 'partial' ? s.partialMult : 0);
