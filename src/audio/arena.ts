import { hasBlood, type OpponentId } from '../roster.ts';
import type { CombatEvent } from '../combat.ts';
import { nextVariant, seeded } from './cues.ts';
import { ARENA_MANIFEST, type ArenaCue } from './arena-manifest.ts';
import { fetchAsset, nextTask, pageUnloading, spriteFormats, type Format } from './sprite.ts';
import { bellSamples } from './bell.ts';

// loiter: the wall-hug level, 0..1 — the larger fighter's `loiter / RULES.wall.loiter.ticks` (Brief 13): the crowd turns on
// whoever hugs the wall, a bed that swells with it and drops the moment he leaves the band or swings (loiter resets to 0).
export type ArenaFrame = { match: number; ended: boolean; tick: number; opponent?: OpponentId; drawing?: boolean; loiter?: number };
const URLS = {
  opus: new URL('../assets/arena-audio/arena.ogg', import.meta.url).href,
  aac: new URL('../assets/arena-audio/arena.m4a', import.meta.url).href,
};
export async function loadArena(context: BaseAudioContext, formats: Format[] = spriteFormats(), fetcher: typeof fetch = fetchAsset, leaving = pageUnloading): Promise<AudioBuffer | null> {
  for (const [attempt, format] of formats.entries()) {
    if (attempt) await nextTask();
    if (leaving()) break;   // never start the other codec while the page unloads (see sprite.ts)
    try { const response = await fetcher(URLS[format]); if (response.ok) return await context.decodeAudioData(await response.arrayBuffer()); }
    catch { /* Optional ambience: try the other codec, then leave combat alone. */ }
  }
  return null;
}

// Independent voices/RNG: crowd cannot steal combat voices, change Foley variants or inherit the fatal gain boost.
const ARENA_LEVEL = .4;   // owner 2026-09-20: the audience down with the rest of the mix (−30 % was inaudible on the phone: −3 dB, and the finish limiter ate it); the bell is exempt so it leads
export function createArenaAudio(context: BaseAudioContext, destination: AudioNode, now: () => number) {
  type Voice = { source: AudioBufferSourceNode; until: number };
  const voices = new Set<Voice>(), last: Partial<Record<ArenaCue, number>> = {};
  let buffer: AudioBuffer | null = null, match: number | undefined, random = seeded(1), bell: AudioBuffer | undefined;
  let bellPlayed = false, sleeping = true, bedAt = 0, accentAt = 0, reactionAt = 0, gruntAt = 0, contactAt = 0;
  let wall: { source: AudioBufferSourceNode; envelope: GainNode; until: number } | undefined;   // the wall-hugger jeer bed, one at a time
  const ready = loadArena(context).then(value => { buffer = value; return !!value; });
  function stop() {
    const time = now();
    for (const voice of voices) { try { voice.source.stop(time); } catch { /* ended */ } }
    voices.clear(); sleeping = true; wallStop(time, 0);
  }
  const WALL_GAIN = .16;   // under ARENA_LEVEL like every other crowd cue: a bed under the mix, never a stinger
  function wallStop(time: number, release: number) {
    if (!wall) return;
    const { source, envelope } = wall; wall = undefined;
    envelope.gain.cancelScheduledValues(time); envelope.gain.setValueAtTime(envelope.gain.value, time); envelope.gain.linearRampToValueAtTime(0, time + release);
    try { source.stop(time + release + .01); } catch { /* ended */ }
    source.onended = () => { source.disconnect(); envelope.disconnect(); };
  }
  // Level 0..1 each frame: start a bed (random variant, never the last one) when the level rises from 0, follow it while it holds,
  // drop it with a short release when it returns to 0. A bed that runs out while he still hugs the wall starts the next one.
  function wallJeer(level: number, time: number) {
    if (!buffer) return;
    if (level <= 0) { wallStop(time, .15); return; }
    if (wall && wall.until <= time + .05) wallStop(time, .05);
    if (!wall) {
      const variants = ARENA_MANIFEST.jeer_wall, index = nextVariant(random, variants.length, last.jeer_wall ?? -1); last.jeer_wall = index;
      const [offset, seconds] = variants[index], source = context.createBufferSource(), envelope = context.createGain();
      source.buffer = buffer; source.connect(envelope); envelope.connect(destination);
      envelope.gain.setValueAtTime(0, time); source.start(time, offset, seconds);
      wall = { source, envelope, until: time + seconds };
    }
    wall.envelope.gain.cancelScheduledValues(time); wall.envelope.gain.setValueAtTime(wall.envelope.gain.value, time);
    wall.envelope.gain.linearRampToValueAtTime(WALL_GAIN * ARENA_LEVEL * Math.min(1, level), time + .1);
  }
  function play(name: ArenaCue, cueGain: number, delay = 0) {
    const gain = name === 'bell' ? cueGain : cueGain * ARENA_LEVEL;
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
    update(events: CombatEvent[], frame: ArenaFrame, draw: boolean) {
      const time = now();
      // Expired nodes clean up onended; removing their accounting here also works with a scripted offline clock.
      for (const voice of voices) if (voice.until <= time) voices.delete(voice);
      if (match !== frame.match) {
        stop(); match = frame.match; random = seeded(match ^ 0x6172656e); bellPlayed = false;
        for (const name of Object.keys(last) as ArenaCue[]) delete last[name];
        reactionAt = time + 2; gruntAt = time; contactAt = time;
      }
      if (frame.ended || events.some(e => e.type === 'Killed')) { stop(); return; }
      wallJeer(frame.loiter ?? 0, time);
      if (!bellPlayed && draw) { bellPlayed = true; play('bell', .9); }   // owner 2026-09-20 "double the loudness": the gain lives in the bell's audible partials (bell.ts); .62 keeps bell + fallback draw swing under the −6 dBFS headroom check
      if (!buffer) return; // Loading has no playback callback: only an active match update may start sound.
      if (sleeping) { sleeping = false; bedAt = time; accentAt = time + 12 + random() * 10; }
      if (time >= bedAt) { const duration = play('bed', .15); bedAt = time + (duration ? duration - .9 : .1); }
      const hit = events.find(e => e.type === 'Hit' && (e.target !== 1 || frame.opponent === undefined || hasBlood(frame.opponent)));
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
