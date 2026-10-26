// The physics package's M4 hit/cut rules evaluator (@frankendom/physics createEvaluator / evaluateHit) on the opponent's ragdoll, opt-in ?rules=m4.
// Every number and name is a data row (data/rules.json); the package's own rows are read through the evaluator (data/rules.json there, M6-validated by
// loadRules). PRESENTATION ONLY: the 60 Hz sim (duel.ts) and Gate 0 never see it and nothing here goes back into the sim. This module is pure (no
// three, no DOM): src/fight/ragdoll.ts feeds it the sim's Hit events and drives the ragdoll from the Presentation it returns; test/rules-eval.test.mjs pins the mapping.
import RULES from '../../data/rules.json' with { type: 'json' };
import { isHeavyMove, isStabMove } from './move-rows.ts';
import type { CombatEvent } from './duel.ts';

export type RuleRows = typeof RULES;
type Kind = 'slash' | 'stab' | 'blunt';
type Zone = 'head' | 'torso' | 'legs';
/** The evaluator's input for one landed blow (docs/API.md 'Rules evaluator'): a hand speed, never a tip speed (the lever is the evaluator's). */
export type EvalHit = { weapon: string; kind: Kind; zone: Zone; side?: 'left' | 'right'; armour: string; handSpeed: number; swing: 'light' | 'heavy'; counterHit: boolean; t: number };
type EvalResult = {
  outcome: 'miss' | 'hit' | 'stick' | 'cut' | 'knockdown' | 'kill'; strength: number; damage: number; part: string | null; partHpAfter: number | null;
  knockdown: { fallSeconds: number; downSeconds: number; cause: 'damage' | 'push' } | null; cut: { unit: string } | null; bleed: boolean; events: { type: string }[];
  tipSpeed: number; swing: string; counterHit: boolean;
};
type PkgRules = { swing: { hand_speed_ref_m_s: Record<string, number> }; strength_scale: Record<string, number>; knockdown: { fall_seconds: Record<string, number> }; weapons: Record<string, unknown> };
/** What the physics chunk exports (physics-chunk.ts): the evaluator and its state factory. */
export type RulesPackage = {
  loadRules(): PkgRules; createEvaluator(rules: PkgRules): { rules: PkgRules; evaluateHit(hit: EvalHit, state: unknown): EvalResult };
  createFighterState(rules: PkgRules, body: unknown, opts?: { sword_side?: string; leg_hp?: number }): unknown;
};

/** ?rules=m4 (data/rules.json `query`, `m4`): the evaluator on. Anything else, including ?rules=v1 and no query, is V1's rules (the default). */
export function rulesOnFor(rows: RuleRows, search: string): boolean { return rows.on && new URLSearchParams(search).get(rows.query) === rows.m4; }

/** One sim Hit event -> the evaluator's input, or null (not a blow on his body: a missile, no location, a weapon with no row). `rules`: the package's rows (the speed reference). */
export function hitInput(rows: RuleRows, rules: Pick<PkgRules, 'swing'>, e: CombatEvent, opponentId: string): EvalHit | null {
  if (e.type !== 'Hit' || e.missile || !e.location || !e.weapon) return null;
  const w = (rows.weapons as Record<string, { rule: string; blunt?: boolean } | undefined>)[e.weapon];
  const speed = rules.swing.hand_speed_ref_m_s[rows.handSpeedRef];
  if (!w || typeof speed !== 'number') return null;
  const armour = (rows.armour as Record<string, string | undefined>)[opponentId] ?? rows.armour.default;
  const heavy = e.charged === true || isHeavyMove(e.move) || (e.move !== undefined && rows.heavyMoves.includes(e.move));
  return {
    weapon: w.rule, kind: w.blunt ? 'blunt' : isStabMove(e.move) ? 'stab' : 'slash', zone: e.location as Zone,
    ...(e.location === 'legs' ? { side: rows.legSide as 'left' | 'right' } : {}), armour, handSpeed: speed, swing: heavy ? 'heavy' : 'light', counterHit: e.counter === true, t: e.tick / rows.tickHz,
  };
}

/** What the ragdoll does with one result. `scale`: the impulse multiplier (strength over the row's reference rung, clamped). */
export type Presentation = { action: 'none' | 'stagger' | 'knockdown'; scale: number; cause: 'damage' | 'push'; downS: number; cut: string | null; outcome: EvalResult['outcome']; strength: number; deferredKill: boolean };

