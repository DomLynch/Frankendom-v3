import { bladeImpact, type HitLocation } from '../blade.ts';
import { OPPONENTS, RULES, SKILL_MOVE, total, weaponOf, type Direction, type GuardProfile, type Material, type MoveId, type Opponent, type RigId, type SkillId, type SpecialName, isInterruptible, type Timing, type WeaponId } from './moves.ts';
import { advance, initialState, initialTarget, RADIUS, wrapAngle, type Input, type State } from './sim.ts';
import { M } from '../detmath.ts';
import { rolledDamage, rollPercent } from '../roll.ts';
import { GAMBIT_ODDS, gambitUnit, resolveGambit } from './gambit.ts';
import { stanced, type StanceId } from './stance.ts';   // never Math.<transcendental> in the sim: engines round them differently (tests/detmath.test.ts)

// Symmetric 1v1 melee simulation. Both fighters obey the same rules through the same Intent; the AI is just another
// intent source. Pure and fixed at 60 Hz: no renderer, clock, randomness or browser state. Presentation observes results.
export type Phase = 'sheathed' | 'draw' | 'ready' | 'attack' | 'roll' | 'backstep' | 'guard' | 'hurt' | 'dead';
export type Action = 'light' | 'light_left' | 'light_right' | 'heavy' | 'thrust' | 'kick' | 'dodge' | 'backstep' | 'parry' | 'skill';   // skill: the equipped skill's move (Fighter.skill), the fourth button
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
  maxStamina: number; legWound: boolean;   // attrition: the bar's ceiling for this duel, and a slowing leg wound
  attackFrom: { x: number; z: number; gap: number } | null;   // where the current attack started and the gap then: a target that walked in since is walking onto the point
  weapon: WeaponId;   // the tables this fighter fights with (moves, blade paths, guard kind, material): see moves.ts `WEAPONS`
  rig: RigId;   // the skeleton family the blade table is baked for (roster.ts RigId): 'hero' for a man and for every body reproportioned from him
  stall: number;   // ticks the current attack's clock stands still (a thrust that met nothing hangs at full extension)
  maxHealth: number;   // the bar's ceiling (moves.ts `Opponent.health`; RULES.health for a man)
  scale: number;   // body scale: the hit capsule and its head/torso/legs regions the opponent's blade sweeps (moves.ts `Opponent`)
  regen: number;   // stamina regeneration multiplier (moves.ts `Opponent.regen`; 1 = a man)
  speed: number;   // pace multiplier: walking, sprinting, the wind-up lunge and the backstep (moves.ts `Opponent.speed`; 1 = a man)
  poise: number;   // a plain clean hit dealing less than this never staggers this fighter (moves.ts `Opponent`); 0 = human
  loiter: number;   // ticks spent within the wall band without attacking (RULES.wall.loiter); the lorarii whip at `ticks`
  lashed: boolean;   // the lorarii have already lashed him in this spell at the wall: the next whip is a repeat, so its tell is shorter
  skill: SkillId | null; skillCooldown: number;   // the equipped skill (null = none: every opponent in V1) and the ticks until it may fire again (RULES.skillCooldown)
  // Special Moves (RULES.special): present only when the fight has them (withSpecials); absent, the SKILL slot is the plain skill it always was.
  specialShare?: number;   // the share of the target's max health this fighter's special takes
  specialName?: SpecialName;   // which named special this fighter casts (moves.ts specialOf); absent = named by `skill`
  special?: number;   // ticks of a committed special windup left; it releases on the tick it would reach 0
  castHurt?: number;   // damage taken since SpecialStarted while the windup counts down (RULES.special.interruptAt cuts the cast); absent when 0, so a cast nobody hits hashes as before
  specialRecover?: number;   // ticks left after a release in which the caster starts no attack (RULES.special.recovery); guard, roll and steps stay legal
  feintEdge?: number;   // a TRICKSTER's feint opens a beat: ticks left in which the next swing he starts is a beating one (RULES.feintBeat, src/fight/stance.ts); absent without that stance
  beat?: true;   // the swing in hand began inside a feint's beat: it ignores a passively held guard (see the block branch); cleared by the next beginAttack
  stance?: StanceId;   // the fight's stance for this fighter (src/fight/stance.ts, RV34); absent = Neutral or no stances: today's fight, byte for byte
  gambitOn?: true;   // this fighter may arm a Gambit (withGambit); absent = the fight has none, byte for byte
  gambit?: true;   // the swing in hand is an armed Gambit (a second heavy press after the chamber); cleared by the next beginAttack
  perk?: Perk;   // the patron's sidegrade (docs/specs/origins/patron-perks-sim.md), set once at duel start by withPerk; absent = today's fight, byte for byte
};
// A patron perk: signed per-mille integers, each scaling ONE quantity by (1000 + d) / 1000, at most two templates and never past ±PERK_MAX (3%).
// Never a tick count, reach, move timing or an AI input (spec rule 2). The caller pairs a gain with a matching loss; this type does not judge balance.
export const PERK_MAX = 30;
export type PerkKey = 'vitality' | 'wind' | 'thrift' | 'guard' | 'poise' | 'stride';
export type Perk = Readonly<Partial<Record<PerkKey, number>>>;   // vitality: max health; wind: stamina regen; thrift: attack stamina cost; guard: block and guard-break stamina cost; poise: posture taken; stride: pace
export const PERK_KEYS: readonly PerkKey[] = ['vitality', 'wind', 'thrift', 'guard', 'poise', 'stride'];
// `perk ? scaled : plain`, never `x * 1`: a fighter with no perk (or a zero on this key) takes the unscaled value untouched, so no float drift.
const perked = (f: Pick<Fighter, 'perk'>, key: PerkKey, x: number): number => { const d = f.perk?.[key]; return d ? (x * (1000 + d)) / 1000 : x; };
// Validates and applies a perk at duel start: max health (integer), regen and pace scale once; thrift, guard and poise are read at their sites in stepDuel.
export const withPerk = (f: Fighter, perk: Perk | undefined): Fighter => {
  if (!perk) return f;
  const set = PERK_KEYS.filter(k => perk[k]);
  if (Object.keys(perk).some(k => !(PERK_KEYS as readonly string[]).includes(k))) throw Error('Perk: unknown template');
  if (set.length > 2 || set.some(k => !Number.isInteger(perk[k]) || Math.abs(perk[k]!) > PERK_MAX)) throw Error(`Perk: at most two templates, whole per-mille, within ±${PERK_MAX}`);
  if (!set.length) return f;
  const out: Fighter = { ...f, perk: Object.fromEntries(set.map(k => [k, perk[k]!])) };
  if (perk.vitality) { out.maxHealth = Math.round((f.maxHealth * (1000 + perk.vitality)) / 1000); out.health = out.maxHealth; }
  if (perk.wind) out.regen = (f.regen * (1000 + perk.wind)) / 1000;
  if (perk.stride) out.speed = (f.speed * (1000 + perk.stride)) / 1000;
  return out;
};

