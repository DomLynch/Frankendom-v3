// The presence service over a real socket on loopback (server/presence/server.ts): join, position, interest, leave, refusals, limits, health. Ported from V1 tests/origins-presence.test.ts,
// origins-presence-ticks.test.ts and origins/presence/leave.test.ts (the account, token, warp, worn and writer cases are not lifted, so not tested).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { LIMITS, PROTOCOL, PATH, createPresence } from '../../server/presence/server.ts';
import { RULES } from '../../server/presence/interest.ts';
import { joinBot } from '../../server/presence/test-client.ts';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (ok, ms = 3000) => { for (let t = 0; t < ms && !ok(); t += 25) await wait(25); };
const start = async (opts = {}) => {
  const p = createPresence({ log: () => {}, ...opts });
  await new Promise((r) => p.server.listen(0, '127.0.0.1', r));
  return p;
};
const tryOpen = (url, protocols) => new Promise((resolve) => { const ws = new WebSocket(url, protocols); ws.onopen = () => { ws.close(); resolve('open'); }; ws.onerror = () => resolve('refused'); });

test('two players join the same layer, each sees the other\'s position and animation but never itself, and leaving frees the slot', async () => {
  const p = await start();
  try {
    const a = await joinBot(p.port()), b = await joinBot(p.port());
    assert.equal(a.hello.layer, b.hello.layer);
    assert.notEqual(a.hello.id, b.hello.id);
    assert.deepEqual(a.at(), { x: 0, z: 0 }, 'the server places a join at world (0, 0)');
    assert.deepEqual(a.hello.frame, { centreCm: 32768, sizeCm: 65535 });
    a.pose(1, 0); b.pose(0, 1);   // one metre each: inside the first pose's one-tick reach (a longer first step is a teleport)
    await until(() => a.seen().some((e) => e.z > 0.9) && b.seen().some((e) => e.x > 0.9));   // the packets before the poses landed carry the spawn
    const sawB = a.seen().find((e) => e.id === b.hello.id), sawA = b.seen().find((e) => e.id === a.hello.id);
    assert.ok(sawB && Math.abs(sawB.x) < 0.01 && Math.abs(sawB.z - 1) < 0.01, `a sees b at (0, 1) m: ${JSON.stringify(sawB)}`);
    assert.ok(sawA && Math.abs(sawA.x - 1) < 0.01 && Math.abs(sawA.z) < 0.01, `b sees a at (1, 0) m: ${JSON.stringify(sawA)}`);
    assert.equal(a.seen().some((e) => e.id === a.hello.id), false, 'never about itself');
    assert.equal(p.world.stats().players, 2);
    b.close();
    await until(() => p.world.stats().players === 1);
    assert.equal(p.world.stats().players, 1);
    a.close();
    await until(() => p.world.stats().players === 0);
    assert.equal(p.world.stats().players, 0);
  } finally { await p.close(); }
});

test('a teleport is snapped: what a sees of b stays at b\'s last accepted place, and the client is told nothing', async () => {
  const p = await start();
  try {
    const a = await joinBot(p.port()), b = await joinBot(p.port());
    b.pose(0, 30);   // 30 m from the spawn on the first pose: a jump, not a step
    await until(() => a.seen().length === 1);
    const sawB = a.seen()[0];
    assert.ok(Math.abs(sawB.z) < 0.01, `b is still at the spawn for a: ${JSON.stringify(sawB)}`);
    assert.equal(p.stats().snapped, 1);
    a.close(); b.close();
  } finally { await p.close(); }
});

test('a malformed frame closes the socket (4xxx/1003) and a text frame is not part of the protocol', async () => {
  const p = await start();
  try {
    const a = await joinBot(p.port()), b = await joinBot(p.port());
    a.raw(new Uint8Array(20));   // not a pose
    await until(() => a.closeCode() !== null);
    assert.ok(a.closeCode() !== null, 'closed');
    b.raw('{"t":"warp","to":"anywhere"}');
    await until(() => b.closeCode() !== null);
    assert.ok(b.closeCode() !== null, 'a text frame from a client closes it (V1\'s warp and speech frames are not lifted)');
    await until(() => p.world.stats().players === 0);
    assert.equal(p.world.stats().players, 0);
    assert.ok(p.stats().refused.malformed >= 2);
  } finally { await p.close(); }
});

