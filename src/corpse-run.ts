// The corpse run (data/corpse-run.json; Dom 2026-10-28, Valheim style, no URL flag of its own). Pure rules: the hero's coins (carried = unbanked, banked = safe), the ONE pile a death leaves where he fell
// (his carried coins and the weapon he carries), its retrieval, the replacement by a second death, the boss that lingers at it, and the save fields that carry all of it. The page (src/client/main.ts)
// calls these; the tests and the stills ask the same functions. The save is src/progression.ts's (one key, versioned, try/catch on every read and write): a pile of another version, or one that is not
// well-formed, is dropped and the rest of the save loads. Nothing here throws on a save value. No pile and no coins = every function returns its input object, so the game with nothing carried is the game before.
import ROWS from '../data/corpse-run.json' with { type: 'json' };
import type { Save } from './progression.ts';

/** The pile a death leaves: where he fell (the pit frame, metres), the coins he carried, the weapon he carried (null = only the fight row's own, which is never dropped), and the boss kind that killed him. */
export type Pile = { v: number; x: number; z: number; coins: number; weapon: string | null; boss: string };
type Range = [number, number];
export type CorpseRows = {
  version: number;
  coins: { perKill: number; perBoss: Record<string, number>; cap: number; hud: { carried: string; banked: string; zIndex: number } };
  bank: { radiusMetres: number; line: string };
  pile: { reachMetres: number; line: string; lineWeapon: string; lostLine: string };
  linger: { leashRadius: number; seconds: number };
  marker: { colour: string; ringPx: number; beamPx: number; widthPx: number; alpha: number; pulseSeconds: number; fadeWithinMetres: number; zIndex: number };
};
type Shipped = CorpseRows & { limits: Record<'perKill' | 'radiusMetres' | 'reachMetres' | 'leashRadius' | 'seconds' | 'ringPx' | 'beamPx' | 'widthPx' | 'alpha' | 'pulseSeconds' | 'fadeWithinMetres' | 'cap' | 'pileCoordMax' | 'lostMax', Range> };   // pileCoordMax / lostMax: the top of the range is the stored-pile coordinate bound and the most lost weapons kept
export const CORPSE = ROWS as unknown as Shipped;
type Pt = { x: number; z: number };

/** Throws on a bad row (a number outside its range, a line with no words, a colour that is no #rrggbb, a boss id that is no word). */
export function validateCorpseRun(r: Shipped = CORPSE, bossIds: readonly string[] | null = null): void {
  const L = r.limits;
  const inside = (name: string, v: unknown, [lo, hi]: Range) => { if (!(typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi)) throw new Error(`corpse-run.json ${name} ${String(v)} is not in ${lo}..${hi}`); };
  const words = (name: string, v: unknown) => { if (!(typeof v === 'string' && v.trim())) throw new Error(`corpse-run.json ${name} is a non-empty line`); };
  if (!Number.isInteger(r.version) || r.version < 1) throw new Error('corpse-run.json version is a whole number from 1');
  inside('coins.perKill', r.coins.perKill, L.perKill); inside('coins.cap', r.coins.cap, L.cap);
  for (const [id, n] of Object.entries(r.coins.perBoss)) { inside(`coins.perBoss.${id}`, n, L.perKill); if (!/^[a-z0-9_-]{1,40}$/.test(id) || (bossIds && !bossIds.includes(id))) throw new Error(`corpse-run.json coins.perBoss.${id} is no boss id`); }
  words('coins.hud.carried', r.coins.hud.carried); words('coins.hud.banked', r.coins.hud.banked); inside('coins.hud.zIndex', r.coins.hud.zIndex, [0, 1000]);
  inside('bank.radiusMetres', r.bank.radiusMetres, L.radiusMetres); words('bank.line', r.bank.line);
  inside('pile.reachMetres', r.pile.reachMetres, L.reachMetres); words('pile.line', r.pile.line); words('pile.lineWeapon', r.pile.lineWeapon); words('pile.lostLine', r.pile.lostLine);
  inside('linger.leashRadius', r.linger.leashRadius, L.leashRadius); inside('linger.seconds', r.linger.seconds, L.seconds);
  const m = r.marker;
  if (!/^#[0-9a-fA-F]{6}$/.test(m.colour)) throw new Error(`corpse-run.json marker.colour ${String(m.colour)} is not a #rrggbb colour`);
  for (const k of ['ringPx', 'beamPx', 'widthPx', 'alpha', 'pulseSeconds', 'fadeWithinMetres'] as const) inside(`marker.${k}`, m[k], L[k]);
  inside('marker.zIndex', m.zIndex, [0, 1000]);
  if (r.pile.reachMetres > r.linger.leashRadius) throw new Error('corpse-run.json pile.reachMetres is longer than linger.leashRadius');
}
validateCorpseRun();

const WORD = /^[a-z0-9_-]{1,40}$/;
const whole = (v: unknown, cap: number): number => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= cap ? v : 0);

