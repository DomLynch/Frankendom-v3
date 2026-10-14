// The open-world combat rules as data (World, #2554 group C): how close a creature must be to fight, how far it stays engaged, the PvP level rules, the aggro memory, the join and drop rings past the notice
// radius, the fall and pulse timings and the per-frame catch-up. One `rules` row each (id, value, unit) through the shared loader (src/core/registry.ts); world.ts and world-combat.ts export the same names they always
// did, now read from the rows, so every default equals the literal it replaced (tests/world-rules.test.ts pins them). A new rule is a row and the code that reads it. The sim reads only these numbers: the rows file is
// part of the world digest (tests/world-sim-guard.test.ts), so a retune needs a WORLD_SIM_VERSION bump. Pure.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import DEFS from './world-rules-defs.json' with { type: 'json' };
import MANIFEST from './world-rules-defs.manifest.json' with { type: 'json' };

export type WorldRule = { readonly id: string; readonly value: number; readonly unit: string };
const NAMED = ['engage', 'engageOut', 'holdFactor', 'protectLevel', 'maxLevelGap', 'aggroWindow', 'playerRadius', 'joinPad', 'dropPad', 'fall', 'pulse', 'maxSteps', 'creatureNotice', 'namedNotice', 'noticeHold', 'playerWalk', 'playerRun', 'creatureAmble', 'creatureChase', 'leash', 'rareDefault', 'campMax', 'bossCampMax', 'campGap', 'respawnDefault'] as const;
/** The one loader: rows keyed by id (a duplicate id or a missing or mistyped field is refused), every rule the world reads by name must exist with a positive value, and an engaged creature keeps its fight at least out to the engage ring. Pure, so a test can load a table with a new row. */
export function loadWorldRules(raw: { rules?: readonly unknown[] }): readonly WorldRule[] {
  loadRegistry([tableFromFile(MANIFEST.tables[0] as unknown as Manifest, raw, 'world-rules-defs.json')]);
  const rows = (raw.rules ?? []) as readonly WorldRule[];
  for (const r of rows) if (!(Number.isFinite(r.value) && r.value > 0)) throw Error(`world-rules "${r.id}": value is a number > 0`);
  for (const must of NAMED) if (!rows.some((r) => r.id === must)) throw Error(`world-rules: the world reads the "${must}" rule by name, so it needs a row`);
  const of = (id: string) => rows.find((r) => r.id === id)!.value;
  if (of('engageOut') < of('engage')) throw Error('world-rules: engageOut is at least engage (hysteresis)');
  if (of('holdFactor') > 1) throw Error('world-rules: holdFactor is at most 1 (a creature holds inside the engage ring)');
  return rows;
}
export const WORLD_RULES: readonly WorldRule[] = loadWorldRules(DEFS);
export const worldRule = (id: (typeof NAMED)[number]): number => WORLD_RULES.find((r) => r.id === id)!.value;
