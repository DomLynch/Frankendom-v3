import type { Fatigue } from '../fatigue.ts';
import type { OpponentId } from '../roster.ts';

// Graded breathing (Lead's brief B, Dom: "make it realistic"). Synthesised (a looping noise through a band-pass, one gain envelope
// per breath), so it adds nothing to the sprite. Read-only on the fatigue driver (src/fatigue.ts): `level` sets the pace and depth
// continuously, `band` the character, `second` the recovery exhale. Every breath is a whole inhale-and-exhale that ends at zero,
// so a band change or a rest only changes the next breath: nothing is ever cut off. Hits duck it; the end of the duel fades it.
//   winded  faint, slow, nose-soft close-mic breath · tired  faster, heavier, mouth-bright · gassed  short ragged gasps ·
//   second wind  one long release exhale as he leaves exhaustion.
export type Body = { period: number; depth: number; pitch: number };   // × the man's pace · × level · × the band-pass centre
const MAN: Body = { period: 1, depth: 1, pitch: 1 };
// Per body: Goblin quick and shallow, big bodies slow and deep, the undead have no lungs. The hero is a man.
const BODIES: Partial<Record<OpponentId, Body | null>> = {
  goblin: { period: .62, depth: .7, pitch: 1.25 },
  minotaur: { period: 1.4, depth: 1.35, pitch: .7 }, executioner: { period: 1.35, depth: 1.25, pitch: .75 }, werewolf: { period: 1.15, depth: 1.3, pitch: .75 },
  dwarf: { period: 1.1, depth: 1.1, pitch: .85 }, nightborn: { period: 1.2, depth: .5, pitch: .9 },
  skeleton: null, wraith: null,
};
export const bodyOf = (opponent: OpponentId | undefined): Body | null => opponent === undefined ? MAN : opponent in BODIES ? BODIES[opponent]! : MAN;

export type Plan = { period: number; peak: number; centre: number; inhale: number; ragged: boolean };
const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));
// What the next breath is, or null while he is fresh. Winded starts at level .5 (fatigue.ts WINDED), so the first breath is the faintest.
export function breathPlan(f: Fatigue, body: Body = MAN): Plan | null {
  if (f.band === 0) return null;
  const t = (f.level - .5) / .5, gassed = f.band === 3;
  return {
    period: (gassed ? .8 : lerp(3.2, 1.2, t)) * body.period,
    peak: (gassed ? .17 : lerp(.035, .1, t)) * body.depth,
    centre: (gassed ? 2300 : lerp(900, 1800, t)) * body.pitch,
    inhale: gassed ? .3 : lerp(.45, .38, t),
    ragged: gassed,
  };
}

type Side = { source: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode; next: number; second: boolean };
const AHEAD = .3, DUCK = .3, DUCK_BACK = .45, RELEASE = 1.4;
// `out` is the combat bus; `room` (optional) is the arena send, which only the foe's breath uses so he sounds across the sand.
export function createBreath(context: BaseAudioContext, out: AudioNode, noise: AudioBuffer, random: () => number, room?: AudioNode) {
  const master = context.createGain(), sides: (Side | null)[] = [null, null];
  master.gain.value = 1; master.connect(out);
  let ducked = 1;
  const open = (side: 0 | 1, time: number): Side => {
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = noise; source.loop = true; filter.type = 'bandpass'; filter.Q.value = .8; gain.gain.value = 0;
    source.connect(filter).connect(gain); gain.connect(master);
    if (side === 1 && room) { const send = context.createGain(); send.gain.value = .5; gain.connect(send); send.connect(room); }
    source.start(time);
    return sides[side] = { source, filter, gain, next: time, second: false };
  };
  // One whole breath from `at`: inhale swell, exhale fall, the rest silent. Returns when the next one starts.
  const breathe = (s: Side, plan: Plan, at: number): number => {
    const jitter = plan.ragged ? .75 + random() * .5 : 1, period = plan.period * jitter, peak = plan.peak * (plan.ragged ? .7 + random() * .6 : 1), g = s.gain.gain;
    s.filter.frequency.setValueAtTime(plan.centre * (plan.ragged ? .9 + random() * .2 : 1), at);
    g.setValueAtTime(0, at); g.linearRampToValueAtTime(peak, at + plan.inhale * period); g.linearRampToValueAtTime(0, at + period * .88);
    return at + period;
  };
  // The second wind: one long, falling exhale (a low band-pass), scheduled in the breath's place.
  const release = (s: Side, body: Body, at: number): number => {
    s.filter.frequency.setValueAtTime(1100 * body.pitch, at);
    s.gain.gain.setValueAtTime(0, at); s.gain.gain.linearRampToValueAtTime(.13 * body.depth, at + .25); s.gain.gain.linearRampToValueAtTime(0, at + RELEASE);
    return at + RELEASE + .4;
  };
  const stop = (side: 0 | 1, time: number, fade: number) => {
    const s = sides[side]; if (!s) return; sides[side] = null;
    s.gain.gain.cancelScheduledValues(time); s.gain.gain.setValueAtTime(s.gain.gain.value, time); s.gain.gain.linearRampToValueAtTime(0, time + fade);
    try { s.source.stop(time + fade + .02); } catch { /* not started */ }
    s.source.onended = () => { s.source.disconnect(); s.filter.disconnect(); s.gain.disconnect(); };
  };
  return {
    // Each frame: keep each living, tired fighter's breaths scheduled a little ahead of the clock. `opponent` picks the foe's body.
    update(time: number, fatigue: readonly [Fatigue, Fatigue], opponent: OpponentId | undefined) {
      for (const side of [0, 1] as const) {
        const body = side === 0 ? MAN : bodyOf(opponent), f = fatigue[side], plan = body && breathPlan(f, body);
        let s = sides[side];
        if (!s && (!plan && !(f.second > .97))) continue;
        if (!body) continue;
        s ??= open(side, time);
        if (s.next < time) s.next = time;
        if (f.second > .97 && !s.second) { s.second = true; s.next = release(s, body, s.next); }
        else if (f.second <= .97) s.second = false;
        while (plan && s.next < time + AHEAD) s.next = breathe(s, plan, s.next);
      }
    },
    // A blow lands: the breath dips under it and comes back, over a few hundredths of a second so there is no click.
    duck(time: number) {
      const g = master.gain; g.cancelScheduledValues(time); g.setValueAtTime(ducked, time); g.linearRampToValueAtTime(DUCK, time + .02); g.linearRampToValueAtTime(1, time + DUCK_BACK); ducked = DUCK;
    },
    // The duel is over, or sound is quiet/muted: fade each breath out (an in-flight breath is not left hanging) and release the nodes.
    cut(time: number, fade = .3) { stop(0, time, fade); stop(1, time, fade); ducked = 1; },
  };
}
export type Breath = ReturnType<typeof createBreath>;
