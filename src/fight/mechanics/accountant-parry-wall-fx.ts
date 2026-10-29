// The Accountant's parry wall, DRAWN (presentation only: reads the sim's mech state, writes nothing). Canvas and particles, no art file: a ring of gold on the sand at his feet from the first tick of the
// tell (the feet are planted), a translucent ledger wall that rises in front of him through the tell and stands through the window (ruled lines drawn once on a small canvas), and a burst of sparks on
// the wall for each parry (the sim's Parried event with `wall`). Every size, colour and count is a row (data/mechanics.json fx). One group and one spark pool for the page, built once: nothing is
// allocated per frame.
import * as THREE from 'three';
import type { Fighter } from '../duel.ts';
import type { CombatEvent, Practice } from '../combat.ts';
import { ROW, configure, riseOf, stageOf, type AccountantRow } from './accountant-parry-wall.ts';
import type { MechanicRuntime } from './runtime.ts';

/** The registry's line (index.ts): the page's handle on the wall. The wall's rules live in the duel (sim-hooks.ts, called from stepDuel) and its picture in scene.ts (createWallFx), so the runtime lays the row in (idempotent: main.ts already did, before the scene was built) and otherwise does nothing per tick. */
export function createAccountantRuntime(row: AccountantRow): MechanicRuntime {
  configure(row);
  return { boss: row.boss, group: null, core: null, ctx: null, reset(): void {}, tick: (practice: Practice): Practice => practice, frame(): void {} };
}

const LEDGER_LINES = 6, TEX_PX = 64;   // the ruled lines on the wall: a handful, so it reads as a ledger page at 375 wide

