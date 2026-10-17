// Zone 1 fights on the Pit's own duel (Dom, 2026-10-08: copy the Pit, write no rule twice). EVERY fight in Zone 1 - a lone hero swinging at air, a hero against a creature, two players - is one `Bout`: a Pit `Duel`
// stepped by the Pit's own `src/fight/duel.ts stepDuel` (the duel carries radius OPEN_RADIUS: no ring wall, the one open-world departure), with the creature brain `src/fight/ai.ts decide` (profileAt rows) when the foe is a creature. This file is the adapter and nothing else: it builds the Pit fighters from the
// world's Fighters, maps live Input to a Pit Intent, steps the duel at its fixed 60 Hz, and writes the result back into the world's Fighters and Events. The world layer (aggro, chase to the engage ring, leash,
// give-up, heal-home, the page-driven hero position) stays in zone1.ts. Every departure from the Pit is marked `// open-world:`.
import { OPPONENTS, RULES, opponentAt, profileAt, DEFAULT_WEAPON, type AiProfile } from './moves.ts';
import { OPEN_RADIUS } from './play-radius.ts';
import { emptyLadder } from './cc-ladder.ts';
import { initialAi, decide, type AiState } from './ai.ts';
import { createFighter, idleIntent, opponentFighter, stepDuel, timing, withRoll, withSheet, withSpell, type CombatEvent, type Duel, type Fighter as PitFighter, type Intent, type Side } from './duel.ts';
import type { Event, Fighter, Input, Phase } from './world.ts';
import { M } from './detmath.ts';
import { motionOf, type CreatureMotion } from './creature-motion-rows.ts';
import { worldRule } from './world-rules.ts';

/** One fight: slot 0 is a player (the "hero" of the Pit's duel); slot 1 is a creature, another player, or nobody (`foe: null`, a dummy far away: the hero alone, swinging, guarding, rolling, regaining stamina). */
export type Bout = { foe: string | null; duel: Duel; ai: AiState | null; profile: AiProfile | null; joined?: Bout[] };   // joined: the other creatures on this player, each its own duel against him (zone1.ts MAX_ATTACKERS)
// open-world: the guard-side thumbs exist here as they always have in the Pit (Dom 2026-10-13): the world steps the Pit's RULES unchanged (directionalGuard on) and carries the held side in the Input (intentOf).
const TICK = 1 / 60, FAR_M = worldRule('farM');   // FAR_M: the world-rules row `farM`
export const IDLE_INPUT: Input = { x: 0, z: 0 };
const seedOf = (id: string): number => { let h = 731; for (const c of id) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0; return h; };
const body = (f: Fighter) => ({ x: f.x, z: f.z, heading: f.facing, distance: 0 });

/** The Pit fighter for a world Fighter. A creature's body and brain are the Pit's own level rows (moves.ts opponentAt / profileAt). */
const pitOf = (f: Fighter): PitFighter => (f.side === 'creature'
  ? opponentFighter(opponentAt(OPPONENTS[f.kind as keyof typeof OPPONENTS], f.level), body(f), 'ready')
  : heroSheeted(f));
