// Zone 1's combat (Dom via Strategy, 2026-10-08: Zone 1 is detached from the Pit, and "copy the Pit, write no rule twice"): continuous and open, no ring, no wall, no fight start or end, no FightRecord, no seed, no replay.
// Pure and DOM-free: ONE step function over a world of free fighters in the world's own metres. EVERY fight rule - hit, guard, parry, perfect block, posture, roll, stamina, stagger, death, specials, stances - is the Pit's,
// run through the Pit's own src/duel.ts / ai.ts / sim.ts (no copies; the duel carries its own wall, Duel.radius, out of reach here) by the adapter open-fight.ts; this file owns only what the Pit has no word for: who is in whose fight (aggro, the nearest foe, the hold-off ring
// for the rest of a pack), the chase to that ring, leash, give-up, heal-home, the creature rows (`creature`, levels from moves.ts opponentAt), player-vs-player rules (the server's pvp flag, the low-level shield, the
// level band, the `Aggressed` first-strike event) and `minKillSeconds`. Conventions as the rest of the game: heading h means forward = (sin h, cos h), aim = atan2(dx, dz). World owns mounting, rendering, animation and input.
import { LEVELS, LEVEL_ANCHORS, OPPONENTS, RULES, WEAPONS, opponentAt, type SkillId, type SpecialName } from '../moves.ts';
import { CAPS, NAKED, type Loadout } from '../gear-stats.ts';
import { GAMBIT_ODDS } from '../gambit.ts';
import { asStance, moodOf, type PickedStance, type StanceId } from '../stance.ts';
import { GIVE_UP_UNSEEN_S, SPEEDS, chaseSpeed, leashOf } from './speeds.ts';
import { IDLE_INPUT, openBout, stepBout, type Bout } from './open-fight.ts';
import type { AiState } from '../ai.ts';
import type { CombatEvent, Duel } from '../duel.ts';

const TICK = 1 / 60;
const secs = (ticks: number): number => ticks * TICK;
export const STAMINA_MAX = 100;                       // duel.ts createFighter: the bar every fighter starts with
export const PLAYER_RADIUS = 0.425;                    // half the sim's 0.85 m fighter spacing (sim.ts)
export const AGGRO_M = 9;                              // a creature that is hunting a player notices him inside this ring (World's mob layer decides who is in the world at all)
export const SIGHT_M = 14;                              // a hunting creature keeps the player in sight inside this ring (hysteresis over AGGRO_M); past it the unseen clock runs
export const ENGAGE_M = 4, ENGAGE_OUT_M = 6;           // the nearest foe this close fights him on the Pit's duel; it stays there out to ENGAGE_OUT_M. Chase before that, leash and give-up after, are the world layer
export const MAX_ATTACKERS = 3;                         // creatures on one player at once (Dom: three on one): the nearest fights him on his lock-on, the rest join on their own duel against him; a fourth holds off at the ring
export const HOLD_M = ENGAGE_M * 0.95;                  // every creature closes to just inside the engage ring and waits there: the one that is engaged fights, the rest of a pack hold off until a slot frees
/** Creature levels (Dom: copy the Pit): a creature of level L has the Pit's own level body (moves.ts `opponentAt`: health and poise by level) and, in a fight, the Pit's level brain (`profileAt`). No Zone 1 scaling of our own. */
export const MAX_LEVEL = LEVELS;
export const levelHealth = (kind: string, level: number): number => opponentAt(OPPONENT(kind)!, level).health;
/** PvP (Dom via Strategy): no toggle. The SERVER sets `Fighter.pvp` each step to "attackable here, now" (wild zone = true, safe-town volume = false); the rules below decide between two such players.
 *  Under PROTECT_LEVEL a player is shielded until his own first attack; nobody may fight a player more than MAX_LEVEL_GAP levels away. A player's blows always land on creatures, whatever the flags. */
export const PROTECT_LEVEL = 3, MAX_LEVEL_GAP = 10;
export const AGGRO_WINDOW_S = 60;                       // a player who hit you in the last minute is not "first" when you hit back

