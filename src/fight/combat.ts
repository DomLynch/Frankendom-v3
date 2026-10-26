import { decide, initialAi, readOpponent, type AiMode, type AiState } from './ai.ts';
import type { HitLocation } from './blade.ts';
import type { Sheet } from './sheet-rows.ts';
import { distance, inBufferWindow, initialDuel, isHeavy, legal, type DuelPose, withGambit, withSheet, withSpecials, withSpell, withSkill2, withStances, movesOf, stepDuel, timing, type Action, type CombatEvent, type Duel, type Fighter, type Finish, type Intent, type Side } from './duel.ts';
import type { Spell } from './spell-cast.ts';
import { asStance, moodOf, type PickedStance } from './stance.ts';
import { MOVES, OPPONENTS, SKILL_MOVE, PATHS, PROFILES, RULES, total, weaponOf, DEFAULT_WEAPON, WEAPON_LOOK, BASH_MOVE, SKILL_ROWS, skillOfMove, type AiProfile, type MoveId, type Opponent, type PathId, type SkillId, type SpecialName, type Weapon, type WeaponId } from './moves.ts';
import type { State } from './sim.ts';
import { M } from './detmath.ts';   // never Math.<transcendental> in the sim: engines round them differently (tests/detmath.test.ts)
import { specialStage } from './special-look.ts';
import { holdPoseOf } from './move-rows.ts';
import { stepFatigue, type Fatigue } from './fatigue.ts';
import { simBound } from './sim-bounds-rows.ts';
import { specialCooldown, specialFirst } from './rows80.ts';
import { meleeSpecialReach } from './sandbox-rules.ts';
import { termCooldown } from './special-terms.ts';
const RESULT_AGE_CAP = simBound('practice.resultAgeCap');   // rows: sim-bounds-defs.json
export { PROFILES, OPPONENTS, RULES, MOVES } from './moves.ts';
export type { Opponent, OpponentId, Level } from './moves.ts';
export type { Intent, Action, CombatEvent, Duel, Fighter } from './duel.ts';
export type { AiProfile } from './moves.ts';

// Legacy constant views. Presentation, the blade bake and older tests read these shapes; the simulation reads moves.ts.
export const SWORD = {
  draw: RULES.draw, contact: PATHS.light_right.windup, recovery: total(PATHS.light_right), damage: MOVES.light_right.damage,
  reach: MOVES.light_right.reach, arc: RULES.guardArc, reaction: MOVES.light_right.stagger, death: RULES.death,
} as const;
const clipSpec = (w: Weapon, path: PathId, move: MoveId) => ({
  contact: w.paths[path].windup, recovery: total(w.paths[path]), damage: w.moves[move].damage, reach: w.moves[move].reach,
  cost: w.moves[move].stamina, source: w.paths[path].source,
});
// Clip keys: the renderer plays one role per key (characters.ts maps a role to the weapon's clip); a left cut plays the Return role whether or not it was chained.
// `source` is where the authored clip's contact key sits, so the swing eases to it at the simulation's contact tick.
export const attackSpecs = (weapon: WeaponId) => {
  const w = weaponOf(weapon);
  return {
    light: clipSpec(w, 'light_right', 'light_right'), return: clipSpec(w, 'light_left_chain', 'light_left'), heavy: clipSpec(w, 'heavy_overhead', 'heavy_overhead'),
    riposte: clipSpec(w, 'riposte', 'riposte'), slashRiposte: clipSpec(w, 'slash_riposte', 'slash_riposte'), thrust: clipSpec(w, 'thrust', 'thrust'),
    // The Pommel Strike's own clip (Skill_Pommel, hero rig): a cone move with no blade path, so its contact key is the clip's own .45 (18/40).
    pommel: { contact: w.moves[BASH_MOVE].windup, recovery: total(w.moves[BASH_MOVE]), damage: w.moves[BASH_MOVE].damage, reach: w.moves[BASH_MOVE].reach, cost: w.moves[BASH_MOVE].stamina, source: 18 / 40 },
  };
};
export const ATTACKS = attackSpecs(DEFAULT_WEAPON);
export type Attack = keyof typeof ATTACKS;

type LegacyPhase = 'sheathed' | 'draw' | 'ready' | 'attack' | 'roll' | 'backstep' | 'guard' | 'hurt' | 'dead' | 'kick';
type Result = 'none' | 'hit' | 'miss' | 'hurt' | 'blocked' | 'parried' | 'dodged' | 'broken' | 'kicked' | 'postureBroken'
  | 'enemyBlocked' | 'enemyBroken' | 'enemyParried' | 'enemyDodged' | 'enemyKicked' | 'enemyPostureBroken' | 'traded';
