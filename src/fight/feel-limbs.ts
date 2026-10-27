// M7 deliverable 2: LIMB DAMAGE THAT CHANGES THE FIGHT (data/feel-limbs.json; opt-in ?feel=limbs, registered with the feel registry, src/fight/feel.ts).
// A part at low or zero budget is what the player SEES him do:
//   leg   -> a limp: the bad leg's physics motors dip once a stride and the bones follow the ragdoll there (the gait), the good leg dips a little in antiphase; a heavy blow stumbles both legs;
//   sword arm -> the arm hangs (the guard drops) and, after `drop.afterS`, the weapon leaves his hand and falls, bounces and lies on the floor;
//   off arm, torso, head -> the arm hangs, the spine hunches, the head lolls.
// INPUT: the sim's per-part budget fractions (ctx.limbs(): 1 whole .. 0 gone; keys leg_left, leg_right, arm_left, arm_right, head, torso; V3 Dev's ruling, never a Jolt value). With none handed yet
// (the sim side is not wired) the evaluator's own part HP is the input on a local host, for the stills and tests only (?rules=m4: window.__v3Rules.fighter()).
// OUTPUT: ctx.emit('feel:limp', {part, level}), ('feel:guard_drop', {side}), ('feel:weapon_drop', {}) (names in the rows) as the presentation of the same facts; the numbers the sim should use
// are the rows' `sim` blocks. PRESENTATION ONLY here: speed, guard and swing changes are the sim's (Strategy's ruling 2026-10-27); this file never imports duel.ts.
// Pure core (levels, gait, stumble, the plan of motor strengths and bone shares, the drop's fall) first, then the part that touches three and the ragdoll.
import * as THREE from 'three';
import ROWS from '../../data/feel-limbs.json' with { type: 'json' };
import RULES from '../../data/rules.json' with { type: 'json' };
import type { FeelCtx, FeelHooks } from './feel.ts';   // types only: the feel chunk is its own bundle (feel-chunk.ts)
import { heldWeapon } from './rig-bones.ts';
import { isHeavyMove } from './move-rows.ts';
import type { CombatEvent } from './duel.ts';

export type LimbRows = typeof ROWS;
/** The part state the plan reads: each part's budget (hp of max) and the sword side. The sim's fractions become hp = fraction, max = 1. */
export type Fighter = { sword_side: string; parts: Record<string, { hp: number; max: number }> };
type PartRow = { startFrac: number; sided: boolean; motor: Record<string, number>; blend: Record<string, number>; gait?: { periodS: number; dipTo: number; dipFrac: number; goodDipTo: number; hipsDropM: number; hipsTiltRad: number; hipsBaseFrac: number };
  stumble?: { heavyOnly: boolean; level: number; dipTo: number; inS: number; holdS: number; upS: number; cooldownS: number; blend: number; hipsDropM: number; hipsTiltRad: number };
  drop?: { afterS: number; velocity: number[]; spin: number[]; gravity: number; restitution: number; bounces: number; restHeightM: number; lieS: number } };
export type RowKey = 'leg' | 'arm_sword' | 'arm_off' | 'torso' | 'head';

/** ?feel=limbs asked for (the registry runs the module only then) . The part budgets come from the sim; ?rules=m4 is needed only by the stills' fallback. */
export function feelLimbsOn(rows: Pick<LimbRows, 'on' | 'query' | 'value'>, search: string): boolean {
  return rows.on && (new URLSearchParams(search).get(rows.query) ?? '').split(',').includes(rows.value);
}

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const rowsOf = (rows: LimbRows) => rows.limbs.parts as unknown as Record<RowKey, PartRow>;

