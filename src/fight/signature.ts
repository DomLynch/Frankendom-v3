import * as THREE from 'three';
import type { CombatEvent, Fighter, Side } from './duel.ts';
import type { OpponentId } from '../roster.ts';
import { HEAVY_CLASS } from './clash-sparks.ts';
import { surfaceHit, woundSite, type WoundHit } from './gore.ts';

// Signature effects (Brief: docs/briefs/signature-effects.md, Dom 2026-09-24): one cosmetic effect per opponent, keyed to an event the
// duel already emits. Renderer-side only: nothing here reads input, writes the sim or changes a number the fight uses. An effect is
// a pure trigger (`when`, tested under node) plus what it draws (`fire`, and `update` for anything that lives over time). The marks it
// leaves come from capped pools that last the fight and are cleared with the fighters' wounds; the oldest mark is the one reused.
// `ship` is what players get: the variant Dom ruled for this opponent (SHIPPED), or nothing. `on` / A–C are the admin preview.
export type SignatureMode = 'off' | 'ship' | 'on' | 'A' | 'B' | 'C';
export type SignatureVariant = 'A' | 'B' | 'C';
export const SIGNATURE_MODES: readonly SignatureMode[] = ['off', 'ship', 'on', 'A', 'B', 'C'];
// The ruled variant per opponent (Strategy for Dom, 2026-09-24): on by default for every player. An opponent missing here (anyone not
// yet ruled) shows nothing outside the admin preview. A letter whose effect is not registered yet also shows nothing.
export const SHIPPED: Partial<Record<OpponentId, { variant: SignatureVariant; name: string }>> = {
  nightborn: { variant: 'B', name: 'Blood Recall' },
  executioner: { variant: 'A', name: 'The Reaping Scar' },
  pitborn: { variant: 'A', name: "Butcher's Wake" },
  plaguedoctor: { variant: 'B', name: 'Rot Bloom' },
  goblin: { variant: 'C', name: 'Hooked Wound' },
  knight: { variant: 'B', name: 'Rivet B' },   // flying rivets, no dent or socket (Rivet C closed, Strategy 2026-09-24)
  veteran: { variant: 'C', name: 'Blade Bite' },   // shavings off the trident (Strategy YES 2026-09-24 15:40)
  dwarf: { variant: 'C', name: 'Hammer Wound' },   // a hammer-blow wound on the shoulder (Strategy YES @ 31f835a2)
  witch: { variant: 'A', name: 'The Grasp' },   // staff sparks + the crumbling claw, no blood (Strategy YES on #669 @ 72131bee)
  shieldmaiden: { variant: 'A', name: 'Splintered Defiance' },   // splinters off the rim + floor wood; rim chip dropped (Strategy YES 2026-09-27, Lead)
};
// Hard caps per fight (brief rule 4, Lead's numbers): marks on one body, on one shield, on the floor.
export const SIGNATURE_CAPS = { body: 6, shield: 4, floor: 8 } as const;
export const OPPONENT_SIDE: Side = 1;   // the signature is the opponent's: the player's fighter is side 0 in every fight

// What an effect is handed when its trigger fires or each frame after the rigs have posed.
export type SignatureFrame = {
  fighters: readonly [Fighter, Fighter];
  roots: readonly [THREE.Object3D | null, THREE.Object3D | null];   // each fighter's rig root (the anchor the wounds use)
  scale: readonly [number, number];                                 // body scale per side (the opponent's OPPONENTS[id].scale)
  yielding: boolean;   // a finisher (or the plain death) is playing: transient effects stand down, marks stay (brief rule 3)
  bloodMode: 'red' | 'dark' | 'off';   // the player's blood setting: a `blood` effect never fires on off, and draws dark on dark
  marks: SignatureMarks;
};
export type SignatureEffect = {
  opponent: OpponentId;
  variant: SignatureVariant;
  name: string;
  when: (event: CombatEvent, fighters: readonly [Fighter, Fighter]) => boolean;   // pure: which events this effect answers
  fire: (event: CombatEvent, frame: SignatureFrame) => void;
  update?: (dt: number, frame: SignatureFrame) => void;
  clear?: () => void;
  blood?: boolean;   // the effect is blood (a stain, a spray, a drip): it stands down while the player has blood off
};
export type MarkSite = { bone: string; dir: [number, number, number]; radius: number };   // the struck fighter's frame: +x his left, +z his front
// How a mark looks: the effect owns the art, the pool owns the slot and its lifetime.
export type MarkLook = {
  width: number; height: number;          // metres
  map?: THREE.Texture | null; color?: THREE.ColorRepresentation;
  opacity?: number; roughness?: number; metalness?: number;
  tilt?: number;                          // radians about the surface normal
  fadeIn?: number;                        // seconds to full opacity
};

