// The stance picker (Strategy, 2026-10-07: "?stances=1, a look-test on the existing Pit page"; Dom 2026-10-19, option B: "icon row under your bars"): four small icons in a row under the health and stamina bars,
// always visible, the lit one is the player's stance, one tap switches it (today that starts the next fight on the pick, Match.stancePref -> nextFight; a mid-fight switch is its own PR). A caption under the row names
// both stances at the fight start, theirs and the opponent's mood. Presentation only: the pick is Match.stancePref, the sim reads it through begin() -> initialPractice, and ?stances=off never builds this panel, so every
// fight is as it was. Labels, colours, icons and the layout numbers are rows (stance-picker-defs.json, stance-picker-rows.ts); the panel sits top-left under the bars, clear of the touch controls (the joystick and
// action cluster own the bottom corners: a bottom-left panel took the joystick's presses, scripts/sparring-browser-check.mjs caught it).
import { PICKS, moodOf, type PickedStance } from './stance.ts';
import { stancePickRow, stancePickerDial } from './stance-picker-rows.ts';

// Stances are ON for everyone (Dom 2026-10-08: new features ship ON, a flag is only a kill switch): no flag, `?stances=1`, `?stances=on` and anything unrecognised pick Balanced (the id `neutral`);
// `?stances=<aggressive|defensive|trickster|neutral>` starts on that pick; `?stances=off` is the kill switch and undefines it (no stances anywhere, every fight as it was before RV34).
export const stanceFlag = (search: string): PickedStance | undefined => {
  const v = /[?&]stances=([a-z0-9]+)/.exec(search)?.[1];
  if (v === 'off') return undefined;
  return (PICKS as readonly string[]).includes(v ?? '') ? (v as PickedStance) : 'neutral';
};
export const stanceLabel = (p: PickedStance): string => stancePickRow(p).label;   // Dom 2026-10-07: the fourth stance is SHOWN as Balanced; its id stays `neutral` (the record's 2-bit code, ?stances=neutral, every pin): the row carries the label
// The reveal line: both stances at once ("Aggressive vs Defensive"), the foe's mood being the seed's draw (src/fight/stance.ts moodOf).
export const stanceReveal = (mine: PickedStance, seed: number, opponent: string): string => `You: ${stanceLabel(mine)} · ${opponent}: ${stanceLabel(moodOf(seed, opponent))}`;

export type StancePanel = { show(mine: PickedStance | undefined, seed: number, opponent: string): void };   // mine undefined = no pick yet (a fight with no stances): Balanced is lit and there is no reveal line
export function mountStancePanel(host: HTMLElement, pick: (p: PickedStance) => void, doc: Document = document): StancePanel {   // `doc`: the caller's document (the graphics harness runs main.ts with its own; a module-global `document` is undefined there)
  const dial = stancePickerDial, size = dial('buttonPx');
  const box = doc.createElement('div');
  box.id = 'stance-panel'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Stance');
  box.style.cssText = `position:fixed;left:${dial('leftPx')}px;top:${dial('topPx')}px;z-index:20;display:flex;flex-direction:column;gap:4px;color:#e8dcc4;font:12px/1.3 system-ui,sans-serif`;
  const line = doc.createElement('div'); line.id = 'stance-reveal'; line.style.cssText = `font-size:${dial('revealPx')}px;opacity:.85;text-shadow:0 1px 2px #000`;
  const row = doc.createElement('div'); row.style.cssText = `display:flex;gap:${dial('gapPx')}px`;
  const buttons = new Map<PickedStance, HTMLButtonElement>();
  for (const p of PICKS) {
    const r = stancePickRow(p);
    const b = doc.createElement('button'); b.type = 'button'; b.dataset.stance = p; b.setAttribute('aria-label', r.label);
    b.innerHTML = `<svg viewBox="0 0 24 24" width="${dial('iconPx')}" height="${dial('iconPx')}" fill="none" stroke="${r.colour}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${r.icon}"/></svg><span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">${r.label}</span>`;
    b.style.cssText = `position:relative;width:${size}px;height:${size}px;padding:0;display:flex;align-items:center;justify-content:center;color:${r.colour};background:rgba(15,12,10,.6);border:1.5px solid rgba(232,220,196,.28);border-radius:50%;cursor:pointer`;
    b.addEventListener('click', () => pick(p)); buttons.set(p, b); row.append(b);
  }
  box.append(row, line); host.append(box);
  return {
    show(mine, seed, opponent) {
      line.textContent = mine ? stanceReveal(mine, seed, opponent) : '';
      for (const [p, b] of buttons) {
        const lit = p === (mine ?? 'neutral'), colour = stancePickRow(p).colour;
        b.setAttribute('aria-pressed', String(lit)); b.style.borderColor = lit ? colour : 'rgba(232,220,196,.28)'; b.style.background = lit ? 'rgba(15,12,10,.9)' : 'rgba(15,12,10,.6)'; b.style.boxShadow = lit ? `0 0 8px ${colour}` : 'none';
      }
    },
  };
}
