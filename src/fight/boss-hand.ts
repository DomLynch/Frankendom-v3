// What a boss weapon row draws (data/boss-weapons.json, boss-weapon.ts): the grafted part scaled about its grip, and the off-hand part. Presentation only; the sim never sees it.
// Called on the EQUIPPED copy of a body (characters.ts equipWeapon clones the rig, so the shared file is never touched). The disc shield is built in code (no file, no weight): a flat round board sized in
// metres in world space, so the row's numbers mean the same on any body; it is a stand-in (the row's `placeholder` says so) until the painted shield files land.
import { CylinderGeometry, Euler, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3, type Object3D } from 'three';
import { bone as boneOf, HELD } from './rig-bones.ts';
import type { BossWeaponRow, MaterialRow, OffhandRow } from './boss-weapon.ts';

export const SHIELD_NAME = 'BossShield';
/** The board of an `offhand` row, in metres, axis along its local Y: a thin cylinder (face = a cap) with a darker rim ring. Pure geometry and materials, no bone. */
export function discShield(o: OffhandRow): Group {
  const g = new Group(); g.name = SHIELD_NAME;
  const face = new Mesh(new CylinderGeometry(o.radius, o.radius, o.thickness, 40), new MeshStandardMaterial({ color: o.colour, roughness: 0.7, metalness: 0.2 }));
  const rim = new Mesh(new CylinderGeometry(o.radius * 1.04, o.radius * 1.04, o.thickness * 0.8, 40, 1, true), new MeshStandardMaterial({ color: o.rim, roughness: 0.5, metalness: 0.6 }));
  face.name = 'BossShield.face'; rim.name = 'BossShield.rim'; g.add(face, rim);
  return g;
}
/** The grafted part itself (the drawn weapon node equipWeapon cloned into the hand), not the socket bone: on a 106 body HELD.weapon resolves to OpenTrident's fk_socket_hand_r, whose own child is only the sim's contact segment (WeaponShape),
 *  so scaling `bone(HELD.weapon)` scaled that and left the drawn blade as it was (Gargantua's "maul" never grew). The part hangs under the Grip106 seat; on a 65 body it is the hand's own WeaponDrawn. */
export const graftOf = (scene: Object3D): Object3D | undefined => scene.getObjectByName('Grip106')?.getObjectByName(HELD.weapon) ?? boneOf(scene, HELD.weapon);
const CONTACT = 'WeaponShape';   // the sim's contact segment: never restyled
function restyle(part: Object3D, m: MaterialRow): void {
  part.traverse((o) => { if (o instanceof Mesh && o.name !== CONTACT) { const mat = new MeshStandardMaterial({ color: m.colour, metalness: m.metalness, roughness: m.roughness }); o.material = mat; } });
}
/** The equipped body with the row's weapon dressing: the grafted part scaled `scale` about its grip, the off-hand part seated on its bone. Returns the same asset. */
export function dressBossHand<A extends { scene: Object3D }>(asset: A, row: BossWeaponRow): A {
  const scene = asset.scene;
  const part = graftOf(scene);
  if (part) {
    if (row.scale !== 1) part.scale.multiplyScalar(row.scale);   // the part sits at the hand's grip frame, so the scale grows it out from the hand
    const [gx, gy, gz] = row.grip.offset; part.position.add(new Vector3(gx, gy, gz));
    const [rx, ry, rz] = row.grip.rotationDeg; if (rx || ry || rz) part.quaternion.multiply(new Quaternion().setFromEuler(new Euler((rx * Math.PI) / 180, (ry * Math.PI) / 180, (rz * Math.PI) / 180)));
    if (row.material) restyle(part, row.material);
  }
  const o = row.offhand;
  if (o) {
    const hand = boneOf(scene, o.hand);
    if (!hand) throw new Error(`boss weapon ${row.id}: the body has no ${o.hand} to hold the ${o.kind}`);
    scene.updateMatrixWorld(true);
    const k = 1 / hand.getWorldScale(new Vector3()).x, shield = discShield(o);   // the board is built in metres; the bone's own scale (a Mixamo rig is centimetres) is undone so it keeps its metres
    shield.scale.setScalar(k); shield.position.set(o.offset[0] * k, o.offset[1] * k, o.offset[2] * k);
    shield.rotation.copy(new Euler(...o.rotationDeg.map((d) => (d * Math.PI) / 180) as [number, number, number]));
    hand.add(shield);
  }
  return asset;
}
