import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import FX_MANIFEST from './fx-rows.manifest.json' with { type: 'json' };
import FX_ROWS from './fx-rows.json' with { type: 'json' };

// The view effects' numbers as rows (fx-rows.json; Dom's data-layer rule 2026-10-13): the Centurion charge's sprites and strides, the low-stamina bar thresholds, the kick-close window, the opening pose's fall and recovery shares,
// the beast render scales, the fighter texture cap and the open-waist bake's step budgets. View layer only: none of these is read by the sim, a record or the digest. tests/fx-rows.test.ts pins every default.
const TABLE = tableFromFile(FX_MANIFEST.tables[0] as Manifest, FX_ROWS, 'fx-rows.json');
loadRegistry([TABLE]);
const VALUES = new Map((TABLE.rows as unknown as { id: string; fields: { value: number } }[]).map((r) => [r.id, r.fields.value]));

/** The value of an fx row; a missing id throws at load rather than answering NaN. */
export function fxNum(id: string): number {
  const v = VALUES.get(id);
  if (v === undefined) throw new Error(`fx-rows.json has no row "${id}"`);
  return v;
}
