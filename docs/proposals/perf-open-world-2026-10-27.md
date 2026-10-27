# Open-world performance pass (Physics Dev, 2026-10-27)

Scenario: the zone, 106 rig, corpses left behind, every M7 module on (`?feel=clash,kick,hitreact,limbs&rules=m4`), fight going on, 375 wide.
Script: `scripts/perf-open-world.mjs` (job runner `scripts/perf-open-world-job.sh`, run with `hfjob -- bash scripts/perf-open-world-job.sh <corpses>`).
Rows: `data/perf.json` (validated by `src/sim/validate.js` `perf`, pinned by `test/perf-rows.test.mjs`).

## What is measured, and what it cannot say
- Every rAF callback is timed with the render inside it, N frames per run, best of three by p95 (the M8 row's rule).
- The HF CPU box has no GPU: Chromium renders with SwiftShader, so the render inside the callback is software GL (about 3 fps, p95 of 400-700 ms). Those numbers are an upper bound for relative comparison, NOT a phone's frame time.
- The JS-side numbers are the ones the budget rests on: `__ragdoll.byMode` (alive / dead / corpses, ms per frame in the physics step + pose) and the modules' own counters (`__feelClash`, `__feelLimbs`). Kick and hitreact keep no counter of their own: their cost is the row minus the default row.
- Only the live Minotaur has a ragdoll; the other standing bosses are frozen copies. "Three Minotaurs" costs one live body plus two copies (the copies are in the render number, not the JS number).

## Results
See the PR body (receipt table, job ids) and `perf-out/perf-c<N>.json` in each job's log.

## What degrades first on a slow phone (order in `data/perf.json` `ladder`)
1. **Cut pieces** (`cutPieces`): each cut adds piece meshes (cap geometry, a rigid body flying) and a one-off carve frame (the first cut of a session was ~12 ms over the others, ragdoll.ts). Lowest value to the player once the cut has been seen: hide the oldest corpse's pieces first (what `pieceSeconds` does now).
2. **Reaction blend** (`reactionBlend`): `?feel=hitreact`'s pose blend (src/fight/feel-hitreact.ts) runs every frame of a reaction; turning the blend off keeps the impulse and the sim, only the pose mix goes.
3. **Corpses** (`corpses`): `data/physics.json corpse.max` already caps them (4). Lower it per tier; the oldest goes first (ragdoll.ts already drops the oldest at the cap).
4. **Rest of the M7 presentation** (`feel`): clash sparks, limb gait.

## Proposal to wire (not wired here)
A small `src/fight/perf-governor.ts` next to `governor.ts` (same window shape: `windowFrames` samples, `overWindows` windows in a row over `frameMsP95`, one way only, so it never flaps), reading `data/perf.json`. Each lever pulled is one existing knob: `corpse.max` (clamped to `corpsesMax`), `pieceSeconds` toward 0 for old corpses and a live-pieces cap of `cutPiecesMax`, the hitreact module's `blend` multiplier to 0, then the feel chunk's hooks off. Nothing reads these rows yet; they are data for V3 Dev to wire.
