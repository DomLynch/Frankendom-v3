import * as THREE from 'three';
import type { MechanicView } from './types.ts';

// The ground line a straight-line boss move draws (Nan's Impale; any later lunge): one flat strip from the boss along its frozen direction, the same flat MeshBasicMaterial kit as the cast tell
// (boss-telegraph.ts), nothing loaded. Thin and faint while the aim still follows, wide and solid the moment it freezes (the roll window), bright through the lunge, gone after. Presentation only,
// read off the mechanic's view; one mesh made once, nothing allocated per frame.
// Every look number is a row of line-fx-defs.json (loaded below, every field checked), none is written here.
import DEFS from './line-fx-defs.json' with { type: 'json' };

type LineLook = { colour: string; followWidth: number; followWidthRise: number; followAlpha: number; lockAlpha: number; lungeAlpha: number; liftM: number; renderOrder: number; pulseBase: number; pulseDepth: number; pulseRate: number; hideBelowAlpha: number; meshName: string };
/** The one loader: a missing or out-of-range field throws at load. */
export function loadLineLook(raw: Record<string, unknown>): LineLook {
  const num = (k: string, fraction = false): number => { const v = raw[k]; if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || (fraction && v > 1)) throw Error(`line-fx-defs.json ${k}: out of range (fraction ${fraction})`); return v; };   // the finer ranges are pinned by test/mechanics-fx-rows.test.mjs
  if (typeof raw.colour !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(raw.colour)) throw Error('line-fx-defs.json colour: a #rrggbb');
  if (typeof raw.meshName !== 'string' || !raw.meshName) throw Error('line-fx-defs.json meshName: a non-empty string');
  return { colour: raw.colour, meshName: raw.meshName, followWidth: num('followWidth'), followWidthRise: num('followWidthRise'), followAlpha: num('followAlpha', true), lockAlpha: num('lockAlpha', true), lungeAlpha: num('lungeAlpha', true), liftM: num('liftM'),
    renderOrder: num('renderOrder'), pulseBase: num('pulseBase', true), pulseDepth: num('pulseDepth', true), pulseRate: num('pulseRate'), hideBelowAlpha: num('hideBelowAlpha', true) };
}
export const LINE_LOOK = loadLineLook(DEFS);

export function createLineFx(parent: THREE.Object3D) {
  const L = LINE_LOOK, material = new THREE.MeshBasicMaterial({ color: L.colour, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material);
  mesh.renderOrder = L.renderOrder; mesh.visible = false; mesh.name = L.meshName; parent.add(mesh);
  let colour = '';
  return {
    update(view: MechanicView | null, y: number, tick: number) {
      if (!view || (view.stage !== 'tell' && view.stage !== 'lunge')) { mesh.visible = false; return; }
      if (view.colour !== colour) { colour = view.colour; material.color.set(colour); }
      const lunging = view.stage === 'lunge', locked = view.lock, width = locked ? view.width : view.width * (L.followWidth + L.followWidthRise * (view.of > 0 ? Math.min(1, view.t / view.of) : 0));
      const pulse = locked && !lunging ? L.pulseBase + L.pulseDepth * Math.sin(tick * L.pulseRate) : 1;   // the frozen line breathes: it is now where the blow goes
      material.opacity = (lunging ? L.lungeAlpha * Math.max(0, 1 - view.t / Math.max(1, view.of)) : locked ? L.lockAlpha : L.followAlpha) * pulse;
      mesh.visible = material.opacity > L.hideBelowAlpha;
      mesh.position.set(view.x + view.dx * view.length * 0.5, y + L.liftM, view.z + view.dz * view.length * 0.5);
      mesh.rotation.y = Math.atan2(view.dx, view.dz);
      mesh.scale.set(width, 1, view.length);
    },
    dispose() { mesh.removeFromParent(); mesh.geometry.dispose(); material.dispose(); },
  };
}
