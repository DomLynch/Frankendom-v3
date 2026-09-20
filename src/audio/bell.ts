// Original modal bell shared by the asset builder and the network-independent opening cue.
// Owner 2026-09-20: a 3 s bell at "double the loudness". A handset speaker plays nothing at the 110 Hz fundamental, yet that
// partial set the sample peak, so the level now lives in the audible partials: fundamental reduced, partials de-phased (phases
// found by search for the lowest first-cycle crest) and gently saturated. Measured: +6.3 dB in the phone band (> 300 Hz) over
// the .66 / 3.9 s bell at the same −8 dBFS peak with the .80 play gain in arena.ts, which keeps the returning-player fallback
// stacked with the draw swing under scripts/bell-start-check.mjs's −6 dBFS headroom.
export const BELL_SECONDS = 3;
const PARTIALS: [hz: number, gain: number, decay: number, phase: number][] = [[110, .3, 1.7, 0], [331, .9, 1.5, 1.26], [336, .35, 1.5, 4.19], [552, .55, 1.1, 4.77], [763, .15, .7, 3.38], [1136, .1, .4, 4.91]];   // 336 beats against 331 at 5 Hz: the warble of a big cast bell
const DRIVE = 1, TREMOLO = { rate: 5.5, depth: .3, from: .25 };   // owner: "a vibrate effect" — an amplitude wobble that grows in after the strike
// Owner 2026-09-20: "some vibrato, so it wobbles a bit, like a monk striking a big bronze gong". A struck gong's pitch is not fixed:
// the sheet flexes and the partials wander, a slow wow that sets in after the strike. Each partial's frequency now swings ±1.5 %
// at 4.2 Hz (against the 5.5 Hz tremolo, so the two never lock into one metronome), growing in over .3 s; the phase is accumulated
// per sample so the sweep stays continuous. The upper partials also bloom: they open up over .12 s after the strike instead
// of sounding at once, the swell a gong has and a bell does not.
const VIBRATO = { rate: 4.2, depth: .015, from: .3 }, BLOOM = { above: 500, seconds: .12 };
export function bellSamples(rate: number): Float32Array {
  const data = new Float32Array(Math.round(BELL_SECONDS * rate));
  for (const [hz, gain, decay, phase] of PARTIALS) {
    let angle = phase;
    for (let i = 0; i < data.length; i++) {
      const t = i / rate, wobble = 1 + VIBRATO.depth * Math.min(1, t / VIBRATO.from) * Math.sin(2 * Math.PI * VIBRATO.rate * t);
      const bloom = hz > BLOOM.above ? 1 - .6 * Math.exp(-t / BLOOM.seconds) : 1;
      data[i] += gain * bloom * Math.sin(angle) * Math.exp(-5 * t / (decay * 1.5));
      angle += 2 * Math.PI * hz * wobble / rate;
    }
  }
  for (let i = 0; i < data.length; i++) { const t = i / rate, grow = Math.min(1, t / TREMOLO.from); data[i] *= 1 - TREMOLO.depth * grow * (1 - Math.cos(2 * Math.PI * TREMOLO.rate * t)) / 2; }
  let loudest = 0; for (const v of data) loudest = Math.max(loudest, Math.abs(v));
  for (let i = 0; i < data.length; i++) data[i] = Math.tanh(data[i] / loudest * DRIVE) / Math.tanh(DRIVE) * loudest;   // cast-metal warmth, and a lower crest for the same ring
  let peak = 0, square = 0;
  for (let i = 0; i < data.length; i++) {
    data[i] *= Math.min(1, i / Math.round(.003 * rate), (data.length - i - 1) / Math.round(.45 * rate));
    peak = Math.max(peak, Math.abs(data[i])); square += data[i] ** 2;
  }
  const gain = Math.min(.5 / peak, .12 / Math.sqrt(square / data.length));
  return data.map(v => v * gain);
}
