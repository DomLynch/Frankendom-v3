// M7 deliverable 3, KNOCKBACK, SHOVE AND KICK (data/feel-kick.json), opt-in ?feel=kick. PRESENTATION ONLY: it reads the sim's kick Hit event on the opponent and
// drives his ragdoll (rd.stagger / rd.knockdown('push') from @frankendom/physics) by the kicker's mass and the target's stance, then shows a 'finish now' cue for
// the finisher window. The outcome and the window change the fight, so they are the sim's (Strategy's ruling 2026-10-27): this module never writes the sim; it
// emits the named event `feel:kick_result {outcome, finisherWindowS, ...}` (rows `event`) on the page's list for V3 Dev's sim to read.
// The core (kickResult, stanceOf, massOf, windowAt) is pure: no three, no DOM, no clock. createFeelKick is the controller a ragdoll plugs in (src/fight/feel.ts registry).
import FEEL from '../../data/feel-kick.json' with { type: 'json' };
import type { CombatEvent } from './duel.ts';

export type FeelKickRows = typeof FEEL;
export type Outcome = 'stagger' | 'knockdown';
export type Stance = 'open' | 'guarding' | 'midSwing' | 'recovering';
type Vec3 = [number, number, number];

/** The package's knockdown fall seconds (data/rules.json's package rows via loadRules().knockdown.fall_seconds): `push` falls, `down` stays down. */
export type Fall = { push: number; down: number };

/** ?feel=kick (rows `query`, `value`): on. Anything else, and no query, is today's fight. */
export function feelKickOn(rows: Pick<FeelKickRows, 'on' | 'query' | 'value'>, search: string): boolean { return rows.on && new URLSearchParams(search).get(rows.query) === rows.value; }

/** A fighter's mass in kg: his row, else the default. `id`: 'hero' for the player's side, else the opponent's id. */
export function massOf(rows: Pick<FeelKickRows, 'massKg'>, id: string): number { return (rows.massKg as Record<string, number | undefined>)[id] ?? rows.massKg.default; }

/** The stance a kick finds him in: the Hit's own `guarded` flag (a kick into a raised guard) wins, else his sim phase at the kick (the phase of the frame before it) through the `phase` rows. */
export function stanceOf(rows: Pick<FeelKickRows, 'phase'>, phase: string | undefined, guarded = false): Stance {
  if (guarded) return 'guarding';
  const map = rows.phase as Record<string, Stance | undefined>;
  return (phase !== undefined ? map[phase] : undefined) ?? (map.default as Stance);
}

export type KickInput = { kickerKg: number; targetKg: number; stance: Stance; forceMult?: number; canKnockdown?: boolean };
export type KickResult = {
  outcome: Outcome; force: number; massRatio: number; stance: Stance;
  impulse: number; lift: number;                       // into the ragdoll's chest, in the package's units (physics.json hit.impulse is 30)
  pushDistanceM: number; pushVelocityMs: number;       // what the push shows: the distance over rows push.pushS
  downS: number;                                        // a knockdown's seconds on the ground: the package's fall + down (0 for a stagger)
  window: { startS: number; lengthS: number };         // the finisher window after the kick
};

/** One kick (or shove) into a result. force = (kicker mass / target mass, clamped)^massExp x stance multiplier x the shove's forceMult; knockdown at or over knockdownAt (never for a shove that cannot). */
export function kickResult(rows: FeelKickRows, fall: Fall, input: KickInput): KickResult {
  const [lo, hi] = rows.massClamp, ratio = Math.min(hi!, Math.max(lo!, input.kickerKg / input.targetKg));
  const force = Math.pow(ratio, rows.massExp) * (rows.stance as Record<string, number>)[input.stance]! * (input.forceMult ?? 1);
  const outcome: Outcome = force >= rows.knockdownAt && input.canKnockdown !== false ? 'knockdown' : 'stagger';
  const [il, ih] = rows.push.impulseClamp, distance = rows.push.distanceM[outcome] * force;
  return {
    outcome, force, massRatio: ratio, stance: input.stance,
    impulse: Math.min(ih!, Math.max(il!, rows.push.impulsePerForce * force)), lift: rows.push.lift[outcome],
    pushDistanceM: distance, pushVelocityMs: distance / rows.push.pushS,
    downS: outcome === 'knockdown' ? fall.push + fall.down : 0, window: rows.window[outcome],
  };
}

/** Is a finisher window open `t` seconds after the kick? Opens at startS, closes at startS + lengthS. */
export function windowAt(w: { startS: number; lengthS: number }, t: number): boolean { return t >= w.startS && t < w.startS + w.lengthS; }

/** The sim move a Hit belongs to: 'kick' (rows `moves`), a shove (rows shove.moves), or null (not ours). */
export function kindOf(rows: Pick<FeelKickRows, 'moves' | 'shove'>, move: string | undefined): { forceMult: number; canKnockdown: boolean } | null {
  if (!move) return null;
  if (rows.moves.includes(move)) return { forceMult: 1, canKnockdown: true };
  const s = (rows.shove.moves as Record<string, { forceMult: number; canKnockdown: boolean } | undefined>)[move];
  return s ?? null;
}

