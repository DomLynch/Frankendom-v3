// The character catalogue's reader: CATALOGUE is the rows (src/fight/catalogue-data.ts, pure data) and catalogueRow finds one by roster id. Code lives here, data there.
import CATALOGUE_ROWS from './catalogue-data.ts';
import type { CatalogueRow } from './catalogue.ts';

export const CATALOGUE: readonly CatalogueRow[] = CATALOGUE_ROWS;
export const catalogueRow = (id: string): CatalogueRow | null => CATALOGUE.find((r) => r.id === id) ?? null;