function ledgerTexture(FX: AccountantRow['fx']): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = TEX_PX;
  const g = c.getContext('2d'); if (!g) return null;
  g.fillStyle = FX.colour; g.fillRect(0, 0, TEX_PX, TEX_PX);
  g.fillStyle = FX.edgeColour;
  for (let i = 1; i <= LEDGER_LINES; i++) g.fillRect(0, Math.round((i * TEX_PX) / (LEDGER_LINES + 1)) - 1, TEX_PX, 2);
  g.fillRect(Math.round(TEX_PX * 0.2) - 1, 0, 2, TEX_PX);   // the ledger's margin rule
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const NOOP = { update(_boss: Fighter | null, _at: THREE.Vector3 | null, _heading: number, _events: readonly CombatEvent[], _tick: number, _dt: number): void {}, hide(): void {}, dispose(): void {} };
export function createWallFx(scene: THREE.Scene): typeof NOOP {
  if (!ROW.fx) return NOOP;   // mechanics not configured (a page or test that never called configureMechanics): nothing to draw
  const FX = ROW.fx, POOL = FX.sparkCount * 4;   // the configured row (configureMechanics ran before the page built its effects); up to four parries' sparks alive at once
  const root = new THREE.Group(); root.visible = false; root.renderOrder = 6;
  const tex = ledgerTexture(FX);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: FX.colour, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(FX.wallWidthM, FX.wallHeightM), new THREE.MeshBasicMaterial({ color: tex ? 0xffffff : FX.colour, ...(tex ? { map: tex } : {}), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(wall.geometry), new THREE.LineBasicMaterial({ color: FX.edgeColour, transparent: true, opacity: 0 }));
  ring.renderOrder = wall.renderOrder = frame.renderOrder = 6;
  root.add(ring, wall, frame); scene.add(root);
  // the spark pool: fixed arrays, a spark is a slot (age >= life = free)
  const pos = new Float32Array(POOL * 3), vel = new Float32Array(POOL * 3), age = new Float32Array(POOL).fill(Infinity);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const sparks = new THREE.Points(geo, new THREE.PointsMaterial({ color: FX.edgeColour, size: FX.sparkSizeM, sizeAttenuation: true, transparent: true, depthWrite: false }));
  sparks.frustumCulled = false; sparks.renderOrder = 7; scene.add(sparks);
  let cursor = 0, lastTick = -1;
  const burst = (x: number, y: number, z: number, dx: number, dz: number): void => {   // the wall's face is perpendicular to (dx, dz): sparks fly back off it and up, spread by the slot index (no random: a replay draws the same)
    for (let k = 0; k < FX.sparkCount; k++) {
      const i = cursor; cursor = (cursor + 1) % POOL;
      const t = (k / FX.sparkCount) * Math.PI * 2, s = FX.sparkSpeedMps;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      vel[i * 3] = dx * s * 0.6 + Math.cos(t) * dz * s * 0.5; vel[i * 3 + 1] = Math.sin(t) * s * 0.6 + s * 0.3; vel[i * 3 + 2] = dz * s * 0.6 - Math.cos(t) * dx * s * 0.5;
      age[i] = 0;
    }
  };
  return {
    /** Once a frame per pair: `boss` the foe's fighter, `at` its feet in world metres (or null while its rig is not there), `heading` its sim heading, `events` the tick's events, `tick` the sim tick, `dt` seconds. */
    update(boss: Fighter | null, at: THREE.Vector3 | null, heading: number, events: readonly CombatEvent[], tick: number, dt: number): void {
      const stage = at && boss ? stageOf(boss) : 'none';
      root.visible = stage !== 'none';
      if (at && boss && stage !== 'none') {
        const dx = Math.sin(heading), dz = Math.cos(heading), rise = riseOf(boss), up = stage === 'up';
        const pulse = up ? 1 : 0.6 + 0.4 * Math.sin(tick * (Math.PI * 2 * FX.ringPulseHz) / 60);
        root.position.set(at.x, at.y, at.z);
        ring.position.y = 0.03; ring.scale.setScalar(FX.ringRadiusM); (ring.material as THREE.MeshBasicMaterial).opacity = Math.min(1, FX.tellOpacity * 2.5 + (up ? 0.25 : 0)) * pulse;
        wall.position.set(dx * FX.wallDistanceM, (FX.wallHeightM * rise) / 2, dz * FX.wallDistanceM); wall.rotation.y = heading; wall.scale.set(1, Math.max(0.01, rise), 1);
        frame.position.copy(wall.position); frame.rotation.y = heading; frame.scale.copy(wall.scale);
        (wall.material as THREE.MeshBasicMaterial).opacity = up ? FX.wallOpacity : FX.tellOpacity + (FX.wallOpacity - FX.tellOpacity) * rise * 0.5;
        (frame.material as THREE.LineBasicMaterial).opacity = up ? 1 : rise;
      }
      if (at && boss && tick !== lastTick) {   // a parry's spark: once per tick, at the wall's face, thrown back toward the attacker (also on the parry that drops the wall: the stage is already none)
        lastTick = tick;
        const dx = Math.sin(heading), dz = Math.cos(heading);
        for (let k = 0; k < events.length; k++) { const e = events[k]!; if (e.type === 'Parried' && e.wall) burst(at.x + dx * FX.wallDistanceM, at.y + FX.wallHeightM * 0.5, at.z + dz * FX.wallDistanceM, dx, dz); }
      }
      for (let i = 0; i < POOL; i++) {   // the sparks fly and fade whatever the stage (a break leaves its last sparks to finish)
        if (!(age[i]! < FX.sparkLifeS)) { pos[i * 3 + 1] = -100; continue; }
        age[i]! += dt; pos[i * 3] += vel[i * 3]! * dt; pos[i * 3 + 1] += vel[i * 3 + 1]! * dt; pos[i * 3 + 2] += vel[i * 3 + 2]! * dt; vel[i * 3 + 1] -= FX.sparkGravityMps2 * dt;
      }
      geo.attributes.position!.needsUpdate = true;
    },
    hide(): void { root.visible = false; },
    dispose(): void { root.removeFromParent(); sparks.removeFromParent(); geo.dispose(); tex?.dispose(); for (const m of [ring, wall]) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } frame.geometry.dispose(); (frame.material as THREE.Material).dispose(); (sparks.material as THREE.Material).dispose(); },
  };
}
