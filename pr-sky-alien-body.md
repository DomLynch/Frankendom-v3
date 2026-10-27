## What changed

Dom: the skyline's big smiling alien face was rarely seen on a phone. Two reasons, both fixed here. The sand, grid, fog, flat sky and the picture file are untouched.

1. **Yaw follow.** The strip was fixed in world yaw, so the alien only showed when you happened to face it. Now the strip turns by `skyline.yawFollow` (0.97) x the camera's heading, eased over `yawFollowSeconds` (0.3 s), so the alien stays ahead wherever the hero faces. `followOffsetDegrees` (-90, follow only) puts it dead ahead at the page's first heading (about 8 degrees). The ease takes the shortest way round and follows the heading folded to -pi..pi, so lapping the boss never builds an offset: the alien is never more than (1 - yawFollow) x 180 = 5.4 degrees off the view, and nothing jumps at the +-pi wrap. `?skyfollow=v1` turns it off: the strip is fixed at `yawDegrees` (0), as before.
2. **B lowered into the clear sky band.** On a 375 phone at the default camera the screen top is only +4 degrees above the eye, so the old B (drop 23 m, 120 m tall) put the face (about +15 degrees) above the screen, under the HUD bars. B now uses `dropMetres` 72 and `heightMetres` 100 (the picture's natural proportion: 820 px = 99 m at the 150 m radius). The face centre lands at -7.6 degrees (band: -4 to -9, between the HUD and where the sand melts) and the strip top (+6.1 degrees) stays above the screen top, so no flat-sky edge shows behind the bars. The new row `skyline.face` (the face centre in the picture, u 0.747 v 0.36) is what a test reads to keep this true.

Camera pitch default is NOT changed: the stills do not justify it (see verdict).

## Rows (all data/stage.json skyline, validated in src/sim/validate.js checkSkyline)

yawFollow 0..1, yawFollowSeconds 0..20, followOffsetDegrees, followQuery / followV1 (plain words, not the other queries), face {u, v} 0..1. dropMetres range widened from +-60 to +-120 (the far-plane rim check still gates every variant). Variant B's old upper bound on the strip's bottom edge (must not be deeper than the solid-sand angle) was dropped: deeper is hidden by solid sand and leaves no gap; the lower bound (no flat-sky gap under the melt) stays.

## Verdict: would a thinner strip, or starting it higher, solve it?

Neither, tested in stills (whatif/ folder, same page, same camera):

- **Thinner** (60 m tall, dropped to keep the face in the band): the alien does not get smaller, it gets squashed. Its width is set by the picture's share of the 360 degrees (the face is about 40 degrees wide against a 25 degree wide phone view), which height does not change; only a squat face and a hard strip-top edge behind the HUD bars result. See whatif/thin-ready.png.
- **Higher** (drop 0, 100 m tall): pushes the face further above the screen (it sits at about +19 degrees, the screen top is +4): only the pink horizon haze and cloud sea show under the bars. See whatif/higher-ready.png.
- **Lower** is what works: dropping the strip brings the face into the band. Dropping only part of the way (drop 34, whatif/mid-ready.png) still leaves the face off the top of the screen, with just the clouds and a round shape below it; 72 puts it in. Combined with the yaw follow it is always ahead.

Honest limit: the face is wider than a portrait phone's view (about 40 degrees against 25), so a phone shows the eyes, nose or smile, not the whole head at once; that comes from the 360 degree strip and cannot be fixed by height or drop. Showing the whole face would need the strip compressed in angle (a part-circle mapping) or a wider phone FOV: not done here.

Camera pitch: ?pitch=horizon (10 degrees) was tried with the face still too high (chin and hands showed); it needs the same lowering anyway and changes the fight framing, so the default stays off.

## Stills (375 x 812, Mac Chromium, Metal; load 3 at the time)

Each pair is the default vs ?skyfollow=v1 at the same heading (the hero strafes round the boss: headings 8, 16, 100, -91, 63 degrees). Strip yaw is read back in docs/stills/sky-alien/headings.json.

| ready idle | default | ?skyfollow=v1 |
|---|---|---|
| heading 8 | ![](https://github.com/DomLynch/Frankendom-v3/blob/fx/sky-alien-visible/docs/stills/sky-alien/default-ready.png?raw=true) | ![](https://github.com/DomLynch/Frankendom-v3/blob/fx/sky-alien-visible/docs/stills/sky-alien/skyfollow-v1-ready.png?raw=true) |
| heading 100 | ![](https://github.com/DomLynch/Frankendom-v3/blob/fx/sky-alien-visible/docs/stills/sky-alien/default-turn2.png?raw=true) | ![](https://github.com/DomLynch/Frankendom-v3/blob/fx/sky-alien-visible/docs/stills/sky-alien/skyfollow-v1-turn2.png?raw=true) |
| heading -91 | ![](https://github.com/DomLynch/Frankendom-v3/blob/fx/sky-alien-visible/docs/stills/sky-alien/default-turn3.png?raw=true) | ![](https://github.com/DomLynch/Frankendom-v3/blob/fx/sky-alien-visible/docs/stills/sky-alien/skyfollow-v1-turn3.png?raw=true) |
| heading 63 | ![](https://github.com/DomLynch/Frankendom-v3/blob/fx/sky-alien-visible/docs/stills/sky-alien/default-turn4.png?raw=true) | ![](https://github.com/DomLynch/Frankendom-v3/blob/fx/sky-alien-visible/docs/stills/sky-alien/skyfollow-v1-turn4.png?raw=true) |
| mid-fight (heavy swing) | ![](https://github.com/DomLynch/Frankendom-v3/blob/fx/sky-alien-visible/docs/stills/sky-alien/default-heavy.png?raw=true) | ![](https://github.com/DomLynch/Frankendom-v3/blob/fx/sky-alien-visible/docs/stills/sky-alien/skyfollow-v1-heavy.png?raw=true) |
| mid-strafe, no settle | ![](https://github.com/DomLynch/Frankendom-v3/blob/fx/sky-alien-visible/docs/stills/sky-alien/default-moving.png?raw=true) | ![](https://github.com/DomLynch/Frankendom-v3/blob/fx/sky-alien-visible/docs/stills/sky-alien/skyfollow-v1-moving.png?raw=true) |

Note: ?skyfollow=v1 here still has the lowered B (the follow is off, the lowering is not). The real "before" (main, old B, fixed strip) at heading 8 and 100: docs/stills/sky-alien/main-before-ready.png and main-before-turn2.png (clouds and the alien's body, the face above the screen).

What-if stills: docs/stills/sky-alien/whatif/ (thin, higher, mid).

Reviewer verdict on the stills: the face (eyes, nose, smile) is in the clear band below the HUD bars at every heading, readable, and the hero and boss stay clear below it. Not judged: Dom's eye on the real phone.

## Tests

- New test/skyline-follow.test.mjs: heading maths, shortest-turn wrap-around, a spin through three laps with no jump and no built-up offset, ease then settle, first frame starts on target, ?skyfollow=v1 stays fixed, row validation (follow rows, face row, query words), face centre in the band and strip top above the screen, scene.ts call order. These fail on main (the exports and rows do not exist) and pass here.
- Full suite on Hugging Face CPU: hfjob 6ae09b963fb22a235dd2a697, sha 3efbe21: 776 tests, 749 pass, 0 fail, 27 skipped. (An earlier run, 6ae098b63fb22a235dd2a382 at a811175, failed one of my own new tests on a too-tight settle tolerance; fixed.)
- scripts/sky-alien-stills.mjs is the recipe (HACK env gives the what-if rows with no rebuild).

## Not verified

- Landscape and desktop framing of the lowered B (stills here are the 375 portrait phone only); the strip top sits at +6 degrees, which is fine for the phone camera but not checked on a wide screen.
- A real phone and the free-walk look thumb (the camera turns by hand: the follow uses the same heading, but no still was taken).
- The zone camera with a pitch preset (?pitch=...) with the new B.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
