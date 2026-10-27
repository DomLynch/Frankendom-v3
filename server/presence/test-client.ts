// A headless presence client for tests and the smoke script (lifted from V1 origins/presence/test-client.ts, v1 protocol, tokens, warps and `enter` records removed): it opens a real WebSocket to
// a presence server, keeps the newest down packet, and poses in METRES of the world frame so a test never touches the u16 centimetres. No DOM, no storage; node's global WebSocket.
import { decodeDown, encodeUp, type Entity } from '../../src/presence/wire.ts';
import { PRESENCE } from '../../src/presence/rows.ts';

export type Frame = { centreCm: number; sizeCm: number };
export type Hello = { t: 'hello'; id: number; layer: number; x: number; z: number; frame: Frame };
export type Seen = { id: number; x: number; z: number; heading: number; anim: number; flags: number };   // metres
export type Bot = {
  hello: Hello; frame: Frame;
  /** The entities in the newest down packet, in metres. NOTE: presence sends no packet when nothing is due, so after a player leaves this keeps returning the last packet; use packets(). */
  seen(): Seen[];
  /** Every down packet received: its arrival time (ms) and the ids it carried. */
  packets(): { at: number; ids: number[] }[];
  /** One pose (metres, heading in the wire's byte); the server snaps or drops a pose it cannot accept. */
  pose(x: number, z: number, heading?: number): void;
  /** Where the server placed this bot, in metres, from the hello. */
  at(): { x: number; z: number };
  /** Send any frame (the refusal tests). */
  raw(data: string | Uint8Array): void;
  /** The close code once the socket is closed (null while open). */
  closeCode(): number | null;
  close(): void;
};

/** Joins as a fresh player (the server mints the identity). `protocols` overrides the offered subprotocols for the refusal tests. */
export function joinBot(port: number, opts: { protocols?: string[]; path?: string } = {}): Promise<Bot> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${opts.path ?? PRESENCE.path}`, opts.protocols ?? [PRESENCE.protocol]);
    ws.binaryType = 'arraybuffer';
    const log: { at: number; ids: number[] }[] = [];   // every down packet: when it arrived and which ids it carried (presence sends NO packet when nothing is due, so seen() keeps the last one)
    let closed: number | null = null, latest: Entity[] = [], hello: Hello | null = null, settled = false;
    // A bot speaks metres RELATIVE TO THE SERVICE'S SPAWN (data/presence.json `spawn`, the pit's centre in the zone frame): (0, 0) is where a join starts, whatever the zone frame says.
    const toX = (cm: number): number => (cm - PRESENCE.frame.centreCm) / 100 - PRESENCE.spawn.x, toZ = (cm: number): number => (cm - PRESENCE.frame.centreCm) / 100 - PRESENCE.spawn.z;
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        const m = JSON.parse(ev.data) as { t?: string };
        if (m.t === 'hello') { hello = m as Hello; if (!settled) { settled = true; resolve(bot); } }
        return;
      }
      const down = decodeDown(new Uint8Array(ev.data as ArrayBuffer));
      if (down) { latest = down.entities; log.push({ at: Date.now(), ids: down.entities.map((e) => e.id) }); }
    };
    ws.onerror = () => { if (!settled) { settled = true; reject(new Error('refused')); } };
    ws.onclose = (ev) => { closed = ev.code; if (!settled) { settled = true; reject(new Error('closed before hello')); } };
    const bot: Bot = {
      get hello() { return hello!; }, get frame() { return hello!.frame; },
      packets: () => log.map((p) => ({ at: p.at, ids: [...p.ids] })),
      seen: () => latest.map((e) => ({ id: e.id, x: toX(e.x), z: toZ(e.z), heading: e.heading, anim: e.anim, flags: e.flags })),
      pose: (x, z, heading = 0) => ws.send(encodeUp({ x: Math.round(PRESENCE.frame.centreCm + (x + PRESENCE.spawn.x) * 100), z: Math.round(PRESENCE.frame.centreCm + (z + PRESENCE.spawn.z) * 100), heading, anim: 0, flags: 0 })),
      at: () => ({ x: toX(hello!.x), z: toZ(hello!.z) }),
      raw: (data) => ws.send(data),
      closeCode: () => closed,
      close: () => ws.close(),
    };
  });
}
