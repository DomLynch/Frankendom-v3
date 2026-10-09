// The shared fight core's public API (grows with K2: createFight). Clients (the Pit's page, Zone 1, later zones) import the fight from here.
export * from './characters.ts';
export { createFight, type Fight, type FightOptions, type FightSlot } from './fight.ts';

export * as world from './world.ts';   // the open-world loop (Zone 1 and later zones): aggro, chase, leash, pairs, step
export { SPEEDS } from './speeds.ts';
export * from '../duel.ts';
export * from '../ai.ts';
export * from '../sim.ts';
export * from '../moves.ts';
export * from '../combat.ts';
export * from '../play-radius.ts';
export * from '../record.ts';
export * from '../gear-stats.ts';
export * from '../gambit.ts';
export * from '../stance.ts';
export * from '../twist.ts';
export * from '../replay.ts';
