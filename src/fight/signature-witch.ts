import * as THREE from 'three';
import type { CombatEvent } from './duel.ts';
import { OPPONENT_SIDE, registerSignature, type SignatureFrame } from './signature.ts';

// The Witch's signature, A: The Grasp, short range, no projectile (docs/briefs/signature-effects.md row 10). Two parts on events the sim
// already emits, on her only; the shared charge tell (glow + drone) stays for everyone.
//  - While her heavy is CHARGED, her staff head crackles: short bright streaks born at the tip that die within a hand's breadth of it.
//  - When that charged blow LANDS (a Hit or a GuardBroken carrying `charged`), a black clawed hand closes over the struck shoulder and
//    crumbles to ash from the fingertips down. The hit is her real melee hit; the hand only shows where it landed.
// 0.5 m: at 0.26 m the hand was a ~20 px dark blob on a dark shirt from the fight camera (forced-red probe, 2026-09-24).
export const GRASP = { size: 0.5, close: 0.18, hold: 0.22, crumble: 0.55 } as const;   // metres; seconds: closing, holding, crumbling
const SPARKS = 24, ASH = 40;
// Strategy AGAIN on d67bca77 (2026-09-24): points read as white confetti squares and strays survived loose in the arena. A spark is now a
// streak along its own velocity, 60–140 ms long, at 0.8–1.4 m/s, so none travels further than ~0.2 m from the staff head.
export const SPARK = { lifeMin: 0.06, lifeMax: 0.14, speedMin: 0.8, speedMax: 1.4, length: 0.08, width: 0.014 } as const;

export const graspLands = (event: CombatEvent) =>
  (event.type === 'Hit' || event.type === 'GuardBroken') && event.actor === OPPONENT_SIDE && event.charged === true;

// Canvas art (browser only; under node the meshes draw untextured and nothing throws). The hand: a palm and five hooked fingers, a solid
// black claw with a blood-red rim (Strategy: at 375 the translucent version read as a hollow red stencil). It draws OPAQUE; a second
// texture holds the crumble order (fingertips first, broken by noise), and alphaTest rising through it eats the hand from the top down.
function handArt(): { map: THREE.Texture; order: THREE.Texture } | null {
  if (typeof document === 'undefined') return null;
  const size = 128, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.lineCap = 'round'; g.lineJoin = 'round';
  const draw = (colour: string, grow: number) => {
    g.strokeStyle = g.fillStyle = colour;
    g.beginPath(); g.ellipse(64, 84, 22 + grow, 20 + grow, 0, 0, Math.PI * 2); g.fill();   // the palm, low in the frame
    // Four fingers reaching up and hooking in, and a thumb from the side: quadratic curves, tapering by stroke width.
    const fingers: [number, number, number, number, number, number][] = [[44, 72, 30, 34, 44, 14], [56, 68, 52, 26, 62, 6], [70, 68, 80, 26, 76, 8], [82, 72, 102, 36, 92, 16], [42, 92, 14, 84, 20, 62]];
    for (const [x0, y0, cx, cy, x1, y1] of fingers) {
      g.lineWidth = 11 + grow * 2; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); g.stroke();
      g.lineWidth = 5 + grow; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 + (64 - x1) * 0.18, y1 + 10); g.stroke();   // the claw tip hooks inward
    }
  };
  draw('rgb(210,20,24)', 2.5);   // the rim, drawn fat underneath: only the edge stays red
  draw('rgb(12,7,9)', 0);        // the fill: near-black, opaque
  const orderCanvas = document.createElement('canvas'); orderCanvas.width = orderCanvas.height = size;
  const o = orderCanvas.getContext('2d');
  if (!o) return null;
  const image = o.createImageData(size, size), data = image.data;
  let seed = 1234567;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const v = Math.round(255 * Math.min(1, crumbleOrder(y / size, seed / 4294967296))), i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  o.putImageData(image, 0, 0);
  const map = new THREE.CanvasTexture(canvas), order = new THREE.CanvasTexture(orderCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, order };
}
// When a texel of the hand goes (0 first, 1 last): the fingertips (top of the art) before the palm, the edge ragged by noise.
export const crumbleOrder = (row: number, noise: number) => 0.05 + 0.6 * row + 0.3 * noise;
// The art row the crumble has reached at alphaTest `t`, where the ash sheds from (the mean of the noise term).
const crumbleRow = (t: number) => THREE.MathUtils.clamp((t - 0.05 - 0.15) / 0.6, 0, 1);

// The staff head in the Witch's hands: the drawn weapon's contact end (characters.ts puts `contact.to` on it, as the blade tip).
function staffTip(root: THREE.Object3D | null): { weapon: THREE.Object3D; tip: number } | null {
  const weapon = root?.getObjectByName('WeaponDrawn') ?? root?.getObjectByName('SwordDrawn');
  if (!weapon) return null;
  return { weapon, tip: (weapon.userData.contact as { to: number } | undefined)?.to ?? 0.86 };
}

