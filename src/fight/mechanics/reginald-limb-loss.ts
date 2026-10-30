// SIR REGINALD'S MECHANIC, LIMB LOSS (Dom + Strategy 2026-10-28; data/mechanics.json `reginald-limb-loss`): as he takes damage his armour fails limb by limb. At a health share per limb (a row) the limb VISIBLY goes
// (its cut-GLB piece mesh disappears and the stump cap shows, the body's own cut art) and what he can throw changes: no sword arm = no halberd, only shield shoves (a kick); no leg = no heavy (no charge)
// and he limps (his pace multiplier). The tell is the commentator's caption (priority line) and a short freeze; the counter is pressure (each limb costs him a family of moves).
// SIM SIDE (pure, deterministic, no clock, no dice): the fight keeps NO state of its own. A lost limb is a tag in his fighter's `phases` list (`limb:<id>`, the list duel.ts keeps for boss phases), written once by
// `markDuel` after the tick that took him under the row's share, so a new fight (a rematch, a leash reset, a respawn) starts whole by construction. `limbIntent` is the world layer stepPractice already takes
// (combat.ts `layer`, as mobkit.ts and Nan's impale): it rewrites the warden's intent AFTER decide(), so the swapped move goes through the same legal() and stepDuel; nothing here resolves a blow or touches a hit row.
// VIEW SIDE (no three.js import): `applyLimbs` hides the piece and shows the stump caps of every lost limb on a body wearing the cut GLB (node names are rows); it allocates nothing per frame.
// The registry (index.ts) hands the page `createLimbLossRuntime`: layer + settle (the same MechanicRuntime shape as Nan's), no ground drawing, no state (`pure`), so an attacker boss wears it too.
import ROWS from '../../../data/mechanics.json' with { type: 'json' };
import { legal, type Action, type Duel, type Fighter, type Intent } from '../duel.ts';
import type { Practice } from '../combat.ts';
import type { BodyNode, MechanicRuntime, Tell } from './runtime.ts';

export const MECHANIC_ID = 'reginald-limb-loss';   // the row's `type`
export type LimbRow = { id: string; region: string; name: string; belowPct: number; speedMult: number; forbids: Action[]; swapTo: Action | null; piece: string; stumpCaps: string[]; hangs?: { region: string; piece: string }[]; hitStopMs: number };   // hangs: the hand or foot that hangs from the limb (cut pieces too): lost with it
export type LimbLossRow = { type: string; boss: string; limbs: LimbRow[] };
export const ROW: LimbLossRow = Object.values(ROWS.mechanics as unknown as Record<string, LimbLossRow>).find((r) => r.type === MECHANIC_ID)!;
const TAGS: readonly string[] = ROW.limbs.map((l) => `limb:${l.id}`);   // the tags are built once; nothing below builds a string

type Manifest = { regions: { id: string; mesh: string }[]; caps: { mesh: string; region: string; shown_when_cut: string }[] };
/** Problems of the row against the boss body's cut manifest (the row's own shape is checked by src/sim/validate.js checkReginaldLimbLoss): the region's piece mesh, and caps that show when that region is cut and are not on the piece itself (those fly with it). [] = fine. */
export function limbManifestProblems(row: LimbLossRow, m: Manifest): string[] {
  const e: string[] = [];
  row.limbs.forEach((l, i) => {
    const p = `mechanics.${MECHANIC_ID}.limbs[${i}]`;
    if (!m.regions.some((r) => r.id === l.region && r.mesh === l.piece)) e.push(`${p}: manifest has no region ${l.region} with mesh ${l.piece}`);
    for (const h of l.hangs ?? []) if (!m.regions.some((r) => r.id === h.region && r.mesh === h.piece)) e.push(`${p}.hangs: manifest has no region ${h.region} with mesh ${h.piece}`);
    for (const c of l.stumpCaps) if (!m.caps.some((x) => x.mesh === c && x.shown_when_cut === l.region && x.region !== l.region)) e.push(`${p}.stumpCaps: ${c} is not a stump cap of ${l.region}`);
  });
  return e;
}