export type Side = 0 | 1;
export type Finish = { victim: Side; location: HitLocation; move: MoveId; heading: number; draw?: boolean };   // draw: both fell on the same tick (victim is then the first processed)
type EventType = 'SpecialStarted' | 'SpecialLanded' | 'SpecialFizzled' | 'SpecialInterrupted' | 'ActionStarted' | 'AttackStarted' | 'Charging' | 'Charged' | 'AttackActive' | 'AttackMissed' | 'Hit' | 'Blocked' | 'Parried' | 'GuardBroken' | 'PostureBroken' | 'Dodged' | 'Staggered' | 'StaminaExhausted' | 'Killed' | 'SharedHit' | 'Whipped' | 'WhipRaised' | 'GambitArmed' | 'GambitFailed';
// Event sides: a blow that lands (Hit, GuardBroken, Killed) names the attacker as `actor` and the one struck as `target`; a defence that
// succeeds (Blocked, Parried, Dodged) names the defender as `actor` and the attacker as `target`.
export type CombatEvent = { tick: number; type: EventType; actor: Side; target?: Side; move?: MoveId; direction?: Direction; action?: 'draw' | 'roll' | 'backstep' | 'guard' | 'parry' | 'feint'; damage?: number; roll?: number; stamina?: number; perfect?: boolean; counter?: boolean; rear?: boolean; charged?: boolean; stop?: boolean; trip?: boolean; walled?: boolean; guarded?: boolean; weapon?: WeaponId; material?: Material; location?: HitLocation; heading?: number; ticks?: number; posture?: number; x?: number; z?: number; lead?: number; guard?: number; name?: SpecialName; gambit?: boolean; beaten?: boolean };   // gambit: a Hit that was a landed Gambit (src/fight/gambit.ts). name: SpecialStarted / SpecialLanded of a named special (moves.ts specialOf). Whipped: actor = target = the whipped fighter; x, z = where the lash landed (before the shove)
// WhipRaised: the lorarius lifts his whip, `lead` ticks before the lash that follows (RULES.wall.loiter.raise, or raiseAgain for a repeat) —
// presentation scales its raise animation by `lead` rather than assuming one. Both whip events carry `guard`: which sixth of the wall the
// lorarius stands in, floor(angle / 60°) from the fighter's position, so the world and audio lanes draw and sound the same guard the sim means.
// `roll`: the world-mob damage roll (Origins luck ruling, Dom 2026-10-07: +/-10% on every blow in both directions, in a world-mob fight only). Absent = the Pit, PvP and the
// ladder: today's fight byte for byte. `hits` numbers the fight's blows in the order they resolve, so the draw is a pure function of (seed, hit) and a replay reproduces it.
export type Duel = { tick: number; fighters: [Fighter, Fighter]; finish: Finish | null; events: CombatEvent[]; incoming?: number; roll?: { seed: number; hits: number }; gambit?: { seed: number; draws: number }; radius?: number };   // radius: the wall this fight is fought inside (RV40); absent = the Pit's live circle (play-radius.ts RADIUS), so a Pit duel is byte for byte what it was
export { ROLL_BAND, rollPercent, rolledDamage } from '../roll.ts';   // the one definition (src/roll.ts), shared with origins/luck/luck.ts
export const withRoll = (duel: Duel, seed: number): Duel => ({ ...duel, roll: { seed, hits: 0 } });
// A fight with the Gambit (src/fight/gambit.ts, RV33): the player's side may arm it, and its draws are a pure function of (seed, draw number). Absent = today's fight byte for byte.
// A fight with stances (src/fight/stance.ts, RV34): the fighters carry their stance. Neutral (undefined) adds nothing. Absent entirely = today's fight.
export const withStances = (duel: Duel, player: StanceId | undefined, mood: StanceId | undefined): Duel => ({ ...duel, fighters: [player ? { ...duel.fighters[0], stance: player } : duel.fighters[0], mood ? { ...duel.fighters[1], stance: mood } : duel.fighters[1]] });
export const withGambit = (duel: Duel, seed: number): Duel => ({ ...duel, gambit: { seed, draws: 0 }, fighters: [{ ...duel.fighters[0], gambitOn: true }, duel.fighters[1]] });

