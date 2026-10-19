// Stances, defined ONCE (Dom's ruling 2026-10-07, docs/specs/origins/combat-study.md "stances and opponent mood"; one system: the AI's mood presets ARE these stances). A symmetric trade-off every fighter
// picks freely, never a timing change (no swing speed, parry window, i-frames, reach or input; v52 enforces it: stance-defs.json takes no window). Each entry is a signed per-mille delta on ONE quantity, read at its site in src/fight/duel.ts through
// `stanced`, exactly as a patron perk is (`perked`): a fighter with no stance (Neutral) takes the unscaled value untouched, so no float drift and a stance-less fight is byte for byte as before.
// A sim file: no Math.random, no clock, no transcendental. The numbers are Dom's table; the damage delta starts at +-5% (Lead), his +-10% is the ceiling the battery may raise it to.
import { rollUnit } from './roll.ts';
import CATALOGUE_ROWS from './catalogue-data.ts';
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
const WOUND_TABLE = tableFromFile(STANCE_MANIFEST.tables[1] as Manifest, STANCE_DEFS, 'stance-defs.json');
loadRegistry([TABLE, WOUND_TABLE]);
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
// Wounds that matter (sandbox-mech: wounds): a wound row (stance-defs.json `wounds`) is { id, site, ...the same per-mille quantities as a stance }. The first blade wound
// at `site` scars the defender with that id for the rest of the duel (duel.ts `wound`), and every stanced() read below carries the scar's delta on top of the stance.
// No rows = no scar is ever set (the fighter has no `scars` field, so the duel hash is byte-identical) and stanced() is unchanged.
const SITES = ['head', 'torso', 'legs'];
const WOUND_TEXT: Record<string, { label: string; note: string }> = {};   // optional label + note columns: what the on-screen notice says (wound-notice.ts)
const WOUND_BELOW: Record<string, number> = {};   // optional `below` column: the scar only forms once the defender is at or under this percent of max health (arm wound: 10)
const WOUND_CEIL: Record<string, number> = {};   // optional `ceil` column: stamina points the scar takes off the ceiling for the rest of the duel (UO Mortal Strike / SWG wounds)
const WOUNDS: Readonly<Record<string, Deltas & { site: string }>> = Object.fromEntries((WOUND_TABLE.rows as unknown as Record<string, unknown>[]).map(({ id, site, label, note, ceil, below, ...deltas }) => {
  if (below !== undefined) { if (typeof below !== 'number' || !Number.isInteger(below) || below < 1 || below > 100) throw Error(`stance-defs wound "${String(id)}": below is a whole percent of max health, 1 to 100`); WOUND_BELOW[id as string] = below; }
  if (ceil !== undefined) { if (typeof ceil !== 'number' || !Number.isInteger(ceil) || ceil < 0 || ceil > 100) throw Error(`stance-defs wound "${String(id)}": ceil is whole stamina points, 0 to 100`); WOUND_CEIL[id as string] = ceil; }
  if (typeof site !== 'string' || !SITES.includes(site)) throw Error(`stance-defs wound "${String(id)}": site is one of ${SITES.join(', ')}`);
  if (typeof label === 'string') WOUND_TEXT[id as string] = { label, note: typeof note === 'string' ? note : '' };
  return [id as string, { ...stanceRows([{ id, ...deltas }])[id as StanceId], site }];
}));
export const woundCeil = (id: string): number => WOUND_CEIL[id] ?? 0;
export const woundText = (id: string): { label: string; note: string } | undefined => WOUND_TEXT[id];
export const woundsAt = (site: string, healthPct = 100): string[] => Object.keys(WOUNDS).filter((id) => WOUNDS[id]!.site === site && healthPct <= (WOUND_BELOW[id] ?? 100));
type Scarred = { stance?: StanceId; scars?: readonly string[] };
export const stanced = (f: Scarred, key: StanceKey | 'window' | 'counter', x: number): number => {
  const d = rowOf(f)?.[key]; let y = d ? (x * (1000 + d)) / 1000 : x;
  if (f.scars) for (const id of f.scars) { const w = WOUNDS[id]?.[key as StanceKey]; if (w) y = (y * (1000 + w)) / 1000; }
  return y;
};
// The AI's mood: drawn from the fight seed (a replay re-sims it exactly), 50% its home stance and 50% one of the other three picks. Home stances are the ruling's; every other opponent's home is Neutral.
const HOME = new Map<string, PickedStance>(CATALOGUE_ROWS.map((r) => [r.id, r.home as PickedStance]));   // each opponent's home stance is its catalogue row's `home` field (catalogue-data.ts)
export const homePick = (opponent: string): PickedStance => HOME.get(opponent) ?? 'neutral';
export function moodOf(seed: number, opponent: string): PickedStance {
  const home = homePick(opponent), u = rollUnit((seed ^ 0x3c6ef372) >>> 0, 0);
  if (u < 0.5) return home;
  const others = PICKS.filter(p => p !== home);
  return others[Math.min(others.length - 1, Math.floor((u - 0.5) * 2 * others.length))];
}
export const asStance = (pick: PickedStance): StanceId | undefined => (pick === 'neutral' ? undefined : pick);
