// What a boss weapon row draws (data/boss-weapons.json, boss-weapon.ts): the grafted part scaled about its grip, and the off-hand part. Presentation only; the sim never sees it.
// Called on the EQUIPPED copy of a body (characters.ts equipWeapon clones the rig, so the shared file is never touched). The disc shield is built in code (no file, no weight): a flat round board sized in
// metres in world space, so the row's numbers mean the same on any body; it is a stand-in (the row's `placeholder` says so) until the painted shield files land.
import { CylinderGeometry, Euler, Group, Mesh, MeshStandardMaterial, Vector3, type Object3D } from 'three';
import { bone as boneOf, HELD } from './rig-bones.ts';
import type { BossWeaponRow, OffhandRow } from './boss-weapon.ts';

export const SHIELD_NAME = 'BossShield';
/** The board of an `offhand` row, in metres, axis along its local Y: a thin cylinder (face = a cap) with a darker rim ring. Pure geometry and materials, no bone. */
export function discShield(o: OffhandRow): Group {
  const g = new Group(); g.name = SHIELD_NAME;
  const face = new Mesh(new CylinderGeometry(o.radius, o.radius, o.thickness, 40), new MeshStandardMaterial({ color: o.colour, roughness: 0.7, metalness: 0.2 }));
  const rim = new Mesh(new CylinderGeometry(o.radius * 1.04, o.radius * 1.04, o.thickness * 0.8, 40, 1, true), new MeshStandardMaterial({ color: o.rim, roughness: 0.5, metalness: 0.6 }));
  face.name = 'BossShield.face'; rim.name = 'BossShield.rim'; g.add(face, rim);
  return g;
}
/** The equipped body with the row's weapon dressing: the grafted part scaled `scale` about its grip, the off-hand part seated on its bone. Returns the same asset. */
export function dressBossHand<A extends { scene: Object3D }>(asset: A, row: BossWeaponRow): A {
  const scene = asset.scene;
  const weapon = boneOf(scene, HELD.weapon);
  if (weapon && row.scale !== 1) weapon.scale.multiplyScalar(row.scale);   // the part sits at the hand's grip frame, so the scale grows it out from the hand
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
