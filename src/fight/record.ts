// The fight record (beta plan brief 3, owner 2026-09-21): one fight, replayable anywhere. A pure module — no DOM, no renderer — so a
// browser, a Node gate and a server can all record, encode, decode and (in the next slice) replay the same fight. The duel is
// deterministic given the warden's seed and the player's Intent per tick (src/fight/duel.ts stepDuel uses no other randomness), so the
// record is exactly that: who fought, which seed, and every intent the player fed the simulation, quantized so that what the live
// game stepped and what a replay steps are the same bits.
//
// Encoding: a versioned binary (version FIRST; an unknown version is refused, never best-effort decoded) — header, then columnar
// per-tick bytes (stick x, stick z, camera-yaw delta, action, guard side, flags) — gzipped and base64url'd. Columns of mostly
// repeated or zero bytes gzip well: a 30 s fight (1,800 ticks) lands well under 2 KB (tests/record.test.ts measures a real one).
// Nothing here talks to the network; recording stays in memory until a later slice's Share.
import { roundPose, validatePose, type Action, type DuelPose, type Intent } from './duel.ts';
import { checkSheet, DIALS, dialByCode, type Sheet } from './sheet-rows.ts';
import { LEVELS, OPPONENTS, PLAYER_WEAPONS, SKILL_BY_CODE, opponentAt, type Direction, type SkillId, type WeaponId } from './moves.ts';
import type { OpponentId } from '../roster.ts';
import { FIRST_LATE_NOTICE_VERSION, FIRST_SCALED_VERSION, LATE_NOTICE, PLAY_SCALE, playScaleFor } from './play-radius.ts';
import { STAB_ON } from './stab-rule.ts';
import { FIRST_STANCE_ROWS_VERSION } from './stance-era.ts';
import { FIRST_POISE_LADDER_VERSION } from './poise-era.ts';
import { FIRST_CONE_VERSION } from './cone-era.ts';
import { FIRST_CAST_PENALTY_VERSION } from './cast-penalty-era.ts';
import { coneAt } from './cone-rules.ts';
import { PICKS, type PickedStance } from './stance.ts';