export type Phase = 'ready' | 'guard' | 'roll' | 'windup' | 'active' | 'recover' | 'stagger' | 'dead';
export type Threat = { threat: number; damage: number; out: number };   // damage the player dealt it; seconds he has been out of its sight (EQEmu oor_count, in seconds)
export type Fighter = {
  id: string; side: 'player' | 'creature'; kind: string;   // kind: 'player' or a ROSTER id ('wolf', 'boar', 'bear', ...)
  x: number; z: number; facing: number; radius: number;
  health: number; maxHealth: number; stamina: number; maxStamina: number; poise: number;
  phase: Phase; t: number;                              // the Pit fighter's phase, mapped, and seconds spent in it (World animates from these)
  posture: number;                                      // posture (0..RULES.posture.max), the Pit's
  exhausted: boolean;                                   // stamina hit zero: no new action, slower, until it is back past RULES.exhaustRecover
  homeX: number; homeZ: number;                         // creature only: where it spawned (it walks back here)
  hunting: boolean; chaseX: number; chaseZ: number;     // creature only: it is on a chase that STARTED at (chaseX, chaseZ); the leash is measured from there
  unseen: number;                                       // creature only: seconds the prey has been out of sight
  returning: boolean;                                   // creature only: it gave up and is walking home (it heals to full on arrival, no event)
  attack: number; res: number;                          // damage multipliers (src/gear-stats.ts Loadout): `attack` scales what it deals, `res` what it takes, chip included
  special: SpecialName | null; specialIn: number;       // the named special this fighter can cast (moves.ts specialOf), seconds until it is ready; with one, the SKILL button is the special (the Pit has one button)
  skill: SkillId | null;                                // the equipped skill (moves.ts SkillId, the Pit's `equippedSkill(profile.loot)`; null = none): the SKILL button fires its move when no special is set (duel.ts `Fighter.skill`)
  stance?: StanceId;                                    // src/stance.ts: the Pit's table (absent = Balanced)
  brain?: AiState;                                      // creature only: its Pit brain (wait, decision, habits, rng) kept ON THE CREATURE, so a rebuilt fight (a pack's next bout, a re-engage) resumes its swing timing instead of restarting at the opening wait of 90 ticks (#1936 b)
  threat?: Record<string, Threat>;                      // creature only: its threat list (EQEmu hate list shape): who has hurt it. Threat picks the player it fights, damage is the credit (loot to the most). Dropped when he is dead, gone or out of sight for the give-up time; cleared on heal-home
  pvp: boolean; level: number; shielded: boolean;       // attackable by players here and now (server-set); his level; the low-level shield (dropped on his first attack)
};
export type World = { time: number; fighters: Fighter[]; aggro: Record<string, Record<string, number>>; streams: Record<string, Bout> };   // streams: slot-0 player id -> his fight (a Pit duel); aggro[attacker][victim] = when the attacker last struck that player
export type Input = { x: number; z: number; special?: boolean; skill?: boolean; run?: boolean; attack?: 'light' | 'heavy' | 'thrust' | 'kick' | null; guard?: boolean; roll?: { x: number; z: number } | null };   // world-axis move, a held run, a cut / kick / roll / special pressed this step, a held guard
/** The Pit's own CombatEvent behind a Zone 1 event (location, direction, material, weapon, counter, rear, charged ...): gore, wounds, finishers, hit-impact and the clip driver read the Pit's event, not our summary of it. */
export type Event = EventBody & { pit?: CombatEvent };
type EventBody =
  | { type: 'Telegraph'; id: string; move: string; ms: number }   // a windup began: the tell World animates and sounds
  | { type: 'Swing'; id: string; move: string }                    // the blow's active part began
  | { type: 'Hit'; attacker: string; victim: string; damage: number; move: string }
  | { type: 'Blocked'; attacker: string; victim: string; perfect: boolean; damage: number }   // `damage` is the chip that passed through (0 for a cut or a perfect block)
  | { type: 'Dodged'; attacker: string; victim: string }          // the blow met a roll's invulnerable ticks
  | { type: 'Parried'; attacker: string; victim: string }         // a guard raised inside the parry window turned the blow aside: the attacker is thrown off (a Staggered follows)
  | { type: 'Staggered'; id: string; ms: number; cause: 'hit' | 'posture' | 'guardBreak' | 'kick' | 'parry' | 'interrupt' }
  | { type: 'Aggressed'; attacker: string; victim: string; first: boolean }   // a player's blow met another player (hit, block, parry or dodge): `first` = the victim had not struck him in the last AGGRO_WINDOW_S. The server's murder rule reads Aggressed(first) then Died(by)
  | { type: 'FightStarted'; creature: string; player: string }     // a creature took a player as its foe (the pair's fight opened): fired once per engage, never per step; World's hook for the combat music, the hint hide and the log
  | { type: 'Died'; id: string; by: string }
  | { type: 'Evaded'; id: string }
  | { type: 'Pit'; id: string };                                  // a Pit event with no Zone 1 summary (Draw, Roll, Guard, skill casts ...): only `pit` carries it, `id` is the actor                               // a creature gave up and is back home, healed: World may drop it from the world (no XP, no loot, no combat log: the game does not hear of it)

