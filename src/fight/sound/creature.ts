// Frontier creature voices (Origins preview, ?look=creatures): the alert growl when a creature's "!" fires, a bite on the creature's landed blow, a death cry. Synthesised on the
// combat bus the way power-word.ts is, so there is no sample, no sprite byte and no new engine: each voice is a low sawtooth (the throat) through two formant band-passes plus
// a band of noise (the rasp). One row per roster body kind says how big the throat is. Presentation only, never read by the sim. Default SILENT: Dom picks the voices by hand
// (2026-10-06), so ?look=creatures is a look test for him to hear, never on by default.
export type CreatureCue = 'growl' | 'bite' | 'death';
export type Throat = { f0: number; formants: [number, number]; rasp: number };   // f0 Hz at rest; two vowel formants; the noise share 0..1
// The roster bodies a Frontier creature wears (mob-looks.ts `opponent`). A body with no row is silent.
export const THROATS: Readonly<Record<string, Throat>> = {
  goblin: { f0: 150, formants: [700, 1300], rasp: .55 },
  pitborn: { f0: 85, formants: [600, 1000], rasp: .45 },
  knight: { f0: 70, formants: [500, 900], rasp: .3 },
  witch: { f0: 190, formants: [450, 1700], rasp: .5 },
  minotaur: { f0: 55, formants: [450, 800], rasp: .5 },
  // The Zone 1 beasts (Characters 2026-10-09, K8): starting points shaped from what the animals do, for Dom's ear to move. Wolf: a growl low in the 90-130 Hz band over an open, mid-high vowel,
  // half breath. Boar: a short chesty grunt (~120-180 Hz) with a closed vowel and the most rasp of the three, the snort. Bear: the lowest throat in the pit, a roar fundamental near 60-70 Hz
  // with a dark vowel, wide and rough.
  wolf: { f0: 110, formants: [550, 1250], rasp: .45 },
  boar: { f0: 150, formants: [420, 900], rasp: .6 },
  bear: { f0: 62, formants: [350, 750], rasp: .55 },
};
// Length (s) and peak gain of each cue before the bus. bone_crack is .55 (audio/cues.ts), so every creature voice sits under an impact.
export const CREATURE_CUES: Readonly<Record<CreatureCue, { length: number; gain: number }>> = { growl: { length: .9, gain: .2 }, bite: { length: .3, gain: .28 }, death: { length: 1.1, gain: .3 } };
export const creaturesLook = (search: string): boolean => /[?&]look=creatures(?=&|$)/i.test(search);
// A pitch (relative to f0) over a cue's 0..1 progress: the growl swells and sags, the bite snaps up, the death falls.
export const pitchAt = (cue: CreatureCue, t: number): number => cue === 'growl' ? .85 + .15 * Math.sin(t * Math.PI) : cue === 'bite' ? 1.25 - .45 * t : 1 - .55 * t;
// Level over a cue's progress: a quick attack, a hold, a release.
export const levelAt = (cue: CreatureCue, t: number): number => cue === 'bite' ? Math.min(t / .08, 1) * (1 - t) ** .7 : Math.min(t / .15, 1) * Math.min(1, (1 - t) / .45);

// Say `cue` in `body`'s throat from `at`; returns when it ends (or `at` for a body with no throat). `out` is the combat bus, `noise` the mixer's shared noise buffer.
export function voiceCreature(context: BaseAudioContext, out: AudioNode, noise: AudioBuffer, body: string, cue: CreatureCue, at: number, gain = 1): number {
  const throat = THROATS[body], spec = CREATURE_CUES[cue]; if (!throat) return at;
  const master = context.createGain(); master.gain.value = spec.gain * gain; master.connect(out);
  const env = context.createGain(); env.gain.setValueAtTime(0, at);
  for (let i = 1; i <= 16; i++) { const t = i / 16; env.gain.linearRampToValueAtTime(levelAt(cue, t), at + spec.length * t); }
  env.connect(master);
  const osc = context.createOscillator(); osc.type = 'sawtooth';
  for (let i = 0; i <= 16; i++) { const t = i / 16; osc.frequency.linearRampToValueAtTime(throat.f0 * pitchAt(cue, t), at + spec.length * t); }
  const drone = context.createGain(); drone.gain.value = 1 - throat.rasp; osc.connect(drone);
  const hush = context.createBufferSource(); hush.buffer = noise; hush.loop = true; const rasp = context.createGain(); rasp.gain.value = throat.rasp * 1.4; hush.connect(rasp);
  throat.formants.forEach((centre, k) => {
    const f = context.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = k ? 7 : 4; f.frequency.value = centre * (cue === 'death' ? .9 : 1);
    const share = context.createGain(); share.gain.value = k ? .45 : 1;
    drone.connect(f); rasp.connect(f); f.connect(share).connect(env);
  });
  osc.start(at); hush.start(at); osc.stop(at + spec.length + .02); hush.stop(at + spec.length + .02);
  return at + spec.length;
}
