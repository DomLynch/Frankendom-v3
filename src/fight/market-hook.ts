// The Flesh Market, the page's one entry (data/market.json, src/market.ts, src/fight/market-view.ts; docs/flesh-market.md): the merchant stands in the yard a few metres from the camp, a "Trade" chip shows while the hero is
// near, and the sheet buys and sells for BANKED coins. The save is the page's own: read through `get` at each use and written through `put` (so a corpse-run write in between is never overwritten by a stale copy).
// The merchant's body is drawn by the scene as one more standing figure (`stand()` goes to view.idleFoes). No save (?save=off) mounts nothing. Events for the commentator go out on the feel bus (data/market.json events).
import { emitFeel } from './feel.ts';
import { MARKET, buy, dayKey, lineFor, marketOf, ownsWeapon, sell, sellList, stockFor, validateMarket, type MarketFile, type Refusal } from '../market.ts';
import { PARTS, splitPart } from '../parts.ts';
import { countOf } from '../market-inventory.ts';
import { levelOf, type StarsFile } from '../stars.ts';
import type { Save } from '../progression.ts';
import { mountMarketPanel, type BuyView, type MarketModel, type SellView } from './market-view.ts';

export type MarketHookCtx = {
  get(): Save | null;
  put(save: Save): void;
  profiles: readonly { id: string; name?: string }[];
  stars: StarsFile;
  /** Is `id` a src/fight/weapon-defs.json weapon row? */
  isWeapon(id: string): boolean;
  weaponName(id: string): string;
  /** The coin cap (data/corpse-run.json coins.cap). */
  bankCap: number;
  /** The camp, the hero's start mark, in the sim's frame; the merchant stands at the camp plus the row's dx, dz. */
  camp: { x: number; z: number };
  now(): number;
  /** The screen spot of a world point (view.projectInto); false when it is behind the camera. */
  project(x: number, y: number, z: number, out: [number, number]): boolean;
};
export type MarketHook = {
  /** Every frame: the chip follows the merchant while the hero is near and alive; the sheet closes when he walks off. */
  step(hero: { x: number; z: number }, alive: boolean): void;
  /** The merchant as a standing figure for view.idleFoes. Null when there is no save. */
  stand(hero: { x: number; z: number }): { x: number; z: number; heading: number; id: string; spawn: { kind: string; body: string }; star: number; near: boolean } | null;
  remove(): void;
};

