// The gear sheet's mannequin (Fitting rail, Strategy 2026-10-01): the player's OWN rig, idle, drawn live in the sheet's stage window, so a
// stored piece tried on is the real piece on the real body. It borrows the game's renderer, scene and camera through the scene's seam
// (scene.ts gearStage: the arena hidden, one frame drawn per call; it began as the Pit room's seam) and hands them back exactly as found. The sheet is a dialog over
// the canvas, transparent where the stage is; the camera's view offset slides the rig into that window. Nothing here touches loot, the
// profile or the fight: main.ts dresses the rig (view.wear) and frame() draws it while the sheet is open. Presentation only.
import * as THREE from 'three';

export type GearStage = {
  scene: THREE.Scene; camera: THREE.PerspectiveCamera;
  setArenaVisible(on: boolean): void;
  hero: { place(x: number, z: number, heading: number, speed: number, dt: number): void };
  draw(): void;
};
export type GearRoom = { frame(dt: number): void; fit(): void; leave(): void };

const BODY = 2.15;   // m: head to boots with a little air; the framing keeps this inside the stage window
const AIM_Y = 0.98, BACKDROP = 0x0d0b09;
const TURN = 0.012;   // rad per px of a drag across the stage

// The torchlit backdrop (Strategy, concept 01): a warm glow behind the figure fading to the flat BACKDROP at the edges. Null where there is no 2D canvas.
function warmBackdrop(): THREE.CanvasTexture | null {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const g = canvas.getContext?.('2d'); if (!g) return null;
  const r = g.createRadialGradient(64, 56, 4, 64, 64, 66); r.addColorStop(0, '#4d3822'); r.addColorStop(0.5, '#21170e'); r.addColorStop(1, '#0d0b09');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

// `stage`: the element the mannequin shows through; `view`: the page size the canvas covers (the window, here).
export function enterGearRoom(stage: GearStage, window: HTMLElement, view: { width(): number; height(): number }): GearRoom {
  const { scene, camera } = stage;
  const was = { fov: camera.fov, position: camera.position.clone(), quaternion: camera.quaternion.clone(), background: scene.background, fog: scene.fog };
  stage.setArenaVisible(false);
  const glow = warmBackdrop();
  scene.background = glow ?? new THREE.Color(BACKDROP); scene.fog = null;
  // A key from the front-left and a cool rim from behind, the studio light of a fitting room; the arena's own lights stay as the fill.
  const key = new THREE.DirectionalLight(0xffe3bd, 2.4), rim = new THREE.DirectionalLight(0x9db2ff, 1.1);
  key.position.set(-1.6, 2.6, 3.2); rim.position.set(2.2, 2.2, -2.4); scene.add(key, rim);
  let heading = 0, drag: number | null = null;
  const down = (e: PointerEvent) => { drag = e.clientX; window.setPointerCapture?.(e.pointerId); };
  const move = (e: PointerEvent) => { if (drag !== null) { heading += (e.clientX - drag) * TURN; drag = e.clientX; } };
  const up = () => { drag = null; };
  window.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  // The rig fills the stage window's height: the distance is what makes BODY metres span that fraction of the page, and the view offset
  // moves the window's centre to the middle of the lens.
  const fit = () => {
    const rect = window.getBoundingClientRect(), W = view.width(), H = view.height();
    if (!(rect.width > 0 && rect.height > 0 && W > 0 && H > 0)) return;
    camera.fov = 40; camera.aspect = W / H;
    const d = BODY / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * (rect.height / H));
    camera.position.set(0, AIM_Y + 0.12, d); camera.lookAt(0, AIM_Y, 0);
    camera.setViewOffset(W, H, W / 2 - (rect.left + rect.width / 2), H / 2 - (rect.top + rect.height / 2), W, H);
    camera.updateProjectionMatrix();
  };
  fit();
  // The stage window moves when the layout above it changes (the account block answering, a longer name): refit when its box does.
  const box = () => { const r = window.getBoundingClientRect(); return `${r.left}|${r.top}|${r.width}|${r.height}`; };
  let placed = box();
  return {
    fit,
    frame(dt) { const now = box(); if (now !== placed) { placed = now; fit(); } stage.hero.place(0, 0, heading, 0, dt); stage.draw(); },
    leave() {
      window.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      camera.clearViewOffset(); camera.fov = was.fov; camera.position.copy(was.position); camera.quaternion.copy(was.quaternion); camera.updateProjectionMatrix();
      scene.remove(key, rim); key.dispose?.(); rim.dispose?.();
      scene.background = was.background; scene.fog = was.fog; glow?.dispose();
      stage.setArenaVisible(true);
    },
  };
}
