import { specialOf, type SpecialName } from './moves.ts';
import type { OpponentId } from '../roster.ts';

// Pure identity bridge: #1114 names to the accepted preview keys. FX and audio
// resolve these keys outside the simulation; this module activates nothing.
const BOSS_SPECIAL_IDS = {
  quake: 'shield', charge: 'centurion', tithe: 'tithe',
  redwind: 'set', hadesshadow: 'hades', nyxnightfall: 'nyx',
  dirtyfistful: 'reynard', gone: 'hermes', threeliars: 'loki',
  crackingground: 'antaeus', ashfall: 'surtr', windwall: 'typhon',
  bayingcircle: 'arawn', longshadow: 'thanatos', harvestsweep: 'reaper',
  theword: 'dwarf8', threeblows: 'dwarf9', rimshake: 'dwarf10',
  baredface: 'shield8', thering: 'shield9', aegissweep: 'shield10',
  avalonmist: 'mist', foretoldstep: 'echo', theprice: 'price',
  plagueflies: 'flies', poisonstain: 'stain', lastbreath: 'breath',
  thesling: 'sling', wrath: 'haze', stormfollowshim: 'storm',
} as const satisfies Record<SpecialName, string>;

export type BossSpecialId = typeof BOSS_SPECIAL_IDS[SpecialName];

// Resolve the name captured by the accepted event, independently of later UI state.
export function bossSpecialId(name: SpecialName | null): BossSpecialId | null {
  return name && Object.hasOwn(BOSS_SPECIAL_IDS, name) ? BOSS_SPECIAL_IDS[name] : null;
}

export function bossSpecialFor(opponent: OpponentId, level: number): BossSpecialId | null {
  if (!Number.isInteger(level) || level < 1 || level > 50) return null;
  return bossSpecialId(specialOf(opponent, level));
}
