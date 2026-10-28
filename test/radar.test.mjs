// The radar (data/radar.json, src/fight/radar.ts): presentation only. Pure maths pinned: world to disc with rotation by the view yaw, rim clamping, range, the dead state, the off switch,
// the row validator, the presence blips, the page wiring (a tiny main.ts hunk, no sim import) and a mount against a fake document (no allocation-free claim beyond the counted dots).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFile } from '../src/sim/validate.js';
import { RADAR, bossBlips, classOf, mountRadar, place, playerBlips, radarOn, validateRadar } from '../src/fight/radar.ts';

const ROWS = JSON.parse(readFileSync(new URL('../data/radar.json', import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const at = (dx, dz, yaw = 0, rows = RADAR) => place(rows, dx, dz, yaw, { x: 0, y: 0, clamped: false });
const REACH = 1 - RADAR.rimInset, near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} vs ${b}`);

test('the rows validate, and a bad row is refused', () => {
  assert.deepEqual(validateFile('radar', ROWS), []);
  validateRadar(RADAR);
  const bad = (f) => { const r = clone(ROWS); f(r); return r; };
  assert.deepEqual(validateFile('radar', bad((r) => { r.extra = 1; })), ['radar.extra: unknown key']);
  assert.throws(() => validateRadar(bad((r) => { r.classes.hostile.colour = 'red'; })), /classes\.hostile\.colour/);
  assert.throws(() => validateRadar(bad((r) => { r.disc.alpha = 2; })), /disc\.alpha/);
  assert.throws(() => validateRadar(bad((r) => { r.rangeMetres = 0; })), /rangeMetres/);
  assert.throws(() => validateRadar(bad((r) => { r.corner = 'middle'; })), /corner/);
  assert.throws(() => validateRadar(bad((r) => { r.kinds.pitborn = 'player'; })), /kinds\.pitborn/);
  assert.throws(() => validateRadar(bad((r) => { r.sizePx = NaN; })), /sizePx/);
});

test('the radar clears the top-left HUD bars at 375 wide (polish 2026-10-28: it sat 3 px from them)', () => {
  const HUD_BAR_RIGHT = 286, VIEWPORT = 375, MIN_GAP = 8;   // measured at 375 (the name/health bars end at x 286); a reviewer nit on the radar PR
  const left = VIEWPORT - RADAR.marginPx - RADAR.sizePx;
  assert.equal(RADAR.corner, 'top-right');
  assert.ok(left - HUD_BAR_RIGHT >= MIN_GAP, `radar left ${left} leaves ${left - HUD_BAR_RIGHT} px to the bars`);
  assert.ok(RADAR.sizePx >= 60, 'still big enough to read');
});

test('the page ships an empty data icon, so the browser never asks for /favicon.ico (the one intermittent 404)', () => {
  assert.match(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /<link rel="icon" href="data:,">/);
});

test('the radar is on by default and ?radar=off hides it', () => {
  assert.equal(RADAR.on, true);
  assert.equal(radarOn(''), true);
  assert.equal(radarOn('?radar=off'), false);
  assert.equal(radarOn('?x=1&radar=off'), false);
  assert.equal(radarOn('?radar=on'), true);
  assert.equal(radarOn('', { ...RADAR, on: false }), false);
});

test('world to radar: up is where the camera looks (the camera stands behind the hero at +z for yaw 0, so it looks toward -z)', () => {
  const R = RADAR.rangeMetres;
  let p = at(0, -R / 2);   // half the range straight ahead
  near(p.x, 0, 'ahead x'); near(p.y, 0.5 * REACH, 'ahead y'); assert.equal(p.clamped, false);
  p = at(0, R / 2); near(p.y, -0.5 * REACH, 'behind');
  p = at(R / 2, 0); near(p.x, 0.5 * REACH, 'right of a camera looking down -z is +x'); near(p.y, 0, 'right y');
  p = at(-R / 2, 0); near(p.x, -0.5 * REACH, 'left');
});

test('rotation by yaw: turning the camera 180 degrees swings every dot half way round; a quarter turn puts what was ahead on the side', () => {
  const R = RADAR.rangeMetres, a = at(5, -10, 0), b = at(5, -10, Math.PI);
  near(b.x, -a.x, 'x flips'); near(b.y, -a.y, 'y flips');
  near(a.y, (10 / R) * REACH, 'ahead 10 m');
  // yaw +90 degrees: the camera stands at (+1, 0) from the hero and looks along -x, so a thing at -x is dead ahead and a thing at -z is on the camera's right... of a camera facing -x: right = (cos, -sin) = (0, -1)
  const q = at(-10, 0, Math.PI / 2); near(q.x, 0, 'qx'); near(q.y, (10 / R) * REACH, 'qy');
  const r = at(0, -10, Math.PI / 2); near(r.x, (10 / R) * REACH, 'a thing at -z is on the right of a camera looking along -x'); near(r.y, 0, 'ry');
  // the hero's own bearing to a thing minus the yaw is the dot's bearing: a full turn changes nothing
  const t = at(3, 4, 2 * Math.PI); near(t.x, at(3, 4, 0).x, 'full turn x'); near(t.y, at(3, 4, 0).y, 'full turn y');
});

test('range and rim: a dot beyond range is held on the rim ring at its bearing, one inside is not', () => {
  const R = RADAR.rangeMetres, far = at(0, -3 * R), out = at(3 * R, -3 * R);
  assert.equal(far.clamped, true); near(far.x, 0, 'far x'); near(far.y, REACH, 'far y on the rim ring');
  assert.equal(out.clamped, true); near(Math.hypot(out.x, out.y), REACH, 'diagonal on the ring'); near(out.x / out.y, 1, 'bearing kept (ahead and to the right: x and y both +)');
  const just = at(0, -R), over = at(0, -R - 0.001);
  assert.equal(just.clamped, false); assert.equal(over.clamped, true); near(just.y, REACH, 'exactly at range is the ring');
  const behind = at(0, 2 * R); assert.equal(behind.clamped, true); near(behind.y, -REACH, 'a threat behind the hero shows on the bottom of the rim');
  const here = at(0, 0); near(here.x, 0, 'centre x'); near(here.y, 0, 'centre y');
  for (let i = 0; i < 64; i++) { const d = i * 7.3, p = at(Math.sin(i) * d, Math.cos(i) * d, i * 0.37); assert.ok(Math.hypot(p.x, p.y) <= REACH + 1e-9, 'no dot leaves the ring'); }
});

test('a boss is a hostile dot at its live position, the dim dead class while it waits to respawn, and a kind with no row falls to the default', () => {
  assert.equal(classOf(RADAR, 'pitborn', false), 'hostile');
  assert.equal(classOf(RADAR, 'pitborn', true), 'dead');
  assert.equal(classOf(RADAR, 'unknown-kind', false), RADAR.defaultKind);
  assert.equal(classOf({ ...RADAR, kinds: { shopkeeper: 'npc' } }, 'shopkeeper', false), 'npc');
  const spawns = [{ x: 0, z: -6, kind: 'pitborn', deadFor: null }, { x: 28, z: 12, kind: 'pitborn', deadFor: null }, { x: -14, z: 31, kind: 'pitborn', deadFor: 10 }];
  const got = [];
  bossBlips(RADAR, spawns, (i) => (i === 0 ? { x: 1, z: -4 } : undefined), (x, z, c) => got.push([x, z, c]));
  assert.deepEqual(got, [[1, -4, 'hostile'], [28, 12, 'hostile'], [-14, 31, 'dead']]);
});

test('other players come from the presence handle in the pit frame, and none when presence is off', () => {
  const got = [], emit = (x, z, c) => got.push([x, z, c]);
  playerBlips(undefined, 0, { x: 226, z: 47 }, emit);
  playerBlips({}, 0, { x: 226, z: 47 }, emit);
  assert.deepEqual(got, []);
  playerBlips({ remotes: (now) => [{ x: 230 + now, z: 40 }] }, 1, { x: 226, z: 47 }, emit);
  assert.deepEqual(got, [[5, -7, 'player']]);
});

// A fake DOM just big enough for mountRadar: elements with style/append/remove, a canvas whose 2D context records its calls.
function fakeDoc(hidden = false) {
  const calls = [];
  const ctx = new Proxy({}, { get: (_, k) => (k === 'canvas' ? null : (...a) => calls.push([String(k), ...a])), set: (_, k, v) => { calls.push(['set:' + String(k), v]); return true; } });
  const el = (tag) => ({ tag, style: {}, dataset: {}, children: [], attrs: {}, width: 0, height: 0, append(c) { this.children.push(c); }, remove() { this.removed = true; }, setAttribute(k, v) { this.attrs[k] = v; }, getContext: () => ctx });
  const body = el('body');
  return { doc: { createElement: el, body, hidden }, body, calls };
}

test('mount: a non-interactive disc in the corner with the safe area, a canvas, the hero chevron and one dot per blip; nothing is drawn while hidden', () => {
  const { doc, body, calls } = fakeDoc();
  const radar = mountRadar(doc, { each: (emit) => { emit(0, -10, 'hostile'); emit(40, 0, 'player'); emit(0, 0, 'dead'); } }, RADAR, body, 2);
  const box = body.children[0];
  assert.equal(box, radar.element); assert.equal(box.attrs['aria-hidden'], 'true');
  assert.match(box.style.cssText, /pointer-events:none/); assert.match(box.style.cssText, /top:calc\(env\(safe-area-inset-top, 0px\) \+ 10px\)/); assert.match(box.style.cssText, /right:calc\(env\(safe-area-inset-right, 0px\) \+ 10px\)/);
  assert.match(box.style.cssText, /border-radius:50%/);
  const canvas = box.children[0], inner = RADAR.sizePx - 2 * RADAR.rim.widthPx;
  assert.equal(canvas.width, inner * 2);
  radar.frame(0, 0, 0);
  assert.equal(calls.filter((c) => c[0] === 'arc').length, 3, 'one arc per blip');
  assert.equal(calls.filter((c) => c[0] === 'clearRect').length, 1);
  const n = calls.length; doc.hidden = true; radar.frame(1, 1, 1); assert.equal(calls.length, n, 'hidden: no drawing');
  radar.remove(); assert.equal(box.removed, true);
});

test('mount: the dead dot is drawn first (under the live ones) and not at all when the row hides it', () => {
  const order = [];
  const f = fakeDoc(), rows = clone(RADAR);
  const src = { each: (emit) => { emit(0, -10, 'hostile'); emit(0, 10, 'dead'); } };
  let r = mountRadar(f.doc, src, rows, f.body, 1); r.frame(0, 0, 0);
  const styles = f.calls.filter((c) => c[0] === 'set:fillStyle').map((c) => c[1]); order.push(...styles);
  assert.deepEqual(order.slice(-2), [rows.classes.dead.colour, rows.classes.hostile.colour], 'dead first, live on top');
  rows.classes.dead.show = false; const g = fakeDoc(); r = mountRadar(g.doc, src, rows, g.body, 1); r.frame(0, 0, 0);
  assert.equal(g.calls.filter((c) => c[0] === 'arc').length, 1);
});

test('the page wiring is small, presentation only and the sim never imports the radar', () => {
  const main = readFileSync(new URL('../src/client/main.ts', import.meta.url), 'utf8');
  assert.equal((main.match(/radar\??\.frame\(/g) ?? []).length, 1, 'one per-frame call');
  assert.equal((main.match(/mountRadar\(/g) ?? []).length, 1, 'one mount');
  assert.match(main, /radar\?\.frame\(state\.x, state\.z, view\.yaw\)/, 'reads the existing view.yaw accessor');
  assert.match(main, /ZONE && radarOn\(search\)/);
  for (const f of ['duel.ts', 'sim.ts', 'moves.ts', 'match.ts', 'record.ts', 'replay.ts', 'camera.ts', 'free-camera.ts']) {
    let src = ''; try { src = readFileSync(new URL('../src/fight/' + f, import.meta.url), 'utf8'); } catch { continue; }
    assert.doesNotMatch(src, /radar/i, `${f} does not know the radar`);
  }
  const radarSrc = readFileSync(new URL('../src/fight/radar.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(radarSrc, /from '\.\/(duel|sim|combat|camera|free-camera|input)/, 'the radar imports no sim, camera or input');
});
