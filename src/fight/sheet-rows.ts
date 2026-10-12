// THE SHEET (Dom, 2026-10-12; programme section 2a): every player stat starts at 100 and tops out at 200, so the number-one player is 2x per stat and 4x in a fight. The 100 points above
// base are budgeted by LAYER, so each layer visibly matters: level / Origin rank +50, a full gear set +25, skills by use +15, titles / favour / perks +10; layers add. Armour and magic
// resist are two stats on the same line (plate 200 / 100, a robe the reverse). All of it is ROWS (src/fight/sheet-defs.json through the shared loader): a layer is a row (id, cap), a stat
// is a row (id, record code, base, cap, optionally the layers that may feed it). A new stat is a row and a read at the site that uses it, never a switch over names. Bosses and
// creatures are OFF the sheet: scaled by their own rows (the mitigation curve's 75% asymptote is theirs). No row may name a timing: the sheet moves damage, stamina and cast success, never a tell.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import SHEET_DEFS from './sheet-defs.json' with { type: 'json' };
import SHEET_MANIFEST from './sheet-defs.manifest.json' with { type: 'json' };

export type SheetStat = { readonly id: string; readonly code: number; readonly base: number; readonly cap: number; readonly layers?: readonly string[]; readonly perk?: string; readonly perkSign?: 1 | -1 };   // perk/perkSign: the patron-perk stat row (origins/patrons/stat-defs.json) this stat reads, and which way: the same vocabulary, one reader
export type Sheet = Readonly<Record<string, number>>;   // stat id -> the player's total on that stat's line (base..cap); a stat at its base is simply absent
export type SheetLayers = Readonly<Record<string, Readonly<Record<string, number>>>>;   // layer id -> stat id -> points this layer adds (before the layer's cap)

const TABLES = SHEET_MANIFEST.tables.map((t) => tableFromFile(t as Manifest, SHEET_DEFS, 'sheet-defs.json'));
loadRegistry(TABLES);
export const SHEET_LAYERS: Readonly<Record<string, number>> = Object.fromEntries(TABLES[0]!.rows.map((r) => [r.id as string, r.cap as number]));
export const SHEET_STATS: readonly SheetStat[] = (TABLES[1]!.rows as unknown as readonly SheetStat[]).slice().sort((a, b) => a.code - b.code);
const BY_ID = new Map(SHEET_STATS.map((r) => [r.id, r]));
for (const [id, cap] of Object.entries(SHEET_LAYERS)) if (!Number.isInteger(cap) || cap < 1) throw Error(`sheet-defs layer "${id}": cap is a whole number of points from 1`);
SHEET_STATS.forEach((r, i) => {
  if (r.code !== i + 1) throw Error(`sheet-defs stat "${r.id}": codes run 1..n with no gap (the record is append only)`);
  if ((r.perk === undefined) !== (r.perkSign === undefined) || (r.perkSign !== undefined && r.perkSign !== 1 && r.perkSign !== -1)) throw Error(`sheet-defs stat "${r.id}": perk and perkSign (1 or -1) come together`);
  if (r.base < 1 || r.cap < r.base || r.cap > 255) throw Error(`sheet-defs stat "${r.id}": 1 <= base <= cap <= 255 (a record byte)`);
  const fed = (r.layers ?? Object.keys(SHEET_LAYERS)).reduce((n, l) => n + (SHEET_LAYERS[l] ?? 0), 0);
  if (r.cap - r.base > fed) throw Error(`sheet-defs stat "${r.id}": its cap is past what its layers can add (${fed} points)`);
});

const base = (id: string): number => BY_ID.get(id)?.base ?? 100;
// The one reader. A fighter with no sheet, or a stat at its base, is the plain number untouched (no float drift, as `perked` in duel.ts): `up` scales x by value/base (damage dealt, a cost),
// `down` by base/value (damage taken: an armour of 200 takes half).
export const statValue = (sheet: Sheet | undefined, id: string): number => sheet?.[id] ?? base(id);
export const statUp = (sheet: Sheet | undefined, id: string, x: number): number => { const v = sheet?.[id]; return v ? (x * v) / base(id) : x; };
export const statDown = (sheet: Sheet | undefined, id: string, x: number): number => { const v = sheet?.[id]; return v ? (x * base(id)) / v : x; };

// Validates a sheet at duel start and on a record's read: known stat ids, whole numbers from the stat's base to its cap. Returns the stats above base in code order, or undefined for none.
export function checkSheet(sheet: Sheet | undefined): Sheet | undefined {
  if (!sheet) return undefined;
  for (const id of Object.keys(sheet)) {
    const row = BY_ID.get(id), v = sheet[id]!;
    if (!row) throw Error(`Sheet: "${id}" is not a stat row (sheet-defs.json stats)`);
    if (!Number.isInteger(v) || v < row.base || v > row.cap) throw Error(`Sheet: ${id} is a whole number from ${row.base} to ${row.cap}`);
  }
  const out: Record<string, number> = {};
  for (const row of SHEET_STATS) if (sheet[row.id] !== undefined && sheet[row.id] !== row.base) out[row.id] = sheet[row.id]!;
  return Object.keys(out).length ? out : undefined;
}

// Layers add (the one place a cap is spelled out): each layer's points on a stat are held to +-the layer's cap (a weakness is negative), a stat takes only the layers its row lists, and the total is held between the stat's base and its cap.
export function sheetOf(layers: SheetLayers): Sheet | undefined {
  const out: Record<string, number> = {};
  for (const [layer, stats] of Object.entries(layers)) {
    if (!(layer in SHEET_LAYERS)) throw Error(`Sheet: "${layer}" is not a layer row (sheet-defs.json layers)`);
    for (const [id, points] of Object.entries(stats)) {
      const row = BY_ID.get(id);
      if (!row) throw Error(`Sheet: "${id}" is not a stat row (sheet-defs.json stats)`);
      if (!Number.isInteger(points)) throw Error(`Sheet: ${layer} adds whole points to ${id}`);
      if (row.layers && !row.layers.includes(layer)) throw Error(`Sheet: ${id} takes no points from the ${layer} layer`);
      out[id] = (out[id] ?? row.base) + Math.max(-SHEET_LAYERS[layer]!, Math.min(SHEET_LAYERS[layer]!, points));
    }
  }
  for (const id of Object.keys(out)) out[id] = Math.max(BY_ID.get(id)!.base, Math.min(BY_ID.get(id)!.cap, out[id]!));
  return checkSheet(out);
}
// The patron-perk reader folded in (Strategy: ONE generic reader over row fields): a perk resolves to per-mille deltas keyed by the perk stat rows (origins/patrons: `deltaOf(modifiers, stat)`),
// and every sheet stat row that names a perk stat takes its delta as points, ten per-mille to a point, in the row's direction. The caller passes the reader, so this file imports nothing from
// Origins: `sheetOf({ title: perkPoints((s) => deltaOf(mods, s)) })`. A new sheet stat that names a perk stat reads it with no code here.
export function perkPoints(delta: (perkStat: string) => number): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const r of SHEET_STATS) if (r.perk !== undefined && r.perkSign !== undefined) { const points = Math.round((r.perkSign * delta(r.perk)) / 10); if (points) out[r.id] = points; }
  return out;
}
export const statByCode = (code: number): SheetStat | undefined => SHEET_STATS[code - 1];
