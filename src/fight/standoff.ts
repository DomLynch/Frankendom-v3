// 1C standoff (Lead 2026-10-07, Dom GO; Dom picked KEEP 2026-10-07: on by default, ?standoff=0 turns it off; ships after RV29): after the versus card lifts both fighters draw in sync for
// STANDOFF_MS, no input needed. Presentation only: the sim's phases (the player is still 'sheathed' until his first press) are never written, so recordings and RV are untouched.
export const STANDOFF_MS = 800;   // about RULES.draw (42 ticks, 0.7 s) plus a breath
// The window's clock: -1 before the first start, then ms since it. start() is idempotent (the versus card's 'ready' can re-fire mid-fight after an art retry and must not
// replay the draw); restart() is the rematch's: it resets to 0, so every fight plays the draw-in.
export const standoffClock = () => {
  let age = -1;
  return { get age() { return age; }, start() { if (age < 0) age = 0; }, restart() { age = 0; }, advance(ms: number) { if (age >= 0 && age < 1e6) age += ms; } };
};
export const standoffFlag = (search: string): boolean => !/[?&]standoff=(0|off)\b/i.test(search);
// The pose both rigs show `ageMs` after the card lifts: the draw clip over the window; after it a sheathed fighter stands armed, and his own sim draw (the first press)
// is not drawn a second time: the rig goes straight to ready. The sim still spends RULES.draw ticks on that press (standoff.test.ts measures it), so he swings a beat late.
export const standoffPose = <P extends { pose: string; progress: number }>(p: P, ageMs: number): P =>
  ageMs < STANDOFF_MS ? { ...p, pose: 'draw', progress: Math.max(0, ageMs) / STANDOFF_MS } : p.pose === 'sheathed' || p.pose === 'draw' ? { ...p, pose: 'ready', progress: 1 } : p;
