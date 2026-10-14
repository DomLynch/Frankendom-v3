import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import SCENE_MANIFEST from './scene-rows.manifest.json' with { type: 'json' };
import SCENE_ROWS from './scene-rows.json' with { type: 'json' };

// The camera, scene, HUD and presentation tuning numbers as rows (scene-rows.json; Dom's data-layer rule 2026-10-13): framing metres, warm-up bounds, bar thresholds, texture cap, kick-light window. View layer only: no row here is read by the sim, a record or the digest.
// A scalar is `{ value }`; the tour is one row of named fields. tests/scene-rows.test.ts pins every default to the literal the code held before.
const TABLE = tableFromFile(SCENE_MANIFEST.tables[0] as Manifest, SCENE_ROWS, 'scene-rows.json');
loadRegistry([TABLE]);
const FIELDS = new Map((TABLE.rows as unknown as { id: string; fields: Record<string, unknown> }[]).map((r) => [r.id, r.fields]));
const row = (id: string): Record<string, unknown> => { const f = FIELDS.get(id); if (!f) throw new Error(`scene-rows.json has no row "${id}"`); return f; };

/** A scalar scene number. */
export const sceneNum = (id: string): number => { const v = row(id).value; if (typeof v !== 'number') throw new Error(`scene-rows.json row "${id}" has no numeric value`); return v; };
/** A multi-field row, typed by the caller (the module that owns it). */
export const sceneObj = <T>(id: string): T => row(id) as T;
