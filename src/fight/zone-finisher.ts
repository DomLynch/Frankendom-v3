// A zone creature's kill finisher, keyed by its catalogue row (Release K6; the engine's pick is Combat's finishOf in world-combat.ts, this plays what it returned). Today that is DECAPITATION on a
// creature whose row has a head to cut (`finisher.cut.head` bone names): the death clip plays, and once it has begun the head is baked off the rig (Actor.sever with the ROW's bones), popped along
// the killing blow with the Pit's own ballistics (severed-head.ts), and the species' blood bursts at the cut (src/fight/wounds-fx.ts). A creature whose row has no cut, or any other finisher id,
// plays the plain death. Presentation only; no creature is named here: a new creature is a catalogue row. The head lies about HEAD_LIFE seconds, then is disposed; the rig grows it back when it respawns.
import * as THREE from 'three';
import { catalogueRow } from './catalogue-rows.ts';
import type { FinisherId } from './finishers.ts';
import { launchSeveredHead, stepSeveredHead, type SeveredHead } from './severed-head.ts';

/** What the finisher needs of a creature's rig (the engine's Actor fits this structurally). */
export type CutRig = { sever(bones?: readonly string[]): { group: THREE.Group; radius: number } | null; unsever(): void; boneWorld(name: string): THREE.Vector3 | null };

const HEAD_LIFE = 12, SEVER_AT = 0.05;   // s a severed head lies; the fall progress at which the head leaves (the Pit's 9 % of its clip, a hair earlier on a 1.4 s fall)

/** The bones a row says can be cut (head, neck), or null when its rig has no named bones to cut at. */
export function cutOf(character: string, body: string): { head: readonly string[]; neck: readonly string[] } | null {
  const row = catalogueRow(character.replace(/^character:/, '')) ?? catalogueRow(body), cut = row?.finisher.cut;
  return cut && cut.head.length ? { head: cut.head, neck: cut.neck } : null;
}

/** Which finishers this client can show on a creature: the plain death always, the decapitation (the row decides whether this creature has a head to cut). */
export const canPlayFinisher = (f: FinisherId): boolean => f === 'plainDeath' || f === 'decapitation';

export function createZoneFinisher(scene: THREE.Scene, opts: { groundAt?: (x: number, z: number) => number; bleed?: (id: string, at: THREE.Vector3, from: { x: number; z: number }) => void } = {}) {
  const heads = new Map<string, { head: SeveredHead; age: number; rig: CutRig }>(), cut = new Set<string>();
  const axis = new THREE.Vector3();
  function drop(id: string, dispose: boolean) {
    const h = heads.get(id); if (!h) return;
    scene.remove(h.head.group); if (dispose) h.head.group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    heads.delete(id);
  }
  return {
    /** One frame of a creature's death: `fall` is the clip's progress (0..1), `finisher` the engine's pick, `at` where it lies and `from` where the killer stands. */
    frame(id: string, spec: { character: string; body: string }, rig: CutRig, fall: number, finisher: FinisherId | undefined, at: { x: number; z: number }, from: { x: number; z: number }): void {
      if (finisher !== 'decapitation' || fall < SEVER_AT || cut.has(id)) return;
      const bones = cutOf(spec.character, spec.body); if (!bones) return;
      cut.add(id);   // once per kill: a creature that cannot be cut is not retried every frame
      const neck = bones.neck.map((b) => rig.boneWorld(b)).find(Boolean) ?? null, built = rig.sever(bones.head);
      if (!built) return;
      scene.add(built.group);
      axis.set(at.x - from.x, 0, at.z - from.z); if (axis.lengthSq() < 1e-6) axis.set(0, 0, 1); axis.normalize();
      heads.set(id, { head: launchSeveredHead(built.group, built.radius, axis, Math.atan2(axis.x, axis.z)), age: 0, rig });
      if (neck) opts.bleed?.(id, neck, from);
    },
    /** The creature is gone from the world (respawn timer started): the rig grows its head back, the loose head stays to lie a while. */
    release(id: string): void {
      cut.delete(id); const h = heads.get(id); h?.rig.unsever();
    },
    update(dt: number): void {
      for (const [id, h] of heads) {
        stepSeveredHead(h.head, dt); h.age += dt;
        const g = h.head.group.position, floor = (opts.groundAt?.(g.x, g.z) ?? 0) + h.head.radius; if (g.y < floor) g.y = floor;
        if (h.age > HEAD_LIFE) drop(id, true);
      }
    },
    heads: () => heads.size,
    dispose(): void { for (const id of [...heads.keys()]) drop(id, true); cut.clear(); },
  };
}
