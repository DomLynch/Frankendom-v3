// Combat gore (finishers & gore 2026-09-17): the pooled ground splats and kill pool, the wound-site decals, and the blood on the
// killer's blade. Presentation only — every effect is driven by the simulation's events and positions, hidden in blood 'off',
// and cleared on rematch. The finisher blood (cut sites, arterial sources) lives in finisher-blood.ts; the impact dots stay
// with the scene's contact effects.
import * as THREE from 'three';
import { bloodiesMaterial, FLOOR_POOLS, FLOOR_SPLASHES, multiplyOnto } from './finisher-blood.ts';
export { multiplyOnto };
import type { HitLocation } from './blade.ts';
import type { Direction } from './moves.ts';

export type BloodMode = 'red' | 'dark' | 'off';
type Rigs = { player: { anchor: THREE.Object3D }; opponent: { anchor: THREE.Object3D } };

// Twelve pooled ground splats; a kill takes one as the corpse's spreading pool.
export function createSplatPool(scene: THREE.Scene, splatTexture: THREE.Texture | null) {
  const splats = Array.from({ length: 12 }, () => {
    const splat = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({
        color: '#591415',
        map: splatTexture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    splat.rotation.x = -Math.PI / 2;
    splat.visible = false; splat.userData.warmHidden = true;   // see fx.ts sparks: the first blood splat must not link its program mid-fight
    scene.add(splat);
    return { mesh: splat, life: 0, grow: 0, age: 0, dark: false, pool: false }; // grow: a kill pool spreads over ~2 s instead of appearing at once
  });
  let splatIndex = 0, photo = false, maps: { pool: THREE.Texture[]; splash: THREE.Texture[] } | null = null;
  // The floor stains the sand (owner 2026-09-23, on the death pool: "looks cartoon-ish, a bit more real needed"): textures made to
  // multiply onto it (scripts/blood/floor-textures.py) — a near-black core, thin translucent edges the grain shows through, a spatter
  // halo — drawn with multiplyOnto(), so blood darkens the sand instead of painting over it. The canvas star stands in until they
  // land (and under node), with the old tint.
  const tone = (mode: BloodMode) => (mode === 'dark' ? '#352426' : '#681a19');
  if (typeof document !== 'undefined')
    Promise.all([...FLOOR_POOLS, ...FLOOR_SPLASHES].map((f) => new THREE.TextureLoader().loadAsync(BLOOD_ASSET(f)))).then((all) => {
      for (const t of all) t.colorSpace = THREE.SRGBColorSpace;
      photo = true; maps = { pool: all.slice(0, FLOOR_POOLS.length), splash: all.slice(FLOOR_POOLS.length) };
      splats.forEach((splat, i) => multiplyOnto(splat.mesh.material, shape(splat.pool, i)));
    }).catch(() => {});   // no textures: the canvas star stays
  // Each stain its own silhouette (owner 2026-09-23: "non symmetrical and differentiated per blob"): the shapes go round in turn.
  const shape = (pool: boolean, i: number) => (pool ? maps!.pool : maps!.splash)[i % (pool ? maps!.pool : maps!.splash).length];
  return {
    // A flesh hit: a splash under the struck fighter, living 20 s.
    splash(target: { x: number; z: number }, bloodMode: BloodMode) {
      const splat = splats[splatIndex++ % splats.length];
      splat.life = 20;
      splat.grow = 0;
      splat.mesh.position.set(target.x, 0.022 + (splatIndex % 12) * 0.0001, target.z);
      splat.mesh.scale.set(0.22 + (splatIndex % 3) * 0.05, 0.13 + (splatIndex % 4) * 0.035, 1);
      splat.mesh.rotation.z = splatIndex * 2.4;
      splat.age = 0; splat.dark = bloodMode === 'dark'; splat.pool = false; if (maps) multiplyOnto(splat.mesh.material, shape(false, splatIndex >> 1));   // >> 1: off the scale terms' period, so a shape never keeps one aspect
      splat.mesh.material.color.set(photo ? FLOOR_FRESH : tone(bloodMode));
    },
    // A kill: the corpse keeps pooling after the splashes fade (cleared on rematch like everything else).
    pool(target: { x: number; z: number }, bloodMode: BloodMode) {
      const pool = splats[splatIndex++ % splats.length];
      pool.life = 1e9;
      pool.grow = 1e-6;
      pool.mesh.position.set(target.x, 0.03, target.z);
      pool.mesh.rotation.z = splatIndex * 2.4;
      pool.mesh.scale.set(0.3, 0.2, 1);
      pool.age = 0; pool.dark = bloodMode === 'dark'; pool.pool = true; if (maps) multiplyOnto(pool.mesh.material, shape(true, splatIndex));
      pool.mesh.material.color.set(photo ? FLOOR_FRESH : tone(bloodMode));
    },
    update(dt: number) {
      for (const splat of splats) {
        splat.life = Math.max(0, splat.life - dt);
        splat.mesh.visible = splat.life > 0;
        // A stain on the sand is the whole of its strength at full opacity; the canvas star kept its old, lighter ceiling.
        if (splat.life > 1e8) {
          splat.grow = Math.min(1, splat.grow + dt / 2.2);
          splat.mesh.scale.set(0.3 + 0.7 * splat.grow, (0.2 + 0.55 * splat.grow) * 0.8, 1);
          splat.mesh.material.opacity = (photo ? 1 : 0.7) * splat.grow;
        } // the kill pool spreads
        else splat.mesh.material.opacity = Math.min(photo ? 0.9 : 0.65, splat.life / 4);
        // It darkens as it dries: the multiplier walks from the fresh tone to the dried one over the first FLOOR_DRY seconds.
        if (photo && splat.mesh.visible) {
          splat.age += dt;
          splat.mesh.material.color.copy(FLOOR_FRESH).lerp(FLOOR_DRIED, Math.min(1, splat.age / FLOOR_DRY));
          if (splat.dark) splat.mesh.material.color.multiply(FLOOR_DARK_MODE);
        }
      }
    },
    // Rematch clears the lives (the next update hides the meshes); a blood-mode change hides them at once.
    clear(hide: boolean) {
      for (const splat of splats) {
        splat.life = 0;
        splat.grow = 0;
        if (hide) splat.mesh.visible = false;
      }
    },
    // Test/inspection view of the pool.
    get entries() {
      return splats as readonly { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; life: number; grow: number }[];
    },
  };
}

// Body wounds (owner 2026-09-21): every landed blade blow leaves a mark on the struck body — head, torso or legs from the
// simulation's hit location, on the side the swing came from (a right cut lands on the victim's left flank, an overhead on
// top, a thrust on the front). Marks are pooled per fighter, ride their bone every frame, and show only once that fighter
// is at 60 % health or below; from there the marks darken and the drips lengthen down to the death. Presentation only:
// the simulation decides the hit, the damage and the location. Hidden in blood 'off', cleared on rematch.
export const WOUND_THRESHOLD = 0.6, WOUNDS_PER_FIGHTER = 5;
const SIDES = [0, 1] as const;   // the two fighters: one shared tuple for the per-frame wound loop, not an array a frame
export type WoundHit = { location: HitLocation; direction: Direction; heading: number };   // heading = the struck fighter's facing
type WoundSite = { bone: string; dir: [number, number, number]; radius: number; width: number };
// The struck fighter's own frame: +x his left, +z his front (the rig convention). A blow from the attacker's right crosses to the victim's left.
// limb (owner 2026-09-22, "it can also run down the leg and arms", "a lot of skin here ... shoulder and arm, wrists"): 0 = the torso as
// always; 1 = the near upper arm; 2 = the near forearm at the wrist — bare skin on most rigs. mirror: the overhead cut's shoulder is
// picked per hit, either side — the Veteran's cloak covers one, the other is bare.
export function woundSite(hit: Pick<WoundHit, 'location' | 'direction'>, limb: 0 | 1 | 2 = 0, mirror = false): WoundSite {
  const side = hit.direction === 'right' ? 1 : hit.direction === 'left' ? -1 : 0;
  if (limb && side && hit.location === 'torso') {
    const l = side > 0 ? 'l' : 'r';
    return limb === 1 ? { bone: `upperarm_${l}`, dir: [side * .95, .1, .3], radius: .06, width: .5 } : { bone: `lowerarm_${l}`, dir: [side * .9, .2, .35], radius: .045, width: .45 };
  }
  if (hit.location === 'head') return { bone: 'Head', dir: side ? [side * .9, .25, .35] : hit.direction === 'overhead' ? [0, .75, .65] : [0, .1, 1], radius: .105, width: .55 };
  if (hit.location === 'legs') return { bone: side < 0 ? 'thigh_r' : 'thigh_l', dir: side ? [side * .85, 0, .5] : [0, 0, 1], radius: .085, width: .6 };
  if (hit.direction === 'overhead') return { bone: 'spine_03', dir: [mirror ? -.35 : .35, .55, .75], radius: .22, width: .8 };   // the shoulder line, sword side up; .22 clears a cloak or pauldron (Lead 2026-09-22: radius, not the depth test)
  return { bone: side ? 'spine_02' : 'spine_03', dir: side ? [side * .9, .05, .45] : [0, 0, 1], radius: side ? .17 : .15, width: side ? .7 : 1 };
}
// The blood's own look (owner 2026-09-22: "proper blood dripping", not a paint sticker): photo-grade textures generated with
// FLUX.1-Krea through the creature pipeline's own gradio_client route, alpha-keyed from a white plate — a lopsided glossy
// splat with a dark core and thin translucent edge, and a drip with a rounded bead at its leading edge and a tapering tail —
// plus small normal maps from their own luminance so the arena sun catches the bead. Loaded lazily in the browser only; the
// node tests build the pool without textures (the canvas splat stands in until the PNG lands, and forever under node).
const BLOOD_ASSET = (file: string) => new URL(`../assets/blood/${file}`, import.meta.url).href;
const FLOOR_FRESH = new THREE.Color('#ffffff'), FLOOR_DRIED = new THREE.Color('#b09a9a'), FLOOR_DARK_MODE = new THREE.Color('#a8a0a0');
const FLOOR_DRY = 8;   // seconds for a stain to settle from wet to dried
const BLOOD_TEXTURES = { floorPool: 'floor-pool.png', floorSplash: 'floor-splash.png', drip: 'blood-drip.png', dripNormal: 'blood-drip-normal.png' } as const;
// The wound itself, authored for a vertical body, not a floor (owner 2026-09-23 on the phone: "paint-ball graffiti stickers… less
// uniform… more dripping style not a star"; he picked B, C and D from four FLUX candidates): B a cut with uneven streaks, C a patch
// with one trickle and a hanging drop, D loose teardrops. Each is 256×320, top edge = the cut, drawn upright — never spun, since the
// run in the art must point down. Each hit picks one from its own seed, so a replay draws the same wound.
export const WOUND_ART = ['b', 'c', 'd'].map((k) => ({ map: `blood-wound-${k}.png`, normal: `blood-wound-${k}-normal.png` }));
export const WOUND_SIZE = { width: 0.1, height: 0.125, tilt: 0.2 } as const;   // metres (the art's 4:5), radians either way off upright
// A run: after a landed hit each strand waits DRIP.start, then grows from a bead to a streak over DRIP.duration (both seeded
// per strand), stops, and dries — roughness DRY.roughness[0] → [1] and the fresh tone → the dried tone over DRY.seconds.
// New hits add fresh runs. Nothing here cycles: a run that has finished stays as it lies until the rematch clears it.
export const DRIP = { start: [0, 0.3], duration: [1.5, 3], width: [0.75, 1.3], offset: 0.03, bead: 0.028, length: [0.11, 0.19] } as const;   // seconds, seconds, ×, metres, metres, metres at threshold → at death (a man's torso)
export const DRY = { seconds: 20, roughness: [0.42, 0.75] } as const;   // a thin wet edge, not a gloss coat
// Drops to the floor (owner 2026-09-23: "drop from body onto the floor, like droplets… not a river, rather slowly"): once a run has
// stopped growing its first run sheds a drop from its tip every `every` seconds (seeded per strand) until the wound is half dry. A drop falls
// under gravity and leaves a small spot on the sand. Hard caps: `inFlight` drops in the air, `spots` on the floor (oldest recycled).
export const DROPS = { every: [3, 6], until: 0.5, inFlight: 8, spots: 24, spot: [0.04, 0.08], gravity: 9.8, floor: 0.021, seconds: 25 } as const;   // s, dry share, count, count, metres, m/s², metres, s
const ARM_SHARE = 0.5;   // share of side cuts across the torso that land on the near arm instead (half upper arm, half wrist)
const FRESH = new THREE.Color('#e0a0a0'), DRIED = new THREE.Color('#7a5456');   // multiplied over the art's own dark reds: a light hand, or it reads as soot (owner 2026-09-23: near-black on the hero's back)
const CANVAS_FRESH = new THREE.Color('#581017'), CANVAS_DRIED = new THREE.Color('#2a1516');   // the tint the white canvas splat needs until the photo lands (and under node)
const DARK_MODE = new THREE.Color('#5a4d4c');
// Seeded per hit from what the simulation already decided — the fight's hit ordinal on this side, the blow's heading, its
// location and direction — so a replay of the same fight draws the same runs. A small LCG, never Math.random.
export function woundSeed(index: number, hit: Pick<WoundHit, 'location' | 'direction' | 'heading'>): number {
  const loc = { head: 1, torso: 2, legs: 3 }[hit.location], dir = { right: 1, left: 2, overhead: 3, thrust: 4, low: 5 }[hit.direction];
  return (Math.imul(index + 1, 2654435761) ^ Math.imul(Math.round(hit.heading * 1000) | 0, 40503) ^ (loc * 7919 + dir * 104729)) >>> 0;
}
export function lcg(state: number): number { return (Math.imul(state, 1664525) + 1013904223) >>> 0; }
// Where the skin (or the armour over it) actually is along the wound normal: a ray from well outside back toward the bone, against
// the rig's own skinned meshes in their current pose (owner 2026-09-22: "it floats off the chars" — the site table's radius is a
// guess per slot, and on a bare shoulder the guess for a pauldron hangs in the air). The table value stands when nothing is met
// (node tests, a rig with no skin) and the answer is clamped to its neighbourhood so a stray polygon cannot fling the mark.
const unit = (state: number) => state / 4294967296;
const SURFACE = { reach: 0.6, proud: 0.004, clamp: [0.35, 1.5] } as const;
const surfaceRay = new THREE.Raycaster(), surfaceFrom = new THREE.Vector3(), surfaceDir = new THREE.Vector3(), surfaceBone = new THREE.Vector3();
const surfaceNormal = new THREE.Vector3(), surfaceMat = new THREE.Matrix3();
// Where the wound actually sits (owner 2026-09-22: "it floats off the chars", then "not joined to the gear or opponent"): a ray from
// well outside, back along the wound normal, against the rig's own skinned meshes in their current pose. We keep the POINT it met and
// that face's own NORMAL, both in the struck bone's frame, so the mark lies flat on the cloak, gambeson or skin it hit and rides the
// animation with it — a radius along a guessed direction put a flat blotch in front of the cloth instead. Null when nothing is met
// (node tests, a rig with no skin, a ray past a flapping cape): the caller falls back to the site table's radius along its guess.
// three 0.186's SkinnedMesh.applyBoneTransform spreads its target (`_baseVector.set(...target, 1)`); Vector3's iterator is a
// generator, so every call allocates the generator and three result objects — and a ray against a rig transforms every vertex of
// every skin (Mesh.raycast → getVertexPosition). One ray a frame re-glues a wound (update below) and five land per hit, which the
// 2026-09-25 heap profile put at 217 MB/s of garbage in an idle phone-tier fight: the heap sawtooth behind the ~1 s stalls on
// the base arena. Same maths without the spread: 36 MB/s (upstream dev still spreads, checked the same day). Every caller
// benefits (characters.ts loot fitting, opened.ts), since the override lives on the prototype.
const boneIndex = new THREE.Vector4(), boneWeight = new THREE.Vector4(), boneBase = new THREE.Vector4(), boneScratch = new THREE.Vector4(), boneMatrix = new THREE.Matrix4();
THREE.SkinnedMesh.prototype.applyBoneTransform = function (this: THREE.SkinnedMesh, index: number, target: THREE.Vector3 | THREE.Vector4) {
  const { skeleton, geometry } = this, out = target as THREE.Vector4, homogeneous = (target as THREE.Vector4).isVector4;
  boneIndex.fromBufferAttribute(geometry.attributes.skinIndex as THREE.BufferAttribute, index);
  boneWeight.fromBufferAttribute(geometry.attributes.skinWeight as THREE.BufferAttribute, index);
  if (homogeneous) { boneBase.copy(out); out.set(0, 0, 0, 0); } else { boneBase.set(target.x, target.y, target.z, 1); (target as THREE.Vector3).set(0, 0, 0); }
  boneBase.applyMatrix4(this.bindMatrix);
  for (let i = 0; i < 4; i++) {
    const weight = boneWeight.getComponent(i);
    if (weight === 0) continue;
    const bone = boneIndex.getComponent(i);
    boneMatrix.multiplyMatrices(skeleton.bones[bone].matrixWorld, skeleton.boneInverses[bone]);
    out.addScaledVector(boneScratch.copy(boneBase).applyMatrix4(boneMatrix), weight);
  }
  if (homogeneous) out.w = boneBase.w;   // the homogeneous coordinate survives the vector operations, as upstream keeps it
  return out.applyMatrix4(this.bindMatrixInverse);
} as typeof THREE.SkinnedMesh.prototype.applyBoneTransform;
const skinCache = new WeakMap<THREE.Object3D, THREE.Object3D[]>();
function skinsOf(root: THREE.Object3D): THREE.Object3D[] {
  let skins = skinCache.get(root);
  if (!skins) { skins = []; root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skins!.push(o); }); skinCache.set(root, skins); }
  return skins;
}
export function surfaceHit(root: THREE.Object3D, bone: THREE.Object3D, normal: THREE.Vector3): { point: THREE.Vector3; normal: THREE.Vector3 } | null {
  const skins = skinsOf(root).filter((o) => o.visible);
  if (!skins.length) return null;
  bone.getWorldPosition(surfaceBone); surfaceFrom.copy(surfaceBone).addScaledVector(normal, SURFACE.reach); surfaceDir.copy(normal).negate();
  surfaceRay.set(surfaceFrom, surfaceDir); surfaceRay.far = SURFACE.reach;
  const met = surfaceRay.intersectObjects(skins, false)[0];
  if (!met || !met.normal) return null;
  const r = SURFACE.reach - met.distance;   // how far out from the bone the surface is; a stray polygon must stay in the slot's neighbourhood
  if (r < 0.01) return null;
  // The face normal is in the hit object's local space; take it to world, and keep it pointing back at the blow.
  surfaceNormal.copy(met.normal).applyMatrix3(surfaceMat.getNormalMatrix(met.object.matrixWorld)).normalize();
  if (surfaceNormal.dot(normal) < 0) surfaceNormal.negate();
  return { point: met.point.clone(), normal: surfaceNormal.clone() };
}
// How far the blood can run before it leaves the body: from the wound, step down the surface and ask, at each step, whether there
// is still something under it. A run that grew past the edge of a cape or the underside of an arm hung in mid-air (owner
// 2026-09-22: "not joined to the gear or opponent"). Four short rays per hit, none per frame. Returns metres, 0 if nothing holds.
function surfaceReach(root: THREE.Object3D, point: THREE.Vector3, normal: THREE.Vector3, down: THREE.Vector3, max: number): number {
  const skins = skinsOf(root).filter((o) => o.visible);
  if (!skins.length) return max;
  let reach = 0;
  for (let i = 1; i <= 4; i++) {
    const step = (max * i) / 4;
    surfaceFrom.copy(point).addScaledVector(down, step).addScaledVector(normal, 0.05);
    surfaceDir.copy(normal).negate(); surfaceRay.set(surfaceFrom, surfaceDir); surfaceRay.far = 0.1;
    if (!surfaceRay.intersectObjects(skins, false).length) break;
    reach = step;
  }
  return reach;
}
// The radius that the site table's guess is clamped to when a surface was met, kept for the fallback path and the tests.
export function clampRadius(measured: number, fallback: number): number {
  return Math.min(fallback * SURFACE.clamp[1], Math.max(fallback * SURFACE.clamp[0], measured + SURFACE.proud));
}
export function createBodyWounds(scene: THREE.Scene, splatTexture: THREE.Texture | null) {
  type Strand = { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>; map: THREE.Texture | null; start: number; duration: number; width: number; offset: number; live: boolean; drop: number; dropSeed: number };
  type Mark = { group: THREE.Group; mark: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>; art: number; strands: Strand[]; bone: THREE.Object3D | null; dir: THREE.Vector3; anchor: THREE.Vector3 | null; reach: number; radius: number; width: number; scale: number; age: number; used: boolean; runs: number };
  // Lit, wet, and drawn OVER the rig (Strategy ruling 2026-09-22, Dom: "leaks through, over"): no depth test, so a cloak or a
  // pauldron never hides the wound; no depth write. What stops it bleeding through the body is the facing test in update():
  // a mark whose surface normal points away from the eye is hidden, not depth-buffered.
  const material = (map: THREE.Texture | null, normalMap: THREE.Texture | null) => new THREE.MeshStandardMaterial({
    color: FRESH, map, normalMap, normalScale: new THREE.Vector2(0.45, 0.45), roughness: DRY.roughness[0], metalness: 0,
    transparent: true, opacity: 0, depthWrite: false, depthTest: false,
  });
  const fighters = [0, 1].map(() => Array.from({ length: WOUNDS_PER_FIGHTER }, (): Mark => {
    const group = new THREE.Group(), mark = new THREE.Mesh(new THREE.PlaneGeometry(WOUND_SIZE.width, WOUND_SIZE.height), material(splatTexture, null));
    mark.geometry.translate(0, .02 - WOUND_SIZE.height / 2, 0);   // the art's top edge (the cut) sits just above the wound point; the rest hangs below
    const strands = [0, 1, 2].map((): Strand => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material(null, null));   // unit quad: scale = (width, length)
      mesh.geometry.translate(0, -0.5, 0);   // hang from the top edge: y=0 is the wound, the quad grows downward
      group.add(mesh);
      return { mesh, map: null, start: 0, duration: 1, width: 1, offset: 0, live: false, drop: Infinity, dropSeed: 0 };
    });
    group.add(mark); group.visible = false; scene.add(group);
    return { group, mark, art: 0, strands, bone: null, dir: new THREE.Vector3(), anchor: null, reach: Infinity, radius: 0, width: 1, scale: 1, age: 0, used: false, runs: 0 };
  }));
  // The drops in the air and the spots they leave: small fixed pools, nothing allocated per drop.
  const dropGeometry = new THREE.SphereGeometry(1, 6, 4), spotGeometry = new THREE.CircleGeometry(0.5, 14).rotateX(-Math.PI / 2);
  const drops = Array.from({ length: DROPS.inFlight }, () => {
    const mesh = new THREE.Mesh(dropGeometry, new THREE.MeshStandardMaterial({ color: '#5c0d12', roughness: 0.3, metalness: 0 }));
    mesh.visible = false; scene.add(mesh);
    return { mesh, vy: 0, live: false, seed: 0 };
  });
  const spots = Array.from({ length: DROPS.spots }, () => {
    const mesh = new THREE.Mesh(spotGeometry, new THREE.MeshBasicMaterial({ color: '#681a19', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    mesh.visible = false; scene.add(mesh);
    return { mesh, life: 0 };
  });
  let nextSpot = 0;
  let next = [0, 0], photo = false, reanchor = 0, art: { map: THREE.Texture; normal: THREE.Texture }[] = [];   // photo: the FLUX textures have landed (they carry their own colour; the canvas splat needs the tint)
  // Textures land after the pool exists (browser only). Every strand gets its own clone of the drip map so its UV window can
  // show only the part of the run that has happened — the bead at the leading edge never stretches.
  if (typeof document !== 'undefined') {
    const loader = new THREE.TextureLoader();
    const srgb = (t: THREE.Texture) => { t.colorSpace = THREE.SRGBColorSpace; return t; };
    const files = [BLOOD_TEXTURES.drip, BLOOD_TEXTURES.dripNormal, ...WOUND_ART.flatMap((a) => [a.map, a.normal]), ...FLOOR_SPLASHES];
    Promise.all(files.map((f) => loader.loadAsync(BLOOD_ASSET(f)))).then(([drip, dripNormal, ...rest]) => {
      const wounds = rest.slice(0, WOUND_ART.length * 2), floors = rest.slice(WOUND_ART.length * 2);
      srgb(drip); floors.forEach(srgb); photo = true;
      spots.forEach((spot, i) => multiplyOnto(spot.mesh.material, floors[i % floors.length]));   // the drop spots stain the sand like the splashes, each its own shape
      art = WOUND_ART.map((_, i) => ({ map: srgb(wounds[i * 2]), normal: wounds[i * 2 + 1] }));
      for (const side of fighters) for (const mark of side) {
        wear(mark);
        for (const strand of mark.strands) {
          strand.map = drip.clone(); strand.map.needsUpdate = true;
          strand.mesh.material.map = strand.map; strand.mesh.material.normalMap = dripNormal; strand.mesh.material.needsUpdate = true;
        }
      }
    }).catch(() => {});   // no textures: the canvas splat and untextured strands still draw; nothing throws mid-fight
  }
  // Scratch objects (Lead review, 2026-09-22): reused across marks and frames — the loop is synchronous and single-threaded,
  // so nothing reads a scratch value across iterations. Per frame the update writes only transforms, opacity, roughness and
  // colour; it allocates nothing.
  const scratchQuat = new THREE.Quaternion(), scratchPos = new THREE.Vector3(), scratchNormal = new THREE.Vector3();
  const scratchRight = new THREE.Vector3(), scratchForward = new THREE.Vector3(), scratchMatrix = new THREE.Matrix4(), scratchColor = new THREE.Color(), scratchEye = new THREE.Vector3();
  const ease = (t: number) => 1 - (1 - t) * (1 - t);   // a run starts fast and slows as it thins out
  // A run's ceiling: DRIP.length at the threshold rising with severity (#356's linear curve, re-floored so the slowest seeded run still
  // passes 8 cm by 1.5 s on a man's torso), capped where the surface under it ends.
  const ceiling = (mark: Mark, severity: number) => Math.min(mark.reach, (DRIP.length[0] + (DRIP.length[1] - DRIP.length[0]) * severity) * mark.scale);
  // Shed the drops that are due from a wound's stopped runs, from each run's tip in the world. Runs whether or not the wound faces
  // the eye: blood on the far side of a body still drips onto the sand in front of the player.
  function shed(mark: Mark, severity: number, dry: number) {
    const strand = mark.strands[0];   // one tap per wound: a slow leak, not a stream from every run
    if (!strand.live || mark.age < strand.drop) return;
    strand.dropSeed = lcg(strand.dropSeed);
    strand.drop += DROPS.every[0] + unit(strand.dropSeed) * (DROPS.every[1] - DROPS.every[0]);
    if (dry >= DROPS.until) return;   // a drying wound has stopped leaking
    const drop = drops.find((d) => !d.live); if (!drop) return;   // the cap: a drop with no free slot is simply not shed
    scratchPos.set(strand.offset * mark.scale, -.02 * mark.scale - ceiling(mark, severity), 0.004).applyQuaternion(mark.group.quaternion).add(mark.group.position);
    drop.mesh.position.copy(scratchPos); drop.vy = 0; drop.live = true; drop.seed = strand.dropSeed;
    drop.mesh.scale.set(0.009 * mark.scale, 0.014 * mark.scale, 0.009 * mark.scale); drop.mesh.visible = true;
  }

  function wear(mark: Mark) {   // the mark's picked art, once the textures have landed (the canvas splat stands in before, and under node)
    const pick = art[mark.art]; if (!pick || mark.mark.material.map === pick.map) return;
    mark.mark.material.map = pick.map; mark.mark.material.normalMap = pick.normal; mark.mark.material.needsUpdate = true;
  }
  return {
    // A blow landed on `side`: take the next pooled mark (the oldest when all are used), pin it to the struck bone on the
    // struck face, and seed this hit's runs: how many strands (1–3), each one's width, x offset, start delay and duration.
    hit(side: 0 | 1, root: THREE.Object3D, hit: WoundHit, scale = 1) {
      let seed = woundSeed(next[side], hit);
      seed = lcg(seed); const draw = unit(seed);   // seeded like the runs: a replay lands the same cut on the same limb, the same shoulder
      const limb = draw < ARM_SHARE ? (draw < ARM_SHARE / 2 ? 1 : 2) : 0, mirror = draw >= .5;
      const site = woundSite(hit, limb, mirror), bone = root.getObjectByName(site.bone) ?? (limb ? root.getObjectByName(woundSite(hit, 0, mirror).bone) : null);
      if (!bone) return false;
      const mark = fighters[side][next[side] % WOUNDS_PER_FIGHTER]; next[side]++;
      const world = new THREE.Vector3(...site.dir).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), hit.heading);
      root.updateWorldMatrix(true, true);
      mark.bone = bone;   // cached (audit, 2026-09-22): update() ran a recursive getObjectByName search every frame for every used mark
      // Anchor on the surface the blow actually met — its point AND its own normal, kept in the bone's frame so the mark rides the
      // animation lying flat on that cloak, gambeson or skin. Nothing met (no skin, a ray past a flapping cape) → the old path:
      // the site table's direction at its own radius out from the bone.
      const met = surfaceHit(root, bone, world), inverse = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
      mark.dir.copy(met ? met.normal : world).applyQuaternion(inverse);
      mark.anchor = met ? bone.worldToLocal(met.point.clone()) : null;
      if (met) {   // the same basis update() builds: +Y is world-up along the surface, so −Y is the way the blood runs
        const right = new THREE.Vector3(0, 1, 0).cross(met.normal); if (right.lengthSq() < 1e-4) right.set(1, 0, 0);
        const down = right.normalize().cross(met.normal).normalize();
        mark.reach = surfaceReach(root, met.point, met.normal, down, (DRIP.length[0] + (DRIP.length[1] - DRIP.length[0])) * scale);
      } else mark.reach = Infinity;
      mark.radius = met ? SURFACE.proud : site.radius * scale; mark.width = site.width; mark.scale = scale; mark.age = 0; mark.used = true;
      seed = lcg(seed); mark.mark.rotation.z = (unit(seed) * 2 - 1) * WOUND_SIZE.tilt;   // a little off upright per hit; the art's run still points down
      seed = lcg(seed); mark.runs = 1 + Math.floor(unit(seed) * 3);
      mark.strands.forEach((strand, i) => {
        strand.live = i < mark.runs;
        seed = lcg(seed); strand.width = DRIP.width[0] + unit(seed) * (DRIP.width[1] - DRIP.width[0]);
        seed = lcg(seed); strand.offset = (unit(seed) * 2 - 1) * DRIP.offset;
        seed = lcg(seed); strand.start = DRIP.start[0] + unit(seed) * (DRIP.start[1] - DRIP.start[0]);
        seed = lcg(seed); strand.duration = DRIP.duration[0] + unit(seed) * (DRIP.duration[1] - DRIP.duration[0]);
      });
      seed = lcg(seed); mark.art = Math.floor(unit(seed) * WOUND_ART.length); wear(mark);   // drawn last so the runs above keep their seeds
      for (const strand of mark.strands) {   // the first drop leaves a run a little after it stops growing
        seed = lcg(seed); strand.dropSeed = seed;
        strand.drop = strand.start + strand.duration + DROPS.every[0] + unit(seed) * (DROPS.every[1] - DROPS.every[0]);
      }
      return true;
    },
    // Each frame, after the rigs animate: follow the bones; strength from the fighter's health fraction (nothing above the
    // threshold); each live strand's run on its own clock; the whole wound drying out once its runs have stopped.
    update(dt: number, roots: readonly [THREE.Object3D | null, THREE.Object3D | null], health: readonly [number, number], bloodMode: BloodMode, hidden: readonly [boolean, boolean] = [false, false], eye: THREE.Vector3 | null = null) {
      // Skin and cloth deform away from the bone as the fight goes on, so a mark anchored once drifts off the body (owner
      // 2026-09-22: "not joined to the gear or opponent" — measured 5.8 cm on the Veteran's cloak 1.5 s after the hit). One mark
      // is re-measured per frame, round robin: at most ten in the pool, so each is re-glued ~6 times a second for one ray a frame.
      reanchor = (reanchor + 1) % (WOUNDS_PER_FIGHTER * 2);
      const side0 = reanchor < WOUNDS_PER_FIGHTER ? 0 : 1, glue = fighters[side0][reanchor % WOUNDS_PER_FIGHTER], glueRoot = roots[side0];
      if (glue.used && glue.anchor && glue.bone && glueRoot) {
        const out = scratchNormal.copy(glue.dir).applyQuaternion(glue.bone.getWorldQuaternion(scratchQuat)).normalize();
        const met = surfaceHit(glueRoot, glue.bone, out);
        if (met) { glue.dir.copy(met.normal).applyQuaternion(glue.bone.getWorldQuaternion(scratchQuat).invert()); glue.anchor.copy(glue.bone.worldToLocal(met.point)); }
      }
      for (const side of SIDES) {
        const severity = Math.min(1, Math.max(0, (WOUND_THRESHOLD - health[side]) / WOUND_THRESHOLD)), root = roots[side];
        for (const mark of fighters[side]) {
          const bone = mark.used ? mark.bone : null;
          const show = !!bone && !!root && health[side] <= WOUND_THRESHOLD && bloodMode !== 'off' && !hidden[side];
          mark.group.visible = show;
          if (!show || !bone) continue;
          mark.age += dt;
          // Follow the bone. The basis puts world-up projected onto the surface along the group's +Y, so a strand hanging
          // down −Y runs along world-down on the skin whatever the bone's rotation (a shoulder, a thigh, a bowed head).
          const normal = scratchNormal.copy(mark.dir).applyQuaternion(bone.getWorldQuaternion(scratchQuat)).normalize();
          if (mark.anchor) mark.group.position.copy(scratchPos.copy(mark.anchor).applyMatrix4(bone.matrixWorld)).addScaledVector(normal, mark.radius);
          else mark.group.position.copy(bone.getWorldPosition(scratchPos)).addScaledVector(normal, mark.radius);
          const right = scratchRight.set(0, 1, 0).cross(normal); if (right.lengthSq() < 1e-4) right.set(1, 0, 0); right.normalize();
          const forward = scratchForward.copy(normal).cross(right).normalize();
          mark.group.quaternion.setFromRotationMatrix(scratchMatrix.makeBasis(right, forward, normal));
          // Facing: with no depth test, the body's far side would show through the near side — so a mark on the surface that
          // faces away from the eye is hidden outright (its clock keeps running; it is back the moment the fighter turns).
          // A grazing mark on the silhouette still belongs to the body the player is looking at, so only one clearly turned away is
          // dropped (−0.15, not 0): with true surface normals a hard zero blinked marks out along the edge of a shoulder or a hip.
          // The dry-out: from the moment the last run has stopped, 20 s from wet and bright to matte and dark.
          let stopped = 0; for (const s of mark.strands) if (s.live) stopped = Math.max(stopped, s.start + s.duration);   // a loop, not a closure per mark per frame
          const dry = Math.min(1, Math.max(0, (mark.age - stopped) / DRY.seconds));
          shed(mark, severity, dry);
          if (eye && scratchEye.copy(eye).sub(mark.group.position).normalize().dot(normal) < -0.15) { mark.group.visible = false; continue; }
          const roughness = DRY.roughness[0] + (DRY.roughness[1] - DRY.roughness[0]) * dry;
          scratchColor.copy(photo ? FRESH : CANVAS_FRESH).lerp(photo ? DRIED : CANVAS_DRIED, dry); if (bloodMode === 'dark') scratchColor.multiply(DARK_MODE);
          const fade = Math.min(1, mark.age / .25);
          mark.mark.scale.set(mark.width * (.9 + .5 * severity) * mark.scale, (.9 + .5 * severity) * mark.scale, 1);
          mark.mark.material.opacity = fade * (.75 + .25 * severity); mark.mark.material.color.copy(scratchColor); mark.mark.material.roughness = roughness;
          for (const strand of mark.strands) {
            const run = strand.live ? ease(Math.min(1, Math.max(0, (mark.age - strand.start) / strand.duration))) : 0;
            strand.mesh.visible = strand.live && mark.age >= strand.start;
            if (!strand.mesh.visible) continue;
            // Length: the bead alone at the start, then the run's share of its ceiling — DRIP.length at the threshold rising with
            // severity (#356's linear curve, re-floored so the slowest seeded run still passes 8 cm by 1.5 s on a man's torso).
            const maxLength = ceiling(mark, severity), length = DRIP.bead * mark.scale + run * Math.max(0, maxLength - DRIP.bead * mark.scale);
            const width = .032 * strand.width * mark.scale;
            strand.mesh.scale.set(width, length, 1);
            strand.mesh.position.set(strand.offset * mark.scale, -.02 * mark.scale, .0015);
            // The texture's bead sits at v=0: show the bottom `length / full` of the map so the bead leads and only the tail lengthens.
            if (strand.map) { const full = width * 4; strand.map.repeat.y = Math.min(1, length / full); strand.map.offset.y = 0; }
            strand.mesh.material.opacity = fade * (.85 + .15 * severity);
            strand.mesh.material.color.copy(scratchColor); strand.mesh.material.roughness = roughness;
          }
        }
      }
      // Drops fall; one that reaches the sand becomes a spot there (the oldest spot is recycled past the cap).
      for (const drop of drops) {
        if (!drop.live) continue;
        drop.vy -= DROPS.gravity * dt; drop.mesh.position.y += drop.vy * dt;
        drop.mesh.visible = bloodMode !== 'off';
        if (drop.mesh.position.y > DROPS.floor) continue;
        drop.live = false; drop.mesh.visible = false;
        const spot = spots[nextSpot++ % spots.length], size = DROPS.spot[0] + unit(lcg(drop.seed)) * (DROPS.spot[1] - DROPS.spot[0]);
        spot.mesh.position.set(drop.mesh.position.x, DROPS.floor + (nextSpot % spots.length) * 0.00005, drop.mesh.position.z);
        spot.mesh.rotation.y = unit(drop.seed) * Math.PI * 2; spot.mesh.scale.set(size, 1, size * 0.85); spot.life = DROPS.seconds;
      }
      for (const spot of spots) {
        spot.life = Math.max(0, spot.life - dt);
        spot.mesh.visible = spot.life > 0 && bloodMode !== 'off';
        if (!spot.mesh.visible) continue;
        spot.mesh.material.opacity = Math.min(1, spot.life / 3) * 0.9;
        spot.mesh.material.color.set(!photo ? '#681a19' : bloodMode === 'dark' ? '#a8a0a0' : '#ffffff');
      }
    },
    clear() { for (const side of fighters) for (const mark of side) { mark.used = false; mark.bone = null; mark.anchor = null; mark.group.visible = false; mark.age = 0; mark.runs = 0; for (const s of mark.strands) { s.live = false; s.mesh.visible = false; s.drop = Infinity; } }
      for (const d of drops) { d.live = false; d.mesh.visible = false; } for (const t of spots) { t.life = 0; t.mesh.visible = false; } next = [0, 0]; nextSpot = 0; },
    get droplets() { return { falling: drops.filter((d) => d.live).length, spots: spots.filter((t) => t.life > 0).length, drops, pool: spots }; },
    get entries() { return fighters as readonly (readonly Mark[])[]; },
  };
}

