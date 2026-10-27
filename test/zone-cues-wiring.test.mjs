// The zone's sound rows reach the sound (follow-up to #123, reviewer finding: the pure gate was tested, the wiring was not).
// Through the REAL createFeedback with a stub host (a fake context that records every source started; no Web Audio in Node): the opening bell is gated at the arena argument (feedback.ts),
// a 'once' bell spends its token only when the arena really rang it, the sprite cue list is filtered by the gate (draw sting, kill cheer), and with no gate (?postkill=v1) everything plays as before.
// main.ts and hud.ts cannot run in Node, so the page wiring (the rows handed to the sound, the validated load, the kill toast) is pinned on comment-stripped source text; each pin is proved to
// bite by removing the wiring from the text and checking it no longer matches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFeedback } from '../src/fight/sound/feedback.ts';
import { BELL_RATE } from '../src/audio/bell.ts';
import { zoneSoundRows } from '../src/audio/zone-cues.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const SOUND = JSON.parse(read('../data/sound.json')), clone = (x) => JSON.parse(JSON.stringify(x));
const rowsWith = (cues) => ({ ...clone(SOUND.zone), cues: { ...SOUND.zone.cues, ...cues } });

// A context that accepts every call and records the buffer sources it is asked to start.
function stubHost() {
  const started = [];
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} });
  const node = (extra = {}) => { const n = { connect: (x) => x ?? n, disconnect() {}, start() {}, stop() {}, gain: param(), frequency: param(), Q: param(), detune: param(), playbackRate: { value: 1 }, ...extra }; return n; };
  const buffer = (channels, length, rate) => ({ numberOfChannels: channels, length, sampleRate: rate, duration: length / rate, rate, getChannelData: () => new Float32Array(length) });
  const context = {
    state: 'running', sampleRate: 48000, currentTime: 0, destination: node(),
    createBuffer: buffer,
    createBufferSource: () => { const s = node(); s.start = () => { started.push(s); }; return s; },
    createGain: () => node(), createWaveShaper: () => node(), createDynamicsCompressor: () => node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    createConvolver: () => node(), createBiquadFilter: () => node(), createOscillator: () => node(),
  };
  const clock = { t: 0 };
  // The sprite's rate is not the bell's, so the bell's sources are told apart from the sprite's.
  return { host: { context, now: () => clock.t, seed: 7, sprite: buffer(1, 44100, 44100) }, clock, bells: () => started.filter((s) => s.buffer?.rate === BELL_RATE).length };
}
// A feedback on the stub host with the zone rows (null = no gate, the single fight). `tick` rises so every call is a new frame.
function rig(rows) {
  const { host, clock, bells } = stubHost(), fb = createFeedback(host);
  fb.zoneCues(rows); fb.unlock();
  let tick = 0;
  const heard = () => Number(fb.state().split(' ').pop());
  const update = (events, frame, presentation) => { clock.t += 20; tick++; fb.update(events.map((e) => ({ tick, ...e })), presentation, { ended: false, tick, ...frame }); };
  const engage = (match) => update([{ type: 'ActionStarted', action: 'draw', actor: 0 }], { match, drawing: true });
  return { fb, heard, bells, engage, update };
}
const KILL = { finish: { victim: 1, location: 'torso', move: 'light_right', heading: 0 }, weapons: ['sword', 'sword'], gore: true };

// Must run first: nothing has awaited the bell's idle build yet, so the arena has no bell to ring.
test("a 'once' bell is not spent on a bell that made no sound: it rings later, once", async () => {
  const r = rig(rowsWith({ bell: 'once' }));
  r.update([], { match: 0 });
  r.engage(1);
  assert.equal(r.bells(), 0, 'the bell is not built yet, so the arena rang nothing');
  await r.fb.ready();
  r.engage(2); r.engage(3); r.engage(4);
  assert.equal(r.bells(), 1, 'the unspent token rings once on the first engagement that really can, and never again');
});

test('the bell: once across three engagements, off never, on every time, no gate (?postkill=v1) every time', async () => {
  const count = async (rows) => { const r = rig(rows); r.update([], { match: 0 }); await r.fb.ready(); r.engage(1); r.engage(2); r.engage(3); return r.bells(); };
  assert.equal(await count(rowsWith({ bell: 'once' })), 1);
  assert.equal(await count(rowsWith({ bell: 'off' })), 0);
  assert.equal(await count(rowsWith({ bell: 'on' })), 3);
  assert.equal(await count(null), 3, 'the single fight rings on every match, exactly as before');
  assert.equal(await count(clone(SOUND.zone)), 0, 'the shipped zone rows are silent on the bell');
});

