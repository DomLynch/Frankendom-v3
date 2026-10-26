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
import { captureException } from '../stubs.ts';   // V3: @sentry/browser
import type { CombatEvent } from './duel.ts';
import type { FinisherId } from './finishers.ts';

export type PhysicsRows = typeof PHYSICS;
type OpponentRow = PhysicsRows['opponents'][number];
type Vec3 = [number, number, number];
type Hit = { part: string; impulse: Vec3 };
type Ragdoll = {
  state: string; partIds: string[];
  applyImpulse(part: string, v: Vec3): void; stagger(hit?: Hit): void; kill(hit?: Hit): void; setMotorGain(gain: number, damping?: number): void;
  snapToTarget(): boolean; reset(): boolean; destroy(): void;
};
type Physics = { step(dt: number): number; createRagdoll(row: unknown, opts?: { position?: Vec3; id?: string; motorGain?: number; motorDamping?: number }): Ragdoll; tickDt: number };
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

/** data/physics.json `finisher`: 'keep' (the rotation's finishers play; only the plain death ragdolls) or 'skip' (?ragdoll=always: every death of a ragdolled foe is the plain death). */
export function finisherModeFor(rows: PhysicsRows, search: string): string {
  const f = rows.finisher as { default: string; query: string; values: Record<string, string> }, v = new URLSearchParams(search).get(f.query);
  return (v !== null && f.values[v]) || f.default;
}

let page: FoeRagdoll | null = null;   // this page's ragdoll (one fight per page), for the finisher pick below
/** scene.ts: this page's ragdoll for `opponentId` (data/physics.json), or null (off, ?physics=v1, or a foe without one). */
export function foeRagdollFor(search: string, opponentId: string): FoeRagdoll | null {
  const foe = ragdollRowFor(PHYSICS, search, opponentId);
  page = foe ? createFoeRagdoll(PHYSICS, foe, () => import('./physics-chunk.ts') as Promise<Chunk>, finisherModeFor(PHYSICS, search) === 'skip') : null;
  return page;
}
/** The finisher pick's override for the scene's picture AND main.ts's death cue (one answer for both): the plain death while the finisher row
 *  says 'skip' and the ragdoll is standing ready to take the kill; null (the rotation as it is) otherwise. */
export function ragdollFinisher(): FinisherId | null { return page?.skipsFinishers() ? PLAIN_DEATH : null; }

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

type Rigged = { anchor: THREE.Object3D; bindScene?: THREE.Object3D };
export type FoeRagdoll = ReturnType<typeof createFoeRagdoll>;

