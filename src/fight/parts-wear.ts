// Frankendom parts, stage 2 wear (Dom 2026-10-30: "you become what you kill"): the scene work. An equipped part replaces the matching piece of the hero's cut body (src/assets/psyche-106.glb) with the donor
// boss's own piece, bound to the HERO's bones (src/fight/parts-fit.ts bindPiece), with the seam collars OpenTrident measured (psyche-seam-fix, boss-fixes). Look only: nothing here reads or writes a stat.
//   hero piece      hidden (the manifest names it: regions[].detached_by == the unit)
//   hero stump cap  shown (caps[].shown_when_cut == the unit, on the hero's remaining side) unless the donor's own cut ring is as wide as the hole
//   donor piece     piece_<unit>(_*) of the donor's cut GLB, skinned onto the hero's bones; the donor's own caps are never worn
//   collar          a short tube on the joint in the donor's skin texel, only when the donor ring is narrower than the hero's hole (collarFor); the hero's five permanent collars cover its own open seams
// The donor GLB is fetched only when something is worn (the scene starts this after the first frame): a player with nothing equipped never downloads one. Rings and collars are measured in the BIND pose on the
// hero asset's un-animated scene and the finished meshes are then re-pointed at the live (animated) hero's bones by name.
import { Skeleton, Vector3 } from 'three';
import type { SkinnedMesh } from 'three';
import type { Bone, Material, Mesh, Object3D, Texture } from 'three';
import HERO_MANIFEST from '../assets/psyche-106.cut.manifest.json' with { type: 'json' };
import { PARTS } from '../parts.ts';
import { FIT_ROWS, fitBodyOf, heroFitBody, type CollarRow, type FitRowsFile } from '../parts-fit-rows.ts';
import { isPieceOf, wearDiff, type WornPart } from '../parts-wear.ts';
import { bindPiece, buildCollar, collarFor, liftRow, seamRing, skinUvNear, type BoneNodes, type SeamRing } from './parts-fit.ts';
import { loadFighter } from './characters.ts';

type HeroManifest = { regions: { id: string; mesh: string; detached_by: string | null }[]; caps: { id: string; mesh: string; region: string; shown_when_cut: string }[] };
const MANIFEST = HERO_MANIFEST as unknown as HeroManifest;

/** The donor GLBs: `<data/rig.json files stem>` (V3's own cut file) and `<stem>.derived` (OpenTrident's derived copy, data/parts-fit-rows.json source derived). Literal `new URL`s so the build ships and hashes them. */
export const DONOR_URLS: Record<string, string> = {
  'minotaur-106': new URL('../assets/minotaur-106.glb', import.meta.url).href,
  'gargantua-106': new URL('../assets/gargantua-106.glb', import.meta.url).href,
  'arachne-106': new URL('../assets/arachne-106.glb', import.meta.url).href,
  'sporty-granny-106': new URL('../assets/sporty-granny-106.glb', import.meta.url).href,
  'parasite-106': new URL('../assets/parasite-106.glb', import.meta.url).href,
  'anime-girl-blonde-106': new URL('../assets/anime-girl-blonde-106.glb', import.meta.url).href,
  'anime-boy-black-106': new URL('../assets/anime-boy-black-106.glb', import.meta.url).href,
  'castle-guard-106.derived': new URL('../assets/castle-guard-106.derived.glb', import.meta.url).href,
  'big-vegas-106.derived': new URL('../assets/big-vegas-106.derived.glb', import.meta.url).href,
};
export const donorKey = (part: Pick<WornPart, 'stem' | 'source'>, rules = PARTS.wear): string => `${part.stem}-106${rules.mesh.source[part.source]}`;

type Donor = { key: string; scene: Object3D; uses: number };
type Fitted = { part: WornPart; donor: Donor; meshes: SkinnedMesh[]; collar: SkinnedMesh | null; heroCap: boolean };
export type WearDeps = {
  /** The live hero: the group holding the animated clone of the hero's cut body. */
  anchor: Object3D;
  /** The hero asset's own scene (never animated: its bones are the bind pose the rings and collars are measured in). */
  bind: Object3D;
  /** A donor boss body (default: the page's fighter loader on DONOR_URLS). */
  load?(key: string): Promise<Object3D>;
  report?(error: unknown): void;
  /** The per-body fit rows (default data/parts-fit-rows.json; the tests pass others). */
  rows?: FitRowsFile;
};
export type Wearer = {
  /** Makes the hero wear exactly `next` (parts already worn stay; the rest come off / go on). Calls queue; resolves when this loadout is on. A failed part is reported and left off. */
  apply(next: readonly WornPart[]): Promise<void>;
  worn(): WornPart[];
  /** Skinned draws of the hero as drawn now (visible SkinnedMesh), and the wear's own share of them. */
  draws(): { hero: number; wear: number };
  dispose(): void;
};

