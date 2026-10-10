import * as THREE from 'three';
import { isHeavy, OPPONENT_SIDE, registerSignature, type SignatureFrame } from './signature.ts';

// The Executioner's signature (brief row 5, variant A): the Reaping Scar. When his heavy misses and the blade came down low, the part of
// the arc that ran below knee height carves a curved scrape into the sand that shows the dark stone under it; a few fragments tumble out
// of it and the scar stays for the fight (the floor pool's cap and fight-end clear). Truthful by construction: the scar is laid along the
// tip positions the rig actually drew this swing, and a heavy that never came low leaves nothing.
const HISTORY = 36, WINDOW = 0.7;   // tip samples kept, and how far back (s) a swing's low run is looked for
const KNEE = 0.5;                   // knee height of the hero rig (m), times the opponent's body scale
const FRAGMENTS = 10, GRAVITY = 9.8, SETTLE = 1.6;

let scarTexture: THREE.CanvasTexture | null = null;
// A crescent groove, drawn once: a dark stone core with a pale lip of thrown sand on its outer side, the ends tapering to a scratch.
function scar(): THREE.CanvasTexture {
  if (scarTexture) return scarTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 256;
  const g = canvas.getContext('2d')!;
  const band = (radius: number, width: number, color: string) => {
    for (let i = 0; i <= 64; i++) {
      const t = i / 64, a = Math.PI * (1.2 + 0.6 * t), taper = Math.sin(Math.PI * t) ** 0.7;
      g.fillStyle = color;
      g.beginPath();
      g.ellipse(256 + Math.cos(a) * 250, 236 + Math.sin(a) * radius, 6 + 5 * taper, width * taper + 0.5, a + Math.PI / 2, 0, Math.PI * 2);
      g.fill();
    }
  };
  band(212, 16, 'rgba(150,104,78,0.5)');   // the lip: sand thrown up on the outside of the cut
  band(200, 13, 'rgba(40,36,32,0.97)');       // the stone floor the blade bared
  band(199, 5, 'rgba(14,12,11,1)');          // the deepest line of the stroke
  for (let i = 0; i < 40; i++) {             // grit along the groove so it doesn't read as a painted stroke
    const a = Math.PI * (1.2 + 0.6 * ((i * 0.61803) % 1)), r = 194 + ((i * 37) % 11);
    g.fillStyle = i % 3 ? 'rgba(40,36,32,0.8)' : 'rgba(150,138,118,0.7)';
    g.fillRect(256 + Math.cos(a) * 250, 236 + Math.sin(a) * r, 3, 3);
  }
  scarTexture = new THREE.CanvasTexture(canvas);
  scarTexture.colorSpace = THREE.SRGBColorSpace;
  return scarTexture;
}

type Fragment = { mesh: THREE.Mesh; velocity: THREE.Vector3; spin: THREE.Vector3; age: number };
const samples = Array.from({ length: HISTORY }, () => ({ at: new THREE.Vector3(), time: -1 }));
let head = 0, clock = 0, group: THREE.Group | null = null;
const fragments: Fragment[] = [];
const tipLocal = new THREE.Vector3(), rootAt = new THREE.Vector3(), chord = new THREE.Vector3(), centre = new THREE.Vector3();

function ensureFragments(root: THREE.Object3D) {
  let top: THREE.Object3D = root;
  while (top.parent) top = top.parent;
  if (group) { if (group.parent !== top) top.add(group); return; }   // a rebuilt scene takes the chips with it
  group = new THREE.Group();
  top.add(group);
  const geometry = new THREE.DodecahedronGeometry(0.035, 0);
  const material = new THREE.MeshStandardMaterial({ color: '#4a443d', roughness: 0.95, flatShading: true });
  for (let i = 0; i < FRAGMENTS; i++) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    group.add(mesh);
    fragments.push({ mesh, velocity: new THREE.Vector3(), spin: new THREE.Vector3(), age: SETTLE });
  }
}

