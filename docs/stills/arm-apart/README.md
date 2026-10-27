# Arm-apart proof (V3 on PR 111 sha ccbe6d0)

**Evidence head: `13ca4ce`** (on base `ccbe6d0`; a later commit changes only this README line, no stills).
**Cap proof (option a + c):** `capsdump.log` is a tick-1 and tick-40 dump of `cutRig.caps` (via `capsdump.patch`, a stills-only hook, not applied to the repo): exactly `cap_shoulder_right_arm` and `cap_shoulder_right_torso` are visible, material `cap_flesh`, the other 14 caps hidden. `caps-green-tap-40.jpg` (+ crop) tints those two meshes green and the stump's cap turns green. Caveat: physics differs per run, and in that green frame the arm landed off the left edge, so the arm's own cap is proven by the dump, not by that frame; the `aside3-orbit100-zoom0.8-3x` still shows the arm fully in frame, but its own cap is not clearly visible from that angle.

**Previous best (PM r23 round 2):** `aside3-orbit100-zoom0.8-3x-tap-40.jpg` (+ `-crop.jpg`), 375 wide at 3x (1125 px), ASIDE=3 TAP=armRight, tick 40, `?zoom=0.8`, ORBIT=100, DSF=3 (`cut-stills-nocue.mjs` now takes DSF).
The whole arm lies apart at the left with its sword upright, inside the frame; the corpse's shoulder stump shows the red `cap_flesh` cap clearly. The cap on the arm's own cut end is NOT clearly visible from this angle (its cut end faces away). Mesh and material receipt: `receipt.txt` (`cap_shoulder_right_arm` / `_torso`, material `cap_flesh` base colour 0.55, 0.10, 0.09 = the wound red, not a debug colour; names read from the GLB file, not the live scene).
The older zoom 0.6 stills below are superseded.

Primary still: `aside3-orbit80-zoom0.6-tap-40.jpg` (+ `-crop.jpg`), 375 wide at 2x, tick 40 after the tap on the right arm.
The severed right arm lies apart at the left, away from the corpse, with a red flesh cap on its cut end; the corpse's shoulder stump also shows a red cap.
Only the sword tip in the arm's hand touches the left edge. No cut-cue buttons on the corpse.

Command (Mac, Metal, load ~2.4, ~6.5 s per run):

    node scripts/build.mjs && node scripts/serve.mjs 21777 &
    ORBIT=80 AFTER=1,40,200 TAP=armRight ASIDE=3 node docs/stills/arm-apart/cut-stills-nocue.mjs http://localhost:21777 out "zoom=0.6"

`cut-stills-nocue.mjs` is `scripts/cut-stills.mjs` plus one init script that hides `.cut-cue` (stills only, no game code touched); copy it to `scripts/` to run it (it imports nothing relative). `?zoom=0.6` is the existing camera lens row (pulls the camera back), ASIDE=3 as asked, ORBIT=80 turns the camera toward the arm side.

Other files:
- `aside3-orbit80-zoom0.6-tap--1.jpg` the frozen corpse before the tap; `-tap-200.jpg` the arm settled apart.
- `aside1.5-*`: first pass with the cut buttons still on (arm apart but buttons cover the corpse; superseded).
- `aside3-tap-40-FAIL.jpg`: the plain ASIDE=3 default framing: corpse at the left edge under the cut buttons.

Receipt: VPS capture queue sat at cpu-pressure 43-49 (limit 25); HF CPU job 6ae07c073fb22a235dd2879c failed (page screenshot timeouts under SwiftShader); the stills ran on the Mac.
Limit: the cap is a small red patch at 375, readable in the crop, not a close-up.
