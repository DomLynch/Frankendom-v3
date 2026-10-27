// The opponent's presentation ragdoll (Dom 2026-10-26, data/physics.json): @frankendom/physics (Jolt WASM) shadows the Minotaur's animated
// body while he fights, a landed blow dips his motors (the stagger), and his plain death falls as a ragdoll that stays down until the rematch.
// PRESENTATION ONLY: it reads the sim's events and the rig's animated bones, and writes bones; the sim (duel.ts) never sees it and Gate 0 is
// untouched. ?physics=v1 (the row's query) = today's death and hit behaviour exactly: nothing here is created and the chunk is never fetched.
// Every number and name is a data row (data/physics.json), the package's stagger and death runners included (`states`, passed to createPhysics).
//
// The sim frame of the ragdoll is the opponent's group (scene.ts `opponent`: the sim position and yaw), so walking costs the ragdoll nothing and
// the corpse lies where the sim's body lies. The package's three-rig helper maps capsules <-> bones; the rig here is already animated when it is
// made, so the bind pose is read from the loaded GLTF scene (never animated: characters.ts `bindScene`) through three-rig's `bind` option.
import * as THREE from 'three';
import PHYSICS from '../../data/physics.json' with { type: 'json' };
import { isPlainDeath, PLAIN_DEATH } from './finisher-look.ts';
import { afterFirstFrame, compileLateArt } from '../late-art.ts';
import { bone, rigOf } from './rig-bones.ts';
import { foeBodyFile } from './foe-body.ts';
import { createPieceCutter, isUnder, type PieceCutter } from './cut-pieces.ts';
import RULES from '../../data/rules.json' with { type: 'json' };
import FEEL_DEFAULTS from '../../data/feel-defaults.json' with { type: 'json' };   // the M7 feel modules on without a query (Dom 2026-10-27)
import { createHandSpeed, createRulesEval, cutPrecedence, evaluatorTakesKill, rulesOnFor, type Presentation, type RulesPackage } from './rules-eval.ts';
import { OPPONENTS, RULES as SIM_RULES, type OpponentId } from './moves.ts';   // ?rules=m4: his health (the budgets' scale) and a man's, both the sim's rows
import { captureException } from '../stubs.ts';   // V3: @sentry/browser
import type { CombatEvent } from './duel.ts';
import type { FinisherId } from './finishers.ts';
import { activeFeels, emitFeel, feel, feelNames, type FeelCtx, type FeelHooks } from './feel.ts';   // M7 fight feel: the registry the ?feel=<name> modules plug into (three call sites below)
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';   // leaveCorpse: a frozen copy of the dead rig (the Goblin's Loki afterimages do the same)
import { createLateCuts, finisherCutRow, finisherPush, finisherUnits, halvesApart, PHYSICS_MODE, VISUAL_UNITS, type FinisherCutRows } from './finisher-cuts.ts';   // ?ragdoll=finishers: V1's finishers with the physics body

export type PhysicsRows = typeof PHYSICS;
type OpponentRow = PhysicsRows['opponents'][number];
type Vec3 = [number, number, number];
type Hit = { part: string; impulse: Vec3 };
type Tuning = Record<string, { gain?: number; damping?: number }>;
/** What the package's rd.cut returns (physics f38dba0, docs/API.md 'Cuts (M5)'): the unit, the gear slots and roles that go with it, the stump's cap, the helmet prop. */
type CutResult = { unit: string; gear_slots: string[]; carries_roles: string[]; cap: { part: string; position: Vec3 }; props: { readPose(): ArrayLike<number>; destroy(): void }[]; visual_only?: boolean };   // visual_only (head_split, belly_open; physics 9056ef7): nothing detaches, only caps show
export type Ragdoll = {
  state: string; awake: boolean; partIds: string[]; cuts: readonly string[];
  row: { roles: { id: string; parent: string | null; radius_m: number; rest: { centre: Vec3; pivot: Vec3; quat: [number, number, number, number] } }[]; severable: { id: string; cut_role: string | null; visual_only?: boolean }[] };
  applyImpulse(part: string, v: Vec3): void; stagger(hit?: Hit): void; kill(hit?: Hit): void; knockdown(kind: 'damage' | 'push', hit?: Hit): void;
  cut(unit: string, opts?: { helmet?: boolean; impulse?: Vec3 }): CutResult | null; readPose(): ArrayLike<number>;
  snapToTarget(): boolean; reset(): boolean; destroy(): void;
};
/** A cut, as the page lists it (data/physics.json cut.log): the sim-side-presentation event Strategy's loot screen reads. `gear`: the ids on the slots that went with the piece. */
export type CutEvent = { type: 'cut'; unit: string; gear: string[]; source: string };
type CutRows = PhysicsRows['cut'];
type Physics = { step(dt: number): number; createRagdoll(row: unknown, opts?: { position?: Vec3; id?: string; motorTuning?: Tuning; solveHinges?: boolean }): Ragdoll; tickDt: number };
type Rig = { drive(): void; applyPose(): void };
type Bones = Record<string, THREE.Object3D>;
type Chunk = RulesPackage & {
  createPhysics(opts: { seed: number; states?: unknown }): Promise<Physics>;
  createThreeRig(three: typeof THREE, rd: Ragdoll, bones: Bones, root: THREE.Object3D, opts?: { bind?: { bones: Bones; root: THREE.Object3D } }): Rig;
  createCutRig(three: typeof THREE, rd: Ragdoll, scene: THREE.Object3D, manifest: unknown, opts?: { rows?: unknown }): CutRig;
  minotaurCutManifest: unknown;   // the manifest of src/assets/minotaur-106.glb (the physics cut GLB)
};
/** The package's cut-piece rig (three-cuts.mjs): `update()` shows each cap whose unit is in `rd.cuts`; the pieces are always drawn and the bones carry them. */
type CutRig = { update(): void; pieces: Record<string, THREE.Mesh>; caps: Record<string, THREE.Mesh> };

/** The opponent row in force on this page, or null: the feature off in the rows, ?physics=v1, or an opponent without a ragdoll. */
export function ragdollRowFor(rows: PhysicsRows, search: string, opponentId: string): OpponentRow | null {
  if (!rows.on || new URLSearchParams(search).get(rows.query) === rows.v1) return null;
  return rows.opponents.find((o) => o.id === opponentId && foeBodyFile(o.id, o.body, true) === o.body) ?? null;   // boss-body row (BOSS-BODIES.md): a ragdoll row is fitted to its own body; another body keeps today's death until it has a measure row
}

/** data/physics.json `finisher`: 'skip' (the default: every death of a ragdolled foe is the plain death and ragdolls), 'physics' (?ragdoll=finishers: the rotation's finishers play
 *  V1's camera, blood and sound, the victim's body the ragdoll cut by data/physics.json finisherCuts) or 'keep' (?ragdoll=clips: V1's finishers with V1's clips; only the plain death ragdolls). */
export function finisherModeFor(rows: PhysicsRows, search: string): string {
  const f = rows.finisher as { default: string; query: string; values: Record<string, string> }, v = new URLSearchParams(search).get(f.query);
  return (v !== null && f.values[v]) || f.default;
}

let page: FoeRagdoll | null = null;   // this page's ragdoll (one fight per page), for the finisher pick below
/** scene.ts: this page's ragdoll for `opponentId` (data/physics.json), or null (off, ?physics=v1, or a foe without one). */
export function foeRagdollFor(search: string, opponentId: string): FoeRagdoll | null {
  const foe = ragdollRowFor(PHYSICS, search, opponentId);
  page = foe ? createFoeRagdoll(PHYSICS, foe, () => import('./physics-chunk.ts') as Promise<Chunk>, finisherModeFor(PHYSICS, search) === 'skip', finisherModeFor(PHYSICS, search) === PHYSICS_MODE, rulesOnFor(RULES, search), activeFeels(search, FEEL_DEFAULTS), search) : null;   // ?rules=m4 (data/rules.json): the package's M4 evaluator decides each blow's reaction
  return page;
}
/** scene.ts, ?feel=hero (data/physics.json `hero`): the HERO's presentation ragdoll, a second createFoeRagdoll on sim fighter 0 (hit reactions from the same data/feel-hitreact.json rows as the opponent's, the package's
 *  death fall on her killing blow). No cuts, no corpse, no finisher, no rules path. Null without the flag, under ?physics=v1, or with the physics rows off: nothing is created. */
export function heroRagdollFor(search: string): FoeRagdoll | null {
  if (!PHYSICS.on || !feelNames(search).includes('hero') || new URLSearchParams(search).get(PHYSICS.query) === PHYSICS.v1) return null;
  const rows = { ...PHYSICS, cut: { ...PHYSICS.cut, on: false, onKill: {} } } as PhysicsRows;
  return createFoeRagdoll(rows, PHYSICS.hero as OpponentRow, () => import('./physics-chunk.ts') as Promise<Chunk>, false, false, false, activeFeels(search, undefined, true), search, 0, '__ragdollHero');
}
/** scene.ts: does the ragdoll play this finisher's victim (?ragdoll=finishers, a row in finisherCuts, the ragdoll built and standing)? Then the scene keeps the
 *  finisher's camera, blood and sound by its id and skips V1's victim clip and its bakes. */
export function ragdollBody(finisher: FinisherId | null): boolean { return !!page && !!finisherCutRow(PHYSICS, finisher) && page.takesFinisher(); }
/** The finisher pick's override for the scene's picture AND main.ts's death cue (one answer for both): the plain death while the finisher row
 *  says 'skip' and the ragdoll is standing ready to take the kill; null (the rotation as it is) otherwise. */
export function ragdollFinisher(events?: readonly CombatEvent[]): FinisherId | null {
  // A stills / trace harness forces the rotation's pick (the dev picker's place; a blade kill only: resolveFinisher keeps eligibility). Local hosts only: never read on the live site.
  const local = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const forced = local ? (globalThis as { __finisherPick?: string }).__finisherPick : undefined;
  // ?rules=m4 cut.precedence: a head-zone killing blow the evaluator cuts is the plain ragdoll death (its cut is the head), not the rotation's finisher; `events` is the frame's (scene.ts) or the step's (main.ts)
  return forced ?? (page?.skipsFinishers() || (events && page?.takesKill(events)) ? PLAIN_DEATH : null);
}