/** The hero's Pit fighter as the Pit builds it (initialDuel: createFighter with his weapon; withSheet: his sheet's bar and recovery, the sheet itself carried on the fighter so stepDuel reads its dials). No weapon = DEFAULT_WEAPON, no sheet = today's hero. */
export function heroSheeted(f: Fighter): PitFighter {
  // open-world: a hero with a spell casts through the Pit's special slot (spell-cast.ts), ready at once (no opening delay: the world has no fight start), so a live hero and a replayed one are the same hero
  const hero = createFighter(body(f), 'ready', f.weapon ?? DEFAULT_WEAPON), cast = f.spell || f.spell2 ? { ...hero, specialShare: RULES.special.damage, skillCooldown: 0, ...(f.spell ? { spell: f.spell } : {}), ...(f.spell2 ? { spell2: f.spell2, skillCooldown2: 0 } : {}) } : hero;
  return f.sheet ? withSheet({ tick: 0, fighters: [cast, cast], finish: null, events: [] }, [f.sheet, undefined]).fighters[0] : cast;
}
/** A bout for `hero` against `foe` (a creature, a player, or null = alone). `carry`: the hero's Pit fighter from the last bout, so stamina, posture, phase and cooldowns survive a change of foe. */
export function openBout(hero: Fighter, foe: Fighter | null, carry?: PitFighter): Bout {
  const h = carry ?? pitOf(hero), c = foe ? pitOf(foe) : createFighter({ x: hero.x + FAR_M, z: hero.z, heading: 0, distance: 0 }, 'ready', DEFAULT_WEAPON, 1, 0, 1e9);
  const o = foe?.side === 'creature' ? OPPONENTS[foe.kind as keyof typeof OPPONENTS] : null;
  const base: Duel = { tick: 0, fighters: [h, c], finish: null, events: [], radius: OPEN_RADIUS };
  const seed = foe?.seed ?? seedOf(foe?.id ?? hero.id), withA = h.spell && h.specialShare !== undefined ? withSpell(base, 0, h.spell, seed) : base;
  const duel = h.spell2 && h.specialShare !== undefined ? withSpell(withA, 0, h.spell2, seed, 1) : withA;   // slot b rides the same seeded stream: the draw index is the cast count, not the slot   // open-world: the cast draws are seeded by the bout (the creature's roll seed, else its id), so a replay reproduces every outcome
  return { foe: foe?.id ?? null, duel: foe?.seed === undefined ? duel : withRoll(duel, foe.seed), ai: o ? (foe!.brain ?? initialAi(seedOf(foe!.id))) : null, profile: o ? profileAt(o, foe!.level) : null };
}

/** open-world: a creature's step with its turn rate and sideways speed capped by its row (EQEmu RotateToCommand: the heading moves toward its target at the mob's rotate speed, never a snap; AzerothCore chase: the
 *  creature closes along the line to its foe and does not strafe fast). `from` is the creature before the step, `to` after, `foe` the player. Pure, no transcendental beyond detmath. */
function paced(from: PitFighter, to: PitFighter, foe: PitFighter, m: CreatureMotion): PitFighter {
  const TAU = Math.PI * 2, stepTurn = m.turnDegPerS * Math.PI / 180 * TICK;
  const d = ((to.body.heading - from.body.heading + Math.PI) % TAU + TAU) % TAU - Math.PI;
  const heading = Math.abs(d) > stepTurn ? from.body.heading + (d < 0 ? -stepTurn : stepTurn) : to.body.heading;
  let { x, z } = to.body;
  if (m.strafeMaxMps > 0) {
    const fx = foe.body.x - from.body.x, fz = foe.body.z - from.body.z, len = M.hypot(fx, fz);
    if (len > 1e-6) {
      const ux = fx / len, uz = fz / len, dx = x - from.body.x, dz = z - from.body.z, along = dx * ux + dz * uz, side = dx * uz - dz * ux, cap = m.strafeMaxMps * TICK;   // ux,uz toward the foe; side positive to the creature's right of that line
      if (Math.abs(side) > cap) { const kept = side < 0 ? -cap : cap; x = from.body.x + ux * along + uz * kept; z = from.body.z + uz * along - ux * kept; }
    }
  }
  return { ...to, body: { ...to.body, x, z, heading } };
}

const phaseOf = (f: PitFighter): { phase: Phase; t: number } => {
  if (f.phase === 'attack' && f.move) { const tm = timing(f); return f.age < tm.windup ? { phase: 'windup', t: f.age * TICK } : f.age < tm.windup + tm.active ? { phase: 'active', t: (f.age - tm.windup) * TICK } : { phase: 'recover', t: (f.age - tm.windup - tm.active) * TICK }; }
  const phase: Phase = f.phase === 'hurt' ? 'stagger' : f.phase === 'dead' ? 'dead' : f.phase === 'guard' ? 'guard' : f.phase === 'roll' || f.phase === 'backstep' ? 'roll' : 'ready';
  return { phase, t: f.age * TICK };
};

