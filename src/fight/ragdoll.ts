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
import { afterFirstFrame } from '../late-art.ts';
import { bone, rigOf } from './rig-bones.ts';
import { createPieceCutter, isUnder, type PieceCutter } from './cut-pieces.ts';
import { captureException } from '../stubs.ts';   // V3: @sentry/browser
import type { CombatEvent } from './duel.ts';
import type { FinisherId } from './finishers.ts';
import { createLateCuts, finisherCutRow, finisherPush, PHYSICS_MODE } from './finisher-cuts.ts';   // ?ragdoll=finishers: V1's finishers with the physics body

export type PhysicsRows = typeof PHYSICS;
type OpponentRow = PhysicsRows['opponents'][number];
type Vec3 = [number, number, number];
type Hit = { part: string; impulse: Vec3 };
type Tuning = Record<string, { gain?: number; damping?: number }>;
/** What the package's rd.cut returns (physics f38dba0, docs/API.md 'Cuts (M5)'): the unit, the gear slots and roles that go with it, the stump's cap, the helmet prop. */
type CutResult = { unit: string; gear_slots: string[]; carries_roles: string[]; cap: { part: string; position: Vec3 }; props: { readPose(): ArrayLike<number>; destroy(): void }[] };
type Ragdoll = {
  state: string; partIds: string[];
  row: { roles: { id: string; parent: string | null; radius_m: number; rest: { centre: Vec3; pivot: Vec3; quat: [number, number, number, number] } }[]; severable: { id: string; cut_role: string }[] };
  applyImpulse(part: string, v: Vec3): void; stagger(hit?: Hit): void; kill(hit?: Hit): void;
  cut(unit: string, opts?: { helmet?: boolean; impulse?: Vec3 }): CutResult | null; readPose(): ArrayLike<number>;
  snapToTarget(): boolean; reset(): boolean; destroy(): void;
};
/** A cut, as the page lists it (data/physics.json cut.log): the sim-side-presentation event Strategy's loot screen reads. `gear`: the ids on the slots that went with the piece. */
export type CutEvent = { type: 'cut'; unit: string; gear: string[]; source: string };
type CutRows = PhysicsRows['cut'];
type Physics = { step(dt: number): number; createRagdoll(row: unknown, opts?: { position?: Vec3; id?: string; motorTuning?: Tuning; solveHinges?: boolean }): Ragdoll; tickDt: number };
type Rig = { drive(): void; applyPose(): void };
type Bones = Record<string, THREE.Object3D>;
type Chunk = {
  createPhysics(opts: { seed: number; states?: unknown }): Promise<Physics>;
  createThreeRig(three: typeof THREE, rd: Ragdoll, bones: Bones, root: THREE.Object3D, opts?: { bind?: { bones: Bones; root: THREE.Object3D } }): Rig;
};

/** The opponent row in force on this page, or null: the feature off in the rows, ?physics=v1, or an opponent without a ragdoll. */
export function ragdollRowFor(rows: PhysicsRows, search: string, opponentId: string): OpponentRow | null {
  if (!rows.on || new URLSearchParams(search).get(rows.query) === rows.v1) return null;
  return rows.opponents.find((o) => o.id === opponentId) ?? null;
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
  page = foe ? createFoeRagdoll(PHYSICS, foe, () => import('./physics-chunk.ts') as Promise<Chunk>, finisherModeFor(PHYSICS, search) === 'skip', finisherModeFor(PHYSICS, search) === PHYSICS_MODE) : null;
  return page;
}
/** scene.ts: does the ragdoll play this finisher's victim (?ragdoll=finishers, a row in finisherCuts, the ragdoll built and standing)? Then the scene keeps the
 *  finisher's camera, blood and sound by its id and skips V1's victim clip and its bakes. */
export function ragdollBody(finisher: FinisherId | null): boolean { return !!page && !!finisherCutRow(PHYSICS, finisher) && page.takesFinisher(); }
/** The finisher pick's override for the scene's picture AND main.ts's death cue (one answer for both): the plain death while the finisher row
 *  says 'skip' and the ragdoll is standing ready to take the kill; null (the rotation as it is) otherwise. */
