import { bandOf, type Fatigue } from './fatigue.ts';
// `?look=fatigue-preview` (a look test, presentation only: Dom 2026-10-07 via Lead). Two pieces: (1) the STAMINA BAR turns red and pulses gently in the last 10 % of stamina, with no body
// involvement (hud.ts sets `#stamina[data-low]`, style.css draws it); (2) `&stamina=8` makes the bar, the tired body and the breath READ 8 in a DUMMY SPAR so Dom sees them in seconds; the sim's stamina stays real, so every button works (v2: Dom's phone, holding the sim at 8 refused every press).
// Absent = today's game. The force is a PRESENTATION copy of the practice state (previewPractice): main.ts shows it only in a practice dummy spar with no recorder, and nothing the sim, a record, a rank or PvP reads is changed.
export const LOW_STAMINA = 10, LOW_OFF = 12;   // the last 10 % of the 0..100 bar: on at <= 10, and off only at >= 12 (hysteresis: regen ticks around the edge never flicker the bar)
export const staminaLow = (stamina: number, wasLow = false): boolean => (wasLow ? stamina < LOW_OFF : stamina <= LOW_STAMINA);
export type FatiguePreview = { force: number | null };
export function fatiguePreviewFrom(search: string): FatiguePreview | null {
  const params = new URLSearchParams(search);
  if (!(params.get('look') ?? '').split(',').includes('fatigue-preview')) return null;
  const n = Number(params.get('stamina') ?? '');
  return { force: params.has('stamina') && Number.isFinite(n) && n >= 1 && n <= 100 ? n : null };
}

// The forced display: the HUD's stamina and the player's fatigue (level 1 - force/100, so .92 at 8; the band follows) come from the force; everything else, and the sim, stay real.
export const forcedFatigue = (real: Fatigue, force: number): Fatigue => { const level = 1 - force / 100; return { ...real, level, band: bandOf(level, real.gassed, real.band) }; };
export const previewPractice = <P extends { stamina: number; fatigue: [Fatigue, Fatigue] }>(practice: P, force: number): P => ({ ...practice, stamina: force, fatigue: [forcedFatigue(practice.fatigue[0], force), practice.fatigue[1]] });
