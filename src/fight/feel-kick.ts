// M7 deliverable 3, KNOCKBACK, SHOVE AND KICK (data/feel-kick.json), opt-in ?feel=kick (src/fight/feel.ts registry). PRESENTATION ONLY: it reads the sim's kick Hit event on the opponent
// and says how his ragdoll shows it (a stagger or a knockdown by push, by the kicker's mass and his stance), then shows a 'finish now' cue for the finisher window and emits
// ctx.emit('feel:kick_result', { outcome, finisherWindowS, ... }). The outcome and the window change the fight, so they are the SIM's (Strategy / V3 Dev, 2026-10-27: V3's sim computes them from its
// own events and rows, data/feel-sim.json, never from Jolt; when they disagree the sim wins): the rows here are the presentation's mirror, and nothing here writes the sim.
// The core (kickResult, stanceOf, massOf, windowAt, kindOf) is pure: no three, no DOM, no clock.
import FEEL from '../../data/feel-kick.json' with { type: 'json' };
import { registerFeel, type FeelCtx, type FeelHooks } from './feel.ts';
import type { CombatEvent } from './duel.ts';
import type { Presentation } from './rules-eval.ts';

export type FeelKickRows = typeof FEEL;
export type Outcome = 'stagger' | 'knockdown';
export type Stance = 'open' | 'guarding' | 'midSwing' | 'recovering';

/** A fighter's mass in kg: his row, else the default. `id`: 'hero' for the player's side, else the opponent's id. */
export function massOf(rows: Pick<FeelKickRows, 'massKg'>, id: string): number { return (rows.massKg as Record<string, number | undefined>)[id] ?? rows.massKg.default; }

