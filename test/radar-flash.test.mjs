// The radar's kill flash (data/radar.json flash, src/fight/radar.ts): after a boss falls the live red dots pulse yellow for 0.6 s every 3 s until the next fight begins.
// Pins the timing (pure), the validator, the draw (a fake canvas: idle, mid-pulse, between pulses, stopped, near and dead dots) and the page wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RADAR, flashGlow, flashPhase, flashes, mountRadar, validateRadar } from '../src/fight/radar.ts';

const ROWS = JSON.parse(readFileSync(new URL('../data/radar.json', import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} vs ${b}`);
const F = RADAR.flash;

function fakeDoc() {
  const calls = [];
  const ctx = new Proxy({}, { get: (_, k) => (k === 'canvas' ? null : (...a) => calls.push([String(k), ...a])), set: (_, k, v) => { calls.push(['set:' + String(k), v]); return true; } });
  const el = (tag) => ({ tag, style: {}, dataset: {}, children: [], attrs: {}, width: 0, height: 0, append(c) { this.children.push(c); }, remove() { this.removed = true; }, setAttribute(k, v) { this.attrs[k] = v; }, getContext: () => ctx });
  const body = el('body');
  return { doc: { createElement: el, body, hidden: false }, body, calls };
}

test('flash rows: 0.6 s pulse every 3 s, yellow, on by default; a bad row is refused', () => {
  assert.equal(F.on, true); assert.equal(F.periodSeconds, 3); assert.equal(F.pulseSeconds, 0.6); assert.match(F.colour, /^#[0-9a-f]{6}$/i);
  const bad = (f) => { const r = clone(ROWS); f(r.flash); return r; };
  assert.throws(() => validateRadar(bad((f) => { f.pulseSeconds = 3; })), /shorter than periodSeconds/);
  assert.throws(() => validateRadar(bad((f) => { f.colour = 'yellow'; })), /flash\.colour/);
  assert.throws(() => validateRadar(bad((f) => { f.on = 'yes'; })), /flash\.on/);
  assert.throws(() => validateRadar(bad((f) => { f.periodSeconds = 0; })), /periodSeconds/);
  assert.throws(() => validateRadar(bad((f) => { f.ringAlpha = 2; })), /ringAlpha/);
  assert.throws(() => validateRadar(bad((f) => { f.stopWithinMetres = -1; })), /stopWithinMetres/);
});

test('flash timing: on for the first 0.6 s of every 3 s from the kill, off between, repeating; a negative age is off', () => {
  near(flashPhase(F, 0), 0, 'starts at the kill'); near(flashPhase(F, 0.3), 0.5, 'mid pulse'); near(flashPhase(F, 0.599), 0.599 / 0.6, 'end of pulse');
  assert.equal(flashPhase(F, 0.6), -1); assert.equal(flashPhase(F, 1.5), -1); assert.equal(flashPhase(F, 2.999), -1);
  near(flashPhase(F, 3.3), 0.5, 'second pulse'); near(flashPhase(F, 30.3), 0.5, 'the eleventh pulse'); assert.equal(flashPhase(F, 31.5), -1);
  assert.equal(flashPhase(F, -1), -1); assert.equal(flashPhase(F, NaN), -1);
  assert.equal(flashPhase({ ...F, on: false }, 0.3), -1, 'the row can turn it off');
  near(flashGlow(0), 0, 'glow 0 at start'); near(flashGlow(0.5), 1, 'glow 1 mid'); near(flashGlow(1), 0, 'glow 0 at end'); assert.equal(flashGlow(-1), 0);
});

test('flash stops near the dot: a dot within stopWithinMetres of the hero does not pulse', () => {
  assert.equal(flashes(F, F.stopWithinMetres + 0.1), true); assert.equal(flashes(F, F.stopWithinMetres), false); assert.equal(flashes(F, 0), false);
  assert.equal(flashes({ ...F, on: false }, 100), false);
});

test('mount: idle has no yellow; armed and mid-pulse the far hostile dot gets the wash and ring; between pulses and after stop it is red only; dead and near dots never pulse', () => {
  const rows = clone(RADAR), yellow = rows.flash.colour;
  const src = { each: (emit) => { emit(0, -20, 'hostile'); emit(0, 20, 'dead'); emit(0, -2, 'hostile'); } };   // the last is 2 m from the hero: inside stopWithinMetres
  const run = (arm, r0 = rows) => {
    const f = fakeDoc(), r = mountRadar(f.doc, src, r0, f.body, 1); if (arm) arm(r); r.frame(0, 0, 0);
    return { r, arcs: f.calls.filter((c) => c[0] === 'arc').length, strokes: f.calls.filter((c) => c[0] === 'stroke').length, yellows: f.calls.filter((c) => c[0] === 'set:fillStyle' && c[1] === yellow).length };
  };
  const idle = run(null); assert.deepEqual([idle.arcs, idle.strokes, idle.yellows, idle.r.flashing, idle.r.flashPhase], [3, 0, 0, false, -1]);
  const on = run((r) => r.armFlash(performance.now() - 300)); assert.equal(on.r.flashing, true); assert.ok(Math.abs(on.r.flashPhase - 0.5) < 0.1, `phase ${on.r.flashPhase}`);
  assert.deepEqual([on.arcs, on.strokes, on.yellows], [5, 1, 1], 'one far hostile dot gets a wash and a ring; the dead and the near one do not');
  const off = run((r) => r.armFlash(performance.now() - 1500)); assert.equal(off.r.flashing, true); assert.deepEqual([off.arcs, off.yellows], [3, 0], 'between pulses: red only');
  const stopped = run((r) => { r.armFlash(performance.now() - 300); r.stopFlash(); }); assert.deepEqual([stopped.arcs, stopped.r.flashing], [3, false]);
  const re = run((r) => { r.armFlash(performance.now() - 1500); r.armFlash(performance.now() - 300); }); assert.equal(re.yellows, 1, 'a second kill restarts the rhythm');
  const rowsOff = clone(rows); rowsOff.flash.on = false;
  const disabled = run((r) => r.armFlash(performance.now() - 300), rowsOff); assert.deepEqual([disabled.r.flashing, disabled.arcs], [false, 3]);
});

test('flash wiring: armed when the kill is marked (not with another boss on him), stopped once engaged; no new link flag; no string or array building in the dot path', () => {
  const main = readFileSync(new URL('../src/client/main.ts', import.meta.url), 'utf8');
  assert.match(main, /spawns = kill\(spawns, current\); if \(!attackers\.some\(\(a\) => !a\.dead\)\) radar\?\.armFlash\(\)/);
  assert.match(main, /if \(engaged\) radar\?\.stopFlash\(\);/);
  assert.equal(RADAR.query, 'radar', 'the only link switch is still ?radar=off');
  const src = readFileSync(new URL('../src/fight/radar.ts', import.meta.url), 'utf8'), dot = src.slice(src.indexOf('const dot ='), src.indexOf('return {\n    element'));
  assert.ok(dot.length > 200);
  assert.doesNotMatch(dot, /rgba\(|`|\+ '|\[\.\.\.|\.map\(|\.filter\(/);
});
