// Zone 1 fights on the Pit's own duel (Dom, 2026-10-08: copy the Pit, write no rule twice). EVERY fight in Zone 1 - a lone hero swinging at air, a hero against a creature, two players - is one `Bout`: a Pit `Duel`
// stepped by the Pit's own `src/duel.ts stepDuel` (the duel carries radius OPEN_RADIUS: no ring wall, the one open-world departure), with the creature brain `src/ai.ts decide` (profileAt rows) when the foe is a creature. This file is the adapter and nothing else: it builds the Pit fighters from the
// world's Fighters, maps live Input to a Pit Intent, steps the duel at its fixed 60 Hz, and writes the result back into the world's Fighters and Events. The world layer (aggro, chase to the engage ring, leash,
// give-up, heal-home, the page-driven hero position) stays in zone1.ts. Every departure from the Pit is marked `// open-world:`.
import { OPPONENTS, RULES, opponentAt, profileAt, type AiProfile } from '../moves.ts';
import { OPEN_RADIUS } from '../play-radius.ts';
import { initialAi, decide, type AiState } from '../ai.ts';
import { createFighter, idleIntent, opponentFighter, stepDuel, timing, type CombatEvent, type Duel, type Fighter as PitFighter, type Intent, type Side } from '../duel.ts';
import type { Event, Fighter, Input, Phase } from './world.ts';

/** One fight: slot 0 is a player (the "hero" of the Pit's duel); slot 1 is a creature, another player, or nobody (`foe: null`, a dummy far away: the hero alone, swinging, guarding, rolling, regaining stamina). */
export type Bout = { foe: string | null; duel: Duel; ai: AiState | null; profile: AiProfile | null; joined?: Bout[] };   // joined: the other creatures on this player, each its own duel against him (zone1.ts MAX_ATTACKERS)
// open-world: the open world has no guard-side thumb: a held guard covers the blow from the front (RULES.directionalGuard off), the Pit's other rules stand.
const OPEN_RULES = { ...RULES, directionalGuard: false } as unknown as typeof RULES;
const TICK = 1 / 60, FAR_M = 1000;
export const IDLE_INPUT: Input = { x: 0, z: 0 };
const seedOf = (id: string): number => { let h = 731; for (const c of id) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0; return h; };
const body = (f: Fighter) => ({ x: f.x, z: f.z, heading: f.facing, distance: 0 });

/** The Pit fighter for a world Fighter. A creature's body and brain are the Pit's own level rows (moves.ts opponentAt / profileAt). */
const pitOf = (f: Fighter): PitFighter => (f.side === 'creature'
  ? opponentFighter(opponentAt(OPPONENTS[f.kind as keyof typeof OPPONENTS], f.level), body(f), 'ready')
  : createFighter(body(f), 'ready', 'longsword'));
/** A bout for `hero` against `foe` (a creature, a player, or null = alone). `carry`: the hero's Pit fighter from the last bout, so stamina, posture, phase and cooldowns survive a change of foe. */
export function openBout(hero: Fighter, foe: Fighter | null, carry?: PitFighter): Bout {
  const h = carry ?? pitOf(hero), c = foe ? pitOf(foe) : createFighter({ x: hero.x + FAR_M, z: hero.z, heading: 0, distance: 0 }, 'ready', 'longsword', 1, 0, 1e9);
  const o = foe?.side === 'creature' ? OPPONENTS[foe.kind as keyof typeof OPPONENTS] : null;
  return { foe: foe?.id ?? null, duel: { tick: 0, fighters: [h, c], finish: null, events: [], radius: OPEN_RADIUS }, ai: o ? (foe!.brain ?? initialAi(seedOf(foe!.id))) : null, profile: o ? profileAt(o, foe!.level) : null };
}

const phaseOf = (f: PitFighter): { phase: Phase; t: number } => {
  if (f.phase === 'attack' && f.move) { const tm = timing(f); return f.age < tm.windup ? { phase: 'windup', t: f.age * TICK } : f.age < tm.windup + tm.active ? { phase: 'active', t: (f.age - tm.windup) * TICK } : { phase: 'recover', t: (f.age - tm.windup - tm.active) * TICK }; }
  const phase: Phase = f.phase === 'hurt' ? 'stagger' : f.phase === 'dead' ? 'dead' : f.phase === 'guard' ? 'guard' : f.phase === 'roll' || f.phase === 'backstep' ? 'roll' : 'ready';
  return { phase, t: f.age * TICK };
};