export function ragdollFinisher(): FinisherId | null {
  // A stills / trace harness forces the rotation's pick (the dev picker's place; a blade kill only: resolveFinisher keeps eligibility). Local hosts only: never read on the live site.
  const local = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const forced = local ? (globalThis as { __finisherPick?: string }).__finisherPick : undefined;
  return forced ?? (page?.skipsFinishers() ? PLAIN_DEATH : null);
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

type Rigged = { anchor: THREE.Object3D; bindScene?: THREE.Object3D };
export type FoeRagdoll = ReturnType<typeof createFoeRagdoll>;

// rows: data/physics.json; foe: the opponent's row (ragdollRowFor); load: the chunk's import (scene.ts hands `() => import('./physics-chunk.ts')`)
export function createFoeRagdoll(rows: PhysicsRows, foe: OpponentRow, load: () => Promise<Chunk>, skipFinishers = false, bodyFinishers = false) {
  const tick = 1 / rows.tickHz, bones = rows.bones as Record<string, string>;
  let chunk: Chunk | undefined, physics: Physics | undefined, measure: unknown, rd: Ragdoll | undefined, rig: Rig | undefined;
  let group: THREE.Object3D | undefined, rigged: Rigged | undefined, partBones: Record<string, THREE.Object3D> = {};
  let mode: 'alive' | 'dead' | 'skip' = 'alive', acc = 0, stagger = -1, dying = 0, snap = true, armed = false, disabled = false;
  const late = createLateCuts();   // a finisher row's cut made some seconds after the killing blow (finisherCuts atS)
  const animQ = new Map<THREE.Object3D, THREE.Quaternion>(), hipsPos = new THREE.Vector3();
  // Cuts (data/physics.json `cut`): the pieces taken off the skinned body, the caps over the seams, the helmet props, and the ticks the world still steps for a piece to settle.
  const cutRows: CutRows = rows.cut, gearRow = foe as { helmet?: boolean; gear?: Record<string, readonly string[]> };
  let cutter: PieceCutter | undefined, gore = true, settle = 0, capGeometry: THREE.SphereGeometry | undefined;
  const roots: { bone: THREE.Object3D; home: THREE.Vector3; at: number; rest: { centre: Vec3; pivot: Vec3; quat: [number, number, number, number] } }[] = [];   // the cut bones: the package's rig turns bones, it never moves one off its parent, so a cut piece's root bone is placed on its joint's capsule here
  const done = new Set<string>(), follow: { mesh: THREE.Mesh; at: number; off: THREE.Vector3 }[] = [], props: { mesh: THREE.Mesh; prop: CutResult['props'][number] }[] = [], cutMaterials: THREE.Material[] = [];
  const cutLog = (): CutEvent[] => ((globalThis as Record<string, unknown>)[cutRows.log] ??= []) as CutEvent[];
  const cost = { frames: 0, totalMs: 0, maxMs: 0, lastMs: 0, ticks: 0, state: 'loading', rig: '', measure: null as string | null, byMode: {} as Record<string, { frames: number; totalMs: number; maxMs: number }>, cuts: [] as CutEvent[], lastTap: '', pieces: [] as string[], screenOf: undefined as ((part: string) => [number, number] | null) | undefined, probe: undefined as ((x: number, y: number) => string | null) | undefined };   // the per-frame cost, read by the stills (globalThis.__ragdoll)
  (globalThis as { __ragdoll?: typeof cost }).__ragdoll = cost;

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
  function build() {
    if (!physics || !group || !rigged) return;
    clearCuts(); late.clear();   // the rematch: the body whole again, this fight's cut list empty
    if (!rd?.reset()) {
      rd?.destroy();
      rd = physics.createRagdoll(measure, { id: foe.id, motorTuning: tune?.motorTuning ?? rows.motorTuning, solveHinges: tune?.solveHinges ?? rows.solveHinges });
      const bind = rigged.bindScene ? { bones: Object.fromEntries(Object.entries(bones).map(([part, name]) => [part, bone(rigged!.bindScene!, name)!])), root: rigged.bindScene } : undefined;
      rig = chunk!.createThreeRig(THREE, rd, partBones, group, bind ? { bind } : undefined);
    }
    mode = 'alive'; acc = 0; stagger = -1; dying = 0; snap = true; armed = false; cost.state = 'alive';
  }
  function clearCuts() {
    cutter?.restore();
    for (const f of follow) f.mesh.removeFromParent();
    for (const p of props) { p.mesh.removeFromParent(); p.prop.destroy(); }
    for (const r of roots) r.bone.position.copy(r.home);   // the cut bones go back to their joints
    roots.length = 0; follow.length = 0; props.length = 0; done.clear(); settle = 0;
    for (const m of cutMaterials) m.dispose();
    cutMaterials.length = 0; capGeometry?.dispose(); capGeometry = undefined;
    cutLog().length = 0; cost.cuts = cutLog(); cost.pieces = [];
  }

  // One unit leaves the body: the package detaches it (its capsules, joint and gear slots), the skinned body gives the triangles its bones hold to a piece that
  // follows them, caps cover the two ends of the seam, and the event goes on the page's list. `impulse`: the piece's push in the ragdoll's frame.
  // Only on a corpse (the ragdoll's bones follow its capsules) and with gore shown (blood 'off' keeps the body whole, as for the finisher's head).
  function cutUnit(unit: string, source: string, impulse?: Vec3): CutEvent | null {
    if (!rd || !group || !rigged || !cutRows.on || !gore || done.has(unit)) return null;
    const result = rd.cut(unit, { helmet: !!gearRow.helmet, impulse });
    if (!result) return null;
    done.add(unit); settle = Math.ceil(cutRows.settleS * rows.tickHz);
    const part = result.cap.part, role = rd.row.roles.find((r) => r.id === part), root = partBones[part];
    if (role && root && mode === 'dead') {
      cutter ??= createPieceCutter(rigged.anchor);
      cost.pieces.push(...cutter.carve(root, cutRows.seam).map((m) => `${unit}:${m.name}:${m.geometry.index!.count / 3}`));   // what each cut took, per draw (the stills read it)
      capGeometry ??= new THREE.SphereGeometry(1, cutRows.cap.segments[0], cutRows.cap.segments[1]);
      const pose = rd.readPose(), at = new THREE.Vector3(...result.cap.position);
      const cap = (index: number, color: string, mult: number) => {   // a ball over the cut face, kept in the frame of the part it sits on
        const o = index * 10, material = new THREE.MeshStandardMaterial({ color, roughness: 0.4 }), mesh = new THREE.Mesh(capGeometry, material);
        mesh.scale.setScalar(role.radius_m * mult); mesh.castShadow = true; mesh.frustumCulled = false;
        const off = at.clone().sub(new THREE.Vector3(pose[o], pose[o + 1], pose[o + 2])).applyQuaternion(new THREE.Quaternion(pose[o + 3], pose[o + 4], pose[o + 5], pose[o + 6]).invert());
        group!.add(mesh); cutMaterials.push(material); follow.push({ mesh, at: index, off });
      };
      cap(rd.partIds.indexOf(role.parent ?? 'hips'), cutRows.cap.color, cutRows.cap.radiusMult);   // the stump: on the part the cut joint hangs from
      cap(rd.partIds.indexOf(part), cutRows.cap.pieceColor, cutRows.cap.pieceRadiusMult);            // the piece's own cut face
      for (const prop of result.props) {   // the helmet (only an opponent row with helmet: true): a plain ball on the package's prop body until a helmet mesh exists
        const material = new THREE.MeshStandardMaterial({ color: cutRows.helmet.color, metalness: 0.7, roughness: 0.35 }), mesh = new THREE.Mesh(new THREE.SphereGeometry(cutRows.helmet.radiusM, 20, 14), material);
        mesh.castShadow = true; group.add(mesh); cutMaterials.push(material); props.push({ mesh, prop });
      }
      roots.push({ bone: root, home: root.position.clone(), at: rd.partIds.indexOf(part), rest: role.rest });
      const depth = (b: THREE.Object3D) => { let d = 0; for (let p = b.parent; p; p = p.parent) d++; return d; };
      roots.sort((a, b) => depth(a.bone) - depth(b.bone));   // a bone is placed after the ones above it
      followCuts();
    }
    const event = cutEvent({ gear: gearRow.gear ?? {} }, result, source);
    cutLog().push(event); cost.cuts = cutLog();
    return event;
  }
  const tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3();
  const tmpR = new THREE.Quaternion(), tmpJ = new THREE.Vector3(), shift = new THREE.Vector3();
  // Where role `i`'s cut joint is in the ragdoll's own frame (three-rig's applyPose does the same sum for the hips): the capsule's pose carried back to its joint.
  function jointOf(pose: ArrayLike<number>, i: number, rest: { centre: Vec3; pivot: Vec3; quat: [number, number, number, number] }, out: THREE.Vector3) {
    const o = i * 10;
    tmpQ.set(pose[o + 3]!, pose[o + 4]!, pose[o + 5]!, pose[o + 6]!).multiply(tmpR.set(rest.quat[0], rest.quat[1], rest.quat[2], rest.quat[3]).invert());
    return out.set(rest.pivot[0] - rest.centre[0], rest.pivot[1] - rest.centre[1], rest.pivot[2] - rest.centre[2]).applyQuaternion(tmpQ).add(tmpV.set(pose[o]!, pose[o + 1]!, pose[o + 2]!));
  }
  // After the bones follow the capsules (rig.applyPose turns them; it never moves one off its parent, bar the hips): each cut bone goes to its own capsule's joint, so
  // the piece leaves the body, and the caps and the helmet ride their parts. The ragdoll's frame is the group's shifted by where the hips joint is in each.
  function followCuts() {
    if (!rd || !group || !partBones.hips) return;
    const pose = rd.readPose();
    group.updateWorldMatrix(true, true);
    jointOf(pose, 0, rd.row.roles[0]!.rest, shift).sub(group.worldToLocal(partBones.hips.getWorldPosition(tmpJ)));
    for (const r of roots) {
      jointOf(pose, r.at, r.rest, tmpJ).sub(shift);
      r.bone.parent!.updateWorldMatrix(true, false);
      r.bone.position.copy(r.bone.parent!.worldToLocal(group.localToWorld(tmpJ)));
      r.bone.updateMatrixWorld(true);
    }
    for (const f of follow) { const o = f.at * 10; tmpQ.set(pose[o + 3]!, pose[o + 4]!, pose[o + 5]!, pose[o + 6]!); f.mesh.position.copy(tmpV.copy(f.off).applyQuaternion(tmpQ)).add(tmpJ.set(pose[o]!, pose[o + 1]!, pose[o + 2]!)).sub(shift); }
    for (const p of props) { const q = p.prop.readPose(); p.mesh.position.set(q[0]!, q[1]!, q[2]!).sub(shift); p.mesh.quaternion.set(q[3]!, q[4]!, q[5]!, q[6]!); }
  }

  // A tuning harness may set globalThis.__ragdollTune before the page loads (motorTuning, solveHinges, blend; settle for the trace): the rows' values otherwise.
  // onKill: a harness's own Killed.location -> unit (the stills' kick kill is a torso blow; { torso: 'head' } makes it the head-zone kill the sim rarely lands on cue).
  const tune = (globalThis as { __ragdollTune?: { motorTuning?: Tuning; solveHinges?: boolean; blend?: Record<string, number>; settle?: number; onKill?: Record<string, string> } }).__ragdollTune;
  const blend: Record<string, number> = tune?.blend ?? rows.hit.blend, blendOn = Object.values(blend).some((w) => w > 0);

  return {
    // scene.ts, once the rigs are in: the opponent's group (the sim frame) and his rig. The chunk and the body row load after the first frame.
    attach(opponentGroup: THREE.Object3D, opponentRig: Rigged) {
      group = opponentGroup; rigged = opponentRig;
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
        .then(async ([c, row]) => { chunk = c; measure = row; physics = await c.createPhysics({ seed: rows.seed, states: rows.states }); build(); })
        .catch((error: unknown) => { cost.state = `failed: ${error instanceof Error ? error.message : String(error)}`; throw error; });
    },
    get state() { return rd?.state ?? cost.state; },
    /** The sim's decapitation finisher (?ragdoll=finishers): V1's flying head is the picture; the package's cut of the head is made too, so its event and gear are listed. Once. */
    finisherCut(): CutEvent | null { return mode === 'skip' && !disabled ? cutUnit(cutRows.sever, 'finisher') : null; },
    /** The corpse tap (the butcher's table): the ray (a tap on the canvas) cuts the part of the frozen corpse it strikes; null when it strikes nothing cuttable or the corpse is not down. */
    tap(ray: THREE.Raycaster): CutEvent | null {
      const row = cutRows.tap;
      if (disabled || !row.on || !cutRows.on || !rd || !rigged || !group || mode !== 'dead' || rd.state !== row.needs) return null;
      try {
        cutter ??= createPieceCutter(rigged.anchor);
        const hit = cutter.pick(ray), severable = rd.row.severable;
        cost.lastTap += ` | hit ${hit?.bone.name ?? 'nothing'}`;
        const unit = hit && unitOfBone(hit.bone, row.order, (u) => partBones[severable.find((s) => s.id === u)?.cut_role ?? '']);
        if (!unit || done.has(unit)) return null;
        const direction = ray.ray.direction.clone().transformDirection(group.matrixWorld.clone().invert());   // the tap pushes the piece away from the camera
        return cutUnit(unit, 'tap', [direction.x * row.impulse, direction.y * row.impulse + row.lift, direction.z * row.impulse]);
      } catch (error) { cost.state = `tap failed: ${error instanceof Error ? error.message : String(error)}`; captureException(error, { tags: { ragdoll: foe.id } }); return null; }
    },
    /** scene.ts: taps on the canvas are corpse taps. A press that stays within the row's px and ms (a drag is the camera's) casts a ray through the camera. */
    listenTaps(canvas: HTMLElement, camera: THREE.Camera) {
      const row = cutRows.tap, ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
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
      cost.screenOf = (part: string) => {   // the stills: where a part's bone is on screen (CSS px), to tap it
        const b = partBones[part]; if (!b) return null;
        const r = canvas.getBoundingClientRect(), p = b.getWorldPosition(new THREE.Vector3()).project(camera);
        return [r.left + ((p.x + 1) / 2) * r.width, r.top + ((1 - p.y) / 2) * r.height];
      };
    },
    /** The finisher row says 'skip' (the default) and a ragdoll built (a rig with no measure row, or a chunk not in yet, keeps the rotation). Latched once a death has begun. */
    //  `armed`: only once a frame with no finish in progress has seen the ragdoll ready, so a chunk that lands mid-finish never flips the pick
    //  between the picture (scene.ts) and the death cue (main.ts) halfway through a kill.
    skipsFinishers() { return skipFinishers && armed && !disabled && !!rig && mode !== 'skip'; },
    /** ?ragdoll=finishers (finisher mode 'physics'): the ragdoll is built and standing (or already down), so a finisher with a finisherCuts row plays with this body. */
    takesFinisher() { return bodyFinishers && armed && !disabled && !!rig && mode !== 'skip'; },
    // scene.ts, every frame, after the opponent's rig has been posed by its clips (and before anything reads his bones):
    //   dt: the frame's presentation seconds (0 in a hit-stop); events: the sim's events this frame; finish: the sim's finish (null in play);
    //   finisher: the scene's pick for this kill (a cinematic finisher keeps its own clip: no ragdoll).
    // A physics error never breaks the frame: the ragdoll is off for the rest of the page (the clips alone, today's death) and it is reported once.
    //   showGore: false in blood 'off' (a cut leaves the body whole, as the finisher's head stays on there).
    frame(dt: number, events: readonly CombatEvent[], finish: { victim: number } | null, finisher: FinisherId | null, showGore = true) {
      if (disabled) return;
      gore = showGore;
      try { step(dt, events, finish, finisher); } catch (error) { disabled = true; armed = false; cost.state = `disabled: ${error instanceof Error ? error.message : String(error)}`; captureException(error, { tags: { ragdoll: foe.id } }); }
    },
  };

  function step(dt: number, events: readonly CombatEvent[], finish: { victim: number } | null, finisher: FinisherId | null) {
      if (!rd || !rig || !physics || !group) return;
      const start = performance.now();
      if (!finish && mode !== 'alive') build();   // the rematch: a fresh ragdoll, standing
      if (!finish) armed = true;
      const killed = mode === 'alive' ? events.find((e) => e.type === 'Killed' && e.target === 1) : undefined;
      if (killed) {   // the killing blow: its own impulse, not the Hit's stagger as well
        // A finisher with a finisherCuts row plays with this body under ?ragdoll=finishers (its row picks the cut, none for Run Through); any other keeps its clip (finisher row 'keep')
        const fc = bodyFinishers && finisher !== null && !isPlainDeath(finisher) ? finisherCutRow(rows, finisher) : undefined;
        if (finisher !== null && !isPlainDeath(finisher) && !fc) { mode = 'skip'; cost.state = 'finisher'; }
        else {
          rig.drive(); rd.snapToTarget();   // the death starts from the killing frame's own pose (no motor lag), then the package's death ramp
          rd.kill(blowImpulse({ ...rows.kill, impulse: finisherPush(fc, rows.kill.impulse) }, killed.location, killed.heading, group.rotation.y) ?? undefined); mode = 'dead'; stagger = -1; dying = 0;
          const unit = fc ? fc.unit ?? undefined : killed.location ? ((tune?.onKill ?? cutRows.onKill) as Record<string, string | undefined>)[killed.location] : undefined;   // a head-zone killing blow takes the head with it; a finisher's row decides its own cut
          const push = (u: string) => blowImpulse({ ...(fc?.kill ?? cutRows.kill), parts: { [killed.location ?? 'torso']: u } }, killed.location ?? 'torso', killed.heading, group!.rotation.y)?.impulse;   // the push is the row's, whatever the location
          if (unit && (!fc || fc.atS <= 0)) cutUnit(unit, fc ? 'finisher' : 'kill', push(unit));
          else if (unit) late.add(unit, fc!.atS, 'finisher');
        }
      } else if (mode === 'alive') for (const e of events) {
        if (e.type !== 'Hit' || e.target !== 1) continue;
        rd.stagger(blowImpulse(rows.hit, e.location, e.heading, group.rotation.y) ?? undefined);   // the package's dip (states.stagger) and the blow's impulse
        stagger = 0;
      }
      if (mode === 'skip') { cost.lastMs = 0; return; }
      for (const due of late.tick(dt)) cutUnit(due.unit, due.source);   // a finisher row's cut made after the blow (atS)
      acc += dt;
      let ticks = 0;
      while (acc >= tick && ticks < rows.maxTicksPerFrame) {
        if (mode === 'alive') {
          rig.drive();
          if (snap) snap = !rd.snapToTarget();   // a new or reset ragdoll starts on the clip's pose
          if (stagger >= 0) stagger = staggerDepth(rows.states.stagger, stagger + tick) < 0 ? -1 : stagger + tick;
        }
        if (rd.state !== 'frozen' || settle > 0) physics.step(tick);   // a frozen corpse's cut piece wakes: the world steps on until it settles
        if (settle > 0) settle--;
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
      } else if (stagger >= 0 && blendOn) poseToward(staggerDepth(rows.states.stagger, stagger), blend);   // the stagger on screen, the most at the dip's deepest
      if (mode === 'dead' && follow.length + props.length) followCuts();
      const ms = performance.now() - start, by = (cost.byMode[mode] ??= { frames: 0, totalMs: 0, maxMs: 0 });
      cost.frames++; cost.totalMs += ms; cost.maxMs = Math.max(cost.maxMs, ms); cost.lastMs = ms; cost.ticks += ticks; cost.state = rd.state;
      by.frames++; by.totalMs += ms; by.maxMs = Math.max(by.maxMs, ms);
  }
}
