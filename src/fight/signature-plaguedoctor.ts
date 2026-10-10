import * as THREE from 'three';
import { weaponOf, type Direction } from './moves.ts';
import { surfaceHit } from './gore.ts';
import { hitBy, registerSignature, type MarkLook, type MarkSite, type SignatureFrame } from './signature.ts';
import type { CombatEvent, Side } from './duel.ts';

// The Plague Doctor's signature, A: Rot Bloom (docs/briefs/signature-effects.md row 9). A wound he opens grows a dark branching stain a
// hand's width round the impact, then stops: corruption under the skin. No cloud, no damage over time, nothing the sim sees. The growth is
// a transient decal on the struck bone that spreads over ROT.grow seconds; when it stops, the finished stain goes into the victim's capped
// body marks (6 at most, oldest reused) and stays the fight.
export const ROT = { size: 0.17, grow: 0.85, opacity: 0.95 } as const;   // metres across when grown; seconds to spread

// The stain, drawn once to a canvas (browser only; under node the mark is an untextured dark square): a bruised core and veins that branch
// out from it and thin to nothing, near-black purple at the heart going sickly green-black at the tips.
// A: 17 cm, the first look. B (Strategy's "again" on A: a faint smudge at 375 px): a hand's width, darker, with fewer, thicker veins so the
// branching still reads at phone distance.
export type RotStyle = { size: number; veins: number; vein: number; step: number; fade: number };
export const ROT_A: RotStyle = { size: ROT.size, veins: 8, vein: 0.075, step: 0.04, fade: 0.35 };
export const ROT_B: RotStyle = { size: 0.25, veins: 6, vein: 0.11, step: 0.055, fade: 0.1 };
const arts = new Map<RotStyle, THREE.Texture | null>();
function rotArt(style: RotStyle = ROT_A): THREE.Texture | null {
  if (arts.has(style)) return arts.get(style)!;
  const art = drawRot(style); arts.set(style, art); return art;
}
function drawRot(style: RotStyle): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const size = 256, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const c = size / 2;
  let seed = 9173;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  // Bold enough to read at ~30 px on a phone: a solid near-black core with a lumpy edge, a bruise halo, and thick veins.
  const bruise = g.createRadialGradient(c, c, 0, c, c, size * 0.42);
  bruise.addColorStop(0, 'rgba(20,6,16,1)'); bruise.addColorStop(0.35, 'rgba(38,12,32,0.9)'); bruise.addColorStop(0.7, 'rgba(46,40,26,0.45)'); bruise.addColorStop(1, 'rgba(40,40,24,0)');
  g.fillStyle = bruise; g.fillRect(0, 0, size, size);
  g.fillStyle = 'rgba(14,4,12,1)'; g.beginPath();
  for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI * 2, r = size * (0.1 + rand() * 0.06); g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r); }
  g.fill();
  g.lineCap = 'round';
  const vein = (x: number, y: number, angle: number, width: number, depth: number) => {
    for (let step = 0; step < 9 && width > 0.6; step++) {
      const length = size * (style.step + rand() * style.step);
      angle += (rand() - 0.5) * 0.9;
      const nx = x + Math.cos(angle) * length, ny = y + Math.sin(angle) * length;
      const r = Math.hypot(nx - c, ny - c) / (size * 0.5);
      if (r > 0.95) return;
      g.strokeStyle = `rgba(${Math.round(18 + 22 * r)},${Math.round(6 + 34 * r)},${Math.round(16 - 4 * r)},${(1 - style.fade * r).toFixed(2)})`;
      g.lineWidth = width; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      x = nx; y = ny; width *= 0.86;
      if (depth < 2 && rand() < 0.35) vein(x, y, angle + (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.6), width * 0.8, depth + 1);
    }
  };
  for (let i = 0; i < style.veins; i++) vein(c, c, (i / style.veins) * Math.PI * 2 + rand() * 0.5, size * style.vein, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}
export const rotLook = (fadeIn: number, style: RotStyle = ROT_A): MarkLook => ({
  width: style.size, height: style.size, map: rotArt(style), color: rotArt(style) ? '#ffffff' : '#1a0c16', opacity: ROT.opacity, roughness: 0.7, fadeIn,
});

// Where the stain shows: the fight camera sits behind and above the player he is striking, so a chest mark faces away and the facing rule
// hides it (World's Dwarf capture, 2026-09-24). A torso blow blooms on the upper arm / shoulder on the side it came from (the top of the
// shoulder for a thrust or an overhead, the side picked from the tick so a replay blooms the same one); head and legs keep the table.
export function rotSite(tick: number, location: string, direction: string): MarkSite | undefined {
  if (location !== 'torso') return undefined;
  const side = direction === 'right' ? 1 : direction === 'left' ? -1 : tick % 2 ? 1 : -1;
  const l = side > 0 ? 'l' : 'r';
  return direction === 'right' || direction === 'left'
    ? { bone: `upperarm_${l}`, dir: [side * 0.85, 0.35, -0.4], radius: 0.065 }
    : { bone: `upperarm_${l}`, dir: [side * 0.25, 0.9, -0.35], radius: 0.07 };
}

