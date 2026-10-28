// A strike cuts the fallen body (data/physics.json `cut.strike`; Dom 2026-10-28, phone: the hint said "Strike to dismember" and nothing cut). PRESENTATION ONLY and three-free:
// the registry the ragdolls join (ragdoll.ts listenTaps) and the pure questions it asks. Two passes per press: AIMED (the press carries a point on the canvas and it strikes a unit still on
// a body: that unit is cut, at any distance, as the tap always was), then NEXT (the next unit of cut.tap.order still on a frozen body within `nearM` of the hero), so a player who never aims
// still takes the whole body apart. The input layer calls `strikeCut` for every attack press (input.ts env.strike); the ragdolls' own canvas tap calls `strikeOnce`.

export type Aim = { x: number; y: number };   // CSS px on the page
export type Pt = { x: number; z: number };    // world metres
export type StrikeReq = { aim: Aim | null; hero: Pt | null; pass: 'aimed' | 'next' };
/** A ragdoll's answer to one pass: what it cut (an event), or null. */
export type StrikeSource = (req: StrikeReq) => unknown | null;
export type StrikeRow = { on: boolean; nearM: number };

const sources = new Set<StrikeSource>();
/** A ragdoll joins when it listens for taps; the returned function leaves. */
export function registerStrikeSource(s: StrikeSource): () => void { sources.add(s); return () => { sources.delete(s); }; }

let heroAt: (() => Pt | null) | null = null;
/** The scene says where the hero stands (world metres); null before he does. */
export function setHeroLocator(fn: (() => Pt | null) | null): void { heroAt = fn; }

/** The input layer builds the mouse strike (data/input.json): then a mouse click on the canvas is the strike's, and the ragdoll's own tap leaves mouse pointers to it (one click, one cut). */
export const strikeBinds = { mouse: false };

/** The attack actions: a press of any of these cuts a fallen body. Guard, parry, steps and rolls are not attacks. */
export const isAttackAction = (action: string): boolean => /^(light|heavy|thrust|kick|skill)/.test(action);

/** The first of `order` that is not `done` and that `can` cut (a body whose cut GLB lacks a unit simply skips it); undefined when nothing more is left to cut. */
export function nextUnit(order: readonly string[], done: { has(unit: string): boolean }, can: (unit: string) => boolean = () => true): string | undefined {
  return order.find((unit) => !done.has(unit) && can(unit));
}

/** Is a body at (cx, cz) within `nearM` of the hero? No hero yet = not near. */
export const isNear = (hero: Pt | null, cx: number, cz: number, nearM: number): boolean => !!hero && Math.hypot(cx - hero.x, cz - hero.z) <= nearM;

/** One press: the aimed pass (only when it carries a point), then the next-unit pass. Returns the first event, or null when nothing was cut. */
export function strikeCut(aim: Aim | null): unknown | null {
  const hero = heroAt ? heroAt() : null;
  for (const pass of aim ? (['aimed', 'next'] as const) : (['next'] as const)) {
    for (const s of [...sources]) { const out = s({ aim, hero, pass }); if (out) return out; }
  }
  return null;
}

let lastKey: number | null = null;
/** The canvas tap: every ragdoll listens to the same pointerup, but one press cuts once (the first listener to see `key`, the event's timeStamp, runs it). */
export function strikeOnce(key: number, aim: Aim): unknown | null {
  if (lastKey === key) return null;
  lastKey = key;
  return strikeCut(aim);
}
