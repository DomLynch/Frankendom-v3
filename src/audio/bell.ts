// Original modal bell shared by the asset builder and the network-independent opening cue.
// Owner 2026-09-20: a 3 s bell at "double the loudness". A handset speaker plays nothing at the 110 Hz fundamental, yet that
// partial set the sample peak, so the level now lives in the audible partials: fundamental reduced, partials de-phased (phases
// found by search for the lowest first-cycle crest) and gently saturated. Measured: +6.3 dB in the phone band (> 300 Hz) over
// the .66 / 3.9 s bell at the same −8 dBFS peak with the .80 play gain in arena.ts, which keeps the returning-player fallback
// stacked with the draw swing under scripts/bell-start-check.mjs's −6 dBFS headroom.
export const BELL_SECONDS = 3;
const PARTIALS: [hz: number, gain: number, decay: number, phase: number][] = [[110, .3, 1.7, 0], [331, .9, 1.5, 2.30], [552, .55, 1.1, 1.28], [763, .15, .7, 4.59], [1136, .1, .4, 5.88]];
const DRIVE = 1;
export function bellSamples(rate: number): Float32Array {
  const data = new Float32Array(Math.round(BELL_SECONDS * rate));
  for (const [hz, gain, decay, phase] of PARTIALS) {
    for (let i = 0; i < data.length; i++) { const t = i / rate; data[i] += gain * Math.sin(t * 2 * Math.PI * hz + phase) * Math.exp(-5 * t / (decay * 1.5)); }
  }
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
