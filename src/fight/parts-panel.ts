// The Frankendom menu (data/parts.json; Dom 2026-10-28): a small ☰ button under the radar opens a sheet listing the seven slots (head, arms, legs, torso, weapon) and the parts cut for each, with Equip / Unequip.
// DOM and injected CSS only, in the palette of V1's journal (--jb paper, --jf ink, --jl line, --ja red), no art: a part is its boss's name and a rarity chip. Nothing here touches the sim, the camera or the
// input except that the sheet and button are interactive HUD (#frank-parts, touch-router.ts), so a tap on them never turns the camera. The rows come from src/parts.ts slotViews (pure, tested).
import { slotViews, type PartsFile, type PartsSave, type SlotView } from '../parts.ts';

type Doc = { createElement(tag: string): HTMLElement; body: HTMLElement; head: HTMLElement };
export type PartsPanel = { refresh(): void; open(): void; close(): void; isOpen(): boolean; remove(): void };
export type PanelCtx = {
  rows: PartsFile;
  get(): PartsSave | null;
  /** The save with part `id` worn (or the slot emptied when `id` is null): the page writes it. */
  onEquip(slot: string, id: string | null): void;
  bossName(profile: string): string;
  trophyOf(star: number): string | null;
  /** The weapon slot: the newest boss-weapon reward, or null for the starting weapon. */
  weapon(): { name: string; boss: string } | null;
};

const CSS = (r: PartsFile) => `#frank-parts{display:contents}
#frank-parts .fp-btn{position:fixed;top:calc(env(safe-area-inset-top,0px) + ${r.button.topPx}px);right:calc(env(safe-area-inset-right,0px) + ${r.button.rightPx}px);width:${r.button.sizePx}px;height:${r.button.sizePx}px;z-index:${r.button.zIndex};border:1px solid #dcd4c6;border-radius:50%;background:#f6f2ecd9;color:#1b1916;font:600 18px/1 "Instrument Sans",Arial,sans-serif;padding:0;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
#frank-parts .fp-btn[aria-expanded=true]{background:#1b1916;color:#f6f2ea}
#frank-parts .fp-sheet{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:calc(100vw - 24px);max-width:${r.panel.maxWidthPx}px;max-height:${Math.round(r.panel.maxHeightFrac * 100)}vh;overflow-y:auto;overscroll-behavior:contain;z-index:${r.panel.zIndex};box-sizing:border-box;padding:14px 14px 16px;border-radius:14px;background:#f6f2ea;color:#1b1916;font:13px/1.35 "Instrument Sans",Arial,sans-serif;box-shadow:0 10px 40px #0009}
#frank-parts .fp-sheet[hidden]{display:none}
#frank-parts .fp-back{position:fixed;inset:0;z-index:${r.panel.zIndex - 1};background:#0000;touch-action:manipulation}
#frank-parts .fp-back[hidden]{display:none}
#frank-parts .fp-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 4px}
#frank-parts h3{margin:0;font:600 17px/1.2 Georgia,"Iowan Old Style","Times New Roman",serif}
#frank-parts .fp-hint{margin:0 0 10px;color:#7a746a;font-size:12px}
#frank-parts button{font:600 12px/1 "Instrument Sans",Arial,sans-serif;min-height:34px;padding:0 12px;border:1px solid #dcd4c6;border-radius:9px;background:#fff;color:#1b1916;cursor:pointer;touch-action:manipulation}
#frank-parts button[data-on=true]{background:#1b1916;color:#fff;border-color:#1b1916}
#frank-parts .fp-slot{margin:0 0 8px;padding:8px 10px;border:1px dashed #dcd4c6;border-radius:12px;background:#fff6}
#frank-parts .fp-slot[data-worn=true]{border-style:solid;border-color:#1b1916;background:#fff}
#frank-parts .fp-slot>b{display:flex;justify-content:space-between;gap:8px;font:600 11px/1.3 "Instrument Sans",Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#7a746a}
#frank-parts .fp-slot>b span{color:#1b1916;letter-spacing:0;text-transform:none;font-size:13px}
#frank-parts .fp-part{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:6px}
#frank-parts .fp-part div{min-width:0}
#frank-parts .fp-part strong{display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis}
#frank-parts .fp-chip{display:inline-block;margin-right:6px;padding:1px 6px;border-radius:8px;color:#fff;font-size:10.5px;font-weight:600;letter-spacing:.04em}
#frank-parts .fp-sub{color:#7a746a;font-size:11.5px}`;

