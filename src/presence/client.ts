// The page's presence join. Lifted from V1 origins/preview/presence-client.ts: it opens the socket, adopts the server's `hello` place, poses at presence's tick, and hands the nearby others up as
// metres. Cut from V1's: the Supabase token and guest offer (V3 has no accounts yet: the server mints the identity), the v1 legacy frame, warps and `enter` name records.
// Everything fails quiet: no service, a refused or dropped socket leave the page playing exactly as before. No DOM, storage or clock read here: the socket, the clock and the timers are injected.
import { decodeDown, encodeUp, type Entity } from './wire.ts';
import { PRESENCE, presenceRule } from '../rows.ts';

export const POSE_EVERY_MS: number = presenceRule('tickMs');   // presence's tick (a row): one pose a tick is all it reads
export const GIVE_UP_AFTER = presenceRule('giveUp');            // consecutive sockets that never reached `hello`: the service is off or refusing us, stop trying until the page reloads
// V1's reconnect schedule (World of Claudecraft src/net/backoff.ts, MIT, via V1 src/net/backoff.ts): step = min(max, base * 2 ** (attempt - 1)), spread across 0.5x..1.5x and clamped to max.
export const backoffMs = (attempt: number, baseMs: number, maxMs: number, rng: () => number): number => Math.min(maxMs, Math.min(maxMs, baseMs * 2 ** (attempt - 1)) * (0.5 + rng()));
export const headingByte = (radians: number): number => Math.round((((radians % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * 256) & 255;

export type Pose = { x: number; z: number; heading: number; anim?: number; flags?: number };   // metres in the world frame, heading in radians
export type Other = { id: number; x: number; z: number; heading: number; anim: number; flags: number };
export type Socket = { binaryType: string; readyState: number; send(data: Uint8Array | string): void; close(code?: number): void; onopen: (() => void) | null; onmessage: ((e: { data: unknown }) => void) | null; onclose: (() => void) | null; onerror: (() => void) | null };
export type Deps = {
  url: string;
  open: (url: string, protocols: string[]) => Socket;
  pose: () => Pose | null;                              // where the hero stands now; null while the page has no hero to show
  onHello?: (at: { x: number; z: number; layer: number; id: number }) => void;   // where the server placed us (metres): fires on every (re)connect, before the first pose
  onOthers?: (others: Other[]) => void;                // one presence packet: the entities due this tick (metres)
  setTimer?: (fn: () => void, ms: number) => unknown; clearTimer?: (id: unknown) => void; every?: (fn: () => void, ms: number) => unknown; clearEvery?: (id: unknown) => void;
  rng?: () => number;
};
export type Presence = { stop(): void; flush(): void; state(): 'connecting' | 'live' | 'retrying' | 'off' };   // flush: a pose now

const OPEN = 1;
export function joinPresence(d: Deps): Presence {
  if (typeof d.open !== 'function') throw new Error('joinPresence: the socket opener (open) is required');   // loud, never a silent "presence never connects"
  const setTimer = d.setTimer ?? ((fn, ms) => setTimeout(fn, ms)), clearTimer = d.clearTimer ?? ((id) => clearTimeout(id as never));
  const every = d.every ?? ((fn, ms) => setInterval(fn, ms)), clearEvery = d.clearEvery ?? ((id) => clearInterval(id as never)), rng = d.rng ?? Math.random;
  const { centreCm, sizeCm } = PRESENCE.frame;
  let socket: Socket | null = null, poseTimer: unknown, retryTimer: unknown, stopped = false, failures = 0, welcomed = false, status: ReturnType<Presence['state']> = 'connecting';
  const cm = (m: number): number => Math.min(sizeCm, Math.max(0, Math.round(centreCm + m * 100)));
  const metres = (centi: number): number => (centi - centreCm) / 100;
  const send = (): void => {
    const p = d.pose();
    if (!p || !socket || socket.readyState !== OPEN || !welcomed) return;   // never pose before the server's hello: a first pose from the page's own spawn would look like a teleport
    socket.send(encodeUp({ x: cm(p.x), z: cm(p.z), heading: headingByte(p.heading), anim: p.anim ?? 0, flags: p.flags ?? 0 }));
  };
  const connect = (): void => {
    if (stopped) return;
    welcomed = false; status = failures ? 'retrying' : 'connecting';
    let s: Socket;
    try { s = d.open(d.url, [PRESENCE.protocol]); } catch { return void lost(); }
    socket = s; s.binaryType = 'arraybuffer';
    s.onmessage = (e) => {
      if (s !== socket) return;
      if (typeof e.data === 'string') {
        let m: { t?: unknown; x?: unknown; z?: unknown; layer?: unknown; id?: unknown } | null;
        try { m = JSON.parse(e.data); } catch { m = null; }
        if (m?.t !== 'hello' || typeof m.x !== 'number' || typeof m.z !== 'number') return;   // the heartbeat and anything else are ignored
        welcomed = true; failures = 0; status = 'live';
        d.onHello?.({ x: metres(m.x), z: metres(m.z), layer: typeof m.layer === 'number' ? m.layer : 0, id: typeof m.id === 'number' ? m.id : 0 });
        return;
      }
      const down = e.data instanceof ArrayBuffer ? decodeDown(new Uint8Array(e.data)) : null;
      if (down && d.onOthers) d.onOthers(down.entities.map((o: Entity) => ({ id: o.id, x: metres(o.x), z: metres(o.z), heading: o.heading / 256 * 2 * Math.PI, anim: o.anim, flags: o.flags })));
    };
    s.onopen = () => { if (poseTimer === undefined) poseTimer = every(send, POSE_EVERY_MS); };
    s.onerror = () => { /* the close that follows is the signal */ };
    s.onclose = () => { if (s === socket) lost(); };
  };
  const lost = (): void => {
    if (poseTimer !== undefined) { clearEvery(poseTimer); poseTimer = undefined; }
    socket = null; if (stopped) return;
    if (!welcomed) failures++;
    welcomed = false;
    if (failures >= GIVE_UP_AFTER) { status = 'off'; return; }
    status = 'retrying';
    retryTimer = setTimer(connect, backoffMs(Math.max(1, failures), presenceRule('retryBaseMs'), presenceRule('retryMaxMs'), rng));
  };
  connect();
  return {
    stop() { stopped = true; status = 'off'; if (poseTimer !== undefined) clearEvery(poseTimer); if (retryTimer !== undefined) clearTimer(retryTimer); poseTimer = retryTimer = undefined; const s = socket; socket = null; try { s?.close(1000); } catch { /* already closed */ } },
    flush: send,
    state: () => status,
  };
}
