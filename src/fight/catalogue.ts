// The character catalogue (the shared fight engine's, Dom via Strategy 2026-10-09): ONE row per character, opponent or creature, and the validator that rejects a bad one before it ships.
// The row holds what a client needs to put the character on screen and in a fight, by reference: the engine asset and its generated world asset, the armour set (loot ids), the stats
// recipe (an archetype and a level band: the numbers stay computed by moves.ts opponentAt, never copied), the animation set, the finisher bones, the blood profile, the loot table and
// the legend citation. The Pit and every zone are clients of the same row: a new character is one row here, no code. Pure data: only `import type`, no DOM, no clock, no storage.
// To extend: add the field to CatalogueRow, one check in catalogueProblems, one case in tests/catalogue.test.ts; nothing reads a row by position.
import type { FinisherId } from '../finishers.ts';
import type { LootId } from '../loot.ts';
import type { RigId } from '../roster.ts';
import type { PickedStance } from '../stance.ts';

export type Shape = 'quadruped' | 'biped';
export type Cut = { head: readonly string[]; neck: readonly string[]; limbs: Readonly<Record<string, readonly string[]>> };   // bone names (the rig's skin joints), by limb id
export type FinisherTiming = { id: FinisherId; pose: string | null; seconds: number; measured: boolean };   // one per pick: the pose word characters.ts understands (null = no clip yet, plain death plays) and the seconds it takes (src/finishers.ts)
export type Part = { id: string; bones: readonly string[]; vital: boolean; weight: number; cuttable: boolean; parent?: string };   // one hurtable region (World's #2000 schema): bone names are skin joints, parent = the part it hangs from (a cut here carries its descendants away), weight = share of hits
export type Bodytype = { parts: readonly Part[] };   // what can be hurt on a body family that shares a skeleton (src/fight/body-tables.ts)
export type Species = { blood: { start: string; end: string } | null; decal: { id: string; sizeM: number } | null; spray: number };   // how a species bleeds; spray is a multiple of the Pit's BLOOD counts for a man (1)
export type WoundTier = { below: number; decals: number; drip: number };   // at hp fraction below `below`: marks on the body and the drip as a multiple of bleedRate
export type Wounds = { body: string; species: string; size: number; bleedRate: number; tiers: readonly WoundTier[] };   // a creature's wound row: the bodytype and species tables it reads, and its own numbers
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
  finisher: { cut: Cut | null; finishers: readonly FinisherId[]; timing: readonly FinisherTiming[] };   // where a finisher may cut (null = the rig has no named bones to cut at), and the picks from src/finishers.ts (last = plainDeath, the safe fallback)
  blood: { start: string; end: string; amount: number } | null;   // colour over a drop's life (as src/blood-style.ts BLOOD) and the multiple of its particle counts (1 = a man); null = bloodless (the Skeleton, roster blood: false)
  render: { scale: number };                   // how big the duel draws it as a multiple of its rig (src/beast-scale.ts; 1 = as built): render only, the sim's capsule is untouched
  weapon: string;                               // the roster's weapon id (moves.ts WEAPONS); a creature's bite is a weapon too
  home: PickedStance;                           // the stance its mood favours (src/stance.ts HOME; 'neutral' when it has none)
  voice: string | null;                         // the key of its throat in src/audio/creature.ts THROATS; null = silent
  look: { levels: readonly number[]; phone: boolean; tint: boolean };   // the Pit rungs that have a shipping look file (src/rank-look.ts SHIPPING_LOOKS), whether it also ships a phone LOD (PHONE_LOOKS), and whether its kit takes the rung's finish (src/rank-tint.ts: any armoured character with ranks)
  ladder: { order: number | null; hold: boolean };   // its place on the Pit ladder, 1 = first (src/ladder.ts LADDER); null while held off it (roster `hold`)
  wounds: Wounds | null;                        // how it is hurt and how it bleeds (K5); null = the Pit's own gore as today (the men and the goblin)
  loot: { table: string | null };               // a loot-table id; null = the Pit's own loot (src/loot.ts pieces), no zone table
  legend: Legend | null;                        // a creature's citation; null for a ranked opponent (its ranks carry the names)
  ranks: readonly RankLegend[];                 // the ten Pit ranks' named opponents, rank 1 first (src/legends.ts); [] for a creature
};

export type RowCode = 'id' | 'asset' | 'budget' | 'armour' | 'stats' | 'animations' | 'finisher' | 'blood' | 'loot' | 'legend' | 'render' | 'weapon' | 'home' | 'voice' | 'look' | 'ladder' | 'timing' | 'wounds' | 'bodytype' | 'dup-id';
export type RowIssue = { code: RowCode; path: string; message: string };
const HEX = /^#[0-9a-f]{6}$/i, WORLD_MAX_TRIS = 10000;   // the world ceiling a row may not raise (the world goblin is ~8k)

