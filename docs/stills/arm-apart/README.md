# Arm-apart proof (V3 on PR 111 sha ccbe6d0)

Command (Mac, Metal, load 2.4; 6.5 s per run; VPS was at cpu-pressure 43-49 and the HF CPU job timed out on page screenshots under SwiftShader):

    npm run build  # scripts/build.mjs
    AFTER=1,40,200 ASIDE=1.5 TAP=armRight node scripts/cut-stills.mjs http://localhost:21777 out/p15 ""

375 wide, deviceScaleFactor 2, tap on the right arm, tick 40 after the tap.

| file | what it shows |
|---|---|
| `aside1.5-tap-40.jpg`, `-crop.jpg` | PASS for "arm apart and in frame": the severed right arm (with the sword in its hand) lies on its own on the sand, left of the hero, clear of the corpse |
| `aside1.5-tap--1.jpg` | the frozen corpse before the tap |
| `aside1.5-tap-200.jpg`, `-crop.jpg` | 200 ticks later: arm settled apart |
| `aside3-tap-40-FAIL.jpg` | the requested ASIDE=3 framing: corpse is at the left edge under the cut buttons; no arm readable |

Not proven: the flesh cap (`cap_shoulder_right_*`) is not distinguishable at 375 in any frame; the arm's cut end is dark maroon, and the stump on the corpse is hidden behind the hero and the yellow cut buttons. A flesh-cap proof needs a closer camera (e.g. `?zoom=`) or the cut buttons hidden.
Other framings tried: ASIDE=-3, -2, 2, 4(not viewed), ORBIT=+-150, LEAVE=2: corpse hidden behind the hero or arm not separate.
