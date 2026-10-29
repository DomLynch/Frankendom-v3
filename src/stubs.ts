// Every V1 module the duel no longer carries, one line each, naming the V1 file (RPG-game @ 82a994d15) it stands in for. Nothing outside
// this file may import src/core/* (but registry.ts), net, zones, legends or pit (CI: scripts/check-stubs.mjs). Pure data V1's feel layer
// reads (grade finishes, material rows, the opponent's worn kit) is passed through from V1's own rows; the rest is a constant.
import { SKILL_MOVE, SKILL_ROWS, type SkillId } from './fight/moves.ts';
import type { OpponentId } from './roster.ts';
import LOOT_PIECES from './core/loot-pieces.json' with { type: 'json' };
import STUB_ROWS from '../data/stubs.json' with { type: 'json' };

// data/stubs.json: the slot names and the two lesson lines (checked at load: a bad row stops the page, not a fight)
if (!Array.isArray(STUB_ROWS.weaponSlots) || !STUB_ROWS.weaponSlots.length || STUB_ROWS.weaponSlots.some((s) => typeof s !== 'string' || !s.trim())) throw new Error('data/stubs.json: weaponSlots is a non-empty list of names');
for (const k of ['twoHandedHides', 'bareTier', 'bareTierHides'] as const) if (typeof STUB_ROWS[k] !== 'string' || !STUB_ROWS[k].trim()) throw new Error(`data/stubs.json: ${k} is a non-empty name`);
if (!STUB_ROWS.lessonFell.trim() || !STUB_ROWS.lessonNext.trim()) throw new Error('data/stubs.json: lessonFell and lessonNext are non-empty lines');

// core/grades.ts, core/finish-rows.ts, core/contracts/definitions.ts: V1's rows, as they are (the opponent's grade at his rung, spark materials)
export { GRADES, TIERS, classOf, gradeFor, levelOf, type DrawClass, type Finish, type Tier } from './core/grades.ts';   // core/grades.ts
export { finishRow } from './core/finish-rows.ts';   // core/finish-rows.ts
export { OPENERS, WORLD, held, openerLeashLift, openerOn, openerReach, validateOpeners, idleOnes, inAggro, isStanding, kill, leashed, nearestStanding, pitOrigin, poseAt, poseFits, spotsFor, tick, validateSpots, withinLoad, bossLoadAfterKill, zoneDuel, type Spawn } from './zone/spawns.ts';   // several bosses at their spots (live-zone phase 1b): the page's rules for the zone row's spawns
export { ATTACKERS, attackersOn, dropped, framingWiden, joiners, validateFraming, MAX_ATTACKERS } from './zone/attackers.ts';   // real-time zone aggro: who joins the hero's fight and who lets go (the attackers' duels: src/fight/attacker-bout.ts)
export { WALK_BACK, arrived, holdBack, reaggro, validateWalkBack, walkBackOn } from './zone/walk-back.ts';   // the boss leash walk-back: a leashed boss walks home regenerating instead of resetting on the spot
export { ringedZoneFor as zoneFor, type ZoneRow } from './zone/zone-rows.ts';   // the zone row (data/zones/zone1.row.json): the zone loop's one read (src/fight/zone-loop.ts)
export { materialRow } from './core/contracts/definitions.ts';   // core/contracts/definitions.ts
// core/loot.ts (pulls in legends, the economy and the account): the three reads the duel makes, V1's own expressions over V1's own rows
export type LootId = `${string}.${string}`;   // core/loot.ts LootId
export const SKILLS = Object.fromEntries(Object.values(SKILL_ROWS).map((r) => [r.id, { opponent: r.opponent as OpponentId | null, name: r.name }])) as Record<SkillId, { opponent: OpponentId | null; name: string }>;   // core/loot.ts:60 SKILLS
export const skillOf = (opponent: OpponentId): SkillId | null => (Object.values(SKILL_ROWS).find((r) => r.opponent === opponent)?.id as SkillId | undefined) ?? null;   // core/loot.ts:65 skillOf
const WEAPON_SLOTS: readonly string[] = STUB_ROWS.weaponSlots;   // core/loot.ts:23 WEAPON_SLOTS
const notWorn = (opponent: string, tier?: string) => LOOT_PIECES.lootNotWorn.filter((r) => r.opponent === opponent && ('tier' in r ? r.tier === tier : true)).flatMap((r) => r.slots);   // core/loot.ts:139-141 NOT_WORN, NOT_WORN_AT
export const kitWorn = (opponent: OpponentId, twoHanded: boolean, tier?: string): LootId[] => (LOOT_PIECES.lootPiece.find((r) => r.id === opponent)?.slots ?? []).filter((slot) => !WEAPON_SLOTS.includes(slot) && !(twoHanded && slot === STUB_ROWS.twoHandedHides) && !(tier === STUB_ROWS.bareTier && slot === STUB_ROWS.bareTierHides) && !notWorn(opponent, tier).includes(slot)).map((slot) => `${opponent}.${slot}` as LootId);   // core/loot.ts:142 kitWorn
// arena.ts, arena-themes.ts: V2's flat stage instead of V1's pit (src/arena-stage.ts)
export { arenaFor, buildArena, crowdWave, type Arena, type ArenaTheme } from './arena-stage.ts';   // arena.ts buildArena + crowdWave, arena-themes.ts arenaFor
// sparring.ts: no sparring links in V3
export const SPARRING_SKILLS = Object.keys(SKILL_MOVE) as SkillId[];   // sparring.ts:23 SPARRING_SKILLS
export const sparringAsked = (_search: string): boolean => false;   // sparring.ts:36 sparringAsked (?spar=1 is not read)
export const sparringParam = (_search: string, _carried?: readonly string[]): SparringKit | null => null;   // sparring.ts:27 sparringParam
export type SparringLevel = 'easy' | 'normal' | 'hard' | 'dummy' | number;   // sparring.ts:17 SparringLevel
export type SparringKit = { weapon: import('./fight/moves.ts').WeaponId; difficulty: SparringLevel; skill: SkillId | null };   // sparring.ts:24 SparringKit
// ladder.ts, lessons.ts: one fight, no ladder, no scripted first loss
export const won = (finish: { victim: 0 | 1; draw?: boolean } | null): boolean => !!finish && finish.victim === 1 && !finish.draw;   // ladder.ts:11 won
export type LessonLine = string;   // lessons.ts:25 LessonLine
export const lessonText = (_id: LessonLine): string => '';   // lessons.ts:28 lessonText (no lesson fight)
export const LESSON_FELL: string = STUB_ROWS.lessonFell;   // lessons.ts:35 (data/stubs.json)
export const LESSON_NEXT: string = STUB_ROWS.lessonNext;   // lessons.ts:36 (data/stubs.json)
// @sentry/browser: no monitoring service. The one error seam stays the one place errors are caught: it logs, and hands the error to the telemetry sink the page installs (src/telemetry.ts, js_error kind "caught"), so there is no second hook.
let errorSink: ((error: unknown) => void) | null = null;
export const setErrorSink = (sink: ((error: unknown) => void) | null): void => { errorSink = sink; };
export const captureException = (error: unknown, _context?: unknown): void => { console.error(error); try { errorSink?.(error); } catch { /* telemetry never breaks the error path */ } };   // @sentry/browser captureException
