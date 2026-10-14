import { MOVES, PATHS } from './move-rows.ts';
import WEAPON_DEFS from './weapon-defs.json' with { type: 'json' };
import SKILL_DEFS from './skill-defs.json' with { type: 'json' };
import { loadSkillDefs } from './skills.ts';
import { loadWeaponDefs, type WeaponLook } from './weapons.ts';
import { DAMAGE_KIND_IDS } from './damage-kinds.ts';
import { RULES } from './rules.ts';
import { SPECIAL_SETS, SPECIAL_RANK_LEVELS } from './special-set-rows.ts';
import { LEVEL_ANCHORS } from './level-anchor-rows.ts';
import type { PoolValues } from './pools.ts';
import { ROSTER, type OpponentId, type RigId } from '../roster.ts';
import { LEVELS, LATE_NOTICE_FROM } from './moves-dials-rows.ts';   // the dials are rows (moves-dials-defs.json)
import { PROFILES_ROWS, OWN_KNOBS_ROWS, ABSENT_ROWS, POISE_FULL_AT_ROWS } from './moves-tables-rows.ts';   // rows: moves-tables-defs.json
export { LEVELS };
export type { OpponentId, RigId } from '../roster.ts';
// Combat data. Every timing is in fixed 60 Hz ticks; every number here is a tuning candidate, not a validated value.
// Damage is tuned for a Souls-length duel: AI vs AI at normal runs ~9 clean hits / ~35 s (light 11, heavy 18, riposte 24, heavy riposte 30, kick 4).
// The engine (duel.ts) reads this table; nothing here may depend on rendering, clocks or browser state.
export type MoveId = 'light_right' | 'light_left' | 'heavy_overhead' | 'thrust' | 'riposte' | 'slash_riposte' | 'heavy_riposte' | 'heavy_counter' | 'critical' | 'kick' | 'skill_witchfire' | 'skill_pommel'
  | 'skill_lunge' | 'skill_reaping' | 'skill_shove' | 'skill_jab' | 'skill_cleave' | 'skill_stomp' | 'skill_miasma' | 'skill_ironrush' | 'skill_hewer';
export type SkillId = string;   // a row id in skill-defs.json (skills are data: a new skill is one row plus its MoveDef verb); the equipped skill (docs/briefs/skill-witch-arm.md): one per duel, fired by the SKILL action; null on a fighter = none (every opponent in V1)
export type Direction = 'right' | 'left' | 'overhead' | 'thrust' | 'low';
export type Timing = { windup: number; active: number; recovery: number };
export const total = (t: Timing): number => t.windup + t.active + t.recovery;

// Baked blade trajectories: one immutable table per (authored clip, timing). scripts/bake-blades.mjs samples the rig at these
// timings; tests assert the shipped rig still agrees. `source` is the contact time inside the clip; `clip` is the rig animation.
export type PathId = 'light_right' | 'light_left' | 'light_right_chain' | 'light_left_chain' | 'heavy_overhead' | 'heavy_overhead_chain' | 'thrust' | 'riposte' | 'slash_riposte' | 'heavy_riposte';
export type PathSpec = Timing & { clip: 'Attack' | 'Return' | 'Heavy' | 'Riposte' | 'Trident_Thrust' | 'Trident_ThrustChain' | 'Trident_Sweep' | 'Trident_High' | 'Scythe_Reap' | 'Scythe_High' | 'Scythe_Thrust' | 'Scythe_Chain'; source: number };
// PATHS and MOVES are rows (move-defs.json), built by move-rows.ts; the notes that sat beside the literals are in docs/specs/combat/move-notes.md.
export type MoveDef = Timing & {
  id: MoveId;
  direction: Direction;
  path: PathId | null;            // swept blade table; null = short reach cone (kick)
  chainPath: PathId | null;       // faster table when performed as a chain follow-up
  chained: Timing | null;         // timing as a follow-up; null = never accelerated
  chain: { window: number; follow: MoveId[] } | null;   // follow-ups started within `window` ticks after recovery use `chained`
  damage: number;
  stamina: number;                // attacker cost at commitment
  staminaDamage: number;          // defender guard stamina drained by a blocked sword hit / any kick hit
  stagger: number;                // hurt ticks dealt by a clean hit
  poise: number;                  // incoming stagger shrugged off between poiseFrom and the end of the active window
  poiseFrom: number;
  breaksGuard: boolean;           // cannot be blocked: a standing guard is broken instead (a charged heavy always breaks)
  chip: number;                   // fraction of damage that passes through an ordinary block (a perfect block stops it all)
  parryable: boolean;
  knockback: number;              // defender shove ticks on a clean hit
  stepIn: number;                 // wind-up lunge speed (fraction of walking speed) from RULES.stepInFrom until contact
  feintUntil: number;             // a fresh guard press inside this many wind-up ticks cancels the swing into a guard (0 = never)
  posture: number;                // posture put on the defender by a clean hit or a block (a perfect block takes RULES.posture.perfect of it)
  chamber: number | null;         // wind-up tick at which a held swing pauses (the load is the tell); null = a press always swings through
  charges: boolean;               // a chamber held for RULES.charge.min ticks becomes the charged swing (multiplied, breaks a guard)
  reach: number;                  // AI range estimate for swords; the actual cone for kicks
  minReach?: number;              // a blow started inside this gap meets nothing (a pole's point: the tines drive past the target); absent = 0
  vsGuard: { stagger: number; staminaDamage: number } | null;  // kick against a standing guard
  damageKind?: string;            // a row id of damage-kind-defs.json (slash drains stamina, crush adds posture, pierce ignores armour; damage-kinds.ts); absent = the plain blow, byte for byte
};

export { MOVES, PATHS };

export { RULES } from './rules.ts';   // the duel's rules are rows (rules-defs.json), built by rules.ts

// Per-fighter guard overrides (a shield is data, not code): defaults come from RULES at resolution time.
export type GuardProfile = { costScale: number; arc: number; window: number; recovery: number; commits: boolean; stopsHeavy: boolean; heavyBreaks: boolean; wide: boolean; postureDecay: number };   // wide: a left or right guard covers both flanks (a shield); postureDecay: × RULES.posture.decay   // recovery: ticks exposed after a parry that met nothing (RULES.parryRecovery unless the guard says otherwise); commits: a parry that must run its window — no action out of it, and one that met nothing always ends exposed, held or not (a man's parry yields to any action; the Nightborn's does not)   // heavyBreaks: a plain overhead heavy breaks this guard (a shaft has no blade to catch it on)

