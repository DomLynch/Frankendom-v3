import * as THREE from 'three';
import type { CombatEvent, Fighter } from './duel.ts';

// LOOK TEST behind `?look=marks` (Lead's ruling 2026-10-07, Strategy brief #1507 item 7): v1 is MIASMA ONLY. A landed Plague Doctor skill_miasma blow leaves a small poison
// icon over the victim's head and a soft green wash on his body for MARK.seconds. Presentation only, driven by the Hit event alone (the skill-impact.ts pattern): the sim has no
// status state, so there is no bleed/sunder/slow mark (it would lie), no numbers, and nothing persists past MARK.seconds. The body "tint" is a billboard glow, not a material change.
export const MARK = { seconds: 2, fade: 0.4, iconSize: 0.32, glowSize: 1.1, headRise: 0.38, glowAlpha: 0.35, torso: 1.1 } as const;   // seconds, metres (scale-1 body)
export const marksFlag = (search: string) => (new URLSearchParams(search).get('look') ?? '').split(',').includes('marks');

// The fighter the blow poisoned, or null: a landed skill_miasma Hit (a guarded one marks at half strength).
export function miasmaOf(event: CombatEvent): { target: number; strength: number } | null {
  if (event.type !== 'Hit' || event.target === undefined || event.move !== 'skill_miasma') return null;
  return { target: event.target, strength: event.guarded ? 0.5 : 1 };
}
// 1 while it lasts, easing out over the last `fade` seconds, 0 once it is over.
export const markAlpha = (left: number) => left <= 0 ? 0 : Math.min(1, left / MARK.fade);

function texture(draw: (g: CanvasRenderingContext2D, n: number) => void) {
  const n = 64, canvas = document.createElement('canvas'); canvas.width = canvas.height = n;
  draw(canvas.getContext('2d')!, n);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; return map;
}
const iconMap = () => texture((g, n) => {   // a dark disc with a sickly green drop and two bubbles
  g.fillStyle = '#10180ecc'; g.beginPath(); g.arc(n / 2, n / 2, n / 2 - 2, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#7fc23a'; g.lineWidth = 3; g.stroke();
  g.fillStyle = '#8fd13f'; g.beginPath(); g.moveTo(n / 2, 12); g.bezierCurveTo(n / 2 + 18, 32, n / 2 + 16, 50, n / 2, 50); g.bezierCurveTo(n / 2 - 16, 50, n / 2 - 18, 32, n / 2, 12); g.fill();
  g.fillStyle = '#d6f59a'; g.beginPath(); g.arc(n / 2 - 5, 38, 3, 0, Math.PI * 2); g.fill();
});
const glowMap = () => texture((g, n) => {
  const r = g.createRadialGradient(n / 2, n / 2, 2, n / 2, n / 2, n / 2);
  r.addColorStop(0, '#6fb82ccc'); r.addColorStop(0.6, '#4f9a2088'); r.addColorStop(1, '#4f9a2000'); g.fillStyle = r; g.fillRect(0, 0, n, n);
});

export function createMiasmaMark(scene: THREE.Scene) {
  let hits = 0; const left = [0, 0], power = [1, 1], icon: THREE.Sprite[] = [], glow: THREE.Sprite[] = [], iconTex = iconMap(), glowTex = glowMap();
  for (let i = 0; i < 2; i++) {
    const a = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTex, transparent: true, depthTest: false, depthWrite: false })), b = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    a.name = b.name = 'miasma mark'; a.renderOrder = 10; a.visible = b.visible = false; a.scale.setScalar(MARK.iconSize); b.scale.setScalar(MARK.glowSize); scene.add(a, b); icon.push(a); glow.push(b);
  }
  Object.assign(globalThis, { __marks: () => ({ hits, alive: left.filter((l) => l > 0).length }) });   // the stills harness proves a Miasma hit landed before it judges the frame
  return {
    fire(events: readonly CombatEvent[]): number {
      let fired = 0;
      for (const event of events) { const m = miasmaOf(event); if (m) { left[m.target] = MARK.seconds; power[m.target] = m.strength; fired++; hits++; } }
      return fired;
    },
    // heads: the head bone's world point if the rig has it; the mark follows the man, not the blow.
    update(dt: number, fighters: readonly Pick<Fighter, 'body'>[], scale: readonly number[], heads: readonly (THREE.Vector3 | null)[]) {
      for (let i = 0; i < 2; i++) {
        left[i] = Math.max(0, left[i]! - dt); const alpha = markAlpha(left[i]!) * power[i]!, on = alpha > 0 && !!fighters[i];
        icon[i]!.visible = glow[i]!.visible = on; if (!on) continue;
        const { x, z } = fighters[i]!.body, s = scale[i] ?? 1, head = heads[i];
        icon[i]!.position.set(head?.x ?? x, (head?.y ?? 1.7 * s) + MARK.headRise * s, head?.z ?? z); glow[i]!.position.set(x, MARK.torso * s, z); glow[i]!.scale.setScalar(MARK.glowSize * s);
        (icon[i]!.material as THREE.SpriteMaterial).opacity = alpha; (glow[i]!.material as THREE.SpriteMaterial).opacity = alpha * MARK.glowAlpha;
      }
    },
    alive: () => left.filter((l) => l > 0).length,
  };
}
