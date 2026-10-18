// The crowd's roars as rows (crowd-defs.json; the Combat sandbox's CS31, donor: combat sandbox @93b1138c7). A roar row { id, on, cue, gain } plays that arena cue at `gain` the frame its moment happens, with no cooldown, on top of the
// reactions arena.ts already has; `on` is one of ROAR_MOMENTS. Presentation only: it reads events, never the sim. No row ships, so the crowd is exactly as it was.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import type { CombatEvent } from '../fight/combat.ts';
import type { ArenaCue } from './arena-manifest.ts';
import DEFS from './crowd-defs.json' with { type: 'json' };
import MANIFEST from './crowd-defs.manifest.json' with { type: 'json' };

export const ROAR_MOMENTS = ['kill', 'parry', 'guardBreak', 'heavy'] as const;
export type RoarMoment = (typeof ROAR_MOMENTS)[number];
export type Roar = { readonly id: string; readonly on: RoarMoment; readonly cue: ArenaCue; readonly gain: number };

const TABLE = tableFromFile(MANIFEST.tables[0] as unknown as Manifest, DEFS, 'crowd-defs.json');
loadRegistry([TABLE]);
for (const r of DEFS.roars as readonly { id: string; on: string }[]) if (!(ROAR_MOMENTS as readonly string[]).includes(r.on)) throw Error(`crowd-defs.json: roar "${r.id}" keys on "${r.on}", which is not a moment (${ROAR_MOMENTS.join(', ')})`);
export const ROARS = DEFS.roars as unknown as readonly Roar[];

/** The moments this frame's events make: a kill, a parry, a guard break, a heavy (charged) hit. A light hit is none. */
export const momentsOf = (events: readonly CombatEvent[]): Set<RoarMoment> => new Set(events.flatMap((e): RoarMoment[] =>
  e.type === 'Killed' ? ['kill'] : e.type === 'Parried' ? ['parry'] : e.type === 'GuardBroken' ? ['guardBreak'] : e.type === 'Hit' && (e.charged || /heavy/.test(e.move ?? '')) ? ['heavy'] : []));
