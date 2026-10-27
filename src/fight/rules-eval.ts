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
type PkgRules = { swing: { hand_speed_ref_m_s: Record<string, number>; heavy_mult: number }; strength_scale: Record<string, number>; knockdown: { fall_seconds: Record<string, number> }; weapons: Record<string, unknown> };
/** What the physics chunk exports (physics-chunk.ts): the evaluator and its state factory. */
export type RulesPackage = {
  loadRules(): PkgRules; createEvaluator(rules: PkgRules): { rules: PkgRules; evaluateHit(hit: EvalHit, state: unknown): EvalResult };
  createFighterState(rules: PkgRules, body: unknown, opts?: { sword_side?: string; leg_hp?: number; hp_scale?: number; budgets?: Record<string, number> }): unknown;
};

/** The `default` row of data/rules.json picks the ruleset for a bare link (v1 for now, an interim; m4 once Physics' row fix is proven): ?rules=v1 (`query`, `v1`) is V1's rules; ?rules=m4 is M4; no query or an unknown value is the `default` row. `on` false = the evaluator is off whatever the query. */
export function rulesOnFor(rows: RuleRows, search: string): boolean {
  const q = new URLSearchParams(search).get(rows.query);
  if (variantFor(rows, search)) return rows.on;
  return rows.on && (q === rows.v1 ? rows.v1 : q === rows.m4 ? rows.m4 : rows.default) === rows.m4;
}

/** ?rules=<name> where <name> is a row of data/rules.json `variants` (m4b = the wider-sample rungs, for an A/B on a phone): that name, else null (m4, v1, no query or an unknown value are not variants). */
export function variantFor(rows: RuleRows, search: string): string | null {
  const q = new URLSearchParams(search).get(rows.query);
  return q !== null && Object.prototype.hasOwnProperty.call(rows.variants, q) ? q : null;
}

/** The package's rules with a variant's rows laid over them (a copy: the package's own object is never touched). Only the `strength_scale` and `melee_speed_gate` keys the variant names are replaced. */
export function applyVariant(rules: PkgRules, rows: RuleRows, name: string | null): PkgRules {
  if (!name) return rules;
  const v = (rows.variants as Record<string, { strength_scale?: Record<string, number>; melee_speed_gate?: Record<string, number> }>)[name];
  const copy = JSON.parse(JSON.stringify(rules)) as PkgRules & { melee_speed_gate: Record<string, unknown> };
  copy.strength_scale = { ...copy.strength_scale, ...(v?.strength_scale ?? {}) };
  copy.melee_speed_gate = { ...copy.melee_speed_gate, ...(v?.melee_speed_gate ?? {}) };
  return copy;
}

/** Per-hit hand speed. `measured`: the attacker's animated hand-bone world speed at the hit (m/s), or null (none sampled: the page's clock was stopped, no hand bone).
 *  The package's `hand_speed_ref_m_s` numbers are a LIGHT swing's hand speed (measured on the Minotaur's clips) and `swing.heavy_mult` stands for the charge. The hero's clip speed goes in
 *  times rows.speedScale (median-to-median onto the package's units), and a heavy's over rows.heavyDivisor (1 when the heavy clips carry no charge in their speed: the evaluator applies heavy_mult once).
 *  The light-equivalent is clamped to the package's measured range (rows speedMin, the package's hand p10, and speedMaxRef, its full-speed light swing); no measure = the reference row (`handSpeedRef`, light_p50). */
export function handSpeedOf(rows: RuleRows, rules: Pick<PkgRules, 'swing'>, measured: number | null | undefined, heavy: boolean): { speed: number; source: 'measured' | 'ref' } | null {
  const ref = rules.swing.hand_speed_ref_m_s[rows.handSpeedRef];
  if (typeof ref !== 'number') return null;
  if (typeof measured !== 'number' || !Number.isFinite(measured) || measured <= 0) return { speed: ref, source: 'ref' };
  // an absent or non-finite row is the identity (scale 1, divisor 1), never NaN; the validator rejects the file itself (src/sim/validate.js)
  const scale = Number.isFinite(rows.speedScale) && rows.speedScale > 0 ? rows.speedScale : 1, divisor = Number.isFinite(rows.heavyDivisor) && rows.heavyDivisor >= 1 ? rows.heavyDivisor : 1;
  const lightEquivalent = measured * scale / (heavy ? divisor : 1);
  const hi = rules.swing.hand_speed_ref_m_s[rows.speedMaxRef] ?? ref;
  return { speed: Math.min(hi, Math.max(rows.speedMin, lightEquivalent)), source: 'measured' };
}

