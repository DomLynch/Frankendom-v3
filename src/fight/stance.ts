// Stances, defined ONCE (Dom's ruling 2026-10-07, docs/specs/origins/combat-study.md "stances and opponent mood"; one system: the AI's mood presets ARE these stances). A symmetric trade-off every fighter
// picks freely, never a timing change (no swing speed, parry window, i-frames, reach or input; v52 enforces it: stance-defs.json takes no window). Each entry is a signed per-mille delta on ONE quantity, read at its site in src/fight/duel.ts through
// `stanced`, exactly as a patron perk is (`perked`): a fighter with no stance (Neutral) takes the unscaled value untouched, so no float drift and a stance-less fight is byte for byte as before.
// A sim file: no Math.random, no clock, no transcendental. The numbers are Dom's table; the damage delta starts at +-5% (Lead), his +-10% is the ceiling the battery may raise it to.
import { rollUnit } from './roll.ts';
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import { STANCE_ROWS_ON } from './stance-era.ts';
import STANCE_DEFS from './stance-defs.json' with { type: 'json' };
import STANCE_MANIFEST from './stance-defs.manifest.json' with { type: 'json' };
import { LEGACY_DEFENSIVE_ROWS } from './stance-legacy-rows.ts';   // rows: stance-legacy-defs.json
export type StanceId = 'aggressive' | 'defensive' | 'trickster';
export type PickedStance = StanceId | 'neutral';   // what a player picks (and a record names): Neutral is a real pick, the safe middle
export const PICKS: readonly PickedStance[] = ['neutral', 'aggressive', 'defensive', 'trickster'];   // append only: the index is the record's 2-bit code
// A stance moves a NUMBER, never a timing (Strategy 2026-10-13: timing is sacred). The rows (stance-defs.json, through the shared loader) may carry only these quantities; the loader refuses any other key,
// so a `window`, a tick count or a speed cannot be added as a stance row. damageTaken: health damage taken; poise: posture taken; recover: how fast posture drains back.
export const STANCE_KEYS = ['damage', 'heavyDamage', 'posture', 'kickPosture', 'block', 'feint', 'recover', 'damageTaken', 'poise'] as const;
export type StanceKey = (typeof STANCE_KEYS)[number];
type Deltas = Readonly<Partial<Record<StanceKey, number>>>;
const TABLE = tableFromFile(STANCE_MANIFEST.tables[0] as Manifest, STANCE_DEFS, 'stance-defs.json');
loadRegistry([TABLE]);
export function stanceRows(rows: readonly Record<string, unknown>[]): Readonly<Record<StanceId, Deltas>> {
  const out: Record<string, Record<string, number>> = {};
  for (const { id, ...deltas } of rows) {
    for (const [k, v] of Object.entries(deltas)) {
      if (!(STANCE_KEYS as readonly string[]).includes(k)) throw Error(`stance-defs "${String(id)}": "${k}" is not a stance quantity (${STANCE_KEYS.join(', ')}); a stance never touches a timing`);
      if (typeof v !== 'number' || !Number.isInteger(v) || v < -1000 || v > 1000) throw Error(`stance-defs "${String(id)}": ${k} is a whole per-mille delta from -1000 to 1000`);
    }
    out[id as string] = deltas as Record<string, number>;
  }
  return out as Readonly<Record<StanceId, Deltas>>;
}
export const STANCES: Readonly<Record<StanceId, Deltas>> = stanceRows(TABLE.rows as unknown as Record<string, unknown>[]);
// The Defensive stance BEFORE v52 (stance-era.ts): the same deltas plus a parry window and a guard-counter window a quarter longer. Read only while a record below 52 replays.
const LEGACY_DEFENSIVE: Readonly<Partial<Record<StanceId, Readonly<Partial<Record<StanceKey | 'window' | 'counter', number>>>>>> = LEGACY_DEFENSIVE_ROWS as unknown as Readonly<Partial<Record<StanceId, Readonly<Partial<Record<StanceKey | 'window' | 'counter', number>>>>>>;
const rowOf = (f: { stance?: StanceId }): Readonly<Partial<Record<StanceKey | 'window' | 'counter', number>>> | undefined => (f.stance ? (STANCE_ROWS_ON ? undefined : LEGACY_DEFENSIVE[f.stance]) ?? STANCES[f.stance] : undefined);
export const stanced = (f: { stance?: StanceId }, key: StanceKey | 'window' | 'counter', x: number): number => { const d = rowOf(f)?.[key]; return d ? (x * (1000 + d)) / 1000 : x; };
// The AI's mood: drawn from the fight seed (a replay re-sims it exactly), 50% its home stance and 50% one of the other three picks. Home stances are the ruling's; every other opponent's home is Neutral.
const HOME: Readonly<Record<string, StanceId>> = { executioner: 'aggressive', shieldmaiden: 'defensive', goblin: 'trickster' };
export const homePick = (opponent: string): PickedStance => HOME[opponent] ?? 'neutral';
export function moodOf(seed: number, opponent: string): PickedStance {
  const home = homePick(opponent), u = rollUnit((seed ^ 0x3c6ef372) >>> 0, 0);
  if (u < 0.5) return home;
  const others = PICKS.filter(p => p !== home);
  return others[Math.min(others.length - 1, Math.floor((u - 0.5) * 2 * others.length))];
}
export const asStance = (pick: PickedStance): StanceId | undefined => (pick === 'neutral' ? undefined : pick);
