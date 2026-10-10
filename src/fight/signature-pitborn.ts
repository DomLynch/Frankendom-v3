import * as THREE from 'three';
import type { CombatEvent } from './duel.ts';
import { surfaceHit, woundSite } from './gore.ts';
import { heavyHitBy, registerSignature, type SignatureFrame } from './signature.ts';

// The Pitborn's signature A, Butcher's Wake (docs/briefs/signature-effects.md row 2): his landed heavy drags a thick curved sheet of blood
// out of the wound with the cleaver; it stretches, tears and falls as heavy drops that leave spots on the sand. Not a mist. Cosmetic only:
// it reads the Hit event the duel already emits and nothing else. Everything is allocated once, when the first wake fires.
export const WAKE = {
  grow: 0.2, tear: 0.42,          // seconds: the sheet reaches out with the blade, then thins and tears
  length: 0.7, width: 0.1,       // metres at full stretch
  segments: 12, drops: 7,         // ribbon segments; heavy drops the torn sheet falls as
  gravity: 9.8, spots: 2,         // m/s²; floor marks per wake (the floor pool holds 8 for the fight)
  sheets: 2,                      // wakes alive at once (a heavy chain)
} as const;

type Sheet = { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>; age: number; live: boolean; origin: THREE.Vector3; drag: THREE.Vector3; out: THREE.Vector3; heading: number };
type Drop = { position: THREE.Vector3; velocity: THREE.Vector3; size: number; live: boolean; spot: boolean };

const BLOOD = '#4a0306';
let sheets: Sheet[] = [], drops: Drop[] = [], dropMesh: THREE.InstancedMesh | null = null, parentScene: THREE.Object3D | null = null;
let spotMap: THREE.Texture | null | undefined, fired = 0;
const scratch = new THREE.Vector3(), matrix = new THREE.Matrix4(), quat = new THREE.Quaternion(), scale = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);

// The sheet's centre line at stretch s (0..1) and along it at t (0..1): out of the wound along the blade's path, bowed off the body, sagging.
function spine(sheet: Sheet, s: number, t: number, out: THREE.Vector3): THREE.Vector3 {
  const reach = WAKE.length * s * t;
  return out.copy(sheet.origin).addScaledVector(sheet.drag, reach).addScaledVector(sheet.out, 0.09 * Math.sin(Math.PI * t) * s).addScaledVector(yAxis, -0.12 * (s * t) ** 2);
}

function build(root: THREE.Object3D) {
  let top = root; while (top.parent) top = top.parent;
  if (parentScene === top) return;
  clearWake(); parentScene = top;
  const material = () => new THREE.MeshStandardMaterial({ color: BLOOD, roughness: 0.22, metalness: 0.05, side: THREE.DoubleSide, transparent: true });
  sheets = Array.from({ length: WAKE.sheets }, () => {
    const geometry = new THREE.BufferGeometry();
    const n = WAKE.segments + 1;
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    const index: number[] = [];
    for (let i = 0; i < WAKE.segments; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geometry.setIndex(index);
    const mesh = new THREE.Mesh(geometry, material());
    mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 3; top.add(mesh);
    return { mesh, age: 0, live: false, origin: new THREE.Vector3(), drag: new THREE.Vector3(), out: new THREE.Vector3(), heading: 0 };
  });
  dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), material(), WAKE.sheets * WAKE.drops);
  dropMesh.frustumCulled = false; dropMesh.count = 0; top.add(dropMesh);
  drops = Array.from({ length: WAKE.sheets * WAKE.drops }, () => ({ position: new THREE.Vector3(), velocity: new THREE.Vector3(), size: 0, live: false, spot: false }));
  if (spotMap === undefined) spotMap = typeof document === 'undefined' ? null : new THREE.TextureLoader().load(new URL('../assets/blood/floor-pool-b.png', import.meta.url).href);
}

// Where the blade leaves the wound, in the struck fighter's frame (+x his left, +z his front). His victim is always the player, and the fight
// camera sits behind the player, so a sheet dragged out of his front would be hidden by his own body: it is torn out to the side the cleaver
// travels and a little back toward the eye, clear of his silhouette. A side cut carries on the way it was going; an overhead tears down past
// the shoulder on the cleaver's side (the Pitborn's right = the player's left).
function dragOf(direction: CombatEvent['direction']): [number, number, number] {
  if (direction === 'right') return [0.85, -0.3, -0.3];
  if (direction === 'left') return [-0.85, -0.3, -0.3];
  if (direction === 'low') return [0.6, -0.5, -0.3];
  return [0.75, -0.55, -0.3];
}

function fire(event: CombatEvent, frame: SignatureFrame) {
  const victim = event.target ?? 0, root = frame.roots[victim];
  if (!root) return;
  build(root); fired++;
  const hit = { location: event.location ?? 'torso', direction: event.direction ?? 'overhead', heading: event.heading ?? 0 };
  const site = woundSite(hit), bone = root.getObjectByName(site.bone);
  if (!bone) return;
  root.updateWorldMatrix(true, true);
  const out = new THREE.Vector3(...site.dir).normalize().applyAxisAngle(yAxis, hit.heading);
  // A ray that met something far from the bone met the raised sword, not him (signature.ts marks.body's rule, same bound).
  const found = surfaceHit(root, bone, out), at = bone.getWorldPosition(new THREE.Vector3());
  const met = found && found.point.distanceTo(at) <= Math.max(0.12, site.radius * 2) * frame.scale[victim] ? found : null;
  const sheet = sheets.find((s) => !s.live) ?? sheets.reduce((a, b) => (a.age >= b.age ? a : b));
  sheet.origin.copy(met ? met.point : at.addScaledVector(out, site.radius * frame.scale[victim]));
  sheet.out.copy(met ? met.normal : out);
  sheet.drag.set(...dragOf(hit.direction)).applyAxisAngle(yAxis, hit.heading).normalize();
  sheet.heading = hit.heading; sheet.age = 0; sheet.live = true;
  sheet.mesh.material.opacity = 1; sheet.mesh.visible = true;
  shape(sheet);
}

