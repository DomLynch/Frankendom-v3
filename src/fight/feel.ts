// M7 fight feel (Strategy 2026-10-27): ONE registry so each ?feel=<name> module (hit reactions, limb damage, kick, clash) plugs into the opponent's presentation ragdoll
// through three call sites in ragdoll.ts (a Hit on him, every frame, his killing blow) and none of them edits ragdoll.ts. A module registers once, from its own file:
//   registerFeel('hitreact', { hit(e, ctx) { ... }, frame(dt, events, ctx) { ... }, kill(e, ctx) { ... } });
// and is listed in feel-modules.ts (one import line per module). It runs only when the page asks for it: ?feel=hitreact or ?feel=hitreact,kick (several, comma separated).
// PRESENTATION: a hook moves bones and motors. Anything that changes the fight's OUTCOME (limp speed, guard drop, weapon drop, kick stagger or knockdown, block pushback) is SIM:
// the hook emits it by name (emitFeel) and V3's sim (a subscriber via `feel.on`, src/fight/feel-sim.ts) decides from its own events and rows. Names (agreed with V3 Dev): feel:limp {part, level},
// feel:guard_drop {side}, feel:weapon_drop {}, feel:kick_result {outcome, finisherWindowS}, feel:clash {kind, pushbackM}.
import type * as THREE from 'three';
import type { CombatEvent } from './duel.ts';
import { type FeelDefaultRows, feelsOn } from './feel-defaults.ts';
import { FEEL_NAMES, loadFeelChunk } from './feel-modules.ts';
import type { Ragdoll } from './ragdoll.ts';

/** What a hook may use: the foe's ragdoll (the package's API: stagger, applyImpulse, ...), his bones by the package's part ids, his group, his mode, and the sim-event emitter. */
export type FeelCtx = { /** The sim fighter this body is: 1 the opponent, 0 the hero (?feel=hero). */ target: number; rd: Ragdoll; partBones: Record<string, THREE.Object3D>; group: THREE.Object3D; mode: 'alive' | 'dead' | 'skip'; emit: (name: string, payload?: unknown) => void; limbs: () => Record<string, number>;
  /** Show the ragdoll's pose on these parts this frame (share: part id -> 0..1, the weight of the ragdoll against the clip; the ragdoll's poseToward(1, share)). Call it after the frame's own pose: the limp and a sagging arm need the bones to follow the ragdoll on those parts. */
  blendToward: (share: Record<string, number>) => void;
  /** The package's own stagger for the blow this `hit` hook is seeing: multipliers the ragdoll reads right after the hooks and puts back to 1 (impulse = the push, blend = how much of the ragdoll's pose shows, time = how much faster it plays out; 1 = as before). */
  soften?: { impulse: number; blend: number; time: number } };
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
/** The hooks the page asked for (?feel=a,b). Already-registered names are in the returned list at once; a name of the feel chunk (feel-modules.ts FEEL_NAMES) is fetched on demand
 *  and pushed onto the SAME list when it arrives (ragdoll.ts iterates it live, so the module starts working a moment after the page does); a name nothing knows is ignored. A page
 *  with no ?feel= never touches the chunk. */
export function activeFeels(search: string, defaults?: FeelDefaultRows, forHero = false): FeelHooks[] {   // `defaults` (data/feel-defaults.json, Dom 2026-10-27): the modules on without a query; absent = only the ones the query names
  const out: FeelHooks[] = [], pending: string[] = [];
  // 'hero' (never a default: it is not in data/feel-defaults.json) drives the hero's own ragdoll (ragdoll.ts heroRagdollFor) and nothing on the opponent's; every other name the opponent's
  for (const n of feelsOn(defaults, search).filter((x) => (x === 'hero') === forHero)) { const h = registry.get(n); if (h) out.push(h); else if (FEEL_NAMES.includes(n)) pending.push(n); }
  if (pending.length) void loadFeelChunk().then((mods) => { for (const n of pending) { const h = mods[n]; if (h) { registerFeel(n, h); out.push(h); } } }).catch(() => { /* the chunk is optional: no feel, no harm */ });
  return out;
}

/** How many of the latest events `globalThis.__feelEvents` keeps. */
export const FEEL_LOG_MAX = 200;
type FeelSink = (name: string, payload?: unknown) => void;
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
  const log = ((globalThis as { __feelEvents?: { name: string; payload?: unknown }[] }).__feelEvents ??= []);
  log.push({ name, payload });
  if (log.length > FEEL_LOG_MAX) log.splice(0, log.length - FEEL_LOG_MAX);   // a ring: the harness reads the latest, a long fight never grows it
  for (const key of [name, '*']) for (const fn of listeners.get(key) ?? []) fn(name, payload);
}