/** The pile in a stored value, or null (wrong version, a missing or non-finite field, a word that is not one). Never throws. */
export function cleanPile(p: unknown, rows: CorpseRows = CORPSE): Pile | null {
  try {
    const o = p as Partial<Pile> | null;
    if (!o || typeof o !== 'object' || o.v !== rows.version) return null;
    if (typeof o.x !== 'number' || typeof o.z !== 'number' || !Number.isFinite(o.x) || !Number.isFinite(o.z) || Math.abs(o.x) > CORPSE.limits.pileCoordMax[1] || Math.abs(o.z) > CORPSE.limits.pileCoordMax[1]) return null;
    if (typeof o.boss !== 'string' || !WORD.test(o.boss) || !(o.weapon === null || (typeof o.weapon === 'string' && WORD.test(o.weapon)))) return null;
    const coins = whole(o.coins, rows.coins.cap);
    if (coins === 0 && o.weapon === null) return null;   // an empty pile is no pile
    return { v: rows.version, x: o.x, z: o.z, coins, weapon: o.weapon, boss: o.boss };
  } catch { return null; }
}
/** The corpse-run fields of a stored save object (anything missing or wrong is the empty value). */
export function cleanCorpse(j: { coins?: unknown; banked?: unknown; pile?: unknown; lost?: unknown }, rows: CorpseRows = CORPSE): Pick<Save, 'coins' | 'banked' | 'pile' | 'lost'> {
  const lost: string[] = [];
  if (Array.isArray(j.lost)) for (const w of j.lost) if (typeof w === 'string' && WORD.test(w) && !lost.includes(w) && lost.length < CORPSE.limits.lostMax[1]) lost.push(w);
  return { coins: whole(j.coins, rows.coins.cap), banked: whole(j.banked, rows.coins.cap), pile: cleanPile(j.pile, rows), lost };
}

/** What a boss kill pays (its own row, else the common one). */
export const coinsFor = (rows: CorpseRows, boss: string): number => rows.coins.perBoss[boss] ?? rows.coins.perKill;
const capped = (rows: CorpseRows, n: number): number => Math.min(rows.coins.cap, n);

/** The save after boss `boss` falls: its coins are carried (unbanked). Same object when it pays nothing. */
export function earn(save: Save, rows: CorpseRows, boss: string): Save {
  const n = coinsFor(rows, boss);
  return n > 0 ? { ...save, coins: capped(rows, save.coins + n) } : save;
}

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.z - b.z);
/** Is the hero (`at`) within `bank.radiusMetres` of the camp? */
export const atCamp = (rows: CorpseRows, camp: Pt, at: Pt): boolean => dist(camp, at) <= rows.bank.radiusMetres;
/** Carried coins go to the bank (the save, and the coins banked); the same save when he carries none. */
export function bank(save: Save, rows: CorpseRows): { save: Save; coins: number } {
  if (save.coins <= 0) return { save, coins: 0 };
  return { save: { ...save, coins: 0, banked: capped(rows, save.banked + save.coins) }, coins: save.coins };
}

/**
 * The hero falls at `at` carrying `weapon` (null = only the fight row's own): everything carried leaves him as the one pile and `replaced` is the older pile this loses (its coins are gone; its weapon is
 * `lost` until that boss falls again). Carrying nothing leaves no pile and loses nothing: the save is returned as it is.
 */
export function dropPile(save: Save, rows: CorpseRows, at: Pt, boss: string, weapon: string | null): { save: Save; pile: Pile | null; replaced: Pile | null } {
  if (save.coins <= 0 && weapon === null) return { save, pile: null, replaced: null };
  const pile: Pile = { v: rows.version, x: at.x, z: at.z, coins: save.coins, weapon, boss }, replaced = save.pile;
  const lost = replaced?.weapon && !save.lost.includes(replaced.weapon) ? [...save.lost, replaced.weapon] : save.lost;
  return { save: { ...save, coins: 0, pile, lost }, pile, replaced };
}
/** Is the hero within the pile's reach? */
export const inReach = (rows: CorpseRows, pile: Pile, at: Pt): boolean => dist(pile, at) <= rows.pile.reachMetres;
/** He walks over the pile: the coins come back to the carried count (capped), the weapon is his again, the pile is gone. */
export function retrieve(save: Save, rows: CorpseRows): { save: Save; coins: number; weapon: string | null } {
  const p = save.pile;
  if (!p) return { save, coins: 0, weapon: null };
  return { save: { ...save, coins: capped(rows, save.coins + p.coins), pile: null }, coins: p.coins, weapon: p.weapon };
}
/** The save as the hero CARRIES it: the weapons in the pile and the lost ones are not unlocked for him until they come back. The same object when nothing is withheld. */
export function carriedSave(save: Save): Save {
  const out = new Set<string>(save.lost); if (save.pile?.weapon) out.add(save.pile.weapon);
  if (!out.size || !save.unlocked.some((w) => out.has(w))) return save;
  return { ...save, unlocked: save.unlocked.filter((w) => !out.has(w)) };
}
/** Boss `weapon` falls again: a lost weapon is the hero's again. */
export function regain(save: Save, weapon: string): { save: Save; regained: boolean } {
  if (!save.lost.includes(weapon)) return { save, regained: false };
  return { save: { ...save, lost: save.lost.filter((w) => w !== weapon) }, regained: true };
}

/** The spot of the boss that killed him, moved to the pile with the lingering leash (the existing aggro, leash and walk-home rules do the rest). */
export const lingerSpot = <S extends Pt & { leash: number }>(rows: CorpseRows, spot: S, pile: Pt): S => ({ ...spot, x: pile.x, z: pile.z, leash: rows.linger.leashRadius });

/** `{coins}` / `{weapon}` filled into a row's line. */
export const lineOf = (template: string, vars: { coins?: number; weapon?: string }): string => template.replace('{coins}', String(vars.coins ?? 0)).replace('{weapon}', vars.weapon ?? '');

/** The marker's opacity 0..1: the row's alpha pulsing over `pulseSeconds` (never below half), fading to nothing as the hero nears the pile (he is about to take it). */
export function markerAlpha(rows: CorpseRows, distMetres: number, seconds: number): number {
  const m = rows.marker, pulse = 0.75 + 0.25 * Math.sin((seconds / m.pulseSeconds) * Math.PI * 2);
  const near = m.fadeWithinMetres > 0 ? Math.min(1, Math.max(0, (distMetres - rows.pile.reachMetres) / m.fadeWithinMetres)) : 1;
  return m.alpha * pulse * near;
}
