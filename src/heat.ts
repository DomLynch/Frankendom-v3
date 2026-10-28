// HEAT (data/heat.json; Dom 2026-10-28, ported from Armagedom's wanted tally, docs/hunter-port.md). Pure rules: a kill raises it, quiet time cools it, the hero's death clears it. SESSION ONLY: nothing here
// touches the save or any storage, so the save string is byte for byte the same with or without heat. No clock of its own (callers pass the page's seconds) and no allocation per step.
import ROWS from '../data/heat.json' with { type: 'json' };

export type HeatTier = { minHeat: number; name: string };
export type HeatRows = {
  version: number; maxHeat: number; decay: { secondsPerMark: number };
  gain: { kill: number; perStar: number; ring: Record<string, number>; coinsPerHeat: number };
  tiers: readonly HeatTier[];
  hud: { label: string; colour: string; zIndex: number; topOffsetPx: number };
  limits: Record<string, [number, number]>;
};
export const HEAT = ROWS as unknown as HeatRows;

/** The live heat: the count, when it last rose (page seconds), and the coin remainder not yet worth a mark. */
export type Heat = { count: number; lastAt: number; coinBank: number };
export const freshHeat = (): Heat => ({ count: 0, lastAt: 0, coinBank: 0 });

/** Why `rows` is not a good heat table (one string per problem; empty = fine). `ringIds`: the data/rings.json ring ids. */
export function validateHeat(rows: HeatRows = HEAT, ringIds: readonly string[] = []): string[] {
  const e: string[] = [], L = rows.limits;
  const inside = (name: string, v: unknown, key: string, whole = true): void => {
    const r = L?.[key];
    if (!r || !(typeof v === 'number' && Number.isFinite(v) && v >= r[0] && v <= r[1] && (!whole || Number.isInteger(v)))) e.push(`heat.${name}: ${String(v)} is not ${whole ? 'a whole number ' : ''}in ${r ? `${r[0]}..${r[1]}` : 'a limits row'}`);
  };
  if (!Number.isInteger(rows.version) || rows.version < 1) e.push('heat.version: a whole number from 1');
  inside('maxHeat', rows.maxHeat, 'maxHeat');
  inside('decay.secondsPerMark', rows.decay?.secondsPerMark, 'secondsPerMark', false);
  inside('gain.kill', rows.gain?.kill, 'gain'); inside('gain.perStar', rows.gain?.perStar, 'gain'); inside('gain.coinsPerHeat', rows.gain?.coinsPerHeat, 'coinsPerHeat');
  for (const [id, n] of Object.entries(rows.gain?.ring ?? {})) { if (!ringIds.includes(id)) e.push(`heat.gain.ring.${id}: no data/rings.json ring`); inside(`gain.ring.${id}`, n, 'gain'); }
  if (!Array.isArray(rows.tiers) || !rows.tiers.length) e.push('heat.tiers: at least one tier');
  let last = 0;
  for (const t of rows.tiers ?? []) {
    inside(`tiers.${String(t.name)}.minHeat`, t.minHeat, 'minHeat');
    if (t.minHeat <= last) e.push(`heat.tiers.${String(t.name)}: tiers ascend (minHeat ${t.minHeat} is not above ${last})`);
    if (typeof t.name !== 'string' || !t.name.trim() || t.name.length > 16) e.push('heat.tiers.name: 1-16 characters');
    last = t.minHeat;
  }
  if (rows.tiers?.length && rows.tiers[0]!.minHeat !== 1) e.push('heat.tiers: the first tier starts at heat 1');
  if (rows.tiers?.length && rows.tiers[rows.tiers.length - 1]!.minHeat > rows.maxHeat) e.push('heat.maxHeat: below the top tier, which could never be reached');
  const h = rows.hud;
  if (!h || typeof h.label !== 'string' || !h.label.trim() || h.label.length > 12) e.push('heat.hud.label: 1-12 characters');
  if (!h || !/^#[0-9a-fA-F]{6}$/.test(h.colour)) e.push('heat.hud.colour: #rrggbb');
  if (h) { inside('hud.zIndex', h.zIndex, 'zIndex'); inside('hud.topOffsetPx', h.topOffsetPx, 'topOffsetPx'); }
  return e;
}

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

/** The HUD line for the count: '' at 0, else `Heat 3 · Hunted`. Built only when the count changes. */
export const heatText = (h: Heat, rows: HeatRows = HEAT): string => (h.count > 0 ? `${rows.hud.label} ${h.count} · ${heatTier(h, rows)!.name}` : '');