export type AiProfile = {
  reaction: number;    // ticks before a fresh opponent action is noticed
  softNotice?: 1;   // COMBAT-001 late notice (ai.ts READ.lateNotice): set by profileAt on the levels between the rungs from L12 up; absent on the three tables and on L1–11, so no early rung changes
  accuracy: number;    // 0..1 timing precision when predicting contact
  parry: number;       // 0..1 chance to attempt a parry on a noticed attack
  dodge: number;       // 0..1 chance to roll instead of guarding
  aggression: number;  // 0..1 scales attack cadence
  pressure: number;    // 0..1 chance a non-punish attack is a light rather than a heavy
  discipline: number;  // stamina floor below which it retreats and recovers
  lapse: number;       // 0..1 chance a noticed swing gets no answer at all (a human does not react to every cut they see; the AI would)
  // Fight-identity knobs (slice X, for the goblin; absent = the warden as it always was):
  read?: number;       // 0..1 chance the warden reads an incoming attack's side and guards/parries on it; otherwise a random other side. Absent = reads perfectly (the pre-directional guard)
  feint?: number;      // 0..1 base share of cuts and heavies that are feints against anyone (the read-parrier's 1/6 still applies on top)
  guard?: number;      // 0..1 share of the guard in its game: the standing guard, the bait guard, the block plan and the guard-walk (0 = never guards: evades or steps back instead)
  disengage?: number;  // 0..1 chance to hop back out of range right after landing a blow (hit and run)
  circle?: number;     // 0..1 lateral drift while closing in (0 = walks straight in); it always circles once in range
  regen?: number;      // stamina regeneration multiplier for this fighter (1 = RULES.regen)
  step?: number;       // 0..1 share of evasions taken as a backstep rather than a roll (light on his feet: 10 stamina and 12 ticks, not 30 and 36)
  interrupt?: number;  // 0..1 chance to cut INTO a slower tell when his own cut lands first (a fast fighter's counter-swing; 0 = never attacks into a threat)
  kick?: number;       // 0..1 share of answers to a read roller or backstepper that are kicks (the one blow their timing does not escape)
  dash?: number;       // 0..1 chance to sprint into an opening (a whiff, a stagger) from outside reach instead of walking (a darter closes in a few ticks)
  anticipate?: number; // ticks to notice a read cut-spammer's cut (src/fight/ai.ts; the reaction still caps it). Absent = READ.anticipate (8), every warden as it was
  tellReaction?: number; // ticks to notice a thrust or a pommel strike (src/fight/ai.ts TELLS), so reaction v lights can stay slow. Absent = the reaction (RV19, the Centurion)
  stab?: number;         // 0..1: share of openings (a whiffed swing's recovery) answered with the thrust when the cut cannot reach: the knife's 12-tick stab, too short a tell for a reactive guard. Absent = 0 (the Goblin's offence, COMBAT-001 3/3)
  spamBoth?: number;     // 1: keep the old read as well as the early gate (the Shieldmaiden alone: her honest blocker loses 12-15 points on the gate alone). Absent / 0 = the early gate alone
  spamRun?: number;      // RV31: read a masher EARLY: this many consecutive lights before the player has defended once (src/fight/ai.ts readOpponent). Absent = the old read (11 swings, 70 % lights)
  braceHeavy?: number;   // 0..1: with a guard that stops heavies (the scutum), meet a guard-breaking heavy in that guard, and never walk in on a charging
                         // one: step back out of its reach instead. Absent = 0 (a guard that stops nothing makes it inert) (RV19, the Centurion)
};
// A weapon is data a fighter carries: its move table, its blade paths (baked per weapon by scripts/bake-blades.mjs from
// scripts/blade-manifest.json), the kind of guard it makes, its material (audio picks cues by it) and the reach the AI reasons with.
// Every MOVES/PATHS/blade-path lookup in the simulation goes through the fighter's weapon (`weaponOf`), so a second weapon is a table,
// not a rule change.
export type WeaponId = string;   // a row id in weapon-defs.json (weapons are data: a new weapon is one row); weaponOf / isWeaponId check it
export const MATERIALS = ['iron', 'bronze', 'wood', 'steel'] as const, GUARDS = ['blade', 'shaft'] as const, GRIPS = ['one-hand', 'two-hand'] as const;
export type Material = (typeof MATERIALS)[number];   // steel: the estoc — thin and bright to the ear, not the longsword's iron (the Nightborn brief)
export type Grip = (typeof GRIPS)[number];   // how many hands the weapon needs. DATA ONLY: nothing in the sim reads it, no reach/timing/damage
// depends on it, and no fairness row moves with it. The Veteran shield's stow logic reads it (a two-hander stows the shield to the back, a
// one-hander brings it up) — the shield brief's field, added here 2026-09-22 so it rides the batch's RECORD_VERSION bump instead of paying a second.
export type Weapon = { id: WeaponId; moves: Record<MoveId, MoveDef>; paths: Record<PathId, PathSpec>; guard: 'blade' | 'shaft'; material: Material; reach: number; grip: Grip; placeholder?: true;
  guardProfile?: Partial<GuardProfile>;   // how this weapon's guard takes a blow (absent = the longsword defaults in RULES)
  fight: { thrustShare: number; close: number };   // the warden's stance with it: share of non-cut openers that are thrusts (the first is always a heavy); the gap it closes to for a cut or a heavy
};
// The weapons are DATA now (core slice 4): src/fight/weapon-defs.json, resolved over the engine's base MOVES / PATHS by the loader in weapons.ts. The named exports below are the same objects the
// tests and scripts have always imported; each is a row of the loaded table.
const LOADED = loadWeaponDefs(WEAPON_DEFS, { moves: MOVES, paths: PATHS }, { materials: MATERIALS, guards: GUARDS, grips: GRIPS, kinds: DAMAGE_KIND_IDS });
// The skills are DATA too (core slice 5): src/fight/skill-defs.json, loaded by skills.ts. SKILL_MOVE is the one place a skill meets its MoveDef (duel.ts chooseMove, legal); SKILL_BY_CODE is the record codec's table.
const SKILLS_LOADED = loadSkillDefs(SKILL_DEFS, MOVES);
export const SKILL_ROWS = SKILLS_LOADED.rows;
export const SKILL_MOVE: Record<SkillId, MoveId> = Object.fromEntries(Object.values(SKILL_ROWS).map((r) => [r.id, r.move as MoveId]));
export const SKILL_BY_CODE: readonly (SkillId | null)[] = SKILLS_LOADED.byCode;   // index = the record byte (0 = none), append only
export const DAY_ONE_SKILL: SkillId = SKILLS_LOADED.dayOne;   // the hero's starting skill (Dom, 2026-09-25)
/** The move a skill FX verb answers to (a row's `fx`, e.g. 'witchfire'): the presentation modules ask the rows, they name no skill. */
export const fxMove = (fx: string): MoveId => { const r = Object.values(SKILL_ROWS).find((row) => row.fx === fx); if (!r) throw Error(`no skill row has fx "${fx}"`); return r.move as MoveId; };
/** The fx verb of a move's skill row, or undefined. */
export const fxOfMove = (move: string | undefined): string | undefined => { const id = skillOfMove(move); return id === null ? undefined : SKILL_ROWS[id]!.fx; };
export const BASH_MOVE: MoveId = Object.values(SKILL_ROWS).find((r) => r.bash)!.move as MoveId;   // the hilt-bash skill's move (the row with `bash`)
export const isSkillId = (id: unknown): id is SkillId => typeof id === 'string' && Object.hasOwn(SKILL_ROWS, id);
/** The skill a move belongs to, or null: the row whose `move` it is. */
export const skillOfMove = (move: string | null | undefined): SkillId | null => (move == null ? null : Object.values(SKILL_ROWS).find((r) => r.move === move)?.id ?? null);
export const WEAPONS: Record<WeaponId, Weapon> = LOADED.weapons;
export const DEFAULT_WEAPON: WeaponId = LOADED.defaultId;   // the row marked `default`: the weapon a fighter gets when none is named
export const WEAPON_LOOK: Readonly<Record<WeaponId, WeaponLook>> = LOADED.looks;   // the rows' presentation flags (baked, pommelBash, lowerArm, stabs); not on the Weapon, so they move no fight
export const NATURAL_WEAPONS: ReadonlySet<WeaponId> = new Set(LOADED.natural);   // a creature's own weapon (the bite), not a player item
export const weaponOf = (id: WeaponId): Weapon => { const w = WEAPONS[id]; if (!w) throw Error(`unknown weapon "${id}"`); return w; };
export const isWeaponId = (id: unknown): id is WeaponId => typeof id === 'string' && Object.hasOwn(WEAPONS, id);
export const LONGSWORD = WEAPONS.longsword!, TRIDENT = WEAPONS.trident!, CLEAVER = WEAPONS.cleaver!, KNIFE = WEAPONS.knife!, ESTOC = WEAPONS.estoc!, GLADIUS = WEAPONS.gladius!, SCYTHE = WEAPONS.scythe!;
export const TRIDENT_PATHS = TRIDENT.paths, CLEAVER_PATHS = CLEAVER.paths, KNIFE_PATHS = KNIFE.paths, ESTOC_PATHS = ESTOC.paths, SCYTHE_PATHS = SCYTHE.paths, SCYTHE_MOVES = SCYTHE.moves;
// The weapons a player can carry (Brief 5 loot): each has an equip file under src/assets/weapons/player and a bake on the hero rig
// (tests/blade-rig.test.ts pins both). The weapons lane appends here when a new equip file ships.
export const PLAYER_WEAPONS: readonly WeaponId[] = LOADED.player;   // the weapon rows' `player` order
// The weapons a player may be OFFERED (loot, paperdoll, equip): a subset of PLAYER_WEAPONS with no pairing over a cap in the 24-seed player
// weapon battery (scripts/player-weapon-battery.mjs; tests/player-weapons.test.ts derives the excluded set from that table). Combat signed
// the table 2026-09-21: the warhammer is fair on every live rung and is the first loot weapon; after the warden reach fix (combat/warden-reach)
// the trident is clean on every rung too. The SCYTHE joined them on 2026-09-22: its heel-jab recovery went 18 -> 30 and both of its
// "thrust from range" rows left the list, so it has no pairing over a cap at any rung. This list is not a taste call — the test derives
// the excluded set from the table and REQUIRES a weapon with no row to be offered, so the entry follows the measurement. Cleaver, knife
// and estoc still wait on the over-cap list (see KNOWN_UNFAIR there), and each of their remaining rows is Combat's, not weapon data.
export const PLAYER_WEAPONS_OFFERED: readonly WeaponId[] = LOADED.offered;   // the weapon rows' `offered` order

