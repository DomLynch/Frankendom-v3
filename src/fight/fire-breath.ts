import * as THREE from 'three';
import { fxHas, fxNum } from './fx-rows.ts';
import { makeRng } from './blood-style.ts';

// A creature's fire breath (Dom 2026-10-16/17, the Test Zone's Giant Salamander). Presentation only: it reads the duel's AttackStarted of the creature's side and draws a stream
// out of its mouth toward the hero; nothing here reads input or touches the sim, a record or a number the fight uses. Which creatures breathe is a row (`breath.<opponent>` in
// fx-rows.json), and so are the reach, width, life, counts and colours (breath.*).
// Donor: World of Claudecraft (MIT, src/render/ignivar_fire_beams.ts), rewritten: flames are open cones carved into separate TONGUES by a fragment shader (sine waves along and around
// each cone), drawn with NORMAL blending in a dark-red ramp (tip dark red, body red, a hot orange core only near the mouth, no additive yellow), with additive embers beside them. Ours
// adds a staggered stream (each tongue is born later and further out), a dark smoke tail and embers that fly and fall.
const RANGE = fxNum('breath.range'), RADIUS = fxNum('breath.radius'), LIFE = fxNum('breath.life'), TONGUES = fxNum('breath.tongues'), SMOKE = fxNum('breath.smoke'), EMBERS = fxNum('breath.embers');
const TONGUE_OPACITY = fxNum('breath.tongue-opacity'), SMOKE_OPACITY = fxNum('breath.smoke-opacity');
const TIP = new THREE.Color(fxNum('breath.tip')), BODY = new THREE.Color(fxNum('breath.body')), CORE = new THREE.Color(fxNum('breath.core'));

// Every other tuning number of the stream is a row too (fx-rows.json `breath.*`), read once here: tongue / smoke / ember timing, reach, spread and size, and the cone's shape.
const row = (name: string): number => fxNum(`breath.${name}`);
const K = {
  tongueLife: row('tongue-life'), tongueStagger: row('tongue-stagger'), tongueStart: row('tongue-start'), tongueLenMin: row('tongue-len-min'), tongueLenSpread: row('tongue-len-spread'), tongueR0Min: row('tongue-r0-min'), tongueR0Spread: row('tongue-r0-spread'),
  tongueYawHalf: row('tongue-yaw-half'), tonguePitchHalf: row('tongue-pitch-half'), tongueWobblePhase: row('tongue-wobble-phase'), tongueWiden: row('tongue-widen'), tongueReach: row('tongue-reach'), tongueSide: row('tongue-side'), tongueLift: row('tongue-lift'), tongueRise: row('tongue-rise'), tongueWobble: row('tongue-wobble'),
  tongueWobbleHz: row('tongue-wobble-hz'), tongueGrowMin: row('tongue-grow-min'), tongueGrowSpread: row('tongue-grow-spread'),
  smokeLife: row('smoke-life'), smokeStart: row('smoke-start'), smokeStagger: row('smoke-stagger'), smokeReachMin: row('smoke-reach-min'), smokeReachSpread: row('smoke-reach-spread'), smokeSide: row('smoke-side'), smokeBaseRise: row('smoke-base-rise'),
  smokeLift: row('smoke-lift'), smokeRiseTime: row('smoke-rise-time'), smokeSizeMin: row('smoke-size-min'), smokeSizeSpread: row('smoke-size-spread'), smokeGrowMin: row('smoke-grow-min'), smokeGrowSpread: row('smoke-grow-spread'), smokeColor: row('smoke-color'),
  emberStagger: row('ember-stagger'), emberSpreadHalf: row('ember-spread-half'), emberHideY: row('ember-hide-y'),emberUpMin: row('ember-up-min'), emberUpSpread: row('ember-up-spread'), emberTtlMin: row('ember-ttl-min'), emberTtlSpread: row('ember-ttl-spread'), emberReach: row('ember-reach'),
  emberDrift: row('ember-drift'), emberGravity: row('ember-gravity'), emberSize: row('ember-size'), emberOpacity: row('ember-opacity'), emberColor: row('ember-color'), coneNarrow: row('cone-narrow'), coneSides: row('cone-sides'), coneLength: row('cone-length'), smokeArtMid: row('smoke-art-mid'),
} as const;
const QUARTER_TURN = Math.PI / 2;
/** A unit draw spread over -1..1 (the rows above are the half-swings, so a row of 0.2 is the old +-0.2 of a 0.4 span). */
const centered = (rng: () => number): number => rng() * 2 - 1;

