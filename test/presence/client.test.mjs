// The page side (src/presence/): the join (client.ts), the ease between packets (track.ts) and the chunk's API (chunk.ts), plus the two-client smoke script.
// Ported from V1 origins/preview/presence-client.test.ts and tests/remote-track.test.ts (token, guest, v1-frame and warp cases dropped with the code).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { decodeUp, encodeDown } from '../../src/presence/wire.ts';
import { PRESENCE } from '../../src/presence/rows.ts';
import { GIVE_UP_AFTER, backoffMs, headingByte, joinPresence } from '../../src/presence/client.ts';
import { arc, createTrack } from '../../src/presence/track.ts';
import { presenceUrlFor, startPresence } from '../../src/presence/chunk.ts';

const C = PRESENCE.frame.centreCm;
function rig() {
  const sockets = [], timers = [], ticks = [], hello = [], others = [];
  let at = { x: 3, z: -4, heading: Math.PI };
  const p = joinPresence({
    url: 'wss://example.test/presence',
    open: (url, protocols) => {
      const s = { binaryType: '', readyState: 0, sent: [], closed: null, calls: { url, protocols }, send(b) { this.sent.push(b); }, close(c) { this.closed = c ?? 0; }, onopen: null, onmessage: null, onclose: null, onerror: null };
      sockets.push(s); return s;
    },
    pose: () => at, onHello: (h) => hello.push(h), onOthers: (o) => others.push(o), rng: () => 0.5,
    setTimer: (fn, ms) => { const t = { fn, ms, live: true }; timers.push(t); return t; }, clearTimer: (id) => { id.live = false; },
    every: (fn) => { ticks.push(fn); return fn; }, clearEvery: (id) => { ticks.splice(ticks.indexOf(id), 1); },
  });
  const open = (s) => { s.readyState = 1; s.onopen?.(); };
  const say = (s, m) => s.onmessage?.({ data: JSON.stringify(m) });
  return { p, sockets, timers, ticks, hello, others, open, say, move: (x, z) => { at = { ...at, x, z }; } };
}
const helloAt = { t: 'hello', id: 7, layer: 2, x: C, z: C, frame: PRESENCE.frame };

test('the socket offers the one protocol name and no token; binaryType is arraybuffer', () => {
  const r = rig();
  assert.deepEqual(r.sockets[0].calls.protocols, [PRESENCE.protocol]);
  assert.equal(r.sockets[0].binaryType, 'arraybuffer');
});

test('joinPresence refuses to be built without a socket opener', () => {
  assert.throws(() => joinPresence({ url: 'wss://x/presence', pose: () => null }), /open/);
});

test('no pose before the hello; then 8-byte poses in frame centimetres, hero (0,0) = the frame centre', () => {
  const r = rig(), s = r.sockets[0]; r.open(s);
  r.ticks[0](); assert.equal(s.sent.length, 0, 'a pose before the server placed us would look like a teleport');
  r.say(s, helloAt);
  assert.deepEqual(r.hello, [{ x: 0, z: 0, layer: 2, id: 7 }]); assert.equal(r.p.state(), 'live');
  r.ticks[0](); assert.equal(s.sent.length, 1); assert.equal(s.sent[0].length, 8);
  assert.deepEqual(decodeUp(s.sent[0]), { x: C + 300, z: C - 400, heading: 128, anim: 0, flags: 0 });
  r.move(-1000, 0); r.p.flush();   // past the u16 frame: clamped to its edge, never wrapped
  assert.equal(decodeUp(s.sent[1]).x, 0);
});

test('a null pose sends nothing, the heartbeat text frame is ignored, and others come down as metres in the same frame', () => {
  const r = rig(), s = r.sockets[0]; r.open(s); r.say(s, helloAt);
  r.say(s, { t: 'beat' }); assert.equal(r.hello.length, 1);
  const b = encodeDown(5, [{ id: 9, x: C + 500, z: C - 250, heading: 64, anim: 2, flags: 1, tick: 5 }]);
  s.onmessage?.({ data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) });
  const o = r.others[0][0];
  assert.equal(o.id, 9); assert.equal(o.x, 5); assert.equal(o.z, -2.5); assert.ok(Math.abs(o.heading - Math.PI / 2) < 1e-9);
});

