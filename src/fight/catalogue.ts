// The character catalogue (the shared fight engine's, Dom via Strategy 2026-10-09): ONE row per character, opponent or creature, and the validator that rejects a bad one before it ships.
// The row holds what a client needs to put the character on screen and in a fight, by reference: the engine asset and its generated world asset, the armour set (loot ids), the stats
// recipe (an archetype and a level band: the numbers stay computed by moves.ts opponentAt, never copied), the animation set, the finisher bones, the blood profile, the loot table and
// the legend citation. The Pit and every zone are clients of the same row: a new character is one row here, no code. Pure data: only `import type`, no DOM, no clock, no storage.
// To extend: add the field to CatalogueRow, one check in catalogueProblems, one case in tests/catalogue.test.ts; nothing reads a row by position.
import type { FinisherId } from '../finishers.ts';
import type { LootId } from '../loot.ts';
import type { RigId } from '../roster.ts';

export type Shape = 'quadruped' | 'biped';
export type Cut = { head: readonly string[]; neck: readonly string[]; limbs: Readonly<Record<string, readonly string[]>> };   // bone names (the rig's skin joints), by limb id
export type Legend = { work: string; author?: string; year?: number; locator?: string } | { legendId: string } | { pending: string };   // the same shapes as origins/mobs/row.ts SourceRef
export type RankLegend = { name: string; source: string; backstory: string };   // the named opponent at one Pit rank (src/legends.ts), cosmetic text only
export type CatalogueRow = {
  id: string;                                   // the ROSTER id (src/roster.ts): the key a client resolves a character by
  name: string;
  rig: RigId;
  shape: Shape;
  engine: { asset: string; tris: number };      // the full-detail GLB the duel draws, path from the repo root, and its triangle count (a measured fact)
  world: { asset: string; tris: number; generator: string | null; maxTris: number } | null;   // the generated LOD a zone draws (phone budget): tris is measured, maxTris the ceiling a row is refused above; the engine asset itself when it is already that light (generator null); null = none yet, so no zone may draw this row
  armour: readonly LootId[];                    // the level-1 armour the character wears and drops from (src/loot.ts ids, no weapon); [] = a creature with no armour pieces
  stats: { archetype: string; levels: readonly [number, number] };   // moves.ts ARCHETYPES key and the level band it is met at; numbers come from opponentAt
  animations: { clips: readonly string[] };     // the clip names both assets carry
  finisher: { cut: Cut | null; finishers: readonly FinisherId[] };   // where a finisher may cut (null = the rig has no named bones to cut at), and the picks from src/finishers.ts (last = plainDeath, the safe fallback)
  blood: { start: string; end: string; amount: number } | null;   // colour over a drop's life (as src/blood-style.ts BLOOD) and the multiple of its particle counts (1 = a man); null = bloodless (the Skeleton, roster blood: false)
  loot: { table: string | null };               // a loot-table id; null = the Pit's own loot (src/loot.ts pieces), no zone table
  legend: Legend | null;                        // a creature's citation; null for a ranked opponent (its ranks carry the names)
  ranks: readonly RankLegend[];                 // the ten Pit ranks' named opponents, rank 1 first (src/legends.ts); [] for a creature
};

export type RowCode = 'id' | 'asset' | 'budget' | 'armour' | 'stats' | 'animations' | 'finisher' | 'blood' | 'loot' | 'legend' | 'dup-id';
export type RowIssue = { code: RowCode; path: string; message: string };
const HEX = /^#[0-9a-f]{6}$/i, WORLD_MAX_TRIS = 10000;   // the world ceiling a row may not raise (the world goblin is ~8k)

/** The ways a row is bad, empty when it is good. `known` supplies what only the caller can know (the roster ids, loot ids, tables, finishers, archetypes). */
export function catalogueProblems(row: CatalogueRow, known: { roster: ReadonlySet<string>; loot: ReadonlySet<string>; tables: ReadonlySet<string>; finishers: ReadonlySet<string>; archetypes: ReadonlySet<string> }): RowIssue[] {
  const bad: RowIssue[] = [], add = (code: RowCode, path: string, message: string) => void bad.push({ code, path, message });
  if (!known.roster.has(row.id)) add('id', 'id', `${row.id} is not a roster id`);
  if (!row.name.trim()) add('id', 'name', 'a name');
  const w = row.world;
  if (!/\.glb$/.test(row.engine.asset) || (w && (!/\.glb$/.test(w.asset) || (w.asset === row.engine.asset && row.engine.tris > w.maxTris)))) add('asset', 'engine/world', 'a .glb engine asset, and a world asset that is a different file unless the engine asset is itself within the world ceiling');
  if (w && !(w.tris > 0 && w.tris <= w.maxTris && w.maxTris <= WORLD_MAX_TRIS)) add('budget', 'world.tris', `${w.tris} tris against a ceiling of ${w.maxTris} (at most ${WORLD_MAX_TRIS})`);
  if (w && !(row.engine.tris >= w.tris)) add('budget', 'engine.tris', 'the engine asset is not lighter than its LOD');
  if (row.armour.some((id) => !known.loot.has(id))) add('armour', 'armour', 'src/loot.ts ids only');
  if (!known.archetypes.has(row.stats.archetype) || !(row.stats.levels[0] >= 1 && row.stats.levels[1] >= row.stats.levels[0])) add('stats', 'stats', 'a known archetype and a level band');
  if (!row.animations.clips.length || new Set(row.animations.clips).size !== row.animations.clips.length) add('animations', 'animations.clips', 'distinct clip names');
  const { cut, finishers } = row.finisher;
  if (cut && (!cut.head.length || !cut.neck.length || Object.keys(cut.limbs).length < 4 || Object.values(cut.limbs).some((b) => !b.length))) add('finisher', 'finisher.cut', 'a head, a neck and four limbs to cut at, or null');
  if (!finishers.length || finishers.some((f) => !known.finishers.has(f)) || finishers.at(-1) !== 'plainDeath' || new Set(finishers).size !== finishers.length) add('finisher', 'finisher.finishers', 'Pit finishers, distinct, ending in plainDeath');
  if (row.blood && (!HEX.test(row.blood.start) || !HEX.test(row.blood.end) || !(row.blood.amount > 0 && row.blood.amount <= 2))) add('blood', 'blood', 'two #rrggbb colours and an amount in (0, 2], or null');
  if (row.loot.table !== null && !known.tables.has(row.loot.table)) add('loot', 'loot.table', `${row.loot.table} is not a loot table`);
  const named = (r: RankLegend) => r.name.trim() && r.source.trim() && r.backstory.trim();
  if (row.ranks.length ? row.ranks.length !== 10 || !row.ranks.every(named) || row.legend !== null : !row.legend || !('work' in row.legend ? row.legend.work.trim() : 'legendId' in row.legend ? row.legend.legendId : row.legend.pending)) add('legend', 'legend/ranks', 'a ranked opponent has ten named ranks and no creature citation; a creature has a citation, a legend id or a pending note');
  return bad;
}
export function catalogueRowsProblems(rows: readonly CatalogueRow[], known: Parameters<typeof catalogueProblems>[1]): RowIssue[] {
  const seen = new Set<string>();
  return rows.flatMap((r, i) => [...(seen.has(r.id) ? [{ code: 'dup-id' as const, path: `[${i}].id`, message: `${r.id} twice` }] : []), ...(seen.add(r.id), catalogueProblems(r, known))].map((p) => ({ ...p, path: `[${i}].${p.path}` })));
}
