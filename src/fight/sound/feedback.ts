import type { ClarityEvent, CombatEvent } from '../../combat.ts';
import { cuesFor, nextVariant, PITCH_SPREAD, seeded, type Cue, type DeathPresentation } from './cues.ts';
import { MANIFEST, type CueName } from '../../audio/manifest.ts';
import { loadSprite } from '../../audio/sprite.ts';
import { createArenaAudio, type ArenaFrame } from '../../audio/arena.ts';
import { createBreath, type Breath } from './breath.ts';
import { sayPowerWord } from './power-word.ts';
import { voiceCreature, type CreatureCue } from './creature.ts';
import { prepareBell } from '../../audio/bell.ts';
import { loadSpecial, playSpecial, type SpecialCue } from './special.ts';
import { loadDuel, playDuel, type DuelCue } from './duel.ts';
import { armfeelLayers, MAX_LAYERS, OUTPUT_GAIN } from './armfeel-sound.ts';
import type { Feel } from '../../armfeel.ts';

// Offline rendering host (scripts/audio-preview.mjs): a supplied OfflineAudioContext and a scripted clock stand in for the
// page's AudioContext and its wall clock, so a fixed exchange renders to the same WAV every time. `sprite` null forces the
// synth fallback; a buffer skips loading. Absent in the game.
type FeedbackHost = { context: BaseAudioContext; now: () => number; seed?: number; sprite?: AudioBuffer | null; balance?: { combat: number; finish: number } };   // balance: evidence renders of the mix stage at other levels
export const VOICES = 8;   // simultaneous sample voices; the oldest-ending one is stolen past that
const BASE_SEED = 731;
let breathing = false;   // the breathing layer's one switch: OFF until Dom signs the sound off (2026-10-06, he had just rejected a synth voice). His OK is flipping this to true; until then only ?look=fatigue-preview turns it on (breathing(on) below).
const RISE = 1.6, RISE_FLOOR = .35, CUT = .035;   // the opponent's charge: rate ×1.6 and level from 35 % over the hold; a 35 ms fade when it ends
// Owner phone mix (2026-09-19): half ordinary FX, +50 % for the fatal sequence. Owner 2026-09-20, phone at 20 % volume still loud:
// everything but the bell at 40 % (−8 dB): the first cut to 70 % was −3 dB, inaudible on the phone and swallowed by the output guard on the
// finishers (1.5 × .7 still clipped it); at .4 both combat and finish sit under the guard's linear region, so the whole cut is heard and the
// bell (arena.ts, exempt) leads by contrast.
const MIX = .4;
// Owner 2026-09-22, after the live set: "reduce all combat noise by 25 %, keep the crowd, opening bell and death all same — it's
// overpowering." Combat balance x.75; the finish balance (death sequence), the arena bank (crowd) and the bell are untouched.
export const COMBAT_LEVEL = .375 * MIX, FINISH_LEVEL = 1.5 * MIX;

// Combat Foley: the simulation's events pick cues from one decoded sprite (src/audio/manifest.ts, built by
// scripts/build-audio.mjs); seeded variant rotation and ±5 % pitch keep two hits from ever sounding identical. Voices feed a
// compressor and a −1 dBFS soft ceiling; a share of each voice goes to a short arena reverb. Until the sprite is decoded,
// the original synthesised layers stand in so no event is ever silent.