// Practice = the duel plus a read-only view in the vocabulary the renderer and HUD already speak. Never write to the view.
// Clarity cues (Lead's brief, Bot report 2026-10-06): presentation-only events DERIVED here from the step's events and the state before it. They are
// not sim events (except where noted they add no sim event, so no RECORD_VERSION, digest or RNG change) and no rule reads them; sound and the HUD do.
//   AttackInterrupted: this fighter's own swing was cut (hit or guard-broken) before it could land, in wind-up or active frames: the opposite of a whiff.
//   PressRefused: the player pressed an action the sim would drop (not legal now, outside the buffer tail); reason names why, for the button's dim or shake.
export type ClarityEvent = { tick: number; type: 'AttackInterrupted' | 'PressRefused' | 'FatigueBand'; actor: Side; move?: MoveId; action?: Action; reason?: 'hurt' | 'exhausted' | 'recovering'; band?: 0 | 1 | 2 | 3 };   // FatigueBand: this fighter's band just rose to `band` (fatigue.ts); the HUD's once-only "Pace yourself" line keys on the player's 2
// The OPENING (item 2, defence -> punish): a fighter is open while he is staggered and his foe holds the punish window (a parry's `parryStun`, a broken
// posture's `posture.stun`). `left` ticks of `of` remain, so the pose and any glint last exactly as long as the sim's opening does. Derived, never fed back.
export type Opening = { side: Side; kind: 'parry' | 'posture'; left: number; of: number };
const SIDES = [0, 1] as const;   // the two fighters, for the per-tick loops below: one shared tuple, not a new array every tick
export function openingOf(duel: Duel, previous?: Opening | null): Opening | null {
  for (const side of SIDES) {
    const f = duel.fighters[side], o = duel.fighters[1 - side as Side];
    if (f.phase !== 'hurt' || o.punish <= 0 || f.stun <= 0) continue;
    const start = duel.events.find(e => e.target === side && (e.type === 'Parried' || e.type === 'PostureBroken'));
    const kind = start ? (start.type === 'Parried' ? 'parry' : 'posture') : previous?.side === side ? previous.kind : 'parry';
    return { side, kind, left: Math.max(0, f.stun - f.age), of: f.stun };
  }
  return null;
}
export function clarityOf(duel: Duel, before: Duel, intent?: Intent, fatigue?: readonly [Fatigue, Fatigue], was?: readonly [Fatigue, Fatigue]): ClarityEvent[] {
  const out: ClarityEvent[] = [], { tick, events } = duel;
  for (const e of events) {
    if ((e.type !== 'Hit' && e.type !== 'GuardBroken') || e.target === undefined) continue;
    const f = before.fighters[e.target];
    if (f.phase !== 'attack' || f.move === null || f.landed || f.age >= timing(f).windup + timing(f).active) continue;   // recovery after a swing is a punish, not a cut-off
    if (events.some(o => o.type === 'Hit' && o.actor === e.target)) continue;   // a trade: his blow landed too
    out.push({ tick, type: 'AttackInterrupted', actor: e.target, move: f.move });
  }
  for (const e of events) if (e.type === 'SpecialInterrupted') out.push({ tick, type: 'AttackInterrupted', actor: e.actor, ...(before.fighters[e.actor].skill ? { move: SKILL_MOVE[before.fighters[e.actor].skill!] } : {}) });   // a cast cut by damage (duel.ts SpecialInterrupted)
  for (const side of SIDES) if (fatigue && was && fatigue[side].band > was[side].band) out.push({ tick, type: 'FatigueBand', actor: side, band: fatigue[side].band });
  const me = before.fighters[0];
  if (intent?.action && me.health && !legal(me, intent.action) && !inBufferWindow(me))
    out.push({ tick, type: 'PressRefused', actor: 0, action: intent.action, reason: me.phase === 'hurt' || me.phase === 'dead' ? 'hurt' : me.phase === 'ready' || me.phase === 'guard' ? 'exhausted' : 'recovering' });   // standing and still refused: no stamina (or a spent skill)
  // A SPECIAL press queued in a swing's tail that the sim then drops (its last buffered tick passed with the skill still cooling or short of
  // stamina: duel.ts drops a buffer at ttl 1 untried) shakes its button like an immediate refusal, instead of vanishing (Dom: "often doesn't work").
  const queued = me.buffer;
  if (queued && queued.ttl <= 1 && (queued.action === 'skill' || queued.action === 'skill2') && me.health && !intent?.action)
    out.push({ tick, type: 'PressRefused', actor: 0, action: queued.action, reason: 'recovering' });
  return out;
}
export type Practice = {
  duel: Duel; ai: AiState; events: CombatEvent[]; clarity: ClarityEvent[];
  opening: Opening | null;   // who is open right now and for how long (openingOf); null when nobody is
  fatigue: [Fatigue, Fatigue];   // per fighter, smoothed (fatigue.ts): the one driver for breathing, posture and the mix (presentation only)
  result: Result; resultAge: number; resultDamage: number; resultStamina: number; resultDealt: number;   // resultDealt: a trade's own blow
  resultPerfect: boolean; resultCounter: boolean; resultStop: boolean; resultTrip: boolean; resultWalled: boolean;
  resultBreak: 'charged' | 'kick' | null;   // what broke a guard, for the event line's words (presentation only; the sim is untouched)
  evadeAt: number; swingAt: number;   // ticks of the player's last roll/backstep start and the opponent's last swing start (-1: none yet)
  maxStamina: number; enemyMaxStamina: number; legWound: boolean;   // attrition: the bars' ceilings this duel and a slowing leg wound
  maxHealth: number; enemyMaxHealth: number;   // the health bars' ceilings (an opponent may carry more than a man)
  fighter: State; enemy: State; finish: Finish | null;
  phase: LegacyPhase; age: number; attack: Attack; chain: number; threat: boolean; threatMove: MoveId | null;
  enemyPhase: LegacyPhase; enemyAge: number; enemyAttacking: boolean; enemyMode: AiMode;
  health: number; playerHealth: number; stamina: number; enemyStamina: number; exhausted: boolean; posture: number; enemyPosture: number;
  wound: number; enemyWound: number; woundSite: HitLocation; enemyWoundSite: HitLocation; reaction: number;
};
// The thrust plays its own role; a chained thrust rides the riposte path (the second thrust, from half-withdrawn), so it plays the riposte's clip.
// The weapons whose player equip plays a Pommel Strike bash (the one list: characters.ts PLAYER_CLIPS builds its Pommel rows from it): the
// sword grips play the hero's Skill_Pommel; the hafted trident, warhammer and maul their own <Family>_Pommel butt strike (Strategy 2026-09-29).
export const POMMEL_BASH: ReadonlySet<WeaponId> = new Set(Object.keys(WEAPON_LOOK).filter((id) => WEAPON_LOOK[id]!.pommelBash));   // the weapon rows' look.pommelBash
const clipOf = (f: Fighter): Attack => {
  const move = f.lastMove, skill = SKILL_ROWS[skillOfMove(move) ?? ''];
  return move === 'slash_riposte' ? 'slashRiposte'
    : move === 'heavy_right' ? 'light' : move === 'heavy_left' ? 'return' : move === 'heavy_thrust' ? 'thrust'   // V3 directional heavies play their cut's or the stab's clip, warped to the heavy's longer wind-up by actorPose (contact = the heavy's windup / total)
    : move === 'light_left' ? 'return'
    : move === 'heavy_overhead' || move === 'heavy_riposte' || move === 'heavy_counter' || move === 'critical' || skill?.clip === 'heavy' ? 'heavy'   // the Witch-fire plays the heavy clip until its own (#732) lands
    : move === 'riposte' || (move === 'thrust' && f.chained) ? 'riposte'
    : skill?.bash && POMMEL_BASH.has(f.weapon) ? 'pommel'   // the hilt bash (Skill_Pommel): the longsword, the knife (every player's first take), the estoc and the cleaver (2026-09-28), the gladius, the trident, the warhammer and the maul (Strategy 2026-09-29); other weapons (the scythe) keep the thrust clip until theirs lands
    : move === 'thrust' || skill?.clip === 'thrust' ? 'thrust' : 'light';   // SCOPE 8: each skill plays its timing row's clip (the kick-timed Shove, a push, the thrust's) until its own lands
};
const legacyPhase = (f: Fighter): LegacyPhase => f.phase === 'attack' && f.move === 'kick' ? 'kick' : f.phase;
const RESULTS: Partial<Record<CombatEvent['type'], [Result, Result]>> = {
  PostureBroken: ['enemyPostureBroken', 'postureBroken'], Hit: ['hit', 'hurt'], AttackMissed: ['miss', 'dodged'], Blocked: ['blocked', 'enemyBlocked'],
  Parried: ['parried', 'enemyParried'], GuardBroken: ['enemyBroken', 'broken'], Dodged: ['dodged', 'enemyDodged'],
};
export function project(duel: Duel, ai: AiState, previous?: Practice, intent?: Intent): Practice {
  const [p, w] = duel.fighters;
  let result: Result = previous?.result ?? 'none', resultAge = previous ? Math.min(RESULT_AGE_CAP, previous.resultAge + 1) : 0;
  let resultDamage = previous?.resultDamage ?? 0, resultStamina = previous?.resultStamina ?? 0, resultPerfect = previous?.resultPerfect ?? false;
  let resultCounter = previous?.resultCounter ?? false, resultStop = previous?.resultStop ?? false, resultTrip = previous?.resultTrip ?? false;
  let resultWalled = previous?.resultWalled ?? false, resultBreak = previous?.resultBreak ?? null, resultDealt = previous?.resultDealt ?? 0;
  let evadeAt = previous?.evadeAt ?? -1, swingAt = previous?.swingAt ?? -1;
  for (const event of duel.events) {
    if (event.type === 'ActionStarted' && event.actor === 0 && (event.action === 'roll' || event.action === 'backstep')) evadeAt = event.tick;
    if (event.type === 'AttackStarted' && event.actor === 1) swingAt = event.tick;
    const pair = RESULTS[event.type];
    if (!pair) continue;
    // An opponent's whiff reads "Evaded!" only when the player rolled or backstepped during that swing: the player's own evade took
    // them out of it. A swing at a player who stood or walked is air, and the line stays as it was.
    if (event.type === 'AttackMissed' && event.actor === 1 && evadeAt < swingAt && p.phase !== 'roll' && p.phase !== 'backstep') continue;
    result = event.type === 'Hit' && event.move === 'kick' ? (event.actor === 0 ? 'kicked' : 'enemyKicked') : pair[event.actor];
    // the renderer keys on 'blocked'; perfection rides alongside
    resultAge = 0; resultDamage = event.damage ?? 0; resultStamina = event.stamina ?? 0;
    resultPerfect = !!event.perfect; resultCounter = !!event.counter || !!event.rear; resultStop = !!event.stop; resultTrip = !!event.trip;
    resultBreak = event.type !== 'GuardBroken' ? null : event.charged ? 'charged' : event.move === 'kick' ? 'kick' : null;
    resultWalled = duel.events.some(e => e.type === 'Staggered' && e.walled && e.actor === event.target);   // the blow drove them into the ring wall
  }
  // A trade: both blows land on one tick (Combat 2026-09-27, live Cleave at his heavy's age 2: dealt 28, taken 25). The last event won
  // and the line read only "Countered · −25", a plain loss; it names both.
  const dealt = duel.events.find(e => e.type === 'Hit' && e.actor === 0), taken = duel.events.find(e => e.type === 'Hit' && e.actor === 1);
  if (dealt && taken) { result = 'traded'; resultAge = 0; resultDealt = dealt.damage ?? 0; resultDamage = taken.damage ?? 0; }
  const fatigue: [Fatigue, Fatigue] = [stepFatigue(p, previous?.fatigue[0]), stepFatigue(w, previous?.fatigue[1])];
  const wardenTiming = w.phase === 'attack' ? timing(w) : null;
  return {
    duel, ai, events: duel.events, clarity: previous ? clarityOf(duel, previous.duel, intent, fatigue, previous.fatigue) : [], fatigue, opening: openingOf(duel, previous?.opening), result, resultAge, resultDamage, resultDealt, resultStamina, resultPerfect, resultCounter, resultStop, resultTrip, resultWalled, resultBreak, evadeAt, swingAt,
    maxStamina: p.maxStamina, enemyMaxStamina: w.maxStamina, legWound: p.legWound, maxHealth: p.maxHealth, enemyMaxHealth: w.maxHealth,
    fighter: p.body, enemy: w.body, finish: duel.finish,
    phase: legacyPhase(p), age: p.age, attack: clipOf(p), chain: p.chain,
    threat: w.phase === 'attack' && !w.landed && w.age < wardenTiming!.windup + wardenTiming!.active, threatMove: w.phase === 'attack' ? w.move : null,
    enemyPhase: legacyPhase(w), enemyAge: w.age, enemyAttacking: w.phase === 'attack', enemyMode: w.phase === 'guard' ? 'guard' : ai.mode,
    health: w.health, playerHealth: p.health, stamina: p.stamina, enemyStamina: w.stamina, exhausted: p.exhausted, posture: p.posture, enemyPosture: w.posture,
    wound: p.wound, enemyWound: w.wound, woundSite: p.woundSite, enemyWoundSite: w.woundSite,
    reaction: w.phase === 'hurt' || w.phase === 'dead' ? Math.max(0, w.stun - w.age) : 0,
  };
}
// `specials`: the fight has Special Moves (duel.ts withSpecials: the ladder level picks the opponent's share, `aiSkill` names his special).
export const initialPractice = (seed = 731, opponent: Opponent = OPPONENTS.veteran, weapon: WeaponId = DEFAULT_WEAPON, skill: SkillId | null = null, specials?: { level: number; aiSkill: SkillId | null; name?: SpecialName | null }, gambit?: number, stance?: PickedStance, pose?: DuelPose, sheet?: Sheet, spell?: Spell, spell2?: Spell, foeSpell?: Spell, skill2?: SkillId): Practice => {   // foeSpell (sandbox opponent spells): the opponent's spell, slot 1   // spell: the player's spell (RV53, spell-cast.ts): needs the specials; the record's flag, the draw seeded by this fight's seed
   // stance: the fight has stances (RV34, the record's flag): the player's pick, and the opponent's mood drawn from the seed   // sheet: the player's sheet (RV48, sheet-rows.ts)   // gambit: the fight has the Gambit (RV33, the record's flag); its draws are seeded by this number, the fight's own seed
  const duel = specials ? withSpecials(initialDuel(opponent, weapon, skill, pose), specials.level, specials.aiSkill, undefined, specials.name) : initialDuel(opponent, weapon, skill, pose);
  const armed = gambit === undefined ? duel : withGambit(duel, gambit);
  const staged = stance === undefined ? armed : withStances(armed, asStance(stance), asStance(moodOf(seed, opponent.id)));
  const sheeted = sheet ? withSheet(staged, [sheet, undefined]) : staged;
  const armedSpell = spell ? withSpell(sheeted, 0, spell, seed) : sheeted;
  const armedTwo = spell2 ? withSpell(armedSpell, 0, spell2, seed, 1) : skill2 ? withSkill2(armedSpell, 0, skill2) : armedSpell, armedFoe = foeSpell ? withSpell(armedTwo, 1, foeSpell, seed) : armedTwo;
  return project(armedFoe, initialAi(seed));   // sheet (RV48): the player's sheet, slot 0; the record's flag, never a number a client sent
};
// `layer`: a world layer that rewrites the warden's intent AFTER decide() (src/fight/mobkit.ts: signature moves; sparring.ts does the same for the dummy). Absent = today's fight, the same intent object.
export function stepPractice(current: Practice, intent: Intent, profile: AiProfile = PROFILES.normal, layer?: (duel: Duel, warden: Intent) => Intent): Practice {
  const warden = decide(current.duel, 1, current.ai, profile);
  return project(stepDuel(current.duel, [intent, layer ? layer(current.duel, warden.intent) : warden.intent]), warden.ai, current, intent);
}
export const canStrike = (s: Practice): boolean => legal(s.duel.fighters[0], 'light');
export const canDefend = (s: Practice): boolean => s.health > 0 && s.playerHealth > 0 && (s.phase === 'ready' || s.phase === 'guard');
// Controls stay responsive while busy: an action is accepted now, or queued in the last ticks of a committed action.
/** The HUD button a refused press shakes (hud.ts `refused`): any heavy press (V1's 'heavy' or a V3 directional heavy, duel.ts isHeavy) is the HEAVY button's. */
export const refusedButton = (action: Action | undefined): 'heavy' | 'thrust' | 'kick' | 'skill' | 'skill2' | 'dodge' | 'guard' | 'attack' =>
  action !== undefined && isHeavy(action) ? 'heavy' : action === 'thrust' || action === 'kick' || action === 'skill' || action === 'skill2' ? action
    : action === 'dodge' || action === 'backstep' ? 'dodge' : action === 'parry' ? 'guard' : 'attack';