function eventsOf(list: readonly CombatEvent[], ids: readonly [string, string], after: Duel): Event[] {
  const out: Event[] = [], id = (s: Side) => ids[s], tell = (s: Side) => Math.round(timing(after.fighters[s]).windup * TICK * 1000);
  for (const e of list) {
    const from = out.length;
    if (e.type === 'AttackStarted' && e.move) out.push({ type: 'Telegraph', id: id(e.actor), move: e.move, ms: tell(e.actor) });
    else if (e.type === 'SpecialStarted') out.push({ type: 'Telegraph', id: id(e.actor), move: e.name ?? 'special', ms: Math.round(RULES.special.windup * TICK * 1000) });
    else if (e.type === 'AttackActive' && e.move) out.push({ type: 'Swing', id: id(e.actor), move: e.move });
    else if ((e.type === 'Hit' || e.type === 'GuardBroken' || e.type === 'SpecialLanded') && e.target !== undefined) {
      out.push({ type: 'Hit', attacker: id(e.actor), victim: id(e.target), damage: Math.round(e.damage ?? 0), move: e.move ?? e.name ?? 'special' });
      if (e.type === 'GuardBroken') out.push({ type: 'Staggered', id: id(e.target), ms: Math.round(RULES.posture.stun * TICK * 1000), cause: 'guardBreak' });
    } else if (e.type === 'Blocked' && e.target !== undefined) out.push({ type: 'Blocked', attacker: id(e.target), victim: id(e.actor), perfect: !!e.perfect, damage: Math.round(e.damage ?? 0) });
    else if (e.type === 'Parried' && e.target !== undefined) out.push({ type: 'Parried', attacker: id(e.target), victim: id(e.actor) });   // the Pit's own Staggered for the parried attacker follows in the same list
    else if (e.type === 'Dodged' && e.target !== undefined) out.push({ type: 'Dodged', attacker: id(e.target), victim: id(e.actor) });
    else if (e.type === 'PostureBroken' && e.target !== undefined) out.push({ type: 'Staggered', id: id(e.target), ms: Math.round((e.ticks ?? RULES.posture.stun) * TICK * 1000), cause: 'posture' });
    else if (e.type === 'Staggered') out.push({ type: 'Staggered', id: id(e.actor), ms: Math.round((e.ticks ?? 0) * TICK * 1000), cause: 'hit' });
    else if (e.type === 'Killed' && e.target !== undefined) out.push({ type: 'Died', id: id(e.target), by: id(e.actor) });
    if (out.length === from) out.push({ type: 'Pit', id: id(e.actor) });   // no summary for it: the Pit's event itself goes through
    for (let i = from; i < out.length; i++) out[i]!.pit = e;
  }
  return out;
}

/** Live Input to a Pit Intent. The player's walk is the page's (the world gives his position each step); the Input here is the press: a cut, a roll, a held guard, a special. */
function intentOf(input: Input, guarding: boolean, lock: boolean): Intent {
  const base = idleIntent();
  const action = input.special2 ? 'skill2' : input.special || input.skill ? 'skill' : input.roll ? 'dodge' : input.attack === 'heavy' ? 'heavy' : input.attack === 'thrust' ? 'thrust' : input.attack === 'kick' ? 'kick' : input.attack === 'light' ? 'light' : input.guard && !guarding ? 'parry' : null;   // open-world: a guard pressed fresh is the Pit's parry tap, held it is the standing guard
  const move = input.roll ? { x: input.roll.x, z: input.roll.z, yaw: 0, run: false } : { x: input.x, z: input.z, yaw: 0, run: !!input.run };
  return { ...base, move, action, guard: !!input.guard, ...(input.guard && input.guardDirection ? { guardDirection: input.guardDirection } : {}), lock };   // open-world: lock-on is the Pit's (he turns toward the foe while ready and in a windup); alone there is nothing to lock
}

