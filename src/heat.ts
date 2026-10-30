// HEAT (data/heat.json; Dom 2026-10-28, ported from Armagedom's wanted tally, docs/hunter-port.md). Pure rules: a kill raises it, quiet time cools it, the hero's death clears it. SESSION ONLY: nothing here
// touches the save or any storage, so the save string is byte for byte the same with or without heat. No clock of its own (callers pass the page's seconds) and no allocation per step.
import ROWS from '../data/heat.json' with { type: 'json' };
import { validateHeat as validateHeatRows } from './sim/validate-heat.js';

export type HeatStarChance = { stars: number; chance: number };
export type HeatTier = { minHeat: number; name: string; timeScale: number; hunters: number; stars: readonly HeatStarChance[] };
export type HuntRows = {
  kind: string; maxHunters: number; arrivalDelaySeconds: number; spawnCooldownSeconds: number; respawnDelaySeconds: number; minSeconds: number; warningSeconds: number; retrySeconds: number;
  spawnDistanceMetres: number; campClearMetres: number; speedMetresPerSecond: number; aggro: number; leash: number; giveUpMetres: number; parkedSeconds: number;
  lines: { warning: string; arrived: string; gone: string };
};
export type HeatRows = {
  version: number; maxHeat: number; seed: number; decay: { secondsPerMark: number };
  gain: { kill: number; perStar: number; ring: Record<string, number>; coinsPerHeat: number };
  tiers: readonly HeatTier[]; hunt: HuntRows;
  hud: { label: string; colour: string; zIndex: number; topOffsetPx: number; css: string };
  limits: Record<string, [number, number]>;
};
export const HEAT = ROWS as unknown as HeatRows;

/** The live heat: the count, when it last rose (page seconds), and the coin remainder not yet worth a mark. */
export type Heat = { count: number; lastAt: number; coinBank: number };
export const freshHeat = (): Heat => ({ count: 0, lastAt: 0, coinBank: 0 });

/** Why `rows` is not a good heat table (one string per problem; empty = fine). `ringIds`: the data/rings.json ring ids. The checks live in src/sim/validate-heat.js. */
export const validateHeat = (rows: HeatRows = HEAT, ringIds: readonly string[] = [], profileIds: readonly string[] = [], starLevels: readonly number[] = []): string[] => validateHeatRows(rows, [...ringIds], [...profileIds], [...starLevels]) as string[];

/** What one boss kill is worth: the kill, its stars, its ring (`ringId` null = none), and nothing for coins (see `addCoins`). */
export const killHeat = (rows: HeatRows, star: number, ringId: string | null): number => rows.gain.kill + rows.gain.perStar * Math.max(0, star) + (ringId ? (rows.gain.ring[ringId] ?? 0) : 0);

/** Heat goes up by `amount` (never past maxHeat) and the cooling clock restarts. */
export function addHeat(h: Heat, rows: HeatRows, amount: number, now: number): void {
  if (!(amount > 0)) return;
  h.count = Math.min(rows.maxHeat, h.count + amount);
  h.lastAt = now;
}

/** Kill coins earned count toward heat: every `coinsPerHeat` adds 1, the remainder waits in the bank. */
export function addCoins(h: Heat, rows: HeatRows, coins: number, now: number): void {
  if (!(coins > 0)) return;
  const bank = h.coinBank + coins, marks = Math.floor(bank / rows.gain.coinsPerHeat);
  h.coinBank = bank - marks * rows.gain.coinsPerHeat;
  addHeat(h, rows, marks, now);
}

/** One boss falls: its kill, stars and ring, then its coins. */
export function onKill(h: Heat, rows: HeatRows, now: number, star: number, ringId: string | null, coins: number): void {
  addHeat(h, rows, killHeat(rows, star, ringId), now);
  addCoins(h, rows, coins, now);
}

/** Cool by one mark per `secondsPerMark` without a kill. */
export function stepHeat(h: Heat, rows: HeatRows, now: number): void {
  const per = rows.decay.secondsPerMark;
  while (h.count > 0 && now - h.lastAt >= per) { h.count -= 1; h.lastAt += per; }
  if (h.count === 0) { h.lastAt = now; }
}

/** The hero died: heat is gone, the coin remainder with it. */
export function resetHeat(h: Heat, now: number): void { h.count = 0; h.coinBank = 0; h.lastAt = now; }

/** The highest tier the count has reached, or null below the first. Walks the rows from the top; nothing is copied. */
export function heatTier(h: Heat, rows: HeatRows = HEAT): HeatTier | null {
  for (let i = rows.tiers.length - 1; i >= 0; i--) if (rows.tiers[i]!.minHeat <= h.count) return rows.tiers[i]!;
  return null;
}

/** A hunt wait scaled by the tier (never below hunt.minSeconds, never above the base wait); no tier = the base wait. */
export function heatSeconds(h: Heat, seconds: number, rows: HeatRows = HEAT): number {
  const tier = heatTier(h, rows);
  return tier ? Math.min(seconds, Math.max(rows.hunt.minSeconds, seconds * tier.timeScale)) : seconds;
}

/** The hunters the tier allows at once (0 below the first tier), never past hunt.maxHunters. */
export const huntersAllowed = (h: Heat, rows: HeatRows = HEAT): number => Math.min(rows.hunt.maxHunters, heatTier(h, rows)?.hunters ?? 0);

/** Deterministic star level of the `n`th hunter to arrive: the tier's chances against a hash of the seed and `n` (no Math.random, no clock; a replay or a test rolls the same star). 0 = no star. */
export function heatStar(h: Heat, n: number, rows: HeatRows = HEAT): number {
  const tier = heatTier(h, rows);
  if (!tier || !tier.stars.length) return 0;
  let x = (rows.seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;   // a 32-bit integer mix (murmur3 finaliser), the roll in [0, 1)
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0; x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0; x = (x ^ (x >>> 16)) >>> 0;
  const roll = x / 0x100000000;
  let edge = 0;
  for (const s of tier.stars) { edge += s.chance; if (roll < edge) return s.stars; }
  return 0;
}

/** The HUD line for the count: '' at 0, else `Heat 3 · Hunted`. Built only when the count changes. */
export const heatText = (h: Heat, rows: HeatRows = HEAT): string => (h.count > 0 ? `${rows.hud.label} ${h.count} · ${heatTier(h, rows)!.name}` : '');