export const accepts = (s: Practice, action: Action): boolean => s.health > 0 && s.playerHealth > 0
  && (legal(s.duel.fighters[0], action) || (inBufferWindow(s.duel.fighters[0]) && !(isHeavy(action) && s.phase === 'draw')));

// The specials' honest state (Dom 2026-10-26: "WHIRLWIND often doesn't work when I click"): what the two SPECIAL buttons and their ready ring
// show, built only on the sim's own gates — legal() for cooldown, stamina, phase and the post-strike recovery, the special's reach as stepDuel
// refuses it, and the buffer rule (a press in a committed action's tail is queued bufferTtl ticks and fires only if legal() passes by then).
// accepts() lights the whole tail whatever the cooldown, so a press there could be dropped silently; this never says ready unless the sim takes it.
export type SpecialSlot = 'skill' | 'skill2';
export type SpecialReason = 'cooldown' | 'stamina' | 'range' | 'busy';
export type SpecialReadiness = { ready: boolean; reason: SpecialReason | null; cooldownFrac: number; cooldownLeft: number; short: boolean };   // short: the stamina (or mana) gate alone would refuse it now
/** The farthest gap SPECIAL 1 is pressed at, as stepDuel refuses it (a picked melee special's specialMeleeReach row, else the rules' special reach); null = no range gate (a spell's own range rows, a plain skill's cone swing). */
export function specialReach(f: Fighter): number | null {
  if (f.specialShare === undefined || f.spell !== undefined) return null;
  return f.picked ? meleeSpecialReach(RULES.special.reach) : RULES.special.reach;
}
// The span the cooldown counts down from: the first-cast delay while the fight's opening window runs (tick + left is constant there), else the slot's own.
function cooldownSpan(duel: Duel, slot: SpecialSlot, left: number): number {
  const f = duel.fighters[0], first = specialFirst(RULES.special.first);
  const own = slot === 'skill' ? (f.specialShare !== undefined && f.spell === undefined ? termCooldown(f, specialCooldown(RULES.special.cooldown)) : f.specialShare !== undefined ? specialCooldown(RULES.special.cooldown) : termCooldown(f, RULES.skillCooldown))
    : f.skill2 !== undefined ? termCooldown(f, RULES.skillCooldown) : specialCooldown(RULES.special.cooldown);   // the same numbers stepDuel spends (special-terms.ts: the hero's 9 s while on)
  return Math.max(left, 1, duel.tick + left <= first ? first : own);
}
export function specialReadiness(duel: Duel, slot: SpecialSlot): SpecialReadiness {
  const f = duel.fighters[0], foe = duel.fighters[1];
  const left = slot === 'skill' ? f.skillCooldown : f.skillCooldown2 ?? 0;
  const cooldownFrac = left > 0 ? 1 - left / cooldownSpan(duel, slot, left) : 1;
  const reach = slot === 'skill' ? specialReach(f) : null, far = reach !== null && distance(f.body, foe.body) > reach;
  // Every gate but the pools lifted: does legal() refuse it on stamina (or mana) alone?
  const free: Fighter = { ...f, phase: 'ready', age: 0, exposed: 0, parrying: false, special: 0, specialRecover: 0, skillCooldown: 0, ...(f.skillCooldown2 !== undefined ? { skillCooldown2: 0 } : {}), exhausted: false };
  const short = f.health > 0 && legal({ ...free, stamina: Infinity, ...(f.mana !== undefined ? { mana: Infinity } : {}) }, slot) && !legal({ ...free, exhausted: f.exhausted }, slot);
  // The buffer rule: from the tail of a committed phase the press is queued and last tried bufferTtl - 1 ticks on, standing, its timers run down.
  const k = RULES.bufferTtl - 1, tail = (): Fighter => ({ ...f, phase: 'ready', age: 0, skillCooldown: Math.max(0, f.skillCooldown - k), ...(f.skillCooldown2 !== undefined ? { skillCooldown2: Math.max(0, f.skillCooldown2 - k) } : {}), specialRecover: Math.max(0, (f.specialRecover ?? 0) - k) });
  const takes = f.health > 0 && foe.health > 0 && (legal(f, slot) || (inBufferWindow(f) && f.phase !== 'hurt' && legal(tail(), slot)));
  const ready = takes && !far;
  const reason: SpecialReason | null = ready ? null : takes && far ? 'range' : left > 0 ? 'cooldown' : short ? 'stamina' : 'busy';
  return { ready, reason, cooldownFrac, cooldownLeft: left, short };
}

