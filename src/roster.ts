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
} as const satisfies Record<string, { name: string; body: string; archetype: string; weapon: WeaponId; finishers?: false }>;
export type OpponentId = keyof typeof ROSTER;
export const isOpponentId = (id: unknown): id is OpponentId => typeof id === 'string' && Object.hasOwn(ROSTER, id);
// The insertion order is the existing introductory encounter sequence, never a career rank.
export const ENCOUNTERS = (Object.keys(ROSTER) as OpponentId[]).map(id => ({ id, name: ROSTER[id].name }));
