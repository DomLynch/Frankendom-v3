import type { CombatEvent } from '../combat.ts';
import type { CueName } from './manifest.ts';

// Event → cue mapping. Pure data: the simulation's events decide what is heard; gain, room send and pitch spread are per cue.
// Order matters — the voice limiter serves cues in this order, so impacts come before air.
export type Cue = { name: CueName; gain: number; room: number; delay?: number };
const HEAVY = new Set(['heavy_overhead', 'heavy_riposte', 'heavy_counter', 'riposte']);
const cue = (name: CueName, gain: number, room: number, delay?: number): Cue => ({ name, gain, room, ...(delay ? { delay } : {}) });
export function cuesFor(events: CombatEvent[]): Cue[] {
  const impacts: Cue[] = [], air: Cue[] = [];
  for (const e of events) {
    if (e.type === 'Hit') impacts.push(e.move === 'kick' ? cue('hit_kick', .85, .15) : e.charged || HEAVY.has(e.move ?? '') ? cue('hit_heavy', 1, .3) : cue('hit_flesh', .9, .25));
    else if (e.type === 'GuardBroken') impacts.push(cue('guard_break', 1, .35), cue('hit_flesh', .55, .2));
    else if (e.type === 'Parried') impacts.push(cue('parry', 1, .45));
    else if (e.type === 'Blocked') impacts.push(e.perfect ? cue('block_perfect', .95, .35) : cue('block', .9, .3));
    else if (e.type === 'Killed') impacts.push(cue('kill', 1, .4, .04));
    else if (e.type === 'Charged') air.push(cue('charge', .2, .4));
    else if (e.type === 'AttackStarted') air.push(e.move === 'kick' ? cue('whoosh_light', .18, .1) : HEAVY.has(e.move ?? '') ? cue('whoosh_heavy', .36, .15) : cue('whoosh_light', .26, .1));
    else if (e.type === 'ActionStarted' && e.action === 'draw') air.push(cue('draw', .35, .3));
    else if (e.type === 'ActionStarted' && e.action === 'roll') air.push(cue('whoosh_light', .16, .1));   // placeholder until the body pass (cloth, sand)
  }
  return [...impacts, ...air].slice(0, 4);
}

// Seeded randomness (mulberry32) for variant rotation and pitch: reseeded per duel so a fight replays the same way.
export const seeded = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// Next variant index: uniform over the others, so no cue repeats its last variant when it has more than one.
export function nextVariant(random: () => number, count: number, last: number): number {
  if (count < 2) return 0;
  const pick = Math.floor(random() * (count - 1));
  return pick >= last ? pick + 1 : pick;
}
export const PITCH_SPREAD = .05;   // ±5 % playback rate per play