export const RECORD_VERSION = 64;   // 64: bump 64 (2026-10-15; Combat, positioning bands behind duel.bands (bands.ts, band-defs.json) and the holdBand tactic row; default off, so a record below 64, and every fight without the flag, replays exactly as before: REACH[64] is empty; PROVISIONAL number, renumbers at merge-up)
// 63: bump 63 (2026-10-14; Combat, Gothic tactic table PR 1: the tactic rows loader and the warden's reaction slot reading a profile's `tactic` row; no profile names one, so no fight moves)
// 62: bump 62 (2026-10-14; Combat, sim batch B: FAR_M and MAX_ATTACKERS as world-rules rows, stance HOME read from the catalogue rows' home field; the same numbers, no fight moves)
// 61: bump 61 (2026-10-14; Combat, group B sim batch A: the plain sim numbers and AI/stance tables as rows - roll band, gambit floor, perk max, play radius, late-notice, levels, READ, PROFILES, OWN_KNOBS, ABSENT, POISE_FULL_AT, LEGACY_DEFENSIVE; the same numbers, no fight moves)
// 60: bump 60 (2026-10-13; Combat, group B slice 4, LEVEL_ANCHORS as rows, level-anchor-defs.json) — the profile tiers' anchor levels (novice 1, easy 6, normal 18, hard 46) load through the shared loader and resolve to the SAME numbers (identity hash d4910e6c... over every opponent at every level), so REACH[60] is empty and no older link is refused. 59: bump 59 (2026-10-13; Combat, group B slice 3, SPECIAL_SETS and the rank levels as rows, docs/specs/combat/special-set-notes.md) — the named specials an opponent casts and the ladder levels 36 / 41 / 46 load from special-set-defs.json through the shared loader and resolve to the SAME names (identity hash 89cccac0...), so REACH[59] is empty and no older link is refused. 58: bump 58 (2026-10-13; Combat, the cast penalty, armour-weights.json fromRecordVersion) — a worn set's weight class takes its castPenalty off the sheet's spellPower (gear-rows.ts gearDeltas, outside the duel) from this version: a fight that carries a sheet is stamped no lower than 58 (cast-penalty-era.ts), a sheet record below 58 recomputes its expected sheet WITHOUT the penalty (the verifiers pass record.v), so every older heavy-armour link still verifies and REACH[58] is empty. The duel itself is unchanged: it reads the sheet. 57: bump 57 (2026-10-13; Combat, group B slice 2, MOVES and PATHS as rows, docs/specs/combat/move-notes.md) — the engine's move verbs and baked-blade path specs now load from move-defs.json through the shared loader and resolve to the SAME objects (identity hash of JSON.stringify({MOVES, PATHS}) unchanged, 047083ca...), so REACH[57] is empty and no older link is refused. 56: bump 56 (2026-10-13; Combat, group B slice 1, RULES as rows, docs/specs/combat/rules-notes.md) — RULES (the duel's global numbers) now load from rules-defs.json through the shared loader and resolve to the SAME object (identity hash of JSON.stringify(RULES) unchanged, 746433a8...), so REACH[56] is empty and no older link is refused. 55: bump 55 (2026-10-13; Combat, the breath cone, top-30 item 23, PROVISIONAL on 54) — a special with a row in cone-defs.json (today Surtr's ashfall, the Pitborn) breathes: a cone of pulses over the next ticks instead of one strike on the release tick (cone-rules.ts). Era-keyed (cone-era.ts): a record below 55 keeps the instant strike, so REACH[55] is empty; only a Special Moves fight against a creature whose special at that level has a cone row is stamped 55 (coneStamp), every other fight keeps its version byte for byte.
// (54 follows)   // 54: bump 54 (2026-10-13; Combat, the poise ladder, top-30 item 10, PROVISIONAL on 53, Lead's rulings) — a creature's poise gains a FLINCH tier between the shrug and the full stagger, and a full stagger buys poise-rest (poise-ladder.ts, rows in poise-ladder-defs.json). Era-keyed (poise-era.ts): a record below 54 keeps the single threshold, so REACH[54] is empty; only a fight against a creature that has poise at its level is stamped 54 (ladderStamp), every other fight keeps its version byte for byte.
// (53 follows)   // 53: bump 53 (2026-10-13; Combat, spells in fights v1, PROVISIONAL on 52, Lead's rulings) — a SPELL is cast through the SKILL slot's special (spell-cast.ts): the same windup, interrupt, cooldown and reach, plus a stamina cost at the commit and an outcome by skill at the release (fizzle, partial, success, crit) from rows (brick-defs.json, cast-rules.json). ONLY a spell fight moves: it carries a second flag byte and a spell block (id + the caster's skill) and is stamped 53; every other fight is written and replays byte for byte as before. The cast draws come from the fight's seed.
// 52: bump 52 (2026-10-13; Combat, Wave A1 stance rows, provisional on 51) — TIMING IS SACRED (Strategy, external audit): the Defensive stance's parry window and guard-counter window (a quarter longer) are gone; stance rows (stance-defs.json through the registry) carry numbers only (the loader refuses a window), and Defensive gains damageTaken -100 and poise -100. A record BELOW 52 keeps the old windows through stance-era.ts (an era flag, as the play circle and the stab are), so REACH[52] is empty and every older link replays byte for byte. Before: 51: bump 51 (2026-10-13; Combat, Wave A1 live numbers, provisional on 50) — Lead's accepted CC numbers go live in the cc-defs.json / swarm-defs.json rows (windowFrom end; post-CC immunity stun 120 / knockdown 180; tiers and resists as RANK BANDS: unstoppable + iron rank 10, steadfast + stubborn ranks 8-9; swarm +3 a foe, cap 6 ranks 1-5 / 9 ranks 6-10). Only a fight that carries a ladder (the open world) or a roll moves; a recorded Pit fight carries neither, so no record is reached. Before: 50: bump 50 (2026-10-13; Combat B, Wave A1 steps 6+7, Lead's provisional number) — CC timing + immunity rows and the swarm band (cc-ladder.ts windowFrom / immunity / tiers / resists, catalogue fields immuneTier + resist; roll.ts SWARM_ROWS + Duel.roll.swarm/rank), all opt-in: no shipped fight names one, so every fight is byte for byte as v49.
// 49: bump 49 (2026-10-13; Combat, Wave A1 PR2) — damage kinds as data.
// 21: bump 21 (2026-09-29, Dom's GO via Lead; Combat) — Special Moves on the SKILL slot (duel.ts withSpecials, RULES.special), behind a per-fight flag the header now carries (one byte after the skill). With the flag off a v21 fight steps bit for bit as v20 (every new branch reads a field only withSpecials sets), so v20 stays readable (REACH[21] is empty).
// 20: bump 20 (2026-09-28, Dom via Strategy / Lead) — the Plague Doctor fights with the estoc, not the longsword (roster.ts; his archetype row is the Nightborn's, who fights with it). REACH[20]: the Plague Doctor at every level. Inside the same unreleased bump (2026-09-29): his easy tellReaction 15 (moves.ts), closing the estoc's L6 thrust-from-range hole. And the sim's math (2026-09-29, Strategy ruling (b)): v20 on steps on src/fight/detmath.ts (sin/cos/atan2/hypot on + − * / sqrt, the same bits in every engine; Node's V8 and Chromium's had split a Dwarf link on a 1-ulp atan2); v18/v19 records replay on the engine's own Math, frozen, picked by this version field through detmath.underRecord, so no shared link becomes a fresh fight.
// 19: bump 19 (2026-09-28, RV18 content rebased on RV19; SCOPE shield line, Lead split from RV17) — the Centurion carries gladius + scutum from Legionary (moves.ts LOADOUT_FROM, level 6 on; the Recruit keeps the trident); the scutum is a guard profile only (wide: both flanks, stops heavies, costScale .75, posture drains ×1.5).
// 18: bump 18 (2026-09-28, RV19 in the lane's numbering; Strategy ruling) — the Centurion's own knobs (moves.ts OWN_KNOBS: tellReaction 15 on the thrust and the pommel strike, braceHeavy 1): every level fights another Centurion. The Skeleton, his archetype twin, is unchanged.
// 17: bump 17 (2026-09-27, RV17; Lead ruling) — the Witch's easy SKILL fields retuned (reaction 26 -> 15, parry .05 -> .2, lapse .5 -> .35, read .5 -> .65; identity and normal / hard untouched), so levels 1–17 fight another Witch: thrust from range beat her 46–48 / 48 at L10–16.
// 16: bump 16 (2026-09-28, RV16; Dom via Strategy 2026-09-27) — the 46-level ladder: the header's profile byte carries the opponent's LEVEL (1–46, moves.ts profileAt; easy / normal / hard are levels 6 / 18 / 46), level 1 is a novice below easy, and the Witch's sweep and hop are held at every level (her normal and hard were the plain warden's). One batch with the rank / order change.
// 15: bump 15 (2026-09-26, RV15; Dom via Strategy) — Estoc Lunge and Iron Rush lose their landed-cast follow-up (moves.ts: stagger 0, staminaDamage 0; Lunge damage 11, Iron Rush 10; reach, stepIn and the Rush's poise kept), so Lunge, Iron Rush and Dirty Jab are offered again (loot.ts SKILLS). Judged at 480 seeds: under Pommel + 40 by one sd on every pairing.
//   // 14: bump 14 (2026-09-26, SCOPE 8; Dom via Strategy: all nine in one batch) — the nine opponents' skills (moves.ts `skill_lunge` … `skill_hewer`, loot.ts SKILLS), each a take a kill offers; the equipped-skill byte gains codes 3–11 (append only).
//   // 13: bump 13 (2026-09-25, one bump for two sim changes, Strategy's ruling) — the hero's day-one skill `skill_pommel` (moves.ts; Dom: "Hero starts with Pommel Strike; one skill slot; a take swaps it"), and Combat's #761: the Goblin's kick lunges at pace 1, not his 1.2 (duel.ts). A v12 Goblin fight with a kick replays a different fight, so older links are refused at decode.
// 12: bump 12 (2026-09-25, SKILL 1: docs/briefs/skill-witch-arm.md) — the SKILL action and the `skill_witchfire` move (duel.ts, moves.ts), and the player's equipped skill in the header after the weapon. A v11 record has no skill byte, so older links are refused at decode.
// 11: bump 11 (2026-09-25, the Mon 09-28 window; Dom via Strategy) — every weapon starts the fight SHEATHED (duel.ts initialDuel): since #713 a taken weapon started 'ready', so the opponent (ai.ts) never waited for the draw. A v10 record of a taken-weapon fight replays a fight with no draw beat, so older links are refused at decode.
// 10: bump 10 (2026-09-24, Dom's drive-by) — the Witch's own Easy profile (#691) and the kick-into-guard stagger 36 -> 48 (#692), one bump for both (the straight-back roll, #693, needed no sim change). Older links are refused at decode (Dom accepts). 9: bump 9 (2026-09-23) — the park habit counts the first parked tick only (ai.ts); a one-tick park used to count every later tick of its swing, so a committing parrier (Nightborn, Plague Doctor) read a parker from one sloppy tap. A sim change, so older links are refused at decode.
// 8: bump 8 (2026-09-23) — the Executioner's own normal profile (`anticipate`, #550) and the roster-v0 beta characters (Shieldmaiden, Knight, Plague Doctor, Witch) on their bodies' archetypes. A sim change, so older links are refused at decode.
// 7: Publish B (2026-09-23), one bump for the chain — the estoc's real reach (#532), the Nightborn's profile (#545), the gladius as a player weapon (#543; the Centurion's swap, #547, is held), and the knife and scythe thrust tables rebaked on their 5's timings (the bake was stale since 5; blade-paths.ts is in the digest now). A sim change, so older links are refused at decode.
// 6: the kicker-hover hold fix (2026-09-22) — a warden's hold now derives from the inReach margin of the move he has queued, so he stops parking at a gap his own plan cannot reach. A sim change, so older links are refused at decode rather than replaying a different fight.
// 5: the batched weapon-data flip (2026-09-22) — the knife's thrust recovery 15 -> 20 and the scythe's heel-jab 18 -> 30, one bump for the pair rather than one each (the lead's ruling: kill links are the viral surface, and N bumps means N waves of dead links). 4 was taken by Brief 13's whip tell while this branch was in flight, so this is 5, not the 4 the branch first wrote.
// 4: the lorarii's whip tell (`WhipRaised`, #431) adds events to the duel stream, so a record written on 3 replays a fight whose whip never rose.
// 3: the warden's reach fix (#371) and the ladder retune (#366) changed how fights play out, so a link recorded before them would replay a different fight; this build refuses every earlier version instead. 2: the player's weapon after the opponent id (2026-09-21). 1: every fight was the longsword.
// The decoder's ACCEPT-LIST: the versions this build can read. Deliberately data, and deliberately not `RECORD_VERSION` — reading
// and writing are different questions, and a build that writes one version can still read the ones whose bytes it understands. It is
// pinned as a literal in tests/record-version-guard.test.ts beside SIM_DIGEST, so widening it is a reviewed decision rather than a
// drift. There is exactly one list: scripts/verify-daily.mjs imports `decodeRecord` from this module and deploy.sh rsyncs src/**/*.ts
// to the verifier host, so the server reads this list too — a second copy on the server is the failure this shape exists to prevent.
// [5] -> [6] with the writer bump to 6 (knife hold fix, 2026-09-23). REPLACED, not widened: this build writes 6 and must read 6 back
// (the guard's own `includes(RECORD_VERSION)` assertion), and it must NOT read 5 — a v5 record replays a fight whose Goblin stood
// somewhere else. Accepting 5 again is PR B's decision, together with the v5 decode branch, exactly as before.
// [6] -> [7] with the writer bump to 7 (Publish B, 2026-09-23). REPLACED, not widened, for the same reason: a v6 record replays a fight
// whose Nightborn fought a shorter estoc on another profile.
// [7] -> [8] with the writer bump to 8: replaced, not widened (a v7 record replays an Executioner on the shared profile).
// [8] -> [9] with the writer bump to 9: replaced, not widened (a v8 record with a one-tick park replays a Nightborn who read it as a habit).
// [9] -> [10] with the writer bump to 10: replaced, not widened (a v9 record replays a Witch on the Centurion's Easy).
// [10] -> [11] with the writer bump to 11: replaced, not widened (a v10 taken-weapon record replays a fight with no draw beat).
// [11] -> [12] with the writer bump to 12: replaced, not widened (a v11 record has no skill byte in its header).
// [12] -> [13] with the writer bump to 13: replaced, not widened (a v12 Goblin fight with a kick replays a lunge at his 1.2 pace).
// [13] -> [14] with the writer bump to 14: replaced, not widened (a v13 build cannot name codes 3–11, and its fights ran on the v13 digest).
// [14] -> [15] with the writer bump to 15: replaced, not widened (a v14 Lunge or Iron Rush fight replays a 20-damage, 22-stagger landing).
// [15] -> [16] with the writer bump to 16: replaced, not widened (a v15 header names easy / normal / hard, not a level).
// [16] -> [17] with the writer bump to 17: replaced, not widened (a v16 Witch fight below level 18 replays her old easy blend).
// [18] -> [19] with the writer bump to 19: replaced, not widened (a v18 Centurion fight at L6+ replays his old trident, no scutum).
// [17] -> [18] with the writer bump to 18: replaced, not widened (a v17 Centurion fight replays his old answers to the thrust and the pommel).
// [19] -> [18, 19] (2026-09-28, Lead: kill links should not die at every bump): WIDENED, the first time. Bump 19 changed one fight, the
// Centurion from level 6 on (moves.ts LOADOUT_FROM: gladius + scutum; the rest of its diff, the scutum's wide / postureDecay fields and
// the two braceHeavy lines in ai.ts, is inert without the scutum). Every other v18 fight steps bit for bit on v19 (the PR's probe: the
// event stream, outcome, final tick and final state match, every opponent × level × weapon × strategy). A v18 record inside V18_REACH
// is still refused at decode, with the same "version" message, so the page converts it into a fight exactly as before.
// [18, 19] -> [18, 19, 20] with the writer bump to 20: widened under the standing rule (Strategy, 2026-09-28): bump 20 declares its reach
// in REACH below, and an older record is read wherever no later bump reached its fight.
// [18, 19, 20] -> [18, 19, 20, 21] with the writer bump to 21: widened, and REACH[21] is empty. Bump 21 adds Special Moves behind a flag the
// record carries; a record without the flag (every v18–v20 record) steps exactly as before, so no older fight is reached.
// [18, 19, 20, 21] -> [18, 19, 20, 21, 22] with the writer bump to 22: widened, REACH[22] is empty (Lead's ruling after the Auditer, 2026-10-02: v21 is the writer on the specials base, which may reach trunk before #1280, so it stays readable).
// [.., 22] -> [.., 22, 23] with the writer bump to 23: widened, REACH[23] is empty (the play circle is keyed on the record's version, so an older record steps in the circle it was fought in).
// [.., 23] -> [.., 23, 24] with the writer bump to 24: widened, REACH[24] is empty (late notice is keyed on the record's version, so an older record steps without the ramp).
// [.., 24] -> [.., 24, 25] with the writer bump to 25: widened, REACH[25] is empty (the stab is keyed on the record's version, so an older Goblin record steps without it).
// [.., 28] -> [.., 28, 29] with the writer bump to 29: widened, REACH[29] lists every opponent from level 1 (the posture, stun and rear rules change every fight), so only a v29 record replays.
// [.., 30] -> [.., 30, 31] with the writer bump to 31: widened, REACH[31] lists the Veteran, Pitborn, Dwarf, Knight and Shieldmaiden from level 1 (the early spammer read), so a v30 record of any other opponent still replays.
// [.., 29] -> [.., 29, 30] with the writer bump to 30: widened, REACH[30] lists the Shieldmaiden, the Knight and the Plague Doctor from level 1 (their own profile rows), so a v29 record of any other opponent still replays.
// [.., 27] -> [.., 27, 28] with the writer bump to 28: widened, REACH[28] is empty (only a specials-flag fight steps differently; flag-off records of any readable version replay exactly as before).
// [.., 31] -> [.., 31, 32] with the writer bump to 32: widened, REACH[32] is empty (a patron-less fight writes 31 and steps as before; only a patron record is v32).
export const READABLE_VERSIONS = [18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64] as const;
// What a fight with no patron writes: the writer ceiling is RECORD_VERSION (32), but a record names the LOWEST version that can express its fight.
// A literal 31 only while the ceiling is 32 (the v31 bytes a patron-less fight has always written); from the next bump on a no-patron fight is simply the current version, whose
// header carries a patron byte of 0 (only v32 refuses a zero patron, because a v32 patron-less fight was always written as 31). Pinned by tests/record-version-guard.test.ts, which simulates RV33.
export const NO_PATRON_VERSION = (RECORD_VERSION as number) <= 64 ? 31 : RECORD_VERSION;   // RV33/RV34/RV35/RV36/RV37/RV38/RV39/RV40/RV41/RV42/RV43 only write a gambit fight as v33 (below), so through 33 a patron-less, gambit-less fight is still the v31 it always was
export const FIRST_PATRON_VERSION = 32;
export const FIRST_SPELL_VERSION = 53;   // RV53 (spells in fights): the fight carries a spell (second flag byte, bit 0, then the spell block: id len u8 + ascii, skill u8); ONLY a spell fight is written as v53
export const FIRST_GAMBIT_VERSION = 33;
export const FIRST_STANCE_VERSION = 34;
export const FIRST_POSE_VERSION = 38;
export const FIRST_GROUP_VERSION = 39;
export const FIRST_SHEET_VERSION = 48;   // RV48 (Wave A1 PR1): the fight carries the player's sheet (flag bit 7): a count byte, then (dial code u8, the dial's effective value u8) pairs, in code order, dials off base only; ONLY a sheet fight is written as v48
export const PATRON_VERSION = (RECORD_VERSION as number) <= 64 ? FIRST_PATRON_VERSION : RECORD_VERSION;   // what a patron fight writes: v32 until a bump after 33 stamps every live fight again
// Each bump's REACH (the standing rule, Strategy 2026-09-28): the fights bump N can change, as (opponent, from level). A record of version
// k is refused when any bump after k reaches its opponent at its level; everything else is read. Literals on purpose, not the data they
// describe (LOADOUT_FROM, ROSTER): a reach records what that bump changed and must not move when the data moves later (that change bumps
// and declares its own). A bump that changes rules, AI or the codec for everyone cannot be declared here; it replaces the list instead.
export const REACH: Readonly<Record<number, readonly { opponent: OpponentId; from: number }[]>> = {
  19: [{ opponent: 'veteran', from: 6 }],   // the Centurion's gladius + scutum from Legionary (moves.ts LOADOUT_FROM)
  20: [{ opponent: 'plaguedoctor', from: 1 }],   // the Plague Doctor's estoc (roster.ts), every level
  21: [],   // Special Moves, behind the record's own flag: a fight without it is unchanged
  22: [],   // the final special rule (#1280): only a fight with the flag moves, and v21 is not readable
  23: [],   // Arena 1's smaller play circle: a record below 23 replays in the old circle (underRecord), so no older fight is reached
  24: [],   // late notice: a record below 24 replays without the ramp (underRecord), so no older fight is reached
  25: [],   // the Goblin's stab: a record below 25 replays without it (underRecord, stab-rule.ts), so no older fight is reached
  26: [],   // the arena byte: presentation only, a record below 26 names no arena and replays in its ladder band, so no older fight is reached
  27: [],   // the 50-level ladder: levels 47–50 are new fights (the tail past hard); levels 1–46 profile and body are byte-identical (tests/ladder-tail.test.ts digest), so no older fight is reached
  28: [],   // interruptible casts: only a fight with the specials flag moves (not live), no flag-off fight is reached
  29: [{ opponent: 'veteran', from: 1 }, { opponent: 'pitborn', from: 1 }, { opponent: 'goblin', from: 1 }, { opponent: 'nightborn', from: 1 }, { opponent: 'executioner', from: 1 }, { opponent: 'minotaur', from: 1 }, { opponent: 'wraith', from: 1 }, { opponent: 'werewolf', from: 1 }, { opponent: 'skeleton', from: 1 }, { opponent: 'dwarf', from: 1 }, { opponent: 'plaguedoctor', from: 1 }, { opponent: 'knight', from: 1 }, { opponent: 'witch', from: 1 }, { opponent: 'shieldmaiden', from: 1 }],   // the RV29 rule batch (posture hold/bloodied drain, exhausted stun, rear): every fight at every level, so a record below 29 is refused
  30: [{ opponent: 'shieldmaiden', from: 1 }, { opponent: 'knight', from: 1 }, { opponent: 'plaguedoctor', from: 1 }],   // the three own rows (RV30): profile numbers only; every other opponent's fight is unchanged
  31: [{ opponent: 'veteran', from: 1 }, { opponent: 'pitborn', from: 1 }, { opponent: 'dwarf', from: 1 }, { opponent: 'knight', from: 1 }, { opponent: 'shieldmaiden', from: 1 }],   // the early spammer read (RV31): spamRun on those five at every level; every other opponent's fight is unchanged
  35: [],   // the Ash Wolf: a new held opponent; no existing fight is reached
  36: [],   // the Tusked Boar: a new held opponent; no existing fight is reached
  37: [],   // the Cinder Bear: a new held opponent; no existing fight is reached
  44: [],   // weapons as data (weapon-defs.json): the resolved table is byte-identical, no fight is reached
  46: [],   // finishers as data (finisher-defs.json): the resolved table and every pick are byte-identical, no fight is reached
  45: [],   // skills as data (skill-defs.json): the byte order and every move are unchanged, no fight is reached
  47: [],   // weapon name switches as row fields: the resolved weapon table is unchanged, no fight is reached
  43: [],   // resource pools as data (pools.ts): every default equals what createFighter always used, so a row without pools fights byte for byte as v42; no fight is reached
  42: [],   // the roster is built from catalogue rows (20a): same opponents, same numbers; no fight is reached
  41: [],   // the shared crowd-control ladder is opt-in per fighter (Fighter.cc): a fight without one is byte for byte as v40; no fight is reached
  40: [],   // the wall as a parameter (Duel.radius): a duel without one is the Pit's circle, byte for byte; no fight is reached
  39: [],   // shared-health group: only a fight with the group flag (bit 6, v39) moves, no ungrouped fight is reached
  38: [],   // the start pose: only a fight with the pose flag (bit 5, v38) moves, no pose-less fight is reached
  34: [],   // stances: only a fight with the stances flag (bit 2, v34) moves, no flag-off fight is reached
  33: [],   // the Gambit: only a fight with the gambit flag moves (flag bit 1, v33), no flag-off fight is reached
  49: [],   // damage kinds as data (damage-kind-defs.json): no shipped move names a kind, so every fight is byte for byte as v48; no fight is reached
  60: [],   // LEVEL_ANCHORS as rows: the same numbers, no fight moves
  61: [],   // sim batch A as rows: the same numbers, no fight moves
  62: [],
  63: [],   // Gothic tactic table PR 1: the rows loader and the reaction slot's branch, no profile uses a row, no fight moves   // sim batch B: world-rules rows and the stance home from the catalogue, the same numbers, no fight moves
  64: [],   // positioning bands: default off, the flag is not on the record; a fight without bands is the fight it always was
  59: [],   // SPECIAL_SETS and the rank levels as rows: the same names, no fight moves
  58: [],   // the cast penalty: a sheet record below 58 recomputes without it, the duel is unchanged
  57: [],   // MOVES and PATHS as rows: the same resolved objects, no fight moves
  56: [],   // RULES as rows: the same resolved object, no fight moves
  55: [],   // the breath cone: era-keyed (cone-era.ts), so a record below 55 replays the instant strike byte for byte and no record is reached
  54: [],   // the poise ladder: era-keyed (poise-era.ts), so a record below 54 replays the single poise threshold byte for byte and no record is reached
  53: [],   // spells in fights: only a fight with the spell flag (second flag byte, v53) moves, no spell-less fight is reached
  52: [],   // stance rows: the Defensive window / counter window are era-keyed (stance-era.ts), so a record below 52 replays the old stance byte for byte; no record is reached
  51: [],   // the live CC / tier / resist / swarm numbers: only fights that carry a ladder (the open world) or a roll move, and no recorded Pit fight does; no record is reached
  50: [],   // CC timing / immunity tier / partial resist rows and the swarm band (Combat B): opt-in, no shipped creature or fight names one, so no fight is reached
  48: [],   // the sheet (Wave A1 PR1): only a fight with the sheet flag (bit 7, v48) moves, no sheet-less fight is reached
  32: [],   // patron perks: a no-patron fight writes 31 and steps as before; a patron record is v32 and no older fight is reached
};
// A sheet fight names WHICH stored build it claims (Backend keeps append-only build versions; the sweep loads that exact one): the character's id and the build's version. Both or neither: neither means
// the default build (level 0, every dial at base) with whatever gear was worn. A build reference without a sheet is nothing to check, so it is refused.
const CHARACTER_ID = /^[A-Za-z0-9_-]{1,64}$/;
const buildRefBad = (r: { sheet?: Sheet; characterId?: string; buildVersion?: number }): boolean =>
  (r.characterId === undefined) !== (r.buildVersion === undefined) || (r.characterId !== undefined && (!r.sheet || !CHARACTER_ID.test(r.characterId) || !Number.isInteger(r.buildVersion) || r.buildVersion! < 1 || r.buildVersion! > 0xffffffff));
