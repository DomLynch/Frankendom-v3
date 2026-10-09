import { ROSTER, type OpponentId, type RigId } from '../roster.ts';
export type { OpponentId, RigId } from '../roster.ts';
// Combat data. Every timing is in fixed 60 Hz ticks; every number here is a tuning candidate, not a validated value.
// Damage is tuned for a Souls-length duel: AI vs AI at normal runs ~9 clean hits / ~35 s (light 11, heavy 18, riposte 24, heavy riposte 30, kick 4).
// The engine (duel.ts) reads this table; nothing here may depend on rendering, clocks or browser state.
export type MoveId = 'light_right' | 'light_left' | 'heavy_overhead' | 'thrust' | 'riposte' | 'slash_riposte' | 'heavy_riposte' | 'heavy_counter' | 'critical' | 'kick' | 'skill_witchfire' | 'skill_pommel'
  | 'skill_lunge' | 'skill_reaping' | 'skill_shove' | 'skill_jab' | 'skill_cleave' | 'skill_stomp' | 'skill_miasma' | 'skill_ironrush' | 'skill_hewer';
export type SkillId = 'witchfire' | 'pommel' | 'lunge' | 'reaping' | 'shove' | 'jab' | 'cleave' | 'stomp' | 'miasma' | 'ironrush' | 'hewer';   // the equipped skill (docs/briefs/skill-witch-arm.md): one per duel, fired by the SKILL action; null on a fighter = none (every opponent in V1)
// The move each skill fires: the one place a skill meets its MoveDef (duel.ts chooseMove, legal).
export const SKILL_MOVE: Record<SkillId, MoveId> = { witchfire: 'skill_witchfire', pommel: 'skill_pommel',
  lunge: 'skill_lunge', reaping: 'skill_reaping', shove: 'skill_shove', jab: 'skill_jab', cleave: 'skill_cleave', stomp: 'skill_stomp', miasma: 'skill_miasma', ironrush: 'skill_ironrush', hewer: 'skill_hewer' };
export type Direction = 'right' | 'left' | 'overhead' | 'thrust' | 'low';
export type Timing = { windup: number; active: number; recovery: number };
export const total = (t: Timing): number => t.windup + t.active + t.recovery;

// Baked blade trajectories: one immutable table per (authored clip, timing). scripts/bake-blades.mjs samples the rig at these
// timings; tests assert the shipped rig still agrees. `source` is the contact time inside the clip; `clip` is the rig animation.
export type PathId = 'light_right' | 'light_left' | 'light_right_chain' | 'light_left_chain' | 'heavy_overhead' | 'heavy_overhead_chain' | 'thrust' | 'riposte' | 'slash_riposte' | 'heavy_riposte';
export type PathSpec = Timing & { clip: 'Attack' | 'Return' | 'Heavy' | 'Riposte' | 'Trident_Thrust' | 'Trident_ThrustChain' | 'Trident_Sweep' | 'Trident_High' | 'Scythe_Reap' | 'Scythe_High' | 'Scythe_Thrust' | 'Scythe_Chain'; source: number };
export const PATHS: Record<PathId, PathSpec> = {
  // The cut: a horizontal arc (UAL2 Sword_Regular_A right-to-left, _B the backhand) with a real swing — 20 ticks of tell (333 ms) and an
  // 8-tick sweep. It was 14/5/21 (233 ms, under human reaction) on a fast diagonal flick: the owner read it as "too quick and shallow".
  light_right: { clip: 'Attack', source: .34, windup: 20, active: 8, recovery: 22 },
  light_left: { clip: 'Return', source: .34, windup: 20, active: 8, recovery: 22 },
  light_right_chain: { clip: 'Attack', source: .34, windup: 16, active: 8, recovery: 18 },
  light_left_chain: { clip: 'Return', source: .34, windup: 16, active: 8, recovery: 18 },
  heavy_overhead: { clip: 'Heavy', source: .48, windup: 32, active: 5, recovery: 31 },
  heavy_overhead_chain: { clip: 'Heavy', source: .48, windup: 22, active: 5, recovery: 31 },
  thrust: { clip: 'Riposte', source: .34, windup: 16, active: 5, recovery: 21 },
  slash_riposte: { clip: 'Attack', source: .34, windup: 12, active: 5, recovery: 19 },
  riposte: { clip: 'Riposte', source: .34, windup: 12, active: 5, recovery: 19 },
  heavy_riposte: { clip: 'Heavy', source: .48, windup: 20, active: 5, recovery: 25 },
};

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
};

