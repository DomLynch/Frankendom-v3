// Moving the Pit's contact effects into src/fight (K5/K6 P1): what a landed blow, a block or a parry does in the picture: the hit sparks, the splat pool, the body wounds, the blade
// blood, the steel-on-steel clash sparks, the sand off a defender's feet, and the camera-kick DECISION (hit-impact.ts / camera-kick.ts tables). The code is the Pit's, moved out of
// src/scene.ts createScene()/render() with its text unchanged; the Pit's scene calls it every frame with the objects it owns (the camera rig, the rigs, the feet), and a zone can feed
// it the same way. Presentation only: nothing here reads or writes the simulation.
import * as THREE from 'three';
import { OPPONENTS, RULES, weaponOf, type OpponentId } from './moves.ts';
import { hasBlood } from '../roster.ts';
import { blockDust, HEAVY_CLASS, clashStrength, createClashSparks } from './clash-sparks.ts';
import { shoveFor, type Shove } from './camera-kick.ts';
import { ROLL_TUMBLE, attackerOf, impactShove } from './hit-impact.ts';
import { FLINCH_GAIN, isFleshHit, type Flinch, type armfeelFrom } from './armfeel.ts';
import type { createBurstPool } from './armfeel-fx.ts';
import type { createFootDust } from './foot-dust.ts';
import { bloodGrow, foeBurstPull } from './blood-style.ts';
import { createBladeBlood, createBodyWounds, createSplatPool } from './gore.ts';
import type { FinisherId } from './finishers.ts';
import type { loadWarriors } from './characters.ts';
import type { CombatEvent, Practice } from './combat.ts';
import type { State } from './sim.ts';

/** The camera-kick hints the effects emit: the host decides which camera takes them (the Pit's rig, a zone's walk camera). */
export type CameraKick = { shove(heading: number, shove: Shove): void; tilt(angle: number, seconds: number, right?: number, drop?: number): void };

