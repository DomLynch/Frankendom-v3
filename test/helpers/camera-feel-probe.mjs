// A numeric probe of the camera and feel rows, used by test/camera-feel-ab.test.mjs. It drives the real camera code (cameraPose, finisherSidePose, the rig over
// scripted fights, the kick table, the lens maths, the follow camera) through many states and returns every pose as plain numbers. test/fixtures/camera-feel-ab.json
// holds what the code produced BEFORE its numbers moved to data rows; the test demands the same numbers, bit for bit. Regenerate only on a deliberate retune.
import * as THREE from 'three';
import { cameraPose, finisherSidePose, createCameraRig, setFightBack, setLockFrame, setCameraPitch, setLensBoost, framingTall, framingLow, SETTLE, TOUR, INTRO } from '../../src/fight/camera.ts';
import { shoveFor } from '../../src/fight/camera-kick.ts';
import { cameraZoom, fovForZoom, wideBoost, wideRow, BASE_FOV, ZOOM_LIMITS, WIDE_LIMITS } from '../../src/fight/camera-zoom.ts';
import { createFollowCamera } from '../../src/fight/follow-camera.ts';

const r = (v) => v;   // identity: exact doubles go to JSON and come back exact
const pose = (p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, r(v)]));
const cam = (c) => { const q = c.quaternion; return [c.position.x, c.position.y, c.position.z, q.x, q.y, q.z, q.w]; };