export function createFeedback(host?: FeedbackHost) {
  void prepareBell();   // the network-independent opening bell, built while idle so the Draw tap never synthesises it (bell.ts)
  type Voice = { source: AudioBufferSourceNode | null; gain: GainNode; send: GainNode; until: number };
  let suspensions = 0;
  let pendingDraw: number | undefined;
  let arenaAudio: ReturnType<typeof createArenaAudio> | undefined, arenaOutput: AudioNode;
  let context: BaseAudioContext | undefined, master: GainNode | undefined, balance: GainNode | undefined, bus: DynamicsCompressorNode | undefined, noise: AudioBuffer | undefined;
  const level = host?.balance ?? { combat: COMBAT_LEVEL, finish: FINISH_LEVEL };
  let sprite: AudioBuffer | null | undefined, loading: Promise<boolean> | undefined, enabled = true, quieted = false, duel = 0, random = seeded(BASE_SEED);
  const sources = new Set<AudioScheduledSourceNode>();
  const voices: Voice[] = [], last: Partial<Record<CueName, number>> = {};
  let tap: MediaStreamAudioDestinationNode | undefined;
  let breath: Breath | undefined, room: ConvolverNode | undefined;   // graded fatigue breathing (audio/breath.ts): built on first use, its own seeded rolls so it never shifts the cue variants
  let defenceGrades = false, wordBus: GainNode | undefined;   // wordBus: ?look=powerwords' chant (audio/power-word.ts), ducked under every landing blow
  let armfeel: Feel | undefined, armfeelLive = 0;   // ?look=armfeel (audio/armfeel-sound.ts): extra body and transient layers on a landed blow; absent = the game's own sound
  // Special-move cues (audio/special.ts; the Centurion's Blood Tithe swell): wanted ones are fetched once the context exists, never gating a fight; each actor owns one voice at the existing gain.
  const specialWanted = new Set<SpecialCue>(), specialBuffers = new Map<SpecialCue, AudioBuffer | null>();
  const specialHeard: ({ stop(): void } | null)[] = [null, null];
  const specialLoad = () => { if (context) for (const cue of specialWanted) if (!specialBuffers.has(cue)) { specialBuffers.set(cue, null); void loadSpecial(cue, context).then((buffer) => specialBuffers.set(cue, buffer)); } };
  const specialCut = (actor?: 0 | 1) => { for (const side of actor === undefined ? [0, 1] : [actor]) { specialHeard[side]?.stop(); specialHeard[side] = null; } };
  // Duel lobby cues (audio/duel.ts): the same lazy fetch, never gating a fight. They may overlap (the 3-2-1 ticks), so there is no cut.
  const duelWanted = new Set<DuelCue>(), duelBuffers = new Map<DuelCue, AudioBuffer | null>();
  const duelLoad = () => { if (context) for (const cue of duelWanted) if (!duelBuffers.has(cue)) { duelBuffers.set(cue, null); void loadDuel(cue, context).then((buffer) => duelBuffers.set(cue, buffer)); } };
  let rising: { voice: Voice; source: AudioBufferSourceNode } | undefined;   // the opponent's charge while it climbs; cut when her hold ends
  const live = () => !!host || context?.state === 'running';
  const now = () => host ? host.now() : context!.currentTime;
  function unlock() {
    if (!enabled || (!host && typeof AudioContext === 'undefined')) return;
    if (!context) {
      if (host) context = host.context; else try { context = new AudioContext(); } catch { enabled = false; return; }
      // iOS mutes "ambient" web audio under the ringer switch; a playback session plays like a game does (Safari 17+).
      const session = host || typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) try { session.type = 'playback'; } catch { /* unsupported value on older WebKit */ }
      build(context);
      specialLoad(); duelLoad();
      if (host && host.sprite !== undefined) sprite = host.sprite;
      else loading = loadSprite(context).then(buffer => { sprite = buffer; return !!buffer; }, () => { sprite = null; return false; });
    }
    quieted = false;
    // iOS also parks the context in 'interrupted' after calls, Siri or an app switch; resume from any non-running state.
    if (!host && (context.state !== 'running' || suspensions > 0)) void (context as AudioContext).resume().catch(() => {});
  }
  // Graph: voice gain → compressor → ceiling → balance → safety → master → out; voice send → room → compressor. Built once, no per-play nodes but the source.
  function build(context: BaseAudioContext) {
    master = context.createGain(); master.gain.value = 1; master.connect(context.destination);
    // Apply the requested levels AFTER compression, so it cannot squash away the volume change.
    const safety = context.createWaveShaper(); safety.curve = outputCeiling(); safety.oversample = '4x'; safety.connect(master); arenaOutput = safety;
    balance = context.createGain(); balance.gain.value = level.combat; balance.connect(safety);
    const ceiling = context.createWaveShaper(); ceiling.curve = softCeiling(); ceiling.connect(balance);
    // Glue and density: the compressor leans on stacked hits and the makeup pushes the mix into the ceiling, which is what makes impacts read as big on a small speaker.
    const makeup = context.createGain(); makeup.gain.value = 2.1; makeup.connect(ceiling);   // +6.4 dB: restores the 4 dB of codec headroom baked into the sprite, plus glue
    bus = context.createDynamicsCompressor(); bus.threshold.value = -20; bus.knee.value = 10; bus.ratio.value = 5; bus.attack.value = .002; bus.release.value = .15; bus.connect(makeup);
    room = context.createConvolver(); room.buffer = arena(context); room.connect(bus);
    for (let i = 0; i < VOICES; i++) { const gain = context.createGain(), send = context.createGain(); gain.connect(bus); gain.connect(send); send.connect(room); send.gain.value = 0; voices.push({ source: null, gain, send, until: 0 }); }
    noise = context.createBuffer(1, context.sampleRate * .3, context.sampleRate);
    const data = noise.getChannelData(0), r = seeded(host?.seed ?? BASE_SEED); for (let i = 0; i < data.length; i++) data[i] = r() * 2 - 1;
  }
  function play(cue: Cue, at: number) {
    const variants = MANIFEST[cue.name], index = nextVariant(random, variants.length, last[cue.name] ?? -1); last[cue.name] = index;
    const [start, duration] = variants[index], rate = (cue.rate ?? 1) * (1 + (random() * 2 - 1) * PITCH_SPREAD), t = at + (cue.delay ?? 0);   // cue.rate: the lorarius's own whip voice, the spread on top of it
    let voice = voices.find(v => !v.source || v.until <= t);
    if (!voice) { voice = voices.reduce((a, b) => a.until <= b.until ? a : b); try { voice.source!.stop(t); } catch { /* already ended */ } }
    const source = context!.createBufferSource(); source.buffer = sprite!; source.playbackRate.value = rate;
    source.connect(voice.gain); voice.gain.gain.cancelScheduledValues(t); voice.gain.gain.setValueAtTime(cue.gain, t); voice.send.gain.setValueAtTime(cue.room, t);
    if (cue.hold) {
      // A rising cue: the sample loops while rate and level climb for `hold` seconds, which ends where the sim forces the swing.
      // The climb is the tell; update() fades it early the tick the hold ends.
      source.loop = true; source.loopStart = start; source.loopEnd = start + duration;
      source.playbackRate.setValueAtTime(rate, t); source.playbackRate.linearRampToValueAtTime(rate * RISE, t + cue.hold);
      voice.gain.gain.setValueAtTime(cue.gain * RISE_FLOOR, t); voice.gain.gain.linearRampToValueAtTime(cue.gain, t + cue.hold);
      sources.add(source); source.start(t, start); source.stop(t + cue.hold + CUT); voice.source = source; voice.until = t + cue.hold + CUT;
      rising = { voice, source };
    } else { sources.add(source); source.start(t, start, duration); voice.source = source; voice.until = t + duration / rate; }
    source.onended = () => { sources.delete(source); source.disconnect(); if (voice.source === source) voice.source = null; };
  }
  // Fallback while the sprite is still decoding: the original synthesised air, body and inharmonic steel layers.
  function synth(kind: 'swing' | 'hit' | 'steel' | 'parry' | 'charged', time: number) {
    const duration = kind === 'swing' ? .16 : kind === 'charged' ? .3 : .24, level = .7;
    const air = context!.createBufferSource(), filter = context!.createBiquadFilter(), gain = context!.createGain();
    air.buffer = noise!; filter.type = 'bandpass'; filter.frequency.value = kind === 'swing' ? 900 : 1800; filter.Q.value = .7;
    gain.gain.setValueAtTime(.001, time); gain.gain.exponentialRampToValueAtTime((kind === 'swing' ? .35 : .7) * level, time + .008); gain.gain.exponentialRampToValueAtTime(.001, time + duration);
    air.connect(filter).connect(gain).connect(bus!); sources.add(air); air.start(time); air.stop(time + duration);
    air.onended = () => { sources.delete(air); air.disconnect(); filter.disconnect(); gain.disconnect(); };
    if (kind === 'swing') return;
    for (const frequency of kind === 'hit' ? [95, 173] : kind === 'parry' ? [940, 1491, 2273] : kind === 'charged' ? [131, 196] : [620, 1037, 1613]) {
      const tone = context!.createOscillator(), envelope = context!.createGain();
      tone.frequency.value = frequency; envelope.gain.setValueAtTime(.18 * level, time); envelope.gain.exponentialRampToValueAtTime(.001, time + duration);
      tone.connect(envelope).connect(bus!); sources.add(tone); tone.start(time); tone.stop(time + duration);
      tone.onended = () => { sources.delete(tone); tone.disconnect(); envelope.disconnect(); };
    }
  }
  function armfeelPlay(events: readonly CombatEvent[], time: number) {
    for (const layer of armfeelLayers(armfeel, events)) {
      if (armfeelLive >= MAX_LAYERS) return;
      const gain = context!.createGain(), end = time + layer.seconds;
      gain.gain.setValueAtTime(.0001, time); gain.gain.exponentialRampToValueAtTime(layer.volume * OUTPUT_GAIN, time + .002); gain.gain.exponentialRampToValueAtTime(.0001, end);
      let source: AudioScheduledSourceNode, filter: BiquadFilterNode | undefined;
      if (layer.kind === 'tone') {
        const tone = context!.createOscillator(); tone.type = layer.wave; tone.frequency.setValueAtTime(layer.from, time); tone.frequency.exponentialRampToValueAtTime(layer.to, end);
        tone.connect(gain); source = tone;
      } else {
        const air = context!.createBufferSource(); filter = context!.createBiquadFilter(); air.buffer = noise!; filter.type = 'highpass'; filter.frequency.value = layer.highpass;
        air.connect(filter).connect(gain); source = air;
      }
      gain.connect(bus!); sources.add(source); armfeelLive++;
      source.onended = () => { sources.delete(source); armfeelLive--; source.disconnect(); filter?.disconnect(); gain.disconnect(); };
      source.start(time); source.stop(end + .01);
    }
  }
  function stopSources() {
    pendingDraw = undefined;
    if (!context) return;
    arenaAudio?.stop(); breath?.cut(now(), .05);
    for (const source of sources) { try { source.stop(now()); } catch { /* already ended */ } }
    sources.clear();
    balance!.gain.cancelScheduledValues(now()); balance!.gain.setValueAtTime(level.combat, now());
    rising = undefined;
    for (const voice of voices) { voice.source = null; voice.until = 0; voice.gain.gain.cancelScheduledValues(now()); voice.send.gain.cancelScheduledValues(now()); }
  }
  return {
    unlock,
    breathing(on: boolean) { breathing = on; },   // ?look=fatigue-preview (audio/breath.ts breathLook); absent = silent as shipped
    armfeel(feel: Feel | undefined) { armfeel = feel; },
    defenceGrades(on: boolean) { defenceGrades = on; },   // ?look=defence (defence-grade.ts)
    powerWord(word: string, caster: string, gain: number) {   // ?look=powerwords: the wind-up chant, on the combat bus, a quiet look test
      if (!context || !bus || !noise || !live() || quieted || !enabled) return;
      wordBus ??= (() => { const g = context!.createGain(); g.gain.value = 1; g.connect(bus!); return g; })();
      sayPowerWord(context, wordBus, noise, word, caster, now(), gain);
    },
    creature(body: string, cue: CreatureCue) {   // ?look=creatures (audio/creature.ts): a Frontier creature's growl, bite or death cry, synthesised on the combat bus; absent = silent as shipped
      if (!context || !bus || !noise || !live() || quieted || !enabled) return;
      voiceCreature(context, bus, noise, body, cue, now());
    },
    toggle() { enabled = !enabled; if (master && context) master.gain.setValueAtTime(enabled ? 1 : 0, now()); if (enabled) unlock(); else { stopSources(); specialCut(); } return enabled; },
    // A special's cue: `want` asks for it to be fetched (once the first tap has made the context); `special` starts it now at `gain`, silent if it has not loaded;
    // `cutSpecial` fades it out (a fizzle, a skipped beat). The swell peaks 2.0 s in, so it starts with the wind-up.
    // It plays into the arena output, past the combat balance, like the crowd bank: the cues are levelled for that path (build-special-audio.mjs).
    want(cue: SpecialCue) { specialWanted.add(cue); specialLoad(); },
    special(cue: SpecialCue, gain = 1, actor: 0 | 1 = 1) { specialCut(actor); const buffer = specialBuffers.get(cue); if (!enabled || quieted || !context || !live() || !buffer) return null; specialHeard[actor] = playSpecial(context, buffer, arenaOutput, gain); return specialHeard[actor]; },
    cutSpecial: specialCut,
    dispose() { quieted = true; stopSources(); specialCut(); },
    // A duel lobby cue: `wantDuel` asks for it to be fetched (once the first tap has made the context), `duel` plays it now at `gain`, silent if it has not loaded.
    wantDuel(cue: DuelCue) { duelWanted.add(cue); duelLoad(); },
    duel(cue: DuelCue, gain = 1) { const buffer = duelBuffers.get(cue); if (!enabled || quieted || !context || !live() || !buffer) return null; return playDuel(context, buffer, arenaOutput, gain); },
    // Export clip (src/clip.ts): the mixed game audio as a stream, tapped off master beside the speakers. Null before the first
    // unlock, on the offline harness, or where the browser has no MediaStream destination.
    stream(): MediaStream | null {
      if (!master || !context || host || !('createMediaStreamDestination' in context)) return null;
      tap ??= (context as AudioContext).createMediaStreamDestination(); master.connect(tap);
      return tap.stream;
    },
    untap() { if (tap && master) try { master.disconnect(tap); } catch { /* not connected */ } },
    quiet() { quieted = true; stopSources(); specialCut(); if (!host && context?.state === 'running') { suspensions++; void (context as AudioContext).suspend().catch(() => {}).finally(() => { suspensions--; }); } },
    // Resolves true once the sprite is decoded, false if loading failed and the fallback stays. The offline harness awaits it.
    async ready() { const decoded = await (loading ?? Promise.resolve(!!sprite)); await arenaAudio?.ready(); await prepareBell(); return decoded; },
    // Sound consumes the simulation's events. Sprite: every mapped cue this tick, impacts first. Fallback: one cue, strongest first.
    update(events: CombatEvent[], presentation?: DeathPresentation, frame?: ArenaFrame, clarity?: readonly ClarityEvent[]) {
      if (!frame?.drawing || frame.ended || frame.match !== pendingDraw) pendingDraw = undefined;
      if (!enabled || quieted) return;
      // Touchend may enable WebKit audio after Draw's simulation tick. Keep only this still-active draw, never a stale cue.
      if (frame && !frame.ended && events.some(e => e.type === 'ActionStarted' && e.action === 'draw' && e.actor === 0)) pendingDraw = frame.match;
      if (!context || !live()) return;
      if (events.some(e => e.type === 'ActionStarted' && e.action === 'draw' && e.actor === 0)) random = seeded((host?.seed ?? BASE_SEED) + duel++ * 1013);   // a fresh duel, a fresh but repeatable roll
      const time = now();
      if (frame) { arenaAudio ??= createArenaAudio(context, arenaOutput, now); arenaAudio.update(events, frame, pendingDraw === frame.match); pendingDraw = undefined; }
      // Death ends the duel: the impact, voice, delayed body and crowd share the finishing level.
      // Empty post-death ticks keep it; fresh combat or quiet/mute returns to the ordinary level.
      if (events.length) balance!.gain.setValueAtTime(events.some(e => e.type === 'Killed') ? level.finish : level.combat, time);
      // Her hold ended (release, feint, stagger, or the forced swing at the maximum): the climb stops with a short fade, not a click.
      if (rising && frame?.holding === false) {
        const { voice, source } = rising; rising = undefined;
        if (voice.source === source) { const g = voice.gain.gain; g.cancelScheduledValues(time); g.setValueAtTime(g.value, time); g.linearRampToValueAtTime(0, time + CUT); try { source.stop(time + CUT); } catch { /* already ended */ } voice.until = time + CUT; }
      }
      // Breathing: ducked under any blow that lands, faded out when the duel ends, otherwise scheduled from the fatigue driver.
      if (frame?.fatigue && breathing) {
        if (frame.ended) breath?.cut(time);
        else {
          breath ??= createBreath(context, bus!, noise!, seeded((host?.seed ?? BASE_SEED) + 4099), room);
          if (events.some(e => e.type === 'Hit' || e.type === 'Blocked' || e.type === 'Parried' || e.type === 'GuardBroken')) breath.duck(time);
          breath.update(time, frame.fatigue, frame.opponent);
        }
      }
      if (wordBus && events.some(e => e.type === 'Hit' || e.type === 'Blocked' || e.type === 'Parried' || e.type === 'GuardBroken')) { const g = wordBus.gain; g.cancelScheduledValues(time); g.setValueAtTime(.2, time); g.linearRampToValueAtTime(1, time + .5); }   // a landing blow or a parry/block owns the moment; the chant ducks to -14 dB and comes back
      armfeelPlay(events, time);
      if (sprite) { for (const cue of cuesFor(events, presentation, frame?.opponent, clarity, undefined, defenceGrades)) play(cue, time); return; }
      if (events.some(e => e.type === 'Hit' || e.type === 'GuardBroken')) synth('hit', time);
      else if (events.some(e => e.type === 'Parried')) synth('parry', time);
      else if (events.some(e => e.type === 'Blocked')) synth('steel', time);
      else if (events.some(e => e.type === 'Charged')) synth('charged', time);
      else if (events.some(e => e.type === 'AttackStarted' || (e.type === 'ActionStarted' && (e.action === 'draw' || e.action === 'roll')))) synth('swing', time);
    },
  };
}

