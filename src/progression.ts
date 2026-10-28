// Progression and saving (data/progression.json; Dom 2026-10-28): each boss killed unlocks a player weapon, the kills make every boss tougher (capped), and all of it is saved in
// localStorage so a reload carries on. The table is data; this file is the pure rules (the page, the tests and the stills ask the same functions). The escalation is laid over the bosses as a
// ?tune= map (src/tune.ts), so it multiplies the profile and difficulty rows' own scales and never replaces them. No kills = an empty map, `mergeTune` returns the page's tune object itself and
// `heroWeapon` returns the fight row's weapon: the game with no save is byte for byte the game before this file. Storage is never trusted: every read and write is inside try/catch, a
// missing, blocked, corrupt or wrong-version save is a fresh game, and nothing here throws or touches any key but the table's own.
import type { TuneMap } from './tune.ts';
import { cleanCorpse, type Pile } from './corpse-run.ts';
import { cleanParts, type PartRow } from './parts.ts';   // Frankendom parts (data/parts.json): optional `parts` / `equipped` save fields
import { cleanDaily, type DailyRecord } from './daily-pit.ts';
import { cleanGolden, type GoldenSave } from './zone/golden-drops.ts';

export type BossRow = { id: string; weapon: string; name: string; healthStep: number; damageStep: number };
export type ProgressionFile = { query: string; off: string; key: string; version: number; weaponQuery: string; autoEquip: boolean; lineSeconds: number; healthCap: number; damageCap: number; bosses: readonly BossRow[] };
/** The save: `kills` per boss id, `ladder` the boss ids in the order each was first killed, `unlocked` the weapons that opened (always the ladder's weapons, in ladder order). */
/** The corpse run's fields (data/corpse-run.json, src/corpse-run.ts) ride in the same save: `coins` carried (unbanked), `banked`, the ONE `pile` a death left, and `lost` weapons (a replaced pile's) until their boss falls again. */
export type Save = { v: number; kills: Record<string, number>; ladder: string[]; unlocked: string[]; trophies?: Record<string, number>; coins: number; banked: number; pile: Pile | null; lost: string[]; daily?: DailyRecord; golden?: GoldenSave; parts?: Record<string, PartRow>; equipped?: Record<string, string> };   // golden (data/golden-weapons.json, src/zone/golden-drops.ts): absent in a save from before it. parts / equipped (src/parts.ts): absent until the first cut part, so an older save is byte for byte the same. daily (data/daily-pit.json, src/daily-pit.ts): today's Daily Pit attempts and best, absent until the first attempt, so an old save loads as it was. trophies (data/stars.json): star kills per trophy tier; absent until the first star kill, so a save without stars is byte for byte the one before
/** The slice of Storage this module uses (a test passes a Map-backed one). */
export type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void };

/** Why `file` is not a good progression table (one string per problem; empty = fine). `profileIds`: the data/profiles.json row ids; `isWeapon`: whether a weapon-defs.json row exists. */
export function validateProgression(file: ProgressionFile, profileIds: readonly string[], isWeapon: (id: string) => boolean): string[] {
  const e: string[] = [];
  for (const k of ['query', 'off', 'weaponQuery'] as const) if (typeof file[k] !== 'string' || !/^[a-z]+$/.test(file[k])) e.push(`progression.${k}: a lower-case word`);
  if (typeof file.key !== 'string' || !/^[A-Za-z0-9._-]{3,60}$/.test(file.key)) e.push('progression.key: 3-60 letters, digits, . _ -');
  if (typeof file.autoEquip !== 'boolean') e.push('progression.autoEquip: true or false (false = a kill saves its weapon but the hero keeps the fight row weapon)');
  if (!Number.isInteger(file.version) || file.version < 1) e.push('progression.version: a whole number from 1');
  if (!(Number.isFinite(file.lineSeconds) && file.lineSeconds > 0 && file.lineSeconds <= 60)) e.push('progression.lineSeconds: 0 to 60');
  for (const k of ['healthCap', 'damageCap'] as const) if (!(Number.isFinite(file[k]) && file[k] >= 1 && file[k] <= 4)) e.push(`progression.${k}: 1 to 4 (a multiplier; 1 = no escalation)`);
  const seen = new Set<string>(), weapons = new Set<string>();
  if (!Array.isArray(file.bosses) || !file.bosses.length) e.push('progression.bosses: at least one boss');
  for (const b of file.bosses ?? []) {
    const at = `progression.bosses.${String(b.id)}`;
    if (!profileIds.includes(b.id) || seen.has(b.id)) e.push(`${at}: a unique data/profiles.json row id`); else seen.add(b.id);
    if (!isWeapon(b.weapon)) e.push(`${at}.weapon: "${String(b.weapon)}" is no src/fight/weapon-defs.json row`);
    else if (weapons.has(b.weapon)) e.push(`${at}.weapon: "${b.weapon}" is unlocked by another boss`); else weapons.add(b.weapon);
    if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 24) e.push(`${at}.name: 1-24 characters`);
    for (const k of ['healthStep', 'damageStep'] as const) if (!(Number.isFinite(b[k]) && b[k] >= 0 && b[k] <= 1)) e.push(`${at}.${k}: 0 to 1`);
  }
  return e;
}

