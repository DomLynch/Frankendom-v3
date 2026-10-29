// PERF ROW (wall-clock budget): Mac only, run with MAC_HEAVY_OK=1 and load < 12 (check `uptime`). Never in CI or hfjob. Run: npm run perf:rows
// Split out of test/presence/server.test.mjs (Strategy ruling B): the behaviour (a close frame removes the player without the peer's FIN) stays there; only "and quickly (< 600 ms)" lives here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { PATH, PROTOCOL, createPresence } from '../../server/presence/server.ts';
import { joinBot } from '../../server/presence/test-client.ts';

const skip = process.env.MAC_HEAVY_OK === '1' ? false : 'perf row: set MAC_HEAVY_OK=1 (Mac only, load < 12)';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (ok, ms = 3000) => { for (let t = 0; t < ms && !ok(); t += 25) await wait(25); };
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

test('a close frame removes the player within 600 ms', { skip }, async () => {
  const p = createPresence({ log: () => {} });
  await new Promise((r) => p.server.listen(0, '127.0.0.1', r));
  try {
    const alice = await joinBot(p.port()), ghost = await rawJoin(p.port());
    await until(() => p.world.stats().players === 2);
    ghost.write(CLOSE_FRAME);
    const t0 = Date.now();
    await until(() => p.world.stats().players === 1, 1500);
    const ms = Date.now() - t0;
    console.log(`# close frame to world forgot him: ${ms} ms (budget 600)`);
    assert.ok(ms < 600, `${ms} ms`);
    ghost.destroy(); alice.close();
  } finally { await p.close(); }
});
