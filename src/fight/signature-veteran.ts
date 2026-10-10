import * as THREE from 'three';
import { defendedBy, isHeavy, OPPONENT_SIDE, registerSignature, type SignatureEffect, type SignatureFrame } from './signature.ts';
import { type WoundHit } from './gore.ts';
import { weaponOf } from './moves.ts';
import type { CombatEvent } from './duel.ts';

// The Veteran's signature (brief row 1, variant A): Battle Scars. A heavy (or any cut past the light cut's 14) landed ON him scores a fresh
// gouge across his armour at the site the sim named: bright metal through the bronze patina, laid along the line the blade travelled
// (an overhead runs down across him on the diagonal, a cut from either side flatter). It stays for the fight in the body pool (6, oldest reused,
// cleared with the wounds). Cosmetic: no stat, no sim. Sized to read at 375x812 from the default camera.
const SUBSTANTIAL = 16;

let gougeTexture: THREE.CanvasTexture | null = null;
// A gouge, drawn once along the texture's long axis: a dark torn edge each side, a bright scored core, burr flecks, tapering at both ends.
function gouge(): THREE.CanvasTexture {
  if (gougeTexture) return gougeTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 96;
  const g = canvas.getContext('2d')!;
  const stroke = (half: number, color: string, wobble: number) => {
    g.fillStyle = color;
    g.beginPath();
    for (let i = 0; i <= 64; i++) { const t = i / 64, x = 16 + 480 * t, w = half * Math.sin(Math.PI * t) ** 0.6; g.lineTo(x, 48 - w + wobble * Math.sin(t * 23)); }
    for (let i = 64; i >= 0; i--) { const t = i / 64, x = 16 + 480 * t, w = half * Math.sin(Math.PI * t) ** 0.6; g.lineTo(x, 48 + w + wobble * Math.sin(t * 19 + 1)); }
    g.fill();
  };
  stroke(30, 'rgba(20,14,8,0.85)', 2.5);     // the torn, darkened lip of the patina
  stroke(18, 'rgba(196,170,112,1)', 1.5);    // bright bronze bared under the patina
  stroke(8, 'rgba(255,246,214,1)', 0.8);     // the freshly scored floor of the cut
  for (let i = 0; i < 28; i++) {             // burrs thrown off the edges
    const x = 40 + ((i * 97) % 430), y = 48 + (i % 2 ? 1 : -1) * (20 + ((i * 13) % 12));
    g.fillStyle = i % 3 ? 'rgba(230,210,160,0.9)' : 'rgba(30,22,12,0.8)';
    g.fillRect(x, y, 3 + (i % 3), 2);
  }
  gougeTexture = new THREE.CanvasTexture(canvas);
  gougeTexture.colorSpace = THREE.SRGBColorSpace;
  return gougeTexture;
}

const struck = (event: CombatEvent) => event.type === 'Hit' && event.target === OPPONENT_SIDE && event.move !== 'kick' && (isHeavy(event) || (event.damage ?? 0) >= SUBSTANTIAL);
let scars = 0;

// Variant A is kept but NOT registered (Lead, 2026-09-24): he wears no torso armour (veteran.glb is one fused surface plus a bronze helmet),
// so the sim's hit site lands on cloth and a bright-metal gouge there would not tell the truth. With only B registered, "On" resolves to B.
export const battleScars: SignatureEffect = {
  opponent: 'veteran', variant: 'A', name: 'Battle Scars',
  when: struck,
  fire(event, frame) {
    const root = frame.roots[OPPONENT_SIDE], veteran = frame.fighters[OPPONENT_SIDE], attacker = frame.fighters[event.actor];
    if (!root || !event.move) return;
    const direction = weaponOf(attacker.weapon).moves[event.move]?.direction ?? 'center';
    const hit: WoundHit = { location: event.location ?? 'torso', heading: veteran.body.heading, direction };
    // The line the blade travelled, about the surface normal (0 = across him): an overhead runs down, a side cut on the diagonal.
    const tilt = (direction === 'left' ? -0.4 : direction === 'right' ? 0.4 : 0.75) + 0.15 * Math.sin(++scars * 2.3);
    const scale = frame.scale[OPPONENT_SIDE];
    frame.marks.body(OPPONENT_SIDE, root, hit, { width: 0.3 * scale, height: 0.09 * scale, map: gouge(), metalness: 0.9, roughness: 0.25, tilt, fadeIn: 0.03 }, scale);
  },
  clear() { scars = 0; },
};

// Variant B, the one registered: Blade Bite. When he PARRIES, metal curls tear from the point where the blades met on his trident and fly
// off with a bright scrape along his shaft. The contact point is measured, not assumed: the closest points between the two weapons' striking
// segments this frame. Transient only (curls settle and go within 1.4 s): it leaves no mark. The scrape's sound is the audio lane's.
const SCRAPE_LIFE = 0.3, GRAVITY = 9.8;
type Curl = { mesh: THREE.Object3D; velocity: THREE.Vector3; spin: THREE.Vector3; age: number; stuck: boolean };
const a0 = new THREE.Vector3(), a1 = new THREE.Vector3(), b0 = new THREE.Vector3(), b1 = new THREE.Vector3(), onA = new THREE.Vector3(), onB = new THREE.Vector3();
const shaftDir = new THREE.Vector3(), across = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);