const light = (id: 'light_right' | 'light_left', direction: Direction): MoveDef => ({
  id, direction, path: id, chainPath: `${id}_chain`, chained: { windup: 16, active: 8, recovery: 18 },
  chain: { window: 18, follow: [id === 'light_right' ? 'light_left' : 'light_right', 'heavy_overhead'] },   // the opposite cut chains fast; a heavy finisher winds up quicker
  windup: 20, active: 8, recovery: 22, damage: 14, stamina: 25, staminaDamage: 15, stagger: 24, poise: 0, poiseFrom: 0,   // 14 for 25 stamina: the cut's tell (333 ms) is longer than the stab's, so it pays and costs more (owner, 2026-09-16); ladder stab 11 < cut 14 < heavy 18
  breaksGuard: false, chip: 0, parryable: true, knockback: 4, stepIn: .4, feintUntil: 10, reach: 1.65, vsGuard: null, posture: 20, chamber: 9, charges: false,   // stepIn .4 over 20 ticks ≈ the old .55 over 14: the same lunge
});
// The SCOPE 8 skill template (the Pommel's shape) and the four timing rows a skill may copy; tests/skill-caps.test.ts holds each skill to one of them.
const LIGHT_TIMING: Timing = { windup: 20, active: 8, recovery: 22 }, LIGHT_CHAINED_TIMING: Timing = { windup: 16, active: 8, recovery: 18 };
const HEAVY_TIMING: Timing = { windup: 32, active: 5, recovery: 31 }, THRUST_TIMING: Timing = { windup: 16, active: 5, recovery: 21 }, KICK_TIMING: Timing = { windup: 18, active: 1, recovery: 25 };
const skill = (id: MoveId, timing: Timing, knobs: Pick<MoveDef, 'direction' | 'damage' | 'stagger' | 'staminaDamage' | 'posture' | 'knockback' | 'stepIn' | 'reach'> & Partial<MoveDef>): MoveDef => ({
  id, path: null, chainPath: null, chained: null, chain: null, ...timing, stamina: 40, poise: 0, poiseFrom: 0,
  breaksGuard: false, chip: .4, parryable: true, feintUntil: 0, vsGuard: null, chamber: null, charges: false, ...knobs,
});
export const MOVES: Record<MoveId, MoveDef> = {
  light_right: light('light_right', 'right'),
  light_left: light('light_left', 'left'),
  heavy_overhead: {
    id: 'heavy_overhead', direction: 'overhead', path: 'heavy_overhead', chainPath: 'heavy_overhead_chain', chained: { windup: 22, active: 5, recovery: 31 }, chain: null,
    windup: 32, active: 5, recovery: 31, damage: 18, stamina: 35, staminaDamage: 30, stagger: 24, poise: 24, poiseFrom: 24,
    breaksGuard: false, chip: .4, parryable: true, knockback: 4, stepIn: .55, feintUntil: 11, reach: 1.9, vsGuard: null, posture: 32, chamber: 10, charges: true,   // a guard takes it for chip and 40 stamina; only the charged swing breaks a guard. Feintable through the charge point
  },
  // Thrust: a lunge (stepIn 1 = walking pace) that lands from 2.0 m in 16 ticks, where a cut needs 1.75 m and a heavy 32 ticks; fully
  // blockable, so it is the spacing and counter-hit tool, not the guard opener.
  thrust: {
    id: 'thrust', direction: 'thrust', path: 'thrust', chainPath: null, chained: null, chain: null,
    windup: 16, active: 5, recovery: 21, damage: 11, stamina: 20, staminaDamage: 20, stagger: 20, poise: 0, poiseFrom: 0,   // 11 clean for 20 stamina (14 counter, 17 as the stop-hit): the fastest tell, the longest reach
    breaksGuard: false, chip: 0, parryable: true, knockback: 3, stepIn: 1, feintUntil: 9, reach: 2, vsGuard: null, posture: 16, chamber: 8, charges: false,
  },
  slash_riposte: {
    id: 'slash_riposte', direction: 'right', path: 'slash_riposte', chainPath: null, chained: null, chain: null,
    windup: 12, active: 5, recovery: 19, damage: 24, stamina: 20, staminaDamage: 0, stagger: 24, poise: 0, poiseFrom: 0,
    breaksGuard: true, chip: 0, parryable: true, knockback: 4, stepIn: .55, feintUntil: 6, reach: 1.65, vsGuard: null, posture: 0, chamber: null, charges: false,   // the parry already filled posture; the slash_riposte is the damage payoff, not a second one (two parries must not be a kill)
  },
  riposte: {
    id: 'riposte', direction: 'thrust', path: 'riposte', chainPath: null, chained: null, chain: null,
    windup: 12, active: 5, recovery: 19, damage: 24, stamina: 20, staminaDamage: 0, stagger: 24, poise: 0, poiseFrom: 0,
    breaksGuard: true, chip: 0, parryable: true, knockback: 4, stepIn: .55, feintUntil: 6, reach: 1.65, vsGuard: null, posture: 0, chamber: null, charges: false,   // the parry already filled posture; the riposte is the damage payoff, not a second one (two parries must not be a kill)
  },
  heavy_riposte: {   // the heavy answer to a successful parry: slower and costlier than the thrust, but it breaks a guard raised in panic
    id: 'heavy_riposte', direction: 'overhead', path: 'heavy_riposte', chainPath: null, chained: null, chain: null,
    windup: 20, active: 5, recovery: 25, damage: 30, stamina: 35, staminaDamage: 0, stagger: 24, poise: 0, poiseFrom: 0,
    breaksGuard: true, chip: 0, parryable: true, knockback: 4, stepIn: .55, feintUntil: 6, reach: 1.9, vsGuard: null, posture: 0, chamber: null, charges: false,   // as the riposte: no posture on top of the parry's
  },
  heavy_counter: {   // guard counter: a heavy thrown straight out of a block. Fast and armoured against lights; shares the heavy riposte's baked path and timing.
    id: 'heavy_counter', direction: 'overhead', path: 'heavy_riposte', chainPath: null, chained: null, chain: null,
    windup: 20, active: 5, recovery: 25, damage: 20, stamina: 30, staminaDamage: 0, stagger: 30, poise: 24, poiseFrom: 4,
    breaksGuard: true, chip: 0, parryable: true, knockback: 4, stepIn: .55, feintUntil: 6, reach: 1.9, vsGuard: null, posture: 30, chamber: null, charges: false,
  },
  // Critical: the earned hit on a broken posture — Heavy inside the critical window. Unparryable, armoured, twice a heavy's damage.
  critical: {
    id: 'critical', direction: 'overhead', path: 'heavy_riposte', chainPath: null, chained: null, chain: null,
    windup: 20, active: 5, recovery: 25, damage: 40, stamina: 25, staminaDamage: 0, stagger: 40, poise: 30, poiseFrom: 0,
    breaksGuard: true, chip: 0, parryable: false, knockback: 6, stepIn: .55, feintUntil: 0, reach: 1.9, vsGuard: null, posture: 0, chamber: null, charges: false,
  },
  kick: {
    id: 'kick', direction: 'low', path: null, chainPath: null, chained: null, chain: null,
    windup: 18, active: 1, recovery: 25, damage: 4, stamina: 25, staminaDamage: 15, stagger: 18, poise: 0, poiseFrom: 0,
    breaksGuard: false, chip: 0, parryable: false, knockback: 6, stepIn: .55, feintUntil: 0, reach: 1.2, vsGuard: { stagger: 48, staminaDamage: 45 }, posture: 24, chamber: null, charges: false,
    // vsGuard.stagger 48 (was 36; Dom, 2026-09-24): the kick that opens a guard must be punishable. The kicker's first legal
    // attack plus every player weapon's fastest contact (the thrust; cleaver/warhammer/maul the slowest) now lands at least
    // 3 ticks inside the stagger against every opponent. At 36 the stagger ended 2–9 ticks before that contact. Symmetric:
    // an opponent's kick on your guard stuns you as long. Pinned in tests/duel.test.ts ('the kick that opens a guard...').
  },
  // SKILL 1, the Witch's arm (docs/briefs/skill-witch-arm.md (a); every number *prop* until Combat's battery): a palm cast from the grafted arm.
  // A 40-tick tell (longer than any heavy's 36) and a 40-tick recovery (the whiff is the punish); blockable, guardable and parryable like a heavy
  // (Strategy ruling 1). A cone like the kick (path null: reach 1.2, RULES.kickArc), so it needs no blade table. Damage 26 flat on every weapon
  // (ruling 2). Committed: no chamber, no charge, no feint, no step-in (she stands and casts). Cooldown RULES.skillCooldown, spent at commitment.
  // chainPath, chained and vsGuard: the brief is silent, so the thrust's (null). Every weapon's table shares this one entry, as the kick;
  // the per-weapon modifier rows (brief (c): reach, arc, side, chain, knockback) are not V1.
  skill_witchfire: {
    id: 'skill_witchfire', direction: 'thrust', path: null, chainPath: null, chained: null, chain: null,
    windup: 40, active: 6, recovery: 40, damage: 26, stamina: 40, staminaDamage: 30, stagger: 30, poise: 24, poiseFrom: 30,
    breaksGuard: false, chip: .4, parryable: true, knockback: 8, stepIn: 0, feintUntil: 0, reach: 1.2, vsGuard: null, posture: 40, chamber: null, charges: false,
  },  // The hero's day-one skill, Pommel Strike (Dom, 2026-09-25: "Hero starts with Pommel Strike; one skill slot; a take swaps it"). A short hilt
  // bash to the face: a cone like the kick (path null), reach 1.3 — arm's length, under the thrust's 2.0. Heavy-class damage (20: over the
  // heavy's 18 and over every opponent's poise, max 16, so it staggers them all); the Witch-fire's stamina (40); RULES.skillCooldown.
  // Blockable (chip as a heavy) and parryable. THE POINT is `stagger`: 50 ticks of the existing hurt state on a clean hit, and no knockback,
  // so the foe stays in reach. What is left of the active window, the recovery and a light's wind-up (3 + 18 + 20 = 41 ticks) all fit inside
  // those 50: a follow-up light lands before he recovers (tests/skill-pommel.test.ts). Committed: no chamber, charge or feint.
  // A different pick changes only this entry, SKILLS in loot.ts, and those tests.
  skill_pommel: {
    id: 'skill_pommel', direction: 'thrust', path: null, chainPath: null, chained: null, chain: null,
    windup: 18, active: 4, recovery: 18, damage: 20, stamina: 40, staminaDamage: 30, stagger: 50, poise: 0, poiseFrom: 0,
    breaksGuard: false, chip: .4, parryable: true, knockback: 0, stepIn: .55, feintUntil: 0, reach: 1.3, vsGuard: null, posture: 24, chamber: null, charges: false,
  },
  // SCOPE 8: the nine opponents' moves, a kill's second take (docs/SCOPE.md item 8; Combat's rows, Strategy's ruling 2026-09-26).
  // Each copies an existing row's windup/active/recovery unchanged; only the effect knobs differ. Every one is a Pommel-template
  // skill (path null: a cone of `reach` × RULES.kickArc; stamina 40; parryable; no chamber, charge or feint) and shared by every
  // weapon. The caps, pinned in tests/skill-caps.test.ts: damage ≥ 18 (≥ the heavy, and over every opponent's poise, max 16, so a
  // hero's take staggers them all); worst stun (counter × rear) short of a guaranteed follow-up light (only the Pommel owns that);
  // punishable on a block by the hero's 16-tick thrust with ≥ 9 ticks to spare.
  skill_shove: skill('skill_shove', KICK_TIMING, { direction: 'thrust', damage: 18, stagger: 22, staminaDamage: 30, posture: 24, knockback: 14, stepIn: 0, reach: 1.3 }),   // the Centurion's Scutum Shove: 14 ticks of shove (the kick's 6), into the wall's second impact. stepIn 0 (Strategy 07:24): with the thrust's lunge it reached a Goblin who never blocks every cooldown (estoc 18/24 → 11)
  skill_cleave: skill('skill_cleave', HEAVY_TIMING, { direction: 'overhead', damage: 22, stagger: 28, staminaDamage: 60, posture: 32, knockback: 4, stepIn: .55, reach: 1.6 }),   // the Pitborn's: staminaDamage = RULES.breakCost, so a guard below 60 cannot pay the block and breaks (ruled instead of breaksGuard)
  skill_jab: skill('skill_jab', LIGHT_CHAINED_TIMING, { direction: 'thrust', damage: 18, stamina: 30, stagger: 20, staminaDamage: 20, posture: 16, knockback: 2, stepIn: .4, reach: 1 }),   // the Goblin's Dirty Jab: the chained light's 16-tick windup, the fastest light timing; reach 1.0, inside arm's length (battery: at 1.3 the estoc's follow-up made it 15/24 on the Goblin → 6)
  skill_lunge: skill('skill_lunge', THRUST_TIMING, { direction: 'thrust', damage: 11, stagger: 0, staminaDamage: 0, posture: 20, knockback: 3, stepIn: 1, reach: 2.4 }),   // the Nightborn's Estoc Lunge (RV15, Strategy 2026-09-26: damage 20 -> 11, stagger 22 -> 0, staminaDamage 30 -> 0; the landed cast farmed the Goblin, who never blocks: 434/480 v Pommel 226 at 480 seeds; d11 reads 241/480 there, under Pommel + 40 = 266 by more than one sd; d12 253 does not): the longest reach (the estoc's thrust is 2.3); stepIn the thrust's 1, never faster than a backstep
  skill_reaping: skill('skill_reaping', HEAVY_TIMING, { direction: 'right', damage: 28, stagger: 28, chip: .6, staminaDamage: 40, posture: 32, knockback: 6, stepIn: 0, reach: 2, poise: 24, poiseFrom: 24 }),   // the Executioner's Reaping Blow: the nine's top damage and chip; the heavy's own armour. stepIn 0 (Strategy 07:24): estoc on the Goblin 15/24 → 11
  skill_stomp: skill('skill_stomp', HEAVY_TIMING, { direction: 'low', damage: 18, stagger: 24, staminaDamage: 30, posture: 50, knockback: 4, stepIn: 0, reach: 1.4 }),   // the Dwarf's Anvil Stomp: the top posture; low, so the low guard is the read
  skill_miasma: skill('skill_miasma', HEAVY_TIMING, { direction: 'thrust', damage: 18, stagger: 20, staminaDamage: 50, posture: 24, knockback: 0, stepIn: 0, reach: 1.2 }),   // the Plague Doctor's: a one-tick cone like the Witch-fire; a path-null move drains staminaDamage on a clean hit too (duel.ts)
  skill_ironrush: skill('skill_ironrush', THRUST_TIMING, { direction: 'thrust', damage: 10, stagger: 0, staminaDamage: 0, posture: 20, knockback: 3, stepIn: 1, reach: 2, poise: 24, poiseFrom: 8 }),   // the Knight's (RV15: damage 20 -> 10, stagger 22 -> 0, staminaDamage 30 -> 0, the same Goblin farm as the Lunge; estoc v Goblin 242/480 against Pommel + 40 = 266; the poise is its identity and stays): armoured from tick 8 against every plain blow (a light's stagger 24 equals a heavy's; the guard counter, critical and skills get through)
  skill_hewer: skill('skill_hewer', LIGHT_TIMING, { direction: 'right', damage: 18, stagger: 24, chip: 1, staminaDamage: 20, posture: 20, knockback: 4, stepIn: .4, reach: 1.4 }),   // the Shieldmaiden's Shield-Hewer: all of it through an ordinary block; a perfect block, parry or evade stops it. A side cut, not an overhead (Strategy 07:16): a shaft guard (heavyBreaks) breaks on any overhead, and a light-timed skill must never break one outright
};
// Every opponent's skill row, carried by every weapon table as the kick and the Witch-fire are.
const OPPONENT_SKILLS = { skill_lunge: MOVES.skill_lunge, skill_reaping: MOVES.skill_reaping, skill_shove: MOVES.skill_shove, skill_jab: MOVES.skill_jab, skill_cleave: MOVES.skill_cleave, skill_stomp: MOVES.skill_stomp, skill_miasma: MOVES.skill_miasma, skill_ironrush: MOVES.skill_ironrush, skill_hewer: MOVES.skill_hewer };