/** The part id (leg_left, arm_right, head, torso) -> the row that governs it and its side (the sword arm and the off arm are decided by the sword side). Null: no row. */
export function rowOf(id: string, swordSide: string): { key: RowKey; side: 'left' | 'right' | null } | null {
  if (id === 'head' || id === 'torso') return { key: id, side: null };
  const side = id.endsWith('_left') ? 'left' : id.endsWith('_right') ? 'right' : null;
  if (!side) return null;
  if (id.startsWith('leg_')) return { key: 'leg', side };
  if (id.startsWith('arm_')) return { key: side === swordSide ? 'arm_sword' : 'arm_off', side };
  return null;
}

/** The ragdoll part id a role of a row names on a side: thigh + left -> thighLeft; an unsided row (spine, neck) keeps the role. */
export const partOf = (row: Pick<PartRow, 'sided'>, role: string, side: 'left' | 'right' | null): string => (row.sided && side ? role + cap(side) : role);

/** How hurt a part is, 0 (its budget at or above `startFrac`) to 1 (none left). */
export function levelOf(startFrac: number, hp: number, max: number): number {
  if (!(max > 0) || !(startFrac > 0) || !Number.isFinite(hp)) return 0;
  const frac = hp / max;
  return frac >= startFrac ? 0 : Math.min(1, (startFrac - Math.max(0, frac)) / startFrac);
}

/** The sim's budget fractions (ctx.limbs()) as a fighter. Keys the sim does not hand are whole. */
export function fighterOf(fractions: Record<string, number>, swordSide: string): Fighter {
  const parts: Fighter['parts'] = {};
  for (const [id, v] of Object.entries(fractions)) if (Number.isFinite(v)) parts[id] = { hp: Math.min(1, Math.max(0, v)), max: 1 };
  return { sword_side: swordSide, parts };
}

/** The bad leg's dip at time `t`: 0 outside the dip, a smooth hump (0..1) over `dipFrac` of every `periodS`. `offset`: a fraction of a period (the good leg's antiphase is 0.5). */
export function gaitDepth(g: { periodS: number; dipFrac: number }, t: number, offset = 0): number {
  const p = (((t / g.periodS + offset) % 1) + 1) % 1;
  return p >= g.dipFrac ? 0 : Math.sin(Math.PI * p / g.dipFrac) ** 2;
}

/** How deep a stumble is `age` seconds after the blow (0..1): eased in, held, back up; 0 before and after. */
export function stumbleDepth(s: { inS: number; holdS: number; upS: number }, age: number): number {
  if (age < 0 || age >= s.inS + s.holdS + s.upS) return 0;
  return age < s.inS ? age / s.inS : age < s.inS + s.holdS ? 1 : 1 - (age - s.inS - s.holdS) / s.upS;
}

export type Hurt = { id: string; key: RowKey; side: 'left' | 'right' | null; level: number };
/** Every part of the fighter hurt enough to show (level above 0), with its row and side. */
export function hurtParts(rows: LimbRows, f: Fighter): Hurt[] {
  const out: Hurt[] = [];
  for (const [id, p] of Object.entries(f.parts)) {
    const r = rowOf(id, f.sword_side);
    if (!r) continue;
    const level = levelOf(rowsOf(rows)[r.key].startFrac, p.hp, p.max);
    if (level > 0) out.push({ id, ...r, level });
  }
  return out;
}

