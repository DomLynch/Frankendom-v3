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
export function strikeCut(aim: Aim | null, nowS: number = clockS()): unknown | null {
  const hero = heroAt ? heroAt() : null;
  const out = passes(aim, hero);
  if (out) { pending = null; return out; }
  if (pendingS > 0 && !pending) for (const d of dyingSources) if (d(hero)) { pending = { aim, at: nowS }; break; }   // nothing cut, a body is still dying near him: keep this press once
  return null;
}

/** A ragdoll tells whether a body of its own is still dying (not yet frozen) within nearM of the hero (ragdoll.ts listenTaps). */
export type DyingSource = (hero: Pt | null) => boolean;
const dyingSources = new Set<DyingSource>();
export function registerDyingSource(s: DyingSource): () => void { dyingSources.add(s); return () => { dyingSources.delete(s); }; }

// A press that cut nothing because the body is still dying (cut.tap.needs is 'frozen'; the physics keeps a kill 'dying' for ~2.6 s) is kept ONCE and replayed when a body near the hero freezes.
// `pendingS` (data/physics.json cut.strike.pendingS, set by the ragdoll from its row) is how long it waits; 0 = never kept. One slot: a press while one waits does not queue another.
let pendingS = 0;
let pending: { aim: Aim | null; at: number } | null = null;
export function setPendingWindow(seconds: number): void { pendingS = seconds; if (!(seconds > 0)) pending = null; }
const clockS = (): number => (globalThis.performance?.now() ?? Date.now()) / 1000;
/** Is a press waiting for a body to freeze? (the stills and tests read it) */
export const strikePending = (): boolean => pending !== null;

function passes(aim: Aim | null, hero: Pt | null): unknown | null {
  for (const pass of aim ? (['aimed', 'next'] as const) : (['next'] as const)) {
    for (const s of [...sources]) { const out = s({ aim, hero, pass }); if (out) return out; }
  }
  return null;
}

/** Each frame a body is dead: the kept press, if any, is tried again (a frozen body near the hero takes its cut); dropped once it cuts or after `pendingS`. */
export function strikeReplay(nowS: number = clockS()): unknown | null {
  if (!pending) return null;
  if (nowS - pending.at > pendingS) { pending = null; return null; }
  const out = passes(pending.aim, heroAt ? heroAt() : null);
  if (out) pending = null;
  return out;
}

/** A frozen body that still has units to cut: where it lies (world metres) and how many. */
export type CorpseCut = { x: number; z: number; remainingUnits: number };
type CorpseSource = (push: (x: number, z: number, remainingUnits: number) => void) => void;
const corpseSources = new Set<CorpseSource>();
/** A ragdoll says where its frozen bodies lie and how many units each still has (ragdoll.ts listenTaps). */
export function registerCorpseSource(s: CorpseSource): () => void { corpseSources.add(s); return () => { corpseSources.delete(s); }; }
const corpseOut: CorpseCut[] = [];
let corpseN = 0;
const pushCorpse = (x: number, z: number, remainingUnits: number): void => {
  const row = corpseOut[corpseN] ?? (corpseOut[corpseN] = { x: 0, z: 0, remainingUnits: 0 });
  row.x = x; row.z = z; row.remainingUnits = remainingUnits; corpseN++;
};
/** Read-only: every frozen corpse (the live foe's and the kept ones) with at least one unit still to cut; empty when none. The SAME array is returned each call (no allocation; read it before the next call, do not keep it). */
export function corpseCutState(): readonly CorpseCut[] {
  corpseN = 0;
  for (const s of corpseSources) s(pushCorpse);
  corpseOut.length = corpseN;
  return corpseOut;
}

let lastKey: number | null = null;
/** The canvas tap: every ragdoll listens to the same pointerup, but one press cuts once (the first listener to see `key`, the event's timeStamp, runs it). */
export function strikeOnce(key: number, aim: Aim): unknown | null {
  if (lastKey === key) return null;
  lastKey = key;
  return strikeCut(aim);
}