const byName = (root: Object3D): BoneNodes => { const m: BoneNodes = new Map(); root.traverse((o) => { if (o.name && !m.has(o.name)) m.set(o.name, o); }); return m; };
const world = (o: Object3D): Vector3 => new Vector3().setFromMatrixPosition(o.matrixWorld);
const skinnedIn = (root: Object3D | undefined | null): SkinnedMesh[] => { const out: SkinnedMesh[] = []; root?.traverse((o) => { if ((o as SkinnedMesh).isSkinnedMesh) out.push(o as SkinnedMesh); }); return out; };
const textured = (ms: SkinnedMesh[]): SkinnedMesh[] => ms.filter((m) => !Array.isArray(m.material) && (m.material as { map?: Texture | null }).map);
/** The joint a collar row sits at in `nodes`' pose, and the direction the cut runs along (bone to its longest child): the row's `at` fraction of that. */
function jointOf(nodes: BoneNodes, row: CollarRow): { joint: Vector3; axis: Vector3; at: Vector3 } | null {
  const b = nodes.get(row.bone);
  if (!b) return null;
  let kid: Object3D | null = null;
  for (const c of b.children) if ((c as Bone).isBone && (!kid || c.position.length() > kid.position.length())) kid = c;
  const at = world(b), axis = kid ? world(kid).sub(at) : new Vector3(0, 1, 0);
  return { joint: at.clone().addScaledVector(axis, row.at), axis, at };
}
/** A mesh built against bind-pose bones, re-pointed at the same-named bones of the live hero. */
function retarget<T extends SkinnedMesh>(mesh: T, live: BoneNodes): T {
  const bones = mesh.skeleton.bones.map((b) => (live.get(b.name) ?? b) as Bone);
  mesh.bind(new Skeleton(bones, mesh.skeleton.boneInverses), mesh.bindMatrix);
  return mesh;
}
function disposeTree(root: Object3D): void {
  const seen = new Set<unknown>();
  root.traverse((o) => {
    const m = o as Mesh;
    m.geometry?.dispose();
    for (const mat of Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) {
      if (seen.has(mat)) continue;
      seen.add(mat);
      for (const v of Object.values(mat)) if (v && (v as Texture).isTexture) (v as Texture).dispose();
      mat.dispose();
    }
  });
}

