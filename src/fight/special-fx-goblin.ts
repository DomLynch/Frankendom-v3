import * as THREE from 'three';
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';
import type { CombatEvent, Fighter } from './duel.ts';
import type { OpponentId } from '../roster.ts';
import { advanceCast, shadowPhase, FALL_AT, type Cast, type isHadesShadow } from './special-timing.ts';
import { clamp01, hash, smooth } from './fx-math.ts';

// The Goblin's boss specials at ranks 8, 9, 10, GREY-BOX (Goblin lane, 2026-10-01; proposal sent to Strategy, who put it to Dom; nothing here is
// picked or shipped). Same seam as Hades' cloud and Red Wind: it reads the sim's special events and the two bodies' anchors, never the sim, the rig
// root or Math.random (every "random" is an index hash). Loaded lazily by the scene, only on a `?special=reynard|hermes|loki` page. Rules (the
// Centurion brief): unblockable, ~2 s wind-up in the sim, the visible build-up is the last ~0.4 s (the 'fall' phase, 24 ticks), one clean idea, no
// props, grounded, painted not drawn, no glow. Sprites and a few flat shapes stand in for the painted art, so Dom judges the IDEA.
//   ratrun (ranks 4-7, selected 2026-10-02): a low visible arc to the flank; presentation only, no new counter or sim movement.
//   reynard (rank 8)  Dirty Fistful: sand flung from his hand up into the target's face, a ragged fan, then it hangs there and thins.
//   hermes  (rank 9)  Gone: a dust puff, he is hidden, fast footprints stamp round the target, and he is behind him with the blow.
//   loki    (rank 10) Three Liars: two darkened snapshots of him (his own colours) slide out beside him for under 0.4 s; the real one is the only solid one and it lands.
// The caster's own motion (hide, lunge, reappear) is applied by the effect itself to his rig anchor (special-modes.ts hands it over); the sim's body never moves.

const PUFFS = 28, SPECKS = 44, PRINTS = 8, GHOST_SINCE = 0.1;   // a ghost shows from k .1 to the end of the 0.4 s build-up: ~0.36 s

// Dirty Fistful's tell is the move itself (Strategy, 2026-10-01): he DROPS and scoops a fistful off the ground for SCOOP_TICKS before the fling, hand to the sand,
// grit trickling from the fist (the rig sinks DIP metres: a presentation knee-dip, like the claw's), then the fling is the 0.4 s fan across the gap.
export const SCOOP_TICKS = 48, DIP = 0.22;

// Unlit sprites in the working space, tone-mapped by the arena's exposure; the Night Pit (exposure above 1.5) is dark grey-brown ink, never lighter than the clay (Strategy 2026-10-02: the pale cast puffs failed).
const dust = (exposure: number) => (exposure > 1.5 ? { core: new THREE.Color(0.03, 0.027, 0.024), edge: new THREE.Color(0.07, 0.064, 0.058) } : { core: new THREE.Color(0.14, 0.135, 0.125), edge: new THREE.Color(0.36, 0.34, 0.3) });

// Sand, not smoke (Strategy on the first clip: the grey-white puff read as smoke): a brown cloud with darker grit specks. The day arena's floor is tan, so the
// cloud is a deeper brown there; in the Night Pit (exposure above 1.5) it is dark ink, never lighter than the clay. No glow, nothing saturated.
// Night Pit (Dom's bar, Strategy 2026-10-02): sand is never lighter than the clay, only dark brown ink; the first night films read pale grey over the fighters.
const sand = (exposure: number) => (exposure > 1.5 ? { core: new THREE.Color(0.025, 0.016, 0.01), edge: new THREE.Color(0.09, 0.055, 0.032) } : { core: new THREE.Color(0.07, 0.045, 0.025), edge: new THREE.Color(0.3, 0.2, 0.11) });

function speckTexture() {   // a small hard-edged grain: crisp, so a speck reads as grit and not as a puff
  const size = 16, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const r = Math.hypot((x - 7.5) / 7.5, (y - 7.5) / 7.5); pixels.set([255, 255, 255, 255 * Math.min(1, Math.max(0, (1 - r) * 3))], (y * size + x) * 4); }
  const map = new THREE.DataTexture(pixels, size, size); map.needsUpdate = true; map.magFilter = map.minFilter = THREE.LinearFilter;
  return map;
}