export const PROFILES: Record<'easy' | 'normal' | 'hard', AiProfile> = PROFILES_ROWS as unknown as Record<'easy' | 'normal' | 'hard', AiProfile>;
export type Level = keyof typeof PROFILES;
// An opponent is data a duel is set up from: the weapon he carries, his body scale (the blade sweep's hit capsule and regions
// follow it; the renderer picks his GLB by id), his health, his poise and his own profile per level — the same easy/normal/hard toggle
// modulates every opponent. The Veteran is the warden as shipped; `initialDuel()` with no argument is still exactly him.
// poise: a plain clean hit dealing less than this damage never staggers him (it still wounds and builds posture); heavies,
// counter-hits, stop-hits, rear hits and charged blows always do. 0 = staggered by everything, the human default.
// guard: how this man's guard behaves on top of his weapon's (`Fighter.guardProfile`): the Nightborn's parry window is longer than a man's
// and a parry of his that meets nothing leaves him open longer — the one mechanism behind "bait him" (see OPPONENTS.nightborn).
export type Opponent = { id: OpponentId; weapon: WeaponId; rig: RigId; scale: number; health: number; poise: number; profiles: Record<Level, AiProfile>; guard?: Partial<GuardProfile>; regen?: number; speed?: number; pools?: PoolValues };   // regen: stamina regeneration multiplier; speed: pace multiplier for walking, lunging and stepping (a small fighter is quick on his feet)
const WITCH_IDENTITY = { pressure: .75, disengage: .5, circle: .6, step: .7, guard: .4 };
const ARCHETYPES: Record<(typeof ROSTER)[OpponentId]['archetype'], Omit<Opponent, 'id' | 'weapon' | 'rig'>> = {
  // Hard: pressure .7 and a discipline floor of 30 keep him cutting instead of resting (the shared hard was two wins tighter than normal;
  // docs/state/combat.md). His own table so the Executioner (shared PROFILES) is untouched.
  veteran: { scale: 1, health: RULES.health, poise: 0, profiles: { ...PROFILES, hard: { ...PROFILES.hard, pressure: .7, discipline: 30 } } },   // the trident since slice V (2026-09-16)
  // `scale` is measured off witch.glb (the reconstruction is fitted to the Veteran's 1.80 m rig, so her standing ratio is 1).
  // Her own Easy (Dom, 2026-09-24): same trident as the Centurion, a different fight. He plants and throws heavies and thrusts
  // (pressure 0); she sweeps lights (pressure .75), hops back out after she lands (disengage), drifts round him (circle), takes her
  // evasions as backsteps (step), and blocks less. Same difficulty (RV17): the hero's easy brain beats her 3/24 (him 5/24), its normal
  // brain 20/24 (him 24/24), 24 seeds, tests/witch-profile.test.ts.
  // Her identity (the sweep and the hop: pressure .75, disengage .5, circle .6, step .7, guard .4) is held at EVERY level (Lead ruling
  // 2026-09-27, Dom: "the witch's sweep and hop" stay); only her skill fields change with the level. Before, normal and hard were the plain warden's.
  witch: { scale: 1, health: RULES.health, poise: 0, profiles: {
    // Skill fields retuned (Combat, 2026-09-27; Lead: skill only, identity held, L18 unchanged, no strategy > 80 % at L ≥ 6): with her hop held at
    // every level, a reaction of 26 left thrust-from-range at 46–48 / 48 through L10–16; she now answers it (worst row L6–17: 32 / 48).
    easy: { reaction: 15, accuracy: .5, parry: .2, dodge: .2, aggression: .45, ...WITCH_IDENTITY, discipline: 50, lapse: .35, read: .65 },
    // Normal skill fields (Combat sweep, Lead ruling (a), 2026-09-28): her hop held at normal put estoc / scythe thrust from range 16 / 20 and
    // trident charged heavy only 13 / 24 over the weapon cap (12); reaction 14 -> 12, parry .3 -> .45, read .7 -> .8 bring them to 6 / 11 / 7,
    // worst other weapon longsword 10 / 24 (c4; the two-field c3 left trident on the cap, inside seed noise, so Lead took the margin).
    normal: { ...PROFILES.normal, reaction: 12, parry: .45, read: .8, ...WITCH_IDENTITY },
    hard: { ...PROFILES.hard, discipline: 30, ...WITCH_IDENTITY } } },
  // The dwarf (character lane, 2026-09-20): the Veteran's trident game on a short, wide, re-proportioned rig (build-warrior.mjs BUILD.dwarf).
  // Measured in the shared Idle he stands 1.361 m to the hero's 1.745 (×0.780; tests/characters.test.ts pins it) — the goblin's height with
  // a barrel body; the hit capsule follows the measured height like the goblin's. Sturdier than a man: 170 health and poise 12 — a stab (11)
  // never stops him, a plain cut (14) or heavier does. Same AI profiles as the Veteran until the combat lane tunes him.
  // His own brain (Combat slice, 2026-09-20): the Veteran's pressure 0 made ~85 % of his openers hammer heavies; a chopper's mix
  // (pressure .5), a low parry (the blunt punish is not his game) and a normal reaction. Hero's brain 24 seeds: see the battery.
  dwarf: { scale: .78, health: 170, poise: 12, profiles: {
    easy: { reaction: 24, accuracy: .5, parry: .05, dodge: .1, aggression: .55, pressure: .4, discipline: 55, lapse: .45, read: .55 },
    normal: { reaction: 14, accuracy: .8, parry: .15, dodge: .15, aggression: .85, pressure: .5, discipline: 45, lapse: .3, read: .8 },   // aggression .7 → .85, lapse .25 → .3 (owner: align with the others): 12/24 in 32 s, was 11/24 in 38 s — the longest fights on the ladder
    hard: { reaction: 12, accuracy: .85, parry: .25, dodge: .25, aggression: .85, pressure: .55, discipline: 40, lapse: .15, read: .85 },   // accuracy .9 → .85, lapse .1 → .15: 7/24 like the Pitborn's hard, was 4/24
  } },
  // The pit brute: relentless light chains (aggression, pressure), a low parry rate, slower to notice, a low discipline floor so he
  // swings himself hot; poise 16 — a plain cut (14) or stab (11) never stops him, a heavy (18) or any counter does.
  // Health 190: with the Veteran's brain driving the hero he took 150 in ~22 s (probe, 24 seeds); the brute is meant to take more killing than a man.
  pitborn: { scale: 1.13, health: 190, poise: 16, profiles: {
    easy: { reaction: 28, accuracy: .5, parry: .05, dodge: .05, aggression: .6, pressure: .6, discipline: 30, lapse: .45, read: .45 },
    // Reaction 14 and lapse .1: he notices the stab in time to block it and answers what he sees, so stop-hitting him as he walks in no
    // longer wins on its own; the whiff punisher stays the answer (the probe that set these: docs/state/combat.md).
    normal: { reaction: 14, accuracy: .85, parry: .15, dodge: .1, aggression: .8, pressure: .7, discipline: 25, lapse: .1, read: .6 },
    hard: { reaction: 12, accuracy: .9, parry: .4, dodge: .3, aggression: .95, pressure: .75, discipline: 24, lapse: .08, read: .75 },   // parry .3 → .4, dodge .2 → .3 (owner, 2026-09-20): hard was 15/24 for the hero's brain; more answers, 17/24 (sweep). discipline 20 → 24 with the cleaver (slice W): its hack costs 42, and at 20 he swung himself empty into the whiff punisher (10/24 at hard, over the cap); 24 keeps him hot-headed (the Veteran holds 40) and the punisher at 7/24
  } },
  // The Shieldmaiden (shield wall; her own row, RV30, 2026-10-07, Strategy's identity line): the Pitborn's body and stamina game with a
  // guard-first brain — a low parry (she blocks), less aggression and the brace against a charging heavy. `guard` stays absent (= 1, the most a guard share can be). AI profile only:
  // no move timing changes. (A shield bash through the `kick` knob was dropped, Strategy 2026-10-07: it fires only against a roller or backstepper, and no profile knob opens a raised guard.)
  shieldmaiden: { scale: 1, health: 190, poise: 16, profiles: {
    easy: { reaction: 28, accuracy: .5, parry: .05, dodge: .05, aggression: .6, pressure: .6, discipline: 30, lapse: .45, read: .45 },
    normal: { reaction: 14, accuracy: .85, parry: .1, dodge: .1, aggression: .65, pressure: .7, discipline: 25, lapse: .1, read: .6, braceHeavy: .6 },
    hard: { reaction: 12, accuracy: .9, parry: .3, dodge: .3, aggression: .85, pressure: .75, discipline: 24, lapse: .08, read: .75, braceHeavy: .6 },
  } },
  // The Nightborn (opponent 5, the vampire duelist): the parry is his whole game — the highest parry share on the roster, the fastest
  // reaction, thrusts over cuts (pressure), a low dodge share, a man's health and no poise (a duelist is staggered like anyone; his
  // defence is the blade, not the hide). His guard is what makes him a fight and not a reskin: a 16-tick parry window (a man's is 10)
  // means the AI presses it at contact − 14 — tick 6 of a 20-tick cut, INSIDE the player's feint window (feintUntil 10) — so a feint
  // draws the parry; his parry COMMITS (guard.commits): he cannot cut out of it or hold it into a guard the way a man can, and he reads
  // the tell (elapsed time, not the blade's clock), so a swing held at its chamber draws it too. One that met nothing leaves him exposed
  // 40 ticks (a man's 8) with no swing out of it — the feint's own 10-tick guard, a human's ~200 ms to see the whiff and the punish cut's
  // 20-tick tell fit inside. His reaction (6 at normal) is the floor under the press: it must sit inside the feint window with a tick to spare.
  // The heavy's tell (34) is past his press, so an honest heavy is parried; a heavy held at its chamber past his press lands on the whiff.
  // Kicks open a standing guard. PROVISIONAL; the battery in tests/opponents.test.ts is the gate.
  nightborn: { scale: 1.03, health: RULES.health, poise: 0, guard: { window: 16, recovery: 40, commits: true }, profiles: {
    // Easy: a human reaction, a quarter parry and more lapses put him with the other rungs' easy (an 8-tick reaction and a .45 parry had
    // made easy as hard as hard; docs/state/combat.md); the commit is still there to learn.
    easy: { reaction: 16, accuracy: .7, parry: .25, dodge: .1, aggression: .5, pressure: .4, discipline: 55, lapse: .4, read: .7 },
    normal: { reaction: 6, accuracy: .85, parry: .7, dodge: .1, aggression: .52, pressure: .45, discipline: 45, lapse: .25, read: .85 },   // lapse .3 -> .25 and aggression .55 -> .52 (RV29, 2026-10-07): the posture/rear rules put 'scythe vs nightborn normal: charged heavy only untouched' at 3/24 (limit 2, the standing rule forbids un-offering the scythe); .25 measures 2/24 (wins 8 -> 5 with the aggression); lapse alone raised his exhausted ticks in the AI-vs-AI row to 290 (bar 240), .52 holds them at 87 (probe 2026-10-07; grid in docs/state/combat.md). The Plague Doctor took .3 -> .2 for the same row at bump 8.   // pressure .45: enough heavies that a roller is charged through (a cut-and-thrust man rolls too easily). aggression .6 → .55 (2026-09-23, the estoc's +0.30 m reach): with the longer blade in reach more often he swung himself into exhaustion (321 ticks over 24 AI fights, bar 240) and a trident charger won 14/24; .55 → 108 ticks and 8/24
    hard: { reaction: 5, accuracy: .95, parry: .8, dodge: .15, aggression: .65, pressure: .6, discipline: 35, lapse: .05, read: .95 },   // discipline 40 → 35, pressure .5 → .6 (owner, 2026-09-20): hard was no harder than normal (9/24 both); 18/24 now. Discipline 30 left no honest answer (feint-and-punish 0/24 at hard); 35 keeps it at 4. aggression .75 → .65 (2026-09-23): the estoc's +0.30 m reach took the feint-and-punish to 0/24 again; .65 → 7/24.
  } },
  // The Plague Doctor: a PLACEHOLDER — the Nightborn's row verbatim (Lead, 2026-09-23), only the scale measured: his body tops out at
  // 1.840 m against the player's 1.822 (hero rig, scale 1). Combat owns his real row and battery.
  plagueDoctor: { scale: 1, health: RULES.health, poise: 0, guard: { window: 16, recovery: 40, commits: true }, profiles: {
    // Easy: a human reaction, a quarter parry and more lapses put him with the other rungs' easy (an 8-tick reaction and a .45 parry had
    // made easy as hard as hard; docs/state/combat.md); the commit is still there to learn.
    easy: { reaction: 16, accuracy: .7, parry: .25, dodge: .1, aggression: .5, pressure: .4, discipline: 55, lapse: .4, read: .7, tellReaction: 15 },   // tellReaction 15 (bump 20, 2026-09-29; Lead ruling (a), Strategy confirmed): with the estoc, L6 'thrust from range' won 87 % (trunk longsword 71). His own easy anchor only, so the ladder's blend toward ABSENT (99) leaves L7+ on the reaction (identical fights) and L5 unchanged; 15 is the mildest that closes it (any tell under the 16 reaction does: 4 %)
    normal: { reaction: 6, accuracy: .85, parry: .7, dodge: .1, aggression: .45, pressure: .45, discipline: 45, lapse: .2, read: .85 },   // RV30: aggression .55 -> .45 (her own row, a poisoner waits; the Nightborn's .52). Combat retune at bump 8 (2026-09-23), the placeholder's one forced change: lapse .3 → .2. With the Nightborn's .3 he failed to touch a charger in 3/24 fights with the trident and the scythe (limit 2); .2 → at most 1, worst wins row 6/24
    hard: { reaction: 5, accuracy: .95, parry: .8, dodge: .15, aggression: .55, pressure: .6, discipline: 35, lapse: .05, read: .95 },   // discipline 40 → 35, pressure .5 → .6 (owner, 2026-09-20): hard was no harder than normal (9/24 both); 18/24 now. Discipline 30 left no honest answer (feint-and-punish 0/24 at hard); 35 keeps it at 4. aggression .75 → .65 (2026-09-23): the estoc's +0.30 m reach took the feint-and-punish to 0/24 again; .65 → 7/24.
  } },
  // The goblin (opponent 4, the pit-runner): small, fast, mean — 0.78× a man (his measured standing height; the rig is re-proportioned, not
  // shrunk: build-warrior.mjs BUILD.goblin), 100 health, poise 0 (anything staggers him). Reaction fast, parry 0 (he never parries), the dodge
  // share high, a low discipline floor. Slice X (combat review, 2026-09-17) gave him his identity knobs: he feints (a share of every cut and
  // heavy, against anyone), never guards (guard 0: he evades or steps back where a man would block), hops back out after landing (disengage),
  // drifts sideways while closing (circle) and recovers stamina half again as fast (regen 1.5). He fights with the knife: slash 1.2 / stab 1.45 /
  // hack 1.55 m (measured), inside a sword's cutting range — his `fight.close` 1.0.
  goblin: { scale: .78, health: 120, poise: 0, regen: 1.5, speed: 1.2, profiles: {   // health 100 → 120 (owner, 2026-09-17): a careless player deleted him in seven cuts; the hero brain beat him as often as the Pitborn, the rung before him
    easy: { reaction: 18, accuracy: .55, parry: 0, dodge: .3, aggression: .7, pressure: .5, discipline: 30, lapse: .4, feint: .15, guard: 0, disengage: .4, circle: .5, step: .6, interrupt: .3, kick: .4, dash: .6, read: .35 },
    normal: { reaction: 11, accuracy: .7, parry: 0, dodge: .4, aggression: .85, pressure: .6, discipline: 20, lapse: .2, feint: .3, guard: 0, disengage: .6, circle: .8, step: .8, interrupt: .6, kick: .6, dash: 1, read: .5, stab: .6 },
    hard: { reaction: 8, accuracy: .92, parry: 0, dodge: .5, aggression: .95, pressure: .65, discipline: 15, lapse: .08, feint: .4, guard: 0, disengage: .7, circle: 1, step: .8, interrupt: .8, kick: .7, dash: 1, read: .65, stab: 1 },
  } },
  // The Ash Wolf (Combat, 2026-10-07): the Goblin's hit-and-run on four legs. Smaller capsule (.8: at .62 the hero's brain could not hit the low body and won 24 of 24; .8 puts the easy and normal rows on the Goblin's own rates, 7 and 4 of 24), the fastest body in the roster
  // (speed 1.45, regen 1.4), little health (90) and no poise: it dies in a few clean cuts and punishes a slow one. Never guards, never kicks, never feints: it lunges (the thrust, with
  // `dash` closing the gap), bites (the light), mauls (the heavy, rare), circles and hops out after a landed bite (`disengage`) and evades by backstep, not roll (`step`). The rest is the twist
  // layer's flee-at in the world (a beast flees under 30%); in the Pit it fights to the end.
  wolf: { scale: .8, health: 90, poise: 0, regen: 1.4, speed: 1.45, profiles: {
    easy: { reaction: 18, accuracy: .55, parry: 0, dodge: .3, aggression: .7, pressure: .6, discipline: 25, lapse: .4, feint: 0, guard: 0, disengage: .5, circle: .6, step: .7, interrupt: .3, kick: 0, dash: .6, read: .35 },
    normal: { reaction: 11, accuracy: .55, parry: 0, dodge: .4, aggression: .85, pressure: .65, discipline: 20, lapse: .3, feint: 0, guard: 0, disengage: .7, circle: .9, step: .8, interrupt: .6, kick: 0, dash: 1, read: .5, stab: .7 },
    hard: { reaction: 8, accuracy: .92, parry: 0, dodge: .5, aggression: .95, pressure: .7, discipline: 15, lapse: .08, feint: 0, guard: 0, disengage: .8, circle: 1, step: .8, interrupt: .8, kick: 0, dash: 1, read: .65, stab: 1 },
  } },
  // The Tusked Boar (Combat, 2026-10-08, Dom: a boar in Zone 1): the wolf's rig family (the same seven-clip quadruped, the `bite` weapon, the wolf's capsule .8 and jaw bake), but a charger, not a
  // hit-and-runner: more health (140) and a little poise, slower than the wolf (speed 1.2), no hop-out after a landed gore (`disengage` 0) and little circling, so it rushes in (`dash` 1) and keeps coming.
  // Same moveset as the wolf's to begin with (a charge-and-gore of its own is a later row); profile NUMBERS only, tuned to the Goblin's rates (scripts/wolf-tune.mjs boar).
  boar: { scale: .8, health: 140, poise: 4, regen: 1, speed: 1.2, profiles: {
    easy: { reaction: 18, accuracy: .55, parry: 0, dodge: .1, aggression: .75, pressure: .65, discipline: 25, lapse: .4, feint: 0, guard: 0, disengage: 0, circle: .15, step: .3, interrupt: .2, kick: 0, dash: .8, read: .3 },
    normal: { reaction: 11, accuracy: .55, parry: 0, dodge: .15, aggression: .9, pressure: .7, discipline: 20, lapse: .3, feint: 0, guard: 0, disengage: 0, circle: .2, step: .4, interrupt: .4, kick: 0, dash: 1, read: .4, stab: .5 },
    hard: { reaction: 8, accuracy: .92, parry: 0, dodge: .2, aggression: 1, pressure: .75, discipline: 15, lapse: .08, feint: 0, guard: 0, disengage: 0, circle: .25, step: .4, interrupt: .6, kick: 0, dash: 1, read: .55, stab: .8 },
  } },
  // The Cinder Bear (Combat, 2026-10-08, Dom: bears after the boar): the boar's pattern on Characters' bear export (src/assets/bear.glb, #1781): the same seven-clip quadruped, the `bite` weapon, the wolf's capsule .8
  // and jaw bake. The heavy of the beasts: 220 health, poise 10, the slowest body (speed .95), a hard hitter that rushes and keeps coming (no hop-out, almost no circling), reading late (reaction 14 normal).
  // Wolf moveset to begin with (a maul of its own is a later row); profile NUMBERS only, tuned to the Goblin's rates (FOE=bear node scripts/wolf-tune.mjs).
  bear: { scale: .8, health: 220, poise: 10, regen: .8, speed: .95, profiles: {
    easy: { reaction: 22, accuracy: .55, parry: 0, dodge: 0, aggression: .65, pressure: .6, discipline: 28, lapse: .4, feint: 0, guard: 0, disengage: 0, circle: .05, step: .1, interrupt: .1, kick: 0, dash: .6, read: .25 },
    normal: { reaction: 14, accuracy: .6, parry: 0, dodge: .05, aggression: .8, pressure: .7, discipline: 22, lapse: .3, feint: 0, guard: 0, disengage: 0, circle: .1, step: .15, interrupt: .25, kick: 0, dash: .9, read: .35, stab: .4 },
    hard: { reaction: 10, accuracy: .9, parry: 0, dodge: .1, aggression: .95, pressure: .75, discipline: 16, lapse: .08, feint: 0, guard: 0, disengage: 0, circle: .15, step: .2, interrupt: .45, kick: 0, dash: 1, read: .5, stab: .7 },
  } },
  // The Executioner (opponent 6): 1.36 — 20 % over the Pitborn's 1.13 (owner, 2026-09-17), a big man's
  // health and poise. His arc is the scythe's (reap 1.40–2.10 m, a dead band inside 1.4 m, the shaft guard). He carries the
  // Veteran's brain (PROFILES); a profile of his own is the combat lane's call. Normal is his own since 2026-09-23 (Lead's anticipate
  // spec): a cut-spammer farmed him (light spam 18/24 with the cleaver, 12 warhammer, 11 trident; cap 12) because his 14-tick reaction
  // was clamped to the shared 8 on a read spam and still met the cut late. anticipate 3 + lapse .3 → .2 take those three to 8, 7, 7;
  // read .7 → .75 keeps the knife's thrust-from-range row where it was (11/24; .2 lapse alone put it on the cap at 12).
  // The value lives here, keyed by (opponent, level), because that is all a fight record carries: src/fight/replay.ts rebuilds the profile
  // from OPPONENTS[opponent].profiles[level], so a value merged in from outside the sim would replay a different fight.
  executioner: { scale: 1.36, health: 160, poise: 12, profiles: { easy: PROFILES.easy, normal: { ...PROFILES.normal, anticipate: 3, lapse: .2, read: .75 }, hard: PROFILES.hard } },
  // The Knight (armoured, methodical; his own row, RV30, 2026-10-07, Strategy's identity line): the Executioner's archetype and cut-spam
  // answer (anticipate 3, lapse .2, read .75: the same reasons) with a slower eye on cuts (reaction 16 at normal, tellReaction 10 on a thrust) and a steadier hand (aggression
  // .7 / .8), a heavy-first hard tier (pressure .3 against the shared .5). Poise 12 and the iron-rush special are his identity already.
  // AI profile only: no move timing changes.
  knight: { scale: 1.18, health: 160, poise: 12, profiles: {
    easy: PROFILES.easy,
    normal: { ...PROFILES.normal, reaction: 16, tellReaction: 10, aggression: .7, anticipate: 3, lapse: .2, read: .75 },   // tellReaction 10: at reaction 16 alone the estoc / gladius 'thrust from range' won 21 / 16 of 24 (cap 12); a slow eye on cuts, a quick one on the point
    hard: { ...PROFILES.hard, aggression: .8, pressure: .3, anticipate: 3 },
  } },
};

