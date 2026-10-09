// The shared fight core's public API (grows with K2: createFight). Clients (the Pit's page, Zone 1, later zones) import the fight from here.
export * from './characters.ts';
export { actorPose, type Practice } from '../combat.ts';   // the pose a duel fighter strikes (moves into src/fight/ with the sim in K2)
export { createHud, HEAVY_MOVES, KICK_LANDS, type HudView } from './hud.ts';   // the combat HUD (K10: moved here from src/hud.ts, which re-exports it)