export function mountMarket(ctx: MarketHookCtx, doc: Document = document, file: MarketFile = MARKET): MarketHook {
  const bad = validateMarket(file, { weaponIds: Object.keys(file.price.weapon).filter(ctx.isWeapon), tiers: ctx.stars.levels.map((l) => l.star) });
  if (bad.length) throw new Error(`data/market.json: ${bad.join('; ')}`);
  const M = file.merchant, at = { x: ctx.camp.x + M.dx, z: ctx.camp.z + M.dz }, ids = ctx.profiles.map((p) => p.id), names = new Map(ctx.profiles.map((p) => [p.id, p.name ?? p.id]));
  const T = file.ui.text;
  let line = '', lastDay = '';
  const trades = () => ctx.get()?.market?.trades ?? 0;
  const say = (event: keyof MarketFile['lines']) => { line = lineFor(file, event, dayKey(ctx.now()), trades()); };
  const partName = (id: string): string => { const p = splitPart(id); const slot = PARTS.slots.find((s) => s.id === p?.slot); return p ? `${names.get(p.profile) ?? p.profile} ${(slot?.label ?? p.slot).toLowerCase()}` : id; };
  const trophyName = (tier: number): string => levelOf(ctx.stars, tier).trophy?.name ?? `${T.trophy} ${tier}`;
  const refuse = (reason: Refusal, key: string) => {
    say(reason === 'broke' ? 'broke' : reason === 'capped' ? 'capped' : 'soldOut');
    emitFeel(file.events.refuse, { reason, key, line });
  };

  function model(): MarketModel {
    const s = ctx.get(), day = dayKey(ctx.now());
    if (!s) return { banked: 0, line, buys: [], sells: [] };
    const m = marketOf(s, day);
    const buys: BuyView[] = stockFor(file, day, ids).map((it) => {
      const sold = m.bought.includes(it.key), owned = it.cls === 'weapon' && ownsWeapon(s, it.id);
      const rar = PARTS.rarities[it.star];
      return {
        key: it.key, name: it.cls === 'weapon' ? ctx.weaponName(it.id) : partName(it.id), tag: it.cls === 'weapon' ? T.weapon! : rar?.label ?? it.rarity, colour: it.cls === 'weapon' ? '#1b1916' : rar?.colour ?? '#7a746a',
        price: it.price, state: sold ? 'sold' : owned ? 'owned' : s.banked < it.price ? 'broke' : 'ok', ownedN: it.cls === 'part' ? countOf(s, it.id) : 0, short: Math.max(0, it.price - s.banked),
      };
    });
    const sells: SellView[] = sellList(file, s).map((r) => {
      const rar = PARTS.rarities[r.star];
      return r.cls === 'part'
        ? { key: r.key, name: partName(r.id), tag: rar?.label ?? r.rarity, colour: rar?.colour ?? '#7a746a', n: r.n, price: r.price, sure: r.star >= 1 }
        : { key: r.key, name: trophyName(Number(r.id)), tag: T.trophy!, colour: '#b7791f', n: r.n, price: r.price, sure: true };
    });
    return { banked: s.banked, line, buys, sells };
  }

  const panel = mountMarketPanel(doc as unknown as Parameters<typeof mountMarketPanel>[0], {
    rows: file,
    model,
    buy(key) {
      const s = ctx.get(); if (!s) return;
      const day = dayKey(ctx.now()), out = buy(file, s, key, day, ids);
      if (!out.ok) { refuse(out.reason, key); panel.refresh(); return; }
      ctx.put(out.save); say('buy');
      const cls = key.startsWith('weapon:') ? 'weapon' : 'part';
      emitFeel(file.events.buy, { item: out.item, class: cls, key, price: out.price, coinsLeft: out.save.banked, line });
      panel.refresh();
    },
    sell(key) {
      const s = ctx.get(); if (!s) return;
      const day = dayKey(ctx.now()), out = sell(file, s, key, day, ctx.bankCap);
      if (!out.ok) { refuse(out.reason, key); panel.refresh(); return; }
      ctx.put(out.save); say('sell');
      emitFeel(file.events.sell, { item: out.item, class: key.startsWith('trophy:') ? 'trophy' : 'part', key, price: out.price, coinsLeft: out.save.banked, line });
      panel.refresh();
    },
    onToggle(open) {
      const s = ctx.get(), day = dayKey(ctx.now());
      if (open) {
        const fresh = (s?.market?.day ?? '') !== day && lastDay !== day;
        lastDay = day; say(fresh ? 'restock' : 'greet');
        if (fresh) emitFeel(file.events.restock, { day });
        emitFeel(file.events.open, { day, stock: stockFor(file, day, ids).map((i) => i.key), line });
      } else { say('leave'); }
    },
  });

  const xy: [number, number] = [0, 0];
  return {
    step(hero, alive) {
      if (!ctx.get()) { panel.chipAt(null); return; }
      const d = Math.hypot(hero.x - at.x, hero.z - at.z);
      if (panel.isOpen() && (!alive || d > M.closeMetres)) panel.close();
      panel.chipAt(alive && d <= M.openMetres && ctx.project(at.x, 2.15, at.z, xy) ? xy : null);
    },
    stand(hero) {
      if (!ctx.get()) return null;
      return { x: at.x, z: at.z, heading: Math.atan2(hero.x - at.x, hero.z - at.z), id: `market-${M.id}`, spawn: { kind: M.kind, body: M.body }, star: 0, near: Math.hypot(hero.x - at.x, hero.z - at.z) <= M.loadMetres };
    },
    remove() { panel.remove(); },
  };
}