const OPPONENT = (kind: string) => (OPPONENTS as Record<string, (typeof OPPONENTS)[keyof typeof OPPONENTS]>)[kind];

function fighter(id: string, side: Fighter['side'], kind: string, x: number, z: number, facing: number, radius: number, health: number, poise: number): Fighter {
  return { id, side, kind, x, z, facing, radius, health, maxHealth: health, stamina: STAMINA_MAX, maxStamina: STAMINA_MAX, poise, phase: 'ready', t: 0, posture: 0, exhausted: false,
    homeX: x, homeZ: z, hunting: false, chaseX: x, chaseZ: z, unseen: 0, returning: false, attack: 1, res: 1, special: null, specialIn: 0, skill: null, pvp: false, level: 1, shielded: false };
}
/** The player, with his gear's Loadout (NAKED = the identity: no gear changes nothing). */
export const player = (id: string, x: number, z: number, facing = 0, gear: Loadout = NAKED, level = 1, skill: SkillId | null = null): Fighter => ({ ...fighter(id, 'player', 'player', x, z, facing, PLAYER_RADIUS, RULES.health, 0), attack: gear.attack, res: gear.res, level, shielded: level < PROTECT_LEVEL, skill });
/** A creature of `kind` (a moves.ts ROSTER id) at `level` (default: the easy anchor, the roster row): its health, poise and body scale are the Pit's own level rows (`opponentAt`). */
export function creature(id: string, kind: string, x: number, z: number, facing = 0, level: number = LEVEL_ANCHORS.easy): Fighter {
  const o = OPPONENT(kind);
  if (!o) throw new RangeError(`zone1: unknown creature kind ${kind}`);
  const lv = Math.min(MAX_LEVEL, Math.max(1, Math.round(level))), body = opponentAt(o, lv);
  return { ...fighter(id, 'creature', kind, x, z, facing, PLAYER_RADIUS * o.scale, body.health, body.poise), level: lv };
}
/** A fighter with a picked stance ('neutral' = Balanced = none). The same four picks and the same signed per-mille table as the Pit (src/stance.ts), one kit everywhere. */
export const withStance = (f: Fighter, pick: PickedStance): Fighter => ({ ...f, stance: asStance(pick) });
/** Give a fighter a named special (SpecialName from src/moves.ts; `specialOf(opponent, level)` names the class's). It is ready RULES.special.first ticks in. */
export const withSpecial = (f: Fighter, name: SpecialName): Fighter => ({ ...f, special: name, specialIn: secs(RULES.special.first) });
/** A creature's stance mood: the Pit's own draw (src/stance.ts moodOf: half its home stance, half one of the other three), seeded from the injected `rand` instead of the fight seed. Call once at spawn. */
export const withMood = (f: Fighter, rand: () => number): Fighter => withStance(f, moodOf(Math.floor(rand() * 4294967296) >>> 0, f.kind));
/** The brain as the next bout will find it. retreatUntil / disengageUntil are absolute ticks of the bout that wrote them and a rebuilt bout restarts its clock at 0, so they are rebased onto the new clock (Auditor, #1939); lastTravel compared against the old bout's distance, so it restarts. The live bout keeps its own copy. */
const carried = (ai: AiState, tick: number): AiState => ({ ...ai, retreatUntil: Math.max(0, ai.retreatUntil - tick), disengageUntil: Math.max(0, ai.disengageUntil - tick), lastTravel: 0 });
/** Every fight going on in the world as the Pit's own duel: player id, creature id, the duel (fighters[0] = the player, fighters[1] = the creature, phase / move / body as the Pit has them). A player's nearest foe is `primary`, the creatures that joined him follow. The page drives the Pit's actors, gore and finishers from these. */
export type Pair = { player: string; foe: string; primary: boolean; duel: Duel };
export const pairs = (world: World): Pair[] => Object.entries(world.streams).flatMap(([player, b]) => [...(b.foe ? [{ player, foe: b.foe, primary: true, duel: b.duel }] : []), ...(b.joined ?? []).flatMap((j) => (j.foe ? [{ player, foe: j.foe, primary: false, duel: j.duel }] : []))]);
/** A player's own fight as the Pit's duel (his primary Bout, with or without a foe): the page poses his rig from it with the Pit's actorPose. null before his first step. */
export const duelOf = (world: World, id: string): Duel | null => world.streams[id]?.duel ?? null;
/** The duel a creature is fighting right now (slot 1 is the creature), or null while it is not in anyone's fight: the page poses its actor from it. */
export const duelFor = (world: World, creature: string): Duel | null => pairs(world).find((p) => p.foe === creature)?.duel ?? null;
export const newWorld = (fighters: Fighter[]): World => ({ time: 0, fighters, aggro: {}, streams: {} });

