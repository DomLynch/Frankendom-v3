// ?feel=hitreact (M7 deliverable 1): HIT REACTIONS BY ZONE AND DIRECTION. The opponent's body answers a landed blow by where it landed and which way it
// came from: a head blow snaps head and neck, a stomach blow folds him over it, a side blow bends and twists him, a leg blow buckles that leg; then the
// bones blend back into his clip. Every number is a row of data/feel-hitreact.json (the keys are checked by src/sim/validate.js).
// PRESENTATION ONLY: the sim (duel.ts) and Gate 0 never see it; it reads one sim Hit (location, heading) and writes motor strengths, impulses and a bone blend.
// OPT-IN: without ?feel=hitreact nothing here is created and today's single stagger dip is the whole reaction.
// The core below is pure (no three, no DOM, no physics import) so Node tests pin it; `createHitReact` is the small stateful part the ragdoll hook calls.
import ROWS from '../../data/feel-hitreact.json' with { type: 'json' };
import type { FeelCtx, FeelHooks } from './feel.ts';   // TYPES only: the feel chunk is its own bundle (feel-chunk.ts), a runtime import of feel.ts would be a second copy
import type { CombatEvent } from './duel.ts';
import { isHeavyMove } from './move-rows.ts';

type Vec3 = [number, number, number];
type Sector = 'front' | 'back' | 'left' | 'right';
type Rows = typeof ROWS;
type ZoneRow = Rows['zones']['head'];
type BlowClass = 'light' | 'heavy' | 'counter';
type ClassRow = Rows['classes']['light'];
type Plan = {
  zone: string; sector: Sector; side: 'Left' | 'Right';
  dips: Record<string, number>;               // part id -> the strength its motor falls to at the deepest (1 = untouched)
  blend: Record<string, number>;              // part id -> share of the ragdoll's pose on that bone at the deepest
  impulses: { part: string; v: Vec3 }[];      // along the ragdoll's frame, N s
  easeInS: number; holdS: number; backS: number;
};

/** Which way the blow came, in HIS frame. `heading` = the attacker's facing (the sim's: x = sin, z = cos), `frameYaw` = his group's yaw. A blow travelling
 *  into his chest has a negative component along his facing (+z): front. Facing +z his left is +x, so a blow travelling toward +x lands on his RIGHT. */
export function sectorOf(heading: number, frameYaw: number, frontCos: number): { sector: Sector; dir: [number, number] } {
  const yaw = heading - frameYaw, dx = Math.sin(yaw), dz = Math.cos(yaw);
  const sector: Sector = dz <= -frontCos ? 'front' : dz >= frontCos ? 'back' : dx > 0 ? 'right' : 'left';
  return { sector, dir: [dx, dz] };
}

const named = (part: string, side: string) => part.replace('$near', side);

/** The blow's class (data/feel-hitreact.json `classes`): a counter-hit, else a heavy (charged, or a heavy move), else a light. Reads only what the sim's Hit already carries. */
export function classOf(rows: Rows, e: Pick<CombatEvent, 'counter' | 'charged' | 'move'>): BlowClass {
  if (e.counter === true) return 'counter';
  return e.charged === true || isHeavyMove(e.move) || (e.move !== undefined && rows.classes.heavyMoves.includes(e.move)) ? 'heavy' : 'light';
}
const FULL: ClassRow = { impulse: 1, twist: 1, dip: 1, blend: 1, holdS: 1, backS: 1, staggerImpulse: 1, staggerBlend: 1, staggerTime: 1 };
/** Put the class's softening of the package's own stagger (ragdoll.ts reads ctx.soften after the hooks) on this blow. Shared with feel-hero.ts. */
export const soften = (ctx: { soften?: { impulse: number; blend: number; time: number } }, row: ClassRow): void => { if (ctx.soften) { ctx.soften.impulse = row.staggerImpulse; ctx.soften.blend = row.staggerBlend; ctx.soften.time = row.staggerTime; } };

