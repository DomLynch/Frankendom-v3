// ?look=armfeel sound (Dom 2026-10-06, his Armagedom prototype's src/audio.js, COMBAT_HANDOFF.md "Audio"): a landed blow gets a short downward body tone
// plus a filtered-noise transient on top of the game's own cue; a kill adds a longer, lower body and a rising sine chime. High and Low sound the same (the
// prototype keeps its enhanced audio in Low); Off adds nothing, so the game's own sound is unchanged. Pure: feedback.ts schedules the layers.
import type { CombatEvent } from '../combat.ts';
import type { Feel } from '../armfeel.ts';

export type Layer = { kind: 'tone'; from: number; to: number; seconds: number; volume: number; wave: 'triangle' | 'sine' } | { kind: 'noise'; seconds: number; volume: number; highpass: number };
export const OUTPUT_GAIN = 0.65;   // the prototype's output stage, before its compressor
export const MAX_LAYERS = 8;       // live layers at once; a fight never needs more (the prototype caps its whole mix at 16)
const HIT: readonly Layer[] = [{ kind: 'tone', from: 280, to: 130, seconds: 0.065, volume: 0.16, wave: 'triangle' }, { kind: 'noise', seconds: 0.03, volume: 0.1, highpass: 1700 }];
const KILL: readonly Layer[] = [{ kind: 'tone', from: 160, to: 55, seconds: 0.14, volume: 0.16, wave: 'triangle' }, { kind: 'noise', seconds: 0.085, volume: 0.1, highpass: 1700 }, { kind: 'tone', from: 1000, to: 1500, seconds: 0.09, volume: 0.065, wave: 'sine' }];

// One burst per tick: a kill beats a hit; a blow the guard took keeps the game's block sound.
export function armfeelLayers(feel: Feel | undefined, events: readonly CombatEvent[]): readonly Layer[] {
  if (!feel || feel === 'off') return [];
  if (events.some((e) => e.type === 'Killed')) return KILL;
  return events.some((e) => e.type === 'Hit' && !e.guarded) ? HIT : [];
}
