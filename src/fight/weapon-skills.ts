// The sheet skill a win with each weapon practises (weapon-defs.json `skill`, one row each; a new weapon class is one row). Not on the Weapon and not in the sim: it moves no fight.
import WEAPON_DEFS from './weapon-defs.json' with { type: 'json' };

export const WEAPON_PRACTICE_SKILL: Readonly<Record<string, string>> = Object.fromEntries(
  (WEAPON_DEFS.weapons as readonly { id: string; skill?: string }[]).filter((w) => typeof w.skill === 'string').map((w) => [w.id, w.skill as string]));
