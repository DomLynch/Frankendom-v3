// M7 fight feel (Strategy 2026-10-27): ONE registry so each ?feel=<name> module (hit reactions, limb damage, kick, clash) plugs into the opponent's presentation ragdoll
// through three call sites in ragdoll.ts (a Hit on him, every frame, his killing blow) and none of them edits ragdoll.ts. A module registers once, from its own file:
//   registerFeel('hitreact', { hit(e, ctx) { ... }, frame(dt, events, ctx) { ... }, kill(e, ctx) { ... } });
// and is listed in feel-modules.ts (one import line per module). It runs only when the page asks for it: ?feel=hitreact or ?feel=hitreact,kick (several, comma separated).
// PRESENTATION: a hook moves bones and motors. Anything that changes the fight's OUTCOME (limp speed, guard drop, weapon drop, kick stagger or knockdown, block pushback) is SIM:
// the hook emits it by name (emitFeel) and V3's sim (a subscriber via `feel.on`, src/fight/feel-sim.ts) decides from its own events and rows. Names (agreed with V3 Dev): feel:limp {part, level},
// feel:guard_drop {side}, feel:weapon_drop {}, feel:kick_result {outcome, finisherWindowS}, feel:clash {kind, pushbackM}.
import type * as THREE from 'three';
import type { CombatEvent } from './duel.ts';
import type { Ragdoll } from './ragdoll.ts';

/** What a hook may use: the foe's ragdoll (the package's API: stagger, applyImpulse, ...), his bones by the package's part ids, his group, his mode, and the sim-event emitter. */
export type FeelCtx = { rd: Ragdoll; partBones: Record<string, THREE.Object3D>; group: THREE.Object3D; mode: 'alive' | 'dead' | 'skip'; emit: (name: string, payload?: unknown) => void; limbs: () => Record<string, number> };
export type FeelHooks = {
  /** A blow landed on him (sim event Hit, target 1), after the ragdoll's own reaction; only while he is alive. */
  hit?(e: CombatEvent, ctx: FeelCtx): void;
  /** Every frame the ragdoll steps (not while the finisher plays its own clip); `events`: the sim's events this frame. */
  frame?(dt: number, events: readonly CombatEvent[], ctx: FeelCtx): void;
  /** His killing blow (sim event Killed), after the ragdoll has taken it. */
  kill?(e: CombatEvent, ctx: FeelCtx): void;
};

const registry = new Map<string, FeelHooks>();
/** A module registers its hooks under the name ?feel= asks for (a second registration of a name replaces the first). */
export function registerFeel(name: string, hooks: FeelHooks): void { registry.set(name, hooks); }
/** The names in `?feel=a,b` (empty when the query is absent). */
export const feelNames = (search: string): string[] => (new URLSearchParams(search).get('feel') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
/** The registered hooks the page asked for, in the order it listed them; a name nothing registered is ignored. */
export const activeFeels = (search: string): FeelHooks[] => feelNames(search).flatMap((n) => { const h = registry.get(n); return h ? [h] : []; });

export type FeelSink = (name: string, payload?: unknown) => void;
const listeners = new Map<string, Set<FeelSink>>();
let limbState: (() => Record<string, number>) | undefined;
/** The bus between the presentation hooks and V3's sim (V3 Dev's ruling 2026-10-27: the SIM computes every outcome itself from its own events and its own rows, never from a value that came out of
 *  Jolt; a hook's event is the presentation of the same fact, built from sim-derived inputs, and when presentation and sim disagree the sim wins).
 *   feel.on('*', fn) or feel.on('feel:limp', fn): subscribe (scene.ts / feel-sim.ts); returns the unsubscribe.
 *   feel.setLimbState(fn): V3's sim hands the per-part budget fractions (1 = whole, 0 = gone; keys: the package's part groups such as leg_left, arm_right, head, torso); hooks read them with ctx.limbs(). */
export const feel = {
  on(name: string, fn: FeelSink): () => void {
    const set = listeners.get(name) ?? listeners.set(name, new Set()).get(name)!;
    set.add(fn);
    return () => { set.delete(fn); };
  },
  setLimbState(fn: (() => Record<string, number>) | null): void { limbState = fn ?? undefined; },
  limbs: (): Record<string, number> => limbState?.() ?? {},
};
/** A hook reports an event by name. Kept on `globalThis.__feelEvents` too, so a harness or a test can read what was emitted. */
export function emitFeel(name: string, payload?: unknown): void {
  ((globalThis as { __feelEvents?: { name: string; payload?: unknown }[] }).__feelEvents ??= []).push({ name, payload });
  for (const key of [name, '*']) for (const fn of listeners.get(key) ?? []) fn(name, payload);
}