export const RULES = {
  health: 150,                    // a duel of 8–15 blows (the owner's target): 150 with the 40/s regeneration measured 10 hits / 38 s at normal in review
  draw: 42, roll: 36, safeStart: 4, safeEnd: 20, rollCost: 30,
  // Backstep: a short positional evade with no invulnerability. speed 1 = walking pace, so 12 ticks travel 0.6 m; its tail can be
  // cancelled into an attack, and holding the dodge control converts it into a roll for the price difference.
  backstep: { ticks: 12, speed: 1, cost: 10, cancelFrom: 8 },
  dodgeAttackWindow: 2,   // a light started this soon after an evade (or from a backstep's tail) uses its chained timing
  // perfectBlock: a block in the first ticks of a held guard costs perfectBlockCost of the normal price.
  // breakCost: a broken guard loses this much stamina (not all of it): from a full bar the defender keeps one roll to escape the follow-up.
  feintBeat: 10, parry: 10, parryCooldown: 30, parryStun: 90, parryRecovery: 8, feintCost: 10, blockCost: 25, breakCost: 60, perfectBlock: 3, perfectBlockCost: .5, guardSpeed: .35, guardArc: Math.PI / 3, directionalGuard: true,   // owner 2026-09-20: five sides on the Guard button (duel.ts covers()); null = straight = thrust
  // Special Moves (Dom 2026-09-29 via Strategy / Lead; Combat): the SKILL slot's rule when a fighter carries `specialShare` (duel.ts withSpecials).
  // A committed windup (2 s at 60 Hz: no guard, roll or parry, blows land normally; damage taken during it adds up and at `interruptAt` of his max health the cast is cut (no strike, no recovery, `interruptCooldown` instead of `cooldown`; docs/specs/combat/interruptible-windups.md)), then an unblockable, undodgeable
  // hit for `damage` of the target's max health (`bossDamage` for an opponent from level `bossFrom`: career.ts level = 1 + wins, five
  // sub-ranks a title, so rank 8 begins at 36). Cast inside `reach`; the cooldown re-arms `cooldown` ticks after the RELEASE; first available `first` ticks in; after a release the caster starts no attack for `recovery` ticks (the presentation's 45; defence and movement stay his). Final numbers: Dom 2026-10-01, docs/briefs/specials/boss-special-balance-2026-10-01.md. One row,
  // so a ruling is a one-line change; PvP reads the same `damage`.
  gambit: { stagger: 40 },   // RV33: the ticks a failed Gambit's thrower is staggered (src/fight/gambit.ts: about 1 in 2 lands for 2x; the stagger is what makes it slightly worse than a heavy)
  special: { windup: 120, cooldown: 1200, first: 1200, recovery: 45, reach: 3, damage: .2, bossDamage: .25, bossFrom: 36, interruptAt: .1, interruptCooldown: 480 },
  skillCooldown: 900,   // the equipped skill's cooldown (15 s): spent at commitment, so a whiff, a block, a parry and a stuffed windup all spend it; ticks down like parryCooldown (duel.ts)
  regen: 2 / 3, regenDelay: 45, guardRegen: .5, sprintCost: .2, exhaustRecover: 20, exhaustedStun: 36,   // RV29 (3B): a heavy-class blow or a kick landing on an exhausted fighter stuns `exhaustedStun` ticks (.6 s) longer; the existing hurt pose, no ground state
   exhaustedSpeed: .7,   // 40 stamina/s after .75 s; a raised guard regenerates at half rate
  wound: 240, woundRegen: .8, death: 144, kickArc: Math.PI / 4,
  // Counter-hit: a clean hit on a fighter committed to a swing, or in the vulnerable tail of a roll, lands harder and staggers longer.
  // Rear hit: a modest bonus for striking inside the target's rear arc; a true backstab is earned later under stricter conditions.
  counter: { damage: 1.25, stagger: 1.5 }, rear: { arc: Math.PI / 2, damage: 1.25, stagger: 1.25, posture: 1.5, downed: 1.5 },   // RV29 (item 4): damage 1.15 -> 1.25; `posture` multiplies the rear hit's posture; `downed` is the rear hit's TOTAL damage multiplier on a hurt (staggered or posture-broken) target, replacing `damage`, not stacked (Lead, Dom's option C)
  guardCounter: 20,   // ticks after a block in which Heavy becomes the guard counter; any attack consumes the window
  // Posture (Sekiro-style): blocks, clean hits and being parried fill it; it drains while the fighter is not staggered. Full = a posture
  // break: a long stagger and a critical window in which the opponent's Heavy is the `critical` move. A guard break resets it (that was the payoff).
  posture: { max: 100, decay: .2, hold: 60, stun: 90, parry: 25, perfect: .5, bloodied: .3, bloodiedDecay: .5 },   // RV29 (Dom 2026-10-07): hold 45 -> 60; a fighter under `bloodied` of his max health drains posture at `bloodiedDecay` of the speed (2C)   // slice Q: the drain pauses `hold` ticks after any gain, so a run of blocks can reach a break; swept to ~one break per two duels at normal
  // The ring wall: knockback that meets the wall adds stagger and posture (the wall hits back); a fighter with the wall at its back cannot
  // backstep. `edge` is how close to RADIUS counts as at the wall.
  // `raise`/`raiseAgain`: how many ticks before the lash the lorarius lifts his whip (`WhipRaised`) — longer before the first lash than
  // before a repeat, because the first is a warning and the rest are a rhythm. Presentation scales its raise animation by the event's
  // `lead`, so retuning these moves the tell without a change in the world lane.
  // Anti-turtling (owner 2026-09-21, "both 1 and 2"): the lorarii. A fighter within `loiter.band` of the wall for `loiter.ticks` without
  // attacking is whipped — `chip` health (never the last point), `posture`, and a `shove` back into the fight (toward an opponent within
  // `into` metres, else toward the centre) — and the lorarii keep at it:
  // the next lash comes `again` ticks later while he stays in the band (posture stacks toward a break). Attacking or leaving the band
  // resets the clock. Both fighters: the warden cannot camp the wall either.
  wall: { edge: .25, stagger: 12, posture: 15, loiter: { band: 1, ticks: 180, again: 60, chip: 3, posture: 15, shove: .6, into: 2, raise: 60, raiseAgain: 30 } },
  // Anti-turtling 2: no rest at the wall. A tick that opens the gap to the opponent by more than `away` metres (a walk straight back is .05
  // at 3 m/s; strafing is ~0) while the fighter is inside the wall band (`wallOnly`, the same `wall.loiter.band`) regenerates no stamina;
  // regen resumes the tick he stops, strafes or advances. The band form is the owner's choice: the everywhere form broke the rung pins
  // (the numbers are in docs/state/combat.md, Anti-turtling). Set `wallOnly: false` to try it.
  retreat: { away: .02, wallOnly: true },
  // Attrition: every blade wound takes `stamina` off the wounded fighter's maximum for the duel (floor `floor`); a leg wound slows walking by `legSpeed`.
  attrition: { stamina: 8, floor: 40, legSpeed: .85 },
  // The thrust as the stop-hit: into a swinging opponent, or one that has walked `walk` metres onto the point since the thrust started, it
  // counter-hits harder than a cut would; a thrust that meets nothing overextends and recovers `whiff` ticks longer.
  stopHit: { damage: 1.5, stagger: 1.75, whiff: 10, walk: .3 },   // walk: how far the target must have come on since the thrust started to count as walking onto it
  // Chamber and charge: a held swing pauses at its move's `chamber` tick (the load is the tell) for at most `max` ticks; a move that
  // `charges` gains hyper-armour there and, after `min` held ticks, swings for the multiplied damage and stagger and breaks a standing
  // guard. A tap never holds; a heavy press must last chamber + min ticks (0.67 s) to charge, so a hold and a quick press differ.
  charge: { min: 30, max: 54, damage: 1.5, stagger: 1.5 },
  bufferWindow: 10, bufferTtl: 11, stepInFrom: 3, turnStart: .3, turnWindup: .25,
  location: { head: 1, torso: 1, legs: 1 } as Record<'head' | 'torso' | 'legs', number>,
} as const;

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
export type WeaponId = 'longsword' | 'trident' | 'cleaver' | 'estoc' | 'knife' | 'gladius' | 'scythe' | 'maul' | 'reaper' | 'warhammer' | 'bite';
export type Material = 'iron' | 'bronze' | 'wood' | 'steel';   // steel: the estoc — thin and bright to the ear, not the longsword's iron (the Nightborn brief)
export type Grip = 'one-hand' | 'two-hand';   // how many hands the weapon needs. DATA ONLY: nothing in the sim reads it, no reach/timing/damage
// depends on it, and no fairness row moves with it. The Veteran shield's stow logic reads it (a two-hander stows the shield to the back, a
// one-hander brings it up) — the shield brief's field, added here 2026-09-22 so it rides the batch's RECORD_VERSION bump instead of paying a second.
export type Weapon = { id: WeaponId; moves: Record<MoveId, MoveDef>; paths: Record<PathId, PathSpec>; guard: 'blade' | 'shaft'; material: Material; reach: number; grip: Grip; placeholder?: true;
  guardProfile?: Partial<GuardProfile>;   // how this weapon's guard takes a blow (absent = the longsword defaults in RULES)
  fight: { thrustShare: number; close: number };   // the warden's stance with it: share of non-cut openers that are thrusts (the first is always a heavy); the gap it closes to for a cut or a heavy
};
export const LONGSWORD: Weapon = { id: 'longsword', moves: MOVES, paths: PATHS, guard: 'blade', material: 'iron', reach: MOVES.thrust.reach, grip: 'two-hand', fight: { thrustShare: .2, close: 1.15 } };   // the thrust's real job is the stop-hit, so it is a minority opener

