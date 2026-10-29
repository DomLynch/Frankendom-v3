# V3 Dev handover (2026-10-29)

## Now
- **FIRST ITEM NEXT SESSION: the real-GPU trace for #299 was NOT run** (reviewer's PASS said 'needs real-GPU trace before merge'; merged anyway, see below). Run one Mac session (MAC_HEAVY_OK=1, load < 12): ms/frame before/after on a fight, and blood/gore marks on a moving rig; revert #299 (e8f04628d) if marks drift.
- Audit-only mode (Dom, 06:45Z): no game development; every other dev paused. Mechanics batch #289 is PAUSED, Mac runs stopped.
- Last merges: #298 f77033ced, #300 ffc7a1ad3, #302/#303/#304 (plans), #296 6a03e10da. Live follows main (check `curl -s https://v3.frankendom.com/build.txt`).
- #299 bone cache MERGED e8f04628d (07:1xZ) with an exception to its reviewer's condition ('real-GPU trace before merge'): Mac runs were stopped by Dom's order; my code reading: the first `boneWorld` per `update()` still refreshes the whole subtree, later calls refresh only the asked bone's chain, so gore.ts/signature.ts `.matrixWorld` reads can be at most one frame stale. STILL OWED: a real-GPU frame trace (ms/frame gain unmeasured) and a look at blood/gore marks on a moving rig; revert #299 if marks drift.
- The audit PR list is complete; nothing else audit-related is open.

## Done today (audit)
- Merged: #290 tsconfig+typecheck+ESLint (41 type errors, dead modules) / #291 security + client (host/key scrub at HEAD, presence Origin allow-list, capped shared-HP retry, one-shot audio unlock) / #293 hygiene (-163 MB at HEAD, dist symlink, mp4s, dead CSS, README) / #294 INSTALL doc / #296 typed rows loader (casts 228 -> 87, dist raw bytes equal) / #297 shared Playwright helper (66 scripts) / #298 audit C (knockback rounding as era flag `knock-round`, five era flags stamped into the replay record) / #300 orphans (11 modules, ~540 exports) / #301 behaviour tests + source pins / #292 item core (signed by ARMAGEDOM Lead; `bodypart` type, fixed `rows` wrapper) / #253 Minotaur matrix test / #122 zone design / #286 weapons batch / #288 early-cut replay / #258 parts stage 1 / #272 boss spacing.
- Closed: #295 (build once in CI: measured no gain: 211 -> 193 s wall, 332 -> 347 job-seconds), #260 (superseded by #266), #248/#251/#254 (folded into #286), #274.
- Plans (docs only, merged): #302 item 15 split main.ts/scene.ts (15 steps, ~57 h, riskiest zone-run and scene-finisher), #303 item 16 stepDuel (7 kill copies that differ in 5 ways; riskiest step 6 contact resolution; step 0 differential test), #304 item 17 one flag parser (91 flags, 4 parse styles, per-frame re-parse of ?zoom and ?bossload at main.ts:679/684).
- Item 4 (listener cleanup beyond audio unlock): no plan written.

## Audit checklist status
- Bugs: 1 knockback = merged (#298). 2 replay era flags = merged (#298). 3 dead imports = merged (#290). 4 listeners = audio unlock merged (#291), rest not started. 5 bone cache = merged (#299 e8f04628d; real-GPU trace still owed). 6 host/key = merged (#291; history scan found NO private key, history purge NOT approved). 7 presence Origin + retry = merged (#291).
- Bloat: 8-11 merged (#293). 12 stills harness = merged (#297). 13 spell/mana rules = deferred (Dom: keep opponent spells). 14 orphans = merged (#300; 6 orphans and 404 exports remain: pack-rows.ts, body-tables.ts...). LFS/binary move = dropped (Dom: no LFS, no history rewrite).
- Structure: 15/16/17 = design merged, code not started (after #289 is the intended order; Dom decides). 18 rows loader merged (#296). 19 tests merged (#301). 22 npm ci = doc only (#294; sandbox must reach codeload.github.com). 23 build once = measured, closed.
- Merge rule used: one runtime PR per deploy (a newer push cancels the in-flight deploy); docs/tests/scripts back to back. `test` and `built-game boot` are required checks on main (Dom yes, 10-29).

## Open
- #289 mechanics batch (Nan, Envoy, Reginald, Accountant, Kachujin + all-bosses test, on top of Gourd #281 and King #282 already on main). Final head f9dbf0519 (main 8965a6d merged in; Gourd throw fixed via mechanicView() in runtime.ts + test/mechanic-main-hooks.test.mjs; CI green; hfjob npm test 1306/0). It needs a real-GPU browser proof of all 7 bosses before merge; it will need main merged in again (#298/#300/#296 landed after). Results so far: Nan works (tell, lunge, drag, kill; roll-out passed once and failed once on slow GL); Envoy PASS on 29dad6f3b by hand-driven Mac probes (latch, drain to floor 40, slowed walk, breaks by roll/cut/timeout, guard/roll whiff, kill); Kachujin PASS on the checks run (line locks 24 ticks, standing hero cut once 150 -> 133, running hero not cut; roll-off/kill not done); Gourd boot smoke of all 7 bosses PASS on f9dbf0519 with zero pageerrors (HF software GL; roll-dodge failed twice there, probably timing); Reginald and Accountant NOT proven (Accountant wall drawn and 0 damage while up; parries/kill unproven); King unverified (console error 'Equip file has no WeaponDrawn, or the rig no hand_r'). Old PRs #276 #278 #279 #280 #283 are superseded by #289 (close after it merges).
- #241 terrain (dirty; Dom undecided). #213 presence parked. Frozen features: #263/#264/#270 (Hunter, Flesh Market), #267 merchant body, #277.
- Slice 0 platform: games-platform repo (item core as package 0) after #289; needs Dom/Strategy visibility ruling (default public, schema-only).
- Dom owes: terrain #241 ship as-is?, fighting-style decisions (#271), Pit Crawl rules, Envoy weapon. Ruled: any weapon dismembers (blunt too), no history purge, no LFS, spells and ?x=v1 flags stay.

## Gotchas
- Browser proof: HF SwiftShader gave 4 inconclusive runs (game at a few ticks/s); real-GPU runs go on the Mac with MAC_HEAVY_OK=1 (Strategy ruling), load < 12, scripts in scripts/*-real.mjs need their invocation fixed, not the PR.
- Mac GitHub pack clones reset (repo is large): use `git clone --filter=blob:none --depth 1 --single-branch` plus sparse checkout; the VPS has no GitHub push credentials (push from the Mac).
- Depth-limited checkouts lack tag v1-seed-82a994d15, so gate0 and 'V1 clips byte for byte' fail there only; CI is the truth.
- Gate 0 never reaches 5 of 7 kill copies in stepDuel (see #303). Era flags: live rounds knockback; headless/V1 replays keep old steps unless the record says otherwise.
- Never edit the Mac checkout; delete agent clones with literal-path rm -rf; stray chrome processes hide by cwd (find via lsof/proc, kill exact PIDs).