const dist = (a: Fighter, b: Fighter): number => Math.hypot(b.x - a.x, b.z - a.z);
const aim = (from: Fighter, to: Fighter): number => Math.atan2(to.x - from.x, to.z - from.z);
const alive = (f: Fighter): boolean => f.phase !== 'dead';
/** May these two players fight? Both attackable here and now (the server's `pvp`), neither shielded, and not more than MAX_LEVEL_GAP levels apart. */
const attackable = (a: Fighter, b: Fighter): boolean => a.pvp && b.pvp && !a.shielded && !b.shielded && Math.abs(a.level - b.level) <= MAX_LEVEL_GAP;

/** Creatures do not stand inside one another: a creature pushed out of any other creature's body (half each, the way the hero's own spacing is kept). */
function separate(f: Fighter, all: Fighter[]): void {
  for (const o of all) {
    if (o === f || o.side !== 'creature' || !alive(o)) continue;
    const dx = f.x - o.x, dz = f.z - o.z, d = Math.hypot(dx, dz), min = f.radius + o.radius;
    if (d >= min) continue;
    const ux = d > 1e-6 ? dx / d : 1, uz = d > 1e-6 ? dz / d : 0, push = (min - d) / 2;
    f.x += ux * push; f.z += uz * push; o.x -= ux * push; o.z -= uz * push;
  }
}

