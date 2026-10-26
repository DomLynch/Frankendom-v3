import type { Profile } from './profile.ts';
import CAREER_RULES from './career-rules.json' with { type: 'json' };

const LADDER = CAREER_RULES.ladderRule[0]!;   // the ladderRule row of career-rules.json (every default equals the literal it replaced; tests/career-rules.test.ts pins it)

// Career rank from victory marks — the 50-level ladder (Dom via Strategy, 2026-09-27; 2026-10-05: Origin gets its own I–V, was singular at 46):
// level = 1 + wins, capped at 50. Ten street-plain titles, sub-ranks I–V on all ten; ONE win per
// sub-rank everywhere, so Recruit V is 4 wins, Origin I 45 and Origin V 49. Wins only add marks and losses never remove them, so rank never demotes.
// Existing marks carry over as they are: the count is the same, only the mapping changed. Pure: the same count renders the same rank on
// the HUD, in the journal, in tests and on the loot verifier (deploy.sh ships src/ to it, so client and server switch together).
export const TITLES = ['Recruit', 'Legionary', 'Gladiator', 'Veteran', 'Champion', 'Praetorian', 'Master', 'Primus', 'Invictus', 'Origin'] as const;
export const MAX_LEVEL = LADDER.maxLevel;
// A fight recorded before the 50-level ladder (record version < FIRST_FIFTY_VERSION) was fought under a top of 46: the server judges it by the rank
// that ladder gave (awards.ts levelRefusal), so a claim already in the queue at the deploy is not refused for a floor that did not exist when it was played.
export const FIRST_FIFTY_VERSION = 27, OLD_MAX_LEVEL = LADDER.oldMaxLevel;
const NUMERALS = ['I', 'II', 'III', 'IV', 'V'] as const;
// step/fill: the class-progress bar (Dom 2026-09-23; 2026-09-27: one whole segment per win, no partial fill) — one segment per numeral,
// `step` of them lit, `fill` always 0 now (kept so the bar code reads unchanged); next: the class the bar climbs toward ('' at Origin, no bar).
export type Rank = { title: (typeof TITLES)[number]; numeral: string; level: number; label: string; next: string; step: number; fill: number };
export const marksOf = (profile: Pick<Profile, 'career'>): number => profile.career?.victoryMarks ?? 0;
// The marks the rank shows: the account's server figure when it has one (session.standing) plus its unswept claims and the wins still
// in this device's claims outbox (loot-claims.ts), else this device's count.
export const shownMarks = (server: number | null, profile: Pick<Profile, 'career'>, pending = 0): number => (server === null ? marksOf(profile) : server + pending);
// Beta award policy (owner 2026-09-20): every won duel in the arena earns one mark — a rematch or a journal-picked opponent included.
export function awardMark(profile: Profile): number {
  const victoryMarks = marksOf(profile) + 1;
  profile.career = { victoryMarks };
  return victoryMarks;
}
export const RANK_STEPS = NUMERALS.length;
// THE BETA CUT (Dom 2026-10-17; Strategy's lists): the Pit shows the first `titles` titles of the ladder and the signed-off spell list. A VIEW, not a rule: the server keeps every row, every mark and MAX_LEVEL / OLD_MAX_LEVEL
// (a stored L16 account still loads and keeps its marks, it is shown at the cut); the client reads the cut through `betaMarks` / `betaLevel` and awards.ts judges a claim against the same cut, so a win fought at the cut counts.
// Lifting the cut is the one row: `titles` of 10 (or more) lifts the level cap, an empty `spells` lifts the spell list.
const BETA = CAREER_RULES.betaCut[0]!;
export const BETA_MAX_LEVEL = Math.min(MAX_LEVEL, BETA.titles * RANK_STEPS), BETA_SPELLS: ReadonlySet<string> = new Set(BETA.spells);
export const BETA_MAX_LOOT_RUNG: number = BETA.maxLootRung;   // the cut's loot ceiling (betaCut.maxLootRung): nothing mints above this rung; lifting the cut lifts it. The server's mint reads it through src/core/server.ts
export const betaLevel = (level: number): number => Math.min(level, BETA_MAX_LEVEL);
export const betaMarks = (marks: number): number => Math.min(marks, BETA_MAX_LEVEL - 1);   // level = 1 + marks (levelOfMarks)
// SPELLS OFF, SPECIAL 1 / SPECIAL 2 (Dom 2026-10-17, Strategy signed off): the beta's two universal slots are class specials picked from the six `specialPick` skills (existing skill-defs rows, so their moves and clips exist); spells are
// off through `spellsOff` (the code and the 20-spell `spells` list stay in the row, inert) except the `utilitySpells` (heal, the one utility pick). Lifting it is the row: `spellsOff` 0 puts the spell list back, an empty `specialPick` lifts the pick.
export const BETA_SPECIAL_SLOTS: number = BETA.specialSlots;   // how many SPECIAL slots the pick fills (the row says 2: SPECIAL 1 on the 'skill' button, SPECIAL 2 on 'skill2'; the HUD has those two buttons)
export const BETA_SPELLS_OFF: boolean = Boolean(BETA.spellsOff), BETA_UTILITY_SPELLS: ReadonlySet<string> = new Set(BETA.utilitySpells), BETA_SPECIAL_PICK: readonly string[] = BETA.specialPick, BETA_SPECIAL_ROLES: Readonly<Record<string, string>> = BETA.specialRoles;
export const BETA_SLOT1_DEFAULT: string = BETA.slot1Default, BETA_SLOT1_ALT: string = BETA.slot1Alt;   // Dom's beta specials ruling (2026-10-20): every player, guests included, starts with SPECIAL 1 and SPECIAL 2 filled from the four-skill pick (Skull Crack, Whirlwind); the alt fills a slot when the other already holds its default
export const BETA_SLOT2_DEFAULT: string = BETA.slot2Default, BETA_SLOT2_ALT: string = BETA.slot2Alt;   // RV80 (Dom 2026-10-19: the sandbox pre-fills SPECIAL 2): what SPECIAL 2 holds until the player picks, and what it holds instead when SPECIAL 1 is that same skill (never the same move in both buttons)
export const inBetaSpells = (legend: string): boolean => BETA_SPELLS_OFF ? BETA_UTILITY_SPELLS.has(legend) : BETA_SPELLS.size === 0 || BETA_SPELLS.has(legend);
/** Whether `skill` may sit in a SPECIAL slot under the cut (an empty pick list lifts the pick). */
export const inBetaSpecials = (skill: string): boolean => BETA_SPECIAL_PICK.length === 0 || BETA_SPECIAL_PICK.includes(skill);
// THE CUT ON A RECORD (the specials PR): a record that casts a spell the cut turns off, or names a skill outside the pick, is judged the way the cut judges a level below the floor (awards.ts levelRefusal): refused, no mark, with a text for the
// player. The cut is a parameter so a test can lift it; the default is the betaCut row. SPECIAL 1 (`skill`) is held to the pick only where `skillOne` says so: a Pit claim's `skill` is the older equipped-loot skill, a world hero's is always a pick.
// A claim is judged by the rules it was MADE under (as #3051 and levelRefusal do): the cut applies only to a record at or above `fromVersion` (the record version that introduced SPECIAL 2, tests/frontier-era.test.ts holds it to
// FIRST_SKILL2_VERSION); an older record (a cached page, a recheck of a win made before the bump) is judged by the spell rules it was fought under.
export type SpecialsCut = { readonly spellsOff: boolean; readonly utilitySpells: ReadonlySet<string>; readonly pick: readonly string[]; readonly fromVersion: number };
export const BETA_SPECIALS_FROM: number = BETA.specialsFromVersion;
export const BETA_SPECIALS_CUT: SpecialsCut = { spellsOff: BETA_SPELLS_OFF, utilitySpells: BETA_UTILITY_SPELLS, pick: BETA_SPECIAL_PICK, fromVersion: BETA_SPECIALS_FROM };
export function specialsRefusal(rec: { spell?: { id: string }; spell2?: { id: string }; skill?: string | null; skill2?: string }, cut: SpecialsCut = BETA_SPECIALS_CUT, skillOne = true, version?: number): string | null {
  if (version !== undefined && version < cut.fromVersion) return null;   // made under the older rules: the cut does not reach back
  if (cut.spellsOff) for (const s of [rec.spell, rec.spell2]) if (s && !cut.utilitySpells.has(s.id)) return `Spells are off in the beta, so this win didn't count (it cast ${s.id}).`;
  const held = (skill: string | null | undefined): boolean => !skill || cut.pick.length === 0 || cut.pick.includes(skill);
  if (!held(rec.skill2)) return `This win was fought with a special the beta doesn't offer and didn't count (${rec.skill2}).`;
  if (skillOne && !held(rec.skill)) return `This win was fought with a special the beta doesn't offer and didn't count (${rec.skill}).`;
  return null;
}
const wins = (marks: number): number => (Number.isFinite(marks) ? Math.max(0, Math.floor(marks)) : 0);
// The career level the ladder's difficulty reads (moves.ts profileAt, Combat): 1 for a fresh fighter, 50 at Origin V.
export const levelOfMarks = (marks: number): number => Math.min(MAX_LEVEL, 1 + wins(marks));
// The difficulty dial (Dom via Strategy, 2026-09-27): the opponent fights at the dial, not the rank; the HUD shows rank only. The dial
// normally equals the rank level. Two straight losses at the same dial: dial −1 (rank unchanged, never below 1). Each win: dial +1, never
// above the rank; three straight wins: the dial snaps to the rank. It never trails the rank by more than DIAL_TRAIL. Device-only state.
export type Dial = { level: number; losses: number; wins: number };
export const DIAL_TRAIL = LADDER.dialTrail;
export const dialLevel = (dial: Pick<Dial, 'level'> | undefined, rank: number): number =>
  Math.min(rank, Math.max(1, rank - DIAL_TRAIL, Number.isInteger(dial?.level) ? dial!.level : rank));
