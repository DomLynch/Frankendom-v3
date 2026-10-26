// The shell's entry: V2's stage on screen with the build label. The duel driver replaces this body in the lift.
import * as THREE from 'three';
import { createStage } from './stage.js';
import { lockPageZoom, viewW, viewH } from './zoom-guard.js';

const stage = await fetch('./data/stage.json', { cache: 'no-cache' }).then((r) => r.json());
fetch('./build.txt?v=' + Date.now(), { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).then((t) => { document.getElementById('build')!.textContent = t.slice(0, 7); }).catch(() => {});

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
lockPageZoom();
renderer.setSize(viewW(), viewH(), false);
document.body.prepend(renderer.domElement);
const scene = createStage(renderer, stage);
const camera = new THREE.PerspectiveCamera(stage.camera.fov, viewW() / viewH(), stage.camera.near, stage.camera.far);
camera.position.set(...(stage.camera.position as [number, number, number]));
camera.lookAt(...(stage.camera.target as [number, number, number]));
addEventListener('resize', () => {
  renderer.setSize(viewW(), viewH(), false);
  camera.aspect = viewW() / viewH();
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