/** The result -> the ragdoll's action. A kill is the SIM's alone: while it lives (`simAlive`) the evaluator's kill is shown as `killAs` (a knockdown), flagged deferred. */
export function present(rows: RuleRows, rules: Pick<PkgRules, 'strength_scale' | 'knockdown'>, r: EvalResult, simAlive: boolean): Presentation {
  const ref = rules.strength_scale[rows.impulseAt] ?? 1, [lo, hi] = rows.impulseClamp;
  const base = { scale: Math.min(hi!, Math.max(lo!, r.strength / ref)), cause: 'damage' as const, downS: 0, cut: r.cut?.unit ?? null, outcome: r.outcome, strength: r.strength, deferredKill: false };
  if (r.outcome === 'miss') return { ...base, action: 'none' };
  if (r.outcome === 'kill' && simAlive) {   // no fall time of its own: the package's fall + down for that cause
    const cause = rows.killAs as 'damage' | 'push', fall = rules.knockdown.fall_seconds;
    return { ...base, action: 'knockdown', cause, downS: fall[cause]! + fall.down!, cut: null, deferredKill: true };   // the kill did not happen, so neither did the cut that made it (a torso cut is a kill)
  }
  if (r.knockdown) return { ...base, action: 'knockdown', cause: r.knockdown.cause, downS: r.knockdown.fallSeconds + r.knockdown.downSeconds };
  return { ...base, action: 'stagger' };
}

/** The page's rules (globalThis.__v3Rules and window.__v3Fight.rules): the totals, the last results, the cuts, the per-hit cost. */
export type RulesDebug = {
  on: true; hits: number; skipped: number; byOutcome: Record<string, number>; deferredKills: number; renewals: number; cuts: { unit: string; tick: number; weapon: string }[];
  last: { input: EvalHit; result: Omit<EvalResult, 'events'> & { events: string[] }; presentation: Presentation }[]; cost: { calls: number; totalMs: number; maxMs: number };
};

/** One page's evaluator for one opponent. `body`: the ragdoll's measure row (its parts). `pkg`: the chunk's exports. */
export function createRulesEval(rows: RuleRows, pkg: RulesPackage, body: unknown, opponentId: string, clock: () => number = () => performance.now()) {
  const ev = pkg.createEvaluator(pkg.loadRules());
  const fresh = () => pkg.createFighterState(ev.rules, body, { sword_side: rows.swordSide, leg_hp: rows.legHp });
  let state = fresh();
  const debug: RulesDebug = { on: true, hits: 0, skipped: 0, byOutcome: {}, deferredKills: 0, renewals: 0, cuts: [], last: [], cost: { calls: 0, totalMs: 0, maxMs: 0 } };
  const g = globalThis as { __v3Rules?: RulesDebug; __v3Fight?: { rules?: RulesDebug } };
  g.__v3Rules = debug;
  const publish = () => { if (g.__v3Fight) g.__v3Fight.rules = debug; };
  publish();
  return {
    debug,
    /** One sim Hit on his body. `simAlive`: false on the killing blow's batch (the sim's Killed decides: the evaluator's kill is then simply the kill). Null: nothing to evaluate. */
    hit(e: CombatEvent, simAlive: boolean): Presentation | null {
      const input = hitInput(rows, ev.rules, e, opponentId);
      if (!input) { debug.skipped++; return null; }
      const start = clock();
      const r = ev.evaluateHit(input, state);
      const p = present(rows, ev.rules, r, simAlive);
      const ms = clock() - start;
      debug.hits++; debug.byOutcome[r.outcome] = (debug.byOutcome[r.outcome] ?? 0) + 1;
      if (p.deferredKill) { debug.deferredKills++; if (rows.renewOnKill) { state = fresh(); debug.renewals++; } }
      if (p.cut) debug.cuts.push({ unit: p.cut, tick: e.tick, weapon: input.weapon });
      debug.last.push({ input, result: { ...r, events: r.events.map((x) => x.type) }, presentation: p });
      if (debug.last.length > rows.log) debug.last.shift();
      debug.cost.calls++; debug.cost.totalMs += ms; debug.cost.maxMs = Math.max(debug.cost.maxMs, ms);
      publish();
      return p;
    },
    /** The rematch: a whole body again, this fight's list empty (the totals keep counting). */
    renew() { state = fresh(); debug.cuts.length = 0; debug.renewals++; },
  };
}
