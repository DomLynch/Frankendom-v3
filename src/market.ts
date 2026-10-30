// The Flesh Market (data/market.json; Dom 2026-10-28; docs/flesh-market.md): the pure rules. The day's stock is a function of the salt and the UTC date alone (nothing the player owns or does moves it), buying and
// selling are functions from a save to a save, and every refusal is a named reason. Coins are the BANKED coins of data/corpse-run.json. No DOM, no storage, no clock (the day is passed in), no Math.random.
// The parts inventory is reached only through src/market-inventory.ts; the save field is the optional `market` (absent until the first trade, so an older save is byte for byte the same).
import { hash32 } from './fight/bout-seed.ts';
import { dayKey as utcDay } from './daily-pit.ts';
import { PARTS } from './parts.ts';
import MARKET_JSON from '../data/market.json' with { type: 'json' };
import { addPart, listParts, removePart, type InventorySave } from './market-inventory.ts';

export type MarketSave = { day: string; bought: string[]; soldToday: number; weapons: string[]; trades: number };
export type MarketFile = {
  on: boolean; query: string; value: string;
  merchant: { id: string; name: string; kind: string; body: string; dx: number; dz: number; openMetres: number; closeMetres: number; loadMetres: number };
  salt: string; stock: { size: number; slots: ('part' | 'any')[] };
  weights: { common: number; rare: number; epic: number; weapon: number } & Record<string, number>;
  price: { base: Record<string, number>; buyX: number; sellX: number; weapon: Record<string, number>; trophy: Record<string, number> };
  caps: { buyMax: number; sellPerDay: number };
  limits: { range: Record<string, [number, number]>; save: { idChars: number; weapons: number; bought: number; trades: number }; attempts: number; hashRange: number; sheetPct: number; chip: { edgeX: number; edgeY: number; headM: number; noScreen: number } };
  lines: Record<'greet' | 'buy' | 'sell' | 'broke' | 'soldOut' | 'capped' | 'restock' | 'leave', string[]>;
  events: Record<'open' | 'buy' | 'sell' | 'refuse' | 'restock', string>;
  ui: { zIndex: number; sheetHeightFrac: number; css: string[]; text: Record<string, string> };
};
/** The part of a save the market reads and writes. */
export type TradeSave = InventorySave & { banked: number; unlocked: string[]; trophies?: Record<string, number>; market?: MarketSave };
/** One of the day's items. `key` names it for the save (`part:<id>:<star>` or `weapon:<id>`). */
export type StockItem = { key: string; cls: 'part' | 'weapon'; id: string; star: number; rarity: string; price: number };
/** The two kinds of stock item, and the two refusals that have a line of their own: named once, so no branch compares a bare word. */
export const CLS = { part: 'part', weapon: 'weapon' } as const, SLOT = { part: 'part', any: 'any' } as const;
export const REFUSAL = { broke: 'broke', capped: 'capped' } as const;
export type Refusal = 'broke' | 'soldOut' | 'capped' | 'owned' | 'unknown' | 'none';
export type Trade<T> = { ok: true; save: T; price: number; item: string } | { ok: false; reason: Refusal; short?: number };

const EPOCH_DAY = '1970-01-01';
const DAY = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, ID = /^[a-z0-9][a-z0-9-]*$/;

/** The UTC date (YYYY-MM-DD) of `ms`: the stock rolls over at 00:00 UTC for everyone. */
export const dayKey = (ms: number): string => (Number.isFinite(ms) ? utcDay(ms) : EPOCH_DAY);

