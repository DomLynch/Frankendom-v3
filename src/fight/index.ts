// The shared fight core's public API (grows with K2: createFight). Clients (the Pit's page, Zone 1, later zones) import the fight from here.
export * from './characters.ts';
export { createFight, type Fight, type FightOptions, type FightSlot } from './fight.ts';

export * as world from './world.ts';   // the open-world loop (Zone 1 and later zones): aggro, chase, leash, pairs, step
export { SPEEDS } from './speeds.ts';
export { phoneTier, pixelCap, budgetTextures, FIGHTER_TEXTURE_CAP } from './quality.ts';   // the phone tier and texture budget (K7 row 16: moved from src/quality.ts)
export { settleWithin, gateWithBound } from './warm-gate.ts';   // bounded warm-up waits (K7 row 16: moved from src/warm-gate.ts)
export * from './duel.ts';
export * from './ai.ts';
export * from './sim.ts';
export * from './moves.ts';
export * from './combat.ts';
export * from './play-radius.ts';
export * from './record.ts';
export * from './gear-stats.ts';
export * from './gambit.ts';
export * from './stance.ts';
export * from './twist.ts';
export * from './replay.ts';
export { createWorldCombat, ME, JOIN_M, MAX_STEPS, kindOf, type WorldCombatDeps, type FightMob, type MobsPort, type MobPose } from './world-combat.ts';   // Zone 1's mount of the open-world loop (any client supplies the mob layer as a port)
export { createHud, createMeters, fillMeter, paintMeter, HEAVY_MOVES, KICK_LANDS, type HudView, type MeterState } from './hud.ts';   // the combat HUD (K10: moved here from src/hud.ts, whose re-export shim is gone)
export { openAccount, openCharacter, characterFor, characterIdOf, type OpenDeps, type OpenReply } from './open.ts';   // the page's one writer `open` (K7: the zone page reaches it through here)
export { CATALOGUE, catalogueRow } from './catalogue-rows.ts';   // the character catalogue rows (K7: clients read a row through the door, not by module path)