// Two original alpha sprites, generated once; all impacts reuse the same GPU resources.
export function impactTexture(splash: boolean) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const fill = ctx.createRadialGradient(64, 64, 8, 64, 64, 58);
  fill.addColorStop(0, '#ffffffff');
  fill.addColorStop(0.75, '#ffffffcc');
  fill.addColorStop(1, '#ffffff00');
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (let i = 0; i <= 64; i++) {
    const angle = (i / 64) * Math.PI * 2,
      r = splash ? 33 + Math.sin(angle * 2 + 1) * 5 + Math.cos(angle * 3 + 2) * 4 + Math.sin(angle * 5 + 0.5) * 2 : 48;   // low, out-of-phase lobes: a lopsided blot, never a star
    const x = 64 + Math.cos(angle) * r,
      y = 64 + Math.sin(angle) * r * (splash ? 1 : 0.65);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  if (splash)
    for (let i = 0; i < 17; i++) {
      const a = i * 2.4,
        r = 42 + (i % 4) * 4;
      ctx.beginPath();
      ctx.ellipse(
        64 + Math.cos(a) * r,
        64 + Math.sin(a) * r,
        1.5 + (i % 3),
        1 + (i % 2),
        a,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  return new THREE.CanvasTexture(canvas);
}

/** What the effects need of a fighter's rig: the Pit's loadWarriors actors and a zone creature's actor both fit it. */
export type FxRig = { anchor: THREE.Object3D; boneWorld(name: string): THREE.Vector3 | null };
export type FxRigs = { player: FxRig; opponent: FxRig };

/** The part of a Practice the effects read: the Pit's duel and a zone's per-pair stand-in both fill it. */
export type ContactPractice = Pick<Practice, 'duel' | 'enemy' | 'enemyWoundSite' | 'woundSite' | 'health' | 'playerHealth'>;

/** What one frame's contact effects need from the scene that owns the rigs, the camera and the feet. */
export type ContactCtx = {
  events: CombatEvent[]; practice: ContactPractice; state: State; dt: number;
  blow: CombatEvent | undefined; contact: boolean | CombatEvent | undefined; killed: CombatEvent | undefined;
  finisher: FinisherId | null; detailedBlood: boolean;
  camera: THREE.Camera; kick: CameraKick; blockHeavy: boolean[];
  warriors: FxRigs | undefined;
  dustFeet: (THREE.Object3D | null)[]; dustPositions: THREE.Vector3[]; footDust: ReturnType<typeof createFootDust> | null;
  flinches: Flinch[] | null; burstPool: ReturnType<typeof createBurstPool> | null; feel: ReturnType<typeof armfeelFrom> | undefined; right: THREE.Vector3;
  opponentId: OpponentId; bloodMode: 'red' | 'dark' | 'off';
  DIP_FRAMES: number; setDip(frames: number): void;
};

export function createFightFx(host: { scene: THREE.Scene; dropTexture: THREE.Texture; splatTexture: THREE.Texture }) {
  const { scene, dropTexture, splatTexture } = host;
  const clash = createClashSparks(scene);
  const sparkPositions = new Float32Array(12 * 3),
    sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
  const sparkMaterial = new THREE.PointsMaterial({
    color: '#ffe4af',
    map: dropTexture,
    alphaTest: 0.02,
    size: 0.045,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
  sparks.frustumCulled = false;
  sparks.visible = false;
  scene.add(sparks);
  const splats = createSplatPool(scene, splatTexture);
  let impactDuration = 0.18,
    impactHeading = 0,
    flesh = false,
    killSpray = false;
  let impact = 0,
    lastHealth: number = RULES.health,
    lastPlayerHealth: number = RULES.health,
    killHeading = 0;
  const bodyWounds = createBodyWounds(scene, splatTexture);   // owner 2026-09-21: blood from every cut once a fighter is at 60 % or below
  const blade = createBladeBlood();
  /** Every frame, after the frame's events are known: the camera kick, the sand, and on a contact the sparks, the flinch burst, the wounds, the splats and the blade blood. */
  function onContact(c: ContactCtx): void {
    const { events, practice, state, dt, blow, contact, killed, finisher, detailedBlood, camera, kick, blockHeavy, warriors, dustFeet, dustPositions, footDust, flinches, burstPool, feel, right, opponentId, bloodMode } = c;
    // Camera kick: what each contact does to the camera is camera-kick.ts's table (a heavy drops it 6 cm and holds, a light 1.2 cm, a
    // heavy block 2.8 cm, a parry flicks 2 cm sideways) — the guard shudders, the screen never shakes. Always on, reduced motion included (owner ruling 2026-09-29).
    // Every contact goes through hit-impact.ts first: a landed blow or a block knocks the camera away from it, a parry jolts it toward the attacker.
    const blowDirection = (e: CombatEvent) => { const by = attackerOf(e); return e.move && by !== undefined ? weaponOf(practice.duel.fighters[by].weapon).moves[e.move]?.direction : undefined; };
    const clashKick = blow ? undefined : events.find((e) => e.type === 'Blocked' || e.type === 'Parried');
    const shoveEvent = blow ?? (clashKick?.target !== undefined ? clashKick : undefined), shove = shoveEvent && (impactShove(shoveEvent, blowDirection(shoveEvent)) ?? shoveFor(shoveEvent));
    if (shoveEvent && shove && dt > 0) {
      // The blow's heading: a landed blow carries it; a block or parry takes the attacker's facing (the attacker is the event's target).
      kick.shove(shoveEvent.heading ?? (shoveEvent.target && !blow ? practice.enemy.heading : state.heading), shove);
    }
    // The player's roll tumbles the frame the way of the roll (hit-impact.ts ROLL_TUMBLE; Dom's pick C, 2026-09-30).
    if (dt > 0 && events.some((e) => e.type === 'ActionStarted' && e.action === 'roll' && e.actor === 0)) {
      const heading = practice.duel.fighters[0].body.heading, right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const way = Math.sign(Math.sin(heading) * right.x + Math.cos(heading) * right.z) || 1;   // +1: the roll goes to screen right
      kick.tilt(-way * ROLL_TUMBLE.angle, ROLL_TUMBLE.seconds, way * ROLL_TUMBLE.shift, ROLL_TUMBLE.dip);   // lean INTO the roll: right tips clockwise
    }
    if (clashKick?.type === 'Blocked') blockHeavy[clashKick.actor] = HEAVY_CLASS.has(clashKick.move ?? '');
    if (killed && dt > 0) c.setDip(c.DIP_FRAMES);
    // Sand off the defender's feet (blockDust, clash-sparks.ts). Feet are last frame's world positions (a frame old, a centimetre); a
    // fighter who is not on his feet moves none.
    const sand = shoveEvent && dt > 0 ? blockDust(shoveEvent) : null;
    if (shoveEvent && sand && dustFeet.length === 4) {
      const defender = blow ? shoveEvent.target! : shoveEvent.actor, attackerAt = defender ? state : practice.enemy;
      const feet = [dustPositions[defender * 2], dustPositions[defender * 2 + 1]].filter((_f, i) => dustFeet[defender * 2 + i]);
      const rear = feet.sort((a, b) => Math.hypot(b.x - attackerAt.x, b.z - attackerAt.z) - Math.hypot(a.x - attackerAt.x, a.z - attackerAt.z))[0];
      for (const foot of sand.feet === 'both' ? feet : rear ? [rear] : []) if (foot.y < 0.25) footDust?.puff(foot, sand.strength);
    }
    if (contact && dt > 0) {
      const enemyHurt = blow?.target === 1,
        hurt = !!blow;
      const kick = blow?.move === 'kick';
      flesh = hurt && (!enemyHurt || hasBlood(opponentId)) && !kick && bloodMode !== 'off';
      impactDuration = flesh && killed ? 0.55 : flesh ? 0.34 : 0.18;
      impact = impactDuration;
      impactHeading = blow?.heading ?? state.heading;
      killSpray = !!(killed && flesh); // a kill sprays a cone along the strike heading, not the radial puff
      if (killed && flesh) killHeading = blow?.heading ?? state.heading; // the decapitation pop flies the way the blow did
      const site = enemyHurt ? practice.enemyWoundSite : practice.woundSite;
      const target = enemyHurt ? practice.enemy : state;
      // ?look=armfeel (armfeel.ts): the struck body flinches and bursts at the contact. The hero keeps FLINCH_GAIN.hero of the flinch (it is the biggest
      // thing on the screen); the opponent, seen end-on, is pushed to the side the blow arrives from so the lean is seen.
      if (flinches && burstPool && blow && isFleshHit(blow) && blow.target !== undefined && feel) {
        const victim = blow.target, heading = blow.heading ?? state.heading, bx = Math.sin(heading), bz = Math.cos(heading), dead = !!killed && killed.target === victim;
        let px = bx, pz = bz;
        const along = blowDirection(blow);
        if (victim === 1 && (along === 'left' || along === 'right')) {   // the arrival side, as hit-impact.ts reads it: a blow on the opponent named 'right' arrives from screen right
          right.setFromMatrixColumn(camera.matrixWorld, 0);
          const away = along === 'right' ? -1 : 1, mag = Math.hypot(bx * 0.6 + right.x * away, bz * 0.6 + right.z * away) || 1;
          px = (bx * 0.6 + right.x * away) / mag; pz = (bz * 0.6 + right.z * away) / mag;
        }
        flinches[victim].hit(px, pz, dead, victim === 0 ? FLINCH_GAIN.hero : FLINCH_GAIN.opponent);
        const scale = victim === 1 ? OPPONENTS[opponentId].scale : 1, y = (blow.location === 'head' ? 1.5 : blow.location === 'legs' ? 0.55 : 1.15) * scale;
        // The same blood on both bodies (Dom: it showed when he was hit, rarely when he hit): the foe is 2-3x further from the camera, so its drops are scaled up
        // to cover about the hero burst's screen size, and the spawn is pulled toward the camera (blood-style.ts foeBurstPull), clear of the hero's torso that covers the contact.
        const cam = camera.position, reach = (px: number, pz: number, py: number) => Math.hypot(cam.x - px, cam.y - py, cam.z - pz);
        let sx = target.x - bx * 0.3, sz = target.z - bz * 0.3, sy = y, grow = 1;
        if (victim === 1) {
          const far = reach(target.x, target.z, y), near = reach(state.x, state.z, 1.15), pull = foeBurstPull(far, near);   // close up the hero covers the contact: bring the spawn toward the camera, same screen spot
          sy += 0.1 * scale;
          const dx = cam.x - sx, dy = cam.y - sy, dz = cam.z - sz, len = Math.hypot(dx, dy, dz) || 1;
          sx += dx / len * pull; sy += dy / len * pull; sz += dz / len * pull;
          grow = bloodGrow(reach(sx, sz, sy), near);
        }
        burstPool.burst(feel, sx, sy, sz, bx, bz, dead, grow);
      }
      // A landed blade blow marks the struck body where the simulation says it landed, from the side the move came from.
      if (blow?.type === 'Hit' && blow.location && blow.move && !kick && (!enemyHurt || hasBlood(opponentId)) && warriors)
        bodyWounds.hit(enemyHurt ? 1 : 0, (enemyHurt ? warriors.opponent : warriors.player).anchor,
          { location: blow.location, direction: weaponOf(practice.duel.fighters[blow.actor].weapon).moves[blow.move].direction, heading: target.heading },
          enemyHurt ? OPPONENTS[opponentId].scale : 1);
      // Steel on steel: a block or parry of a metal blade by a blade guard throws metal sparks from the attacker's blade (clash-sparks.ts);
      // the generic contact dots stay for everything else (a shaft catching a blade, a kick, a fist).
      const clashEvent = blow ? undefined : events.find((e) => e.type === 'Blocked' || e.type === 'Parried');
      const strength = clashEvent ? clashStrength(clashEvent, weaponOf(practice.duel.fighters[clashEvent.actor].weapon)) : 0;
      if (clashEvent && strength > 0 && clashEvent.target !== undefined) {
        const attacker = clashEvent.target,
          rig = attacker ? warriors?.opponent : warriors?.player,
          weapon = rig?.anchor.getObjectByName('WeaponDrawn') ?? rig?.anchor.getObjectByName('SwordDrawn'),
          contactRange = weapon?.userData.contact as { from: number; to: number } | undefined;
        // Struck off the attacking blade itself (owner 2026-09-20): the outer part of its contact zone as the rig draws it this frame,
        // with a fallback segment at the defender's guard when a rig is not loaded.
        const defenderBody = attacker ? state : practice.enemy, guard = new THREE.Vector3(defenderBody.x, 1.15, defenderBody.z);
        let a: THREE.Vector3, b: THREE.Vector3;
        if (weapon && contactRange) {
          // The rig's contact pose already drives the blade into the defender; sparks belong on the visible length, so the zone ends
          // where the blade enters his body (0.3 m off his axis) and runs 0.4 m back toward the attacker's hand.
          const hand = weapon.localToWorld(new THREE.Vector3(0, 0, 0)), tip = weapon.localToWorld(new THREE.Vector3(0, contactRange.to, 0)), length = hand.distanceTo(tip) || 1;   // the grip to the tip: the whole visible length
          let entry = 1;
          for (let t = 0; t <= 1; t += 0.05) { const q = hand.clone().lerp(tip, t); if (Math.hypot(q.x - guard.x, q.z - guard.z) < 0.3) { entry = t; break; } }
          b = hand.clone().lerp(tip, Math.max(0.25, entry - 0.02)); a = b.clone().sub(tip.clone().sub(hand).multiplyScalar(Math.min(0.4, length * 0.35) / length));
        } else { const towardAttacker = new THREE.Vector3(attacker ? practice.enemy.x : state.x, 0, attacker ? practice.enemy.z : state.z).sub(new THREE.Vector3(guard.x, 0, guard.z)).normalize(); a = guard.clone().addScaledVector(towardAttacker, 0.2); b = guard.clone().addScaledVector(towardAttacker, 0.6); }
        clash.burst(a, b, attacker ? practice.enemy.heading : state.heading, strength);
        impact = 0; // the dedicated sparks replace the generic dots for this contact
      }
      sparks.position.set(
        hurt ? target.x : (state.x + practice.enemy.x) / 2,
        hurt ? (site === 'head' ? 1.55 : site === 'legs' ? 0.6 : 1.15) : 1.2,
        hurt ? target.z : (state.z + practice.enemy.z) / 2,
      );
      sparkMaterial.color.set(
        flesh ? (bloodMode === 'dark' ? '#3e2527' : '#a32b27') : kick || hurt ? '#b1a28a' : '#ffe4af',
      );
      sparkMaterial.blending = flesh || kick || hurt ? THREE.NormalBlending : THREE.AdditiveBlending;
      sparkMaterial.size = flesh ? 0.095 : 0.045;
      if (finisher === 'opened' && enemyHurt && warriors) {
        const hip = warriors.opponent.boneWorld('pelvis'),
          spine = warriors.opponent.boneWorld('spine_01');
        if (hip && spine) sparks.position.copy(hip.lerp(spine, 0.6));
      }
      if (flesh && !(killed && detailedBlood)) splats.splash(target, bloodMode);
      if (killed && flesh && !detailedBlood) {
        // the corpse keeps pooling after the splashes fade (cleared on rematch like everything else)
        splats.pool(target, bloodMode);
        blade.set(true, warriors, bloodMode, killed.actor as 0 | 1);
      }
      if (killed && flesh && detailedBlood) {
        impact = 0;
        blade.set(true, warriors, bloodMode, killed.actor as 0 | 1);
      }
    }
    lastHealth = practice.health;
    lastPlayerHealth = practice.playerHealth;
  }
  /** Every frame: the clash sparks, the generic sparks' fall-off and the splats age on the frame's dt (a hit-stop does not stop them). */
  function update(dt: number): void {
    clash.update(dt); // contact effects run on the frame's dt through a hit-stop, like the generic sparks and the camera kick
    impact = Math.max(0, impact - dt);
    sparks.visible = impact > 0;
    if (impact > 0) {
      const t = impactDuration - impact;
      sparkMaterial.opacity = impact / impactDuration;
      const spread = killSpray ? 0.9 : 2,
        drive = killSpray ? 2.8 : 1.5; // a kill: a tight cone driven along the heading
      for (let i = 0; i < 12; i++) {
        sparkPositions[i * 3] =
          (Math.sin(i * 2.4) * spread + (flesh ? Math.sin(impactHeading) * drive : 0)) * t;
        sparkPositions[i * 3 + 1] = Math.cos(i * 1.7) * t * 2 - t * t * 4;
        sparkPositions[i * 3 + 2] =
          (Math.cos(i * 2.4) * spread + (flesh ? Math.cos(impactHeading) * drive : 0)) * t;
      }
      sparkGeometry.attributes.position.needsUpdate = true;
    }
    splats.update(dt);
  }
  return {
    clash, sparks, splats, bodyWounds, blade, onContact, update,
    /** The few values the scene still reads or resets: a fresh match zeroes `impact`; setBloodMode reads `flesh`; the severed head pops along `killHeading`. */
    state: {
      get impact() { return impact; }, set impact(v: number) { impact = v; },
      get flesh() { return flesh; },
      get killHeading() { return killHeading; },
      get lastHealth() { return lastHealth; },
      get lastPlayerHealth() { return lastPlayerHealth; },
    },
  };
}