test('the draw sting: dropped in the zone, played in the single fight; a hit is never gated', async () => {
  const draws = (rows) => { const r = rig(rows); r.engage(1); return r.heard(); };
  assert.equal(draws(null), 1, 'no gate: the sprite draw cue plays');
  assert.equal(draws(clone(SOUND.zone)), 0, 'the zone drops it');
  assert.equal(draws(rowsWith({ draw: 'on' })), 1);
  const hits = (rows) => { const r = rig(rows); r.update([{ type: 'Hit', actor: 0, target: 1, move: 'light_right' }], { match: 1 }); return r.heard(); };
  assert.equal(hits(clone(SOUND.zone)), hits(null));
  assert.ok(hits(null) >= 1);
});

test('the kill: the crowd cheer is dropped in the zone, the body fall and dying voice stay, the single fight cheers', () => {
  const kill = (rows) => { const r = rig(rows); r.update([{ type: 'Killed', actor: 0, target: 1, move: 'light_right', location: 'torso', heading: 0 }], { match: 1, ended: true }, KILL); return r.heard(); };
  const plain = kill(null), zone = kill(clone(SOUND.zone));
  assert.ok(plain >= 3, 'the single fight plays the death cues');
  assert.equal(plain - zone, 1, 'the zone drops exactly the crowd cheer');
  assert.ok(zone >= 2, 'the fall and the voice remain');
  assert.equal(kill(rowsWith({ crowd_cheer: 'on' })), plain);
});

test('a missing or bad zone row throws at load (a toast that never clears is not silent)', () => {
  assert.equal(zoneSoundRows(clone(SOUND.zone)).toastSeconds, SOUND.zone.toastSeconds);
  const without = (f) => { const z = clone(SOUND.zone); f(z); return z; };
  assert.throws(() => zoneSoundRows(without((z) => { delete z.toastSeconds; })), /toastSeconds/);
  assert.throws(() => zoneSoundRows(without((z) => { z.toastSeconds = '3'; })), /toastSeconds/);
  assert.throws(() => zoneSoundRows(without((z) => { delete z.cues.bell; })), /cues\.bell/);
  assert.throws(() => zoneSoundRows(undefined), /sound\.zone/);
});

// Source pins for the page wiring that cannot run in Node. Line comments are stripped first so a comment cannot satisfy a pin.
const code = (p) => read(p).replace(/(^|\s)\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '');
const PINS = [
  ['../src/client/main.ts', 'the rows are validated and read only when the zone loop is on', /const ZONE_SOUND\b[^=\n]*=\s*ZONE\s*\?\s*zoneSoundRows\(SOUND\.zone\)\s*:\s*null/],
  ['../src/client/main.ts', 'the rows are handed to the sound', /feedback\.zoneCues\(ZONE_SOUND\)/],
  ['../src/client/main.ts', 'the HUD is told when the kill toast is over', /toastOver:\s*heroStands\(\)\s*&&\s*toastOver\(ZONE_SOUND,\s*view\.finishPhase\(\)\.age\)/],
  ['../src/fight/hud.ts', 'the HUD clears the kill line when told', /view\.zone\s*\?\s*\(view\.toastOver\s*\?\s*''\s*:\s*line\)/],
  ['../src/fight/sound/feedback.ts', 'the bell argument asks the gate, and the token is spent on a real ring', /zoneGate\?\.peek\('bell'\)\s*\?\?\s*true[\s\S]*?arenaAudio\.bells\(\)\s*>\s*rung\)\s*zoneGate\?\.spend\('bell'\)/],
  ['../src/fight/sound/feedback.ts', 'the sprite cue list is filtered by the gate', /for \(const cue of cuesFor\([^)]*\)\) \{ if \(zoneGate && !zoneGate\.allow\(cue\.name\)\) continue;/],
];
for (const [file, what, re] of PINS) {
  test(`pin: ${what} (${file.split('/').pop()})`, () => {
    const src = code(file);
    assert.match(src, re, 'the wiring is missing');
    const first = src.match(re)[0];
    assert.doesNotMatch(src.replace(first, ''), re, 'removing the wiring must leave no match: the pin bites');
  });
}
test('pin: a comment alone cannot satisfy a pin', () => {
  const fake = '// feedback.zoneCues(ZONE_SOUND)\nconst x = 1;';
  assert.doesNotMatch(fake.replace(/(^|\s)\/\/.*$/gm, '$1'), PINS[1][2]);
});
