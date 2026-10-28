// The Flesh Market (data/market.json; Dom 2026-10-28; docs/flesh-market.md): the pure rules. The day's stock is a function of the salt and the UTC date alone (nothing the player owns or does moves it), buying and
// selling are functions from a save to a save, and every refusal is a named reason. Coins are the BANKED coins of data/corpse-run.json. No DOM, no storage, no clock (the day is passed in), no Math.random.
// The parts inventory is reached only through src/market-inventory.ts; the save field is the optional `market` (absent until the first trade, so an older save is byte for byte the same).
import { hash32 } from './fight/bout-seed.ts';
import { PARTS } from './parts.ts';
import MARKET_JSON from '../data/market.json' with { type: 'json' };
import { addPart, listParts, removePart, type InventorySave } from './market-inventory.ts';

export type MarketSave = { day: string; bought: string[]; soldToday: number; weapons: string[]; trades: number };
export type MarketFile = {
  merchant: { id: string; name: string; kind: string; body: string; dx: number; dz: number; openMetres: number; closeMetres: number; loadMetres: number };
  salt: string; stock: { size: number; slots: ('part' | 'any')[] };
  weights: { common: number; rare: number; epic: number; weapon: number } & Record<string, number>;
  price: { base: Record<string, number>; buyX: number; sellX: number; weapon: Record<string, number>; trophy: Record<string, number> };
  caps: { buyMax: number; sellPerDay: number };
  lines: Record<'greet' | 'buy' | 'sell' | 'broke' | 'soldOut' | 'capped' | 'restock' | 'leave', string[]>;
  events: Record<'open' | 'buy' | 'sell' | 'refuse' | 'restock', string>;
  ui: { zIndex: number; sheetHeightFrac: number; text: Record<string, string> };
};
/** The part of a save the market reads and writes. */
export type TradeSave = InventorySave & { banked: number; unlocked: string[]; trophies?: Record<string, number>; market?: MarketSave };
/** One of the day's items. `key` names it for the save (`part:<id>:<star>` or `weapon:<id>`). */
export type StockItem = { key: string; cls: 'part' | 'weapon'; id: string; star: number; rarity: string; price: number };
export type Refusal = 'broke' | 'soldOut' | 'capped' | 'owned' | 'unknown' | 'none';
export type Trade<T> = { ok: true; save: T; price: number; item: string } | { ok: false; reason: Refusal; short?: number };

const DAY = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, ID = /^[a-z0-9][a-z0-9-]*$/;

/** The UTC date (YYYY-MM-DD) of `ms`: the stock rolls over at 00:00 UTC for everyone. */
export const dayKey = (ms: number): string => (Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : '1970-01-01');

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** What the merchant asks for a part of `star` or a weapon: base x buyX, rounded up. */
export const buyPrice = (f: MarketFile, base: number): number => Math.ceil(base * f.price.buyX);
/** What he pays for something worth `base`: base x sellX, rounded down. */
export const sellPrice = (f: MarketFile, base: number): number => Math.floor(base * f.price.sellX);
const rarityOf = (star: number): string => (PARTS.rarities[Math.max(0, Math.min(PARTS.rarities.length - 1, Math.floor(star) || 0))] ?? PARTS.rarities[0]!).id;
/** His price for a part owned at `star`. */
export const partSellPrice = (f: MarketFile, star: number): number => sellPrice(f, f.price.base[rarityOf(star)] ?? 0);
/** His price for one trophy of star tier `tier`. */
export const trophySellPrice = (f: MarketFile, tier: string): number => sellPrice(f, f.price.trophy[tier] ?? 0);