// A pool of streaks in one draw. Each streak is two crossed quads along its velocity, so it reads from any camera without knowing where the
// camera is. A spent streak collapses to a point (no area, no pixels): nothing can linger loose in the scene the way parked points did.
type Bit = { life: number; age: number; at: THREE.Vector3; v: THREE.Vector3; size: number };
function streakPool(count: number, material: THREE.MeshBasicMaterial) {
  const geometry = new THREE.BufferGeometry(), position = new Float32Array(count * 8 * 3), colour = new Float32Array(count * 8 * 3), index: number[] = [];
  for (let i = 0; i < count; i++) for (const q of [0, 4]) { const b = i * 8 + q; index.push(b, b + 1, b + 2, b, b + 2, b + 3); }
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  geometry.setIndex(index);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 5;
  const bits: Bit[] = Array.from({ length: count }, () => ({ life: 0, age: 1, at: new THREE.Vector3(), v: new THREE.Vector3(), size: 0 }));
  const dir = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), tail = new THREE.Vector3(), c = new THREE.Vector3();
  // Write streak i: from `tail` to the head at `bit.at`, `width` across, head colour `hot` fading to `cold` at the tail, scaled by `fade`.
  const write = (i: number, length: number, width: number, hot: THREE.Color, cold: THREE.Color, fade: number) => {
    const bit = bits[i];
    dir.copy(bit.v); if (dir.lengthSq() < 1e-8) dir.set(0, 1, 0); dir.normalize();
    tail.copy(bit.at).addScaledVector(dir, -length);
    a.set(0, 1, 0).cross(dir); if (a.lengthSq() < 1e-4) a.set(1, 0, 0).cross(dir); a.normalize().multiplyScalar(width / 2);
    b.copy(dir).cross(a);
    [a, b].forEach((side, q) => {
      const base = (i * 8 + q * 4) * 3;
      c.copy(tail).add(side).toArray(position, base); c.copy(tail).sub(side).toArray(position, base + 3);
      c.copy(bit.at).sub(side).toArray(position, base + 6); c.copy(bit.at).add(side).toArray(position, base + 9);
      for (let k = 0; k < 4; k++) {
        const end = k < 2 ? cold : hot, at = base + k * 3;
        colour[at] = end.r * fade; colour[at + 1] = end.g * fade; colour[at + 2] = end.b * fade;
      }
    });
  };
  const collapse = (i: number) => { for (let k = 0; k < 8; k++) bits[i].at.toArray(position, (i * 8 + k) * 3); };
  const commit = (live: number) => { mesh.visible = live > 0; geometry.attributes.position.needsUpdate = true; geometry.attributes.color.needsUpdate = true; };
  return { mesh, bits, write, collapse, commit };
}

let seed = 99;
const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
let sparks: ReturnType<typeof streakPool> | null = null, ash: ReturnType<typeof streakPool> | null = null;
let hand: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null, handAge = Infinity;
const scratch = new THREE.Vector3(), scratchQuat = new THREE.Quaternion(), up = new THREE.Vector3(0, 0, 1);
const HOT = new THREE.Color('#fff6dc'), WARM = new THREE.Color('#ff9a3a'), ASH_TOP = new THREE.Color('#3a302e'), ASH_END = new THREE.Color('#141010');

function build(root: THREE.Object3D) {
  let scene = root; while (scene.parent) scene = scene.parent;   // the pools are in world space: they hang off the scene itself
  sparks = streakPool(SPARKS, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
  ash = streakPool(ASH, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
  const art = handArt();
  // Opaque (transparent: false): alphaTest still discards, so the crumble eats holes, but what remains is a solid claw, never see-through.
  hand = new THREE.Mesh(new THREE.PlaneGeometry(GRASP.size, GRASP.size), new THREE.MeshBasicMaterial({ map: art?.map ?? null, alphaMap: art?.order ?? null, color: '#ffffff', depthWrite: false, depthTest: false, alphaTest: 0.01, side: THREE.DoubleSide }));
  hand.renderOrder = 4; hand.visible = false;
  scene.add(sparks.mesh, ash.mesh, hand);
}

// Where the hand closes: the top of the struck RIGHT shoulder (the Dwarf's reasoning — the fight camera sits behind and above the player she
// strikes, and a chest mark faces away from it; Strategy kept the right shoulder, 2026-09-24). Placed in the world at the moment of the blow, then it follows
// the shoulder bone for its short life.
let handBone: THREE.Object3D | null = null;
const handLocal = new THREE.Vector3(), handNormal = new THREE.Vector3();
function grasp(event: CombatEvent, frame: SignatureFrame) {
  const victim = event.target, root = victim === undefined ? null : frame.roots[victim];
  if (!root) return;
  if (!hand) build(root);
  const side = -1, bone = root.getObjectByName('upperarm_r') ?? root.getObjectByName('spine_03');
  if (!bone || !hand) return;
  root.updateWorldMatrix(true, true);
  const heading = frame.fighters[victim!].body.heading, scale = frame.scale[victim!];
  const out = new THREE.Vector3(side * 0.25, 0.9, -0.35).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), heading);
  const at = bone.getWorldPosition(new THREE.Vector3()).addScaledVector(out, 0.09 * scale);
  // The hand faces back and up, toward the camera behind him: laid flat on the shoulder top it was edge-on from the fight camera and did not
  // read at all (probe, 2026-09-24: drawn at shoulder height, visible, unseen).
  const facing = new THREE.Vector3(side * 0.1, 0.55, -0.83).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), heading);
  handBone = bone; handLocal.copy(bone.worldToLocal(at.clone())); handNormal.copy(facing).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert());
  handAge = 0; hand.visible = true; hand.userData.scale = scale;
}

