// The presence proof's server side, over real sockets on loopback (docs/PRESENCE-PROOF.md): two phones join ONE presence shard and see each other's bodies; each runs the REAL shared-hp client
// (src/zone/shared-hp-client.ts + its fetch transport) against the proof zone writer (server/zone/writer.ts); the boss dies in the hit that takes the one bar to 0 and the kill credit is recorded
// by damage share for both. A phone in another shard has its own bar. The browser version of the same walk is scripts/presence-proof.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWriter, WRITER, spawnFor } from '../../server/zone/writer.ts';
import { createPresence } from '../../server/presence/server.ts';
import { joinBot } from '../../server/presence/test-client.ts';
import { createSharedHp, ROWS } from '../../src/zone/shared-hp-client.ts';
import { httpTransport } from '../../src/zone/shared-hp-http.ts';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (ok, ms = 8000) => { for (let t = 0; t < ms && !ok(); t += 25) await wait(25); };
const INSTANCE = 'z1:pit-pitborn-east';

const listen = (server) => new Promise((r) => server.listen(0, '127.0.0.1', r));
// A phone: its own cookie jar (the writer mints the account), a real httpTransport, a real shared-hp client driven by a timer.
function phone(base, layer, n) {
  let cookie = '';
  const fetch = async (url, init) => {
    const res = await globalThis.fetch(url, { method: init.method, headers: { ...init.headers, ...(cookie ? { cookie } : {}) }, body: init.body });
    const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    return res;
  };
  const transport = httpTransport({ base, rows: ROWS, fetch });
  const c = createSharedHp({ transport, instance: INSTANCE, layer: () => layer, session: `proof${n}`, weapon: () => 'gladius' });
  const timer = setInterval(() => void c.tick(performance.now()).catch(() => {}), ROWS.timing.tickMs);
  return { c, stop: () => { clearInterval(timer); c.stop(); } };
}
const swing = (c) => c.hit({ type: 'Hit', actor: ROWS.sim.heroSide, target: ROWS.sim.foeSide, damage: 30, weapon: 'gladius' });

test('the writer rows: max hp from the writer, kind and respawn from the zone row; an unknown spawn has none', () => {
  const zone = JSON.parse(readFileSync(new URL('../../data/zones/zone1.row.json', import.meta.url), 'utf8'));
  const sp = zone.spawns.find((s) => `z1:${s.id}` === INSTANCE);
  assert.deepEqual(spawnFor(INSTANCE), { kind: sp.kind, maxHp: WRITER.maxHp[sp.kind], respawnS: sp.respawnSeconds });
  assert.equal(spawnFor('z1:nobody'), null);
  assert.equal(spawnFor('z9:pit-pitborn-east'), null);
  assert.equal(WRITER.host, '127.0.0.1', 'loopback only');
  assert.notEqual(WRITER.port, 8794, 'not presence\'s port');
});

