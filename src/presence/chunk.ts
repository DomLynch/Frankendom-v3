// The page's presence chunk: what src/client/main.ts imports, only when ?presence= is in the link (data/presence.json `query`; default OFF, so a first visit fetches nothing). The build makes this
// file its own content-hashed module, b/vendor/presence.<hash>.js (scripts/build.mjs, as the physics chunk is), so it adds nothing to main.js.
//
// The small client API a later step (scene.ts wiring) reads; no rendering here, others have no collider and play no part in the fight:
//   const p = startPresence({ search: location.search, location });   // null when ?presence= is absent or malformed
//   p.remotes(now, hero?)   -> Shown[]  the other players nearest the hero first, eased between packets: { id, x, z, heading, speed } in metres
//   p.on('hello' | 'others' | 'state', fn) -> off()   hello: { x, z, layer, id } where the server placed us; others: Other[] each packet; state: 'connecting'|'live'|'retrying'|'off'
//   p.self() -> { id, layer } | null;  p.state();  p.flush() (a pose now);  p.stop()
// The hero's pose comes from `pose` (default: the page function named by data/presence.json `poseGlobal`, returning { x, z, heading } in metres or null).
import { joinPresence, type Other, type Pose, type Presence, type Socket } from './client.ts';
import { PRESENCE } from './rows.ts';
import { createTrack, type Shown } from './track.ts';
import { SEAM, createDraw, heroPoseFn, startDrawLoop, type RemoteBody } from './draw.ts';

export type { Other, Shown };
type Events = { hello: { x: number; z: number; layer: number; id: number }; others: Other[]; state: ReturnType<Presence['state']> };
export type PresenceHandle = {
  remotes(now?: number, hero?: { x: number; z: number }): Shown[];
  on<K extends keyof Events>(type: K, fn: (value: Events[K]) => void): () => void;
  self(): { id: number; layer: number } | null;
  state: Presence['state']; flush(): void; stop(): void;
};

/** The socket URL this link asks for, or null: `?presence=1` = this page's own host at `path` (ws on http, wss on https); `?presence=ws://...` or `wss://...` = exactly that; anything else (absent, 0, off, http) = off. */
export function presenceUrlFor(search: string, loc: { protocol: string; host: string }): string | null {
  const v = new URLSearchParams(search).get(PRESENCE.query);
  if (v === '1') return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}${PRESENCE.path}`;
  return v && /^wss?:\/\/[^\s/]+(\/\S*)?$/.test(v) ? v : null;
}

/** What main.ts calls (only with ?presence=): joins, installs the hero pose seam (globalThis.__v3HeroPose, absent on every other page) and draws the others. null when the link's value is malformed (nothing installed).
 *  `hero` reads the page's own hero state; `spawn` makes one drawable body from the hero's loaded rig (scene.ts spawnRemote), null until that rig exists. The handle gains `drawn()` (who is on screen) for the browser checks. */
export function startZonePresence(o: { search: string; location: { protocol: string; host: string }; hero: () => { x: number; z: number; heading: number }; spawn: () => RemoteBody | null }): (PresenceHandle & { drawn: () => ReturnType<ReturnType<typeof createDraw>['debug']> }) | null {
  const g = globalThis as Record<string, unknown>, pose = heroPoseFn(o.hero);
  g[SEAM] = pose;
  const handle = startPresence({ search: o.search, location: o.location, pose });
  if (!handle) { delete g[SEAM]; return null; }
  const draw = createDraw({ remotes: (now) => handle.remotes(now), spawn: o.spawn, now: () => performance.now() }), stopLoop = startDrawLoop(draw), stop = handle.stop;
  return { ...handle, stop: () => { stopLoop(); stop(); }, drawn: draw.debug };
}

export function startPresence(o: { search: string; location: { protocol: string; host: string }; pose?: () => Pose | null; open?: (url: string, protocols: string[]) => Socket; now?: () => number }): PresenceHandle | null {
  const url = presenceUrlFor(o.search, o.location);
  if (!url) return null;
  const now = o.now ?? (() => performance.now()), track = createTrack(), listeners: { [K in keyof Events]: Set<(v: Events[K]) => void> } = { hello: new Set(), others: new Set(), state: new Set() };
  const fire = <K extends keyof Events>(type: K, value: Events[K]): void => { for (const fn of listeners[type]) fn(value); };
  const poseFn = o.pose ?? ((): Pose | null => { const f = (globalThis as Record<string, unknown>)[PRESENCE.poseGlobal]; return typeof f === 'function' ? ((f as () => Pose | null)() ?? null) : null; });
  let self: { id: number; layer: number } | null = null, last: string = 'connecting', mine = { x: 0, z: 0 };
  const watch = (): void => { const s = client.state(); if (s !== last) { last = s; fire('state', s); } };
  const client = joinPresence({
    url, open: o.open ?? ((u, protocols) => new WebSocket(u, protocols) as unknown as Socket),
    pose: () => { const p = poseFn(); if (p) mine = { x: p.x, z: p.z }; return p; },
    onHello: (h) => { self = { id: h.id, layer: h.layer }; watch(); fire('hello', h); },
    onOthers: (list) => { track.push(list, now()); fire('others', list); },
  });
  const poll = setInterval(watch, 500);   // the state changes in the client's own timers (a retry, a give-up): the listeners hear it within half a second
  return {
    remotes: (t = now(), hero = mine) => track.shown(t, hero),
    on: (type, fn) => { (listeners[type] as Set<typeof fn>).add(fn); return () => { (listeners[type] as Set<typeof fn>).delete(fn); }; },
    self: () => self, state: client.state, flush: client.flush,
    stop: () => { clearInterval(poll); client.stop(); watch(); },
  };
}
