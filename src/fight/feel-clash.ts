// WEAPON CLASH on a block or parry (M7 deliverable 4, Strategy/Dom 2026-10-27, data/feel-clash.json). PRESENTATION ONLY, opt-in `?feel=clash`.
// Public behaviour it answers (no code of theirs read): Hellish Quart's and Mordhau / Chivalry 2's blade-on-blade and block recoil, where a blocked or
// parried swing visibly throws the attacker's weapon arm back, the guard takes the weight, and a heavy swing into a guard drives the defender.
//
// WHAT IT DOES TO EACH FIGHTER (the PR states this too):
//  * THE OPPONENT (the Minotaur) has a package ragdoll (ragdoll.ts): the clash is PHYSICAL there. An impulse (rd.applyImpulse, or rd.stagger on a parry / broken guard)
//    on the arm that struck (when he is the attacker) or the guard arm that took the blow (when he defends), plus a motor dip through rd.setMotorStrength that eases in,
//    holds and recovers (the package already takes the lower of this and its own stagger, engine.mjs runState). No clip.
//  * THE HERO is a clip-driven rig with no ragdoll: the clash is a PRESENTATION-ONLY bone lean (leanBones) a few degrees on the weapon arm / guard arm / spine, applied after
//    the clip is posed and decaying on the same timing. Nothing is simulated; nothing the sim reads moves.
//  * PUSHBACK (a position change) is the SIM's: this module never moves a body. It emits `feel:clash` ({kind, pushbackM, ...}) with the row's metres for the sim lane to adopt.
// The pure core (clashOf, depthAt, motorRows, leanOf, simEvent, sparkPoint) has no three.js state and is what test/feel-clash.test.mjs pins; createClash is the page's runtime.
import * as THREE from 'three';
import ROWS from '../../data/feel-clash.json' with { type: 'json' };
import RULES from '../../data/rules.json' with { type: 'json' };
import { isHeavyMove } from './move-rows.ts';
import { bone } from './rig-bones.ts';
import { registerFeel } from './feel.ts';
import type { CombatEvent } from './duel.ts';

export type ClashRows = typeof ROWS;
export type ClashKind = 'blocked' | 'perfect' | 'parried' | 'broken';
export type Side = 0 | 1;
type Vec3 = [number, number, number];

/** One clash, worked out from a sim event: who struck, who took it, how hard, and every number the presentation needs. */
export type Clash = {
  tick: number; kind: ClashKind; move: string | undefined; weapon: string | undefined; heavy: boolean; charged: boolean;
  attacker: Side; defender: Side; strength: number;   // strength: swing multiplier (light 1, heavy 1.92, charged 1.5)
  attackerImpulse: number; defenderImpulse: number;   // N s along the blow's line (clamped to the row's impulse.max)
  dip: number; stagger: boolean; durationS: number; pushbackM: number; sparks: number;
};

/** The feel in force on this page: the row on and the URL carrying ?feel=clash (the row's query and value). */
export function clashOn(rows: ClashRows, search: string): boolean { return rows.on && new URLSearchParams(search).get(rows.query) === rows.value; }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const kindOf = (e: Pick<CombatEvent, 'type' | 'perfect'>): ClashKind | null => (e.type === 'Parried' ? 'parried' : e.type === 'Blocked' ? (e.perfect ? 'perfect' : 'blocked') : e.type === 'GuardBroken' ? 'broken' : null);

/** The clash a sim event makes, or null (not a blocked / parried / broken blow, or a missile). The event names the DEFENDER as `actor` and the attacker as `target`
 *  (duel.ts: the event of a blow that did not land names the side that stopped it). `heavy`: the move is a heavy (move-rows isHeavyMove, rules.json heavyMoves) or the blow was charged. */
export function clashOf(rows: ClashRows, e: Pick<CombatEvent, 'type' | 'tick' | 'actor' | 'target' | 'move' | 'weapon' | 'perfect' | 'charged' | 'missile'>, heavyMoves: readonly string[] = RULES.heavyMoves): Clash | null {
  const kind = kindOf(e);
  if (!kind || e.missile || e.target === undefined) return null;
  const k = rows.kinds[kind], charged = !!e.charged, heavy = charged || (!!e.move && (heavyMoves.includes(e.move) || isHeavyMove(e.move)));
  const strength = heavy ? (charged ? rows.swing.charged : rows.swing.heavy) : rows.swing.light, kgRow = rows.weaponKg as Record<string, number | undefined>;
  const kg = (e.weapon && kgRow[e.weapon]) || rows.refKg, incoming = rows.impulse.base * (kg / rows.refKg) * strength;
  const at = (v: number) => (v > 0 ? clamp(v, rows.impulse.min, rows.impulse.max) : 0);
  return {
    tick: e.tick, kind, move: e.move, weapon: e.weapon, heavy, charged, attacker: e.target as Side, defender: e.actor as Side, strength,
    attackerImpulse: at(incoming * k.recoil), defenderImpulse: at(incoming * k.absorbed), dip: k.dip, stagger: k.stagger,
    durationS: rows.timing.easeInS + rows.timing.holdS + rows.timing.upS,
    pushbackM: +(rows.pushback.metres[kind] * (rows.pushback.heavyOnly && !heavy ? 0 : strength)).toFixed(4),
    sparks: Math.round(heavy ? rows.spark.countHeavy : rows.spark.count),
  };
}

