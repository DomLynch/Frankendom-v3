// The stance setting (Strategy, 2026-10-07: "?stances=1, a look-test on the existing Pit page"; Dom 2026-10-19: "keep stances, but NOT on the fight screen"): a standing CHARACTER SETTING in the burger menu, beside gear
// (the Gear tab, index.html #stance-menu): four buttons, the lit one is the character's stance, with a one-line effect under the row. A pick sets Match.stancePref and is kept per character on this device;
// it applies from the NEXT fight (no restart), and the buttons are disabled while a fight is running (hint "Locked in a fight"). The journal's fighter card names the current stance in its colour.
// Presentation only: the sim reads the pick through begin() -> initialPractice, and ?stances=off never builds this menu, so every fight is as it was. Labels, colours, icons, effects, texts and button sizes are rows (stance-picker-defs.json, stance-picker-rows.ts).
import { PICKS, type PickedStance } from './stance.ts';
import { stanceMenuText, stancePickRow, stancePickerDial, STANCE_PICK_ROWS } from './stance-picker-rows.ts';

// Stances are ON for everyone (Dom 2026-10-08: new features ship ON, a flag is only a kill switch): no flag, `?stances=1`, `?stances=on` and anything unrecognised pick Balanced (the id `neutral`);
// `?stances=<aggressive|defensive|trickster|neutral>` starts on that pick; `?stances=off` is the kill switch and undefines it (no stances anywhere, every fight as it was before RV34).
export const stanceFlag = (search: string): PickedStance | undefined => {
  const v = /[?&]stances=([a-z0-9]+)/.exec(search)?.[1];
  if (v === 'off') return undefined;
  return (PICKS as readonly string[]).includes(v ?? '') ? (v as PickedStance) : 'neutral';
};
export const stanceLabel = (p: PickedStance): string => stancePickRow(p).label;   // Dom 2026-10-07: the fourth stance is SHOWN as Balanced; its id stays `neutral` (the record's 2-bit code, ?stances=neutral, every pin): the row carries the label
export const stanceColour = (p: PickedStance): string => stancePickRow(p).colour;
export const stanceEffect = (p: PickedStance): string => stancePickRow(p).effect;

// The character's stored pick: one small value per character on this device (the way the equipped specials and spells are kept), validated against the record's own picks on every read; anything else reads as Balanced.
export const STANCE_KEY = 'frankendom.stance.v1';
export type StanceStore = Pick<Storage, 'getItem' | 'setItem'>;
export const isPick = (v: unknown): v is PickedStance => typeof v === 'string' && (PICKS as readonly string[]).includes(v);
export function loadStancePref(storage: StanceStore, characterId: string): PickedStance {
  try {
    const v = JSON.parse(storage.getItem(STANCE_KEY) || 'null') as { id?: unknown; pick?: unknown } | null;
    if (v && typeof v === 'object' && v.id === characterId && isPick(v.pick)) return v.pick;   // another character's pick, a stale id or a corrupt value is not this character's
  } catch { /* unreadable storage or a corrupt value: the default */ }
  return PICKS[0];
}
export function saveStancePref(storage: StanceStore, characterId: string, pick: PickedStance): boolean {
  if (!isPick(pick)) return false;
  try { storage.setItem(STANCE_KEY, JSON.stringify({ id: characterId, pick })); return true; } catch { return false; }
}
/** The page's starting pick: `?stances=off` is no stances at all; an explicit `?stances=<pick>` wins (a look test); otherwise the character's stored pick. */
export const stanceStart = (search: string, stored: PickedStance): PickedStance | undefined => {
  const flag = stanceFlag(search);
  if (flag === undefined) return undefined;
  return /[?&]stances=(aggressive|defensive|trickster|neutral)\b/.test(search) ? flag : stored;
};
/** The lock rule: a fight is running from the moment the sword is drawn until it has a finish; before Fight is tapped (sheathed) and after a result the setting is open. */
export const stanceLocked = (phase: string, finished: boolean): boolean => phase !== 'sheathed' && !finished;

export type StanceMenu = { sync(pick: PickedStance | undefined, locked: boolean): void };   // pick undefined = no stances (the kill switch): the menu is hidden
export function mountStanceMenu(host: HTMLElement, pick: (p: PickedStance) => void, doc: Document = document): StanceMenu {   // `doc`: the caller's document (the graphics harness runs main.ts with its own; a module-global `document` is undefined there)
  const size = stancePickerDial('buttonPx'), icon = stancePickerDial('iconPx');
  const heading = doc.createElement('h4'); heading.textContent = stanceMenuText('text.heading');
  const row = doc.createElement('div'); row.className = 'stance-row'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', stanceMenuText('text.heading'));
  const buttons = new Map<PickedStance, HTMLButtonElement>();
  for (const r of STANCE_PICK_ROWS) {
    const p = r.pick as PickedStance;
    const b = doc.createElement('button'); b.type = 'button'; b.dataset.stance = p; b.setAttribute('aria-label', r.label); b.className = 'stance-pick';
    b.innerHTML = `<span class="stance-icon" style="width:${size}px;height:${size}px;color:${r.colour}"><svg viewBox="0 0 24 24" width="${icon}" height="${icon}" fill="none" stroke="${r.colour}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${r.icon}"/></svg></span><span class="stance-name">${r.label}</span>`;
    b.addEventListener('click', () => { if (!b.disabled) pick(p); });
    buttons.set(p, b); row.append(b);
  }
  const effect = doc.createElement('p'); effect.className = 'stance-effect'; effect.setAttribute('role', 'status');
  const hint = doc.createElement('p'); hint.className = 'stance-hint';
  host.append(heading, row, effect, hint);
  return {
    sync(mine, locked) {
      host.hidden = mine === undefined;
      if (mine === undefined) return;
      const r = stancePickRow(mine);
      effect.textContent = r.effect; effect.style.color = r.colour;
      hint.textContent = locked ? stanceMenuText('text.locked') : stanceMenuText('text.next');
      host.dataset.locked = String(locked);
      for (const [p, b] of buttons) {
        b.setAttribute('aria-pressed', String(p === mine)); b.disabled = locked; b.setAttribute('aria-disabled', String(locked));
      }
    },
  };
}