test('headingByte wraps the compass', () => {
  assert.equal(headingByte(0), 0); assert.equal(headingByte(Math.PI), 128); assert.equal(headingByte(-Math.PI / 2), 192); assert.equal(headingByte(2 * Math.PI), 0);
});

test('a lost socket is retried after a jittered, growing wait; a service that never says hello is given up on', () => {
  assert.equal(backoffMs(1, 1000, 30_000, () => 0.5), 1000); assert.equal(backoffMs(2, 1000, 30_000, () => 0.5), 2000); assert.equal(backoffMs(20, 1000, 30_000, () => 1), 30_000);
  const r = rig(), a = r.sockets[0]; r.open(a); r.say(a, helloAt);
  a.onclose?.(); assert.equal(r.p.state(), 'retrying'); assert.equal(r.timers[0].ms, 1000);
  r.timers[0].fn(); assert.equal(r.sockets.length, 2);
  const g = rig();
  for (let i = 0; i < GIVE_UP_AFTER; i++) { g.sockets[i].onclose?.(); if (g.timers[i]) g.timers[i].fn(); }
  assert.equal(g.p.state(), 'off'); assert.equal(g.sockets.length, GIVE_UP_AFTER);
});

test('stop() closes with 1000, cancels the pose timer, and a stopped page never reconnects', () => {
  const r = rig(), s = r.sockets[0]; r.open(s); r.p.stop();
  assert.equal(s.closed, 1000); assert.equal(r.ticks.length, 0); assert.equal(r.p.state(), 'off');
  s.onclose?.(); assert.equal(r.timers.length, 0);
});

// ---- track (V1 tests/remote-track.test.ts) ----
const at = (id, x, z, heading = 0) => ({ id, x, z, heading, anim: 0, flags: 0 });
const T = { tickMs: 100, slowestEvery: 5, snap: 6, cap: 3 }, near = { x: 0, z: 0 };
test('track: a new remote stands where first seen; the next packet is reached over the time between packets', () => {
  const t = createTrack(T);
  t.push([at(1, 10, 0)], 0);
  assert.deepEqual(t.shown(0, near).map((s) => [s.x, s.z, s.speed]), [[10, 0, 0]]);
  t.push([at(1, 10.5, 0)], 100);
  const half = t.shown(150, near)[0];
  assert.ok(Math.abs(half.x - 10.25) < 1e-9 && Math.abs(half.speed - 5) < 1e-9);
  const done = t.shown(220, near)[0]; assert.ok(done.x === 10.5 && done.speed === 0);
});
test('track: a packet mid-ease starts from where the remote is shown; a jump beyond the snap is a warp; the heading takes the short way', () => {
  const t = createTrack(T);
  t.push([at(1, 0, 10)], 0); t.push([at(1, 1, 10)], 100);
  const mid = t.shown(150, near)[0]; t.push([at(1, 1, 10)], 150);
  assert.ok(Math.abs(t.shown(150, near)[0].x - mid.x) < 1e-9);
  const w = createTrack(T); w.push([at(1, 0, 10)], 0); w.push([at(1, 40, 10)], 100);
  assert.deepEqual([w.shown(100, near)[0].x, w.shown(100, near)[0].speed], [40, 0]);
  assert.ok(Math.abs(arc(3.0, -3.0) - (2 * Math.PI - 6.0)) < 1e-9);
});
test('track: the cap keeps the nearest (ties by id); ids missing from a packet stay until remoteExpire; a reused id starts fresh', () => {
  const t = createTrack(T);
  t.push([at(5, 20, 0), at(2, 3, 0), at(9, 10, 0), at(4, 10, 0)], 0);
  assert.deepEqual(t.shown(0, near).map((s) => s.id), [2, 4, 9]);
  const e = createTrack({ ...T, expire: 1500, snap: 1000 });
  e.push([at(1, 3, 0), at(2, 5, 0)], 0); e.push([at(1, 3.2, 0)], 100);
  assert.deepEqual(e.shown(100, near).map((s) => s.id), [1, 2]);
  assert.deepEqual(e.shown(1501, near).map((s) => s.id), [1]); assert.equal(e.size(), 1);
  const r = createTrack({ ...T, expire: 1500, snap: 1000 }); r.push([at(7, 0, 5)], 0); r.shown(2000, near); r.push([at(7, 30, 5)], 2100);
  assert.deepEqual([r.shown(2100, near)[0].x, r.shown(2100, near)[0].speed], [30, 0]);
});
test('track: defaults read the rows (nearCap 40)', () => {
  const t = createTrack(); for (let i = 0; i < 60; i++) t.push([at(i, i, 0)], 0);
  assert.equal(t.shown(0, near).length, 40);
});