function puffTexture() {
  const size = 64, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x - 31.5) / 31.5, v = (y - 31.5) / 31.5, r = Math.hypot(u, v), churn = 0.65 + 0.35 * Math.sin(x * 0.37 + Math.sin(y * 0.23) * 3) * Math.cos(y * 0.29 - x * 0.11);
    pixels.set([255, 255, 255, 255 * Math.max(0, 1 - r) ** 1.4 * churn], (y * size + x) * 4);
  }
  const map = new THREE.DataTexture(pixels, size, size); map.needsUpdate = true; map.magFilter = map.minFilter = THREE.LinearFilter;
  return map;
}

// `caster`: his sim position on the ground; `feet` / `head`: the target's, in world space (null while a rig loads).
export type GoblinSpecial = 'reynard' | 'hermes' | 'loki' | 'ratrun';
export type GoblinAnchors = { caster: THREE.Vector3; feet: THREE.Vector3 | null; head: THREE.Vector3 | null; rig?: THREE.Object3D | null; heading?: THREE.Quaternion | null };
// What the scene does to the caster this frame: hide him, and/or shift his group (world metres) off the sim position.
export type GoblinFrame = { hide: boolean; offset: THREE.Vector3 | null };
// The cast test this effect hands advanceCast (World's seam, #1120): every cast of his, on the opponent's side, whatever his class skill. Hades' own test
// stays the default, so a Goblin cast opens no cast anywhere that did not ask for this effect.
export const isGoblinCast: typeof isHadesShadow = (opponent, actor) => opponent === 'goblin' && actor === 1;
export type GoblinSpecialFx = ReturnType<typeof createGoblinSpecial>;

// Common A: a stationary, foot-sized gather and one low flick on the accepted jab payoff.
// The manager normalizes either selected fighter to caster 1 and owns these private materials/maps.
export function createKnuckleDirt(scene: THREE.Scene, opponent: OpponentId, exposure: number) {
  const root = new THREE.Group(), map = speckTexture(); root.name = 'goblin special knuckledirt'; root.visible = false; scene.add(root);
  const look = sand(exposure), edge = exposure > 1.5 ? new THREE.Color(0.24, 0.15, 0.075) : look.edge;
  const grains = Array.from({ length: 24 }, (_, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: i % 6 === 0 ? edge : look.core, transparent: true, opacity: 0, depthWrite: false, fog: true }));
    s.visible = false; s.scale.setScalar(0.055 + 0.025 * hash(i, 31)); root.add(s); return s;
  });
  const accepts: typeof isHadesShadow = (id, actor, move) => id === 'goblin' && actor === 1 && move === 'skill_jab';
  let cast: Cast | null = null, anchored = false;
  const hide = () => { root.visible = false; for (const s of grains) { s.visible = false; s.material.opacity = 0; } };
  return {
    render(_dt: number, events: readonly CombatEvent[], fighters: readonly [Fighter, Fighter], tick: number, feet: readonly [THREE.Vector3 | null, THREE.Vector3 | null], yielding: boolean) {
      if (yielding) { cast = null; anchored = false; hide(); return; }
      const before = cast;
      cast = advanceCast(cast, events, fighters, tick, opponent, yielding, accepts);
      hide();
      if (!cast) { anchored = false; return; }
      if (!before || before.start !== cast.start || events.some(e => e.type === 'SpecialStarted' && accepts(opponent, e.actor, e.move) && !yielding)) anchored = false;
      const caster = feet[1], target = feet[0];
      if (!caster || !target) return;
      if (!anchored) {
        root.position.copy(caster); root.rotation.y = Math.atan2(target.x - caster.x, target.z - caster.z); anchored = true;
      }
      const phase = shadowPhase(cast, tick);
      if (phase.phase === 'done') return;
      const age = Math.max(0, (cast.fizzled ?? tick) - cast.start), ended = cast.landed ?? cast.fizzled;
      const gather = smooth((Math.min(age, FALL_AT) + 1) / FALL_AT), fade = ended === null ? 1 : 1 - phase.k;
      const flick = cast.landed === null ? 0 : clamp01((tick - cast.landed) / 30);
      for (let i = 0; i < grains.length; i++) {
        const s = grains[i], flying = i >= 12 && cast.landed !== null;
        const x = (hash(i, 32) - 0.5) * 0.24, z = 0.28 + (hash(i, 33) - 0.5) * 0.23;
        // Outer front-foot side: the single low flick clears the body/shadow instead of fading underneath it.
        s.position.set(0.85 + x + (flying ? x * flick * 0.5 : 0), 0.018 + 0.025 * hash(i, 34) + (flying ? 0.18 * Math.sin(Math.PI * flick) : 0.035 * gather), z + (flying ? (0.55 + 0.2 * hash(i, 35)) * flick : 0));
        s.material.opacity = flying ? 0.9 * (1 - smooth((flick - 0.65) / 0.35)) * fade : 0.85 * gather * fade;
        s.visible = s.material.opacity > 0.01; root.visible ||= s.visible;
      }
    },
    clear() { cast = null; anchored = false; hide(); },
  };
}