function eventsOf(list: readonly CombatEvent[], ids: readonly [string, string], after: Duel, fs: readonly [Fighter, Fighter]): Event[] {
  const out: Event[] = [], id = (s: Side) => ids[s], tell = (s: Side) => Math.round(timing(after.fighters[s]).windup * TICK * 1000);
  const scaled = (e: CombatEvent) => Math.round((e.damage ?? 0) * fs[e.actor].attack * (e.target === undefined ? 1 : fs[e.target].res));   // open-world: gear (Attack out, RES in) scales the number the Pit reports
  for (const e of list) {
    const from = out.length;
    if (e.type === 'AttackStarted' && e.move) out.push({ type: 'Telegraph', id: id(e.actor), move: e.move, ms: tell(e.actor) });
    else if (e.type === 'SpecialStarted') out.push({ type: 'Telegraph', id: id(e.actor), move: e.name ?? 'special', ms: Math.round(RULES.special.windup * TICK * 1000) });
    else if (e.type === 'AttackActive' && e.move) out.push({ type: 'Swing', id: id(e.actor), move: e.move });
    else if ((e.type === 'Hit' || e.type === 'GuardBroken' || e.type === 'SpecialLanded') && e.target !== undefined) {
      out.push({ type: 'Hit', attacker: id(e.actor), victim: id(e.target), damage: scaled(e), move: e.move ?? e.name ?? 'special' });
      if (e.type === 'GuardBroken') out.push({ type: 'Staggered', id: id(e.target), ms: Math.round(RULES.posture.stun * TICK * 1000), cause: 'guardBreak' });
    } else if (e.type === 'Blocked' && e.target !== undefined) out.push({ type: 'Blocked', attacker: id(e.target), victim: id(e.actor), perfect: !!e.perfect, damage: Math.round((e.damage ?? 0) * fs[e.target].attack * fs[e.actor].res) });
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
  const action = input.special || input.skill ? 'skill' : input.roll ? 'dodge' : input.attack === 'heavy' ? 'heavy' : input.attack === 'thrust' ? 'thrust' : input.attack === 'kick' ? 'kick' : input.attack === 'light' ? 'light' : input.guard && !guarding ? 'parry' : null;   // open-world: a guard pressed fresh is the Pit's parry tap, held it is the standing guard
  const move = input.roll ? { x: input.roll.x, z: input.roll.z, yaw: 0, run: false } : { x: input.x, z: input.z, yaw: 0, run: !!input.run };
  return { ...base, move, action, guard: !!input.guard, lock };   // open-world: lock-on is the Pit's (he turns toward the foe while ready and in a windup); alone there is nothing to lock
}

/** One world step of a bout: `ticks` Pit ticks (60 Hz). `a` is slot 0 (a player), `b` slot 1 (a creature or a player; undefined when alone). Writes the result into `a` and `b` (the caller's copies) and returns the events. */
export function stepBout(s: Bout, a: Fighter, b: Fighter | undefined, inputA: Input, inputB: Input, dt: number): { bout: Bout; events: Event[] } {
  let duel = s.duel, ai = s.ai, guardA = a.phase === 'guard', guardB = b?.phase === 'guard';
  const out: Event[] = [], ticks = Math.max(1, Math.round(dt / TICK));
  const aMul = b ? b.attack * a.res : a.res, bMul = b ? a.attack * b.res : 1;   // open-world: damage a takes = base x the attacker's Attack x its own RES; scaling its pool by the inverse leaves the Pit's duel untouched
  for (let k = 0; k < ticks; k++) {
    const [pa, pb] = duel.fighters;
    // open-world: the places, facings, stances and effective health come from the world each tick (the page walks the players).
    const ha: PitFighter = { ...pa, body: { ...pa.body, x: a.x, z: a.z, heading: pa.phase === 'roll' ? pa.body.heading : a.facing }, health: a.health / aMul, maxHealth: a.maxHealth / aMul, stamina: a.stamina, posture: a.posture, skill: a.skill, ...(a.stance ? { stance: a.stance } : {}) };
    if (a.special && ha.specialShare === undefined) { ha.specialShare = a.level >= RULES.special.bossFrom ? RULES.special.bossDamage : RULES.special.damage; ha.specialName = a.special; ha.skillCooldown = Math.round(a.specialIn / TICK); }
    const hb: PitFighter = b
      ? { ...pb, body: b.side === 'player' ? { ...pb.body, x: b.x, z: b.z, heading: pb.phase === 'roll' ? pb.body.heading : b.facing } : pb.body, health: b.health / bMul, maxHealth: b.maxHealth / bMul, ...(b.side === 'player' ? { stamina: b.stamina, posture: b.posture, skill: b.skill } : {}), ...(b.stance ? { stance: b.stance } : {}) }
      : { ...pb, body: { ...pb.body, x: a.x + FAR_M, z: a.z } };
    const before: Duel = { ...duel, fighters: [ha, hb] };
    const press = (i: Input): Input => (k === 0 ? i : { x: i.x, z: i.z, run: i.run, guard: i.guard });   // open-world: a press (cut, roll, special) is one tick; the rest of a frame's ticks hold only the walk and the guard
    const intentA = intentOf(press(inputA), guardA, !!b); guardA = !!inputA.guard;
    let intentB: Intent = idleIntent();
    if (b && ai && s.profile) { const brain = decide(before, 1, ai, s.profile); ai = brain.ai; intentB = brain.intent; }
    else if (b) { intentB = intentOf(press(inputB), guardB, true); guardB = !!inputB.guard; }
    const next = stepDuel(before, [intentA, intentB], OPEN_RULES);
    out.push(...eventsOf(next.events, [a.id, b?.id ?? ''], next, [a, b ?? a]));
    duel = { ...next, events: [] };
  }
  const [pa, pb] = duel.fighters;
  const write = (f: Fighter, p: PitFighter, mul: number): void => {
    const { phase, t } = phaseOf(p);
    f.x = p.body.x; f.z = p.body.z; f.facing = p.body.heading; f.health = Math.min(f.maxHealth, p.health * mul); f.stamina = p.stamina; f.posture = p.posture; f.exhausted = p.exhausted; f.phase = phase; f.t = t;
  };
  write(a, pa, aMul);
  if (b) write(b, pb, bMul);
  if (pa.skillCooldown !== undefined && a.special) a.specialIn = pa.skillCooldown * TICK;
  return { bout: { foe: s.foe, duel, ai, profile: s.profile }, events: out };
}
