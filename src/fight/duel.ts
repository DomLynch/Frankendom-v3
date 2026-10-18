import { bladeImpact, type HitLocation } from './blade.ts';
import { checkSheet, statDown, statUp, type Sheet } from './sheet-rows.ts';
import { kindOf } from './damage-kinds.ts';
import { STANCE_ROWS_ON } from './stance-era.ts';
import { POISE_LADDER_ON } from './poise-era.ts';
import { CONE_ON } from './cone-era.ts';
import { breathTicks, coneOf, inCone, pulseDamage } from './cone-rules.ts';
import { LADDER, flinchTicks, poiseTier } from './poise-ladder.ts';
import { OPPONENTS, RULES, SKILL_MOVE, total, weaponOf, DEFAULT_WEAPON, isInterruptible, DAY_ONE_SKILL, type Direction, type GuardProfile, type Material, type MoveId, type Opponent, type RigId, type SkillId, type SpecialName, type Timing, type WeaponId } from './moves.ts';
import { advance, initialState, initialTarget, RADIUS, wrapAngle, type Input, type State } from './sim.ts';
import { M } from './detmath.ts';
import { poolsOf, type PoolValues } from './pools.ts';
import { crowdPercent, percentOf, rolledDamage, rollUnit, swarmBand, type CrowdKind } from './roll.ts';
import { GAMBIT_ODDS, gambitUnit, resolveGambit } from './gambit.ts';
import { CC_LADDER, ccApply, type CcGuard, type CcLadder, type CcSource } from './cc-ladder.ts';
import { bandFactor } from './bands.ts';
import { SPECIAL_MELEE_REACH, meleeSpecialReach, meleeSpecialRelease, percentScaled, SPECIAL_MELEE_WINDUP, SPECIAL_REACT, SPECIAL_REACT_KNOCK, SPECIAL_REACT_POSTURE, SPECIAL_REACT_STAGGER, specialReactFloorOf } from './sandbox-rules.ts';
import { SHARED_COOLDOWN } from './spell-rows.ts';
import { castOutcome, outcomeMult, splitDamage, spellRoot, type CastOutcome, type Spell } from './spell-cast.ts';
import { stanced, woundsAt, woundCeil, type StanceId } from './stance.ts';
import { ARC_HALF, BODY_SPACING, FULL_TURN, GAP_EPSILON, LORARIUS_SECTORS, MAX_PERK_TEMPLATES, MOVE_EPSILON, PERK_MAX, PER_MILLE, PUSH_SPLIT, ROLL_HALF } from './duel-rows.ts';   // the dials are rows (duel-defs.json)
export { PERK_MAX };
import { DODGE_COUNTER, PHASES, attackerPerMille, interruptLockout, CAST_PUSHBACK, CAST_PUSHBACK_MAX, castWindup, executed, armourPerMille, ARMOUR_ON, OID_ON, commitOf, wardOf, braced, FLANK_DAMAGE, FLANK_POSTURE, poisonOf, poisonTick, bindOf, MANA_MAX, MANA_DELAY, manaCost, manaRegenPerTick, missileOf, laneOf, bowSpecialOf, MISSILE_GUARD_POSTURE, MISSILE_RADIUS, MISSILE_FAN, MISSILE_HOMING, missilePaysNoStamina, MISSILE_STUN, missileMinGap, missileTicks, ammoOf, missileTiming, spellRangeOf, spellRangeCue, paysMana, healOf, spellWindupOf } from './sandbox-rules.ts';   // never Math.<transcendental> in the sim: engines round them differently (tests/detmath.test.ts)

// Symmetric 1v1 melee simulation. Both fighters obey the same rules through the same Intent; the AI is just another
// intent source. Pure and fixed at 60 Hz: no renderer, clock, randomness or browser state. Presentation observes results.
export type Phase = 'sheathed' | 'draw' | 'ready' | 'attack' | 'roll' | 'backstep' | 'guard' | 'hurt' | 'dead';
export type Action = 'light' | 'light_left' | 'light_right' | 'heavy' | 'thrust' | 'kick' | 'dodge' | 'backstep' | 'parry' | 'skill' | 'skill2';   // skill2 (sandbox-mech spell slot 2): the second spell, cast like skill with its own cooldown; skill: the equipped skill's move (Fighter.skill), the fourth button
export type Intent = {
  move: Input;                  // camera-relative stick/keys
  action: Action | null;        // edge-triggered request for this tick; one is buffered late in a committed action
  guard: boolean;               // level: guard button held
  held?: boolean;               // level: the attack control is still held (a chambered swing waits; a charging one charges)
  guardDirection?: Direction;   // used only when RULES.directionalGuard is on
  lock: boolean;                // face the opponent while ready and during attack wind-up
  cancel?: boolean;             // input cancellation: drop any buffered action
};
export const idleIntent = (): Intent => ({ move: { x: 0, z: 0, yaw: 0, run: false }, action: null, guard: false, lock: true });
export type Fighter = {
  body: State; health: number; stamina: number; rest: number; exhausted: boolean; wound: number; woundSite: HitLocation;
  phase: Phase; age: number; move: MoveId | null; chained: boolean; landed: boolean;
  chain: number; lastMove: MoveId | null; parryCooldown: number; punish: number; stun: number;
  posture: number; critical: number;   // posture 0..RULES.posture.max; critical = ticks left in which Heavy is the critical on a broken opponent
  guardDirection: Direction | null; parrying: boolean; exposed: number; evaded: number; counterWindow: number; charge: number; charged: boolean; buffer: { action: Action; ttl: number } | null;
  guardProfile?: Partial<GuardProfile>;   // shield/loadout overrides; absent = the longsword defaults in RULES
  postureRest: number;   // ticks left before posture drains again (a gain pauses the drain)
  phases?: readonly string[];   // sandbox-mech boss phases reached this fight (boss-phase-defs.json ids)
  scars?: readonly string[];   // sandbox-mech wounds (stance.ts woundsAt): the wound rows this fighter has taken; absent until a row fires
  maxStamina: number; legWound: boolean;   // attrition: the bar's ceiling for this duel, and a slowing leg wound
  attackFrom: { x: number; z: number; gap: number } | null;   // where the current attack started and the gap then: a target that walked in since is walking onto the point
  bowSpecial?: string;   // sandbox bowSpecial: the picker skill of the bow special being cast (its arrows leave at the release)
  missile?: { lanes?: number[]; react?: boolean; pin?: number; posture?: number; launched: number; arrives: number; x: number; z: number; dx: number; dz: number; range: number; damage: number; move: MoveId; lane: number; spell?: string; outcome?: CastOutcome; tint?: string };   // spell, outcome, tint: a long-range SPELL flying through the same model (sandbox spellRange); sandbox-mech missiles: the one bolt this fighter has in flight
  healUses?: number;   // sandbox spellHeal: heals cast this fight, against the row's `uses` cap
  ammo?: number;   // sandbox-mech missiles: arrows or bolts left in the quiver (absent = infinite)
  mana?: number; maxMana?: number; manaRest?: number;   // sandbox-mech mana: the third pool (rows manaMax...), present only while manaMax > 0
  bound?: number; boundHold?: number; boundReact?: number; disarmed?: number;   // sandbox-mech bindAndDisarm: ticks left bound / the disarm it turns into / the AI's reaction / ticks left disarmed
  poisonEnemy?: string;   // the poisoner's id, whose row ticks the poison
  poisonUntil?: number;   // sandbox-mech clockFighter: poisoned until this tick
  wardAt?: number;   // sandbox-mech ward: the tick the ward is ready again (absent = ready)
  oid?: string;   // sandbox-mech armourVsBlow: the opponent's id, set only while armour rows exist, so its gear class can be read
  weapon: WeaponId;   // the tables this fighter fights with (moves, blade paths, guard kind, material): see moves.ts `WEAPONS`
  rig: RigId;   // the skeleton family the blade table is baked for (roster.ts RigId): 'hero' for a man and for every body reproportioned from him
  stall: number;   // ticks the current attack's clock stands still (a thrust that met nothing hangs at full extension)
  maxHealth: number;   // the bar's ceiling (moves.ts `Opponent.health`; RULES.health for a man)
  scale: number;   // body scale: the hit capsule and its head/torso/legs regions the opponent's blade sweeps (moves.ts `Opponent`)
  regen: number;   // stamina regeneration multiplier (moves.ts `Opponent.regen`; 1 = a man)
  speed: number;   // pace multiplier: walking, sprinting, the wind-up lunge and the backstep (moves.ts `Opponent.speed`; 1 = a man)
  poise: number;   // a plain clean hit dealing less than this never staggers this fighter (moves.ts `Opponent`); 0 = human
  poiseRest?: number;   // v54 (poise-ladder.ts): ticks left of the poise-rest a full stagger started; a flinch inside it is a shrug. Absent = none, so a fight without the ladder hashes as before
  breath?: { k: number; wait: number; heading: number };   // v55 (cone-rules.ts): a cone special mid-breath: pulses done, ticks since the last pulse, the heading fixed at the release. Absent unless breathing, so a fight without a cone hashes as before
  volley?: { k: number; wait: number; total: number; hits: readonly number[]; every: number };   // RV69 (spell-hit-defs.json): a spell landing as pulses: pulses done, ticks since the last, the landing's whole damage and its weights. Absent unless pulsing, so a fight without one hashes as before
  loiter: number;   // ticks spent within the wall band without attacking (RULES.wall.loiter); the lorarii whip at `ticks`
  lashed: boolean;   // the lorarii have already lashed him in this spell at the wall: the next whip is a repeat, so its tell is shorter
  skill: SkillId | null; skillCooldown: number;   // the equipped skill (null = none: every opponent in V1) and the ticks until it may fire again (RULES.skillCooldown)
  // Special Moves (RULES.special): present only when the fight has them (withSpecials); absent, the SKILL slot is the plain skill it always was.
  cc?: CcLadder;   // the crowd-control ladder this fighter's stuns step (cc-ladder.ts); present only in the open world, which shares the hero's across every bout. Absent = no diminishing returns: the Pit's fight, byte for byte
  ccGuard?: CcGuard;   // its own immuneTier / resist rows (cc-ladder.ts, from the creature's catalogue fields); absent = none
  specialShare?: number;   // the share of the target's max health this fighter's special takes
  specialName?: SpecialName;   // which named special this fighter casts (moves.ts specialOf); absent = named by `skill`
  special?: number;   // ticks of a committed special windup left; it releases on the tick it would reach 0
  castPush?: number;   // sandbox-mech castPushback: times a hit has pushed this cast back; absent when 0
  castHurt?: number;   // damage taken since SpecialStarted while the windup counts down (RULES.special.interruptAt cuts the cast); absent when 0, so a cast nobody hits hashes as before
  skill2?: SkillId;   // slot b as a MELEE special (the specials PR, RV75): an existing class skill, fought through its own move-defs row (reach, windup, stagger, knockback, stamina, posture) on skillCooldown2, never the flat special share; absent = slot b is a spell (or empty)
  spell2?: Spell; skillCooldown2?: number; castSlot?: 1;   // slot b (spell-slot-defs.json): its spell and its OWN cooldown (absent = 0); castSlot = the slot of the cast in its windup (absent = slot a). All absent = a one-spell fight byte for byte
  spell?: Spell;   // the spell this fighter's special casts (spell-cast.ts, RV53): a stamina cost at the commit and an outcome by skill at the release; the windup, interrupt, cooldown and reach are the special's own. Absent = the plain special, byte for byte
  specialRecover?: number;   // ticks left after a release in which the caster starts no attack (RULES.special.recovery); guard, roll and steps stay legal
  feintEdge?: number;   // a TRICKSTER's feint opens a beat: ticks left in which the next swing he starts is a beating one (RULES.feintBeat, src/fight/stance.ts); absent without that stance
  beat?: true;   // the swing in hand began inside a feint's beat: it ignores a passively held guard (see the block branch); cleared by the next beginAttack
  stance?: StanceId;   // the fight's stance for this fighter (src/fight/stance.ts, RV34); absent = Neutral or no stances: today's fight, byte for byte
  gambitOn?: true;   // this fighter may arm a Gambit (withGambit); absent = the fight has none, byte for byte
  gambit?: true;   // the swing in hand is an armed Gambit (a second heavy press after the chamber); cleared by the next beginAttack
  sheet?: Sheet;   // the player's sheet (sheet-rows.ts: ten dials, 0 base, 100 max): attack, armour, health, poise and recovery are read here (the rest are carried), never a duration; set once at duel start by withSheet; absent = off the sheet (a boss, a creature) or every dial at base: today's fight, byte for byte
  perk?: Perk;   // the patron's sidegrade (docs/specs/origins/patron-perks-sim.md), set once at duel start by withPerk; absent = today's fight, byte for byte
};
// A patron perk: signed per-mille integers, each scaling ONE quantity by (1000 + d) / 1000, at most two templates and never past ±PERK_MAX (3%).
// Never a tick count, reach, move timing or an AI input (spec rule 2). The caller pairs a gain with a matching loss; this type does not judge balance.
export type PerkKey = 'vitality' | 'wind' | 'thrift' | 'guard' | 'poise' | 'stride';
export type Perk = Readonly<Partial<Record<PerkKey, number>>>;   // vitality: max health; wind: stamina regen; thrift: attack stamina cost; guard: block and guard-break stamina cost; poise: posture taken; stride: pace
export const PERK_KEYS: readonly PerkKey[] = ['vitality', 'wind', 'thrift', 'guard', 'poise', 'stride'];
// `perk ? scaled : plain`, never `x * 1`: a fighter with no perk (or a zero on this key) takes the unscaled value untouched, so no float drift.
const perked = (f: Pick<Fighter, 'perk'>, key: PerkKey, x: number): number => { const d = f.perk?.[key]; return d ? (x * (PER_MILLE + d)) / PER_MILLE : x; };
// Validates and applies a perk at duel start: max health (integer), regen and pace scale once; thrift, guard and poise are read at their sites in stepDuel.
export const withPerk = (f: Fighter, perk: Perk | undefined): Fighter => {
  if (!perk) return f;
  const set = PERK_KEYS.filter(k => perk[k]);
  if (Object.keys(perk).some(k => !(PERK_KEYS as readonly string[]).includes(k))) throw Error('Perk: unknown template');
  if (set.length > MAX_PERK_TEMPLATES || set.some(k => !Number.isInteger(perk[k]) || Math.abs(perk[k]!) > PERK_MAX)) throw Error(`Perk: at most two templates, whole per-mille, within ±${PERK_MAX}`);
  if (!set.length) return f;
  const out: Fighter = { ...f, perk: Object.fromEntries(set.map(k => [k, perk[k]!])) };
  if (perk.vitality) { out.maxHealth = Math.round((f.maxHealth * (PER_MILLE + perk.vitality)) / PER_MILLE); out.health = out.maxHealth; }
  if (perk.wind) out.regen = (f.regen * (PER_MILLE + perk.wind)) / PER_MILLE;
  if (perk.stride) out.speed = (f.speed * (PER_MILLE + perk.stride)) / PER_MILLE;
  return out;
};

