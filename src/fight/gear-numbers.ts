// The numbers the Gear tab's strip shows (src/core/gear-strip.ts draws whatever rows have a value): the combat constants a fighter starts with, and the gear's
// tilt in whole points from the Attack/RES table (gear-stats.ts, brief 19). A piece with no recorded rung counts as no gear (kitFrom: identity, never a guess).
// Lives here, not in src/core, because the core imports nothing from src/fight; the Pit and the zone both hand it to the sheet.
import { TIERS } from '../core/grades.ts';
import type { Loot } from '../core/loot.ts';
import { kitFrom, loadoutFor, wholePoints } from './gear-stats.ts';
import { RULES } from './moves.ts';
import { STAMINA_MAX } from './world.ts';

export const gearNumbers = (loot: Loot | undefined): Record<string, number> => {
  const { atk, res } = wholePoints(loadoutFor(kitFrom(loot?.equipped ?? {}, (id) => { const level = loot?.taken?.[id]?.tier; return level ? TIERS[level - 1] : undefined; })));
  return { health: RULES.health, stamina: STAMINA_MAX, attack: atk, res };
};
