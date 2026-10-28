// Star bosses (data/stars.json; Dom 2026-10-28, Valheim-style, the public wiki as reference only): any boss spawn may stand as a 0-, 1- or 2-star instance with more health and damage, a bigger body and a gold glow.
// The table is data; this file is the pure rules (the page, the tests and the stills ask the same functions). The star's health and damage ride the boss as a ?tune= map (src/tune.ts), so they multiply on top of the
// profile, difficulty rows, progression escalation and ?tune=, never replace them. The roll is deterministic per spawn instance (hash32 of the spawn id and the table's salt, stepped by the spawn's own kill count): no
// Math.random, no clock, so a replay or a test rolls the same star. A boss's first encounter is 0-star (minKills). 0-star is the identity: `starTune(0)` is empty, so the fight is byte for byte the one before this file.
import { hash32 } from './fight/bout-seed.ts';
import type { TuneMap } from './tune.ts';

export type StarTell = { colour: string; intensity: number };
export type StarTrophy = { tier: number; name: string };
export type StarLevel = { star: number; healthX: number; damageX: number; scaleX: number; trophy: StarTrophy | null; tell: StarTell | null };
export type StarWeight = { base: number; perKill: number };
export type StarWeights = { id: string; star1: StarWeight; star2: StarWeight };
export type StarsFile = { minKills: number; killsCap: number; zeroWeight: number; salt: string; starGlyph: string; hudColour: string; levels: readonly StarLevel[]; weights: readonly StarWeights[] };

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Why `file` is not a good stars table (one string per problem; empty = fine). `difficultyIds`: every data/difficulty.json row id (rows and named); the weights must cover exactly those. */
export function validateStars(file: StarsFile, difficultyIds: readonly (string | number)[]): string[] {
  const e: string[] = [];
  if (!Number.isInteger(file.minKills) || file.minKills < 0 || file.minKills > 99) e.push('stars.minKills: a whole number 0 to 99');
  if (!Number.isInteger(file.killsCap) || file.killsCap < 1 || file.killsCap > 99) e.push('stars.killsCap: a whole number 1 to 99');
  if (!Number.isInteger(file.zeroWeight) || file.zeroWeight < 1 || file.zeroWeight > 10000) e.push('stars.zeroWeight: a whole number 1 to 10000');
  if (typeof file.salt !== 'string' || !/^[a-z]{1,16}$/.test(file.salt)) e.push('stars.salt: 1-16 lower-case letters');
  if (typeof file.starGlyph !== 'string' || file.starGlyph.length < 1 || file.starGlyph.length > 2) e.push('stars.starGlyph: 1-2 characters');
  if (typeof file.hudColour !== 'string' || !HEX.test(file.hudColour)) e.push('stars.hudColour: #rrggbb');
  const levels = file.levels ?? [];
  if (levels.length < 2) e.push('stars.levels: star 0 and at least one star level');
  levels.forEach((l, i) => {
    const at = `stars.levels.${i}`;
    if (l.star !== i) e.push(`${at}.star: must be ${i} (levels run 0, 1, 2 in order)`);
    for (const k of ['healthX', 'damageX'] as const) if (!(Number.isFinite(l[k]) && l[k] >= 1 && l[k] <= 4)) e.push(`${at}.${k}: 1 to 4`); else if (i > 0 && l[k] < levels[i - 1]![k]) e.push(`${at}.${k}: must not fall below the level before`);
    if (!(Number.isFinite(l.scaleX) && l.scaleX >= 1 && l.scaleX <= 2)) e.push(`${at}.scaleX: 1 to 2`); else if (i > 0 && l.scaleX < levels[i - 1]!.scaleX) e.push(`${at}.scaleX: must not fall below the level before`);
    if (i === 0) {
      if (l.healthX !== 1 || l.damageX !== 1 || l.scaleX !== 1 || l.trophy !== null || l.tell !== null) e.push(`${at}: star 0 is the identity (x1, x1, x1, no trophy, no tell)`);
      return;
    }
    if (!l.tell || !HEX.test(l.tell.colour) || !(Number.isFinite(l.tell.intensity) && l.tell.intensity > 0 && l.tell.intensity <= 2)) e.push(`${at}.tell: a #rrggbb colour and an intensity above 0 up to 2`);
    if (!l.trophy || !Number.isInteger(l.trophy.tier) || l.trophy.tier < 1 || typeof l.trophy.name !== 'string' || !l.trophy.name.trim() || l.trophy.name.length > 24) e.push(`${at}.trophy: a tier from 1 and a name of 1-24 characters`);
    else if (i > 1 && l.trophy.tier <= (levels[i - 1]!.trophy?.tier ?? 0)) e.push(`${at}.trophy.tier: must rise with the star`);
  });
  const ids = new Set<string>();
  for (const w of file.weights ?? []) {
    const at = `stars.weights.${String(w.id)}`;
    if (ids.has(String(w.id))) e.push(`${at}: a duplicate row`); else ids.add(String(w.id));
    for (const k of ['star1', 'star2'] as const) for (const f of ['base', 'perKill'] as const) if (!Number.isInteger(w[k]?.[f]) || w[k][f] < 0 || w[k][f] > 1000) e.push(`${at}.${k}.${f}: a whole number 0 to 1000`);
  }
  for (const id of difficultyIds) if (!ids.has(String(id))) e.push(`stars.weights: no row for difficulty "${String(id)}"`);
  for (const id of ids) if (!difficultyIds.map(String).includes(id)) e.push(`stars.weights.${id}: no such difficulty row`);
  return e;
}