export type Side = 0 | 1;
export type Finish = { victim: Side; location: HitLocation; move: MoveId; heading: number; draw?: boolean };   // draw: both fell on the same tick (victim is then the first processed)
type EventType = 'MissileLaunched' | 'SpecialStarted' | 'SpecialRefused' | 'SpecialLanded' | 'SpecialFizzled' | 'SpecialInterrupted' | 'PhaseChanged' | 'ActionStarted' | 'AttackStarted' | 'Charging' | 'Charged' | 'AttackActive' | 'AttackMissed' | 'Hit' | 'Blocked' | 'Parried' | 'GuardBroken' | 'PostureBroken' | 'Dodged' | 'Staggered' | 'StaminaExhausted' | 'Killed' | 'SharedHit' | 'Whipped' | 'WhipRaised' | 'GambitArmed' | 'GambitFailed';
// Event sides: a blow that lands (Hit, GuardBroken, Killed) names the attacker as `actor` and the one struck as `target`; a defence that
// succeeds (Blocked, Parried, Dodged) names the defender as `actor` and the attacker as `target`.
export type CombatEvent = { cue?: string; heal?: number; missile?: boolean; lane?: number; glance?: boolean; pulse?: number; cone?: boolean; damageKind?: string; tick: number; type: EventType; actor: Side; target?: Side; move?: MoveId; direction?: Direction; action?: 'draw' | 'roll' | 'backstep' | 'guard' | 'parry' | 'feint'; damage?: number; roll?: number; stamina?: number; perfect?: boolean; counter?: boolean; rear?: boolean; charged?: boolean; stop?: boolean; trip?: boolean; walled?: boolean; guarded?: boolean; weapon?: WeaponId; material?: Material; location?: HitLocation; heading?: number; ticks?: number; posture?: number; x?: number; z?: number; lead?: number; guard?: number; name?: SpecialName; gambit?: boolean; beaten?: boolean; spell?: string; outcome?: CastOutcome };   // spell, outcome: SpecialStarted / SpecialLanded / SpecialFizzled of a spell cast (spell-cast.ts); outcome is critfail, fail, partial, success or crit   // gambit: a Hit that was a landed Gambit (src/fight/gambit.ts). name: SpecialStarted / SpecialLanded of a named special (moves.ts specialOf). Whipped: actor = target = the whipped fighter; x, z = where the lash landed (before the shove)
// WhipRaised: the lorarius lifts his whip, `lead` ticks before the lash that follows (RULES.wall.loiter.raise, or raiseAgain for a repeat) —
// presentation scales its raise animation by `lead` rather than assuming one. Both whip events carry `guard`: which sixth of the wall the
// lorarius stands in, floor(angle / 60°) from the fighter's position, so the world and audio lanes draw and sound the same guard the sim means.
// `roll`: the world-mob damage roll (Origins luck ruling, Dom 2026-10-07: +/-10% on every blow in both directions, in a world-mob fight only). Absent = the Pit, PvP and the
// ladder: today's fight byte for byte. `hits` numbers the fight's blows in the order they resolve, so the draw is a pure function of (seed, hit) and a replay reproduces it.
export type Duel = { bands?: boolean; tick: number; fighters: [Fighter, Fighter]; finish: Finish | null; events: CombatEvent[]; incoming?: number; roll?: { seed: number; hits: number; swarm?: number; rank?: number; attacker?: number }; gambit?: { seed: number; draws: number }; cast?: { seed: number; n: number }; radius?: number; ccBase?: number; crowd?: { from: Side; slot: number; kind?: CrowdKind } };   // crowd: the many-on-one cut (roll.ts crowdPercent): `from` is the crowding attacker's side, `slot` its place among the attackers on one target   // ccBase: ticks added to this duel's tick to give the world's clock, the ladder's window (open world only)   // radius: the wall this fight is fought inside (RV40); absent = the Pit's live circle (play-radius.ts RADIUS), so a Pit duel is byte for byte what it was
export { ROLL_BAND, rollPercent, rolledDamage } from './roll.ts';   // the one definition (src/fight/roll.ts), shared with src/core/luck.ts
export const withRoll = (duel: Duel, seed: number): Duel => ({ ...duel, roll: { seed, hits: 0 } });
// A spell on one fighter (RV53): the one door, so a replay builds exactly what the live fight built. The fighter must already carry the special (withSpecials). `cast.seed` is the fight's seed, salted so the cast draws never repeat the gambit's or the roll's.
export const withSpell = (duel: Duel, side: Side, spell: Spell, seed: number, slot: 0 | 1 = 0): Duel => {
  if (duel.fighters[side].specialShare === undefined) throw Error('A spell is cast through the special: the fight needs Special Moves');
  const fighters = [duel.fighters[0], duel.fighters[1]] as [Fighter, Fighter];
  fighters[side] = slot ? { ...fighters[side], spell2: spell, skillCooldown2: fighters[side].skillCooldown2 ?? fighters[side].skillCooldown } : { ...fighters[side], spell };   // slot b starts on the same first-cast delay as slot a
  return { ...duel, fighters, cast: { seed: (seed ^ 0x5bd1e995) >>> 0, n: 0 } };
};
// A fight with the Gambit (src/fight/gambit.ts, RV33): the player's side may arm it, and its draws are a pure function of (seed, draw number). Absent = today's fight byte for byte.
// A fight with stances (src/fight/stance.ts, RV34): the fighters carry their stance. Neutral (undefined) adds nothing. Absent entirely = today's fight.
export const withStances = (duel: Duel, player: StanceId | undefined, mood: StanceId | undefined): Duel => ({ ...duel, fighters: [player ? { ...duel.fighters[0], stance: player } : duel.fighters[0], mood ? { ...duel.fighters[1], stance: mood } : duel.fighters[1]] });
export const withGambit = (duel: Duel, seed: number): Duel => ({ ...duel, gambit: { seed, draws: 0 }, fighters: [{ ...duel.fighters[0], gambitOn: true }, duel.fighters[1]] });

// Which sixth of the ring wall a lorarius stands in, from the position of the man he is whipping: the six guards are drawn at 60-degree
// intervals, so the sim and the world lane agree on which one moved without either reaching into the other.
export const lorariusGuard = (body: Pick<State, 'x' | 'z'>) => Math.floor(((M.atan2(body.z, body.x) + Math.PI * FULL_TURN) % (Math.PI * FULL_TURN)) / (Math.PI / LORARIUS_SECTORS));

// Every move / path lookup for a fighter goes through its weapon.
export const movesOf = (f: Pick<Fighter, 'weapon'>) => weaponOf(f.weapon).moves;
export const createFighter = (body: State, phase: Phase, weapon: WeaponId = DEFAULT_WEAPON, scale = 1, poise = 0, health: number = RULES.health, guard?: Partial<GuardProfile>, regen = 1, speed = 1, rig: RigId = 'hero', pools?: PoolValues): Fighter => { const p = poolsOf({ health }, pools); return { weapon, rig, ...(weaponOf(weapon).guardProfile || guard ? { guardProfile: { ...weaponOf(weapon).guardProfile, ...guard } } : {}), scale, poise, regen, speed, body, health: p.health!, maxHealth: p.health!, stamina: p.stamina!, rest: 0, exhausted: false, ...(MANA_MAX ? { mana: MANA_MAX, maxMana: MANA_MAX } : {}), ...(ammoOf(weapon) ? { ammo: ammoOf(weapon) } : {}), wound: 0, woundSite: 'torso', phase, age: 0, move: null, chained: false, landed: false, chain: 0, lastMove: null, parryCooldown: 0, punish: 0, stun: 0, posture: 0, critical: 0, guardDirection: null, parrying: false, exposed: 0, evaded: 0, counterWindow: 0, charge: 0, charged: false, buffer: null, postureRest: 0, maxStamina: p.stamina!, legWound: false, attackFrom: null, stall: 0, loiter: 0, lashed: false, skill: null, skillCooldown: 0 }; };
// An opponent's fighter from his data (moves.ts `Opponent`): the one place his weapon, scale, poise, health, guard, regen and pace are read.
export const opponentFighter = (o: Opponent, body: State, phase: Phase = 'ready'): Fighter => ({ ...({ ...createFighter(body, phase, o.weapon, o.scale, o.poise, o.health, o.guard, o.regen ?? 1, o.speed ?? 1, o.rig, o.pools), ...(o.sheet ? { sheet: o.sheet } : {}) }), ...(OID_ON ? { oid: o.id } : {}) });   // a row's `sheet` (the Cave Troll's attack dial 20 = +20% damage): the creature's own dials, read like a hero's
// The player's weapon (moves.ts PLAYER_WEAPONS). Every weapon starts the fight SHEATHED and keeps the draw beat (Dom via Strategy,
// 2026-09-25): the opponent waits for the draw (ai.ts), so a taken weapon no longer opens the fight to an attack on tick 0. `skill`: the player's equipped skill.
// `pose` (seamless step 3, World's signature): start the fight where the hero and the foe ALREADY stand instead of at the pit marks. Metres in the arena's own axes (the caller subtracts the fight circle's
// centre), `heroFacing` in radians as sim headings are (aim = atan2(dx, dz)); the foe faces the hero from where it stands, as at the marks. Both must lie inside the wall (RADIUS) and apart by more than a body, or it throws:
// a pose that starts a fighter in the wall or in the other body is a caller bug, never a fight to clamp silently. Absent = today's marks, byte for byte.
export type DuelPose = { hero: { x: number; z: number }; foe: { x: number; z: number }; heroFacing: number };
// The one validity rule, shared with the record decoder (src/fight/record.ts): a pose that fails it is refused, never clamped.
// `wall`: also check the live wall (RADIUS). The record decoder passes false: RADIUS is whatever the LAST fight set, and the wall belongs to the record's own circle, which poseBodies checks at replay under the record's version (Auditor, #1822).
export const validatePose = (pose: DuelPose, wall = true): void => {
  const { hero, foe, heroFacing } = pose;
  for (const p of [hero, foe]) if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || (wall && M.hypot(p.x, p.z) > RADIUS)) throw RangeError('Duel pose: a fighter must start inside the wall');
  if (!Number.isFinite(heroFacing)) throw RangeError('Duel pose: heroFacing must be a finite angle');
  if (M.hypot(hero.x - foe.x, hero.z - foe.z) <= BODY_SPACING) throw RangeError('Duel pose: the fighters start inside each other');
};
// The record stores a pose as float32: a live fight and its replay must start from the SAME bits, so poseBodies (below) and the recorder both round with this. Float32 rounding is plain IEEE-754 (not a per-device
// value); it goes through a DataView because net-determinism bans the usual single-precision spellings inside the sim files as a blanket rule.
const f32view = new DataView(new ArrayBuffer(4));
const f32 = (x: number): number => { f32view.setFloat32(0, x); return f32view.getFloat32(0); };
export const roundPose = (pose: DuelPose): DuelPose => ({ hero: { x: f32(pose.hero.x), z: f32(pose.hero.z) }, foe: { x: f32(pose.foe.x), z: f32(pose.foe.z) }, heroFacing: f32(pose.heroFacing) });
const poseBodies = (given: DuelPose): [State, State] => {
  const pose = roundPose(given); validatePose(pose);   // rounded BEFORE the wrap and before any body is built, on the live side and the replay side alike
  const { hero, foe, heroFacing } = pose;
  const facing = heroFacing > Math.PI || heroFacing <= -Math.PI ? wrapAngle(heroFacing) : heroFacing;
  return [{ x: hero.x, z: hero.z, heading: facing, distance: 0 }, { x: foe.x, z: foe.z, heading: M.atan2(hero.x - foe.x, hero.z - foe.z), distance: 0 }];   // the foe always faces the hero's actual position (the pit marks' own 0 comes back exactly), whatever heroFacing says
};
export const initialDuel = (opponent: Opponent = OPPONENTS.veteran, weapon: WeaponId = DEFAULT_WEAPON, skill: SkillId | null = null, pose?: DuelPose): Duel => {
  const [hero, foe] = pose ? poseBodies(pose) : [initialState(), { ...initialTarget(), heading: 0, distance: 0 }];
  return { tick: 0, fighters: [{ ...createFighter(hero, 'sheathed', weapon), skill }, opponentFighter(opponent, foe)], finish: null, events: [] };
};