/** The reaction a blow at `location` coming with `heading` plans, or null (no zone row, no heading). `scale` = the hit's strength (1 = a plain hit). */
export function planHit(rows: Rows, location: string | undefined, heading: number | undefined, frameYaw: number, scale = 1, cls: ClassRow = FULL): Plan | null {   // cls: the blow class's multipliers (rows.classes); absent = the full reaction
  const zone = location ? (rows.zones as unknown as Record<string, ZoneRow | undefined>)[location] : undefined;
  if (!zone || heading === undefined) return null;
  const { sector, dir } = sectorOf(heading, frameYaw, rows.frontCos);
  const side = sector === 'right' ? 'Right' : sector === 'left' ? 'Left' : (rows.defaultSide as 'Left' | 'Right');
  const d = zone.dirs[sector], dips: Record<string, number> = {}, blend: Record<string, number> = {}, impulses: Plan['impulses'] = [];
  for (const [p, s] of Object.entries(zone.dips)) dips[named(p, side)] = Math.max(0, Math.min(1, 1 - (1 - s) * d.dip * cls.dip));
  for (const [p, s] of Object.entries(zone.blend)) blend[named(p, side)] = s * cls.blend;
  const total = zone.impulse * d.impulse * scale * cls.impulse;
  for (const [p, w] of Object.entries(zone.split)) impulses.push({ part: named(p, side), v: [dir[0] * total * w, zone.lift * scale * cls.impulse * Math.sign(w), dir[1] * total * w] });
  const twist = zone.twist * d.twist * scale * cls.twist;
  if (twist > 0) {   // a side blow: the chest one way, the belly the other (a couple about the vertical, perpendicular to the blow)
    const px = dir[1], pz = -dir[0];
    impulses.push({ part: 'spine2', v: [px * twist, 0, pz * twist] }, { part: 'spine', v: [-px * twist, 0, -pz * twist] });
  }
  return { zone: location!, sector, side, dips, blend, impulses, easeInS: zone.timing.easeInS, holdS: zone.timing.holdS * cls.holdS, backS: zone.timing.backS * cls.backS };
}

/** How deep the reaction is `t` seconds after the blow: eased in, held, then back over backS (0..1); -1 once it is over. */
export function depthAt(p: Pick<Plan, 'easeInS' | 'holdS' | 'backS'>, t: number): number {
  if (t < 0 || t >= p.easeInS + p.holdS + p.backS) return -1;
  return t < p.easeInS ? t / p.easeInS : t < p.easeInS + p.holdS ? 1 : 1 - (t - p.easeInS - p.holdS) / p.backS;
}

/** The motor strength of each dipped part at depth `k` (1 at no depth, the plan's dip at the deepest). */
export function strengthsAt(p: Pick<Plan, 'dips'>, k: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [part, s] of Object.entries(p.dips)) out[part] = 1 - (1 - s) * Math.max(0, k);
  return out;
}

/** What the ragdoll hook needs of the package's ragdoll. */
type Motors = { setMotorStrength(rows: number | Record<string, number>): void; applyImpulse(part: string, v: Vec3): void };

/** The stateful part. `hit` plans and applies a blow's impulses and starts the clock; `frame` advances it by `dt` presentation seconds, writes the motor
 *  strengths and returns the bones' blend ({ w, share }, for the hook's poseToward) or null when nothing is active (the dips have been put back). */