export function createRotBloom(style: RotStyle = ROT_A) {
  const material = new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, depthTest: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.7 });
  const plane = new THREE.PlaneGeometry(1, 1);
  let mesh: THREE.Mesh | null = null, bone: THREE.Object3D | null = null, age = -1;
  let pending: { victim: Side; root: THREE.Object3D; event: CombatEvent; direction: Direction; heading: number; scale: number; site: MarkSite | undefined } | null = null;
  const local = new THREE.Vector3(), normalLocal = new THREE.Vector3(), p = new THREE.Vector3(), n = new THREE.Vector3(), q = new THREE.Quaternion();
  const hide = () => { if (mesh) mesh.visible = false; age = -1; pending = null; bone = null; };
  // A stain that has finished spreading (or is cut short by the next hit) goes into the fight's capped body marks and stays.
  const settle = (frame: SignatureFrame) => {
    if (!pending) return;
    const { victim, root, event, direction, heading, scale, site } = pending;
    frame.marks.body(victim, root, { location: event.location!, direction, heading }, rotLook(0, style), scale, site);
    if (mesh) mesh.visible = false;
    age = -1; pending = null;
  };
  return {
    fire(event: CombatEvent, frame: SignatureFrame) {
      const victim = event.target, root = victim === undefined ? null : frame.roots[victim];
      if (victim === undefined || !root || !event.location || !event.move) return;
      settle(frame);
      const direction = weaponOf(frame.fighters[event.actor].weapon).moves[event.move].direction;
      const site = rotSite(event.tick, event.location, direction);
      const heading = frame.fighters[victim].body.heading;
      // The spreading stage rides the same bone the finished mark will; without a site (head, legs) the pool's own table places it at the end.
      bone = site ? root.getObjectByName(site.bone) ?? null : null;
      if (bone && site) {
        root.updateWorldMatrix(true, true);
        const out = new THREE.Vector3(...site.dir).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), heading);
        const at = bone.getWorldPosition(new THREE.Vector3()), found = surfaceHit(root, bone, out);
        const met = found && found.point.distanceTo(at) <= Math.max(0.12, site.radius * 2) * frame.scale[victim] ? found : null;
        p.copy(met ? met.point.addScaledVector(met.normal, 0.004) : at.addScaledVector(out, site.radius * frame.scale[victim]));
        n.copy(met ? met.normal : out);
        local.copy(bone.worldToLocal(p.clone()));
        normalLocal.copy(n).applyQuaternion(bone.getWorldQuaternion(q).invert()).normalize();
        if (!mesh) {
          mesh = new THREE.Mesh(plane, material); mesh.renderOrder = 3; mesh.frustumCulled = false;
          let world: THREE.Object3D = root; while (world.parent) world = world.parent;
          world.add(mesh);
        }
        material.map = rotArt(style); material.color.set(rotArt(style) ? '#ffffff' : '#1a0c16'); material.needsUpdate = true;
      }
      pending = { victim, root, event, direction, heading, scale: frame.scale[victim], site };
      age = 0;
    },
    update(dt: number, frame: SignatureFrame) {
      if (age < 0 || !pending) return;
      if (frame.yielding) { hide(); return; }
      age += dt;
      const k = Math.min(1, age / ROT.grow);
      if (mesh && bone) {
        p.copy(local); bone.localToWorld(p);
        n.copy(normalLocal).applyQuaternion(bone.getWorldQuaternion(q)).normalize();
        mesh.position.copy(p); mesh.lookAt(p.clone().add(n));
        const s = style.size * (0.2 + 0.8 * (1 - (1 - k) ** 2));   // spreads fast, then slows and stops
        mesh.scale.set(s, s, 1);
        material.opacity = ROT.opacity * Math.min(1, age / 0.1);
        mesh.visible = true;
      }
      if (k >= 1) settle(frame);
    },
    clear: hide,
  };
}

for (const [variant, style] of [['A', ROT_A], ['B', ROT_B]] as const) {
  const rot = createRotBloom(style);
  registerSignature({
    opponent: 'plaguedoctor', variant, name: variant === 'A' ? 'Rot Bloom' : 'Rot Bloom (a hand\'s width, darker)',
    blood: true,   // a gore stain on flesh: blood-off is the gore opt-out, so it stands down then (#677)
    when: (event) => hitBy(event) && !!event.location,
    fire: rot.fire, update: rot.update, clear: rot.clear,
  });
}
