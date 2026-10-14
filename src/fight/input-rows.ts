import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import INPUT_MANIFEST from './input-rows.manifest.json' with { type: 'json' };
import INPUT_ROWS from './input-rows.json' with { type: 'json' };

// The touch/keyboard control layer's thresholds as rows (input-rows.json; Dom's data-layer rule 2026-10-13). They decide which intent a gesture becomes (a side cut, a guard side, a step or a roll),
// so tests/input-fingerprint.test.ts pins what every input maps to, at the code BEFORE they became rows. Rows keep today's values.
const TABLE = tableFromFile(INPUT_MANIFEST.tables[0] as Manifest, INPUT_ROWS, 'input-rows.json');
loadRegistry([TABLE]);
const VALUES = new Map((TABLE.rows as unknown as { id: string; fields: { value: number } }[]).map((r) => [r.id, r.fields.value]));

/** The value of an input row; a missing id throws at load rather than answering NaN. */
export function inputNum(id: string): number {
  const v = VALUES.get(id);
  if (v === undefined) throw new Error(`input-rows.json has no row "${id}"`);
  return v;
}
