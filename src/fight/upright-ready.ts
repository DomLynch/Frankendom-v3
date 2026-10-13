// `?look=upright` / `?look=upright-full` (a look test, presentation only): the shared Armed ready pose carries a forward stoop (chest ~19 deg against ~3 deg in the plain Idle). Per body, the row in ready-pose.json
// (degrees, about the bone's own X) is added on spine_02, spine_03 and neck_01 on the calm ready layer, restored before every update like the stance and tired layers. No flag, no change.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import ROWS from './ready-pose.json' with { type: 'json' };
import MANIFEST from './ready-pose.manifest.json' with { type: 'json' };

loadRegistry([tableFromFile(MANIFEST.tables[0] as Manifest, ROWS, 'ready-pose.json')]);

export type ReadyOffset = { readonly spine2: number; readonly spine3: number; readonly neck: number };   // radians

export type UprightLook = 'upright' | 'upright-full';

/** ?look=upright is the mild set, ?look=upright-full the full gap to Idle; undefined without either. */
export function uprightFrom(search: string): UprightLook | undefined {
  const looks = (new URLSearchParams(search).get('look') ?? '').split(',');
  return looks.includes('upright-full') ? 'upright-full' : looks.includes('upright') ? 'upright' : undefined;
}

/** This body's row (the `-full` row for ?look=upright-full) as radians, or undefined when it has none. */
export function readyOffset(id: string, look: UprightLook = 'upright'): ReadyOffset | undefined {
  const row = ROWS.rows.find((r) => r.id === (look === 'upright-full' ? `${id}-full` : id));
  const rad = Math.PI / 180;
  return row ? { spine2: row.spine2 * rad, spine3: row.spine3 * rad, neck: row.neck * rad } : undefined;
}
