import type { Fighter } from './duel.ts';
import { woundText } from './stance.ts';
import { phaseText } from './sandbox-rules.ts';

// sandbox-mech: wounds, the notice. Dom 2026-10-13 (option B of the wound mockups): the moment a wound row scars a fighter, a message sits on screen for a
// few seconds ("ARM WOUNDED" and what it costs), then fades; nothing stays after. Text comes from the wound row's optional `label` / `note` columns; a row
// without a label shows nothing. Presentation only: it reads fighters' `scars`, never the sim's rules.
export const NOTICE_SECONDS = 2.6;
/** The scar ids a fighter has gained since `seen` (a shorter list than before means a new fight: everything is new again). */
export const gained = (seen: number, scars: readonly string[] | undefined): { ids: string[]; seen: number } => {
  const now = scars ?? [];
  return { ids: now.slice(now.length < seen ? 0 : seen), seen: now.length };
};

export function createWoundNotice(parent: HTMLElement = document.body) {
  const seen = [0, 0], seenPhase = [0, 0];
  let box: HTMLDivElement | undefined, left = 0;
  const show = (own: boolean, label: string, note: string) => {
    if (!box) {
      box = document.createElement('div');
      box.style.cssText = 'position:fixed;left:50%;top:22%;transform:translateX(-50%);z-index:50;pointer-events:none;text-align:center;font-family:system-ui,sans-serif;text-shadow:0 2px 8px #000;transition:opacity .5s;opacity:0';
      parent.append(box);
    }
    box.replaceChildren(Object.assign(document.createElement('div'), { textContent: (own ? '' : 'FOE: ') + label, style: `font:800 20px system-ui;letter-spacing:2px;color:${own ? '#ff6a50' : '#ffd36a'}` }), Object.assign(document.createElement('div'), { textContent: note, style: 'font:12px system-ui;color:#eee;margin-top:4px' }));
    box.style.opacity = '1'; left = NOTICE_SECONDS;
  };
  return {
    update(fighters: readonly Pick<Fighter, 'scars' | 'phases'>[], dt: number): void {
      for (const side of [0, 1]) {
        const g = gained(seen[side]!, fighters[side]?.scars); seen[side] = g.seen;
        for (const id of g.ids) { const t = woundText(id); if (t) show(side === 0, t.label, t.note); }
        const gp = gained(seenPhase[side]!, fighters[side]?.phases); seenPhase[side] = gp.seen;
        for (const id of gp.ids) { const t = phaseText(id); if (t) show(true, t.label, t.note); }   // a boss phase is the foe's, but reads as an event on the fight, not a wound on you
      }
      if (box && left > 0 && (left -= dt) <= 0) box.style.opacity = '0';
    },
  };
}