// A record states the era its fight was fought in (play-radius.ts): this build's version when the circle in force is the one this build fights `opponent` in AND late
// notice is on (a live fight); the version before the ramp when the circle is right but the ramp was never turned on; the version before the circle when neither is
// (a headless run that never set them, a script). Each replays to the fight it recorded, because the version picks both (detmath.ts underRecord). (N4: the pre-circle
// version is a constant; the old circle WITH the ramp has no version, and no live fight or shared link is that: only a script that turns the ramp on without the circle.)
const OLD_CIRCLE_VERSION = FIRST_SCALED_VERSION - 1;
const STAB_VERSION = 25;   // the last version without the arena byte; still written by nothing, still packable so a fixture can pin the old layout
// The poise ladder (poise-ladder.ts) moves only a fight against a creature that has poise at the level it is fought at (nine creatures, every level but the first), so only those fights are stamped 54; every other
// fight keeps the version it had, byte for byte, and a record below 54 replays the single threshold (poise-era.ts). Level/opponent come from the record itself, so a replay re-derives the same stamp.
const ladderStamp = (opponent: string, level: number): number => { const o = Object.hasOwn(OPPONENTS, opponent) ? OPPONENTS[opponent as OpponentId] : undefined; return o && Number.isInteger(level) && level >= 1 && level <= LEVELS && opponentAt(o, level).poise > 0 ? FIRST_POISE_LADDER_VERSION : 0; };
// The breath cone (cone-rules.ts) moves only a Special Moves fight against a creature whose special at that level has a cone row, so only those fights are stamped 55; a record re-derives the stamp from itself.
const coneStamp = (specials: boolean | undefined, opponent: string, level: number): number => specials && Object.hasOwn(OPPONENTS, opponent) && Number.isInteger(level) && level >= 1 && level <= LEVELS && coneAt(opponent as OpponentId, level) ? FIRST_CONE_VERSION : 0;
const stampedVersion = (opponent: string): number => PLAY_SCALE !== playScaleFor(opponent, RECORD_VERSION) ? OLD_CIRCLE_VERSION : !LATE_NOTICE ? FIRST_SCALED_VERSION : STAB_ON ? NO_PATRON_VERSION : FIRST_LATE_NOTICE_VERSION;   // the Goblin's stab is the newest era flag: late notice without it is the version before
export type RecordVersion = (typeof READABLE_VERSIONS)[number];

