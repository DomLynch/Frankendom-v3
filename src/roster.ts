import type { WeaponId } from './moves.ts';
import type { Finish } from './duel.ts';
import { selectFinisher, type FinisherId } from './finishers.ts';

// The rig: the skeleton family a body is built on, which is the blade table it fights with (src/blade-paths.ts bladePathsByRig; the
// bake is per rig because the same knife sweeps a different arc in a goblin's hand than in a man's). 'hero' is the player skeleton and
// every body reproportioned from it. A held creature without a bake of its own stays on the hero table it has always used.
export type RigId = 'hero' | 'goblin' | 'nightborn' | 'minotaur' | 'wraith';
// Approved content recipes. Body names refer to existing offline appearance presets/GLBs;
// archetypes own combat tuning in moves.ts. Adding an individual must not add AI branches.
export const ROSTER = {
  // carries: loot pieces he wears in every fight, at every rung (presentation only; the rules are Combat's GuardProfile). Strategy (A), 2026-09-23: the scutum.
  veteran: { name: 'the Centurion', body: 'veteran', rig: 'hero', archetype: 'veteran', weapon: 'gladius', carries: ['veteran.Shield'] },
  pitborn: { name: 'the Pitborn', body: 'pitborn', rig: 'hero', archetype: 'pitborn', weapon: 'cleaver' },
  goblin: { name: 'the Goblin', body: 'goblin', rig: 'goblin', archetype: 'goblin', weapon: 'knife' },
  nightborn: { name: 'the Nightborn', body: 'nightborn', rig: 'nightborn', archetype: 'nightborn', weapon: 'estoc' },
  executioner: { name: 'the Executioner', body: 'executioner', rig: 'hero', archetype: 'executioner', weapon: 'scythe' },
  // hold: built and kept, but off the beta ladder and out of the beta bundle until after beta. Owner, 2026-09-20: Minotaur and
  // Werewolf are Season 2; Wraith and Skeleton held on the lead's reading of the same beta freeze (one flag each to reverse).
  // A held recipe stays a valid OpponentId so saved encounters still resolve (ladder.ts falls back).
  minotaur: { name: 'the Minotaur', body: 'minotaur', rig: 'minotaur', archetype: 'pitborn', weapon: 'maul', finishers: ['opened'], hold: true },
  wraith: { name: 'the Wraith', body: 'wraith', rig: 'wraith', archetype: 'nightborn', weapon: 'reaper', finishers: ['opened'], hold: true },
  werewolf: { name: 'the Werewolf', body: 'werewolf', rig: 'hero', archetype: 'pitborn', weapon: 'cleaver', finishers: [], hold: true },
  skeleton: { name: 'the Skeleton', body: 'skeleton', rig: 'hero', archetype: 'veteran', weapon: 'trident', finishers: [], blood: false, hold: true },
  // Owner 2026-09-20: the Dwarf is playable now (not held) — flip `hold: true` to park him with the other creatures.
  // Owner 2026-09-20: Dwarf kills were landing plain. Reconstructed bodies list only finishers validated on that body; the
  // Dwarf rig carries every finisher clip and each rotation outcome below was captured on him by the finisher harness.
  dwarf: { name: 'the Dwarf', body: 'dwarf', rig: 'hero', archetype: 'dwarf', weapon: 'warhammer', finishers: ['splitCrown', 'decapitation', 'runThrough', 'opened', 'plainDeath'] },   // quietOne (picker-only) failed its spray check on him — not listed
} as const satisfies Record<string, { name: string; body: string; rig: RigId; archetype: string; weapon: WeaponId; carries?: readonly string[]; finishers?: readonly FinisherId[]; blood?: false; hold?: true }>;
export type OpponentId = keyof typeof ROSTER;
export function supportsFinishers(id: OpponentId, finisher?: FinisherId | null): boolean {
  const recipe = ROSTER[id];
  return !('finishers' in recipe) || (!!finisher && (recipe.finishers as readonly FinisherId[]).includes(finisher));
}
// One presentation decision for the scene and audio; the owner's picker never overrides kill eligibility.
export function resolveFinisher(id: OpponentId, finish: Finish, weapons: readonly [WeaponId, WeaponId], override: FinisherId | null = null, previous: FinisherId | null = null): FinisherId | null {
  const pick = selectFinisher(finish, weapons, previous), selected = pick && (override ?? pick);
  return selected && supportsFinishers(id, selected) ? selected : null;
}
export function hasBlood(id: OpponentId): boolean {
  const recipe = ROSTER[id];
  return !('blood' in recipe && recipe.blood === false);
}
// The bare name, without the article the roster carries ("the Centurion" -> "Centurion"): what the HUD bars, the coaching lines and
// the versus caption say. Identifiers (the id `veteran`, the body, the archetype, LootIds like `veteran.helmet`) are untouched by a
// rename — only `name` above is player-facing.
export const bareName = (id: OpponentId): string => ROSTER[id].name.replace(/^the /, '');
export const isOpponentId = (id: unknown): id is OpponentId => typeof id === 'string' && Object.hasOwn(ROSTER, id);
export const isHeld = (id: OpponentId): boolean => 'hold' in ROSTER[id] && ROSTER[id].hold === true;
// The insertion order is the existing introductory encounter sequence, never a career rank. Held recipes are listed (the journal
// greys them) but are not rungs: ladder.ts skips them.
export const ENCOUNTERS = (Object.keys(ROSTER) as OpponentId[]).map(id => ({ id, name: ROSTER[id].name, hold: isHeld(id) }));