function update(dt: number, frame: SignatureFrame) {
  const witch = frame.fighters[OPPONENT_SIDE], root = frame.roots[OPPONENT_SIDE];
  if (!sparks && root) build(root);
  if (!sparks || !ash || !hand) return;
  // Staff sparks: while charged (and not yielding to a finisher), keep the pool busy at the tip. Each streak flies out, dims and dies.
  const tip = staffTip(root), charging = !frame.yielding && witch.charged && witch.phase === 'attack';
  let live = 0;
  if (tip) tip.weapon.updateWorldMatrix(true, false);
  for (let i = 0; i < SPARKS; i++) {
    const bit = sparks.bits[i];
    bit.age += dt;
    if (bit.age >= bit.life && charging && tip && rand() < 0.6) {
      tip.weapon.localToWorld(bit.at.set((rand() - 0.5) * 0.04, tip.tip + (rand() - 0.3) * 0.05, (rand() - 0.5) * 0.04));
      bit.v.set(rand() - 0.5, rand() * 0.9 - 0.2, rand() - 0.5).normalize().multiplyScalar(SPARK.speedMin + rand() * (SPARK.speedMax - SPARK.speedMin));
      bit.age = 0; bit.life = SPARK.lifeMin + rand() * (SPARK.lifeMax - SPARK.lifeMin);
    }
    if (bit.age < bit.life) {
      live++;
      bit.at.addScaledVector(bit.v, dt);
      const fade = 1 - bit.age / bit.life;
      sparks.write(i, SPARK.length * (0.6 + 0.4 * fade), SPARK.width, HOT, WARM, fade);
    } else sparks.collapse(i);
  }
  sparks.commit(live);
  // The Grasp: closes (scale 1.35 -> 0.9, squeezing across), holds, then crumbles from the fingertips down and sheds ash off the front.
  const t = handAge += dt, end = GRASP.close + GRASP.hold + GRASP.crumble;
  if (hand.visible && handBone && t < end && !frame.yielding) {
    const scale = hand.userData.scale as number;
    hand.position.copy(handLocal).applyMatrix4(handBone.matrixWorld);
    const normal = scratch.copy(handNormal).applyQuaternion(handBone.getWorldQuaternion(scratchQuat)).normalize();
    hand.quaternion.setFromUnitVectors(up, normal);
    const closing = Math.min(1, t / GRASP.close), squeeze = 1.35 - 0.45 * closing * closing;
    hand.scale.set(squeeze * 0.85 * scale, squeeze * scale, 1);
    hand.updateMatrixWorld();
    const crumbling = Math.max(0, (t - GRASP.close - GRASP.hold) / GRASP.crumble);
    hand.material.alphaTest = 0.01 + 0.98 * crumbling;
    if (crumbling > 0) {
      const row = crumbleRow(hand.material.alphaTest);
      for (let i = 0; i < ASH; i++) {
        const bit = ash.bits[i];
        if (bit.age < bit.life || rand() > dt * 40) continue;
        // A flake leaves the crumble front (a point on the art row the alphaTest has reached), inside the hand's width, drifting off it.
        hand.localToWorld(bit.at.set((rand() - 0.5) * GRASP.size * 0.55, (0.5 - row) * GRASP.size + (rand() - 0.5) * 0.04, 0));
        bit.v.copy(normal).multiplyScalar(0.15 + rand() * 0.2).add(scratch.set((rand() - 0.5) * 0.35, 0.15 + rand() * 0.25, (rand() - 0.5) * 0.35));
        bit.age = 0; bit.life = 0.45 + rand() * 0.35; bit.size = 0.014 + rand() * 0.012;
      }
    }
  } else if (hand.visible) { hand.visible = false; handBone = null; }
  let ashLive = 0;
  for (let i = 0; i < ASH; i++) {
    const bit = ash.bits[i];
    bit.age += dt;
    if (bit.age < bit.life) {
      ashLive++; bit.v.y -= 0.7 * dt; bit.at.addScaledVector(bit.v, dt);
      ash.write(i, bit.size, bit.size, ASH_TOP, ASH_END, 1);
    } else ash.collapse(i);
  }
  ash.commit(ashLive);
}

registerSignature({
  opponent: 'witch', variant: 'A', name: 'The Grasp',
  when: graspLands,
  fire: grasp,
  update,
  clear() {
    handAge = Infinity; handBone = null;
    if (hand) hand.visible = false;
    for (const pool of [sparks, ash]) if (pool) { pool.bits.forEach((b, i) => { b.age = b.life = 0; pool.collapse(i); }); pool.commit(0); }
  },
});