export function createGoblinSpecial(scene: THREE.Scene, kind: GoblinSpecial, exposure: number, opponent: OpponentId = 'goblin') {
  const look = kind !== 'loki' ? sand(exposure) : dust(exposure), map = puffTexture(), root = new THREE.Group(); root.name = `goblin special ${kind}`; root.visible = false; scene.add(root);
  const puffs = Array.from({ length: PUFFS }, (_, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: i % 3 ? look.edge : look.core, transparent: true, opacity: 0, depthWrite: false, fog: true })); s.visible = false; root.add(s); return s;
  });
  const specks = kind !== 'loki' ? Array.from({ length: SPECKS }, () => { const grain = speckTexture(), s = new THREE.Sprite(new THREE.SpriteMaterial({ map: grain, color: look.core, transparent: true, opacity: 0, depthWrite: false, fog: true })); s.visible = false; root.add(s); return s; }) : [];
  const speck = (i: number, at: THREE.Vector3, scale: number, opacity: number) => { const s = specks[i]; s.position.copy(at); s.scale.setScalar(scale); (s.material as THREE.SpriteMaterial).opacity = opacity; s.visible = opacity > 0.01; };
  const flat = (geometry: THREE.BufferGeometry) => { const m = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: look.core, transparent: true, opacity: 0, depthWrite: false })); m.visible = false; root.add(m); return m; };
  const ghosts = kind === 'loki' ? [0, 1].map(() => flat(new THREE.CapsuleGeometry(0.2, 0.92, 3, 10))) : [];   // grey-box afterimages at his 1.36 m
  const prints = kind === 'hermes' || kind === 'ratrun' ? Array.from({ length: PRINTS }, () => { const m = flat(new THREE.CircleGeometry(1, 10)); m.rotation.x = -Math.PI / 2; m.scale.set(0.11, 0.24, 1); return m; }) : [];
  const dir = new THREE.Vector3(), side = new THREE.Vector3(), behind = new THREE.Vector3(), tmp = new THREE.Vector3(), frame: GoblinFrame = { hide: false, offset: null }, offset = new THREE.Vector3();
  let cast: Cast | null = null, clock = 0, lastTick = -1;
  // Loki's afterimages are frozen, translucent snapshots of the caster's own rig in the pose he is in when the build-up begins (SkeletonUtils.clone copies the
  // bones as they stand; nothing animates the copy). Without a rig (a unit test) they are grey capsules.
  let snaps: { root: THREE.Object3D; materials: THREE.Material[] }[] = [];
  const dropSnaps = () => { snaps.forEach((n) => {
    n.root.removeFromParent(); n.materials.forEach((m) => m.dispose());
    const skeletons = new Set<THREE.Skeleton>();
    n.root.traverse(o => { if (o instanceof THREE.SkinnedMesh) skeletons.add(o.skeleton); });
    for (const skeleton of skeletons) skeleton.dispose();
  }); snaps = []; };
  const snapshot = (rig: THREE.Object3D) => {
    let meshes = false; rig.traverse((o) => { if (o instanceof THREE.Mesh) meshes = true; }); if (!meshes) return;   // nothing to copy: the capsules stand in
    for (let n = 0; n < 2; n++) {
      // His own mesh in his own colours, darkened (a clone of each material, so the real Goblin's stay untouched): not one flat grey, so it reads as Loki.
      const copy = cloneRig(rig), materials: THREE.Material[] = [];
      copy.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const own = (Array.isArray(o.material) ? o.material : [o.material]).map((m: THREE.Material) => { const c = m.clone() as THREE.MeshStandardMaterial; c.transparent = true; c.opacity = 0; c.depthWrite = false; c.color?.multiplyScalar(0.55); materials.push(c); return c; });
          o.material = Array.isArray(o.material) ? own : own[0]; o.castShadow = o.receiveShadow = false; o.frustumCulled = false;
        }
        if (o.name === 'WeaponTrail') o.visible = false;
      });
      copy.visible = false; root.add(copy); snaps.push({ root: copy, materials });
    }
  };

  // Dust ceilings (Strategy's bar, 2026-10-01: 0.7 in the day arena, 0.4 in the Night Pit): no haze is ever more opaque than this, so the hero and the real Goblin
  // always read through it. The dark grit specks and the prints are small and are not haze.
  const CAP = exposure > 1.5 ? 0.4 : 0.7;
  const puff = (i: number, at: THREE.Vector3, scale: number, opacity: number) => { const s = puffs[i], o = Math.min(CAP, opacity); s.position.copy(at); s.scale.setScalar(scale); (s.material as THREE.SpriteMaterial).opacity = o; s.visible = o > 0.01; };
  const hideAll = () => { puffs.forEach((s) => (s.visible = false)); specks.forEach((s) => (s.visible = false)); snaps.forEach((n) => (n.root.visible = false)); ghosts.forEach((g) => (g.visible = false)); prints.forEach((p) => (p.visible = false)); };
  const clear = () => { cast = null; dropSnaps(); root.visible = false; hideAll(); frame.hide = false; frame.offset = null; };

  const inner = {
    // After the poses are final. `tick`: the sim tick of this frame; `yielding`: true while a finisher plays (no new cast starts).
    frame(dt: number, events: readonly CombatEvent[], fighters: readonly [Fighter, Fighter], tick: number, a: GoblinAnchors, yielding: boolean): GoblinFrame {
      clock = tick !== lastTick ? tick : Math.min(tick + 1, clock + dt * 60); lastTick = tick;
      cast = advanceCast(cast, events, fighters, tick, opponent, yielding, isGoblinCast);
      hideAll(); frame.hide = false; frame.offset = null; root.visible = false;
      if (!cast && snaps.length) dropSnaps();
      if (!cast || !a.feet || !a.head) return frame;
      const p = shadowPhase(cast, clock);
      const scoop = kind === 'reynard' && p.phase === 'gather' && p.age >= FALL_AT - SCOOP_TICKS;   // only the Fistful has a tell before the last 0.4 s
      if ((p.phase === 'gather' && !scoop) || p.phase === 'done' || p.phase === 'dissolve') return frame;   // the rest of the wind-up is the sim's alone; a fizzle draws nothing
      root.visible = true;
      const build = p.phase === 'fall', k = p.k;   // build: 0..1 over the last 0.4 s; else the aftermath, 0..1 over 0.75 s
      dir.copy(a.feet).sub(a.caster).setY(0); const dist = dir.length(); if (dist < 1e-3) dir.set(0, 0, 1); else dir.divideScalar(dist);
      side.set(-dir.z, 0, dir.x);

      if (kind === 'reynard') {   // Dirty Fistful: he drops and scoops, grit trickling from the fist, then the fling is a visible fan from the fist to the face
        const fist = new THREE.Vector3().copy(a.caster).addScaledVector(dir, 0.28), head = a.head;
        const sc = scoop ? clamp01((p.age - (FALL_AT - SCOOP_TICKS)) / SCOOP_TICKS) : 1;   // 0..1 through the scoop
        const dip = scoop ? smooth(sc * (SCOOP_TICKS / 10)) : build ? 1 - smooth(k / 0.35) : 0;   // sinks in ~0.17 s, holds, then rises as the fling starts
        frame.offset = offset.set(0, -DIP * dip, 0);
        if (scoop) {
          fist.y = 0.06 + 0.2 * smooth(sc);   // the hand rakes the sand, then lifts the fistful
          for (let i = 0; i < 8; i++) { const ang = i * 2.4 + sc * 3, r = 0.04 + 0.1 * hash(i, 1) * (1 - sc * 0.4); puff(i, new THREE.Vector3(fist.x + Math.cos(ang) * r, 0.04 + 0.16 * hash(i, 2) * (0.4 + sc), fist.z + Math.sin(ang) * r), 0.12 + 0.1 * hash(i, 3), 0.55 * smooth(sc * 4)); }
          for (let i = 0; i < 14; i++) {   // grit trickling out of the fist: each speck falls from the fist to the ground and starts again
            const u = (sc * 2.2 + hash(i, 4)) % 1;
            speck(i, new THREE.Vector3(fist.x + (hash(i, 5) - 0.5) * 0.09, fist.y * (1 - u * u), fist.z + (hash(i, 6) - 0.5) * 0.09), 0.028 + 0.012 * hash(i, 7), 0.95 * smooth(sc * 5) * (1 - u ** 3));
          }
          return frame;
        }
        const start = fist.clone(); start.y = 0.26;
        const hand = tmp.copy(a.caster).addScaledVector(dir, 0.3).setY(0.85);   // the arm whips up and out
        for (let i = 0; i < PUFFS; i++) {
          if (build) {
            const lag = hash(i, 1) * 0.4, u = clamp01((k - lag) / (1 - lag)), e = 1 - (1 - u) ** 2, origin = new THREE.Vector3().lerpVectors(start, hand, smooth(k * 2.5)), at = new THREE.Vector3().lerpVectors(origin, head, e);
            at.addScaledVector(side, (hash(i, 2) - 0.5) * 0.5 * u); at.y += (hash(i, 3) - 0.5) * 0.3 * u;
            puff(i, at, 0.1 + 0.3 * u, 0.7 * smooth(u * 4));
          } else {   // it hangs at the face, swirls, grows and thins: the blinding
            const ang = i * 2.4 + k * 2, r = (0.1 + 0.3 * hash(i, 4)) * (1 + k * 0.8);
            puff(i, new THREE.Vector3(head.x + Math.cos(ang) * r, head.y + (hash(i, 5) - 0.3) * 0.4 - k * 0.2, head.z + Math.sin(ang) * r), 0.36 + 0.24 * k, 0.8 * (1 - smooth((k - 0.25) / 0.75)));
          }
        }
        for (let i = 0; i < SPECKS; i++) {   // the grit itself: dark crisp specks, a wider and faster fan than the haze, falling once they have arrived
          if (build) {
            const lag = hash(i, 8) * 0.35, u = clamp01((k - lag) / (1 - lag)), e = 1 - (1 - u) ** 3, origin = new THREE.Vector3().lerpVectors(start, hand, smooth(k * 2.5)), at = new THREE.Vector3().lerpVectors(origin, head, e);
            at.addScaledVector(side, (hash(i, 9) - 0.5) * 0.7 * u); at.y += (hash(i, 10) - 0.4) * 0.45 * u;
            speck(i, at, 0.03 + 0.03 * hash(i, 11), 0.95 * smooth(u * 6));
          } else {
            const sway = (hash(i, 9) - 0.5) * 0.7, scatter = (hash(i, 12) - 0.5) * 0.5;
            speck(i, new THREE.Vector3(head.x + side.x * (sway + scatter * k), head.y + (hash(i, 10) - 0.4) * 0.45 - 0.9 * k * k, head.z + side.z * (sway + scatter * k)), 0.03 + 0.03 * hash(i, 11), 0.9 * (1 - smooth((k - 0.3) / 0.7)));
          }
        }
        return frame;
      }

      if (kind === 'ratrun') {   // Selected class look: visible crouch-run to the flank; the sim's body and hit remain unchanged.
        const r0 = Math.max(dist, 0.95), slideOut = 1 - smooth((k - 0.4) / 0.6), t = build ? smooth(k) : 1;
        const at = (u: number, out: THREE.Vector3) => out.copy(a.feet!).addScaledVector(dir, -(r0 + (0.95 - r0) * u) * Math.cos(1.9 * u)).addScaledVector(side, 0.75 * (r0 + (0.95 - r0) * u) * Math.sin(1.9 * u)).setY(0);
        const here = at(t, new THREE.Vector3());
        offset.copy(here).sub(a.caster).setY(0).multiplyScalar(build ? 1 : slideOut);
        offset.y = -0.12 * Math.sin(Math.PI * clamp01(build ? t : 1 - (k - 0.4) / 0.6));
        frame.offset = offset;
        const fade = build ? 0.8 : 0.8 * (1 - smooth(k)), ahead = new THREE.Vector3();
        prints.forEach((m, j) => {
          const u = (j + 1) / (PRINTS + 1), show = build ? u <= t : true;
          at(u, m.position); m.position.y = 0.012; at(Math.min(1, u + 0.03), ahead).sub(m.position).setY(0); m.rotation.z = Math.atan2(ahead.x, ahead.z);
          m.scale.set(0.09, 0.3, 1);
          (m.material as THREE.MeshBasicMaterial).opacity = show ? fade : 0; m.visible = show && fade > 0.01;
          const age = build ? clamp01((t - u) / 0.3) : 1;
          if (show && age < 1) for (let n = 0; n < 4; n++) speck(j * 4 + n, new THREE.Vector3(m.position.x + (hash(j * 4 + n, 1) - 0.5) * 0.25 * age, 0.04 + 0.28 * age * (0.4 + hash(j * 4 + n, 2)), m.position.z + (hash(j * 4 + n, 3) - 0.5) * 0.25 * age), 0.035, 0.9 * (1 - age));
        });
        for (let i = 0; i < 5; i++) { const u = clamp01(t - 0.06 * i), l = build ? 0.5 : 0.5 * (1 - smooth(k / 0.6)); puff(i, at(u, new THREE.Vector3()).setY(0.08 + 0.03 * i), 0.22 + 0.06 * i, l * (1 - i * 0.14)); }
        return frame;
      }

      if (kind === 'hermes') {   // Gone: dust, nothing, footprints round him, and Hermes is behind with the blow
        behind.copy(a.feet).addScaledVector(dir, 0.85);
        const away = tmp.copy(behind).sub(a.caster).setY(0);
        offset.copy(away);
        if (build) {   // a big sand puff where he stood, rising and spreading as he goes: it has to read at phone size
          const u = clamp01(k / 0.85);   // the puff hangs for ~0.34 s (Strategy: ~0.3 s to read at 375 wide), not the whole 0.4 s build-up
          for (let i = 0; i < 16; i++) { const ang = i * 2.4 + hash(i, 1), r = 0.1 + 0.7 * u * hash(i, 2); puff(i, new THREE.Vector3(a.caster.x + Math.cos(ang) * r, 0.08 + 0.9 * u * hash(i, 3), a.caster.z + Math.sin(ang) * r), 0.4 + 0.65 * u, 0.8 * (1 - u * u)); }
          frame.hide = k >= 0.12; frame.offset = offset;
        } else {   // he stands behind the target for the first 40 % of the aftermath, then slides back to where the sim has him
          const u = clamp01(k / 0.5);
          frame.offset = offset.multiplyScalar(1 - smooth((k - 0.4) / 0.6));
          for (let i = 16; i < 26; i++) { const ang = i * 2.1; puff(i, new THREE.Vector3(behind.x + Math.cos(ang) * (0.1 + 0.3 * u * hash(i, 2)), 0.12 + 0.5 * u * hash(i, 3), behind.z + Math.sin(ang) * (0.1 + 0.3 * u * hash(i, 2))), 0.3 + 0.5 * u, 0.7 * (1 - u)); }
        }
        prints.forEach((m, j) => {   // deep fast prints looping round the target, each kicking up a few grains as it lands
          const t = (j + 1) / (PRINTS + 1), at = 0.15 + 0.75 * t, show = build ? k > at : true, fade = build ? 0.8 : 0.8 * (1 - smooth(k));
          m.position.copy(a.caster).lerp(behind, t).addScaledVector(side, Math.sin(t * Math.PI) * 0.8 + (j % 2 ? 0.18 : -0.18)); m.position.y = 0.012; m.rotation.z = Math.atan2(dir.x, dir.z);
          (m.material as THREE.MeshBasicMaterial).opacity = show ? fade : 0; m.visible = show && fade > 0.01;
          const age = build ? (k - at) / 0.4 : 1;   // the kick-up lasts ~0.16 s after the print lands
          if (show && age < 1) for (let n = 0; n < 4; n++) speck(j * 4 + n, new THREE.Vector3(m.position.x + (hash(j * 4 + n, 1) - 0.5) * 0.25 * age, 0.04 + 0.3 * age * (0.4 + hash(j * 4 + n, 2)), m.position.z + (hash(j * 4 + n, 3) - 0.5) * 0.25 * age), 0.035, 0.9 * (1 - age));
        });
        return frame;
      }

      // loki: Three Liars. The real one lunges and lands; the two afterimages are translucent snapshots of him, gone before the landing.
      const reach = Math.max(0, dist - 1.1);
      frame.offset = offset.copy(dir).multiplyScalar(reach * (build ? k * k : 1 - smooth((k - 0.4) / 0.6)));
      if (build && k >= GHOST_SINCE) {
        if (a.rig && !snaps.length) snapshot(a.rig);
        const u = (k - GHOST_SINCE) / (1 - GHOST_SINCE), e = 1 - (1 - u) ** 2, opacity = 0.36 * (1 - smooth((u - 0.85) / 0.15));   // held the whole 0.36 s, a short fade at the very end
        const place = (v: THREE.Vector3, n: number) => v.copy(a.caster).addScaledVector(side, (n ? 1 : -1) * (0.9 + 0.5 * e)).addScaledVector(dir, -0.15 + 0.5 * e);   // they slide 0.5 m apart as they run in: three of him
        snaps.forEach((snap, n) => { place(snap.root.position, n); if (a.heading) snap.root.quaternion.copy(a.heading); snap.materials.forEach((m) => { m.opacity = opacity; }); snap.root.visible = opacity > 0.01; });
        ghosts.forEach((g, n) => {   // the capsule stand-ins, only when there is no rig to copy
          if (snaps.length) return;
          place(g.position, n); g.position.y = 0.68;
          (g.material as THREE.MeshBasicMaterial).opacity = opacity; g.visible = opacity > 0.01;
        });
        const trail = snaps.length ? snaps.map((snap) => snap.root.position) : ghosts.map((g) => g.position);
        trail.forEach((at, n) => { for (let j = 0; j < 3; j++) puff(n * 3 + j, tmp.copy(at).addScaledVector(dir, -(0.25 + 0.2 * j)).setY(0.08 + 0.05 * j), 0.16 + 0.04 * j, 0.3 * (1 - smooth((u - 0.5) / 0.5))); });
      }
      return frame;
    },
  };

  // The registry's seam (special-modes.ts): `at` is the two bodies' feet, then the extra arguments, the caster's rig anchor and the target's head. The anchor
  // is the presentation anchor inside his actor group, which the sim positions: set to what this frame wants (absolute, since the rig zeroes it every frame) and
  // hidden while Hermes is gone. The caster's base is his group's sim position.
  let host: THREE.Object3D | null = null, hidden = false, shifted = false;
  const local = new THREE.Vector3(), inverse = new THREE.Quaternion();
  const restore = () => { if (host) { if (shifted) host.position.set(0, 0, 0); if (hidden) host.visible = true; } shifted = false; hidden = false; };
  return {
    render(dt: number, events: readonly CombatEvent[], fighters: readonly [Fighter, Fighter], tick: number, at: readonly [THREE.Vector3 | null, THREE.Vector3 | null], yielding: boolean, anchor: THREE.Object3D | null = null, head: THREE.Vector3 | null = null) {
      if (anchor !== host) { restore(); host = anchor; }
      const base = host?.parent?.position ?? at[1];
      const frame = base ? inner.frame(dt, events, fighters, tick, { caster: base, feet: at[0], head, rig: host, heading: host?.parent?.quaternion ?? null }, yielding) : null;
      if (!host || !frame) return;
      if (frame.offset) { inverse.copy(host.parent?.quaternion ?? inverse.identity()).invert(); local.copy(frame.offset).applyQuaternion(inverse); host.position.copy(local); shifted = true; }
      else if (shifted) { host.position.set(0, 0, 0); shifted = false; }   // the rig zeroes the anchor itself every frame (characters.ts), so the offset is written absolutely, never as a delta
      if (frame.hide !== hidden) { host.visible = !frame.hide; hidden = frame.hide; }
    },
    clear() { clear(); restore(); },
  };
}