test('refusals: no subprotocol, another protocol, a wrong path; the world-full refusal', async () => {
  const p = await start({ rules: { ...RULES, softCap: 1, hardCap: 1 }, maxLayers: 1 });
  const base = `ws://127.0.0.1:${p.port()}`;
  try {
    assert.equal(await tryOpen(`${base}${PATH}`), 'refused', 'no subprotocol');
    assert.equal(await tryOpen(`${base}${PATH}`, ['frankendom.presence.v2']), 'refused', 'V1\'s protocol name is not this service\'s');
    assert.equal(await tryOpen(`${base}/origins/presence`, [PROTOCOL]), 'refused', 'a wrong path');
    const a = await joinBot(p.port());
    await assert.rejects(joinBot(p.port()), /refused/, 'the only layer is full and no more may open');
    assert.equal(p.stats().refused['world-full'], 1);
    assert.equal(p.stats().sockets, 1, 'a refused join holds no socket');
    a.close();
  } finally { await p.close(); }
});

test('the per-IP socket cap and the join rate refuse the extra join, and a refused join does not keep a slot', async () => {
  const p = await start({ limits: { ...LIMITS, ipSockets: 2 } });
  try {
    const a = await joinBot(p.port()), b = await joinBot(p.port());
    await assert.rejects(joinBot(p.port()), /refused/);
    assert.equal(p.stats().refused['ip-sockets'], 1);
    a.close(); b.close();
    await until(() => p.stats().sockets === 0);
    const c = await joinBot(p.port()); c.close();   // the slot came back
  } finally { await p.close(); }
  const q = await start({ limits: { ...LIMITS, ipJoinsPerMinute: 2 } });
  try {
    (await joinBot(q.port())).close(); (await joinBot(q.port())).close();
    await assert.rejects(joinBot(q.port()), /refused/);
    assert.equal(q.stats().refused['join-rate'], 1);
  } finally { await q.close(); }
});

test('the message rate closes a flood, and the idle timeout closes a silent socket; both remove the player at once', async () => {
  const p = await start({ limits: { ...LIMITS, perSecond: 5, idleMs: 400 } });
  try {
    const a = await joinBot(p.port());
    for (let i = 0; i < 12; i++) a.pose(0, 0);
    await until(() => a.closeCode() !== null);
    assert.equal(a.closeCode(), 4008, 'message-rate');
    await until(() => p.world.stats().players === 0, 1000);
    assert.equal(p.world.stats().players, 0);
    const b = await joinBot(p.port());
    await until(() => b.closeCode() !== null, 2000);
    assert.equal(b.closeCode(), 4000, 'idle');
    assert.equal(p.world.stats().players, 0);
  } finally { await p.close(); }
});

test('a speed hack is dropped with 4009 and gone from the world', async () => {
  const p = await start();
  try {
    const a = await joinBot(p.port());
    for (let i = 0; i < 8; i++) { a.pose(100 + i, 100); await wait(20); }
    await until(() => a.closeCode() !== null);
    assert.equal(a.closeCode(), 4009);
    assert.equal(p.world.stats().players, 0);
  } finally { await p.close(); }
});

// ---- leaving (V1 origins/presence/leave.test.ts) ----
async function assertGone(p, alice, bobId, why) {
  await until(() => ![...p.world.byKey.values()].some((q) => q.id === bobId), 3000);
  const layer = [...p.world.layers.values()][0];
  assert.equal(layer.players.has(bobId), false, `${why}: the layer forgot him`);
  assert.equal([...layer.cells.values()].some((c) => [...c].some((q) => q.id === bobId)), false, `${why}: no cell still holds him`);
  const leftAt = Date.now();
  for (let i = 0; i < 12; i++) { alice.pose(1 + (i % 2), 0); await wait(50); }
  const after = alice.packets().filter((q) => q.at > leftAt + 150);   // 150 ms: a packet already on the wire when the world forgot him may still land
  assert.equal(after.some((q) => q.ids.includes(bobId)), false, `${why}: a packet received after the world forgot him still carried his id`);
}
for (const how of ['standing still', 'after walking']) {
  test(`a player who closes his socket ${how} is gone from the world, the cells and every watcher's packets`, async () => {
    const p = await start();
    try {
      const alice = await joinBot(p.port()), bob = await joinBot(p.port());
      await until(() => alice.seen().length === 1 && bob.seen().length === 1);
      const bobId = bob.hello.id;
      if (how === 'after walking') for (let i = 1; i <= 8; i++) { bob.pose(i * 0.5, 0); await wait(100); }
      await until(() => alice.seen().some((e) => e.id === bobId), 2000);
      bob.close();
      await assertGone(p, alice, bobId, how);
      alice.close();
    } finally { await p.close(); }
  });
}

