// The ready and guard pose: the shared Armed clip carries a forward stoop (chest ~19 deg against ~3 deg in the plain Idle). Dom picked the mild counter-pitch (2026-10-13). Per body, the row in ready-pose.json
// (degrees, about the bone's own X) is added on spine_02, spine_03 and neck_01 on the calm ready layer, restored before every update like the stance and tired layers. Presentation only: no sim or hitbox read.
// ON by default; `?look=slouch` is the off-switch (the old stoop), for comparing.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import ROWS from './ready-pose.json' with { type: 'json' };
import MANIFEST from './ready-pose.manifest.json' with { type: 'json' };

loadRegistry([tableFromFile(MANIFEST.tables[0] as Manifest, ROWS, 'ready-pose.json')]);

export type ReadyOffset = { readonly spine2: number; readonly spine3: number; readonly neck: number };   // radians

/** True when ?look=slouch asks for the old stoop. */
export function slouchFrom(search: string): boolean {
  return (new URLSearchParams(search).get('look') ?? '').split(',').includes('slouch');
}

/** This body's row as radians, or undefined when it has none. */
export function readyOffset(id: string): ReadyOffset | undefined {
  const row = ROWS.rows.find((r) => r.id === id);
  const rad = Math.PI / 180;
  return row ? { spine2: row.spine2 * rad, spine3: row.spine3 * rad, neck: row.neck * rad } : undefined;
}