/** The pelvis: sunk `drop` metres and rolled `tilt` radians toward `side` (the bad leg's). */
export type Hips = { drop: number; tilt: number; side: 'left' | 'right' };
export type Plan = { strength: Record<string, number>; share: Record<string, number>; hurt: Hurt[]; hips: Hips | null };
/** The motor strength and the share of the ragdoll's pose per ragdoll part this moment. `t`: seconds on the page's clock (the gait's phase); `stumbleAge`: seconds since the last stumble (negative: none). Pure. */
export function planOf(rows: LimbRows, f: Fighter, t: number, stumbleAge: number): Plan {
  const strength: Record<string, number> = {}, share: Record<string, number> = {}, P = rowsOf(rows);
  const lower = (id: string, s: number, w: number) => { strength[id] = Math.min(strength[id] ?? 1, s); share[id] = Math.max(share[id] ?? 0, w); };
  const hurt = hurtParts(rows, f);
  let legLevel = 0;
  for (const h of hurt) {
    const row = P[h.key];
    for (const [role, target] of Object.entries(row.motor)) {
      let s = 1 - h.level * (1 - target);
      if (h.key === 'leg' && row.gait) s = s + (row.gait.dipTo - s) * gaitDepth(row.gait, t) * h.level;
      lower(partOf(row, role, h.side), s, (row.blend[role] ?? 0) * h.level);
    }
    if (h.key === 'leg') legLevel = Math.max(legLevel, h.level);
  }
  const leg = P.leg;
  if (legLevel > 0 && leg.gait) {   // the good leg takes the weight in antiphase: a smaller dip, only where the other leg is hurt
    const bad = new Set(hurt.filter((h) => h.key === 'leg').map((h) => h.side)), d = gaitDepth(leg.gait, t, 0.5) * legLevel;
    for (const side of ['left', 'right'] as const) if (!bad.has(side)) for (const role of Object.keys(leg.motor)) lower(partOf(leg, role, side), 1 - d * (1 - leg.gait.goodDipTo), 0);
  }
  const st = leg.stumble, depth = st ? stumbleDepth(st, stumbleAge) : 0;
  if (st && depth > 0) for (const side of ['left', 'right'] as const) for (const role of Object.keys(leg.motor)) lower(partOf(leg, role, side), 1 - depth * (1 - st.dipTo), st.blend * depth);
  // the pelvis: the limp you see. Sunk and rolled toward the worst leg: `hipsBaseFrac` of it all the time, the rest on each dip, and more under a stumble.
  const worst = hurt.filter((h) => h.key === 'leg').sort((a, b) => b.level - a.level)[0];
  let hips: Hips | null = null;
  if (worst && leg.gait) {
    const g = leg.gait, k = worst.level * (g.hipsBaseFrac + (1 - g.hipsBaseFrac) * gaitDepth(g, t));
    hips = { drop: k * g.hipsDropM + (st ? depth * st.hipsDropM : 0), tilt: k * g.hipsTiltRad + (st ? depth * st.hipsTiltRad : 0), side: worst.side! };
  }
  return { strength, share, hurt, hips };
}

/** Does this blow stumble him now? The leg is hurt to the row's level, the blow is heavy (when the row says heavyOnly), the last stumble is over its cooldown. */
export function stumbles(rows: LimbRows, f: Fighter, heavy: boolean, sinceLast: number): boolean {
  const st = rowsOf(rows).leg.stumble;
  return !!st && (heavy || !st.heavyOnly) && sinceLast >= st.cooldownS && hurtParts(rows, f).some((h) => h.key === 'leg' && h.level >= st.level);
}

/** The sim's heavy test on a Hit (rules-eval.ts hitInput: a charged blow, the overhead heavy and its directional heavies, the rules' heavyMoves). */
export const heavyHit = (e: Pick<CombatEvent, 'charged' | 'move'>): boolean => e.charged === true || isHeavyMove(e.move) || (e.move !== undefined && RULES.heavyMoves.includes(e.move));

/** The dropped weapon's fall, stepped by dt in the world (an analytic prop): gravity, bounces that lose speed, then lying. Mutates and returns the state it is given. */
export type Fall = { p: [number, number, number]; v: [number, number, number]; floor: number; bounces: number; landedFor: number; landed: boolean };
export function stepFall(d: Pick<NonNullable<PartRow['drop']>, 'gravity' | 'restitution' | 'bounces' | 'restHeightM'>, s: Fall, dt: number): Fall {
  if (s.landed) { s.landedFor += dt; return s; }
  s.v[1] -= d.gravity * dt;
  s.p[0] += s.v[0] * dt; s.p[1] += s.v[1] * dt; s.p[2] += s.v[2] * dt;
  const y = s.floor + d.restHeightM;
  if (s.p[1] <= y && s.v[1] < 0) {
    s.p[1] = y;
    if (s.bounces < d.bounces && -s.v[1] > 0.5) { s.v[1] = -s.v[1] * d.restitution; s.v[0] *= 0.6; s.v[2] *= 0.6; s.bounces++; }
    else { s.v = [0, 0, 0]; s.landed = true; }
  }
  return s;
}

