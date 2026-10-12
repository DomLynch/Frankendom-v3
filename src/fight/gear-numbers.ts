// The numbers the Gear tab's strip shows (src/core/gear-strip.ts draws whatever rows have a value): the combat constants a fighter starts with, and the gear's
// tilt in whole points from the Attack/RES table (gear-stats.ts, brief 19). A piece with no recorded rung counts as no gear (kitFrom: identity, never a guess).
// Lives here, not in src/core, because the core imports nothing from src/fight; the Pit and the zone both hand it to the sheet.
import { TIERS } from '../core/grades.ts';
import type { Loot } from '../core/loot.ts';
import { kitFrom, loadoutFor, wholePoints, wornGear, type TierOf } from './gear-stats.ts';
import { sheetOf, type Build, type Sheet } from './sheet-rows.ts';
import type { Profile } from '../core/profile.ts';
import { RULES } from './moves.ts';
import { STAMINA_MAX } from './world.ts';

// Each worn piece counts at the rung it was won at (`loot.taken[id].tier`); a piece with no recorded rung counts as nothing. One lookup for the strip's numbers and the fight's tilt.
const tierLookup = (loot: Loot | undefined): TierOf => (id) => { const level = loot?.taken?.[id]?.tier; return level ? TIERS[level - 1] : undefined; };
export const gearNumbers = (loot: Loot | undefined): Record<string, number> => {
  const { atk, res } = wholePoints(loadoutFor(kitFrom(loot?.equipped ?? {}, tierLookup(loot))));
  return { health: RULES.health, stamina: STAMINA_MAX, attack: atk, res };
};

// The player's build (Wave A1 PR1b): level and the points placed on the ten dials. Backend stores it (the account / character field, written through `validateBuild`, no second validator) and Web
// builds the creation sliders on it; until the field exists every player is the default build, level 1 with every dial at its base of 50. The real build drops in HERE, with no sim change.
export function buildOf(profile?: Profile): Build { void profile; return { level: 1, placed: {} }; }
// The sheet a live fight is fought with: the player's build with the worn set's deltas on top, `undefined` when nothing is off base (the naked, default-build fight, byte for byte).
export const sheetOfLoot = (loot: Loot | undefined, build: Build = buildOf()): Sheet | undefined => sheetOf(build, wornGear(loot?.equipped ?? {}, tierLookup(loot)));
