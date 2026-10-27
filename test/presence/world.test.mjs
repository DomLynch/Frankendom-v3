// The presence rules without a socket (server/presence/interest.ts): the wire format, layers and assignment, interest management, the movement clamp and its jitter credit.
// Ported from V1 tests/origins-presence.test.ts and origins/presence/move-jitter.test.ts; the account/zone/legacy cases are dropped with the code they tested.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeDown, decodeUp, encodeDown, encodeUp, ENTITY_BYTES } from '../../src/presence/wire.ts';
import { PRESENCE } from '../../src/presence/rows.ts';
import { RULES, SPAWN, World, walkable } from '../../server/presence/interest.ts';

const C = PRESENCE.frame.centreCm;
const key = (n) => `p-${n}`;
const put = (w, n, x, z) => w.join(key(n), 0, undefined, { x, z });
const pose = (x, z) => ({ x, z, heading: 1, anim: 2, flags: 3 });

test('wire: the up pose and the down packet round-trip, an entity is 11 bytes, and a malformed buffer is refused', () => {
  const p = { x: 12345, z: 65535, heading: 200, anim: 3, flags: 5 };
  assert.deepEqual(decodeUp(encodeUp(p)), p);
  assert.equal(decodeUp(new Uint8Array(7)), null);
  assert.equal(decodeUp(Uint8Array.from([9, 0, 0, 0, 0, 0, 0, 0])), null);
  const ents = [{ id: 1, ...p, tick: 7 }, { id: 99, x: 0, z: 1, heading: 0, anim: 0, flags: 0, tick: 65535 }];
  const packet = encodeDown(70000, ents);
  assert.equal(ENTITY_BYTES, 11);
  assert.equal(packet.length, 4 + 2 * 11);
  assert.deepEqual(decodeDown(packet), { tick: 70000 & 0xffff, entities: ents });
  assert.equal(decodeDown(packet.subarray(0, packet.length - 1)), null);
});

test('layers: fill the fullest layer under the soft cap, open a new one at 80, a friend may fill to 100, and the world can be full', () => {
  const w = new World(RULES, 2);
  const first = w.join(key(1), 0);
  for (let i = 2; i <= 80; i++) assert.equal(w.join(key(i), 0).layer.id, first.layer.id);
  assert.equal(w.layers.get(first.layer.id).players.size, 80);
  const eighty1 = w.join(key(81), 0);
  assert.notEqual(eighty1.layer.id, first.layer.id, 'the 81st arrival opens a second layer');
  assert.equal(w.join(key(82), 0).layer.id, eighty1.layer.id, 'then fills the fullest layer under the soft cap');
  assert.equal(w.join(key(200), 0, key(1)).layer.id, first.layer.id, 'a friend goes to the friend\'s layer past the soft cap');
  for (let i = 201; i <= 219; i++) assert.equal(w.join(key(i), 0, key(1)).layer.id, first.layer.id);
  assert.equal(w.layers.get(first.layer.id).players.size, 100);
  assert.notEqual(w.join(key(300), 0, key(1)).layer.id, first.layer.id, 'the hard cap holds even for a friend');
  assert.equal(w.join(key(1), 0), null, 'a key is in once');
  for (let i = 400; i < 480; i++) w.join(key(i), 0);
  assert.equal(w.join(key(999), 0), null, 'both layers are at their soft cap and no third may open');
});

test('ids are small and reused, a leaving player frees the slot and the cell, and an emptied layer closes after the wait', () => {
  const w = new World();
  const a = w.join(key(1), 0), b = w.join(key(2), 0);
  assert.deepEqual([a.id, b.id], [1, 2]);
  w.leave(a, 10);
  assert.equal(w.byKey.has(key(1)), false);
  assert.equal([...a.layer.cells.values()].some((c) => c.has(a)), false, 'no cell still holds the leaver');
  assert.equal(w.join(key(3), 20).id, 1);
  const lone = new World(); const p = lone.join(key(1), 0); lone.leave(p, 100);
  assert.equal(lone.sweep(100 + RULES.emptyLayerMs - 1), 0);
  assert.equal(lone.sweep(100 + RULES.emptyLayerMs), 1);
  assert.equal(lone.layers.size, 0);
});