/** The event this module emits for the sim to read (rows `event.name`). */
export type KickEvent = { type: string; tick: number; move: string; outcome: Outcome; stance: Stance; force: number; finisherWindowS: number; finisherStartS: number; pushDistanceM: number; pushVelocityMs: number };

/** What the controller drives: the package's ragdoll (ragdoll.ts `Ragdoll`) and where the kick landed in his frame. */
export type KickRagdoll = { stagger(hit?: { part: string; impulse: Vec3 }): void; knockdown(kind: 'damage' | 'push', hit?: { part: string; impulse: Vec3 }): void };
export type HitContext = { foeId: string; foePhase?: string; frameYaw: number; rd: KickRagdoll; fall: Fall };

/** One page's controller. `hit` handles a kick or shove Hit on the opponent (true = handled: the caller skips V1's stagger); `frame(dt)` ages the window and shows the cue;
 *  `kill()` ends the window (a dead foe needs no 'finish now'); `debug` is on globalThis.__v3Feel. */
export function createFeelKick(rows: FeelKickRows = FEEL, opts: { cueHost?: { show(on: boolean, text: string): void } } = {}) {
  const log = (): KickEvent[] => ((globalThis as Record<string, unknown>)[rows.event.log] ??= []) as KickEvent[];
  let since = -1, win: { startS: number; lengthS: number } | null = null, shown = false;
  const debug = { hits: 0, last: null as (KickResult & { move: string }) | null, cueFrames: 0, windowOpen: false };
  (globalThis as { __v3Feel?: unknown }).__v3Feel = debug;
  const cue = (on: boolean) => { if (on !== shown) { shown = on; opts.cueHost?.show(on, rows.cue.text); } };
  return {
    debug,
    hit(e: CombatEvent, ctx: HitContext): boolean {
      const kind = e.type === 'Hit' && e.target === 1 ? kindOf(rows, e.move) : null;
      if (!kind || e.heading === undefined) return false;
      const r = kickResult(rows, ctx.fall, { kickerKg: massOf(rows, 'hero'), targetKg: massOf(rows, ctx.foeId), stance: stanceOf(rows, ctx.foePhase, e.guarded === true), ...kind, forceMult: kind.forceMult });
      const yaw = e.heading - ctx.frameYaw, hit = { part: rows.push.part, impulse: [Math.sin(yaw) * r.impulse, r.lift, Math.cos(yaw) * r.impulse] as Vec3 };
      if (r.outcome === 'knockdown') ctx.rd.knockdown('push', hit); else ctx.rd.stagger(hit);
      since = 0; win = r.window; debug.hits++; debug.last = { ...r, move: e.move! };
      const ev: KickEvent = { type: rows.event.name, tick: e.tick, move: e.move!, outcome: r.outcome, stance: r.stance, force: r.force, finisherWindowS: r.window.lengthS, finisherStartS: r.window.startS, pushDistanceM: r.pushDistanceM, pushVelocityMs: r.pushVelocityMs };
      const list = log(); list.push(ev); while (list.length > rows.event.keep) list.shift();
      return true;
    },
    frame(dt: number) {
      if (since < 0 || !win) return cue(false);
      since += dt;
      debug.windowOpen = windowAt(win, since);
      if (since >= win.startS + win.lengthS) { since = -1; win = null; debug.windowOpen = false; return cue(false); }
      if (debug.windowOpen) debug.cueFrames++;
      cue(rows.cue.on && debug.windowOpen);
    },
    kill() { since = -1; win = null; debug.windowOpen = false; cue(false); },
  };
}

/** A DOM cue: a pulsing label over the canvas (rows `cue`), moved by the caller each frame with `place(x, y)` in CSS px. Browser only. */
export function createCueElement(rows: FeelKickRows = FEEL): { show(on: boolean, text: string): void; place(x: number, y: number): void } {
  const c = rows.cue, style = document.createElement('style');
  style.textContent = `.feel-kick-cue{position:fixed;z-index:30;transform:translate(-50%,-100%);padding:2px 10px;border-radius:14px;border:2px solid ${c.color};background:#000a;color:${c.color};font:800 ${c.sizePx}px/1.1 sans-serif;letter-spacing:.06em;white-space:nowrap;pointer-events:none;display:none;animation:feel-kick-pulse ${c.pulseS}s ease-in-out infinite}@keyframes feel-kick-pulse{0%,100%{opacity:1}50%{opacity:.55}}`;
  document.head.appendChild(style);
  const el = document.createElement('div'); el.className = 'feel-kick-cue'; document.body.appendChild(el);
  return { show(on, text) { el.textContent = text; el.style.display = on ? 'block' : 'none'; }, place(x, y) { el.style.left = `${x}px`; el.style.top = `${y - c.liftPx}px`; } };
}
