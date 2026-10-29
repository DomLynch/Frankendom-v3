# `window.__v3*` globals (audit 18)

26 debug and test seams the game puts on `globalThis`. Stills scripts, browser checks and a few tests read them **by name**, so the names are a contract: do not rename one without changing its readers in the same PR.

Not folded into one `window.__v3` registry: 19 of the 26 are set inside `src/client/main.ts`, `src/fight/scene.ts` or `src/fight/camera.ts`, and `scripts/` reads them by name (57 script files for `__v3Fight` alone). A registry would touch the files this refactor must not touch and change every reader, with no test that covers the stills scripts. Revisit when main.ts is split. Until then this table is the registry.

"set by" is the file that assigns it (or, for a seam, the file that reads a hook another module installs). Script counts are the files under `scripts/` that name it.

| Global | Set by | What it holds | Read by |
| --- | --- | --- | --- |
| `__v3Fight` | `src/client/main.ts` (also read in `src/fight/rules-eval.ts`) | the live `Practice` sim state | 57 scripts (boot-check, the boss and weapon stills, ...) |
| `__v3Zone` | `src/client/main.ts` (`zoneDebug`) | open-world state: current zone, engaged, health, attackers | 26 scripts (boss-walkin, commentator, weapon-hand stills, ...) |
| `__v3Roam` | `src/client/main.ts` | the hero's free-walk state | 12 scripts (free-camera, free-walk, look-after-kill, camera-measure, ...) |
| `__v3Scene` | `src/fight/scene.ts` | the three.js scene (close-up cameras find a body's bones) | 10 scripts (finisher-cuts, boss-weapon-hand stills, ...) |
| `__v3Yaw` | `src/client/main.ts` | camera yaw, 4 dp | 6 scripts (look-after-kill family, boss-walkin) |
| `__v3FreeShare` | `src/client/main.ts` | how far the camera has swung to the free follow camera | 5 scripts (free-camera, look-after-kill family) |
| `__v3Rules` | `src/fight/rules-eval.ts`, `src/fight/feel-limbs.ts` | rules-eval and limb-feel debug handle | 5 scripts (light-hit-trace, limbs-stills, m4-fight, perf-open-world, ...) and `test/rules-eval.test.mjs` |
| `__v3CamShot` | `src/fight/camera.ts` | the last camera shot | 4 scripts (camera-measure, finisher-cuts, boss-weapon-hand stills) |
| `__v3Radar` | `src/client/main.ts` (also `src/share-clip.ts`) | radar handle (armFlash, stopFlash, flashPhase) | 3 scripts (golden-stills, radar-flash stills) |
| `__v3Presence` | `src/client/main.ts` (`?presence=`) | the presence chunk handle (remotes, on, self, state); the radar also reads it | `scripts/presence-two-pages.mjs` |
| `__v3HeroPose` | `src/presence/chunk.ts` installs it (`?presence=` only); `src/client/main.ts` reads it | hero pose seam for remote players | `scripts/presence-two-pages.mjs`, `test/presence/draw.test.mjs`, `test/presence/rows.test.mjs` |
| `__v3SharedHp` | `src/client/main.ts` (`?sharedhp=`) | shared-HP client handle | `test/zone-client.test.mjs` |
| `__v3Clip` | `src/share-clip.ts` | share-clip controls (moment, arm, cancel, state, mode) | `scripts/share-clip-check.mjs` |
| `__v3Golden` | `src/client/main.ts` | golden-enemy handle | `scripts/golden-stills.mjs` |
| `__v3Stars` | `src/client/main.ts` | star rows and a force-spawn | `scripts/star-stills.mjs` |
| `__v3Renderer` | `src/client/main.ts` (zone only) | the WebGL renderer | `scripts/ground-stills.mjs` |
| `__v3Mobs` | `src/client/main.ts` | the trash-mob run handle | `scripts/mobs-run.mjs` |
| `__v3Mechanics` | `src/client/main.ts` | the boss-mechanics runtime | `scripts/gourd-bombs-run.mjs` |
| `__v3FreeHero` | `src/client/main.ts` | the walking hero's roll/guard fighter | `scripts/roll-guard-stills.mjs` |
| `__v3DailyPit` | `src/daily-pit-ui.ts` | daily-pit run, record, tracker, card | `scripts/daily-pit-check.mjs` |
| `__v3Corpse` | `src/client/main.ts` (corpse run) | `give(n)` coins | `scripts/corpse-run-stills.mjs` |
| `__v3Commentator` | `src/commentator.ts` | say a line through the real path | `scripts/commentator-stills.mjs` |
| `__v3Heat` | **read** by `src/mobs-run.ts` (a hook the heat system installs); not set by this tree's main.ts | kill hook `(event) => void` | nothing in `scripts/` or `test/` |
| `__v3Feel` | `src/fight/feel-kick.ts` | feel-kick debug handle | nothing today |
| `__v3Switch` | `src/client/main.ts` | the last lock-switch tap's picture | nothing today |
| `__v3Picked` | `src/fight/scene.ts` (localhost only) | the picked finisher | nothing today |

Rules for a new one: set it only behind a debug path (query flag, or localhost), type it at the assignment, add it to this table with its reader, and prefer a test that reads it over a stills script.