/** How deep the clash's dip is `t` seconds after the event (0..1: eased in, held, back up; the light clash is shorter by timing.lightScale); -1 once it is over. */
export function depthAt(rows: ClashRows, heavy: boolean, t: number): number {
  const s = heavy ? 1 : rows.timing.lightScale, a = rows.timing.easeInS * s, h = rows.timing.holdS * s, u = rows.timing.upS * s;
  if (t < 0 || t >= a + h + u) return -1;
  return t < a ? (a > 0 ? t / a : 1) : t < a + h ? 1 : 1 - (t - a - h) / u;
}

const roleOf = (part: string): 'arm' | 'forearm' | 'hand' | 'spine' | null => (/^forearm/.test(part) ? 'forearm' : /^arm/.test(part) ? 'arm' : /^hand/.test(part) ? 'hand' : /^spine/.test(part) ? 'spine' : null);

/** The motor strengths (package setMotorStrength rows, part id -> 0..1) this clash asks of `role` ('attacker' or 'defender') at depth `depth`, and the same parts at 1 once it is over. */
export function motorRows(rows: ClashRows, clash: Pick<Clash, 'dip' | 'strength'>, role: 'attacker' | 'defender', depth: number): Record<string, number> {
  const parts = rows.parts[role] as Record<string, readonly string[]>, weights = rows.dipParts as Record<string, number>, out: Record<string, number> = {};
  const scale = clamp(clash.strength / rows.hero.maxStrength, 0.25, 1);   // a light clash dips less deep than a heavy one
  for (const list of Object.values(parts)) for (const part of list) {
    const r = roleOf(part), w = r ? weights[r] ?? 0 : 0;
    out[part] = depth < 0 ? 1 : clamp(1 - (1 - clash.dip) * depth * w * scale, 0.01, 1);
  }
  return out;
}

/** The impulse on the part in the struck fighter's own frame (z forward, toward the other man). The attacker's weapon arm is knocked BACK (-z); the defender's guard arm is driven back by the blow (-z) as well:
 *  both fighters face each other, so the blow's line is the z axis of either (ragdoll.ts blowImpulse uses the same frame). */
export function impulseVector(magnitude: number, lift: number): Vec3 { return [0, lift * (magnitude > 0 ? 1 : 0), -magnitude]; }

/** The hero's bone lean at depth `depth` for a clash he is part of: Euler radians per bone slot (weaponArm, guardArm, spine), all zero when he is not in it. Presentation only. */
export function leanOf(rows: ClashRows, clash: Pick<Clash, 'attacker' | 'defender' | 'strength'>, hero: Side, depth: number): { weaponArm: Vec3; guardArm: Vec3; spine: Vec3 } {
  const zero: Vec3 = [0, 0, 0], k = depth < 0 ? 0 : depth * clamp(clash.strength / rows.hero.maxStrength, 0.25, 1), by = (v: readonly number[]): Vec3 => [v[0]! * k || 0, v[1]! * k || 0, v[2]! * k || 0];
  if (clash.attacker === hero) return { weaponArm: by(rows.hero.weaponArmRad), guardArm: zero, spine: by(rows.hero.spineRad) };
  if (clash.defender === hero) return { weaponArm: zero, guardArm: by(rows.hero.guardArmRad), spine: by(rows.hero.spineRad) };
  return { weaponArm: zero, guardArm: zero, spine: zero };
}

/** The event for the sim lane (names agreed with V3 Dev): kind 'block' | 'parry' and the pushback in metres. A broken guard is a block with the row's larger push. */
export function simEvent(rows: ClashRows, c: Clash) {
  return { type: rows.event.type, tick: c.tick, kind: c.kind === 'parried' ? 'parry' : 'block', pushbackM: c.pushbackM, pushed: c.defender, attacker: c.attacker, heavy: c.heavy, move: c.move, weapon: c.weapon };
}

/** The spark's point: `at` of the way from the attacker's weapon hand to the defender's, lifted. The sim gives no contact point, so the hands' line stands in for the blades'. */
export function sparkPoint(rows: ClashRows, from: Vec3, to: Vec3): Vec3 {
  const t = rows.spark.at;
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t + rows.spark.liftM, from[2] + (to[2] - from[2]) * t];
}