/** The next world: who fights whom, then every fight stepped on the Pit's duel; creatures that are not in a fight chase, hold off at the ring, give up or walk home. Never mutates its input. The Pit's brain decides every creature blow, so there is no randomness here. */
export function stepCombat(world: World, inputs: Readonly<Record<string, Input>>, dt: number): { world: World; events: Event[] } {
  const events: Event[] = [];
  const fighters = world.fighters.map((f) => ({ ...f, ...(f.threat ? { threat: Object.fromEntries(Object.entries(f.threat).map(([k, v]) => [k, { ...v }])) } : {}) })), aggro: World['aggro'] = {}, streams: World['streams'] = {};
  for (const [a, m] of Object.entries(world.aggro)) aggro[a] = { ...m };
  const players = fighters.filter((f) => f.side === 'player' && alive(f)), creatures = fighters.filter((f) => f.side === 'creature');
  const inFight = new Set<string>();

  // A shielded player's own first attack ends his protection (Dom): he swings with another attackable player in reach.
  for (const p of players) if (p.shielded && inputs[p.id]?.attack && players.some((q) => q !== p && q.pvp && p.pvp && dist(p, q) <= ENGAGE_M)) p.shielded = false;

  // 1. Player against player: two attackable players this close fight each other (the Pit's duel with two humans); the pair is kept out to ENGAGE_OUT_M.
  const bouts: { a: Fighter; b: Fighter | null }[] = [], joined = new Map<string, Fighter[]>();
  const prevFoe = (p: Fighter) => world.streams[p.id]?.foe ?? null;
  const engagedWith = (p: Fighter, id: string): boolean => { const st = world.streams[p.id]; return !!st && (st.foe === id || !!st.joined?.some((j) => j.foe === id)); };   // he was fighting this creature last step, as his foe or as a joiner
  for (const a of players) for (const b of players) {
    if (a.id >= b.id || inFight.has(a.id) || inFight.has(b.id) || !attackable(a, b)) continue;
    const sticky = prevFoe(a) === b.id || prevFoe(b) === a.id;
    if (dist(a, b) <= (sticky ? ENGAGE_OUT_M : ENGAGE_M)) { bouts.push({ a, b }); inFight.add(a.id); inFight.add(b.id); }
  }
  // 2. Player against the nearest creature (the Pit's own pack model is a sequence of bouts, src/pack.ts startPack / nextBout: one fights the hero, the rest hold off at the ring until it falls); each creature fights one player.
  // The creature chooses: of the free players in its reach it takes the one with the most threat (nearest on a tie; a foe it already has stays out to ENGAGE_OUT_M); each player then takes the nearest creature that chose him.
  const claimed = new Set<string>(), free = players.filter((p) => !inFight.has(p.id));
  const reach = (c: Fighter, p: Fighter) => dist(c, p) <= (engagedWith(p, c.id) ? ENGAGE_OUT_M : ENGAGE_M);
  const chose = new Map<string, string>();   // creature id -> player id
  for (const c of creatures) {
    if (!alive(c) || c.returning) continue;
    const top = free.filter((p) => reach(c, p)).sort((x, y) => (c.threat?.[y.id]?.threat ?? 0) - (c.threat?.[x.id]?.threat ?? 0) || dist(c, x) - dist(c, y))[0];
    if (top) chose.set(c.id, top.id);
  }
  const take = (p: Fighter, only: (c: Fighter) => boolean): Fighter | null => {
    const near = creatures.filter((c) => alive(c) && !c.returning && !claimed.has(c.id) && only(c)).sort((x, y) => dist(x, p) - dist(y, p));
    return near.find((c) => c.id === prevFoe(p) && dist(c, p) <= ENGAGE_OUT_M) ?? near.find((c) => reach(c, p)) ?? null;
  };
  const foes = new Map<string, Fighter | null>();
  for (const p of free) { const foe = take(p, (c) => chose.get(c.id) === p.id); if (foe) claimed.add(foe.id); foes.set(p.id, foe); }
  for (const p of free) if (!foes.get(p.id)) { const foe = take(p, () => true); if (foe) claimed.add(foe.id); foes.set(p.id, foe); }   // a creature whose choice was taken falls back to the nearest free player (the pack model)
  const joiners = new Map<string, Fighter[]>();   // the rest of the creatures that chose a player: they join him (the player's own blows go to his foe; theirs land on him through their own duel)
  for (const c of creatures) {
    const pid = chose.get(c.id); if (!pid || claimed.has(c.id) || !alive(c) || c.returning) continue;
    const list = joiners.get(pid) ?? []; list.push(c); joiners.set(pid, list);
  }
  for (const p of players) {
    if (inFight.has(p.id)) continue;
    const foe = foes.get(p.id) ?? null;
    if (foe) for (const c of (joiners.get(p.id) ?? []).sort((x, y) => (y.threat?.[p.id]?.threat ?? 0) - (x.threat?.[p.id]?.threat ?? 0) || dist(x, p) - dist(y, p)).slice(0, MAX_ATTACKERS - 1)) { joined.set(p.id, [...(joined.get(p.id) ?? []), c]); inFight.add(c.id); if (!c.hunting) { c.hunting = true; c.chaseX = c.x; c.chaseZ = c.z; c.unseen = 0; } }
    if (foe) { inFight.add(foe.id); if (!foe.hunting) { foe.hunting = true; foe.chaseX = foe.x; foe.chaseZ = foe.z; foe.unseen = 0; } }   // inside the engage ring it is on the prey whether or not it saw him
    inFight.add(p.id); bouts.push({ a: p, b: foe });   // 3. no foe in reach: the player is alone in his bout (swings at air, guards, rolls, regains stamina on the Pit's rules)
  }

  for (const { a, b } of bouts) {
    const prev = world.streams[a.id], same = prev && prev.foe === (b?.id ?? null);
    const bout: Bout = same ? prev : openBout(a, b, prev && !same && prev.duel.fighters[0] ? prev.duel.fighters[0] : undefined);
    const r = stepBout(bout, a, b ?? undefined, inputs[a.id] ?? IDLE_INPUT, b && b.side === 'player' ? inputs[b.id] ?? IDLE_INPUT : IDLE_INPUT, dt);
    if (b && b.side === 'creature' && r.bout.ai) b.brain = carried(r.bout.ai, r.bout.duel.tick);   // the brain lives on the creature, not in the fight
    if (b && b.side === 'creature' && !engagedWith(a, b.id)) events.push({ type: 'FightStarted', creature: b.id, player: a.id });
    streams[a.id] = r.bout; events.push(...r.events);
    // The creatures that joined him: each its own duel against the same player. His health and posture carry through the world Fighter; his place, stamina, phase and exhaustion are the primary bout's (a roll or a cut is paid and moved once); a joiner's blows hurt him but do not interrupt his swing.
    const keep = { x: a.x, z: a.z, facing: a.facing, stamina: a.stamina, phase: a.phase, t: a.t, exhausted: a.exhausted }, inA = inputs[a.id] ?? IDLE_INPUT, passive: Input = { x: inA.x, z: inA.z, run: inA.run, guard: inA.guard, roll: inA.roll };
    const prevJoined = new Map((prev?.joined ?? []).map((j) => [j.foe, j]));
    r.bout.joined = [];
    for (const c of joined.get(a.id) ?? []) {
      const had = prevJoined.get(c.id) ?? (prev?.foe === c.id ? prev : undefined), jb = had ?? openBout(a, c);
      if (!engagedWith(a, c.id)) events.push({ type: 'FightStarted', creature: c.id, player: a.id });
      const jr = stepBout(jb, a, c, passive, IDLE_INPUT, dt); r.bout.joined.push(jr.bout); events.push(...jr.events);
      if (jr.bout.ai) c.brain = carried(jr.bout.ai, jr.bout.duel.tick);
      if (alive(a)) Object.assign(a, keep); else { Object.assign(a, { x: keep.x, z: keep.z, facing: keep.facing }); break; }   // killed by a joiner: he stays dead (Auditor, #1943); the other joiners stop
      if (alive(c) && Math.hypot(c.x - c.chaseX, c.z - c.chaseZ) > leashOf(c.kind)) { c.hunting = false; c.returning = true; c.phase = 'ready'; }
    }
    if (b && b.side === 'creature') for (const e of r.events) if (e.type === 'Hit' && e.attacker === a.id && e.victim === b.id) { const t = ((b.threat ??= {})[a.id] ??= { threat: 0, damage: 0, out: 0 }); t.threat += e.damage; t.damage += e.damage; }   // credit and threat from what actually landed
    if (b && b.side === 'player') for (const e of r.events) {   // player against player: log who struck first (a blow that hit, was blocked, parried or dodged)
      const hit = e.type === 'Hit' ? [e.attacker, e.victim] : e.type === 'Blocked' || e.type === 'Parried' || e.type === 'Dodged' ? [e.attacker, e.victim] : null;
      if (!hit) continue;
      const back = aggro[hit[1]!]?.[hit[0]!];
      events.push({ type: 'Aggressed', attacker: hit[0]!, victim: hit[1]!, first: back === undefined || world.time - back > AGGRO_WINDOW_S });
      (aggro[hit[0]!] ??= {})[hit[1]!] = world.time;
    }
    if (b && b.side === 'creature' && alive(b) && Math.hypot(b.x - b.chaseX, b.z - b.chaseZ) > leashOf(b.kind)) { b.hunting = false; b.returning = true; b.phase = 'ready'; }   // the leash is the world layer's, on the duel too
  }

  // The world layer for every creature not in a fight: chase to the hold ring (and wait there), give up, walk home.
  for (const f of creatures) {
    if (!alive(f) || inFight.has(f.id)) continue;
    f.t += dt; f.phase = 'ready';
    for (const [id, t] of Object.entries(f.threat ?? {})) {   // forget: the player is dead or gone, or has been out of its sight for the give-up time (EQEmu RemoveStaleEntries, in seconds)
      const q = players.find((x) => x.id === id);
      if (!q) delete f.threat![id]; else if (dist(f, q) > SIGHT_M) { t.out += dt; if (t.out >= GIVE_UP_UNSEEN_S) delete f.threat![id]; } else t.out = 0;
    }
    if (f.exhausted && f.stamina >= RULES.exhaustRecover) f.exhausted = false;
    f.stamina = Math.min(f.maxStamina, f.stamina + RULES.regen * 60 * dt);
    const prey = players.sort((a, b) => dist(f, a) - dist(f, b))[0];
    if (f.returning) {   // gave up: walks home at its amble, heals to full on arrival (no event)
      const dx = f.homeX - f.x, dz = f.homeZ - f.z, d = Math.hypot(dx, dz), step = SPEEDS.creature.amble * dt;
      if (d <= Math.max(step, 0.1)) { f.x = f.homeX; f.z = f.homeZ; f.returning = false; f.health = f.maxHealth; f.posture = 0; f.brain = undefined; f.threat = undefined; events.push({ type: 'Evaded', id: f.id }); }
      else { f.facing = Math.atan2(dx, dz); f.x += (dx / d) * step; f.z += (dz / d) * step; }
    } else if (prey && (f.hunting ? dist(f, prey) <= SIGHT_M || f.unseen < GIVE_UP_UNSEEN_S : dist(f, prey) <= AGGRO_M)) {
      if (!f.hunting) { f.hunting = true; f.chaseX = f.x; f.chaseZ = f.z; f.unseen = 0; }
      f.unseen = dist(f, prey) > SIGHT_M ? f.unseen + dt : 0;
      if (f.unseen >= GIVE_UP_UNSEEN_S || Math.hypot(f.x - f.chaseX, f.z - f.chaseZ) > leashOf(f.kind)) { f.hunting = false; f.returning = true; f.unseen = 0; }
      else {
        f.facing = aim(f, prey);
        if (dist(f, prey) > HOLD_M) { const step = Math.min(chaseSpeed(f.kind) * dt, dist(f, prey) - HOLD_M); f.x += Math.sin(f.facing) * step; f.z += Math.cos(f.facing) * step; }   // closes to just inside the engage ring and waits: the engaged foe fights, the rest hold off
        separate(f, fighters);
      }
    } else if (f.hunting) { f.hunting = false; f.returning = true; f.unseen = 0; }   // nobody left to hunt (the prey is dead or gone)
  }
  return { world: { time: world.time + dt, fighters, aggro, streams }, events };
}

