// stance-legacy's tables as STANCE_LEGACY_ROW_MAP (Dom, "centralized game engine, no hard coding"; the debt entries in scripts/as-data/allow.json). The numbers live in stance-legacy-defs.json, manifest-loaded through the shared
// registry; this file only rebuilds, key for key and in the same order, the objects the sim files always held. A sim file: it imports only the shared row loader.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import STANCE_LEGACY_DEFS from './stance-legacy-defs.json' with { type: 'json' };
import STANCE_LEGACY_MANIFEST from './stance-legacy-defs.manifest.json' with { type: 'json' };

// LEGACY_DEFENSIVE as the code held it before it became rows (comments are the owners' rulings):
// | { defensive: { damage: -50, block: -150, recover: 250, window: 250, counter: 250 } }
const LEGACY_DEFENSIVE_T = tableFromFile(STANCE_LEGACY_MANIFEST.tables[0] as unknown as Manifest, STANCE_LEGACY_DEFS, 'stance-legacy-defs.json');
loadRegistry([LEGACY_DEFENSIVE_T]);
export const LEGACY_DEFENSIVE_ROWS = Object.fromEntries((LEGACY_DEFENSIVE_T.rows as unknown as { id: string }[]).map(({ id, ...rest }) => [id, rest]));
