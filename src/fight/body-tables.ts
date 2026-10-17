// The bodytype and species tables a catalogue row's `wounds` reads (World's #2000 schema, K5): what can be hurt on a body family, and how a species bleeds. The bone names are the skin joints of the GLBs (read, not typed).
// A new body family is one `bodytypes` row, a new species one `species` row, in body-tables-defs.json (manifest-loaded through the shared registry, as ROWS: as-data check (i), id tables in code); this file only hands the
// readers the same objects the literals held, bit for bit. A creature is a `wounds` row. The trunk is the root part; a head hangs from the neck and the neck from the trunk, so severing the neck takes the head.
import type { Bodytype, Species } from './catalogue.ts';
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import DEFS from './body-tables-defs.json' with { type: 'json' };
import MANIFEST from './body-tables-defs.manifest.json' with { type: 'json' };

const TABLES = MANIFEST.tables.map((t) => tableFromFile(t as unknown as Manifest, DEFS, 'body-tables-defs.json'));
loadRegistry(TABLES);
const byId = <T>(table: string): Record<string, T> => Object.fromEntries(TABLES.find((t) => t.manifest.table === table)!.rows.map(({ id, ...rest }) => [id as string, rest as unknown as T]));

export const BODYTYPES: Readonly<Record<string, Bodytype>> = byId<Bodytype>('bodytype');
export const SPECIES: Readonly<Record<string, Species>> = byId<Species>('species');