/** Whether limb `i` of the row is lost on a fighter with these phases. */
export const limbLost = (phases: readonly string[] | undefined, i: number): boolean => !!phases && phases.includes(TAGS[i]!);
/** Whether any limb is lost. */
export const anyLost = (phases: readonly string[] | undefined): boolean => { if (phases) for (let i = 0; i < TAGS.length; i++) if (phases.includes(TAGS[i]!)) return true; return false; };
/** The cut units (manifest regions) whose limbs are lost: a corpse cannot cut them again (nothing is there), and they yield no part. */
export const lostUnits = (phases: readonly string[] | undefined): string[] => ROW.limbs.filter((_, i) => limbLost(phases, i)).map((l) => l.region);
/** The hand and foot regions that hang from the lost limbs (the row's `hangs`): they go with the limb, so a corpse cannot cut them either (hands and feet are cuttable under ?hands=1). */
export const hungUnits = (phases: readonly string[] | undefined): string[] => ROW.limbs.flatMap((l, i) => (limbLost(phases, i) ? (l.hangs ?? []).map((h) => h.region) : []));

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
export function markDuel(duel: Duel): Duel {
  const f = duel.fighters[1];
  if (f.health <= 0) return duel;
  const pct = (100 * f.health) / f.maxHealth;
  let phases: string[] | null = null, speed = f.speed;
  for (let i = 0; i < ROW.limbs.length; i++) {
    const l = ROW.limbs[i]!;
    if (pct < l.belowPct && !limbLost(f.phases, i)) { (phases ??= f.phases ? [...f.phases] : []).push(TAGS[i]!); speed *= l.speedMult; }
  }
  if (!phases) return duel;
  const foe: Fighter = { ...f, phases, speed };
  return { ...duel, fighters: [duel.fighters[0], foe] };
}
/** markDuel on a Practice (the same object when nothing fails). */
export function markLimbs(next: Practice): Practice {
  const duel = markDuel(next.duel);
  return duel === next.duel ? next : { ...next, duel };
}

/** The limb that failed on this tick (prior -> next), or null: the page's tell (caption, freeze) reads it. */
export function limbFailed(prior: Practice, next: Practice): LimbRow | null {
  const a = prior.duel.fighters[1].phases, b = next.duel.fighters[1].phases;
  if (!b || (a?.length ?? 0) >= b.length) return null;
  for (let i = ROW.limbs.length - 1; i >= 0; i--) if (limbLost(b, i) && !limbLost(a, i)) return ROW.limbs[i]!;
  return null;
}
/** The tell: the caption (priority line) and the short freeze when a limb failed on this tick. */
export const limbTell = (prior: Practice, next: Practice): Tell | null => { const l = limbFailed(prior, next); return l ? { event: 'limb_loss', params: { limb: l.name }, hitStopMs: l.hitStopMs } : null; };

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
      for (let h = 0; h < (l.hangs?.length ?? 0); h++) { const hung = root.getObjectByName(l.hangs![h]!.piece); if (hung) hung.visible = false; }
      for (let c = 0; c < l.stumpCaps.length; c++) { const cap = root.getObjectByName(l.stumpCaps[c]!); if (cap) cap.visible = true; }
    } else {
      if (piece) piece.visible = true;
      for (let h = 0; h < (l.hangs?.length ?? 0); h++) { const hung = root.getObjectByName(l.hangs![h]!.piece); if (hung) hung.visible = true; }
      for (let c = 0; c < l.stumpCaps.length; c++) { const cap = root.getObjectByName(l.stumpCaps[c]!); if (cap) cap.visible = false; }
    }
    before[i] = lost;
  }
}

/** What a scene draws on a boss body of this mechanic: the view and the cut units a corpse cannot cut again. */
export type BodyMechanic = { view: (root: BodyNode, phases: readonly string[] | undefined) => void; lostUnits: (phases: readonly string[] | undefined) => string[]; hungUnits?: (phases: readonly string[] | undefined) => string[] };
/** The body mechanic of the boss whose profile id is `kind` (the row's `boss`), or null. */
export const bodyMechanicFor = (kind: string | undefined): BodyMechanic | null => (kind !== undefined && kind === ROW.boss ? { view: applyLimbs, lostUnits, hungUnits } : null);

/** The page's runtime (src/fight/mechanics/index.ts, one line): nothing drawn on the ground and no state of its own; the layer, the settle (marks the failed limbs) and the tell do the work. */
export function createLimbLossRuntime(row: LimbLossRow): MechanicRuntime {
  return {
    boss: row.boss, group: null, core: null, ctx: null, pure: true,
    reset() {}, tick: (practice) => practice, frame() {},
    layer: limbIntent,
    settle: (_prior, stepped) => markDuel(stepped),
    tell: limbTell,
  };
}
