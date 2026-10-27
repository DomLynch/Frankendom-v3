// Other players drawn (src/presence/draw.ts, chunk.ts startZonePresence, scene.ts spawnRemote, main.ts): the pool, the cap, the gait from speed, a slot freed on leave, the hero pose seam, and that the default page
// (no ?presence=) carries none of it. No THREE here: the bodies are fakes; the real rig is checked by scripts/presence-two-pages.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDraw, heroPoseFn, startDrawLoop, SEAM } from '../../src/presence/draw.ts';
import { startZonePresence } from '../../src/presence/chunk.ts';
import { presenceRule } from '../../src/presence/rows.ts';

const body = () => { const b = { group: { visible: false, position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, rotation: { y: 0 } }, calls: [], update(speed, dt) { this.calls.push([speed, dt]); } }; return b; };
const shown = (id, x, z, speed = 0, heading = 0) => ({ id, x, z, heading, speed });

test('a remote gets a body from the pool: placed at its x/z on the ground, turned to its heading, visible, posed; no body (hero rig not built) tries again next frame', () => {
  const made = [], list = [shown(7, 3, -2, 0, 1.5)];
  let ready = false;
  const draw = createDraw({ remotes: () => list, spawn: () => (ready ? (made.push(body()), made.at(-1)) : null), now: () => 0 });
  draw.frame(0.016);
  assert.equal(made.length, 0, 'nothing to draw with until the hero rig exists');
  ready = true; draw.frame(0.016);
  assert.equal(made.length, 1);
  const g = made[0].group;
  assert.deepEqual([g.visible, g.position.x, g.position.y, g.position.z, g.rotation.y], [true, 3, 0, -2, 1.5]);
  assert.equal(made[0].calls.length, 1);
});

test('the drawn count is capped by the drawMax row, nearest first (the list is already nearest first), and the pool never grows past it', () => {
  const made = [], list = Array.from({ length: 20 }, (_, i) => shown(i + 1, i, 0));
  const draw = createDraw({ remotes: () => list, spawn: () => (made.push(body()), made.at(-1)), now: () => 0 });
  draw.frame(0.016); draw.frame(0.016);
  assert.equal(presenceRule('drawMax'), 8);
  assert.equal(made.length, 8);
  assert.deepEqual(draw.debug().shown.map((s) => s.id), [1, 2, 3, 4, 5, 6, 7, 8]);
  const small = createDraw({ remotes: () => list, spawn: () => (made.push(body()), made.at(-1)), now: () => 0, max: 2 });
  small.frame(0.016); assert.equal(small.debug().shown.length, 2);
});

test('a leaver\'s body is hidden and recycled for the next arrival (no new rig); the gait speed eases up from rest and stands below drawIdle', () => {
  const made = [];
  let list = [shown(1, 0, 0, 3)];
  const draw = createDraw({ remotes: () => list, spawn: () => (made.push(body()), made.at(-1)), now: () => 0 });
  draw.frame(0.05);
  const first = made[0].calls.at(-1)[0];
  assert.ok(first > 0 && first < 3, `eases up from 0 (${first})`);
  for (let i = 0; i < 30; i++) draw.frame(0.05);
  assert.ok(Math.abs(made[0].calls.at(-1)[0] - 3) < 0.01, 'reaches the ease\'s speed');
  list = []; draw.frame(0.05);
  assert.equal(made[0].group.visible, false, 'hidden once gone');
  assert.deepEqual(draw.debug().shown, []);
  list = [shown(9, 5, 5, 0.1)]; draw.frame(0.05);
  assert.equal(made.length, 1, 'the slot is reused, no second rig');
  assert.equal(made[0].group.visible, true);
  assert.equal(made[0].calls.at(-1)[0], 0, 'a drift under drawIdle stands');
});