test('interest: only others inside 40 m, each ring at its own rate, never yourself', () => {
  const w = new World();
  const me = put(w, 1, C, C);
  const near = put(w, 2, C + 500, C), mid = put(w, 3, C + 2000, C), far = put(w, 4, C + 3500, C), out = put(w, 5, C + 4500, C);
  const rate = (id) => { let n = 0; for (let t = 0; t < 10; t++) if (w.seenBy(me, t).some((e) => e.id === id)) n++; return n; };
  assert.equal(rate(near.id), 10, 'under 12 m: every tick (10 Hz)');
  assert.equal(rate(mid.id), 5, '12-25 m: every other tick (5 Hz)');
  assert.equal(rate(far.id), 2, '25-40 m: every fifth tick (2 Hz)');
  assert.equal(rate(out.id), 0, 'past 40 m: does not exist');
  assert.equal(rate(me.id), 0, 'never yourself');
});

test('interest: the 40 nearest are sent and the rest are culled; a packet never exceeds the cap', () => {
  const w = new World(RULES, 1);
  const me = put(w, 1, C, C);
  for (let i = 2; i <= 79; i++) put(w, i, C + (i % 10) * 100 + 1, C + Math.floor(i / 10) * 100);   // all within 12 m, so every one is due every tick
  const seen = w.seenBy(me, 0);
  assert.equal(seen.length, RULES.nearCap);
  const dist = seen.map((e) => Math.hypot(e.x - me.x, e.z - me.z));
  assert.deepEqual(dist, [...dist].sort((x, y) => x - y), 'nearest first');
  const all = [...me.layer.players.values()].filter((q) => q !== me).map((q) => Math.hypot(q.x - me.x, q.z - me.z)).sort((x, y) => x - y);
  assert.ok(Math.max(...dist) <= all[RULES.nearCap - 1] + 1e-9, 'and they are the 40 nearest of the 77');
});

test('players in different layers never see each other', () => {
  const w = new World(RULES, 2);
  const a = w.join(key(1), 0), many = []; for (let i = 2; i <= 80; i++) many.push(w.join(key(i), 0));
  const other = w.join(key(81), 0);
  assert.notEqual(other.layer.id, a.layer.id);
  assert.equal(w.seenBy(other, 0).length, 0, 'same spot, other layer: nothing');
});

test('tick: a packet for each player with something due, none for a lone player, and it decodes to the others', () => {
  const w = new World();
  const a = put(w, 1, C, C), b = put(w, 2, C + 300, C), lone = new World().join(key(1), 0);
  const out = w.tick(0);
  assert.equal(out.size, 2);
  assert.deepEqual(decodeDown(out.get(a)).entities.map((e) => e.id), [b.id]);
  assert.equal(new World().tick(0).size, 0); void lone;
});

test('movement clamp: walkable ground, no faster than sprint; a jump is snapped back and a run of them drops the player', () => {
  const w = new World();
  const p = w.join(key(1), 0, undefined, { x: C, z: C });
  p.movedAt = 0;
  assert.equal(w.move(p, pose(C + 100, C), 100), 'ok', '1 m in 100 ms is 10 m/s: inside the slack (7 m/s x 1.5)');
  assert.equal(p.x, C + 100);
  assert.equal(w.move(p, pose(C + 5100, C), 200), 'snapped', 'a 50 m jump in 100 ms');
  assert.equal(p.x, C + 100, 'and the old position stays');
  for (let i = 0; i < 4; i++) assert.equal(w.move(p, pose(C + 5000, C), 300 + i * 100), 'snapped');
  assert.equal(w.move(p, pose(C + 5000, C), 800), 'drop', 'the sixth strike inside the window');
  const q = w.join(key(2), 0); q.movedAt = 0;
  assert.equal(w.move(q, pose(0, 65535), 1000), 'snapped', 'a pose far outside the walkable square is a jump too');
  const edge = C + PRESENCE.rules.find((r) => r.id === 'walkHalfCm').value;
  assert.equal(walkable(edge, C), true); assert.equal(walkable(edge + 1, C), false);
  const r = w.join(key(3), 0, undefined, { x: edge - 100, z: C }); r.movedAt = 0;
  assert.equal(w.move(r, pose(edge + 40, C), 1000), 'snapped', 'a pose past the walkable ground is refused, the old place stays');
  assert.equal(r.x, edge - 100);
});

