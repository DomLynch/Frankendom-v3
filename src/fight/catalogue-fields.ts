// A catalogue row's open attribute, read straight from the data (src/fight/catalogue-data.ts) so the open-world loop (world.ts, speeds.ts) stays inside the sim boundary: catalogue-rows.ts types the rows through
// catalogue.ts, which is outside it. catalogue-rows.ts re-exports this, so there is one `fieldOf`.
import CATALOGUE_ROWS from './catalogue-data.ts';

export const fieldOf = (id: string, key: string): string | number | undefined => (CATALOGUE_ROWS as readonly { id: string; fields: Readonly<Record<string, string | number>> }[]).find((r) => r.id === id)?.fields[key];   // undefined when the row (or the key) is absent