function sampleTip(frame: SignatureFrame) {
  const root = frame.roots[OPPONENT_SIDE], drawn = root?.getObjectByName('WeaponDrawn');
  if (!drawn) return;
  drawn.updateWorldMatrix(true, false);
  const slot = samples[head];
  slot.at.copy(drawn.localToWorld(tipLocal.set(0, (drawn.userData.contact as { to: number } | undefined)?.to ?? 0.86, 0)));
  slot.time = clock;
  head = (head + 1) % HISTORY;
}

registerSignature({
  opponent: 'executioner', variant: 'A', name: 'Reaping Scar',
  when: (event) => event.type === 'AttackMissed' && event.actor === OPPONENT_SIDE && isHeavy(event),
  fire(_event, frame) {
    const root = frame.roots[OPPONENT_SIDE];
    if (!root) return;
    sampleTip(frame);   // the pose of this very frame too
    const knee = KNEE * frame.scale[OPPONENT_SIDE];
    // The low run of this swing, oldest to newest: the tip samples of the last WINDOW seconds under knee height.
    const low: THREE.Vector3[] = [];
    for (let i = 1; i <= HISTORY; i++) {
      const s = samples[(head + i - 1) % HISTORY];
      if (s.time >= 0 && clock - s.time <= WINDOW && s.at.y < knee) low.push(s.at);
    }
    if (low.length < 2) return;   // the blade never came low: no scar
    const first = low[0], last = low[low.length - 1];
    centre.set(0, 0, 0);
    for (const p of low) centre.add(p);
    centre.divideScalar(low.length);
    chord.subVectors(last, first).setY(0);
    const length = THREE.MathUtils.clamp(chord.length() * 1.1, 0.7, 1.7);
    if (chord.lengthSq() < 1e-4) chord.set(1, 0, 0);
    chord.normalize();
    // Mark space: +x along the chord; the crescent bows to the mark's +y, turned to bow away from him (the arc is swept round his body).
    let tilt = Math.atan2(-chord.z, chord.x);
    root.getWorldPosition(rootAt);
    if (-Math.sin(tilt) * (centre.x - rootAt.x) - Math.cos(tilt) * (centre.z - rootAt.z) < 0) tilt += Math.PI;
    frame.marks.floor(centre.x, centre.z, tilt, { width: length, height: length * 0.5, map: scar(), roughness: 0.95, fadeIn: 0.08 });
    // Fragments kicked out along the cut, thrown away from him.
    ensureFragments(root);
    const away = centre.clone().sub(rootAt).setY(0).normalize();
    fragments.forEach((f, i) => {
      const t = (i + 0.5) / FRAGMENTS;
      f.mesh.position.lerpVectors(first, last, t).setY(0.04);
      f.mesh.scale.setScalar(0.6 + ((i * 0.37) % 0.8));
      f.velocity.copy(away).multiplyScalar(0.8 + ((i * 0.53) % 1.2)).addScaledVector(chord, (t - 0.5) * 1.4).setY(1.2 + ((i * 0.71) % 1.3));
      f.spin.set(7 * ((i * 0.29) % 1) - 3, 9 * ((i * 0.43) % 1) - 4, 6 * ((i * 0.17) % 1) - 3);
      f.age = 0; f.mesh.visible = true;
    });
  },
  update(dt, frame) {
    clock += dt;
    sampleTip(frame);
    for (const f of fragments) {
      if (f.age >= SETTLE) continue;
      f.age += dt;
      f.velocity.y -= GRAVITY * dt;
      f.mesh.position.addScaledVector(f.velocity, dt);
      if (f.mesh.position.y < 0.02) { f.mesh.position.y = 0.02; f.velocity.multiplyScalar(0.35); f.velocity.y = Math.abs(f.velocity.y) * 0.3; f.spin.multiplyScalar(0.5); }
      f.mesh.rotation.x += f.spin.x * dt; f.mesh.rotation.y += f.spin.y * dt; f.mesh.rotation.z += f.spin.z * dt;
      if (f.age >= SETTLE) f.mesh.visible = false;   // the chips sink into the sand; the scar is what stays
    }
  },
  clear() {
    for (const s of samples) s.time = -1;
    for (const f of fragments) { f.age = SETTLE; f.mesh.visible = false; }
  },
});
