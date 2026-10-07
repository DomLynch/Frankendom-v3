// The Witch's and the Plague Doctor's wind-up word (power-words.ts), as a whispered chant: synthesised, no sample. One syllable per vowel group; each is a sawtooth drone
// (a low breathy voice) plus noise through two formant band-passes, the vowel gliding from the group's first vowel to its last; a fricative onset (s, sh, x, z, v, th) adds a short hiss.
// ?look=powerwords only (Dom has rejected one synth voice and picks the voices by hand near beta): a look test, absent = silent as before. Presentation only.
const FORMANTS: Record<string, [number, number]> = { a: [800, 1200], e: [530, 1850], i: [300, 2300], y: [300, 2300], o: [500, 900], u: [350, 800] };
const CASTERS: Record<string, { f0: number; breath: number; syllable: number }> = { witch: { f0: 175, breath: .55, syllable: .24 }, plaguedoctor: { f0: 88, breath: .4, syllable: .3 } };
export const POWER_WORD_LOOK_GAIN = .3;   // peak of the loudest syllable before the bus; bone_crack is .55 (audio/cues.ts), so the word always sits under an impact
export const syllables = (word: string): { onset: string; vowels: string; coda: string }[] => {
  const parts = word.toLowerCase().match(/[^aeiouy]*[aeiouy]+/g) ?? [], rest = word.toLowerCase().slice(parts.join('').length);
  return parts.map((p, i) => {
    const v = p.search(/[aeiouy]/), vowels = p.slice(v), tail = i === parts.length - 1 ? rest : '';
    return { onset: p.slice(0, v), vowels, coda: tail };
  });
};
const HISS = /s|x|z|v|h|f|th/;
// Say `word` from `at`; returns when it ends. `out` is the combat bus, `noise` the mixer's shared noise buffer (looped here).
export function sayPowerWord(context: BaseAudioContext, out: AudioNode, noise: AudioBuffer, word: string, caster: string, at: number, gain: number): number {
  const c = CASTERS[caster]; if (!c) return at;
  const master = context.createGain(); master.gain.value = gain; master.connect(out);
  let t = at;
  const parts = syllables(word);
  parts.forEach((s, i) => {
    const last = i === parts.length - 1, len = c.syllable * (last ? 1.5 : 1), body = t + (HISS.test(s.onset) ? .07 : .02);
    if (HISS.test(s.onset)) burst(context, master, noise, t, .07, 3800, .5);
    const first = FORMANTS[s.vowels[0]!] ?? FORMANTS.a!, end = FORMANTS[s.vowels[s.vowels.length - 1]!] ?? first;
    const env = context.createGain(); env.gain.setValueAtTime(0, body);
    env.gain.linearRampToValueAtTime(1 - i * .12, body + .04); env.gain.setValueAtTime(1 - i * .12, body + len * .55); env.gain.linearRampToValueAtTime(0, body + len);
    env.connect(master);
    const osc = context.createOscillator(); osc.type = 'sawtooth'; osc.frequency.setValueAtTime(c.f0 * (1 - i * .03), body); osc.frequency.linearRampToValueAtTime(c.f0 * (1 - i * .03) * (last ? .86 : .97), body + len);
    const drone = context.createGain(); drone.gain.value = 1 - c.breath; osc.connect(drone);
    const hush = context.createBufferSource(); hush.buffer = noise; hush.loop = true; const wind = context.createGain(); wind.gain.value = c.breath * 1.6; hush.connect(wind);
    [0, 1].forEach((k) => {
      const f = context.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = k ? 9 : 6;
      f.frequency.setValueAtTime(first[k]!, body); f.frequency.linearRampToValueAtTime(end[k]!, body + len * .7);
      const share = context.createGain(); share.gain.value = k ? .5 : 1;
      drone.connect(f); wind.connect(f); f.connect(share).connect(env);
    });
    osc.start(body); hush.start(body); osc.stop(body + len + .02); hush.stop(body + len + .02);
    if (s.coda && HISS.test(s.coda)) burst(context, master, noise, body + len * .6, .08, 3200, .3);
    t = body + len * .8;
  });
  return t;
}
function burst(context: BaseAudioContext, out: AudioNode, noise: AudioBuffer, at: number, length: number, centre: number, peak: number) {
  const src = context.createBufferSource(), f = context.createBiquadFilter(), g = context.createGain();
  src.buffer = noise; src.loop = true; f.type = 'bandpass'; f.frequency.value = centre; f.Q.value = 1.2;
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + length * .3); g.gain.linearRampToValueAtTime(0, at + length);
  src.connect(f).connect(g).connect(out); src.start(at); src.stop(at + length + .01);
}
