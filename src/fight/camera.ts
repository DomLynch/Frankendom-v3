// The duel camera: the pure pose functions (orbit/lock framing and the finisher side view), and the rig that owns the camera's
// state across frames — yaw/pitch, the settle lerp, the camera kick, the authorized finisher push-in and the side-view reveal.
// The rig reads simulation positions and the scene's finisher facts as plain data; it never reaches into rigs, blood or wounds.
import * as THREE from 'three';
import { PLAY_SCALE, TARGET, wrapAngle, type State } from './sim.ts';
import type { Shove } from './camera-kick.ts';
import type { FinisherId } from './finishers.ts';

const LOOK_FOE = /[?&]look=foe(?:&|$)/.test(typeof location === 'undefined' ? '' : location.search);

const AIM_PER_SHRINK = 1.4;   // metres of look-point shift toward the camera per unit the play circle shrinks (0.9 m at 0.36)
// How tall each foe LOOKS against a man's, for the camera only. The sim's `scale` (moves.ts OPPONENTS[id].scale) is a hitbox/rate number and stays put (it is in the record's
// SIM_FILES); a foe whose body is not a man's by that number says so here. The Ash Wolf is ~.8 m at the back (the sim says .8 for its rates): behind the hero's head at bite range
// without this. The Wraith is a tall rig whose head and scythe tip left the top of the lock frame. Every other foe is absent: the sim scale it always had.
export const FRAMING_LOW: Readonly<Record<string, number>> = { wolf: 1 };   // a low quadruped (units of the LOW_* terms): the lock steps over the hero's shoulder and lifts at every gap, because the short-foe rule below only reacts to a MAN being hidden at this gap and the wolf is still behind the hero's head
export const FRAMING_TALL: Readonly<Record<string, number>> = { wraith: 0.35 };   // looks taller (a man's height 1 + this) and carries a long weapon: the lock backs off and up (the sim scale of foes above a man, 1.03-1.36, frames as a man and stays so)
export const framingLow = (id: string): number => FRAMING_LOW[id] ?? 0;
export const framingTall = (id: string): number => FRAMING_TALL[id] ?? 0;
const LOW_SIDE = 0.5,   // metres beside the hero's spine that the lock camera's line to a low foe passes, per unit of FRAMING_LOW (the hero's shoulders are ~.25 either side)
  LOW_LIFT = 0.8,   // metres the lock camera rises for it
  TALL_BACK = 2.4,   // metres the lock camera backs off, per unit of foe height above a man's, so his head and weapon tip stay in the frame
  TALL_LIFT = 1.6;   // ...and rises
const SHOULDER = 1.5,   // the player's shoulder height (m): what hides the opponent in the lock frame
  SIDE_CLEAR = 1.2,   // metres beside the player's spine, per unit of opponent scale below 1, that the lock camera's line to him passes
  SHORT_FADE = 1;   // seconds for those short-opponent terms to ease out once a finish begins (inside SETTLE.min)
