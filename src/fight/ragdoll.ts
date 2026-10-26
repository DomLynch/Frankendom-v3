// The opponent's presentation ragdoll (Dom 2026-10-26, data/physics.json): @frankendom/physics (Jolt WASM) shadows the Minotaur's animated
// body while he fights, a landed blow dips his motors (the stagger), and his plain death falls as a ragdoll that stays down until the rematch.
// PRESENTATION ONLY: it reads the sim's events and the rig's animated bones, and writes bones; the sim (duel.ts) never sees it and Gate 0 is
// untouched. ?physics=v1 (the row's query) = today's death and hit behaviour exactly: nothing here is created and the chunk is never fetched.
// Every number and name is a data row (data/physics.json); the package's own death ramp runs on its own rows (its data/states.json).
//
// The sim frame of the ragdoll is the opponent's group (scene.ts `opponent`: the sim position and yaw), so walking costs the ragdoll nothing and
// the corpse lies where the sim's body lies. The package's three-rig helper maps capsules <-> bones; it wants the model in its bind pose when the
// rig is made, and the rig here has already been animated, so the bind pose is copied in from the loaded GLTF scene (never animated: characters.ts
// `bindScene`) for the moment the rig is made, then the animated pose is put back.
import * as THREE from 'three';
import PHYSICS from '../../data/physics.json' with { type: 'json' };
import { isPlainDeath } from './finisher-look.ts';
import { afterFirstFrame } from '../late-art.ts';
import type { CombatEvent } from './duel.ts';
import type { FinisherId } from './finishers.ts';

export type PhysicsRows = typeof PHYSICS;
type OpponentRow = PhysicsRows['opponents'][number];
type Vec3 = [number, number, number];
type Ragdoll = {
  state: string; partIds: string[];
  setMotorStrength(rows: number | Record<string, number>): void; applyImpulse(part: string, v: Vec3): void;
  kill(hit?: { part: string; impulse: Vec3 }): void; destroy(): void;
};
type Physics = { step(dt: number): number; createRagdoll(row: unknown, opts?: { position?: Vec3; id?: string }): Ragdoll; tickDt: number };
type Rig = { drive(): void; applyPose(): void };
type Chunk = { createPhysics(opts: { seed: number }): Promise<Physics>; createThreeRig(three: typeof THREE, rd: Ragdoll, bones: Record<string, THREE.Object3D>, root: THREE.Object3D): Rig };

/** The opponent row in force on this page, or null: the feature off in the rows, ?physics=v1, or an opponent without a ragdoll. */
export function ragdollRowFor(rows: PhysicsRows, search: string, opponentId: string): OpponentRow | null {
  if (!rows.on || new URLSearchParams(search).get(rows.query) === rows.v1) return null;
  return rows.opponents.find((o) => o.id === opponentId) ?? null;
}

/** scene.ts: this page's ragdoll for `opponentId` (data/physics.json), or null (off, ?physics=v1, or a foe without one). */
export function foeRagdollFor(search: string, opponentId: string): FoeRagdoll | null {
  const foe = ragdollRowFor(PHYSICS, search, opponentId);
  return foe ? createFoeRagdoll(PHYSICS, foe, () => import('./physics-chunk.ts') as Promise<Chunk>) : null;
}

/** The part a blow at `location` lands on, and its impulse in the ragdoll's frame (the attacker's facing, `heading`, turned into `frame`). */
export function blowImpulse(row: { parts: Record<string, string>; impulse: number; lift: number }, location: string | undefined, heading: number | undefined, frameYaw: number): { part: string; impulse: Vec3 } | null {
  const part = location ? row.parts[location] : undefined;
  if (!part || heading === undefined) return null;
  const yaw = heading - frameYaw;   // the sim's facing: (sin h, cos h) on x, z; the group is turned by its own yaw about y
  return { part, impulse: [Math.sin(yaw) * row.impulse, row.lift, Math.cos(yaw) * row.impulse] };
}

/** The stagger's motor strengths `t` seconds into it (1 = full): eased in, held, back up; null once it is over. */
export function staggerStrengths(hit: PhysicsRows['hit'], t: number): Record<string, number> | null {
  const end = hit.easeInS + hit.holdS + hit.upS;
  if (t >= end) return null;
  const k = t < hit.easeInS ? t / hit.easeInS : t < hit.easeInS + hit.holdS ? 1 : 1 - (t - hit.easeInS - hit.holdS) / hit.upS;
  const out: Record<string, number> = {};
  for (const [role, target] of Object.entries(hit.targets)) out[role] = 1 - (1 - target) * k;
  return out;
}
/** How deep the stagger is `t` seconds in (0..1), for the bones' blend toward the ragdoll's pose. */
export function staggerDepth(hit: PhysicsRows['hit'], t: number): number {
  const s = staggerStrengths(hit, t);
  if (!s) return 0;
  const [role, target] = Object.entries(hit.targets).reduce((a, b) => (b[1] < a[1] ? b : a));
  return (1 - s[role]!) / (1 - target);
}