/** The day's stock: a pure function of the salt and the date. `profileIds`: the boss profiles whose parts he may carry (data/profiles.json order). Same arguments, same items, always. */
export function stockFor(f: MarketFile, day: string, profileIds: readonly string[]): StockItem[] {
  const rng = mulberry32(hash32(`${f.salt}:${day}`, 0)), slots = PARTS.slots.filter((s) => s.units.length), weapons = Object.keys(f.price.weapon);
  const rar = PARTS.rarities, rw = rar.map((r) => f.weights[r.id] ?? 0), rsum = rw.reduce((a, b) => a + b, 0);
  const part = (): StockItem => {
    const profile = profileIds[Math.floor(rng() * profileIds.length)]!, slot = slots[Math.floor(rng() * slots.length)]!.id;
    let r = rng() * rsum, star = 0;
    for (let i = 0; i < rw.length; i++) { if (r < rw[i]!) { star = i; break; } r -= rw[i]!; star = i; }
    const id = `${profile}:${slot}`, rarity = rar[star]!.id;
    return { key: `part:${id}:${star}`, cls: 'part', id, star, rarity, price: Math.min(f.caps.buyMax, buyPrice(f, f.price.base[rarity] ?? 0)) };
  };
  const weapon = (): StockItem => { const id = weapons[Math.floor(rng() * weapons.length)]!; return { key: `weapon:${id}`, cls: 'weapon', id, star: 0, rarity: 'weapon', price: Math.min(f.caps.buyMax, buyPrice(f, f.price.weapon[id] ?? 0)) }; };
  const out: StockItem[] = [];
  for (const slot of f.stock.slots.slice(0, f.stock.size)) {
    let item: StockItem | null = null;
    for (let tries = 0; tries < 40; tries++) {
      const wantWeapon = slot === 'any' && weapons.length > 0 && rng() * (rsum + f.weights.weapon) < f.weights.weapon;
      const next = wantWeapon ? weapon() : part();
      if (!out.some((o) => o.key === next.key)) { item = next; break; }
    }
    if (item) out.push(item);
  }
  return out;
}

/** The save's market record for `day`: yesterday's purchases and sales total are gone, the bought weapons and the trade count stay. */
export const marketOf = (save: Pick<TradeSave, 'market'>, day: string): MarketSave => {
  const m = save.market;
  return m && m.day === day ? m : { day, bought: [], soldToday: 0, weapons: m?.weapons ?? [], trades: m?.trades ?? 0 };
};
/** Does the hero own weapon `id` (unlocked by a boss, or bought)? */
export const ownsWeapon = (save: Pick<TradeSave, 'unlocked' | 'market'>, id: string): boolean => save.unlocked.includes(id) || (save.market?.weapons ?? []).includes(id);

/** Buy the stock item `key` on `day`. Spends banked coins only; one purchase per item per day; a refusal changes nothing. */
export function buy<T extends TradeSave>(f: MarketFile, save: T, key: string, day: string, profileIds: readonly string[]): Trade<T> {
  const item = stockFor(f, day, profileIds).find((s) => s.key === key), m = marketOf(save, day);
  if (!item) return { ok: false, reason: 'unknown' };
  if (m.bought.includes(key)) return { ok: false, reason: 'soldOut' };
  if (item.cls === 'weapon' && ownsWeapon(save, item.id)) return { ok: false, reason: 'owned' };
  if (!Number.isInteger(save.banked) || save.banked < item.price) return { ok: false, reason: 'broke', short: Math.max(0, item.price - (Number.isInteger(save.banked) ? save.banked : 0)) };
  let next: T = { ...save, banked: save.banked - item.price };
  const market: MarketSave = { ...m, bought: [...m.bought, key], trades: m.trades + 1, weapons: item.cls === 'weapon' ? [...m.weapons, item.id] : m.weapons };
  if (item.cls === 'part') next = addPart(next, item.id, item.star);
  return { ok: true, save: { ...next, market }, price: item.price, item: item.id };
}

/** One thing he would buy from the player. */
export type SellRow = { key: string; cls: 'part' | 'trophy'; id: string; star: number; rarity: string; n: number; price: number; worn: boolean };
/** What the player can sell and for how much: parts (all but the last copy of a worn one), then trophies by tier. */
export function sellList(f: MarketFile, save: TradeSave): SellRow[] {
  const out: SellRow[] = [];
  for (const p of listParts(save)) if (p.sellable > 0) out.push({ key: `part:${p.id}`, cls: 'part', id: p.id, star: p.star, rarity: rarityOf(p.star), n: p.sellable, price: partSellPrice(f, p.star), worn: p.sellable < p.n });
  for (const [tier, n] of Object.entries(save.trophies ?? {}).sort((a, b) => Number(a[0]) - Number(b[0]))) if (n >= 1 && f.price.trophy[tier] !== undefined) out.push({ key: `trophy:${tier}`, cls: 'trophy', id: tier, star: Number(tier), rarity: 'trophy', n, price: trophySellPrice(f, tier), worn: false });
  return out;
}

