// THE SHEET (Dom, 2026-10-13 00:1x, final; programme section 2a): level 1 to 100, TEN DIALS (attack, spellPower, armour, magicResist, health, stamina, poise, luck, focus, recovery), each
// starting at 50 and maxing at 100. A player places 50 points at creation (any split) and gets 1 more per level: 150 at level 100, so at most three dials are maxed, never ten, and a
// specialist is 2x on the dials they chose and 4x in a fight. Dials never touch timing. SKILLS are rows (open set, 0..100 each, grown by use) under a TOTAL cap of 500. GEAR is not on the sheet:
// a worn set tilts two dials against each other by up to 25 (gear-rows.ts), applied on top. Titles and favour are prestige, not points. Bosses and creatures are OFF the sheet.
// All of it is ROWS through the shared loader (src/fight/sheet-defs.json): a dial, a skill and the two pools carry their own base, cap and pool; a new dial or skill is a row. ONE build
// validator (`validateBuild`) checks per-dial, per-skill and the budgets at load and on the writer (the server).
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import SHEET_DEFS from './sheet-defs.json' with { type: 'json' };
import SHEET_MANIFEST from './sheet-defs.manifest.json' with { type: 'json' };

export type Dial = { readonly id: string; readonly code: number; readonly base: number; readonly cap: number; readonly floor: number; readonly pool: string };
export type SkillRow = { readonly id: string; readonly base: number; readonly cap: number; readonly pool: string; readonly school?: string };
export type PointsPool = { readonly id: string; readonly creation: number; readonly perLevel: number; readonly maxLevel: number };
export type Sheet = Readonly<Record<string, number>>;   // dial id -> the player's EFFECTIVE value (build plus any gear tilt), floor..cap; a dial at its base is simply absent
export type Build = { readonly level: number; readonly dials: Readonly<Record<string, number>>; readonly skills?: Readonly<Record<string, number>> };   // dials: points PLACED on each dial above its base; skills: each skill's value

const TABLES = SHEET_MANIFEST.tables.map((t) => tableFromFile(t as unknown as Manifest, SHEET_DEFS, 'sheet-defs.json'));
loadRegistry(TABLES);   // a skill's `school` names a row of school-defs.json; tests/gear-fight.test.ts checks it (this file stays free of anything the sim should not import)
const rows = <T>(i: number): readonly T[] => TABLES[i]!.rows as unknown as readonly T[];
export const POINTS: PointsPool = rows<PointsPool>(0)[0]!;
export const SKILL_TOTAL: number = (rows<{ total: number }>(1)[0]!).total;
export const DIALS: readonly Dial[] = rows<Dial>(2).slice().sort((a, b) => a.code - b.code);
export const SHEET_SKILLS: readonly SkillRow[] = rows<SkillRow>(3);
const DIAL = new Map(DIALS.map((d) => [d.id, d])), SKILL = new Map(SHEET_SKILLS.map((s) => [s.id, s]));
if (rows<PointsPool>(0).length !== 1 || rows<unknown>(1).length !== 1) throw Error('sheet-defs: exactly one points pool and one skill pool');
if (POINTS.creation < 0 || POINTS.perLevel < 0 || POINTS.maxLevel < 1) throw Error('sheet-defs points: creation and perLevel are not negative and maxLevel is at least 1');
DIALS.forEach((d, i) => {
  if (d.code !== i + 1) throw Error(`sheet-defs dial "${d.id}": codes run 1..n with no gap (the record is append only)`);
  if (d.floor < 1 || d.floor > d.base || d.cap < d.base || d.cap > 255) throw Error(`sheet-defs dial "${d.id}": 1 <= floor <= base <= cap <= 255 (a record byte)`);
});
for (const s of SHEET_SKILLS) if (s.base < 0 || s.cap < s.base || s.cap > 255) throw Error(`sheet-defs skill "${s.id}": 0 <= base <= cap <= 255`);

// The points a player of this level has to place: the creation allotment plus one per level (150 at level 100).
export const pointsAt = (level: number): number => POINTS.creation + POINTS.perLevel * level;
const baseOf = (id: string): number => DIAL.get(id)?.base ?? 50;

