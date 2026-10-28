// Shadow Dash's look (presentation only, reads the state, writes nothing back). The tell: a flat orange line on the sand from him to the point he will run at (it follows you until it locks, then turns
// gold and holds), and a pad where he will stop. The dash: a pool of frozen, tinted copies of his own rig is stamped behind him every few ticks and fades. The copies are built once (SkeletonUtils clone of the
// live anchor, rebuilt only if the rig changes), then re-posed by copying local transforms: no allocation per frame. All numbers: data/mechanics.json "shadow-dash".fx.
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { DASH_ROW, type DashState } from './kachujin-shadow-dash.ts';
import type { MechFrame, MechFx } from './registry.ts';

type Ghost = { root: THREE.Object3D; src: THREE.Object3D[]; dst: THREE.Object3D[]; mats: THREE.Material[]; born: number };
const FX = DASH_ROW.fx;

export function createShadowDashFx(scene: THREE.Scene): MechFx {
  const base = new THREE.Color(FX.lineColor), lock = new THREE.Color(FX.lockColor), tint = new THREE.Color(FX.ghostTint), colour = new THREE.Color();
  const lineMat = new THREE.MeshBasicMaterial({ color: base, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), lineMat); line.rotation.x = -Math.PI / 2; line.rotation.order = 'YXZ'; line.renderOrder = 5; line.visible = false; scene.add(line);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(1, 32), lineMat); pad.rotation.x = -Math.PI / 2; pad.renderOrder = 5; pad.visible = false; scene.add(pad);
  let ghosts: Ghost[] = [], source: THREE.Object3D | null = null, next = 0, lastStamp = -1, lineAge = 0;
  const holder = new THREE.Group(); scene.add(holder);
  const build = (anchor: THREE.Object3D) => {
    for (const g of ghosts) { holder.remove(g.root); g.mats.forEach((m) => m.dispose()); }
    ghosts = []; source = anchor; anchor.updateWorldMatrix(true, true);
    for (let i = 0; i < FX.ghostCount; i++) {
      const root = cloneSkeleton(anchor), mats: THREE.Material[] = [], src: THREE.Object3D[] = [], dst: THREE.Object3D[] = [];
      root.traverse((o) => {
        if (o.name === 'WeaponTrail') o.visible = false;
        const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
        mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.userData.specialOwnGeometry = false;
        const own = (m: THREE.Material) => { const c = m.clone() as THREE.MeshStandardMaterial; c.transparent = true; c.depthWrite = false; c.opacity = 0; if (c.color) c.color.lerp(tint, 0.6); mats.push(c); return c; };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
      });
      const a: THREE.Object3D[] = [], b: THREE.Object3D[] = []; anchor.traverse((o) => a.push(o)); root.traverse((o) => b.push(o));
      for (let k = 0; k < Math.min(a.length, b.length); k++) { src.push(a[k]!); dst.push(b[k]!); }
      root.matrixAutoUpdate = false; root.visible = false; holder.add(root); ghosts.push({ root, src, dst, mats, born: -1e9 });
    }
  };
  const stamp = (g: Ghost, anchor: THREE.Object3D, tick: number) => {
    anchor.updateWorldMatrix(true, false);
    for (let k = 1; k < g.src.length; k++) { const s = g.src[k]!, d = g.dst[k]!; d.position.copy(s.position); d.quaternion.copy(s.quaternion); d.scale.copy(s.scale); }
    g.root.matrix.copy(anchor.matrixWorld); g.root.matrixWorldNeedsUpdate = true; g.root.updateMatrixWorld(true); g.born = tick; g.root.visible = true;
  };
  const hideLine = () => { line.visible = false; pad.visible = false; };
  return {
    update(_dt: number, state: unknown, f: MechFrame) {
      const s = state as DashState | null, anchor = f.anchor;
      if (!s || f.finished || s.phase === 'idle' && f.tick - s.endedAt > FX.lineFadeTicks) hideLine();
      if (s && !f.finished) {
        const tell = s.phase === 'tell', dash = s.phase === 'dash';
        let alpha = 0;
        if (tell || dash) { lineAge = 0; alpha = FX.lineOpacity * (s.locked ? 1 : 0.775 + 0.225 * Math.sin((f.tick / 60) * FX.pulseHz * Math.PI * 2)); }
        else if (s.phase !== 'idle' || f.tick - s.endedAt <= FX.lineFadeTicks) { lineAge++; alpha = FX.lineOpacity * Math.max(0, 1 - lineAge / FX.lineFadeTicks); }
        if (alpha > 0.01 && (tell || dash || s.phase !== 'idle')) {
          const fromX = s.locked ? s.fromX : f.boss.x, fromZ = s.locked ? s.fromZ : f.boss.z, toX = s.locked ? s.stopX : f.hero.x, toZ = s.locked ? s.stopZ : f.hero.z;
          const dx = toX - fromX, dz = toZ - fromZ, len = Math.hypot(dx, dz);
          line.position.set((fromX + toX) / 2, FX.lineY, (fromZ + toZ) / 2); line.rotation.set(-Math.PI / 2, Math.atan2(dx, dz) + Math.PI, 0);
          line.scale.set(FX.lineWidthM, Math.max(0.01, len), 1);
          pad.position.set(toX, FX.lineY, toZ); pad.scale.setScalar(FX.padRadiusM);
          colour.copy(base).lerp(lock, s.locked ? 1 : 0); lineMat.color.copy(colour); lineMat.opacity = alpha; line.visible = pad.visible = len > 0.05;
        } else hideLine();
      }
      if (anchor && s && s.phase === 'dash' && !f.finished) {
        if (source !== anchor || !ghosts.length) build(anchor);
        if (f.tick - lastStamp >= FX.ghostEveryTicks) { stamp(ghosts[next % ghosts.length]!, anchor, f.tick); next++; lastStamp = f.tick; }
      }
      for (const g of ghosts) {
        const age = f.tick - g.born, k = age >= 0 && age < FX.ghostLifeTicks && !f.finished ? 1 - age / FX.ghostLifeTicks : 0;
        g.root.visible = k > 0; for (const m of g.mats) m.opacity = FX.ghostOpacity * k;
      }
    },
  };
}
