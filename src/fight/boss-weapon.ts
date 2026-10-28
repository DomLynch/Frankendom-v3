// Boss weapons (Dom + Strategy 2026-10-28; data/boss-weapons.json): Gargantua (V1 archetype executioner) wields a MAUL, Arachne (shieldmaiden) an AXE and a SHIELD. A row is keyed by the archetype (`opponent`), or, when it names a `profile`, by that data/profiles.json id (Sir Reginald, castle-guard, is a shieldmaiden like Arachne but his row is his own): a profile row wins over the archetype's row, and a profile with no row of its own falls back to its archetype's row (or V1's weapon when there is none).
// A zone spawn's kind whose archetype has a row fights with the row's `weapon` (spawn-kind.ts kindFightFor lays it over V1's row for the archetype: the scythe, the gladius) and is drawn with it (boss-hand.ts, scene.ts).
// Pure and rendering-free: the sim and the tests ask the same functions the page does. ?bossweapon=v1 = V1's weapons (no row in force); ?bossweapon=<opponent id> is a stills flag (the page's own foe is drawn with that row).
import BOSS from '../../data/boss-weapons.json' with { type: 'json' };
import PROFILES from '../../data/profiles.json' with { type: 'json' };
import { OPPONENTS, isWeaponId, type Opponent } from './moves.ts';

export type DiscRow = { kind: 'disc'; hand: string; radius: number; thickness: number; colour: string; rim: string; offset: [number, number, number]; rotationDeg: [number, number, number] };
/** kind `file`: a mesh file under src/assets/weapons/foe/ (`file` = its stem; root node BossShield, 1 unit = 1 m), loaded with the boss body only; `scale` grows it about its own origin. */
export type FileRow = { kind: 'file'; file: string; hand: string; scale: number; offset: [number, number, number]; rotationDeg: [number, number, number] };
export type OffhandRow = DiscRow | FileRow;
/** The file stems under src/assets/weapons/foe/ a row may graft (`equip`) or seat (`offhand.file`). */
export const FOE_PART_STEMS: readonly string[] = ['cleaver', 'maul', 'axe', 'shield', 'halberd', 'sword', 'mace', 'spear', 'katana', 'warhammer', 'rapier'];
/** `grip`: where the drawn part sits in the hand, on top of the socket's own frame: metres and Euler XYZ degrees (the seat's frame; the sim's contact segment is not moved, this is the drawing). `material`: the part's own look replaced (null = the file's). */
export type GripRow = { offset: [number, number, number]; rotationDeg: [number, number, number] };
export type MaterialRow = { colour: string; metalness: number; roughness: number };
/** `opponent`: the V1 archetype; `profile` (optional): a data/profiles.json id whose `opponent` is that archetype, making the row that profile's own (absent or null = the archetype's row, shared by every profile of it that has no row of its own). */
export type BossWeaponRow = { id: string; opponent: string; profile?: string | null; weapon: string; clipsAs: string; equip: string; scale: number; grip: GripRow; material: MaterialRow | null; offhand: OffhandRow | null; placeholder: string[] };
export type BossWeaponFile = { query: string; v1: string; rows: BossWeaponRow[] };

