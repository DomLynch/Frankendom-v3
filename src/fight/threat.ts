// Threat and awareness as data (World, top-30 row 9; donors: EQEmu's hate list, where hate is damage plus a per-source modifier, and AzerothCore's ThreatManager, where each source carries a
// threat modifier). A creature takes the free player in reach with the most threat (src/fight/world.ts); what MAKES threat is a `sources` row (id, weight: threat per point of the source's
// amount) and how far a creature notices, keeps sight and gives up is an `awareness` row (notice and sight in metres, giveUp in seconds). A new source is one row and the world.ts line that
// reports its amount; a new awareness ring is a row and the code that reads it. Pure: the sim reads only these numbers, so every default equals the literal it replaced (tests/threat-rows.test.ts
// pins who fights whom tick for tick).
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import DEFS from './threat-defs.json' with { type: 'json' };
import MANIFEST from './threat-defs.manifest.json' with { type: 'json' };

export type ThreatSource = { readonly id: string; readonly weight: number };
export type Awareness = { readonly id: string; readonly value: number; readonly unit: string };
/** The one loader: rows keyed by id, a duplicate id or a missing or mistyped field is refused (the shared registry loader), and the sim's named rows must exist with a positive value. Pure, so a test can load a table with a new row. */
export function loadThreatDefs(raw: { sources?: readonly unknown[]; awareness?: readonly unknown[] }): { sources: readonly ThreatSource[]; awareness: readonly Awareness[] } {
  loadRegistry([tableFromFile(MANIFEST.tables[0] as Manifest, raw, 'threat-defs.json'), tableFromFile(MANIFEST.tables[1] as Manifest, raw, 'threat-defs.json')]);
  const sources = (raw.sources ?? []) as readonly ThreatSource[], awareness = (raw.awareness ?? []) as readonly Awareness[];
  for (const s of sources) if (!(Number.isFinite(s.weight) && s.weight >= 0)) throw Error(`threat-defs source "${s.id}": weight is a number >= 0`);
  for (const a of awareness) if (!(Number.isFinite(a.value) && a.value > 0)) throw Error(`threat-defs awareness "${a.id}": value is a number > 0`);
  if (!sources.some((s) => s.id === 'damage')) throw Error('threat-defs: the world reads the "damage" source by name, so it needs a row');
  for (const must of ['notice', 'sight', 'giveUp']) if (!awareness.some((a) => a.id === must)) throw Error(`threat-defs: the world reads the "${must}" awareness row by name, so it needs a row`);
  if (awareness.find((a) => a.id === 'sight')!.value < awareness.find((a) => a.id === 'notice')!.value) throw Error('threat-defs: sight is at least notice (hysteresis)');
  return { sources, awareness };
}
const LOADED = loadThreatDefs(DEFS);
export const THREAT_SOURCES: readonly ThreatSource[] = LOADED.sources;
export const AWARENESS: readonly Awareness[] = LOADED.awareness;
const awareness = (id: string): number => AWARENESS.find((a) => a.id === id)!.value;
export const AGGRO_M = awareness('notice'), SIGHT_M = awareness('sight'), GIVE_UP_UNSEEN_S = awareness('giveUp');
/** The threat a source's `amount` is worth: the row's weight times the amount (the damage source weighs 1, so threat is damage dealt, as it always was). An unknown source is a bug, not zero. */
export const threatOf = (source: string, amount: number): number => {
  const row = THREAT_SOURCES.find((s) => s.id === source);
  if (!row) throw Error(`unknown threat source "${source}" (threat-defs.json)`);
  return row.weight * amount;
};