// Trigger helpers for the ten rows of the brief. A landed blow names the attacker `actor` and the struck `target`; a defence names the
// defender `actor` (duel.ts). `on` = the event concerns the opponent the signature belongs to, from the side the row names.
export const isHeavy = (event: CombatEvent) => HEAVY_CLASS.has(event.move ?? '');
export const hitBy = (event: CombatEvent) => event.type === 'Hit' && event.actor === OPPONENT_SIDE && event.move !== 'kick';
export const hitOn = (event: CombatEvent) => event.type === 'Hit' && event.target === OPPONENT_SIDE;
export const heavyHitBy = (event: CombatEvent) => hitBy(event) && isHeavy(event);
export const defendedBy = (event: CombatEvent, type: 'Blocked' | 'Parried' | 'Dodged') => event.type === type && event.actor === OPPONENT_SIDE;

// Which of an opponent's effects the mode selects: off → none, ship → the ruled variant or none, on → the A (or the first built), a letter →
// that variant only.
export function pickSignature(effects: readonly SignatureEffect[] | undefined, mode: SignatureMode, shipped?: SignatureVariant): SignatureEffect | null {
  if (!effects?.length || mode === 'off') return null;
  if (mode === 'ship') return shipped ? effects.find((e) => e.variant === shipped) ?? null : null;
  if (mode === 'on') return effects.find((e) => e.variant === 'A') ?? effects[0];
  return effects.find((e) => e.variant === mode) ?? null;
}
// The pick main.ts hands over (`?signature=`, else the admin select's stored value) read as a mode. Unknown = off; absent = ship.
export function signatureMode(asked: string | null | undefined): SignatureMode {
  if (!asked) return 'ship';
  const mode = (asked.length === 1 ? asked.toUpperCase() : asked.toLowerCase()) as SignatureMode;
  return SIGNATURE_MODES.includes(mode) ? mode : 'off';
}

// Which mode applies, from `?signature=` (wins), else the admin select's value. The preview is a TEST TOOL: it counts only while the test tools
// are open (the admins roster or ?debug, the same gate as the Arena pick). Closed tools = ship, whatever the URL or a stale session says
// (Lead, #655 review: a player typing ?signature=on must not see an effect Dom has not passed).
export function resolveSignature(search: string, selected: string | null, toolsOpen: boolean): SignatureMode {
  if (!toolsOpen) return 'ship';
  return signatureMode(/[?&]signature=(\w+)/.exec(search)?.[1] ?? selected);
}

// The registry: one list per opponent, A first. Effects register from their own modules (one PR each).
export const SIGNATURES: Partial<Record<OpponentId, SignatureEffect[]>> = {};
export function registerSignature(effect: SignatureEffect): void {
  const list = (SIGNATURES[effect.opponent] ??= []);
  if (!list.some((e) => e.variant === effect.variant)) list.push(effect);
}