// ── Trident (weapons lane, 2026-09-16): the Veteran's short trident, a different fight from the longsword — reach and thrusts, weak
// inside the point. Rig: src/assets/veteran.glb, built with WARRIOR_WEAPON=trident (WeaponDrawn, contact = the tines). The move ids keep the
// game's button grammar: Slash = the low sweep (one clip, both sides), Stab = the thrust (it chains into a second thrust), Heavy =
// the overhead pin; riposte / counter / critical ride the thrust-chain and pin paths. The clips only fix where the contact key sits
// (.34, pin .48). initialDuel gives the Veteran this table; the reaches are the measured landing frontiers (tests/weapons.test.ts,
// ±0.1 m) and the balance is pinned by the battery (tests/battery.test.ts).
export const TRIDENT_PATHS: Record<PathId, PathSpec> = {
  light_right: { clip: 'Trident_Sweep', source: .34, windup: 22, active: 8, recovery: 24 },        // low sweep: a 1.9 m pole tells longer than a cut
  light_left: { clip: 'Trident_Sweep', source: .34, windup: 22, active: 8, recovery: 24 },
  light_right_chain: { clip: 'Trident_Sweep', source: .34, windup: 18, active: 8, recovery: 20 },
  light_left_chain: { clip: 'Trident_Sweep', source: .34, windup: 18, active: 8, recovery: 20 },
  heavy_overhead: { clip: 'Trident_High', source: .48, windup: 34, active: 5, recovery: 33 },       // the pin: slower and heavier than the sword's heavy
  heavy_overhead_chain: { clip: 'Trident_High', source: .48, windup: 24, active: 5, recovery: 33 },
  thrust: { clip: 'Trident_Thrust', source: .34, windup: 16, active: 5, recovery: 23 },            // the sword stab's tell, a longer recovery: the pole comes back
  slash_riposte: { clip: 'Trident_Sweep', source: .34, windup: 12, active: 5, recovery: 19 },
  riposte: { clip: 'Trident_ThrustChain', source: .34, windup: 12, active: 5, recovery: 19 },      // the second thrust, from half-withdrawn; also the riposte
  heavy_riposte: { clip: 'Trident_High', source: .48, windup: 22, active: 5, recovery: 27 },
};
const sweep = (id: 'light_right' | 'light_left'): MoveDef => ({
  ...MOVES[id], direction: 'low', path: id, chainPath: `${id}_chain`, chained: { windup: 18, active: 8, recovery: 20 },
  chain: { window: 18, follow: [id === 'light_right' ? 'light_left' : 'light_right', 'thrust'] },   // sweep, sweep, or a sweep into the thrust
  windup: 22, active: 8, recovery: 24, damage: 12, stamina: 25, staminaDamage: 15, stagger: 26, knockback: 5, stepIn: .3, feintUntil: 11, reach: 1.75, posture: 18, chamber: 10,   // lands to 1.75 m measured (the cut: 1.7): a short pole's low sweep
});
const TRIDENT_MOVES: Record<MoveId, MoveDef> = {
  light_right: sweep('light_right'),
  light_left: sweep('light_left'),
  heavy_overhead: { ...MOVES.heavy_overhead, chained: { windup: 24, active: 5, recovery: 33 }, windup: 34, active: 5, recovery: 33, damage: 20, stamina: 38, staminaDamage: 35, chip: .5, stepIn: .45, feintUntil: 12, reach: 2.15, posture: 36, chamber: 11 },
  // Thrust: the trident's identity. Lands from 2.25 m against a standing target (the sword's stab from 2.0; measured, tests/weapons.test.ts)
  // on the stab's 16-tick tell and lunge, and chains into a second, faster thrust; parryable and fully blockable, as the stab is.
  // "Weak inside the point" is NOT in these numbers: the sim sweeps the tines from the wind-up pose, so a thrust lands from 0.4 m
  // like the sword's — a whiff inside ~1 m needs a rule (artifacts/weapons/REQUESTS.md), which is the combat lane's call.
  thrust: { ...MOVES.thrust, chainPath: 'riposte', chained: { windup: 12, active: 5, recovery: 19 }, chain: { window: 16, follow: ['thrust'] }, windup: 16, active: 5, recovery: 23, damage: 12, stamina: 22, staminaDamage: 22, stagger: 20, stepIn: 1, reach: 2.25, minReach: 1, posture: 16, chamber: 8 },   // minReach: a thrust started inside 1 m (bodies stand no closer than .85) drives the point past the target and meets nothing; the sweep and the kick have no such hole
  slash_riposte: { ...MOVES.slash_riposte, windup: 12, active: 5, recovery: 19, direction: 'low', reach: 1.75 },
  riposte: { ...MOVES.riposte, windup: 12, active: 5, recovery: 19, reach: 2.1 },
  heavy_riposte: { ...MOVES.heavy_riposte, windup: 22, active: 5, recovery: 27, reach: 2.15 },
  heavy_counter: { ...MOVES.heavy_counter, windup: 22, active: 5, recovery: 27, reach: 2.15 },
  critical: { ...MOVES.critical, windup: 22, active: 5, recovery: 27, reach: 2.15 },
  kick: MOVES.kick,
  skill_witchfire: MOVES.skill_witchfire,
  skill_pommel: MOVES.skill_pommel,
  ...OPPONENT_SKILLS,
};
// The shaft guard pays 15 % more for every block and a plain overhead heavy breaks it (the blade guard
// only breaks to a charged one); the Veteran opens with the thrust three times in five and closes to sweep range, not the sword's cutting range.
export const TRIDENT: Weapon = { id: 'trident', moves: TRIDENT_MOVES, paths: TRIDENT_PATHS, guard: 'shaft', material: 'bronze', reach: TRIDENT_MOVES.thrust.reach, grip: 'two-hand', guardProfile: { costScale: 1.15, heavyBreaks: true }, fight: { thrustShare: .6, close: 1.4 } };