// Presentation helper: which clip, how far through it, and where its contact pose sits. Animation observes; it never decides.
type Pose = Exclude<LegacyPhase, 'hurt' | 'dead' | 'backstep'> | 'hit' | 'death';
export function actorPose(s: Practice, side: Side): { pose: Pose; progress: number; attack: Attack; contact: number } {
  const f = s.duel.fighters[side], phase = legacyPhase(f), attack = clipOf(f), specs = attackSpecs(f.weapon);
  const pose: Pose = phase === 'dead' ? 'death' : phase === 'hurt' ? 'hit' : phase === 'backstep' ? 'ready' : phase;   // a backstep is armed footwork; travel direction drives the walk
  const duration = phase === 'attack' || phase === 'kick' ? total(timing(f))
    : phase === 'draw' ? RULES.draw
    : phase === 'roll' ? RULES.roll
    : phase === 'hurt' || phase === 'dead' ? f.stun : 1;
  const contact = phase === 'attack' || phase === 'kick' ? timing(f).windup / duration : specs[attack].contact / specs[attack].recovery;
  // A Special Move (special-look.ts; placeholder motion until the pilot's own clips): the heavy's raise held through the windup, its
  // downstroke as the strike and the recovery after it.
  const special = phase === 'ready' ? specialStage(f) : null;
  if (special) { const c = specs.heavy.contact / specs.heavy.recovery; return { pose: 'attack', progress: special.stage === 'windup' ? c * special.progress : c + (1 - c) * special.progress, attack: 'heavy', contact: c }; }
  return { pose, progress: Math.min(1, (phase === 'attack' ? poseAge(f) : f.age) / Math.max(1, duration)), attack, contact };
}
/** The fraction of the wind-up (progress / contact) after which the weapon trail draws (characters.ts). */
export const TRAIL_FROM = 0.7;
// VIEW ONLY (review of PR #10): the wind-up age a HELD directional heavy is drawn at. The sim parks it at the overhead's chamber tick, which on the
// borrowed cut / stab clips is a crouch with the blade tucked; the row's holdPoseAge (the late wind-up, blade cocked) is drawn instead, eased in over
// holdBlendTicks of the hold. Released, the drawn age runs linearly from where the hold left it back onto the sim's age by the tick the trail turns on
// (TRAIL_FROM of the wind-up), so the release never snaps back, and the trail, the contact frame and everything after are drawn exactly as before.
// Every other move, an unheld or chained swing, and ?heavy=v1 (no directional heavies) draw f.age.
export function poseAge(f: Pick<Fighter, 'phase' | 'move' | 'charge' | 'age' | 'weapon' | 'chained'>): number {
  const hold = f.phase === 'attack' && !f.chained && f.charge > 0 ? holdPoseOf(f.move) : null, chamber = hold ? movesOf(f)[f.move!].chamber : null;
  if (!hold || chamber == null) return f.age;
  const held = chamber + (hold.age - chamber) * Math.min(1, f.charge / hold.blend), rejoin = Math.max(held, TRAIL_FROM * timing(f as Fighter).windup);
  if (f.age <= chamber) return held;
  if (f.age >= rejoin) return f.age;
  return held + (rejoin - held) * (f.age - chamber) / (rejoin - chamber);
}

