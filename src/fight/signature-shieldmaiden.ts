import * as THREE from 'three';
import { OPPONENT_SIDE, defendedBy, isHeavy, registerSignature, type SignatureFrame } from './signature.ts';

// The Shieldmaiden's signature A, Splintered Defiance (docs/briefs/signature-effects.md row 8): a heavy she blocks throws splinters and trim
// off the top of her shield's rim, out past both sides of the player, and they land and lie on the sand. Cosmetic only: it reads the Blocked
// event the duel already emits (the defender is `actor`, the attacker's move rides on it).
// Her shield is a Shield-slot loot mesh (loot.glb `~kit.Shield`, on her through the opponent carriers). With no shield on her it does NOTHING:
// wood splintering off a block made with a gladius would break the brief's truth rule (Lead, 2026-09-24). The rim chip mark was dropped on
// Lead's ruling (2026-09-27): it could not be made to read at the 375 fight camera, and floor wood alone is allowed.
export const SPLINTER = {
  pieces: 18, bursts: 2,          // splinters per blocked heavy; bursts alive at once
  speed: [1.8, 3.4], up: 2.2,     // m/s outward toward the attacker, and upward kick
  gravity: 9.8, seconds: 1.4,     // how long a splinter lives, landing flat on the sand before it goes
} as const;

type Splinter = { position: THREE.Vector3; velocity: THREE.Vector3; spin: THREE.Vector3; rotation: THREE.Euler; size: THREE.Vector3; age: number; live: boolean; trim: boolean };

const WOOD = new THREE.Color('#cfb48a'), TRIM = new THREE.Color('#3b2e22');
let pieces: Splinter[] = [], mesh: THREE.InstancedMesh | null = null, parentScene: THREE.Object3D | null = null, fired = 0;
const matrix = new THREE.Matrix4(), quat = new THREE.Quaternion(), scratch = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
let seed = 0x9e3779b9;
const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);

function build(root: THREE.Object3D) {
  let top = root; while (top.parent) top = top.parent;
  if (parentScene === top) return;
  clearSplinters(); parentScene = top;
  const count = SPLINTER.pieces * SPLINTER.bursts;
  mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.85 }), count);
  mesh.frustumCulled = false; mesh.count = 0; top.add(mesh);
  for (let i = 0; i < count; i++) mesh.setColorAt(i, WOOD);
  pieces = Array.from({ length: count }, () => ({ position: new THREE.Vector3(), velocity: new THREE.Vector3(), spin: new THREE.Vector3(), rotation: new THREE.Euler(), size: new THREE.Vector3(), age: 0, live: false, trim: false }));
}

// Where the splinters leave: the top of her rim, on the face toward the attacker. Her board is SKINNED to her arm, so its bind-pose box and
// matrixWorld say nothing about where it is (the old box read put the burst up to a shield's width off her): the rim is read off the posed vertices.
export function rimOf(shield: THREE.Object3D, toward: THREE.Vector3): THREE.Vector3 {
  shield.updateWorldMatrix(true, true);
  const points: THREE.Vector3[] = [];
  shield.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry.attributes.position, step = Math.max(1, Math.floor(position.count / 400));
    const skinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh ? mesh as THREE.SkinnedMesh : null;
    skinned?.skeleton.update();
    for (let i = 0; i < position.count; i += step) {
      const v = new THREE.Vector3();
      if (skinned) skinned.getVertexPosition(i, v); else v.fromBufferAttribute(position, i);
      points.push(v.applyMatrix4(mesh.matrixWorld));
    }
  });
  if (!points.length) return shield.getWorldPosition(new THREE.Vector3());
  const face = toward.clone().setY(0).normalize(), centre = points.reduce((sum, v) => sum.add(v), new THREE.Vector3()).divideScalar(points.length);
  let top = points[0], front = -Infinity;
  for (const v of points) { if (v.y > top.y) top = v; front = Math.max(front, scratch.copy(v).sub(centre).dot(face)); }
  return top.clone().addScaledVector(face, front - scratch.copy(top).sub(centre).dot(face));   // onto the front face
}

