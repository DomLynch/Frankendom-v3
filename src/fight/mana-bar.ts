// The MANA third bar on the live HUD (RV80 default-on: the sandbox's entry.ts used to add it). Shown only while the manaMax row is on (the sandbox era); src/fight/hud.ts fills #mana and #mana-value from the player's fighter.
// Dom's pick (option B, 2026-10-15): on the phone HUD health runs full width, and stamina and mana share the row below at 50% each (rows shift down one pair).
import { MANA_MAX } from './sandbox-rules.ts';

const CSS = '#mana{--bar-color:#3f78d4}#mana::-webkit-meter-optimum-value{background:#3f78d4}#mana::-moz-meter-bar{background:#3f78d4}' +
  '@media (max-width:900px),(pointer:coarse){.combat-hud>span:nth-of-type(2){grid-column:1/-1;grid-row:4}#player-health{grid-column:1/-1;grid-row:5}#posture{grid-column:1/-1;grid-row:6}' +
  '.combat-hud>span:nth-of-type(3){grid-column:1;grid-row:7}.combat-hud>span:nth-of-type(4){grid-column:2;grid-row:7;margin:5px 0 0!important;letter-spacing:1px;line-height:12px}#stamina{grid-column:1;grid-row:8}' +
  '#mana{grid-column:2;grid-row:8}#mana::-webkit-meter-bar{background:transparent;border:0;height:4px}#mana::-webkit-meter-optimum-value{background:transparent}#mana::-moz-meter-bar{background:transparent}' +
  '#fight-rank{grid-row:9}#combat-status{grid-row:10}#loot-panel{grid-row:11}#mana-value{display:none}}';

export function mountManaBar(doc: Document = document, manaMax: number = MANA_MAX): HTMLMeterElement | null {
  const stamina = doc.getElementById('stamina');
  if (!manaMax || !stamina || doc.getElementById('mana')) return null;
  const css = doc.createElement('style'); css.textContent = CSS; doc.head.append(css);
  const caption = doc.createElement('span'); caption.className = 'meter-label'; caption.id = 'mana-label'; caption.textContent = 'MANA'; caption.setAttribute('data-mobile', 'Mana');   // the phone HUD draws the caption from data-mobile
  const value = doc.createElement('span'); value.id = 'mana-value'; value.textContent = `${manaMax} / ${manaMax}`;
  const label = doc.createElement('span'); label.append(caption, ' ', value);
  const bar = doc.createElement('meter'); bar.id = 'mana'; bar.min = 0; bar.max = manaMax; bar.value = manaMax; bar.setAttribute('aria-label', 'Your mana');
  stamina.insertAdjacentElement('afterend', bar); stamina.insertAdjacentElement('afterend', label);
  const fill = (): void => { bar.style.setProperty('--fill', `${Math.round((bar.value / (bar.max || 1)) * 100)}%`); requestAnimationFrame(fill); };   // the phone bar paints from --fill like the health and stamina bars
  requestAnimationFrame(fill);
  return bar;
}
