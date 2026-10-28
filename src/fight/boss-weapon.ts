// Boss weapons (Dom + Strategy 2026-10-28; data/boss-weapons.json): Gargantua (V1 archetype executioner) wields a MAUL, Arachne (shieldmaiden) an AXE and a SHIELD. A row is keyed by the archetype (`opponent`).
// A zone spawn's kind whose archetype has a row fights with the row's `weapon` (spawn-kind.ts kindFightFor lays it over V1's row for the archetype: the scythe, the gladius) and is drawn with it (boss-hand.ts, scene.ts).
// Pure and rendering-free: the sim and the tests ask the same functions the page does. ?bossweapon=v1 = V1's weapons (no row in force); ?bossweapon=<opponent id> is a stills flag (the page's own foe is drawn with that row).
import BOSS from '../../data/boss-weapons.json' with { type: 'json' };
import { OPPONENTS, isWeaponId, type Opponent } from './moves.ts';

export type OffhandRow = { kind: 'disc'; hand: string; radius: number; thickness: number; colour: string; rim: string; offset: [number, number, number]; rotationDeg: [number, number, number] };
export type BossWeaponRow = { id: string; opponent: string; weapon: string; clipsAs: string; equip: string; scale: number; offhand: OffhandRow | null; placeholder: string[] };
export type BossWeaponFile = { query: string; v1: string; rows: BossWeaponRow[] };

const HEX = /^#[0-9a-f]{6}$/i, fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** Why `file` is not a good set of boss weapon rows (one string per problem; empty = fine). `equips`: the file stems under src/assets/weapons/foe/ a row may graft. */
export function validateBossWeapons(file: BossWeaponFile, opponents: readonly string[] = Object.keys(OPPONENTS), equips: readonly string[] = ['cleaver'], isWeapon: (id: string) => boolean = isWeaponId): string[] {
  const e: string[] = [], seenId = new Set<string>(), seenOpp = new Set<string>();
  if (typeof file.query !== 'string' || !/^[a-z]+$/.test(file.query)) e.push('boss-weapons.query: a lower-case word');
  if (typeof file.v1 !== 'string' || !file.v1) e.push('boss-weapons.v1: the revert word');
  if (!Array.isArray(file.rows) || !file.rows.length) return [...e, 'boss-weapons.rows: at least one row'];
  for (const [i, r] of file.rows.entries()) {
    const at = `boss-weapons.rows[${i}] (${r.id})`;
    if (typeof r.id !== 'string' || !r.id) e.push(`${at}.id: a non-empty string`); else if (seenId.has(r.id)) e.push(`${at}.id: duplicate`); else seenId.add(r.id);
    if (!opponents.includes(r.opponent)) e.push(`${at}.opponent: "${r.opponent}" is no archetype (${opponents.join(', ')})`);
    else if (seenOpp.has(r.opponent)) e.push(`${at}.opponent: "${r.opponent}" has two rows`); else seenOpp.add(r.opponent);
    if (!isWeapon(r.weapon)) e.push(`${at}.weapon: "${r.weapon}" is no src/fight/weapon-defs.json row`);
    if (!isWeapon(r.clipsAs)) e.push(`${at}.clipsAs: "${r.clipsAs}" is no src/fight/weapon-defs.json row`);
    if (!equips.includes(r.equip)) e.push(`${at}.equip: "${r.equip}" is no file under src/assets/weapons/foe/ (${equips.join(', ')})`);
    if (!fin(r.scale) || r.scale < 0.5 || r.scale > 4) e.push(`${at}.scale: a number in 0.5..4`);
    if (!Array.isArray(r.placeholder) || !r.placeholder.length || r.placeholder.some((s) => typeof s !== 'string' || !s)) e.push(`${at}.placeholder: say exactly what is a stand-in (a non-empty list of strings)`);
    const o = r.offhand;
    if (o !== null) {
      if (!o || typeof o !== 'object' || o.kind !== 'disc') e.push(`${at}.offhand.kind: "disc" (or offhand null)`);
      else {
        if (typeof o.hand !== 'string' || !o.hand) e.push(`${at}.offhand.hand: a bone name`);
        for (const [k, lo, hi] of [['radius', 0.1, 0.8], ['thickness', 0.01, 0.2]] as const) if (!fin(o[k]) || o[k] < lo || o[k] > hi) e.push(`${at}.offhand.${k}: metres in ${lo}..${hi}`);
        for (const k of ['colour', 'rim'] as const) if (typeof o[k] !== 'string' || !HEX.test(o[k])) e.push(`${at}.offhand.${k}: a #rrggbb colour`);
        for (const [k, lim] of [['offset', 1], ['rotationDeg', 360]] as const) { const v = o[k]; if (!Array.isArray(v) || v.length !== 3 || !v.every((n) => fin(n) && Math.abs(n) <= lim)) e.push(`${at}.offhand.${k}: three finite numbers within +-${lim}`); }
      }
    }
  }
  return e;
}
const problems = validateBossWeapons(BOSS as unknown as BossWeaponFile);
if (problems.length) throw new Error(`data/boss-weapons.json: ${problems.join('; ')}`);
export const BOSS_WEAPONS = BOSS as unknown as BossWeaponFile;

/** Whether this page lets the rows in force (false under ?bossweapon=v1: V1's weapons). */
export const bossWeaponsOn = (search: string, file: BossWeaponFile = BOSS_WEAPONS): boolean => new URLSearchParams(search).get(file.query) !== file.v1;
/** The row for archetype `opponent`, or undefined. Under ?bossweapon=v1 there is none. */
export const bossWeaponFor = (opponent: string, search: string, file: BossWeaponFile = BOSS_WEAPONS): BossWeaponRow | undefined => (bossWeaponsOn(search, file) ? file.rows.find((r) => r.opponent === opponent) : undefined);
/** The stills flag: ?bossweapon=<opponent id> names the row drawn on the page's own foe, or undefined. */
export const bossPreview = (search: string, file: BossWeaponFile = BOSS_WEAPONS): BossWeaponRow | undefined => { const v = new URLSearchParams(search).get(file.query); return v && v !== file.v1 ? file.rows.find((r) => r.opponent === v) : undefined; };
/** `o` as a spawn of its archetype fights: V1's row with the boss row's weapon in hand (the same object when there is no row, so the default fight is byte for byte the one before). */
export const bossOpponent = (o: Opponent, search: string, file: BossWeaponFile = BOSS_WEAPONS): Opponent => { const r = bossWeaponFor(o.id, search, file); return r && r.weapon !== o.weapon ? { ...o, weapon: r.weapon } : o; };
/** The row whose boss is drawn in 106 body `file` (a data/rig.json 106 stem), given how to find an archetype's profile body (undefined = no profile row, so no body of its own yet). */
export const bossRowOfBody = (file: string, bodyOf: (opponent: string) => string | undefined, search: string, rows: BossWeaponFile = BOSS_WEAPONS): BossWeaponRow | undefined => (bossWeaponsOn(search, rows) ? rows.rows.find((r) => bodyOf(r.opponent) === file) : undefined);