// ---- the live part -----------------------------------------------------------------------------------------------------------------------------------
/** What the module needs of the page, read fresh each call (the registry builds a ctx per call; the ragdoll may be rebuilt between). */
export type Env = {
  fighter(): Fighter | null;
  active(): boolean;   // alive and the ragdoll tracking the clip (not down, not dead)
  rd(): { setMotorStrength(rows: number | Record<string, number>): void } | undefined;
  blend(share: Record<string, number>): void;   // `share[part]` of the way from the clip's pose (on the bones now) to the ragdoll's
  hips(h: Hips | null): void;   // the pelvis sunk and rolled (after the blend)
  weapon(): THREE.Object3D | undefined; group(): THREE.Object3D | undefined;
  emit(name: string, payload?: unknown): void;
};

export function createLimbs(rows: LimbRows, env: Env) {
  const P = rowsOf(rows), levels = new Map<string, number>(), stepOf = (l: number) => Math.floor(l / rows.levelStep + 1e-9);
  let t = 0, sinceStumble = 1e9, stumbleAge = -1, armZeroFor = -1, dropped = false, clone: THREE.Object3D | undefined, hidden: THREE.Object3D | undefined, fall: Fall | undefined;
  const spin = new THREE.Vector3(), flat = new THREE.Quaternion(), from = new THREE.Quaternion(), tmpQ = new THREE.Quaternion();
  const cost = { frames: 0, totalMs: 0, maxMs: 0, stumbles: 0, last: null as null | { strength: Record<string, number>; share: Record<string, number> } };
  const api = {
    cost,
    get dropped() { return dropped; },
    /** A heavy or light Hit landed on him. Starts a stumble when the rows say. */
    hit(e: CombatEvent) {
      const f = env.fighter();
      if (f && env.active() && stumbles(rows, f, heavyHit(e), sinceStumble)) { stumbleAge = 0; sinceStumble = 0; cost.stumbles++; }
    },
    /** The rematch: the body whole, the weapon back in his hand. */
    reset() {
      levels.clear(); stumbleAge = -1; sinceStumble = 1e9; armZeroFor = -1; dropped = false; fall = undefined;
      if (clone) { clone.removeFromParent(); clone = undefined; }
      if (hidden) { hidden.visible = true; hidden = undefined; }
      env.rd()?.setMotorStrength(1);
    },
    /** Every frame he is alive. dt: the frame's presentation seconds. */
    frame(dt: number) {
      const f = env.fighter(), rd = env.rd();
      if (!f || !rd) return;
      const start = performance.now(), sword = f.parts[`arm_${f.sword_side}`];
      if (dropped && sword && sword.hp / sword.max > 0) api.reset();   // renewed: he is whole again
      t += dt; sinceStumble += dt; if (stumbleAge >= 0) stumbleAge += dt;
      const plan = planOf(rows, f, t, stumbleAge);
      if (stumbleAge >= 0 && !(P.leg.stumble && stumbleDepth(P.leg.stumble, stumbleAge) > 0)) stumbleAge = -1;
      announce(plan.hurt);
      if (env.active()) { rd.setMotorStrength({ all: 1, ...plan.strength }); env.blend(plan.share); env.hips(plan.hips); }
      weapon(f, dt, plan.hurt);
      const ms = performance.now() - start;
      cost.frames++; cost.totalMs += ms; cost.maxMs = Math.max(cost.maxMs, ms); cost.last = { strength: plan.strength, share: plan.share };
    },
  };

  // The events: a leg's level moves up a `levelStep` bucket -> limp; an arm reaches level 1 -> guard_drop (once).
  function announce(hurt: Hurt[]) {
    for (const h of hurt) {
      const prev = levels.get(h.id) ?? 0;
      if (h.level <= prev) continue;
      levels.set(h.id, h.level);
      if (h.key === 'leg' && stepOf(h.level) > stepOf(prev)) env.emit(rows.events.limp, { part: h.id, level: Math.round(h.level * 1000) / 1000 });
      if ((h.key === 'arm_sword' || h.key === 'arm_off') && h.level >= 1 && prev < 1) env.emit(rows.events.guardDrop, { side: h.side });
    }
  }

  // The weapon: the sword arm at level 1 for `drop.afterS` seconds -> the weapon leaves his hand (a copy falls in the world; the original is hidden while he is without it).
  function weapon(f: Fighter, dt: number, hurt: Hurt[]) {
    const arm = hurt.find((h) => h.key === 'arm_sword'), d = P.arm_sword.drop!;
    if (clone && fall) {
      stepFall(d, fall, dt);
      clone.position.set(...fall.p);
      if (!fall.landed) { tmpQ.setFromAxisAngle(spin.clone().normalize(), spin.length() * dt); clone.quaternion.premultiply(tmpQ); from.copy(clone.quaternion); }
      else clone.quaternion.copy(from).slerp(flat, smooth(Math.min(1, fall.landedFor / d.lieS)));
      if (hidden) hidden.visible = false;   // the rig's own code may show it again: hold it hidden
      return;
    }
    if (!arm || arm.level < 1) { armZeroFor = -1; return; }
    armZeroFor = armZeroFor < 0 ? 0 : armZeroFor + dt;
    if (armZeroFor < d.afterS) return;
    const w = env.weapon(), g = env.group();
    if (!w || !g?.parent) return;
    w.updateWorldMatrix(true, true);
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scale = new THREE.Vector3();
    w.matrixWorld.decompose(pos, quat, scale);
    clone = w.clone(true); clone.traverse((o) => { o.frustumCulled = false; if (o.name === 'WeaponTrail') o.visible = false; });
    clone.position.copy(pos); clone.quaternion.copy(quat); clone.scale.copy(scale); clone.visible = true;
    g.parent.add(clone); hidden = w; w.visible = false;
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), new THREE.Euler().setFromQuaternion(g.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y);
    const v = new THREE.Vector3(...(d.velocity as [number, number, number])).applyQuaternion(yaw);
    spin.set(d.spin[0]!, d.spin[1]!, d.spin[2]!).applyQuaternion(yaw); from.copy(quat);
    fall = { p: [pos.x, pos.y, pos.z], v: [v.x, v.y, v.z], floor: g.getWorldPosition(new THREE.Vector3()).y, bounces: 0, landedFor: 0, landed: false };
    flat.copy(flatQuaternion(w, quat));
    dropped = true;
    env.emit(rows.events.weaponDrop, {});
    void f;
  }
  return api;
}

