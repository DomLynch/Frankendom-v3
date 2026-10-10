import * as THREE from 'three';
import { weaponOf } from './moves.ts';
import { heavyHitBy, registerSignature, type MarkLook, type MarkSite, type SignatureEffect } from './signature.ts';

// The Dwarf's signature, A: Hammer Stamp (docs/briefs/signature-effects.md row 6). A clean heavy that lands stamps the hammer's angular
// maker's mark into the struck armour or skin as a dark dent; the victim carries it for the fight (6 at most, the oldest reused). Only a
// real landed heavy (`Hit`, heavy class, by the Dwarf) stamps, and only where the sim says it landed.
// 12 cm across: 7.5 cm read as ~15 px from the fight camera at 375×812 and the pale halo was all that showed (first strip, 2026-09-24).
export const STAMP = { size: 0.12, opacity: 1, fadeIn: 0.06, tilt: 0.35 } as const;   // metres across; appears on the frame of the blow

// The mark itself: a square hammer face with a bevelled rim, a struck lozenge and a three-stroke rune in the middle, drawn once to a canvas
// (browser only; under node the mark is an untextured dark square). Dark where the steel bit, a lighter crushed rim around it, soft edge.
let art: THREE.Texture | null | undefined;
function stampArt(): THREE.Texture | null {
  if (art !== undefined) return art;
  if (typeof document === 'undefined') return (art = null);
  const size = 128, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return (art = null);
  const c = size / 2, face = size * 0.34;
  // The crushed halo round the face: the surface pushed out and scuffed, fading to nothing.
  const halo = g.createRadialGradient(c, c, face * 0.9, c, c, size * 0.5);
  halo.addColorStop(0, 'rgba(40,26,22,0.7)'); halo.addColorStop(1, 'rgba(40,26,22,0)');
  g.fillStyle = halo; g.fillRect(0, 0, size, size);
  // The face: a dark square, its rim lit on the top-left bevel and shadowed on the bottom-right, as a dent reads under the arena sun.
  g.fillStyle = 'rgba(8,6,6,1)'; g.fillRect(c - face, c - face, face * 2, face * 2);
  g.lineWidth = size * 0.05;
  g.strokeStyle = 'rgba(235,222,200,0.95)'; g.beginPath(); g.moveTo(c - face, c + face); g.lineTo(c - face, c - face); g.lineTo(c + face, c - face); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.9)'; g.beginPath(); g.moveTo(c + face, c - face); g.lineTo(c + face, c + face); g.lineTo(c - face, c + face); g.stroke();
  // The maker's mark in raised relief inside the face: a lozenge and a rune (a stave with two angled branches).
  const mark = face * 0.62;
  g.strokeStyle = 'rgba(205,188,165,0.95)'; g.lineWidth = size * 0.045; g.lineJoin = 'miter';
  g.beginPath(); g.moveTo(c, c - mark); g.lineTo(c + mark, c); g.lineTo(c, c + mark); g.lineTo(c - mark, c); g.closePath(); g.stroke();
  g.lineWidth = size * 0.04;
  g.beginPath(); g.moveTo(c, c - mark * 0.62); g.lineTo(c, c + mark * 0.62);
  g.moveTo(c, c - mark * 0.1); g.lineTo(c + mark * 0.38, c - mark * 0.46);
  g.moveTo(c, c + mark * 0.22); g.lineTo(c - mark * 0.38, c - mark * 0.14); g.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return (art = texture);
}

export const stampLook = (): MarkLook => ({
  width: STAMP.size, height: STAMP.size, map: stampArt(), color: stampArt() ? '#ffffff' : '#1c1614',
  opacity: STAMP.opacity, roughness: 0.55, metalness: 0.15, fadeIn: STAMP.fadeIn,
});

// Where the hammer's face meets him: every Dwarf heavy is an overhead (moves.ts), and an overhead hammer lands on the TOP of a shoulder, not
// the chest the blood table uses for a sword's overhead cut. The top also faces the fight camera, which sits behind and above the player the
// Dwarf is striking; a chest mark faces away from it and the facing rule hides it (first capture, 2026-09-24). The shoulder is picked from
// the tick so a replay stamps the same one. A blow the sim put on the head or legs keeps the table's site.
export function stampSite(tick: number, location: string): MarkSite | undefined {
  if (location !== 'torso') return undefined;
  const side = tick % 2 ? 1 : -1;
  return { bone: side > 0 ? 'upperarm_l' : 'upperarm_r', dir: [side * 0.25, 0.9, -0.35], radius: 0.07 };
}

// Both variants stamp the same way at the same shoulder site; only the mark's art and size differ.
const stamp = (lookOf: () => MarkLook): SignatureEffect['fire'] => (event, { fighters, roots, scale, marks }) => {
  const victim = event.target, root = victim === undefined ? null : roots[victim];
  if (victim === undefined || !root || !event.location || !event.move) return;
  const direction = weaponOf(fighters[event.actor].weapon).moves[event.move].direction;
  // A slight tilt per stamp, seeded from the tick so a replay stamps the same way.
  const look = lookOf(); look.tilt = ((Math.imul(event.tick, 2654435761) >>> 0) / 4294967296 * 2 - 1) * STAMP.tilt;
  marks.body(victim, root, { location: event.location, direction, heading: fighters[victim].body.heading }, look, scale[victim], stampSite(event.tick, event.location));
};

registerSignature({ opponent: 'dwarf', variant: 'A', name: 'Hammer Stamp', when: heavyHitBy, fire: stamp(stampLook) });

