// One reading of a melee special's events for the presentation, shared by the Pit and Zone 1 (Dom 2026-10-19). SPECIAL 1 runs the engine's special branch and emits SpecialStarted / SpecialLanded;
// the hero's other slot (and any melee skill Zone 1 plays as an ordinary attack, #3324) runs through its own move-defs row and emits AttackStarted / Hit carrying the same `skill_<id>` move.
// Both mean the same thing to the eye and the ear: the cast began ('start') or it struck ('land'). Pure and presentation only: it reads events, writes nothing, imports no sim file.
import type { CombatEvent } from './combat.ts';

export type SpecialRequest = Readonly<{ skill: string; phase: 'start' | 'land'; actor: 0 | 1; target?: 0 | 1 }>;

export function specialRequestOf(e: CombatEvent): SpecialRequest | null {
  if (e.spell || !e.move?.startsWith('skill_')) return null;
  const skill = e.move.slice('skill_'.length);
  if (e.type === 'SpecialStarted') return { skill, phase: 'start', actor: e.actor };
  if (e.type === 'SpecialLanded') return e.target !== undefined && e.target !== e.actor ? { skill, phase: 'land', actor: e.actor, target: e.target } : null;
  if (e.actor !== 0) return null;   // the ordinary-attack path is the hero's (slot 0): a foe's attack with a skill move keeps the generic look and sound (cues.ts)
  if (e.type === 'AttackStarted') return { skill, phase: 'start', actor: e.actor };
  if (e.type === 'Hit') return e.target !== undefined && e.target !== e.actor ? { skill, phase: 'land', actor: e.actor, target: e.target } : null;
  return null;
}