/** One sim Hit event -> the evaluator's input, or null (not a blow on his body: a missile, no location, a weapon with no row). `rules`: the package's rows (the speed reference and heavy_mult). `measured`: the attacker's hand speed at the hit (handSpeedOf). */
export function hitInput(rows: RuleRows, rules: Pick<PkgRules, 'swing'>, e: CombatEvent, opponentId: string, measured?: number | null): EvalHit | null {
  if (e.type !== 'Hit' || e.missile || !e.location || !e.weapon) return null;
  const w = (rows.weapons as Record<string, { rule: string; blunt?: boolean } | undefined>)[e.weapon];
  const armour = (rows.armour as Record<string, string | undefined>)[opponentId] ?? rows.armour.default;
  const heavy = e.charged === true || isHeavyMove(e.move) || (e.move !== undefined && rows.heavyMoves.includes(e.move));
  const speed = handSpeedOf(rows, rules, measured, heavy);
  if (!w || !speed) return null;
  return {
    weapon: w.rule, kind: w.blunt ? 'blunt' : isStabMove(e.move) ? 'stab' : 'slash', zone: e.location as Zone,
    ...(e.location === 'legs' ? { side: rows.legSide as 'left' | 'right' } : {}), armour, handSpeed: speed.speed, swing: heavy ? 'heavy' : 'light', counterHit: e.counter === true, t: e.tick / rows.tickHz,
  };
}

/** The attacker's hand speed from his animated hand bone: one world position a frame (`push`), the speed of each step; `speed()` is the fastest of the last `speedWindow` steps
 *  (a swing's peak is a frame or two before the contact the sim reports), or null with no usable step. A step over `snapOver` m/s is a pose snap (a teleport), not a swing: dropped. Pure: no three, no clock. */
