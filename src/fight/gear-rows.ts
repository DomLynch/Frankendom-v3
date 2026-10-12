// Gear as rows (Wave A1, Dom's locked sheet, option C): a worn SET is worth 50 on top of the build, and is not on the sheet itself. 25 is SHAPE: the set row says which dials go up and which go down
// (plate +25 armour / -25 magic resist, robes the reverse, leathers stamina up / armour down). 25 is QUALITY: common 0 up to legendary 25, spread over dials by the set row's weights. Every dial
// still caps at 100 wherever its points come from (sheet-rows.ts `sheetOf` holds it), so gear fills what the points did not. A piece is a row (slot, weight, wearMax, a per-school `resist` map for
// damage events that will carry a school, and its set); light / medium / heavy are three PRESET rows a piece `extends`, not a type; `owners` rows say which loot opponent's armour belongs to which
// set. The worn set resolves to dial deltas HERE, outside the duel; the duel sees only the resolved sheet, so a tier, a slot or a table never crosses the seam. Weight is data (it will cost stamina and
// tax casting when casting exists); wear bites quality first and the gear's own level (wearable up to 5 levels above the player's) belong to the loot rows (Backend / Characters), not here.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import { ARMOUR_SLOTS } from '../core/loot.ts';
import { DIALS } from './sheet-rows.ts';
import { SCHOOL_IDS } from './schools.ts';
import GEAR_DEFS from './gear-defs.json' with { type: 'json' };
import GEAR_MANIFEST from './gear-defs.manifest.json' with { type: 'json' };

export type GearSet = { readonly id: string; readonly shape: Readonly<Record<string, number>>; readonly quality: Readonly<Record<string, number>> };
export type GearRow = { readonly id: string; readonly slot: string | null; readonly preset: boolean; readonly set: string | null; readonly weight: number; readonly wearMax: number; readonly resist: Readonly<Record<string, number>> };
export type GearTable = { readonly sets: Readonly<Record<string, GearSet>>; readonly owners: Readonly<Record<string, string>>; readonly rows: Readonly<Record<string, GearRow>>; readonly shapeMax: number; readonly qualityMax: number };   // owners: loot opponent id -> the set its armour belongs to

type RawRow = { id: string; slot?: string; preset?: boolean; extends?: string; set?: string; weight: number; wearMax: number; resist: Record<string, number> };

export function loadGearDefs(raw: { sets?: readonly unknown[]; owners?: readonly unknown[]; gear?: readonly unknown[]; rules?: readonly unknown[] }, schools: readonly string[] = SCHOOL_IDS, slots: readonly string[] = ARMOUR_SLOTS, dials: readonly string[] = DIALS.map((d) => d.id)): GearTable {
  loadRegistry(GEAR_MANIFEST.tables.map((t) => tableFromFile(t as unknown as Manifest, raw, 'gear-defs.json')));
  const rules = (raw.rules ?? []) as readonly { id: string; shapeMax: number; qualityMax: number }[];
  if (rules.length !== 1 || rules[0]!.id !== 'gear' || rules[0]!.shapeMax < 1 || rules[0]!.qualityMax < 1) throw Error('gear-defs: exactly one rule row, "gear", with a shapeMax and a qualityMax from 1');
  const { shapeMax, qualityMax } = rules[0]!, sets: Record<string, GearSet> = {};
  for (const t of (raw.sets ?? []) as readonly GearSet[]) {
    const ups = Object.values(t.shape).filter((n) => n > 0).reduce((a, b) => a + b, 0);
    for (const [dial, n] of Object.entries(t.shape)) if (!dials.includes(dial) || !Number.isInteger(n) || n === 0 || Math.abs(n) > shapeMax) throw Error(`gear-defs set "${t.id}": shape ${dial} is a dial row and a whole number within +-${shapeMax}`);
    if (!ups || ups > shapeMax || !Object.values(t.shape).some((n) => n < 0)) throw Error(`gear-defs set "${t.id}": shape moves some dials up (at most ${shapeMax} in all) against some down`);
    if (!Object.keys(t.quality).length) throw Error(`gear-defs set "${t.id}": quality names the dials it spreads over`);
    for (const [dial, w] of Object.entries(t.quality)) if (!dials.includes(dial) || !Number.isInteger(w) || w < 1) throw Error(`gear-defs set "${t.id}": quality ${dial} is a dial row and a whole weight from 1`);
    sets[t.id] = t;
  }
  const owners = Object.fromEntries(((raw.owners ?? []) as readonly { id: string; set: string }[]).map((o) => [o.id, o.set]));
  const defs = (raw.gear ?? []) as readonly RawRow[], byId = new Map(defs.map((r) => [r.id, r])), out: Record<string, GearRow> = {};
  for (const r of defs) {
    const base = r.extends === undefined ? undefined : byId.get(r.extends);
    if (r.extends !== undefined && (!base || !base.preset)) throw Error(`gear-defs "${r.id}": extends "${r.extends}", which is no preset row`);
    const slot = r.slot ?? null, preset = !!r.preset;
    if (!preset && (slot === null || !slots.includes(slot))) throw Error(`gear-defs "${r.id}": a piece names its slot (${slots.join(', ')})`);
    if (r.weight < 0 || r.wearMax < 1) throw Error(`gear-defs "${r.id}": weight is not negative and wearMax is at least 1`);
    const resist = { ...(base?.resist ?? {}), ...r.resist };
    for (const [school, n] of Object.entries(resist)) if (!schools.includes(school) || !Number.isInteger(n) || Math.abs(n) > 4) throw Error(`gear-defs "${r.id}": resist ${school} is a school row and a whole number within +-4`);
    out[r.id] = { id: r.id, slot, preset, set: r.set ?? base?.set ?? null, weight: r.weight, wearMax: r.wearMax, resist };
  }
  return { sets, owners, rows: out, shapeMax, qualityMax };
}

export const GEAR: GearTable = loadGearDefs(GEAR_DEFS);

// A worn set's dial deltas. `coverage` (0..1) is how much of the set is worn by slot weight; the shape deltas scale with it. `quality` (0..1, never past `coverage`) is the worn pieces' quality
// share (common 0 to legendary 1, weighted by slot): `qualityMax` x quality points are spread over the set row's quality weights by largest remainder (ties to the lower dial code), so the whole
// number of points is always spent. A full legendary set is 25 of shape plus 25 of quality; a full common set is 25 of shape and no quality.
export function gearDeltas(setId: string, coverage = 1, quality = coverage): Readonly<Record<string, number>> {
  const set = GEAR.sets[setId];
  if (!set) throw Error(`gearDeltas: "${setId}" is not a set row (gear-defs.json sets)`);
  const c = Math.max(0, Math.min(1, coverage)), out: Record<string, number> = {};
  for (const [dial, n] of Object.entries(set.shape)) { const d = Math.round(n * c); if (d) out[dial] = d; }
  const total = Math.round(GEAR.qualityMax * Math.max(0, Math.min(c, quality))), weights = Object.entries(set.quality), sum = weights.reduce((a, [, w]) => a + w, 0);
  const shares = weights.map(([dial, w]) => ({ dial, floor: Math.floor((total * w) / sum), rest: (total * w) % sum, code: DIALS.find((x) => x.id === dial)!.code }));
  let left = total - shares.reduce((a, s) => a + s.floor, 0);
  for (const s of [...shares].sort((a, b) => b.rest - a.rest || a.code - b.code)) { if (left-- > 0) s.floor++; }
  for (const s of shares) if (s.floor) out[s.dial] = (out[s.dial] ?? 0) + s.floor;
  return out;
}