export type Outcome = 'killed' | 'died' | 'draw' | 'abandoned';
// The arena a fight was fought in (version 26; append only, a code never changes meaning; 0 = none named, the ladder band decides, as every v<=25 record). Literals on purpose: a record's table must not move when the themes do.
export const ARENAS = [undefined, '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', 'a', 'b', 'c', 'd'] as const;
export type RecordArena = Exclude<(typeof ARENAS)[number], undefined>;
export const FIRST_ARENA_VERSION = 26;
// One stream of a shared-health group (RV39): `n` streams in the group (2..7) and this one's `index`. Its record cannot be judged without the other n-1 records.
// Each record is SELF-VERIFYING (Auditor, hole 1): `incoming` is the damage the other streams put on THIS creature copy, as (tick it landed, amount), and `held` the ticks the layer held this copy idle because the token cap
// (src/fight/pack.ts TOKENS) gave its turn to others, as [from, to) spans; replay applies both from the record, so one record verifies alone and a withheld sibling costs only its owner. crossCheck (src/fight/pack.ts) compares the
// recorded incoming with the siblings' verified damage when they are present.
export type RecordGroup = { n: number; index: number; incoming: readonly (readonly [number, number])[]; held: readonly (readonly [number, number])[] };
export const GROUP_LIST_MAX = 4096;
const groupBad = (g: RecordGroup, ticks: number): boolean => {
  if (!(Number.isInteger(g.n) && Number.isInteger(g.index) && g.n >= 2 && g.n <= 7 && g.index >= 0 && g.index < g.n)) return true;
  if (g.incoming.length > GROUP_LIST_MAX || g.held.length > GROUP_LIST_MAX) return true;
  let last = 0;
  for (const [t, a] of g.incoming) { if (!Number.isInteger(t) || !Number.isInteger(a) || t <= last || t > ticks || a < 1 || a > 65535) return true; last = t; }
  last = 0;
  for (const [from, to] of g.held) { if (!Number.isInteger(from) || !Number.isInteger(to) || from <= last || to <= from || to > ticks + 1) return true; last = to - 1; }
  return false;
};
const groupLen = (g: RecordGroup | undefined): number => (g ? 1 + 2 + 6 * g.incoming.length + 2 + 8 * g.held.length : 0);
export type RecordMeta = { sheet?: Sheet; characterId?: string; buildVersion?: number; arena?: RecordArena; build: string; opponent: OpponentId; weapon: WeaponId; skill?: SkillId; level: number; seed: number; specials?: boolean; patron?: number; gambit?: boolean; stances?: PickedStance; pose?: DuelPose; group?: RecordGroup; spell?: { id: string; skill: number } };   // stances: the fight had stances (version 34), the player's pick; absent = none   // gambit: the fight had the Gambit (version 33; absent = off)   // patron: the player's patron id 1..255 (version 32; absent = none)   // specials: the fight had Special Moves (version 21; absent = off)   // skill: the player's equipped skill; absent = none. level: the opponent's ladder level, 1–46 (moves.ts profileAt; version 16)
export type FightRecord = RecordMeta & { v: RecordVersion; ticks: number; outcome: Outcome; intents: Intent[] };

