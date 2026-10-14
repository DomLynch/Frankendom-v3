import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import SPECIAL_FX_CORE_ROWS_MANIFEST from './special-fx-core-rows.manifest.json' with { type: 'json' };
import SPECIAL_FX_CORE_ROWS from './special-fx-core-rows.json' with { type: 'json' };

// The Hades cloud's and the boss specials' effect pool sizes and tunes as rows (special-fx.ts and special-fx-boss.ts) (Dom's data-layer rule 2026-10-13). View layer only: none of these is read by the sim, a record or the digest. tests/special-fx-core-rows.test.ts pins every default to the literal the code held before.
const TABLE = tableFromFile(SPECIAL_FX_CORE_ROWS_MANIFEST.tables[0] as Manifest, SPECIAL_FX_CORE_ROWS, 'special-fx-core-rows.json');
loadRegistry([TABLE]);
const VALUES = new Map((TABLE.rows as unknown as { id: string; fields: { value: number } }[]).map((r) => [r.id, r.fields.value]));

/** The value of a row; a missing id throws at load rather than answering NaN. */
export function specialFxCoreNum(id: string): number {
  const v = VALUES.get(id);
  if (v === undefined) throw new Error(`special-fx-core-rows.json has no row "${id}"`);
  return v;
}