// Which sixth of the ring wall a lorarius stands in, from the position of the man he is whipping: the six guards are drawn at 60-degree
// intervals, so the sim and the world lane agree on which one moved without either reaching into the other.
export const lorariusGuard = (body: Pick<State, 'x' | 'z'>) => Math.floor(((M.atan2(body.z, body.x) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 3));

// Every move / path lookup for a fighter goes through its weapon.
export const movesOf = (f: Pick<Fighter, 'weapon'>) => weaponOf(f.weapon).moves;
export const createFighter = (body: State, phase: Phase, weapon: WeaponId = 'longsword', scale = 1, poise = 0, health: number = RULES.health, guard?: Partial<GuardProfile>, regen = 1, speed = 1, rig: RigId = 'hero'): Fighter => ({ weapon, rig, ...(weaponOf(weapon).guardProfile || guard ? { guardProfile: { ...weaponOf(weapon).guardProfile, ...guard } } : {}), scale, poise, regen, speed, body, health, maxHealth: health, stamina: 100, rest: 0, exhausted: false, wound: 0, woundSite: 'torso', phase, age: 0, move: null, chained: false, landed: false, chain: 0, lastMove: null, parryCooldown: 0, punish: 0, stun: 0, posture: 0, critical: 0, guardDirection: null, parrying: false, exposed: 0, evaded: 0, counterWindow: 0, charge: 0, charged: false, buffer: null, postureRest: 0, maxStamina: 100, legWound: false, attackFrom: null, stall: 0, loiter: 0, lashed: false, skill: null, skillCooldown: 0 });
// An opponent's fighter from his data (moves.ts `Opponent`): the one place his weapon, scale, poise, health, guard, regen and pace are read.
export const opponentFighter = (o: Opponent, body: State, phase: Phase = 'ready'): Fighter => createFighter(body, phase, o.weapon, o.scale, o.poise, o.health, o.guard, o.regen ?? 1, o.speed ?? 1, o.rig);
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
  if (M.hypot(hero.x - foe.x, hero.z - foe.z) <= .85) throw RangeError('Duel pose: the fighters start inside each other');
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
export const initialDuel = (opponent: Opponent = OPPONENTS.veteran, weapon: WeaponId = 'longsword', skill: SkillId | null = null, pose?: DuelPose): Duel => {
  const [hero, foe] = pose ? poseBodies(pose) : [initialState(), { ...initialTarget(), heading: 0, distance: 0 }];
  return { tick: 0, fighters: [{ ...createFighter(hero, 'sheathed', weapon), skill }, opponentFighter(opponent, foe)], finish: null, events: [] };
};

// The one door a patron fight is built through, after initialDuel (and withSpecials): the player's perk in slot 0, the foe's (PvP only; ladder foes carry none) in slot 1.
export const withPerks = (duel: Duel, perks: readonly [Perk | undefined, Perk | undefined]): Duel => ({ ...duel, fighters: [withPerk(duel.fighters[0], perks[0]), withPerk(duel.fighters[1], perks[1])] });

// A fight with Special Moves: both fighters carry the rule's share (the opponent's is the boss share from RULES.special.bossFrom) and the first
// cast waits `first` ticks. `aiSkill`: the opponent's own class skill, which names his special in events and the finish. The one door, so a
// replay builds exactly what the live fight built.
export const withSpecials = (duel: Duel, level: number, aiSkill: SkillId | null, R: typeof RULES = RULES, name?: SpecialName | null): Duel => ({ ...duel, fighters: [
  { ...duel.fighters[0], specialShare: R.special.damage, skillCooldown: R.special.first },
  { ...duel.fighters[1], specialShare: level >= R.special.bossFrom ? R.special.bossDamage : R.special.damage, skillCooldown: R.special.first, skill: duel.fighters[1].skill ?? aiSkill, ...(name ? { specialName: name } : {}) },
] });
export const aim = (from: State, to: State): number => M.atan2(to.x - from.x, to.z - from.z);
export const distance = (a: State, b: State): number => M.hypot(a.x - b.x, a.z - b.z);
// At the ring wall with the given direction pointing out of the ring: the wall is behind a step that way.
export const walled = (body: State, dx: number, dz: number, radius: number = RADIUS): boolean => M.hypot(body.x, body.z) >= radius - RULES.wall.edge && body.x * dx + body.z * dz > 0;
// Ticks since the current phase began. `age` is the animation clock (a chambered swing rewinds it); `charge` counts the parked ticks,
// so age + charge is monotonic elapsed time — what perception and reaction delays must read.
export const elapsed = (f: Fighter): number => f.age + f.charge;
export const timing = (f: Fighter): Timing => f.chained && f.move ? movesOf(f)[f.move].chained! : movesOf(f)[f.move!];
const isLight = (action: Action | null): boolean => action === 'light' || action === 'light_left' || action === 'light_right';
const baseGuard = (f: Fighter, R: typeof RULES): GuardProfile => ({ costScale: 1, arc: R.guardArc, window: R.parry, recovery: R.parryRecovery, commits: false, stopsHeavy: false, heavyBreaks: false, wide: false, postureDecay: 1, ...f.guardProfile });
// The Defensive stance widens the parry window by a quarter (src/fight/stance.ts, `window`); no stance = the window untouched.
export const guardOf = (f: Fighter, R: typeof RULES = RULES): GuardProfile => { const g = baseGuard(f, R); return f.stance ? { ...g, window: Math.round(stanced(f, 'window', g.window)) } : g; };
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
export const feintable = (f: Fighter, R: typeof RULES = RULES): boolean => f.phase === 'attack' && f.move !== null && f.age < movesOf(f)[f.move].feintUntil && f.stamina >= stanced(f, 'feint', R.feintCost);
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
  if (action === 'skill') return SKILL_MOVE[f.skill ?? 'witchfire'];   // the equipped skill's move (legal() refuses SKILL with none); never a riposte or a counter, whatever window is open
  if (action === 'heavy') return f.critical > 0 ? 'critical' : f.punish > 0 ? 'heavy_riposte' : f.counterWindow > 0 ? 'heavy_counter' : 'heavy_overhead';
  if (action === 'kick') return 'kick';
  if (f.punish > 0) return action === 'thrust' ? 'riposte' : 'slash_riposte';
  if (action === 'thrust') return 'thrust';
  if (action === 'light_left' || action === 'light_right') return action;
  return f.lastMove === 'light_right' ? 'light_left' : 'light_right';
}
// Whether a fighter may start `action` right now; the same test the HUD uses to show enabled controls.
export function legal(f: Fighter, action: Action): boolean {
  if (!f.health || f.exhausted || f.special) return false;   // a committed special windup takes no other input
  if (f.specialRecover && (isLight(action) || action === 'heavy' || action === 'thrust' || action === 'kick' || action === 'skill')) return false;   // the special's recovery: no attack until it ends
  // A committing parry (the Nightborn's, guard.commits) runs its window, and the exposure it ends in when it met nothing is a real recovery —
  // the blade is out of line — so no swing comes out of either. A man's parry yields to any action and his exposure only bares his guard.
  const g = guardOf(f), committed = g.commits && ((f.phase === 'guard' && f.parrying && !f.punish && f.age < g.window) || (f.phase === 'ready' && f.exposed > 0));
  const standing = (f.phase === 'ready' || f.phase === 'guard') && !committed;   // a guard yields to any action; it never eats an input
  const stepping = f.phase === 'backstep', stepTail = stepping && f.age >= RULES.backstep.cancelFrom;   // a backstep's tail cancels into a swing
  if (isLight(action)) return f.phase === 'sheathed' || ((standing || stepTail) && f.stamina >= movesOf(f)[chooseMove(f, action)].stamina);
  if (action === 'heavy' || action === 'thrust') return (standing || stepTail) && f.stamina >= movesOf(f)[chooseMove(f, action)].stamina;
  if (action === 'kick') return standing && f.stamina >= movesOf(f).kick.stamina;
  if (action === 'skill' && f.specialShare !== undefined) return !f.skillCooldown && (standing || stepTail);   // a special: no stamina, any class
  if (action === 'skill') return f.skill !== null && !f.skillCooldown && (standing || stepTail) && f.stamina >= movesOf(f)[SKILL_MOVE[f.skill]].stamina;   // as a heavy, plus an equipped skill that has cooled
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
  // A committed special windup: the caster stands and tracks the target, whatever the thumb does (no guard, roll, parry or step).
  if (before[0].special || before[1].special) intents = [before[0].special ? idleIntent() : intents[0], before[1].special ? idleIntent() : intents[1]];
  const fighters = before.map(f => ({ ...f, age: f.stall > 0 ? f.age : f.age + 1, stall: Math.max(0, f.stall - 1), wound: Math.max(0, f.wound - 1), chain: Math.max(0, f.chain - 1), parryCooldown: Math.max(0, f.parryCooldown - 1), skillCooldown: Math.max(0, f.skillCooldown - 1), punish: Math.max(0, f.punish - 1), critical: Math.max(0, f.critical - 1), posture: f.phase === 'hurt' || f.phase === 'dead' || f.postureRest > 0 ? f.posture : Math.max(0, f.posture - stanced(f, 'recover', R.posture.decay) * guardOf(f, R).postureDecay * (f.health < R.posture.bloodied * f.maxHealth ? R.posture.bloodiedDecay : 1)), postureRest: Math.max(0, f.postureRest - 1), rest: Math.max(0, f.rest - 1), exposed: Math.max(0, f.exposed - 1), evaded: Math.max(0, f.evaded - 1), counterWindow: Math.max(0, f.counterWindow - 1), buffer: f.buffer && f.buffer.ttl > 1 ? { ...f.buffer, ttl: f.buffer.ttl - 1 } : null })) as [Fighter, Fighter];
  for (const f of fighters) if (f.specialRecover) f.specialRecover--;
  for (const f of fighters) if (f.feintEdge) { f.feintEdge--; if (!f.feintEdge) delete f.feintEdge; }   // a trickster's feint beat runs down (RULES.feintBeat)
  if (!before[0].health || !before[1].health) return { tick, fighters, finish: duel.finish, events, ...(duel.roll ? { roll: duel.roll } : {}), ...(duel.gambit ? { gambit: duel.gambit } : {}), ...(duel.radius !== undefined ? { radius: duel.radius } : {}) };
  let gdraws = duel.gambit?.draws ?? 0;
  let hits = duel.roll?.hits ?? 0, lastRoll: number | undefined;   // the world-mob roll: a blow's health loss goes through rolled(); absent roll = the plain number
  const rolled = (base: number): number => { if (!duel.roll) return base; lastRoll = rollPercent(duel.roll.seed, hits++); return rolledDamage(base, lastRoll); };
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
      const moving = M.hypot(intent.move.x, intent.move.z) > .1;
      next.body = { ...me.body, heading: moving ? advance(me.body, intent.move, foe.body, 1, wall).heading : aim(me.body, foe.body) + Math.PI };
      next.phase = 'roll'; next.age = 0; spend(i, me.phase === 'backstep' ? R.rollCost - R.backstep.cost : R.rollCost); events.push({ tick, type: 'ActionStarted', actor: i, action: 'roll' });
    } else if (action === 'backstep' && walled(me.body, -M.sin(me.body.heading), -M.cos(me.body.heading), wall)) {
      // Cornered: the wall is at the back, there is nowhere to step. The press is simply refused (a roll still works).
    } else if (action === 'backstep') {
      next.phase = 'backstep'; next.age = 0; next.parrying = false; next.guardDirection = null; spend(i, R.backstep.cost); events.push({ tick, type: 'ActionStarted', actor: i, action: 'backstep' });
    } else if (action === 'skill' && me.specialShare !== undefined) {
      // Special: committed from this tick; the cooldown is spent at commitment. Out of reach the press is refused and nothing is spent.
      if (distance(me.body, foe.body) <= R.special.reach) {
        next.special = R.special.windup; delete next.castHurt; next.phase = 'ready'; next.age = 0; next.parrying = false; next.guardDirection = null;
        events.push({ tick, type: 'SpecialStarted', actor: i, ...(me.skill ? { move: SKILL_MOVE[me.skill] } : {}), ...(me.specialName ? { name: me.specialName } : {}) });
      }
    } else if (action === 'kick') {
      beginAttack(next, 'kick', false, foe.body); spend(i, perked(me, 'thrift', movesOf(next).kick.stamina));
      if (intent.lock) next.body = { ...me.body, heading: aim(me.body, foe.body) };
      events.push({ tick, type: 'AttackStarted', actor: i, move: 'kick' });
    } else if (isLight(action) || action === 'heavy' || action === 'thrust' || action === 'skill') {
      if (me.phase === 'sheathed') { next.phase = 'draw'; next.age = 0; events.push({ tick, type: 'ActionStarted', actor: i, action: 'draw' }); }
      else {
        const id = chooseMove(me, action!), def = movesOf(me)[id];
        // Chained timing: a listed follow-up inside the chain window, or a light out of an evade (dodge-attack).
        const follows = me.chain > 0 && me.lastMove !== null && !!movesOf(me)[me.lastMove].chain?.follow.includes(id);
        beginAttack(next, id, !!def.chained && (follows || (isLight(action) && (me.evaded > 0 || me.phase === 'backstep'))), foe.body); spend(i, perked(me, 'thrift', def.stamina));
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
      const guarding = next.phase === 'guard', scale = (guarding ? R.guardSpeed : 1) * (next.exhausted ? R.exhaustedSpeed : 1) * (next.legWound ? R.attrition.legSpeed : 1), run = !guarding && !next.exhausted && intent.move.run && next.stamina > 0;
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
    if (next.exhausted && next.stamina >= R.exhaustRecover) next.exhausted = false;
  }
  // Symmetric separation: both may have stepped into the other's old position; push them apart by equal halves.
  {
    const [p, q] = [fighters[0].body, fighters[1].body], dx = q.x - p.x, dz = q.z - p.z, gap = M.hypot(dx, dz);
    if (gap < .85 - 1e-8) {
      const push = (.85 - gap) / 2, ux = gap > 1e-8 ? dx / gap : M.sin(p.heading), uz = gap > 1e-8 ? dz / gap : M.cos(p.heading);
      const clamp = (x: number, z: number) => { const r = M.hypot(x, z); return r > wall ? { x: x * wall / r, z: z * wall / r } : { x, z }; };
      fighters[0].body = { ...p, ...clamp(p.x - ux * push, p.z - uz * push) }; fighters[1].body = { ...q, ...clamp(q.x + ux * push, q.z + uz * push) };
    }
  }
  // Posture: `amount` on the target; at the maximum the target's posture breaks — a long stagger and a critical window for the other side.
  const shake = (target: Side, amount: number) => {
    const T = fighters[target], O = fighters[1 - target];
    if (!T.health || amount <= 0) return;
    T.posture = Math.min(R.posture.max, T.posture + perked(T, 'poise', amount)); T.postureRest = R.posture.hold;
    if (T.posture < R.posture.max) return;
    T.posture = 0; T.phase = 'hurt'; T.age = 0; T.stun = Math.max(T.stun, R.posture.stun); T.buffer = null; T.counterWindow = 0; T.charge = 0; T.charged = false;
    O.punish = R.posture.stun; O.critical = R.posture.stun;
    events.push({ tick, type: 'PostureBroken', actor: (1 - target) as Side, target, ticks: R.posture.stun });
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
    const dealtPosture = (x: number): number => { const p = stanced(a, 'posture', x); return a.move === 'kick' && d.phase === 'guard' ? stanced(a, 'kickPosture', p) : p; };   // posture this blow deals: the attacker's stance (aggressive +10%; a trickster's kick +50% against a HELD guard only)
    const raised = d.phase === 'guard' && facing, guarding = raised && covers(d, def.direction, R);   // raised: any guard up; guarding: the side covers this attack
    // A Trickster's beating swing (it began inside the beat after his own feint) ignores a PASSIVELY held guard: one past its parry window and the perfect-block ticks. A timed parry, a perfect block and a
    // guard that has not yet come up still answer it, which is what a Defensive stance's wider window is for. Only a stance-carrying fighter ever has `beat`.
    const beaten = !!a.beat && guarding && d.age >= g.window + R.perfectBlock;
    const breaks = (def.breaksGuard || charged || (g.heavyBreaks && def.direction === 'overhead')) && !g.stopsHeavy, blockCost = stanced(d, 'block', perked(d, 'guard', def.staminaDamage * g.costScale));
    const stagger = (ticks: number) => {
      const wall = walledHit ? R.wall.stagger : 0;
      D.phase = D.health ? 'hurt' : 'dead'; D.age = 0; D.stun = D.health ? ticks + wall + (D.exhausted && (def.charges || a.move === 'kick') ? R.exhaustedStun : 0) : R.death; D.buffer = null; D.counterWindow = 0;
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
      }
      const away = aim(d.body, a.body) + Math.PI;
      for (let k = 0; k < knockback; k++) D.body = { ...advance(D.body, { x: M.sin(away), z: M.cos(away), yaw: 0, run: false }, A.body, 1, wall), heading: D.body.heading };
      // The ring wall: knockback that ends against the wall is a second impact — extra stagger and posture (kicks shove; see stagger()).
      walledHit = knockback > 0 && D.health > 0 && walled(D.body, M.sin(away), M.cos(away), wall);
      if (!D.health) { finish = finish ? { ...finish, draw: true } : { victim: j, location: location!, move: a.move!, heading: a.body.heading }; events.push({ tick, type: 'Killed', actor: i, target: j, move: a.move!, location: location!, heading: a.body.heading }); }
    };
    // A low blade (the sweep) trips a roll in its first half: the roller is going down into it. The kick has no blade and is rolled as before.
    const trip = d.phase === 'roll' && def.direction === 'low' && def.path !== null && d.age < R.roll / 2;
    if (d.phase === 'roll' && d.age >= R.safeStart && d.age <= R.safeEnd && !trip) events.push({ tick, type: 'Dodged', actor: j, target: i, move: a.move });
    else if (guarding && d.age < g.window && def.parryable) {
      A.phase = 'hurt'; A.age = 0; A.stun = R.parryStun; A.buffer = null; D.punish = R.parryStun;
      events.push({ tick, type: 'Parried', actor: j, target: i, move: a.move, weapon: weapon.id, material: weapon.material }, { tick, type: 'Staggered', actor: i, ticks: R.parryStun });
      shake(i, R.posture.parry);
    } else if (raised && !guarding && def.vsGuard) {   // a kick into a guard held on any other side: the shove lands as before. The low guard braces it — an ordinary block below.
      const hit = rolled(def.damage); spend(j, def.vsGuard.staminaDamage); wound(hit, def.knockback); events.push({ tick, type: 'Hit', actor: i, target: j, move: a.move, damage: hit, ...rollTag(), location, heading: a.body.heading, guarded: true, weapon: weapon.id, material: weapon.material }); stagger(def.vsGuard.stagger); shake(j, dealtPosture(def.posture));
    } else if (guarding && !beaten && !breaks && d.stamina >= (d.age - g.window < R.perfectBlock ? blockCost * R.perfectBlockCost : blockCost)) {
      // A guard raised just in time (its first perfectBlock ticks as a block, never a parry window) pays half and stops the chip; the
      // discounted price is what has to be affordable.
      const perfect = d.age - g.window < R.perfectBlock, cost = perfect ? blockCost * R.perfectBlockCost : blockCost, chip = perfect ? 0 : Math.round(def.damage * def.chip * R.location[location]), taken = chip ? rolled(chip) : 0;
      spend(j, cost); D.counterWindow = stanced(d, 'counter', R.guardCounter);   // a block opens the guard-counter window (a Defensive stance's is a quarter longer)
      events.push({ tick, type: 'Blocked', actor: j, target: i, move: a.move, stamina: cost, perfect, weapon: weapon.id, material: weapon.material, ...(chip ? { damage: taken, ...rollTag() } : {}) });
      if (chip) { wound(taken, 0, false); if (!D.health) stagger(0); }   // chip never marks a wound, but it can still kill
      shake(j, dealtPosture(def.posture * (perfect ? R.posture.perfect : 1)));
    } else {
      const damage = Math.round(stanced(a, 'damage', def.charges ? stanced(a, 'heavyDamage', def.damage) : def.damage) * R.location[location] * (charged ? R.charge.damage : 1)), baseStun = Math.round(def.stagger * (charged ? R.charge.stagger : 1));
      if (guarding && !beaten) { const hit = rolled(damage); spend(j, perked(d, 'guard', R.breakCost)); wound(hit, def.knockback); events.push({ tick, type: 'GuardBroken', actor: i, target: j, move: a.move, damage: hit, ...rollTag(), location, heading: a.body.heading, charged, weapon: weapon.id, material: weapon.material }); stagger(baseStun); D.posture = 0; }
      else {
        // Hyper-armour: a heavy parked at its chamber, a charged heavy, or any move past its poise point. A short hold that was released
        // uncharged is a plain heavy again (armour from its poise tick only).
        const poised = d.phase === 'attack' && d.move !== null && ((movesOf(d)[d.move].charges && (d.charged || (d.charge > 0 && d.age === movesOf(d)[d.move].chamber)) && d.age < timing(d).windup + timing(d).active) || (movesOf(d)[d.move].poise >= def.stagger && d.age >= movesOf(d)[d.move].poiseFrom && d.age < timing(d).windup + timing(d).active));
        // Counter-hit and rear-hit multiply the clean hit; they never apply through a guard or a parry.
        const counter = d.phase === 'attack' || (d.phase === 'roll' && d.age > R.safeEnd);
        // The thrust is the stop-hit: into a swing, or into an opponent walking onto the point, it lands harder than a cut's counter-hit.
        // Walking onto the point: since the thrust started, the target has come at least stopHit.walk closer to where it started from (its own steps; the lunge does not count).
        const advancing = (d.phase === 'ready' || d.phase === 'guard') && a.attackFrom !== null && distance(d.body, { ...d.body, x: a.attackFrom.x, z: a.attackFrom.z }) < a.attackFrom.gap - R.stopHit.walk;
        const stop = a.move === 'thrust' && (counter || advancing);
        const rear = Math.abs(wrapAngle(aim(d.body, a.body) - d.body.heading)) > Math.PI - R.rear.arc / 2;
        const plain = Math.round(damage * (stop ? R.stopHit.damage : counter ? R.counter.damage : 1) * (rear ? (d.phase === 'hurt' ? R.rear.downed : R.rear.damage) : 1)), stun = Math.round(baseStun * (stop ? R.stopHit.stagger : counter ? R.counter.stagger : 1) * (rear ? R.rear.stagger : 1));
        // The Gambit (src/fight/gambit.ts): an armed swing that meets an open body draws once. Landed: the heavy's number times the odds' multiplier (capped from above 40% health), no shrug, the posture
        // times the same; failed: nobody is hurt and the thrower staggers. A guard, a parry or an evade settles it as the plain heavy (the draw is never taken).
        const g = a.gambit && duel.gambit ? resolveGambit(plain, gambitUnit(duel.gambit.seed, gdraws++), d.health, d.maxHealth) : null;
        const dealt = g?.landed ? g.damage : plain;
        if (g && !g.landed) {
          A.phase = 'hurt'; A.age = 0; A.stun = R.gambit.stagger; A.buffer = null; A.counterWindow = 0; A.charge = 0; A.charged = false; A.move = null; A.landed = true;
          events.push({ tick, type: 'GambitFailed', actor: i, target: j, move: a.move }, { tick, type: 'Staggered', actor: i, ticks: A.stun });
          continue;
        }
        if (!def.path) spend(j, def.staminaDamage);
        // Poise: a brute shrugs a plain blow under his threshold — no stagger, no knockback; the wound and the posture still count.
        const shrugged = !g && (poised || (dealt < d.poise && !counter && !stop && !rear && !charged));
        const hit = rolled(dealt); wound(hit, shrugged ? 0 : def.knockback); events.push({ tick, type: 'Hit', actor: i, target: j, move: a.move, damage: hit, ...rollTag(), location, heading: a.body.heading, counter: counter || stop, rear, charged, ...(g ? { gambit: true } : {}), ...(beaten ? { beaten: true } : {}), ...(raised ? { guarded: true } : {}), weapon: weapon.id, material: weapon.material, ...(stop ? { stop: true } : {}), ...(trip ? { trip: true } : {}) });
        if (!shrugged || !D.health) stagger(stun);
        shake(j, dealtPosture(def.posture * (counter ? R.counter.damage : 1) * (rear ? R.rear.posture : 1) * (g ? GAMBIT_ODDS.multiplier : 1)));
      }
    }
  }
  // 4. Special Moves, after the blows of this tick. Releases first, both sides at once: the release tick lands whatever happened to the caster
  // on it, and a lethal release on the tick he fell is a double kill through the draw. Unblockable and undodgeable. Then every windup still
  // running counts down, and one whose caster has fallen fizzles.
  const releasing = [fighters[0].special === 1, fighters[1].special === 1], standing = [fighters[0].health > 0, fighters[1].health > 0];   // both judged before either lands
  for (const i of [0, 1] as const) {
    const j = (1 - i) as Side, A = fighters[i], D = fighters[j];
    if (!releasing[i]) continue;
    A.special = 0; delete A.castHurt; A.skillCooldown = R.special.cooldown; A.specialRecover = R.special.recovery;   // re-armed and held back from attacking, counted from the release
    if (!standing[j]) continue;
    const move: MoveId = SKILL_MOVE[A.skill ?? 'pommel'], damage = Math.round(A.specialShare! * D.maxHealth);
    D.health = Math.max(0, D.health - damage);
    events.push({ tick, type: 'SpecialLanded', actor: i, target: j, move, damage, ...(A.specialName ? { name: A.specialName } : {}) });
    if (D.health) continue;
    D.phase = 'dead'; D.age = 0; D.stun = R.death; D.buffer = null;
    finish = finish ? { ...finish, draw: true } : { victim: j, location: 'torso', move, heading: A.body.heading };
    events.push({ tick, type: 'Killed', actor: i, target: j, move, location: 'torso', heading: A.body.heading });
  }
  for (const i of [0, 1] as const) {
    const A = fighters[i];
    if (!A.special) continue;
    if (!A.health) { A.special = 0; delete A.castHurt; events.push({ tick, type: 'SpecialFizzled', actor: i }); continue; }
    // Interruptible casts: damage taken while the windup counts down (any source, this tick's blows included) accumulates; at interruptAt of his
    // max health the cast is cut on this tick: no strike, no recovery, a partial cooldown. A cast that released this tick was cleared above.
    const hurt = Math.max(0, before[i].health - A.health);
    if (hurt && isInterruptible(A.specialName)) {
      const taken = (A.castHurt ?? 0) + hurt;
      if (taken >= R.special.interruptAt * A.maxHealth) {
        A.special = 0; delete A.castHurt; A.skillCooldown = R.special.interruptCooldown;
        events.push({ tick, type: 'SpecialInterrupted', actor: i, damage: taken });
        continue;
      }
      A.castHurt = taken;
    }
    A.special--;
  }
  // Shared creature health (RV39, N attackers on one creature, src/pack.ts): each attacker fights their own ordinary duel against their own copy of the creature, and `incoming` is the damage the OTHER streams dealt to it on the
  // previous tick, summed by the lockstep layer. It lands after this tick's blows and specials, once (the returned duel does not carry it), and kills through the same door a blow does. Absent or 0 = today's fight byte for byte.
  if (duel.incoming && duel.incoming > 0 && fighters[1].health > 0) {
    const D = fighters[1], A = fighters[0], move: MoveId = A.lastMove ?? SKILL_MOVE.pommel;
    D.health = Math.max(0, D.health - duel.incoming);
    events.push({ tick, type: 'SharedHit', actor: 0, target: 1, damage: duel.incoming });
    if (!D.health) {
      D.phase = 'dead'; D.age = 0; D.stun = R.death; D.buffer = null;
      finish = finish ? { ...finish, draw: true } : { victim: 1, location: 'torso', move, heading: A.body.heading };
      events.push({ tick, type: 'Killed', actor: 0, target: 1, move, location: 'torso', heading: A.body.heading });
    }
  }
  return { tick, fighters, finish, events, ...(duel.roll ? { roll: { seed: duel.roll.seed, hits } } : {}), ...(duel.gambit ? { gambit: { seed: duel.gambit.seed, draws: gdraws } } : {}), ...(duel.radius !== undefined ? { radius: duel.radius } : {}) };
}

