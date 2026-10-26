// Fit the hero-rig loot pieces to a re-proportioned body (promoted from the Test Zone's origins/preview/piece-fit.ts, zone/goblin-field-dome @ebd020da9; Dom 2026-10-18: "measure the size difference and multiply it").
// A loot piece is authored on the HERO's bind pose; `wear` (characters.ts, #606) already hangs it on the body's own bones using the piece's own inverse binds, so every piece follows the body's joints, but its offset from each
// joint stays hero-sized: on a bigger-limbed body the piece sinks into the limb and shows as shards. This measures, per bone, how much longer the body's segment is than the hero's (the distance from the bone to its parent
// in the bind pose, hero vs body) and scales the piece's offset from that bone by the ratio: the inverse bind becomes `scale(ratio) * inverseBind`, so a vertex weighted to the bone is placed `ratio` times as far from the joint.
// Per bone, not one number: the shoulders can widen more than the shins. No resolution is lost (geometry moves, textures stay), and no art is made. Presentation only: pure maths on skeleton data, nothing reads the sim, a record or the
// digest. The ratio limits are rows (fx-rows.json fit.*); the hero's 65 bone names are a row (piece-fit-rig.json).
// Scope: a biped rig carrying all 65 hero bone names (the troll, the goblin). Anything else is refused loudly (NotHeroRig), never fitted on a guess and never passed through unfitted.
import * as THREE from 'three';
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import RIG_MANIFEST from './piece-fit-rig.manifest.json' with { type: 'json' };
import RIG_ROWS from './piece-fit-rig.json' with { type: 'json' };
import { fxNum } from './fx-rows.ts';

loadRegistry([tableFromFile(RIG_MANIFEST.tables[0] as unknown as Manifest, RIG_ROWS, 'piece-fit-rig.json')]);
/** The hero rig's bone names: the skeleton every loot piece is authored on, and the one a body must carry whole to be fitted. */
export const HERO_BONES: readonly string[] = RIG_ROWS.heroRig[0]!.bones;

/** A rig or a piece that is not on the hero's 65-bone biped skeleton was handed to the fit. `missing` names up to a few of the absent bones. */
export class NotHeroRig extends Error {
  readonly what: 'rig' | 'piece';
  readonly missing: readonly string[];
  constructor(what: 'rig' | 'piece', missing: readonly string[]) {
    super(`piece fit: the ${what} does not carry the hero's ${HERO_BONES.length} bones (missing ${missing.join(', ')}); the fit is for biped hero-rig bodies only`);
    this.name = 'NotHeroRig'; this.what = what; this.missing = missing;
  }
}

const worldAt = (skeleton: THREE.Skeleton, i: number): THREE.Vector3 => new THREE.Vector3().setFromMatrixPosition(skeleton.boneInverses[i]!.clone().invert());
const parentOf = (skeleton: THREE.Skeleton, i: number): number => { const parent = skeleton.bones[i]!.parent; return parent ? skeleton.bones.findIndex((b) => b.name === parent.name) : -1; };

/** Throws NotHeroRig unless the skeleton carries every hero bone. */
export function assertHeroRig(skeleton: THREE.Skeleton, what: 'rig' | 'piece' = 'rig'): void {
  const have = new Set(skeleton.bones.map((b) => b.name)), missing = HERO_BONES.filter((n) => !have.has(n));
  if (missing.length) throw new NotHeroRig(what, missing);
}

/** Per piece-bone name: body segment length / hero segment length, from the bind poses. A bone with no usable segment (the root, a zero-length joint) takes its parent's ratio, else 1; every ratio stays inside the rows' limits. */
export function boneRatios(source: THREE.Skeleton, rig: THREE.Skeleton): Map<string, number> {
  const minLen = fxNum('fit.min-len-m'), lo = fxNum('fit.ratio-min'), hi = fxNum('fit.ratio-max'), byName = new Map(rig.bones.map((b, i) => [b.name, i] as const)), out = new Map<string, number>();
  const ratioOf = (i: number): number => {
    const name = source.bones[i]!.name; const known = out.get(name); if (known !== undefined) return known;
    const p = parentOf(source, i), rigAt = byName.get(name), rigParent = p >= 0 ? byName.get(source.bones[p]!.name) : undefined;
    let ratio = 1;
    if (p >= 0 && rigAt !== undefined && rigParent !== undefined) {
      const heroLen = worldAt(source, i).distanceTo(worldAt(source, p)), bodyLen = worldAt(rig, rigAt).distanceTo(worldAt(rig, rigParent));
      ratio = heroLen >= minLen && bodyLen >= minLen ? bodyLen / heroLen : ratioOf(p);
    }
    ratio = Math.min(hi, Math.max(lo, ratio)); out.set(name, ratio); return ratio;
  };
  for (let i = 0; i < source.bones.length; i++) ratioOf(i);
  return out;
}

/** The pieces re-fitted to the rig: each a clone sharing the geometry and material, on a copy of its skeleton whose inverse binds carry the per-bone ratio. One new skeleton per source skeleton. Throws NotHeroRig for a rig or a piece off the hero skeleton. */
export function fitPieces(pieces: readonly THREE.SkinnedMesh[], rig: THREE.Skeleton): THREE.SkinnedMesh[] {
  assertHeroRig(rig, 'rig');
  const fitted = new Map<THREE.Skeleton, THREE.Skeleton>(), at = new Map(rig.bones.map((b, k) => [b.name, k] as const));
  return pieces.map((piece) => {
    if (!piece.skeleton) throw new NotHeroRig('piece', HERO_BONES);   // an unskinned piece has no bones to fit
    const names = new Set(HERO_BONES), strays = piece.skeleton.bones.map((b) => b.name).filter((n) => !names.has(n));
    if (strays.length) throw new NotHeroRig('piece', strays);
    let skeleton = fitted.get(piece.skeleton);
    if (!skeleton) {
      const ratios = boneRatios(piece.skeleton, rig);
      skeleton = new THREE.Skeleton(piece.skeleton.bones, piece.skeleton.boneInverses.map((_inverse, i) => {
        const name = piece.skeleton.bones[i]!.name, k = at.get(name)!, r = ratios.get(name)!;
        // At the body's bind pose a vertex lands where the hero's piece sits relative to its joint, scaled by the ratio about that joint, around the BODY's joint: bodyPos + r * (p - heroPos), in world axes, so the body's different
        // posture (a hunch, arms forward) does not turn the piece about the joint. After that it follows the body's bones from the bind pose. invBind' = bodyInverse * T(bodyPos) * S(r) * T(-heroPos).
        const heroPos = worldAt(piece.skeleton, i), bodyPos = worldAt(rig, k);
        return rig.boneInverses[k]!.clone().multiply(new THREE.Matrix4().makeTranslation(bodyPos.x, bodyPos.y, bodyPos.z)).multiply(new THREE.Matrix4().makeScale(r, r, r)).multiply(new THREE.Matrix4().makeTranslation(-heroPos.x, -heroPos.y, -heroPos.z));
      }));
      fitted.set(piece.skeleton, skeleton);
    }
    const copy = piece.clone(); copy.skeleton = skeleton; return copy;
  });
}
