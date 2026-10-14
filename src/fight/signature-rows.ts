import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import SIG_MANIFEST from './signature-rows.manifest.json' with { type: 'json' };
import SIG_ROWS from './signature-rows.json' with { type: 'json' };

// The signature effects' tuning numbers as rows (signature-rows.json; Dom's data-layer rule 2026-10-13): particle counts, timings, gravity and the shipped variant per opponent. View layer only: no effect here is read by the sim, a record or the digest.
// A scalar is `{ value }`; an effect with several numbers is one row of named fields. tests/signature-rows.test.ts pins every default to the literal the code held before.
const TABLE = tableFromFile(SIG_MANIFEST.tables[0] as Manifest, SIG_ROWS, 'signature-rows.json');
loadRegistry([TABLE]);
const FIELDS = new Map((TABLE.rows as unknown as { id: string; fields: Record<string, unknown> }[]).map((r) => [r.id, r.fields]));
const row = (id: string): Record<string, unknown> => { const f = FIELDS.get(id); if (!f) throw new Error(`signature-rows.json has no row "${id}"`); return f; };

/** A scalar signature number. */
export const sigNum = (id: string): number => { const v = row(id).value; if (typeof v !== 'number') throw new Error(`signature-rows.json row "${id}" has no numeric value`); return v; };
/** A multi-field row, typed by the caller (the effect that owns it). */
export const sigObj = <T>(id: string): T => row(id) as T;
/** Every `<prefix>.<opponent>` row's fields, keyed by the opponent. */
export const sigGroup = <T>(prefix: string): Record<string, T> => Object.fromEntries([...FIELDS].filter(([id]) => id.startsWith(`${prefix}.`)).map(([id, f]) => [id.slice(prefix.length + 1), f as T]));
