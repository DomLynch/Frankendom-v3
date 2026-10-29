// The audio timings and cue rows (data-layer shift, audio): src/audio/{arena,bell,keep,gate}.ts read their numbers from src/audio/audio-feel-defs.json.
// These tests pin the BEHAVIOUR byte-for-byte against the code before the move: a recorded trace of every Web Audio call the arena makes for a scripted match, the bell's synthesised samples,
// and the keep-awake clip's bytes. Sound itself can only be judged by ear in the game; equal values are proved here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createArenaAudio } from '../src/audio/arena.ts';
import { prepareBell, preparedBell, BELL_RATE } from '../src/audio/bell.ts';
import { createKeep } from '../src/audio/keep.ts';
import { playGate } from '../src/audio/gate.ts';
import SOUND from '../data/sound.json' with { type: 'json' };

const sha = (s) => createHash('sha256').update(s).digest('hex');

// A recording Web Audio stub: every call and every AudioParam write goes into `log` with its arguments.
function recorder() {
  const log = []; let ids = 0;
  const param = (id, name) => new Proxy({ value: 0 }, { get: (t, k) => k === 'value' ? t.value : (...a) => { log.push([id, name, k, ...a]); }, set: (t, k, v) => { if (k === 'value') { t.value = v; log.push([id, name, 'set', v]); } return true; } });
  const node = (kind) => { const id = ++ids; const o = { id, connect() { log.push([id, kind, 'connect']); }, disconnect() { log.push([id, kind, 'disconnect']); }, start: (...a) => log.push([id, kind, 'start', ...a]), stop: (...a) => log.push([id, kind, 'stop', ...a]), gain: param(id, 'gain'), playbackRate: param(id, 'rate') }; return o; };
  const context = { currentTime: 0, createBufferSource: () => node('src'), createGain: () => node('gain'), createBuffer: (c, n, r) => { log.push(['buf', c, n, r]); return { getChannelData: () => new Float32Array(n), duration: n / r }; }, decodeAudioData: async () => ({ duration: 46 }) };
  return { log, context };
}

test('the arena: a scripted match makes exactly the same Web Audio calls as before the rows', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  try {
    const { log, context } = recorder();
    let t = 100;
    const arena = createArenaAudio(context, { dest: 1 }, () => t, () => new Float32Array(480));
    await arena.ready();
    // a deterministic script: ticks of 50 ms over several matches, with every kind of event the crowd reacts to
    let s = 12345; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const kinds = [[], [], [], [{ type: 'Hit', target: 1, move: 'light-1' }], [{ type: 'Hit', target: 0, charged: true }], [{ type: 'Parried' }], [{ type: 'GuardBroken' }], [{ type: 'Blocked' }], [{ type: 'Hit', target: 1, move: 'heavy-2' }], [{ type: 'Hit', target: 1, move: 'riposte' }]];
    for (let match = 1; match <= 3; match++) {
      for (let i = 0; i < 700; i++) {
        t += 0.05;
        const events = kinds[Math.floor(rnd() * kinds.length)];
        const loiter = i % 200 < 60 ? Math.min(1, (i % 200) / 40) : 0;
        arena.update(events, { match, ended: false, tick: i, opponent: undefined, loiter }, i === 3);
      }
      arena.update([{ type: 'Killed' }], { match, ended: false, tick: 9999 }, false);
    }
    arena.update([], { match: 4, ended: true, tick: 0 }, false);
    // two more matches without the arena bank: only the fallback bell, drawn once each
    assert.ok(log.length > 1000, `a long trace (${log.length})`);
    console.log('ARENA_TRACE', log.length, sha(JSON.stringify(log)));
    assert.equal(sha(JSON.stringify(log)), GOLDEN.arena);
  } finally { globalThis.fetch = realFetch; }
});

test('the fallback bell (no bank): one bell, the idle-built samples, the same calls', () => {
  const { log, context } = recorder(); let t = 5;
  const arena = createArenaAudio(context, { dest: 1 }, () => t, () => new Float32Array(Array.from({ length: 64 }, (_, i) => Math.sin(i))));
  arena.update([], { match: 1, ended: false, tick: 0 }, true);
  console.log('BELL_FALLBACK', sha(JSON.stringify(log)));
  assert.equal(sha(JSON.stringify(log)), GOLDEN.fallbackBell);
});

test('the bell: the synthesised samples are bit-identical', async () => {
  await prepareBell();
  const samples = preparedBell();
  assert.equal(samples.length, Math.round(2.5 * BELL_RATE));
  const h = createHash('sha256').update(Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)).digest('hex');
  console.log('BELL_SAMPLES', h);
  assert.equal(h, GOLDEN.bellSamples);
});

test('keep: the silent clip bytes follow the sound.json row', async () => {
  let blob;
  globalThis.URL.createObjectURL = (b) => { blob = b; return 'blob:x'; };
  class FakeAudio { constructor() { this.paused = true; } setAttribute() {} play() { return Promise.resolve(); } }
  globalThis.Audio = FakeAudio;
  try {
    const keep = createKeep(SOUND.keep); keep.play();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    console.log('KEEP', bytes.length, sha(Buffer.from(bytes)));
    assert.equal(bytes.length, 44 + SOUND.keep.samples);
    assert.equal(sha(Buffer.from(bytes)), GOLDEN.keep);
  } finally { delete globalThis.Audio; }
});

test('gate: a started beat that is skipped fades out over the gateCut row plus 10 ms', () => {
  const { log, context } = recorder();
  const g = playGate(context, { duration: 1 }, { d: 1 }, 0.5, 0);
  context.currentTime = 0.3;
  g.stop();
  console.log('GATE', sha(JSON.stringify(log)));
  assert.equal(sha(JSON.stringify(log)), GOLDEN.gate);
});

// Recorded on data/gate-widen 85e3ab87, before any audio value moved to a row.
const GOLDEN = {
  arena: '328324f91efcf0aaf2b5747bdf977c8fb0fd5ab3abc7f7241a39dc5afa99b8e4',
  fallbackBell: '6dc7febb5e101f8f6cfc1291f939041de9a4169c32a9346d8acd1986a4561469',
  bellSamples: '4931fc76a8ccae5fe2f50f68d6ba86dac5b9b85274cd2082a2c6ff623ec8bc45',
  keep: '2eeb55e08e1a51af2003fabdfc8572539de6c3f0fa1c182a5b3d3a4806b84db5',
  gate: '990deb20b3dc4290a3bae44b82c6c831782c0d07fc9f621a3f88506f8d7f4efd',
};
