import type { CombatEvent } from '../combat.ts';
import { nextVariant, seeded } from './cues.ts';
import { ARENA_MANIFEST, type ArenaCue } from './arena-manifest.ts';
import { spriteFormats, type Format } from './sprite.ts';
import { bellSamples } from './bell.ts';

export type ArenaFrame = { match: number; ended: boolean; tick: number; opening?: boolean };
const URLS = {
  opus: new URL('../assets/arena-audio/arena.ogg', import.meta.url).href,
  aac: new URL('../assets/arena-audio/arena.m4a', import.meta.url).href,
};
export async function loadArena(context: BaseAudioContext, formats: Format[] = spriteFormats(), fetcher: typeof fetch = (...args) => fetch(...args)): Promise<AudioBuffer | null> {
  for (const format of formats) {
    try { const response = await fetcher(URLS[format]); if (response.ok) return await context.decodeAudioData(await response.arrayBuffer()); }
    catch { /* Optional ambience: try the other codec, then leave combat alone. */ }
  }
  return null;
}

// Independent voices/RNG: crowd cannot steal combat voices, change Foley variants or inherit the fatal gain boost.
export function createArenaAudio(context: BaseAudioContext, destination: AudioNode, now: () => number) {
  type Voice = { source: AudioBufferSourceNode; until: number };
  const voices = new Set<Voice>(), last: Partial<Record<ArenaCue, number>> = {};
  let buffer: AudioBuffer | null = null, match: number | undefined, random = seeded(1), bell: AudioBuffer | undefined;
  let bellPlayed = false, sleeping = true, bedAt = 0, accentAt = 0, reactionAt = 0, gruntAt = 0, contactAt = 0;
  const ready = loadArena(context).then(value => { buffer = value; return !!value; });
  function stop() {
    const time = now();
    for (const voice of voices) { try { voice.source.stop(time); } catch { /* ended */ } }
    voices.clear(); sleeping = true;
    // A menu/load interruption must never ring a late opening bell on resume.
    if (match !== undefined) bellPlayed = true;
  }
  function play(name: ArenaCue, gain: number, delay = 0) {
    if (name === 'bell' && !buffer && !bell) {
      const samples = bellSamples(context.sampleRate); bell = context.createBuffer(1, samples.length, context.sampleRate); bell.getChannelData(0).set(samples);
    }
    const audio = buffer ?? (name === 'bell' ? bell : null);
    if (!audio || voices.size >= 6) return 0;
    const variants = ARENA_MANIFEST[name], index = nextVariant(random, variants.length, last[name] ?? -1); last[name] = index;
    const [offset, seconds] = variants[index], rate = name === 'bell' ? 1 : .98 + random() * .04;
    const time = now() + delay, duration = seconds / rate, source = context.createBufferSource(), envelope = context.createGain();
    source.buffer = audio; source.playbackRate.value = rate; source.connect(envelope); envelope.connect(destination);
    const fade = name === 'bed' ? .9 : .008;
    envelope.gain.setValueAtTime(0, time); envelope.gain.linearRampToValueAtTime(gain, time + fade);
    envelope.gain.setValueAtTime(gain, time + duration - fade); envelope.gain.linearRampToValueAtTime(0, time + duration);
    const voice = { source, until: time + duration }; voices.add(voice);
    source.onended = () => { voices.delete(voice); source.disconnect(); envelope.disconnect(); };
    source.start(time, audio === bell ? 0 : offset, seconds);
    return duration;
  }
  return {
    ready: () => ready,
    stop,
    update(events: CombatEvent[], frame: ArenaFrame) {
      const time = now();
      // Expired nodes clean up onended; removing their accounting here also works with a scripted offline clock.
      for (const voice of voices) if (voice.until <= time) voices.delete(voice);
      if (match !== frame.match) {
        stop(); match = frame.match; random = seeded(match ^ 0x6172656e); bellPlayed = false;
        for (const name of Object.keys(last) as ArenaCue[]) delete last[name];
        reactionAt = time + 2; gruntAt = time; contactAt = time;
      }
      if (frame.ended || events.some(e => e.type === 'Killed')) { stop(); return; }
      if (!bellPlayed) { bellPlayed = true; if (frame.opening ?? frame.tick < 120) play('bell', .22); }
      if (!buffer) return; // Loading has no playback callback: only an active match update may start sound.
      if (sleeping) { sleeping = false; bedAt = time; accentAt = time + 12 + random() * 10; }
      if (time >= bedAt) { const duration = play('bed', .15); bedAt = time + (duration ? duration - .9 : .1); }
      const hit = events.find(e => e.type === 'Hit');
      if (events.some(e => e.type === 'Hit' || e.type === 'Blocked' || e.type === 'Parried' || e.type === 'GuardBroken')) contactAt = time;
      if (hit && time >= gruntAt) { play('grunt', .20, .04); gruntAt = time + .9; }
      const exciting = events.some(e => e.type === 'Parried' || e.type === 'GuardBroken' || (e.type === 'Hit' && (e.charged || /heavy|riposte|counter/.test(e.move ?? ''))));
      if (exciting && time >= reactionAt) {
        play('reaction', .20, .18); reactionAt = time + 4 + random() * 2;
        accentAt = Math.max(accentAt, time + 6);
      } else if (time >= accentAt && time >= reactionAt) {
        if (time - contactAt > 3) play('jeer', .13);
        else play('chant', .12);
        accentAt = time + 14 + random() * 10; reactionAt = time + 4;
      }
    },
  };
}
