// Replay and share of a fight record (beta plan brief 3, second slice). Pure: no DOM, no renderer. `verifyRecord` steps the
// duel from the record exactly as the live game did (same seed, same warden profile, the same quantized intents) and confirms the
// fight ends where the record says it does; Share runs it headless before anything is published, and the release gate and a
// server can run it the same way. `shareUrl` builds the link the game opens in replay mode: the opponent id rides in the URL as
// its own parameter so the page boots the right rig synchronously, and the record itself follows as the `replay` parameter.
import { initialPractice, stepPractice, type Practice } from './combat.ts';
import { LEVELS, OPPONENTS, opponentAt, profileAt } from './moves.ts';
import { encodeRecord, type FightRecord } from './record.ts';
import { underRecord } from '../detmath.ts';
import { groupLayer, withIncoming } from '../pack.ts';
import { skillOf } from '../loot.ts';
import { specialOf, type SkillId, type SpecialName } from './moves.ts';

// The Special Moves a record's fight had (version 21's flag), as initialPractice takes them: every replay builds the fight through this one door.
export const recordSpecials = (record: Pick<FightRecord, 'specials' | 'level' | 'opponent'>): { level: number; aiSkill: SkillId | null; name?: SpecialName } | undefined =>
  record.specials ? { level: record.level, aiSkill: skillOf(record.opponent), ...(specialOf(record.opponent, record.level) ? { name: specialOf(record.opponent, record.level)! } : {}) } : undefined;

export const MAX_SHARE_CHARS = 4096;   // a guest's link carries the record itself: 4 KB rides every share sheet and SMS; a signed-in fighter's link carries a short id instead (share-store.ts)

export type Verification = { ok: true; practice: Practice } | { ok: false; reason: string; practice: Practice | null };

// Steps the record headless and checks that the fight finished on its last recorded tick with the recorded outcome.
export function verifyRecord(record: FightRecord, onTick?: (practice: Practice) => void): Verification {   // onTick: called after every stepped tick (src/group-verify.ts reads the damage each stream dealt)
  return underRecord(record, () => verifyUnder(record, onTick));   // the record's version picks the sim's math (detmath.ts), here and in every replay
}
function verifyUnder(record: FightRecord, onTick?: (practice: Practice) => void): Verification {
  const opponent = OPPONENTS[record.opponent], profile = opponent && Number.isInteger(record.level) && record.level >= 1 && record.level <= LEVELS ? profileAt(opponent, record.level) : undefined;   // the warden at the record's level, exactly as main.ts steps it
  if (!opponent || !profile) return { ok: false, reason: 'unknown opponent or warden profile', practice: null };
  const group = record.group;   // RV39: one stream of a shared-health group replays ALONE from the incoming damage and held spans its own record carries (src/pack.ts)
  let practice: Practice;
  try {   // a record this build cannot step (a weapon the hero rig has no blade table for, a rule that throws) is a refusal, not a crash
    practice = initialPractice(record.seed, opponentAt(opponent, record.level), record.weapon, record.skill ?? null, recordSpecials(record), record.gambit ? record.seed : undefined, record.stances, record.pose);
    for (let i = 0; i < record.intents.length; i++) {
      if (practice.finish) return { ok: false, reason: `the fight ended at tick ${practice.duel.tick}, before the record's last tick ${record.ticks}`, practice };
      practice = group ? stepPractice(withIncoming(practice, group, i + 1), record.intents[i], profile, groupLayer(group, i + 1)) : stepPractice(practice, record.intents[i], profile);
      onTick?.(practice);
    }
  } catch (error) {
    return { ok: false, reason: `this build cannot step the record: ${error instanceof Error ? error.message : String(error)}`, practice: null };
  }
  const finish = practice.finish;
  if (record.outcome === 'abandoned') return finish ? { ok: false, reason: 'an abandoned record ends in a finish', practice } : { ok: true, practice };
  if (!finish) return { ok: false, reason: 'the record does not reach its finish', practice };
  const outcome = finish.draw ? 'draw' : finish.victim === 1 ? 'killed' : 'died';
  if (outcome !== record.outcome) return { ok: false, reason: `the replay ends in "${outcome}", the record says "${record.outcome}"`, practice };
  return { ok: true, practice };
}

export async function shareUrl(record: FightRecord, origin: string): Promise<{ url: string } | { tooLong: number }> {
  const text = await encodeRecord(record);
  if (text.length > MAX_SHARE_CHARS) return { tooLong: text.length };
  return { url: `${origin}/?opponent=${record.opponent}&replay=${text}` };
}

export const replayParam = (search: string): string | null => /[?&]replay=([A-Za-z0-9_-]+)/.exec(search)?.[1] ?? null;
