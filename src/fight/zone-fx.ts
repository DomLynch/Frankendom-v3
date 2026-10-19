// The zones' use of the engine's contact effects (K5/K6 P2): one createFightFx instance per active pair, fed that pair's Pit events (world-combat.ts takeContacts), with the camera-kick
// hints going to the zone's walk camera. No zone id and no per-zone code: every zone page that mounts the open-world loop calls this the same way. Presentation only.
import * as THREE from 'three';
import { OPPONENTS, type OpponentId } from './moves.ts';
import type { Shove } from './camera-kick.ts';
import type { CombatEvent } from './combat.ts';
import { createFightFx, impactTexture, type CameraKick, type ContactCtx, type FxRig } from './fx.ts';
import type { PairContacts } from './world-combat.ts';
import FEEL_RULES from './feel-rules.json' with { type: 'json' };
import { fireBreathes, createFireBreath } from './fire-breath.ts';
import { OPPONENT_SIDE } from './signature.ts';
import { createSkillImpact, impactPoint } from './skill-impact.ts';
import { createSpecialShards } from './special-shards.ts';
import { shardCapacity } from './special-shards-rows.ts';
import { shardRows, specialShardsOf } from './sandbox-rules.ts';
import { specialRequestOf } from './special-request.ts';
import { countSpecial } from './special-counter.ts';

/** The hint sink for a walk camera that is placed afresh every frame (camera.position set, then lookAt): draw() adds the settling shove and tumble on top, and the next placement drops them. */
export function createWalkKick(camera: THREE.Camera): CameraKick & { draw(dt: number): void } {
  let kick = 0, hold = 0, rate = 1 / 0.15, tiltAngle = 0, tiltFor = 0, tiltAge = 0, swayRight = 0, swayDrop = 0;
  const offset = new THREE.Vector3(), axis = new THREE.Vector3();
  return {
    shove(heading: number, s: Shove) {
      offset.set(Math.sin(heading) * s.along + Math.cos(heading) * s.side, -s.drop, Math.cos(heading) * s.along - Math.sin(heading) * s.side);
      if (s.screen) offset.addScaledVector(axis.setFromMatrixColumn(camera.matrixWorld, 0), s.screen);
      if (s.push) offset.addScaledVector(axis.setFromMatrixColumn(camera.matrixWorld, 2), -s.push);
      kick = 1; hold = s.hold; rate = 1 / s.settle;
    },
    tilt(angle: number, seconds: number, right = 0, drop = 0) { tiltAngle = angle; tiltFor = seconds; tiltAge = 0; swayRight = right; swayDrop = drop; },
    draw(dt: number) {
      const swing = tiltAge < tiltFor ? Math.sin(Math.PI * (tiltAge / tiltFor)) : 0;
      if (swing) camera.rotateZ(tiltAngle * swing);
      if (kick > 0) camera.position.addScaledVector(offset, kick);
      if (swing && (swayRight || swayDrop)) { axis.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(swayRight * swing); axis.y -= swayDrop * swing; camera.position.add(axis); }
      if (tiltAge < tiltFor) tiltAge += dt;
      if (kick > 0) { if (hold > 0) hold -= dt; else kick = Math.max(0, kick - dt * rate); }
    },
  };
}

const IDLE_S = FEEL_RULES.zoneFxRule[0]!.idleS;   // a pair's effects stay (a corpse keeps its pool) this long after its last contact, then the instance is cleared and goes back to the pool

/** The host's rigs: the hero's actor and a creature's by id (null while there is none: the wound marks and blade blood then wait). */
export type ZoneRigs = { hero(): FxRig | null; foe(id: string): FxRig | null };

