import type { CombatEvent } from '../combat.ts';
import type { Finish } from '../duel.ts';
import { RULES, type WeaponId } from '../moves.ts';
import { selectFinisher, FINISHER_POSE, type FinisherId } from '../finishers.ts';
import { hasBlood, type OpponentId } from '../roster.ts';
import type { CueName } from './manifest.ts';

// Event → cue mapping. Pure data: the simulation's events decide what is heard; gain, room send and pitch spread are per cue.
// Order matters — the voice limiter serves cues in this order, so impacts come before air.
export type Cue = { name: CueName; gain: number; room: number; delay?: number; rate?: number };
const HEAVY = new Set(['heavy_overhead', 'heavy_riposte', 'heavy_counter', 'riposte', 'slash_riposte']);
const cue = (name: CueName, gain: number, room: number, delay?: number, rate?: number): Cue => ({ name, gain, room, ...(delay ? { delay } : {}), ...(rate ? { rate } : {}) });
// The wall's six lorarii each keep one whip voice: guard 0 the deepest, guard 5 the thinnest, fixed so the same man always
// sounds like himself over a long fight. An event with no `guard` (a replay written before the tell) plays at rate 1.
const WHIP_RAISE = .4;   // seconds of the raise cue — the lash tick is what it has to land on, so `lead` becomes its delay
const whipRate = (guard?: number) => guard === undefined ? 1 : .94 + Math.min(5, Math.max(0, guard)) * .024;
export type DeathPresentation = { finish: Finish; weapons: readonly [WeaponId, WeaponId]; override?: FinisherId | null; gore?: boolean };
export function cuesFor(events: CombatEvent[], presentation?: DeathPresentation, opponent?: OpponentId): Cue[] {
  const impacts: Cue[] = [], air: Cue[] = [], deaths = events.filter(e => e.type === 'Killed');
  const pick = presentation && deaths.length === 1 ? selectFinisher(presentation.finish, presentation.weapons) : null;
  const selected = pick ? presentation?.override ?? pick : null;
  const finisher = selected && FINISHER_POSE[selected] ? selected : null;
  const gore = presentation?.gore !== false;
  const severAt = (RULES.death / 60) / .75 * .05; // same 5% presentation-clock threshold as the visible decapitation

  for (const e of events) {
    const bone = e.target === 1 && opponent !== undefined && !hasBlood(opponent);
    // Owner 2026-09-22: flesh wounds and weapon hits down; parry, block and guard break stay as they are. The first pass
    // (1 → .75) barely moved the output — these gains feed the bus compressor (−20 dB, 5:1) before the ceiling, which gives
    // most of a cue cut back: measured −2.5 dB nominal landed as −1 dB. At .3 the drop is real and targeted (rendered probes,
    // same graph): hit-light −30.1 → −34.2 LUFS-I while blocked stays −29.1, so hits sit 5 dB under the guards, not 1 dB over.
    if (e.type === 'Hit') impacts.push(bone ? cue('bone_crack', e.charged || HEAVY.has(e.move ?? '') ? .65 : .4, .12) : e.move === 'kick' ? cue('hit_kick', .3, .2) : e.charged || HEAVY.has(e.move ?? '') ? cue('hit_heavy', .3, .3) : cue('hit_flesh', .3, .3));
    else if (e.type === 'GuardBroken') impacts.push(cue('guard_break', 1, .35), cue(bone ? 'bone_crack' : 'hit_flesh', .55, .2));
    else if (e.type === 'Parried') impacts.push(cue('parry', 1, .45));
    // The anti-turtling lash and its tell. WhipRaised carries `lead`, the ticks until the lash, so the raise is delayed to end
    // on the lash tick instead of opening a second of silence before it: 60 ticks before the first lash, 30 before a repeat.
    // It is air, not an impact — quiet and far back in the room, because the man holding it is at the wall, not in the fight.
    else if (e.type === 'Whipped') impacts.push(cue('whip', .85, .25, undefined, whipRate(e.guard)));
    else if (e.type === 'WhipRaised') air.push(cue('whip_raise', .3, .5, Math.round(Math.max(0, (e.lead ?? 60) / 60 - WHIP_RAISE) * 1000) / 1000, whipRate(e.guard)));
    else if (e.type === 'Blocked') impacts.push(e.perfect ? cue('block_perfect', 1, .35) : cue('block', 1, .35));
    else if (e.type === 'Killed') {
      if (!bone) impacts.push(cue('death_voice', finisher === 'quietOne' ? .28 : .45, .1, .03));
      // The impaled corpse kneels and stays on the blade; do not invent a floor slam for it.
      impacts.push(finisher === 'runThrough' ? cue('roll', .2, .12, .85) : finisher === 'opened' && gore ? cue('kill', .65, .25, 2.1) : finisher === 'quietOne' ? cue('kill', .4, .15, 2.6) : cue('kill', .65, .25, finisher ? 1.4 : .65));
      if (finisher === 'opened' && gore) impacts.push(cue('kill', .25, .12, 2.68));
      if (bone) impacts.push(cue('bone_crack', .5, .12, .65));
      if (!bone && gore && e.move !== 'kick' && deaths.length === 1) {
        const stab = finisher !== 'quietOne' && finisher !== 'opened' && (finisher === 'runThrough' || e.move === 'thrust' || e.move === 'riposte' || (e.weapon ?? presentation?.weapons[e.actor]) === 'estoc');
        impacts.push(cue(stab ? 'flesh_stab' : 'flesh_cut', finisher === 'quietOne' ? .28 : .45, .05));
        if (finisher === 'decapitation' || finisher === 'opened') impacts.push(cue('flesh_tear', .55, .08, finisher === 'opened' ? .144 : severAt));
        if (finisher === 'splitCrown') impacts.push(cue('bone_crack', .65, .07, (RULES.death / 60) / .75 * .045));
      }
    }
    else if (e.type === 'Charged') air.push(cue('charge', .1, .4));
    else if (e.type === 'AttackStarted') air.push(e.move === 'kick' ? cue('whoosh_light', .09, .12) : HEAVY.has(e.move ?? '') ? cue('whoosh_heavy', .18, .18) : cue('whoosh_light', .12, .12));
    else if (e.type === 'ActionStarted' && e.action === 'draw') air.push(cue('draw', .2, .3));
    else if (e.type === 'ActionStarted' && e.action === 'roll') air.push(cue('roll', .12, .12));
    else if (e.type === 'ActionStarted' && e.action === 'backstep') air.push(cue('backstep', .09, .08));
  }
  // The crowd backs either winner. A double fall has no winner and gets one startled gasp, never two cheers.
  if (deaths.length) impacts.push(deaths.length > 1 || presentation?.finish.draw ? cue('crowd_gasp', .25, .18, .35) : finisher === 'quietOne' ? cue('crowd_gasp', .16, .12, 2.8) : cue('crowd_cheer', finisher && gore ? .3 : .23, .16, .35));
  return [...impacts, ...air].slice(0, deaths.length ? 8 : 4).sort((a, b) => (a.delay ?? 0) - (b.delay ?? 0));
}

// Seeded randomness (mulberry32) for variant rotation and pitch: reseeded per duel so a fight replays the same way.
export const seeded = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// Next variant index: uniform over the others, so no cue repeats its last variant when it has more than one.
export function nextVariant(random: () => number, count: number, last: number): number {
  if (count < 2) return 0;
  if (last < 0 || last >= count) return Math.floor(random() * count);
  const pick = Math.floor(random() * (count - 1));
  return pick >= last ? pick + 1 : pick;
}
export const PITCH_SPREAD = .05;   // ±5 % playback rate per play