type Rd = { applyImpulse(part: string, v: Vec3): void; stagger(hit?: { part: string; impulse: Vec3 }): void; setMotorStrength(rows: number | Record<string, number>): void; state: string };
type Rigged = { anchor: THREE.Object3D };
type Active = { clash: Clash; t: number; foeTouched: string[]; heroEnded: boolean };
export type ClashContext = {
  rd?: Rd; foeHand?: THREE.Object3D; hero?: Rigged; parent?: THREE.Object3D; emit?: (name: string, payload?: unknown) => void;   // the foe's ragdoll (alive), his weapon hand, the hero's rig, where sparks are added, the sim-event emitter
  group?: THREE.Object3D;                                          // the foe's group (its yaw turns the impulse into world space for a spark's throw)
};

/** The page's runtime: reads the frame's events, applies the physical recoil to the foe's ragdoll, leans the hero's bones, flies the sparks, logs the sim event.
 *  frame() costs are on `cost` (the harness reads them from globalThis.__feelClash). */
export function createClash(rows: ClashRows = ROWS) {
  const active: Active[] = [], log = ((globalThis as Record<string, unknown>)[rows.event.log] ??= []) as ReturnType<typeof simEvent>[];
  const cost = { frames: 0, totalMs: 0, maxMs: 0, clashes: 0, last: null as Clash | null, impulses: [] as { part: string; v: Vec3; tick: number }[] };
  (globalThis as { __feelClash?: unknown }).__feelClash = cost;
  const sparks = makeSparks(rows), leaned = new Map<THREE.Object3D, { orig: THREE.Quaternion; set: THREE.Quaternion }>();
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), euler = new THREE.Euler(), quat = new THREE.Quaternion();
  const heroBones = (ctx: ClashContext) => (ctx.hero ? { weaponArm: bone(ctx.hero.anchor, rows.hero.bones.weaponArm), guardArm: bone(ctx.hero.anchor, rows.hero.bones.guardArm), spine: bone(ctx.hero.anchor, rows.hero.bones.spine) } : null);

  function begin(c: Clash, ctx: ClashContext) {
    active.push({ clash: c, t: 0, foeTouched: [], heroEnded: false }); cost.clashes++; cost.last = c;
    log.push(simEvent(rows, c));
    ctx.emit?.(rows.event.type, simEvent(rows, c));   // the sim lane's fact (V3 Dev: it recomputes pushback from its own events and rows; when they disagree the sim wins)
    if (rows.spark.on && ctx.hero && ctx.foeHand && ctx.parent) {
      const heroHand = bone(ctx.hero.anchor, rows.spark.handBones.hero), foeHand = ctx.foeHand;
      if (heroHand && foeHand) { const p = sparkPoint(rows, heroHand.getWorldPosition(tmpA).toArray() as Vec3, foeHand.getWorldPosition(tmpB).toArray() as Vec3); sparks.burst(ctx.parent, p, c.sparks); }
    }
    const rd = ctx.rd;
    if (rd && rd.state !== 'dying' && rd.state !== 'frozen' && rd.state !== 'knockdown') {   // the foe's side of the clash: physical
      const foeSide: Side = 1;
      if (c.attacker === foeSide && c.attackerImpulse > 0) physical(rd, rows.parts.attacker.weapon[0]!, c.attackerImpulse, c);
      else if (c.defender === foeSide && c.defenderImpulse > 0) physical(rd, rows.parts.defender.guard[0]!, c.defenderImpulse, c);
    }
  }
  function physical(rd: Rd, part: string, mag: number, c: Clash) {
    const v = impulseVector(mag, rows.impulse.lift);
    cost.impulses.push({ part, v, tick: c.tick });
    if (c.stagger) rd.stagger({ part, impulse: v }); else rd.applyImpulse(part, v);
  }

  return {
    log, cost, sparks,
    /** One frame (after the rigs are posed by their clips): `dt` presentation seconds, `events` the sim's this frame. */
    frame(dt: number, events: readonly CombatEvent[], ctx: ClashContext) {
      const t0 = performance.now();
      for (const [b, w] of leaned) if (b.quaternion.equals(w.set)) b.quaternion.copy(w.orig);   // a frame the clip did not repose the bone (a hit-stop) must not stack the lean
      leaned.clear();
      for (const e of events) { const c = clashOf(rows, e); if (c) begin(c, ctx); }
      const hb = ctx.hero ? heroBones(ctx) : null;
      for (let i = active.length - 1; i >= 0; i--) {
        const a = active[i]!, c = a.clash; a.t += dt;
        const depth = depthAt(rows, c.heavy, a.t);
        if (ctx.rd && (c.attacker === 1 || c.defender === 1) && ctx.rd.state !== 'dying' && ctx.rd.state !== 'frozen') {   // the foe's motors
          const m = motorRows(rows, c, c.attacker === 1 ? 'attacker' : 'defender', depth);
          ctx.rd.setMotorStrength(m); a.foeTouched = Object.keys(m);
        }
        if (hb && (c.attacker === 0 || c.defender === 0)) {   // the hero's bones lean (presentation only)
          const lean = leanOf(rows, c, 0, depth);
          for (const slot of ['weaponArm', 'guardArm', 'spine'] as const) { const b = hb[slot], r = lean[slot]; if (b && (r[0] || r[1] || r[2])) { const w = leaned.get(b) ?? { orig: b.quaternion.clone(), set: new THREE.Quaternion() }; b.quaternion.multiply(quat.setFromEuler(euler.set(r[0], r[1], r[2]))); w.set.copy(b.quaternion); leaned.set(b, w); } }
        }
        if (depth < 0) active.splice(i, 1);
      }
      sparks.update(dt);
      const ms = performance.now() - t0; cost.frames++; cost.totalMs += ms; cost.maxMs = Math.max(cost.maxMs, ms);
    },
  };
}