/** Sell one of `key` (`part:<id>` or `trophy:<tier>`) for banked coins; capped per UTC day and by the coin cap. A refusal changes nothing. */
export function sell<T extends TradeSave>(f: MarketFile, save: T, key: string, day: string, bankCap: number): Trade<T> {
  const row = sellList(f, save).find((r) => r.key === key), m = marketOf(save, day);
  if (!row) return { ok: false, reason: 'none' };
  if (m.soldToday + row.price > f.caps.sellPerDay || save.banked + row.price > bankCap) return { ok: false, reason: 'capped' };
  let next: T | null;
  if (row.cls === 'part') next = removePart(save, row.id);
  else { const trophies = { ...(save.trophies ?? {}) }; if ((trophies[row.id] ?? 0) <= 1) delete trophies[row.id]; else trophies[row.id] = trophies[row.id]! - 1; next = { ...save, trophies }; if (!Object.keys(trophies).length) delete next.trophies; }
  if (!next) return { ok: false, reason: 'none' };
  return { ok: true, save: { ...next, banked: save.banked + row.price, market: { ...m, soldToday: m.soldToday + row.price, trades: m.trades + 1 } }, price: row.price, item: row.id };
}

/** One of the merchant's lines for `event`, by (date, trade count): the same moment says the same thing, the next trade says the next. Never random. */
export function lineFor(f: MarketFile, event: keyof MarketFile['lines'], day: string, trades: number): string {
  const rows = f.lines[event];
  return rows.length ? rows[hash32(`${f.salt}:${day}:${event}`, trades) % rows.length]! : '';
}

/** The market field of a parsed save object, cleaned: a bad shape, an unknown weapon or a malformed day is dropped. Absent when nothing was ever traded. */
export function cleanMarket(j: { market?: unknown }, f: MarketFile = MARKET): { market?: MarketSave } {
  const m = j.market as { day?: unknown; bought?: unknown; soldToday?: unknown; weapons?: unknown; trades?: unknown } | undefined;
  if (!m || typeof m !== 'object' || Array.isArray(m)) return {};
  const strs = (v: unknown, ok: (s: string) => boolean, max: number): string[] => (Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === 'string' && s.length <= 80 && ok(s)))].slice(0, max) : []);
  const day = typeof m.day === 'string' && DAY.test(m.day) ? m.day : '1970-01-01', fresh = day === m.day;
  const weapons = strs(m.weapons, (s) => ID.test(s) && f.price.weapon[s] !== undefined, 64);
  const out: MarketSave = {
    day, bought: fresh ? strs(m.bought, (s) => /^(part:[a-z0-9-]+:[a-z_]+:[0-9]|weapon:[a-z0-9-]+)$/.test(s), 16) : [],
    soldToday: fresh && typeof m.soldToday === 'number' && Number.isInteger(m.soldToday) && m.soldToday >= 0 ? Math.min(f.caps.sellPerDay, m.soldToday) : 0,
    weapons, trades: typeof m.trades === 'number' && Number.isInteger(m.trades) && m.trades >= 0 ? Math.min(999999, m.trades) : 0,
  };
  return out.bought.length || out.weapons.length || out.soldToday || out.trades ? { market: out } : {};
}

