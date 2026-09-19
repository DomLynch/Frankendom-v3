// Original modal bell shared by the asset builder and the network-independent opening cue.
export const BELL_SECONDS = 3.9;
export function bellSamples(rate: number): Float32Array {
  const data = new Float32Array(Math.round(BELL_SECONDS * rate));
  for (const [hz, gain, decay] of [[110, .8, 1.7], [331, .8, 1.5], [552, .45, 1.1], [763, .12, .7], [1136, .08, .4]]) {
    for (let i = 0; i < data.length; i++) { const t = i / rate; data[i] += gain * Math.sin(t * 2 * Math.PI * hz) * Math.exp(-5 * t / (decay * 1.5)); }
  }
  let peak = 0, square = 0;
  for (let i = 0; i < data.length; i++) {
    data[i] *= Math.min(1, i / Math.round(.003 * rate), (data.length - i - 1) / Math.round(.45 * rate));
    peak = Math.max(peak, Math.abs(data[i])); square += data[i] ** 2;
  }
  const gain = Math.min(.5 / peak, .12 / Math.sqrt(square / data.length));
  return data.map(v => v * gain);
}