// The one door a patron fight is built through, after initialDuel (and withSpecials): the player's perk in slot 0, the foe's (PvP only; ladder foes carry none) in slot 1.
// The door the sheet enters a fight through (Wave A1, RV48), after initialDuel (and withSpecials): slot 0's sheet and slot 1's (PvP only; a ladder foe is a creature row, off the sheet).
// Validated against the stat rows (known ids, whole numbers from base to cap); a side with every stat at base is left exactly as it was.
export const withSheet = (duel: Duel, sheets: readonly [Sheet | undefined, Sheet | undefined]): Duel => ({ ...duel, fighters: duel.fighters.map((f, i) => {
  const sh = checkSheet(sheets[i]);
  if (!sh) return f;
  const out: Fighter = { ...f, sheet: sh };
  if (sh.health !== undefined) { out.maxHealth = Math.round(statUp(sh, 'health', f.maxHealth)); out.health = out.maxHealth; }   // the health dial scales the bar once, as the perk's vitality does
  if (sh.recovery !== undefined) out.regen = statUp(sh, 'recovery', f.regen);   // recovery: stamina regeneration (a rate, never a duration of anything)
  return out;
}) as Duel['fighters'] });
export const withPerks = (duel: Duel, perks: readonly [Perk | undefined, Perk | undefined]): Duel => ({ ...duel, fighters: [withPerk(duel.fighters[0], perks[0]), withPerk(duel.fighters[1], perks[1])] });

// A fight with Special Moves: both fighters carry the rule's share (the opponent's is the boss share from RULES.special.bossFrom) and the first
// cast waits `first` ticks. `aiSkill`: the opponent's own class skill, which names his special in events and the finish. The one door, so a
// replay builds exactly what the live fight built.
// Slot b as a MELEE special (the specials PR, RV75): an existing class skill (a skill-defs row, so its move and clip already exist) on its own cooldown, started like slot a's first cast.
export const withSkill2 = (duel: Duel, side: Side, skill: SkillId): Duel => {
  const fighters = [duel.fighters[0], duel.fighters[1]] as [Fighter, Fighter];
  fighters[side] = { ...fighters[side], skill2: skill, skillCooldown2: fighters[side].skillCooldown2 ?? fighters[side].skillCooldown };
  return { ...duel, fighters };
};
export const withSpecials = (duel: Duel, level: number, aiSkill: SkillId | null, R: typeof RULES = RULES, name?: SpecialName | null): Duel => ({ ...duel, fighters: [
  { ...duel.fighters[0], specialShare: R.special.damage, skillCooldown: R.special.first },
  { ...duel.fighters[1], specialShare: level >= R.special.bossFrom || name ? R.special.bossDamage : R.special.damage, skillCooldown: R.special.first, skill: duel.fighters[1].skill ?? aiSkill, ...(name ? { specialName: name } : {}) },
] });
export const aim = (from: State, to: State): number => M.atan2(to.x - from.x, to.z - from.z);
export const distance = (a: State, b: State): number => M.hypot(a.x - b.x, a.z - b.z);
// At the ring wall with the given direction pointing out of the ring: the wall is behind a step that way.
export const walled = (body: State, dx: number, dz: number, radius: number = RADIUS): boolean => M.hypot(body.x, body.z) >= radius - RULES.wall.edge && body.x * dx + body.z * dz > 0;
// Ticks since the current phase began. `age` is the animation clock (a chambered swing rewinds it); `charge` counts the parked ticks,
// so age + charge is monotonic elapsed time — what perception and reaction delays must read.
export const elapsed = (f: Fighter): number => f.age + f.charge;
const baseTiming = (f: Fighter): Timing => f.chained && f.move ? movesOf(f)[f.move].chained! : movesOf(f)[f.move!];
export const timing = (f: Fighter): Timing => { let t = baseTiming(f); const c = commitOf(f.weapon, f.move), mt = missileTiming(f.weapon); if (c) t = { ...t, windup: t.windup + Math.round((t.windup * c.windup) / 100) }; if (mt) t = { ...t, windup: t.windup + Math.round((t.windup * mt.windup) / 100), recovery: t.recovery + Math.round((t.recovery * mt.recovery) / 100) }; return t; };   // sandbox-mech commitVsBait: a committed swing's longer tell
const isLight = (action: Action | null): boolean => action === 'light' || action === 'light_left' || action === 'light_right';
const baseGuard = (f: Fighter, R: typeof RULES): GuardProfile => ({ costScale: 1, arc: R.guardArc, window: R.parry, recovery: R.parryRecovery, commits: false, stopsHeavy: false, heavyBreaks: false, wide: false, postureDecay: 1, ...f.guardProfile });
// A stance never moves the parry window (v52, stance-era.ts: timing is sacred). Only while a record BELOW v52 replays does the old Defensive window (a quarter longer, stance.ts LEGACY) apply.
export const guardOf = (f: Fighter, R: typeof RULES = RULES): GuardProfile => { const g = baseGuard(f, R); return f.stance && !STANCE_ROWS_ON ? { ...g, window: Math.round(stanced(f, 'window', g.window)) } : g; };
// Directional guard (owner 2026-09-20, on by default): a guard or parry covers ONE of the five attack sides. The side is the DEFENDER's:
// facing each other, an attacker's `right` cut arrives on the defender's left, so a `left` guard meets a `right` cut; overhead, thrust
// and low match by name. No side chosen (the thumb still on the button) is the straight guard, `thrust` — never "everything".
export const mirror = (attack: Direction): Direction => attack === 'right' ? 'left' : attack === 'left' ? 'right' : attack;
export const guardSide = (f: Pick<Fighter, 'guardDirection'>): Direction => f.guardDirection ?? 'thrust';
export const covers = (f: Pick<Fighter, 'guardDirection' | 'guardProfile'>, attack: Direction, R: typeof RULES = RULES): boolean => {
  if (!R.directionalGuard || guardSide(f) === mirror(attack)) return true;
  const flank = (d: Direction) => d === 'left' || d === 'right';
  return !!f.guardProfile?.wide && flank(guardSide(f)) && flank(attack);   // a shield held to either flank covers both
};
// A swing may be feinted (cancelled into a fresh guard) only in its first ticks and only for a price.
export const feintable = (f: Fighter, R: typeof RULES = RULES): boolean => f.phase === 'attack' && f.move !== null && !commitOf(f.weapon, f.move) && f.age < movesOf(f)[f.move].feintUntil && f.stamina >= stanced(f, 'feint', R.feintCost);
// Ticks a committed phase lasts; null for phases that end on input.
function phaseLength(f: Fighter): number | null {
  if (f.phase === 'draw') return RULES.draw;
  if (f.phase === 'attack') return total(timing(f));
  if (f.phase === 'roll') return RULES.roll;
  if (f.phase === 'backstep') return RULES.backstep.ticks;
  if (f.phase === 'hurt' || f.phase === 'dead') return f.stun;
  return null;
}
// The tail of every committed phase accepts one queued action, so a press as you come out of a swing, a draw, a roll or a
// stagger is never lost. Death has no tail.
export function inBufferWindow(f: Fighter): boolean {
  const length = f.phase === 'dead' ? null : phaseLength(f);
  return length !== null && f.age >= length - RULES.bufferWindow;
}
function chooseMove(f: Fighter, action: Action): MoveId {
  if (action === 'skill2') return SKILL_MOVE[f.skill2!]!;   // slot b as a melee special: the picked class skill's own move row (legal() refuses it with none)
  if (action === 'skill') return SKILL_MOVE[f.skill ?? DAY_ONE_SKILL]!;   // the equipped skill's move (legal() refuses SKILL with none); never a riposte or a counter, whatever window is open
  if (action === 'heavy') return f.critical > 0 ? 'critical' : f.punish > 0 ? 'heavy_riposte' : f.counterWindow > 0 ? 'heavy_counter' : 'heavy_overhead';
  if (action === 'kick') return 'kick';
  if (f.punish > 0) return action === 'thrust' ? 'riposte' : 'slash_riposte';
  if (action === 'thrust') return 'thrust';
  if (action === 'light_left' || action === 'light_right') return action;
  return f.lastMove === 'light_right' ? 'light_left' : 'light_right';
}
// Spend a cast's cooldown on the slot that cast (spell-slot-defs sharedCooldown 1 = a cast from either slot starts both). Slot a is skillCooldown: a one-spell fight never touches the b field.
const coolSlot = (f: Fighter, ticks: number): void => {
  if (!f.castSlot || SHARED_COOLDOWN) f.skillCooldown = ticks;
  if (f.castSlot || (SHARED_COOLDOWN && f.skillCooldown2 !== undefined)) f.skillCooldown2 = ticks;
  delete f.castSlot;
};
// The spell of the cast in its windup (slot b when castSlot is set).
const castOf = (f: Fighter): Spell | undefined => f.castSlot ? f.spell2 : f.spell;
// Whether a fighter may start `action` right now; the same test the HUD uses to show enabled controls.
// sandbox spellHeal: a heal spell is paid in mana whatever its root's kind, and is refused once its per-fight use cap is spent.
const paysManaFor = (spell: string): boolean => (healOf(spell) ? MANA_MAX > 0 : paysMana(spellRoot(spell)));
const healSpent = (f: Fighter, s: Spell | undefined): boolean => { const h = healOf(s?.id); return !!h && (f.healUses ?? 0) >= h.uses; };
export function legal(f: Fighter, action: Action): boolean {
  if (!f.health || f.exhausted || f.special) return false;   // a committed special windup takes no other input
  if (f.specialRecover && (isLight(action) || action === 'heavy' || action === 'thrust' || action === 'kick' || action === 'skill' || action === 'skill2')) return false;
  { const mr = missileOf(f.weapon); if (mr && (isLight(action) || action === 'heavy' || action === 'thrust') && ((MANA_MAX && (f.mana ?? 0) < mr.mana) || (f.ammo !== undefined && f.ammo <= 0))) return false; }   // sandbox-mech missiles: a bolt is paid in mana, refused short of it
  if ((f.bound || f.disarmed) && (isLight(action) || action === 'heavy' || action === 'thrust' || action === 'skill')) return false;   // sandbox-mech bindAndDisarm: a bound blade or an empty hand has no swing   // the special's recovery: no attack until it ends
  // A committing parry (the Nightborn's, guard.commits) runs its window, and the exposure it ends in when it met nothing is a real recovery —
  // the blade is out of line — so no swing comes out of either. A man's parry yields to any action and his exposure only bares his guard.
  const g = guardOf(f), committed = g.commits && ((f.phase === 'guard' && f.parrying && !f.punish && f.age < g.window) || (f.phase === 'ready' && f.exposed > 0));
  const standing = (f.phase === 'ready' || f.phase === 'guard') && !committed;   // a guard yields to any action; it never eats an input
  const stepping = f.phase === 'backstep', stepTail = stepping && f.age >= RULES.backstep.cancelFrom;   // a backstep's tail cancels into a swing
  if (isLight(action)) return f.phase === 'sheathed' || ((standing || stepTail) && f.stamina >= movesOf(f)[chooseMove(f, action)].stamina);
  if (action === 'heavy' || action === 'thrust') return (standing || stepTail) && f.stamina >= movesOf(f)[chooseMove(f, action)].stamina;
  if (action === 'kick') return standing && f.stamina >= movesOf(f).kick.stamina;
  if (action === 'skill' && f.specialShare !== undefined) return !f.skillCooldown && (standing || stepTail) && !healSpent(f, f.spell) && (!f.spell || (paysManaFor(f.spell.id) ? (f.mana ?? 0) >= manaCost(f.spell.cost) : f.stamina >= f.spell.cost));   // a special: no stamina, any class; a SPELL costs its stamina and is refused short of it
  if (action === 'skill2' && f.skill2 !== undefined) return !f.skillCooldown2 && (standing || stepTail) && f.stamina >= movesOf(f)[SKILL_MOVE[f.skill2]!].stamina;   // slot b as a melee special: its own cooldown, the move row's stamina (the shared bar), no Special Moves needed
  if (action === 'skill2') return f.specialShare !== undefined && !!f.spell2 && !f.skillCooldown2 && (standing || stepTail) && !healSpent(f, f.spell2) && (paysManaFor(f.spell2.id) ? (f.mana ?? 0) >= manaCost(f.spell2.cost) : f.stamina >= f.spell2.cost);   // slot b: its own cooldown, the shared stamina bar; an empty slot is inert
  if (action === 'skill') return f.skill !== null && !f.skillCooldown && (standing || stepTail) && f.stamina >= movesOf(f)[SKILL_MOVE[f.skill]!].stamina;   // as a heavy, plus an equipped skill that has cooled
  if (action === 'dodge') return (standing && f.stamina >= RULES.rollCost) || (stepping && f.stamina >= RULES.rollCost - RULES.backstep.cost);   // holding the control turns the step into a roll
  if (action === 'backstep') return standing && f.stamina >= RULES.backstep.cost;
  return (f.phase === 'ready' && !f.exposed) || feintable(f);
}

