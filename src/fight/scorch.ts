import * as THREE from 'three';
import type { CombatEvent, Fighter } from './duel.ts';
import { weaponOf } from './moves.ts';
import type { MarkLook, SignatureMarks } from './signature.ts';

// Presentation only: the Witch-fire's scorch (Strategy via Lead, 2026-09-25: "the hit leaves a mark"). A Witch-fire that LANDS (a `Hit` of
// `skill_witchfire`, either side) burns a charred patch onto the struck fighter where the sim says it landed, and he carries it for the
// fight: the signature mark pool's body slots (6 per body, the oldest reused, cleared with the wounds at fight end). A blocked, parried or
// whiffed cast leaves nothing. Charred black at the heart, a ring of the witch-green still smouldering at its edge, so the mark says whose
// fire it was, never a bruise or a blood stain (it is not blood: it shows with blood off).
// 0.36 m with a pale ash halo: at 0.24 m, char alone vanished on the Witch's dark robe and only a thin green ring read (375 still, 2026-09-25).
export const SCORCH = { size: 0.36, opacity: 0.95, fadeIn: 0.08, tilt: 0.6 } as const;   // metres across; it chars over the gout's first frames

let art: THREE.Texture | null | undefined;
function scorchArt(): THREE.Texture | null {
  if (art !== undefined) return art;
  if (typeof document === 'undefined') return (art = null);
  const size = 128, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return (art = null);
  const c = size / 2;
  // The ash halo: burnt cloth and skin go pale grey at the edge of a burn, which is what lets the char read on a dark robe or plate.
  const ash = g.createRadialGradient(c, c, size * 0.2, c, c, size * 0.5);
  ash.addColorStop(0, 'rgba(150,150,140,0.85)'); ash.addColorStop(0.6, 'rgba(120,122,112,0.55)'); ash.addColorStop(1, 'rgba(110,110,100,0)');
  g.fillStyle = ash; g.fillRect(0, 0, size, size);
  // An irregular burn: a blotch of overlapping soot discs (seeded, so every scorch is the same art; the tilt varies it).
  let seed = 11; const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let k = 0; k < 14; k++) {
    const a = random() * Math.PI * 2, d = random() * size * 0.12, r = size * (0.1 + random() * 0.12), x = c + Math.cos(a) * d, y = c + Math.sin(a) * d;
    const soot = g.createRadialGradient(x, y, 0, x, y, r);
    soot.addColorStop(0, 'rgba(10,9,8,0.85)'); soot.addColorStop(0.7, 'rgba(22,18,14,0.5)'); soot.addColorStop(1, 'rgba(30,24,18,0)');
    g.fillStyle = soot; g.fillRect(0, 0, size, size);
  }
  // Smouldering cracks: jagged lines radiating out of the char, each still glowing witch-green, forked once, of varied reach, so the mark
  // reads as a burn eating outward (concentric arcs read as a targeting reticle, 375 still 2026-09-25). Then a scatter of live ember specks.
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (let k = 0; k < 8; k++) {
    const a0 = (k / 8) * Math.PI * 2 + (random() - 0.5) * 0.6, reach = size * (0.22 + random() * 0.2);
    g.strokeStyle = `rgba(${120 + Math.round(random() * 60)},255,${80 + Math.round(random() * 40)},0.95)`;
    g.lineWidth = size * (0.018 + random() * 0.016);
    g.beginPath();
    let x = c + Math.cos(a0) * size * 0.05, y = c + Math.sin(a0) * size * 0.05, a = a0; g.moveTo(x, y);
    for (let step = 0; step < 4; step++) {
      a += (random() - 0.5) * 0.9; const l = reach / 4; x += Math.cos(a) * l; y += Math.sin(a) * l; g.lineTo(x, y);
      if (step === 1) { const fork = a + (random() < 0.5 ? -0.8 : 0.8); g.moveTo(x, y); g.lineTo(x + Math.cos(fork) * l * 1.2, y + Math.sin(fork) * l * 1.2); g.moveTo(x, y); }
    }
    g.stroke();
  }
  for (let k = 0; k < 22; k++) {
    const a = random() * Math.PI * 2, d = size * (0.08 + random() * 0.3), r = size * (0.008 + random() * 0.014);
    g.fillStyle = `rgba(170,255,120,${0.6 + random() * 0.4})`; g.beginPath(); g.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, r, 0, Math.PI * 2); g.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return (art = texture);
}

export const scorchLook = (tick: number): MarkLook => ({
  width: SCORCH.size, height: SCORCH.size, map: scorchArt(), color: scorchArt() ? '#ffffff' : '#141210',
  opacity: SCORCH.opacity, roughness: 0.95, metalness: 0, fadeIn: SCORCH.fadeIn,
  tilt: ((Math.imul(tick, 2654435761) >>> 0) / 4294967296 * 2 - 1) * SCORCH.tilt,   // seeded from the tick: a replay scorches the same way
});

export const scorches = (event: CombatEvent): boolean => event.type === 'Hit' && event.move === 'skill_witchfire' && event.target !== undefined && !!event.location;

// Burn this frame's landed Witch-fires onto their targets. `roots` and `scale` per side, as the signature frame carries them.
export function scorch(events: readonly CombatEvent[], fighters: readonly Fighter[], roots: readonly (THREE.Object3D | null)[], scale: readonly number[], marks: Pick<SignatureMarks, 'body'>): number {
  let burnt = 0;
  for (const event of events) {
    if (!scorches(event)) continue;
    const victim = event.target as 0 | 1, root = roots[victim], attacker = fighters[event.actor];
    if (!root || !attacker) continue;
    const direction = weaponOf(attacker.weapon).moves.skill_witchfire.direction;
    if (marks.body(victim, root, { location: event.location!, direction, heading: fighters[victim].body.heading }, scorchLook(event.tick), scale[victim])) burnt++;
  }
  return burnt;
}