export function cameraPose(
  state: State,
  yaw: number,
  pitch: number,
  locked: boolean,
  target: { x: number; z: number } = TARGET,
  targetScale = 1,   // the opponent's standing height against a man's (moves.ts OPPONENTS[id].scale)
  targetTall = 0,   // a foe that looks taller than a man (framingTall): units of extra height; 0 for every foe but the Wraith
  targetLow = 0,   // a low quadruped (framingLow): 0 for every foe but the Ash Wolf
) {
  const distance = Math.hypot(state.x - target.x, state.z - target.z);
  // Duel lock sits ~30% closer and lower than the first pass; the distance terms still pull back to frame both fighters.
  const low = locked ? targetLow : 0, tall = locked ? targetTall : 0;   // a foe that looks tall (the Wraith): back off and up; nothing for any other foe
  const back = (locked ? Math.max(4.2, distance * 0.62 + 2.8) : 7.5 * Math.cos(pitch)) + tall * TALL_BACK;   // the original lock (Dom 2026-10-05 chose it over the 10-03 flatter one: HUD over sand, not the painting)
  let x = state.x + Math.sin(yaw) * back,
    z = state.z + Math.cos(yaw) * back,
    y = (locked ? Math.max(3.2, distance * 1.3) : 1 + 7.5 * Math.sin(pitch)) + tall * TALL_LIFT;
  // A shorter opponent (Goblin, Dwarf at .78) stands behind the player's back at close range. Where a man at this gap would be
  // hidden below the player's shoulders, step the lock camera over the player's left shoulder so the line to him passes
  // SIDE_CLEAR per unit of missing height beside the player's spine; nothing for a man or a bigger one, nothing once in the clear.
  const gap = Math.max(distance, 0.8), short = locked ? Math.max(0, 1 - targetScale) : 0;
  const hiddenAt = (near: number) => Math.max(0, y - (y - SHOULDER) * (near + gap) / near);   // a man at this gap is hidden below this height
  if (short) {
    const side = SIDE_CLEAR * short * Math.min(1, hiddenAt(back)) * (back + gap) / gap;
    x -= Math.cos(yaw) * side;
    z += Math.sin(yaw) * side;
  }
  if (low) {   // a low foe: the line from the camera to him passes LOW_SIDE beside the spine at any gap (camera offset = that x (back + gap) / gap)
    const side = LOW_SIDE * low * (back + gap) / gap;
    x -= Math.cos(yaw) * side;
    z += Math.sin(yaw) * side;
  }
  // Camera stays inside the colonnade even when the fighter reaches the arena edge.
  const radius = Math.hypot(x, z);
  if (radius > 11.5) {
    x *= 11.5 / radius;
    z *= 11.5 / radius;
  }
  y += low * LOW_LIFT;
  // ...and lift it until the same share of him clears the shoulders as would of a man at this gap.
  if (short) {
    const near = Math.abs(Math.sin(yaw) * (x - state.x) + Math.cos(yaw) * (z - state.z)) || back;   // distance behind the player
    y += short * hiddenAt(near) * near / gap;
  }
  // In a smaller arena (play-radius.ts) the lock looks a little nearer to the camera, so the player stands higher on the phone, clear of the Slash and Roll buttons, with the backdrop still above the wall.
  const aim = locked ? AIM_PER_SHRINK * (1 - PLAY_SCALE) : 0;
  return {
    x,
    y,
    z,
    lookX: locked ? (state.x + target.x) / 2 + Math.sin(yaw) * aim : state.x,
    lookZ: locked ? (state.z + target.z) / 2 + Math.cos(yaw) * aim : state.z,
  };
}

