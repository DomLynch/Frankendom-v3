// ?feel=hero (M7, hero side): the HERO's hit reactions, from the SAME rows as the Minotaur's (data/feel-hitreact.json; no second tuning). She is a 106 body (Psyche), so the package's 20 part ids map to her
// bones through the one 65 -> 106 map exactly as his do. ragdoll.ts heroRagdollFor builds a second presentation ragdoll on sim fighter 0 and runs ONLY this module on it (feel.ts activeFeels(search, undefined, true));
// the opponent's ragdoll never runs it. Her death is the package's existing death fall (ragdoll.ts step: rd.kill on the Killed event), no new rows.
// PRESENTATION ONLY, as hitreact is: it reads one sim Hit (location, heading) and writes motor strengths, impulses and a bone blend; nothing goes back to the sim.
// The state is per module instance (the Minotaur's feel-hitreact.ts keeps its own), so the two bodies never share a blow.
import ROWS from '../../data/feel-hitreact.json' with { type: 'json' };
import { createHitReact } from './feel-hitreact.ts';
import type { CombatEvent } from './duel.ts';
import type { FeelCtx, FeelHooks } from './feel.ts';

const react = createHitReact(ROWS);
let quietS = 0;   // seconds of the get-up left after a knockdown ended (the same quiet window as hitreact)
const downNow = (ctx: FeelCtx): boolean => ctx.rd.state === 'knockdown';
export const feelHooks: FeelHooks = {
  hit(e: CombatEvent, ctx: FeelCtx) {
    const seen = ((globalThis as { __heroReactSeen?: Record<string, unknown> }).__heroReactSeen ??= { hits: 0 });   // read by the clip harness: how many hits reached the hook, and the last one's fields
    seen.hits = (seen.hits as number) + 1; seen.last = { target: ctx.target, location: e.location, heading: e.heading, state: ctx.rd.state, quietS };
    if (ctx.target !== 0 || downNow(ctx) || quietS > 0) return;
    const plan = react.hit(ctx.rd, e.location, e.heading, ctx.group.rotation.y);
    if (plan) ((globalThis as { __heroReactLog?: unknown[] }).__heroReactLog ??= []).push({ tick: e.tick, zone: plan.zone, sector: plan.sector, side: plan.side });   // read by the clip harness
  },
  frame(dt: number, _events: readonly CombatEvent[], ctx: FeelCtx) {
    if (ctx.target !== 0) return;
    if (ctx.mode !== 'alive') { react.reset(); quietS = 0; return; }
    if (downNow(ctx)) { react.reset(ctx.rd); quietS = ROWS.knockdownQuietS; return; }
    if (quietS > 0) { quietS -= dt; return; }
    const f = react.frame(ctx.rd, dt);
    if (f) ctx.blendToward(Object.fromEntries(Object.entries(f.share).map(([p, s]) => [p, s * f.w])));
  },
  kill() { react.reset(); quietS = 0; },
};
