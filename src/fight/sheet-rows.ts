// THE SHEET, LOCKED (Dom, 2026-10-13 02:3x; programme section 2a @7dcd2dca6, version of record): everything a player has counts 0 to 100 and the number is the number of points in it. LEVEL is born at 0 and
// caps at 100. TEN DIALS (attack, spellPower, armour, magicResist, health, stamina, poise, luck, focus, recovery), each starting at 0 and capped at 100: 0 is a normal fighter, 100 is twice that (the
// multiplier is 1 + value/100); none touches timing. SKILLS are rows too (one per weapon and per magic school, an open set), each starting at 0 and capped at 100. POINTS: one per level, placed on
// reaching it, 100 a career, on ANY dial or ANY skill: a dial point applies at once, a skill point raises that skill's CEILING by one and practice fills it. GEAR is worth 50 on top (25 shape, 25 quality,
// gear-rows.ts), and every dial still caps at 100 wherever its points come from. Bosses and creatures are OFF the sheet. Everything here is ROWS through the shared loader (src/fight/sheet-defs.json): a
// dial, a skill and the one points pool carry base, cap and pool, so a new dial or skill is a row and the rule does not move. ONE build validator (`validateBuild`) checks per-dial, per-skill and the points
// placed against the level; `checkSheet` uses it too (sheets that did not come from a stored build), so no player number passes 100 and no career places a point past its level, at load, on the writer and
// on a record's read.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import SHEET_DEFS from './sheet-defs.json' with { type: 'json' };
import SHEET_MANIFEST from './sheet-defs.manifest.json' with { type: 'json' };

export type Dial = { readonly id: string; readonly name: string; readonly code: number; readonly base: number; readonly cap: number; readonly floor: number; readonly pool: string };
export type SkillRow = { readonly id: string; readonly name: string; readonly base: number; readonly cap: number; readonly pool: string };
export type PointsPool = { readonly id: string; readonly perLevel: number; readonly maxLevel: number; readonly total: number; readonly gear: number };   // gear: the most a worn set adds in all (25 shape + 25 quality)
export type Sheet = Readonly<Record<string, number>>;   // dial id -> the player's EFFECTIVE value (build plus any worn gear), floor..cap; a dial at its base is simply absent
// A stored build (Backend's field): the level, and `placed` = the points placed on each row (a dial id or a skill id; a dial point lifts the dial at once, a skill point lifts that skill's CEILING).
// `values` = each skill's current value, practice's state (the Crawl use-pool moves it from the skill's base toward its ceiling); absent = at base. Dials and skills share the one budget.
export type Build = { readonly level: number; readonly placed: Readonly<Record<string, number>>; readonly values?: Readonly<Record<string, number>> };

const TABLES = SHEET_MANIFEST.tables.map((t) => tableFromFile(t as unknown as Manifest, SHEET_DEFS, 'sheet-defs.json'));
loadRegistry(TABLES);
const rows = <T>(i: number): readonly T[] => TABLES[i]!.rows as unknown as readonly T[];
export const POINTS: PointsPool = rows<PointsPool>(0)[0]!;
export const DIALS: readonly Dial[] = rows<Dial>(1).slice().sort((a, b) => a.code - b.code);
export const SHEET_SKILLS: readonly SkillRow[] = rows<SkillRow>(2);
const DIAL = new Map(DIALS.map((d) => [d.id, d])), SKILL = new Map(SHEET_SKILLS.map((s) => [s.id, s]));
if (rows<PointsPool>(0).length !== 1) throw Error('sheet-defs: exactly one points pool');
if (POINTS.perLevel < 1 || POINTS.maxLevel < 1 || POINTS.total < 1 || POINTS.gear < 0) throw Error('sheet-defs points: perLevel, maxLevel and total are at least 1, gear is not negative');
DIALS.forEach((d, i) => {
  if (d.code !== i + 1) throw Error(`sheet-defs dial "${d.id}": codes run 1..n with no gap (the record is append only)`);
  if (d.floor < 0 || d.floor > d.base || d.cap < d.base || d.cap > 100) throw Error(`sheet-defs dial "${d.id}": 0 <= floor <= base <= cap <= 100 (no player number passes 100)`);
});
for (const s of SHEET_SKILLS) if (s.base < 0 || s.cap < s.base || s.cap > 100) throw Error(`sheet-defs skill "${s.id}": 0 <= base <= cap <= 100`);

// The points a player of this level has placed or may place: one per level, placed on reaching it, 100 in a career (level 0 has none, level 100 has 100).
export const pointsAt = (level: number): number => Math.min(POINTS.total, POINTS.perLevel * level);
const baseOf = (id: string): number => DIAL.get(id)?.base ?? 0;
const UNIT = 100;   // a dial at 100 is twice a normal fighter: the multiplier is (UNIT + value) / UNIT
const mult = (id: string, v: number): number => UNIT + v - baseOf(id);

