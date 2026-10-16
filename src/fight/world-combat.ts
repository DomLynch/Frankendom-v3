// The mount of Zone 1's own combat loop (Combat's pure src/fight/world.ts) in the walk: no duel, no ring, no fight start or end (Dom 2026-10-08). The page walks the hero (collisions,
// relief) and tells this his position; the loop owns hits, creature chase/telegraph/bite/leash. This file: which creatures are in the loop (those that come within the aggro ring, until they are
// home again), the fixed 1/60 accumulator, and turning the events into what the page shows (a procedural lunge / hit pulse / fall on the creature, bars, the hero's clips, kill and death).
import { AGGRO_M, duelFor, duelOf, newWorld, pairs, player, type Event, type Fighter, type World } from './world.ts';
import { worldRule } from './world-rules.ts';
import { OPPONENTS, DEFAULT_WEAPON, type Direction, type WeaponId } from './moves.ts';
import type { Sheet } from './sheet-rows.ts';
import { resolveSpell } from './spell-cast.ts';
import type { CombatEvent, Duel, Finish } from './duel.ts';
import { selectFinisher, finisherSeconds, type FinisherId } from './finishers.ts';
import { catalogueRow } from './catalogue-rows.ts';
import { PLAIN_DEATH } from './finisher-look.ts';

import { hash32 } from './bout-seed.ts';
import { ME, STEP, cm, createWorldRecorder, heroClean, joinFighter, quantStep, stepHero, type RecordHero, type WorldRecord, type JoinEvent } from './world-record.ts';
export { ME, STEP };
export const JOIN_M = AGGRO_M + worldRule('joinPad'), DROP_M = AGGRO_M + worldRule('dropPad'), FALL_S = worldRule('fall'), PULSE_S = worldRule('pulse'), MAX_STEPS = worldRule('maxSteps');   // 15 steps = 0.25 s of catch-up per frame (was 6: any frame over 100 ms silently dropped fight time). No higher: a creature acts inside the catch-up while the page was frozen, and the fastest creature cycle is longer than 15 ticks, so at most ONE swing can land in a frame (tested).
/** The roster kind a Zone 1 body fights as, or null (it cannot be fought yet: it only wanders). */
export const kindOf = (body: string): string | null => (Object.prototype.hasOwnProperty.call(OPPONENTS, body) ? body : null);

/** What the loop needs to know of a creature and of the client that draws them (the page's mob layer fits both structurally; the engine imports nothing from a client). */
export type FightMob = { id: string; body: string; level: number; name: string };
export type MobPose = { x: number; z: number; facing: number; moving: boolean; duel?: Duel; fall?: number; finisher?: FinisherId };   // finisher: how it dies (the engine's pick, one the host said it can play; plainDeath = the plain clip)
export type MobsPort<S extends FightMob> = { drive(id: string, pose: MobPose | null): void; within(x: number, z: number, r: number): { spec: S; x: number; z: number; dist: number }[] };
export type WorldCombatDeps<S extends FightMob = FightMob> = {
  mobs: () => MobsPort<S> | null;
  onKill(spec: S): void;      // the creature has fallen: loot, toast, respawn timer
  onHeroDied(): void;               // the 2 s dim and the walk back to town
  onHeroHit(amount: number): void;  // red flash + the Hit clip
  onSwing?(): void;                 // the hero's own cut began (the page poses the hero from heroDuel() with the Pit's actor now; kept for hosts that want the beat)
  loadoutReady?(): boolean;         // false while a signed-in character's build / worn-gear view is still on its way: no creature joins until it is true, so a fight never starts on the bare body because the sheet was late (absent = ready; a 0-dial build is the only way to fight bare)
  onTelegraph?(id: string, ms: number): void;
  onCreatureHit?(spec: S, hit: { seed: number; kill: boolean; hpFrac: number; fromX: number; fromZ: number }): void;   // a creature was hit (its wounds row draws the blood; seed = the fight's tick and its id, so a replay bleeds the same)
  onCreatureTick?(spec: S, t: { hpFrac: number; dt: number; x: number; z: number; seed: number }): void;   // every frame a creature is up and fighting (the row's tiers: drips and marks)
  onCreatureGone?(id: string): void;   // it was released or has fallen
  engageToken?: (id: string) => string | null;   // the creature's engage token (spawn-net.ts), null until the server answered: the bout's roll seed is hash32(token, join step); no token = no roll, today's fight
  onEvent?(ev: Event): void;       // every combat event, after the page has shown it (the spawn client, spawn-net.ts onCombatEvent)
  canPlay?: (finisher: FinisherId) => boolean;   // which finishers this client can show on a creature (default: plainDeath only); the pick is selectFinisher cut down to the creature's row (src/creature-gore.ts) and to these
  hero?: () => { level: number; health?: number; weapon?: WeaponId; sheet?: Sheet; spell?: { id: string; skill: number }; spell2?: { id: string; skill: number } };   // his resolved gear and career level (default: naked, level 1); health: a test seed for his starting and maximum health; a creature's level is its spec's
};
/** One pair's frame of contacts for the client's effects: the Pit events the loop made this frame (ev.pit), the pair's duel, and where the two stand (world metres). Drained by takeContacts(). */
export type PairContacts = { foe: string; kind: string; finisher?: FinisherId; events: CombatEvent[]; duel: Duel; hero: { x: number; z: number; facing: number }; foeAt: { x: number; z: number; facing: number; health: number } };
type Fx = { finisher: FinisherId; fallS: number; hurtT: number; fallT: number; windupT: number; windupMs: number; swingT: number };