/** Whether this page reads and writes the save: the table's switch (?save=off) is not in the link. */
export const progressionOn = (file: Pick<ProgressionFile, 'query' | 'off'>, search: string): boolean => new URLSearchParams(search).get(file.query) !== file.off;

export const freshSave = (): Save => ({ v: 1, kills: {}, ladder: [], unlocked: [], coins: 0, banked: 0, pile: null, lost: [] });
const weaponsOf = (ladder: readonly string[], file: ProgressionFile): string[] => ladder.map((id) => file.bosses.find((b) => b.id === id)!.weapon);

/** The save in `raw` (the stored string): anything that is not this version's well-formed object is a fresh save. Unknown boss ids are dropped (a table edited since), `unlocked` is rebuilt from the ladder. Never throws. */
export function parseSave(raw: string | null | undefined, file: ProgressionFile): Save {
  try {
    if (typeof raw !== 'string' || !raw) return freshSave();
    const j = JSON.parse(raw) as { v?: unknown; kills?: unknown; ladder?: unknown; trophies?: unknown; coins?: unknown; banked?: unknown; pile?: unknown; lost?: unknown; daily?: unknown };
    if (!j || typeof j !== 'object' || j.v !== file.version || !j.kills || typeof j.kills !== 'object' || Array.isArray(j.kills) || !Array.isArray(j.ladder)) return freshSave();
    const known = new Set(file.bosses.map((b) => b.id)), kills: Record<string, number> = {};
    for (const [id, n] of Object.entries(j.kills as Record<string, unknown>)) if (known.has(id) && typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 99999) kills[id] = n;
    const ladder: string[] = [];
    for (const id of j.ladder) if (typeof id === 'string' && kills[id] !== undefined && !ladder.includes(id)) ladder.push(id);
    for (const id of Object.keys(kills)) if (!ladder.includes(id)) delete kills[id];   // a kill count with no ladder step is not a kill the ladder saw
    const trophies: Record<string, number> = {};
    if (j.trophies && typeof j.trophies === 'object' && !Array.isArray(j.trophies)) for (const [tier, n] of Object.entries(j.trophies as Record<string, unknown>)) if (/^[0-9]{1,2}$/.test(tier) && typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 99999) trophies[tier] = n;
    const golden = cleanGolden((j as { golden?: unknown }).golden);
    return { v: file.version, kills, ladder, unlocked: weaponsOf(ladder, file), ...(Object.keys(trophies).length ? { trophies } : {}), ...cleanCorpse(j), ...cleanDaily(j), ...(golden ? { golden } : {}), ...cleanParts(j as { parts?: unknown; equipped?: unknown }) };   // a save from before the corpse run has none of its fields: the empty values
  } catch { return freshSave(); }
}

