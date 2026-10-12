// Gear as rows (Wave A1): a worn SET tilts two dials of the sheet against each other (plate +25 armour / -25 magic resist, robes the reverse), and is not on the sheet itself (Dom, 2026-10-13).
// A tilt is a row (up dial, down dial, amount, capped by the `gear` rule row at 25); a piece is a row (slot, weight, wearMax, `resist{school}` for the damage events that will carry a school,
// and the tilt its set gives). Light, medium and heavy are three PRESET rows in the same table, not a type: a piece names one with `extends` and overrides what it likes. A set the player
// wears resolves to its dial deltas HERE, outside the duel; the duel sees only the resolved sheet (sheet-rows.ts), so a tier, a slot or a table never crosses the seam.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import { ARMOUR_SLOTS } from '../core/loot.ts';
import { DIALS } from './sheet-rows.ts';
import { SCHOOL_IDS } from './schools.ts';
import GEAR_DEFS from './gear-defs.json' with { type: 'json' };
import GEAR_MANIFEST from './gear-defs.manifest.json' with { type: 'json' };

export type Tilt = { readonly id: string; readonly up: string; readonly down: string; readonly amount: number };
export type GearRow = { readonly id: string; readonly slot: string | null; readonly preset: boolean; readonly tilt: string | null; readonly weight: number; readonly wearMax: number; readonly resist: Readonly<Record<string, number>> };
export type GearTable = { readonly tilts: Readonly<Record<string, Tilt>>; readonly rows: Readonly<Record<string, GearRow>>; readonly sets: Readonly<Record<string, string>>; readonly tiltMax: number };   // sets: loot opponent id -> the tilt its armour set gives (an opponent no row names gives none: the medium preset)

type RawRow = { id: string; slot?: string; preset?: boolean; extends?: string; tilt?: string; weight: number; wearMax: number; resist: Record<string, number> };

export function loadGearDefs(raw: { tilts?: readonly unknown[]; gear?: readonly unknown[]; sets?: readonly unknown[]; rules?: readonly unknown[] }, schools: readonly string[] = SCHOOL_IDS, slots: readonly string[] = ARMOUR_SLOTS, dials: readonly string[] = DIALS.map((d) => d.id)): GearTable {
  loadRegistry(GEAR_MANIFEST.tables.map((t) => tableFromFile(t as unknown as Manifest, raw, 'gear-defs.json')));
  const rules = (raw.rules ?? []) as readonly { id: string; tiltMax: number }[];
  if (rules.length !== 1 || rules[0]!.id !== 'gear' || rules[0]!.tiltMax < 1) throw Error('gear-defs: exactly one rule row, "gear", with a tiltMax from 1');
  const tiltMax = rules[0]!.tiltMax, tilts: Record<string, Tilt> = {};
  for (const t of (raw.tilts ?? []) as readonly Tilt[]) {
    if (!dials.includes(t.up) || !dials.includes(t.down) || t.up === t.down) throw Error(`gear-defs tilt "${t.id}": up and down are two different dial rows`);
    if (t.amount < 1 || t.amount > tiltMax) throw Error(`gear-defs tilt "${t.id}": amount is 1..${tiltMax} (a set moves two dials against each other by at most ${tiltMax})`);
    tilts[t.id] = t;
  }
  const defs = (raw.gear ?? []) as readonly RawRow[], byId = new Map(defs.map((r) => [r.id, r])), out: Record<string, GearRow> = {};
  for (const r of defs) {
    const base = r.extends === undefined ? undefined : byId.get(r.extends);
    if (r.extends !== undefined && (!base || !base.preset)) throw Error(`gear-defs "${r.id}": extends "${r.extends}", which is no preset row`);
    const slot = r.slot ?? null, preset = !!r.preset;
    if (!preset && (slot === null || !slots.includes(slot))) throw Error(`gear-defs "${r.id}": a piece names its slot (${slots.join(', ')})`);
    if (r.weight < 0 || r.wearMax < 1) throw Error(`gear-defs "${r.id}": weight is not negative and wearMax is at least 1`);
    const resist = { ...(base?.resist ?? {}), ...r.resist };
    for (const [school, n] of Object.entries(resist)) if (!schools.includes(school) || !Number.isInteger(n) || Math.abs(n) > 4) throw Error(`gear-defs "${r.id}": resist ${school} is a school row and a whole number within +-4`);
    out[r.id] = { id: r.id, slot, preset, tilt: r.tilt ?? base?.tilt ?? null, weight: r.weight, wearMax: r.wearMax, resist };
  }
  const sets = Object.fromEntries(((raw.sets ?? []) as readonly { id: string; tilt: string }[]).map((s) => [s.id, s.tilt]));
  return { tilts, rows: out, sets, tiltMax };
}

export const GEAR: GearTable = loadGearDefs(GEAR_DEFS);

// A tilt's dial deltas: the `up` dial gains and the `down` dial loses the same whole number of points, `amount` scaled by `fraction` (how much of the set is worn, 0..1; a full set is 1).
export function tiltOf(tiltId: string, fraction = 1): Readonly<Record<string, number>> {
  const t = GEAR.tilts[tiltId];
  if (!t) throw Error(`tiltOf: "${tiltId}" is not a tilt row (gear-defs.json tilts)`);
  const n = Math.round(t.amount * Math.max(0, Math.min(1, fraction)));
  return n ? { [t.up]: n, [t.down]: -n } : {};
}
