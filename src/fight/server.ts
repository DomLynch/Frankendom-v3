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
export { underRecord } from './detmath.ts';
export { validateBuild } from './sheet-rows.ts';   // the build field's one validation seam (origins/server/build.ts)
export type { Sheet } from './sheet-rows.ts';
export { expectedSheet, NO_BUILD, type BuildLoader } from './build-check.ts';   // a record's build reference -> the sheet it must fight with (sweeps, encounter settle)
export { setStab, STAB_ON } from './stab-rule.ts';
export { setStanceRows, STANCE_ROWS_ON } from './stance-era.ts';
export { AFTER_HIT_TICKS, EXHAUSTED_BELOW, initialKit, kitIntent, type ChainRow, type KitRow } from './mobkit.ts';
export { SPEEDS } from './speeds.ts';
export { percentOf, rollUnit } from './roll.ts';   // the roll's two draws (duel.ts already re-exports ROLL_BAND, rolledDamage); origins/luck reads them here
export { PORTRAIT_KEYS } from '../legends.ts';
export { ROSTER, isOpponentId, type OpponentId } from '../roster.ts';
export { MAX_HERO_MPS, MAX_WORLD_TICKS, decodeWorldRecord, encodeWorldRecord, replayWorldRecord, unpackWorldRecord, packWorldRecord, type WorldRecord, type RecordHero, type Replayed } from './world-record.ts';
export * from './weapon-skills.ts';
export * from './boss-spells.ts';