/** Mounts the ☰ button and the (closed) sheet. `refresh()` redraws from `ctx.get()`; it also runs on every open and every equip. */
export function mountPartsPanel(doc: Doc, ctx: PanelCtx): PartsPanel {
  const r = ctx.rows, T = r.text;
  const style = doc.createElement('style'); style.textContent = CSS(r); doc.head.append(style);
  const root = doc.createElement('div'); root.id = 'frank-parts';
  const btn = doc.createElement('button'); btn.className = 'fp-btn'; btn.type = 'button'; btn.textContent = r.button.label; btn.setAttribute('aria-label', r.button.aria); btn.setAttribute('aria-expanded', 'false'); btn.dataset.frank = 'button';
  const sheet = doc.createElement('div'); sheet.className = 'fp-sheet'; sheet.hidden = true; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', T.title); sheet.dataset.frank = 'sheet';
  const back = doc.createElement('div'); back.className = 'fp-back'; back.hidden = true; back.dataset.frank = 'backdrop'; back.onclick = () => api.close();   // a tap outside the sheet closes it
  root.append(btn, back, sheet); doc.body.append(root);
  const el = (tag: string, cls?: string, text?: string): HTMLElement => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  function draw() {
    sheet.replaceChildren();
    const head = el('div', 'fp-head'); head.append(el('h3', undefined, T.title));
    const x = el('button', undefined, T.close) as HTMLButtonElement; x.type = 'button'; x.dataset.frank = 'close'; x.onclick = () => api.close(); head.append(x);
    sheet.append(head, el('p', 'fp-hint', T.hint));
    const save = ctx.get() ?? {};
    for (const v of slotViews(save, ctx.bossName, ctx.trophyOf, r)) sheet.append(slotBox(v));
  }
  function slotBox(v: SlotView): HTMLElement {
    const box = el('div', 'fp-slot'); box.dataset.slot = v.slot.id; box.dataset.worn = String(!!v.worn);
    if (v.slot.id === 'weapon') {
      const w = ctx.weapon(), b = el('b', undefined, v.slot.label); b.append(el('span', undefined, w ? w.name : T.weaponDefault)); box.append(b);
      if (w) box.append(el('div', 'fp-sub', `${w.boss} ${T.weaponReward}`));
      return box;
    }
    const b = el('b', undefined, v.slot.label); b.append(el('span', undefined, v.worn ? v.worn.name : v.parts.length ? T.none : T.empty)); box.append(b);
    for (const p of v.parts) {
      const row = el('div', 'fp-part'); row.dataset.part = p.id;
      const info = el('div'), name = el('strong', undefined, p.name), sub = el('span', 'fp-sub');
      const chip = el('span', 'fp-chip', p.rarity.label); chip.style.background = p.rarity.colour;
      sub.append(chip); sub.append(`x${p.n}${p.trophy ? ` · ${p.trophy}` : ''}`);
      info.append(name, sub);
      const act = el('button', undefined, p.worn ? T.unequip : T.equip) as HTMLButtonElement; act.type = 'button'; act.dataset.on = String(p.worn); act.dataset.frank = p.worn ? 'unequip' : 'equip';
      act.onclick = () => { ctx.onEquip(v.slot.id, p.worn ? null : p.id); draw(); };
      row.append(info, act); box.append(row);
    }
    return box;
  }
  const api: PartsPanel = {
    refresh() { if (!sheet.hidden) draw(); },
    open() { draw(); sheet.hidden = false; back.hidden = false; btn.setAttribute('aria-expanded', 'true'); },
    close() { sheet.hidden = true; back.hidden = true; btn.setAttribute('aria-expanded', 'false'); },
    isOpen: () => !sheet.hidden,
    remove() { root.remove(); style.remove(); },
  };
  btn.onclick = () => (api.isOpen() ? api.close() : api.open());
  return api;
}