/** The page's storage, or null when the browser blocks it (reading the property itself can throw). */
export function storageOf(host: { localStorage?: Store } | undefined = typeof globalThis === 'undefined' ? undefined : (globalThis as { localStorage?: Store })): Store | null {
  try { return host?.localStorage ?? null; } catch { return null; }
}
/** The saved progress, or a fresh game (no store, a read that throws, a corrupt value). */
export function loadSave(store: Store | null, file: ProgressionFile): Save {
  try { return store ? parseSave(store.getItem(file.key), file) : freshSave(); } catch { return freshSave(); }
}
/** Writes the save; false when the store refuses (blocked, full, private mode). Never throws. */
export function writeSave(store: Store | null, file: ProgressionFile, save: Save): boolean {
  try { if (!store) return false; store.setItem(file.key, JSON.stringify({ v: file.version, kills: save.kills, ladder: save.ladder, unlocked: save.unlocked, ...(save.trophies ? { trophies: save.trophies } : {}), coins: save.coins, banked: save.banked, pile: save.pile, lost: save.lost, ...(save.daily ? { daily: save.daily } : {}), ...(save.golden ? { golden: save.golden } : {}), ...(save.parts ? { parts: save.parts } : {}), ...(save.equipped ? { equipped: save.equipped } : {}) })); return true; } catch { return false; }
}

/** The save after boss `id` falls (a new object), and the row it unlocked (null on a repeat kill or a kind that is no ladder boss). */
export function recordKill(save: Save, id: string, file: ProgressionFile): { save: Save; unlocked: BossRow | null } {
  const row = file.bosses.find((b) => b.id === id);
  if (!row) return { save, unlocked: null };
  const first = !save.ladder.includes(id), ladder = first ? [...save.ladder, id] : save.ladder;
  return { save: { ...save, v: save.v, kills: { ...save.kills, [id]: Math.min(99999, (save.kills[id] ?? 0) + 1) }, ladder, unlocked: weaponsOf(ladder, file), ...(save.trophies ? { trophies: save.trophies } : {}) }, unlocked: first ? row : null };
}

/** The save with one more trophy of `tier` (data/stars.json trophy rows: a star boss's kill); a new object. */
export const addTrophy = (save: Save, tier: number): Save => ({ ...save, trophies: { ...(save.trophies ?? {}), [tier]: Math.min(99999, (save.trophies?.[tier] ?? 0) + 1) } });

/** The ?tune= map the kills make: every boss in the table at 1 + the sum of each kill's step, held at the caps. Empty with no kills. */
export function escalation(save: Save, file: ProgressionFile): TuneMap {
  let h = 0, d = 0;
  for (const b of file.bosses) { const n = save.kills[b.id] ?? 0; h += b.healthStep * n; d += b.damageStep * n; }
  const health = Math.min(file.healthCap, 1 + h), damage = Math.min(file.damageCap, 1 + d);
  if (health === 1 && damage === 1) return {};
  return Object.fromEntries(file.bosses.map((b) => [b.id, { health, damage }]));
}

/** `base` (the page's ?tune=) with `extra` multiplied over it. No extra returns `base` itself, so the fight with no kills is the same object as before. */
export function mergeTune(base: TuneMap, extra: TuneMap): TuneMap {
  const ids = Object.keys(extra);
  if (!ids.length) return base;
  const out: Record<string, Record<string, number>> = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, { ...v }]));
  for (const id of ids) { const o = (out[id] ??= {}), x = extra[id]!; for (const key of Object.keys(x)) o[key] = (o[key] ?? 1) * x[key]!; }
  return out;
}

/**
 * The weapon the hero takes: `?weapon=<id>` when it is his (unlocked, or `fallback`, the fight row's) and he can draw it; else the newest unlocked weapon he can draw; else `fallback`.
 * `drawable`: the weapons with art for his hand (scene.ts CARRIED_WEAPONS). A save with nothing unlocked, or no `?weapon=`, gives `fallback` untouched.
 */
export function heroWeapon(save: Save, file: ProgressionFile, fallback: string, drawable: readonly string[], search: string): string {
  const asked = new URLSearchParams(search).get(file.weaponQuery);
  if (asked && (asked === fallback || save.unlocked.includes(asked)) && drawable.includes(asked)) return asked;
  if (file.autoEquip) for (let i = save.unlocked.length - 1; i >= 0; i--) if (drawable.includes(save.unlocked[i]!)) return save.unlocked[i]!;
  return fallback;
}

/** The HUD line for an unlock. */
export const unlockText = (row: Pick<BossRow, 'name'>): string => `Unlocked: ${row.name}`;