// Capped mark pools. A body or shield mark rides the object it was pinned to (a bone, the shield) through the animation; a floor mark is
// flat on the sand. Each slot owns its material so marks fade independently; nothing is allocated per hit or per frame.
type Slot = { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>; parent: THREE.Object3D | null; point: THREE.Vector3; normal: THREE.Vector3; age: number; fadeIn: number; opacity: number; used: boolean; order: number; side: Side | null };
export type SignatureMarks = ReturnType<typeof createSignatureMarks>;
export function createSignatureMarks(scene: THREE.Scene) {
  let order = 0;
  const pool = (count: number, side: Side | null): Slot[] => Array.from({ length: count }, () => {
    const onBody = side !== null;
    // A body mark draws over the rig with no depth test and is hidden when its face turns from the eye (gore.ts's rule, for the same
    // reason: a cloak or pauldron must not swallow it); a floor mark depth-tests and sits a hair proud of the sand.
    const material = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: !onBody, polygonOffset: true, polygonOffsetFactor: -2 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.visible = false; mesh.renderOrder = onBody ? 3 : 1; scene.add(mesh);
    return { mesh, parent: null, point: new THREE.Vector3(), normal: new THREE.Vector3(), age: 0, fadeIn: 0.15, opacity: 1, used: false, order: 0, side };
  });
  const bodies = [pool(SIGNATURE_CAPS.body, 0), pool(SIGNATURE_CAPS.body, 1)] as const;
  const shields = [pool(SIGNATURE_CAPS.shield, 0), pool(SIGNATURE_CAPS.shield, 1)] as const;
  const floor = pool(SIGNATURE_CAPS.floor, null);
  const all = [...bodies[0], ...bodies[1], ...shields[0], ...shields[1], ...floor];
  const take = (slots: Slot[]) => slots.find((s) => !s.used) ?? slots.reduce((a, b) => (a.order <= b.order ? a : b));   // the oldest goes first
  const dress = (slot: Slot, look: MarkLook) => {
    const m = slot.mesh.material;
    m.map = look.map ?? null; m.color.set(look.color ?? '#ffffff'); m.roughness = look.roughness ?? 0.8; m.metalness = look.metalness ?? 0; m.needsUpdate = true;
    slot.mesh.scale.set(look.width, look.height, 1); slot.mesh.rotation.set(0, 0, 0);
    slot.opacity = look.opacity ?? 1; slot.fadeIn = look.fadeIn ?? 0.15; slot.age = 0; slot.used = true; slot.order = ++order;
    slot.mesh.userData.tilt = look.tilt ?? 0;
  };
  // Pin a slot to `parent` at a world point and outward normal, stored in the parent's frame.
  const pin = (slot: Slot, parent: THREE.Object3D | null, point: THREE.Vector3, normal: THREE.Vector3) => {
    slot.parent = parent;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      slot.point.copy(parent.worldToLocal(point.clone()));
      slot.normal.copy(normal).applyQuaternion(parent.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
    } else { slot.point.copy(point); slot.normal.copy(normal).normalize(); }
  };
  const scratchPos = new THREE.Vector3(), scratchNormal = new THREE.Vector3(), scratchQuat = new THREE.Quaternion(), scratchEye = new THREE.Vector3();
  const scratchRight = new THREE.Vector3(), scratchUp = new THREE.Vector3(), scratchMatrix = new THREE.Matrix4(), spin = new THREE.Quaternion(), zAxis = new THREE.Vector3(0, 0, 1);
  return {
    // A mark on a struck body at the site the sim named (the same site table and surface ray as the blood wounds, torso slot). Returns
    // false when the rig has no such bone (the mark is then simply not made).
    // `site` overrides the table when an effect knows better where its blow meets the body (the Dwarf's overhead lands on the shoulder's top).
    body(side: Side, root: THREE.Object3D, hit: WoundHit, look: MarkLook, scale = 1, site: MarkSite = woundSite(hit)): boolean {
      const bone = root.getObjectByName(site.bone);
      if (!bone) return false;
      root.updateWorldMatrix(true, true);
      const out = new THREE.Vector3(...site.dir).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), hit.heading);
      // The surface ray can meet whatever else the rig carries first (the Dwarf capture put a stamp on the player's raised sword, 25 cm off
      // his shoulder): a point farther from the bone than the site's own neighbourhood is not the body, so the site's radius is used instead.
      const at = bone.getWorldPosition(new THREE.Vector3()), found = surfaceHit(root, bone, out);
      const met = found && found.point.distanceTo(at) <= Math.max(0.12, site.radius * 2) * scale ? found : null;
      const point = met ? met.point.addScaledVector(met.normal, 0.004) : at.addScaledVector(out, site.radius * scale);
      const slot = take(bodies[side]); dress(slot, look); pin(slot, bone, point, met ? met.normal : out);
      return true;
    },
    // A mark on an object the effect found itself (a shield, a pauldron): a world point and outward normal.
    shield(side: Side, parent: THREE.Object3D, point: THREE.Vector3, normal: THREE.Vector3, look: MarkLook): void {
      const slot = take(shields[side]); dress(slot, look); pin(slot, parent, point, normal);
    },
    // A flat mark on the sand at (x, z), its long axis along `heading`.
    floor(x: number, z: number, heading: number, look: MarkLook): void {
      const slot = take(floor); dress(slot, { ...look, tilt: (look.tilt ?? 0) + heading }); pin(slot, null, scratchPos.set(x, 0.006, z), scratchNormal.set(0, 1, 0));
    },
    // Each frame after the rigs pose: follow parents, fade in, hide a body mark whose face has turned from the eye.
    update(dt: number, eye: THREE.Vector3 | null, hidden: readonly [boolean, boolean] = [false, false]) {
      for (const slot of all) {
        if (!slot.used) { slot.mesh.visible = false; continue; }
        slot.age += dt;
        if (slot.side !== null && hidden[slot.side]) { slot.mesh.visible = false; continue; }
        const position = scratchPos.copy(slot.point), normal = scratchNormal.copy(slot.normal);
        if (slot.parent) { position.applyMatrix4(slot.parent.matrixWorld); normal.applyQuaternion(slot.parent.getWorldQuaternion(scratchQuat)).normalize(); }
        slot.mesh.position.copy(position);
        // Upright on the surface: +Y is world-up projected onto it (a floor mark takes world −Z), then the look's tilt about the normal.
        scratchRight.set(0, 1, 0).cross(normal); if (scratchRight.lengthSq() < 1e-4) scratchRight.set(1, 0, 0); scratchRight.normalize();
        scratchUp.copy(normal).cross(scratchRight).normalize();
        slot.mesh.quaternion.setFromRotationMatrix(scratchMatrix.makeBasis(scratchRight, scratchUp, normal)).multiply(spin.setFromAxisAngle(zAxis, slot.mesh.userData.tilt as number));
        if (slot.parent && eye && scratchEye.copy(eye).sub(position).normalize().dot(normal) < -0.15) { slot.mesh.visible = false; continue; }
        slot.mesh.material.opacity = slot.opacity * Math.min(1, slot.age / Math.max(1e-3, slot.fadeIn));
        slot.mesh.visible = true;
      }
    },
    clear() { for (const slot of all) { slot.used = false; slot.parent = null; slot.mesh.visible = false; } },
    // Where each used mark sits and how far it is from the object it rides (debug probe: a mark that drifted off its body shows here).
    where(): { side: Side | null; at: [number, number, number]; off: number; parent: string | null }[] {
      return all.filter((s) => s.used).map((s) => ({ side: s.side, at: s.mesh.position.toArray().map((v) => +v.toFixed(3)) as [number, number, number], off: s.parent ? +s.mesh.position.distanceTo(s.parent.getWorldPosition(scratchEye)).toFixed(3) : 0, parent: s.parent?.name ?? null }));
    },
    count(kind: 'body' | 'shield' | 'floor', side: Side = OPPONENT_SIDE): number {
      return (kind === 'floor' ? floor : kind === 'body' ? bodies[side] : shields[side]).filter((s) => s.used).length;
    },
  };
}

