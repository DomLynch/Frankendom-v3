// SIR REGINALD'S MECHANIC, LIMB LOSS (Dom + Strategy 2026-10-28; data/mechanics.json `reginald-limb-loss`): as he takes damage his armour fails limb by limb. At a health share per limb (a row) the limb VISIBLY goes
// (its cut-GLB piece mesh disappears and the stump cap shows, the body's own cut art) and what he can throw changes: no sword arm = no halberd, only shield shoves (a kick); no leg = no heavy (no charge)
// and he limps (his pace multiplier). The tell is the commentator's caption (priority line) and a short freeze; the counter is pressure (each limb costs him a family of moves).
// SIM SIDE (pure, deterministic, no clock, no dice): the fight keeps NO state of its own. A lost limb is a tag in his fighter's `phases` list (`limb:<id>`, the list duel.ts keeps for boss phases), written once by
// `markLimbs` after the tick that took him under the row's share, so a new fight (a rematch, a leash reset, a respawn) starts whole by construction. `limbIntent` is the world layer stepPractice already takes
// (combat.ts `layer`, as mobkit.ts): it rewrites the warden's intent AFTER decide(), so the swapped move goes through the same legal() and stepDuel; nothing here resolves a blow or touches a hit row.
// VIEW SIDE (no three.js import): `applyLimbs` hides the piece and shows the stump caps of every lost limb on a body wearing the cut GLB (node names are rows); it allocates nothing per frame.
import ROWS from '../../../data/mechanics.json' with { type: 'json' };
import { legal, type Action, type Duel, type Fighter, type Intent } from '../duel.ts';
import type { Practice } from '../combat.ts';
import type { BodyNode, Mechanic } from './types.ts';

export const MECHANIC_ID = 'reginald-limb-loss';
export type LimbRow = { id: string; region: string; name: string; belowPct: number; speedMult: number; forbids: Action[]; swapTo: Action | null; piece: string; stumpCaps: string[]; hitStopMs: number };
export type LimbLossRow = { boss: string; limbs: LimbRow[] };
export const ROW: LimbLossRow = (ROWS.mechanics as unknown as Record<string, LimbLossRow>)[MECHANIC_ID]!;
const TAGS: readonly string[] = ROW.limbs.map((l) => `limb:${l.id}`);   // the tags are built once; nothing below builds a string

const ACTIONS = ['light', 'light_left', 'light_right', 'heavy', 'thrust', 'kick', 'dodge', 'backstep', 'parry', 'skill', 'skill2', 'heavy_right', 'heavy_left', 'heavy_thrust'];
/** Problems with the mechanic's row, checked against the profile ids and (when handed over) the body's cut manifest. [] = fine. */
export function validateLimbLoss(row: LimbLossRow, ctx: { profiles?: readonly string[]; manifest?: { regions: { id: string; mesh: string }[]; caps: { mesh: string; region: string; shown_when_cut: string }[] } } = {}): string[] {
  const e: string[] = [], at = `mechanics.${MECHANIC_ID}`;
  if (typeof row.boss !== 'string' || (ctx.profiles && !ctx.profiles.includes(row.boss))) e.push(`${at}.boss: must be a data/profiles.json id`);
  if (!Array.isArray(row.limbs) || !row.limbs.length) return [...e, `${at}.limbs: at least one limb`];
  const seen = new Set<string>();
  row.limbs.forEach((l, i) => {
    const p = `${at}.limbs[${i}]`;
    for (const k of Object.keys(l)) if (!['id', 'region', 'name', 'belowPct', 'speedMult', 'forbids', 'swapTo', 'piece', 'stumpCaps', 'hitStopMs'].includes(k)) e.push(`${p}.${k}: unknown key`);
    if (typeof l.id !== 'string' || !/^[a-z_]+$/.test(l.id) || seen.has(l.id)) e.push(`${p}.id: a unique lower-case id`); else seen.add(l.id);
    if (typeof l.name !== 'string' || !l.name.trim()) e.push(`${p}.name: a non-empty string`);
    if (!(Number.isFinite(l.belowPct) && l.belowPct > 0 && l.belowPct < 100)) e.push(`${p}.belowPct: a share between 0 and 100`);
    if (!(Number.isFinite(l.speedMult) && l.speedMult >= 0.2 && l.speedMult <= 1)) e.push(`${p}.speedMult: 0.2..1`);
    if (!Array.isArray(l.forbids) || !l.forbids.length || l.forbids.some((a) => !ACTIONS.includes(a))) e.push(`${p}.forbids: a list of known actions`);
    else if (l.swapTo !== null && l.forbids.includes(l.swapTo)) e.push(`${p}.swapTo: cannot be a forbidden action`);
    if (l.swapTo !== null && !ACTIONS.includes(l.swapTo)) e.push(`${p}.swapTo: null or a known action`);
    if (!Number.isInteger(l.hitStopMs) || l.hitStopMs < 0 || l.hitStopMs > 400) e.push(`${p}.hitStopMs: 0..400`);
    if (typeof l.piece !== 'string' || !Array.isArray(l.stumpCaps) || l.stumpCaps.some((c) => typeof c !== 'string')) e.push(`${p}.piece/stumpCaps: node names`);
    const m = ctx.manifest;
    if (m) {   // the nodes are the cut GLB's: the region's piece mesh, and caps that show when that region is cut and are not on the piece itself (those fly with it)
      if (!m.regions.some((r) => r.id === l.region && r.mesh === l.piece)) e.push(`${p}: manifest has no region ${l.region} with mesh ${l.piece}`);
      for (const c of l.stumpCaps) if (!m.caps.some((x) => x.mesh === c && x.shown_when_cut === l.region && x.region !== l.region)) e.push(`${p}.stumpCaps: ${c} is not a stump cap of ${l.region}`);
    }
  });
  for (let i = 1; i < row.limbs.length; i++) if (!(row.limbs[i]!.belowPct < row.limbs[i - 1]!.belowPct)) e.push(`${at}.limbs: belowPct must fall from one limb to the next`);
  return e;
}

