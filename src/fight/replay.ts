// Replay and share of a fight record (beta plan brief 3, second slice). Pure: no DOM, no renderer. `verifyRecord` steps the
// duel from the record exactly as the live game did (same seed, same warden profile, the same quantized intents) and confirms the
// fight ends where the record says it does; Share runs it headless before anything is published, and the release gate and a
// server can run it the same way. `shareUrl` builds the link the game opens in replay mode: the opponent id rides in the URL as
// its own parameter so the page boots the right rig synchronously, and the record itself follows as the `replay` parameter.
import { type FightRecord } from './record.ts';
import { skillOf } from '../stubs.ts';   // V3: core/loot.ts
import { specialOf, type SkillId, type SpecialName } from './moves.ts';
// The Special Moves a record's fight had (version 21's flag), as initialPractice takes them: every replay builds the fight through this one door.
export const recordSpecials = (record: Pick<FightRecord, 'specials' | 'level' | 'opponent'>): { level: number; aiSkill: SkillId | null; name?: SpecialName } | undefined =>
  record.specials ? { level: record.level, aiSkill: skillOf(record.opponent), ...(specialOf(record.opponent, record.level) ? { name: specialOf(record.opponent, record.level)! } : {}) } : undefined;

   // a guest's link carries the record itself: 4 KB rides every share sheet and SMS; a signed-in fighter's link carries a short id instead (share-store.ts)

// Steps the record headless and checks that the fight finished on its last recorded tick with the recorded outcome.
// A record's sheet is the CLIENT's claim (a dial at 100 is a free 2x), so a verifier that grants anything on a replay must not take it on trust: by default a record that carries a sheet is REFUSED.
// `sheet` says how to take it: a Sheet = the one the server holds for this player (`sheetOf(storedBuild, wornGear)`), accepted only when the record's equals it; 'trust' = the caller's own fight
// (the page checking the fight it just played before it shares it), where nothing is granted on the strength of it. Records without a sheet are not affected.