// Late finisher reveal: a three-quarter side view, fitted to the phone's horizontal field of view.
// Choose the inward side from the frozen duel positions so the camera cannot switch sides as the corpse moves.
export function finisherSidePose(
  killer: { x: number; z: number },
  fallen: { x: number; z: number },
  aspect: number,
  finisher: 'runThrough' | 'splitCrown' | 'opened' = 'runThrough',
  bodyScale = 1,
  reach = 0,   // Opened: farthest horizontal extent of any landed piece from the fallen's origin (0 = not measured)
) {
  const dx = fallen.x - killer.x,
    dz = fallen.z - killer.z,
    gap = Math.hypot(dx, dz) || 1;
  const ux = dx / gap,
    uz = dz / gap,
    lookX = (killer.x + fallen.x) / 2,
    lookZ = (killer.z + fallen.z) / 2;
  // Split Crown (owner 2026-09-20): the seam runs front-to-back over a head that bows toward the killer, so a profile
  // hides it — a raised front-quarter (45°, higher eye) looks down onto the opened crown past the killer's shoulder.
  const angle = finisher === 'splitCrown' ? Math.PI / 4 : finisher !== 'runThrough' ? Math.PI / 3 : (5 * Math.PI) / 12,
    sideward = Math.sin(angle),
    rearward = Math.cos(angle);
  // Horizontal half-width the phone must show: the killer→fallen axis seen at `angle` is foreshortened to gap/2·sin(angle),
  // and what lies beyond the fallen — a fixed body margin, or the measured reach of the pieces / the fallen rig — is not.
  // Asking for the unforeshortened gap pushed a large body's fit past the 11.5 m arena clamp near the wall, where the clamp
  // then silently undid the fit (release check 17 on fdd6032: Executioner, heading-π kill by the wall).
  const beyond = finisher === 'opened' ? Math.max(1.5 * bodyScale, reach + 0.3) : 0.42;
  const back = Math.max(
    finisher === 'opened' ? 5.2 : 3.8,
    ((gap / 2) * sideward + beyond) / (Math.tan((51 * Math.PI) / 360) * Math.min(aspect, 1)),
  );
  const side = (sign: number, front = 1) => ({
    x: lookX + (-uz * sign * sideward - ux * rearward * front) * back,
    y: finisher === 'opened' ? 3.7 + 3 * (bodyScale - 1) : finisher === 'splitCrown' ? 4.2 : 3.1,
    z: lookZ + (ux * sign * sideward - uz * rearward * front) * back,
    lookX,
    lookY: 0.85,
    lookZ,
  });
  // Large halves and a body lying full-length need the inward front-quarter options when the kill lands by the wall;
  // clamping an outward rear view alone squeezes the corpse out of the portrait frame.
  const candidates =
    (finisher === 'opened' && bodyScale > 1) || reach > 0
      ? [side(1), side(-1), side(1, -1), side(-1, -1)]
      : [side(1), side(-1)];
  const pose = candidates.reduce((best, p) => (Math.hypot(p.x, p.z) < Math.hypot(best.x, best.z) ? p : best));
  const radius = Math.hypot(pose.x, pose.z);
  if (radius > 11.5) {
    pose.x *= 11.5 / radius;
    pose.z *= 11.5 / radius;
  }
  return pose;
}

// What the camera needs to know about a finish, as data. `finisher` is the resolved presentation (null for a plain death), `posed`
// whether it has a FINISHER_POSE, `victim` who fell, `clock` the slowed finisher clock, `head` the severed head's ground position
// when there is one (the look centres between corpse and head), `big` the large-bodied creatures (a wider side view).
export type CameraFinish = {
  finisher: FinisherId | null;
  posed: boolean;
  draw: boolean;
  victim: number;
  clock: number;
  head: { x: number; z: number } | null;
  big: boolean;
  // Opened (2026-09-21): how far, horizontally, the farthest settled piece (torso, legs, dropped weapon) reaches from the
  // fallen fighter's origin — measured from the pieces' world bounds, never shrinking, so the side view fits what actually
  // landed. A fixed margin let a large body's legs slide under the portrait controls (release check 17 on 54d2c70).
  reach?: number;
};