/** Whether limb `i` of the row is lost on a fighter with these phases. */
export const limbLost = (phases: readonly string[] | undefined, i: number): boolean => !!phases && phases.includes(TAGS[i]!);
/** Whether any limb is lost. */
export const anyLost = (phases: readonly string[] | undefined): boolean => { if (phases) for (let i = 0; i < TAGS.length; i++) if (phases.includes(TAGS[i]!)) return true; return false; };
/** The cut units (manifest regions) whose limbs are lost: a corpse cannot cut them again (nothing is there), and they yield no part. */
export const lostUnits = (phases: readonly string[] | undefined): string[] => ROW.limbs.filter((_, i) => limbLost(phases, i)).map((l) => l.region);

/** The world layer: the warden's intent with the lost limbs' moves taken out (each thrown as the row's `swapTo` if the sim allows it now, else nothing). The same object when nothing changes. */
export function limbIntent(duel: Duel, intent: Intent): Intent {
  const f = duel.fighters[1];
  if (!f.phases || f.health <= 0 || !intent.action) return intent;
  let action: Action | null = intent.action;
  for (let i = 0; i < ROW.limbs.length && action; i++) {
    const l = ROW.limbs[i]!;
    if (limbLost(f.phases, i) && l.forbids.includes(action)) action = l.swapTo && legal(f, l.swapTo) ? l.swapTo : null;
  }
  return action === intent.action ? intent : { ...intent, action };
}

/** After a tick: any limb whose share he is now under is lost for good (tagged, and his pace slowed by the row's multiplier). The same object when nothing fails. */
export function markLimbs(next: Practice): Practice {
  const f = next.duel.fighters[1];
  if (f.health <= 0) return next;
  const pct = (100 * f.health) / f.maxHealth;
  let phases: string[] | null = null, speed = f.speed;
  for (let i = 0; i < ROW.limbs.length; i++) {
    const l = ROW.limbs[i]!;
    if (pct < l.belowPct && !limbLost(f.phases, i)) { (phases ??= f.phases ? [...f.phases] : []).push(TAGS[i]!); speed *= l.speedMult; }
  }
  if (!phases) return next;
  const foe: Fighter = { ...f, phases, speed };
  return { ...next, duel: { ...next.duel, fighters: [next.duel.fighters[0], foe] } };
}

/** The limb that failed on this tick (prior -> next), or null: the page's tell (caption, freeze) reads it. */
export function limbFailed(prior: Practice, next: Practice): LimbRow | null {
  const a = prior.duel.fighters[1].phases, b = next.duel.fighters[1].phases;
  if (!b || (a?.length ?? 0) >= b.length) return null;
  for (let i = ROW.limbs.length - 1; i >= 0; i--) if (limbLost(b, i) && !limbLost(a, i)) return ROW.limbs[i]!;
  return null;
}

// ---- the view -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const was = new WeakMap<object, boolean[]>();   // per body root: which limbs were hidden last frame (a limb that comes back is restored once; the cut rig owns the nodes otherwise)
/** Hide each lost limb's piece and show its stump caps on `root` (a body wearing the cut GLB); restore a limb that is whole again. Call it AFTER the cut rig's own update (it re-shows every piece each frame). */
export function applyLimbs(root: BodyNode, phases: readonly string[] | undefined): void {
  let before = was.get(root);
  if (!before && !anyLost(phases)) return;   // nothing lost, nothing ever hidden here: no work at all
  before ??= (was.set(root, []), was.get(root)!);
  for (let i = 0; i < ROW.limbs.length; i++) {
    const l = ROW.limbs[i]!, lost = limbLost(phases, i);
    if (!lost && !before[i]) continue;
    const piece = root.getObjectByName(l.piece);
    if (lost) {
      if (piece) piece.visible = false;
      for (let c = 0; c < l.stumpCaps.length; c++) { const cap = root.getObjectByName(l.stumpCaps[c]!); if (cap) cap.visible = true; }
    } else {
      if (piece) piece.visible = true;
      for (let c = 0; c < l.stumpCaps.length; c++) { const cap = root.getObjectByName(l.stumpCaps[c]!); if (cap) cap.visible = false; }
    }
    before[i] = lost;
  }
}

export const mechanic: Mechanic = {
  id: MECHANIC_ID,
  validate: (row, ctx) => validateLimbLoss(row as LimbLossRow, ctx as Parameters<typeof validateLimbLoss>[1]),
  layer: limbIntent,
  after: markLimbs,
  tell: (prior, next) => { const l = limbFailed(prior, next); return l ? { event: 'limb_loss', params: { limb: l.name }, hitStopMs: l.hitStopMs } : null; },
  view: applyLimbs,
  lostUnits,
};
