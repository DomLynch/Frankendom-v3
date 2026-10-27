# Arm-apart proof (V3 on PR 111 sha ccbe6d0)

**Claim, exactly:** the right arm lies apart from the corpse, and the stump cap (`cap_shoulder_right_torso`) is shown at 375 wide at tick 40. Nothing more is claimed.
**Reviewed head: `26c2e8e`** (V3 reviewer PASS, limited to that claim). Later commits only add proof files and this README; no still it reviewed changed.

Reviewed still: `aside3-orbit100-zoom0.8-3x-tap-40.jpg` (+ `-crop.jpg`): 375 wide at 3x, ASIDE=3 TAP=armRight, tick 40, `?zoom=0.8`, ORBIT=100, cut buttons hidden. The whole arm lies apart at the left with its sword in frame; the stump on the corpse shows its cap.

Command (Mac, Metal, ~6.5 s per run; VPS capture pressure was 43-49, the HF CPU job failed on screenshot timeouts under SwiftShader):

    node scripts/build.mjs && node scripts/serve.mjs 21777 &
    DSF=3 ORBIT=100 AFTER=1,40 TAP=armRight ASIDE=3 node scripts/cut-stills-nocue.mjs http://localhost:21777 out "zoom=0.8"

`cut-stills-nocue.mjs` (in this folder; copy to `scripts/`) is `scripts/cut-stills.mjs` plus an init script hiding `.cut-cue`, a DSF env, and a CAPS/TINT dump. No game code is changed.

Cap evidence:
- `capsdump.log` (hook: `capsdump.patch`, not applied to the repo): at ticks 1 and 40, exactly `cap_shoulder_right_arm` and `cap_shoulder_right_torso` are visible (material `cap_flesh`), 14 other caps hidden.
- `caps-green-tap-40.jpg` (+ crop): those meshes tinted green; the stump's cap turns green.
- `receipt.txt`: mesh and material names read from `minotaur-106.glb`.

**Follow-up (not a blocker): the arm-side cap.** `cap_shoulder_right_arm` is visible in the dump, but its cut end faces away from the camera in the reviewed still, and the arm lands somewhere different on each run (sometimes off the left edge). A framing that shows that cap needs an orbit toward the arm's cut end, and a frame where the arm is in view with the green tint.

Other files: `aside3-orbit80-zoom0.6-*` and `aside1.5-*` (earlier passes, superseded), `aside3-tap-40-FAIL.jpg` (plain ASIDE=3: corpse at the left edge under the cut buttons).