/** The part a blow at `location` lands on, and its impulse in the ragdoll's frame (the attacker's facing, `heading`, turned into `frame`). */
export function blowImpulse(row: { parts: Record<string, string>; impulse: number; lift: number }, location: string | undefined, heading: number | undefined, frameYaw: number): { part: string; impulse: Vec3 } | null {
  const part = location ? row.parts[location] : undefined;
  if (!part || heading === undefined) return null;
  const yaw = heading - frameYaw;   // the sim's facing: (sin h, cos h) on x, z; the group is turned by its own yaw about y
  return { part, impulse: [Math.sin(yaw) * row.impulse, row.lift, Math.cos(yaw) * row.impulse] };
}

/** How deep the stagger is `t` seconds after the blow (0..1, the package's own shape from the same `states.stagger` row): eased in, held, back up;
 *  -1 once it is over. The package dips the motors (rd.stagger); this is the bones' share of the ragdoll's pose on screen (hit.blend). */
export function staggerDepth(st: PhysicsRows['states']['stagger'], t: number): number {
  if (t < 0 || t >= st.ease_in_s + st.hold_s + st.up_s) return -1;
  return t < st.ease_in_s ? t / st.ease_in_s : t < st.ease_in_s + st.hold_s ? 1 : 1 - (t - st.ease_in_s - st.hold_s) / st.up_s;
}

/** The cut's event: the unit and the ids of the gear on the slots the package says go with it (the opponent row's `gear`: slot -> ids, empty for a foe in no armour). */
export function cutEvent(foe: { gear: Record<string, readonly string[] | undefined> }, result: { unit: string; gear_slots: readonly string[] }, source: string): CutEvent {
  return { type: 'cut', unit: result.unit, gear: result.gear_slots.flatMap((slot) => foe.gear[slot] ?? []), source };
}

/** The first unit of `order` (the corpse tap's priority) whose cut bone `bone` hangs under, or null (the pelvis, a bone no unit holds). `rootOf`: unit -> its cut bone. */
export function unitOfBone(bone: THREE.Object3D, order: readonly string[], rootOf: (unit: string) => THREE.Object3D | undefined): string | null {
  for (const unit of order) { const root = rootOf(unit); if (root && isUnder(bone, root)) return unit; }
  return null;
}

/** A frozen copy of a dead rig as it lies (SkeletonUtils.clone: the bones as they stand, nothing animates it). `ownGeometry`: every skinned mesh gets a clone of its geometry (the triangle cutter's twin and pieces
 *  share buffers the rematch rewrites and releases, so a copy of a carved body must not point at them). `pieces`: the copy's cut pieces (the triangle cutter's, marked `cutPiece`); `owned`: the geometry it made. */
export function snapshotRig(root: THREE.Object3D, ownGeometry: boolean): { copy: THREE.Object3D; pieces: THREE.Object3D[]; owned: THREE.BufferGeometry[] } {
  const copy = cloneRig(root), pieces: THREE.Object3D[] = [], owned: THREE.BufferGeometry[] = [];
  copy.traverse((o) => {
    if (o.name === 'WeaponTrail') o.visible = false;
    if (o instanceof THREE.SkinnedMesh) { o.frustumCulled = false; if (ownGeometry) { o.geometry = o.geometry.clone(); owned.push(o.geometry); } }
    if (o.userData.cutPiece !== undefined) pieces.push(o);
  });
  return { copy, pieces, owned };
}

/** A corpse left behind (leaveCorpse) ages by the frame's seconds: the pieces that left it are hidden after `pieceSeconds`, the whole copy is dropped after `keepSeconds`, and the oldest go first
 *  when more than `max` stand. Pure on the list (data/physics.json `corpse`), so a test can run it; returns what to hide and what to drop. */
export function ageCorpses<T extends { age: number; piecesHidden: boolean }>(list: T[], dt: number, row: { keepSeconds: number; pieceSeconds: number; max: number }): { keep: T[]; hide: T[]; drop: T[] } {
  const hide: T[] = [], drop: T[] = [];
  for (const c of list) {
    c.age += dt;
    if (c.age >= row.keepSeconds) drop.push(c);
    else if (!c.piecesHidden && c.age >= row.pieceSeconds) { c.piecesHidden = true; hide.push(c); }
  }
  const alive = list.filter((c) => !drop.includes(c));
  while (alive.length > row.max) drop.push(alive.shift()!);   // oldest first (the list is in the order they were left)
  return { keep: alive, hide, drop };
}

/** A cut GLB's cap meshes (cap_*, docs/CUT-CONTRACT.md) are in the file visible: they show only for a cut, so they are hidden as soon as the body is in the scene (Dom 2026-10-27: pink patches at the shoulders and belt for the first seconds, until the cut rig's warm-up hid them). */
export function hideCutCaps(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => { if (o.name.startsWith('cap_') && !o.parent?.name.startsWith('cap_') && o.visible) { o.visible = false; n++; } });   // a cap that is a group (cap_belly_opening: two primitives, cap_belly_opening_1 / _2) hides as that one node: the cut rig shows the group, never its children
  return n;
}
/** M8: every ragdoll in the one Jolt world (the live foe and each cuttable corpse) has its own lane, because ragdolls of different groups collide and every sim frame is the foe's group
 *  frame (a live foe built at the origin would stand inside the corpse). The first lane not in `used`, of `count` (max corpses + the live foe). */
export function freeSlot(used: readonly number[], count: number): number {
  for (let i = 0; i < count; i++) if (!used.includes(i)) return i;
  return count;   // never with the cap enforced before the live foe is rebuilt (leaveCorpse); a lane past the last rather than a collision
}
/** Where lane `slot` starts a ragdoll in the world (x, y, z; the package stands it on the floor there): `spacingM` apart along x. The three-rig absorbs the offset from the rig's own spawn pose. */
export const slotPosition = (slot: number, spacingM: number): Vec3 => [slot * spacingM, 0, 0];
/** The object in `copy` (a SkeletonUtils clone of `root`) that stands where `of` stands in `root`: the same place in the same walk of the tree. */
export function counterparts(root: THREE.Object3D, copy: THREE.Object3D): Map<THREE.Object3D, THREE.Object3D> {
  const a: THREE.Object3D[] = [], b: THREE.Object3D[] = [], out = new Map<THREE.Object3D, THREE.Object3D>();
  root.traverse((o) => a.push(o)); copy.traverse((o) => b.push(o));
  if (a.length !== b.length) throw new Error(`clone has ${b.length} objects, the original ${a.length}`);
  a.forEach((o, i) => out.set(o, b[i]!));
  return out;
}
/** Whether a cue button shows for a bone at `p` (normalised device coords): on the screen or a little past its edge (the button is a thumb wide), not behind the camera. A corpse the camera has turned away
 *  from (it follows the respawned foe) has none. */
export const cueOnScreen = (p: { x: number; y: number; z: number }): boolean => p.z <= 1 && Math.abs(p.x) <= 1.1 && Math.abs(p.y) <= 1.1;
/** M8: the corpse's own rig and cut rig on `copy` (a SkeletonUtils clone of `live`, the body that died): the bones and anchor that stand where the live ones stand, the three-rig made against the bind
 *  pose and the spawn pose of the live rig's making (the three-rig reads the ragdoll's pose once, then), the cut rig on the clone's meshes. Throws before anything is made when the clone lacks a bone.
 *  armCorpse (in createFoeRagdoll) is this plus the corpse's bookkeeping; test/corpse-ragdoll.test.mjs runs this one. */
export function makeCorpseRig(chunk: Pick<Chunk, 'createThreeRig' | 'createCutRig'>, real: Ragdoll, live: THREE.Object3D, copy: THREE.Object3D, partBones: Bones, liveAnchor: THREE.Object3D,
  bind: { bones: Bones; root: THREE.Object3D }, spawnHips: Vec3, manifest: unknown): { rig: Rig; cutRig: CutRig; bones: Bones; anchor: THREE.Object3D } {
  const map = counterparts(live, copy);
  const bones = Object.fromEntries(Object.entries(partBones).map(([part, b]) => [part, map.get(b)!]));
  const anchor = map.get(liveAnchor);
  if (!anchor || Object.values(bones).some((b) => !b)) throw new Error('the clone lacks a bone of the rig');
  let making = true;
  const view = new Proxy(real, { get: (t, k, r) => (making && k === 'readPose' ? () => spawnHips : Reflect.get(t, k, r)) }) as Ragdoll;
  const rig = chunk.createThreeRig(THREE, view, bones, copy, { bind });
  making = false;
  return { rig, cutRig: chunk.createCutRig(THREE, real, anchor, manifest), bones, anchor };
}
/** The corpse's piece for a cut unit, per the cut GLB's manifest: the meshes of the regions that unit detaches. */
export const piecesOfUnit = (manifest: { regions?: { id: string; detached_by?: string }[] } | undefined, unit: string): string[] => (manifest?.regions ?? []).filter((r) => r.detached_by === unit).map((r) => r.id);

/** The scale the pooled cap and helmet meshes wear for their warm-up draws (prepareCutArt): a speck. */
export const WARM_SCALE = 1e-4;
/** A pooled mesh taken for a cut: shown at its own `scale` (the warm-up speck never survives into a cut: caps and the helmet alike). */
export function showPooled(mesh: THREE.Object3D, scale: number): void { mesh.scale.setScalar(scale); mesh.visible = true; }

type Rigged = { anchor: THREE.Object3D; bindScene?: THREE.Object3D };
export type FoeRagdoll = ReturnType<typeof createFoeRagdoll>;

