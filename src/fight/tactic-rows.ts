// The Gothic tactic table (spec docs/specs/combat/gothic-tactic-table.md, donor OpenGothic fightalgo.cpp fillQueue): a warden profile may name a tactic row
// (`AiProfile.tactic`) that WEIGHTS a choice the warden already makes, keyed by situation. Rows live in tactic-defs.json, manifest-loaded through the shared
// registry. A profile without `tactic` never reaches this file's table: no draw, no branch, the warden byte for byte. A sim file: it imports only the shared row loader.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import TACTIC_DEFS from './tactic-defs.json' with { type: 'json' };
import TACTIC_MANIFEST from './tactic-defs.manifest.json' with { type: 'json' };

// The reaction slot's vocabulary: the plans the warden already has for a noticed swing (parry; brace = the guard that meets it; backstep = the step out).
// `sidestep` is in the spec's list but the duel has no sidestep move to name (the roll is `dodge`): it is not accepted until Strategy rules which move it is.
export type Reaction = 'parry' | 'brace' | 'backstep';
export type Weighted<C extends string> = { readonly choice: C; readonly weight: number };
export type TacticBlock = { readonly heroWinding?: readonly Weighted<Reaction>[] };
const REACTIONS: readonly string[] = ['parry', 'brace', 'backstep'];
const MAX_ENTRIES = 6;

const TACTIC_T = tableFromFile(TACTIC_MANIFEST.tables[0] as unknown as Manifest, TACTIC_DEFS, 'tactic-defs.json');
loadRegistry([TACTIC_T]);
// One check shared by the load and the tests: at most six entries, a known choice each, positive weights that are not all zero.
export function checkTactic(id: string, list: readonly Weighted<string>[] | undefined): void {
  if (list === undefined) return;
  if (!list.length || list.length > MAX_ENTRIES) throw new Error(`tactic ${id}: heroWinding needs 1..${MAX_ENTRIES} entries`);
  for (const e of list) if (!REACTIONS.includes(e.choice) || !(e.weight > 0)) throw new Error(`tactic ${id}: heroWinding entry ${e.choice} is not a known reaction with a positive weight`);
}
export const TACTIC_ROWS: Readonly<Record<string, TacticBlock>> = Object.fromEntries((TACTIC_T.rows as unknown as ({ id: string } & TacticBlock)[]).map((r) => {
  checkTactic(r.id, r.heroWinding);
  return [r.id, { heroWinding: r.heroWinding }];
}));
// One seeded draw over the weights, in row order: `u` is the warden's own roll() in [0, 1).
export const pickWeighted = <C extends string>(list: readonly Weighted<C>[], u: number): C => {
  let at = u * list.reduce((sum, e) => sum + e.weight, 0);
  for (const e of list) { if (at < e.weight) return e.choice; at -= e.weight; }
  return list[list.length - 1].choice;
};
