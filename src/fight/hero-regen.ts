// The hero's out-of-combat regeneration in the open world (Dom 2026-10-18: "your health slowly improves when you sit idle, otherwise I just keep dying"; Strategy's shape: WoW's five-second rule + EverQuest's
// rest bonus, all rows). Pure: the world-combat loop calls `regenStep` once per fixed step with what happened in it. SANDBOX ONLY for now: the loop runs it only when the page hands in rules (the unlisted
// zones, row `regen.out-of-combat`); the Pit and every listed zone never do, so no recorded fight and no server replay moves. Donors: WoW (no regen for a few seconds after the last hit dealt or taken, then
// ticks), EQEmu (a rested, standing-still character regenerates faster than a moving one), Ultima Online (stamina comes back faster than health).
import { fxNum } from './fx-rows.ts';
import { OUT_OF_COMBAT_S } from './speeds.ts';

export type RegenRules = { readonly delayS: number; readonly healthFullS: number; readonly staminaFullS: number; readonly moveMult: number; readonly moveEpsMps: number };
/** The rules from their rows. `healthFullS` is the one dial Dom flips by feel (?regen=45|60|90). The delay is the world rule that already says how long a fighter is "in combat" (world-rules-defs.json outOfCombat). */
export const regenRules = (healthFullS?: number): RegenRules => ({
  delayS: OUT_OF_COMBAT_S, healthFullS: healthFullS ?? fxNum('regen.health-full'), staminaFullS: fxNum('regen.stamina-full'), moveMult: fxNum('regen.move-mult'), moveEpsMps: fxNum('regen.move-eps'),
});
/** Whether the rule is on for this kind of zone (row `regen.out-of-combat`: 1 = the sandbox zones, 0 = nowhere). */
export const regenOn = (unlisted: boolean): boolean => unlisted && fxNum('regen.out-of-combat') > 0;

export type Quiet = { s: number };   // seconds since the last hit dealt or taken, or since a creature last noticed him
export type Bars = { health: number; maxHealth: number; stamina: number; maxStamina: number };
export type Ctx = { fought: boolean; noticed: boolean; moving: boolean; dead: boolean };

/** One step of `dt` seconds. A hit dealt or taken, or a creature hunting him or standing inside its notice ring, resets the timer; a downed hero never regenerates. After `delayS` of quiet, health refills in
 *  `healthFullS` seconds standing still (a walk is `moveMult` of that) and stamina in `staminaFullS`. Returns the new bars; never above the max, never below what it was. */
export function regenStep(q: Quiet, dt: number, rules: RegenRules, ctx: Ctx, bars: Bars): { health: number; stamina: number } {
  if (ctx.fought || ctx.noticed || ctx.dead) { q.s = 0; return { health: bars.health, stamina: bars.stamina }; }
  q.s += dt;
  if (q.s < rules.delayS) return { health: bars.health, stamina: bars.stamina };
  const k = ctx.moving ? rules.moveMult : 1;
  return {
    health: Math.min(bars.maxHealth, bars.health + (bars.maxHealth / rules.healthFullS) * dt * k),
    stamina: Math.min(bars.maxStamina, bars.stamina + (bars.maxStamina / rules.staminaFullS) * dt * k),
  };
}
