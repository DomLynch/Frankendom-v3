// Why a kill went to the server without a world record, as DATA (src/fight/record-drop-defs.json; P0-b). The page sends the row's `reason` on the kill report (`drop`), so the server can count
// "dropped for a gear change" apart from "no record". Presentation of nothing: the sim never reads these rows (this file is outside SIM_FILES; no WORLD_SIM_VERSION or digest moves with an edit).
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import DEFS from './record-drop-defs.json' with { type: 'json' };
import MANIFEST from './record-drop-defs.manifest.json' with { type: 'json' };

export type DropId = 'gearChange' | 'heroUnclean';
const TABLE = tableFromFile(MANIFEST.tables[0] as unknown as Manifest, DEFS, 'record-drop-defs.json');
loadRegistry([TABLE]);
const ROWS = Object.fromEntries((TABLE.rows as unknown as { id: string; reason: string }[]).map((r) => [r.id, r.reason])) as Readonly<Record<DropId, string>>;
/** The wire string for a drop id (the row's `reason`). */
export const dropReason = (id: DropId): string => ROWS[id] ?? (() => { throw Error(`record-drop-defs: no ${id} row`); })();
/** Every wire string the rows name: the server counts only these by name (anything else a page sends is 'other', so a forged label cannot grow the tally). */
export const DROP_REASONS: ReadonlySet<string> = new Set(Object.values(ROWS));
