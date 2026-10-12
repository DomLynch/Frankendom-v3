// Skills as data (Combat, core slice 5, 2026-10-12): the loader for src/fight/skill-defs.json. A row is a skill keyed by id; the engine reads only the SIM fields (code, move, opponent, dayOne, tell),
// the rest (name, clip, bash, impactTint, fx) is presentation. Nothing here names a skill: the sim, the codec, the loot table and the HUD ask the rows. The `move` of a row is a verb that must exist in moves.ts MOVES,
// so a row that names a missing move is refused at load, never found mid-fight. Structure (a missing or duplicate id, a mistyped field) goes through the shared loader (src/core/registry.ts).
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import SKILL_MANIFEST from './skill-defs.manifest.json' with { type: 'json' };

export type SkillClip = 'heavy' | 'thrust' | 'light';
export type SkillRow = {
  readonly id: string; readonly code: number; readonly move: string; readonly name: string; readonly opponent: string | null; readonly clip: SkillClip;
  readonly dayOne?: boolean; readonly tell?: boolean; readonly bash?: boolean; readonly impactTint?: string; readonly fx?: string;
};
export type SkillTable = { readonly rows: Readonly<Record<string, SkillRow>>; readonly byCode: readonly (string | null)[]; readonly dayOne: string };

export function loadSkillDefs(raw: { skills?: readonly unknown[] }, moves: Readonly<Record<string, unknown>>): SkillTable {
  loadRegistry([tableFromFile(SKILL_MANIFEST.tables[0] as Manifest, raw, 'skill-defs.json')]);
  const defs = (raw.skills ?? []) as readonly SkillRow[], rows: Record<string, SkillRow> = {}, byCode: (string | null)[] = [null];
  for (const r of defs) {
    if (!Object.hasOwn(moves, r.move)) throw Error(`skill-defs "${r.id}": move "${r.move}" is no move in moves.ts MOVES`);
    if (r.move !== `skill_${r.id}`) throw Error(`skill-defs "${r.id}": move is skill_<id> (the generic skill_ prefix tests rely on it)`);
    if (!['heavy', 'thrust', 'light'].includes(r.clip)) throw Error(`skill-defs "${r.id}": clip is heavy, thrust or light`);
    if (r.opponent !== null && typeof r.opponent !== 'string') throw Error(`skill-defs "${r.id}": opponent is an id or null`);
    if (r.code < 1 || byCode[r.code] !== undefined) throw Error(`skill-defs "${r.id}": code ${r.code} is not a free number from 1`);
    byCode[r.code] = r.id; rows[r.id] = r;
  }
  if (byCode.some((c) => c === undefined)) throw Error('skill-defs: codes run 1..n with no gap (the record byte is append only)');
  const first = defs.filter((r) => r.dayOne);
  if (first.length !== 1) throw Error('skill-defs: exactly one row is the dayOne skill');
  return { rows, byCode, dayOne: first[0]!.id };
}