// −1 dBFS soft ceiling: unity through the middle, tanh above, never past 0.89.
function softCeiling(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(1025 * 4)), limit = 10 ** (-1 / 20);
  for (let i = 0; i < curve.length; i++) { const x = (i / 512) - 1; curve[i] = limit * Math.tanh(x / limit); }
  return curve;
}
// Linear below 0.55; oversampling and headroom catch boosted fatal peaks between output samples.
function outputCeiling(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(1025 * 4)), knee = .55, span = 10 ** (-3 / 20) - knee;
  for (let i = 0; i < curve.length; i++) {
    const x = i / 512 - 1, a = Math.abs(x);
    curve[i] = a <= knee ? x : Math.sign(x) * (knee + span * Math.tanh((a - knee) / span));
  }
  return curve;
}
// Arena: a stone-walled decay, darkening as it fades. Built once from seeded noise; ConvolverNode normalises it.
function arena(context: BaseAudioContext): AudioBuffer {
  const seconds = .8, buffer = context.createBuffer(1, Math.round(context.sampleRate * seconds), context.sampleRate), data = buffer.getChannelData(0), r = seeded(97);
  let low = 0;
  for (let i = 0; i < data.length; i++) { const t = i / data.length, k = .12 + .5 * t; low += (r() * 2 - 1 - low) * (1 - k); data[i] = low * Math.exp(-6.9 * t) * (i < 240 ? i / 240 : 1); }
  return buffer;
}
