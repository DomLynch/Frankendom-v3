// Share clip (data/share-clip.json, src/share-clip.ts, docs/share-clip.md): V1's MediaRecorder method on a live buffer of two staggered recorders. Pinned: the rows and their validator, the pure
// helpers (type pick, file name, crop), the stagger (at most two recorders, the older holds lead..2*lead), the kill -> tail -> file -> button -> share/download flow with the V1 traps (a refused share keeps the
// button, a recorder that throws or errors falls back to a still, no recorder at all = a still), the jank guard, privacy (the file name and the telemetry event carry only the boss kind and a length), and the
// tiny main.ts wiring. The real encoder is exercised by the built-game Chromium run (see the PR), not here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFile } from '../src/sim/validate.js';
import { SHARE_CLIP, createShareClip, cropRect, fileName, pickType, safeBoss, validateShareClip } from '../src/share-clip.ts';
import { cleanEvent } from '../src/telemetry-rows.ts';

const ROWS = JSON.parse(readFileSync(new URL('../data/share-clip.json', import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const L = SHARE_CLIP.leadSeconds * 1000, TAIL = SHARE_CLIP.tailSeconds * 1000;

test('the rows validate, and a bad row is refused', () => {
  assert.deepEqual(validateFile('share-clip', ROWS), []);
  validateShareClip(SHARE_CLIP);
  const bad = (f) => { const r = clone(ROWS); f(r); return r; };
  assert.deepEqual(validateFile('share-clip', bad((r) => { r.extra = 1; })), ['share-clip.extra: unknown key']);
  assert.throws(() => validateShareClip(bad((r) => { r.leadSeconds = 0; })), /leadSeconds/);
  assert.throws(() => validateShareClip(bad((r) => { r.width = 721; })), /even/);
  assert.throws(() => validateShareClip(bad((r) => { r.width = 1280; r.height = 720; })), /portrait/);
  assert.throws(() => validateShareClip(bad((r) => { r.types = ['video/avi']; })), /types/);
  assert.throws(() => validateShareClip(bad((r) => { r.watermark.colour = 'white'; })), /colour/);
  assert.throws(() => validateShareClip(bad((r) => { r.button.label = ''; })), /button\.label/);
  assert.throws(() => validateShareClip(bad((r) => { r.file.prefix = 'Has Space'; })), /prefix/);
});

test('default on, no URL flag; V1 numbers: 720x1280, 30 fps, 4 Mbps, mp4 first', () => {
  assert.equal(ROWS.on, true);
  assert.ok(!('query' in ROWS) && !('off' in ROWS), 'no URL flag');
  assert.deepEqual([ROWS.width, ROWS.height, ROWS.fps, ROWS.bitsPerSecond], [720, 1280, 30, 4_000_000]);
  assert.equal(ROWS.types[0], 'video/mp4;codecs=avc1');
});

test('type pick, file name, boss token and the 9:16 crop', () => {
  assert.equal(pickType((t) => t.startsWith('video/webm')), 'video/webm;codecs=vp9,opus');
  assert.equal(pickType((t) => t === 'video/mp4'), 'video/mp4');
  assert.equal(pickType(() => { throw new Error('x'); }), null);
  assert.equal(pickType(() => false), null);
  assert.equal(fileName('video/mp4;codecs=avc1', 'gargantua'), 'frankendom-gargantua.mp4');
  assert.equal(fileName('video/webm', 'arachne'), 'frankendom-arachne.webm');
  assert.equal(fileName('image/png', 'x'), 'frankendom-x.png');
  assert.equal(safeBoss('Minotaur'), 'minotaur');
  assert.equal(safeBoss('../../etc passwd'), 'boss', 'no free text reaches a file name');
  assert.equal(safeBoss(undefined), 'boss');
  const tall = cropRect(390, 844, 720, 1280), wide = cropRect(1920, 1080, 720, 1280);
  assert.ok(Math.abs(tall.w / tall.h - 720 / 1280) < 0.005 && tall.x === 0 && tall.y > 0, 'a taller phone loses rows top and bottom');
  assert.ok(Math.abs(wide.w / wide.h - 720 / 1280) < 0.005 && wide.y === 0 && wide.x > 0, 'a wide canvas loses its sides');
});

// ---- fakes ----
function world({ recorder = true, share = null, throwOnStart = false, hang = false, rows = SHARE_CLIP } = {}) {
  let t = 0;
  const made = [], anchors = [], events = [], shares = [];
  class Rec {
    static isTypeSupported(type) { return type.startsWith('video/mp4'); }
    constructor(stream, opts) { if (throwOnStart) throw new Error('refused'); this.stream = stream; this.opts = opts; this.state = 'inactive'; this.t0 = t; made.push(this); }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.stoppedAt = t; if (hang) return; this.ondataavailable?.({ data: new Blob(['v'.repeat(1000)]) }); this.onstop?.(); }
  }
  const el = (tag) => {
    const o = { tag, style: {}, dataset: {}, listeners: {}, children: [], width: 0, height: 0,
      addEventListener(n, f) { (o.listeners[n] ??= []).push(f); }, append(c) { o.children.push(c); }, remove() { o.removed = true; },
      getContext: () => ({ measureText: () => ({ width: 120 }), drawImage() {}, fillText() {} }),
      captureStream: () => ({ getVideoTracks: () => [{ stop() { o.stopped = true; } }], addTrack() {} }),
      toBlob: (cb) => cb(new Blob(['png-bytes'], { type: 'image/png' })), click() { anchors.push(o); } };
    return o;
  };
  const doc = { createElement: el, head: el('head'), body: el('body') };
  globalThis.HTMLCanvasElement = class { captureStream() {} };
  globalThis.URL.createObjectURL ??= () => 'blob:x';
  const env = { rows, doc, source: { width: 390, height: 844 }, now: () => t, Recorder: recorder ? Rec : undefined,
    nav: share === null ? { share: undefined } : { canShare: () => true, share: async (d) => { shares.push(d); await share(); } },
    audio: () => null, untap() {}, telemetry: { event: (n, f) => events.push([n, f]) } };
  const clip = createShareClip(env);
  const run = (ms, engaged = true, step = 16) => { const end = t + ms; while (t < end) { t += step; clip.frame(engaged); } };
  const alive = () => made.filter((m) => m.state === 'recording');
  const btn = () => doc.body.children.find((c) => c.tag === 'button' && !c.removed);
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return { clip, made, run, alive, btn, flush, doc, events, shares, anchors, now: () => t, setNow: (v) => { t = v; } };
}

test('the stagger: never more than two recorders, started every lead seconds, the older holds lead..2*lead', () => {
  const w = world();
  w.run(100);
  assert.equal(w.alive().length, 1);
  for (let sec = 0; sec < 30_000; sec += 200) { w.run(200); assert.ok(w.alive().length <= 2, `at ${w.now()} ms`); if (w.now() > L + 200) { const age = w.now() - w.alive()[0].t0; assert.ok(age >= L - 100 && age <= 2 * L + 100, `oldest age ${age}`); } }
  const starts = w.made.map((m) => m.t0);
  for (let i = 1; i < starts.length; i++) assert.ok(Math.abs(starts[i] - starts[i - 1] - L) <= 40, 'one new recorder every lead seconds');
  assert.equal(w.made[0].opts.videoBitsPerSecond, 4_000_000);
  assert.equal(w.made[0].opts.mimeType, 'video/mp4;codecs=avc1');
});

test('a kill: one encoder through the tail, then a Share clip button; a tap shares the file with the fixed title and reports clip_shared (boss + seconds)', async () => {
  const w = world({ share: async () => {} });
  w.run(10_300);
  const oldestAge = w.now() - w.alive()[0].t0;
  w.clip.moment('Gargantua');
  assert.equal(w.alive().length, 1, 'the newer recorder is dropped at the kill');
  w.run(TAIL - 100, false);
  assert.equal(w.btn(), undefined, 'no button before the tail has played');
  w.run(300, false); await w.flush();
  assert.equal(w.clip.state, 'ready');
  assert.equal(w.btn().textContent, 'Share clip');
  assert.equal(w.alive().length, 0);
  w.btn().listeners.click[0]();
  await w.flush();
  assert.equal(w.shares.length, 1);
  assert.equal(w.shares[0].files[0].name, 'frankendom-gargantua.mp4');
  assert.equal(w.shares[0].title, 'Frankendom');
  assert.equal(w.events.length, 1);
  assert.equal(w.events[0][0], 'clip_shared');
  assert.deepEqual(Object.keys(w.events[0][1]).sort(), ['boss', 'sec']);
  assert.ok(Math.abs(w.events[0][1].sec - (oldestAge + TAIL) / 1000) < 0.6, `sec ${w.events[0][1].sec}`);
  assert.deepEqual(cleanEvent({ e: 'clip_shared', ...w.events[0][1] }), { e: 'clip_shared', boss: 'gargantua', sec: Math.round(w.events[0][1].sec * 10) / 10 });
});

test('a refused or dismissed share keeps the button for another tap; no share support downloads the file', async () => {
  const refused = world({ share: async () => { const e = new Error('no tap'); e.name = 'NotAllowedError'; throw e; } });
  refused.run(6000); refused.clip.moment('minotaur'); refused.run(TAIL + 300, false); await refused.flush();
  refused.btn().listeners.click[0](); await refused.flush();
  assert.equal(refused.clip.state, 'ready', 'still ready: tap again');
  assert.equal(refused.events.length, 0, 'nothing reported for a share that did not happen');
  const dl = world();
  dl.run(6000); dl.clip.moment('minotaur'); dl.run(TAIL + 300, false); await dl.flush();
  dl.btn().listeners.click[0](); await dl.flush();
  assert.equal(dl.anchors.length, 1);
  assert.equal(dl.anchors[0].download, 'frankendom-minotaur.mp4');
  assert.equal(dl.events[0][0], 'clip_shared');
  assert.equal(dl.btn().textContent, 'Saved');
});

test('a death or a fight that ends without a kill drops the buffer; the next fight starts clean', () => {
  const w = world();
  w.run(5000);
  assert.equal(w.alive().length, 2);
  w.clip.cancel();
  assert.equal(w.alive().length, 0);
  w.run(100, true); assert.equal(w.alive().length, 1);
  w.run(100, false); assert.equal(w.alive().length, 0, 'engaged false with no kill = discarded');
});

test('a tab that slept (a frame gap over a second) restarts the buffer instead of keeping a frozen clip', () => {
  const w = world();
  w.run(5000); assert.equal(w.alive().length, 2);
  w.setNow(w.now() + 5000); w.clip.frame(true);
  assert.equal(w.alive().length, 0);
});

test('no MediaRecorder: a still picture of the moment is offered and shared as a png', async () => {
  const w = world({ recorder: false, share: async () => {} });
  assert.equal(w.clip.mode, 'still');
  w.run(2000); w.clip.moment('arachne'); w.run(TAIL + 300, false); await w.flush();
  assert.equal(w.btn().textContent, 'Share picture');
  w.btn().listeners.click[0](); await w.flush();
  assert.equal(w.shares[0].files[0].name, 'frankendom-arachne.png');
  assert.equal(w.events[0][1].sec, 0);
});

test('a moment with nothing buffered (a Pit result) offers a still; a recorder that throws falls back to a still, never an error', async () => {
  const idle = world({ share: async () => {} });
  idle.clip.moment('pit-result'); idle.run(TAIL + 300, false); await idle.flush();
  assert.equal(idle.btn().textContent, 'Share picture');
  const thrower = world({ throwOnStart: true });
  thrower.run(3000); thrower.clip.moment('minotaur'); thrower.run(TAIL + 300, false); await thrower.flush();
  assert.equal(thrower.made.length, 0);
  assert.equal(thrower.btn().textContent, 'Share picture');
});

test('a recorder that errors mid-clip makes no video: it resolves to the still, never hangs', async () => {
  const w = world();
  w.run(6000); w.alive()[0].onerror?.(); w.clip.moment('minotaur'); w.run(TAIL + 300, false); await w.flush();
  assert.equal(w.btn().textContent, 'Share picture');
});

test('the jank guard: a mean frame interval over the row switches clips off for the visit', () => {
  const w = world();
  w.run(SHARE_CLIP.guard.seconds * 1000 + 1500, true, SHARE_CLIP.guard.maxFrameMs + 40);
  assert.equal(w.clip.state, 'off');
  assert.equal(w.alive().length, 0);
  w.run(2000); assert.equal(w.alive().length, 0, 'stays off');
  const fine = world(); fine.run(SHARE_CLIP.guard.seconds * 1000 + 1500, true, 16);
  assert.notEqual(fine.clip.state, 'off');
});

test('the jank guard keeps measuring after the SECOND encoder starts: fast with one, slow with two switches clips off', () => {
  const w = world();
  w.run(L - 300, true, 16);   // the first window (one encoder) passes
  assert.equal(w.alive().length, 1); assert.notEqual(w.clip.state, 'off');
  w.run(2000, true, 16); assert.equal(w.alive().length, 2, 'the second encoder is running');
  w.run(SHARE_CLIP.guard.seconds * 1000 + 600, true, SHARE_CLIP.guard.maxFrameMs + 30);   // ...and the phone chokes under two
  assert.equal(w.clip.state, 'off');
  assert.equal(w.alive().length, 0);
  const fast = world(); fast.run(L + SHARE_CLIP.guard.seconds * 1000 + 2000, true, 16);
  assert.notEqual(fast.clip.state, 'off', 'a phone that holds the budget with two encoders keeps clips');
});

test('a recorder whose onstop never fires: the watchdog resolves it, "Making clip…" ends in the still picture', async () => {
  const w = world({ hang: true, rows: { ...SHARE_CLIP, stopTimeoutSeconds: 0.05 } });
  w.run(6000); w.clip.moment('minotaur'); w.run(TAIL + 100, false);
  assert.equal(w.btn().textContent, 'Making clip…');
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(w.clip.state, 'ready');
  assert.equal(w.btn().textContent, 'Share picture');
});

test('a second tap while the share sheet is pending does nothing: one share, no download, one event', async () => {
  let release;
  const w = world({ share: () => new Promise((r) => { release = r; }) });
  w.run(6000); w.clip.moment('minotaur'); w.run(TAIL + 300, false); await w.flush();
  const click = w.btn().listeners.click[0];
  click(); click(); click();
  await w.flush();
  assert.equal(w.shares.length, 1);
  assert.equal(w.btn().disabled, true);
  release(); await w.flush();
  assert.equal(w.shares.length, 1); assert.equal(w.anchors.length, 0); assert.equal(w.events.length, 1);
});

test('the button sits on the bottom edge, below the cut hint box (pickup.json safe.bottomFrac), never mid-screen', () => {
  const pickup = JSON.parse(read('../data/pickup.json')), src = read('../src/share-clip.ts');
  assert.ok(ROWS.button.bottomPx <= 24, 'a few px above the bottom edge');
  assert.match(src, /bottom:calc\(\$\{B\.bottomPx\}px \+ env\(safe-area-inset-bottom/);
  assert.ok(!/top:\$\{|left:50%;top/.test(src));
  assert.ok(pickup.safe.bottomFrac >= 0.1, 'the hint keeps off the bottom band the button lives in');
});

test('a new fight clears the offer; the button hides on its own after hideSeconds', async () => {
  const w = world({ share: async () => {} });
  w.run(6000); w.clip.moment('minotaur'); w.run(TAIL + 300, false); await w.flush();
  assert.ok(w.btn());
  w.run(500, true);
  assert.equal(w.btn(), undefined, 'a new fight began');
  const h = world(); h.run(6000); h.clip.moment('minotaur'); h.run(TAIL + 300, false); await h.flush();
  h.run(SHARE_CLIP.button.hideSeconds * 1000 + 500, false);
  assert.equal(h.btn(), undefined);
});

test('the page wiring is small: one import, one mount, one frame call, the kill and death hooks; the file holds no player text or ids', () => {
  const main = read('../src/client/main.ts');
  assert.equal((main.match(/shareClip/g) ?? []).length, 4, 'four mentions: the mount, the frame call, the kill and the death hooks');
  assert.match(main, /import \{ mountShareClip \} from '\.\.\/share-clip\.ts'/);
  assert.match(main, /shareClip\.frame\(engaged\)/);
  assert.match(main, /if \(name === 'boss_kill'\) shareClip\.moment\(/);
  assert.match(main, /reportFight\('boss_kill', current\)/, 'the telemetry call is untouched');
  const src = read('../src/share-clip.ts');
  assert.ok(!/localStorage|userId|document\.cookie|location\./.test(src), 'no user data is read');
  assert.match(src, /v3:clip-moment/);
  assert.ok(!/URLSearchParams|location\.search/.test(src), 'no URL flag');
});
