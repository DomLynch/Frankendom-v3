// Every V1 module the duel no longer carries, one line each, naming the V1 file (RPG-game @ 82a994d15) it stands in for. Nothing outside
// this file may import src/core/* (but registry.ts), net, zones, legends or pit (CI: scripts/check-stubs.mjs). Pure data V1's feel layer
// reads (grade finishes, material rows, the opponent's worn kit) is passed through from V1's own rows; the rest is a constant.
import { SKILL_MOVE, SKILL_ROWS, type SkillId } from './fight/moves.ts';
import type { OpponentId } from './roster.ts';
import LOOT_PIECES from './core/loot-pieces.json' with { type: 'json' };

// core/grades.ts, core/finish-rows.ts, core/contracts/definitions.ts: V1's rows, as they are (the opponent's grade at his rung, spark materials)
export { GRADES, TIERS, classOf, gradeFor, levelOf, type DrawClass, type Finish, type Tier } from './core/grades.ts';   // core/grades.ts
export { finishRow } from './core/finish-rows.ts';   // core/finish-rows.ts
export { OPENERS, WORLD, held, openerLeashLift, openerOn, openerReach, validateOpeners, idleOnes, inAggro, isStanding, kill, leashed, nearestStanding, pitOrigin, poseAt, spotsFor, tick, validateSpots, type Spawn } from './zone/spawns.ts';   // several bosses at their spots (live-zone phase 1b): the page's rules for the zone row's spawns
export { ATTACKERS, attackersOn, dropped, framingWiden, joiners, validateFraming, MAX_ATTACKERS } from './zone/attackers.ts';   // real-time zone aggro: who joins the hero's fight and who lets go (the attackers' duels: src/fight/attacker-bout.ts)
export { zoneFor, type ZoneRow } from './zone/zone-rows.ts';   // the zone row (data/zones/zone1.row.json): the zone loop's one read (src/fight/zone-loop.ts)
export { materialRow } from './core/contracts/definitions.ts';   // core/contracts/definitions.ts
// core/loot.ts (pulls in legends, the economy and the account): the three reads the duel makes, V1's own expressions over V1's own rows
export type LootId = `${string}.${string}`;   // core/loot.ts LootId
export const SKILLS = Object.fromEntries(Object.values(SKILL_ROWS).map((r) => [r.id, { opponent: r.opponent as OpponentId | null, name: r.name }])) as Record<SkillId, { opponent: OpponentId | null; name: string }>;   // core/loot.ts:60 SKILLS
export const skillOf = (opponent: OpponentId): SkillId | null => (Object.values(SKILL_ROWS).find((r) => r.opponent === opponent)?.id as SkillId | undefined) ?? null;   // core/loot.ts:65 skillOf
const WEAPON_SLOTS: readonly string[] = ['Trident', 'Cleaver', 'Knife', 'Estoc', 'Gladius', 'Scythe', 'Warhammer', 'Maul', 'Longsword', 'Bow', 'Staff'];   // core/loot.ts:23 WEAPON_SLOTS
const notWorn = (opponent: string, tier?: string) => LOOT_PIECES.lootNotWorn.filter((r) => r.opponent === opponent && ('tier' in r ? r.tier === tier : true)).flatMap((r) => r.slots);   // core/loot.ts:139-141 NOT_WORN, NOT_WORN_AT
export const kitWorn = (opponent: OpponentId, twoHanded: boolean, tier?: string): LootId[] => (LOOT_PIECES.lootPiece.find((r) => r.id === opponent)?.slots ?? []).filter((slot) => !WEAPON_SLOTS.includes(slot) && !(twoHanded && slot === 'Shield') && !(tier === 'Recruit' && slot === 'Crest') && !notWorn(opponent, tier).includes(slot)).map((slot) => `${opponent}.${slot}` as LootId);   // core/loot.ts:142 kitWorn
// arena.ts, arena-themes.ts: V2's flat stage instead of V1's pit (src/arena-stage.ts)
export { arenaFor, buildArena, crowdWave, type Arena, type ArenaTheme } from './arena-stage.ts';   // arena.ts buildArena + crowdWave, arena-themes.ts arenaFor
// sparring.ts: no sparring links in V3
export const SPARRING_SKILLS = Object.keys(SKILL_MOVE) as SkillId[];   // sparring.ts:23 SPARRING_SKILLS
export const sparringAsked = (_search: string): boolean => false;   // sparring.ts:36 sparringAsked (?spar=1 is not read)
export const sparringParam = (_search: string, _carried?: readonly string[]): null => null;   // sparring.ts:27 sparringParam
export type SparringLevel = 'easy' | 'normal' | 'hard' | 'dummy' | number;   // sparring.ts:17 SparringLevel
export type SparringKit = { weapon: import('./fight/moves.ts').WeaponId; difficulty: SparringLevel; skill: SkillId | null };   // sparring.ts:24 SparringKit
// ladder.ts, lessons.ts: one fight, no ladder, no scripted first loss
export const won = (finish: { victim: 0 | 1; draw?: boolean } | null): boolean => !!finish && finish.victim === 1 && !finish.draw;   // ladder.ts:11 won
export type LessonLine = string;   // lessons.ts:25 LessonLine
export const lessonText = (_id: LessonLine): string => '';   // lessons.ts:28 lessonText (no lesson fight)
export const LESSON_FELL = 'You fell. That was the lesson.';   // lessons.ts:35
export const LESSON_NEXT = 'Fight for real';   // lessons.ts:36
// @sentry/browser: no monitoring service
export const captureException = (error: unknown, _context?: unknown): void => { console.error(error); };   // @sentry/browser captureException
