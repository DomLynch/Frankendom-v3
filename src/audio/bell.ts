// Original modal bell shared by the asset builder and the network-independent opening cue.
// Owner 2026-09-20: a 3 s bell at "double the loudness". A handset speaker plays nothing at the 110 Hz fundamental, yet that
// partial set the sample peak, so the level now lives in the audible partials: fundamental reduced, partials de-phased (phases
// found by search for the lowest first-cycle crest) and gently saturated. Measured: +6.3 dB in the phone band (> 300 Hz) over
// the .66 / 3.9 s bell at the same −8 dBFS peak with the .80 play gain in arena.ts, which keeps the returning-player fallback
// stacked with the draw swing under scripts/bell-start-check.mjs's −6 dBFS headroom.
import { audioRule, bloomRules } from '../fight/sound/audio-rules.ts';
import { BELL_PARTIALS, feel } from './audio-feel.ts';
const BELL_SECONDS = audioRule('bellSeconds');   // owner 2026-09-21 13:15: 2.5 s (was 3); the taper keeps its endpoint, 75 % quieter at the end
// Owner 2026-09-20, 23:15: "use this sound" — a Tibetan gong (a shop's demo clip, not licensed for reuse, so it is the target and
// not the asset). Measured from the clip 0.3–1.3 s after the strike: prime pair 251 / 267 Hz (their 16 Hz beat is the shimmer),
// undertone 165 Hz, upper partials 362 / 526 / 613 / 777 Hz at −4…−6 dB; the level swells for ~1.5 s after the strike and then
// holds within 3 dB for six seconds. Voiced here as: long decays (the ring barely falls inside 4 s), a 1.2 s bloom on
// everything above the prime, a mild pitch vibrato for the wobble, gentle drive (the heavier drive read as "worse").
const PARTIALS = BELL_PARTIALS.map((p): [hz: number, gain: number, decay: number, phase: number] => [p.hz, p.gain, p.decay, p.phase]);   // rows in audio-feel-defs.json (bellPartials)
const B = {   // the bell's synthesis numbers, rows in audio-feel-defs.json
  bloomDepth: feel('bellBloomDepth'), liftDecay: feel('bellLiftDecay'), driveDecay: feel('bellDriveDecay'), ringK: feel('bellRingDecayK'), ringScale: feel('bellRingDecayScale'),
  thudSeed: feel('bellThudSeed'), thudSeconds: feel('bellThudSeconds'), thudLo: feel('bellThudLoHz'), thudHi: feel('bellThudHiHz'), thudAttack: feel('bellThudAttack'), thudDecay: feel('bellThudDecay'),
  ln1000: feel('bellDecayLn1000'), thumpSeconds: feel('bellThumpSeconds'), thumpHz: feel('bellThumpHz'), thumpSag: feel('bellThumpSag'), thumpSagTau: feel('bellThumpSagTau'), thumpDecay: feel('bellThumpDecay'),
  fadeIn: feel('bellFadeIn'), fadeOut: feel('bellFadeOut'), peakCap: feel('bellPeakCap'), rmsCap: feel('bellRmsCap'), idleTimeout: feel('bellIdleTimeout'),
};
const DRIVE = audioRule('bellDrive');
// Owner 2026-09-21 12:40: "louder at the start, more of an impact for the first second, then taper off" — from three candidates he
// chose the padded-mallet strike, "toned down: keep the original and 50 % of the new sound". So, at half of candidate A: the
// partials open 2.1× louder and settle over the first second, a felt thud (low broadband burst) and a sagging low thump mark the
// strike, and the first second is saturated a little harder for density. The ring and the wobble after 1 s are the live bell's.
const STRIKE = { lift: feel('bellStrikeLift'), seconds: feel('bellStrikeSeconds'), thud: feel('bellStrikeThud'), thump: feel('bellStrikeThump'), drive: feel('bellStrikeDrive') };
const TAPER = feel('bellTaperLoss') / BELL_SECONDS;   // amplitude lost per second, on top of the partials' own decay: 75 % gone by the end (owner), i.e. 30 %/s at 2.5 s
const mulberry = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// One-pole pair for the felt thud's band (80–900 Hz): a low-pass then a high-pass, both first order — enough for a thud.
const band = (x: Float32Array, rate: number, lo: number, hi: number) => { const a = Math.exp(-2 * Math.PI * hi / rate), b = Math.exp(-2 * Math.PI * lo / rate); let l = 0, h = 0, p = 0; return x.map(v => { l = a * l + (1 - a) * v; const y = b * (h + l - p); p = l; h = y; return y; }); };
const VIBRATO = { rate: feel('bellVibratoRate'), depth: feel('bellVibratoDepth'), from: feel('bellVibratoFrom'), until: BELL_SECONDS + feel('bellVibratoUntilExtra'), fade: feel('bellVibratoFade') }, BLOOM = bloomRules();   // the swell: partials above the prime open over ~1.2 s (3 τ)
const wobbleAt = (t: number, w: { from: number; until: number; fade: number }) => Math.min(1, t / w.from) * Math.max(0, Math.min(1, (w.until - t) / w.fade));
function bellSamples(rate: number): Float32Array {
  const data = new Float32Array(Math.round(BELL_SECONDS * rate));
  for (const [hz, gain, decay, phase] of PARTIALS) {
    let angle = phase;
    for (let i = 0; i < data.length; i++) {
      const t = i / rate, wobble = 1 + VIBRATO.depth * wobbleAt(t, VIBRATO) * Math.sin(2 * Math.PI * VIBRATO.rate * t);
      const bloom = hz > BLOOM.above ? 1 - B.bloomDepth * Math.exp(-t / BLOOM.seconds) : 1;
      const lift = 1 + (STRIKE.lift - 1) * Math.exp(-B.liftDecay * t / STRIKE.seconds);
      data[i] += gain * bloom * lift * Math.sin(angle) * Math.exp(-B.ringK * t / (decay * B.ringScale));
      angle += 2 * Math.PI * hz * wobble / rate;
    }
  }
  // The mallet: a felt thud (band-limited noise, 90 ms) and a low thump whose pitch sags after the strike.
  const random = mulberry(B.thudSeed), thud = band(Float32Array.from({ length: Math.round(B.thudSeconds * rate) }, () => random() * 2 - 1), rate, B.thudLo, B.thudHi);
  for (let i = 0; i < thud.length; i++) { const t = i / rate; data[i] += STRIKE.thud * thud[i] * Math.min(1, t / B.thudAttack) * Math.exp(-B.ln1000 * Math.max(0, t - B.thudAttack) / B.thudDecay); }
  let angle = 0;
  for (let i = 0; i < Math.round(B.thumpSeconds * rate); i++) { const t = i / rate; angle += 2 * Math.PI * B.thumpHz * (1 + B.thumpSag * Math.exp(-t / B.thumpSagTau)) / rate; data[i] += STRIKE.thump * Math.sin(angle) * Math.exp(-B.ln1000 * t / B.thumpDecay); }
  // Density for the impact: harder saturation over the first second easing back to DRIVE, then the ring's own drive.
  let loudest = 0; for (let i = 0; i < STRIKE.seconds * rate; i++) loudest = Math.max(loudest, Math.abs(data[i]));
  for (let i = 0; i < data.length; i++) { const t = i / rate, k = DRIVE + (STRIKE.drive - DRIVE) * Math.exp(-B.driveDecay * t / STRIKE.seconds); data[i] =Math.tanh(data[i] / loudest * k) / Math.tanh(k) * loudest; }
  loudest = 0; for (const v of data) loudest = Math.max(loudest, Math.abs(v));
  for (let i = 0; i < data.length; i++) data[i] = Math.tanh(data[i] / loudest * DRIVE) / Math.tanh(DRIVE) * loudest;   // cast-metal warmth, and a lower crest for the same ring
  // Owner 2026-09-21 12:55: "taper it more to the end — 25 % per second, so 3 seconds is 75 % quieter": a linear fade on top of the ring's own decay.
  for (let i = 0; i < data.length; i++) data[i] *= 1 - TAPER * (i / rate);
  let peak = 0, square = 0;
  for (let i = 0; i < data.length; i++) {
    data[i] *= Math.min(1, i / Math.round(B.fadeIn * rate), (data.length - i - 1) / Math.round(B.fadeOut * rate));
    peak = Math.max(peak, Math.abs(data[i])); square += data[i] ** 2;
  }
  const gain = Math.min(B.peakCap / peak, B.rmsCap / Math.sqrt(square / data.length));   // the −6 dBFS wall in bell-start-check is the ceiling: .45 × play gain .9 + the fallback draw swing stays under it
  return data.map(v => v * gain);
}

// Built once per page while the main thread is idle, never on the Draw tap: synthesising it inline cost ~90 ms of a frame on a
// ×4-throttled phone (Hero Look's trace, 2026-09-29). Fixed 48 kHz so it needs no AudioContext; a buffer at 48 kHz plays on any.
// Until it is built, preparedBell() is undefined and the opening bell is skipped for that match (Strategy 2026-09-29).
export const BELL_RATE = audioRule('bellRate');
let prepared: Float32Array | undefined, preparing: Promise<void> | undefined;
export function prepareBell(): Promise<void> {
  return preparing ??= new Promise<void>(resolve => {
    const build = () => { prepared = bellSamples(BELL_RATE); resolve(); };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(build, { timeout: B.idleTimeout }); else setTimeout(build, 0);
  });
}
export const preparedBell = () => prepared;
