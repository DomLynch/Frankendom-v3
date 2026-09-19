import type { WeaponId } from './moves.ts';

// Approved content recipes. Body names refer to existing offline appearance presets/GLBs;
// archetypes own combat tuning in moves.ts. Adding an individual must not add AI branches.
export const ROSTER = {
  veteran: { name: 'the Veteran', body: 'veteran', archetype: 'veteran', weapon: 'trident' },
  pitborn: { name: 'the Pitborn', body: 'pitborn', archetype: 'pitborn', weapon: 'cleaver' },
  goblin: { name: 'the Goblin', body: 'goblin', archetype: 'goblin', weapon: 'knife' },
  nightborn: { name: 'the Nightborn', body: 'nightborn', archetype: 'nightborn', weapon: 'estoc' },
  executioner: { name: 'the Executioner', body: 'executioner', archetype: 'executioner', weapon: 'scythe' },
  minotaur: { name: 'the Minotaur', body: 'minotaur', archetype: 'pitborn', weapon: 'cleaver', finishers: false },
  wraith: { name: 'the Wraith', body: 'wraith', archetype: 'nightborn', weapon: 'estoc', finishers: false },
  werewolf: { name: 'the Werewolf', body: 'werewolf', archetype: 'pitborn', weapon: 'cleaver', finishers: false },
  skeleton: { name: 'the Skeleton', body: 'skeleton', archetype: 'veteran', weapon: 'trident', finishers: false, blood: false },
} as const satisfies Record<string, { name: string; body: string; archetype: string; weapon: WeaponId; finishers?: false; blood?: false }>;
export type OpponentId = keyof typeof ROSTER;
export function supportsFinishers(id: OpponentId): boolean {
  const recipe = ROSTER[id];
  return !('finishers' in recipe && recipe.finishers === false);
}
export function hasBlood(id: OpponentId): boolean {
  const recipe = ROSTER[id];
  return !('blood' in recipe && recipe.blood === false);
}
export const isOpponentId = (id: unknown): id is OpponentId => typeof id === 'string' && Object.hasOwn(ROSTER, id);
// The insertion order is the existing introductory encounter sequence, never a career rank.
export const ENCOUNTERS = (Object.keys(ROSTER) as OpponentId[]).map(id => ({ id, name: ROSTER[id].name }));