export const fireBreathes =(opponent: string): boolean => fxHas(`breath.${opponent}`);

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
  grad.addColorStop(0, 'rgba(255,255,255,0.9)'); grad.addColorStop(K.smokeArtMid,'rgba(255,255,255,0.4)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
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

// Seeded per jet (the repo's makeRng), so the same breath is drawn the same way every time it is started at the same tick.

export function createFireBreath(scene: THREE.Scene) {
  const live = new Map<string, Jet>(), uTime = { value: 0 };
  const length = K.coneLength, cone = new THREE.CylinderGeometry(1, K.coneNarrow, length, K.coneSides, 1, true).rotateX(QUARTER_TURN).translate(0, 0, length / 2);   // along +z: narrow at the mouth, wide at the far end, one unit long
  const dummy = new THREE.Object3D(), qDir = new THREE.Quaternion(), qTongue = new THREE.Quaternion(), qJit = new THREE.Euler(), Z = new THREE.Vector3(0, 0, 1), side = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
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
      const rng = makeRng(seed), group = new THREE.Group(), dir = to.clone().sub(from).normalize();
      const geometry = cone.clone(), life = new THREE.InstancedBufferAttribute(new Float32Array(TONGUES), 1), seeds = new Float32Array(TONGUES);
      for (let k = 0; k < TONGUES; k++) seeds[k] = rng();
      geometry.setAttribute('aLife', life); geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
      const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending, fog: false,
        uniforms: { uTime, uTip: { value: TIP }, uBody: { value: BODY }, uCore: { value: CORE }, uOpacity: { value: TONGUE_OPACITY } } });
      const tongues = new THREE.InstancedMesh(geometry, material, TONGUES); tongues.frustumCulled = false; tongues.renderOrder = 6;
      const t = Array.from({ length: TONGUES }, (_, k) => ({ s0: rng() * K.tongueStart * RANGE, delay: (k / TONGUES) * K.tongueStagger * LIFE, len: K.tongueLenMin + rng() * K.tongueLenSpread, r0: K.tongueR0Min + rng() * K.tongueR0Spread, yaw: centered(rng) * K.tongueYawHalf, pitch: centered(rng) * K.tonguePitchHalf, side: centered(rng), lift: centered(rng) }));
      const smoke = Array.from({ length: SMOKE }, () => { const m = new THREE.SpriteMaterial({ map: smokeArt(), color: K.smokeColor, transparent: true, depthWrite: false, fog: false, opacity: 0 }); const sp = new THREE.Sprite(m); sp.visible = false; group.add(sp); return sp; });
      const s = Array.from({ length: SMOKE }, (_, k) => ({ delay: LIFE * (K.smokeStart + (k / SMOKE) * K.smokeStagger), side: centered(rng), lift: rng(), size: K.smokeSizeMin + rng() * K.smokeSizeSpread }));
      const eGeometry = new THREE.BufferGeometry(); eGeometry.setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: EMBERS }, () => [0, K.emberHideY, 0]).flat(), 3));
      const embers = new THREE.Points(eGeometry, new THREE.PointsMaterial({ color: K.emberColor, size: K.emberSize, transparent: true, opacity: K.emberOpacity, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false }));
      embers.frustumCulled = false;
      const e = Array.from({ length: EMBERS }, (_, k) => ({ delay: (k / EMBERS) * K.emberStagger * LIFE, v: new THREE.Vector3(centered(rng) * K.emberSpreadHalf, K.emberUpMin + rng() * K.emberUpSpread, centered(rng) * K.emberSpreadHalf), ttl: K.emberTtlMin + rng() * K.emberTtlSpread }));
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
          const u = (j.age - p.delay) / (LIFE * K.tongueLife); j.life.setX(k, Math.min(1, Math.max(0, u)));
          if (u < 0) { alive = true; dummy.scale.setScalar(0); dummy.position.copy(j.from); dummy.updateMatrix(); j.tongues.setMatrixAt(k, dummy.matrix); return; }
          if (u > 1) { dummy.scale.setScalar(0); dummy.updateMatrix(); j.tongues.setMatrixAt(k, dummy.matrix); return; }
          alive = true;
          const r = p.r0 + RADIUS * K.tongueWiden * u, z = p.s0 + RANGE * K.tongueReach * u, wobble = Math.sin((j.age + p.delay) * K.tongueWobbleHz + p.side * K.tongueWobblePhase) * K.tongueWobble * u;
          dummy.position.copy(j.from).addScaledVector(j.dir, z).addScaledVector(side, p.side * RADIUS * K.tongueSide * u + wobble).addScaledVector(up, p.lift * RADIUS * K.tongueLift * u + u * K.tongueRise);
          dummy.quaternion.copy(qDir).multiply(qTongue.setFromEuler(qJit.set(p.pitch, p.yaw, 0)));   // qTongue is kept: no allocation per tongue per frame
          dummy.scale.set(r, r, p.len * (K.tongueGrowMin + K.tongueGrowSpread * u)); dummy.updateMatrix(); j.tongues.setMatrixAt(k, dummy.matrix);
        });
        j.tongues.instanceMatrix.needsUpdate = true; j.life.needsUpdate = true;
        j.smoke.forEach((sp, k) => {
          const q = j.s[k]!, u = (j.age - q.delay) / (LIFE * K.smokeLife), m = sp.material as THREE.SpriteMaterial;
          if (u < 0) { alive = true; sp.visible = false; return; }
          if (u > 1) { sp.visible = false; return; }
          alive = true; sp.visible = true;
          sp.position.copy(j.from).addScaledVector(j.dir, RANGE * (K.smokeReachMin + K.smokeReachSpread * u)).addScaledVector(side, q.side * RADIUS * K.smokeSide * u).addScaledVector(up, K.smokeBaseRise + q.lift * K.smokeLift + u * K.smokeRiseTime);
          sp.scale.setScalar(q.size * (K.smokeGrowMin + K.smokeGrowSpread * u)); m.opacity = SMOKE_OPACITY * Math.sin(Math.PI * u);
        });
        const pos = j.embers.geometry.getAttribute('position') as THREE.BufferAttribute;
        j.e.forEach((q, k) => {
          const u = j.age - q.delay;
          if (u < 0) { alive = true; return; }
          if (u > q.ttl) { pos.setXYZ(k, 0, K.emberHideY, 0); return; }
          alive = true;
          const reach = (RANGE * K.emberReach * u) / q.ttl;
          pos.setXYZ(k, j.from.x + j.dir.x * reach + q.v.x * u * K.emberDrift, j.from.y + j.dir.y * reach + q.v.y * u - K.emberGravity * u * u, j.from.z + j.dir.z * reach + q.v.z * u * K.emberDrift);
        });
        pos.needsUpdate = true;
        if (!alive) drop(id);
      }
    },
    active: () => live.size,
    clear(): void { for (const id of [...live.keys()]) drop(id); },
  };
}