// Reduced motion: no finisher push-in, no side-view reveal. The camera kick stays ON (owner ruling 2026-09-29, always on: every hit's
// feedback behaves the same on every phone).
const prefersStillCamera = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Arena cam after the kill (owner 2026-09-20; retimed 2026-09-22 to Strategy's decision: the player always gets at least
// TOUR.afterSettle seconds of readable end-of-fight text before the tour, so it starts off the settle latch below, not a fixed
// delay — the finisher's own push-in and reveal are long done by then. The camera drifts: a slow orbit around the fallen that
// breathes in and out and rises toward a wider view of the ring, looping until Rematch. Slow moves, never a cut. The orbit
// starts from wherever the camera stands, so there is no jump. Any touch on the arena stops it for that finish (the player
// wants to look for themselves). On the player's own death it runs lower. A draw has no fallen to circle; reduced motion keeps
// the frame still. TOUR.delay is now only the fallback start time for the rare case `settled` never latches this finish.
export const TOUR = { delay: 5, afterSettle: 3, blendIn: 3, lap: 40, breathe: 25, rise: 30, radius: 5.2, breath: 1.3, lookY: 0.7, lookYPortrait: 1.3 } as const;   // seconds and metres
// lookYPortrait (Lead ruling 2026-09-26, E2 kill-cam option 2): on a portrait screen the E2 loot card fills the top band down to
// y 455 of 812, and a look at 0.7 m put the fallen at screen centre (~y 406), under the card: the Goblin decap stump from 6 s. Looking
// at 1.3 m drops him ~90 px, below the card. Landscape keeps 0.7.
// When the end-of-fight text may appear (owner 2026-09-22: nothing over the body until the finisher camera has settled). The
// finishers move the camera on different clocks (the push-in ends at 1.3 s / 0.75; the side-view reveals end anywhere from
// ~1.4 s to the full finisher clock ~3.2 s; a plain death or reduced motion moves it not at all), and the position trails its
// target by ~0.125 s, so `settled` measures the camera itself: it latches once the finish is SETTLE.min seconds old and the
// camera has moved slower than SETTLE.speed for SETTLE.still seconds, and stays latched until the finish clears. `settledAt`
// records the finish age at first latch — the arena cam starts TOUR.afterSettle seconds later, and moving again itself does
// not unsettle the latch. The HUD reads `settled`, `touring` and `finishAge`.
export const SETTLE = { min: 1.5, still: 0.4, speed: 0.02 } as const;   // seconds, seconds, metres per second
export function createCameraRig(camera: THREE.PerspectiveCamera, still = prefersStillCamera()) {
  let finishPush = 0; // the authorized slow dolly over the death window (0 = off; respects prefers-reduced-motion)
  let shortFade = 1; // share of the short-opponent lock terms (cameraPose targetScale) in use: 1 in the fight, easing to 0 once a finish begins
  let finishAge = 0, tourStopped = false, tourAngle: number | null = null, tourBegan: number | null = null;   // the stop-on-touch, the orbit angle it started from, and the finish age it started at (captured once — settledAt can still move after the tour is already running, on a slow reveal past TOUR.delay, and must not restart it)
  let stillFor = 0, settled = false, settledAt: number | null = null;   // how long the drawn camera has been (nearly) motionless, the settle latch, and the finish age it latched at
  const lastDrawn = new THREE.Vector3();
  const desired = new THREE.Vector3(),
    look = new THREE.Vector3(),
    aim = new THREE.Vector3(0, 1, 0),
    eyeTarget = new THREE.Vector3(),
    lookTarget = new THREE.Vector3();   // scratch for the finisher-side, tour and gate-walk targets: set and consumed within the frame, never kept
  let yaw = 0,
    pitch = 0.45,
    started = false;
  // Camera kick: a blow nudges the camera a few centimetres along the blow's heading and it settles in ~0.15 s. Small on purpose
  // (readable brutality: nothing may obscure a pose); off when the viewer prefers reduced motion. Placeholder for the visual lane's impact pass.
  // The kick is a world-space offset scaled by `kick` (1 → 0): a landing blow drops the camera and shoves it a little along the blow; a parry
  // flicks it sideways with the deflection. A push along the blow alone is a dolly down the view axis and reads as nothing on screen.
  let kick = 0,
    kickHold = 0, // a heavy-class contact holds its full displacement for two frames before settling: the weight lands, then the camera recovers
    kickRate = 1 / 0.15, // 1/s: how fast the offset settles
    shoved = 0; // the kick applied to the camera for the last draw; taken off before the next frame's settle so it never compounds
  const kickOffset = new THREE.Vector3(), screenRight = new THREE.Vector3();
  // The roll tumble (hit-impact.ts ROLL_TUMBLE): a roll about the view axis plus a shift along the camera's right and a dip, all on one
  // up-and-back envelope over `tiltFor` seconds. lookAt resets the rotation every frame and the shift comes off before the settle: nothing compounds.
  let tiltAngle = 0, tiltFor = 0, tiltAge = 0, swayRight = 0, swayDrop = 0;
  const swayApplied = new THREE.Vector3();
  return {
    camera,
    get yaw() {
      return yaw;
    },
    // True once the first frame has been placed: until then the camera snaps instead of settling, and there is no camera to cull against.
    get started() {
      return started;
    },
    orbit(dx: number, dy: number) {
      yaw -= dx * 0.005;
      pitch = THREE.MathUtils.clamp(pitch + dy * 0.003, 0.22, 0.9);
    },
    recenter() {
      yaw = 0;
      pitch = 0.45;
      started = false;
    },
    // A touch on the arena after the kill: the player takes the camera back for the rest of this finish.
    stopTour() {
      tourStopped = true;
    },
    get touring() {
      return tourAngle !== null;
    },
    // Seconds since the finish began (0 outside a finish) and whether the finisher camera has settled (see SETTLE).
    get finishAge() {
      return finishAge;
    },
    get settled() {
      return settled;
    },
    // A contact's kick (camera-kick.ts's table) along `heading`: a landed blow carries its own heading; a block or parry takes the attacker's.
    shove(heading: number, shove: Shove) {
      kickOffset.set(Math.sin(heading) * shove.along + Math.cos(heading) * shove.side, -shove.drop, Math.cos(heading) * shove.along - Math.sin(heading) * shove.side);
      if (shove.screen) kickOffset.addScaledVector(screenRight.setFromMatrixColumn(camera.matrixWorld, 0), shove.screen);   // hit-impact.ts: across the frame
      if (shove.push) kickOffset.addScaledVector(screenRight.setFromMatrixColumn(camera.matrixWorld, 2), -shove.push);   // and along the view (+ = in)
      kick = 1;
      kickHold = shove.hold;
      kickRate = 1 / shove.settle;
    },
    // Lean the frame `angle` radians about the view axis (+ = counter-clockwise), shift it `right` metres along the camera's right and dip it
    // `drop`, easing in and back out over `seconds`.
    tilt(angle: number, seconds: number, right = 0, drop = 0) { tiltAngle = angle; tiltFor = seconds; tiltAge = 0; swayRight = right; swayDrop = drop; },
    // Place the camera for this frame: lock or orbit framing, the finisher push-in, the side-view reveal, then the settle and the kick.
    update(dt: number, state: State, enemy: { x: number; z: number }, locked: boolean, finish: CameraFinish | null, enemyScale = 1, enemyTall = 0, enemyLow = 0) {
      const blend = 1 - Math.exp(-dt * 8);
      if (locked) {
        const lockYaw = Math.atan2(state.x - enemy.x, state.z - enemy.z);
        yaw += wrapAngle(lockYaw - yaw) * blend;
      }
      // A finish frames itself (push-in, side reveal, tour), tuned on a man-height lock: the short-opponent lift and shoulder step
      // ease out over SHORT_FADE once it begins, so the kill settles on the same frame as for a man (release row 25).
      shortFade = finish ? Math.max(0, shortFade - dt / SHORT_FADE) : 1;
      const shortShare = shortFade * shortFade * (3 - 2 * shortFade);   // smoothstep: no kink where the ease starts or ends
      const cameraTarget = cameraPose(state, yaw, pitch, locked, enemy, 1 - (1 - enemyScale) * shortShare, enemyTall * shortShare, enemyLow * shortShare);
      look.set(cameraTarget.lookX, locked ? 0.8 : 1, cameraTarget.lookZ);
      desired.set(cameraTarget.x, cameraTarget.y, cameraTarget.z);
      // The authorized slow push-in over the death window (finishers & gore 2026-09-17): a dolly toward the fallen, never a cut,
      // never an FOV change. Off when the viewer prefers reduced motion; the frame loop's hit-stop stays the one impact pause.
      // Paced to the slowed finisher clock (1.3 s / 0.75); a plain-death pick gets no dolly — an ordinary kill stays ordinary.
      if (finish && finish.posed && !finish.draw && !still)
        finishPush = Math.min(1, finishPush + dt / (1.3 / 0.75));
      else if (!finish) finishPush = 0;
      if (finishPush > 0) {
        const fallen = finish!.victim === 1 ? enemy : state;
        const killer = finish!.victim === 1 ? state : enemy;
        // Owner phone review 2026-09-20: Decapitation keeps its front view — no push-in and no look change, so the
        // detached head stays in frame (#167) — but slides to camera-right so the killer's back stops hiding the corpse.
        const push = finish!.finisher === 'decapitation' ? 0 : 0.38,
          slide = finish!.finisher === 'decapitation' ? 0.8 : 0.95,
          turn = finish!.finisher === 'decapitation' ? 0.85 : 0.6;
        desired.x += (fallen.x - desired.x) * push * finishPush;
        desired.z += (fallen.z - desired.z) * push * finishPush;
        // Framing tune (same authorized dolly — still no cut, no FOV, no slow-mo): slide the camera laterally off the
        // killer→fallen axis and a touch higher, so the settled frame reads the kneeling corpse past the killer's
        // shoulder instead of hiding it behind his back.
        const axisX = fallen.x - killer.x,
          axisZ = fallen.z - killer.z,
          axisLen = Math.hypot(axisX, axisZ) || 1;
        desired.x += (-axisZ / axisLen) * slide * finishPush;
        desired.z += (axisX / axisLen) * slide * finishPush;
        // The look turns onto the fallen for every finisher: with the slide, the killer reads left and the corpse centre.
        // Decapitation looks at the midpoint of corpse and severed head — the head lands beside the corpse wherever the
        // blow sent it, and framing the corpse alone left it at the portrait edge (deploy gate, trunk 63f4cd9).
        const head = finish!.head;
        const focusX = head ? (fallen.x + head.x) / 2 : fallen.x,
          focusZ = head ? (fallen.z + head.z) / 2 : fallen.z;
        look.x += (focusX - look.x) * turn * finishPush;
        look.z += (focusZ - look.z) * turn * finishPush;
        if (push) {
          desired.y += (1.55 - desired.y) * 0.3 * finishPush;
          look.y += (0.8 - look.y) * 0.7 * finishPush;
        }
      }
      const finisher = finish?.finisher ?? null;
      if (
        locked &&
        !still &&
        finish?.victim === 1 &&
        (finisher === 'runThrough' ||
          finisher === 'splitCrown' ||
          finisher === 'opened' ||
          finisher === 'hamstrung' ||
          finisher === 'execution')
      ) {
        // Hamstrung opens early (both blows land low, inside the first 0.64 of the clock) and takes Opened's raised three-quarter view; Execution takes the same one.
        const t = THREE.MathUtils.clamp(
            finisher === 'hamstrung' || finisher === 'execution'
              ? (finish.clock - 0.01) / 0.2
              : finisher === 'opened'
                ? (finish.clock - 0.04) / (finish.big ? 0.6 : 0.4)
                : (finish.clock - 0.45) / 0.55,
            0,
            1,
          ),
          reveal = t * t * (3 - 2 * t);
        const side = finisherSidePose(
          state,
          enemy,
          camera.aspect,
          finisher === 'hamstrung' || finisher === 'execution' ? 'opened' : finisher,
          finish.big ? 1.5 : 1,
          finish.reach ?? 0,
        );
        desired.lerp(eyeTarget.set(side.x, side.y, side.z), reveal);
        look.lerp(lookTarget.set(side.lookX, side.lookY, side.lookZ), reveal);
        const radius = Math.hypot(desired.x, desired.z);
        if (radius > 11.5) {
          desired.x *= 11.5 / radius;
          desired.z *= 11.5 / radius;
        }
      }
      // The arena cam, on top of whatever the finisher's own moves settled on: TOUR.afterSettle seconds after the settle
      // latch first fires, or TOUR.delay if this finish never latches (settled measures below, after this frame's position
      // is drawn, so tourStart reads the latch as of the previous frame — a harmless one-frame lag). A slow settle can still
      // fire after the fallback (TOUR.delay) tour has already started, moving tourStart later — a running tour keeps going
      // regardless (Lead review, 2026-09-22: recomputing the start mid-tour reset tourAngle and produced a visible jump).
      if (finish) finishAge += dt; else { finishAge = 0; tourStopped = false; tourAngle = null; tourBegan = null; stillFor = 0; settled = false; settledAt = null; }
      const tourStart = settled && settledAt !== null ? settledAt + TOUR.afterSettle : TOUR.delay;
      if (finish && !finish.draw && !still && !tourStopped && (tourAngle !== null || finishAge > tourStart)) {
        tourBegan ??= finishAge;   // captured once, the frame the tour actually starts — never moves even if tourStart later does
        const t = finishAge - tourBegan, fallen = finish.victim === 1 ? enemy : state, low = finish.victim === 0;
        const focusX = finish.head ? (fallen.x + finish.head.x) / 2 : fallen.x, focusZ = finish.head ? (fallen.z + finish.head.z) / 2 : fallen.z;
        tourAngle ??= Math.atan2(camera.position.x - focusX, camera.position.z - focusZ);
        const angle = tourAngle + (t * 2 * Math.PI) / TOUR.lap, radius = TOUR.radius + TOUR.breath * Math.sin((t * 2 * Math.PI) / TOUR.breathe);
        const height = (low ? 1.2 : 1.6) + (low ? 1 : 1.6) * (1 - Math.cos((t * 2 * Math.PI) / TOUR.rise)) / 2;
        const tour = eyeTarget.set(focusX + Math.sin(angle) * radius, height, focusZ + Math.cos(angle) * radius), r = Math.hypot(tour.x, tour.z);
        if (r > 11.5) { tour.x *= 11.5 / r; tour.z *= 11.5 / r; }
        const s = Math.min(1, t / TOUR.blendIn), blendIn = s * s * (3 - 2 * s);
        desired.lerp(tour, blendIn);
        look.lerp(lookTarget.set(focusX, camera.aspect < 1 ? TOUR.lookYPortrait : TOUR.lookY, focusZ), blendIn);
      } else { tourAngle = null; tourBegan = null; }
      if (LOOK_FOE) {   // stills only (?look=foe, like ?tier=): the opponent from the front, 50° off the line to the player so the player never blocks him
        const facing = Math.atan2(state.x - enemy.x, state.z - enemy.z) + 0.87;
        desired.set(enemy.x + Math.sin(facing) * 4.4, 1.6, enemy.z + Math.cos(facing) * 4.4); look.set(enemy.x, 0.95, enemy.z);
      }
      camera.position.addScaledVector(kickOffset, -shoved); // last draw's shove comes off before the settle
      camera.position.sub(swayApplied); swayApplied.set(0, 0, 0);   // and the tumble's shift
      shoved = 0;
      camera.position.lerp(desired, started ? blend : 1);
      aim.lerp(look, started ? blend : 1);
      camera.lookAt(aim);
      const swing = tiltAge < tiltFor ? Math.sin(Math.PI * (tiltAge / tiltFor)) : 0;
      if (swing) camera.rotateZ(tiltAngle * swing);
      // The settle latch: measured on the smoothed position (the kick is added after this and taken off before the next settle).
      // settledAt captures the finish age of the first latch only — later frames leave it alone.
      if (finish && started && dt > 0) {
        stillFor = camera.position.distanceTo(lastDrawn) / dt < SETTLE.speed ? stillFor + dt : 0;
        if (!settled && finishAge >= SETTLE.min && stillFor >= SETTLE.still) { settled = true; settledAt = finishAge; }
      }
      lastDrawn.copy(camera.position);
      started = true;
      // The kick is applied after the look-at (so the frame itself shifts) and stays on the camera until the next frame takes it off
      // before settling — a shove left inside the lerped position would compound.
      shoved = kick;
      camera.position.addScaledVector(kickOffset, shoved);
      if (swing && (swayRight || swayDrop)) { swayApplied.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(swayRight * swing); swayApplied.y -= swayDrop * swing; camera.position.add(swayApplied); }
    },
    // After the draw: the kick holds, then settles.
    settle(dt: number) {
      if (tiltAge < tiltFor) tiltAge += dt;
      if (kick > 0) {
        if (kickHold > 0) kickHold -= dt;
        else kick = Math.max(0, kick - dt * kickRate);
      }
    },
  };
}
export type CameraRig = ReturnType<typeof createCameraRig>;
