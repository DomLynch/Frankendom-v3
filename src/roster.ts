import type { WeaponId } from './moves.ts';
import type { Finish } from './duel.ts';
import { selectFinisher, type FinisherId } from './finishers.ts';

// Approved content recipes. Body names refer to existing offline appearance presets/GLBs;
// archetypes own combat tuning in moves.ts. Adding an individual must not add AI branches.
export const ROSTER = {
  veteran: { name: 'the Veteran', body: 'veteran', archetype: 'veteran', weapon: 'trident' },
  pitborn: { name: 'the Pitborn', body: 'pitborn', archetype: 'pitborn', weapon: 'cleaver' },
  goblin: { name: 'the Goblin', body: 'goblin', archetype: 'goblin', weapon: 'knife' },
  nightborn: { name: 'the Nightborn', body: 'nightborn', archetype: 'nightborn', weapon: 'estoc' },
  executioner: { name: 'the Executioner', body: 'executioner', archetype: 'executioner', weapon: 'scythe' },
  // hold: built and kept, but off the beta ladder and out of the beta bundle until after beta. Owner, 2026-09-20: Minotaur and
  // Werewolf are Season 2; Wraith and Skeleton held on the lead's reading of the same beta freeze (one flag each to reverse).
  // A held recipe stays a valid OpponentId so saved encounters still resolve (ladder.ts falls back).
  minotaur: { name: 'the Minotaur', body: 'minotaur', archetype: 'pitborn', weapon: 'maul', finishers: ['opened'], hold: true },
  wraith: { name: 'the Wraith', body: 'wraith', archetype: 'nightborn', weapon: 'reaper', finishers: ['opened'], hold: true },
  werewolf: { name: 'the Werewolf', body: 'werewolf', archetype: 'pitborn', weapon: 'cleaver', finishers: [], hold: true },
  skeleton: { name: 'the Skeleton', body: 'skeleton', archetype: 'veteran', weapon: 'trident', finishers: [], blood: false, hold: true },
} as const satisfies Record<string, { name: string; body: string; archetype: string; weapon: WeaponId; finishers?: readonly FinisherId[]; blood?: false; hold?: true }>;
export type OpponentId = keyof typeof ROSTER;
export function supportsFinishers(id: OpponentId, finisher?: FinisherId | null): boolean {
  const recipe = ROSTER[id];
  return !('finishers' in recipe) || (!!finisher && (recipe.finishers as readonly FinisherId[]).includes(finisher));
}
// One presentation decision for the scene and audio; the owner's picker never overrides kill eligibility.
export function resolveFinisher(id: OpponentId, finish: Finish, weapons: readonly [WeaponId, WeaponId], override: FinisherId | null = null): FinisherId | null {
  const pick = selectFinisher(finish, weapons), selected = pick && (override ?? pick);
  return selected && supportsFinishers(id, selected) ? selected : null;
}
export function hasBlood(id: OpponentId): boolean {
  const recipe = ROSTER[id];
  return !('blood' in recipe && recipe.blood === false);
}
export const isOpponentId = (id: unknown): id is OpponentId => typeof id === 'string' && Object.hasOwn(ROSTER, id);
export const isHeld = (id: OpponentId): boolean => 'hold' in ROSTER[id] && ROSTER[id].hold === true;
// The insertion order is the existing introductory encounter sequence, never a career rank. Held recipes are listed (the journal
// greys them) but are not rungs: ladder.ts skips them.
export const ENCOUNTERS = (Object.keys(ROSTER) as OpponentId[]).map(id => ({ id, name: ROSTER[id].name, hold: isHeld(id) }));