/** One world step of a bout: `ticks` Pit ticks (60 Hz). `a` is slot 0 (a player), `b` slot 1 (a creature or a player; undefined when alone). Writes the result into `a` and `b` (the caller's copies) and returns the events. */
export function stepBout(s: Bout, a: Fighter, b: Fighter | undefined, inputA: Input, inputB: Input, dt: number, clock = 0): { bout: Bout; events: Event[] } {
  let duel = s.duel, ai = s.ai, guardA = a.phase === 'guard', guardB = b?.phase === 'guard';
  const out: Event[] = [], ticks = Math.max(1, Math.round(dt / TICK));
  for (let k = 0; k < ticks; k++) {
    const [pa, pb] = duel.fighters;
    // open-world: the places, facings, stances and effective health come from the world each tick (the page walks the players).
    const ha: PitFighter = { ...pa, body: { ...pa.body, x: a.x, z: a.z, heading: pa.phase === 'roll' ? pa.body.heading : a.facing }, health: a.health, maxHealth: a.maxHealth, stamina: a.stamina, posture: a.posture, skill: a.skill, cc: a.cc ?? emptyLadder, ...(a.stance ? { stance: a.stance } : {}) };
    if (a.special && ha.specialShare === undefined) { ha.specialShare = a.level >= RULES.special.bossFrom ? RULES.special.bossDamage : RULES.special.damage; ha.specialName = a.special; ha.skillCooldown = Math.round(a.specialIn / TICK); }
    const hb: PitFighter = b
      ? { ...pb, cc: b.cc ?? emptyLadder, ...(b.ccGuard ? { ccGuard: b.ccGuard } : {}), body: b.side === 'player' ? { ...pb.body, x: b.x, z: b.z, heading: pb.phase === 'roll' ? pb.body.heading : b.facing } : pb.body, health: b.health, maxHealth: b.maxHealth, ...(b.side === 'player' ? { stamina: b.stamina, posture: b.posture, skill: b.skill } : {}), ...(b.stance ? { stance: b.stance } : {}) }
      : { ...pb, body: { ...pb.body, x: a.x + FAR_M, z: a.z } };
    const before: Duel = { ...duel, fighters: [ha, hb], ccBase: clock + k - duel.tick };   // the ladder's window is the world's clock, not this bout's own tick
    const press = (i: Input): Input => (k === 0 ? i : { x: i.x, z: i.z, run: i.run, guard: i.guard });   // open-world: a press (cut, roll, special) is one tick; the rest of a frame's ticks hold only the walk and the guard
    const intentA = intentOf(press(inputA), guardA, !!b); guardA = !!inputA.guard;
    let intentB: Intent = idleIntent();
    const motion = b && ai && s.profile ? motionOf(b.kind) : undefined;   // open-world: a creature's row of creature-motion-defs.json (a Pit duel never reads it)
    if (b && ai && s.profile) {
      const was = ai.decision, brain = decide(before, 1, ai, s.profile); ai = brain.ai; intentB = brain.intent;
      if (motion) {
        if (ai.decision > was) ai = { ...ai, decision: Math.round(ai.decision * motion.decisionScalePct / 100) };   // open-world: it re-decides less often (the Pit's 0.6-1.3 s flips mode about once a second)
        if (motion.standAndFace && ai.mode === 'circle') intentB = { ...intentB, move: { x: 0, z: 0, yaw: 0, run: false } };   // open-world: inside reach it stands and faces (lock keeps the facing); it does not strafe
      }
    }
    else if (b) { intentB = intentOf(press(inputB), guardB, true); guardB = !!inputB.guard; }
    let next = stepDuel(before, [intentA, intentB]);
    if (motion) next = { ...next, fighters: [next.fighters[0], paced(before.fighters[1], next.fighters[1], before.fighters[0], motion)] };   // open-world: a creature's turn rate and sideways speed are capped
    out.push(...eventsOf(next.events, [a.id, b?.id ?? ''], next));
    duel = { ...next, events: [] };
    a.cc = next.fighters[0].cc; if (b) b.cc = next.fighters[1].cc;   // the world keeps the ladders: the next bout (or joiner) steps the same one
  }
  const [pa, pb] = duel.fighters;
  const write = (f: Fighter, p: PitFighter): void => {
    const { phase, t } = phaseOf(p);
    f.x = p.body.x; f.z = p.body.z; f.facing = p.body.heading; f.health = Math.min(f.maxHealth, p.health); f.stamina = p.stamina; f.posture = p.posture; f.exhausted = p.exhausted; f.phase = phase; f.t = t;
  };
  write(a, pa);
  if (b) write(b, pb);
  if (pa.skillCooldown !== undefined && a.special) a.specialIn = pa.skillCooldown * TICK;
  return { bout: { foe: s.foe, duel, ai, profile: s.profile }, events: out };
}
