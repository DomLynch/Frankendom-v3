// How a star boss is DRAWN (data/stars.json levels: scaleX, tell). Render only: the body group is scaled about the boss's feet and its meshes wear a gold emissive glow; the sim's capsule, reach and the
// ragdoll's bones are untouched (the ragdoll reads world transforms, as it does for the beasts' anchor scale). The glow reuses the rig's own materials: a glowing clone per original material (cached, so a
// rig and its frozen copies share one), swapped in on the mesh, and swapped back for a 0-star. Idempotent: the page calls it every frame with the star it wants.
import { Color, Mesh, type Group, type Material, type MeshStandardMaterial } from 'three';
import STARS from '../../data/stars.json' with { type: 'json' };
import { levelOf, type StarsFile } from '../stars.ts';

const ROWS = STARS as unknown as StarsFile;
const ORIGINAL = new WeakMap<Material, Material>();            // a glowing clone -> the material it was made from
const GLOWING = new WeakMap<Material, Map<number, Material>>(); // an original -> its glowing clone per star

const APPLIED = new WeakMap<Group, number>();                  // the star each body group last wore

function glowing(base: Material, star: number): Material {
  const tell = levelOf(ROWS, star).tell;
  if (!tell || !('emissive' in base)) return base;
  let per = GLOWING.get(base); if (!per) { per = new Map(); GLOWING.set(base, per); }
  let m = per.get(star);
  if (!m) { const c = base.clone() as MeshStandardMaterial; c.emissive = new Color(tell.colour); c.emissiveIntensity = tell.intensity; per.set(star, c); ORIGINAL.set(c, base); m = c; }
  return m;
}

/** `group` drawn at star level `star`: its scale and its glow (star 0: scale 1, the rig's own materials). */
export function applyStar(group: Group, star: number): void {
  if (APPLIED.get(group) === star) return;   // already wearing it: no per-frame walk
  APPLIED.set(group, star);
  const k = levelOf(ROWS, star).scaleX;
  if (group.scale.x !== k) group.scale.setScalar(k);
  group.traverse((o) => {
    if (!(o instanceof Mesh) || !o.material) return;
    const swap = (m: Material): Material => glowing(ORIGINAL.get(m) ?? m, star);
    const next = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    if (Array.isArray(next) ? next.some((m, i) => m !== (o.material as Material[])[i]) : next !== o.material) o.material = next;
  });
}
