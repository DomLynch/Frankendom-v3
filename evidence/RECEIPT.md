# Receipt: V3 #171 (gore on every kill), Minotaur, Mac, real GPU

- Build: dist built on the VPS from branch evidence/gore-171 (PR head dcc89c7 plus harness files only), rsynced to the Mac, served by `scripts/serve.mjs` on port 38791. Mac load 2.1 before and after.
- Browser: Chrome for Testing 1234, headless, ANGLE Metal (real GPU), 375x812 @2x for stills (@1x for the kill run), Playwright paused fake clock, one rAF = one 60 Hz tick, same seed (the harness's forced pick).
- Stills: `evidence/after/` (default) and `evidence/before/` (`?gore=v1`), per finisher `-k004` (the kill moment, 4 ticks after the killing blow) and `-k064` (~1 s later).
- Kill run: `evidence/kills.jsonl` (raw), 10 real kills per query, no forced finisher, a fresh page per kill, varied strafe side / swing cadence / walk-in delay. Finisher kind is INFERRED from `__v3Cuts` (the pick is not exposed): head+head_split = splitCrown, head = decapitation, belly_open = opened, torso_waist = opened stand-in, no cut = runThrough OR plain death (indistinguishable here).

## Forced-finisher stills: cuts made (same in after and before)
| finisher | cuts | stand-in? |
|---|---|---|
| splitCrown | head, head_split | no (hasUnit true) |
| decapitation | head | no |
| runThrough | none (by design) | n/a |
| opened | belly_open | no (not the torso_waist stand-in) |

Caveat: the forced pick bypasses the gate, so the BEFORE stills do not show what v1 does by default; the natural kills below do.

## 10 natural kills (all light blows to the torso, all killed, ragdoll played)
| # | default (after): kind | cuts | v1: kind | cuts |
|---|---|---|---|---|
| 1 | decapitation | head | opened | belly_open |
| 2 | no cut (runThrough or plain) | none | decapitation | head |
| 3 | no cut | none | opened | belly_open |
| 4 | decapitation | head | splitCrown | head, head_split |
| 5 | decapitation | head | opened | belly_open |
| 6 | no cut | none | decapitation | head |
| 7 | no cut | none | opened | belly_open |
| 8 | no cut | none | decapitation | head |
| 9 | decapitation | head | opened | belly_open |
| 10 | decapitation | head | splitCrown | head, head_split |

Cut meshes (piece_* / cap_*) were visible after every kill (78 to 83 nodes). Console errors: 1 per run (a 404 for a static resource, same on every page), 2 on the first.

## Not verified / open
- Default (after): 5 of 10 kills made no cut, and none was splitCrown or opened. The run cannot tell runThrough (no cut by design) from a plain death, so "gore on every kill" is NOT shown by this run for those 5. The PR wants the plain death out of the automatic pick; if those 5 are runThrough that is fine, if plain it is a bug. Needs the pick exposed (or a hook) to settle.
- v1 shows a cut on all 10 kills in this run, so gore on the Minotaur in v1 was not gated off here (kills forced no-gate by the ragdoll's own path?); the before/after difference in this sample is the pick mix, not gore vs no gore.
- Only light torso kills; heavy blows, other locations, other foes not run. No-repeat across consecutive fights not run (one fight per page). The 404 console error was not traced.