// The Shield-slot mesh on her rig, if she wears one (characters.ts tags loot pieces with userData.slot).
export function shieldOf(root: THREE.Object3D): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((o) => { if (!found && o.userData?.slot === 'Shield' && o.visible) found = o; });
  return found;
}

function fire(_event: unknown, frame: SignatureFrame) {
  const root = frame.roots[OPPONENT_SIDE], foe = frame.roots[1 - OPPONENT_SIDE];
  const shield = root && shieldOf(root);
  if (!root || !shield) return;   // no shield on her, nothing to splinter
  build(root); fired++;
  root.updateWorldMatrix(true, true);
  const toward = (foe ? foe.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3()).sub(root.getWorldPosition(scratch)).setY(0).normalize();
  const at = rimOf(shield, toward);
  const side = scratch.copy(toward).cross(yAxis).normalize();
  const free = pieces.filter((p) => !p.live);
  const burst = (free.length >= SPLINTER.pieces ? free : [...pieces].sort((a, b) => b.age - a.age)).slice(0, SPLINTER.pieces);
  burst.forEach((p, i) => {
    const speed = SPLINTER.speed[0] + (SPLINTER.speed[1] - SPLINTER.speed[0]) * rand();
    p.position.copy(at);
    p.velocity.copy(toward).multiplyScalar(speed * 0.6).addScaledVector(side, (rand() < 0.5 ? -1 : 1) * (0.5 + rand()) * speed * 0.9)
      .addScaledVector(yAxis, SPLINTER.up * (0.4 + rand()));   // out past both sides of the player, who stands between her and the eye
    p.spin.set((rand() - 0.5) * 30, (rand() - 0.5) * 30, (rand() - 0.5) * 30);
    p.rotation.set(rand() * 6, rand() * 6, rand() * 6);
    p.trim = i % 4 === 0;   // one in four is the dark iron-bound trim, the rest pale split wood
    p.size.set(p.trim ? 0.07 : 0.016 + 0.012 * rand(), p.trim ? 0.014 : 0.01, p.trim ? 0.022 : 0.08 + 0.08 * rand());   // phone-readable at fight distance
    p.age = 0; p.live = true;
  });
}

function update(dt: number, frame: SignatureFrame) {
  if (!mesh) return;
  if (frame.yielding) { for (const p of pieces) p.live = false; mesh.count = 0; return; }   // a finisher stands them down
  let n = 0;
  for (const p of pieces) {
    if (!p.live) continue;
    p.age += dt;
    if (p.age > SPLINTER.seconds) { p.live = false; continue; }
    if (p.position.y > 0.004) {
      p.velocity.y -= SPLINTER.gravity * dt;
      p.position.addScaledVector(p.velocity, dt);
      p.rotation.x += p.spin.x * dt; p.rotation.y += p.spin.y * dt; p.rotation.z += p.spin.z * dt;
      if (p.position.y <= 0.004) { p.position.y = 0.004; p.velocity.set(0, 0, 0); p.rotation.x = Math.PI / 2; }   // it lands flat and stays
    }
    mesh.setMatrixAt(n, matrix.compose(p.position, quat.setFromEuler(p.rotation), p.size));
    mesh.setColorAt(n++, p.trim ? TRIM : WOOD);
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

export function clearSplinters() {
  for (const p of pieces) p.live = false;
  if (mesh) mesh.count = 0;
}
// For the tests and the capture script's probe (imported through the dev server).
export const signatureState = () => ({ fired, splinters: pieces.filter((p) => p.live).length });

registerSignature({ opponent: 'shieldmaiden', variant: 'A', name: 'Splintered Defiance', when: (event) => defendedBy(event, 'Blocked') && isHeavy(event), fire, update, clear: clearSplinters });
