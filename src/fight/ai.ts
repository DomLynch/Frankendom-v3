import { STAB_ON } from './stab-rule.ts';
import { RULES, type AiProfile, type Direction, type MoveId, weaponOf } from './moves.ts';
import { LATE_NOTICE } from './play-radius.ts';
import { aim, distance, elapsed, idleIntent, legal, mirror, movesOf, timing, walled, type Action, type Duel, type Intent, type Side, guardOf } from './duel.ts';
import { M } from './detmath.ts';   // never Math.<transcendental> in the sim: engines round them differently (tests/detmath.test.ts)

// Local opponent controller. It reads only committed duel state (never the other side's pending intent), notices a fresh
// action `reaction` ticks late, and emits an ordinary Intent that stepDuel judges by the same rules as the player's.
export type AiMode = 'approach' | 'circle' | 'retreat' | 'guard';
type AiPlan = 'parry' | 'dodge' | 'block' | 'evade' | 'ignore';
// Habits: what the opponent has done this match, counted from committed state edges only. The warden reads them (see `readOpponent`)
// and adapts — a parry-happy player gets baited swings, a turtle gets kicked and charged through, a roller gets delayed swings and
// tail punishes, a light-spammer gets parried more. Reads need evidence first, so the first exchanges are always the honest ones.
export type Habits = {
  ticks: number; guard: number; parries: number; rolls: number; steps: number;
  lights: number; heavies: number; thrusts: number; kicks: number; attacks: number; parks: number;
  latch?: number;   // `ticks` value until which a counted defence keeps the early spam gate off (RV31)
  hold?: number;  // ticks the guard has been held without a break (RV31: a guard held through my windup is a commitment, not a tap)
  run?: number;   // consecutive lights: reset by any other blow that starts and by a defence that meets a blow (RV31, profile.spamRun's early gate)
};
export type Reads = { parryHappy: boolean; turtle: boolean; roller: boolean; stepper: boolean; spammer: boolean; parker: boolean; poker: boolean; kicker: boolean };
export const READ = {
  feint: 1 / 6, after: 2, parry: .5, guardTicks: 180, guardShare: .45, roll: .4, swings: 11, lightShare: .7, baitHold: 12,
  parryBoost: 2, parryCap: .85, chargeBoost: .4, kickBoost: .3, anticipate: 8, baitShare: .7, parkShare: .5, lateNotice: 6, holdTicks: 6, latch: 600, plus: 2, decay: 0,
} as const;   // swings 11 / anticipate 8 (re-swept after the slice-P stamina economy): a cut-only player at normal still wins about a quarter of duels (owner: 5–8 of 24)
// The tells a profile's tellReaction answers (RV19): the thrust and the pommel strike, the two blows a short weapon must meet early.
const TELLS = new Set<string>(['thrust', 'skill_pommel']);
export const readOpponent = (h: Habits, profile?: AiProfile): Reads => {
  const swings = h.lights + h.heavies + h.thrusts;
  const oldSpam = swings >= READ.swings && h.lights / swings >= READ.lightShare;
  // RV31: a profile with `spamRun` reads a masher EARLY: that many consecutive lights with no defence that met a blow
  // between them (the gate reads the run alone and REPLACES the old read). Absent = the old read, byte for byte.
  const spam = profile?.spamRun
    ? ((h.run ?? 0) >= profile.spamRun + (h.ticks < (h.latch ?? 0) ? READ.plus : 0)) || (!!profile.spamBoth && oldSpam)
    : oldSpam;
  return {
    parryHappy: h.attacks >= READ.after && h.parries / h.attacks >= READ.parry,
    turtle: h.ticks >= READ.guardTicks && h.guard / h.ticks >= READ.guardShare,
    roller: h.attacks >= READ.after && h.rolls / h.attacks >= READ.roll,
    // backsteps out of most of my swings (the whiff punisher's habit): a kick reaches where a swing does not
    stepper: h.attacks >= READ.after && h.steps / h.attacks >= READ.roll,
    // cuts only: a player mixing in thrusts or heavies is not a spammer
    spammer: spam,
    // swings mostly held at their chamber (baits, charges): the park is a habit, not a read of the moment
    parker: swings >= READ.after && h.parks / swings >= READ.parkShare,
    // thrusts more than he cuts: a fighter with no guard respects his reach and goes in on the whiff
    poker: swings >= READ.after && h.thrusts / swings >= .5,
    // kicks more than he swings: the same respect for the kick's reach
    kicker: h.kicks >= READ.after && h.kicks / (swings + h.kicks) >= .5,
  };
};
export type AiState = {
  seed: number; lastGap: number; lastTravel: number; mode: AiMode; side: 1 | -1;
  decision: number; wait: number; next: 'light' | 'heavy' | 'thrust' | null; plan: AiPlan | null; readSide: Direction | null;
  jitter: number; retreatUntil: number; hold: boolean; feint: boolean;
  disengageUntil: number;   // the tick until which a landed blow is followed by a hop back out (profile.disengage)
  brace?: boolean;   // this threat is met in a guard that stops heavies (profile.braceHeavy), rolled once per threat
  habits: Habits; scores: Record<string, number>;
};
export const initialAi = (seed = 731): AiState => ({
  seed, lastGap: 99, lastTravel: 0, mode: 'approach', side: 1, decision: 90, wait: 90, next: null, plan: null, readSide: null,
  jitter: 0, retreatUntil: 0, hold: false, feint: false, disengageUntil: 0,
  habits: { ticks: 0, guard: 0, parries: 0, rolls: 0, steps: 0, lights: 0, heavies: 0, thrusts: 0, kicks: 0, attacks: 0, parks: 0 },
  scores: {},
});
const lcg = (seed: number) => (Math.imul(seed, 1664525) + 1013904223) >>> 0;