// Quantization: the stick to 1/127 per axis, the camera yaw to 1/128 of a half-turn (about 1.4°). The live game steps the
// quantized intent (main.ts), so a replay reproduces the fight bit for bit.
const YAW_STEPS = 256, YAW_UNIT = (2 * Math.PI) / YAW_STEPS;
const q8 = (v: number) => Math.max(-127, Math.min(127, Math.round(v * 127)));
const yawToByte = (yaw: number) => (((Math.round(yaw / YAW_UNIT) % YAW_STEPS) + YAW_STEPS) % YAW_STEPS);
const byteToYaw = (b: number) => { const s = b >= 128 ? b - 256 : b; return s * YAW_UNIT; };   // centred on 0: −π..π

const ACTIONS: (Action | null)[] = [null, 'light', 'light_left', 'light_right', 'heavy', 'thrust', 'kick', 'dodge', 'backstep', 'parry', 'skill'];   // append only: a code never changes meaning
const SKILLS: readonly (SkillId | null)[] = SKILL_BY_CODE;   // the skill rows' `code`, append only, as ACTIONS (skill-defs.json)
const DIRECTIONS: (Direction | undefined)[] = [undefined, 'right', 'left', 'overhead', 'thrust', 'low'];
const OUTCOMES: Outcome[] = ['killed', 'died', 'draw', 'abandoned'];
const SPELL_ID = /^[a-z][a-z0-9_.:-]{0,63}$/;   // the legend id (a spell row id without `spell:`), Backend's grimoire key
const spellBad = (r: { spell?: { id: string; skill: number }; specials?: boolean }): boolean => !!r.spell && (!SPELL_ID.test(r.spell.id) || !Number.isInteger(r.spell.skill) || r.spell.skill < 0 || r.spell.skill > 100 || !r.specials);   // a spell is cast through the special: the specials flag comes with it
const F_RUN = 1, F_GUARD = 2, F_HELD = 4, F_LOCK = 8, F_CANCEL = 16;

export function quantizeIntent(intent: Intent): Intent {
  const out: Intent = {
    move: { x: q8(intent.move.x) / 127, z: q8(intent.move.z) / 127, yaw: byteToYaw(yawToByte(intent.move.yaw)), run: !!intent.move.run },
    action: intent.action, guard: !!intent.guard, lock: !!intent.lock,
  };
  if (intent.held) out.held = true;
  if (intent.cancel) out.cancel = true;
  if (intent.guardDirection) out.guardDirection = intent.guardDirection;
  return out;
}

// Records one fight from its first tick. push() returns the quantized intent the caller must step with.
export function createRecorder(meta: RecordMeta) {
  const era = stampedVersion(meta.opponent);
  if ((meta.patron || meta.gambit || meta.stances || meta.pose || meta.group || meta.sheet || meta.spell) && era !== NO_PATRON_VERSION) throw Error('Fight record: a patron or gambit fight must be fought in the live era');
  const flagged = meta.sheet ? FIRST_SHEET_VERSION : meta.group ? FIRST_GROUP_VERSION : meta.pose ? FIRST_POSE_VERSION : meta.stances ? FIRST_STANCE_VERSION : meta.gambit ? FIRST_GAMBIT_VERSION : meta.patron ? PATRON_VERSION : era;
  const stancedV = meta.stances ? Math.max(flagged, FIRST_STANCE_ROWS_VERSION) : flagged, spelledV = meta.spell ? Math.max(stancedV, FIRST_SPELL_VERSION) : stancedV, castedV = meta.sheet ? Math.max(spelledV, FIRST_CAST_PENALTY_VERSION) : spelledV, version = Math.max(castedV, ladderStamp(meta.opponent, meta.level), coneStamp(meta.specials, meta.opponent, meta.level));   // a sheet fight carries the worn set's cast penalty from v58, so it is stamped no lower;   // a spell fight is fought on the v53 cast rules, so it is stamped no lower than v53
  if (spellBad(meta)) throw Error('Fight record: a spell is an id and a skill 0-100, on a fight with Special Moves');   // a stances fight is fought on the v52 stance rows (stance-era.ts: a Defensive stance has no longer window), so it is stamped no lower than v52   // the circle in force when the fight BEGINS names the record, not whatever is set when it ends
  if (meta.sheet) meta = { ...meta, sheet: checkSheet(meta.sheet) };
  if (buildRefBad(meta)) throw Error('Fight record: a build reference is a character id and a build version together, on a sheet fight');   // the fight started from the validated, code-ordered sheet (duel.ts withSheet), so the record names those
  if (meta.pose) meta = { ...meta, pose: roundPose(meta.pose) };   // the fight started from the rounded pose (duel.ts poseBodies), so the record names those same bits
  if (version < FIRST_ARENA_VERSION && meta.arena) { meta = { ...meta }; delete meta.arena; }   // an older era has no arena byte: a script run in the old circle names none
  const intents: Intent[] = [];
  let done: FightRecord | null = null;
  return {
    meta,
    get ticks() { return intents.length; },
    get finished() { return done; },
    push(intent: Intent): Intent {
      if (done) return quantizeIntent(intent);
      const q = quantizeIntent(intent);
      intents.push(q);
      return q;
    },
    finish(outcome: Outcome): FightRecord {
      done ??= { v: version as RecordVersion, ...meta, ticks: intents.length, outcome, intents: intents.slice() };
      return done;
    },
  };
}

