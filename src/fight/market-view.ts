// The Flesh Market's chip and bottom sheet (data/market.json ui; docs/flesh-market.md section 3). DOM and injected CSS only, in the palette of the Frankendom menu (src/fight/parts-panel.ts): no art, rarity as coloured text,
// no sound, no haptics. The chip ("Trade") floats over the merchant while the hero is near; a tap opens the sheet: the merchant's line, the banked coins, a Buy and a Sell tab. Pure presentation: the rows come in as a
// model, every tap goes out as `buy(key)` / `sell(key)`, and nothing here touches the sim, the camera or the save. The root is #flesh-market (touch-router.ts INTERACTIVE_SELECTORS), so a tap on it never turns the camera.
import type { MarketFile } from '../market.ts';

type Doc = { createElement(tag: string): HTMLElement; body: HTMLElement; head: HTMLElement };
export type BuyView = { key: string; name: string; tag: string; colour: string; price: number; state: 'ok' | 'sold' | 'owned' | 'broke'; ownedN: number; short: number };
export type SellView = { key: string; name: string; tag: string; colour: string; n: number; price: number; sure: boolean };
export type MarketModel = { banked: number; line: string; buys: BuyView[]; sells: SellView[] };
export type MarketPanel = { chipAt(xy: readonly [number, number] | null): void; open(): void; close(): void; isOpen(): boolean; refresh(): void; remove(): void };
export type PanelCtx = {
  rows: MarketFile;
  model(): MarketModel;
  buy(key: string): void;
  sell(key: string): void;
  /** The sheet opened (true) or closed (false): the page says the merchant's line and tells the commentator. */
  onToggle(open: boolean): void;
};

const TAB = { buy: 'buy', sell: 'sell' } as const, ST = { ok: 'ok', sold: 'sold', owned: 'owned', broke: 'broke' } as const;   // the sheet's two tabs and a stock row's four states
const CSS = (r: MarketFile): string => r.ui.css.join('\n').replaceAll('{z1}', String(r.ui.zIndex + 1)).replaceAll('{z}', String(r.ui.zIndex)).replaceAll('{vh}', String(Math.round(r.ui.sheetHeightFrac * r.limits.sheetPct)));

/** Mounts the (hidden) chip and sheet. `chipAt` moves the chip to a screen spot (null hides it, and closes nothing); `refresh()` redraws from `ctx.model()` and runs after every trade. */
export function mountMarketPanel(doc: Doc, ctx: PanelCtx): MarketPanel {
  const T = ctx.rows.ui.text;
  const style = doc.createElement('style'); style.textContent = CSS(ctx.rows); doc.head.append(style);
  const root = doc.createElement('div'); root.id = 'flesh-market';
  const el = (tag: string, cls?: string, text?: string): HTMLElement => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const chip = el('button', 'fm-chip', T.chip!); chip.hidden = true; chip.setAttribute('aria-label', `${T.chip} - ${T.title}`); chip.dataset.market = 'chip';
  const back = el('div', 'fm-back'); back.hidden = true; back.dataset.market = 'back';
  const sheet = el('div', 'fm-sheet'); sheet.hidden = true; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', T.title!); sheet.dataset.market = 'sheet';
  root.append(chip, back, sheet); doc.body.append(root);
  let tab: 'buy' | 'sell' = 'buy', isOpen = false, sureKey = '';

  function draw() {
    const m = ctx.model();
    sheet.replaceChildren();
    const head = el('div', 'fm-head'), title = el('h3', undefined, T.title), close = el('button', 'fm-close', T.close); close.dataset.market = 'close'; close.onclick = () => api.close();
    head.append(title, close);
    const line = el('p', 'fm-line', m.line); line.dataset.market = 'line';
    const bar = el('div', 'fm-bar'), banked = el('b', undefined, `${T.banked} ${m.banked}`); banked.dataset.market = 'banked';
    const tabs = el('span');
    for (const t of [TAB.buy, TAB.sell]) {
      const b = el('button', undefined, t === TAB.buy ? T.tabBuy : T.tabSell); b.dataset.market = `tab-${t}`; b.dataset.on = String(tab === t); b.onclick = () => { tab = t; sureKey = ''; draw(); };
      b.style.marginLeft = '6px'; tabs.append(b);
    }
    bar.append(banked, tabs);
    const list = el('div', 'fm-list'); list.dataset.market = 'list';
    if (tab === TAB.buy) {
      if (!m.buys.length) list.append(el('div', 'fm-empty', T.none));
      for (const b of m.buys) {
        const row = el('div', 'fm-row'); row.dataset.market = 'row'; row.dataset.key = b.key;
        const left = el('div'), name = el('strong', undefined, b.name), tag = el('span', 'fm-chiptag', b.tag); tag.style.background = b.colour;
        const sub = el('span', 'fm-sub', b.state === ST.owned ? `${T.owned} - ${b.price} ${T.coins}` : b.ownedN > 0 ? `${(T.ownedN ?? '').replace('{n}', String(b.ownedN))} - ${b.price} ${T.coins}` : `${b.price} ${T.coins}`);
        const sub2 = el('div'); sub2.append(tag, sub); left.append(name, sub2);
        const act = el('button', 'fm-act', b.state === ST.sold ? T.sold : b.state === ST.owned ? T.owned : b.state === ST.broke ? (T.short ?? '').replace('{n}', String(b.short)) : T.buy);
        act.dataset.market = 'buy'; act.dataset.key = b.key; (act as HTMLButtonElement).disabled = b.state !== ST.ok;
        act.onclick = () => { if (b.state === ST.ok) ctx.buy(b.key); };
        row.append(left, act); list.append(row);
      }
    } else {
      if (!m.sells.length) list.append(el('div', 'fm-empty', T.nothing));
      for (const s of m.sells) {
        const row = el('div', 'fm-row'); row.dataset.market = 'row'; row.dataset.key = s.key;
        const left = el('div'), name = el('strong', undefined, s.n > 1 ? `${s.name} x${s.n}` : s.name), tag = el('span', 'fm-chiptag', s.tag); tag.style.background = s.colour;
        const sub = el('span', 'fm-sub', `${s.price} ${T.coins}`), sub2 = el('div'); sub2.append(tag, sub); left.append(name, sub2);
        const act = el('button', 'fm-act', sureKey === s.key ? T.sure : T.sell); act.dataset.market = 'sell'; act.dataset.key = s.key;
        act.onclick = () => { if (s.sure && sureKey !== s.key) { sureKey = s.key; draw(); return; } sureKey = ''; ctx.sell(s.key); };
        row.append(left, act); list.append(row);
      }
    }
    sheet.append(head, line, bar, list);
  }

  const api: MarketPanel = {
    chipAt(xy) {
      if (!xy || isOpen) { chip.hidden = true; return; }
      chip.hidden = false; chip.style.transform = `translate(${Math.round(xy[0])}px,${Math.round(xy[1])}px) translate(-50%,-50%)`;   // centred on the merchant's head whatever the chip's width
    },
    open() { if (isOpen) return; isOpen = true; tab = 'buy'; sureKey = ''; chip.hidden = true; back.hidden = false; sheet.hidden = false; ctx.onToggle(true); draw(); chip.setAttribute('aria-expanded', 'true'); },
    close() { if (!isOpen) return; isOpen = false; back.hidden = true; sheet.hidden = true; chip.setAttribute('aria-expanded', 'false'); ctx.onToggle(false); },
    isOpen: () => isOpen,
    refresh() { if (isOpen) draw(); },
    remove() { root.remove(); style.remove(); },
  };
  chip.onclick = () => api.open();
  back.onclick = () => api.close();
  return api;
}
