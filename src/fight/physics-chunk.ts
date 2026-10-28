// The physics chunk (@frankendom/physics, Jolt WASM embedded): the one door src/fight/ragdoll.ts imports it through, dynamically, after the
// first frame. scripts/build.mjs builds this file into its own content-hashed module (b/vendor/physics.<hash>.js), never into main.js.
export { createPhysics } from '@frankendom/physics';
export { createThreeRig } from '@frankendom/physics/three-rig';
export { createEvaluator, createFighterState, loadRules } from '@frankendom/physics';   // the M4 rules evaluator (src/fight/rules-eval.ts, ?rules=m4); the package's rows are bundled with it
export { createCutRig } from '@frankendom/physics/three-cuts';   // the cut-piece meshes' rig (physics docs/CUT-CONTRACT.md): the body GLB is the physics cut GLB, its caps show with the ragdoll's cuts
import minotaurManifest from '../assets/minotaur-106.cut.manifest.json' with { type: 'json' };
import gargantuaManifest from '../assets/gargantua-106.cut.manifest.json' with { type: 'json' };   // the boss bodies' manifests (physics cut-batch rows gargantua-106 and arachne-106): not wired to a spawn yet
import arachneManifest from '../assets/arachne-106.cut.manifest.json' with { type: 'json' };
export const minotaurCutManifest = minotaurManifest;
/** body stem (data/rig.json files) -> the manifest beside that body's physics cut GLB. A held body (held-body.ts) with no entry has no cut data and dies the plain way; a new body adds its manifest import and one line here with its cut GLB. */
export const cutManifests: Record<string, unknown> = { minotaur: minotaurManifest, gargantua: gargantuaManifest, arachne: arachneManifest };
   // the manifest beside the Minotaur's cut GLB (src/assets/minotaur-106.glb is that file)