// ---- binary layout ---------------------------------------------------------------------------------------------------------
// magic 'F' 'K' | version u8 | build: len u8 + ascii | opponent: len u8 + ascii | weapon: len u8 + ascii (version 2) | skill u8 (version 12; 0 = none) | specials u8 (version 21; 0 = off, 1 = on) | arena u8 (version 26; 0 = none, else an index into ARENAS) | patron u8 (version 32; 1..255, present only on a patron fight) | profile u8 (version 16: the level, 1–46) | seed u32 LE | ticks u32 LE | outcome u8
// then six columns of `ticks` bytes each: x i8, z i8, yaw-delta u8 (byte yaw minus previous byte yaw, mod 256), action u8, dir u8, flags u8.
const ascii = (s: string) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c > 127) throw Error(`Fight record: non-ASCII in "${s}"`); b[i] = c; } return b; };

export function packRecord(rec: FightRecord): Uint8Array {
  // The lowest version that can express the fight: a record with no patron is written as v31 (today's links stay byte-identical), a patron needs 32.
  // A gambit fight is v33; otherwise a patron fight is v32 and a patron-less one v31.
  const flaggedV = rec.sheet ? FIRST_SHEET_VERSION : rec.group ? FIRST_GROUP_VERSION : rec.pose ? FIRST_POSE_VERSION : rec.stances ? FIRST_STANCE_VERSION : rec.gambit ? FIRST_GAMBIT_VERSION : rec.patron ? PATRON_VERSION : NO_PATRON_VERSION;
  const stancedV = rec.stances ? Math.max(flaggedV, FIRST_STANCE_ROWS_VERSION) : flaggedV;
  const spelledV = rec.spell ? Math.max(stancedV, FIRST_SPELL_VERSION) : stancedV, castedV = rec.sheet ? Math.max(spelledV, FIRST_CAST_PENALTY_VERSION) : spelledV;   // as createRecorder: a sheet fight carries the cast penalty from v58
  const r: FightRecord = rec.v === RECORD_VERSION ? { ...rec, v: Math.max(castedV, ladderStamp(rec.opponent, rec.level), coneStamp(rec.specials, rec.opponent, rec.level)) as RecordVersion } : rec;
  if (r.spell && r.v < FIRST_SPELL_VERSION) throw Error('Fight record: a spell on a version that has no flag for it');
  if ((r.v as number) === FIRST_SPELL_VERSION && !r.spell) throw Error('Fight record: a version 53 record names its spell');
  if (spellBad(r)) throw Error('Fight record: a spell is an id and a skill 0-100, on a fight with Special Moves');
  if (r.sheet && r.v < FIRST_SHEET_VERSION) throw Error('Fight record: a sheet on a version that has no flag for it');
  if ((r.v as number) === FIRST_SHEET_VERSION && !r.sheet) throw Error('Fight record: a version 48 record names its sheet');
  const sheetMods = r.sheet ? checkSheet(r.sheet) : undefined;
  if (buildRefBad(r)) throw Error('Fight record: a build reference is a character id and a build version together, on a sheet fight');
  if (r.sheet && !sheetMods) throw Error('Fight record: a sheet flag with no dial off base');
  if (r.group && r.v < FIRST_GROUP_VERSION) throw Error('Fight record: a group on a version that has no flag for it');
  if (r.v === FIRST_GROUP_VERSION && !r.group) throw Error('Fight record: a version 39 record names its group');
  if (r.group && groupBad(r.group, r.ticks)) throw Error('Fight record: unknown group');
  if (r.pose && r.v < FIRST_POSE_VERSION) throw Error('Fight record: a pose on a version that has no flag for it');
  if ((r.v as number) === FIRST_POSE_VERSION && !r.pose) throw Error('Fight record: a version 38 record names its pose');
  if (r.pose) { validatePose(r.pose, false); const rp = roundPose(r.pose); if (JSON.stringify(rp) !== JSON.stringify(r.pose)) throw Error('Fight record: a pose is float32 (roundPose it before the fight begins)'); }
  if (r.stances && r.v < FIRST_STANCE_VERSION) throw Error('Fight record: stances on a version that has no flag for them');
  if (r.v === FIRST_STANCE_VERSION && !r.stances) throw Error('Fight record: a version 34 record names its stances');
  if (r.stances && !PICKS.includes(r.stances)) throw Error('Fight record: unknown stance');
  if (r.gambit && r.v < FIRST_GAMBIT_VERSION) throw Error('Fight record: a gambit on a version that has no flag for it');
  if (r.v === FIRST_GAMBIT_VERSION && !r.gambit) throw Error('Fight record: a version 33 record names the gambit');
  if (r.v !== RECORD_VERSION && (r.v as number) !== FIRST_SHEET_VERSION && r.v !== FIRST_GROUP_VERSION && r.v !== FIRST_POSE_VERSION && r.v !== FIRST_STANCE_VERSION && (r.v as number) !== FIRST_SPELL_VERSION && (r.v as number) !== FIRST_STANCE_ROWS_VERSION && (r.v as number) !== FIRST_POISE_LADDER_VERSION && (r.v as number) !== FIRST_CONE_VERSION && (r.v as number) !== FIRST_CAST_PENALTY_VERSION && r.v !== FIRST_GAMBIT_VERSION && r.v !== FIRST_PATRON_VERSION && r.v !== NO_PATRON_VERSION && r.v !== STAB_VERSION && r.v !== FIRST_LATE_NOTICE_VERSION && r.v !== FIRST_SCALED_VERSION && r.v !== OLD_CIRCLE_VERSION) throw Error(`Fight record: cannot pack version ${String(r.v)}`);
  if (r.intents.length !== r.ticks) throw Error('Fight record: ticks does not match the intent count');
  const build = ascii(r.build), opp = ascii(r.opponent), wpn = ascii(r.weapon), spellId = r.spell ? ascii(r.spell.id) : new Uint8Array(0);
  if (build.length > 255 || opp.length > 255 || wpn.length > 255) throw Error('Fight record: build, opponent or weapon id too long');
  const level = r.level, outcome = OUTCOMES.indexOf(r.outcome), skill = SKILLS.indexOf(r.skill ?? null);
  if (!Number.isInteger(level) || level < 1 || level > LEVELS || outcome < 0) throw Error('Fight record: unknown level or outcome');
  if (skill < 0) throw Error('Fight record: unknown skill');
  const arenaCode = ARENAS.indexOf(r.arena);
  if (arenaCode < 0 || (arenaCode > 0 && r.v < FIRST_ARENA_VERSION)) throw Error('Fight record: unknown arena, or an arena on a version that has no byte for it');
  const withArena = r.v >= FIRST_ARENA_VERSION ? 1 : 0, withPatron = r.v >= FIRST_PATRON_VERSION ? 1 : 0;
  if (r.patron !== undefined && (!Number.isInteger(r.patron) || r.patron < 1 || r.patron > 255 || !withPatron)) throw Error('Fight record: unknown patron, or a patron on a version that has no byte for it');
  const n = r.ticks, head = 3 + 1 + build.length + 1 + opp.length + 1 + wpn.length + 1 + 1 + withArena + withPatron + (r.pose ? 20 : 0) + groupLen(r.group) + (sheetMods ? 1 + 2 * Object.keys(sheetMods).length + 1 + (r.characterId?.length ?? 0) + 4 : 0) + (r.v >= FIRST_SPELL_VERSION ? 1 : 0) + (r.spell ? 1 + spellId.length + 1 : 0) + 1 + 4 + 4 + 1, out = new Uint8Array(head + 6 * n), dv = new DataView(out.buffer);
  let o = 0;
  out[o++] = 0x46; out[o++] = 0x4b; out[o++] = r.v;
  out[o++] = build.length; out.set(build, o); o += build.length;
  out[o++] = opp.length; out.set(opp, o); o += opp.length; out[o++] = wpn.length; out.set(wpn, o); o += wpn.length;
  out[o++] = skill; out[o++] = (r.specials ? 1 : 0) | (r.gambit ? 2 : 0) | (r.stances ? 4 | (PICKS.indexOf(r.stances) << 3) : 0) | (r.pose ? 32 : 0) | (r.group ? 64 : 0) | (sheetMods ? 128 : 0); if (withArena) out[o++] = arenaCode; if (withPatron) out[o++] = r.patron ?? 0;
  if (r.v >= FIRST_SPELL_VERSION) out[o++] = r.spell ? 1 : 0;   // the second flag byte (v53): bit 0 = a spell block follows the sheet block
  if (r.pose) for (const n of [r.pose.hero.x, r.pose.hero.z, r.pose.foe.x, r.pose.foe.z, r.pose.heroFacing]) { dv.setFloat32(o, n, true); o += 4; }
  if (r.group) {
    out[o++] = (r.group.index << 4) | r.group.n;
    dv.setUint16(o, r.group.incoming.length, true); o += 2;
    for (const [t, a] of r.group.incoming) { dv.setUint32(o, t, true); o += 4; dv.setUint16(o, a, true); o += 2; }
    dv.setUint16(o, r.group.held.length, true); o += 2;
    for (const [from, to] of r.group.held) { dv.setUint32(o, from, true); o += 4; dv.setUint32(o, to, true); o += 4; }
  }
  if (sheetMods) { const stats = DIALS.filter((st) => sheetMods[st.id]); out[o++] = stats.length; for (const st of stats) { out[o++] = st.code; out[o++] = sheetMods[st.id]!; } const cid = ascii(r.characterId ?? ''); out[o++] = cid.length; out.set(cid, o); o += cid.length; dv.setUint32(o, r.buildVersion ?? 0, true); o += 4; }
  if (r.spell) { out[o++] = spellId.length; out.set(spellId, o); o += spellId.length; out[o++] = r.spell.skill; }
  out[o++] = level; dv.setUint32(o, r.seed >>> 0, true); o += 4; dv.setUint32(o, n, true); o += 4; out[o] = outcome;
  const col = (k: number) => head + k * n;
  let prevYaw = 0;
  for (let i = 0; i < n; i++) {
    const it = r.intents[i], yaw = yawToByte(it.move.yaw);
    out[col(0) + i] = q8(it.move.x) & 0xff; out[col(1) + i] = q8(it.move.z) & 0xff;
    out[col(2) + i] = (yaw - prevYaw + YAW_STEPS) % YAW_STEPS; prevYaw = yaw;
    const a = ACTIONS.indexOf(it.action ?? null), d = DIRECTIONS.indexOf(it.guardDirection);
    if (a < 0 || d < 0) throw Error(`Fight record: unknown action or guard side at tick ${i}`);
    out[col(3) + i] = a; out[col(4) + i] = d;
    out[col(5) + i] = (it.move.run ? F_RUN : 0) | (it.guard ? F_GUARD : 0) | (it.held ? F_HELD : 0) | (it.lock ? F_LOCK : 0) | (it.cancel ? F_CANCEL : 0);
  }
  return out;
}

