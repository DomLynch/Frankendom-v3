// The physics chunk (@frankendom/physics, Jolt WASM embedded): the one door src/fight/ragdoll.ts imports it through, dynamically, after the
// first frame. scripts/build.mjs builds this file into its own content-hashed module (b/vendor/physics.<hash>.js), never into main.js.
export { createPhysics } from '@frankendom/physics';
export { createThreeRig } from '@frankendom/physics/three-rig';
export { createEvaluator, createFighterState, loadRules } from '@frankendom/physics';   // the M4 rules evaluator (src/fight/rules-eval.ts, ?rules=m4); the package's rows are bundled with it