// A weapon's striking segment in world space (`contact` from/to along its local +Y, as the blade bake and the tip probe read it).
const drawnOf = (root: THREE.Object3D | null) => root?.getObjectByName('WeaponDrawn') ?? root?.getObjectByName('SwordDrawn');
function segment(root: THREE.Object3D | null, from: THREE.Vector3, to: THREE.Vector3, wholeShaft: boolean): boolean {
  const drawn = drawnOf(root);
  if (!drawn) return false;
  drawn.updateWorldMatrix(true, false);
  const contact = (drawn.userData.contact as { from: number; to: number } | undefined) ?? { from: 0.1, to: 0.86 };
  drawn.localToWorld(from.set(0, wholeShaft ? 0 : contact.from, 0)); drawn.localToWorld(to.set(0, contact.to, 0));
  return true;
}
// C's shaving: a thin steel ribbon that curls round and twists as it goes, no outline. Built once per size; `turns` and `twist` vary the shape.
function shaving(length: number, width: number, turns: number, twist: number): THREE.BufferGeometry {
  const steps = 18, positions: number[] = [], index: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, a = t * turns * Math.PI * 2, r = (length / (turns * Math.PI * 2)) * (1.25 - 0.6 * t);
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r, cy = t * length * 0.35, w = width * (0.35 + 0.65 * Math.sin(Math.PI * t)), tw = twist * t;
    // Across the ribbon: between the rise axis and the radial direction, turning with the twist.
    const ux = Math.cos(a) * Math.sin(tw), uy = Math.cos(tw), uz = Math.sin(a) * Math.sin(tw);
    positions.push(cx - ux * w / 2, cy - uy * w / 2, cz - uz * w / 2, cx + ux * w / 2, cy + uy * w / 2, cz + uz * w / 2);
    if (i < steps) { const k = i * 2; index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index); geometry.computeVertexNormals();
  return geometry;
}
// Closest points between segments p0-p1 and q0-q1 (clamped), written to onP / onQ.
function closest(p0: THREE.Vector3, p1: THREE.Vector3, q0: THREE.Vector3, q1: THREE.Vector3, onP: THREE.Vector3, onQ: THREE.Vector3) {
  const d1 = p1.clone().sub(p0), d2 = q1.clone().sub(q0), r = p0.clone().sub(q0);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r), c = d1.dot(r), b = d1.dot(d2), den = a * e - b * b;
  let s = den > 1e-8 ? THREE.MathUtils.clamp((b * f - c * e) / den, 0, 1) : 0;
  let t = e > 1e-8 ? (b * s + f) / e : 0;
  if (t < 0) { t = 0; s = a > 1e-8 ? THREE.MathUtils.clamp(-c / a, 0, 1) : 0; } else if (t > 1) { t = 1; s = a > 1e-8 ? THREE.MathUtils.clamp((b - c) / a, 0, 1) : 0; }
  onP.copy(p0).addScaledVector(d1, s); onQ.copy(q0).addScaledVector(d2, t);
}

