// The painted ranged-weapon model, made ready to hang on the hero (CS23, the combat sandbox's bow; presentation only, no sim file reads it, so no RV). The row (ranged-model-rows.ts) says which node,
// which hand, the hold (Euler XYZ degrees, absolute under the hand bone) and the matte. Pure three.js, so a test can run it on a synthetic scene; the fetch is characters.ts loadRangedPart.
import { Group, MathUtils, Mesh, type Material, type MeshStandardMaterial, type Object3D } from 'three';
import type { RangedModel } from './ranged-model-rows.ts';

/** The row's node of a loaded scene, cloned and set up as an equip part: it names its hand, carries the row's hold, and has the matte the painted material needs (TRELLIS exports metalness 1 / roughness 1,
 *  which draws black with no environment map; the colour map carries the look). `userData.rangedModel` tells characters.ts reshape to leave the node alone (a rank's painted shape must not hide it). */
export function rangedPartOf(scene: Object3D, model: RangedModel): Object3D {
  const found = scene.getObjectByName(model.node);
  if (!found) throw new Error(`The ${model.id} model file has no node ${model.node}`);
  const part = found.clone(true);
  part.name = 'WeaponDrawn';
  part.userData = { ...part.userData, hand: model.hand, rangedModel: model.id };
  part.rotation.set(...(model.holdDeg.map((d) => MathUtils.degToRad(d)) as [number, number, number]));
  part.position.set(0, 0, 0);
  part.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const mats = (Array.isArray(o.material) ? o.material : [o.material]).map((m: Material) => {
      const c = m.clone() as MeshStandardMaterial; c.metalness = model.metalness; c.roughness = model.roughness; return c;   // a copy: the loaded file stays whole
    });
    o.material = Array.isArray(o.material) ? mats : mats[0]!;
  });
  return part;
}

/** The same model lying on the ground (the Pit's ground-item view): the matte part with no hand hold, in a group so the view's own pose row (yaw / roll / tilt) is the only rotation on it. */
export function rangedGroundPartOf(scene: Object3D, model: RangedModel): Object3D {
  const part = rangedPartOf(scene, model);
  part.rotation.set(0, 0, 0);
  return new Group().add(part);
}