export function decide(duel: Duel, me: Side, ai: AiState, profile: AiProfile): { intent: Intent; ai: AiState } {
  const self = duel.fighters[me], opponent = duel.fighters[1 - me], tick = duel.tick;
  const next = { ...ai, scores: {} as Record<string, number> }, intent = idleIntent();
  if (!self.health || !opponent.health || opponent.phase === 'sheathed' || opponent.phase === 'draw') return { intent, ai: next };
  const roll = () => { next.seed = lcg(next.seed); return next.seed / 4294967296; };
  // Every exit: a raised guard or a parry press carries the side read for the current threat; with nothing coming the guard stands straight (null = thrust).
  const done = () => {
    if (intent.guard || intent.action === 'parry') intent.guardDirection = threat && noticed && next.readSide ? next.readSide : undefined;
    return { intent, ai: next };
  };
  const gap = distance(self.body, opponent.body), facing = aim(self.body, opponent.body);
  const mine = movesOf(self), theirs = movesOf(opponent), fight = weaponOf(self.weapon).fight;   // each side reads its own weapon's tables
  const inside = gap < (mine.thrust.minReach ?? 0);   // inside a pole's point: the thrust meets nothing here; the answer is the kick, then a step back out
  next.lastGap = gap; next.lastTravel = opponent.body.distance;   // for the next tick's read of an advancing opponent
  const canAct = self.phase === 'ready' || self.phase === 'guard';
  // Special Moves (RULES.special, only when the fight has them: withSpecials): cast whenever it is ready and in reach. No roll is drawn, so a
  // fight without specials steps exactly as before.
  if (self.specialShare !== undefined && gap <= RULES.special.reach && legal(self, 'skill')) return { intent: { ...intent, action: 'skill' }, ai: next };
  const guardShare = profile.guard ?? 1;   // fight-identity knobs (moves.ts AiProfile): absent = the warden as it always was
  // Hit and run: a blow that landed this tick earns a hop back out of range (profile.disengage), taken as soon as the swing has recovered.
  if (profile.disengage && duel.events.some(e => e.type === 'Hit' && e.actor === me) && roll() < profile.disengage) next.disengageUntil = tick + 40;
  // Observe the opponent's habits from state edges (age 0 = this tick's start) and read them.
  const h = next.habits = { ...ai.habits, ticks: ai.habits.ticks + 1 };
  if (opponent.phase === 'guard') h.guard++;
  if (opponent.phase === 'guard' && opponent.parrying && opponent.age === 0) h.parries++;
  if (opponent.phase === 'roll' && opponent.age === 0) h.rolls++;
  if (opponent.phase === 'backstep' && opponent.age === 0) h.steps++;
  h.hold = opponent.phase === 'guard' ? (h.hold ?? 0) + 1 : 0;
  // a guard held through my windup (up to the tick it ends) is a real commitment: it ends the run with no contact needed; a tap of a few ticks does not (RV31)
  if (self.phase === 'attack' && self.move && self.age === mine[self.move].windup && h.hold >= READ.holdTicks) { h.run = READ.decay ? Math.max(0, (h.run ?? 0) - 2) : 0; h.latch = h.ticks + READ.latch; }
  // a defence that actually meets a blow ends the masher's run (RV31): a block, parry or roll-dodge event by the player, or one of my swings
  // missing a backstepping player. A bare guard / roll / backstep tick does not (a tap between cuts would otherwise blind the gate).
  // A COUNTED defence (this, or the held guard above) also latches the early gate off for READ.latch ticks: an honest player who defends is not a masher.
  if (duel.events.some(e => (e.actor === 1 - me && (e.type === 'Blocked' || e.type === 'Parried' || e.type === 'Dodged')) || (e.actor === me && e.type === 'AttackMissed' && opponent.phase === 'backstep'))) { h.run = READ.decay ? Math.max(0, (h.run ?? 0) - 2) : 0; h.latch = h.ticks + READ.latch; }
  // the first tick a swing sat at its chamber: age is rewound to the chamber only while parked, and charge stays 1 through the rest of
  // a swing released after a one-tick park, so charge === 1 alone counted every later tick of that swing as a park (bump 9)
  if (opponent.phase === 'attack' && opponent.charge === 1 && opponent.move && opponent.age === theirs[opponent.move].chamber) h.parks++;
  if (opponent.phase === 'attack' && opponent.age === 0 && opponent.move) {   // ripostes, counters and criticals are earned, not habits
    // a light that PUNISHES my whiff (starts while my swing is past its active frames, or I am hurt) is the honest answer, not a mash: it neither counts nor resets (RV31)
    const punishes = self.phase === 'hurt' || (self.phase === 'attack' && !!self.move && self.age >= mine[self.move].windup + mine[self.move].active);
    if (opponent.move === 'light_left' || opponent.move === 'light_right') { if (!punishes) h.run = (h.run ?? 0) + 1; } else h.run = 0;
    if (opponent.move === 'heavy_overhead') h.heavies++;
    else if (opponent.move === 'thrust') h.thrusts++;
    else if (opponent.move === 'light_left' || opponent.move === 'light_right') h.lights++;
    else if (opponent.move === 'kick') h.kicks++;
  }
  if (self.phase === 'attack' && self.age === 0 && self.move !== 'kick') h.attacks++;
  const reads = readOpponent(h, profile);
  // A held swing: a heavy thrown at a standing guard (or at a roller / parrier) is held to the charge that breaks or outlasts them; a
  // light held against a parry-happy player is a bait that outlives the parry window. The hold ends with the swing.
  if (self.phase !== 'attack') { next.hold = false; next.feint = false; }
  // A feinted swing: started to draw the parry, cancelled into a guard on the last feintable tick — the parry-happy player's press now meets nothing.
  if (next.feint && self.phase === 'attack' && self.move && self.age === mine[self.move].feintUntil - 1) {
    next.feint = false;
    return { intent: { ...intent, action: 'parry', guard: true }, ai: next };
  }
  intent.held = next.hold && self.phase === 'attack' && (self.move === 'heavy_overhead' ? self.charge < RULES.charge.min : self.charge < READ.baitHold);
  // a chambered light is a bait, not a guard breaker
  const charging = (f: typeof opponent) => f.phase === 'attack' && f.move !== null && f.charge > 0 && movesOf(f)[f.move].charges;
  // Being hit: back off briefly, then decide afresh (re-engage or keep distance) rather than drifting away.
  // …unless the man is GUARDLESS and the blow was a read poker's thrust: backing off from a poke walks straight back out through his point's
  // reach band, and the next poke lands on the way. Inside the point is the one place a poker cannot use it (brief 5 reach fix, 2026-09-21):
  // stay in and re-decide at once. Guardless only — a fighter who can block answers a poke as any blow is (this is the reach fix's hover
  // logic's own gate, guardShare === 0; without it the rule reached into ordinary rung-vs-rung fights that have nothing to do with the brief).
  if (self.phase === 'hurt' && self.age === 1 && guardShare === 0 && reads.poker && opponent.phase === 'attack' && opponent.move === 'thrust') {
    next.decision = 0; next.plan = null; next.next = null;
  } else if (self.phase === 'hurt' && self.age === 1) {   // a landed blow earns the player a window; no instant retaliation
    next.retreatUntil = tick + 48; next.decision = 48; next.mode = 'retreat'; next.plan = null; next.next = null;
    next.wait = Math.round((45 + roll() * 60) * (1.6 - profile.aggression));
  }
  // Perception. An attack is noticed `reaction` ticks after it starts; one response is planned per attack.
  // a swing is a threat until its active window closes
  const threat = opponent.phase === 'attack' && !opponent.landed && opponent.move !== null && opponent.age < timing(opponent).windup + timing(opponent).active;
  // Perception runs on elapsed time, not the animation clock: a swing parked at its chamber is still a swing that started `reaction` ticks ago.
  // A read cut-spammer's cuts are anticipated, not reacted to: the warden is already waiting for the cut it knows is coming, so the cut is
  // noticed within a few ticks — the parry that a 14-tick cut is otherwise too fast for. Heavies and kicks keep the honest reaction.
  // A tell (the thrust, the pommel strike) is noticed on its own clock where the profile has one (profile.tellReaction; RV19, the Centurion), so a
  // fighter can meet the point quickly while lights still get the slow reaction that keeps an easy fight easy.
  const reaction = reads.spammer && (opponent.move === 'light_left' || opponent.move === 'light_right') ? Math.min(profile.reaction, profile.anticipate ?? READ.anticipate)
    : profile.tellReaction !== undefined && TELLS.has(opponent.move ?? '') ? Math.min(profile.reaction, profile.tellReaction) : profile.reaction;
  const noticed = threat && elapsed(opponent) >= reaction;
  if (!threat) { next.plan = null; next.readSide = null; next.brace = false; }
  else if (elapsed(opponent) === reaction) {
    const move = theirs[opponent.move!];
    // The side (directional guard): the warden reads which side the blow arrives on with `profile.read`; a misread picks one of the other four,
    // and the guard he holds or the parry he presses goes there. Rolled once per threat; a profile without the knob rolls nothing and reads
    // perfectly (the pre-directional guard). A kick read right is met low — the braced kick (below).
    // A guardless fighter (the goblin) has no side to pick and rolls nothing: his stream is untouched.
    const want = mirror(move.direction);
    next.readSide = guardShare === 0 ? null
      : profile.read === undefined || roll() < profile.read ? want
      : (['left', 'right', 'overhead', 'thrust', 'low'] as Direction[]).filter(d => d !== want)[Math.floor(roll() * 4)];
    const r = roll(), inRange = gap <= move.reach + .4;
    // A guard that stops heavies (the scutum) meets a guard-breaking overhead in the guard with profile.braceHeavy; rolled only when both hold.
    next.brace = !!profile.braceHeavy && guardOf(self).stopsHeavy && move.direction === 'overhead' && roll() < profile.braceHeavy;
    const unblockable = !next.brace && (move.breaksGuard || charging(opponent) || (guardOf(self).heavyBreaks && move.direction === 'overhead'));
    const affordable = self.stamina >= move.staminaDamage;
    // A kick cannot be parried and punishes a raised guard, so a guard or a parry is never the answer. With its dodge share the warden rolls
    // (or steps out without the stamina); otherwise it takes the kick — a cheap poke whose point is to open a guard, and a warden that
    // escaped every kick would have no guard left to open (a backstep escapes it as surely as a roll).
    // A stepper takes the cheap step out when the step will clear the blow's reach before it lands (half the step is all the reaction leaves), else the roll.
    // A kick he READ is braced behind a low guard (directional guard: an ordinary block); misread or guardless, he takes it as before.
    const clears = gap + RULES.backstep.ticks * RULES.backstep.speed * 3 / 60 * self.speed * .5 > move.reach + .1;
    const stepOrRoll = () => self.stamina >= RULES.rollCost && !(profile.step && clears && roll() < profile.step) ? 'dodge' : 'evade';
    if (inRange && !move.parryable) {
      next.plan = r < profile.dodge ? stepOrRoll() : next.readSide === 'low' && guardShare > 0 && affordable ? 'block' : 'ignore';
      next.jitter = Math.round((1 - profile.accuracy) * 8 * (roll() * 2 - 1));
    } else {
      // A lapse: the swing was seen but gets no answer (a cut of 20 ticks is reactable; a human still eats a share of them). Reads sharpen attention:
      // against a read spammer the lapse halves.
      const lapse = reads.spammer ? profile.lapse * .5 : profile.lapse;
      // a cut-only player is parried more (never by a profile that cannot parry; rolls keep their share)
      const parryChance = reads.spammer ? Math.min(READ.parryCap, 1 - profile.dodge, profile.parry * READ.parryBoost) : profile.parry;
      // A swing that cannot reach is ignored. A guard stops what it can afford; a charged heavy or a riposte calls for a timed parry, a roll or distance.
      next.plan = !inRange || roll() < lapse ? 'ignore'
        : r < parryChance && !self.parryCooldown ? 'parry'
        : r < parryChance + profile.dodge && self.stamina >= RULES.rollCost ? 'dodge'
        : unblockable ? (self.stamina >= RULES.rollCost && !(profile.step && clears && roll() < profile.step) ? 'dodge' : !self.parryCooldown && guardShare > 0 ? 'parry' : 'evade')
        : affordable && (guardShare >= 1 || roll() < guardShare) ? 'block' : 'evade';
      // Late notice (COMBAT-001), every blow but a tell (the thrust and the pommel strike keep their honest answer: a ranged thrust is the opener a warden must meet): `spare` is the ticks between noticing the blow and its contact. A swing noticed on the contact tick or later is never answered
      // in time; one noticed with a tick to spare is answered only (spare - 1) / (lateNotice - 1) of the time, so the step from "never in time" to "always in
      // time" spreads over lateNotice - 1 levels of reaction instead of one. No draw is made at spare <= 0, so a warden slower than the cut keeps its stream.
      const spare = timing(opponent).windup - reaction;
      if (next.plan !== 'ignore' && profile.softNotice && LATE_NOTICE && !TELLS.has(opponent.move ?? '') && !opponent.chained && spare > 0 && spare < READ.lateNotice && roll() >= (spare - 1) / (READ.lateNotice - 1)) next.plan = 'ignore';
      next.jitter = Math.round((1 - profile.accuracy) * 8 * (roll() * 2 - 1));
    }
  } else if (noticed && next.plan === 'block' && charging(opponent) && !next.brace) {   // a heavy seen to be charging will break the guard: change the answer
    next.plan = self.stamina >= RULES.rollCost ? 'dodge' : !self.parryCooldown && guardShare > 0 ? 'parry' : 'evade';
  }
  // Openings: a stagger, exhaustion, the recovery of a swing that missed — and, against a roller, the tail of a roll. A landed hit is not an opening: it staggered me.
  // A parry that met nothing is the classic opening.
  const opening = (opponent.phase === 'hurt' && opponent.age >= profile.reaction) || opponent.exhausted || opponent.exposed > 0
    || (opponent.phase === 'attack' && !opponent.landed && opponent.age - timing(opponent).windup - timing(opponent).active >= profile.reaction)
    || (reads.roller && opponent.phase === 'roll' && opponent.age >= RULES.safeEnd);
  const guarded = opponent.phase === 'guard' && opponent.age >= profile.reaction;
  // Walking onto the point: the opponent moved this tick and the gap closed, from beyond cutting range to inside the thrust's.
  const advancing = (opponent.phase === 'ready' || opponent.phase === 'guard') && opponent.body.distance > ai.lastTravel && ai.lastGap > gap + .01
    && gap < mine.thrust.reach - .1 && gap > mine.light_right.reach - .1;
  // a read spammer standing ready inside cutting range will cut before a slow swing lands
  const pressured = reads.spammer && opponent.phase === 'ready' && gap <= theirs.light_right.reach + .1;
  // Movement mode: seeded, bounded decisions; never reads hidden input.
  // Timers pause while staggered: the punish window is measured from recovery, not from the blow.
  if (self.phase !== 'hurt') { next.decision = Math.max(0, next.decision - 1); next.wait = Math.max(0, next.wait - 1); }
  // When the cadence timer expires the warden commits to the kind of attack it will close in for.
  // The first opener is always the heavy (the readable parry lesson); after that the warden also opens with the thrust — a faster tell
  // (16 ticks to the heavy's 32) with the longest reach, so it is the spacing opener from just outside cutting range.
  // A read parrier sees mostly cuts (held past the parry window as baits, or feinted), not the heavy whose long tell is what they are parrying.
  // The lorarii: three quarters of a loiter clock at the wall and the next opener is now, not on the cadence, and a circler closes to
  // deliver it (an attack resets the clock; circling at 1.3 m with a knife swings at nothing and gets lashed).
  if (self.loiter >= RULES.wall.loiter.ticks * .75) {
    next.wait = 0;
    if (next.mode === 'circle' && self.stamina >= profile.discipline * self.maxStamina / 100) next.mode = 'approach';
  }
  if (!next.wait && !next.next && canAct) {
    const lightShare = reads.parryHappy ? Math.max(profile.pressure, READ.baitShare) : profile.pressure;
    next.next = roll() < lightShare ? 'light' : h.attacks > 0 && roll() < fight.thrustShare ? 'thrust' : 'heavy';
  }
  // An opener the bar's worn ceiling can no longer pay for (attrition; a weapon whose heavy costs more than the floor) would be waited for
  // for ever: it becomes a cut, which every weapon can always afford at the floor.
  if (next.next && next.next !== 'light' && mine[next.next === 'heavy' ? 'heavy_overhead' : 'thrust'].stamina > self.maxStamina) next.next = 'light';
  // A planned cut whose blade has a point (minReach) is useless against a man standing inside it; if the heavy or the thrust can be thrown from here,
  // the plan becomes that instead of waiting for a cut that never comes (the Executioner at hard stood over a man at 1.2 m for a minute: his cut
  // needs 1.5 m, his heavy 0 — and hard plans cuts half the time).
  if (next.next === 'light' && gap < (mine.light_right.minReach ?? 0) + .1) {
    const can = (id: 'heavy_overhead' | 'thrust', action: 'heavy' | 'thrust') => gap >= (mine[id].minReach ?? 0) + .1 && gap <= mine[id].reach - .1 && legal(self, action);
    if (can('heavy_overhead', 'heavy')) next.next = 'heavy';
    else if (can('thrust', 'thrust')) next.next = 'thrust';
  }
  // a heavy planned against a read spammer becomes a cut: the 32-tick swing would be cut first (and never left the warden waiting in guard for a cut that does not come)
  if (pressured && next.next === 'heavy') next.next = 'light';
  // Below the stamina floor it recovers by circling just outside the player's light reach; it only backs right off
  // when very low or freshly hit. Guarding stops regeneration, so it is a choice made with stamina in hand.
  // The stamina floor is a share of the bar's current ceiling: attrition wounds lower the ceiling, and a floor above it would leave the warden circling for ever.
  const floor = profile.discipline * self.maxStamina / 100, low = self.stamina < floor;
  const shaky = self.posture >= RULES.posture.max * .7;   // near a posture break it gives ground so the bar drains
  if (!next.decision) {
    const r = roll();
    next.decision = 36 + Math.floor(r * 45); next.side = next.seed & 1 ? 1 : -1;
    next.mode = low || shaky ? (gap < 1.7 || self.stamina < RULES.rollCost ? 'retreat' : 'circle')
      : gap > 1.4 ? 'approach' : gap < 1 ? 'retreat' : r < .33 * guardShare ? 'guard' : 'circle';
  }
  if (gap > 2.5 || (!low && !shaky && gap > 1.9)) next.mode = 'approach';
  if (tick < next.retreatUntil || ((low || shaky) && gap < 1.2)) next.mode = 'retreat';
  else if ((low || shaky) && next.mode === 'retreat' && gap >= 1.9) next.mode = 'circle';
  // The ring wall. A retreat that would put its own back to the wall becomes a circle along it, on the side that leads inward; a player with
  // the wall at their back is pressed straight (no circling: the wall is doing the cutting off).
  const myBack = walled(self.body, -M.sin(facing), -M.cos(facing), duel.radius), theirBack = walled(opponent.body, M.sin(facing), M.cos(facing), duel.radius);
  if (next.mode === 'retreat' && myBack) {   // lateral toward the centre
    next.mode = 'circle';
    next.side = (self.body.x * M.cos(facing) - self.body.z * M.sin(facing)) > 0 ? -1 : 1;
  }
  if (next.mode === 'circle' && theirBack && !low && !shaky) next.mode = 'approach';
  if (canAct && noticed && next.plan !== 'ignore') {
    // Contact is estimated on the animation clock, so a swing parked at its chamber does not draw the press. A committing parrier (the
    // Nightborn) reads the tell instead — elapsed ticks since the swing began, the way a human does — so a swing held at its chamber draws
    // his press and meets nothing: the bait and the charge are his weaknesses. Until the park is read as a habit (reads.parker): then he
    // waits for the blade to pass its chamber and presses on its clock like a man. The first baits land; a habit does not.
    const commits = guardOf(self).commits, wary = commits && reads.parker, window = guardOf(self).window;
    const estimate = timing(opponent).windup - (commits && !wary ? elapsed(opponent) : opponent.age) + next.jitter;
    const moving = !wary || opponent.age > (theirs[opponent.move!].chamber ?? -1);
    next.scores = { [next.plan!]: 1, estimate };
    if (next.plan === 'parry') {
      // Press when the window will cover the estimated contact; hold an open window; release a stale standing guard so a fresh press can parry.
      // The press comes `window − 2` ticks before contact so the window's tail covers it: a man's 10-tick window presses at contact − 8; a longer
      // window (the Nightborn's 14) presses earlier — inside the player's feint window, which is exactly what makes him baitable.
      if (self.phase === 'ready') { if (estimate <= window - 2 && moving) { intent.action = 'parry'; intent.guard = true; } }
      else intent.guard = self.age < window || estimate <= 3;
    } else if (next.plan === 'dodge' && self.stamina >= RULES.rollCost && estimate <= RULES.safeEnd - 2 && estimate >= RULES.safeStart) intent.action = 'dodge';
    else if (next.plan === 'evade') {   // step out of the blow's reach (one step while inside it), then keep walking back, still facing the blade
      if (legal(self, 'backstep') && gap <= theirs[opponent.move!].reach + .2) intent.action = 'backstep';
      else intent.move = { x: -M.sin(facing), z: -M.cos(facing), yaw: 0, run: false };
    }
    else if (guardShare > 0) intent.guard = true;   // a block, or a roll whose moment has not come: wait behind the guard (a guardless fighter waits on his feet)
    return done();
  }
  // Offence: utility scores over what the opponent is committed to. A light is a punish or a chain; a heavy or kick is the
  // honest, readable attack against a standing opponent, so every difficulty shows the player the parry timing.
  if (canAct && !self.exhausted) {
    // Move reach already includes the wind-up step-in; a small margin keeps swings from whiffing at the edge.
    const inReach = (id: MoveId) => gap <= mine[id].reach - .1 && gap >= (mine[id].minReach ?? 0) + .1
      && legal(self, id === 'heavy_overhead' ? 'heavy' : id === 'kick' ? 'kick' : id === 'thrust' ? 'thrust' : 'light');
    const r = roll();
    // The kick: inside a pole's point it is the only blow that lands — not into a swing already in the air, and not inside the window a
    // landed blow earned the player; a turtle is kicked more, and a kick goes through a parry window, so a parrier is kicked too;
    // profile.kick is a kicker's answer to a read roller or backstepper — the one blow their timing does not escape.
    const kickNow = (inside && !threat && tick >= next.retreatUntil)
      || ((guarded || reads.parryHappy) && r < .5 + (reads.turtle || reads.parryHappy ? READ.kickBoost : 0))
      || (!!profile.kick && !threat && (reads.roller || reads.stepper) && r < profile.kick);
    const scores: Record<string, number> = {
      critical: self.critical > 0 && inReach('heavy_overhead') ? 1.6 : 0,   // a broken posture is finished with the critical, not a riposte
      counter: self.counterWindow > 0 && inReach('heavy_overhead') ? 1.4 : 0,   // a block opens the guard counter: the designed answer to cut pressure
      // A fast fighter's stab (profile.stab): the cut cannot reach the man who just whiffed, but the knife's 12-tick thrust can — the shortest tell in the
      // game, so a reactive guard raised when the stab is seen is raised too late. Counted in the same draw as the rest (no roll of its own).
      punish: opening && (inReach('light_right') || (STAB_ON && !!profile.stab && inReach('thrust') && r < profile.stab)) ? 1.5 : 0,
      // a follow-up the cut cannot reach goes as the thrust when the chain allows it
      chain: self.chain > 0 && (inReach('light_right') || (self.lastMove !== null && !!mine[self.lastMove].chain?.follow.includes('thrust') && inReach('thrust'))) && r < profile.aggression ? 1.2 : 0,
      kick: inReach('kick') && kickNow ? 1.1 + (reads.turtle ? READ.kickBoost : 0) : 0,
      // never a slow opener into a ready spammer: the cut lands first
      heavy: guarded && inReach('heavy_overhead') ? 1 : next.next === 'heavy' && !threat && !pressured && inReach('heavy_overhead') ? .8 : 0,
      light: next.next === 'light' && !threat && !guarded && inReach('light_right') ? .8 : 0,
      // A fast fighter's counter-swing: a cut INTO a slower tell that will land first (their wind-up has more left than his whole cut) — the interrupt.
      interrupt: profile.interrupt && threat && opponent.move !== null && !opponent.landed && timing(opponent).windup - opponent.age > mine.light_right.windup + 2
        && inReach('light_right') && r < profile.interrupt ? 1.3 : 0,
      // The thrust: a stop-hit into an opponent walking onto the point (it lands at 1.5× and staggers longer), or the scheduled opener from wherever it
      // stands; blockable, so never into a standing guard. On the cadence only: an attack that is due anyway becomes the stop-hit when the opponent is walking in.
      thrust: !threat && !guarded && inReach('thrust') && next.next !== null && (advancing || next.next === 'thrust') ? (advancing ? .9 : .8) : 0,
    };
    if (low) for (const key of ['chain', 'kick', 'heavy', 'light', 'thrust', 'interrupt']) scores[key] = 0;   // stamina discipline: only punishes below the floor
    next.scores = scores;
    const [best, score] = Object.entries(scores).sort((x, y) => y[1] - x[1])[0];
    if (score > 0) {
      const action: Action = best === 'kick' ? 'kick'
        : best === 'heavy' || best === 'critical' || best === 'counter' ? 'heavy'
        : best === 'thrust' || ((best === 'chain' || best === 'punish') && !inReach('light_right')) ? 'thrust' : 'light';
      next.wait = Math.round((45 + roll() * 60) * (1.6 - profile.aggression)); next.next = null;
      // A less aggressive warden sometimes baits instead: a visible guard the player must open with a heavy or a kick.
      // The stop-hit is never traded for a bait: the moment is now.
      const baitable = best === 'heavy' || best === 'light' || (best === 'thrust' && !advancing);
      if (baitable && !guarded && roll() < (1 - profile.aggression) * .6 * guardShare) {
        next.mode = 'guard'; next.decision = 36 + Math.floor(roll() * 45); intent.guard = true;
        return done();
      }
      // A guard is charged through 20/40/60 % of the time by level (more against a turtle or a roller, whose answer a charge outlasts); a
      // parry-happy player has lights held past the parry window as baits.
      const chargeChance = profile.aggression - .25 + (reads.turtle || reads.roller || reads.parryHappy ? READ.chargeBoost : 0);
      next.hold = best === 'heavy' ? (guarded || reads.roller || reads.parryHappy) && roll() < chargeChance : best === 'light' && reads.parryHappy && roll() < READ.baitShare;
      // one swing in six at a parrier is a feint; a feinting fighter (profile.feint) feints anyone
      const feintChance = Math.max(profile.feint ?? 0, reads.parryHappy ? READ.feint : 0);
      next.feint = feintChance > 0 && (action === 'heavy' || action === 'light') && !next.hold && roll() < feintChance;
      return { intent: { ...intent, action, held: next.hold }, ai: next };
    }
  }
  // Against a read cut-spammer the warden walks in guard inside cutting range when it is not swinging: the cuts are blocked (no chip) and
  // every block opens the guard counter above. It keeps closing (a guard walk, at guard speed) so a spammer hovering at the edge of
  // reach is met, never waited for. Below the stamina floor it steps back out instead.
  if (pressured && canAct && !self.exhausted && !threat && !low && guardShare > 0) intent.guard = true;
  if (next.mode === 'guard' && canAct && !self.exhausted) { intent.guard = true; return done(); }
  // Inside the point with no kick to give (spent, or just thrown): a backstep out to where the pole works, still facing the blade.
  if (inside && canAct && !threat && legal(self, 'backstep')) return { intent: { ...intent, action: 'backstep' }, ai: next };
  // Hit and run: the hop back out after a landed blow.
  if (tick < next.disengageUntil && canAct && !threat && legal(self, 'backstep')) {
    next.disengageUntil = 0;
    return { intent: { ...intent, action: 'backstep' }, ai: next };
  }
  // Closing distance: to cutting range normally; a warden that has decided on a thrust stops just inside thrust reach, so the thrust opens from where a cut cannot reach.
  // Between a pole's point and its first move in reach (minReach … minReach + .1, the margin inReach keeps): a step back to where the pole works
  // instead of standing frozen — the reaper Wraith, whose approach stops at 1.9 m, met a fighter parked at 1.45 m and never moved again.
  const cramped = next.mode === 'approach' && gap < (mine.thrust.minReach ?? 0) + .1;
  let forward = next.mode === 'approach' && gap > (next.next === 'thrust' ? mine.thrust.reach - .2 : fight.close) ? .6
    : next.mode === 'retreat' && gap < (low ? 1.9 : 2.2) ? -.4
    : cramped ? -.4 : 0;
  // Never walk in on a charging heavy (profile.braceHeavy, with a guard that stops heavies): the short gladius stepped into the charged heavy's reach
  // and took it, 89 % of L6 fights for 'charged heavy only' (RV18 battery). He steps back out of its reach instead and comes in on the release.
  if (profile.braceHeavy && guardOf(self).stopsHeavy && charging(opponent) && forward > 0 && gap < theirs[opponent.move!].reach + .3) forward = -.4;   // the charging move's own reach (Auditer, #964 review)
  // A fighter who cannot block, against a read poker: hover just outside the thrust's reach and go in on the whiff (the opening), never walk onto the point.
  // (Standing at the edge of the reach, not beyond it: a poker who is never given the shot never whiffs. The step out answers the thrust; the whiff opens him.)
  // Brief 5 reach fix (2026-09-21): a `reads.kicker`/`reads.poker` read already requires several LANDED kicks/thrusts (READ.after) — the man
  // has proven he attacks, so "he never kicks/pokes, walk in on a timer" is not a real case here. An earlier draft added exactly that patience
  // and it only bought the warden free hits against a genuinely active kicker; dropped. The hover holds for as long as the read holds.
  // The reach respected: the thrust's, or the kick's cone plus its lunge.
  const hover = guardShare === 0 ? (reads.poker ? theirs.thrust.reach : reads.kicker ? theirs.kick.reach + .3 : 0) : 0;
  // Against a POKER the hold sits a hand INSIDE the reach (reach − .15 … − .35), not on its edge: a hover parked one centimetre outside the
  // point drew no poke at all (the trident's Goblin stood at 2.20 m against a thumb that pokes to 2.19, for two minutes). A kicker's own
  // reach model already has no such gap (no lunge to misjudge), and widening it there bought a live kicker free hits (the Goblin identity
  // gate's kick-only cheese: 2/24 → 7/24 wins) for no benefit — the kicker keeps the original margin (reach − .05 … − .3).
  const margin = reads.poker ? .15 : .05, release = reads.poker ? .35 : .3;
  // The hold may never sit outside the warden's OWN committing reach (2026-09-22). The kicker hover is built from the KICKER's reach
  // (`theirs.kick.reach + .3`) with nothing checking it against the holder's: a warden whose own thrust is shorter than that sum stops
  // driving at a gap where he cannot start the thrust, and stands there. Measured on the Goblin (knife) against a kick-only knife
  // player, hard, 7200 ticks: hover 1.50, hold from 1.45, gap pinned 1.417–1.431 (p10 = median = p90 over seeds 1–3), 4–5 attack starts
  // in the whole fight, every seed a stall. His usable reaches there are light 1.10 / thrust 1.35 / heavy 1.45, so only the heavy was
  // ever legal — and the heavy needs a `guarded` read or a queued `next`, which is why two minutes bought five swings.
  // `inReach` is the one definition of "I can start this from here" (gap <= reach - .1), so the hold derives from it rather than
  // restating a distance. Math.min only ever pulls the hold IN: the kicker margin has widened once before and it cost the Goblin's
  // identity gate (kick-only cheese 2/24 -> 7/24 wins), so this clamp is one-directional by construction.
  // The POKER branch is deliberately left alone — standing outside a live point and going in on the whiff is the Brief 5 reach fix
  // doing its job, and a poker's whiff is the opening that releases the hold. It is the kicker's `+ .3` lunge allowance that has no
  // such release when the sum overshoots the holder's own range.
  // Derived from the move he is actually COMMITTED to, not from the thrust. `next.next` is picked once and only re-picked when it is
  // null (`!next.wait && !next.next && canAct` above), and it is cleared by throwing the attack — so a warden held at a gap his queued
  // move cannot reach never attacks, never clears the plan, and never re-rolls it. Measured: queued `light` on 6599 of 6599 ready ticks,
  // thrust legal and in reach on 3340 of them, full stamina, no threat, and five swings in two minutes. Line ~191 has the mirror of this
  // rule for a plan that is too CLOSE (inside the blade's minReach); this is the missing far side of it.
  const ownReach = mine.thrust.reach - .1;
  const hold = reads.poker ? hover : Math.min(hover, ownReach);
  const holdable = opponent.phase === 'ready' || opponent.phase === 'guard' || (threat && (!noticed || next.plan === 'ignore'));   // a blow not yet noticed is not walked into either
  if (hold > 0 && !opening && holdable && gap < hold - margin && forward > 0) {
    // Held, so the plan must fit the hold. `next.next` is picked once, re-picked only when null, and cleared by being thrown, so a warden
    // held outside his queued move's reach stands there for ever: measured `light` on 6599 of 6599 ready ticks, 4-5 attack starts per 7200,
    // 24/24 stalls. Line ~191 already re-picks a plan the warden is too CLOSE for; this is the same rule on the far side.
    // Deriving the hold from the QUEUED move instead was tried and rejected by measurement: a queued light pulls the hold to 1.05, INSIDE
    // a kicker's 1.2 reach, and the Goblin's identity pin broke (normal kick-only 5 wins against the honest answer's 4) — trading a
    // stalemate for the kick-only cheese this hover exists to deny. Holding at the thrust's margin keeps him outside the kick and still
    // gives him a blow he can throw.
    const can = (id: 'light_right' | 'heavy_overhead' | 'thrust', action: 'light' | 'heavy' | 'thrust') =>
      gap >= (mine[id].minReach ?? 0) + .1 && gap <= mine[id].reach - .1 && legal(self, action);
    // NOT against a poker: the poker hover's whole design is patience — stand off the live point and go in on the whiff (Brief 5). Giving
    // him a blow to throw from there makes him take the shot instead of waiting for it, and the player's own thrust-from-range beat the
    // Goblin 15/24 against a cap of 12 when this re-pick was ungated. The stall being fixed is the kicker's, so the re-pick is the kicker's.
    if (!reads.poker && next.next === 'light' && !can('light_right', 'light')) {
      if (can('thrust', 'thrust')) next.next = 'thrust';
      else if (can('heavy_overhead', 'heavy')) next.next = 'heavy';
    }
    forward = gap < hold - release ? -.4 : 0;
  }
  // a circler drifts sideways while closing in
  const lateral = next.mode === 'circle' ? next.side * .25 : next.mode === 'approach' && forward ? next.side * .25 * (profile.circle ?? 0) : 0;
  // The dart: a sprint into an opening from outside reach (profile.dash), so the whiff is punished before it closes.
  const dash = !!profile.dash && opening && forward > 0 && gap > fight.close + .3 && self.stamina > RULES.rollCost && roll() < profile.dash;
  intent.move = { x: M.sin(facing) * forward + M.cos(facing) * lateral, z: M.cos(facing) * forward - M.sin(facing) * lateral, yaw: 0, run: dash };
  // The lorarii (RULES.wall.loiter): three quarters of a loiter clock spent in the wall band and the fighter walks off it, toward the centre, whatever his
  // mode — the whip is a worse deal than a step. Same rule for every rung (the Goblin, circling along the wall, was lashed 17 times in 24 fights).
  if (self.loiter >= RULES.wall.loiter.ticks * .75 && intent.action === null && gap > fight.close + .3) {   // in melee he attacks instead (that resets the clock)
    const r = M.hypot(self.body.x, self.body.z), inward = { x: -self.body.x / r, z: -self.body.z / r };
    intent.move = { x: intent.move.x * .5 + inward.x * .5, z: intent.move.z * .5 + inward.z * .5, yaw: 0, run: false };
  }
  return done();
}