// ── Cleaver (weapons lane, 2026-09-16): the Pitborn's. "A fat scythe-type cleaver, wider and the same length as the longsword" (owner):
// it rides the LONGSWORD'S CLIP FAMILY (Attack / Return / Heavy / Riposte on its own rig, src/assets/weapons/cleaver/veteran-cleaver.glb,
// WeaponDrawn, contact = the edge .14–.86) so the renderer needs nothing new. What the single edge does to the sword's moves, measured
// from the bake (artifacts/weapons/tools/edge-check.mjs): the forehand cut leads with the edge → the CHOP; the backhand leads with the
// spine → the BACK OF THE CLEAVER, a blunt hammer blow (less damage, more stagger and posture); the overhead is re-keyed on the cleaver's
// rig as a diagonal HACK so its edge leads (the sword's straight overhead comes down flat); the thrust is a clumsy POKE. Slower tells,
// longer recoveries, more damage and chip: a brute's weapon. Lunges (stepIn × wind-up) equal the sword's so the Pitborn's whiff window
// (tests/opponents.test.ts: a 12-tick backstep escapes his swing and the punish lands) survives; `reach` follows the SWORD's convention —
// the warden's conservative spacing estimate (cut 1.65 / heavy 1.9 / stab 2.0), not the measured frontier (1.7 / 2.2 / 2.05), so he
// spaces like the man the seam was tuned against.
export const CLEAVER_PATHS: Record<PathId, PathSpec> = {
  light_right: { clip: 'Attack', source: .34, windup: 22, active: 8, recovery: 26 },        // the chop: 2 ticks more tell than the cut, a longer recovery
  light_left: { clip: 'Return', source: .34, windup: 22, active: 8, recovery: 26 },         // the back of the cleaver
  light_right_chain: { clip: 'Attack', source: .34, windup: 18, active: 8, recovery: 22 },
  light_left_chain: { clip: 'Return', source: .34, windup: 18, active: 8, recovery: 22 },
  heavy_overhead: { clip: 'Heavy', source: .48, windup: 36, active: 6, recovery: 36 },      // the hack (the cleaver rig's own Heavy keys)
  heavy_overhead_chain: { clip: 'Heavy', source: .48, windup: 26, active: 6, recovery: 36 },
  thrust: { clip: 'Riposte', source: .34, windup: 18, active: 5, recovery: 26 },            // the poke
  slash_riposte: { clip: 'Attack', source: .34, windup: 12, active: 5, recovery: 21 },
  riposte: { clip: 'Riposte', source: .34, windup: 12, active: 5, recovery: 21 },
  heavy_riposte: { clip: 'Heavy', source: .48, windup: 22, active: 6, recovery: 29 },
};
const CLEAVER_MOVES: Record<MoveId, MoveDef> = {
  light_right: { ...MOVES.light_right, chained: { windup: 18, active: 8, recovery: 22 }, chain: { window: 18, follow: ['light_left', 'heavy_overhead'] },
    windup: 22, active: 8, recovery: 26, damage: 17, stamina: 28, staminaDamage: 24, stagger: 26, chip: .2, knockback: 5, stepIn: .36, feintUntil: 11, posture: 26, chamber: 10, reach: 1.65 },   // the chop: some of it comes through a guard. stepIn .36 over 22 ticks = the cut's lunge over 20 (the Pitborn's whiff window — a 12-tick backstep escapes it — is tuned to that distance)
  light_left: { ...MOVES.light_left, chained: { windup: 18, active: 8, recovery: 22 }, chain: { window: 18, follow: ['light_right', 'heavy_overhead'] },
    windup: 22, active: 8, recovery: 26, damage: 9, stamina: 24, staminaDamage: 30, stagger: 32, chip: 0, knockback: 6, stepIn: .36, feintUntil: 11, posture: 34, chamber: 10, reach: 1.65 },   // the back of the cleaver: a hammer — little damage, a lot of posture, hard on a guard
  heavy_overhead: { ...MOVES.heavy_overhead, chained: { windup: 26, active: 6, recovery: 36 }, windup: 36, active: 6, recovery: 36, damage: 26, stamina: 42, staminaDamage: 45, stagger: 30, poise: 24, poiseFrom: 22, chip: .5, stepIn: .48, feintUntil: 12, posture: 42, chamber: 12, reach: 1.9 },   // the hack: stepIn .48 over 36 ticks = the heavy's lunge over 32
  thrust: { ...MOVES.thrust, windup: 18, active: 5, recovery: 26, damage: 7, stamina: 18, staminaDamage: 14, stagger: 14, stepIn: .87, feintUntil: 9, posture: 10, chamber: 9, reach: 2 },   // the poke: a cleaver is no stabbing weapon. stepIn .87 over 18 ticks = the stab's lunge over 16
  slash_riposte: { ...MOVES.slash_riposte, windup: 12, active: 5, recovery: 21, damage: 28, reach: 1.65 },
  riposte: { ...MOVES.riposte, windup: 12, active: 5, recovery: 21, damage: 28, reach: 1.65 },
  heavy_riposte: { ...MOVES.heavy_riposte, windup: 22, active: 6, recovery: 29, damage: 34, reach: 1.9 },
  heavy_counter: { ...MOVES.heavy_counter, windup: 22, active: 6, recovery: 29, damage: 24, reach: 1.9 },
  critical: { ...MOVES.critical, windup: 22, active: 6, recovery: 29, damage: 46, reach: 1.9 },
  kick: MOVES.kick,
  skill_witchfire: MOVES.skill_witchfire,
  skill_pommel: MOVES.skill_pommel,
  ...OPPONENT_SKILLS,
};
export const CLEAVER: Weapon = { id: 'cleaver', moves: CLEAVER_MOVES, paths: CLEAVER_PATHS, guard: 'blade', material: 'iron', reach: CLEAVER_MOVES.thrust.reach, grip: 'one-hand', fight: { thrustShare: .1, close: 1.15 } };   // the poke is a rare opener (one non-cut opener in ten); he closes to the sword's cutting range for his chops
// ── Knife (weapons lane, 2026-09-17): the goblin's short hooked knife — a sica (forward grip, inward hook, double-edged over the hook) on
// the goblin's own re-proportioned rig, src/assets/goblin.glb (WeaponDrawn, contact = the blade .12–.52; 0.81× in his
// hand → a 0.42 m blade). The sword's clip family (only Heavy re-keyed as the diagonal hack, as the cleaver's). Timings are the character
// lane's proposal (artifacts/character/BRIEF-goblin.md): wind-up ≥ 12 ticks everywhere (the readability rule), feints = the first ~40 % of
// the wind-up, damage and cost below a sword's. Measured from his rig with these timings (artifacts/weapons/REPORT.md): the slash lands to
// 1.2 m, the stab 1.45, the hack 1.55 (the sword: 1.7 / 2.0 / 2.2) — `reach` is that frontier; the combat lane sets his stance, his knobs (feint rate, guard share 0, back-step
// after landing, circling, regen) and the battery. Forward grip only: a reverse grip never lands on the sword's clips (docs/state/combat.md).
export const KNIFE_PATHS: Record<PathId, PathSpec> = {
  light_right: { clip: 'Attack', source: .34, windup: 14, active: 6, recovery: 16 },
  light_left: { clip: 'Return', source: .34, windup: 14, active: 6, recovery: 16 },
  light_right_chain: { clip: 'Attack', source: .34, windup: 12, active: 6, recovery: 14 },
  light_left_chain: { clip: 'Return', source: .34, windup: 12, active: 6, recovery: 14 },
  heavy_overhead: { clip: 'Heavy', source: .48, windup: 22, active: 5, recovery: 26 },
  heavy_overhead_chain: { clip: 'Heavy', source: .48, windup: 16, active: 5, recovery: 26 },
  thrust: { clip: 'Riposte', source: .34, windup: 12, active: 4, recovery: 20 },   // recovery follows KNIFE_MOVES.thrust (15 -> 20, 2026-09-22): the clip retime is presentation, but a path shorter than the move leaves the stab looking recovered while the sim still holds him
  slash_riposte: { clip: 'Attack', source: .34, windup: 12, active: 4, recovery: 15 },
  riposte: { clip: 'Riposte', source: .34, windup: 12, active: 4, recovery: 15 },
  heavy_riposte: { clip: 'Heavy', source: .48, windup: 16, active: 5, recovery: 20 },
};
const slash = (id: 'light_right' | 'light_left'): MoveDef => ({
  ...MOVES[id], chained: { windup: 12, active: 6, recovery: 14 }, chain: { window: 14, follow: [id === 'light_right' ? 'light_left' : 'light_right', 'thrust', 'heavy_overhead'] },
  windup: 14, active: 6, recovery: 16, damage: 10, stamina: 18, staminaDamage: 10, stagger: 18, chip: 0, knockback: 2, stepIn: .4, feintUntil: 6, posture: 14, chamber: 6, reach: 1.2,
});
const KNIFE_MOVES: Record<MoveId, MoveDef> = {
  light_right: slash('light_right'),
  light_left: slash('light_left'),   // the backhand: the hook's outer edge is sharpened, so it cuts too (a rip)
  heavy_overhead: { ...MOVES.heavy_overhead, chained: { windup: 16, active: 5, recovery: 26 }, windup: 22, active: 5, recovery: 26, damage: 14, stamina: 26, staminaDamage: 20, stagger: 20, poise: 0, poiseFrom: 0, chip: .2, knockback: 3, stepIn: .55, feintUntil: 8, posture: 24, chamber: 7, reach: 1.55 },
  // Recovery 20, not the 15 it shipped with (weapons lane, 2026-09-22). The wind-up stays 12 — the fastest tell in the game and the floor
  // his brief sets for readability — so the stab still FEELS like a knife; what changes is that a whiffed poke is now punishable. At 15 it
  // was not: "thrust from range" beat the Veteran 18/24 and the Goblin 15/24 (caps 12) by poking and being home before either could answer.
  // 20 is the ONLY value that clears both rows with margin AND keeps the Goblin's own fight-length pin (he wields this knife): 15 -> rows
  // 18F/15F, median 42.8 s; 16 -> 8/12, median 47.5 OVER; 17 -> 10/13F; 18 -> 8/11, median 44.7; 19 -> 5/16F; 20 -> 5/6, median 44.6;
  // 21 -> 3/4, median 48.5 OVER. Wind-up is the wrong lever and was measured as such (13 -> 22/19, 14 -> 24/24, 15 -> 1/23, 16 -> 2/24):
  // it shifts the tell in and out of each warden's read window, non-monotonically. Total commitment 12+20 = 32 still undercuts the sword's 37.
  thrust: { ...MOVES.thrust, windup: 12, active: 4, recovery: 20, damage: 9, stamina: 14, staminaDamage: 12, stagger: 14, knockback: 2, stepIn: 1, feintUntil: 5, posture: 12, chamber: 5, reach: 1.45 },
  slash_riposte: { ...MOVES.slash_riposte, windup: 12, active: 4, recovery: 15, damage: 18, stamina: 16, feintUntil: 5, reach: 1.2 },
  riposte: { ...MOVES.riposte, windup: 12, active: 4, recovery: 15, damage: 18, stamina: 16, feintUntil: 5, reach: 1.2 },
  heavy_riposte: { ...MOVES.heavy_riposte, windup: 16, active: 5, recovery: 20, damage: 22, stamina: 26, feintUntil: 6, reach: 1.55 },
  heavy_counter: { ...MOVES.heavy_counter, windup: 16, active: 5, recovery: 20, damage: 16, stamina: 26, feintUntil: 6, posture: 22, reach: 1.55 },
  critical: { ...MOVES.critical, windup: 16, active: 5, recovery: 20, damage: 30, stamina: 20, reach: 1.55 },   // the brief's table said 26; a sword's critical costs 25 and the knife's must not cost more
  kick: MOVES.kick,
  skill_witchfire: MOVES.skill_witchfire,
  skill_pommel: MOVES.skill_pommel,
  ...OPPONENT_SKILLS,
};
export const KNIFE: Weapon = { id: 'knife', moves: KNIFE_MOVES, paths: KNIFE_PATHS, guard: 'blade', material: 'iron', reach: KNIFE_MOVES.thrust.reach, grip: 'one-hand', fight: { thrustShare: .4, close: 1.0 } };   // a knife fighter stabs often and closes inside a sword's cutting range — the combat lane's to tune with his knobs
// ── Estoc (weapons lane, 2026-09-17): the Nightborn's — a long, thin, thrust-first blade with no cutting edge (his brief, "Weapon: estoc").
// Rig: src/assets/weapons/estoc/nightborn-estoc.glb — his own body, EVERY clip byte-identical to nightborn.glb (no re-key: nothing to lead
// with), only WeaponDrawn under hand_r changes; contact = the last 40 cm (.75–1.15), the point. The sword's clip family and the sword's
// timings and lunges exactly (the cleaver lesson: a different lunge breaks the backstep); `reach` in the sword's conservative spacing
// convention (frontier minus the sword's own per-move margin), measured on his rig (artifacts/weapons/REPORT.md). What a thrust-first
// blade does to the sword's moves: the THRUST is the weapon (a little more damage, chains into a second), the cuts are whacks with a rod
// (less damage, no chip), the riposte is his payoff (he parries everything). Live variant A, baked from his own rig.
export const ESTOC_PATHS: Record<PathId, PathSpec> = PATHS;   // the sword's clips at the sword's timings: the bake differs only by the point and his rig
// Reach: the sword's spacing convention plus 0.30 m — the estoc's contact segment is the last 40 cm of a longer blade (.75–1.15 m vs the
// sword's .18–.86), so the same swings land further. Measured standing-start frontier vs the sword's on both rigs (tests/weapons.test.ts
// "real reach", 2026-09-22): light +.27, heavy +.27, thrust +.26. The table sat at the sword's numbers until then and every warden
// misjudged the point by that much (the estoc's over-cap rows in tests/player-weapons.test.ts); the sword's own nominal-to-real offset
// (light −.07, thrust −.05, heavy −.30) is kept as is.
const ESTOC_REACH = .30, estocReach = (sword: number): number => +(sword + ESTOC_REACH).toFixed(2);
const ESTOC_MOVES: Record<MoveId, MoveDef> = {
  light_right: { ...MOVES.light_right, damage: 9, staminaDamage: 12, stagger: 20, posture: 16, reach: estocReach(MOVES.light_right.reach) },   // a whack with a rod
  light_left: { ...MOVES.light_left, damage: 9, staminaDamage: 12, stagger: 20, posture: 16, reach: estocReach(MOVES.light_left.reach) },
  heavy_overhead: { ...MOVES.heavy_overhead, damage: 15, chip: .25, staminaDamage: 26, posture: 28, reach: estocReach(MOVES.heavy_overhead.reach) },
  // The thrust: his weapon. A little more than the sword's stab, and it chains into a second (the riposte path, 12/5/19): "thrusts and short chains".
  thrust: { ...MOVES.thrust, chainPath: 'riposte', chained: { windup: 12, active: 5, recovery: 19 }, chain: { window: 14, follow: ['thrust'] }, damage: 14, stamina: 20, staminaDamage: 22, stagger: 20, posture: 18, reach: estocReach(MOVES.thrust.reach) },
  slash_riposte: { ...MOVES.slash_riposte, damage: 26, reach: estocReach(MOVES.slash_riposte.reach) },
  riposte: { ...MOVES.riposte, damage: 26, reach: estocReach(MOVES.riposte.reach) },
  heavy_riposte: { ...MOVES.heavy_riposte, reach: estocReach(MOVES.heavy_riposte.reach) },
  heavy_counter: { ...MOVES.heavy_counter, reach: estocReach(MOVES.heavy_counter.reach) },
  critical: { ...MOVES.critical, reach: estocReach(MOVES.critical.reach) },
  kick: MOVES.kick,
  skill_witchfire: MOVES.skill_witchfire,
  // The Pommel Strike's per-weapon row (#766 fairness sweep, 24 seeds, normal): with the shared 18-tick wind-up the estoc's reach carried the
  // strike-then-cut combo to 20/24 on the Goblin and the warhammer's to 13/24 on the Executioner (cap 12). A 22-tick wind-up (a longer tell
  // for a heavier or longer weapon's hilt) brings every opponent under the cap (estoc max 9, warhammer max 11); the stagger stays 50.
  skill_pommel: { ...MOVES.skill_pommel, windup: 22 },
  ...OPPONENT_SKILLS,
};
export const ESTOC: Weapon = { id: 'estoc', moves: ESTOC_MOVES, paths: ESTOC_PATHS, guard: 'blade', material: 'steel', reach: ESTOC_MOVES.thrust.reach, grip: 'one-hand', fight: { thrustShare: .75, close: 1.15 } };   // three quarters of non-cut openers are thrusts; the live-point battery catches habitual rollers without changing spacing or timings
// ── Gladius (weapons lane, 2026-09-23): the Centurion's, and a player weapon. Strategy's 09:42 ruling: a STATIC one-hand gladius on the
// sword family, zero clips — the sword's paths, timings and lunges exactly (the only thing that changes is the node under hand_r). Its
// identity is the short blade: a legionary's cut-and-thrust sword that fights close, so the cuts hit a little softer than a longsword's
// and the thrust (the gladius's point is the weapon) a little harder. Reach is the sword's convention MINUS the shorter blade, measured
// off the hero bake the way the estoc's was (tests/weapons.test.ts "real reach"), never guessed from the blade's length: standing-start
// frontier on the hero rig 2026-09-23, gladius vs longsword, thrust 1.814 vs 2.046 (−.232) and cut 1.492 vs 1.725 (−.233).
const GLADIUS_REACH = -.23, gladiusReach = (sword: number): number => +(sword + GLADIUS_REACH).toFixed(2);
const GLADIUS_MOVES: Record<MoveId, MoveDef> = {
  light_right: { ...MOVES.light_right, damage: 12, reach: gladiusReach(MOVES.light_right.reach) },
  light_left: { ...MOVES.light_left, damage: 12, reach: gladiusReach(MOVES.light_left.reach) },
  heavy_overhead: { ...MOVES.heavy_overhead, damage: 16, reach: gladiusReach(MOVES.heavy_overhead.reach) },
  thrust: { ...MOVES.thrust, damage: 13, reach: gladiusReach(MOVES.thrust.reach) },   // the point is the weapon
  slash_riposte: { ...MOVES.slash_riposte, reach: gladiusReach(MOVES.slash_riposte.reach) },
  riposte: { ...MOVES.riposte, reach: gladiusReach(MOVES.riposte.reach) },
  heavy_riposte: { ...MOVES.heavy_riposte, reach: gladiusReach(MOVES.heavy_riposte.reach) },
  heavy_counter: { ...MOVES.heavy_counter, reach: gladiusReach(MOVES.heavy_counter.reach) },
  critical: { ...MOVES.critical, reach: gladiusReach(MOVES.critical.reach) },
  kick: MOVES.kick,
  skill_witchfire: MOVES.skill_witchfire,
  skill_pommel: MOVES.skill_pommel,
  ...OPPONENT_SKILLS,
};
export const GLADIUS: Weapon = { id: 'gladius', moves: GLADIUS_MOVES, paths: PATHS, guard: 'blade', material: 'steel', reach: GLADIUS_MOVES.thrust.reach, grip: 'one-hand', fight: { thrustShare: .5, close: 1.0 } };   // half the non-cut openers are thrusts; it closes inside a longsword's cut, as the knife does
// ── Scythe (weapons lane, 2026-09-18): the Executioner's, baked from src/assets/weapons/scythe/warrior-scythe.glb (the man-scale bake
// rig — the cleaver convention). Everything is an arc — the REAP is the horizontal cut (the
// edge sweeps chest height), the HIGH is the headsman's diagonal, the THRUST is the heel-jab (a scythe has no point; the Stab button's
// mapping). Dead inside ~1 m where the arc cannot develop (minReach on the lights; the brief's inversion
// of the trident's lesson). Haft guard like the trident's (wood; a plain heavy breaks it).
const reap = (id: 'light_right' | 'light_left', chainPath: PathId): MoveDef => ({
  id, direction: id === 'light_right' ? 'right' : 'left', path: id, chainPath, chained: { windup: 18, active: 8, recovery: 20 },
  chain: { window: 18, follow: [id === 'light_right' ? 'light_left' : 'light_right', 'heavy_overhead'] },   // the reap chains across like the sword's cuts
  windup: 24, active: 8, recovery: 26, damage: 16, stamina: 28, staminaDamage: 20, stagger: 26, poise: 0, poiseFrom: 0,   // a heavy edge on a long arc: more than a cut, slower tell (400 ms)
  breaksGuard: false, chip: .25, parryable: true, knockback: 5, stepIn: .4, feintUntil: 12, reach: 2.1, minReach: 1.4, vsGuard: null, posture: 24, chamber: 10, charges: false,   // reach = the measured bake frontier (the trident convention), the dead band inside 1.40 is real (minReach); the brief said ~1 m, the arc needs 1.4 (GAMEPLAY CHANGE flag)
});
export const SCYTHE_PATHS: Record<PathId, PathSpec> = {
  light_right: { clip: 'Scythe_Reap', source: .34, windup: 24, active: 8, recovery: 26 },        // the reap: one clip, both sides (the trident sweep's precedent)
  light_left: { clip: 'Scythe_Reap', source: .34, windup: 24, active: 8, recovery: 26 },
  light_right_chain: { clip: 'Scythe_Reap', source: .34, windup: 18, active: 8, recovery: 20 },
  light_left_chain: { clip: 'Scythe_Reap', source: .34, windup: 18, active: 8, recovery: 20 },
  heavy_overhead: { clip: 'Scythe_High', source: .48, windup: 36, active: 5, recovery: 33 },     // the headsman's diagonal: a giant's mass, a 600 ms tell
  heavy_overhead_chain: { clip: 'Scythe_High', source: .48, windup: 24, active: 5, recovery: 33 },
  thrust: { clip: 'Scythe_Thrust', source: .34, windup: 14, active: 4, recovery: 30 },           // the heel-jab: quick to come out, no chip; recovery follows SCYTHE_MOVES.thrust (18 -> 30, 2026-09-22) so the clip does not finish 200 ms before the sim lets him act
  slash_riposte: { clip: 'Scythe_Reap', source: .34, windup: 12, active: 5, recovery: 19 },
  riposte: { clip: 'Scythe_Chain', source: .30, windup: 12, active: 5, recovery: 19 },           // the payoff off a parry: the head whips across
  heavy_riposte: { clip: 'Scythe_High', source: .48, windup: 22, active: 5, recovery: 25 },
};
export const SCYTHE_MOVES: Record<MoveId, MoveDef> = {
  light_right: reap('light_right', 'light_right_chain'),
  light_left: reap('light_left', 'light_left_chain'),
  heavy_overhead: {
    id: 'heavy_overhead', direction: 'overhead', path: 'heavy_overhead', chainPath: 'heavy_overhead_chain', chained: { windup: 24, active: 5, recovery: 33 }, chain: null,
    windup: 36, active: 5, recovery: 33, damage: 22, stamina: 38, staminaDamage: 35, stagger: 28, poise: 24, poiseFrom: 24,
    breaksGuard: false, chip: .5, parryable: true, knockback: 5, stepIn: .5, feintUntil: 13, reach: 2.3, vsGuard: null, posture: 36, chamber: 11, charges: true,   // the measured bake frontier (2.30) — his spacing weapon, the player sees it coming from far
  },
  // The heel-jab: the scythe cannot thrust, so the Stab button punches the head forward short and level — spacing and interrupt tool,
  // no chip, half a cut's damage. Chains into the reap (jab, then the arc).
  thrust: {
    id: 'thrust', direction: 'thrust', path: 'thrust', chainPath: null, chained: null, chain: { window: 14, follow: ['light_right'] },
    // Recovery 30, not the 18 it shipped with (weapons lane, 2026-09-22). Wind-up stays 14 — the jab still COMES OUT quick, which is the
    // trait the brief names; what changes is that a whiffed jab is punishable. At 18 it was not: "thrust from range" beat the Veteran
    // 19/24 and the Goblin 16/24 (caps 12) by jabbing at 2.1 m and being home before either could answer.
    // Recovery is a real gradient here, unlike the cleaver's levers: 18 -> 19F/16F; 26 -> 16F/18F; 27 -> 17F/18F; 28 -> 12/12 (passing,
    // but EXACTLY on the cap, margin 0); 29 -> 11/8; 30 -> 8/6; 31 -> 1/4; 32 -> 17F/1. So 28-31 is a contiguous passing interior and 30
    // is its centre with margin 4 and 6 — not an isolated tick. Wind-up is the wrong lever and was measured as such (16 -> 0/24F,
    // 18 -> 0/20F, 20 -> 0/0, 22 -> 0/0): the Veteran column falls 19 -> 0 between 14 and 16, a read-window cliff rather than a gradient,
    // and raising the tell is exactly the trait the brief protects. The Executioner WIELDS this scythe and his own fight-length pin is
    // clear at every candidate (median 27.0 s at 30, range 16.2-41.0, against an 18-45 s pin; untouched median is 25.9 s).
    windup: 14, active: 4, recovery: 30, damage: 8, stamina: 18, staminaDamage: 14, stagger: 16, poise: 0, poiseFrom: 0,
    breaksGuard: false, chip: 0, parryable: true, knockback: 3, stepIn: .8, feintUntil: 8, reach: 2.1, vsGuard: null, posture: 12, chamber: 6, charges: false,   // the measured bake frontier (2.10): the heel-jab reaches like the reap — spacing and interrupt, not a point
  },
  slash_riposte: { ...MOVES.slash_riposte, path: 'slash_riposte', windup: 12, active: 5, recovery: 19, reach: 2.1, minReach: 1.4 },
  riposte: { ...MOVES.riposte, path: 'riposte', windup: 12, active: 5, recovery: 19, reach: 1.7 },
  heavy_riposte: { ...MOVES.heavy_riposte, path: 'heavy_riposte' },
  heavy_counter: { ...MOVES.heavy_counter, path: 'heavy_riposte' },
  critical: { ...MOVES.critical, path: 'heavy_riposte' },
  kick: MOVES.kick,
  skill_witchfire: MOVES.skill_witchfire,
  skill_pommel: MOVES.skill_pommel,
  ...OPPONENT_SKILLS,
};
export const SCYTHE: Weapon = { id: 'scythe', moves: SCYTHE_MOVES, paths: SCYTHE_PATHS, guard: 'shaft', material: 'iron', reach: SCYTHE_MOVES.thrust.reach, grip: 'two-hand', guardProfile: { costScale: 1.15, heavyBreaks: true }, fight: { thrustShare: .1, close: 2.0 } };   // the jab is a rare opener (one in ten); he HOLDS the arc's edge at 2.0 m and reaps — the player must time the approach through the tell, never inside a metre and a half (owner 2026-09-18: "this weapon should hit you from far away; you need to time your attack to get in close")
// The weapons lane delivers a weapon unused; the combat lane puts it in the fight (which slice landed what: docs/state/combat.md).
// The cleaver is baked at a man's 1.0× from veteran-cleaver.glb, never the Pitborn's 1.13× (his rendered blade runs ~10 cm past the
// simulated one, never the other way; a 1.13× bake let no backstep escape him). The knife is baked from the goblin's own rig
// (goblin.glb: 0.81× in his .835 hand, a 0.42 m blade).
// Creature packages retain the established timing families, with their own authored contact paths.
const creaturePaths = (paths: Record<PathId, PathSpec>, prefix: string): Record<PathId, PathSpec> => Object.fromEntries(
  Object.entries(paths).map(([id, spec]) => [id, { ...spec, clip: `${prefix}_${id.includes('heavy') ? 'Heavy' : id === 'thrust' || id === 'riposte' ? 'Thrust' : 'Slash'}` }]),
) as Record<PathId, PathSpec>;
const MAUL: Weapon = { ...CLEAVER, id: 'maul', grip: 'two-hand', moves: { ...CLEAVER_MOVES, thrust: { ...CLEAVER_MOVES.thrust, stepIn: .3, reach: 1.4 } }, paths: creaturePaths(CLEAVER_PATHS, 'Maul'), guard: 'shaft', material: 'wood', fight: { thrustShare: .1, close: 1.15 } };
// The Wraith reaps with a long crescent; stepping inside its edge earns a kick/backstep, not a phantom close hit.
// The Dwarf's warhammer (weapons lane part + Warhammer_* clips, 2026-09-20; Combat slice, owner: "less dangerous and balanced with the
// other weapons", hammer identity kept). Blunt, on the cleaver-family clips: symmetrical 15-point swings that shove (posture 30, no chip),
// a 24-point overhead that can be cut into (poise 0 — the maul's hyper-armour was the wall: a .78 man walking in behind an uninterruptible
// heavy), and a blunt punish set (18/24, counter 14, critical 34 — under the sword's 24/30/20/40): the sim showed most of his damage was
// the cleaver's 28/34 ripostes, not the swings. Shaft guard like the trident and scythe (blocks ×1.15, a heavy breaks it). Reach is the
// maul's on a .78 body — swing 1.29 m, heavy 1.48 m — he gets inside.
const WARHAMMER_MOVES: Record<MoveId, MoveDef> = { ...CLEAVER_MOVES,
  skill_pommel: { ...MOVES.skill_pommel, windup: 22 },   // the Pommel Strike's warhammer row: see ESTOC_MOVES
  light_right: { ...CLEAVER_MOVES.light_right, damage: 15, chip: 0, staminaDamage: 20, stagger: 28, posture: 30 },
  light_left: { ...CLEAVER_MOVES.light_left, damage: 15, chip: 0, staminaDamage: 20, stagger: 28, posture: 30, stamina: 28 },
  heavy_overhead: { ...CLEAVER_MOVES.heavy_overhead, damage: 24, poise: 0, posture: 48, staminaDamage: 40, chip: .3, stagger: 32 },
  thrust: { ...CLEAVER_MOVES.thrust, stepIn: .3, reach: 1.4 },
  slash_riposte: { ...CLEAVER_MOVES.slash_riposte, damage: 18 }, riposte: { ...CLEAVER_MOVES.riposte, damage: 18 },
  heavy_riposte: { ...CLEAVER_MOVES.heavy_riposte, damage: 24 }, heavy_counter: { ...CLEAVER_MOVES.heavy_counter, damage: 14 },
  critical: { ...CLEAVER_MOVES.critical, damage: 34 },
};
const WARHAMMER: Weapon = { id: 'warhammer', moves: WARHAMMER_MOVES, paths: creaturePaths(CLEAVER_PATHS, 'Warhammer'), guard: 'shaft', material: 'iron', reach: WARHAMMER_MOVES.thrust.reach, grip: 'two-hand', guardProfile: { costScale: 1.15, heavyBreaks: true }, fight: { thrustShare: .1, close: 1.15 } };
const REAPER: Weapon = { ...ESTOC, id: 'reaper', grip: 'two-hand', moves: Object.fromEntries(Object.entries(ESTOC_MOVES).map(([id, move]) => [id, id === 'kick' || id.startsWith('skill_') ? move : { ...move, stepIn: .15, minReach: 1.4, reach: id.includes('heavy') || id === 'critical' ? 2.1 : id === 'thrust' || id === 'riposte' ? 2.0 : 2.55 }])) as Record<MoveId, MoveDef>, reach: 2.55, guard: 'shaft', material: 'steel', paths: creaturePaths(ESTOC_PATHS, 'Reaper'), fight: { thrustShare: .15, close: 1.9 } };
// The wolf's bite (Combat, 2026-10-07): the knife's table (a short, quick weapon: 14-tick slash, 12-tick stab, a long heavy) on the wolf rig's ONE attack clip, 'Bite'. Every path id names it and the
// timings differ, so a light bite, a lunge (the thrust) and a maul (the heavy) are told apart by how long the head draws back, not by a different clip. Blade paths are baked from the jaw bone (blade-manifest).
const BITE_PATHS: Record<PathId, PathSpec> = Object.fromEntries(Object.entries(KNIFE_PATHS).map(([id, spec]) => [id, { ...spec, clip: 'Bite' }])) as unknown as Record<PathId, PathSpec>;
const BITE: Weapon = { ...KNIFE, id: 'bite', paths: BITE_PATHS, material: 'wood', fight: { thrustShare: .5, close: .9 } };   // material 'wood': a dull thud, not the knife's iron (the audio lane may add a 'bone')
export const WEAPONS: Record<WeaponId, Weapon> = { longsword: LONGSWORD, trident: TRIDENT, cleaver: CLEAVER, estoc: ESTOC, knife: KNIFE, gladius: GLADIUS, scythe: SCYTHE, maul: MAUL, reaper: REAPER, warhammer: WARHAMMER, bite: BITE };   // estoc: LIVE variant A, the Nightborn's thin thrust-first blade (artifacts/character/BRIEF-nightborn.md § Weapon)   // knife: the goblin's short hooked knife, its own KNIFE_MOVES / KNIFE_PATHS on his rig (#86; artifacts/character/BRIEF-goblin.md)   // scythe: LIVE since 2026-09-18 — the Executioner carries it (the flip: artifacts/weapons/REQUESTS.md §15)
export const weaponOf = (id: WeaponId): Weapon => WEAPONS[id];
// The weapons a player can carry (Brief 5 loot): each has an equip file under src/assets/weapons/player and a bake on the hero rig
// (tests/blade-rig.test.ts pins both). The weapons lane appends here when a new equip file ships.
export const PLAYER_WEAPONS: readonly WeaponId[] = ['longsword', 'cleaver', 'knife', 'estoc', 'gladius', 'warhammer', 'trident', 'scythe', 'maul'];
// The weapons a player may be OFFERED (loot, paperdoll, equip): a subset of PLAYER_WEAPONS with no pairing over a cap in the 24-seed player
// weapon battery (scripts/player-weapon-battery.mjs; tests/player-weapons.test.ts derives the excluded set from that table). Combat signed
// the table 2026-09-21: the warhammer is fair on every live rung and is the first loot weapon; after the warden reach fix (combat/warden-reach)
// the trident is clean on every rung too. The SCYTHE joined them on 2026-09-22: its heel-jab recovery went 18 -> 30 and both of its
// "thrust from range" rows left the list, so it has no pairing over a cap at any rung. This list is not a taste call — the test derives
// the excluded set from the table and REQUIRES a weapon with no row to be offered, so the entry follows the measurement. Cleaver, knife
// and estoc still wait on the over-cap list (see KNOWN_UNFAIR there), and each of their remaining rows is Combat's, not weapon data.
export const PLAYER_WEAPONS_OFFERED: readonly WeaponId[] = ['longsword', 'warhammer', 'trident', 'scythe', 'knife', 'estoc', 'gladius', 'cleaver', 'maul'];

