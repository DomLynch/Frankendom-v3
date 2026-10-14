import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import BLOOD_MANIFEST from './blood-rows.manifest.json' with { type: 'json' };
import BLOOD_ROWS from './blood-rows.json' with { type: 'json' };

// The blood, gore, wounds and nightfall effects' tuning numbers as rows (blood-rows.json; Dom's data-layer rule 2026-10-13): blood edge, blood style, gore drops and drying, wound marks and the nightfall drain timing. View layer only: none of it is read by the sim, a record or the digest.
// A scalar is `{ value }`; an effect with several numbers is one row of named fields. tests/blood-rows.test.ts pins every default to the literal the code held before.
const TABLE = tableFromFile(BLOOD_MANIFEST.tables[0] as Manifest, BLOOD_ROWS, 'blood-rows.json');
loadRegistry([TABLE]);
const FIELDS = new Map((TABLE.rows as unknown as { id: string; fields: Record<string, unknown> }[]).map((r) => [r.id, r.fields]));
const row = (id: string): Record<string, unknown> => { const f = FIELDS.get(id); if (!f) throw new Error(`blood-rows.json has no row "${id}"`); return f; };

/** A scalar signature number. */
export const bloodNum = (id: string): number => { const v = row(id).value; if (typeof v !== 'number') throw new Error(`blood-rows.json row "${id}" has no numeric value`); return v; };
/** A multi-field row, typed by the caller (the effect that owns it). */
export const bloodObj = <T>(id: string): T => row(id) as T;
/** Every `<prefix>.<opponent>` row's fields, keyed by the opponent. */
export const bloodGroup = <T>(prefix: string): Record<string, T> => Object.fromEntries([...FIELDS].filter(([id]) => id.startsWith(`${prefix}.`)).map(([id, f]) => [id.slice(prefix.length + 1), f as T]));