export function createZoneFx(host: { scene: THREE.Scene; camera: THREE.Camera; rigs?: ZoneRigs }) {
  const dropTexture = impactTexture(false), splatTexture = impactTexture(true), kick = createWalkKick(host.camera), right = new THREE.Vector3(), breath = createFireBreath(host.scene);
  type Slot = { fx: ReturnType<typeof createFightFx>; idle: number; struck?: [number, number]; victim?: number };
  // The melee specials' look, the same two pieces the Pit's scene.ts draws (Dom 2026-10-19, "specials must look like specials in Zone 1"): the skill-impact flash and sparks in the move's colour, and the sandbox's shard chips
  // when its rows exist (none on trunk = nothing built). One of each for the page, not per pair: a hit is a frame's event. Read from the same Pit events the pair's contacts carry.
  const skillImpact = createSkillImpact(host.scene), shards = shardRows() ? createSpecialShards(host.scene, shardCapacity()) : null, shardAt = new THREE.Vector3();
  const live = new Map<string, Slot>(), free: Slot[] = [];
  const newSlot = (): Slot => ({ fx: createFightFx({ scene: host.scene, dropTexture, splatTexture }), idle: 0 });
  free.push(newSlot());   // the first pair's effects exist before any contact, so the zone's warm-up (planUpload) sees their materials and links their programs before [zone ready], not at the first hit
  const slotFor = (foe: string): Slot => {
    let s = live.get(foe);
    if (!s) { s = free.pop() ?? newSlot(); live.set(foe, s); }
    return s;
  };
  function ctxOf(c: PairContacts, dt: number): ContactCtx {
    const { events } = c, hero = host.rigs?.hero(), foe = host.rigs?.foe(c.foe), blow = events.find((e: CombatEvent) => e.type === 'Hit' || e.type === 'GuardBroken');
    const at = (b: { x: number; z: number; facing: number }) => ({ x: b.x, z: b.z, heading: b.facing, distance: 0 });
    return {
      events, dt, blow, contact: blow || events.some((e) => e.type === 'Blocked' || e.type === 'Parried'), killed: events.find((e) => e.type === 'Killed'),
      practice: { duel: c.duel, enemy: at(c.foeAt), enemyWoundSite: blow?.location ?? 'torso', woundSite: blow?.location ?? 'torso', health: c.foeAt.health, playerHealth: c.duel.fighters[0].health },
      state: at(c.hero), finisher: c.finisher ?? null, detailedBlood: false, camera: host.camera, kick, blockHeavy: [false, false], warriors: hero && foe ? { player: hero, opponent: foe } : undefined,
      dustFeet: [], dustPositions: [], footDust: null, flinches: null, burstPool: null, feel: undefined, right,
      opponentId: c.kind as OpponentId, bloodMode: 'red', DIP_FRAMES: 0, setDip: () => {},
    };
  }
  return {
    /** Once a frame, after the loop stepped: the frame's contacts of every active pair, then the walk camera's kick on top of the placed camera. */
    frame(pairs: PairContacts[], dt: number): void {
      for (const c of pairs) {   // a creature with a `breath.<kind>` row breathes fire at the hero whenever its attack starts (fire-breath.ts: presentation only, reads the events, writes nothing)
        if (!fireBreathes(c.kind) || !c.events.some((e) => e.type === 'AttackStarted' && e.actor === OPPONENT_SIDE && e.move !== 'kick')) continue;
        const foe = host.rigs?.foe(c.foe), hero = host.rigs?.hero(), mouth = foe?.boneWorld('Head') ?? foe?.boneWorld('head') ?? foe?.anchor.getWorldPosition(new THREE.Vector3()).setY(1) ?? new THREE.Vector3(c.foeAt.x, 1, c.foeAt.z);
        const chest = hero?.boneWorld('Head') ?? new THREE.Vector3(c.hero.x, 1.4, c.hero.z);
        breath.start(c.foe, mouth, chest.clone().setY(chest.y - 0.3), c.events[0]!.tick);
      }
      breath.update(dt);
      for (const c of pairs) { if (!(c.kind in OPPONENTS)) continue; const s = slotFor(c.foe); s.idle = 0; s.fx.onContact(ctxOf(c, dt)); const hit = c.events.find((e) => e.type === 'Hit'); if (hit) { s.victim = hit.target; s.struck = hit.target === 1 ? [c.foeAt.x, c.foeAt.z] : [c.hero.x, c.hero.z]; } else s.victim = undefined; }
      for (const [foe, s] of live) {
        s.fx.update(dt);
        if ((s.idle += dt) > IDLE_S) { s.fx.splats.clear(true); s.fx.bodyWounds.clear(); live.delete(foe); free.push(s); }
      }
      for (const c of pairs) {   // a melee special's look: the hero's SPECIAL 1 (SpecialLanded) and the other slot (a Hit on a skill_ move) both land as one request (special-request.ts)
        const bodies = [{ body: c.hero }, { body: c.foeAt }] as never, scale = [1, OPPONENTS[c.kind as OpponentId]?.scale ?? 1];
        countSpecial('fx', skillImpact.fire(c.events, bodies, scale));
        if (shards) for (const e of c.events) {
          const request = specialRequestOf(e), rows = request?.phase === 'land' ? specialShardsOf(request.skill) : [];
          if (!rows.length) continue;
          impactPoint(e, bodies, scale, shardAt); const by = c.hero, to = c.foeAt;
          for (const row of rows) countSpecial('fx', shards.burst(row, shardAt.x, shardAt.y, shardAt.z, to.x - by.x, to.z - by.z));
        }
      }
      skillImpact.update(dt); shards?.update(dt);
      kick.draw(dt);
    },
    /** Instances in use, for the browser checks. */
    active: () => live.size,
    /** Fire breaths in flight, for the browser checks. */
    breaths: () => breath.active(),
    /** Where each pair's contact sparks are and whether they are showing (world metres): the browser check compares them with the struck creature. */
    probe: () => [...live].map(([foe, s]) => ({ foe, visible: s.fx.sparks.visible, at: s.fx.sparks.position.toArray(), struck: s.struck, victim: s.victim })),
  };
}