const NAMES: Partial<Record<MoveId, string>> = {   // a skill's name is its row's (skill-defs.json)
  light_right: 'right cut', light_left: 'left cut', heavy_overhead: 'heavy', thrust: 'thrust', riposte: 'riposte',
  slash_riposte: 'counter slash', heavy_riposte: 'heavy riposte', critical: 'critical', heavy_counter: 'guard counter', kick: 'kick',
  heavy_right: 'heavy right cut', heavy_left: 'heavy left cut', heavy_thrust: 'heavy stab',   // V3 directional heavies
};
// `foe`: the opponent's own name without its article ("Centurion", "Goblin"), so the coaching lines name whoever is in the arena
// (Dom via Strategy, 2026-09-22: "warden" leaves every player-facing string; identifiers keep it). The default covers the callers
// that have no opponent loaded — the sim's own tests and any hint drawn before the rung is known.
// The line reports WHAT HAPPENED or WHAT STATE YOU ARE IN, never what to do or when (Strategy 2026-09-24, Dom 09-20 "no visual
// cues"): no line reads the opponent's state or names an answer; a state line is its state word; with nothing to report it is blank.
// `legend`: the name this opponent fights under at this fight's level (legends.ts); a win reads "You beat Grendel" (Dom via Strategy,
// 2026-09-27). Without one (no legend row, a unit test) the line keeps the opponent's plain name.
// The line reads "You beat <legend>" exactly when this holds (practiceHint below): the legend fell, the player stands, no draw. The kill
// screen's medallion (main.ts winFace) keys on it, so the face and the name never disagree.
// The sheathed line's threat names the legend when the fight has one (Dom 2026-09-28: the legend on every surface), else the class.
export const counterLine = (foe: string, legend?: string): string => `${legend ?? `The ${foe}`} will counterattack.`;
export const beatLegend = (s: Practice, legend?: string): boolean => !!legend && !s.finish?.draw && !!s.playerHealth && !s.health;
export function practiceHint(s: Practice, foe = 'Opponent', legend?: string, specialLabel?: (skill: string) => string | undefined): string {   // specialLabel: the HUD hands in the picker's name for a special (Whirlwind), so this SIM-boundary module never imports the presentation names
  const me = s.duel.fighters[0];
  if (s.finish?.draw) return 'You both fell. Rematch?';
  if (!s.playerHealth) return 'You fell. Rematch?';
  if (!s.health) return beatLegend(s, legend) ? `You beat ${legend}. Ready for a rematch?` : `${foe} defeated. Ready for a rematch?`;
  if (s.phase === 'sheathed') return `Tap Fight. ${counterLine(foe, legend)}`;   // the words match the button (Dom 2026-09-29: Draw → FIGHT; the tap still draws)
  if (s.phase === 'draw') return `Drawing ${me.weapon}…`;
  if (me.critical > 0 && me.phase !== 'attack') return 'Posture broken';
  if (me.phase === 'attack' && me.charge) {
    return !movesOf(me)[me.move!].charges ? 'Chambered' : me.charged ? 'Charged' : 'Charging…';
  }
  if (me.exhausted) return 'Exhausted';
  if (s.phase === 'ready' && s.chain > 0) return 'Follow-through';
  if (s.result !== 'none' && s.resultAge < RESULT_AGE_CAP) {
    const name = me.chained ? 'follow-up' : (NAMES[me.lastMove ?? 'light_right'] ?? specialLabel?.(skillOfMove(me.lastMove) ?? '') ?? SKILL_ROWS[skillOfMove(me.lastMove) ?? '']?.name);
    const wall = (text: string) => s.resultWalled ? ` · ${text}` : '';
    return {
      kicked: 'Kick connected',
      hit: `${s.resultStop ? 'Stop-hit' : s.resultCounter ? 'Counter' : 'Clean'} ${name} hit · −${s.resultDamage}${wall('into the wall')}`,
      miss: 'Miss',
      hurt: `${s.resultStop ? 'Stop-hit — you walked onto the point' : s.resultTrip ? 'Swept — a low blade trips a roll' : s.resultCounter ? 'Countered' : 'Hit taken'} · −${s.resultDamage}${wall('pinned on the wall')}`,
      blocked: `${s.resultPerfect ? 'Perfect block' : 'Blocked'} · −${Math.round(s.resultStamina)} stamina${s.resultDamage ? ` · −${s.resultDamage} chip` : ''}`,
      parried: 'Parried!',
      dodged: 'Evaded!',
      // Plain words (Strategy 2026-09-24): the charge tell lives in motion + sound, so the line names what broke the guard.
      broken: s.resultBreak === 'charged' ? 'Guard broken: a charged heavy breaks guard.' : s.resultBreak === 'kick' ? 'Guard broken: a kick breaks guard.' : 'Guard broken.',
      enemyBlocked: `${foe} blocked`,
      enemyBroken: 'Guard shattered',
      enemyParried: 'Your strike was turned aside',
      enemyDodged: `The ${foe} rolled clear.`,
      enemyKicked: `Kicked · −${s.resultDamage}`,
      traded: `Traded · ${s.resultDealt} / −${s.resultDamage}`,
      postureBroken: 'Your posture broke',
      enemyPostureBroken: '',   // it read the opponent's state and named the answer: removed, the line is blank
    }[s.result];
  }
  if (s.phase === 'guard') return 'Guarding';
  if (me.exposed) return 'Parry missed · guard down for a moment';
  if (s.posture >= RULES.posture.max * .7) return 'Your posture is breaking';
  return '';   // nothing happened: the line is blank (Strategy 2026-09-24, Dom 09-20 "no visual cues"; the coach hint went 09-19, f5410421)
}