// Lay the ribbon out for the sheet's age: it grows with the blade, then its middle thins toward the tear.
function shape(sheet: Sheet) {
  const s = Math.min(1, sheet.age / WAKE.grow) * (1 + 0.25 * Math.max(0, (sheet.age - WAKE.grow) / (WAKE.tear - WAKE.grow)));
  const thin = Math.max(0, (sheet.age - WAKE.grow) / (WAKE.tear - WAKE.grow));
  const positions = sheet.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const side = scratch.copy(sheet.drag).cross(sheet.out).normalize();
  const p = new THREE.Vector3();
  for (let i = 0; i <= WAKE.segments; i++) {
    const t = i / WAKE.segments;
    spine(sheet, s, t, p);
    // Thick at the wound, a rounded heavy lip at the far end, pinched in the middle as it tears.
    const w = WAKE.width * (0.55 + 0.45 * Math.sin(Math.PI * (0.15 + 0.85 * t))) * (1 - thin * 0.85 * Math.sin(Math.PI * t) ** 2);
    positions.setXYZ(i * 2, p.x + side.x * w / 2, p.y + side.y * w / 2, p.z + side.z * w / 2);
    positions.setXYZ(i * 2 + 1, p.x - side.x * w / 2, p.y - side.y * w / 2, p.z - side.z * w / 2);
  }
  positions.needsUpdate = true;
  sheet.mesh.geometry.computeVertexNormals();
  sheet.mesh.geometry.computeBoundingSphere();
}

// The tear: the sheet goes and its length falls as heavy drops, still carrying the blade's way.
function tear(sheet: Sheet) {
  sheet.live = false; sheet.mesh.visible = false;
  const free = drops.filter((d) => !d.live).slice(0, WAKE.drops);
  free.forEach((drop, i) => {
    const t = (i + 0.5) / WAKE.drops;
    spine(sheet, 1.25, t, drop.position);
    drop.velocity.copy(sheet.drag).multiplyScalar(0.9 + 0.8 * t).addScaledVector(yAxis, -0.4);
    drop.size = 0.014 + 0.012 * Math.sin(Math.PI * t) + (i === WAKE.drops - 1 ? 0.008 : 0);   // the lip is the heaviest drop
    drop.live = true;
    drop.spot = i === WAKE.drops - 1 || i === Math.floor(WAKE.drops / 2);   // WAKE.spots marks per wake: the lip and the middle
  });
}

function update(dt: number, frame: SignatureFrame) {
  if (!dropMesh) return;
  if (frame.yielding) { for (const s of sheets) { s.live = false; s.mesh.visible = false; } for (const d of drops) d.live = false; dropMesh.count = 0; return; }
  for (const sheet of sheets) {
    if (!sheet.live) continue;
    sheet.age += dt;
    if (sheet.age >= WAKE.tear) tear(sheet); else shape(sheet);
  }
  let n = 0;
  for (const drop of drops) {
    if (!drop.live) continue;
    drop.velocity.y -= WAKE.gravity * dt;
    drop.position.addScaledVector(drop.velocity, dt);
    if (drop.position.y <= 0.01) {
      drop.live = false;
      if (drop.spot) frame.marks.floor(drop.position.x, drop.position.z, Math.atan2(drop.velocity.x, drop.velocity.z), { width: drop.size * 5, height: drop.size * 6.5, map: spotMap, color: spotMap ? '#ffffff' : BLOOD, roughness: 0.3, fadeIn: 0.08 });
      continue;
    }
    // Stretched along its fall: a heavy drop, not a bead of mist.
    const speed = drop.velocity.length();
    quat.setFromUnitVectors(yAxis, scratch.copy(drop.velocity).normalize());
    scale.set(drop.size, drop.size * (1 + Math.min(1.5, speed * 0.25)), drop.size);
    dropMesh.setMatrixAt(n++, matrix.compose(drop.position, quat, scale));
  }
  dropMesh.count = n;
  dropMesh.instanceMatrix.needsUpdate = true;
}

export function clearWake() {
  for (const s of sheets) { s.live = false; s.mesh.visible = false; }
  for (const d of drops) d.live = false;
  if (dropMesh) dropMesh.count = 0;
}
// For the probe and the tests: what the wake holds right now.
export const wakeState = () => ({ sheets: sheets.filter((s) => s.live).length, drops: drops.filter((d) => d.live).length });
export const signatureState = () => ({ fired, ...wakeState() });   // the capture script's probe (imported through the dev server)

registerSignature({ opponent: 'pitborn', variant: 'A', name: "Butcher's Wake", blood: true, when: (event) => heavyHitBy(event), fire, update, clear: clearWake });   // a blood sheet + floor spots: stands down with blood off (#677)