export function unpackRecord(bytes: Uint8Array): FightRecord {
  if (bytes.length < 3 || bytes[0] !== 0x46 || bytes[1] !== 0x4b) throw Error('Fight record: not a fight record');
  const v = bytes[2];
  if (!(READABLE_VERSIONS as readonly number[]).includes(v)) throw Error(`Fight record: version ${v} is not supported (this build reads ${READABLE_VERSIONS.join(', ')}: the fight rules changed, so an older link would replay a different fight)`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 3;
  const str = () => { const len = bytes[o++]; if (o + len > bytes.length) throw Error('Fight record: truncated'); let s = ''; for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[o + i]); o += len; return s; };
  const build = str(), opponent = str() as OpponentId, weapon = str() as WeaponId;
  if (!PLAYER_WEAPONS.includes(weapon)) throw Error('Fight record: unknown weapon');   // the hero rig bakes blade tables for these only; an opponent-only weapon (maul, reaper) would throw inside the frame loop
  if (o + 1 + (v >= FIRST_POSE_VERSION ? 20 : 0) + (v >= FIRST_GROUP_VERSION ? 1 : 0) + (v >= 21 ? 1 : 0) + (v >= FIRST_ARENA_VERSION ? 1 : 0) + (v >= FIRST_PATRON_VERSION ? 1 : 0) + (v >= FIRST_SPELL_VERSION ? 1 : 0) + 1 + 4 + 4 + 1 > bytes.length) throw Error('Fight record: truncated');
  const skill = SKILLS[bytes[o++]];   // undefined past the table: an unknown skill is refused, never read as none
  if (skill === undefined) throw Error('Fight record: unknown skill');
  const flag = v >= 21 ? bytes[o++] : 0;   // before version 21 there is no byte: no specials
  if (flag > (v >= FIRST_SHEET_VERSION ? 255 : v >= FIRST_GROUP_VERSION ? 127 : v >= FIRST_POSE_VERSION ? 63 : v >= FIRST_STANCE_VERSION ? 31 : v >= FIRST_GAMBIT_VERSION ? 3 : 1)) throw Error('Fight record: unknown specials flag');
  if (v === FIRST_SHEET_VERSION && !(flag & 128)) throw Error('Fight record: a version 48 record names its sheet');
  if (flag & 128 && v < FIRST_SHEET_VERSION) throw Error('Fight record: a sheet on a version that has no flag for it');
  if (v === FIRST_GROUP_VERSION && !(flag & 64)) throw Error('Fight record: a version 39 record names its group');
  if (v === FIRST_POSE_VERSION && !(flag & 32)) throw Error('Fight record: a version 38 record names its pose');
  if (flag & 24 && !(flag & 4)) throw Error('Fight record: a stance pick without the stances flag');
  if (v === FIRST_STANCE_VERSION && !(flag & 4)) throw Error('Fight record: a version 34 record names its stances');
  if (v === FIRST_GAMBIT_VERSION && !(flag & 2)) throw Error('Fight record: a version 33 record names the gambit');
  const arena = v >= FIRST_ARENA_VERSION ? ARENAS[bytes[o++]] : undefined;   // before version 26 there is no byte: the ladder band decides
  if (v >= FIRST_ARENA_VERSION && bytes[o - 1] >= ARENAS.length) throw Error('Fight record: unknown arena');
  const patron = v >= FIRST_PATRON_VERSION ? bytes[o++] : 0;   // before version 32 there is no byte: no patron; a v32 record always names one (the writer never emits 32 without)
  if (v === FIRST_PATRON_VERSION && !patron) throw Error('Fight record: a version 32 record names a patron');
  const flag2 = v >= FIRST_SPELL_VERSION ? bytes[o++]! : 0;   // the second flag byte (v53); before it there is none
  if (flag2 > 1) throw Error('Fight record: unknown spell flag');
  if (v === FIRST_SPELL_VERSION && !(flag2 & 1)) throw Error('Fight record: a version 53 record names its spell');
  if (flag2 & 1 && !(flag & 1)) throw Error('Fight record: a spell without Special Moves');
  let pose: DuelPose | undefined;
  if (flag & 32) { const f = (): number => { const n = dv.getFloat32(o, true); o += 4; return n; }; pose = { hero: { x: f(), z: f() }, foe: { x: f(), z: f() }, heroFacing: f() }; try { validatePose(pose, false); } catch { throw Error('Fight record: unusable pose'); } }
  let group: RecordGroup | undefined;
  if (flag & 64) {
    const need = (k: number): void => { if (o + k > bytes.length) throw Error('Fight record: truncated'); };
    need(3); const b = bytes[o++]!, nIn = dv.getUint16(o, true); o += 2;
    if (nIn > GROUP_LIST_MAX) throw Error('Fight record: unknown group');
    need(6 * nIn + 2); const incoming: [number, number][] = [];
    for (let k = 0; k < nIn; k++) { incoming.push([dv.getUint32(o, true), dv.getUint16(o + 4, true)]); o += 6; }
    const nHeld = dv.getUint16(o, true); o += 2;
    if (nHeld > GROUP_LIST_MAX) throw Error('Fight record: unknown group');
    need(8 * nHeld); const held: [number, number][] = [];
    for (let k = 0; k < nHeld; k++) { held.push([dv.getUint32(o, true), dv.getUint32(o + 4, true)]); o += 8; }
    group = { n: b & 15, index: b >> 4, incoming, held };
  }
  let sheet: Sheet | undefined;
  if (flag & 128) {
    if (o + 1 > bytes.length) throw Error('Fight record: truncated');
    const count = bytes[o++];
    if (!count || count > DIALS.length || o + 2 * count > bytes.length) throw Error('Fight record: unknown sheet');
    const mods: Record<string, number> = {}; let last = 0;
    for (let k = 0; k < count; k++) { const st = dialByCode(bytes[o++]); if (!st || st.code <= last) throw Error('Fight record: unknown sheet'); last = st.code; mods[st.id] = bytes[o++]!; }
    try { sheet = checkSheet(mods); } catch { throw Error('Fight record: unknown sheet'); }
    if (!sheet || Object.keys(sheet).length !== count) throw Error('Fight record: unknown sheet');   // a pair at base is not how the writer says it
  }
  let characterId: string | undefined, buildVersion: number | undefined;
  if (sheet) {
    if (o + 1 > bytes.length) throw Error('Fight record: truncated');
    const len = bytes[o++]!;
    if (len > 64 || o + len + 4 > bytes.length) throw Error('Fight record: unknown sheet');
    let id = ''; for (let k = 0; k < len; k++) id += String.fromCharCode(bytes[o + k]!); o += len;
    const version = dv.getUint32(o, true); o += 4;
    if (len) { characterId = id; buildVersion = version; }
    if (buildRefBad({ sheet, ...(characterId !== undefined ? { characterId, buildVersion } : {}) }) || (!len && version)) throw Error('Fight record: unknown sheet');
  }
  let spell: { id: string; skill: number } | undefined;
  if (flag2 & 1) {
    if (o + 1 > bytes.length) throw Error('Fight record: truncated');
    const len = bytes[o++]!;
    if (!len || len > 64 || o + len + 1 > bytes.length) throw Error('Fight record: unknown spell');
    let id = ''; for (let k = 0; k < len; k++) id += String.fromCharCode(bytes[o + k]!); o += len;
    const sk = bytes[o++]!;
    if (!SPELL_ID.test(id) || sk > 100) throw Error('Fight record: unknown spell');
    spell = { id, skill: sk };
  }
  if (o + 1 + 4 + 4 + 1 > bytes.length) throw Error('Fight record: truncated');
  const level = bytes[o++], seed = dv.getUint32(o, true); o += 4; const n = dv.getUint32(o, true); o += 4; const outcome = OUTCOMES[bytes[o++]];
  if (level < 1 || level > LEVELS || !outcome) throw Error('Fight record: unknown level or outcome');
  for (let bump = v + 1; bump <= RECORD_VERSION; bump++) for (const r of REACH[bump] ?? []) if (opponent === r.opponent && level >= r.from)
    throw Error(`Fight record: version ${v} is not supported for the ${opponent} from level ${r.from} (bump ${bump} changed that fight, so an older link would replay a different fight)`);
  if (group && groupBad(group, n)) throw Error('Fight record: unknown group');
  if (n > MAX_RECORD_TICKS) throw Error(`Fight record: ${n} ticks is past the ${MAX_RECORD_TICKS}-tick limit`);
  if (bytes.length !== o + 6 * n) throw Error('Fight record: length does not match its tick count');
  const col = (k: number) => o + k * n, intents: Intent[] = new Array(n);
  let yaw = 0;
  for (let i = 0; i < n; i++) {
    const sx = bytes[col(0) + i], sz = bytes[col(1) + i], x = (sx >= 128 ? sx - 256 : sx) / 127, z = (sz >= 128 ? sz - 256 : sz) / 127;
    yaw = (yaw + bytes[col(2) + i]) % YAW_STEPS;
    const action = ACTIONS[bytes[col(3) + i]], dir = DIRECTIONS[bytes[col(4) + i]], f = bytes[col(5) + i];
    if (bytes[col(3) + i] >= ACTIONS.length || bytes[col(4) + i] >= DIRECTIONS.length) throw Error(`Fight record: unknown action or guard side at tick ${i}`);
    const it: Intent = { move: { x, z, yaw: byteToYaw(yaw), run: !!(f & F_RUN) }, action: action ?? null, guard: !!(f & F_GUARD), lock: !!(f & F_LOCK) };
    if (f & F_HELD) it.held = true;
    if (f & F_CANCEL) it.cancel = true;
    if (dir) it.guardDirection = dir;
    intents[i] = it;
  }
  // The version PARSED, not the constant: returning `RECORD_VERSION` here would let a decode-then-repack silently relabel an older
  // record as this build's, and packRecord's guard above would then throw on a record this function had just called well-formed.
  return { v: v as RecordVersion, build, opponent, weapon, ...(skill ? { skill } : {}), ...(arena ? { arena } : {}), level, seed, ...(flag & 1 ? { specials: true } : {}), ...(flag & 2 ? { gambit: true } : {}), ...(flag & 4 ? { stances: PICKS[(flag >> 3) & 3] } : {}), ...(patron ? { patron } : {}), ...(sheet ? { sheet } : {}), ...(characterId !== undefined ? { characterId, buildVersion } : {}), ...(pose ? { pose } : {}), ...(spell ? { spell } : {}), ...(group ? { group } : {}), ticks: n, outcome, intents };
}