// Debug overlay text: developer readout of the simulation, never a source of truth for presentation or rules.
export function describe(s: Practice, difficulty = 'normal'): string {
  const bar = (f: Fighter) => {
    if (f.phase !== 'attack' || !f.move) {
      return f.phase === 'hurt' ? `hurt ${f.age}/${f.stun}`
        : f.phase === 'guard' ? `guard ${f.age}${f.age < RULES.parry ? ' PARRY' : ''}`
        : f.phase === 'roll' ? `roll ${f.age}/${RULES.roll}${f.age >= RULES.safeStart && f.age <= RULES.safeEnd ? ' safe' : ''}`
        : `${f.phase} ${f.age}`;
    }
    const t = timing(f), cells: string[] = Array.from({ length: total(t) }, (_, k) => k < t.windup ? '·' : k < t.windup + t.active ? '#' : '-');
    if (f.age < cells.length) cells[f.age] = '|';
    return `${f.move}${f.chained ? '+' : ''} ${f.age}/${total(t)} ${cells.join('')}${f.landed ? ' landed' : ''}${f.charge ? ` charge ${f.charge}${f.charged ? ' CHARGED' : ''}` : ''}`;
  };
  const fighter = (name: string, f: Fighter) =>
    `${name}: hp ${f.health} st ${f.stamina.toFixed(0)}${f.exhausted ? ' EXH' : ''} po ${f.posture.toFixed(0)}${f.critical ? ` CRIT ${f.critical}` : ''} rest ${f.rest} wound ${f.wound}\n`
    + `  ${bar(f)}\n`
    + `  chain ${f.chain} punish ${f.punish} parryCd ${f.parryCooldown} buf ${f.buffer ? `${f.buffer.action}:${f.buffer.ttl}` : '-'} pos ${f.body.x.toFixed(2)},${f.body.z.toFixed(2)} hd ${f.body.heading.toFixed(2)}`;
  const [p, w] = s.duel.fighters;
  const scores = Object.entries(s.ai.scores).map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(2) : v}`).join(' ');
  const h = s.ai.habits, reads = Object.entries(readOpponent(h)).filter(([, on]) => on).map(([k]) => k).join(',') || '-';
  const habits = `habits g${h.ticks ? Math.round(h.guard / h.ticks * 100) : 0}% parry ${h.parries}/${h.attacks} roll ${h.rolls}/${h.attacks} L${h.lights} H${h.heavies} T${h.thrusts} reads ${reads}`;
  const recent = s.events.map(e => `${e.type}${e.move ? `(${e.move})` : e.action ? `(${e.action})` : ''}${e.damage ? ` -${e.damage}` : ''}`).join(' ');
  return `tick ${s.duel.tick} gap ${M.hypot(p.body.x - w.body.x, p.body.z - w.body.z).toFixed(2)}\n`
    + `${fighter('you', p)}\n${fighter('warden', w)}\n`
    + `ai ${difficulty}: mode ${s.ai.mode} plan ${s.ai.plan ?? '-'} wait ${s.ai.wait} decide ${s.ai.decision} ${scores}\n`
    + `${habits}\nresult ${s.result} ${s.resultAge}${recent ? `\nevents ${recent}` : ''}`;
}