test('two phones, one shard: they see each other, share one boss bar, one lands the kill, credit is recorded for both by share; another shard has its own bar', async () => {
  const presence = createPresence({ log: () => {} }), writer = createWriter();
  await listen(presence.server); await listen(writer.server);
  const base = `http://127.0.0.1:${writer.port()}${WRITER.path}`;
  const bots = [], phones = [];
  try {
    const a = await joinBot(presence.port()), b = await joinBot(presence.port());
    bots.push(a, b);
    assert.equal(a.hello.layer, b.hello.layer, 'same shard');
    a.pose(1, 0); b.pose(0, 1);
    await until(() => a.seen().some((e) => e.id === b.hello.id && e.z > 0.9) && b.seen().some((e) => e.id === a.hello.id && e.x > 0.9));
    assert.ok(a.seen().some((e) => e.id === b.hello.id), 'A sees B\'s body');
    assert.ok(b.seen().some((e) => e.id === a.hello.id), 'B sees A\'s body');

    const pa = phone(base, a.hello.layer, 1), pb = phone(base, b.hello.layer, 2);
    phones.push(pa, pb);
    await Promise.all([pa.c.start(performance.now()), pb.c.start(performance.now())]);
    assert.equal(pa.c.phase(), 'engaged'); assert.equal(pb.c.phase(), 'engaged');
    assert.equal(pa.c.bar().maxHp, 137);
    // both swing until the one bar is gone
    const swinger = setInterval(() => { swing(pa.c); swing(pb.c); }, 120);
    await until(() => pa.c.phase() === 'dead' && pb.c.phase() === 'dead' && pa.c.kill() && pb.c.kill());
    clearInterval(swinger);
    assert.equal(pa.c.phase(), 'dead'); assert.equal(pb.c.phase(), 'dead');

    const credits = writer.credits();
    assert.equal(credits.length, 2, 'one credit row per contributor');
    assert.equal(credits.every((c) => c.paid && c.reason === 'paid'), true);
    assert.equal(credits.every((c) => c.instance === INSTANCE && c.layer === a.hello.layer), true);
    const total = credits.reduce((n, c) => n + c.damage, 0);
    assert.equal(Math.round(total), 137, 'applied damage adds up to the one bar, no more');
    assert.ok(Math.abs(credits.reduce((n, c) => n + c.payShare, 0) - 1) < 1e-9, 'pay shares sum to 1');
    assert.equal(writer.stats().kills, 1, 'exactly one kill');
    assert.equal(pa.c.kill().paid, true); assert.equal(pb.c.kill().paid, true);
    assert.equal(new Set(credits.map((c) => c.account)).size, 2, 'two different accounts');

    // another shard: its own copy of the world, its own full bar (the first phone's kill did not touch it)
    const pc = phone(base, a.hello.layer + 1, 3); phones.push(pc);
    await pc.c.start(performance.now());
    assert.equal(pc.c.bar().hp, 137);
    assert.equal(writer.world.spawns.size, 2);
  } finally {
    for (const p of phones) p.stop();
    for (const b of bots) b.close();
    await presence.close(); await new Promise((r) => writer.server.close(r));
  }
});

test('the writer never sends a phone another account\'s credit rows, and a forged claim is capped by the weapon rows', async () => {
  const writer = createWriter(); await listen(writer.server);
  const base = `http://127.0.0.1:${writer.port()}${WRITER.path}`;
  try {
    let cookie = '';
    const post = async (route, body) => {
      const res = await fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
      const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
      return { status: res.status, json: await res.json() };
    };
    const e = await post('/engage', { instance: INSTANCE, layer: 1 });
    assert.equal(e.status, 200);
    const h = await post('/hits', { batchId: 'forged.batch.1', rows: [{ token: e.json.token, weapon: 'gladius', claimed: 1e9, hits: 999, layer: 1 }] });
    const slot = h.json.results[0];
    assert.ok(slot.applied > 0 && slot.applied <= 137, `capped, not 1e9: ${slot.applied}`);
    assert.equal(slot.credits, undefined);
    assert.equal(slot.killed, slot.hp === 0);
    const replay = await post('/hits', { batchId: 'forged.batch.1', rows: [{ token: e.json.token, weapon: 'gladius', claimed: 30, hits: 1, layer: 1 }] });
    assert.deepEqual(replay.json, { replayed: true, results: [] }, 'a repeated batch id applies nothing');
    assert.equal((await post('/engage', { instance: 'z1:nobody', layer: 1 })).json.refused, 'mismatch');
    assert.equal((await post('/hits', { batchId: 'bad.batch.01', rows: [{ token: 'x'.repeat(16), weapon: 'gladius', claimed: 1, hits: 1, layer: 1 }] })).json.results[0].error, 'O0009', 'unknown token');
  } finally { await new Promise((r) => writer.server.close(r)); }
});

test('default off: nothing the page ships imports the proof writer, and the build reads neither it nor its rows', () => {
  const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
  for (const f of ['src/client/main.ts', 'src/zone/shared-hp-chunk.ts', 'src/presence/chunk.ts', 'index.html', 'scripts/build.mjs']) {
    const text = read(f);
    assert.equal(/server\/zone|zone-writer/.test(text), false, `${f} does not reference the proof writer`);
  }
  assert.equal(ROWS.query, 'sharedhp'); // the existing flags are untouched: ?presence= and ?sharedhp=
});