// The ONE build validator, used when the rows load, on a character writer (the server) and by `checkSheet`: every problem as a sentence, [] when the build is legal. Player dials never pass their cap
// (100), a skill's ceiling never passes its cap, current skill values sit between base and ceiling, placed points are whole, and the points on dials AND skills together stay within the level's budget
// (the level itself, 100 in a career). `allowance` is extra points a worn set may account for (a record's sheet is build plus gear: pass the gear pool to bound a sheet whose build the server does not hold yet).
export function validateBuild(b: Build, allowance = 0): string[] {
  const out: string[] = [];
  if (!Number.isInteger(b.level) || b.level < 0 || b.level > POINTS.maxLevel) out.push(`level ${String(b.level)} is a whole number from 0 to ${POINTS.maxLevel}`);
  let placed = 0;
  for (const [id, n] of Object.entries(b.placed)) {
    const row = DIAL.get(id) ?? SKILL.get(id);
    if (!row) { out.push(`"${id}" is not a dial or skill row`); continue; }
    if (!Number.isInteger(n) || n < 0) { out.push(`${id}: placed points are a whole number from 0`); continue; }
    if (row.base + n > row.cap) out.push(`${id}: ${row.base} + ${n} is past its cap ${row.cap}`);
    placed += n;
  }
  for (const [id, value] of Object.entries(b.values ?? {})) {
    const s = SKILL.get(id);
    if (!s) { out.push(`"${id}" is not a skill row`); continue; }
    if (!Number.isInteger(value) || value < s.base || value > s.base + (b.placed[id] ?? 0)) out.push(`${id}: its value ${String(value)} is a whole number from ${s.base} to its ceiling ${s.base + (b.placed[id] ?? 0)}`);
  }
  if (Number.isInteger(b.level) && placed > pointsAt(b.level) + allowance) out.push(`${placed} points placed, the budget at level ${b.level} is ${pointsAt(b.level)}${allowance ? ` (+${allowance} gear)` : ''}`);
  return out;
}

// The sheet a build resolves to, with the worn set's dial deltas on top (dial id -> signed points, from gear-rows.ts): each dial is base + placed + gear, held between its floor and its cap. A dial left at
// its base is absent; none at all is `undefined`, which the duel treats as no sheet (a build that never placed a point and wears nothing fights as before). Throws on an illegal build.
export function sheetOf(b: Build, gear: Readonly<Record<string, number>> = {}): Sheet | undefined {
  const problems = validateBuild(b);
  if (problems.length) throw Error(`Sheet: ${problems.join('; ')}`);
  for (const id of Object.keys(gear)) if (!DIAL.has(id)) throw Error(`Sheet: "${id}" is not a dial row`);
  const out: Record<string, number> = {};
  for (const d of DIALS) {
    const v = Math.max(d.floor, Math.min(d.cap, d.base + (b.placed[d.id] ?? 0) + (gear[d.id] ?? 0)));
    if (v !== d.base) out[d.id] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

// The one reader. A fighter with no sheet, or a dial at its base (0), is the plain number untouched (no float drift, as `perked` in duel.ts): `up` scales x by 1 + value/100 (damage dealt: attack 100
// hits twice), `down` by 1 / (1 + value/100) (damage taken: an armour of 100 takes half).
export const statValue = (sheet: Sheet | undefined, id: string): number => sheet?.[id] ?? baseOf(id);
export const statUp = (sheet: Sheet | undefined, id: string, x: number): number => { const v = sheet?.[id]; return v === undefined ? x : (x * mult(id, v)) / UNIT; };
export const statDown = (sheet: Sheet | undefined, id: string, x: number): number => { const v = sheet?.[id]; return v === undefined ? x : (x * UNIT) / mult(id, v); };

// Validates an effective sheet at duel start and on a record's read: known dial ids, whole numbers from the dial's floor to its cap, AND (through `validateBuild`) the points they account for fit a
// full career plus the gear pool - so a forged sheet with every dial at 100 (450 points) is refused here, not just bounded dial by dial. It cannot tell a legal-looking sheet from the player's real one:
// that is the server comparing against the stored build (`sheetOf(stored, gear)` equal to the record's), which lands with Backend's field. Returns the dials off base in code order, or undefined for none.
export function checkSheet(sheet: Sheet | undefined): Sheet | undefined {
  if (!sheet) return undefined;
  const placed: Record<string, number> = {};
  for (const id of Object.keys(sheet)) {
    const d = DIAL.get(id), v = sheet[id]!;
    if (!d) throw Error(`Sheet: "${id}" is not a dial row (sheet-defs.json dials)`);
    if (!Number.isInteger(v) || v < d.floor || v > d.cap) throw Error(`Sheet: ${id} is a whole number from ${d.floor} to ${d.cap}`);
    placed[id] = Math.max(0, v - d.base);
  }
  const problems = validateBuild({ level: POINTS.maxLevel, placed }, POINTS.gear);
  if (problems.length) throw Error(`Sheet: ${problems.join('; ')}`);
  const out: Record<string, number> = {};
  for (const d of DIALS) if (sheet[d.id] !== undefined && sheet[d.id] !== d.base) out[d.id] = sheet[d.id]!;
  return Object.keys(out).length ? out : undefined;
}
export const dialByCode = (code: number): Dial | undefined => DIALS[code - 1];
