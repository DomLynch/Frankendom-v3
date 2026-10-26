// V3: the struck body's knee-dip (scene.ts: a landed special drops the body it strikes ~0.28 m, then it rises back over SPECIAL_STRUCK).
// Dom 2026-10-26, on the Skull Crack: the feet sinking into the sand "looks a bit cheesy", so the drop is gone (data/fight.json
// `specialSink`); a mode that LIFTS the body (Red Wind, Shield Quake) still lifts. Set by the page before the fight; ?dip=v1 = V1's drop.
let sink = true;
export const setSpecialSink = (on: boolean): void => { sink = on; };
/** The knee-dip height for a mode's `lift`: V1's as it is with the sink on, else never below the floor. */
export const specialLift = (lift: number): number => (sink ? lift : Math.max(0, lift));
