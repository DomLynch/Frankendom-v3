// A zone spawn's KIND (Strategy + Dom 2026-10-27, "10 different bosses, build it once", PR 1: per-spawn behaviour). Every zone spawn row (data/zones/*.row.json spawns[].kind)
// names a data/profiles.json profile row; the profile names a V1 archetype (src/fight/archetype-defs.json: its stats, moves, specials and AI profile), a brain row and scales,
// and may carry its own brain `knobs`. Everything the duel sim needs to fight that kind is built here, pure and keyed by the kind, so the page swaps the sim's opponent when it
// hands the sim to a spawn of another kind (and back) with nothing page-wide left to swap. The default zone is three spawns of one kind (pitborn), so its swap is the same
// object every time and the fight is byte for byte the one the page built once before.
//   kindFightFor(kind, ctx)   the opponent id, V1 body, difficulty-resolved scales and AI profile of one kind (a bad kind throws, naming the profile ids)
//   kindPractice(k, ctx, ...) the opening Practice of a fight against that kind (what src/client/main.ts `make` built from the page-wide opponent)
// The body and the drawing (scene.ts, characters.ts) are not here: PR 2.
import { initialPractice, type Practice } from './combat.ts';
import { OPPONENTS, opponentAt, profileAt, type AiProfile, type Opponent, type SkillId, type WeaponId } from './moves.ts';
import { recordSpecials } from './replay.ts';
import type { PickedStance } from './stance.ts';
import type { DuelPose } from './duel.ts';
import { bossOpponent } from './boss-weapon.ts';
import { brainFor, brainProfile, type BrainRow } from '../brain.ts';
import { tunedOpponent, tunedResolved, type TuneMap } from '../tune.ts';
import { mergeTune } from '../progression.ts';
import { starTune, type StarsFile } from '../stars.ts';
import { profileFor, resolveFight, scaledOpponent, scaledPractice, type DifficultyFile, type ProfileRow, type Resolved } from '../difficulty.ts';

/** What every kind is built with: the data files, the page's difficulty pick and address, and the fight row's shared picks. */
export type KindCtx = {
  profiles: readonly ProfileRow[]; difficulty: DifficultyFile; brains: readonly BrainRow[]; pick: string | number; search: string; level: number;
  ai: string | undefined;                                   // data/fight.json `ai`: the brain row the legacy (off-difficulty) fight plays
  override: string | null;                                  // ?pitborn=v1: every kind fights as this archetype (the Centurion), difficulty off; null = each kind as its profile says
  stars?: StarsFile;                                        // data/stars.json: the star levels a kind may be built at (kindTable(kind, star)); absent = 0-star only
  tune?: TuneMap;                                        // ?tune= (src/tune.ts, data/tune.json): per-kind multipliers on health, damage and speed; absent or empty = none
  weapon: WeaponId; skill: SkillId; skill2: SkillId; stance: PickedStance; specials: boolean;
};
/** One kind as the sim fights it: the archetype id and body, whether the difficulty/profile scales apply, and the AI profile the stepping uses. */
export type KindFight = { kind: string; opponentId: string; opponent: Opponent; resolved: Resolved; scaled: boolean; ai: AiProfile; star?: number };   // star: the data/stars.json level this instance stands at (absent = 0-star)

/** The profile ids a spawn `kind` may name (the data/profiles.json rows). */
export const kindIds = (profiles: readonly ProfileRow[]): string[] => profiles.map((p) => p.id);

/** Why `kind` cannot be a spawn's kind, or null: it must be a profile row whose opponent is an archetype. */
export function kindProblem(kind: string, profiles: readonly ProfileRow[], archetypes: readonly string[] = Object.keys(OPPONENTS)): string | null {
  const row = profiles.find((p) => p.id === kind);
  if (!row) return `kind "${kind}" is no data/profiles.json row (${kindIds(profiles).join(', ')})`;
  if (!archetypes.includes(row.opponent)) return `kind "${kind}" names opponent "${row.opponent}", which is no archetype (src/fight/archetype-defs.json)`;
  return null;
}

/** The sim's opponent for `kind`. Throws (kindProblem's words) on an unknown kind. */
export function kindFightFor(kind: string, ctx: KindCtx, star = 0): KindFight {
  const why = kindProblem(kind, ctx.profiles);
  if (why) throw new Error(why);
  const tune = star > 0 && ctx.stars ? mergeTune(ctx.tune ?? {}, starTune(ctx.stars, star, kind)) : ctx.tune;   // data/stars.json: a star instance's health and damage multiply on top of the profile, difficulty, escalation and ?tune=; star 0 is `ctx.tune` itself
  const resolved = tunedResolved(resolveFight({ profile: kind, difficulty: ctx.pick }, ctx.profiles, ctx.difficulty, ctx.brains), tune, kind);
  const opponentId = ctx.override ?? resolved.opponent, base = OPPONENTS[opponentId as keyof typeof OPPONENTS];
  const opponent = ctx.override === null ? tunedOpponent(bossOpponent(base, ctx.search), tune, kind) : base;   // data/boss-weapons.json: Gargantua (executioner) fights with a maul, Arachne (shieldmaiden) with an axe; ?bossweapon=v1 and ?pitborn=v1 keep V1's row for the archetype
  const scaled = resolved.opponent === opponentId;   // the profile's own archetype fights with its difficulty and scales; the ?pitborn=v1 Centurion is V1's fight as before
  const v1 = profileAt(opponent, ctx.level);
  const ai = scaled ? profileFor(v1, resolved, new URLSearchParams(ctx.search).get('ai') === 'v1') : brainProfile(v1, brainFor(ctx.brains, ctx.ai, ctx.search));
  return star > 0 ? { kind, opponentId, opponent, resolved, scaled, ai, star } : { kind, opponentId, opponent, resolved, scaled, ai };
}

/** A memo of `kindFightFor`: one object per kind and star, so handing the sim to a kind and back is the same value each time (star 0, the default, is keyed by the kind alone as before). */
export function kindTable(ctx: KindCtx): (kind: string, star?: number) => KindFight {
  const seen = new Map<string, KindFight>();
  return (kind, star = 0) => { const key = star > 0 ? `${kind}:${star}` : kind; let k = seen.get(key); if (!k) { k = kindFightFor(kind, ctx, star); seen.set(key, k); } return k; };
}

/** A whole fight against `k` on seed `s` (the hero and one boss, the profile and difficulty scales on the boss), before the zone's ring and place (src/zone/spawns.ts zoneDuel). `pose`: where they stand, absent = the pit's marks. */
export function kindPractice(k: KindFight, ctx: KindCtx, s: number, pose?: DuelPose): Practice {
  const body = opponentAt(k.opponent, ctx.level);
  const made = initialPractice(s, k.scaled ? scaledOpponent(body, k.resolved) : body, ctx.weapon, ctx.skill,
    recordSpecials({ specials: ctx.specials, level: ctx.level, opponent: k.opponentId as never }), undefined, ctx.stance,
    pose, undefined, undefined, undefined, undefined, ctx.skill2);
  return k.scaled ? scaledPractice(made, k.resolved) : made;
}