/** A pool of spark particles (one THREE.Points, `max` points): a burst throws `count` from a point, gravity pulls them, they end after lifeS. */
function makeSparks(rows: ClashRows) {
  const n = rows.spark.max, pos = new Float32Array(n * 3), vel = new Float32Array(n * 3), age = new Float32Array(n).fill(Infinity);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const material = new THREE.PointsMaterial({ color: rows.spark.color, size: rows.spark.sizePx, sizeAttenuation: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geometry, material); points.frustumCulled = false; points.visible = false; points.name = 'ClashSparks';
  let next = 0, live = 0;
  return {
    points,
    get live() { return live; },
    burst(parent: THREE.Object3D, at: Vec3, count: number) {
      if (!points.parent) parent.add(points);
      for (let i = 0; i < count; i++) {
        const k = next; next = (next + 1) % n;
        pos[k * 3] = at[0]; pos[k * 3 + 1] = at[1]; pos[k * 3 + 2] = at[2]; age[k] = 0;
        const a = (i / Math.max(1, count)) * Math.PI * 2 + k * 0.7, up = 0.4 + ((k * 37) % 10) / 10, s = rows.spark.speedMps * (0.5 + ((k * 53) % 10) / 10);
        vel[k * 3] = Math.cos(a) * s; vel[k * 3 + 1] = up * s; vel[k * 3 + 2] = Math.sin(a) * s;
      }
      points.visible = true;
    },
    update(dt: number) {
      if (!points.visible) return;
      live = 0;
      for (let k = 0; k < n; k++) {
        if (age[k]! >= rows.spark.lifeS) { pos[k * 3 + 1] = -1000; continue; }
        age[k] = age[k]! + dt; live++;
        vel[k * 3 + 1] = vel[k * 3 + 1]! - 9.8 * dt;
        pos[k * 3] = pos[k * 3]! + vel[k * 3]! * dt; pos[k * 3 + 1] = pos[k * 3 + 1]! + vel[k * 3 + 1]! * dt; pos[k * 3 + 2] = pos[k * 3 + 2]! + vel[k * 3 + 2]! * dt;
      }
      geometry.attributes.position!.needsUpdate = true;
      if (!live) points.visible = false;
    },
  };
}

export const FEEL_CLASH_ROWS = ROWS;

// The registry's plug (feel.ts, ragdoll.ts calls frame every frame the ragdoll steps, with the sim's events). A block or a parry is not a Hit on him, so only `frame` is used.
// The registry's ctx has the foe only: the hero's rig is found as the sibling of his group that holds the hero's spine bone (scene.ts adds both to the one scene), once.
let runtime: ReturnType<typeof createClash> | undefined, hero: THREE.Object3D | null | undefined;
registerFeel(ROWS.value, {
  frame(dt, events, ctx) {
    if (!ROWS.on) return;
    runtime ??= createClash(ROWS);
    const parent = ctx.group.parent ?? undefined;
    if (hero === undefined || (hero === null && parent)) hero = parent ? parent.children.find((c) => c !== ctx.group && !!bone(c, ROWS.hero.bones.spine)) ?? null : null;
    runtime.frame(dt, events, { rd: ctx.mode === 'alive' ? (ctx.rd as unknown as Rd) : undefined, foeHand: ctx.partBones[ROWS.spark.handBones.foe], hero: hero ? { anchor: hero } : undefined, parent, emit: ctx.emit });
  },
});
