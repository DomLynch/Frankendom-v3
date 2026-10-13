// Spell schools as data: the rows of src/fight/school-defs.json through the shared loader (src/core/registry.ts), not a union. A new school (earth and wind joined fire, shadow, poison,
// holy and frost) is one row. A gear row's `resist` keys (gear-rows.ts) and a special's school name rows of this table, checked at load. No drawing code here: the sim side may import it.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import SCHOOL_DEFS from './school-defs.json' with { type: 'json' };
import SCHOOL_MANIFEST from './school-defs.manifest.json' with { type: 'json' };

export type School = string;
const TABLE = tableFromFile(SCHOOL_MANIFEST.tables[0] as Manifest, SCHOOL_DEFS, 'school-defs.json');
loadRegistry([TABLE]);
export const SCHOOLS: Readonly<Record<School, string>> = Object.fromEntries(TABLE.rows.map((r) => [r.id as string, r.color as string]));   // id -> the colour the look test paints it
export const SCHOOL_IDS: readonly School[] = Object.keys(SCHOOLS);
