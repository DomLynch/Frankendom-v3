import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import { SPECIAL_RANK_LEVELS } from './special-set-rows.ts';
import CLASS_DEFS from './class-special-defs.json' with { type: 'json' };
import CLASS_MANIFEST from './class-special-defs.manifest.json' with { type: 'json' };

// Approved presentation identities; normal A activation remains gated in Match. The class table and the band starts are ROWS (class-special-defs.json, through the shared registry): one `classes` row per
// opponent naming one special per band, and the `bands` rows giving the fight level each band begins at. Boss ranks (the first rank level in special-set-defs.json, 36) end the class bands.
const BAND_TABLE = tableFromFile(CLASS_MANIFEST.tables[0] as unknown as Manifest, CLASS_DEFS, 'class-special-defs.json');
const CLASS_TABLE = tableFromFile(CLASS_MANIFEST.tables[1] as unknown as Manifest, CLASS_DEFS, 'class-special-defs.json');
loadRegistry([BAND_TABLE, CLASS_TABLE]);
const BAND_STARTS: readonly number[] = (BAND_TABLE.rows as unknown as { id: string; level: number }[]).map((r, i, all) => {
  if (r.level < 1 || (i > 0 && r.level <= all[i - 1]!.level)) throw Error(`class-special-defs band "${r.id}": levels start at 1 and climb`);
  return r.level;
});
const BOSS_FROM = SPECIAL_RANK_LEVELS[0]!;
const CLASS_SPECIALS: Readonly<Record<string, readonly string[]>> = Object.fromEntries((CLASS_TABLE.rows as unknown as { id: string; specials: string[] }[]).map((r) => {
  if (r.specials.length !== BAND_STARTS.length || r.specials.some((s) => typeof s !== 'string' || !s)) throw Error(`class-special-defs class "${r.id}": one special id per band (${BAND_STARTS.length})`);
  return [r.id, r.specials];
}));

export type ClassSpecialId = string;   // a class-special-defs.json special id; ids stay strings, checked against the loaded rows

// The supplied fight level belongs to this actor, independently of HUD rank or side.
// Boss ranks (levels 36+) use a separate identity bridge; unknown choices stay unknown.
export function classSpecialFor(opponent: string, level: number): ClassSpecialId | null {
  if (!Number.isInteger(level) || level < 1 || level >= BOSS_FROM) return null;
  const slots = Object.hasOwn(CLASS_SPECIALS, opponent) ? CLASS_SPECIALS[opponent] : undefined;
  return slots?.[BAND_STARTS.filter((from) => level >= from).length - 1] ?? null;
}