export const PROFILES: Record<'easy' | 'normal' | 'hard', AiProfile> = {
  // discipline sits above a heavy's cost so the warden rests instead of swinging itself into exhaustion.
  easy: { reaction: 24, accuracy: .5, parry: .1, dodge: .1, aggression: .45, pressure: 0, discipline: 60, lapse: .45, read: .5 },
  normal: { reaction: 14, accuracy: .75, parry: .3, dodge: .2, aggression: .65, pressure: 0, discipline: 50, lapse: .3, read: .7 },   // read (directional guard, owner 2026-09-20): the side he guards on is right 7 times in 10; the lead's per-rung numbers, swept by the battery
  hard: { reaction: 10, accuracy: .95, parry: .6, dodge: .35, aggression: .85, pressure: .5, discipline: 40, lapse: .1, read: .85 },   // 167 ms: hard is decisions and feints, not input-reading (was 7)
};
export type Level = keyof typeof PROFILES;
// An opponent is data a duel is set up from: the weapon he carries, his body scale (the blade sweep's hit capsule and regions
// follow it; the renderer picks his GLB by id), his health, his poise and his own profile per level — the same easy/normal/hard toggle
// modulates every opponent. The Veteran is the warden as shipped; `initialDuel()` with no argument is still exactly him.
// poise: a plain clean hit dealing less than this damage never staggers him (it still wounds and builds posture); heavies,
// counter-hits, stop-hits, rear hits and charged blows always do. 0 = staggered by everything, the human default.
// guard: how this man's guard behaves on top of his weapon's (`Fighter.guardProfile`): the Nightborn's parry window is longer than a man's
// and a parry of his that meets nothing leaves him open longer — the one mechanism behind "bait him" (see OPPONENTS.nightborn).
export type Opponent = { id: OpponentId; weapon: WeaponId; rig: RigId; scale: number; health: number; poise: number; profiles: Record<Level, AiProfile>; guard?: Partial<GuardProfile>; regen?: number; speed?: number };   // regen: stamina regeneration multiplier; speed: pace multiplier for walking, lunging and stepping (a small fighter is quick on his feet)
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
const OWN_KNOBS: Partial<Record<OpponentId, Partial<AiProfile>>> = { veteran: { tellReaction: 15, braceHeavy: 1, spamRun: 5 }, pitborn: { spamRun: 6 }, dwarf: { spamRun: 6 }, knight: { spamRun: 5 }, shieldmaiden: { spamRun: 5, spamBoth: 1 } };   // RV31 (docs/specs/combat/l6-anti-spam.md): the five opponents a mashing player beat at L6 (the Pitborn's gate is 6: at 5 her skilled bot lost 9 points at L6, at 7 light spam still won 47/48); every other opponent keeps today's read
export const OPPONENTS = Object.fromEntries(Object.entries(ROSTER).map(([id, recipe]) => {
  const base = ARCHETYPES[recipe.archetype], own = OWN_KNOBS[id as OpponentId];
  const profiles = own ? { easy: { ...base.profiles.easy, ...own }, normal: { ...base.profiles.normal, ...own }, hard: { ...base.profiles.hard, ...own } } : base.profiles;
  return [id, { id, weapon: recipe.weapon, rig: recipe.rig, ...base, profiles }];
})) as Record<OpponentId, Opponent>;