/** The row of star level `star` (clamped to the table; 0 when the number is no level). */
export const levelOf = (file: StarsFile, star: number): StarLevel => file.levels[Number.isInteger(star) && star >= 0 && star < file.levels.length ? star : 0]!;

/** The ?tune= map one star level makes for boss `kind`: its health and damage multipliers. Star 0 is empty (the fight as before). */
export function starTune(file: StarsFile, star: number, kind: string): TuneMap {
  const l = levelOf(file, star);
  return l.star === 0 ? {} : { [kind]: { health: l.healthX, damage: l.damageX } };
}

/** The weights [0-star, 1-star, 2-star] for difficulty row `difficulty` after `kills` kills of that boss (0 when the boss has not been killed `minKills` times: only 0-star). */
export function starWeights(file: StarsFile, difficulty: string | number, kills: number): number[] {
  const row = file.weights.find((w) => String(w.id) === String(difficulty));
  if (!row || kills < file.minKills) return [file.zeroWeight, 0, 0];
  const k = Math.min(file.killsCap, Math.max(0, kills));
  return [file.zeroWeight, row.star1.base + row.star1.perKill * k, row.star2.base + row.star2.perKill * k];
}

/**
 * The star of the spawn instance `spawnId` standing for the `spawnKills`-th time (its own kills so far): deterministic, integers only. `kills`: how often that boss kind has fallen (the save's count, else this visit's).
 * A first encounter (kills below minKills) is always 0-star.
 */
export function rollStar(file: StarsFile, difficulty: string | number, spawnId: string, spawnKills: number, kills: number): number {
  const w = starWeights(file, difficulty, kills), total = w.reduce((a, b) => a + b, 0);
  let r = hash32(`${spawnId}:${file.salt}`, spawnKills) % total;
  for (let i = 0; i < w.length; i++) { if (r < w[i]!) return i; r -= w[i]!; }
  return 0;
}

/** The HUD mark for `star`: one glyph per star ('' for 0-star). */
export const starMark = (file: StarsFile, star: number): string => file.starGlyph.repeat(levelOf(file, star).star);

/** The trophy line for a kill of a `star` boss, or null (a 0-star kill drops none). */
export const trophyText = (file: StarsFile, star: number): string | null => { const t = levelOf(file, star).trophy; return t ? `Trophy: ${t.name}` : null; };