// Knobs one opponent carries on top of an archetype he shares (the Skeleton is the Centurion's archetype and stays as he was).
// The Centurion (RV19, Strategy ruling 2026-09-28): the thrust and the pommel strike are noticed in 15 ticks while his reaction v lights
// stays the warden's; with the scutum (RV18, L6+) he braces charged heavies and steps back out of a charging one. Battery (480 seeds, the
// gladius tree): L6 thrust from range 87 -> 23 %, charged heavy only 89 -> 56 %; L10 pommel then light 86 -> 71 %, thrust 84 -> 12 %; live
// (trident) L6 pommel then light 90 -> 79 %, thrust 73 -> 20 %; L1 tap 480 / 480; L6 light spam and heavy only unmoved (the easy rail).
const OWN_KNOBS: Partial<Record<OpponentId, Partial<AiProfile>>> = OWN_KNOBS_ROWS as unknown as Partial<Record<OpponentId, Partial<AiProfile>>>;   // RV31 (docs/specs/combat/l6-anti-spam.md): the five opponents a mashing player beat at L6 (the Pitborn's gate is 6: at 5 her skilled bot lost 9 points at L6, at 7 light spam still won 47/48); every other opponent keeps today's read
export const OPPONENTS = Object.fromEntries(Object.entries(ROSTER).map(([id, recipe]) => {
  const base = ARCHETYPES[recipe.archetype], own = OWN_KNOBS[id as OpponentId];
  const profiles = own ? { easy: { ...base.profiles.easy, ...own }, normal: { ...base.profiles.normal, ...own }, hard: { ...base.profiles.hard, ...own } } : base.profiles;
  return [id, { id, weapon: recipe.weapon, rig: recipe.rig, ...base, ...('pools' in recipe ? { pools: recipe.pools } : {}), profiles }];
})) as Record<OpponentId, Opponent>;