// The Pit kit's extremes, read from the tables so a new weapon or skill moves the bound with it (no number is copied here): the biggest base blow of any weapon move, the fastest windup and the fastest cycle of any damaging move.
const KIT = (() => {
  const moves = Object.values(WEAPONS).filter(w => w.id !== 'bite').flatMap(w => Object.values(w.moves)).filter(m => m.damage > 0);
  const cycle = (m: (typeof moves)[number]) => { const t = m.chained ?? m; return t.windup + t.active + t.recovery; };
  return { damage: Math.max(...moves.map(m => m.damage)), windup: Math.min(...moves.map(m => (m.chained ?? m).windup)), cycle: Math.min(...moves.map(cycle)) };
})();
/**
 * The SERVER's plausibility bound for a kill report (there is no record to replay in Zone 1, so anti-cheat is a bound, not a proof): the fewest seconds a player could possibly take to kill `kind` at `level` with the WHOLE Pit kit.
 * The biggest blow is the kit's biggest base damage x the gear cap (CAPS.attack) x a held charge (RULES.charge) x the best situational multiplier (stop-hit, counter, rear on a downed target) x a landed Gambit; the fastest blow
 * and the fastest chained cycle come from the kit too. At a low level one such blow can kill, and then the bound is just the fastest windup: it only refuses a kill no kit could make. The special (20% of max health, a 2 s windup, a 20 s
 * cooldown) is never faster than blows, so it is not in the bound. The real protection is the server's spawn state, the single-use token and the per-account caps; this refuses only the impossible and never an honest fight.
 */
export function minKillSeconds(kind: string, level = 1): number {
  const o = OPPONENT(kind);
  if (!o) throw new RangeError(`zone1: unknown creature kind ${kind}`);
  const situational = Math.max(RULES.stopHit.damage, RULES.counter.damage, RULES.rear.downed, RULES.rear.damage);
  const best = Math.round(KIT.damage * CAPS.attack * RULES.charge.damage * situational * GAMBIT_ODDS.multiplier), hits = Math.ceil(opponentAt(o, level).health / best);
  return secs(KIT.windup) + Math.max(0, hits - 1) * secs(KIT.cycle);   // the first blow lands after its windup; every later one a full cycle apart
}