// ---- transport: gzip + base64url (no padding). CompressionStream is in every browser the game targets and in Node ≥ 18. --------
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0, c = i + 2 < bytes.length ? bytes[i + 2] : 0, n = (a << 16) | (b << 8) | c;
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '') + (i + 2 < bytes.length ? B64[n & 63] : '');
  }
  return s;
}
export function fromBase64Url(s: string): Uint8Array {
  if (/[^A-Za-z0-9_-]/.test(s) || s.length % 4 === 1) throw Error('Fight record: not base64url');
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const v = (k: number) => (i + k < s.length ? B64.indexOf(s[i + k]) : 0), n = (v(0) << 18) | (v(1) << 12) | (v(2) << 6) | v(3);
    out[o++] = (n >> 16) & 255;
    if (i + 2 < s.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < s.length) out[o++] = n & 255;
  }
  return out;
}
// Public links reach the decoder, so every dimension is bounded: a compressed text limit (share-store MAX_STORED_CHARS, replay MAX_SHARE_CHARS)
// is not a limit on what it expands to. Thirty minutes at 60 Hz is far beyond any real duel; a stream past MAX_RECORD_BYTES is cancelled.
export const MAX_RECORD_TICKS = 108_000, MAX_RECORD_BYTES = 1_000_000;
async function pipe(bytes: Uint8Array, stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream<BufferSource> }): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  // A fresh ArrayBuffer-backed copy (the stream wants a BufferSource). A failed write (bad gzip on decode) surfaces on the read side
  // below, so its own rejection is swallowed here rather than left unhandled.
  void writer.write(new Uint8Array(bytes)).then(() => writer.close()).catch(() => {});
  const parts: Uint8Array[] = [], reader = stream.readable.getReader();
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    total += value.length;
    if (total > MAX_RECORD_BYTES) { await reader.cancel(); throw Error(`Fight record: expands past ${MAX_RECORD_BYTES} bytes`); }
    parts.push(value);
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
export const encodeRecord = async (r: FightRecord): Promise<string> => toBase64Url(await pipe(packRecord(r), new CompressionStream('gzip')));
export async function decodeRecord(s: string): Promise<FightRecord> {
  let bytes: Uint8Array;
  try { bytes = await pipe(fromBase64Url(s), new DecompressionStream('gzip')); } catch (error) { throw new Error(`Fight record: cannot decode (${error instanceof Error ? error.message : String(error)})`, { cause: error }); }
  return unpackRecord(bytes);
}
