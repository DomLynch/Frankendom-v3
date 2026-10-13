// The character catalogue's reader: CATALOGUE is the rows (src/fight/catalogue-data.ts, pure data) and catalogueRow finds one by roster id. Code lives here, data there.
import CATALOGUE_ROWS from './catalogue-data.ts';
import CATALOGUE_DEFS from './catalogue-defs.ts';
import type { CatalogueDefs, CatalogueRow } from './catalogue.ts';

export const CATALOGUE: readonly CatalogueRow[] = CATALOGUE_ROWS;   // this assignment is where every row is checked against CatalogueRow (the data file is `as const`, so src/roster.ts can derive OpponentId from it)
export const catalogueRow = (id: string): CatalogueRow | null => CATALOGUE.find((r) => r.id === id) ?? null;
export const DEFS: CatalogueDefs = CATALOGUE_DEFS;   // the field and rig definitions; this assignment checks their shape
export { fieldOf } from './catalogue-fields.ts';   // a row's open attribute, or undefined when the row (or the key) is absent (read from the data directly, inside the sim boundary)