export function createHitReact(rows: Rows = ROWS) {
  let plan: Plan | null = null, t = 0, touched: string[] = [];
  const restore = (rd: Motors) => { if (touched.length) rd.setMotorStrength(Object.fromEntries(touched.map((p) => [p, 1]))); touched = []; };
  return {
    get active() { return plan !== null; },
    get plan() { return plan; },
    hit(rd: Motors, location: string | undefined, heading: number | undefined, frameYaw: number, scale = 1, cls?: ClassRow): Plan | null {
      const next = planHit(rows, location, heading, frameYaw, scale, cls);
      if (!next) return null;
      restore(rd);   // a second blow takes over from the first: its dips are put back before the new ones are written
      for (const i of next.impulses) rd.applyImpulse(i.part, i.v);
      plan = next; t = 0; touched = Object.keys(next.dips);
      return next;
    },
    frame(rd: Motors, dt: number): { w: number; share: Record<string, number> } | null {
      if (!plan) return null;
      t += dt;
      const k = depthAt(plan, t);
      if (k < 0) { restore(rd); plan = null; return null; }
      rd.setMotorStrength(strengthsAt(plan, k));
      return { w: k, share: plan.blend };
    },
    /** A death or a rematch: put the motors back and forget the blow. */
    reset(rd?: Motors) { if (rd) restore(rd); touched = []; plan = null; t = 0; },
  };
}
// ---- the hooks (feel-chunk.ts exports them as `hitreact`; feel.ts runs them only under ?feel=hitreact) ----
// hit: plan the blow by zone and side and write its impulses and motor dips. It runs BEFORE ragdoll.ts's own stagger, whose dip and impulse stay: the zone reaction is added to it.
// frame: advance the dips and put them back, and show the zone's bones (the rows' `blend`) by depth through ctx.blendToward. kill: forget the blow (the death ramp takes the motors).
// ?rules=m4 knockdown: while the package has him knocked down (rd.state 'knockdown') and for rows.knockdownQuietS after it ends (the get-up blend back to the clip, ragdoll.ts getUp: rules.json
// getUpS), this module writes no motor strength, applies no impulse and blends no bone: the dips it held are put back to full once (a raised base cannot lift a limp motor: the package takes
// the lower of the base and the knockdown's own strength), and the knockdown and the get-up are the rules path's alone. ctx has no get-up field, so the quiet window is this row's, kept at
// or above the rules' getUpS (test/feel-hitreact.test.mjs).
const react = createHitReact();
let quietS = 0;   // seconds of the get-up left after a knockdown ended
/** ?sway=v1 (rows.classes.revert): the page asks for the reaction as it was before the blow classes. */
const swayRevert = (): boolean => new URLSearchParams((globalThis as { location?: { search: string } }).location?.search ?? '').get(ROWS.classes.revert.query) === ROWS.classes.revert.value;
/** The class and multiplier row a blow plans with (feel-hero.ts uses it too, so both bodies react alike); ?sway=v1: every blow as a heavy, the reaction before the classes. */
export const blowClass = (e: Pick<CombatEvent, 'counter' | 'charged' | 'move'>): { name: BlowClass; row: ClassRow } =>
  swayRevert() ? { name: 'heavy', row: FULL } : (() => { const name = classOf(ROWS, e); return { name, row: ROWS.classes[name] }; })();
const downNow = (ctx: FeelCtx): boolean => ctx.rd.state === 'knockdown';
export const feelHooks: FeelHooks = {
  hit(e: CombatEvent, ctx: FeelCtx) {
    if (downNow(ctx) || quietS > 0) return;   // already down or getting up: the package ignores a stagger then, and so do these rows
    const { name: cl, row } = blowClass(e);
    soften(ctx, row);   // the package's own stagger for this blow (ragdoll.ts puts it back to 1 after the blow)
    const plan = react.hit(ctx.rd, e.location, e.heading, ctx.group.rotation.y, 1, row);
    if (plan) ((globalThis as { __hitreactLog?: unknown[] }).__hitreactLog ??= []).push({ tick: e.tick, zone: plan.zone, sector: plan.sector, side: plan.side, cls: cl });   // read by the clip harness
  },
  frame(dt: number, _events: readonly CombatEvent[], ctx: FeelCtx) {
    if (ctx.mode !== 'alive') { react.reset(); quietS = 0; return; }
    if (downNow(ctx)) { react.reset(ctx.rd); quietS = ROWS.knockdownQuietS; return; }   // reset(rd) puts every held dip back to 1, once
    if (quietS > 0) { quietS -= dt; return; }
    const f = react.frame(ctx.rd, dt);
    if (f) ctx.blendToward(Object.fromEntries(Object.entries(f.share).map(([p, s]) => [p, s * f.w])));   // the zone's bones show the ragdoll's pose by its depth (arms and legs too: ragdoll.ts's own stagger blend is the spine and half of neck and head)
  },
  kill() { react.reset(); quietS = 0; },
};