/** The stance a kick finds him in. A Hit flagged `guarded` (a kick into a raised guard) wins; then recovering (he was just staggered or parried), then mid-swing (he began an attack and it has not landed or missed), else open. `t`: seconds left of each. */
export function stanceOf(t: { swing: number; recover: number }, guarded = false): Stance {
  if (guarded) return 'guarding';
  return t.recover > 0 ? 'recovering' : t.swing > 0 ? 'midSwing' : 'open';
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
export function kickResult(rows: FeelKickRows, input: KickInput): KickResult {
  const [lo, hi] = rows.massClamp, ratio = Math.min(hi!, Math.max(lo!, input.kickerKg / input.targetKg));
  const force = Math.pow(ratio, rows.massExp) * (rows.stance as Record<string, number>)[input.stance]! * (input.forceMult ?? 1);
  const outcome: Outcome = force >= rows.knockdownAt && input.canKnockdown !== false ? 'knockdown' : 'stagger';
  const [il, ih] = rows.push.impulseClamp, distance = rows.push.distanceM[outcome] * force;
  return {
    outcome, force, massRatio: ratio, stance: input.stance,
    impulse: Math.min(ih!, Math.max(il!, rows.push.impulsePerForce * force)), lift: rows.push.lift[outcome],
    pushDistanceM: distance, pushVelocityMs: distance / rows.push.pushS,
    downS: outcome === 'knockdown' ? rows.fall.push + rows.fall.down : 0, window: rows.window[outcome],
  };
}

/** Is a finisher window open `t` seconds after the kick? Opens at startS, closes at startS + lengthS. */
export function windowAt(w: { startS: number; lengthS: number }, t: number): boolean { return t >= w.startS && t < w.startS + w.lengthS; }

/** The sim move a Hit belongs to: a kick (rows `moves`), a shove (rows shove.moves), or null (not ours). */
export function kindOf(rows: Pick<FeelKickRows, 'moves' | 'shove'>, move: string | undefined): { forceMult: number; canKnockdown: boolean } | null {
  if (!move) return null;
  if (rows.moves.includes(move)) return { forceMult: 1, canKnockdown: true };
  return (rows.shove.moves as Record<string, { forceMult: number; canKnockdown: boolean } | undefined>)[move] ?? null;
}

/** The ragdoll's Presentation (rules-eval.ts) for a result: what `react()` in ragdoll.ts takes (the same shape ?rules=m4 returns). `scale`: the impulse over physics.json's hit.impulse (rows push.refImpulse). */
export function presentationOf(rows: FeelKickRows, r: KickResult): Presentation {
  return { action: r.outcome, scale: r.impulse / rows.push.refImpulse, cause: 'push', downS: r.downS, cut: null, outcome: r.outcome === 'knockdown' ? 'knockdown' : 'hit', strength: r.force, deferredKill: false };
}

/** The event this module emits for the sim (rows `event.name`). */
export type KickEvent = { tick: number; move: string; outcome: Outcome; stance: Stance; force: number; finisherWindowS: number; finisherStartS: number; pushDistanceM: number; pushVelocityMs: number };

/** A DOM cue: a pulsing label over the canvas (rows `cue`), at a fixed spot (xPct, yPct of the viewport). Browser only. */
export function createCueElement(rows: FeelKickRows = FEEL): { show(on: boolean, text: string): void } {
  const c = rows.cue, style = document.createElement('style');
  style.textContent = `.feel-kick-cue{position:fixed;z-index:30;left:${c.xPct}%;top:${c.yPct}%;transform:translate(-50%,-50%);padding:2px 10px;border-radius:14px;border:2px solid ${c.color};background:#000a;color:${c.color};font:800 ${c.sizePx}px/1.1 sans-serif;letter-spacing:.06em;white-space:nowrap;pointer-events:none;display:none;animation:feel-kick-pulse ${c.pulseS}s ease-in-out infinite}@keyframes feel-kick-pulse{0%,100%{opacity:1}50%{opacity:.55}}`;
  document.head.appendChild(style);
  const el = document.createElement('div'); el.className = 'feel-kick-cue'; el.setAttribute('aria-live', 'polite'); document.body.appendChild(el);
  return { show(on, text) { el.textContent = text; el.style.display = on ? 'block' : 'none'; } };
}

/** One page's controller. `hit` handles a kick or shove Hit on the opponent (returns the ragdoll's Presentation, or null when it is not ours), `frame` ages the stance trackers and the window and shows the cue,
 *  `kill` ends the window. `cueHost`: the cue (a test passes its own; the page gets the DOM one on first use). `debug` is on globalThis.__v3Feel. */
export function createFeelKick(rows: FeelKickRows = FEEL, opts: { cueHost?: { show(on: boolean, text: string): void } } = {}) {
  const log = (): KickEvent[] => ((globalThis as Record<string, unknown>)[rows.event.log] ??= []) as KickEvent[];
  const track = { swing: 0, recover: 0 };
  let since = -1, win: { startS: number; lengthS: number } | null = null, shown = false, host = opts.cueHost;
  const debug = { hits: 0, last: null as (KickResult & { move: string }) | null, cueFrames: 0, windowOpen: false };
  (globalThis as { __v3Feel?: unknown }).__v3Feel = debug;
  const cue = (on: boolean) => {
    if (on === shown) return;
    shown = on;
    if (!host && typeof document !== 'undefined' && rows.cue.on) host = createCueElement(rows);
    host?.show(on, rows.cue.text);
  };
  function react(e: CombatEvent, ctx: Pick<FeelCtx, 'emit'> & { foeId?: string }): Presentation | null {
    const kind = e.type === 'Hit' && e.target === 1 ? kindOf(rows, e.move) : null;
    if (!rows.on || !kind) return null;
    const r = kickResult(rows, { kickerKg: massOf(rows, 'hero'), targetKg: massOf(rows, ctx.foeId ?? 'default'), stance: stanceOf(track, e.guarded === true), ...kind });
    since = 0; win = r.window; debug.hits++; debug.last = { ...r, move: e.move! };
    const ev: KickEvent = { tick: e.tick, move: e.move!, outcome: r.outcome, stance: r.stance, force: r.force, finisherWindowS: r.window.lengthS, finisherStartS: r.window.startS, pushDistanceM: r.pushDistanceM, pushVelocityMs: r.pushVelocityMs };
    const list = log(); list.push(ev); while (list.length > rows.event.keep) list.shift();
    ctx.emit(rows.event.name, ev);
    return presentationOf(rows, r);
  }
  // The fall on screen: a knockdown's bones follow the ragdoll (ctx.blendToward, feel.ts) while the package says `knockdown`, then ease back to the clip over rows getUpS.
  let down = false, getUp = -1;
  const lying = (ctx: Pick<FeelCtx, 'partBones' | 'blendToward'> | undefined, w: number) => { if (ctx?.blendToward) ctx.blendToward(Object.fromEntries(Object.keys(ctx.partBones).map((p) => [p, w]))); };
  return {
    debug,
    react,
    /** The registry's hit hook: react, then give the ragdoll the push (rd.knockdown('push') or rd.stagger) in its own frame (the Hit's heading turned by the group's yaw). */
    hit(e: CombatEvent, ctx: FeelCtx): Presentation | null {
      const p = react(e, { emit: ctx.emit, foeId: FOE });
      if (!p || e.heading === undefined) return p;
      const yaw = e.heading - ctx.group.rotation.y, mag = p.scale * rows.push.refImpulse, push = { part: rows.push.part, impulse: [Math.sin(yaw) * mag, rows.push.lift[p.action as Outcome], Math.cos(yaw) * mag] as [number, number, number] };
      if (p.action === 'knockdown') { ctx.rd.knockdown('push', push); down = true; getUp = -1; } else ctx.rd.stagger(push);
      return p;
    },
    frame(dt: number, events: readonly CombatEvent[] = [], ctx?: FeelCtx) {
      if (down && ctx) {
        if (ctx.rd.state === 'knockdown') lying(ctx, 1);
        else { down = false; getUp = rows.getUpS; }
      }
      if (!down && getUp > 0 && ctx) { getUp -= dt; lying(ctx, Math.max(0, getUp / rows.getUpS)); }
      track.swing = Math.max(0, track.swing - dt); track.recover = Math.max(0, track.recover - dt);
      for (const e of events) {   // after this frame's hits were read: the stance for the NEXT kick
        if (e.type === 'AttackStarted' && e.actor === 1) track.swing = rows.track.swingS;
        else if ((e.type === 'AttackMissed' || e.type === 'Hit') && e.actor === 1) track.swing = 0;
        else if ((e.type === 'Staggered' && e.actor === 1) || (e.type === 'Parried' && e.target === 1)) { track.swing = 0; track.recover = rows.track.recoverS; }
      }
      if (since < 0 || !win) return cue(false);
      since += dt;
      debug.windowOpen = windowAt(win, since);
      if (since >= win.startS + win.lengthS) { since = -1; win = null; debug.windowOpen = false; return cue(false); }
      if (debug.windowOpen) debug.cueFrames++;
      cue(rows.cue.on && debug.windowOpen);
    },
    kill() { since = -1; win = null; debug.windowOpen = false; down = false; getUp = -1; cue(false); },
  };
}
const FOE = 'pitborn';   // the one opponent with a ragdoll (data/physics.json opponents); the hook's ctx does not carry his id

// The registry hooks (feel.ts): one controller for the page. The hit hook drives the ragdoll itself (knockdown by push, or a stagger) BEFORE ragdoll.ts's own V1 stagger, which the package ignores
// once he is down; the frame hook makes the bones follow the ragdoll while he lies (ctx.blendToward, feel.ts PR #100) and eases him back to the clip.
const controller = createFeelKick();
registerFeel('kick', {
  hit: (e: CombatEvent, ctx: FeelCtx) => { controller.hit(e, ctx); },
  frame: (dt: number, events: readonly CombatEvent[], ctx: FeelCtx) => controller.frame(dt, events, ctx),
  kill: () => controller.kill(),
} satisfies FeelHooks);
