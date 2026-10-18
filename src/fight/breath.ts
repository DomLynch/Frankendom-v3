import * as THREE from 'three';
import { fxHas, fxNum } from './fx-rows.ts';

// A creature's fire breath (Dom 2026-10-16/17, the Test Zone's Giant Salamander). Presentation only: it reads the duel's AttackStarted of the creature's side and draws a stream
// out of its mouth toward the hero; nothing here reads input or touches the sim, a record or a number the fight uses. Which creatures breathe is a row (`breath.<opponent>` in
// fx-rows.json), and so are the reach, width, life, counts and colours (breath.*).
// Donor: World of Claudecraft (MIT, src/render/ignivar_fire_beams.ts), rewritten: flames are open cones carved into separate TONGUES by a fragment shader (sine waves along and around
// each cone), drawn with NORMAL blending in a dark-red ramp (tip dark red, body red, a hot orange core only near the mouth, no additive yellow), with additive embers beside them. Ours
// adds a staggered stream (each tongue is born later and further out), a dark smoke tail and embers that fly and fall.
const RANGE = fxNum('breath.range'), RADIUS = fxNum('breath.radius'), LIFE = fxNum('breath.life'), TONGUES = fxNum('breath.tongues'), SMOKE = fxNum('breath.smoke'), EMBERS = fxNum('breath.embers');
const TONGUE_OPACITY = fxNum('breath.tongue-opacity'), SMOKE_OPACITY = fxNum('breath.smoke-opacity');
const TIP = new THREE.Color(fxNum('breath.tip')), BODY = new THREE.Color(fxNum('breath.body')), CORE = new THREE.Color(fxNum('breath.core'));

export const breathes = (opponent: string): boolean => fxHas(`breath.${opponent}`);

const VERT = `
attribute float aLife; attribute float aSeed; varying vec2 vUv; varying float vLife; varying float vSeed;
void main() { vUv = uv; vLife = aLife; vSeed = aSeed; vec3 transformed = position;
#include <project_vertex>
gl_Position = projectionMatrix * mvPosition; }`;
const FRAG = `
uniform float uTime; uniform vec3 uTip; uniform vec3 uBody; uniform vec3 uCore; uniform float uOpacity; varying vec2 vUv; varying float vLife; varying float vSeed;
void main() {
  float along = vUv.y, ang = vUv.x * 6.2831853;
  float wave = sin(ang * 3.0 + along * 5.0 - uTime * 7.0 + vSeed * 6.0) * 0.46 + sin(ang * 5.0 - along * 9.0 + uTime * 4.3 + vSeed * 11.0) * 0.34 + sin(along * 13.0 - uTime * 9.0 + vSeed * 17.0) * 0.2;
  float tongue = smoothstep(-0.25, 0.7, wave);
  float body = smoothstep(0.0, 0.14, along) * (1.0 - smoothstep(0.5 + tongue * 0.3, 1.0, along));
  float heat = (1.0 - along) * (1.0 - vLife);
  vec3 col = mix(uTip, uBody, clamp(heat * 1.4, 0.0, 1.0));
  col = mix(col, uCore, smoothstep(0.62, 0.95, heat) * (0.4 + tongue * 0.6));
  float a = uOpacity * body * (0.3 + tongue * 0.7) * pow(1.0 - vLife, 1.3) * (0.75 + 0.25 * sin(uTime * 11.0 + vSeed * 20.0));
  gl_FragColor = vec4(col, a);
#include <colorspace_fragment>
}`;

let art: THREE.Texture | null | undefined;
function smokeArt(): THREE.Texture | null {
  if (art !== undefined) return art;
  if (typeof document === 'undefined') return (art = null);
  const size = 64, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return (art = null);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.4)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return (art = texture);
}

type Jet = {
  age: number; from: THREE.Vector3; dir: THREE.Vector3; group: THREE.Group;
  tongues: THREE.InstancedMesh; life: THREE.InstancedBufferAttribute; smoke: THREE.Sprite[]; embers: THREE.Points;
  t: { s0: number; delay: number; len: number; r0: number; yaw: number; pitch: number; side: number; lift: number }[];
  s: { delay: number; side: number; lift: number; size: number }[];
  e: { delay: number; v: THREE.Vector3; ttl: number }[];
};