/** How a creature dies: the engine's selectFinisher for the kill, kept to the creature's own row (CREATURE_GORE.finishers) and to what the client can play; plainDeath when none fits. */
export function finishOf(kind: string, finish: Finish, weapons: readonly [WeaponId, WeaponId], canPlay: (f: FinisherId) => boolean = (f) => f === PLAIN_DEATH): FinisherId {
  const row: readonly FinisherId[] = (catalogueRow(kind)?.finisher.cut ? catalogueRow(kind)!.finisher.finishers : [PLAIN_DEATH]), pick = selectFinisher(finish, weapons);
  return pick && row.includes(pick) && canPlay(pick) ? pick : PLAIN_DEATH;
}

export function createWorldCombat<S extends FightMob>(d: WorldCombatDeps<S>) {
  const mine = (): { level: number; health?: number; weapon?: WeaponId; sheet?: Sheet; spell?: { id: string; skill: number }; spell2?: { id: string; skill: number } } => d.hero?.() ?? { level: 1 };
  const body = (x: number, z: number, facing: number): Fighter => { const { level, health, weapon, sheet, spell: asked, spell2: asked2 } = mine(), spell = asked ? resolveSpell(asked.id, asked.skill, sheet?.spellPower ?? 0) : undefined, spell2 = asked2 ? resolveSpell(asked2.id, asked2.skill, sheet?.spellPower ?? 0) : undefined, p = player(ME, x, z, facing, level, null, { ...(weapon ? { weapon } : {}), ...(sheet ? { sheet } : {}), ...(spell ? { spell } : {}), ...(spell2 ? { spell2 } : {}) }); return health ? { ...p, health, maxHealth: health } : p; };
  let world: World = newWorld([body(0, 0, 0)]), acc = 0, pendingAttack: 'light' | 'heavy' | 'thrust' | 'kick' | null = null, pendingRoll: { x: number; z: number } | null = null, pendingCast = false, pendingCast2 = false, guardHeld = false, guardSide: Direction | null = null, heroDead = false, lostMs = 0, hitches = 0, steps = 0;
  let wasReady = false, rebuild = false;   // rebuild: hero() may have moved (the loadout gate just opened, or the page said the build / worn-gear view answered): rebody once at the next idle frame
  let builtKey = JSON.stringify(mine());   // what the hero fighter was built from (gear, level, weapon, sheet): the server's view and the build fetch answer AFTER load, so it is rebuilt at the next clean window open when this has moved
  const specs = new Map<string, S>(), fx = new Map<string, Fx>(), contacts = new Map<string, CombatEvent[]>(), lastDuel = new Map<string, Duel>();   // lastDuel: the pair's bout from before the step, for the kill's own contact (the bout is gone once the creature is dead)
  const fxOf = (id: string): Fx => { let f = fx.get(id); if (!f) { f = { finisher: PLAIN_DEATH, fallS: FALL_S, hurtT: 0, fallT: 0, windupT: 0, windupMs: 400, swingT: 0 }; fx.set(id, f); } return f; };
  const seedOf = (id: string): number => { let h = steps; for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 2654435761); return h >>> 0; };   // the fight's tick and a creature's id: a roll of presentation, the same on a replay
  const gearOf = () => { const p = player(ME, 0, 0, 0, mine().level); return { level: p.level, shielded: p.shielded }; };
  const me = (): Fighter => world.fighters[0]!;
  const recorder = createWorldRecorder();
  const heroBody = (): RecordHero => { const m = me(), g = gearOf(); return { level: g.level, weapon: mine().weapon ?? DEFAULT_WEAPON, ...(mine().sheet ? { sheet: mine().sheet } : {}), ...(m.spell ? { spell: mine().spell } : {}), ...(m.spell2 ? { spell2: mine().spell2 } : {}), health: m.health, stamina: m.stamina, posture: m.posture, exhausted: m.exhausted }; };
  function release(id: string) { recorder.release(id); d.onCreatureGone?.(id); d.mobs()?.drive(id, null); specs.delete(id); fx.delete(id); contacts.delete(id); lastDuel.delete(id); world = { ...world, fighters: world.fighters.filter((f) => f.id !== id) }; }
  /** The live hero is built from hero() ONCE, at load; the gear and the sheet arrive later. At a clean window open (no creature, no open bout) rebuild him from hero() as it stands now at his current place, so the live fighter and the record's heroBody() are the same hero (live == record, Auditor #2569). Health keeps its fraction; stamina, posture and exhaustion carry. Never mid-bout. */
  function rebody() {
    const key = JSON.stringify(mine()); if (key === builtKey) return;
    const old = me(), next = body(old.x, old.z, old.facing);
    next.health = Math.max(1, Math.round(next.maxHealth * old.health / old.maxHealth)); next.stamina = Math.min(next.maxStamina, old.stamina); next.posture = old.posture; next.exhausted = old.exhausted;
    world = newWorld([next]); builtKey = key;
  }
  function join(p: { spec: S; x: number; z: number; dist: number }) {
    const kind = kindOf(p.spec.body); if (!kind || specs.has(p.spec.id) || heroDead) return;
    if (specs.size === 0) { if (heroClean(world)) { rebody(); recorder.open(heroBody()); } else recorder.discard(); }   // a creature joins an empty loop: a record window opens at his body now
    const token = d.engageToken?.(p.spec.id), seed = token ? hash32(token, recorder.steps()) : undefined;   // the record's own step index: the replay and the server know it (a world clock tick is not in the record)
    const j: JoinEvent = { s: 0, id: p.spec.id, kind, x: cm(p.x), z: cm(p.z), level: p.spec.level, ...(seed === undefined ? {} : { seed }) };   // the pose is quantized before the sim sees it, so a replay joins the same creature
    recorder.join(j.id, j.kind, p.x, p.z, j.level, seed); specs.set(p.spec.id, p.spec); world = { ...world, fighters: [...world.fighters, joinFighter(j)] };
  }
  /** The creature a Pit event belongs to: the one named in the event, else (the hero's own roll, guard, draw) his primary foe. */
  function foeOfEvent(ev: Event): string | null {
    const named = ev.type === 'Hit' || ev.type === 'Blocked' || ev.type === 'Parried' || ev.type === 'Dodged' || ev.type === 'Aggressed' ? [ev.attacker, ev.victim] : ev.type === 'FightStarted' ? [ev.creature] : 'id' in ev ? [ev.id] : [];
    return named.find((id) => id !== ME && world.fighters.some((f) => f.id === id)) ?? pairs(world).find((p) => p.player === ME && p.primary)?.foe ?? null;
  }
  function handle(ev: Event) {
    if (ev.pit) { const foe = foeOfEvent(ev); if (foe) { const list = contacts.get(foe); if (list) list.push(ev.pit); else contacts.set(foe, [ev.pit]); } }
    if (ev.type === 'Telegraph') { if (ev.id === ME) d.onSwing?.(); else { const f = fxOf(ev.id); f.windupT = 0.0001; f.windupMs = ev.ms; d.onTelegraph?.(ev.id, ev.ms); } }
    else if (ev.type === 'Swing' && ev.id !== ME) fxOf(ev.id).swingT = 0.0001;
    else if (ev.type === 'Hit') { if (ev.victim === ME) d.onHeroHit(ev.damage); else {
      fxOf(ev.victim).hurtT = PULSE_S;
      const v = world.fighters.find((f) => f.id === ev.victim), a = world.fighters.find((f) => f.id === ev.attacker), spec = specs.get(ev.victim);
      if (v && a && spec) d.onCreatureHit?.(spec, { seed: seedOf(ev.victim), kill: v.phase === 'dead', hpFrac: Math.max(0, v.health) / v.maxHealth, fromX: a.x, fromZ: a.z });
    } }
    else if (ev.type === 'Evaded') release(ev.id);   // it gave up, walked home and healed: back to its own wander
    else if (ev.type === 'Died') { if (ev.id === ME) { heroDead = true; d.onHeroDied(); } else { const f = fxOf(ev.id), k = ev.pit, bout = lastDuel.get(ev.id), kind = world.fighters.find((q) => q.id === ev.id)?.kind;
      f.fallT = 0.0001;
      if (k?.type === 'Killed' && kind && bout) { f.finisher = finishOf(kind, { victim: k.target ?? 1, location: k.location ?? 'torso', move: k.move ?? 'light_right', heading: k.heading ?? 0 }, [bout.fighters[0].weapon, bout.fighters[1].weapon], d.canPlay); if (f.finisher !== PLAIN_DEATH) f.fallS = finisherSeconds(f.finisher).seconds; } } }
  }
  return {
    /** An attack press (STAB / SLASH / a tap on a creature): the cut starts on the next step if he is free. */
    press(kind: 'light' | 'heavy' | 'thrust' | 'kick' = 'light') { pendingAttack = kind; },
    /** A roll / dodge pressed: the world-axis direction (zero = where he faces). */
    roll(dir: { x: number; z: number }) { pendingRoll = dir; },
    /** The page's build_get or worn-gear view just answered (hero() may now give another sheet): the idle hero is rebuilt once at the next idle frame, not by polling hero() every frame. */
    heroChanged() { rebuild = true; },
    /** The SKILL / cast press: the hero's equipped spell starts its cast on the next step if he is free and has the stamina (the Pit's special slot); with no spell it does nothing. */
    cast() { pendingCast = true; },
    /** The second slot's press (spell-slot-defs.json slot b): its own spell and cooldown; with no second spell it does nothing. */
    cast2() { pendingCast2 = true; },
    guard(held: boolean, side: Direction | null = null) { guardHeld = held; guardSide = side; },
    update(dt: number, hero: { x: number; z: number; facing: number }): { dx: number; dz: number } {
      const mobs = d.mobs(); if (!mobs) return { dx: 0, dz: 0 };
      const ready = d.loadoutReady?.() ?? true;
      if (ready && !wasReady) rebuild = true;   // the gate's ready EDGE
      wasReady = ready;
      if (rebuild && !heroDead && ready && specs.size === 0 && me().phase === 'ready') { rebuild = false; rebody(); }   // idle with the loadout gate open: his bar is the sheet's now (159 at ready idle, not 150 until the first engage). Once per edge or heroChanged(), never per frame (hero() builds the sheet)
      if (!heroDead && ready) for (const p of mobs.within(hero.x, hero.z, JOIN_M)) join(p);
      const want = acc + dt, cap = STEP * MAX_STEPS; acc = Math.min(want, cap);
      if (want > cap) { lostMs += (want - cap) * 1000; hitches++; if (hitches === 1 || hitches % 10 === 0) console.warn(`world-combat: a ${Math.round(dt * 1000)} ms frame dropped ${Math.round((want - cap) * 1000)} ms of fight time (${hitches} such frame(s), ${Math.round(lostMs)} ms lost in all)`); }
      let first = true, stepped = false;   // the page owns the hero's walk; a ROLL is the loop's own displacement, so only the first step of a frame takes the page's position and the rest keep the loop's
      while (acc >= STEP) {
        acc -= STEP; steps++; stepped = true;
        for (const p of pairs(world)) lastDuel.set(p.foe, p.duel);
        const step = quantStep(first ? hero : null, guardHeld && !heroDead, heroDead ? null : pendingAttack, heroDead ? null : pendingRoll, guardSide, !heroDead && pendingCast, !heroDead && pendingCast2); first = false;
        recorder.step(step);
        const r = stepHero(world, step, gearOf()); pendingAttack = null; pendingRoll = null; pendingCast = false; pendingCast2 = false;
        world = r.world; for (const ev of r.events) { handle(ev); d.onEvent?.(ev); }
      }
      pendingAttack = null; pendingRoll = null; pendingCast = false; pendingCast2 = false;
      for (const f of world.fighters.slice(1)) {
        const s = specs.get(f.id); if (!s) continue; const x = fxOf(f.id);
        if (f.phase === 'dead') {
          x.fallT += dt; mobs.drive(f.id, { x: f.x, z: f.z, facing: f.facing, moving: false, fall: Math.min(1, x.fallT / x.fallS), finisher: x.finisher });   // the death clip's progress
          if (x.fallT >= x.fallS) { const done = s; release(f.id); d.onKill(done); }
          continue;
        }
        x.hurtT = Math.max(0, x.hurtT - dt);
        d.onCreatureTick?.(s, { hpFrac: Math.max(0, f.health) / f.maxHealth, dt, x: f.x, z: f.z, seed: seedOf(f.id) });
        mobs.drive(f.id, { x: f.x, z: f.z, facing: f.facing, moving: f.returning || (f.hunting && f.phase === 'ready' && Math.hypot(f.x - hero.x, f.z - hero.z) > 1.6), duel: duelFor(world, f.id) ?? undefined });   // the page poses its actor from the duel (the engine's actorPose)
        if (!f.hunting && !f.returning && Math.hypot(f.x - hero.x, f.z - hero.z) > DROP_M) release(f.id);
      }
      if (!stepped) return { dx: 0, dz: 0 };   // no step ran (dt 0 on the clock's first frame): the loop's body has not met the page's position yet, so it is not a displacement
      return { dx: me().x - hero.x, dz: me().z - hero.z };   // a roll's displacement (zero on foot); the page applies it with its own collision
    },
    /** Every pair's Pit events since the last call, with its duel and where the two stand: the client feeds them to its contact effects (src/fight/zone-fx.ts) once a frame. */
    takeContacts(): PairContacts[] {
      const out: PairContacts[] = [], h = me();
      for (const [foe, events] of contacts) {
        const f = world.fighters.find((q) => q.id === foe), duel = duelFor(world, foe) ?? lastDuel.get(foe); if (!f || !duel) continue;
        out.push({ foe, kind: f.kind, ...(events.some((e) => e.type === 'Killed') ? { finisher: fx.get(foe)?.finisher } : {}), events, duel, hero: { x: h.x, z: h.z, facing: h.facing }, foeAt: { x: f.x, z: f.z, facing: f.facing, health: f.health } });
      }
      contacts.clear(); return out;
    },
    /** After he died and stood up in town: a fresh body, nothing hunting him. */
    reset(hero: { x: number; z: number; facing: number }): void { for (const id of [...specs.keys()]) release(id); recorder.discard(); world = newWorld([body(hero.x, hero.z, hero.facing)]); builtKey = JSON.stringify(mine()); heroDead = false; acc = 0; },
    /** The record of the fight so far (open since a creature joined an empty loop), packed for kill_report, or null (none, or it outgrew its bounds). Call it from onKill: the window stays until the next one opens. */
    record: (): WorldRecord | null => recorder.take(),
    /** The hero's own duel, for the engine's actorPose (null before his first step). */
    heroDuel() { return duelOf(world, ME); },
    hero: () => { const m = me(); return { health: m.health, max: m.maxHealth, stamina: m.stamina, maxStamina: m.maxStamina, phase: m.phase, facing: m.facing, posture: m.posture, exhausted: m.exhausted, dead: heroDead }; },
    /** The creature he is fighting now (the nearest hunting one), for the target bar. */
    target: () => { const pr = pairs(world).find((x) => x.player === ME && x.primary), live = (f: Fighter) => f.phase !== 'dead' && f.hunting; let best: Fighter | null = world.fighters.slice(1).find((f) => f.id === pr?.foe && live(f)) ?? null; if (!best) for (const f of world.fighters.slice(1)) if (live(f) && (!best || Math.hypot(f.x - me().x, f.z - me().z) < Math.hypot(best.x - me().x, best.z - me().z))) best = f; const s = best && specs.get(best.id); return best && s ? { id: best.id, name: s.name, level: s.level, health: best.health, max: best.maxHealth } : null; },   // the card names the primary pair's foe (the Pit's own nearest, S2 pairs()); it moves to the next joiner as each falls
    /** Frame health for the seamless receipt: sim steps run, fight time dropped by the 0.25 s catch-up cap, and how many frames dropped some. */
    stats: () => ({ steps, lostMs: Math.round(lostMs), hitches }),
    inCombat: () => world.fighters.slice(1).some((f) => f.phase !== 'dead' && f.hunting),
    /** The hero as he fights, for a trace dump: the effective sheet (its dials, armour and attack among them), his bar sizes and whether the loadout gate is open. */
    trace: () => { const m = me(); return { ready: d.loadoutReady?.() ?? true, sheet: m.sheet ?? null, maxHealth: m.maxHealth, maxStamina: m.maxStamina, level: m.level }; },
    debug: () => world.fighters.map((f) => ({ id: f.id, phase: f.phase, hp: Math.round(f.health), x: +f.x.toFixed(1), z: +f.z.toFixed(1), hunting: f.hunting, returning: f.returning, duel: pairs(world).some((p) => p.player === ME && p.foe === f.id) })),   // duel: in a duel with the player right now (the live pack check counts these against MAX_ATTACKERS)
  };
}