// Variant B (Lead's prep for Dom's pick, 2026-09-24, not ruled): the same blow as a bruise, not a brand. About twice A's size, a DARK
// bruised square impression with a slightly lighter crushed rim, and no bright outline and no rune: nothing on it catches the eye as white.
export const STAMP_B = { size: 0.24 } as const;   // metres across
let bruiseArt: THREE.Texture | null | undefined;
function bruiseTexture(): THREE.Texture | null {
  if (bruiseArt !== undefined) return bruiseArt;
  if (typeof document === 'undefined') return (bruiseArt = null);
  const size = 128, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return (bruiseArt = null);
  const c = size / 2, face = size * 0.3;
  // The rim: the flesh or leather crushed up round the face, a little lighter than the pit, fading out soft.
  const rim = g.createRadialGradient(c, c, face * 0.95, c, c, size * 0.5);
  rim.addColorStop(0, 'rgba(92,52,50,0.85)'); rim.addColorStop(0.55, 'rgba(70,40,42,0.45)'); rim.addColorStop(1, 'rgba(60,34,36,0)');
  g.fillStyle = rim; g.fillRect(0, 0, size, size);
  // The pit: a dark bruised square, deepest in the middle, its edge softened so it reads as a dent and not a sticker.
  g.filter = 'blur(2px)';
  const pit = g.createRadialGradient(c, c, 0, c, c, face * 1.35);
  pit.addColorStop(0, 'rgba(18,8,12,1)'); pit.addColorStop(0.7, 'rgba(34,16,22,1)'); pit.addColorStop(1, 'rgba(48,24,30,1)');
  g.fillStyle = pit; g.fillRect(c - face, c - face, face * 2, face * 2);
  g.filter = 'none';
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return (bruiseArt = texture);
}
export const bruiseLook = (): MarkLook => ({
  width: STAMP_B.size, height: STAMP_B.size, map: bruiseTexture(), color: bruiseTexture() ? '#ffffff' : '#1a0e10',
  opacity: STAMP.opacity, roughness: 0.75, metalness: 0, fadeIn: STAMP.fadeIn,
});
registerSignature({ opponent: 'dwarf', variant: 'B', name: 'Hammer Stamp (bruise)', when: heavyHitBy, fire: stamp(bruiseLook) });

// Variant C, second concept (Strategy's one new-concept pass, 2026-09-24, replacing the struck face at 402d5cb8; A, B and that C all read as a printed shape, a hole or a smudge): a hammer-blow WOUND
// on flesh, not a mark. Mottled dark red and purple, blotches of broken vessels, the skin split round the rim with raw red and a few beads
// of blood. The hammer's octagon shows only in that split outline, never as a flat fill. Seeded, so every wound looks the same.
export const STAMP_C = { size: 0.26, fadeIn: 0.12 } as const;
let woundArt: THREE.Texture | null | undefined;
function woundTexture(): THREE.Texture | null {
  if (woundArt !== undefined) return woundArt;
  if (typeof document === 'undefined') return (woundArt = null);
  const size = 256, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return (woundArt = null);
  let seed = 0x9e3779b9;
  const rand = () => ((seed = Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5 | 0) >>> 0) / 4294967296;
  const c = size / 2, r = size * 0.3;
  const blot = (x: number, y: number, rad: number, rgb: string, a: number) => {
    const s = g.createRadialGradient(x, y, 0, x, y, rad);
    s.addColorStop(0, `rgba(${rgb},${a})`); s.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = s; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  };
  // The swelling round it: a wide purple-red flush that fades into the skin, deeper toward the blow.
  blot(c, c, size * 0.5, '96,22,48', 0.75);
  // Broken vessels: mottled blotches of red, plum and near-black, heaviest inside the octagon, thinning out past it.
  const tones = ['120,14,24', '88,16,56', '52,8,30', '150,26,30', '70,10,40'];
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r * 1.25;
    blot(c + Math.cos(a) * d, c + Math.sin(a) * d, size * (0.03 + rand() * 0.07), tones[i % tones.length], 0.45 + rand() * 0.45);
  }
  // The octagon, only as a broken-skin outline: a jagged raw-red split, darker on the struck side, with a paler torn lip and blood beads.
  const corner = (k: number) => { const a = Math.PI / 8 + k * Math.PI / 4; return [c + Math.cos(a) * r, c + Math.sin(a) * r] as const; };
  for (let k = 0; k < 8; k++) {
    const [x0, y0] = corner(k), [x1, y1] = corner(k + 1);
    if (rand() < 0.18) continue;   // the skin holds in places: the split is broken, not a drawn ring
    const steps = 6;
    g.beginPath(); g.moveTo(x0, y0);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, j = (rand() - 0.5) * size * 0.022;
      g.lineTo(x0 + (x1 - x0) * t + j, y0 + (y1 - y0) * t + j);
    }
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(214,150,130,0.55)'; g.lineWidth = size * 0.035; g.stroke();   // the torn lip, lifted and pale
    g.strokeStyle = k < 4 ? 'rgba(60,0,8,0.95)' : 'rgba(150,8,16,0.95)'; g.lineWidth = size * 0.018; g.stroke();   // the split itself
    if (rand() < 0.7) blot(x0 + (x1 - x0) * 0.5, y0 + (y1 - y0) * 0.5 + size * 0.02, size * 0.025, '170,10,18', 0.95);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return (woundArt = texture);
}
export const woundLook = (): MarkLook => ({
  width: STAMP_C.size, height: STAMP_C.size, map: woundTexture(), color: woundTexture() ? '#ffffff' : '#5a0e1c',
  opacity: STAMP.opacity, roughness: 0.45, metalness: 0, fadeIn: STAMP_C.fadeIn,
});
registerSignature({ opponent: 'dwarf', variant: 'C', name: 'Hammer Wound', blood: true, when: heavyHitBy, fire: stamp(woundLook) });   // a flesh wound: stands down with blood off (#677)
