import { fxNum } from './fx-rows.ts';
// `?look=fatigue-preview` (a look test, presentation only: Dom 2026-10-07 via Lead). Two pieces: (1) the STAMINA BAR turns red and pulses gently in the last 10 % of stamina, with no body
// involvement (hud.ts sets `#stamina[data-low]`, style.css draws it); (2) `&stamina=8` makes the bar, the tired body and the breath READ 8 in a DUMMY SPAR so Dom sees them in seconds; the sim's stamina stays real, so every button works (v2: Dom's phone, holding the sim at 8 refused every press).
// Absent = today's game. The force is a PRESENTATION copy of the practice state (previewPractice): main.ts shows it only in a practice dummy spar with no recorder, and nothing the sim, a record, a rank or PvP reads is changed.
const LOW_STAMINA = fxNum('fatigue-preview.low-stamina'), LOW_OFF = fxNum('fatigue-preview.low-off');   // the last 10 % of the 0..100 bar: on at <= 10, and off only at >= 12 (hysteresis: regen ticks around the edge never flicker the bar)
export const staminaLow = (stamina: number, wasLow = false): boolean => (wasLow ? stamina < LOW_OFF : stamina <= LOW_STAMINA);
// The forced display: the HUD's stamina and the player's fatigue (level 1 - force/100, so .92 at 8; the band follows) come from the force; everything else, and the sim, stay real.