test('heroPoseFn: where he stands and faces, the anim byte from the speed between two reads (idle / walk / run rows), never from a gap under poseMinDtMs', () => {
  let t = 0, at = { x: 0, z: 0, heading: 2 };
  const pose = heroPoseFn(() => at, () => t);
  assert.deepEqual(pose(), { x: 0, z: 0, heading: 2, anim: presenceRule('animIdle') });
  t = 300; at = { x: 0.9, z: 0, heading: 2 };   // 3 m/s: walk
  assert.equal(pose().anim, presenceRule('animWalk'));
  t = 600; at = { x: 2.4, z: 0, heading: 2 };   // 5 m/s: run
  assert.equal(pose().anim, presenceRule('animRun'));
  t = 700; at = { x: 2.4, z: 0, heading: 2 };   // a read 100 ms later is under poseMinDtMs: it measures nothing and the anim holds
  assert.equal(pose().anim, presenceRule('animRun'));
  t = 900; assert.equal(pose().anim, presenceRule('animIdle'), 'stood still');
});

test('startDrawLoop runs frame(dt) on the page\'s own animation frame (dt clamped) and stops', () => {
  const frames = [], fns = [];
  const stop = startDrawLoop({ frame: (dt) => frames.push(dt) }, (fn) => fns.push(fn), () => {});
  fns.shift()(1000); fns.shift()(1016); fns.shift()(5000);
  assert.deepEqual(frames.map((f) => +f.toFixed(3)), [0, 0.016, 0.1]);
  stop(); fns.shift()(5016);
  assert.equal(frames.length, 3);
});

test('startZonePresence installs the seam only for a good ?presence= value, and the seam reads the page\'s hero; a bad value leaves nothing behind', () => {
  const loc = { protocol: 'http:', host: 'x.test' }, g = globalThis;
  assert.equal(g[SEAM], undefined, 'no seam before');
  const sockets = [];
  const real = g.WebSocket; g.WebSocket = class { constructor(u, p) { this.url = u; this.protocols = p; sockets.push(this); } send() {} close() {} };
  const raf = g.requestAnimationFrame, caf = g.cancelAnimationFrame; g.requestAnimationFrame = () => 1; g.cancelAnimationFrame = () => {};
  try {
    assert.equal(startZonePresence({ search: '?presence=nope', location: loc, hero: () => ({ x: 0, z: 0, heading: 0 }), spawn: () => null }), null);
    assert.equal(g[SEAM], undefined, 'a malformed value installs nothing');
    const h = startZonePresence({ search: '?presence=ws://127.0.0.1:8794/presence', location: loc, hero: () => ({ x: 1, z: 2, heading: 3 }), spawn: () => null });
    assert.ok(h);
    assert.equal(typeof g[SEAM], 'function');
    assert.deepEqual(g[SEAM](), { x: 1, z: 2, heading: 3, anim: presenceRule('animIdle') });
    assert.deepEqual(h.drawn().shown, []);
    h.stop();
  } finally { delete g[SEAM]; g.WebSocket = real; g.requestAnimationFrame = raf; g.cancelAnimationFrame = caf; }
});

test('the default page is untouched: main.ts names the seam only inside the ?presence= branch, scene.ts spawnRemote sits in one marked block and is called from nowhere else, draw.ts imports no THREE', () => {
  const main = readFileSync(new URL('../../src/client/main.ts', import.meta.url), 'utf8'), scene = readFileSync(new URL('../../src/fight/scene.ts', import.meta.url), 'utf8');
  const draw = readFileSync(new URL('../../src/presence/draw.ts', import.meta.url), 'utf8');
  assert.equal(main.split('\n').filter((l) => /spawnRemote|startZonePresence|__v3HeroPose/.test(l)).length, 1, 'one line in main.ts, the one behind /[?&]presence=/');
  assert.match(main.split('\n').find((l) => /spawnRemote/.test(l)), /^if \(\/\[\?&\]presence=\/\.test\(search\)\)/);
  assert.equal((scene.match(/spawnRemote/g) ?? []).length, 1);
  assert.equal((scene.match(/other players \(presence wiring/g) ?? []).length, 1);
  assert.doesNotMatch(draw, /from\s+['"]three['"]/);
  assert.doesNotMatch(draw, /fetch\(|new WebSocket|XMLHttpRequest/, 'draw.ts fetches nothing');
});