// The ONE build validator, used when the rows load, on a character writer and in a test: every problem as a sentence, [] when the build is legal. Player dials never pass their cap (100),
// placed points are whole and fit the level's budget, skills are rows within their cap, and their total stays under the skill pool (500).
export function validateBuild(b: Build): string[] {
  const out: string[] = [];
  if (!Number.isInteger(b.level) || b.level < 1 || b.level > POINTS.maxLevel) out.push(`level ${String(b.level)} is a whole number from 1 to ${POINTS.maxLevel}`);
  let placed = 0;
  for (const [id, n] of Object.entries(b.dials)) {
    const d = DIAL.get(id);
    if (!d) { out.push(`"${id}" is not a dial row`); continue; }
    if (!Number.isInteger(n) || n < 0) { out.push(`${id}: placed points are a whole number from 0`); continue; }
    if (d.base + n > d.cap) out.push(`${id}: ${d.base} + ${n} is past its cap ${d.cap}`);
    placed += n;
  }
  if (Number.isInteger(b.level) && placed > pointsAt(b.level)) out.push(`${placed} points placed, the budget at level ${b.level} is ${pointsAt(b.level)}`);
  let total = 0;
  for (const [id, v] of Object.entries(b.skills ?? {})) {
    const s = SKILL.get(id);
    if (!s) { out.push(`"${id}" is not a skill row`); continue; }
    if (!Number.isInteger(v) || v < s.base || v > s.cap) { out.push(`${id}: a whole number from ${s.base} to ${s.cap}`); continue; }
    total += v;
  }
  if (total > SKILL_TOTAL) out.push(`skills total ${total}, the cap is ${SKILL_TOTAL}`);
  return out;
}

// The sheet a build resolves to, with a gear tilt on top (dial id -> signed points, from gear-rows.ts `tiltOf`): each dial is base + placed + tilt, held between its floor and its cap.
// A dial left at its base is absent; none at all is `undefined`, which the duel treats as no sheet (a build that never placed a point and wears nothing fights as before). Throws on an illegal build.
export function sheetOf(b: Build, tilt: Readonly<Record<string, number>> = {}): Sheet | undefined {
  const problems = validateBuild(b);
  if (problems.length) throw Error(`Sheet: ${problems.join('; ')}`);
  const out: Record<string, number> = {};
  for (const d of DIALS) {
    const v = Math.max(d.floor, Math.min(d.cap, d.base + (b.dials[d.id] ?? 0) + (tilt[d.id] ?? 0)));
    if (v !== d.base) out[d.id] = v;
  }
  for (const id of Object.keys(tilt)) if (!DIAL.has(id)) throw Error(`Sheet: "${id}" is not a dial row`);
  return Object.keys(out).length ? out : undefined;
}

// The one reader. A fighter with no sheet, or a dial at its base, is the plain number untouched (no float drift, as `perked` in duel.ts): `up` scales x by value/base (damage dealt),
// `down` by base/value (damage taken: an armour of 100 takes half).
export const statValue = (sheet: Sheet | undefined, id: string): number => sheet?.[id] ?? baseOf(id);
export const statUp = (sheet: Sheet | undefined, id: string, x: number): number => { const v = sheet?.[id]; return v === undefined ? x : (x * v) / baseOf(id); };
export const statDown = (sheet: Sheet | undefined, id: string, x: number): number => { const v = sheet?.[id]; return v === undefined ? x : (x * baseOf(id)) / v; };

// Validates an effective sheet at duel start and on a record's read: known dial ids, whole numbers from the dial's floor to its cap. Returns the dials off base in code order, or undefined for none.
export function checkSheet(sheet: Sheet | undefined): Sheet | undefined {
  if (!sheet) return undefined;
  for (const id of Object.keys(sheet)) {
    const d = DIAL.get(id), v = sheet[id]!;
    if (!d) throw Error(`Sheet: "${id}" is not a dial row (sheet-defs.json dials)`);
    if (!Number.isInteger(v) || v < d.floor || v > d.cap) throw Error(`Sheet: ${id} is a whole number from ${d.floor} to ${d.cap}`);
  }
  const out: Record<string, number> = {};
  for (const d of DIALS) if (sheet[d.id] !== undefined && sheet[d.id] !== d.base) out[d.id] = sheet[d.id]!;
  return Object.keys(out).length ? out : undefined;
}
export const dialByCode = (code: number): Dial | undefined => DIALS[code - 1];