// rows: data/physics.json; foe: the opponent's row (ragdollRowFor); load: the chunk's import (scene.ts hands `() => import('./physics-chunk.ts')`)
export function createFoeRagdoll(rows: PhysicsRows, foe: OpponentRow, load: () => Promise<Chunk>, skipFinishers = false) {
  const tick = 1 / rows.tickHz, bones = rows.bones as Record<string, string>;
  let chunk: Chunk | undefined, physics: Physics | undefined, measure: unknown, rd: Ragdoll | undefined, rig: Rig | undefined;
  let group: THREE.Object3D | undefined, rigged: Rigged | undefined, partBones: Record<string, THREE.Object3D> = {};
  let mode: 'alive' | 'dead' | 'skip' = 'alive', acc = 0, stagger = -1, dying = 0, snap = true, armed = false, disabled = false;
  const animQ = new Map<THREE.Object3D, THREE.Quaternion>(), hipsPos = new THREE.Vector3();
  const cost = { frames: 0, totalMs: 0, maxMs: 0, lastMs: 0, ticks: 0, state: 'loading', byMode: {} as Record<string, { frames: number; totalMs: number; maxMs: number }> };   // the per-frame cost, read by the stills (globalThis.__ragdoll)
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
    if (!rd?.reset()) {
      rd?.destroy();
      rd = physics.createRagdoll(measure, { id: foe.id, motorGain: rows.motorGain, motorDamping: rows.motorDamping });
      const bind = rigged.bindScene ? { bones: Object.fromEntries(Object.entries(bones).map(([part, name]) => [part, bone(rigged!.bindScene!, name)!])), root: rigged.bindScene } : undefined;
      rig = chunk!.createThreeRig(THREE, rd, partBones, group, bind ? { bind } : undefined);
    }
    if (tune?.gain !== undefined) rd!.setMotorGain(tune.gain, tune.damping);
    mode = 'alive'; acc = 0; stagger = -1; dying = 0; snap = true; armed = false; cost.state = 'alive';
  }
  // A tuning harness (scripts/ragdoll-stills.mjs TUNE=gain,damping,blend) may set globalThis.__ragdollTune before the page loads: the rows' values otherwise.
  const tune = (globalThis as { __ragdollTune?: { gain?: number; damping?: number; blend?: Record<string, number>; settle?: number } }).__ragdollTune;
  const blend: Record<string, number> = tune?.blend ?? rows.hit.blend, blendOn = Object.values(blend).some((w) => w > 0);

  return {
    // scene.ts, once the rigs are in: the opponent's group (the sim frame) and his rig. The chunk and the body row load after the first frame.
    attach(opponentGroup: THREE.Object3D, opponentRig: Rigged) {
      group = opponentGroup; rigged = opponentRig;
      // the 65-rig names through the one bone map (data/rig.json via rig-bones.ts): on a 65 body the name itself, on a 106 body its Mixamo joint
      partBones = Object.fromEntries(Object.entries(bones).map(([part, name]) => [part, bone(opponentRig.anchor, name)!]));
      const rigId = rigOf(opponentRig.anchor), measurePath = (foe.measure as Record<string, string | undefined>)[rigId];
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
    /** ?ragdoll=always and a ragdoll built (a rig with no measure row, or a chunk not in yet, keeps the rotation). Latched once a death has begun. */
    //  `armed`: only once a frame with no finish in progress has seen the ragdoll ready, so a chunk that lands mid-finish never flips the pick
    //  between the picture (scene.ts) and the death cue (main.ts) halfway through a kill.
    skipsFinishers() { return skipFinishers && armed && !disabled && !!rig && mode !== 'skip'; },
    // scene.ts, every frame, after the opponent's rig has been posed by its clips (and before anything reads his bones):
    //   dt: the frame's presentation seconds (0 in a hit-stop); events: the sim's events this frame; finish: the sim's finish (null in play);
    //   finisher: the scene's pick for this kill (a cinematic finisher keeps its own clip: no ragdoll).
    // A physics error never breaks the frame: the ragdoll is off for the rest of the page (the clips alone, today's death) and it is reported once.
    frame(dt: number, events: readonly CombatEvent[], finish: { victim: number } | null, finisher: FinisherId | null) {
      if (disabled) return;
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
        if (finisher !== null && !isPlainDeath(finisher)) { mode = 'skip'; cost.state = 'finisher'; }   // a cinematic finisher keeps its clip (finisher row 'keep')
        else {
          rig.drive(); rd.snapToTarget();   // the death starts from the killing frame's own pose (no motor lag), then the package's death ramp
          rd.kill(blowImpulse(rows.kill, killed.location, killed.heading, group.rotation.y) ?? undefined); mode = 'dead'; stagger = -1; dying = 0;
        }
      } else if (mode === 'alive') for (const e of events) {
        if (e.type !== 'Hit' || e.target !== 1) continue;
        rd.stagger(blowImpulse(rows.hit, e.location, e.heading, group.rotation.y) ?? undefined);   // the package's dip (states.stagger) and the blow's impulse
        stagger = 0;
      }
      if (mode === 'skip') { cost.lastMs = 0; return; }
      acc += dt;
      let ticks = 0;
      while (acc >= tick && ticks < rows.maxTicksPerFrame) {
        if (mode === 'alive') {
          rig.drive();
          if (snap) snap = !rd.snapToTarget();   // a new or reset ragdoll starts on the clip's pose
          if (stagger >= 0) stagger = staggerDepth(rows.states.stagger, stagger + tick) < 0 ? -1 : stagger + tick;
        }
        if (rd.state !== 'frozen') physics.step(tick);
        acc -= tick; ticks++;
      }
      if (ticks === rows.maxTicksPerFrame) acc = 0;
      const trace = (globalThis as { __ragdollTrace?: Record<string, number>[] }).__ragdollTrace;   // a debugging harness may ask: how far the ragdoll is from the animation, per part (radians)
      if (trace && mode === 'alive') {
        // tune.settle: step that many more ticks toward this frame's pose first, so what is left is the error at rest (limits, mapping), not the lag
        if (tune?.settle) { rig.drive(); for (let i = 0; i < tune.settle; i++) { physics.step(tick); rig.drive(); } }
        const anim = Object.entries(partBones).map(([p, b]) => [p, b.getWorldQuaternion(new THREE.Quaternion()), b.quaternion.clone(), b.position.clone()] as const);
        rig.applyPose();
        // per part: the whole orientation's angle, and (`<part>~`) the angle between the bone's long axes (the rig's bones run along local X): what is left is twist
        const axis = (q: THREE.Quaternion) => new THREE.Vector3(1, 0, 0).applyQuaternion(q);
        trace.push({ ...Object.fromEntries(anim.flatMap(([p, q]) => { const r = partBones[p]!.getWorldQuaternion(new THREE.Quaternion()); return [[p, +q.angleTo(r).toFixed(3)], [`${p}~`, +axis(q).angleTo(axis(r)).toFixed(3)]]; })), _stagger: stagger >= 0 ? staggerDepth(rows.states.stagger, stagger) : -1 });
        for (const [p, , lq, lp] of anim) { partBones[p]!.quaternion.copy(lq); partBones[p]!.position.copy(lp); }
        group.updateWorldMatrix(true, true);
      }
      if (mode === 'dead') {
        // From the clip's pose into the ragdoll's over kill.blendInS (the ragdoll lags a fast clip while he fights: no pop on the killing frame)
        dying += dt;
        poseToward(rows.kill.blendInS > 0 ? Math.min(1, dying / rows.kill.blendInS) : 1);
      } else if (stagger >= 0 && blendOn) poseToward(staggerDepth(rows.states.stagger, stagger), blend);   // the stagger on screen, the most at the dip's deepest
      const ms = performance.now() - start, by = (cost.byMode[mode] ??= { frames: 0, totalMs: 0, maxMs: 0 });
      cost.frames++; cost.totalMs += ms; cost.maxMs = Math.max(cost.maxMs, ms); cost.lastMs = ms; cost.ticks += ticks; cost.state = rd.state;
      by.frames++; by.totalMs += ms; by.maxMs = Math.max(by.maxMs, ms);
  }
}