const smooth = (u: number) => u * u * (3 - 2 * u);

/** The orientation that lays the weapon flat: its longest world extent turned into the horizontal plane, the heading it had kept. */
export function flatQuaternion(node: THREE.Object3D, worldQuat: THREE.Quaternion): THREE.Quaternion {
  // its own longest axis: the box of a copy with the rotation taken off (its local extents), then turned by where the weapon points now
  const copy = node.clone(true); copy.position.set(0, 0, 0); copy.quaternion.identity(); copy.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(copy).getSize(new THREE.Vector3());
  const axis = size.x >= size.y && size.x >= size.z ? new THREE.Vector3(1, 0, 0) : size.y >= size.z ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const long = axis.applyQuaternion(worldQuat), flat = new THREE.Vector3(long.x, 0, long.z);
  if (flat.lengthSq() < 1e-6) flat.set(1, 0, 0);
  return new THREE.Quaternion().setFromUnitVectors(long, flat.normalize()).multiply(worldQuat.clone());
}

// ---- the registry ------------------------------------------------------------------------------------------------------------------------------------
// The evaluator's part HP as a fighter (the stills' and tests' fallback while the sim hands no fractions): window.__v3Rules.fighter() under ?rules=m4, local hosts only.
function harnessFractions(): Record<string, number> {
  const local = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const fighter = local ? (globalThis as { __v3Rules?: { fighter?: () => { parts: Record<string, { hp: number; max: number }> } } }).__v3Rules?.fighter?.() : undefined;
  return fighter ? Object.fromEntries(Object.entries(fighter.parts).map(([id, p]) => [id, p.max > 0 ? p.hp / p.max : 1])) : {};
}