test('a player with no known position starts at the spawn, and its first pose is clamped like every other (a first pose never places anyone)', () => {
  const w = new World();
  const p = w.join(key(1), 0);
  assert.deepEqual([p.x, p.z], [SPAWN.x, SPAWN.z]);
  assert.deepEqual([SPAWN.x, SPAWN.z], [C, C], 'the frame centre = world (0, 0)');
  assert.equal(w.move(p, pose(5000, 6000), 100), 'snapped', 'a first pose far from the spawn is a teleport, not a placement');
  assert.deepEqual([p.x, p.z], [C, C]);
  assert.equal(w.move(p, pose(C + 100, C), 200), 'ok', 'a first pose within the clamp is an ordinary move');
  assert.equal(p.layer.cells.get(Math.floor((C + 100) / 1600) * 4096 + Math.floor(C / 1600)).has(p), true, 'and the grid holds it there');
  const off = w.join(key(2), 0, undefined, { x: 0, z: 0 });
  assert.deepEqual([off.x, off.z], [C, C], 'a join spot off the walkable ground starts at the spawn');
});

// ---- the jitter credit (V1 origins/presence/move-jitter.test.ts) ----
// A walker sends one pose every `every` ms at `cmS`; `arrive(k, sentAt)` is when the server hears it. Returns the server's answer per packet.
function walk(cmS, every, count, arrive) {
  const w = new World(), p = w.join(key(1), 0), out = [];
  const packets = Array.from({ length: count }, (_, k) => ({ k, sentAt: (k + 1) * every })).map((q) => ({ ...q, at: arrive(q.k, q.sentAt) })).sort((a, b) => a.at - b.at || a.k - b.k);
  for (const q of packets) out.push(w.move(p, { x: C + Math.round((cmS * q.sentAt) / 1000), z: C, heading: 0, anim: 0, flags: 0 }, q.at));
  return out;
}
test('an honest sprinter whose packets bunch once is never struck, and one hiccup does not snowball into a drop', () => {
  const out = walk(700, 200, 40, (k, sentAt) => sentAt + (k === 5 ? 180 : 0));
  assert.deepEqual(out.filter((r) => r !== 'ok'), []);
});
test('repeated jitter on a slow link (a burst of 4 late packets every 2 s) never reaches the drop', () => {
  const out = walk(600, 100, 200, (k, sentAt) => sentAt + (k % 20 >= 16 ? 400 - (k % 20 - 16) * 100 : 0));
  assert.deepEqual(out.filter((r) => r !== 'ok'), []);
});
test('a speed hack still strikes and drops: 3000 cm/s sustained cannot out-run the credit', () => {
  const out = walk(3000, 100, 60, (_, sentAt) => sentAt);
  assert.ok(out.includes('snapped')); assert.ok(out.includes('drop'));
});
test('a jump cannot be banked: a teleport of 50 m after a long quiet spell is still a strike', () => {
  const w = new World(), p = w.join(key(1), 0);
  assert.equal(w.move(p, { x: C + 5000, z: C, heading: 0, anim: 0, flags: 0 }, 60_000), 'snapped');
});
test('tick-sized poses sent 1 ms apart are a speed hack: a tick of reach is only for the first pose', () => {
  const out = walk(105_000, 1, 60, (_, sentAt) => sentAt);
  assert.equal(out[0], 'ok'); assert.ok(out.slice(1).includes('snapped')); assert.ok(out.includes('drop'));
});
test('many packets in the same millisecond cannot spend more than the credit', () => {
  const w = new World(), p = w.join(key(1), 0), seen = [];
  for (let k = 1; k <= 30; k++) seen.push(w.move(p, { x: C + 150 * k, z: C, heading: 0, anim: 0, flags: 0 }, 1000));
  assert.ok(seen.includes('snapped'));
});
