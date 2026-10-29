// The character catalogue's reader: CATALOGUE is the rows (src/fight/catalogue-data.ts, pure data) and catalogueRow finds one by roster id. Code lives here, data there.
import CATALOGUE_ROWS from './catalogue-data.ts';
import CATALOGUE_DEFS from './catalogue-defs.ts';
import type { CatalogueDefs, CatalogueRow, RankLegend } from './catalogue.ts';

import LEGENDS_JSON from '../../data/legends.json' with { type: 'json' };
import { validateFile } from '../sim/validate.js';

// The ten Pit ranks' named opponents are data (data/legends.json, by row id), joined onto the rows here as `ranks`; a bad file or a key that names no row stops the page at load.
const LEGEND_PROBLEMS = validateFile('legends', LEGENDS_JSON);
if (LEGEND_PROBLEMS.length) throw Error(`data/legends.json: ${LEGEND_PROBLEMS.join('; ')}`);
export const LEGEND_RANKS = LEGENDS_JSON.ranks as unknown as Readonly<Record<string, readonly RankLegend[]>>;
for (const id of Object.keys(LEGEND_RANKS)) if (!CATALOGUE_ROWS.some((r) => r.id === id)) throw Error(`data/legends.json: "${id}" is not a catalogue row`);

const CATALOGUE: readonly CatalogueRow[] = (CATALOGUE_ROWS as readonly CatalogueRow[]).map((r) => (LEGEND_RANKS[r.id] ? { ...r, ranks: LEGEND_RANKS[r.id]! } : r));   // every row is checked against CatalogueRow here (the data file is `as const`, so src/roster.ts can derive OpponentId from it)
export const catalogueRow = (id: string): CatalogueRow | null => CATALOGUE.find((r) => r.id === id) ?? null;
export const DEFS: CatalogueDefs = CATALOGUE_DEFS;   // the field and rig definitions; this assignment checks their shape
export { fieldOf } from './catalogue-fields.ts';   // a row's open attribute, or undefined when the row (or the key) is absent (read from the data directly, inside the sim boundary)