const CLOSE_FRAME = Buffer.from([0x88, 0x82, 0, 0, 0, 0, 0x03, 0xe8]);   // masked (zero key) close, code 1000
function rawJoin(port) {
  return new Promise((resolve, reject) => {
    const s = connect({ port, host: '127.0.0.1', allowHalfOpen: true });   // never ends its own side unless told: the half-open peer
    let done = false;
    s.once('error', reject);
    s.write(`GET ${PATH} HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: ${PROTOCOL}\r\n\r\n`);
    s.on('data', (d) => { if (!done && /^HTTP\/1\.1 101/.test(d.toString('latin1'))) { done = true; resolve(s); } });
  });
}
test('a close frame removes the player at once even when the peer never finishes the TCP close; the socket is destroyed after the grace', async () => {
  const p = await start();
  try {
    const alice = await joinBot(p.port()), ghost = await rawJoin(p.port());
    await until(() => p.world.stats().players === 2);
    ghost.write(CLOSE_FRAME);   // ...and nothing more: no FIN, no end()
    const t0 = Date.now();
    await until(() => p.world.stats().players === 1, 1500);
    assert.equal(p.world.stats().players, 1, 'the world forgot him on the close frame, without waiting for the peer\'s FIN');
    assert.ok(Date.now() - t0 < 600, `and quickly (${Date.now() - t0} ms)`);
    const open = () => new Promise((r) => p.server.getConnections((_e, n) => r(n)));
    let n = await open(); for (let i = 0; i < 60 && n > 1; i++) { await wait(50); n = await open(); }
    assert.equal(n, 1, 'the server destroyed the half-open socket after the grace (only alice is left)');
    ghost.destroy(); alice.close();
  } finally { await p.close(); }
});

test('perIp is swept: an address with no socket and an expired join window is forgotten', async () => {
  let clock = 1_000_000;
  const p = await start({ now: () => clock, sweepEveryMs: 20 });
  try {
    const a = await joinBot(p.port());
    assert.equal(p.stats().ips, 1, 'the address is tracked while it has a socket');
    clock += 120_000;
    await wait(120);
    assert.equal(p.stats().ips, 1, 'a live socket keeps its entry past the window');
    a.close();
    await until(() => p.stats().ips === 0, 1000);
    assert.equal(p.stats().ips, 0, 'once it has left and the window has passed, the entry is gone');
  } finally { await p.close(); }
});

test('health: the plain answer is stats; ?ticks=N returns the last N tick durations to a direct caller and nothing to a proxied one', async () => {
  const p = await start();
  const base = `http://127.0.0.1:${p.port()}${PATH}/health`;
  try {
    await until(() => p.stats().ticks >= 6, 3000);
    const plain = await (await fetch(base)).json();
    assert.ok(plain.ticks >= 6); assert.equal(plain.tickMs, undefined); assert.equal(plain.players, 0);
    assert.equal((await (await fetch(`${base}?ticks=3`)).json()).tickMs.length, 3);
    const lots = await (await fetch(`${base}?ticks=999999`)).json();
    assert.ok(lots.tickMs.length >= 6 && lots.tickMs.every((x) => Number.isFinite(x) && x >= 0 && x < 1000));
    assert.equal((await (await fetch(`${base}?ticks=0`)).json()).tickMs, undefined);
    assert.equal((await (await fetch(`${base}?ticks=abc`)).json()).tickMs, undefined);
    for (const h of [{ 'x-real-ip': '203.0.113.9' }, { 'x-forwarded-for': '203.0.113.9' }]) assert.equal((await (await fetch(`${base}?ticks=40000`, { headers: h })).json()).tickMs, undefined, 'a proxied caller gets no samples');
    assert.equal((await fetch(`http://127.0.0.1:${p.port()}/nothing`)).status, 404);
  } finally { await p.close(); }
});