export function probe() {
  const out = {};
  out.constants = { SETTLE: { ...SETTLE }, TOUR: { ...TOUR }, INTRO: { ...INTRO }, BASE_FOV, ZOOM_LIMITS: [...ZOOM_LIMITS], WIDE_LIMITS: JSON.parse(JSON.stringify(WIDE_LIMITS)), tall: framingTall('wraith'), low: framingLow('wolf') };

  // 1. the pure lock / walk pose over a grid
  const poses = [];
  for (const locked of [true, false]) for (const sx of [-3.1, 0, 2.7]) for (const dz of [0.3, 1.1, 2.4, 5.5]) for (const yaw of [0, 1.3, -2.2]) for (const pitch of [0.22, 0.45, 0.9]) for (const [sc, tall, low] of [[1, 0, 0], [0.78, 0, 0], [1.2, 0.35, 0], [0.8, 0, 1]]) {
    poses.push(pose(cameraPose({ x: sx, z: -dz / 2 }, yaw, pitch, locked, { x: sx + 1, z: dz / 2 + 0.7 }, sc, tall, low)));
  }
  out.poses = poses;
  setFightBack(1.1); setLockFrame(0.8, 0.35);
  out.posesScaled = [0.3, 1.6, 4].map((d) => pose(cameraPose({ x: 1, z: 1 }, 0.7, 0.45, true, { x: 1 + d, z: 1 - d / 2 }, 0.9, 0, 0)));
  setFightBack(1.3); setLockFrame(1, 0);

  // 2. the finisher side views (every finisher row that carries a side view), several aspects, big bodies and reach
  const sides = [];
  for (const f of ['decapitation', 'opened', 'hamstrung', 'execution', 'dismember']) for (const aspect of [0.46, 0.75, 1.5]) for (const [body, reach] of [[1, 0], [1.5, 0], [1, 4.2]]) for (const lens of [1, 1.35]) {
    try { sides.push(pose(finisherSidePose({ x: 0.5, z: 0 }, { x: -1.2, z: 2.1 }, aspect, f, body, reach, lens))); } catch (e) { sides.push(String(e.message)); }
  }
  out.sides = sides;

  // 3. the rig over scripted frames: orbit input, lock, finishes (posed, victim 1 and 0), tour, intro, shoves, tilts, look-foe off
  const rigs = {};
  const run = (name, script) => {
    const camera = new THREE.PerspectiveCamera(BASE_FOV, 0.46, 0.1, 100);
    const rig = createCameraRig(camera, false);
    const rec = [];
    script(rig, camera, rec);
    rigs[name] = rec;
  };
  const state = (x, z) => ({ x, z });
  run('lock', (rig, camera, rec) => {
    rig.recenter(); rig.orbit(40, -25); rig.orbit(-300, 700);
    for (let i = 0; i < 90; i++) { rig.update(1 / 60, state(0.4 * Math.sin(i / 20), 0.2 * i / 90), { x: 0.3, z: 2.5 }, true, null); rig.settle(1 / 60); if (i % 10 === 0) rec.push(cam(camera)); }
    rig.update(1 / 60, state(0, 0), { x: 1, z: 2 }, false, null); rec.push(cam(camera));
  });
  for (const fin of ['decapitation', 'opened', 'hamstrung', 'execution', 'dismember']) for (const victim of [1, 0]) {
    run(`finish-${fin}-${victim}`, (rig, camera, rec) => {
      for (let i = 0; i < 20; i++) rig.update(1 / 60, state(0, 0), { x: 0.2, z: 1.6 }, true, null);
      const base = { finisher: fin, posed: true, draw: false, victim, clock: 0, head: { x: 0.9, z: 2.2 }, big: fin === 'opened', reach: fin === 'opened' ? 3 : 0 };
      for (let i = 0; i < 1500; i++) { rig.update(1 / 30, state(0, 0), { x: 0.2, z: 1.6 }, true, { ...base, clock: Math.min(3.2, i / 30) }, 0.8, 0.2, 0, 1.2); rig.settle(1 / 30); if (i % 100 === 0 || i === 1499) rec.push([...cam(camera), rig.finishAge, rig.settled, rig.touring]); }
    });
  }
  run('finish-plain', (rig, camera, rec) => {
    for (let i = 0; i < 20; i++) rig.update(1 / 60, state(0, 0), { x: 0.2, z: 1.6 }, true, null);
    for (let i = 0; i < 700; i++) { rig.update(1 / 30, state(0, 0), { x: 0.2, z: 1.6 }, true, { finisher: null, posed: false, draw: false, victim: 1, clock: 0, head: null, big: false }); rig.settle(1 / 30); if (i % 50 === 0) rec.push([...cam(camera), rig.touring]); }
  });
  run('intro', (rig, camera, rec) => {
    rig.introTour.start();
    for (let i = 0; i < 1500; i++) { rig.update(1 / 20, state(0, 0), { x: 0, z: 3 }, true, null); if (i % 60 === 0) rec.push(cam(camera)); }
    rig.introTour.stop();
    for (let i = 0; i < 100; i++) { rig.update(1 / 20, state(0, 0), { x: 0, z: 3 }, true, null); if (i % 20 === 0) rec.push(cam(camera)); }
  });
  run('kick-tilt', (rig, camera, rec) => {
    for (let i = 0; i < 20; i++) rig.update(1 / 60, state(0, 0), { x: 0, z: 3 }, true, null);
    const events = [{ type: 'Hit', move: 'light_left' }, { type: 'Hit', charged: true }, { type: 'GuardBroken' }, { type: 'Parried', move: 'light_left' }, { type: 'Parried', move: 'light_right' }, { type: 'Blocked', perfect: true }, { type: 'Blocked', charged: true }];
    for (const [k, e] of events.entries()) {
      const s = shoveFor(e); if (!s) continue;
      rig.shove(0.4 * k, { ...s, screen: 0.01, push: 0.02 }); rig.tilt(0.1, 0.5, 0.05, 0.03);
      for (let i = 0; i < 40; i++) { rig.update(1 / 60, state(0, 0), { x: 0, z: 3 }, true, null); rig.settle(1 / 60); if (i % 8 === 0) rec.push(cam(camera)); }
    }
  });
  run('pitch-portrait', (rig, camera, rec) => {
    setCameraPitch(14, { heroY: 1.2, minEyeY: 0.8 }, { degrees: 22, belowAspect: 0.8 });
    for (let i = 0; i < 40; i++) { rig.update(1 / 60, state(0, 0), { x: 0, z: 3 }, true, null); if (i % 10 === 0) rec.push(cam(camera)); }
    camera.aspect = 1.5;
    for (let i = 0; i < 40; i++) { rig.update(1 / 60, state(0, 0), { x: 0, z: 3 }, true, null); if (i % 10 === 0) rec.push(cam(camera)); }
    setCameraPitch(null, { heroY: 1.2, minEyeY: 0.8 });
  });
  out.rigs = rigs;

  // 4. the kick table
  const events = [];
  for (const type of ['Hit', 'GuardBroken', 'Parried', 'Blocked', 'Other']) for (const charged of [false, true]) for (const move of ['light_left', 'light_right', 'heavy_overhead', 'jab']) for (const perfect of [false, true]) events.push(shoveFor({ type, charged, move, perfect }));
  out.shoves = events;

  // 5. the lens maths
  out.lens = {
    zoom: [0.5, 1, 1.1, 2].map((z) => fovForZoom(z)),
    cameraZoom: ['', '?zoom=1.3', '?zoom=9', '?zoom=0.5'].map((s) => cameraZoom(1.1, s)),
    wide: [0.46, 0.75, 0.9, 1.4, 2, 3.5].flatMap((a) => [1, 1.1].map((z) => wideBoost(a, z, { fromAspect: 0.75, toAspect: 1.5, zoom: 1.4, maxHfovDeg: 100 }))),
    wideRows: ['?wide=v1', '?wide=1.5', '?wide=1', '?wide=9', ''].map((s) => wideRow({ fromAspect: 0.75, toAspect: 1.5, zoom: 1.4, maxHfovDeg: 100 }, s)),
  };
  setLensBoost(1.2); out.sideBoost = pose(finisherSidePose({ x: 0, z: 0 }, { x: 1, z: 1 }, 0.46, 'opened', 1, 0)); setLensBoost(1);

  // 6. the follow camera: walking, combat, first person with bob
  const follow = [];
  const cc = new THREE.PerspectiveCamera(51, 0.46, 0.1, 100), fc = createFollowCamera(cc);
  const combatCam = { label: 'x', portrait: { back: 6, up: 3, side: 0.4, mid: 0.5, perSep: 0.3, perSize: 0.5, sizeFrom: 1.8, fitRate: 2, minBack: 4, maxBack: 9, shiftY: 0.1, fov: 3, zoom: 0.9, pitch: 18, pitchPerSize: 2, maxPitch: 40, ahead: 2, lookY: 1.2 }, landscape: { back: 7, up: 3.2 }, ease: { in: 4, out: 2 } };
  for (let i = 0; i < 240; i++) {
    const foe = i > 60 && i < 180 ? { x: 2, z: 5 + Math.sin(i / 10), size: 3.5 } : null;
    fc.update(1 / 60, { x: 0.01 * i, z: 0.02 * i, heading: 0.01 * i, pitch: i > 100 ? 0.4 : 0, groundY: 0.1 }, { cam: combatCam, portrait: i % 2 === 0 || i < 100, foe, zoom: 1.1, flip: i > 150 ? -1 : 1 });
    if (i % 12 === 0) follow.push([...cam(cc), fc.view.shiftY, fc.view.fov, fc.view.zoom, fc.fighting()]);
  }
  fc.update(1 / 60, { x: 0, z: 0, heading: 0, pitch: 0, groundY: 0 });   // walking
  follow.push(cam(cc));
  for (let i = 0; i < 120; i++) { fc.update(1 / 60, { x: 0.05 * i, z: 0.05 * i, heading: 0.5, pitch: 0.2, groundY: 0, fp: { eye: 1.6, fwd: 0.2, tilt: 2, down: 0.5, fovAdd: 4, bobAmp: 0.03, bobStep: 3, bobSpeedCap: 6, bobJumpM: 2, bobWalkMps: 0.5, bobFade: 8 } }); if (i % 10 === 0) follow.push([...cam(cc), fc.view.fov]); }
  out.follow = follow;
  return out;
}