// The frame hook scene.ts calls: the chosen effect for this opponent answers this frame's events, then lives over time.
export function createSignatures(scene: THREE.Scene, opponent: OpponentId) {
  const marks = createSignatureMarks(scene);
  let mode: SignatureMode = 'off', effect: SignatureEffect | null = null, fired = 0;
  const choose = () => { effect?.clear?.(); effect = pickSignature(SIGNATURES[opponent], mode, SHIPPED[opponent]?.variant); };
  return {
    marks,
    get mode() { return mode; },
    setMode(next: SignatureMode) { if (next !== mode) { mode = next; choose(); } },
    render(dt: number, events: readonly CombatEvent[], frame: Omit<SignatureFrame, 'marks'>, eye: THREE.Vector3 | null, hidden: readonly [boolean, boolean]) {
      if (effect === null && mode !== 'off') choose();   // an effect module that registered after the scene was built
      const full = { ...frame, marks };
      if (effect && !frame.yielding && !(effect.blood && frame.bloodMode === 'off')) for (const event of events) if (effect.when(event, frame.fighters)) { effect.fire(event, full); fired++; }
      effect?.update?.(dt, full);
      marks.update(dt, eye, hidden);
    },
    clear() { marks.clear(); effect?.clear?.(); fired = 0; },
    probe() { return { mode, effect: effect ? `${effect.opponent}:${effect.variant}` : null, fired, body: marks.count('body'), shield: marks.count('shield'), floor: marks.count('floor') }; },
  };
}
