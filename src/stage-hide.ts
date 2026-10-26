// The gear sheet seam's hide (scene.ts gearStage setArenaVisible; it was the Pit's seam, docs/pit-design.md §3). It hides every direct child of the scene except the ones kept
// (the lights, the player's rig), so the arena, the opponent and every fight effect (blood, sparks, dust, wounds, signatures) go, including
// the ones their own modules add to the scene. It remembers each child's own visibility and the returned restore puts back exactly that.
// Nothing is disposed. A child added while hidden (the Pit's room) is not touched by the restore. Pure: tests/stage-hide.test.ts.
import type { Object3D } from 'three';

export function hideChildren(parent: Object3D, keep: (child: Object3D) => boolean): () => void {
  const was = new Map(parent.children.filter((child) => !keep(child)).map((child) => [child, child.visible] as const));
  for (const child of was.keys()) child.visible = false;
  return () => { for (const [child, visible] of was) child.visible = visible; };
}