// ── The 46-level ladder (Dom via Strategy, 2026-09-27; anchors signed off 09:4x). Difficulty is a LEVEL, 1–46, whatever the opponent: each
// opponent's easy / normal / hard tables above are anchors at levels 6 / 18 / 46, and level 1 is a NOVICE below easy (a first-timer tapping
// attack must win). Between anchors every knob is linear, except the tick and stamina counts (reaction, anticipate, discipline), which round.
// The novice lowers only the fighter's SKILL (how fast and how well he reads and answers); his IDENTITY knobs (pressure, feint, guard,
// disengage, circle, step, interrupt, kick, dash) stay at easy's from 1 to 6, so the orc still chains, the goblin never guards.
// At an anchor level the anchor itself is returned, so levels 6 / 18 / 46 fight exactly as easy / normal / hard did (same RNG draws).
// 46 anchored the hard table; 47–50 are Origin II–V (the tail past hard, TAIL below)
// The named special an opponent casts at a ladder level is a ROW (special-set-defs.json, built by special-set-rows.ts; notes in docs/specs/combat/special-set-notes.md): ranks 8 / 9 / 10, levels 36 / 41 / 46.
export { SPECIAL_SETS };
export type SpecialName = string;   // a special's id is a row id in special-set-defs.json (ids stay strings; tests/special-identity.test.ts checks every one has a boss id)
// Per-special data rows: only the exceptions are listed. `interruptible` defaults to true (RULES.special.interruptAt); a boss the ladder sweep says must not be cut gets `{ interruptible: false }` here.
export const SPECIAL_ROWS: Partial<Record<SpecialName, { interruptible?: boolean }>> = {};
export const isInterruptible = (name: SpecialName | undefined): boolean => name === undefined || SPECIAL_ROWS[name]?.interruptible !== false;
export const specialOf = (opponent: OpponentId, level: number): SpecialName | null => {
  const set = Object.hasOwn(SPECIAL_SETS, opponent) ? SPECIAL_SETS[opponent] : undefined;
  return set && level >= SPECIAL_RANK_LEVELS[0]! ? set[SPECIAL_RANK_LEVELS.filter((from) => level >= from).length - 1]! : null;
};
export { LEVEL_ANCHORS };   // the profile tiers' anchor levels are rows (level-anchor-defs.json, built by level-anchor-rows.ts)
// The novice (Combat's L1 screen, 2026-09-27: tap-attack wins /48 at 48 seeds): slow to notice, rarely answers, swings a quarter as often.
const novice = (easy: AiProfile): AiProfile => ({ ...easy, reaction: easy.reaction + 30, ...(easy.tellReaction === undefined ? {} : { tellReaction: easy.tellReaction + 30 }), accuracy: .1, parry: 0, dodge: 0, aggression: easy.aggression * .25, lapse: .95, read: .1 });
// The novice BODY (option C, Strategy yes 2026-09-27 09:5x): no skill rule alone clears the level-1 gate, because a player's light never
// staggers a poise-16 fighter (the Pitborn, the Shieldmaiden trade and win on 190 health) — a body stat, not an AI knob. At level 1 poise is 0
// and health 70 %, blending linearly back to the opponent's own body at level 6 (easy), so from level 6 up he is exactly the man he was.
// L1–5 body scaling protects the new player; it isn't a balance layer, and nothing on the PLAYER's numbers moves (Strategy).
export const NOVICE_BODY = { poise: 0, health: .7 } as const;
// From L6 he is today's man, except poise for those two, full at L18 (Strategy 10:1x, 2026-09-27): a player's light (14) never staggers
// poise 16, so at L6 the tap-attacker went 45 -> 0 / 48 v the Pitborn and the Shieldmaiden. Their poise ramps 0 -> 16 over L1–18 instead
// (L6 poise 5); health and AI as everyone's. Set a value to LEVEL_ANCHORS.easy to put the old wall back.
export const POISE_FULL_AT: Partial<Record<OpponentId, number>> = POISE_FULL_AT_ROWS as unknown as Partial<Record<OpponentId, number>>;
// The scutum (SCOPE: guard profile only, 2026-09-27): two sides, stops heavies, a cheaper hold, posture drains faster. No damage
// reduction, no attack penalty. Starting numbers (Combat); the Centurion battery (L1/6/10/18/30/46) tunes them.
export const SCUTUM: Partial<GuardProfile> = { wide: true, stopsHeavy: true, heavyBreaks: false, costScale: .75, postureDecay: 1.5 };
// A loadout that changes with the ladder level (SCOPE: "Centurion carries gladius + scutum from Legionary"): below `from` he fights
// with his roster weapon (the Recruit's trident), from `from` on with this one.
export const LOADOUT_FROM: Partial<Record<OpponentId, { from: number; weapon: WeaponId; guard: Partial<GuardProfile> }>> = { veteran: { from: LEVEL_ANCHORS.easy, weapon: 'gladius', guard: SCUTUM } };
const bodyCache = new Map<string, Opponent>();
export function opponentAt(o: Opponent, level: number): Opponent {
  const l = Math.min(LEVELS, Math.max(1, Math.round(level)));
  const poiseAt = POISE_FULL_AT[o.id] ?? LEVEL_ANCHORS.easy, kit = LOADOUT_FROM[o.id], armed = kit && l >= kit.from;
  if (l >= Math.max(LEVEL_ANCHORS.easy, poiseAt) && !armed) return o;
  const key = `${o.id}:${l}`, hit = bodyCache.get(key);
  if (hit) return hit;
  const along = (full: number) => Math.min(1, (l - LEVEL_ANCHORS.novice) / (full - LEVEL_ANCHORS.novice));
  const body = { ...o, ...(armed ? { weapon: kit.weapon, guard: { ...o.guard, ...kit.guard } } : {}), poise: Math.round(NOVICE_BODY.poise + (o.poise - NOVICE_BODY.poise) * along(poiseAt)), health: Math.round(o.health * (NOVICE_BODY.health + (1 - NOVICE_BODY.health) * along(LEVEL_ANCHORS.easy))) };
  bodyCache.set(key, body);
  return body;
}
// An absent knob means "the warden as he always was" in ai.ts; a blend needs the number that absence stands for. A knob absent on BOTH
// sides stays absent (ai.ts draws no roll for it, so nothing downstream moves).
const ABSENT: Partial<AiProfile> = ABSENT_ROWS as unknown as Partial<AiProfile>;   // anticipate: ai.ts READ.anticipate (tests pin it)
const ROUNDED = new Set<keyof AiProfile>(['reaction', 'anticipate', 'discipline', 'tellReaction', 'spamRun']);
const blend = (a: AiProfile, b: AiProfile, t: number): AiProfile => {
  const out: Record<string, number> = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof AiProfile>) {
    const x = a[key] ?? ABSENT[key]!, y = b[key] ?? ABSENT[key]!, v = x + (y - x) * t;
    out[key] = ROUNDED.has(key) ? Math.round(v) : Math.round(v * 1000) / 1000;
  }
  return out as AiProfile;
};
const levelCache = new Map<string, AiProfile>();
// The tail past hard (Origin II–V, levels 47–50; Dom via Strategy 2026-10-05, Lead GO 2026-10-06 option B): L46 stays the hard table, byte for byte, and
// each later level blends a quarter further toward this apex — the SKILL knobs only, a few steps and capped, never the identity knobs (the
// Goblin still never guards, the Nightborn still reads). Where a table is already at the cap the knob does not move. Every rung is judged
// against the fairness caps at L47–50 (tests/ladder-tail.test.ts); a rung that broke one would fall back to flat hard.
const tailApex = (h: AiProfile): AiProfile => ({
  ...h,
  reaction: Math.min(h.reaction, Math.max(5, h.reaction - 2)),
  lapse: Math.round(h.lapse * 500) / 1000,
  accuracy: Math.max(h.accuracy, Math.min(.98, h.accuracy + .03)),
  ...(h.parry > 0 ? { parry: Math.max(h.parry, Math.min(.9, h.parry + .1)) } : {}),
  ...(h.read === undefined ? {} : { read: Math.max(h.read, Math.min(.98, h.read + .03)) }),
});
/** The first ladder level whose in-between profile uses late notice (ai.ts): the L11→L12 step is the first cliff, and L1–11 stay byte for byte (Lead, 2026-10-06). */
export function profileAt(o: Opponent, level: number): AiProfile {
  const l = Math.min(LEVELS, Math.max(1, Math.round(level)));
  if (l === LEVEL_ANCHORS.easy) return o.profiles.easy;
  if (l === LEVEL_ANCHORS.normal) return o.profiles.normal;
  if (l === LEVEL_ANCHORS.hard) return o.profiles.hard;
  const key = `${o.id}:${l}`, hit = levelCache.get(key);
  if (hit) return hit;
  if (l > LEVEL_ANCHORS.hard) { const tail = { ...blend(o.profiles.hard, tailApex(o.profiles.hard), (l - LEVEL_ANCHORS.hard) / (LEVELS - LEVEL_ANCHORS.hard)), softNotice: 1 as const }; levelCache.set(key, tail); return tail; }
  const [from, to, a, b] = l < LEVEL_ANCHORS.easy ? [LEVEL_ANCHORS.novice, LEVEL_ANCHORS.easy, novice(o.profiles.easy), o.profiles.easy]
    : l < LEVEL_ANCHORS.normal ? [LEVEL_ANCHORS.easy, LEVEL_ANCHORS.normal, o.profiles.easy, o.profiles.normal]
    : [LEVEL_ANCHORS.normal, LEVEL_ANCHORS.hard, o.profiles.normal, o.profiles.hard];
  const profile = l >= LATE_NOTICE_FROM ? { ...blend(a, b, (l - from) / (to - from)), softNotice: 1 as const } : blend(a, b, (l - from) / (to - from));
  levelCache.set(key, profile);
  return profile;
}