// The level a ladder fight is fought at: the dial against the career count's rank level. main.ts builds the Match and every career rematch
// with it, from the count the rank shows (shownMarks: the server figure once there), so a rematch never skips the dial.
export const fightLevel = (dial: Pick<Dial, 'level'> | undefined, marks: number): number => dialLevel(dial, levelOfMarks(marks));
// `rank`: the rank level the fight was fought at (before its result lands).
export function turnDial(dial: Dial | undefined, rank: number, won: boolean): Dial {
  const level = dialLevel(dial, rank);
  if (won) {
    const next = Math.min(MAX_LEVEL, rank + 1), wins = (dial?.wins ?? 0) + 1;
    return { level: wins >= 3 ? next : Math.min(next, level + 1), losses: 0, wins };
  }
  const losses = (dial?.losses ?? 0) + 1;
  return losses >= 2 ? { level: Math.max(1, rank - DIAL_TRAIL, level - 1), losses: 0, wins: 0 } : { level, losses, wins: 0 };
}
export function rankFor(marks: number): Rank {
  const level = levelOfMarks(marks), index = level - 1;
  const title = TITLES[Math.floor(index / NUMERALS.length)], step = index % NUMERALS.length, numeral = NUMERALS[step];
  return { title, numeral, level, label: `${title} ${numeral}`, next: TITLES[Math.floor(index / NUMERALS.length) + 1] ?? '', step, fill: 0 };
}