/** The ways a row is bad, empty when it is good. `known` supplies what only the caller can know (the roster ids, loot ids, tables, finishers, archetypes). */
export function catalogueProblems(row: CatalogueRow, known: { roster: ReadonlySet<string>; loot: ReadonlySet<string>; tables: ReadonlySet<string>; finishers: ReadonlySet<string>; archetypes: ReadonlySet<string>; weapons: ReadonlySet<string>; stances: ReadonlySet<string>; voices: ReadonlySet<string>; poses: ReadonlySet<string>; bodytypes: Readonly<Record<string, Bodytype>>; species: Readonly<Record<string, Species>> }): RowIssue[] {
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
  if (!(row.render.scale > 0 && row.render.scale <= 4)) add('render', 'render.scale', 'a draw scale in (0, 4]');
  if (!known.weapons.has(row.weapon)) add('weapon', 'weapon', `${row.weapon} is not a weapon`);
  if (!known.stances.has(row.home)) add('home', 'home', `${row.home} is not a stance pick`);
  if (row.voice !== null && !known.voices.has(row.voice)) add('voice', 'voice', `${row.voice} has no throat`);
  const { levels } = row.look;
  if (!levels.every((l, i) => Number.isInteger(l) && l >= 1 && l <= 10 && (i === 0 || l > levels[i - 1]!)) || (levels.length > 0 && row.ranks.length !== 10) || typeof row.look.phone !== 'boolean' || (row.look.tint && !row.armour.length)) add('look', 'look', 'ascending rungs 1..10 on a ranked character, and a tint only where there is armour');
  if (row.ladder.hold ? row.ladder.order !== null : !(Number.isInteger(row.ladder.order) && row.ladder.order! >= 1)) add('ladder', 'ladder', 'a held character has no order, a ladder one a 1-based order');
  const { timing } = row.finisher;
  if (timing.length !== finishers.length || timing.some((t, i) => t.id !== finishers[i] || !(t.seconds > 0 && t.seconds <= 10) || (t.pose !== null && !known.poses.has(t.pose)))) add('timing', 'finisher.timing', 'one entry per pick, in order, seconds in (0, 10], a known pose or null');
  if (row.wounds) {
    const w = row.wounds, body = known.bodytypes[w.body], species = known.species[w.species], fault = (m: string) => add('wounds', 'wounds', m);
    if (!body || !species) fault(`${w.body} / ${w.species} must be in the bodytype and species tables`);
    else {
      if (!(w.size > 0) || !(w.bleedRate >= 0 && w.bleedRate <= 1)) fault('a size above 0 and a bleedRate in [0, 1]');
      if (w.bleedRate > 0 && !species.blood) fault('a bleeding creature needs a species with blood');
      if (!w.tiers.every((t, i) => t.below > 0 && t.below < 1 && (i === 0 || t.below < w.tiers[i - 1]!.below) && Number.isInteger(t.decals) && t.decals >= 0 && t.drip >= 0 && t.drip <= 4)) fault('tiers below in (0, 1) strictly descending, whole decals, drip in [0, 4]');
      if (row.blood ? !species.blood || species.blood.start !== row.blood.start || species.blood.end !== row.blood.end || Math.abs(species.spray * w.size - row.blood.amount) > 1e-9 : species.blood) fault('the species blood and spray x size must equal the row blood');
      const hurt = new Set(body.parts.flatMap((p) => p.bones));
      if (row.finisher.cut && ![...row.finisher.cut.head, ...row.finisher.cut.neck, ...Object.values(row.finisher.cut.limbs).flat()].every((b) => hurt.has(b))) fault('every bone a finisher cuts at is a bone of a bodytype part');
    }
  }
  const named = (r: RankLegend) => r.name.trim() && r.source.trim() && r.backstory.trim();
  if (row.ranks.length ? row.ranks.length !== 10 || !row.ranks.every(named) || row.legend !== null : !row.legend || !('work' in row.legend ? row.legend.work.trim() : 'legendId' in row.legend ? row.legend.legendId : row.legend.pending)) add('legend', 'legend/ranks', 'a ranked opponent has ten named ranks and no creature citation; a creature has a citation, a legend id or a pending note');
  return bad;
}
/** The ways a bodytype's part tree is wrong (empty when right): one root (the trunk, never cuttable), every parent present, no cycles, weights above 0, a vital part. A head hangs from the neck and the neck from the trunk (ids `head` and `neck`, the schema's names), so severing the neck takes the head with it. */
export function bodytypeProblems(bt: Bodytype): string[] {
  const bad: string[] = [], ids = new Set(bt.parts.map((p) => p.id)), byId = new Map(bt.parts.map((p) => [p.id, p]));
  if (ids.size !== bt.parts.length) bad.push('part ids must be unique');
  for (const p of bt.parts) {
    if (!(p.weight > 0)) bad.push(`${p.id}: weight above 0`);
    if (p.parent !== undefined && !ids.has(p.parent)) bad.push(`${p.id}: parent ${p.parent} is not a part`);
    for (let at: Part | undefined = p, n = 0; at?.parent !== undefined && byId.has(at.parent); at = byId.get(at.parent), n++) if (n > bt.parts.length) { bad.push(`${p.id}: a cycle`); break; }
  }
  const roots = bt.parts.filter((p) => p.parent === undefined);
  if (roots.length !== 1) bad.push(`exactly one root part (the trunk), found ${roots.length}`);
  else if (roots[0]!.cuttable || !roots[0]!.vital) bad.push('the root is the trunk: vital, never cuttable');
  if (!bt.parts.some((p) => p.vital)) bad.push('a vital part');
  const under = (id: string, of: string): boolean => { for (let at = byId.get(id), n = 0; at?.parent !== undefined && n <= bt.parts.length; at = byId.get(at.parent), n++) if (at.parent === of) return true; return false; };   // `id` hangs below `of`
  if (byId.has('head') && byId.has('neck') && (!under('head', 'neck') || under('neck', 'head'))) bad.push('the head hangs from the neck, never the neck from the head');
  return bad;
}
export function catalogueRowsProblems(rows: readonly CatalogueRow[], known: Parameters<typeof catalogueProblems>[1]): RowIssue[] {
  const seen = new Set<string>();
  return rows.flatMap((r, i) => [...(seen.has(r.id) ? [{ code: 'dup-id' as const, path: `[${i}].id`, message: `${r.id} twice` }] : []), ...(seen.add(r.id), catalogueProblems(r, known))].map((p) => ({ ...p, path: `[${i}].${p.path}` })));
}
