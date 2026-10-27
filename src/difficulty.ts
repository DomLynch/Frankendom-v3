// V3's difficulty setting (data/difficulty.json over data/profiles.json): the opponent PROFILE row says who he is and how he plays at 100 %,
// a DIFFICULTY row overrides only the brain knobs and the two stat scales. Nothing here touches the sim's rules: the knobs are the argument
// stepPractice takes (src/brain.ts); the scales go into the opponent's body (health), his sheet (attack dial) and his special's share before the
// fight is built. The result is plain data (`FightPick`: profile id + difficulty row id), so a server can choose it per encounter and replay it.
import type { Opponent, AiProfile } from './fight/moves.ts';
import type { Practice } from './fight/combat.ts';
import { brainProfile, type BrainRow } from './brain.ts';

export const KNOBS = ['reaction', 'accuracy', 'parry', 'dodge', 'aggression', 'pressure', 'discipline', 'lapse', 'read'] as const;
export type Knobs = Pick<AiProfile, (typeof KNOBS)[number]>;
export type DifficultyRow = { id: string | number } & Knobs & { foeHealthScale: number; foeDamageScale: number; about?: string };
export type ProfileRow = { id: string; opponent: string; brain: string | null; foeHealthScale: number; foeDamageScale: number; knobs?: Partial<Knobs>; body?: string; about?: string };   // knobs: this kind's own brain knobs, laid over the difficulty row's (a zone spawn `kind` is a profile id: src/fight/spawn-kind.ts)
export type DifficultyFile = { default: number; rows: DifficultyRow[]; named: DifficultyRow[] };
export type FightPick = { profile: string; difficulty: string | number };

/** The row `?difficulty=` names: 1..10 (or a named row such as `legacy`); anything else is the default row, with a console warning (never throws). */
export function difficultyPick(file: { default: number; rows: readonly { id: string | number }[]; named?: readonly { id: string | number }[] }, search: string, warn: (m: string) => void = (m) => console.warn(m)): string | number {
  const raw = new URLSearchParams(search).get('difficulty');
  if (raw === null) return file.default;
  const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (file.rows.some((r) => r.id === n)) return n;
  if (file.named?.some((r) => r.id === raw)) return raw;
  warn(`?difficulty=${raw} is not a difficulty row (1-${file.rows.length}${file.named?.length ? `, ${file.named.map((r) => r.id).join(', ')}` : ''}); playing the default, ${file.default}`);
  return file.default;
}

export type Resolved = { opponent: string; brain: BrainRow; foeHealthScale: number; foeDamageScale: number };
/** The profile + difficulty a fight plays: the profile's brain row (data/brains.json, or none = V1's profile) with the difficulty row's knobs over it, and the difficulty's scales times the profile's. */
export function resolveFight(pick: FightPick, profiles: readonly ProfileRow[], difficulty: DifficultyFile, brains: readonly BrainRow[]): Resolved {
  const p = profiles.find((r) => r.id === pick.profile);
  if (!p) throw new Error(`profiles.json has no row '${pick.profile}'`);
  const d = [...difficulty.rows, ...difficulty.named].find((r) => r.id === pick.difficulty);
  if (!d) throw new Error(`difficulty.json has no row '${String(pick.difficulty)}'`);
  const base = p.brain === null ? {} : brains.find((b) => b.id === p.brain);
  if (!base) throw new Error(`profiles.json row '${p.id}': brains.json has no row '${p.brain}'`);
  const knobs: Record<string, unknown> = { ...base };
  delete knobs.id;
  for (const k of KNOBS) knobs[k] = d[k];
  if (p.knobs) Object.assign(knobs, p.knobs);   // the kind's own knobs over the difficulty row's (a goblin that dodges and weaves whatever the ladder says); no `knobs` = the difficulty row as before
  return { opponent: p.opponent, brain: { id: `${p.id}/${String(d.id)}`, ...knobs } as BrainRow, foeHealthScale: p.foeHealthScale * d.foeHealthScale, foeDamageScale: p.foeDamageScale * d.foeDamageScale };
}

/** The AI profile of the fight: V1's, the resolved brain's knobs over it; `v1Ai` (?ai=v1) is V1's untouched. */
export const profileFor = (v1: AiProfile, r: Resolved, v1Ai: boolean): AiProfile => (v1Ai ? v1 : brainProfile(v1, r.brain));

/** The opponent's body with the health scale applied (scales of 1 return the same object) and his attack dial set to the damage scale (sheet.attack = (scale - 1) x 100, the sheet's own multiplier, sheet-rows.ts). */
export function scaledOpponent(body: Opponent, r: Resolved): Opponent {
  const { foeHealthScale: h, foeDamageScale: d } = r;
  if (h === 1 && d === 1) return body;
  return { ...body, health: Math.max(1, Math.round(body.health * h)), ...(d === 1 ? {} : { sheet: { ...body.sheet, attack: Math.round((d - 1) * 100) } }) };
}

/** A fight's opening Practice with the damage scale also on the opponent's special (its share of the hero's health, which the sheet's attack dial does not reach). Scale 1 returns the practice untouched. */
export function scaledPractice(p: Practice, r: Resolved): Practice {
  if (r.foeDamageScale === 1) return p;
  const [hero, foe] = p.duel.fighters;
  if (foe.specialShare === undefined) return p;
  return { ...p, duel: { ...p.duel, fighters: [hero, { ...foe, specialShare: foe.specialShare * r.foeDamageScale }] } };
}