const hv = new THREE.Vector3(), hv2 = new THREE.Vector3(), hq = new THREE.Quaternion(), hq2 = new THREE.Quaternion(), fwd = new THREE.Vector3();
/** The pelvis sunk h.drop metres (world down) and rolled h.tilt radians about the group's forward axis so the bad leg's side is the low one; the bones below follow it. */
function sinkHips(ctx: FeelCtx, h: Hips) {
  const b = ctx.partBones.hips, thigh = ctx.partBones[`thigh${cap(h.side)}`], g = ctx.group;
  if (!b?.parent || !thigh) return;
  g.updateWorldMatrix(true, true);
  b.getWorldPosition(hv);
  const sign = g.worldToLocal(thigh.getWorldPosition(hv2)).x - g.worldToLocal(hv.clone()).x >= 0 ? 1 : -1;   // which way the bad side lies across his body (+x or -x of his group)
  hv.y -= h.drop;
  b.position.copy(b.parent.worldToLocal(hv));
  fwd.set(0, 0, 1).applyQuaternion(g.getWorldQuaternion(hq));
  hq2.setFromAxisAngle(fwd, -sign * h.tilt);   // a turn about +z raises the +x side: the bad side goes down
  b.getWorldQuaternion(hq).premultiply(hq2);
  b.quaternion.copy(b.parent.getWorldQuaternion(hq2).invert().multiply(hq));
  g.updateWorldMatrix(true, true);
}

let live: ReturnType<typeof createLimbs> | undefined, ctxNow: FeelCtx | undefined, lastMode: string | undefined;
const swordSide = (RULES as { swordSide: string }).swordSide;
const env: Env = {
  fighter: () => { if (!ctxNow) return null; const sim = ctxNow.limbs(); const f = Object.keys(sim).length ? sim : harnessFractions(); return Object.keys(f).length ? fighterOf(f, swordSide) : null; },
  active: () => !!ctxNow && ctxNow.mode === 'alive' && (ctxNow.rd.state === 'alive' || ctxNow.rd.state === 'stagger'),
  rd: () => ctxNow?.rd as unknown as { setMotorStrength(rows: number | Record<string, number>): void } | undefined,
  blend: (share) => ctxNow?.blendToward(share),
  hips: (h) => { if (h && ctxNow) sinkHips(ctxNow, h); },
  weapon: () => (ctxNow ? heldWeapon(ctxNow.group) : undefined), group: () => ctxNow?.group,
  emit: (name, payload) => ctxNow?.emit(name, payload),
};
const limbs = () => { if (!live) { live = createLimbs(ROWS, env); (globalThis as { __feelLimbs?: unknown }).__feelLimbs = live.cost; } return live; };   // the stills read the per-frame cost from globalThis.__feelLimbs

export const feelHooks: FeelHooks = {
  hit(e, ctx) { ctxNow = ctx as typeof ctxNow; limbs().hit(e); },
  frame(dt, _events, ctx) {
    ctxNow = ctx as typeof ctxNow;
    if (lastMode === 'dead' && ctx.mode === 'alive') live?.reset();   // the rematch (ragdoll.ts build(): a fresh or reset ragdoll, alive again)
    lastMode = ctx.mode;
    if (ctx.mode === 'alive') limbs().frame(dt);
  },
  kill() { lastMode = 'dead'; },
};
