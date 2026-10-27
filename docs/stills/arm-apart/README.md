# Arm-apart proof (V3 on PR 111 sha ccbe6d0)

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