const HEX = /^#[0-9a-f]{6}$/i, fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** Why `file` is not a good set of boss weapon rows (one string per problem; empty = fine). `equips`: the file stems under src/assets/weapons/foe/ a row may graft. */
export function validateBossWeapons(file: BossWeaponFile, opponents: readonly string[] = Object.keys(OPPONENTS), equips: readonly string[] = FOE_PART_STEMS, isWeapon: (id: string) => boolean = isWeaponId, profiles: readonly { id: string; opponent: string }[] = PROFILES.profiles): string[] {
  const e: string[] = [], seenId = new Set<string>(), seenOpp = new Set<string>(), seenProfile = new Set<string>();
  if (typeof file.query !== 'string' || !/^[a-z]+$/.test(file.query)) e.push('boss-weapons.query: a lower-case word');
  if (typeof file.v1 !== 'string' || !file.v1) e.push('boss-weapons.v1: the revert word');
  if (!Array.isArray(file.rows) || !file.rows.length) return [...e, 'boss-weapons.rows: at least one row'];
  for (const [i, r] of file.rows.entries()) {
    const at = `boss-weapons.rows[${i}] (${r.id})`;
    if (typeof r.id !== 'string' || !r.id) e.push(`${at}.id: a non-empty string`); else if (seenId.has(r.id)) e.push(`${at}.id: duplicate`); else seenId.add(r.id);
    if (!opponents.includes(r.opponent)) e.push(`${at}.opponent: "${r.opponent}" is no archetype (${opponents.join(', ')})`);
    else if (r.profile == null) { if (seenOpp.has(r.opponent)) e.push(`${at}.opponent: "${r.opponent}" has two rows`); else seenOpp.add(r.opponent); }
    if (r.profile != null) {
      const pr = profiles.find((q) => q.id === r.profile);
      if (!pr) e.push(`${at}.profile: "${r.profile}" is no data/profiles.json id (${profiles.map((q) => q.id).join(', ')})`);
      else if (pr.opponent !== r.opponent) e.push(`${at}.profile: "${r.profile}" fights as "${pr.opponent}", not "${r.opponent}"`);
      if (seenProfile.has(r.profile)) e.push(`${at}.profile: "${r.profile}" has two rows`); else seenProfile.add(r.profile);
    }
    if (!isWeapon(r.weapon)) e.push(`${at}.weapon: "${r.weapon}" is no src/fight/weapon-defs.json row`);
    if (!isWeapon(r.clipsAs)) e.push(`${at}.clipsAs: "${r.clipsAs}" is no src/fight/weapon-defs.json row`);
    if (!equips.includes(r.equip)) e.push(`${at}.equip: "${r.equip}" is no file under src/assets/weapons/foe/ (${equips.join(', ')})`);
    if (!fin(r.scale) || r.scale < 0.5 || r.scale > 4) e.push(`${at}.scale: a number in 0.5..4`);
    for (const [k, lim] of [['offset', 0.5], ['rotationDeg', 360]] as const) { const v = r.grip?.[k]; if (!Array.isArray(v) || v.length !== 3 || !v.every((n) => fin(n) && Math.abs(n) <= lim)) e.push(`${at}.grip.${k}: three finite numbers within +-${lim}`); }
    if (r.material !== null) {
      if (!r.material || typeof r.material !== 'object' || typeof r.material.colour !== 'string' || !HEX.test(r.material.colour)) e.push(`${at}.material.colour: a #rrggbb colour (or material null)`);
      else for (const k of ['metalness', 'roughness'] as const) if (!fin(r.material[k]) || r.material[k] < 0 || r.material[k] > 1) e.push(`${at}.material.${k}: a number in 0..1`);
    }
    if (!Array.isArray(r.placeholder) || !r.placeholder.length || r.placeholder.some((s) => typeof s !== 'string' || !s)) e.push(`${at}.placeholder: say exactly what is a stand-in (a non-empty list of strings)`);
    const o = r.offhand;
    if (o !== null) {
      if (!o || typeof o !== 'object' || (o.kind !== 'disc' && o.kind !== 'file')) e.push(`${at}.offhand.kind: "disc" or "file" (or offhand null)`);
      else {
        if (typeof o.hand !== 'string' || !o.hand) e.push(`${at}.offhand.hand: a bone name`);
        if (o.kind === 'disc') {
          for (const [k, lo, hi] of [['radius', 0.1, 0.8], ['thickness', 0.01, 0.2]] as const) if (!fin(o[k]) || o[k] < lo || o[k] > hi) e.push(`${at}.offhand.${k}: metres in ${lo}..${hi}`);
          for (const k of ['colour', 'rim'] as const) if (typeof o[k] !== 'string' || !HEX.test(o[k])) e.push(`${at}.offhand.${k}: a #rrggbb colour`);
        } else {
          if (!equips.includes(o.file)) e.push(`${at}.offhand.file: "${o.file}" is no file under src/assets/weapons/foe/ (${equips.join(', ')})`);
          if (!fin(o.scale) || o.scale < 0.2 || o.scale > 3) e.push(`${at}.offhand.scale: a number in 0.2..3`);
        }
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
/** The row for a spawn of archetype `opponent` and profile `profile` (a data/profiles.json id, optional): the profile's own row, else the archetype's, or undefined. Under ?bossweapon=v1 there is none. */
export const bossWeaponFor = (opponent: string, search: string, file: BossWeaponFile = BOSS_WEAPONS, profile?: string): BossWeaponRow | undefined => {
  if (!bossWeaponsOn(search, file)) return undefined;
  return (profile === undefined ? undefined : file.rows.find((r) => r.profile === profile && r.opponent === opponent)) ?? file.rows.find((r) => r.opponent === opponent && r.profile == null);
};
/** The stills flag: ?bossweapon=<opponent id or profile id> names the row drawn on the page's own foe (an archetype's row, else that profile's), or undefined. */
export const bossPreview = (search: string, file: BossWeaponFile = BOSS_WEAPONS): BossWeaponRow | undefined => { const v = new URLSearchParams(search).get(file.query); return v && v !== file.v1 ? file.rows.find((r) => r.opponent === v && r.profile == null) ?? file.rows.find((r) => r.profile === v) : undefined; };
/** `o` as a spawn of its archetype fights: V1's row with the boss row's weapon in hand (the same object when there is no row, so the default fight is byte for byte the one before). */
export const bossOpponent = (o: Opponent, search: string, file: BossWeaponFile = BOSS_WEAPONS, profile?: string): Opponent => { const r = bossWeaponFor(o.id, search, file, profile); return r && r.weapon !== o.weapon ? { ...o, weapon: r.weapon } : o; };
/** The archetype row (a profile row is found through the spawn's own body: scene.ts bossOfBody, foe-body.ts bodyProfileOf) whose boss is drawn in 106 body `file` (a data/rig.json 106 stem), given how to find an archetype's profile body (undefined = no profile row, so no body of its own yet). */
export const bossRowOfBody = (file: string, bodyOf: (opponent: string) => string | undefined, search: string, rows: BossWeaponFile = BOSS_WEAPONS): BossWeaponRow | undefined => (bossWeaponsOn(search, rows) ? rows.rows.find((r) => r.profile == null && bodyOf(r.opponent) === file) : undefined);