export type MarketCtx = { weaponIds: readonly string[]; tiers: readonly number[] };
/** Why `f` is not a good market table (one string per problem; empty = fine). The exploit rules live here: for every rarity a sale must pay less than the rebuy of the same thing costs. */
export function validateMarket(f: MarketFile, ctx: MarketCtx): string[] {
  const e: string[] = [], num = (at: string, v: unknown, lo: number, hi: number) => { if (!(typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi)) e.push(`market.${at}: a number in ${lo}..${hi}`); };
  const whole = (at: string, v: unknown, lo: number, hi: number) => { if (!(typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi)) e.push(`market.${at}: a whole number in ${lo}..${hi}`); };
  const word = (at: string, v: unknown, max = 80) => { if (!(typeof v === 'string' && v.trim().length > 0 && v.length <= max)) e.push(`market.${at}: 1-${max} characters`); };
  const m = f.merchant;
  word('merchant.id', m?.id, 24); word('merchant.name', m?.name, 24); word('merchant.kind', m?.kind, 40); word('merchant.body', m?.body, 40);
  num('merchant.dx', m?.dx, -40, 40); num('merchant.dz', m?.dz, -40, 40);
  num('merchant.openMetres', m?.openMetres, 1, 20); num('merchant.closeMetres', m?.closeMetres, 1, 40); num('merchant.loadMetres', m?.loadMetres, 5, 200);
  if (m && m.closeMetres < m.openMetres) e.push('market.merchant.closeMetres: at least openMetres (the sheet must not close the moment it opens)');
  word('salt', f.salt, 40);
  whole('stock.size', f.stock?.size, 1, 6);
  if (!Array.isArray(f.stock?.slots) || f.stock.slots.length !== f.stock.size || f.stock.slots.some((s) => s !== 'part' && s !== 'any')) e.push('market.stock.slots: size entries, each "part" or "any"');
  const rar = PARTS.rarities.map((r) => r.id);
  for (const r of rar) { whole(`weights.${r}`, f.weights?.[r], 0, 1000); whole(`price.base.${r}`, f.price?.base?.[r], 1, 100000); }
  if (rar.every((r) => f.weights?.[r] === 0)) e.push('market.weights: at least one rarity weight above 0');
  whole('weights.weapon', f.weights?.weapon, 0, 1000);
  for (const k of Object.keys(f.price?.base ?? {})) if (!rar.includes(k)) e.push(`market.price.base.${k}: not a data/parts.json rarity`);
  num('price.buyX', f.price?.buyX, 1, 20); num('price.sellX', f.price?.sellX, 0, 0.5);
  const ids = Object.keys(f.price?.weapon ?? {});
  for (const id of ids) { if (!ctx.weaponIds.includes(id)) e.push(`market.price.weapon.${id}: not a weapon-defs row`); whole(`price.weapon.${id}`, f.price.weapon[id], 1, 100000); }
  if (!ids.length && f.weights?.weapon > 0) e.push('market.weights.weapon: above 0 needs at least one price.weapon row');
  for (const t of Object.keys(f.price?.trophy ?? {})) { if (!ctx.tiers.includes(Number(t)) || Number(t) < 1) e.push(`market.price.trophy.${t}: not a star tier with a trophy`); whole(`price.trophy.${t}`, f.price.trophy[t], 1, 100000); }
  whole('caps.buyMax', f.caps?.buyMax, 1, 1000000); whole('caps.sellPerDay', f.caps?.sellPerDay, 0, 1000000);
  // No sell-then-rebuy gain: what he pays for a thing is below what he asks for it, for every rarity and every weapon, after rounding.
  if (Number.isFinite(f.price?.buyX) && Number.isFinite(f.price?.sellX)) {
    for (const r of rar) { const b = f.price.base[r]; if (typeof b === 'number' && sellPrice(f, b) >= buyPrice(f, b)) e.push(`market.price: a ${r} part sells for ${sellPrice(f, b)} and rebuys for ${buyPrice(f, b)} (a sale must pay less than the rebuy)`); }
    for (const id of ids) { const b = f.price.weapon[id]; if (typeof b === 'number' && f.caps && buyPrice(f, b) > f.caps.buyMax) e.push(`market.price.weapon.${id}: asks more than caps.buyMax`); }
    for (const r of rar) { const b = f.price.base[r]; if (typeof b === 'number' && f.caps && buyPrice(f, b) > f.caps.buyMax) e.push(`market.price.base.${r}: asks more than caps.buyMax`); }
  }
  for (const [k, rows] of Object.entries(f.lines ?? {})) if (!Array.isArray(rows) || !rows.length || rows.some((s) => typeof s !== 'string' || !s.trim() || s.length > 80)) e.push(`market.lines.${k}: at least one line of 1-80 characters`);
  for (const [k, v] of Object.entries(f.events ?? {})) if (!/^market:[a-z]+$/.test(String(v))) e.push(`market.events.${k}: "market:<word>"`);
  whole('ui.zIndex', f.ui?.zIndex, 0, 1000); num('ui.sheetHeightFrac', f.ui?.sheetHeightFrac, 0.3, 0.9);
  for (const [k, v] of Object.entries(f.ui?.text ?? {})) word(`ui.text.${k}`, v, 40);
  return e;
}

export const MARKET = MARKET_JSON as unknown as MarketFile;