/** A seeded draw in [0, 1): the integer hash of the seed and a counter over its range (data/market.json limits.hashRange): the same numbers on every engine. */
function drawer(seed: string, range: number): () => number {
  let n = 0;
  return () => hash32(seed, n++) / range;
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
  const rng = drawer(`${f.salt}:${day}`, f.limits.hashRange), slots = PARTS.slots.filter((s) => s.units.length), weapons = Object.keys(f.price.weapon);
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
    for (let tries = 0; tries < f.limits.attempts; tries++) {
      const wantWeapon = slot === SLOT.any && weapons.length > 0 && rng() * (rsum + f.weights.weapon) < f.weights.weapon;
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
  if (item.cls === CLS.weapon && ownsWeapon(save, item.id)) return { ok: false, reason: 'owned' };
  if (!Number.isInteger(save.banked) || save.banked < item.price) return { ok: false, reason: 'broke', short: Math.max(0, item.price - (Number.isInteger(save.banked) ? save.banked : 0)) };
  let next: T = { ...save, banked: save.banked - item.price };
  const market: MarketSave = { ...m, bought: [...m.bought, key], trades: m.trades + 1, weapons: item.cls === CLS.weapon ? [...m.weapons, item.id] : m.weapons };
  if (item.cls === CLS.part) next = addPart(next, item.id, item.star);
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
  if (row.cls === CLS.part) next = removePart(save, row.id);
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
  const strs = (v: unknown, ok: (s: string) => boolean, max: number): string[] => (Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === 'string' && s.length <= f.limits.save.idChars && ok(s)))].slice(0, max) : []);
  const day = typeof m.day === 'string' && DAY.test(m.day) ? m.day : '1970-01-01', fresh = day === m.day;
  const weapons = strs(m.weapons, (s) => ID.test(s) && f.price.weapon[s] !== undefined, f.limits.save.weapons);
  const out: MarketSave = {
    day, bought: fresh ? strs(m.bought, (s) => /^(part:[a-z0-9-]+:[a-z_]+:[0-9]|weapon:[a-z0-9-]+)$/.test(s), f.limits.save.bought) : [],
    soldToday: fresh && typeof m.soldToday === 'number' && Number.isInteger(m.soldToday) && m.soldToday >= 0 ? Math.min(f.caps.sellPerDay, m.soldToday) : 0,
    weapons, trades: typeof m.trades === 'number' && Number.isInteger(m.trades) && m.trades >= 0 ? Math.min(f.limits.save.trades, m.trades) : 0,
  };
  return out.bought.length || out.weapons.length || out.soldToday || out.trades ? { market: out } : {};
}

