// The HELD duel foe wears its own body (Dom + Strategy 2026-10-27, "10 different bosses, build it once", PR 2 of 2; docs/BOSS-BODIES.md).
// The sim holds ONE foe: the page's live rig, which carries the ragdoll, the cuts, the stagger and the finishers. When the sim hands over to a spawn whose body (a data/rig.json files
// stem) is not the live rig's, scene.ts swaps the live rig for that body's, built the first time that body is held (lazy: a page whose held spawns are all the Minotaur never builds, loads or
// fetches anything), kept in this cache afterwards (a hand-back is a cache hit: nothing is rebuilt, nothing is fetched), and swapped back when a spawn of the first body is held again.
//
// This file is the cache and the swap rules only: no three.js, no DOM, so a test can drive it with stand-ins. What a swap does to the scene (anchors, ragdoll, fade) is the `mount` callback's.
// PRESENTATION ONLY: the sim never sees it; the default (every spawn the Minotaur) never builds a second slot.
/** One body the live foe can wear: its rig, its ragdoll (null = the body has no physics row/cut data: it dies the plain way), and whether it plays the plain death only (every body but the page's own: the baked finishers are prepared on the first body alone). */
type HeldSlot<Rig, Ragdoll> = { body: string; rig: Rig; ragdoll: Ragdoll | null; plainOnly: boolean };
type HeldDeps<Rig, Ragdoll> = {
  /** The page's own body, already built and in the scene. */
  home: HeldSlot<Rig, Ragdoll>;
  /** Build the live rig of `body` (loads its file the first time). Resolves null (or rejects) when the body cannot be built: the foe then keeps the body it wears. Called at most once per body. */
  build(body: string): Promise<{ rig: Rig; ragdoll: Ragdoll | null } | null>;
  /** Put `next` in the scene in place of `prev` (anchors, ragdoll attach, fade, bones the effects read). `first`: next has never been mounted. */
  mount(next: HeldSlot<Rig, Ragdoll>, prev: HeldSlot<Rig, Ragdoll>, first: boolean): void;
  /** Is it safe to swap now (no finish playing, the live ragdoll standing)? A swap waits until it is. */
  canSwap(): boolean;
  onError?(error: unknown): void;
};
type HeldStatus = 'same' | 'swapped' | 'loading' | 'waiting' | 'failed';

export function createHeldBodies<Rig, Ragdoll>(deps: HeldDeps<Rig, Ragdoll>) {
  const { home } = deps;
  const cache = new Map<string, HeldSlot<Rig, Ragdoll>>([[home.body, home]]);
  const mounted = new Set<string>([home.body]);
  const loading = new Map<string, Promise<void>>(), failed = new Set<string>();
  let active = home;
  const counts = { builds: 0, hits: 0, swaps: 0 };
  function start(body: string): void {
    if (loading.has(body) || failed.has(body)) return;
    counts.builds++;
    const done = (): void => { loading.delete(body); };
    loading.set(body, Promise.resolve().then(() => deps.build(body)).then(
      (built) => { if (built) cache.set(body, { body, rig: built.rig, ragdoll: built.ragdoll, plainOnly: body !== home.body }); else failed.add(body); done(); },
      (error: unknown) => { failed.add(body); done(); deps.onError?.(error); },
    ));
  }
  return {
    /** Every frame, with the body of the spawn the sim holds (undefined/null = no opinion: the foe keeps what it wears). Cheap when nothing changes. */
    hold(body: string | null | undefined): HeldStatus {
      if (!body || body === active.body) return 'same';
      if (failed.has(body)) return 'failed';
      const slot = cache.get(body);
      if (!slot) { start(body); return 'loading'; }
      if (!deps.canSwap()) return 'waiting';
      const first = !mounted.has(body), prev = active;
      try { deps.mount(slot, prev, first); } catch (error) { failed.add(body); cache.delete(body); deps.onError?.(error); return 'failed'; }   // never throws: a body whose wiring breaks is dropped, the foe keeps the body it wears
      mounted.add(body); active = slot; counts.swaps++; if (!first) counts.hits++;
      return 'swapped';
    },
    get active() { return active; },
    get atHome() { return active === home; },
    /** The slot cached for `body` (home included), or undefined. */
    slot: (body: string) => cache.get(body),
    /** Every slot built so far (the page's own first); a ragdoll of a slot that is not active still ages its corpses (scene.ts). */
    slots: (): HeldSlot<Rig, Ragdoll>[] => [...cache.values()],
    pending: () => loading.size,
    has: (body: string) => cache.has(body),
    isFailed: (body: string) => failed.has(body),
    /** builds: bodies built; hits: swaps to a slot that was mounted before; swaps: all swaps. */
    counts: () => ({ ...counts }),
    /** Test seam: resolves when every build in flight has settled. */
    settled: () => Promise.all([...loading.values()]).then(() => undefined),
  };
}