// Every attack starts through one door: the transient modifiers of the previous action (charge, punish/critical windows, guard
// counter, parry state) are reset here and nowhere else, so no swing inherits the last one's bonuses.
function beginAttack(f: Fighter, id: MoveId, chained: boolean, foe: State): void {
  f.phase = 'attack'; f.age = 0; f.move = id; f.chained = chained; f.landed = false; f.chain = 0; f.lastMove = id; f.attackFrom = { x: f.body.x, z: f.body.z, gap: distance(f.body, foe) }; f.stall = 0;
  f.punish = 0; f.critical = 0; f.counterWindow = 0; f.charge = 0; f.charged = false; f.parrying = false; f.guardDirection = null; delete f.gambit;
  const beat = f.feintEdge; delete f.feintEdge; delete f.beat; if (beat) f.beat = true;   // a swing begun inside the beat after a trickster's feint is a beating one
}
export function stepDuel(duel: Duel, intents: [Intent, Intent], R: typeof RULES = RULES): Duel {
  const tick = duel.tick + 1, events: CombatEvent[] = [], before = duel.fighters, wall = duel.radius ?? RADIUS;   // the wall of THIS fight (RV40): the Pit's live circle unless the duel carries its own (the open world's is out of reach)
  // Crowd control lands through the target's ladder when it carries one (cc-ladder.ts: full, half, quarter, immune); without one the ticks are untouched.
  const stunned = (f: Fighter, source: CcSource, ticks: number): number => { if (!f.cc) return ticks; const r = ccApply(f.cc, source, tick + (duel.ccBase ?? 0), ticks, CC_LADDER, f.ccGuard); f.cc = r.ladder; return r.ticks; };
  // A committed special windup: the caster stands and tracks the target, whatever the thumb does (no guard, roll, parry or step).
  if (before[0].special || before[1].special) intents = [before[0].special ? idleIntent() : intents[0], before[1].special ? idleIntent() : intents[1]];
  const fighters = before.map(f => ({ ...f, age: f.stall > 0 ? f.age : f.age + 1, stall: Math.max(0, f.stall - 1), wound: Math.max(0, f.wound - 1), chain: Math.max(0, f.chain - 1), parryCooldown: Math.max(0, f.parryCooldown - 1), skillCooldown: Math.max(0, f.skillCooldown - 1), ...(f.skillCooldown2 !== undefined ? { skillCooldown2: Math.max(0, f.skillCooldown2 - 1) } : {}), punish: Math.max(0, f.punish - 1), critical: Math.max(0, f.critical - 1), posture: f.phase === 'hurt' || f.phase === 'dead' || f.postureRest > 0 ? f.posture : Math.max(0, f.posture - stanced(f, 'recover', R.posture.decay) * guardOf(f, R).postureDecay * (f.health < R.posture.bloodied * f.maxHealth ? R.posture.bloodiedDecay : 1)), postureRest: Math.max(0, f.postureRest - 1), rest: Math.max(0, f.rest - 1), exposed: Math.max(0, f.exposed - 1), evaded: Math.max(0, f.evaded - 1), counterWindow: Math.max(0, f.counterWindow - 1), buffer: f.buffer && f.buffer.ttl > 1 ? { ...f.buffer, ttl: f.buffer.ttl - 1 } : null })) as [Fighter, Fighter];
  for (const f of fighters) if (f.poiseRest) { if (f.poiseRest > 1) f.poiseRest--; else delete f.poiseRest; }
  for (const f of fighters) if (f.specialRecover) f.specialRecover--;
  for (const f of fighters) if (f.feintEdge) { f.feintEdge--; if (!f.feintEdge) delete f.feintEdge; }
  for (const i of [0, 1] as const) {   // sandbox-mech bindAndDisarm: a kick breaks the bind; an unbroken bind becomes a disarm; a disarm runs down
    const f = fighters[i]!;
    if (f.bound && intents[i].action === 'kick' && legal(before[i]!, 'kick')) { delete f.bound; delete f.boundHold; delete f.boundReact; }
    else if (f.bound && !--f.bound) { f.disarmed = f.boundHold; delete f.bound; delete f.boundHold; delete f.boundReact; }
    if (f.disarmed && !--f.disarmed) delete f.disarmed;
  }
  for (const f of fighters) if (f.poisonUntil) { const row = poisonOf(f.poisonEnemy); if (row && f.health > 1) f.health = Math.max(1, f.health - poisonTick(row, f.poisonUntil, tick)); if (f.poisonUntil < tick) { delete f.poisonUntil; delete f.poisonEnemy; } }   // sandbox-mech clockFighter: the poison ticks, never to death   // a trickster's feint beat runs down (RULES.feintBeat)
  if (!before[0].health || !before[1].health) return { tick, fighters, finish: duel.finish, events, ...(duel.bands ? { bands: true } : {}), ...(duel.roll ? { roll: duel.roll } : {}), ...(duel.gambit ? { gambit: duel.gambit } : {}), ...(duel.cast ? { cast: duel.cast } : {}), ...(duel.radius !== undefined ? { radius: duel.radius } : {}), ...(duel.ccBase !== undefined ? { ccBase: duel.ccBase } : {}), ...(duel.crowd ? { crowd: duel.crowd } : {}) };
  let gdraws = duel.gambit?.draws ?? 0, casts = duel.cast?.n ?? 0;   // casts: the seeded draws spells have taken so far (RV53)
  let hits = duel.roll?.hits ?? 0, lastRoll: number | undefined;   // the world-mob roll: a blow's health loss goes through rolled(); absent roll = the plain number
  // The sheet (RV48): the attacker's attack dial scales a blow up and the target's armour dial scales it down (an armour of 100 takes half) before the world roll; a blow is never scaled to nothing. No sheet on either side = the plain number.
  // A pierce blow (RV49, damage-kinds.ts) ignores `pen` of the target's armour dial; pen 0 (every move today) is the plain read.
  const geared = (base: number, from: Side, to: Side, pen = 0): number => {
    const sheeted = !!before[from].sheet || !!before[to].sheet;
    if (!sheeted && !before[to].stance) return base;
    const armour = before[to].sheet?.armour, held = pen && armour ? { ...before[to].sheet, armour: Math.round(armour * (1 - pen)) } : before[to].sheet;
    const y = sheeted ? statDown(held, 'armour', statUp(before[from].sheet, 'attack', base)) : base, z = stanced(before[to], 'damageTaken', y);   // v52: a stance's damageTaken row (Defensive takes 10% less); none = the number untouched
    if (!sheeted && z === y) return base;   // a stance with no damageTaken row (Aggressive, Trickster) and no sheet: the blow is exactly what it was
    const x = Math.round(z);
    return base > 0 ? Math.max(1, x) : x;
  };
  const crowded = (n: number, from: Side): number => { const c = duel.crowd; if (!c || c.from !== from) return n; const pct = crowdPercent(c.slot, c.kind); return pct >= 100 ? n : Math.max(1, Math.round(n * pct / 100)); };   // the Nth attacker on one target lands a percent of its blow (swarm-defs.json slots; slot 1 and a duel with no crowd are untouched)
  const rolled = (base: number, from: Side, to: Side, pen = 0): number => { const b = crowded(executed(geared(base, from, to, pen), before[from].move === 'critical', before[to].health, before[to].maxHealth), from); if (!duel.roll) return b; lastRoll = percentOf(rollUnit(duel.roll.seed, hits++), swarmBand(duel.roll.swarm, duel.roll.rank)); const dealt = rolledDamage(b, lastRoll); return from === 1 && duel.roll.attacker ? Math.round((dealt * attackerPerMille(duel.roll.attacker)) / 1000) : dealt; };   // sandbox-mech manyOnOne: the nth foe on the player hits for its row's share; the band widens with the swarm: the foes on the target (roll.ts SWARM_ROWS)
  const rollTag = () => (duel.roll && lastRoll !== undefined ? { roll: lastRoll } : {});
  const spend = (i: Side, cost: number) => {
    const f = fighters[i]; f.stamina = Math.max(0, f.stamina - cost); f.rest = R.regenDelay;
    if (!f.stamina && !f.exhausted) { f.exhausted = true; events.push({ tick, type: 'StaminaExhausted', actor: i }); }
  };
  // 1. Actions decide from the pre-tick state so neither fighter sees the other's move for this tick.
  for (const i of [0, 1] as const) {
    const me = before[i], foe = before[1 - i], intent = intents[i], next = fighters[i];
    if (intent.cancel) next.buffer = null;
    let action = intent.action;
    // The Gambit: a second heavy press after the chamber and before the strike arms the swing in hand (the same tell and timing as the heavy); the press is spent on it, never buffered.
    if (action === 'heavy' && me.gambitOn && !me.gambit && me.phase === 'attack' && me.move !== null && !me.chained && movesOf(me)[me.move].charges && movesOf(me)[me.move].chamber != null && me.age >= movesOf(me)[me.move].chamber! && me.age < timing(me).windup) {
      next.gambit = true; events.push({ tick, type: 'GambitArmed', actor: i, move: me.move }); action = null;
    }
    if (action && !legal(me, action)) { if (inBufferWindow(me)) next.buffer = { action, ttl: R.bufferTtl }; action = null; }
    if (!action && next.buffer && legal(me, next.buffer.action)) action = next.buffer.action;
    if (action) next.buffer = null;
    const face = (limit: number) => { if (intent.lock) next.body = { ...next.body, heading: next.body.heading + Math.max(-limit, Math.min(limit, wrapAngle(aim(next.body, foe.body) - next.body.heading))) }; };
    if (action === 'dodge') {
      // Direction locks at the press; without movement, roll away from the opponent. A roll grown out of a backstep pays the difference.
      const moving = M.hypot(intent.move.x, intent.move.z) > MOVE_EPSILON;
      next.body = { ...me.body, heading: moving ? advance(me.body, intent.move, foe.body, 1, wall).heading : aim(me.body, foe.body) + Math.PI };
      next.phase = 'roll'; next.age = 0; spend(i, me.phase === 'backstep' ? R.rollCost - R.backstep.cost : R.rollCost); events.push({ tick, type: 'ActionStarted', actor: i, action: 'roll' });
    } else if (action === 'backstep' && walled(me.body, -M.sin(me.body.heading), -M.cos(me.body.heading), wall)) {
      // Cornered: the wall is at the back, there is nowhere to step. The press is simply refused (a roll still works).
    } else if (action === 'backstep') {
      next.phase = 'backstep'; next.age = 0; next.parrying = false; next.guardDirection = null; spend(i, R.backstep.cost); events.push({ tick, type: 'ActionStarted', actor: i, action: 'backstep' });
    } else if ((action === 'skill' || action === 'skill2') && me.specialShare !== undefined && !(action === 'skill2' && me.skill2 !== undefined)) {
      // Special: committed from this tick; the cooldown is spent at commitment. Out of reach the press is refused and nothing is spent.
      const gap = distance(me.body, foe.body), cast = action === 'skill2' ? me.spell2 : me.spell, root = cast && spellRoot(cast.id);
      const bowRow = cast ? undefined : bowSpecialOf(me.weapon, action === 'skill2' ? me.skill2 : me.skill, gap, me.ammo);   // sandbox bowSpecial: beyond the missile gap a bow's special is arrows
      const heal = healOf(cast?.id);   // sandbox spellHeal: needs no range, windup from its row
      const cue = root && !heal ? spellRangeCue(root, gap) : !cast && !bowRow && SPECIAL_MELEE_REACH && gap > meleeSpecialReach(R.special.reach) ? 'far' as const : undefined;   // sandbox spellRange: a spell with a range row is cast only in its band (it replaces the special's reach); a melee special is pressed only inside its own, shorter reach (specialMeleeReach); out of range nothing is spent and a cue is shown
      if (cue) events.push({ tick, type: 'SpecialRefused', actor: i, cue, ...(cast ? { spell: cast.id } : {}) });   // the HUD floats the specialCue row's text over the caster
      else if (gap <= meleeSpecialReach(R.special.reach) || heal || (root && spellRangeOf(root)) || bowRow) {
        if (action === 'skill2') next.castSlot = 1; else delete next.castSlot;
        if (bowRow) { next.bowSpecial = bowRow.skill; if (next.ammo !== undefined) next.ammo -= bowRow.arrows; } else delete next.bowSpecial;   // the arrows are spent at the commit, like a spell's cost
        next.special = castWindup(me.sheet, heal ? heal.windup : bowRow ? bowRow.windup : !cast && SPECIAL_MELEE_WINDUP ? SPECIAL_MELEE_WINDUP : spellWindupOf(root, R.special.windup)); delete next.castHurt; delete next.castPush;   // sandbox specialMeleeWindup: a melee special (no spell) is as quick as a heavy swing, not the spell's 2 s delay
        next.phase = 'ready'; next.age = 0; next.parrying = false; next.guardDirection = null;
        if (cast && paysManaFor(cast.id)) { const f = fighters[i]!; f.mana = Math.max(0, (f.mana ?? 0) - manaCost(cast.cost)); f.manaRest = MANA_DELAY; }   // sandbox-mech mana: the cast is paid in mana, stamina untouched
        else if (cast) spend(i, cast.cost);   // the stamina is gone at the commit, whatever the outcome
        events.push({ tick, type: 'SpecialStarted', actor: i, ...(me.skill ? { move: SKILL_MOVE[me.skill] } : {}), ...(me.specialName ? { name: me.specialName } : {}), ...(cast ? { spell: cast.id } : {}) });
      }
    } else if (action === 'kick') {
      beginAttack(next, 'kick', false, foe.body); spend(i, perked(me, 'thrift', movesOf(next).kick.stamina));
      if (intent.lock) next.body = { ...me.body, heading: aim(me.body, foe.body) };
      events.push({ tick, type: 'AttackStarted', actor: i, move: 'kick' });
    } else if (isLight(action) || action === 'heavy' || action === 'thrust' || action === 'skill' || (action === 'skill2' && me.skill2 !== undefined)) {
      if (me.phase === 'sheathed') { next.phase = 'draw'; next.age = 0; events.push({ tick, type: 'ActionStarted', actor: i, action: 'draw' }); }
      else {
        const id = chooseMove(me, action!), def = movesOf(me)[id];
        // Chained timing: a listed follow-up inside the chain window, or a light out of an evade (dodge-attack).
        const follows = me.chain > 0 && me.lastMove !== null && !!movesOf(me)[me.lastMove].chain?.follow.includes(id);
        beginAttack(next, id, !!def.chained && (follows || (isLight(action) && (me.evaded > 0 || me.phase === 'backstep'))), foe.body); spend(i, missilePaysNoStamina(me.weapon) ? 0 : perked(me, 'thrift', def.stamina));
        if (action === 'skill2') next.skillCooldown2 = R.skillCooldown;   // slot b as a melee special: its own cooldown, spent at commitment like slot a
        if (action === 'skill') next.skillCooldown = R.skillCooldown;   // spent at commitment, with the stamina: a whiff, a block or a parry all spend it
        events.push({ tick, type: 'AttackStarted', actor: i, move: id, direction: def.direction });   // the side the blow comes from: what a guard must mirror (directional guard; the browser gate reads it)
      }
      face(R.turnStart);
    } else if (action === 'parry' && feintable(me, R)) {
      // Feint: the swing already paid for is abandoned into a guard; a fresh press still opens its parry window.
      const fresh = !me.parryCooldown;
      next.phase = 'guard'; next.age = fresh ? 0 : guardOf(me, R).window; next.move = null; next.guardDirection = intent.guardDirection ?? null; next.parrying = fresh; spend(i, stanced(me, 'feint', R.feintCost));
      if (me.stance === 'trickster') next.feintEdge = R.feintBeat;
      if (fresh) next.parryCooldown = R.parryCooldown;
      events.push({ tick, type: 'ActionStarted', actor: i, action: 'feint' });
    } else if ((action === 'parry' || intent.guard) && me.phase === 'ready' && !me.exhausted && !me.exposed) {
      const fresh = action === 'parry' && !me.parryCooldown;
      next.phase = 'guard'; next.age = fresh ? 0 : guardOf(me, R).window; next.guardDirection = intent.guardDirection ?? null; next.parrying = fresh;
      if (fresh) next.parryCooldown = R.parryCooldown;
      events.push({ tick, type: 'ActionStarted', actor: i, action: fresh ? 'parry' : 'guard' });
    }
  }
  // 2. Committed phases expire, then movement resolves — both against the other body as it stood at the start of the tick, so
  // neither index is privileged; any overlap that produces is split evenly afterwards.
  for (const i of [0, 1] as const) {
    const next = fighters[i], intent = intents[i], foe = before[1 - i].body, length = phaseLength(next), { window, recovery, commits } = guardOf(next, R);
    // A parry attempt that met nothing: a *released* tap leaves the fighter exposed for the guard's `recovery` ticks (R.parryRecovery unless the man's guard says otherwise; 0 = off); a guard still
    // *held* when the window closes simply becomes the standing guard (its first perfectBlock ticks are the perfect block). Holding Guard
    // therefore always guards — the only gamble in a parry is the tap. A punish window proves the parry connected. A committing parry
    // (guard.commits) has no such refuge: met nothing, it ends exposed whether or not the guard is held.
    // A held guard follows the thumb: the side may change mid-hold (a slide, or the warden re-reading late) without a new press.
    if (next.phase === 'guard' && intent.guard && R.directionalGuard) next.guardDirection = intent.guardDirection ?? null;
    if (next.phase === 'guard' && next.age >= window && next.parrying) { next.parrying = false; if (recovery > 0 && !next.punish && (!intent.guard || commits)) { next.phase = 'ready'; next.age = 0; next.exposed = recovery; } }
    if ((length !== null && next.age >= length && next.phase !== 'dead') || (next.phase === 'guard' && !intent.guard && next.age >= window)) {
      if (next.phase === 'attack' && !next.chained && next.move && movesOf(next)[next.move].chain) next.chain = movesOf(next)[next.move].chain!.window;
      if (next.phase === 'roll' || next.phase === 'backstep') next.evaded = R.dodgeAttackWindow;
      next.phase = 'ready'; next.age = 0; next.guardDirection = null; next.parrying = false;
    }
    // Chamber: a held swing pauses at its chamber tick (age is rewound each tick) until release or the maximum; a charging move held long enough becomes the charged swing.
    const chamber = next.phase === 'attack' && next.move !== null && !next.chained ? movesOf(next)[next.move].chamber : null;
    let parked = false;
    if (chamber !== null && next.age === chamber + 1 && intents[i].held && next.charge < R.charge.max) {
      next.age = chamber; next.charge++; parked = true;
      if (next.charge === 1) events.push({ tick, type: 'Charging', actor: i, move: next.move! });
      if (movesOf(next)[next.move!].charges && next.charge === R.charge.min) { next.charged = true; events.push({ tick, type: 'Charged', actor: i, move: next.move! }); }
    }
    if (next.phase === 'attack' && next.move && next.age < timing(next).windup) {
      // Wind-up: controlled turning toward the opponent and the move's lunge; a kick lunges too, so a backstep cannot walk out of a point-blank kick.
      if (intent.lock && next.move !== 'kick') next.body = { ...next.body, heading: next.body.heading + Math.max(-R.turnWindup, Math.min(R.turnWindup, wrapAngle(aim(next.body, foe) - next.body.heading))) };
      const lunge = movesOf(next)[next.move].stepIn;
      // A parked swing does not keep lunging: the lunge belongs to the wind-up, and the wind-up is paused. The kick's lunge is a stride at
      // everyone's pace: a quick fighter's (the Goblin's 1.2) otherwise out-ran a backstep, so no step back ever cleared his kick (Strategy, 2026-09-25).
      if (lunge && next.age > R.stepInFrom && !parked) next.body = advance(next.body, { x: M.sin(next.body.heading) * lunge, z: M.cos(next.body.heading) * lunge, yaw: 0, run: false }, foe, next.move === 'kick' ? 1 : next.speed, wall);
    } else if (next.phase === 'roll') {
      next.body = advance(next.body, { x: M.sin(next.body.heading), z: M.cos(next.body.heading), yaw: 0, run: true }, foe, next.speed, wall);
    } else if (next.phase === 'backstep') {
      // Straight back along the facing, still facing the opponent: no turn, no invulnerability, just distance.
      next.body = { ...advance(next.body, { x: -M.sin(next.body.heading) * R.backstep.speed, z: -M.cos(next.body.heading) * R.backstep.speed, yaw: 0, run: false }, foe, next.speed, wall), heading: next.body.heading };
    } else if (next.phase === 'ready' || next.phase === 'sheathed' || next.phase === 'guard') {
      const guarding = next.phase === 'guard', scale = (guarding ? (braced(next.oid) ? 0 : R.guardSpeed) : 1) * (next.exhausted ? R.exhaustedSpeed : 1) * (next.legWound ? R.attrition.legSpeed : 1), run = !guarding && !next.exhausted && intent.move.run && next.stamina > 0;
      const moved = advance(next.body, { x: intent.move.x * scale, z: intent.move.z * scale, yaw: intent.move.yaw, run }, foe, next.speed, wall);
      // Anti-turtling 2 (RULES.retreat): a tick that opens the gap to the opponent by more than `away` — inside the wall band, unless
      // `wallOnly` is off — regenerates no stamina (the sprinting tick's one-tick rest: regen resumes the tick he stops, strafes or advances).
      if (distance(moved, foe) - distance(next.body, foe) > R.retreat.away && (!R.retreat.wallOnly || M.hypot(moved.x, moved.z) >= wall - R.wall.loiter.band)) next.rest = Math.max(next.rest, 1);
      // Sprinting drains without the action delay: no regeneration on a sprinting tick, and it resumes the tick the sprint stops (an action's
      // regenDelay is for actions; a sprint that reset it every tick starved the bar for a second after every dash).
      if (run && moved.distance > next.body.distance) { next.stamina = Math.max(0, next.stamina - R.sprintCost); next.rest = Math.max(next.rest, 1); if (!next.stamina && !next.exhausted) { next.exhausted = true; events.push({ tick, type: 'StaminaExhausted', actor: i }); } }
      next.body = moved;
      if (intent.lock && next.phase !== 'sheathed' && !intent.move.run) next.body = { ...next.body, heading: aim(next.body, foe) };
    }
    // Regeneration: full while standing ready; a raised guard regenerates at half rate (it used to stop it, which made blocking a stamina trap).
    if (!next.rest && (next.phase === 'ready' || next.phase === 'sheathed' || next.phase === 'guard')) next.stamina = Math.min(next.maxStamina, next.stamina + R.regen * next.regen * (next.wound ? R.woundRegen : 1) * (next.phase === 'guard' ? R.guardRegen : 1));
    if (MANA_MAX && next.maxMana) { if (next.manaRest) next.manaRest--; else if (next.phase === 'ready' || next.phase === 'sheathed' || next.phase === 'guard') next.mana = Math.min(next.maxMana, (next.mana ?? 0) + manaRegenPerTick(next.sheet)); }   // sandbox-mech mana: regen when idle, slowed by armour
    if (next.exhausted && next.stamina >= R.exhaustRecover) next.exhausted = false;
  }
  // Symmetric separation: both may have stepped into the other's old position; push them apart by equal halves.
  {
    const [p, q] = [fighters[0].body, fighters[1].body], dx = q.x - p.x, dz = q.z - p.z, gap = M.hypot(dx, dz);
    if (gap < BODY_SPACING - GAP_EPSILON) {
      const push = (BODY_SPACING - gap) / PUSH_SPLIT, ux = gap > GAP_EPSILON ? dx / gap : M.sin(p.heading), uz = gap > GAP_EPSILON ? dz / gap : M.cos(p.heading);
      const clamp = (x: number, z: number) => { const r = M.hypot(x, z); return r > wall ? { x: x * wall / r, z: z * wall / r } : { x, z }; };
      fighters[0].body = { ...p, ...clamp(p.x - ux * push, p.z - uz * push) }; fighters[1].body = { ...q, ...clamp(q.x + ux * push, q.z + uz * push) };
    }
  }
  // Posture: `amount` on the target; at the maximum the target's posture breaks — a long stagger and a critical window for the other side.
  const shake = (target: Side, amount: number) => {
    const T = fighters[target], O = fighters[1 - target];
    if (!T.health || amount <= 0) return;
    T.posture = Math.min(R.posture.max, T.posture + statDown(T.sheet, 'poise', stanced(T, 'poise', perked(T, 'poise', amount)))); T.postureRest = R.posture.hold;
    if (T.posture < R.posture.max) return;
    T.posture = 0;
    const stun = stunned(T, 'postureBreak', R.posture.stun);
    if (!stun) return;   // immune to a further stun in this window: the bar resets, nothing else happens
    T.phase = 'hurt'; T.age = 0; T.stun = Math.max(T.stun, stun); T.buffer = null; T.counterWindow = 0; T.charge = 0; T.charged = false;
    O.punish = stun; O.critical = stun;
    events.push({ tick, type: 'PostureBroken', actor: (1 - target) as Side, target, ticks: stun });
  };
  // 2b. The lorarii (RULES.wall.loiter): a fighter idling within `band` of the wall for `ticks` without attacking is whipped — chip (never
  // the last point of health), posture, a shove toward the centre — and again every `again` ticks while he stays. Attacking, leaving the band
  // or dying resets the clock.
  // Both fighters, so the warden cannot camp the wall either. Event sides: actor = target = the whipped fighter.
  for (const i of [0, 1] as const) {
    const F = fighters[i], L = R.wall.loiter, r = M.hypot(F.body.x, F.body.z);
    const still = F.health && !duel.finish && r >= wall - L.band && F.phase !== 'attack';
    F.loiter = still ? F.loiter + 1 : 0;
    if (!still) F.lashed = false;   // he attacked, left the band or died: the spell is over and the next lash is a first one again
    // The tell. A raise is emitted exactly once per lash, `lead` ticks before it: `raise` before the first, the shorter `raiseAgain` before
    // a repeat. The counters cannot collide — on a lash tick `loiter` is `ticks` here and is only then reset to `ticks - again`, so it never
    // reads the first-raise threshold on the way back up.
    const lead = F.lashed ? L.raiseAgain : L.raise;
    if (still && F.loiter === L.ticks - lead) events.push({ tick, type: 'WhipRaised', actor: i, target: i, x: F.body.x, z: F.body.z, lead, guard: lorariusGuard(F.body) });
    if (F.loiter < L.ticks) continue;
    F.loiter = L.ticks - L.again;   // the next lash comes `again` ticks later while he stays
    F.lashed = true;
    events.push({ tick, type: 'Whipped', actor: i, target: i, x: F.body.x, z: F.body.z, damage: L.chip, guard: lorariusGuard(F.body) });
    F.health = Math.max(1, F.health - L.chip);
    shake(i, L.posture);
    // The shove drives him back into the fight: toward the opponent when he is near (a shove to the centre there pushed a cornered man OUT
    // of his opponent's reach — the lash was rescuing the turtle), else toward the centre; a man already at grips is lashed but not moved.
    const O = fighters[1 - i].body, g = M.hypot(O.x - F.body.x, O.z - F.body.z), toward = g < L.into ? { x: (O.x - F.body.x) / g, z: (O.z - F.body.z) / g } : { x: -F.body.x / r, z: -F.body.z / r };
    if (g >= 1) F.body = { ...F.body, x: F.body.x + toward.x * L.shove, z: F.body.z + toward.z * L.shove };   // already at grips (< 1 m): nothing to drive him into
  }
  // 3. Contacts resolve simultaneously against a snapshot, so a trade lands both blows and neither side is favoured by order.
  const snapshot = [{ ...fighters[0] }, { ...fighters[1] }] as const;
  let finish = duel.finish;
  for (const i of [0, 1] as const) {
    const j = (1 - i) as Side, a = snapshot[i], d = snapshot[j], A = fighters[i], D = fighters[j];
    if (a.phase !== 'attack' || a.landed || !a.move) continue;
    const def = movesOf(a)[a.move], t = timing(a), pathId = a.chained ? def.chainPath : def.path, charged = a.charged, weapon = weaponOf(a.weapon);
    if (a.age === t.windup) events.push({ tick, type: 'AttackActive', actor: i, move: a.move });
    const mrow = missileOf(a.weapon);
    if (mrow) {   // sandbox-mech missiles: the swing throws a bolt instead of striking; nothing is struck in melee
      const lane = laneOf(a.move);
      if (a.age === t.windup && lane) {
        const gap = a.attackFrom?.gap ?? distance(a.body, d.body);
        if ((MANA_MAX && (A.mana ?? 0) < mrow.mana) || (A.ammo !== undefined && A.ammo <= 0)) events.push({ tick, type: 'AttackMissed', actor: i, move: a.move });
        else {
          if (MANA_MAX) { A.mana = (A.mana ?? 0) - mrow.mana; A.manaRest = MANA_DELAY; }
          if (A.ammo !== undefined) A.ammo--;
          if (gap >= missileMinGap() && !A.missile) {
            const ang = MISSILE_HOMING ? aim(a.body, d.body) : a.body.heading + (lane.lane * MISSILE_FAN * Math.PI) / 180, range = distance(a.body, d.body);
            A.missile = { launched: tick, arrives: tick + missileTicks(mrow, range), x: a.body.x, z: a.body.z, dx: M.sin(ang), dz: M.cos(ang), range, damage: Math.round((def.damage * mrow.share * (lane.mult ?? 1000)) / 1000000), move: a.move, lane: lane.lane };
            events.push({ tick, type: 'MissileLaunched', actor: i, target: j, move: a.move, lane: lane.lane });
          } else events.push({ tick, type: 'AttackMissed', actor: i, move: a.move });   // inside the inner band (a hard miss) or a bolt already in flight
        }
      }
      continue;
    }
    let location: HitLocation | null = null;
    if (pathId) {
      if (a.age < t.windup || a.age >= t.windup + t.active) continue;
      // A thrust started inside a pole's minimum reach drives the point past the target: it meets nothing (the sweep and the kick have no such hole).
      // Judged from where it started: the lunge closes any gap to touching, so the gap at contact says nothing about where the point went.
      location = a.attackFrom !== null && a.attackFrom.gap < (def.minReach ?? 0) ? null : bladeImpact(a.rig, a.weapon, pathId, a.age - 1, a.age, before[i].body, a.body, before[j].body, d.body, d.scale);
      // A miss is reported once, as the window closes. A thrust that meets nothing overextends: its clock hangs at full extension for `whiff` ticks
      // (the window-closing tick repeats while stalled, so the report is keyed on the stall not having started).
      if (!location && a.age === t.windup + t.active - 1 && before[i].stall === 0) { events.push({ tick, type: 'AttackMissed', actor: i, move: a.move }); if (a.move === 'thrust') A.stall = R.stopHit.whiff; }
    } else {
      if (a.age !== t.windup) continue;
      if (distance(a.body, d.body) <= def.reach && Math.abs(wrapAngle(aim(a.body, d.body) - a.body.heading)) < R.kickArc) location = 'torso';
      else events.push({ tick, type: 'AttackMissed', actor: i, move: a.move });
    }
    if (!location) continue;
    A.landed = true;
    const g = guardOf(d, R), facing = Math.abs(wrapAngle(aim(d.body, a.body) - d.body.heading)) <= g.arc;
    const kind = kindOf(def.damageKind), pen = kind?.penetration ?? 0;   // RV49: the move's damage kind (slash drains stamina, crush adds posture, pierce ignores armour); none = the plain blow
    const dealtPosture = (x: number): number => { const p = stanced(a, 'posture', kind ? x * kind.posture : x); return a.move === 'kick' && d.phase === 'guard' ? stanced(a, 'kickPosture', p) : p; };   // posture this blow deals: the attacker's stance (aggressive +10%; a trickster's kick +50% against a HELD guard only)
    const raised = d.phase === 'guard' && facing, guarding = raised && covers(d, def.direction, R);   // raised: any guard up; guarding: the side covers this attack
    // A Trickster's beating swing (it began inside the beat after his own feint) ignores a PASSIVELY held guard: one past its parry window and the perfect-block ticks. A timed parry, a perfect block and a
    // guard that has not yet come up still answer it, which is what a Defensive stance's wider window is for. Only a stance-carrying fighter ever has `beat`.
    const beaten = !!a.beat && guarding && d.age >= g.window + R.perfectBlock;
    const breaks = (def.breaksGuard || charged || (g.heavyBreaks && def.direction === 'overhead')) && !g.stopsHeavy, blockCost = stanced(d, 'block', perked(d, 'guard', def.staminaDamage * g.costScale));
    const stagger = (ticks: number) => {
      const wall = walledHit ? stunned(D, 'wallSlam', R.wall.stagger) : 0;
      D.phase = D.health ? 'hurt' : 'dead'; D.age = 0; D.stun = D.health ? ticks + wall + (D.exhausted && (def.charges || a.move === 'kick') ? stunned(D, 'exhaustedHeavy', R.exhaustedStun) : 0) : R.death; D.buffer = null; D.counterWindow = 0;
      events.push({ tick, type: 'Staggered', actor: j, ticks: D.stun, ...(walledHit ? { walled: true } : {}) });
      if (walledHit) shake(j, R.wall.posture);
    };
    let walledHit = false;
    const wound = (damage: number, knockback: number, mark = !!def.path) => {
      D.health = Math.max(0, D.health - damage);
      if (mark) {
        D.wound = R.wound; D.woundSite = location!;
        // Attrition: a blade wound costs part of the bar's ceiling for the rest of the duel; a leg wound slows the walk.
        D.maxStamina = Math.max(R.attrition.floor, D.maxStamina - R.attrition.stamina); D.stamina = Math.min(D.stamina, D.maxStamina);
        if (location === 'legs') D.legWound = true;
        for (const id of woundsAt(location!, (D.health * 100) / D.maxHealth)) if (!D.scars?.includes(id)) { D.scars = [...(D.scars ?? []), id]; if (woundCeil(id)) { D.maxStamina = Math.max(R.attrition.floor, D.maxStamina - woundCeil(id)); D.stamina = Math.min(D.stamina, D.maxStamina); } }
      }
      const away = aim(d.body, a.body) + Math.PI;
      for (let k = 0; k < knockback; k++) D.body = { ...advance(D.body, { x: M.sin(away), z: M.cos(away), yaw: 0, run: false }, A.body, 1, wall), heading: D.body.heading };
      // The ring wall: knockback that ends against the wall is a second impact — extra stagger and posture (kicks shove; see stagger()).
      walledHit = knockback > 0 && D.health > 0 && walled(D.body, M.sin(away), M.cos(away), wall);
      if (!D.health) { finish = finish ? { ...finish, draw: true } : { victim: j, location: location!, move: a.move!, heading: a.body.heading }; events.push({ tick, type: 'Killed', actor: i, target: j, move: a.move!, location: location!, heading: a.body.heading }); }
    };
    // A low blade (the sweep) trips a roll in its first half: the roller is going down into it. The kick has no blade and is rolled as before.
    const trip = d.phase === 'roll' && def.direction === 'low' && def.path !== null && d.age < R.roll / ROLL_HALF;
    if (d.phase === 'roll' && d.age >= R.safeStart && d.age <= R.safeEnd && !trip) { events.push({ tick, type: 'Dodged', actor: j, target: i, move: a.move }); if (DODGE_COUNTER > 0) D.counterWindow = DODGE_COUNTER; }   // sandbox-mech: a clean dodge opens the guard-counter window too
    else if (guarding && wardOf(d.oid) && (D.wardAt ?? 0) <= tick) {   // sandbox-mech ward: the first blow into the guard is thrown back, then the ward is down
      const w = wardOf(d.oid)!, back = Math.min(A.health - 1, Math.round(rolled(def.damage, i, j, pen) * w.reflect / 1000));
      D.wardAt = tick + w.down; A.health -= Math.max(0, back); A.phase = 'hurt'; A.age = 0; A.stun = Math.max(1, stunned(A, 'parryStun', R.parryStun)); A.buffer = null;
      events.push({ tick, type: 'Hit', actor: j, target: i, move: a.move, damage: Math.max(0, back), location: 'torso', heading: d.body.heading, weapon: weapon.id, material: weapon.material }, { tick, type: 'Staggered', actor: i, ticks: A.stun });
    } else if (guarding && d.age < g.window && def.parryable) {
      const parried = Math.max(1, stunned(A, 'parryStun', R.parryStun));   // never under 1 tick: the parried cut still ends
      A.phase = 'hurt'; A.age = 0; A.stun = parried; A.buffer = null; D.punish = parried;
      events.push({ tick, type: 'Parried', actor: j, target: i, move: a.move, weapon: weapon.id, material: weapon.material }, { tick, type: 'Staggered', actor: i, ticks: parried });
      shake(i, R.posture.parry);
    } else if (raised && !guarding && def.vsGuard) {   // a kick into a guard held on any other side: the shove lands as before. The low guard braces it — an ordinary block below.
      const hit = rolled(def.damage, i, j, pen); spend(j, def.vsGuard.staminaDamage); wound(hit, def.knockback); events.push({ tick, type: 'Hit', actor: i, target: j, move: a.move, damage: hit, ...rollTag(), location, heading: a.body.heading, guarded: true, weapon: weapon.id, material: weapon.material }); stagger(def.vsGuard.stagger); shake(j, dealtPosture(def.posture));
    } else if (guarding && !beaten && !breaks && d.stamina >= (d.age - g.window < R.perfectBlock ? blockCost * R.perfectBlockCost : blockCost)) {
      // A guard raised just in time (its first perfectBlock ticks as a block, never a parry window) pays half and stops the chip; the
      // discounted price is what has to be affordable.
      const perfect = d.age - g.window < R.perfectBlock, cost = perfect ? blockCost * R.perfectBlockCost : blockCost, chip = perfect ? 0 : Math.round(def.damage * def.chip * R.location[location]), taken = chip ? rolled(chip, i, j, pen) : 0;
      spend(j, cost); D.counterWindow = STANCE_ROWS_ON ? R.guardCounter : stanced(d, 'counter', R.guardCounter);   // a block opens the guard-counter window (the same for every stance from v52; a Defensive record below it keeps its quarter longer)
      { const br = bindOf(d.weapon); if (br && !A.bound && !A.disarmed) { A.bound = br.window; A.boundHold = br.hold; A.boundReact = br.react; } }
      events.push({ tick, type: 'Blocked', actor: j, target: i, move: a.move, stamina: cost, perfect, weapon: weapon.id, material: weapon.material, ...(chip ? { damage: taken, ...rollTag() } : {}) });
      if (chip) { wound(taken, 0, false); if (!D.health) stagger(0); }   // chip never marks a wound, but it can still kill
      shake(j, dealtPosture(def.posture * (perfect ? R.posture.perfect : 1)));
    } else {
      const damage = Math.round(stanced(a, 'damage', def.charges ? stanced(a, 'heavyDamage', def.damage) : def.damage) * R.location[location] * (charged ? R.charge.damage : 1) * (duel.bands && a.attackFrom ? bandFactor(a.weapon, a.attackFrom.gap) : 1) * (ARMOUR_ON ? armourPerMille(a.weapon, a.move!, d.sheet, d.oid, j) / 1000 : 1)), baseStun = Math.round(def.stagger * (charged ? R.charge.stagger : 1));
      if (guarding && !beaten) { const hit = rolled(damage, i, j, pen); spend(j, perked(d, 'guard', R.breakCost)); wound(hit, def.knockback); events.push({ tick, type: 'GuardBroken', actor: i, target: j, move: a.move, damage: hit, ...rollTag(), location, heading: a.body.heading, charged, weapon: weapon.id, material: weapon.material }); stagger(baseStun); D.posture = 0; }
      else {
        // Hyper-armour: a heavy parked at its chamber, a charged heavy, or any move past its poise point. A short hold that was released
        // uncharged is a plain heavy again (armour from its poise tick only).
        const poised = d.phase === 'attack' && d.move !== null && ((!!commitOf(d.weapon, d.move) && d.age < timing(d).windup + timing(d).active) || (movesOf(d)[d.move].charges && (d.charged || (d.charge > 0 && d.age === movesOf(d)[d.move].chamber)) && d.age < timing(d).windup + timing(d).active) || (movesOf(d)[d.move].poise >= def.stagger && d.age >= movesOf(d)[d.move].poiseFrom && d.age < timing(d).windup + timing(d).active));
        // Counter-hit and rear-hit multiply the clean hit; they never apply through a guard or a parry.
        const counter = d.phase === 'attack' || (d.phase === 'roll' && d.age > R.safeEnd);
        // The thrust is the stop-hit: into a swing, or into an opponent walking onto the point, it lands harder than a cut's counter-hit.
        // Walking onto the point: since the thrust started, the target has come at least stopHit.walk closer to where it started from (its own steps; the lunge does not count).
        const advancing = (d.phase === 'ready' || d.phase === 'guard') && a.attackFrom !== null && distance(d.body, { ...d.body, x: a.attackFrom.x, z: a.attackFrom.z }) < a.attackFrom.gap - R.stopHit.walk;
        const stop = a.move === 'thrust' && (counter || advancing);
        const rear = Math.abs(wrapAngle(aim(d.body, a.body) - d.body.heading)) > Math.PI - R.rear.arc / ARC_HALF;
        const side = !!FLANK_DAMAGE && d.phase === 'guard' && !facing && !rear;   // sandbox-mech flank: a side blow on a raised guard
        const plain = Math.round(damage * (stop ? R.stopHit.damage : counter ? R.counter.damage : 1) * (rear ? (d.phase === 'hurt' ? R.rear.downed : R.rear.damage) : 1) * (side ? FLANK_DAMAGE / 1000 : 1)), stun = Math.round(baseStun * (stop ? R.stopHit.stagger : counter ? R.counter.stagger : 1) * (rear ? R.rear.stagger : 1));
        // The Gambit (src/fight/gambit.ts): an armed swing that meets an open body draws once. Landed: the heavy's number times the odds' multiplier (capped from above 40% health), no shrug, the posture
        // times the same; failed: nobody is hurt and the thrower staggers. A guard, a parry or an evade settles it as the plain heavy (the draw is never taken).
        const g = a.gambit && duel.gambit ? resolveGambit(plain, gambitUnit(duel.gambit.seed, gdraws++), d.health, d.maxHealth) : null;
        const dealt = g?.landed ? g.damage : plain;
        if (g && !g.landed) {
          A.phase = 'hurt'; A.age = 0; A.stun = Math.max(1, stunned(A, 'gambitFail', R.gambit.stagger)); A.buffer = null; A.counterWindow = 0; A.charge = 0; A.charged = false; A.move = null; A.landed = true;
          events.push({ tick, type: 'GambitFailed', actor: i, target: j, move: a.move }, { tick, type: 'Staggered', actor: i, ticks: A.stun });
          continue;
        }
        if (!def.path) spend(j, def.staminaDamage);
        // Poise: a brute shrugs a plain blow under his threshold — no stagger, no knockback; the wound and the posture still count.
        // v54 (poise-ladder.ts): a creature with poise also has a FLINCH tier between the shrug and the full stagger, and a full stagger buys poise-rest. Below v54, or for a fighter without poise, the single threshold.
        const tier = POISE_LADDER_ON && !g && !poised && d.poise > 0 && !counter && !stop && !rear && !charged ? poiseTier(dealt, d.poise, !!d.poiseRest) : null;
        const shrugged = !g && (poised || (tier ? tier === 'shrug' : dealt < d.poise && !counter && !stop && !rear && !charged));
        const hit = rolled(dealt, i, j, pen); if (kind?.drain) spend(j, Math.round(hit * kind.drain)); const bandPM = duel.bands && a.attackFrom ? bandFactor(a.weapon, a.attackFrom.gap) : 1; wound(hit, shrugged ? 0 : def.knockback * bandPM); events.push({ tick, type: 'Hit', actor: i, target: j, move: a.move, damage: hit, ...rollTag(), location, heading: a.body.heading, counter: counter || stop, rear, charged, ...(bandPM < 1 ? { glance: true } : {}), ...(g ? { gambit: true } : {}), ...(beaten ? { beaten: true } : {}), ...(raised ? { guarded: true } : {}), weapon: weapon.id, material: weapon.material, ...(stop ? { stop: true } : {}), ...(trip ? { trip: true } : {}) });
        if (!shrugged || !D.health) stagger(tier === 'flinch' ? flinchTicks(stun) : stun);
        if (tier === 'stagger' && D.health && LADDER.immunity) D.poiseRest = LADDER.immunity;
        shake(j, dealtPosture(def.posture * (counter ? R.counter.damage : 1) * (rear ? R.rear.posture : 1) * (side ? FLANK_POSTURE / 1000 : 1) * (g ? GAMBIT_ODDS.multiplier : 1)));
      }
    }
  }
  // 4. Special Moves, after the blows of this tick. Releases first, both sides at once: the release tick lands whatever happened to the caster
  // on it, and a lethal release on the tick he fell is a double kill through the draw. Unblockable and undodgeable. Then every windup still
  // running counts down, and one whose caster has fallen fizzles.
  const releasing = [fighters[0].special === 1, fighters[1].special === 1], standing = [fighters[0].health > 0, fighters[1].health > 0];
  const breathed = [false, false], volleyed = [false, false];   // a breath that began this tick pulses from the next one   // both judged before either lands
  for (const i of [0, 1] as const) {
    const j = (1 - i) as Side, A = fighters[i], D = fighters[j];
    if (!releasing[i]) continue;
    const spell = castOf(A);   // slot a or b: the cooldown below is that slot's own (spell-slot-defs sharedCooldown 1 = both)
    A.special = 0; delete A.castHurt; delete A.castPush; coolSlot(A, R.special.cooldown); A.specialRecover = R.special.recovery;   // re-armed and held back from attacking, counted from the release
    const bowRow = A.bowSpecial && !spell ? bowSpecialOf(A.weapon, A.bowSpecial, Infinity, undefined) : undefined;   // A.bowSpecial stays set through the recovery (the renderer plays the bow's loose clip off it); the next cast sets or clears it
    if (!standing[j]) continue;
    if (bowRow) {   // sandbox bowSpecial: the special's arrows fly through the one missile model (a roll dodges them all, a guard blocks the lanes it covers)
      const move: MoveId = SKILL_MOVE[A.skill ?? DAY_ONE_SKILL]!, range = distance(A.body, D.body);
      A.missile = { launched: tick, arrives: tick + missileTicks({ speed: bowRow.speed }, range), x: A.body.x, z: A.body.z, dx: M.sin(aim(A.body, D.body)), dz: M.cos(aim(A.body, D.body)), range, damage: Math.round((A.specialShare! * D.maxHealth * bowRow.mult) / 1000), move, lane: 0, lanes: bowRow.lanes, ...(bowRow.react ? { react: true } : {}), ...(bowRow.pin ? { pin: bowRow.pin } : {}), ...(bowRow.posture ? { posture: bowRow.posture } : {}), ...(bowRow.tint ? { tint: bowRow.tint } : {}) };
      events.push({ tick, type: 'MissileLaunched', actor: i, target: j, move, lane: 0 });
      continue;
    }
    if (SPECIAL_MELEE_REACH && !spell && distance(A.body, D.body) > meleeSpecialRelease()) { events.push({ tick, type: 'SpecialFizzled', actor: i }); continue; }   // sandbox specialMeleeReach: the foe stepped out of reach during the windup, the swing finds nothing
    // v55 (cone-rules.ts): a special with a cone row breathes instead of striking once: the heading is fixed on the target now, the pulses follow, and the caster is held back until the last of them is done.
    const cone = CONE_ON && !spell ? coneOf(A.specialName) : undefined;
    if (cone) { A.breath = { k: 0, wait: 0, heading: aim(A.body, D.body) }; A.specialRecover = R.special.recovery + breathTicks(cone); breathed[i] = true; continue; }
    const move: MoveId = SKILL_MOVE[A.skill ?? DAY_ONE_SKILL]!;
    const heal = spell ? healOf(spell.id) : undefined;   // sandbox spellHeal: restores the caster's own health, no roll, no damage
    if (heal) {
      const amount = Math.round(heal.share * A.maxHealth / 1000);
      A.health = Math.min(A.maxHealth, A.health + amount); A.healUses = (A.healUses ?? 0) + 1;
      events.push({ tick, type: 'SpecialLanded', actor: i, target: i, move, damage: 0, heal: amount, spell: spell!.id, outcome: 'success' });
      continue;
    }
    // A spell resolves its outcome from the seeded stream (one draw per cast that lands on a standing target); a fizzle spent its stamina and re-armed the full cooldown above, and deals nothing.
    const outcome = spell && duel.cast ? castOutcome(spell, rollUnit(duel.cast.seed, casts++)) : undefined, mult = spell && outcome ? outcomeMult(spell, outcome) : 1;
    if (spell && outcome && !mult) { events.push({ tick, type: 'SpecialFizzled', actor: i, spell: spell.id, outcome }); continue; }
    const total = crowded(Math.round((spell && outcome ? spell.share * mult : A.specialShare!) * D.maxHealth), i), pulsed = !!spell && spell.hits.length > 1, damage = pulsed ? splitDamage(spell.hits, total, 0) : total;   // RV69: a root with a hit row lands pulse 0 now and the rest every `hitEvery` ticks, the same total
    const flight = spell && outcome ? spellRangeOf(spellRoot(spell.id) ?? '') : undefined;
    if (flight?.speed && !A.missile) {   // a long spell (sandbox spellRange) goes through the one missile model: it arrives after its travel time and a roll or a guard answers it
      const range = distance(A.body, D.body);
      A.missile = { launched: tick, arrives: tick + missileTicks({ speed: flight.speed }, range), x: A.body.x, z: A.body.z, dx: M.sin(aim(A.body, D.body)), dz: M.cos(aim(A.body, D.body)), range, damage, move, lane: 0, spell: spell!.id, outcome: outcome!, ...(flight.tint ? { tint: flight.tint } : {}) };
      events.push({ tick, type: 'MissileLaunched', actor: i, target: j, move, lane: 0, spell: spell!.id });
      continue;
    }
    D.health = Math.max(0, D.health - damage);
    if (pulsed) { A.volley = { k: 0, wait: 0, total, hits: spell.hits, every: spell.hitEvery }; volleyed[i] = true; if (spell.hitHolds) A.specialRecover = R.special.recovery + spell.hitEvery * (spell.hits.length - 1); }
    { const pr = poisonOf(A.oid); if (pr && D.health) { D.poisonUntil = tick + pr.duration; D.poisonEnemy = A.oid!; } }
    events.push({ tick, type: 'SpecialLanded', actor: i, target: j, move, damage, ...(A.specialName ? { name: A.specialName } : {}), ...(spell && outcome ? { spell: spell.id, outcome } : {}), ...(pulsed ? { pulse: 0 } : {}) });
    if (SPECIAL_REACT && !spell && D.health) {   // sandbox specialReact: a landed melee special staggers, shoves and shakes the victim by its move row, like a landed blow (no canned animation: the sim decides)
      const def = movesOf(A)[move], away = aim(D.body, A.body) + Math.PI;
      for (let k = 0; k < Math.round(percentScaled(def.knockback, SPECIAL_REACT_KNOCK)); k++) D.body = { ...advance(D.body, { x: M.sin(away), z: M.cos(away), yaw: 0, run: false }, A.body, 1, wall), heading: D.body.heading };
      D.phase = 'hurt'; D.age = 0; D.stun = Math.max(D.stun, Math.round(percentScaled(def.stagger, SPECIAL_REACT_STAGGER)), specialReactFloorOf(String(move).replace(/^skill_/, ''))); D.buffer = null; D.counterWindow = 0; D.charge = 0; D.charged = false;
      events.push({ tick, type: 'Staggered', actor: j, ticks: D.stun });
      shake(j, percentScaled(def.posture, SPECIAL_REACT_POSTURE));
    }
    if (D.health) continue;
    delete A.volley;
    D.phase = 'dead'; D.age = 0; D.stun = R.death; D.buffer = null;
    finish = finish ? { ...finish, draw: true } : { victim: j, location: 'torso', move, heading: A.body.heading };
    events.push({ tick, type: 'Killed', actor: i, target: j, move, location: 'torso', heading: A.body.heading });
  }
  // 4b. Breaths (v55): every `every` ticks a pulse tests the cone from the caster's position along the heading fixed at the release; inside it the pulse deals its ramp weight of the special's damage.
  for (const i of [0, 1] as const) {
    const j = (1 - i) as Side, A = fighters[i], D = fighters[j], b = A.breath;
    if (!b || breathed[i]) continue;
    const cone = coneOf(A.specialName);
    if (!cone || !A.health) { delete A.breath; continue; }
    if (b.wait + 1 < cone.every) { A.breath = { ...b, wait: b.wait + 1 }; continue; }
    if (b.k + 1 >= cone.ramp.length) delete A.breath; else A.breath = { k: b.k + 1, wait: 0, heading: b.heading };
    if (!D.health || !inCone(cone, distance(A.body, D.body), wrapAngle(aim(A.body, D.body) - b.heading))) continue;
    const move: MoveId = SKILL_MOVE[A.skill ?? DAY_ONE_SKILL]!, damage = pulseDamage(cone, Math.round(A.specialShare! * D.maxHealth), b.k);
    D.health = Math.max(0, D.health - damage);
    { const pr = poisonOf(A.oid); if (pr && D.health) { D.poisonUntil = tick + pr.duration; D.poisonEnemy = A.oid!; } }
    events.push({ tick, type: 'SpecialLanded', actor: i, target: j, move, damage, name: A.specialName!, pulse: b.k, cone: true, damageKind: cone.damageKind });
    if (D.health) continue;
    D.phase = 'dead'; D.age = 0; D.stun = R.death; D.buffer = null;
    finish = finish ? { ...finish, draw: true } : { victim: j, location: 'torso', move, heading: A.body.heading };
    events.push({ tick, type: 'Killed', actor: i, target: j, move, location: 'torso', heading: A.body.heading });
  }
  // 4c. Volleys (RV69): every `every` ticks the next pulse of a spell landing as pulses deals its weight of the landing's total; the volley stops when the target falls or the caster does.
  for (const i of [0, 1] as const) {
    const j = (1 - i) as Side, A = fighters[i], D = fighters[j], v = A.volley;
    if (!v || volleyed[i]) continue;
    if (!A.health || !D.health) { delete A.volley; continue; }
    if (v.wait + 1 < v.every) { A.volley = { ...v, wait: v.wait + 1 }; continue; }
    const k = v.k + 1, move: MoveId = SKILL_MOVE[A.skill ?? DAY_ONE_SKILL]!, damage = splitDamage(v.hits, v.total, k);
    if (k + 1 >= v.hits.length) delete A.volley; else A.volley = { ...v, k, wait: 0 };
    D.health = Math.max(0, D.health - damage);
    events.push({ tick, type: 'SpecialLanded', actor: i, target: j, move, damage, pulse: k });
    if (D.health) continue;
    D.phase = 'dead'; D.age = 0; D.stun = R.death; D.buffer = null;
    finish = finish ? { ...finish, draw: true } : { victim: j, location: 'torso', move, heading: A.body.heading };
    events.push({ tick, type: 'Killed', actor: i, target: j, move, location: 'torso', heading: A.body.heading });
  }
  for (const i of [1] as const) {   // sandbox-mech boss phases (the foe only: a bosses' rows never enrage the player): under a row's health threshold the special hits harder and is ready sooner, once per fight
    const B = fighters[i];
    if (PHASES.length && B.health && B.specialShare !== undefined) for (const row of PHASES) {
      if ((row.special === '*' || row.special === B.specialName) && !B.phases?.includes(row.id) && (B.health * 100) / B.maxHealth < row.below) {
        B.phases = [...(B.phases ?? []), row.id]; B.specialShare = (B.specialShare * row.share) / 1000;
        B.skillCooldown = Math.min(B.skillCooldown, Math.round((R.special.cooldown * row.cooldown) / 100));
        events.push({ tick, type: 'PhaseChanged', actor: i, name: row.id } as CombatEvent);
      }
    }
  }
  for (const i of [0, 1] as const) {
    const A = fighters[i];
    if (!A.special) continue;
    if (!A.health) { A.special = 0; delete A.castHurt; delete A.castPush; events.push({ tick, type: 'SpecialFizzled', actor: i }); continue; }
    // Interruptible casts: damage taken while the windup counts down (any source, this tick's blows included) accumulates; at interruptAt of his
    // max health the cast is cut on this tick: no strike, no recovery, a partial cooldown. A cast that released this tick was cleared above.
    const hurt = Math.max(0, before[i].health - A.health);
    if (hurt && isInterruptible(A.specialName)) {
      const taken = (A.castHurt ?? 0) + hurt;
      if (taken >= R.special.interruptAt * A.maxHealth) {
        coolSlot(A, interruptLockout(R.special.interruptCooldown, A.special, R.special.windup)); A.special = 0; delete A.castHurt; delete A.castPush;   // sandbox-mech: an earlier cut can lock the caster out longer
        events.push({ tick, type: 'SpecialInterrupted', actor: i, damage: taken });
        continue;
      }
      A.castHurt = taken;
      if (CAST_PUSHBACK && (A.castPush ?? 0) < CAST_PUSHBACK_MAX) { A.special += CAST_PUSHBACK; A.castPush = (A.castPush ?? 0) + 1; }   // sandbox-mech: a hit that does not cut the cast delays its release (WoW pushback)
    }
    A.special--;
  }
  // 4c. Missiles (sandbox-mech): a bolt arrives `missileTicks` after it was thrown and is judged against where the body stands NOW, so a sidestep dodges it: a roll in its window dodges, a same-side raised guard blocks (a chip), a body within
  // `missileRadius` of the line is hit. Deterministic: detmath only, integer rows.
  for (const i of [0, 1] as const) {
    const A = fighters[i]!, m = A.missile;
    if (!m || tick < m.arrives) continue;
    const j = (1 - i) as Side, D = fighters[j]!, weapon = weaponOf(A.weapon); delete A.missile;
    if (!D.health) continue;
    if (D.phase === 'roll' && D.age >= R.safeStart && D.age <= R.safeEnd) { events.push({ tick, type: 'Dodged', actor: j, target: i, move: m.move }); if (DODGE_COUNTER > 0) D.counterWindow = DODGE_COUNTER; continue; }
    const rx = D.body.x - m.x, rz = D.body.z - m.z, along = rx * m.dx + rz * m.dz, lateral = rx * m.dz - rz * m.dx;
    if (!m.spell && !MISSILE_HOMING && (along < m.range / 2 || Math.abs(lateral) * 100 > MISSILE_RADIUS)) { events.push({ tick, type: 'AttackMissed', actor: i, move: m.move }); continue; }
    const g = guardOf(D, R), facing = Math.abs(wrapAngle(aim(D.body, A.body) - D.body.heading)) <= g.arc;
    const lanes = m.lanes ?? [m.lane], dirOf = (l: number): Direction => (l === 0 ? 'thrust' : l > 0 ? 'right' : 'left');
    const open = D.phase === 'guard' && facing ? lanes.filter((l) => !covers(D, dirOf(l), R)) : lanes;   // the arrows no raised guard covers
    if (m.lanes && open.length && open.length < lanes.length) {   // a volley the guard only partly covers: each covered arrow chips the stamina, the rest land
      const cost = Math.max(1, Math.round(((lanes.length - open.length) * m.damage) / 2)); D.stamina = Math.max(0, D.stamina - cost); D.rest = R.regenDelay;
      events.push({ tick, type: 'Blocked', actor: j, target: i, move: m.move, stamina: cost, perfect: false, weapon: weapon.id, material: weapon.material });
      shake(j, (m.posture ?? MISSILE_GUARD_POSTURE) * (lanes.length - open.length));
    }
    if (open.length === 0) {
      const cost = Math.max(1, Math.round((lanes.length * m.damage) / 2)); D.stamina = Math.max(0, D.stamina - cost); D.rest = R.regenDelay;
      shake(j, (m.posture ?? MISSILE_GUARD_POSTURE) * lanes.length);   // a wall of guard wears down: guarded arrows take posture, and a break opens it
      const mrow = missileOf(A.weapon), through = Math.round((m.damage * lanes.length * (mrow?.pierce ?? 0)) / 1000); if (through) D.health = Math.max(mrow?.chipKills ? 0 : 1, D.health - through);   // a crossbow bolt is hard to guard: part of it goes through (a row with chipKills can finish a man hiding behind his guard: no wall of guard ends a fight in a stall)
      events.push({ tick, type: 'Blocked', actor: j, target: i, move: m.move, stamina: cost, perfect: false, weapon: weapon.id, material: weapon.material, ...(through ? { damage: through } : {}) });
      if (!D.health) {
        D.phase = 'dead'; D.age = 0; D.stun = R.death; D.buffer = null;
        finish = finish ? { ...finish, draw: true } : { victim: j, location: 'torso', move: m.move, heading: A.body.heading };
        events.push({ tick, type: 'Killed', actor: i, target: j, move: m.move, location: 'torso', heading: A.body.heading });
      }
      continue;
    }
    const dealt = m.damage * open.length;   // a bow volley: every arrow no guard covered
    D.health = Math.max(0, D.health - dealt);
    if (m.spell) events.push({ tick, type: 'SpecialLanded', actor: i, target: j, move: m.move, damage: m.damage, spell: m.spell, outcome: m.outcome! });   // a long spell lands as the spell it is (the cast's own effect), not as a weapon hit
    else events.push({ tick, type: 'Hit', actor: i, target: j, move: m.move, damage: dealt, location: 'torso', heading: A.body.heading, weapon: weapon.id, material: weapon.material, missile: true, lane: m.lane });
    if (D.health && (m.react || m.pin)) {   // sandbox bowSpecial: a landed power or pinning arrow reacts like a landed melee special (specialReact rows); a pin is crowd control through the cc ladder (a creature's immuneTier takes the posture break only)
      const def = movesOf(A)[m.move], away = aim(D.body, A.body) + Math.PI, pinned = m.pin ? stunned(D, 'pinShot', m.pin) : 0;
      if (m.react) for (let k = 0; k < Math.round(def.knockback * SPECIAL_REACT_KNOCK / 100); k++) D.body = { ...advance(D.body, { x: M.sin(away), z: M.cos(away), yaw: 0, run: false }, A.body, 1, wall), heading: D.body.heading };
      D.phase = 'hurt'; D.age = 0; D.stun = Math.max(1, MISSILE_STUN, pinned, m.react ? Math.round(def.stagger * SPECIAL_REACT_STAGGER / 100) : 0); D.buffer = null; D.counterWindow = 0; D.charge = 0; D.charged = false;
      events.push({ tick, type: 'Staggered', actor: j, ticks: D.stun });
      shake(j, def.posture * SPECIAL_REACT_POSTURE / 100);
      continue;
    }
    if (D.health) { D.phase = 'hurt'; D.age = 0; D.stun = Math.max(1, MISSILE_STUN); D.buffer = null; events.push({ tick, type: 'Staggered', actor: j, ticks: D.stun }); continue; }
    D.phase = 'dead'; D.age = 0; D.stun = R.death; D.buffer = null;
    finish = finish ? { ...finish, draw: true } : { victim: j, location: 'torso', move: m.move, heading: A.body.heading };
    events.push({ tick, type: 'Killed', actor: i, target: j, move: m.move, location: 'torso', heading: A.body.heading });
  }
  // Shared creature health (RV39, N attackers on one creature, src/fight/pack.ts): each attacker fights their own ordinary duel against their own copy of the creature, and `incoming` is the damage the OTHER streams dealt to it on the
  // previous tick, summed by the lockstep layer. It lands after this tick's blows and specials, once (the returned duel does not carry it), and kills through the same door a blow does. Absent or 0 = today's fight byte for byte.
  if (duel.incoming && duel.incoming > 0 && fighters[1].health > 0) {
    const D = fighters[1], A = fighters[0], move: MoveId = A.lastMove ?? SKILL_MOVE[DAY_ONE_SKILL]!;
    D.health = Math.max(0, D.health - duel.incoming);
    events.push({ tick, type: 'SharedHit', actor: 0, target: 1, damage: duel.incoming });
    if (!D.health) {
      D.phase = 'dead'; D.age = 0; D.stun = R.death; D.buffer = null;
      finish = finish ? { ...finish, draw: true } : { victim: 1, location: 'torso', move, heading: A.body.heading };
      events.push({ tick, type: 'Killed', actor: 0, target: 1, move, location: 'torso', heading: A.body.heading });
    }
  }
  return { tick, fighters, finish, events, ...(duel.bands ? { bands: true } : {}), ...(duel.roll ? { roll: { ...duel.roll, hits } } : {}), ...(duel.gambit ? { gambit: { seed: duel.gambit.seed, draws: gdraws } } : {}), ...(duel.cast ? { cast: { seed: duel.cast.seed, n: casts } } : {}), ...(duel.radius !== undefined ? { radius: duel.radius } : {}), ...(duel.ccBase !== undefined ? { ccBase: duel.ccBase } : {}), ...(duel.crowd ? { crowd: duel.crowd } : {}) };
}