export type MarketCtx = { weaponIds: readonly string[]; tiers: readonly number[] };
/** Why `f` is not a good market table (one string per problem; empty = fine). The exploit rules live here: for every rarity a sale must pay less than the rebuy of the same thing costs. */
export function validateMarket(f: MarketFile, ctx: MarketCtx): string[] {
  const e: string[] = [], num = (at: string, v: unknown, lo: number, hi: number) => { if (!(typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi)) fail(new Error(`market.${at}: a number in ${lo}..${hi}`)); };
  const whole = (at: string, v: unknown, lo: number, hi: number) => { if (!(typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi)) fail(new Error(`market.${at}: a whole number in ${lo}..${hi}`)); };
  const fail = (err: Error): void => { e.push(err.message); };   // a diagnostic about the data file, not game text
  const L = f.limits, R = (key: string): [number, number] => { const r = L?.range?.[key]; return [r?.[0] ?? 0, r?.[1] ?? 0]; };
  if (!L?.range) { fail(new Error('market.limits.range: the validator ranges are missing')); return e; }
  const word = (at: string, v: unknown, key = 'text') => { const max = R(key)[1]; if (!(typeof v === 'string' && v.trim().length > 0 && v.length <= max)) fail(new Error(`market.${at}: 1-${max} characters`)); };
  if (typeof f.on !== 'boolean') fail(new Error('market.on: true or false'));
  for (const key of ['query', 'value'] as const) if (typeof f[key] !== 'string' || !/^[a-z0-9]{1,16}$/.test(f[key])) fail(new Error(`market.${key}: 1-16 lower-case letters or digits`));
  const m = f.merchant;
  word('merchant.id', m?.id, 'name'); word('merchant.name', m?.name, 'name'); word('merchant.kind', m?.kind, 'kind'); word('merchant.body', m?.body, 'kind');
  num('merchant.dx', m?.dx, ...R('offset')); num('merchant.dz', m?.dz, ...R('offset'));
  num('merchant.openMetres', m?.openMetres, ...R('open')); num('merchant.closeMetres', m?.closeMetres, ...R('close')); num('merchant.loadMetres', m?.loadMetres, ...R('load'));
  if (m && m.closeMetres < m.openMetres) fail(new Error('market.merchant.closeMetres: at least openMetres (the sheet must not close the moment it opens)'));
  word('salt', f.salt, 'salt');
  whole('stock.size', f.stock?.size, ...R('stockSize'));
  if (!Array.isArray(f.stock?.slots) || f.stock.slots.length !== f.stock.size || f.stock.slots.some((s) => s !== SLOT.part && s !== SLOT.any)) fail(new Error('market.stock.slots: size entries, each "part" or "any"'));
  const rar = PARTS.rarities.map((r) => r.id);
  for (const r of rar) { whole(`weights.${r}`, f.weights?.[r], ...R('weight')); whole(`price.base.${r}`, f.price?.base?.[r], ...R('coins')); }
  if (rar.every((r) => f.weights?.[r] === 0)) fail(new Error('market.weights: at least one rarity weight above 0'));
  whole('weights.weapon', f.weights?.weapon, ...R('weight'));
  for (const k of Object.keys(f.price?.base ?? {})) if (!rar.includes(k)) fail(new Error(`market.price.base.${k}: not a data/parts.json rarity`));
  num('price.buyX', f.price?.buyX, ...R('buyX')); num('price.sellX', f.price?.sellX, ...R('sellX'));
  const ids = Object.keys(f.price?.weapon ?? {});
  for (const id of ids) { if (!ctx.weaponIds.includes(id)) fail(new Error(`market.price.weapon.${id}: not a weapon-defs row`)); whole(`price.weapon.${id}`, f.price.weapon[id], ...R('coins')); }
  if (!ids.length && f.weights?.weapon > 0) fail(new Error('market.weights.weapon: above 0 needs at least one price.weapon row'));
  for (const t of Object.keys(f.price?.trophy ?? {})) { if (!ctx.tiers.includes(Number(t)) || Number(t) < 1) fail(new Error(`market.price.trophy.${t}: not a star tier with a trophy`)); whole(`price.trophy.${t}`, f.price.trophy[t], ...R('coins')); }
  whole('caps.buyMax', f.caps?.buyMax, ...R('buyMax')); whole('caps.sellPerDay', f.caps?.sellPerDay, ...R('sellPerDay'));
  // No sell-then-rebuy gain: what he pays for a thing is below what he asks for it, for every rarity and every weapon, after rounding.
  if (Number.isFinite(f.price?.buyX) && Number.isFinite(f.price?.sellX)) {
    for (const r of rar) { const b = f.price.base[r]; if (typeof b === 'number' && sellPrice(f, b) >= buyPrice(f, b)) fail(new Error(`market.price: a ${r} part sells for ${sellPrice(f, b)} and rebuys for ${buyPrice(f, b)} (a sale must pay less than the rebuy)`)); }
    for (const id of ids) { const b = f.price.weapon[id]; if (typeof b === 'number' && f.caps && buyPrice(f, b) > f.caps.buyMax) fail(new Error(`market.price.weapon.${id}: asks more than caps.buyMax`)); }
    for (const r of rar) { const b = f.price.base[r]; if (typeof b === 'number' && f.caps && buyPrice(f, b) > f.caps.buyMax) fail(new Error(`market.price.base.${r}: asks more than caps.buyMax`)); }
  }
  for (const [k, rows] of Object.entries(f.lines ?? {})) if (!Array.isArray(rows) || !rows.length || rows.some((s) => typeof s !== 'string' || !s.trim() || s.length > R('text')[1])) fail(new Error(`market.lines.${k}: at least one line of ${R('text').join('-')} characters`));
  for (const [k, v] of Object.entries(f.events ?? {})) if (!/^market:[a-z]+$/.test(String(v))) fail(new Error(`market.events.${k}: "market:<word>"`));
  whole('ui.zIndex', f.ui?.zIndex, ...R('zIndex')); num('ui.sheetHeightFrac', f.ui?.sheetHeightFrac, ...R('sheetFrac'));
  for (const [k, v] of Object.entries(f.ui?.text ?? {})) word(`ui.text.${k}`, v, 'uiText');
  return e;
}

export const MARKET = MARKET_JSON as unknown as MarketFile;
/** Whether the market is on for this address: the row's `on`, or `?<query>=<value>` (default off; the flag row names the query and the value). */
export const marketOn = (search: string, f: MarketFile = MARKET): boolean => f.on || new URLSearchParams(search).get(f.query) === f.value;