// ---- the chunk's API ----
test('presenceUrlFor: off without the flag; ?presence=1 is this host at the row path; ws(s) URLs pass; anything else is off', () => {
  const https = { protocol: 'https:', host: 'v3.example.com' }, http = { protocol: 'http:', host: 'localhost:8080' };
  assert.equal(presenceUrlFor('', https), null);
  assert.equal(presenceUrlFor('?presence=0', https), null);
  assert.equal(presenceUrlFor('?presence=1', https), 'wss://v3.example.com/presence');
  assert.equal(presenceUrlFor('?presence=1', http), 'ws://localhost:8080/presence');
  assert.equal(presenceUrlFor('?presence=ws://127.0.0.1:8794/presence', https), 'ws://127.0.0.1:8794/presence');
  assert.equal(presenceUrlFor('?presence=javascript:alert(1)', https), null);
  assert.equal(presenceUrlFor('?presence=http://evil.test/', https), null);
  assert.equal(startPresence({ search: '', location: https }), null);
});
test('startPresence: reports the hero\'s pose, exposes remotes eased, fires hello/others/state events, and stops', () => {
  let now = 0, hero = { x: 1, z: 2, heading: 0 }; const sockets = [];
  const h = startPresence({ search: '?presence=1', location: { protocol: 'http:', host: 'x' }, now: () => now, pose: () => hero,
    open: (url, protocols) => { const s = { url, protocols, readyState: 1, sent: [], send(b) { this.sent.push(b); }, close() { this.closed = true; }, binaryType: '' }; sockets.push(s); return s; } });
  const events = []; h.on('hello', (v) => events.push(['hello', v.id])); h.on('others', (v) => events.push(['others', v.length]));
  const s = sockets[0]; s.onopen?.();
  s.onmessage({ data: JSON.stringify({ t: 'hello', id: 3, layer: 1, x: C, z: C, frame: PRESENCE.frame }) });
  assert.deepEqual(h.self(), { id: 3, layer: 1 }); assert.equal(h.state(), 'live');
  h.flush(); assert.deepEqual(decodeUp(s.sent[0]).x, C + 100);
  const b = encodeDown(1, [{ id: 4, x: C + 200, z: C, heading: 0, anim: 0, flags: 0, tick: 1 }]);
  s.onmessage({ data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) });
  assert.deepEqual(h.remotes(0).map((r) => [r.id, r.x, r.z]), [[4, 2, 0]]);
  assert.deepEqual(events, [['hello', 3], ['others', 1]]);
  h.stop(); assert.equal(s.closed, true); assert.equal(h.state(), 'off');
});

test('the two-client smoke script (npm run presence:smoke) passes: each client sees the other', () => {
  const r = spawnSync(process.execPath, ['server/presence/smoke.ts'], { cwd: new URL('../../', import.meta.url), encoding: 'utf8', timeout: 20_000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /alice sees bob: true; bob sees alice: true/);
});
