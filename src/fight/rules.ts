// The duel's rules, as ROWS (Dom, "centralized game engine, no hard coding"; recce #2554 group B, EQEmu's rule_values donor: one id, one value, a table the engine reads).
// The numbers live in rules-defs.json (manifest-loaded through the shared registry, never a hand list); this file only builds the nested object src/fight/moves.ts always exported as RULES, key for key
// and in the same key order, so every consumer reads exactly what it read. A row is `n` (a number), `b` (a boolean) or `piDiv` (Math.PI / piDiv, an arc: guardArc, kickArc, rear.arc), and its id is the dotted path.
// The notes that sat beside the old literal (what each number means, which RV changed it) are kept in docs/specs/combat/rules-notes.md.
// A sim file: it imports only the shared row loader, so moves.ts can import it without a cycle.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import RULE_DEFS from './rules-defs.json' with { type: 'json' };
import RULE_MANIFEST from './rules-defs.manifest.json' with { type: 'json' };

export type Rules = { health: number; draw: number; roll: number; safeStart: number; safeEnd: number; rollCost: number; backstep: { ticks: number; speed: number; cost: number; cancelFrom: number }; dodgeAttackWindow: number; feintBeat: number; parry: number; parryCooldown: number; parryStun: number; parryRecovery: number; feintCost: number; blockCost: number; breakCost: number; perfectBlock: number; perfectBlockCost: number; guardSpeed: number; guardArc: number; directionalGuard: boolean; gambit: { stagger: number }; special: { windup: number; cooldown: number; first: number; recovery: number; reach: number; damage: number; bossDamage: number; bossFrom: number; interruptAt: number; interruptCooldown: number }; skillCooldown: number; regen: number; regenDelay: number; guardRegen: number; sprintCost: number; exhaustRecover: number; exhaustedStun: number; exhaustedSpeed: number; wound: number; woundRegen: number; death: number; kickArc: number; counter: { damage: number; stagger: number }; rear: { arc: number; damage: number; stagger: number; posture: number; downed: number }; guardCounter: number; posture: { max: number; decay: number; hold: number; stun: number; parry: number; perfect: number; bloodied: number; bloodiedDecay: number }; wall: { edge: number; stagger: number; posture: number; loiter: { band: number; ticks: number; again: number; chip: number; posture: number; shove: number; into: number; raise: number; raiseAgain: number } }; retreat: { away: number; wallOnly: boolean }; attrition: { stamina: number; floor: number; legSpeed: number }; stopHit: { damage: number; stagger: number; whiff: number; walk: number }; charge: { min: number; max: number; damage: number; stagger: number }; bufferWindow: number; bufferTtl: number; stepInFrom: number; turnStart: number; turnWindup: number; location: { head: number; torso: number; legs: number } };
type RuleRow = { readonly id: string; readonly n?: number; readonly b?: boolean; readonly piDiv?: number };
const RULE_TABLE = tableFromFile(RULE_MANIFEST.tables[0] as unknown as Manifest, RULE_DEFS, 'rules-defs.json');
loadRegistry([RULE_TABLE]);
export const checkRuleRow = (r: RuleRow): RuleRow => {
  if ([r.n, r.b, r.piDiv].filter((x) => x !== undefined).length !== 1) throw Error(`rules-defs "${r.id}": exactly one of n, b, piDiv`);
  if (r.piDiv !== undefined && !(r.piDiv > 0)) throw Error(`rules-defs "${r.id}": piDiv from 1`);
  return r;
};
/** The rows in file order, one value each; the loader refuses a row that carries none or more than one. */
export const RULE_ROWS: readonly RuleRow[] = (RULE_TABLE.rows as unknown as RuleRow[]).map(checkRuleRow);
export const nestRules = (rows: readonly RuleRow[]): Rules => {
  const root: Record<string, unknown> = {};
  for (const r of rows) {
    const path = r.id.split('.'), leaf = path.pop()!;
    let at = root; for (const p of path) at = (at[p] ??= {}) as Record<string, unknown>;
    at[leaf] = r.piDiv !== undefined ? Math.PI / r.piDiv : r.b ?? r.n;
  }
  return root as Rules;
};
export const RULES: Rules = nestRules(RULE_ROWS);