/** Seeded per jet, so the same breath is drawn the same way every time it is started at the same tick. */
const rand = (seed: number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

export function createBreath(scene: THREE.Scene) {
  const live = new Map<string, Jet>(), uTime = { value: 0 };
  const cone = new THREE.CylinderGeometry(1, 0.22, 1, 7, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);   // along +z: narrow at the mouth, wide at the far end, one unit long
  const dummy = new THREE.Object3D(), qDir = new THREE.Quaternion(), qJit = new THREE.Euler(), Z = new THREE.Vector3(0, 0, 1), side = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const drop = (id: string) => {
    const j = live.get(id); if (!j) return;
    scene.remove(j.group); j.tongues.geometry.dispose(); (j.tongues.material as THREE.Material).dispose(); j.embers.geometry.dispose(); (j.embers.material as THREE.Material).dispose();
    for (const s of j.smoke) s.material.dispose();
    live.delete(id);
  };
  return {
    /** The creature `id` breathes from `from` (its mouth) along the line toward `to` (the hero's chest), from now. A breath already going is restarted. */
    start(id: string, from: THREE.Vector3, to: THREE.Vector3, seed: number): void {
      drop(id);
      const next = rand(seed), group = new THREE.Group(), dir = to.clone().sub(from).normalize();
      const geometry = cone.clone(), life = new THREE.InstancedBufferAttribute(new Float32Array(TONGUES), 1), seeds = new Float32Array(TONGUES);
      for (let k = 0; k < TONGUES; k++) seeds[k] = next();
      geometry.setAttribute('aLife', life); geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
      const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending, fog: false,
        uniforms: { uTime, uTip: { value: TIP }, uBody: { value: BODY }, uCore: { value: CORE }, uOpacity: { value: TONGUE_OPACITY } } });
      const tongues = new THREE.InstancedMesh(geometry, material, TONGUES); tongues.frustumCulled = false; tongues.renderOrder = 6;
      const t = Array.from({ length: TONGUES }, (_, k) => ({ s0: next() * 0.25 * RANGE, delay: (k / TONGUES) * 0.45 * LIFE, len: 1.4 + next() * 1.4, r0: 0.22 + next() * 0.2, yaw: (next() - 0.5) * 0.4, pitch: (next() - 0.5) * 0.3, side: next() * 2 - 1, lift: next() * 2 - 1 }));
      const smoke = Array.from({ length: SMOKE }, () => { const m = new THREE.SpriteMaterial({ map: smokeArt(), color: 0x2a211c, transparent: true, depthWrite: false, fog: false, opacity: 0 }); const sp = new THREE.Sprite(m); sp.visible = false; group.add(sp); return sp; });
      const s = Array.from({ length: SMOKE }, (_, k) => ({ delay: LIFE * (0.12 + (k / SMOKE) * 0.45), side: next() * 2 - 1, lift: next(), size: 0.5 + next() * 0.5 }));
      const eGeometry = new THREE.BufferGeometry(); eGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(EMBERS * 3).fill(-1000), 3));
      const embers = new THREE.Points(eGeometry, new THREE.PointsMaterial({ color: 0xff7a1e, size: 0.09, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false }));
      embers.frustumCulled = false;
      const e = Array.from({ length: EMBERS }, (_, k) => ({ delay: (k / EMBERS) * 0.5 * LIFE, v: new THREE.Vector3((next() - 0.5) * 1.6, 0.3 + next() * 1.2, (next() - 0.5) * 1.6), ttl: 0.7 + next() * 0.9 }));
      group.add(tongues, embers); scene.add(group);
      live.set(id, { age: 0, from: from.clone(), dir, group, tongues, life, smoke, embers, t, s, e });
    },
    /** Each frame: every tongue is born further out and later, grows and widens as it flies, cools from the hot core to dark red and fades; the smoke rises behind it and the embers fly and fall. */
    update(dt: number): void {
      uTime.value += dt;
      for (const [id, j] of live) {
        j.age += dt; qDir.setFromUnitVectors(Z, j.dir); side.crossVectors(j.dir, up).normalize();
        let alive = false;
        j.t.forEach((p, k) => {
          const u = (j.age - p.delay) / (LIFE * 0.55); j.life.setX(k, Math.min(1, Math.max(0, u)));
          if (u < 0) { alive = true; dummy.scale.setScalar(0); dummy.position.copy(j.from); dummy.updateMatrix(); j.tongues.setMatrixAt(k, dummy.matrix); return; }
          if (u > 1) { dummy.scale.setScalar(0); dummy.updateMatrix(); j.tongues.setMatrixAt(k, dummy.matrix); return; }
          alive = true;
          const r = p.r0 + RADIUS * 0.45 * u, z = p.s0 + RANGE * 0.6 * u, wobble = Math.sin((j.age + p.delay) * 4.5 + p.side * 9) * 0.12 * u;
          dummy.position.copy(j.from).addScaledVector(j.dir, z).addScaledVector(side, p.side * RADIUS * 0.35 * u + wobble).addScaledVector(up, p.lift * RADIUS * 0.2 * u + u * 0.3);
          dummy.quaternion.copy(qDir).multiply(new THREE.Quaternion().setFromEuler(qJit.set(p.pitch, p.yaw, 0)));
          dummy.scale.set(r, r, p.len * (0.6 + 0.8 * u)); dummy.updateMatrix(); j.tongues.setMatrixAt(k, dummy.matrix);
        });
        j.tongues.instanceMatrix.needsUpdate = true; j.life.needsUpdate = true;
        j.smoke.forEach((sp, k) => {
          const q = j.s[k]!, u = (j.age - q.delay) / (LIFE * 0.7), m = sp.material as THREE.SpriteMaterial;
          if (u < 0) { alive = true; sp.visible = false; return; }
          if (u > 1) { sp.visible = false; return; }
          alive = true; sp.visible = true;
          sp.position.copy(j.from).addScaledVector(j.dir, RANGE * (0.25 + 0.5 * u)).addScaledVector(side, q.side * RADIUS * 0.5 * u).addScaledVector(up, 0.3 + q.lift * 0.4 + u * 1.2);
          sp.scale.setScalar(q.size * (0.6 + 1.5 * u)); m.opacity = SMOKE_OPACITY * Math.sin(Math.PI * u);
        });
        const pos = j.embers.geometry.getAttribute('position') as THREE.BufferAttribute;
        j.e.forEach((q, k) => {
          const u = j.age - q.delay;
          if (u < 0) { alive = true; return; }
          if (u > q.ttl) { pos.setXYZ(k, 0, -1000, 0); return; }
          alive = true;
          const reach = (RANGE * 0.9 * u) / q.ttl;
          pos.setXYZ(k, j.from.x + j.dir.x * reach + q.v.x * u * 0.5, j.from.y + j.dir.y * reach + q.v.y * u - 1.6 * u * u, j.from.z + j.dir.z * reach + q.v.z * u * 0.5);
        });
        pos.needsUpdate = true;
        if (!alive) drop(id);
      }
    },
    active: () => live.size,
    clear(): void { for (const id of [...live.keys()]) drop(id); },
  };
}