export function createWearer(deps: WearDeps): Wearer {
  const rules = PARTS.wear, fitRows = deps.rows ?? FIT_ROWS, hero = heroFitBody(fitRows), report = deps.report ?? ((e: unknown) => console.warn('parts-wear:', e));
  const bind = byName(deps.bind), live = byName(deps.anchor);
  deps.bind.updateMatrixWorld(true);
  const liveRoot = (live.get('piece_root')?.parent ?? deps.anchor) as Object3D;
  const donors = new Map<string, Donor>(), pending = new Map<string, Promise<Object3D>>(), fitted = new Map<string, Fitted>();
  let heroCollars: SkinnedMesh[] = [], queue: Promise<void> = Promise.resolve(), liftY = 0, disposed = false;
  const load = deps.load ?? (async (key: string) => { const url = DONOR_URLS[key]; if (!url) throw new Error(`no donor file for ${key}`); return (await loadFighter(url)).scene; });
  const regionsOf = (unit: string) => MANIFEST.regions.filter((r) => r.detached_by === unit);
  const piecesOf = (unit: string): Object3D[] => regionsOf(unit).flatMap((r) => { const n = live.get(r.mesh); return n ? [n] : []; });
  const capsOf = (unit: string): Object3D[] => { const own = new Set(regionsOf(unit).map((r) => r.id)); return MANIFEST.caps.filter((c) => c.shown_when_cut === unit && !own.has(c.region)).flatMap((c) => { const n = live.get(c.mesh); return n ? [n] : []; }); };

  /** Hero side: a unit's piece hidden / shown, its remaining-side stump cap shown only for a worn part the donor ring does not cover. */
  function showHero(): void {
    const units = new Set(MANIFEST.regions.flatMap((r) => (r.detached_by ? [r.detached_by] : [])));
    for (const unit of units) {
      const on = [...fitted.values()].find((f) => f.part.unit === unit);
      for (const n of piecesOf(unit)) n.visible = !on;
      for (const c of capsOf(unit)) c.visible = !!on?.heroCap;
    }
  }
  function ensureHeroCollars(): void {
    const want = fitted.size > 0;
    if (!want) { for (const c of heroCollars) { c.removeFromParent(); c.geometry.dispose(); (c.material as Material).dispose(); } heroCollars = []; return; }
    if (heroCollars.length || !hero) return;
    for (const row of hero.collars.filter((c) => rules.heroCollars.includes(c.id))) {
      const host = textured(skinnedIn(deps.bind.getObjectByName(rules.heroHost[row.id] ?? '')))[0];
      const at = jointOf(bind, row);
      if (!host || !at) continue;
      const c = buildCollar(row, bind, host.material as Material, skinUvNear(host, at.at));
      if (!c) continue;
      c.name = `herocollar_${row.id}`; c.userData.worn = true; liveRoot.add(retarget(c, live)); heroCollars.push(c);
    }
  }
  function applyLift(): void {
    const next = [...fitted.values()].reduce((best, f) => { const y = f.part.lift ? liftRow(f.part.lift, fitBodyOf(f.part.profile, fitRows)?.measure, hero?.measure).lift_y : 0; return Math.abs(y) > Math.abs(best) ? y : best; }, 0);   // the leg that is off the most decides (a negative lift lowers the root: the feet float)
    if (next !== liftY) { liveRoot.position.y += next - liftY; liftY = next; }
  }

  function fit(part: WornPart, donor: Donor): Fitted {
    donor.scene.updateMatrixWorld(true);
    const dn = byName(donor.scene), meshes = new Set<SkinnedMesh>();
    donor.scene.traverse((o) => { if (isPieceOf(o.name, part.piece)) for (const m of skinnedIn(o)) meshes.add(m); });
    if (!meshes.size) throw new Error(`${donor.key}: no piece for unit ${part.unit}`);
    const bound = [...meshes].map((m) => { const b = retarget(bindPiece(m, m.geometry, bind), live); b.name = `wear_${part.id}`; b.receiveShadow = true; b.userData.worn = true; liveRoot.add(b); return b; });
    const dm = textured([...meshes])[0], row = fitBodyOf(part.profile, fitRows)?.collars.find((c) => c.id === part.collar);
    let collar: SkinnedMesh | null = null, covered = false;
    if (dm && row) {
      const d = jointOf(dn, row), h = jointOf(bind, row);
      let ring: SeamRing | null = null, hring: SeamRing | null = null;
      if (d) for (const m of textured([...meshes])) { ring = seamRing(m, d.joint, d.axis); if (ring) break; }
      const heroHole = h ? textured(skinnedIn(deps.bind.getObjectByName(regionsOf(part.unit)[0]?.mesh ?? ''))) : [];
      if (h) for (const m of heroHole) { hring = seamRing(m, h.joint, h.axis); if (hring) break; }
      const made = collarFor(row, ring, hring);
      covered = made === null && !!ring && !!hring;
      if (made && d) {
        const c = buildCollar(made.row, bind, dm.material as Material, made.uv ?? skinUvNear(dm, d.at));
        if (c) { c.name = `wearcollar_${part.id}`; c.userData.worn = true; liveRoot.add(retarget(c, live)); collar = c; }
      }
    }
    return { part, donor, meshes: bound, collar, heroCap: !covered };
  }
  function takeOff(f: Fitted): void {
    for (const m of f.meshes) m.removeFromParent();   // the geometry and material are the donor's: freed with it
    if (f.collar) { f.collar.removeFromParent(); f.collar.geometry.dispose(); (f.collar.material as Material).dispose(); }
    fitted.delete(f.part.slot);
    if (--f.donor.uses <= 0) { donors.delete(f.donor.key); disposeTree(f.donor.scene); }
  }
  async function donorFor(part: WornPart): Promise<Donor> {
    const key = donorKey(part);
    let d = donors.get(key);
    if (!d) {
      let p = pending.get(key);
      if (!p) { p = load(key); pending.set(key, p); }
      try { const scene = await p; d = donors.get(key) ?? { key, scene, uses: 0 }; donors.set(key, d); } finally { pending.delete(key); }
    }
    d.uses++;
    return d;
  }

  async function run(next: readonly WornPart[]): Promise<void> {
    if (disposed) return;
    const { remove, add } = wearDiff([...fitted.values()].map((f) => f.part), next);
    for (const p of remove) { const f = fitted.get(p.slot); if (f) takeOff(f); }
    for (const p of add) {
      try {
        const old = fitted.get(p.slot);
        if (old) takeOff(old);
        const donor = await donorFor(p);
        if (disposed) { donor.uses--; return; }
        try { fitted.set(p.slot, fit(p, donor)); } catch (error) { if (--donor.uses <= 0) { donors.delete(donor.key); disposeTree(donor.scene); } throw error; }
      } catch (error) { report(error); }
    }
    showHero(); ensureHeroCollars(); applyLift();
  }

  return {
    apply(next) { queue = queue.then(() => run(next)).catch(report); return queue; },
    worn: () => [...fitted.values()].map((f) => f.part),
    draws() {
      let hero = 0, wear = 0;
      deps.anchor.traverse((o) => { if ((o as SkinnedMesh).isSkinnedMesh) { let v = true; for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) { v = false; break; } if (v) { hero++; if (o.userData.worn) wear++; } } });
      return { hero, wear };
    },
    dispose() { disposed = true; for (const f of [...fitted.values()]) takeOff(f); fitted.clear(); showHero(); ensureHeroCollars(); applyLift(); },
  };
}
