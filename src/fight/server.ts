// The fight core's NODE-SAFE door (K7): re-exports only, nothing that touches three.js or the page. Server-run code (origins/server, contracts, luck, encounters, inventory, mobs, shared,
// zones/loader) verifies and rewards fights from the same sim and reaches it here; it cannot take ./index.ts, which carries the renderer-bearing pieces (hud, world loop, open-world mount).
export * from './duel.ts';
export * from './combat.ts';
export * from './moves.ts';
export * from './sim.ts';
export * from './record.ts';
export * from './replay.ts';
export * from './twist.ts';
export * from './gambit.ts';
export * from './gear-stats.ts';
export * from './play-radius.ts';
export { underRecord } from '../detmath.ts';
export { setStab, STAB_ON } from '../stab-rule.ts';
export { AFTER_HIT_TICKS, EXHAUSTED_BELOW, initialKit, kitIntent, type ChainRow, type KitRow } from '../mobkit.ts';
export { PORTRAIT_KEYS } from '../legends.ts';
export { ROSTER, isOpponentId, type OpponentId } from '../roster.ts';
