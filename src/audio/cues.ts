import type { CombatEvent } from '../combat.ts';
import type { Finish } from '../duel.ts';
import { RULES, type WeaponId } from '../moves.ts';
import { selectFinisher, FINISHER_POSE, type FinisherId } from '../finishers.ts';
import type { CueName } from './manifest.ts';

// Event → cue mapping. Pure data: the simulation's events decide what is heard; gain, room send and pitch spread are per cue.
// Order matters — the voice limiter serves cues in this order, so impacts come before air.
export type Cue = { name: CueName; gain: number; room: number; delay?: number };
const HEAVY = new Set(['heavy_overhead', 'heavy_riposte', 'heavy_counter', 'riposte', 'slash_riposte']);
const cue = (name: CueName, gain: number, room: number, delay?: number): Cue => ({ name, gain, room, ...(delay ? { delay } : {}) });
export type DeathPresentation = { finish: Finish; weapons: readonly [WeaponId, WeaponId]; override?: FinisherId | null; gore?: boolean };
export function cuesFor(events: CombatEvent[], presentation?: DeathPresentation): Cue[] {
  const impacts: Cue[] = [], air: Cue[] = [], deaths = events.filter(e => e.type === 'Killed');
  const pick = presentation && deaths.length === 1 ? selectFinisher(presentation.finish, presentation.weapons) : null;
  const selected = pick ? presentation?.override ?? pick : null;
  const finisher = selected && FINISHER_POSE[selected] ? selected : null;
  const gore = presentation?.gore !== false;
  const severAt = (RULES.death / 60) / .75 * .05; // same 5% presentation-clock threshold as the visible decapitation

  for (const e of events) {
    if (e.type === 'Hit') impacts.push(e.move === 'kick' ? cue('hit_kick', .95, .2) : e.charged || HEAVY.has(e.move ?? '') ? cue('hit_heavy', 1, .3) : cue('hit_flesh', 1, .3));
    else if (e.type === 'GuardBroken') impacts.push(cue('guard_break', 1, .35), cue('hit_flesh', .55, .2));
    else if (e.type === 'Parried') impacts.push(cue('parry', 1, .45));
    else if (e.type === 'Blocked') impacts.push(e.perfect ? cue('block_perfect', 1, .35) : cue('block', 1, .35));
    else if (e.type === 'Killed') {
      impacts.push(cue('death_voice', .45, .1, .03));
      // The impaled corpse kneels and stays on the blade; do not invent a floor slam for it.
      impacts.push(finisher === 'runThrough' ? cue('roll', .2, .12, .85) : cue('kill', .65, .25, finisher ? 1.4 : .65));
      if (gore && e.move !== 'kick' && deaths.length === 1) {
        const stab = finisher === 'runThrough' || e.move === 'thrust' || e.move === 'riposte' || (e.weapon ?? presentation?.weapons[e.actor]) === 'estoc';
        impacts.push(cue(stab ? 'flesh_stab' : 'flesh_cut', .45, .05));
        if (finisher === 'decapitation') impacts.push(cue('flesh_tear', .55, .08, severAt));
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
  if (deaths.length) impacts.push(deaths.length > 1 || presentation?.finish.draw ? cue('crowd_gasp', .25, .18, .35) : cue('crowd_cheer', finisher && gore ? .3 : .23, .16, .35));
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
