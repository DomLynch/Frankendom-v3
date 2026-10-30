// The presence service: who is where, in memory, rebuilt from nothing after a restart. It writes no rows and decides nothing that pays. ws://<host>:<presencePort>/presence (data/presence.json).
// Lifted from V1 origins/presence/server.ts (WebSocket framing, the 100 ms tick, layers and caps, per-IP and per-socket limits, heartbeat, close handling, health route). Cut: the Supabase token check
// (V3 has no accounts yet: every join is a fresh player whose key the server mints, never read from the client), the saved-position/worn/name queues, warps, the v1 legacy protocol and the /internal/* routes.
// No npm dependency: the RFC 6455 subset a browser needs (masked client frames, no fragments, no extensions). Runs standalone with node (npm run presence); it is not in the game bundle.
import { createHash, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import { decodeUp } from '../../src/presence/wire.ts';
import { PRESENCE, originAllowed, presenceRule, type PresenceOrigins } from '../../src/presence/rows.ts';
import { RULES, World, type Player, type Rules } from './interest.ts';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
// The protocols' own numbers, not tuning: HTTP status codes (RFC 9110) and WebSocket framing (RFC 6455: header bits, opcodes, close codes; the 4000s are this service's own close codes).
const HTTP_OK = 200, HTTP_BAD_REQUEST = 400, HTTP_FORBIDDEN = 403, HTTP_NOT_FOUND = 404, HTTP_TOO_MANY = 429, HTTP_UNAVAILABLE = 503;
const FIN = 0x80, MASKED = 0x80, OPCODE_BITS = 0x0f, LENGTH_BITS = 0x7f, RESERVED_BITS = 0x70, LENGTH_16 = 126, LENGTH_64 = 127;
const OP_CONTINUATION = 0, OP_TEXT = 1, OP_BINARY = 2, OP_CLOSE = 8, OP_PING = 9, OP_PONG = 10;
const CLOSE_NORMAL = 1000, CLOSE_PROTOCOL = 1002, CLOSE_UNSUPPORTED = 1003, CLOSE_TOO_BIG = 1009, CLOSE_IDLE = 4000, CLOSE_MESSAGE_RATE = 4008, CLOSE_TELEPORT = 4009, CLOSE_BACKLOG = 4010;
const HEADER_BYTES = 2, MASK_BYTES = 4, BYTE_BITS = 8, BYTE_MASK = 255, TICK_WRAP = 0xffff, SECOND_MS = 1000, MINUTE_MS = 60_000;   // SECOND_MS and MINUTE_MS: the window of a "per second" or "per minute" rate (perSecond, ipJoinsPerMinute)
export const PROTOCOL = PRESENCE.protocol;
export const PATH = PRESENCE.path;
/** The address the service binds: PRESENCE_HOST if set (the one env override), else the `host` row (loopback). */
export const listenHost = (env: Record<string, string | undefined>): string => env.PRESENCE_HOST || PRESENCE.host;
/** Whether the per-IP caps may read the reverse proxy's X-Real-IP: only while bound to loopback (127.0.0.1 or ::1), where nginx is the only way in and overwrites the header. Bound anywhere else a client could send it itself. */
export const trustsProxyHeader = (host: string): boolean => host === '127.0.0.1' || host === '::1';
export const HEALTH_PATH = `${PRESENCE.path}/health`;
export const LIMITS = { maxMessage: presenceRule('maxMessage'), perSecond: presenceRule('perSecond'), idleMs: presenceRule('idleMs'), ipSockets: presenceRule('ipSockets'), ipJoinsPerMinute: presenceRule('ipJoinsPerMinute'), beatMs: presenceRule('beatMs'), maxWriteBytes: presenceRule('maxWriteBytes') };
export type Limits = typeof LIMITS;

function frame(opcode: number, payload: Uint8Array): Buffer {
  const n = payload.length, head = n < LENGTH_16 ? Buffer.from([FIN | opcode, n]) : Buffer.from([FIN | opcode, LENGTH_16, n >> BYTE_BITS, n & BYTE_MASK]);
  return Buffer.concat([head, payload]);
}

export type PresenceOptions = {
  rules?: Rules; limits?: Limits; maxLayers?: number;
  now?: () => number; log?: (line: string) => void; logEveryMs?: number; sweepEveryMs?: number;
  origins?: PresenceOrigins;   // the Origin allow-list (default: the `origins` row)
  ipHeader?: boolean;   // trust a reverse proxy's X-Real-IP for the per-IP limits (only behind nginx on 127.0.0.1)
};
export type Presence = { server: Server; world: World; port: () => number; stats: () => Record<string, unknown>; close: () => Promise<void> };

export function createPresence(opts: PresenceOptions = {}): Presence {
  const { rules = RULES, limits = LIMITS, now = Date.now, log = console.log, logEveryMs = presenceRule('logEveryMs'), sweepEveryMs = presenceRule('sweepEveryMs') } = opts;
  const world = new World(rules, opts.maxLayers ?? presenceRule('maxLayers'));
  const sockets = new Map<Player, Duplex>();
  const closers = new Map<Player, (code: number, why?: string) => void>();   // each socket's own close(), for the tick and the heartbeat to shut a backed-up one
  const perIp = new Map<string, { sockets: number; windowStart: number; joins: number }>();
  const counts = { packets: 0, bytes: 0, up: 0, snapped: 0, strikes: 0, joined: 0, refused: {} as Record<string, number>, maxTickMs: 0, ticks: 0 };
  const refused = (why: string): void => { counts.refused[why] = (counts.refused[why] ?? 0) + 1; };
  const closeGraceMs = presenceRule('closeGraceMs');   // after our close frame, how long a peer that has not finished the TCP close is waited for before the socket is destroyed
  const TICK_RING = presenceRule('tickRing');   // the last tick durations are kept for GET <path>/health?ticks=N (the load test's p99)
  let tickNo = 0;
  const tickRing = new Float64Array(TICK_RING); let tickRingN = 0;   // every tick's duration in ms, newest overwrites oldest

  // The tick is aimed at the wall clock (not setInterval's drift) so a slow tick does not stretch every later one; the time each took is reported.
  let next = now() + rules.tickMs;
  const ticker = setInterval(() => {
    if (now() < next) return;
    next += rules.tickMs;
    const started = performance.now();
    tickNo = (tickNo + 1) & TICK_WRAP;
    for (const [p, packet] of world.tick(tickNo)) {
      const sock = sockets.get(p);
      if (!sock || sock.destroyed) continue;
      if (sock.writableLength > limits.maxWriteBytes) { closers.get(p)?.(CLOSE_BACKLOG, 'backlog'); continue; }   // a client that does not read: closed, not queued for
      sock.write(frame(OP_BINARY, packet));
      counts.packets++; counts.bytes += packet.length;
    }
    const took = performance.now() - started;
    counts.ticks++; if (took > counts.maxTickMs) counts.maxTickMs = took;
    tickRing[tickRingN++ % TICK_RING] = took;
  }, Math.max(presenceRule('tickFloorMs'), Math.floor(rules.tickMs / presenceRule('tickChecksPerTick'))));
  // seenAt on the heartbeat: a connected player standing still is still here.
  const beats = setInterval(() => { world.sweep(now()); for (const [p, s] of sockets) if (!s.destroyed) { if (s.writableLength > limits.maxWriteBytes) { closers.get(p)?.(CLOSE_BACKLOG, 'backlog'); continue; } p.seenAt = now(); s.write(frame(OP_TEXT, Buffer.from('{"t":"beat"}'))); } }, limits.beatMs);
  const reporter = setInterval(() => {
    log(`presence: ${JSON.stringify(world.stats())} packets ${counts.packets} bytes ${counts.bytes} up ${counts.up} joined ${counts.joined} maxTickMs ${counts.maxTickMs.toFixed(1)} refused ${JSON.stringify(counts.refused)} snapped ${counts.snapped} strikes ${counts.strikes}`);   // snapped: a pose refused and kept; strikes: every refused pose (snapped + the one that drops the player)
    counts.packets = 0; counts.bytes = 0; counts.up = 0; counts.snapped = 0; counts.strikes = 0; counts.joined = 0; counts.refused = {}; counts.maxTickMs = 0; counts.ticks = 0;
  }, logEveryMs);
  // perIp must not grow with every address ever seen: an entry with no socket whose join window has passed holds nothing, so it goes.
  const sweeper = setInterval(() => { const t = now(); for (const [ip, b] of perIp) if (b.sockets <= 0 && t - b.windowStart >= MINUTE_MS) perIp.delete(ip); }, sweepEveryMs);
  for (const t of [ticker, beats, reporter, sweeper]) t.unref();

  const stats = (): Record<string, unknown> => ({ ...world.stats(), sockets: sockets.size, ips: perIp.size, ...counts });
  // The hello carries where the server placed the player, so a client adopts it before its first pose.
  const hello = (p: Player): Buffer => frame(OP_TEXT, Buffer.from(JSON.stringify({ t: 'hello', id: p.id, layer: p.layer.id, x: p.x, z: p.z, frame: PRESENCE.frame })));
  // The last `n` tick durations (ms), oldest first, at most what the ring holds.
  const recentTicks = (n: number): number[] => {
    const have = Math.min(tickRingN, TICK_RING, Math.max(0, Math.floor(n))), out: number[] = [];
    for (let i = tickRingN - have; i < tickRingN; i++) out.push(tickRing[i % TICK_RING]!);
    return out;
  };
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url?.split('?')[0] === HEALTH_PATH) {
      // The tick samples (up to ~700 KB) are for the load test only: honoured for a DIRECT loopback caller, never for a proxied one (behind nginx the socket peer is 127.0.0.1 too, so a
      // proxy header, which nginx sets, means "not direct").
      const direct = (req.socket.remoteAddress === '127.0.0.1' || req.socket.remoteAddress === '::1' || req.socket.remoteAddress === '::ffff:127.0.0.1') && !req.headers['x-real-ip'] && !req.headers['x-forwarded-for'];
      const n = direct ? Number(new URL(req.url, 'http://presence').searchParams.get('ticks') ?? 0) : 0;
      res.writeHead(HTTP_OK, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return void res.end(JSON.stringify(n > 0 ? { ...stats(), tickMs: recentTicks(n) } : stats()));
    }
    res.writeHead(HTTP_NOT_FOUND); res.end();
  });

  server.on('upgrade', (req, socket: Duplex) => {
    const url = new URL(req.url ?? '/', 'http://presence'), key = req.headers['sec-websocket-key'];
    const ip = String((opts.ipHeader ? req.headers['x-real-ip'] : null) ?? req.socket.remoteAddress ?? '?'), t = now();
    const refuse = (code: number, why: string): void => { refused(why); socket.end(`HTTP/1.1 ${code} Refused\r\nConnection: close\r\n\r\n`); };
    if (url.pathname !== PATH || typeof key !== 'string') return refuse(HTTP_BAD_REQUEST, 'bad-request');
    if (!originAllowed(req.headers.origin, opts.origins)) return refuse(HTTP_FORBIDDEN, 'origin');   // before any per-IP bucket or world slot is touched
    // ONE bucket object per address for as long as it lives: a window roll resets the join count in place (V1: a copy once kept its count for ever and locked an address out until a restart).
    let b = perIp.get(ip); if (!b) { b = { sockets: 0, windowStart: t, joins: 0 }; perIp.set(ip, b); } else if (t - b.windowStart >= MINUTE_MS) { b.windowStart = t; b.joins = 0; }
    if (++b.joins > limits.ipJoinsPerMinute) return refuse(HTTP_TOO_MANY, 'join-rate');
    if (b.sockets >= limits.ipSockets) return refuse(HTTP_TOO_MANY, 'ip-sockets');
    if (!String(req.headers['sec-websocket-protocol'] ?? '').split(',').map(x => x.trim()).includes(PROTOCOL)) return refuse(HTTP_BAD_REQUEST, 'bad-request');
    const bucket = b; bucket.sockets++;
    const release = (): void => { bucket.sockets--; };
    socket.on('error', () => {});
    const player = world.join(`p-${randomUUID()}`, now());   // the identity is minted HERE, never read from the client
    if (!player) { release(); return refuse(HTTP_UNAVAILABLE, 'world-full'); }
    sockets.set(player, socket); counts.joined++;
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${createHash('sha1').update(key + GUID).digest('base64')}\r\nSec-WebSocket-Protocol: ${PROTOCOL}\r\n\r\n`);
    (socket as Socket).setNoDelay(true);
    socket.write(hello(player));
    let buffered = Buffer.alloc(0), windowStart = now(), count = 0, idle: NodeJS.Timeout;
    // Every way this socket is closed (the peer's close frame, our idle/rate/teleport/malformed closes) removes the player NOW: `gone` used to run only on the TCP 'close' event, which needs the peer's
    // FIN too, so a peer that sent a close frame and then dawdled stayed in the world, and in every watcher's packets, until it finished (V1's "left and is still drawn" ghost). The socket is
    // destroyed after closeGraceMs if the peer still has not finished. `gone` is idempotent, so the later 'close' event is a no-op.
    const close = (code: number, why?: string): void => {
      if (why) refused(why);
      if (!socket.destroyed) { const p = Buffer.alloc(HEADER_BYTES); p.writeUInt16BE(code); socket.end(frame(OP_CLOSE, p)); setTimeout(() => socket.destroy(), closeGraceMs).unref(); }
      gone();
    };
    const touch = (): void => { clearTimeout(idle); idle = setTimeout(() => close(CLOSE_IDLE, 'idle'), limits.idleMs); };
    touch();
    closers.set(player, close);
    const gone = (): void => { clearTimeout(idle); if (sockets.get(player) !== socket) return; sockets.delete(player); closers.delete(player); world.leave(player, now()); release(); };
    socket.on('data', (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk]);
      for (;;) {
        if (buffered.length < HEADER_BYTES) return;
        const b0 = buffered[0], b1 = buffered[1], opcode = b0 & OPCODE_BITS;
        let length = b1 & LENGTH_BITS, at = HEADER_BYTES;
        if (!(b0 & FIN) || !(b1 & MASKED) || opcode === OP_CONTINUATION || (b0 & RESERVED_BITS)) return close(CLOSE_PROTOCOL, 'malformed');   // fragments, unmasked frames, reserved bits
        if (length === LENGTH_16) { if (buffered.length < HEADER_BYTES + HEADER_BYTES) return; length = buffered.readUInt16BE(HEADER_BYTES); at = HEADER_BYTES + HEADER_BYTES; } else if (length === LENGTH_64) return close(CLOSE_TOO_BIG, 'size');   // the 16-bit length follows the header (2 bytes)
        if (length > limits.maxMessage) return close(CLOSE_TOO_BIG, 'size');
        if (buffered.length < at + MASK_BYTES + length) return;
        const mask = buffered.subarray(at, at + MASK_BYTES), payload = Buffer.from(buffered.subarray(at + MASK_BYTES, at + MASK_BYTES + length));
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % MASK_BYTES];
        buffered = buffered.subarray(at + MASK_BYTES + length);
        touch();
        if (opcode === OP_CLOSE) return close(CLOSE_NORMAL);
        const nowMs = now();   // every frame but a close counts against perSecond, pings and pongs included (a ping flood is a flood)
        if (nowMs - windowStart >= SECOND_MS) { windowStart = nowMs; count = 0; }
        if (++count > limits.perSecond) return close(CLOSE_MESSAGE_RATE, 'message-rate');
        if (opcode === OP_PING) { if (socket.writableLength > limits.maxWriteBytes) return close(CLOSE_BACKLOG, 'backlog'); socket.write(frame(OP_PONG, payload)); continue; }
        if (opcode === OP_PONG) continue;
        if (opcode !== OP_BINARY) return close(CLOSE_UNSUPPORTED, 'malformed');   // a text frame from a client is not part of this protocol (V1's warp and speech frames are not lifted)
        const up = decodeUp(payload);
        if (!up) return close(CLOSE_UNSUPPORTED, 'malformed');
        counts.up++;
        const moved = world.move(player, up, nowMs);
        if (moved !== 'ok') { counts.strikes++; if (moved === 'snapped') counts.snapped++; }
        if (moved === 'drop') return close(CLOSE_TELEPORT, 'teleport');
      }
    });
    socket.on('close', gone); socket.on('error', gone);
  });

  return {
    server, world, stats, port: () => (server.address() as { port: number }).port,
    close: () => new Promise(done => { for (const t of [ticker, beats, reporter, sweeper]) clearInterval(t); for (const s of sockets.values()) s.destroy(); server.close(() => done()); }),
  };
}