// Blood on the blade: the killer's weapon tints after a kill and stays bloodied until the next fight. Materials are cloned
// before tinting so a shared GLB never bloodies both swords.
export function createBladeBlood() {
  const bladeOriginals = new Map<THREE.Mesh, THREE.MeshStandardMaterial>();
  let bloodiedBlade = false,
    bloodiedSide: 0 | 1 = 0;
  return {
    get bloodied() {
      return bloodiedBlade;
    },
    // `on` tints `side`'s blade (default: the side last bloodied); off restores both. Nothing to tint until the rigs are loaded.
    set(on: boolean, warriors: Rigs | null | undefined, bloodMode: BloodMode, side: 0 | 1 = bloodiedSide) {
      bloodiedSide = side;
      if (!warriors) return;
      const anchors = on
        ? [side === 0 ? warriors.player.anchor : warriors.opponent.anchor]
        : [warriors.player.anchor, warriors.opponent.anchor];
      for (const anchor of anchors) {
        const twoHanded = anchor.getObjectByName('WeaponDrawn'),
          node = twoHanded ?? anchor.getObjectByName('SwordDrawn');
        node?.traverse((object) => {
          if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial))
            return;
          if (!bloodiesMaterial(object.material.name, !!twoHanded)) return; // the blade, never the haft
          const original = bladeOriginals.get(object) ?? (object.material as THREE.MeshStandardMaterial);
          if (on) {
            if (!bladeOriginals.has(object)) {
              bladeOriginals.set(object, object.material as THREE.MeshStandardMaterial);
              object.material = object.material.clone();
            }
            // A sword's thin blade takes the blood colour as a smear; a broad hafted blade (the scythe's crescent) is a
            // metallic mirror, so the same lerp turned the whole crescent into bright red plastic (owner, 2026-09-21).
            // Blood on a broad blade is a dark wet film: darker tone, and it stops mirroring the sky.
            const bloodied = object.material as THREE.MeshStandardMaterial;
            bloodied.color
              .copy(original.color)
              .lerp(new THREE.Color(bloodMode === 'dark' || twoHanded ? '#2a1516' : '#7a1410'), 0.55);
            if (twoHanded) {
              bloodied.metalness = Math.min(original.metalness, 0.3);
              bloodied.roughness = Math.max(original.roughness, 0.7);
            }
          } else if (bladeOriginals.has(object)) {
            object.material.dispose();
            object.material = original;
            bladeOriginals.delete(object);
          }
        });
      }
      bloodiedBlade = on;
    },
  };
}
