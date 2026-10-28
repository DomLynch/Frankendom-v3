// The heat line (data/heat.json hud): one small line of small caps under the coin line, plain DOM text. Written only when the count changes (nothing drawn, no string built per frame: Armagedom's
// per-frame tally trap). Hidden until there is heat. Presentation only: pointer-events none, never touches the sim, the camera or the input.
import { heatText, type Heat, type HeatRows } from '../heat.ts';

type Doc = { createElement(tag: string): HTMLElement; body: HTMLElement; head: HTMLElement };
export type HeatHud = { update(h: Heat): void; remove(): void };

export function mountHeatHud(doc: Doc, rows: HeatRows): HeatHud {
  const o = rows.hud, style = doc.createElement('style');
  style.textContent = `.heat-line{position:fixed;left:50%;top:calc(18% + 8px + ${o.topOffsetPx}px);transform:translateX(-50%);z-index:${o.zIndex};pointer-events:none;white-space:nowrap;color:${o.colour};opacity:0;transition:opacity .4s ease;`
    + "font:10px/1.25 Georgia,'Times New Roman',serif;font-variant-caps:all-small-caps;letter-spacing:.14em;text-shadow:0 1px 3px rgba(0,0,0,.85);user-select:none;-webkit-user-select:none}";
  doc.head.append(style);
  let el: HTMLElement | null = null, lastCount = 0;
  return {
    update(h) {
      if (h.count === lastCount) return;   // the tier follows the count: an unchanged count builds no string (this runs every frame)
      lastCount = h.count;
      const text = heatText(h, rows);
      if (!text && !el) return;
      if (!el) { el = doc.createElement('div'); el.className = 'heat-line'; el.dataset.heat = 'true'; el.setAttribute('aria-hidden', 'true'); doc.body.append(el); }
      el.textContent = text; el.style.opacity = text ? '1' : '0';
    },
    remove() { el?.remove(); style.remove(); },
  };
}
