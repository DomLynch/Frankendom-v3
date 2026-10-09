// The shared fight core's public API (grows with K2: createFight). Clients (the Pit's page, Zone 1, later zones) import the fight from here.
export * from './characters.ts';
export { createFight, type Fight, type FightOptions, type FightSlot } from './fight.ts';
export { actorPose, type Practice } from '../combat.ts';   // the pose a duel fighter strikes (moves into src/fight/ with the sim in K2)