// How a bite looks: B = six small bright ring curls sprayed off the contact; C (Strategy + Lead AGAIN) = seven twisted steel shavings of
// three shapes and varied sizes, bitten from the tines (the nearest point of the trident head to the blade), two left caught there and the
// rest dropping close to it. Each variant owns its pool; only one is ever chosen.
type Style = { name: string; count: number; life: number; radius?: number; tube?: number; body: { color: string; emissive: string; metalness: number; roughness: number }; speed: number; lift: number; head: boolean; shavings?: boolean; stuck?: number };   // head: measure the bite on the tines only; shavings: C's twisted ribbons (else rings of radius/tube); stuck: how many stay on the tines
function bladeBite(variant: 'B' | 'C', style: Style) {
  const curls: Curl[] = [];
  let group: THREE.Group | null = null, scrape: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial> | null = null, scrapeAge = SCRAPE_LIFE, bites = 0;
  const ensure = (root: THREE.Object3D) => {
    let top: THREE.Object3D = root;
    while (top.parent) top = top.parent;
    if (group) { if (group.parent !== top) top.add(group); return; }   // a rebuilt scene takes them with it
    group = new THREE.Group();
    top.add(group);
    // B: a torn curl of metal, most of a thin ring. C: thin ribbons (seen from both sides). Both sized so a phone at 375 px can follow them.
    const shapes = style.shavings ? [shaving(0.18, 0.03, 1.6, 2.2), shaving(0.13, 0.024, 2.3, 3.4), shaving(0.24, 0.036, 1.1, 1.4)]
      : [new THREE.TorusGeometry(style.radius ?? 0.03, style.tube ?? 0.006, 5, 14, Math.PI * 1.5)];
    const material = new THREE.MeshStandardMaterial({ ...style.body, side: style.shavings ? THREE.DoubleSide : THREE.FrontSide });
    for (let i = 0; i < style.count; i++) {
      const mesh = new THREE.Mesh(shapes[i % shapes.length], material);
      if (style.shavings) mesh.scale.setScalar(0.7 + ((i * 0.37) % 0.7));   // varied sizes
      mesh.visible = false; group.add(mesh);
      curls.push({ mesh, velocity: new THREE.Vector3(), spin: new THREE.Vector3(), age: style.life, stuck: false });
    }
    // The scrape: a short hot streak along his shaft at the contact point, gone in 0.3 s.
    scrape = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.22, 0.018), new THREE.MeshBasicMaterial({ color: '#fff1c4', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    scrape.visible = false; group.add(scrape);
  };
  registerSignature({
    opponent: 'veteran', variant, name: style.name,
    when: (event) => defendedBy(event, 'Parried'),
    fire(_event, frame: SignatureFrame) {
      const root = frame.roots[OPPONENT_SIDE];
      if (!root || !segment(root, a0, a1, !style.head) || !segment(frame.roots[0], b0, b1, false)) return;
      closest(a0, a1, b0, b1, onA, onB);   // onA: where on his trident the blade bit
      ensure(root);
      shaftDir.subVectors(a1, a0).normalize();
      across.subVectors(onB, onA); if (across.lengthSq() < 1e-6) across.crossVectors(shaftDir, yAxis); across.normalize();
      const weapon = drawnOf(root)!;
      curls.forEach((c, i) => {
        const j = ++bites * 0.618 + i;
        if (c.stuck) { group!.add(c.mesh); c.stuck = false; }   // a shaving left on the tines by the last bite is reused
        c.mesh.position.copy(onA);
        c.mesh.rotation.set(j, j * 2, j * 3);
        if (i < (style.stuck ?? 0)) {
          // D: this one stays caught in the tines, riding the trident at the point it tore from (until the next bite or the fight's end).
          weapon.updateWorldMatrix(true, false);
          weapon.attach(c.mesh);
          c.stuck = true; c.age = style.life; c.mesh.visible = true;
          return;
        }
        // Torn off the far side of the contact, away from the attacker's edge, up and along the shaft (C: gently, so they stay by the head).
        c.velocity.copy(across).multiplyScalar(-(0.8 + (j % 0.9)) * style.speed).addScaledVector(shaftDir, Math.sin(j * 3.1) * 1.1 * style.speed).add(yAxis.clone().multiplyScalar((1.2 + (j % 1.1)) * style.lift));
        c.spin.set(18 * Math.sin(j * 2.3), 14 * Math.cos(j * 1.7), 16 * Math.sin(j * 4.1));
        c.age = 0; c.mesh.visible = true;
      });
      scrape!.position.copy(onA);
      scrape!.quaternion.setFromUnitVectors(yAxis, shaftDir);
      weapon.attach(scrape!);   // the scrape rides the shaft it was scored on (in world space it hung in the air once he moved)
      scrapeAge = 0;
    },
    update(dt) {
      if (scrape && scrapeAge < SCRAPE_LIFE) {
        scrapeAge += dt;
        scrape.material.opacity = Math.max(0, 1 - scrapeAge / SCRAPE_LIFE);
        scrape.visible = scrapeAge < SCRAPE_LIFE;
      }
      for (const c of curls) {
        if (c.stuck || c.age >= style.life) continue;
        c.age += dt;
        c.velocity.y -= GRAVITY * dt;
        c.mesh.position.addScaledVector(c.velocity, dt);
        if (c.mesh.position.y < 0.01) { c.mesh.position.y = 0.01; c.velocity.multiplyScalar(0.3); c.velocity.y = Math.abs(c.velocity.y) * 0.3; c.spin.multiplyScalar(0.3); }
        c.mesh.rotation.x += c.spin.x * dt; c.mesh.rotation.y += c.spin.y * dt; c.mesh.rotation.z += c.spin.z * dt;
        if (c.age >= style.life) c.mesh.visible = false;
      }
    },
    clear() {
      for (const c of curls) { if (c.stuck) { group?.add(c.mesh); c.stuck = false; } c.age = style.life; c.mesh.visible = false; }
      if (scrape) { scrapeAge = SCRAPE_LIFE; scrape.visible = false; }
    },
  });
}
bladeBite('B', { name: 'Blade Bite', count: 6, life: 1.4, radius: 0.03, tube: 0.006, body: { color: '#f2e2b8', metalness: 0.7, roughness: 0.25, emissive: '#8a6a30' }, speed: 1, lift: 1, head: false });
// C (Strategy + Lead AGAIN, 09:5xZ; replaces the ring curls, whose strip stays on evidence/): twisted steel shavings, no outline, varied
// sizes, two left caught in the tines.
bladeBite('C', { name: 'Blade Bite (shavings)', count: 7, life: 1.6, body: { color: '#c9c6bd', metalness: 0.9, roughness: 0.28, emissive: '#2a2824' }, speed: 0.5, lift: 0.6, head: true, shavings: true, stuck: 2 });