type Rigged = { anchor: THREE.Object3D; bindScene?: THREE.Object3D };
export type FoeRagdoll = ReturnType<typeof createFoeRagdoll>;

// rows: data/physics.json; foe: the opponent's row (ragdollRowFor); load: the chunk's import (scene.ts hands `() => import('./physics-chunk.ts')`)
export function createFoeRagdoll(rows: PhysicsRows, foe: OpponentRow, load: () => Promise<Chunk>) {
  const tick = 1 / rows.tickHz, bones = rows.rigs[foe.rig as keyof PhysicsRows['rigs']] as Record<string, string>;
  let chunk: Chunk | undefined, physics: Physics | undefined, measure: unknown, rd: Ragdoll | undefined, rig: Rig | undefined;
  let group: THREE.Object3D | undefined, rigged: Rigged | undefined, partBones: Record<string, THREE.Object3D> = {};
  let mode: 'alive' | 'dead' | 'skip' = 'alive', acc = 0, stagger = -1, dying = 0;
  const saved = new Map<THREE.Object3D, [THREE.Vector3, THREE.Quaternion, THREE.Vector3]>();
  const animQ = new Map<THREE.Object3D, THREE.Quaternion>(), hipsPos = new THREE.Vector3();
  const cost = { frames: 0, totalMs: 0, maxMs: 0, lastMs: 0, ticks: 0, state: 'loading', byMode: {} as Record<string, { frames: number; totalMs: number; maxMs: number }> };   // the per-frame cost, read by the stills (globalThis.__ragdoll)
  (globalThis as { __ragdoll?: typeof cost }).__ragdoll = cost;

  // The bones `w` of the way from the clip's pose (on them now) to the ragdoll's: 1 = the ragdoll's alone.
  function poseToward(w: number) {
    if (w <= 0 || !rig || !group) return;
    if (w >= 1) { rig.applyPose(); return; }
    for (const b of Object.values(partBones)) animQ.set(b, (animQ.get(b) ?? new THREE.Quaternion()).copy(b.quaternion));
    const hips = partBones.hips!; hipsPos.copy(hips.position);
    rig.applyPose();
    for (const b of Object.values(partBones)) b.quaternion.copy(animQ.get(b)!.slerp(b.quaternion, w));
    hips.position.lerpVectors(hipsPos, hips.position, w);
    group.updateWorldMatrix(true, true);
  }

  // The bind pose on the live bones for the moment the rig is made (three-rig reads the rest orientations then), then today's pose back.
  function build() {
    if (!physics || !group || !rigged) return;
    rd?.destroy();
    rd = physics.createRagdoll(measure, { id: foe.id });
    const bind = new Map<string, THREE.Object3D>(); rigged.bindScene?.traverse((o) => { if (o.name && !bind.has(o.name)) bind.set(o.name, o); });
    const hips = group.getObjectByName(bones.hips!)!;
    saved.clear();
    const keep = (o: THREE.Object3D) => saved.set(o, [o.position.clone(), o.quaternion.clone(), o.scale.clone()]);
    for (let o = hips.parent; o && o !== group; o = o.parent) { keep(o); if (!bind.has(o.name)) { o.position.set(0, 0, 0); o.quaternion.identity(); } }   // the flinch pivot, the anchor: no presentation offset in the rest pose
    rigged.anchor.traverse((o) => { const b = bind.get(o.name); if (b) { if (!saved.has(o)) keep(o); o.position.copy(b.position); o.quaternion.copy(b.quaternion); o.scale.copy(b.scale); } });
    group.updateWorldMatrix(true, true);
    rig = chunk!.createThreeRig(THREE, rd, partBones, group);
    for (const [o, [p, q, s]] of saved) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); }
    group.updateWorldMatrix(true, true);
    mode = 'alive'; acc = 0; stagger = -1; dying = 0; cost.state = 'alive';
  }

  return {
    // scene.ts, once the rigs are in: the opponent's group (the sim frame) and his rig. The chunk and the body row load after the first frame.
    attach(opponentGroup: THREE.Object3D, opponentRig: Rigged) {
      group = opponentGroup; rigged = opponentRig;
      partBones = Object.fromEntries(Object.entries(bones).map(([part, name]) => [part, opponentRig.anchor.getObjectByName(name)!]));
      const missing = Object.entries(partBones).filter(([, b]) => !b).map(([p]) => p);
      if (missing.length) { cost.state = `no bone for ${missing.join(', ')}`; return Promise.resolve(); }
      return afterFirstFrame()
        .then(() => new Promise((done) => setTimeout(done, rows.loadAfterFirstFrameMs)))
        .then(() => Promise.all([load(), fetch(new URL(foe.measure, document.baseURI)).then((r) => { if (!r.ok) throw Error(`${foe.measure}: ${r.status}`); return r.json(); })]))
        .then(async ([c, row]) => { chunk = c; measure = row; physics = await c.createPhysics({ seed: rows.seed }); build(); })
        .catch((error: unknown) => { cost.state = `failed: ${error instanceof Error ? error.message : String(error)}`; throw error; });
    },
    get state() { return rd?.state ?? cost.state; },
    // scene.ts, every frame, after the opponent's rig has been posed by its clips (and before anything reads his bones):
    //   dt: the frame's presentation seconds (0 in a hit-stop); events: the sim's events this frame; finish: the sim's finish (null in play);
    //   finisher: the scene's pick for this kill (a cinematic finisher keeps its own clip: no ragdoll).
    frame(dt: number, events: readonly CombatEvent[], finish: { victim: number } | null, finisher: FinisherId | null) {
      if (!rd || !rig || !physics || !group) return;
      const start = performance.now();
      if (!finish && mode !== 'alive') build();   // the rematch: a fresh ragdoll, standing
      const killed = mode === 'alive' ? events.find((e) => e.type === 'Killed' && e.target === 1) : undefined;
      if (killed) {   // the killing blow: its own impulse, not the Hit's stagger as well
        if (rows.plainDeathOnly && finisher !== null && !isPlainDeath(finisher)) { mode = 'skip'; cost.state = 'finisher'; }
        else { rd.kill(blowImpulse(rows.kill, killed.location, killed.heading, group.rotation.y) ?? undefined); mode = 'dead'; stagger = -1; dying = 0; }
      } else if (mode === 'alive') for (const e of events) {
        if (e.type !== 'Hit' || e.target !== 1) continue;
        const hit = blowImpulse(rows.hit, e.location, e.heading, group.rotation.y);
        if (hit) rd.applyImpulse(hit.part, hit.impulse);
        stagger = 0;
      }
      if (mode === 'skip') { cost.lastMs = 0; return; }
      acc += dt;
      let ticks = 0;
      while (acc >= tick && ticks < rows.maxTicksPerFrame) {
        if (mode === 'alive') {
          rig.drive();
          const s = stagger >= 0 ? staggerStrengths(rows.hit, stagger) : null;
          rd.setMotorStrength(s ? { all: 1, ...s } : 1);
          if (stagger >= 0) stagger = s ? stagger + tick : -1;
        }
        if (rd.state !== 'frozen') physics.step(tick);
        acc -= tick; ticks++;
      }
      if (ticks === rows.maxTicksPerFrame) acc = 0;
      const trace = (globalThis as { __ragdollTrace?: Record<string, number>[] }).__ragdollTrace;   // a debugging harness may ask: how far the ragdoll is from the animation, per part (radians)
      if (trace && mode === 'alive') {
        const anim = Object.entries(partBones).map(([p, b]) => [p, b.getWorldQuaternion(new THREE.Quaternion()), b.quaternion.clone(), b.position.clone()] as const);
        rig.applyPose();
        trace.push(Object.fromEntries(anim.map(([p, q]) => [p, +q.angleTo(partBones[p]!.getWorldQuaternion(new THREE.Quaternion())).toFixed(3)])));
        for (const [p, , lq, lp] of anim) { partBones[p]!.quaternion.copy(lq); partBones[p]!.position.copy(lp); }
        group.updateWorldMatrix(true, true);
      }
      if (mode === 'dead') {
        // From the clip's pose into the ragdoll's over kill.blendInS (the ragdoll lags a fast clip while he fights: no pop on the killing frame)
        dying += dt;
        poseToward(rows.kill.blendInS > 0 ? Math.min(1, dying / rows.kill.blendInS) : 1);
      } else if (stagger >= 0 && rows.hit.blend > 0) poseToward(rows.hit.blend * staggerDepth(rows.hit, stagger));   // the stagger on screen, the most at the dip's deepest
      const ms = performance.now() - start, by = (cost.byMode[mode] ??= { frames: 0, totalMs: 0, maxMs: 0 });
      cost.frames++; cost.totalMs += ms; cost.maxMs = Math.max(cost.maxMs, ms); cost.lastMs = ms; cost.ticks += ticks; cost.state = rd.state;
      by.frames++; by.totalMs += ms; by.maxMs = Math.max(by.maxMs, ms);
    },
  };
}