// ── The 46-level ladder (Dom via Strategy, 2026-09-27; anchors signed off 09:4x). Difficulty is a LEVEL, 1–46, whatever the opponent: each
// opponent's easy / normal / hard tables above are anchors at levels 6 / 18 / 46, and level 1 is a NOVICE below easy (a first-timer tapping
// attack must win). Between anchors every knob is linear, except the tick and stamina counts (reaction, anticipate, discipline), which round.
// The novice lowers only the fighter's SKILL (how fast and how well he reads and answers); his IDENTITY knobs (pressure, feint, guard,
// disengage, circle, step, interrupt, kick, dash) stay at easy's from 1 to 6, so the orc still chains, the goblin never guards.
// At an anchor level the anchor itself is returned, so levels 6 / 18 / 46 fight exactly as easy / normal / hard did (same RNG draws).
export const LEVELS = 50;   // 46 anchored the hard table; 47–50 are Origin II–V (the tail past hard, TAIL below)
// The named special an opponent casts at a ladder level (Strategy 2026-10-01, docs/briefs/specials/): ranks 8 / 9 / 10 (career.ts: five levels a rank, so 36 / 41 / 46).
// Identity only: windup, share, cooldown and the unblockable release are RULES.special for every special. Null = the opponent's class skill names it (below rank 8, or no set).
// The Centurion's id is 'veteran'. The picks are the briefs' starred ones.
const SPECIAL_SETS = {
  veteran: ['quake', 'charge', 'tithe'],   // Shield Quake, The Charge, Blood Tithe
  nightborn: ['redwind', 'hadesshadow', 'nyxnightfall'],   // Red Wind, Hades' Shadow, Nyx Nightfall
  executioner: ['bayingcircle', 'longshadow', 'harvestsweep'],   // Arawn, Thanatos, The Reaper
  goblin: ['dirtyfistful', 'gone', 'threeliars'],   // Reynard, Hermes, Loki
  pitborn: ['crackingground', 'ashfall', 'windwall'],   // Antaeus, Surtr, Typhon
  dwarf: ['theword', 'threeblows', 'rimshake'],   // Ptah, Goibniu, Hephaestus
  shieldmaiden: ['baredface', 'thering', 'aegissweep'],   // Penthesilea, Brynhildr, Athena
  witch: ['avalonmist', 'foretoldstep', 'theprice'],   // Morgan le Fay, Merlin, Odin
  plaguedoctor: ['plagueflies', 'poisonstain', 'lastbreath'],   // Apollo, Hecate, Resheph
  knight: ['thesling', 'wrath', 'stormfollowshim'],   // Hector, Achilles, Thor
} as const;
export type SpecialName = typeof SPECIAL_SETS[keyof typeof SPECIAL_SETS][number];
// Per-special data rows: only the exceptions are listed. `interruptible` defaults to true (RULES.special.interruptAt); a boss the ladder sweep says must not be cut gets `{ interruptible: false }` here.
export const SPECIAL_ROWS: Partial<Record<SpecialName, { interruptible?: boolean }>> = {};
export const isInterruptible = (name: SpecialName | undefined): boolean => name === undefined || SPECIAL_ROWS[name]?.interruptible !== false;
export const specialOf = (opponent: OpponentId, level: number): SpecialName | null => {
  const set = (SPECIAL_SETS as Partial<Record<OpponentId, readonly SpecialName[]>>)[opponent];
  return set && level >= 36 ? set[level >= 46 ? 2 : level >= 41 ? 1 : 0] : null;
};export const LEVEL_ANCHORS = { novice: 1, easy: 6, normal: 18, hard: 46 } as const;
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
export const POISE_FULL_AT: Partial<Record<OpponentId, number>> = { pitborn: 18, shieldmaiden: 18 };
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
const ABSENT: Partial<AiProfile> = { read: 1, feint: 0, guard: 1, disengage: 0, circle: 0, regen: 1, step: 0, interrupt: 0, kick: 0, dash: 0, stab: 0, anticipate: 8, tellReaction: 99, braceHeavy: 0, spamRun: 0, spamBoth: 0 };   // anticipate: ai.ts READ.anticipate (tests pin it)
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
const LATE_NOTICE_FROM = 12;
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
