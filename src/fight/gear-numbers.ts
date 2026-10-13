// The numbers the Gear tab's strip shows (src/core/gear-strip.ts draws whatever rows have a value): the combat constants a fighter starts with, and the gear's
// tilt in whole points from the Attack/RES table (gear-stats.ts, brief 19). A piece with no recorded rung counts as no gear (kitFrom: identity, never a guess).
// Lives here, not in src/core, because the core imports nothing from src/fight; the Pit and the zone both hand it to the sheet.
import { TIERS } from '../core/grades.ts';
import type { Loot } from '../core/loot.ts';
import { kitFrom, loadoutFor, wholePoints, wornGear, type Loadout, type TierOf } from './gear-stats.ts';
import { sheetOf, validateBuild, type Build, type Sheet } from './sheet-rows.ts';
import type { Profile } from '../core/profile.ts';
import { RULES } from './moves.ts';
import { STAMINA_MAX } from './world.ts';

// Each worn piece counts at the rung it was won at (`loot.taken[id].tier`); a piece with no recorded rung counts as nothing. One lookup for the strip's numbers and the fight's tilt.
const tierLookup = (loot: Loot | undefined): TierOf => (id) => { const level = loot?.taken?.[id]?.tier; return level ? TIERS[level - 1] : undefined; };
/** The Loadout (Attack out, RES in) a character's worn set gives: the Zone 1 hero's gear, the ONE derivation the server repeats from the held rows (origins/server/worn-gear.ts loadoutOf) to bound a world record's claim. */
export const loadoutOfLoot = (loot: Loot | undefined): Loadout => loadoutFor(kitFrom(loot?.equipped ?? {}, tierLookup(loot)));
export const gearNumbers = (loot: Loot | undefined): Record<string, number> => {
  const { atk, res } = wholePoints(loadoutFor(kitFrom(loot?.equipped ?? {}, tierLookup(loot))));
  return { health: RULES.health, stamina: STAMINA_MAX, attack: atk, res };
};

// The player's build (Wave A1 PR1b): level and the points placed on the ten dials. Backend stores it (the account / character field, written through `validateBuild`, no second validator) and Web
// builds the creation sliders on it; until the field exists every player is the default build, level 0 with every dial at its base of 0 (the re-locked sheet). The real build drops in HERE, with no sim change.
// ON (the flip, Lead + Auditor 2026-10-13, after Backend's wornGear-into-expectedSheet side is live): a geared career fight is a sheet record the sweeps verify against the stored build AND the server-held worn
// set, so it verifies and pays. The page writes a sheet only once the build reference has resolved (`sheetFor`): a fight begun before that, a guest and a character with no stored build fight without one.
export const GEAR_IN_FIGHTS: boolean = true;
// The sheet a career fight is fought on: none until the player's own stored build is known (a guest, an offline writer or an unapplied migration never learns it), then that build with the worn set.
// An illegal stored build gives none (the server would refuse it too). `own.ref` is the reference the record names; null = the default build, which a sheet with no reference claims.
export const sheetFor = (loot: Loot | undefined, own: { level: number; placed: Record<string, number> } | undefined): Sheet | undefined =>
  own && validateBuild({ level: own.level, placed: own.placed }).length === 0 ? sheetOf({ level: own.level, placed: own.placed }, wornGear(loot?.equipped ?? {}, tierLookup(loot))) : undefined;
// The sheet a signed-in career fight is fought on (Auditor 2026-10-13): the sweeps check the worn gear the SERVER holds (origins_items, frozen at settle), and a signed-in player's equips go to the server and its shadow
// (gear-server.ts), never to the device ledger `real.loot`. So the worn set is read from the server's view, and only once it has answered; until then there is no sheet (a naked fight, as before the flip).
export const fightSheet = (real: { loot?: Loot }, own: { level: number; placed: Record<string, number> } | undefined, gear: { ready(): boolean; profileFor(real: { loot?: Loot }): { loot?: Loot } } | undefined): Sheet | undefined =>
  gear?.ready() ? sheetFor(gear.profileFor(real).loot, own) : undefined;
export function buildOf(profile?: Profile): Build { void profile; return { level: 0, placed: {} }; }
// The sheet a live fight is fought with: the player's build with the worn set's deltas on top, `undefined` when nothing is off base (the naked, default-build fight, byte for byte).
export const sheetOfLoot = (loot: Loot | undefined, build: Build = buildOf()): Sheet | undefined => sheetOf(build, wornGear(loot?.equipped ?? {}, tierLookup(loot)));
