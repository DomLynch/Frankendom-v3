import type { WeaponId } from './fight/moves.ts';
import type { Finish } from './fight/duel.ts';
import { selectFinisher, type FinisherId } from './fight/finishers.ts';
import CATALOGUE_ROWS from './fight/catalogue-data.ts';
import type CATALOGUE_DEFS from './fight/catalogue-defs.ts';

// The rig: the skeleton family a body is built on, which is the blade table it fights with (src/fight/blade-paths.ts bladePathsByRig; the
// bake is per rig because the same knife sweeps a different arc in a goblin's hand than in a man's). 'hero' is the player skeleton and
// every body reproportioned from it. A held creature without a bake of its own stays on the hero table it has always used.
export type RigId = (typeof CATALOGUE_DEFS.rigs)[number]['id'];   // derived from the catalogue-defs.ts rigs rows: a new rig family is one row there
// The roster is the character catalogue's body rows (src/fight/catalogue-data.ts, pure data): a new opponent is one row there, with an archetype and weapon that already exist.
// Archetypes own combat tuning in moves.ts; adding an individual must not add AI branches. A recipe keeps the shape it always had (name, body, rig, archetype, weapon, then finishers
// / blood / hold only when the row says so), derived from the row: `finisher.allowed` absent = every finisher, `blood` null = bloodless, `ladder.hold` = off the ladder.
type Row = (typeof CATALOGUE_ROWS)[number];
type BodyRow = Exclude<Row, { body: string }>;
type Recipe<R extends BodyRow> = { name: R['name']; body: R['id']; rig: R['rig']; archetype: R['stats']['archetype']; weapon: R['fields']['weapon'] }
  & (R['stats'] extends { pools: infer P } ? { pools: P } : unknown) & (R extends { finisher: { allowed: infer F } } ? { finishers: F } : unknown) & (R['blood'] extends null ? { blood: false } : unknown) & (R['ladder']['hold'] extends true ? { hold: true } : unknown);
const recipeOf = (r: BodyRow) => ({
  name: r.name, body: r.id, rig: r.rig, archetype: r.stats.archetype, weapon: r.fields.weapon,
  ...('pools' in r.stats ? { pools: r.stats.pools } : {}),
  ...('allowed' in r.finisher ? { finishers: r.finisher.allowed } : {}), ...(r.blood === null ? { blood: false } : {}), ...(r.ladder.hold ? { hold: true } : {}),
});
export const ROSTER = Object.fromEntries(CATALOGUE_ROWS.filter((r): r is BodyRow => !('body' in r)).map((r) => [r.id, recipeOf(r)])) as unknown as { [R in BodyRow as R['id']]: Recipe<R> };
export type OpponentId = BodyRow['id'];
export function supportsFinishers(id: OpponentId, finisher?: FinisherId | null): boolean {
  const recipe = ROSTER[id];
  return !('finishers' in recipe) || (!!finisher && (recipe.finishers as readonly FinisherId[]).includes(finisher));
}
// One presentation decision for the scene and audio; the owner's picker never overrides kill eligibility.
export function resolveFinisher(id: OpponentId, finish: Finish, weapons: readonly [WeaponId, WeaponId], override: FinisherId | null = null, previous: FinisherId | null = null): FinisherId | null {
  const pick = selectFinisher(finish, weapons, previous), selected = pick && (override ?? pick);
  return selected && supportsFinishers(id, selected) ? selected : null;
}
export function hasBlood(id: OpponentId): boolean {
  const recipe = ROSTER[id];
  return !('blood' in recipe && recipe.blood === false);
}
// The bare name, without the article the roster carries ("the Centurion" -> "Centurion"): what the HUD bars, the coaching lines and
// the versus caption say. Identifiers (the id `veteran`, the body, the archetype, LootIds like `veteran.helmet`) are untouched by a
// rename — only `name` above is player-facing.
export const bareName = (id: OpponentId): string => ROSTER[id].name.replace(/^the /, '');
export const isOpponentId = (id: unknown): id is OpponentId => typeof id === 'string' && Object.hasOwn(ROSTER, id);
export const isHeld = (id: OpponentId): boolean => 'hold' in ROSTER[id] && ROSTER[id].hold === true;
// The insertion order is the existing introductory encounter sequence, never a career rank. Held recipes are listed (the journal
// greys them) but are not rungs: ladder.ts skips them.
export const ENCOUNTERS = (Object.keys(ROSTER) as OpponentId[]).map(id => ({ id, name: ROSTER[id].name, hold: isHeld(id) }));
