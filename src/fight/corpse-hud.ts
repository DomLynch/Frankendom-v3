// The corpse run's two HUD parts (data/corpse-run.json): the coin count (one small line of small caps in the pickup hint's gold, like the "Unlocked" line, hidden until the hero has any coins) and the
// pile's marker (a thin ring and a beam drawn in the DOM at the pile's screen spot, from existing parts only: no art, no 3D object). Presentation only: both are pointer-events none, neither touches the
// sim, the camera or the input, and they exist only once there is something to show. The page tells them where the pile is on screen (view.project) and how far it is.
import { markerAlpha, type CorpseRows } from '../corpse-run.ts';

type Doc = { createElement(tag: string): HTMLElement; body: HTMLElement; head: HTMLElement };

type CorpseHud = {
  /** The coin line: carried and banked (nothing at all while both are 0). */
  coins(carried: number, banked: number): void;
  /** The marker at CSS pixel `xy` (null = off screen or no pile), `distMetres` from the hero, `seconds` the page clock. */
  marker(xy: readonly [number, number] | null, distMetres: number, seconds: number): void;
  remove(): void;
};

export function mountCorpseHud(doc: Doc, rows: CorpseRows): CorpseHud {
  const m = rows.marker, h = rows.coins.hud, style = doc.createElement('style');
  style.textContent = `.cr-coins{position:fixed;left:50%;top:calc(18% + 8px);transform:translateX(-50%);z-index:${h.zIndex};pointer-events:none;white-space:nowrap;color:${m.colour};opacity:0;transition:opacity .4s ease;`
    + "font:10px/1.25 Georgia,'Times New Roman',serif;font-variant-caps:all-small-caps;letter-spacing:.14em;text-shadow:0 1px 3px rgba(0,0,0,.85);user-select:none;-webkit-user-select:none}"
    + `.cr-pile{position:fixed;left:0;top:0;width:${m.ringPx}px;height:${m.ringPx * 0.4}px;margin:${-m.ringPx * 0.2}px 0 0 ${-m.ringPx / 2}px;z-index:${m.zIndex};pointer-events:none;opacity:0;border:${m.widthPx}px solid ${m.colour};border-radius:50%;will-change:transform,opacity}`
    + `.cr-pile::after{content:"";position:absolute;left:50%;bottom:50%;width:${m.widthPx}px;height:${m.beamPx}px;margin-left:${-m.widthPx / 2}px;background:linear-gradient(to top,${m.colour},transparent)}`;
  doc.head.append(style);
  let coinEl: HTMLElement | null = null, pileEl: HTMLElement | null = null, lastText = '', lastCarried = 0, lastBanked = 0;
  return {
    coins(carried, banked) {
      if (carried === lastCarried && banked === lastBanked) return;   // unchanged: no string is built (this runs every frame)
      lastCarried = carried; lastBanked = banked;
      const text = carried > 0 || banked > 0 ? `${h.carried} ${carried}${banked > 0 ? ` · ${h.banked} ${banked}` : ''}` : '';
      if (text === lastText) return;
      lastText = text;
      if (!text && !coinEl) return;
      if (!coinEl) { coinEl = doc.createElement('div'); coinEl.className = 'cr-coins'; coinEl.dataset.coins = 'true'; coinEl.setAttribute('aria-hidden', 'true'); doc.body.append(coinEl); }
      coinEl.textContent = text; coinEl.style.opacity = text ? '1' : '0';
    },
    marker(xy, distMetres, seconds) {
      if (!xy) { if (pileEl) pileEl.style.opacity = '0'; return; }
      if (!pileEl) { pileEl = doc.createElement('div'); pileEl.className = 'cr-pile'; pileEl.dataset.pile = 'true'; pileEl.setAttribute('aria-hidden', 'true'); doc.body.append(pileEl); }
      pileEl.style.transform = `translate(${xy[0].toFixed(1)}px,${xy[1].toFixed(1)}px)`;
      pileEl.style.opacity = markerAlpha(rows, distMetres, seconds).toFixed(3);
    },
    remove() { coinEl?.remove(); pileEl?.remove(); style.remove(); },
  };
}