// rows: data/physics.json; foe: the opponent's row (ragdollRowFor); load: the chunk's import (scene.ts hands `() => import('./physics-chunk.ts')`)
export function createFoeRagdoll(rows: PhysicsRows, foe: OpponentRow, load: () => Promise<Chunk>, skipFinishers = false, bodyFinishers = false, rulesOn = false, feels: readonly FeelHooks[] = [], search = '', side = 1, costKey = '__ragdoll') {   // side: the sim fighter this body is (1 the opponent; 0 the hero under ?feel=hero, heroRagdollFor); costKey: its cost record's name on globalThis
  const feelCtx = (): FeelCtx => ({ target: side, rd: rd!, partBones, group: group!, mode, emit: emitFeel, limbs: feel.limbs, blendToward: (share) => poseToward(1, share) });   // what an M7 hook may use (feel.ts); built only when a ?feel= module is on
  const tick = 1 / rows.tickHz, bones = rows.bones as Record<string, string>;
  let chunk: Chunk | undefined, physics: Physics | undefined, measure: unknown, rd: Ragdoll | undefined, rig: Rig | undefined;
  const cutManifestOf = (c: Chunk): unknown => (foe.body === 'minotaur' ? c.minotaurCutManifest : undefined);   // the cut GLB's manifest for this foe's body (the Minotaur's only so far)
  /** Can this body cut `unit`? A visual unit (head_split, belly_open: nothing detaches) only when the cut GLB's manifest carries it (`optional_units`, a file made with --head-split / --belly-open); any other unit as before. */
  const hasUnit = (unit: string): boolean => {
    if (!(VISUAL_UNITS as readonly string[]).includes(unit)) return true;
    const m = chunk && cutManifestOf(chunk) as { optional_units?: Record<string, { enabled?: boolean } | undefined> } | undefined;
    return !!cutRig && !!m?.optional_units?.[unit]?.enabled;
  };
  // head_split (visual-only in the package: both halves follow the one head capsule): the two halves' bind matrices slide apart along the cut plane's normal, so the bones carry them apart
  // and the cut faces show (data/physics.json finisherCuts.halves). Nothing returns to the package; a rematch (rd.cuts empty) puts the bind matrices back.
  const halfBase = new WeakMap<THREE.SkinnedMesh, THREE.Matrix4>(), halfSlide = new THREE.Matrix4();
  let halfAge = 0, halfMoved = false;
  function slideHalves(dt: number) {
    const on = !!rd?.cuts.includes('head_split');
    if (!rigged || (!on && !halfMoved)) return;
    const m = chunk && cutManifestOf(chunk) as { regions?: { mesh: string; separated_by?: string }[]; optional_planes?: { head_split?: { normal: number[] } } } | undefined, n = m?.optional_planes?.head_split?.normal;
    if (!m?.regions || !n) return;
    halfAge = on ? halfAge + dt : 0;
    const d = on ? halvesApart((rows as unknown as FinisherCutRows).finisherCuts.halves, halfAge) / 2 : 0;
    for (const r of m.regions) {
      if (r.separated_by !== 'head_split') continue;
      const side = r.mesh.endsWith('_left') ? 1 : -1;   // the left half is the plane's + side (the manifest: piece_head_left)
      rigged.anchor.getObjectByName(r.mesh)?.traverse((o) => {
        if (!(o instanceof THREE.SkinnedMesh)) return;
        const base = halfBase.get(o) ?? halfBase.set(o, o.bindMatrix.clone()).get(o)!;
        o.bindMatrix.copy(base).multiply(halfSlide.makeTranslation(n[0]! * d * side, n[1]! * d * side, n[2]! * d * side));
      });
    }
    halfMoved = on;
  }
  let cutRig: CutRig | undefined;   // the body is the physics cut GLB (piece_* and cap_* meshes, docs/CUT-CONTRACT.md): a cut shows the caps and the piece flies with its bones. Undefined = the old triangle cutter and ball caps
  let group: THREE.Object3D | undefined, rigged: Rigged | undefined, partBones: Record<string, THREE.Object3D> = {};
  let mode: 'alive' | 'dead' | 'skip' = 'alive', acc = 0, stagger = -1, dying = 0, snap = true, armed = false, disabled = false;
  const late = createLateCuts();   // a finisher row's cut made some seconds after the killing blow (finisherCuts atS)
  // ?rules=m4 (rules-eval.ts): `rules` is the evaluator, `down` the seconds a knockdown has left (the bones follow the ragdoll), `getUp` the seconds left of the blend back to the clip
  let rules: ReturnType<typeof createRulesEval> | undefined, down = -1, getUp = -1;
  // ?rules=m4: the attacker's (the hero's) animated hand bone, sampled each frame: the hand speed at a hit (rules-eval.ts createHandSpeed)
  const handSpeed = createHandSpeed(RULES); let heroHand: THREE.Object3D | undefined, heroShoulder: THREE.Object3D | undefined, handScale = 1; const handPos = new THREE.Vector3(), shoulderPos = new THREE.Vector3();
  let judged: { tick: number; takes: boolean } | null = null;   // ?rules=m4 (data/rules.json cut.precedence): the verdict on the killing blow, made once per kill (the evaluator's state moves on every hit)
  const ruleCuts: string[] = [];   // the units the evaluator cut during this fight: they come off the body when he dies (cutUnit needs the corpse)
  const lying = new Map<THREE.Object3D, THREE.Quaternion>(), lyingHips = new THREE.Vector3();
  const animQ = new Map<THREE.Object3D, THREE.Quaternion>(), hipsPos = new THREE.Vector3();
  // Cuts (data/physics.json `cut`): the pieces taken off the skinned body, the caps over the seams, the helmet props.
  // The cap and helmet meshes, their materials and the body's twin are built once at load, hidden, and their programs compiled behind the first frame (prepareCutArt):
  // a cut frame only shows them (M5 follow-up; the cut frame was ~12 ms over the others, the first cut's cap programs and the carve).
  const cutRows: CutRows = rows.cut, gearRow = foe as { helmet?: boolean; gear?: Record<string, readonly string[]> };
  let warm = 0, cutter: PieceCutter | undefined, gore = true, capGeometry: THREE.SphereGeometry | undefined, capMaterials: THREE.MeshStandardMaterial[] = [], helmetMaterial: THREE.MeshStandardMaterial | undefined, helmetGeometry: THREE.SphereGeometry | undefined;
  const capPool: THREE.Mesh[] = [], helmetPool: THREE.Mesh[] = [], cutBones: { bone: THREE.Object3D; home: THREE.Vector3 }[] = [];   // cutBones: where each cut bone sat (the package's applyPose moves it to its capsule's joint; the rematch puts it back)
  // M8 (data/physics.json `corpse`): the live body's life (corpseId `<foe>#<n>`, kept by his corpse), his lane in the world, where his rig was made and the untouched scene it reads the bind pose from
  let lives = 0, lifeId = `${foe.id}#0`, slot = 0, spawnHips: Vec3 = [0, 0, 0], bindOpts: { bones: Bones; root: THREE.Object3D } | undefined;
  const done = new Set<string>(), follow: { mesh: THREE.Mesh; at: number; off: THREE.Vector3 }[] = [], props: { mesh: THREE.Mesh; prop: CutResult['props'][number] }[] = [];
  const cutLog = (): CutEvent[] => ((globalThis as Record<string, unknown>)[cutRows.log] ??= []) as CutEvent[];
  const cost = { hitsSeen: 0, feelHooks: 0, corpses: 0, cueState: '', corpseCuts: [] as { corpseId: string; unit: string; source: string }[], corpseInfo: undefined as (() => Record<string, unknown>[]) | undefined, corpseLimb: undefined as ((index: number, unit: string) => number | null) | undefined, leave: undefined as (() => boolean) | undefined, frames: 0, totalMs: 0, maxMs: 0, lastMs: 0, ticks: 0, state: 'loading', rig: '', measure: null as string | null, byMode: {} as Record<string, { frames: number; totalMs: number; maxMs: number }>, cuts: [] as CutEvent[], cutSteps: [] as Record<string, number | string>[], lastTap: '', pieces: [] as string[], screenOf: undefined as ((part: string) => [number, number] | null) | undefined, probe: undefined as ((x: number, y: number) => string | null) | undefined, limbDistance: undefined as ((unit: string) => number | null) | undefined };   // the per-frame cost, read by the stills (globalThis.__ragdoll)
  (globalThis as Record<string, unknown>)[costKey] = cost;
  cost.corpseInfo = () => corpses.map((c) => ({ id: c.id, slot: c.slot, age: +c.age.toFixed(2), kept: !!c.rd, state: c.rd?.state ?? 'static', awake: c.rd?.awake ?? false, cuts: [...c.done], gone: c.gone.size }));   // the stills / phone checks
  cost.corpseLimb = (index, unit) => {   // metres from a corpse's cut unit bone (it follows its capsule once cut) to its chest bone, world space
    const c = corpses[index], root = c?.bones?.[c.rd?.row.severable.find((s) => s.id === unit)?.cut_role ?? ''], chest = c?.bones?.spine2;
    return root && chest ? root.getWorldPosition(new THREE.Vector3()).distanceTo(chest.getWorldPosition(new THREE.Vector3())) : null;
  };
  cost.leave = () => leaveCorpse();   // the stills: leave a corpse by hand (the zone loop calls leaveCorpse at the respawn); cost.corpses counts those standing

  // The bones `w` of the way from the clip's pose (on them now) to the ragdoll's: 1 = the ragdoll's alone.
  // `share`: a part's own weight (hit.blend: only the parts that track the clip closely enough to show), 1 for every part when absent.
  function poseToward(w: number, share?: Record<string, number>) {
    if (w <= 0 || !rig || !group) return;
    if (w >= 1 && !share) { rig.applyPose(); return; }
    for (const b of Object.values(partBones)) animQ.set(b, (animQ.get(b) ?? new THREE.Quaternion()).copy(b.quaternion));
    const hips = partBones.hips!; hipsPos.copy(hips.position);
    rig.applyPose();
    for (const [part, b] of Object.entries(partBones)) b.quaternion.copy(animQ.get(b)!.slerp(b.quaternion, Math.min(1, w * (share ? share[part] ?? 0 : 1))));
    hips.position.lerpVectors(hipsPos, hips.position, Math.min(1, w * (share ? share.hips ?? 0 : 1)));
    group.updateWorldMatrix(true, true);
  }

  // A standing ragdoll: the package's reset() when it can (no cut has removed a joint), else a new one and its rig (the bind pose read from the
  // untouched GLTF scene). Its first tick snaps the capsules onto the clip's pose (snapToTarget), so it never starts from the spawn pose.
  function build(newLife = true) {
    if (!physics || !group || !rigged) return;
    clearCuts(); late.clear();   // the rematch: the body whole again, this fight's cut list empty
    if (newLife) lifeId = `${foe.id}#${++lives}`;   // M8: a new life, a new corpseId (the get-up of ?rules=m4 is the same life)
    if (!rd?.reset()) {
      rd?.destroy();
      const cr = rows.corpse as typeof rows.corpse | undefined, count = (cr?.cuttable ? cr.max : 0) + 1;   // the lanes: the live foe and each corpse that keeps a ragdoll
      slot = freeSlot(corpses.filter((c) => c.rd).map((c) => c.slot), count);
      rd = physics.createRagdoll(measure, { id: foe.id, position: slotPosition(slot, cr?.slotSpacingM ?? 0), motorTuning: tune?.motorTuning ?? rows.motorTuning, solveHinges: tune?.solveHinges ?? rows.solveHinges });
      const p0 = rd.readPose(); spawnHips = [p0[0]!, p0[1]!, p0[2]!];   // where the rig was made: a corpse's rig is made later, from this (see armCorpse)
      bindOpts = rigged.bindScene ? { bones: Object.fromEntries(Object.entries(bones).map(([part, name]) => [part, bone(rigged!.bindScene!, name)!])), root: rigged.bindScene } : undefined;
      const bind = bindOpts;
      rig = chunk!.createThreeRig(THREE, rd, partBones, group, bind ? { bind } : undefined);
      // the cut GLB (a body with piece_root): the caps follow THIS ragdoll's cut set, so a new ragdoll (after a cut the old one cannot reset) gets a new cut rig
      cutRig = cutRows.on && rigged.anchor.getObjectByName('piece_root') && cutManifestOf(chunk!) ? chunk!.createCutRig(THREE, rd, rigged.anchor, cutManifestOf(chunk!)) : undefined;
    }
    mode = 'alive'; acc = 0; stagger = -1; dying = 0; snap = true; armed = false; cost.state = 'alive';
  }
  // data/physics.json `corpse`: a dead foe's body can stay where it fell while the zone respawns him (leaveCorpse). It is a frozen copy of the rig as it lies, the cut pieces and caps
  // included (SkeletonUtils.clone copies the bones as they stand; nothing animates the copy), so the hero can walk away and the foe come back beside it.
  // M8: a corpse of a body with the cut GLB keeps its OWN ragdoll (`rd`, the old one, frozen; `rig` and `cutRig` made on the cloned scene), so the cut buttons and a tap work on it again and the piece it
  // loses flies. The package steps one world: the corpse's bodies sleep until a cut wakes one, so a standing corpse costs the world nothing but a sleep test (cost.byMode.corpses has the rest).
  type Corpse = { id: string; root: THREE.Object3D; age: number; piecesHidden: boolean; pieces: THREE.Object3D[]; owned: THREE.BufferGeometry[]; slot: number;
    rd?: Ragdoll; rig?: Rig; cutRig?: CutRig; bones?: Bones; anchor?: THREE.Object3D; cutter?: PieceCutter; cues?: CueSet;
    done: Set<string>; gone: Set<THREE.Object3D>; hideAt: { mesh: THREE.Object3D; at: number }[]; dirty: boolean; frozenFor: number };
  let corpses: Corpse[] = [];
  const dropCorpse = (c: Corpse) => {
    c.root.removeFromParent();
    if (c.cues) for (const { el } of c.cues.els) el.remove();
    c.rd?.destroy(); c.rd = c.rig = c.cutRig = c.cues = undefined;   // its lane in the world is free again
    c.cutter = undefined;
    for (const g of c.owned) g.dispose();   // geometry the copy cloned for itself (a carved body)
    const skeletons = new Set<THREE.Skeleton>();
    c.root.traverse((o) => { if (o instanceof THREE.SkinnedMesh) skeletons.add(o.skeleton); });
    for (const skeleton of skeletons) skeleton.dispose();   // the copy's own bone texture (the cut rig's pieces and caps are meshes of this copy, so their skeletons go here); geometry and materials are the live rig's and stay
    c.pieces.length = 0; c.hideAt.length = 0; c.gone.clear();   // the cut rig's meshes are not kept alive by the dropped corpse
  };
  /** The zone loop respawns the foe: leave this dead one where it lies (a static copy that keeps its cuts) and stand the live rig up whole again, as a rematch does. false when there is no corpse to leave. */
  function leaveCorpse(): boolean {
    const row = rows.corpse as typeof rows.corpse | undefined;   // a physics.json without the row leaves no corpse (the old rematch behaviour)
    if (disabled || mode !== 'dead' || !group || !rigged || !group.parent || !(row?.keepSeconds > 0)) return false;
    // a body the triangle cutter has cut draws its shared twin and pieces, which build() (cutter.restore) rewrites and releases: the copy gets geometry of its own then (the cut GLB's meshes are never released)
    const { copy, pieces, owned } = snapshotRig(group, !!cutter?.cut);
    const manifest = chunk && cutManifestOf(chunk) as { regions?: { mesh: string; detached_by?: string }[] } | undefined;
    if (cutRig && rd && manifest?.regions) for (const r of manifest.regions) { const m = r.detached_by && rd.cuts.includes(r.detached_by) ? copy.getObjectByName(r.mesh) : undefined; if (m) pieces.push(m); }
    group.parent.add(copy);
    const c: Corpse = { id: lifeId, root: copy, age: 0, piecesHidden: false, pieces, owned, slot, done: new Set(rd?.cuts ?? []), gone: new Set(), hideAt: [], dirty: false, frozenFor: 0 };
    if (row.cuttable && cutRig && rd && manifest) {
      try { armCorpse(c, manifest); } catch (error) { cost.state = `corpse stays static: ${error instanceof Error ? error.message : String(error)}`; captureException(error, { tags: { ragdoll: foe.id } }); }   // a static copy, as before M8
    }
    corpses.push(c);
    while (corpses.length > row.max) dropCorpse(corpses.shift()!);   // the oldest go now, not at the next frame: their lanes are the live foe's below
    cost.corpses = corpses.length;
    build(); down = -1; getUp = -1; ruleCuts.length = 0; judged = null; rules?.renew();   // the live rig whole again: the rematch's reset
    return true;
  }
  /** Hand the live ragdoll to the corpse c (just cloned): its own rig on the cloned bones (the bind pose read from the untouched scene, the spawn pose from when the live rig was made: the three-rig
   *  reads the ragdoll's pose once, at its making), its own cut rig on the cloned scene, and its cue buttons. The live foe is built again by the caller. Throws before anything is handed over. */
  function armCorpse(c: Corpse, manifest: unknown) {
    if (!chunk || !rd || !group || !rigged || !bindOpts) throw new Error('no untouched bind scene to make the corpse a rig from');
    const real = rd, { rig: rig2, cutRig: cut2, bones: bonesOf, anchor } = makeCorpseRig(chunk, real, group, c.root, partBones, rigged.anchor, bindOpts, spawnHips, manifest);
    c.rd = real; c.rig = rig2; c.cutRig = cut2; c.bones = bonesOf; c.anchor = anchor;
    rd = undefined; rig = undefined; cutRig = undefined;   // handed over: build() makes the live foe a new ragdoll in a lane of its own
    c.cues = makeCueSet(() => c.id, (unit) => bonesOf[real.row.severable.find((s) => s.id === unit)?.cut_role ?? ''], () => !disabled && gore &&!!c.rd && c.rd.state === cutRows.tap.needs && c.frozenFor >= cutRows.cue.delayS, (unit) => c.done.has(unit), (unit, view2) => cutCorpse(c, unit, 'tap', view2));
  }
  /** Tell the bus (feel.on, data/physics.json corpse.event) a cut was made: read-only info for V3's loot and zone code, `corpseId` the same for the live foe's kill cut and every later cut of his corpse. */
  function announce(event: CutEvent, corpseId: string) {
    const name = (rows.corpse as typeof rows.corpse | undefined)?.event;
    cost.corpseCuts.push({ corpseId, unit: event.unit, source: event.source });
    if (name) emitFeel(name, { unit: event.unit, gear: [...event.gear], source: event.source, corpseId });
  }
  /** Cut `unit` of a corpse that kept its ragdoll (the cue button's view is the camera's line to the bone, a tap's the ray). The piece flies on the corpse's own bodies; null when it is not cuttable now. */
  function cutCorpse(c: Corpse, unit: string, source: string, view: THREE.Vector3): CutEvent | null {
    const row = cutRows.tap;
    if (!c.rd || !c.cutRig || disabled || !row.on || !cutRows.on || !gore || c.rd.state !== row.needs || c.done.has(unit)) return null;
    try {
      const result = c.rd.cut(unit, { helmet: false, impulse: tapPush(view, c.root) });   // (a helmet prop is the live body's: a corpse's helmet stays on the piece's mesh)
      if (!result) return null;
      c.done.add(unit);
      for (const prop of result.props) prop.destroy();
      c.cutRig.update();   // shows the new stump caps (and every piece again: the ones already gone are hidden again below)
      for (const m of c.gone) m.visible = false;
      const manifest = chunk && cutManifestOf(chunk) as { regions?: { id: string; detached_by?: string }[] } | undefined;
      for (const id of piecesOfUnit(manifest, unit)) { const m = c.cutRig.pieces[id]; if (m) c.hideAt.push({ mesh: m, at: c.age + (rows.corpse as { pieceSeconds: number }).pieceSeconds }); }   // this piece goes pieceSeconds after ITS cut
      c.dirty = true;
      const event = cutEvent({ gear: gearRow.gear ?? {} }, result, source);
      announce(event, c.id);
      return event;
    } catch (error) { cost.state = `corpse cut failed: ${error instanceof Error ? error.message : String(error)}`; captureException(error, { tags: { ragdoll: foe.id } }); return null; }
  }
  function tapLive(ray: THREE.Raycaster): CutEvent | null {
    const row = cutRows.tap;
    if (disabled || !row.on || !cutRows.on || !rd || !rigged || !group || mode !== 'dead' || rd.state !== row.needs) return null;
    try {
      cutter ??= createPieceCutter(rigged.anchor);
      const hit = cutter.pick(ray), severable = rd.row.severable;
      cost.lastTap += ` | hit ${hit?.bone.name ?? 'nothing'}`;
      const unit = hit && unitOfBone(hit.bone, row.order, (u) => partBones[severable.find((s) => s.id === u)?.cut_role ?? '']);
      if (!unit || done.has(unit)) return null;
      return cutUnit(unit, 'tap', tapPush(ray.ray.direction));
    } catch (error) { cost.state = `tap failed: ${error instanceof Error ? error.message : String(error)}`; captureException(error, { tags: { ragdoll: foe.id } }); return null; }
  }
  /** A tap's ray on the corpses that kept a ragdoll (newest first): the first that strikes a unit still on it is cut. */
  function tapCorpses(ray: THREE.Raycaster): CutEvent | null {
    const row = cutRows.tap;
    for (let i = corpses.length - 1; i >= 0; i--) {
      const c = corpses[i]!;
      if (!c.rd || !c.anchor || !c.bones || c.rd.state !== row.needs) continue;
      const bonesOf = c.bones, severable = c.rd.row.severable;
      const hit = (c.cutter ??= createPieceCutter(c.anchor)).pick(ray);
      const unit = hit && unitOfBone(hit.bone, row.order, (u) => bonesOf[severable.find((s) => s.id === u)?.cut_role ?? '']);
      if (unit && !c.done.has(unit)) return cutCorpse(c, unit, 'tap', ray.ray.direction);
    }
    return null;
  }
  function clearCuts() {
    cutter?.restore();
    for (const f of follow) { f.mesh.visible = false; capPool.push(f.mesh); }   // hidden, back in the pool: the meshes and materials live as long as the page
    for (const p of props) { p.mesh.visible = false; helmetPool.push(p.mesh); p.prop.destroy(); }
    for (const r of cutBones) r.bone.position.copy(r.home);   // the cut bones go back to their joints
    cutBones.length = 0; follow.length = 0; props.length = 0; done.clear();
    cutLog().length = 0; cost.cuts = cutLog(); cost.pieces = []; cost.cutSteps = [];
  }

  // At load, once the ragdoll stands (so a cut frame builds nothing): the body's twin and its skin copies, a pool of cap balls (two a cut unit) and the helmet ball (only a foe
  // with `helmet`), their materials and shared geometry, all hidden in the opponent's group; then the scene compiles their programs (late-art.ts), off any frame that matters.
  function prepareCutArt() {
    if (!rd || !group || !rigged || !cutRows.on) return;
    if (cutRig) {   // the cut GLB: its cap meshes are in the scene already (hidden), so only their first draw is warmed (the old pool's two frames as a speck), the helmet ball aside
      for (const mesh of Object.values(cutRig.caps)) { mesh.scale.setScalar(WARM_SCALE); mesh.visible = true; }
      warm = 2;
      return;
    }
    cutter ??= createPieceCutter(rigged.anchor);
    cutter.prepare(rd.row.severable.map((s) => partBones[s.cut_role]).filter((b): b is THREE.Object3D => !!b));
    capGeometry ??= new THREE.SphereGeometry(1, cutRows.cap.segments[0], cutRows.cap.segments[1]);
    if (!capMaterials.length) capMaterials = [cutRows.cap.color, cutRows.cap.pieceColor].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.4 }));
    const hidden = (mesh: THREE.Mesh) => { mesh.visible = false; mesh.castShadow = true; mesh.frustumCulled = false; group!.add(mesh); return mesh; };
    for (let i = capPool.length; i < rd.row.severable.length * 2; i++) capPool.push(hidden(new THREE.Mesh(capGeometry, capMaterials[i % 2])));   // alternately the stump's and the piece's colour; a cap's own is set when it is taken
    if (gearRow.helmet && !helmetMaterial) {
      helmetMaterial = new THREE.MeshStandardMaterial({ color: cutRows.helmet.color, metalness: 0.7, roughness: 0.35 });
      helmetGeometry = new THREE.SphereGeometry(cutRows.helmet.radiusM, 20, 14);
      helmetPool.push(hidden(new THREE.Mesh(helmetGeometry, helmetMaterial)));
    }
    compileLateArt();
    // The programs compile off the frame, but a GPU pipeline (Metal under ANGLE) is made at a mesh's first DRAW: draw each hidden mesh for two frames as a 0.1 mm speck at the opponent's feet.
    for (const mesh of [...capPool, ...helmetPool]) { mesh.scale.setScalar(WARM_SCALE); mesh.visible = true; }
    warm = 2;
  }

  // One unit leaves the body: the package detaches it (its capsules, joint and gear slots), the skinned body gives the triangles its bones hold to a piece that
  // follows them, caps cover the two ends of the seam, and the event goes on the page's list. `impulse`: the piece's push in the ragdoll's frame.
  // Only on a corpse (the ragdoll's bones follow its capsules) and with gore shown (blood 'off' keeps the body whole, as for the finisher's head).
  function cutUnit(unit: string, source: string, impulse?: Vec3): CutEvent | null {
    if (!rd || !group || !rigged || !cutRows.on || !gore || done.has(unit)) return null;
    if (!hasUnit(unit)) return null;   // a visual unit the body's cut GLB does not carry: no cut (never the triangle cutter, which would carve the torso at its cap part)
    const t0 = performance.now(), steps: Record<string, number> = {};
    const result = rd.cut(unit, { helmet: !!gearRow.helmet, impulse });
    steps.cut = performance.now() - t0;
    if (!result) return null;
    done.add(unit);
    const part = result.cap.part, role = rd.row.roles.find((r) => r.id === part), root = partBones[part];
    if (role && root && mode === 'dead' && cutRig) {   // the cut GLB: the piece is already its own mesh on its bones and the caps show from rd.cuts (cutRig.update, every frame)
      let t = performance.now();
      cost.pieces.push(...rd.cuts.map((u) => `${u}:cut-glb`));
      for (const prop of result.props) { const mesh = helmetPool.pop(); if (mesh) { showPooled(mesh, 1); props.push({ mesh, prop }); } else prop.destroy(); }
      steps.props = performance.now() - t;
      if (!result.visual_only) cutBones.push({ bone: root, home: root.position.clone() });   // a visual unit (head_split, belly_open) moves no bone: only its caps show
    } else if (role && root && mode === 'dead') {
      cutter ??= createPieceCutter(rigged.anchor);
      let t = performance.now();
      cost.pieces.push(...cutter.carve(root, cutRows.seam).map((m) => `${unit}:${m.name}:${m.geometry.index!.count / 3}`));   // what each cut took, per draw (the stills read it)
      steps.carve = performance.now() - t; t = performance.now();
      const pose = rd.readPose(), at = new THREE.Vector3(...result.cap.position);
      const cap = (index: number, which: number, mult: number) => {   // a ball over the cut face, kept in the frame of the part it sits on: a pooled mesh, shown
        const o = index * 10, mesh = capPool.pop() ?? hiddenCap();
        mesh.material = capMaterials[which]!; showPooled(mesh, role.radius_m * mult);
        const off = at.clone().sub(new THREE.Vector3(pose[o], pose[o + 1], pose[o + 2])).applyQuaternion(new THREE.Quaternion(pose[o + 3], pose[o + 4], pose[o + 5], pose[o + 6]).invert());
        follow.push({ mesh, at: index, off });
      };
      cap(rd.partIds.indexOf(role.parent ?? 'hips'), 0, cutRows.cap.radiusMult);   // the stump: on the part the cut joint hangs from
      cap(rd.partIds.indexOf(part), 1, cutRows.cap.pieceRadiusMult);                // the piece's own cut face
      steps.caps = performance.now() - t; t = performance.now();
      for (const prop of result.props) { const mesh = helmetPool.pop(); if (mesh) { showPooled(mesh, 1); props.push({ mesh, prop }); } else prop.destroy(); }   // the helmet (only an opponent row with helmet: true): a plain ball on the package's prop body until a helmet mesh exists
      steps.props = performance.now() - t;
      cutBones.push({ bone: root, home: root.position.clone() });   // applyPose (the package's three-rig) puts it on its capsule's joint from the next frame
    }
    steps.total = performance.now() - t0; cost.cutSteps.push({ unit, ...steps });
    const event = cutEvent({ gear: gearRow.gear ?? {} }, result, source);
    cutLog().push(event); cost.cuts = cutLog();
    announce(event, lifeId);   // M8: the bus (corpse.event)
    return event;
  }
  const hiddenCap = () => { const mesh = new THREE.Mesh(capGeometry ??= new THREE.SphereGeometry(1, cutRows.cap.segments[0], cutRows.cap.segments[1]), capMaterials[0]); mesh.castShadow = true; mesh.frustumCulled = false; group!.add(mesh); return mesh; };   // a pool run dry (never at the Minotaur's 6 units)
  // A corpse tap's push in the ragdoll's frame: the world view direction times row `awayMult` (negative = toward the camera) plus its sideways (up x view) times `sideMult`,
  // so a limb piece flies where the player can see it. A row missing either keeps the old push (the validator also refuses it, validate.js `finite`).
  function tapPush(viewDir: THREE.Vector3, frame: THREE.Object3D | undefined = group): Vec3 {   // `frame`: the body's root (a corpse's own copy, or the live group)
    const row = cutRows.tap, v = viewDir.clone().transformDirection(frame!.matrixWorld.clone().invert()), side = new THREE.Vector3(0, 1, 0).cross(v).normalize();
    const d = v.multiplyScalar(row.awayMult ?? 1).add(side.multiplyScalar(row.sideMult ?? 0));
    return [d.x * row.impulse, d.y * row.impulse + row.lift, d.z * row.impulse];
  }
  // data/physics.json cut.cue: a pulsing "cut" dot on each part of the frozen corpse that can still be cut (a button over the canvas, so a thumb finds it without aiming at a bone).
  // Built by listenTaps; moved to its bone each frame by updateCues; a tap on it cuts that unit (cutCue). Hidden whenever the corpse is not frozen, the unit is done, or the bone is behind the camera.
  // M8: one set of buttons per body that can be cut: the live foe's and each corpse that kept its ragdoll (a button carries data-corpse, its body's corpseId).
  type CueSet = { id: () => string; els: { unit: string; el: HTMLButtonElement }[]; boneOf(unit: string): THREE.Object3D | undefined; ready(): boolean; isDone(unit: string): boolean };
  let liveCues: CueSet | undefined, cueCamera: THREE.Camera | undefined, cueCanvas: HTMLElement | undefined;
  /** A set of cut buttons for one body (null before listenTaps gave the page's camera, or with the cue row off). `cut(unit, view)`: what a click does, view = the camera's line to the unit's bone. */
  function makeCueSet(id: () => string, boneOf: (unit: string) => THREE.Object3D | undefined, ready: () => boolean, isDone: (unit: string) => boolean, cut: (unit: string, view: THREE.Vector3) => unknown): CueSet | undefined {
    const cue = cutRows.cue as typeof cutRows.cue | undefined;
    if (!cue?.on || !cueCamera) return undefined;
    const els = cue.units.map((unit) => {
      const el = document.createElement('button');
      el.className = 'cut-cue'; el.type = 'button'; el.textContent = cue.labels[unit as keyof typeof cue.labels] ?? 'cut'; el.setAttribute('aria-label', `Cut ${unit.replace('_', ' ')}`);
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!cueCamera) return;
        const bone = boneOf(unit), at = bone ? bone.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(), view = at.sub(cueCamera.getWorldPosition(new THREE.Vector3())).normalize();
        cut(unit, view);
      });
      document.body.appendChild(el);
      return { unit, el };
    });
    return { id, els, boneOf, ready, isDone };
  }
  function makeCues(canvas: HTMLElement, camera: THREE.Camera) {
    const cue = cutRows.cue as typeof cutRows.cue | undefined;   // a physics.json without the row simply has no cue (the plain tap still works)
    if (!cue?.on || !canvas.parentElement) return;
    cueCamera = camera; cueCanvas = canvas;
    const style = document.createElement('style');
    style.textContent = `.cut-cue{position:fixed;z-index:30;width:${cue.sizePx}px;height:${cue.sizePx}px;margin:${-cue.sizePx / 2}px 0 0 ${-cue.sizePx / 2}px;border-radius:50%;border:2px solid ${cue.color};background:${cue.color}33;color:${cue.color};font:700 10px/1 sans-serif;text-transform:uppercase;padding:0;display:none;animation:cut-cue-pulse ${cue.pulseS}s ease-in-out infinite;touch-action:manipulation}@keyframes cut-cue-pulse{0%,100%{box-shadow:0 0 0 0 ${cue.color}aa;opacity:.95}50%{box-shadow:0 0 0 9px ${cue.color}00;opacity:.7}}`;   // a glow, not a scale: the target a thumb aims at does not move
    document.head.appendChild(style);
    liveCues = makeCueSet(() => lifeId, (unit) => partBones[rd?.row.severable.find((s) => s.id === unit)?.cut_role ?? ''],
      () => !disabled && gore &&mode === 'dead' && !!rd && rd.state === cutRows.tap.needs && cueDelay >= cutRows.cue.delayS, (unit) => done.has(unit), cutCue);
    for (const c of corpses) if (c.rd && c.bones && !c.cues) { const bonesOf = c.bones, rdOf = c.rd; c.cues = makeCueSet(() => c.id, (unit) => bonesOf[rdOf.row.severable.find((s) => s.id === unit)?.cut_role ?? ''], () => !disabled && gore &&!!c.rd && c.rd.state === cutRows.tap.needs && c.frozenFor >= cutRows.cue.delayS, (unit) => c.done.has(unit), (unit, v) => cutCorpse(c, unit, 'tap', v)); }
  }
  /** Cut `unit` of the frozen corpse directly (the cue's button), pushed along `view`, the camera's line to it. null when it is not cuttable now. */
  function cutCue(unit: string, view: THREE.Vector3): CutEvent | null {
    const row = cutRows.tap;
    if (disabled || !row.on || !cutRows.on || !rd || !rigged || !group || mode !== 'dead' || rd.state !== row.needs || done.has(unit)) return null;
    try { return cutUnit(unit, 'tap', tapPush(view)); } catch (error) { cost.state = `cue failed: ${error instanceof Error ? error.message : String(error)}`; captureException(error, { tags: { ragdoll: foe.id } }); return null; }
  }
  /** Every cut button off (the ragdoll was disabled by an error, or the page stops running it): updateCues does not run then, so a button the last frame left showing would stay on screen and do nothing. */
  function hideCues() { for (const s of [liveCues, ...corpses.map((c) => c.cues)]) if (s) for (const { el } of s.els) el.style.display = 'none'; }
  function updateCues() {
    const sets = [liveCues, ...corpses.map((c) => c.cues)].filter((s): s is CueSet => !!s);
    if (!sets.length || !cueCamera || !cueCanvas) return;
    const r = cueCanvas.getBoundingClientRect(), shown: { el: HTMLButtonElement; x: number; y: number }[] = [];
    cost.cueState = sets.map((s) => `${s.id()}:${s.ready() ? 'ready' : 'waiting'}`).join(' ');   // the stills read it
    for (const set of sets) {
      const live = set.ready(), id = set.id();
      for (const { unit, el } of set.els) {
        if (el.dataset.corpse !== id) el.dataset.corpse = id;
        const bone = live && !set.isDone(unit) ? set.boneOf(unit) : undefined;
        const p = bone ? bone.getWorldPosition(tmpV2).project(cueCamera) : null;
        if (unit === 'head') cost.cueState += ` | ${id} head ndc ${p ? [p.x, p.y, p.z].map((v) => v.toFixed(2)).join(',') : 'no bone'}`;   // the stills read each corpse's head in NDC (a corpse the camera has turned from is outside -1..1: no buttons, cueOnScreen)
        if (!p || !cueOnScreen(p)) { el.style.display = 'none'; continue; }   // (a corpse further off than the screen has no button on it)
        shown.push({ el, x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height });
      }
    }
    // a small corpse on screen (seen over the hero's shoulder) puts every bone within a thumb: push the buttons apart until none touches another (a few relaxation passes), so each can be hit
    const gap = cutRows.cue.sizePx + 4;
    for (let pass = 0; pass < 12; pass++) for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) {
      const a = shown[i]!, b = shown[j]!, dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= gap) continue;
      const nx = d > 1e-3 ? dx / d : (j % 2 ? 1 : -1), ny = d > 1e-3 ? dy / d : 0.3, push = (gap - d) / 2;
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
    }
    for (const s of shown) { s.el.style.display = 'block'; s.el.style.left = `${s.x}px`; s.el.style.top = `${s.y}px`; }
  }
  const tmpV2 = new THREE.Vector3();
  let cueDelay = 0;   // seconds the corpse has been frozen (the cue waits cutRows.cue.delayS so the fall is watched first)
  const tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3();
  const tmpR = new THREE.Quaternion(), tmpJ = new THREE.Vector3(), shift = new THREE.Vector3();
  // Where the hips' joint is in the ragdoll's own frame (three-rig's applyPose does the same sum): the capsule's pose carried back to its joint.
  function hipsJoint(pose: ArrayLike<number>, rest: { centre: Vec3; pivot: Vec3; quat: [number, number, number, number] }, out: THREE.Vector3) {
    tmpQ.set(pose[3]!, pose[4]!, pose[5]!, pose[6]!).multiply(tmpR.set(rest.quat[0], rest.quat[1], rest.quat[2], rest.quat[3]).invert());
    return out.set(rest.pivot[0] - rest.centre[0], rest.pivot[1] - rest.centre[1], rest.pivot[2] - rest.centre[2]).applyQuaternion(tmpQ).add(tmpV.set(pose[0]!, pose[1]!, pose[2]!));
  }
  // After the bones follow the capsules (rig.applyPose: the package's three-rig puts a cut bone on its capsule's joint itself): the caps and the helmet ride their parts.
  // The ragdoll's frame is the group's shifted by where the hips joint is in each.
  function followCuts() {
    if (!rd || !group || !partBones.hips) return;
    const pose = rd.readPose();
    group.updateWorldMatrix(true, true);
    hipsJoint(pose, rd.row.roles[0]!.rest, shift).sub(group.worldToLocal(partBones.hips.getWorldPosition(tmpJ)));
    for (const f of follow) { const o = f.at * 10; tmpQ.set(pose[o + 3]!, pose[o + 4]!, pose[o + 5]!, pose[o + 6]!); f.mesh.position.copy(tmpV.copy(f.off).applyQuaternion(tmpQ)).add(tmpJ.set(pose[o]!, pose[o + 1]!, pose[o + 2]!)).sub(shift); }
    for (const p of props) { const q = p.prop.readPose(); p.mesh.position.set(q[0]!, q[1]!, q[2]!).sub(shift); p.mesh.quaternion.set(q[3]!, q[4]!, q[5]!, q[6]!); }
  }

  // ?rules=m4: the knockdown is over: standing again from the clip's pose (a reset), the bones eased from where he lay over rules `getUpS`.
  function standUp() { const was = armed; down = -1; build(false); armed = was; getUp = RULES.getUpS; }
  function fromLying(w: number) {   // the bones `w` of the way from where he lay to the clip's pose (now on them)
    for (const b of Object.values(partBones)) b.quaternion.copy(lying.get(b)!.clone().slerp(b.quaternion, w));
    partBones.hips!.position.lerpVectors(lyingHips, partBones.hips!.position, w); group!.updateWorldMatrix(true, true);
  }
  // ?rules=m4, cut.precedence: for a killing blow in a zone whose row says 'evaluator' (head by default) the evaluator judges the blow FIRST, before the scene and the death cue pick a finisher; a cut means the
  // death is the plain ragdoll death carrying that cut (takesKill, step). Once per kill (memo by the Killed's tick). Null: not applicable (no evaluator, no kill, a zone that keeps the rotation, ragdoll not ready).
  function judgeKill(events: readonly CombatEvent[]): { tick: number; takes: boolean } | null {
    if (!rules || disabled || !armed || !rig || mode !== 'alive') return judged;
    const killed = events.find((e) => e.type === 'Killed' && e.target === side);
    if (!killed || cutPrecedence(RULES, killed.location) !== 'evaluator') return judged;
    if (judged?.tick === killed.tick) return judged;
    const ps = events.filter((e) => e.type === 'Hit' && e.target === side && e.tick === killed.tick).map((e) => rules!.hit(e, false, handSpeed.speed()));   // the killing blow's own Hits (the sim's Killed decides the death)
    for (const p of ps) if (p?.cut && !ruleCuts.includes(p.cut)) ruleCuts.push(p.cut);
    return (judged = { tick: killed.tick, takes: evaluatorTakesKill(RULES, killed.location, ps) });
  }
  // ?rules=m4: one sim Hit on him through the evaluator: the stagger (impulse by strength), a knockdown (the bones follow the ragdoll while he is down), a cut (queued in ruleCuts, taken off the corpse at his death).
  function react(e: CombatEvent, p: Presentation) {
    if (p.cut && !ruleCuts.includes(p.cut)) ruleCuts.push(p.cut);
    const blow = blowImpulse(rows.hit, e.location, e.heading, group!.rotation.y), scaled = blow ? { part: blow.part, impulse: blow.impulse.map((v) => v * p.scale) as Vec3 } : undefined;
    if (down > 0 || p.action === 'none') return;   // already down: the package ignores a stagger or a second fall
    if (p.action === 'knockdown') { rd!.knockdown(p.cause, scaled); down = p.downS; stagger = -1; }
    else { rd!.stagger(scaled); stagger = 0; }
  }
  // A tuning harness may set globalThis.__ragdollTune before the page loads (motorTuning, solveHinges, blend; settle for the trace): the rows' values otherwise.
  // onKill: a harness's own Killed.location -> unit (the stills' kick kill is a torso blow; { torso: 'head' } makes it the head-zone kill the sim rarely lands on cue).
  const tune = (globalThis as { __ragdollTune?: { motorTuning?: Tuning; solveHinges?: boolean; blend?: Record<string, number>; settle?: number; onKill?: Record<string, string> } }).__ragdollTune;
  const blend: Record<string, number> = tune?.blend ?? rows.hit.blend, blendOn = Object.values(blend).some((w) => w > 0);

  return {
    // scene.ts, once the rigs are in: the opponent's group (the sim frame) and his rig. The chunk and the body row load after the first frame.
    attach(opponentGroup: THREE.Object3D, opponentRig: Rigged, heroRig?: Rigged) {
      group = opponentGroup; rigged = opponentRig;
      hideCutCaps(opponentRig.anchor);   // the cut GLB's cap_* meshes (sixteen with M9a's) ship visible: hidden now, before the first frame, not when the physics chunk lands (seconds later on a phone)
      heroHand = rulesOn && heroRig ? bone(heroRig.anchor, RULES.handBone) : undefined; handSpeed.reset();
      heroShoulder = rulesOn && heroRig ? bone(heroRig.anchor, RULES.handFrom) : undefined; handScale = (rulesOn && heroRig ? heroRig.anchor.getWorldScale(shoulderPos).x : 1) || 1;
      // the 65-rig names through the one bone map (data/rig.json via rig-bones.ts): on a 65 body the name itself, on a 106 body its Mixamo joint
      partBones = Object.fromEntries(Object.entries(bones).map(([part, name]) => [part, bone(opponentRig.anchor, name)!]));
      const rigId = rigOf(opponentRig.anchor), measurePath = (foe.measure as Record<string, string | undefined>)[rigId];
      cost.rig = rigId; cost.measure = measurePath ?? null;   // which body row the page's ragdoll is built from (the stills and phone checks read it)
      if (!measurePath) { cost.state = `no measure row for rig ${rigId}`; return Promise.resolve(); }   // today's death on that rig
      const missing = Object.entries(partBones).filter(([, b]) => !b).map(([p]) => p);
      if (missing.length) { cost.state = `no bone for ${missing.join(', ')}`; return Promise.resolve(); }
      return afterFirstFrame()
        .then(() => new Promise((done) => setTimeout(done, rows.loadAfterFirstFrameMs)))
        .then(() => Promise.all([load(), fetch(new URL(measurePath, document.baseURI)).then((r) => { if (!r.ok) throw Error(`${measurePath}: ${r.status}`); return r.json(); })]))
        .then(async ([c, row]) => { chunk = c; measure = row; physics = await c.createPhysics({ seed: rows.seed, states: rows.states }); if (rulesOn) rules = createRulesEval(RULES, c, row, foe.id, undefined, { foe: OPPONENTS[foe.id as OpponentId]?.health ?? SIM_RULES.health, man: SIM_RULES.health }, search); build(); prepareCutArt(); })
        .catch((error: unknown) => { cost.state = `failed: ${error instanceof Error ? error.message : String(error)}`; throw error; });
    },
    get state() { return rd?.state ?? cost.state; },
    /** The zone loop calls this at the foe's respawn (nothing passed): see leaveCorpse above. */
    leaveCorpse,
    /** The sim's decapitation finisher (?ragdoll=finishers): V1's flying head is the picture; the package's cut of the head is made too, so its event and gear are listed. Once. */
    finisherCut(): CutEvent | null { return !rulesOn && mode === 'skip' && !disabled ? cutUnit(cutRows.sever, 'finisher') : null; },
    /** The corpse tap (the butcher's table): the ray (a tap on the canvas) cuts the part of the frozen corpse it strikes; null when it strikes nothing cuttable or the corpse is not down. */
    tap(ray: THREE.Raycaster): CutEvent | null { return tapLive(ray) ?? tapCorpses(ray); },   // (M8: then the corpses left behind that kept a ragdoll, newest first)
    /** The cue's button (data/physics.json cut.cue): cut `unit` of the frozen corpse directly, pushed along the camera's view of it. null when it is not cuttable now. */
    cutCue,
    /** scene.ts: taps on the canvas are corpse taps. A press that stays within the row's px and ms (a drag is the camera's) casts a ray through the camera. */
    listenTaps(canvas: HTMLElement, camera: THREE.Camera) {
      const row = cutRows.tap, ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
      makeCues(canvas, camera);   // data/physics.json cut.cue: the "cut" dots on the frozen corpse
      let down: { x: number; y: number; t: number; id: number } | null = null, probed = -1;
      const aim = (x: number, y: number) => { const r = canvas.getBoundingClientRect(); ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1); camera.updateMatrixWorld(); ray.setFromCamera(ndc, camera); return ray; };
      canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId }; });
      canvas.addEventListener('pointerup', (e) => {
        const d = down; down = null;
        cost.lastTap = d ? `up ${Math.round(Math.hypot(e.clientX - d.x, e.clientY - d.y))}px ${Math.round(e.timeStamp - d.t)}ms mode ${mode} rd ${rd?.state}` : 'up without down';
        if (d && d.id === e.pointerId && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= row.maxMovePx && e.timeStamp - d.t <= row.maxMs) this.tap(aim(e.clientX, e.clientY));
      });
      cost.probe = (x: number, y: number) => {   // the stills: which unit a tap at this CSS px would cut (null: none), without cutting
        if (!rd || !rigged) return null;
        cutter ??= createPieceCutter(rigged.anchor);
        const hit = cutter.pick(aim(x, y), probed !== cost.frames), severable = rd.row.severable;
        probed = cost.frames;
        return (hit && unitOfBone(hit.bone, cutRows.tap.order, (u) => partBones[severable.find((s) => s.id === u)?.cut_role ?? ''])) ?? null;
      };
      cost.limbDistance = (unit: string) => {   // the stills: metres from a cut unit's bone (the cut bone follows its capsule once cut) to the chest bone, in world space
        const root = partBones[rd?.row.severable.find((s) => s.id === unit)?.cut_role ?? ''], chest = partBones.spine2;
        return root && chest ? root.getWorldPosition(new THREE.Vector3()).distanceTo(chest.getWorldPosition(new THREE.Vector3())) : null;
      };
      cost.screenOf = (part: string) => {   // the stills: where a part's bone is on screen (CSS px), to tap it
        const b = partBones[part]; if (!b) return null;
        const r = canvas.getBoundingClientRect(), p = b.getWorldPosition(new THREE.Vector3()).project(camera);
        return [r.left + ((p.x + 1) / 2) * r.width, r.top + ((1 - p.y) / 2) * r.height];
      };
    },
    /** The finisher row says 'skip' (the default) and a ragdoll built (a rig with no measure row, or a chunk not in yet, keeps the rotation). Latched once a death has begun. */
    //  `armed`: only once a frame with no finish in progress has seen the ragdoll ready, so a chunk that lands mid-finish never flips the pick
    //  between the picture (scene.ts) and the death cue (main.ts) halfway through a kill.
    /** ?rules=m4 (data/rules.json cut.precedence): does the evaluator take this killing blow from the finisher rotation (a head-zone blow at the cut rung)? Then the death is the plain ragdoll death with the head cut,
     *  and scene.ts / main.ts pick the plain death for the picture and the cue (ragdollFinisher(events)). Judged once per kill; stays true for the rest of that finish. */
    takesKill(events: readonly CombatEvent[]): boolean { return judgeKill(events)?.takes === true; },
    skipsFinishers() { return skipFinishers && armed && !disabled && !!rig && mode !== 'skip'; },
    /** ?ragdoll=finishers (finisher mode 'physics'): the ragdoll is built and standing (or already down), so a finisher with a finisherCuts row plays with this body. */
    takesFinisher() { return bodyFinishers && armed && !disabled && !!rig && mode !== 'skip'; },
    // scene.ts, every frame, after the opponent's rig has been posed by its clips (and before anything reads his bones):
    //   dt: the frame's presentation seconds (0 in a hit-stop); events: the sim's events this frame; finish: the sim's finish (null in play);
    //   finisher: the scene's pick for this kill (a cinematic finisher keeps its own clip: no ragdoll).
    // A physics error never breaks the frame: the ragdoll is off for the rest of the page (the clips alone, today's death) and it is reported once.
    //   showGore: false in blood 'off' (a cut leaves the body whole, as the finisher's head stays on there).
    frame(dt: number, events: readonly CombatEvent[], finish: { victim: number } | null, finisher: FinisherId | null, showGore = true) {
      if (corpses.length) {   // the corpses left behind age on the page's clock, whatever the live ragdoll is doing
        const { keep, hide, drop } = ageCorpses(corpses, dt, rows.corpse ?? { keepSeconds: 0, pieceSeconds: 0, max: 0 });   // (no row, no corpses: they would not have been left)
        for (const c of hide) for (const p of c.pieces) { p.visible = false; c.gone.add(p); }
        for (const c of drop) dropCorpse(c);
        corpses = keep; cost.corpses = corpses.length;
        for (const c of corpses) {   // M8: the pieces a later cut took off go pieceSeconds after THEIR cut; a corpse that kept its ragdoll counts the seconds it has been frozen (its cue waits cut.cue.delayS)
          if (c.hideAt.length) c.hideAt = c.hideAt.filter((h) => { if (c.age < h.at) return true; h.mesh.visible = false; c.gone.add(h.mesh); return false; });
          c.frozenFor = c.rd?.state === cutRows.tap.needs ? c.frozenFor + dt : 0;
        }
      }
      if (disabled) { hideCues(); return; }
      if (warm > 0 && --warm === 0) {   // the warm-up draws (prepareCutArt) are done
        for (const mesh of [...capPool, ...helmetPool]) mesh.visible = false;
        if (cutRig) for (const mesh of Object.values(cutRig.caps)) { mesh.scale.setScalar(1); mesh.visible = false; }
      }
      gore = showGore;
      cueDelay = mode === 'dead' && rd?.state === cutRows.tap.needs ? cueDelay + dt : 0;
      updateCues();
      if (heroHand) { heroHand.getWorldPosition(handPos); if (heroShoulder) { heroShoulder.getWorldPosition(shoulderPos); handPos.sub(shoulderPos); } handPos.multiplyScalar(1 / handScale); handSpeed.push(handPos.x, handPos.y, handPos.z, dt); }   // ?rules=m4: this frame's step of the hero's hand (before the hits are read)
      try {
        step(dt, events, finish, finisher);
        if (corpses.length) {   // M8: the corpses that kept a ragdoll follow it while a body of it moves (a cut piece in flight; it settles, asleep), after the world has stepped
          const t0 = performance.now();
          for (const c of corpses) if (c.rd && c.rig && (c.dirty || c.rd.awake)) { c.rig.applyPose(); c.dirty = c.rd.awake; }
          const by = (cost.byMode.corpses ??= { frames: 0, totalMs: 0, maxMs: 0 }), ms = performance.now() - t0;
          by.frames++; by.totalMs += ms; by.maxMs = Math.max(by.maxMs, ms);
        }
      } catch (error) { disabled = true; armed = false; hideCues(); cost.state = `disabled: ${error instanceof Error ? error.message : String(error)}`; captureException(error, { tags: { ragdoll: foe.id } }); }
    },
  };

  function step(dt: number, events: readonly CombatEvent[], finish: { victim: number } | null, finisher: FinisherId | null) {
      if (!rd || !rig || !physics || !group) return;
      const start = performance.now();
      if (!finish && mode !== 'alive') { build(); down = -1; getUp = -1; ruleCuts.length = 0; judged = null; rules?.renew(); }   // the rematch: a fresh ragdoll, standing (and the evaluator's fighter whole again)
      if (!finish) armed = true;
      const killed = mode === 'alive' ? events.find((e) => e.type === 'Killed' && e.target === side) : undefined;
      if (killed) {   // the killing blow: its own impulse, not the Hit's stagger as well
        // A finisher with a finisherCuts row plays with this body under ?ragdoll=finishers (its row picks the cut, none for Run Through); any other keeps its clip (finisher row 'keep')
        const fc = bodyFinishers && finisher !== null && !isPlainDeath(finisher) ? finisherCutRow(rows, finisher) : undefined;
        const judgedKill = judgeKill(events), verdict = judgedKill?.tick === killed.tick ? judgedKill : null;   // ?rules=m4 cut.precedence: the evaluator's verdict on this killing blow when its zone's row says 'evaluator' (null: the rotation decides, as before)
        if (finisher !== null && !isPlainDeath(finisher) && !fc && !verdict?.takes) { mode = 'skip'; cost.state = 'finisher'; }
        else {
          if (rules) for (const e of events) if (e.type === 'Hit' && e.target === side && e.tick !== verdict?.tick) { const p = rules.hit(e, false, handSpeed.speed()); if (p?.cut) ruleCuts.push(p.cut); }   // ?rules=m4: the killing blow is evaluated too (the list, the cuts); the sim's Killed is the death
          if (down <= 0) { rig.drive(); rd.snapToTarget(); }   // the death starts from the killing frame's own pose (no motor lag), then the package's death ramp (from where he lies, if he is down)
          down = -1; getUp = -1;
          rd.kill(blowImpulse({ ...rows.kill, impulse: finisherPush(fc, rows.kill.impulse) }, killed.location, killed.heading, group.rotation.y) ?? undefined); mode = 'dead'; stagger = -1; dying = 0;
          for (const f of feels) f.kill?.(killed, feelCtx());   // M7 (?feel=): his killing blow
          // ?rules=m4: the evaluator's cuts (this fight's, and the killing blow's) are the only cut trigger of the LIVE opponent's blows (the head-zone rule and V1's baked finisher cut are off); a finisher row's cut and every post-kill cut (the tap, the cue buttons) stay on
          for (const u of rulesOn ? ruleCuts.splice(0) : []) cutUnit(u, 'rules', blowImpulse({ ...cutRows.kill, parts: { [killed.location ?? 'torso']: u } }, killed.location ?? 'torso', killed.heading, group.rotation.y)?.impulse);
          const onKill = killed.location ? ((tune?.onKill ?? cutRows.onKill) as Record<string, string | undefined>)[killed.location] : undefined;   // a head-zone killing blow takes the head with it
          const units = fc ? finisherUnits(fc, hasUnit) : rulesOn ? [] : onKill ? [onKill] : [];   // defaults-on (Dom 2026-10-27): the M4 rules and the physics finishers are both default, so a finisher row's cut (Split Crown, Opened ...) is made under the rules too; the head-zone onKill rule stays the evaluator's alone   // a finisher's row decides its own cut(s): its unit (or the fallback stand-in), then its `also` units this body carries
          const push = (u: string) => blowImpulse({ ...(fc?.kill ?? cutRows.kill), parts: { [killed.location ?? 'torso']: u } }, killed.location ?? 'torso', killed.heading, group!.rotation.y)?.impulse;   // the push is the row's, whatever the location
          for (const unit of units) { if (!fc || fc.atS <= 0) cutUnit(unit, fc ? 'finisher' : 'kill', push(unit)); else late.add(unit, fc.atS, 'finisher'); }
        }
      } else if (mode === 'alive') for (const e of events) {
        if (e.type !== 'Hit' || e.target !== side) continue;
        const p = rules?.hit(e, true, handSpeed.speed());   // ?rules=m4: the evaluator's reaction; null (a missile, a weapon with no row) falls to V1's stagger below
        cost.hitsSeen++; cost.feelHooks = feels.length;   // the stills read these: blows that reached this ragdoll, and how many ?feel= modules it holds
        for (const f of feels) f.hit?.(e, feelCtx());   // M7 (?feel=): a blow landed on him, whichever reaction follows (after the evaluator's verdict, before the reaction)
        if (p) { react(e, p); continue; }
        rd.stagger(blowImpulse(rows.hit, e.location, e.heading, group.rotation.y) ?? undefined);   // the package's dip (states.stagger) and the blow's impulse
        stagger = 0;
      }
      if (mode === 'skip') { cost.lastMs = 0; return; }
      for (const due of late.tick(dt)) cutUnit(due.unit, due.source);   // a finisher row's cut made after the blow (atS)
      for (const f of feels) f.frame?.(dt, events, feelCtx());   // M7 (?feel=): every frame the ragdoll steps
      acc += dt;
      let ticks = 0;
      while (acc >= tick && ticks < rows.maxTicksPerFrame) {
        if (mode === 'alive' && down > 0) {   // ?rules=m4: knocked down: the motors fall, the hips are free (no setRoot, no target pose)
          down -= tick;
          if (down <= 0 || rd.state !== 'knockdown') { const keep = acc; standUp(); acc = keep; }
        } else if (mode === 'alive') {
          rig.drive();
          if (snap) snap = !rd.snapToTarget();   // a new or reset ragdoll starts on the clip's pose
          if (stagger >= 0) stagger = staggerDepth(rows.states.stagger, stagger + tick) < 0 ? -1 : stagger + tick;
        }
        if (rd.state !== 'frozen' || rd.awake || corpses.some((c) => c.rd?.awake)) physics.step(tick);   // the old rule for every state but a frozen corpse (alive, stagger and dying always step: never trusting Jolt's sleep for a ragdoll tracking a clip); the corpse steps only while a body of it is awake (a piece a cut wakes), and so does a corpse that kept its own ragdoll
        acc -= tick; ticks++;
      }
      if (ticks === rows.maxTicksPerFrame) acc = 0;
      const trace = (globalThis as { __ragdollTrace?: Record<string, number>[] }).__ragdollTrace;   // a debugging harness may ask: how far the ragdoll is from the animation, per part (radians)
      if (trace && mode === 'alive') {
        // tune.settle: step that many more ticks toward this frame's pose first, so what is left is the error at rest (limits, mapping), not the lag
        if (tune?.settle) { rig.drive(); for (let i = 0; i < tune.settle; i++) { physics.step(tick); rig.drive(); } }
        const anim = Object.entries(partBones).map(([p, b]) => [p, b.getWorldQuaternion(new THREE.Quaternion()), b.quaternion.clone(), b.position.clone()] as const);
        rig.applyPose();
        // per part: the whole orientation's angle, and (`<part>~`) the angle between the bone's long axes: what is left is twist. Both rigs' bones run
        // along local Y (minotaur.glb's lowerarm_l -> hand_l and minotaur-106.glb's LeftForeArm -> LeftHand are +Y offsets).
        const axis = (q: THREE.Quaternion) => new THREE.Vector3(0, 1, 0).applyQuaternion(q);
        trace.push({ ...Object.fromEntries(anim.flatMap(([p, q]) => { const r = partBones[p]!.getWorldQuaternion(new THREE.Quaternion()); return [[p, +q.angleTo(r).toFixed(3)], [`${p}~`, +axis(q).angleTo(axis(r)).toFixed(3)]]; })), _stagger: stagger >= 0 ? staggerDepth(rows.states.stagger, stagger) : -1 });
        for (const [p, , lq, lp] of anim) { partBones[p]!.quaternion.copy(lq); partBones[p]!.position.copy(lp); }
        group.updateWorldMatrix(true, true);
      }
      if (mode === 'dead') {
        // From the clip's pose into the ragdoll's over kill.blendInS (the ragdoll lags a fast clip while he fights: no pop on the killing frame)
        dying += dt;
        poseToward(rows.kill.blendInS > 0 ? Math.min(1, dying / rows.kill.blendInS) : 1);
      } else if (mode === 'alive' && down > 0) {   // ?rules=m4: the bones are the ragdoll's while he is down; where he lies is kept for the get-up blend
        poseToward(1);
        for (const b of Object.values(partBones)) (lying.get(b) ?? lying.set(b, new THREE.Quaternion()).get(b)!).copy(b.quaternion);
        lyingHips.copy(partBones.hips!.position);
      } else if (mode === 'alive' && getUp > 0) { getUp -= dt; fromLying(getUp > 0 ? 1 - getUp / RULES.getUpS : 1); if (getUp <= 0) getUp = -1;
      } else if (stagger >= 0 && blendOn) poseToward(staggerDepth(rows.states.stagger, stagger), blend);   // the stagger on screen, the most at the dip's deepest
      if (mode === 'dead' && follow.length + props.length) followCuts();
      if (cutRig && warm === 0) { cutRig.update(); slideHalves(dt); }   // the caps of every unit in rd.cuts show, the rest hide (during the warm-up draws they stay the speck update() would hide)
      const ms = performance.now() - start, by = (cost.byMode[mode] ??= { frames: 0, totalMs: 0, maxMs: 0 });
      cost.frames++; cost.totalMs += ms; cost.maxMs = Math.max(cost.maxMs, ms); cost.lastMs = ms; cost.ticks += ticks; cost.state = rd.state;
      by.frames++; by.totalMs += ms; by.maxMs = Math.max(by.maxMs, ms);
  }
}
