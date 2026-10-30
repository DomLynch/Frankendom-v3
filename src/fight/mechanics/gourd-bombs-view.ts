// The drawing of Lord Gourd's pumpkin bombs (presentation only; reads the core's typed arrays, writes nothing back). No art, no texture: flat coloured rings and discs on the ground and a small sphere for the gourd in the air, a pool of
// meshes made once (the pool size is the row's), a frame only moves, scales and fades them. TELL: a pulse ring spreads from his feet during the stomp. MARK: the target ring is on the ground from the moment the gourd leaves his hand, faint
// in the air, bright once it lands, its fill growing and its colour blinking faster to the burst. BURST: the ring flares outward and fades. All colours, widths and times are the row's `look`.
import * as THREE from 'three';
import type { GourdRow } from './gourd-bombs.ts';

/** The core's live arrays (never copied): slot i is free (0), in flight (1), fused (2) or bursting (3); `age` seconds in that state; (x, z) where it lands, (fromX, fromZ) his hand; stomp 0..1 while he stomps, else -1. */
export type BombView = { n: number; state: Uint8Array; age: Float32Array; x: Float32Array; z: Float32Array; fromX: Float32Array; fromZ: Float32Array; stomp: number; stompX: number; stompZ: number };
type Slot = { ring: THREE.Mesh; fill: THREE.Mesh; gourd: THREE.Mesh; ringMat: THREE.MeshBasicMaterial; fillMat: THREE.MeshBasicMaterial };

const FLIGHT = 1, FUSE = 2, BURST = 3;   // the core's BOMB states (gourd-bombs.ts), repeated here so this file does not import the core it is imported by

export function createGourdBombsView(v: BombView, row: GourdRow) {
  const L = row.look, group = new THREE.Group(); group.name = 'gourd bombs';
  const inner = 1 - L.ringWidth / row.radiusMetres;   // the ring's thickness is metres, the geometry is the unit circle
  const ringGeo = new THREE.RingGeometry(Math.max(0, inner), 1, L.segments).rotateX(-Math.PI / 2);
  const fillGeo = new THREE.CircleGeometry(1, L.segments).rotateX(-Math.PI / 2);
  const gourdGeo = new THREE.SphereGeometry(L.gourdRadiusMetres, 10, 8);
  const gourdMat = new THREE.MeshBasicMaterial({ color: L.gourd });
  const mk = (color: string, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const slots: Slot[] = [];
  for (let i = 0; i < v.n; i++) {
    const ringMat = mk(L.edge, 0), fillMat = mk(L.core, 0), ring = new THREE.Mesh(ringGeo, ringMat), fill = new THREE.Mesh(fillGeo, fillMat), gourd = new THREE.Mesh(gourdGeo, gourdMat);
    for (const m of [ring, fill, gourd]) { m.visible = false; m.frustumCulled = false; group.add(m); }
    ring.renderOrder = 3; fill.renderOrder = 2;
    slots.push({ ring, fill, gourd, ringMat, fillMat });
  }
  const stompMat = mk(L.stompColour, 0), stomp = new THREE.Mesh(ringGeo, stompMat); stomp.visible = false; stomp.frustumCulled = false; stomp.renderOrder = 3; group.add(stomp);
  const edge = new THREE.Color(L.edge), fuse = new THREE.Color(L.fuse), core = new THREE.Color(L.core);   // made once: a frame allocates nothing
  let clock = 0;

  return {
    group,
    update(dt: number): void {
      clock += dt;
      for (let i = 0; i < v.n; i++) {
        const s = slots[i]!, st = v.state[i]!;
        if (st === 0) { s.ring.visible = s.fill.visible = s.gourd.visible = false; continue; }
        const age = v.age[i]!, x = v.x[i]!, z = v.z[i]!;
        if (st === FLIGHT) {   // in the air: the mark is faint, the gourd arcs from his hand to it
          const t = Math.min(1, age / row.flightSeconds), arc = row.arcMetres * 4 * t * (1 - t);
          s.gourd.visible = true; s.gourd.position.set(v.fromX[i]! + (x - v.fromX[i]!) * t, row.launchHeightMetres * (1 - t) + L.gourdRadiusMetres * t + arc, v.fromZ[i]! + (z - v.fromZ[i]!) * t);
          s.ring.visible = true; s.fill.visible = false; s.ring.position.set(x, L.groundY, z); s.ring.scale.setScalar(row.radiusMetres);
          s.ringMat.color.copy(edge); s.ringMat.opacity = L.markAlpha * t;
        } else if (st === FUSE) {   // landed: the ring is bright, the fill grows to the edge as the fuse burns, the blink quickens
          const t = Math.min(1, age / row.fuseSeconds), blink = 0.5 + 0.5 * Math.sin(clock * L.pulseHz * Math.PI * (1 + 3 * t));
          s.gourd.visible = true; s.gourd.position.set(x, L.gourdRadiusMetres * (1 - t), z); s.gourd.scale.setScalar(1 - t * 0.6);
          s.ring.visible = s.fill.visible = true; s.ring.position.set(x, L.groundY, z); s.fill.position.set(x, L.groundY - 0.005, z);
          s.ring.scale.setScalar(row.radiusMetres); s.fill.scale.setScalar(Math.max(0.01, row.radiusMetres * t));
          s.ringMat.color.copy(edge).lerp(fuse, blink * t); s.ringMat.opacity = L.alpha;
          s.fillMat.color.copy(core).lerp(fuse, t); s.fillMat.opacity = L.alpha * 0.55 * t;
        } else if (st === BURST) {   // the flare: ring and fill sweep outward and fade
          const t = Math.min(1, age / row.burstSeconds), k = 1 + (L.burstScale - 1) * t;
          s.gourd.visible = false; s.gourd.scale.setScalar(1);
          s.ring.visible = s.fill.visible = true; s.ring.position.set(x, L.groundY, z); s.fill.position.set(x, L.groundY - 0.005, z);
          s.ring.scale.setScalar(row.radiusMetres * k); s.fill.scale.setScalar(row.radiusMetres * k);
          s.ringMat.color.copy(fuse); s.ringMat.opacity = L.alpha * (1 - t); s.fillMat.color.copy(fuse); s.fillMat.opacity = L.alpha * 0.7 * (1 - t);
        }
      }
      if (v.stomp >= 0) {   // the tell: a pulse ring spreads from his feet and thins
        stomp.visible = true; stomp.position.set(v.stompX, L.groundY + 0.01, v.stompZ); stomp.scale.setScalar(row.radiusMetres * (0.4 + 1.6 * v.stomp)); stompMat.opacity = L.stompAlpha * (1 - v.stomp * 0.5);
      } else stomp.visible = false;
    },
  };
}