export function createHandSpeed(rows: Pick<RuleRows, 'speedWindow' | 'snapOver' | 'speedSpanS'>) {
  // The package measured a backward difference over 3 ticks (0.05 s) because V3's clips step at 20 fps: a one-frame difference on a 60 Hz page reads 0 for two frames and 3x the speed on the third.
  // So each speed here is the displacement over the last `speedSpanS` seconds / those seconds, and the caller passes the hand RELATIVE to its shoulder (no root motion, no lunge, in the body's own metres).
  let t = 0; let hist: { t: number; p: [number, number, number] }[] = []; const speeds: number[] = [];
  return {
    push(x: number, y: number, z: number, dt: number) {
      if (!(dt > 0)) return;   // a stopped clock (stills): no step, the last speeds stand
      t += dt; hist.push({ t, p: [x, y, z] });
      let k = -1; for (let i = hist.length - 2; i >= 0; i--) if (t - hist[i].t >= rows.speedSpanS - 1e-9) { k = i; break; }
      if (k < 0) return;   // not a full span yet
      hist = hist.slice(k);
      const a = hist[0], span = t - a.t, v = Math.hypot(x - a.p[0], y - a.p[1], z - a.p[2]) / span;
      if (v > rows.snapOver) return;
      speeds.push(v); if (speeds.length > rows.speedWindow) speeds.shift();
    },
    speed(): number | null { return speeds.length ? Math.max(...speeds) : null; },
    reset() { t = 0; hist = []; speeds.length = 0; },
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

/** data/rules.json `cut.precedence`: who wins a KILLING blow in this hit zone, the evaluator's cut or the sim's finisher rotation. Only an explicit 'evaluator' for the zone is the evaluator; no entry, no zone or any
 *  other value is 'finisher' (today's behaviour: the rotation plays). The default row is head: 'evaluator' (Strategy's ruling (b)); only ?rules=m4 ever reads it. */
export function cutPrecedence(rows: Pick<RuleRows, 'cut'>, location: string | undefined): 'evaluator' | 'finisher' {
  const who = location ? (rows.cut?.precedence as Record<string, string | undefined> | undefined)?.[location] : undefined;
  return who === 'evaluator' ? 'evaluator' : 'finisher';
}
/** Does the evaluator take this killing blow from the finisher rotation? Its zone's precedence is 'evaluator' AND the evaluator's verdict on a blow of that kill is a cut (`presentations`: what `hit` returned
 *  for the killing batch's Hits). A kill below the cut rung is no cut, so it keeps the rotation whatever the row says. */
export function evaluatorTakesKill(rows: Pick<RuleRows, 'cut'>, location: string | undefined, presentations: readonly (Presentation | null)[]): boolean {
  return cutPrecedence(rows, location) === 'evaluator' && presentations.some((p) => !!p?.cut);
}

/** The package's fighter state, the part of it ?feel=limbs reads (docs/API.md 'Rules evaluator': `parts[id] = { hp, max, gone }`, ids head, torso, arm_left, arm_right, leg_left, leg_right). */
export type FighterView = { alive: boolean; sword_side: 'left' | 'right'; parts: Record<string, { hp: number; max: number; gone: boolean }>; limp: boolean; weapon_dropped: boolean; outgoing_damage_mult: number };

/** Set one part's HP the way a landed blow would leave it: at 0 the part is gone, the sword arm's loss drops the weapon (outgoing damage x the package's row), a leg's loss is the limp. Pure on the state (the stills' hook). */
export function setPartHp(state: FighterView, part: string, hp: number, armGoneMult = 1): boolean {
  const p = state.parts[part];
  if (!p || !Number.isFinite(hp)) return false;
  p.hp = Math.min(p.max, Math.max(0, hp));
  if (p.hp > 0) return true;
  p.gone = true;
  if (part === `arm_${state.sword_side}` && !state.weapon_dropped) { state.weapon_dropped = true; state.outgoing_damage_mult = armGoneMult; }
  if (part.startsWith('leg_')) state.limp = true;
  return true;
}

/** The page's rules (globalThis.__v3Rules and window.__v3Fight.rules): the totals, the last results, the cuts, the per-hit cost. */
export type RulesDebug = {
  fighter?: () => FighterView; partFractions?: () => Record<string, number>; setPartHp?: (part: string, hp: number) => boolean;
  on: true; hits: number; skipped: number; byOutcome: Record<string, number>; deferredKills: number; renewals: number; cuts: { unit: string; tick: number; weapon: string }[];
  last: { input: EvalHit; measured: number | null; source: 'measured' | 'ref'; result: Omit<EvalResult, 'events'> & { events: string[] }; presentation: Presentation }[]; cost: { calls: number; totalMs: number; maxMs: number };
};

/** One page's evaluator for one opponent. `body`: the ragdoll's measure row (its parts). `pkg`: the chunk's exports. */
export function createRulesEval(rows: RuleRows, pkg: RulesPackage, body: unknown, opponentId: string, clock: () => number = () => performance.now(), hp: { foe: number; man: number } = { foe: 1, man: 1 }) {
  const ev = pkg.createEvaluator(applyVariant(pkg.loadRules(), rows, variantFor(rows, typeof location === 'undefined' ? '' : location.search)));
  // his budgets: the package's rows (a man's) scaled by his sim health over a man's (`hp`: the sim's pools, passed in; moves.ts health, RULES.health), then `budgets` (absolute, per part, data/rules.json) over that
  const fresh = () => pkg.createFighterState(ev.rules, body, { sword_side: rows.swordSide, leg_hp: rows.legHp, hp_scale: hp.foe / hp.man, budgets: rows.budgets });
  let state = fresh();
  const debug: RulesDebug = { on: true, hits: 0, skipped: 0, byOutcome: {}, deferredKills: 0, renewals: 0, cuts: [], last: [], cost: { calls: 0, totalMs: 0, maxMs: 0 } };
  // ?feel=limbs (feel-limbs.ts) reads his per-part HP and flags from here; setPartHp is the stills' hook (a part's HP to a value, with the evaluator's own consequences of 0)
  // READ only, on any host: a COPY (a console cannot reach the live state through it), and the part fractions the module reads every frame (no copy, 1 whole .. 0 gone)
  debug.fighter = () => JSON.parse(JSON.stringify(state)) as FighterView;
  debug.partFractions = () => Object.fromEntries(Object.entries((state as FighterView).parts).map(([id, p]) => [id, p.max > 0 ? p.hp / p.max : 1]));
  // the WRITE is for local hosts (and node, where there is no location): a console on a live page cannot change a fight's verdicts through it
  const local = typeof location === 'undefined' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (local) debug.setPartHp = (part, hp) => setPartHp(state as FighterView, part, hp, (ev.rules as { locational?: { arm_gone_damage_mult?: number } }).locational?.arm_gone_damage_mult ?? 1);
  const g = globalThis as { __v3Rules?: RulesDebug; __v3Fight?: { rules?: RulesDebug } };
  g.__v3Rules = debug;
  const publish = () => { if (g.__v3Fight) g.__v3Fight.rules = debug; };
  publish();
  return {
    debug,
    /** One sim Hit on his body. `simAlive`: false on the killing blow's batch (the sim's Killed decides: the evaluator's kill is then simply the kill). Null: nothing to evaluate. */
    hit(e: CombatEvent, simAlive: boolean, measured: number | null = null): Presentation | null {
      const input = hitInput(rows, ev.rules, e, opponentId, measured);
      if (!input) { debug.skipped++; return null; }
      const start = clock();
      const r = ev.evaluateHit(input, state);
      const p = present(rows, ev.rules, r, simAlive);
      const ms = clock() - start;
      debug.hits++; debug.byOutcome[r.outcome] = (debug.byOutcome[r.outcome] ?? 0) + 1;
      if (p.deferredKill) { debug.deferredKills++; if (rows.renewOnKill) { state = fresh(); debug.renewals++; } }
      if (p.cut) debug.cuts.push({ unit: p.cut, tick: e.tick, weapon: input.weapon });
      debug.last.push({ input, measured: measured ?? null, source: measured ? 'measured' : 'ref', result: { ...r, events: r.events.map((x) => x.type) }, presentation: p });
      if (debug.last.length > rows.log) debug.last.shift();
      debug.cost.calls++; debug.cost.totalMs += ms; debug.cost.maxMs = Math.max(debug.cost.maxMs, ms);
      publish();
      return p;
    },
    /** The rematch: a whole body again, this fight's list empty (the totals keep counting). */
    renew() { state = fresh(); debug.cuts.length = 0; debug.renewals++; },
  };
}
