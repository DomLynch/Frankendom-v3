# Frankendom V3: V1's fight core in V2's shell (Strategy, 2026-10-26, for Dom's sense-check)

Status: proposal, not started. Dom's direction of 10-26 morning: V2's combat is additive but still below V1; rather than lift V2 to V1's level, build V3 = V1 stripped of everything that is not the duel, in V2's light shell, then add V2's improvements back one at a time.

## 1. The decision

Build **V3** as a fresh repo at **v3.frankendom.com**:
- V1's fight logic and feel layer, copied as they are (not rewritten).
- V2's shell: the sand-and-blue stage, module loading from hashed paths, push-to-deploy on green, the data validator, the timing-sets pattern.
- V2's own sim and renderer retired. V2's data rows and improvements come back on top of V3 one by one.
- V1 (frankendom.com) stays live and untouched as the reference.

Gate for every step: side by side on Dom's phone against frankendom.com. "Nothing different" is the pass for the first cut.

## 2. Why this and not the alternatives

**Why not finish V2.** V2's 2,200 lines re-implement V1's rules by hand. Every phone round re-derives by feel something V1 already encodes (swing warp, step-in distance, hit-stop table). The 2 to 3k-line target was wrong: V1's fight logic alone is ~8k lines with data, and that is the part that makes the game good. Lifting it is a bounded job from a dependency map; lifting V2 to V1's level is open-ended.

**Why not edit V1 in place.** V1's shell is the slow part: a 1.04 MB JS bundle, an entry file (`src/main.ts`, 1,765 lines) with 82 imports, and release rows that turned a HUD text PR into an hour. The fresh repo gets V2's shell, which is what Dom likes (12 KB of own modules, fast load, no bloat).

## 3. What the V1 code says (measured 2026-10-26 on frankendom-lead-catalogue 6d236ab62)

V1 is ~33k lines: `src/fight` 22,879, `src/core` 7,300, `src/net` 1,105, `src/audio` 438, `src/pit` 228, plus top-level files.

**Fight logic (lift whole): 56 .ts files, 4,594 lines, plus 44 data files, 3,766 lines.**
`combat.ts` (278) and everything it imports: `duel.ts` (822, the 60 Hz step, "pure and fixed at 60 Hz"), `moves.ts` (272), `move-defs.json`, `moves-tables-defs.json`, `weapon-defs.json`, `rules-defs.json`, `rules.ts`, `ai.ts` (449), `input.ts` (549), `sim.ts` (40, the 1/60 step), `detmath.ts` (116).
- No packages at all: no three.js, no Sentry, no Supabase.
- No `document`, `window`, `localStorage`, clock or `Math.random`. Files mark themselves "A sim file: no clock, no Math.random".
- Nothing in `src/fight` or `src/audio` imports `src/net` or `src/pit`.
- Only imports outside `src/fight`: `src/core/registry.ts` (178, the data-file loader) and `src/roster.ts` (46).
- Holds every rule: parry, perfect block, guard, riposte, roll with safe start/end, dodge-attack window, posture, counter-hit (1.25x damage, 1.5x stagger), stop-hit, rear hits, hit-stop table, the move table.
- Comes with ~900 lines of spell, missile, mana and stance rules wired into `duel.ts` (13 of its 24 imports). They ride along inert in the first cut; removing them is a later cleanup, not a blocker.
- Opponent stats build from `catalogue-data.ts` (235) + `archetype-defs.json` (814); `special-look.ts` loads `bosses.json` (380, 27 entries). A plain 1v1 needs one row of each; the files load as they are.

**Feel layer (lift, three.js-bound, no bloat): ~3,800 lines.**
`camera.ts` (405: camera kick, finisher push-in, side-view reveal), `fx.ts` (281), `gore.ts` (545), `opened.ts` (226, the finisher body-opening), `characters.ts` (1,213, GLB loading), `src/audio` + `src/fight/sound` (1,143), `hit-stop.ts` + rules (30). `characters.ts` has four bloat imports (`core/grades` for the Tier type, `retry.ts`, ranged/beast/spectral rigs) that stub to constants.

**The three couplers (cut down): 3,300 lines.**
- `scene.ts` (1,224): 70+ imports. Bloat: `core/loot` (pulls in legends), `core/grades` (pulls in career ladder and profile), sparring-specials (pulls in `match.ts`, then scorecard, trial, tutorial, first-loss, autopsy), Sentry, hero-preview, arena themes, rank-look, boss-telegraph, ten per-character signature modules. Feel: ~20 modules (finishers, blood, hit-impact) that stay.
- `main.ts` (1,765): holds the fixed-step loop (accumulator + requestAnimationFrame) and the hit-stop hold; otherwise share, monitoring, legends, scorecard, trial, zone-1 hop, gear room, accounts.
- `match.ts` (340): record, trial, scorecard, career ladder, loot, profile, special-equip, autopsy, tutorial, first-loss. Only `stepPractice` is needed.
- `hud.ts` (276): drop `ladder.ts` and `lessons.ts`; keep combat and defence-grade.
- `world.ts` (331): the zone layer (open-fight, threat, speeds, leash). Not needed for a duel.

**Dropped, never reached once the couplers are cut:** `src/core` except `registry.ts` (contracts, items, inventory, economy, story, career, loot, account, cloud-profile, live-ops), `src/net`, `src/pit`, legends, zones, presence, login, save. No stubs needed for login, presence, zones or the network layer; no save needed (only `match.ts` and `main.ts` touch the profile).

**Stubs (about fifteen):** `core/grades` Tier -> constant; `core/loot kitWorn` -> empty; sparring-specials -> no-op; Sentry -> `console.error`; hero-preview, look-flag, rank-look, boss-telegraph, arena-themes -> defaults; `retry.ts` -> plain load; hud ladder/lessons -> removed.

**Bodies.** V1's player is `src/assets/warrior.glb` (5.6 MB): 65 joints on a UE-style skeleton (`root`, `pelvis`, `spine_01..03`, `Head`, `clavicle/upperarm/lowerarm/hand`, fingers, `thigh/calf/foot/ball`), 27 clips (Idle, Guard, Parry, Riposte, Roll, Kick, BlockImpact, the swings). Each opponent is its own GLB (0.9 to 8.5 MB). Code looks bones up by name (`hand_r`, `upperarm_r`) and hangs the sword on the `WeaponDrawn` / `SwordDrawn` nodes. Loaded with GLTFLoader + meshopt + SkeletonUtils.clone.

**Smallest V3 first cut:** fight logic (4,594 + 3,766 data) + feel layer (~3,800) + a new ~300-line driver replacing `main.ts` (fixed-step accumulator, hit-stop hold, `stepPractice`) + a cut-down `scene.ts` (~600) + two GLBs (warrior + one opponent). **About 10 to 12k lines of TypeScript and ~4k of data**, most of it copied. Unedited, the closure is 20k lines because `scene.ts` pulls in the bloat; the cut is what makes it 12k.

## 4. The rig trade-off (the one thing that is not free)

V1's feel is in the code and the data, not the skeleton: timings, windows, hit-stop, swing warp, step-in all survive a rig change. But V1's 27 clips and bone-name lookups are on the 65-joint UE rig; V2 and the physics package use OpenTrident's 106-joint rig, which is a different skeleton with different names, not "65 plus extras". So:
- **V3 first cut runs on V1's rig** (warrior.glb + one opponent). This is what makes "nothing different" testable.
- **Then OpenTrident retargets** warrior + 27 clips (and one opponent) onto the 106 rig, remaps the sword socket and the bone lookups. Same conversion as the 84 Mixamo bodies on 10-26; a known half-day job. The 106 rig has every joint the 65 uses; the spare joints are headroom for fingers, cloth and the physics ragdoll.
- Risks are all visible, none in the sim: foot sliding, sword a few cm off the hand, a parry pose reading differently. **Gate:** the rig swap passes the same phone side-by-side with `?rig=65` as the comparison.
- The 106-only one-mold rule applies to V2 and the physics package; V3's first cut is exempt until the swap passes.

## 5. Order of work

1. **Repo + shell (V2 dev, half a day).** New repo `DomLynch/Frankendom-v3`, V2's CI, nginx block and deploy (code under `/b/<sha>/`, build.txt, push-to-deploy on green), V2's `stage.js` and `stage.json`. Language: TypeScript (V1's), built to ES modules with esbuild; no bundler for three.js.
2. **Lift (V2 dev, one to two days).** Copy the fight logic and feel layer as listed in section 3. Write the driver. Cut `scene.ts`. Apply the stubs. One player vs one AI on the flat floor, V1's rig, V1's HUD, V1's sounds. Every stub is one line with the V1 file it replaces.
3. **Gate 1: Dom's phone, V3 vs frankendom.com side by side.** Pass = nothing different in controls, timing, feel, sound, camera, finishers. Nothing else merges before this.
4. **Rig swap (OpenTrident, half a day, in parallel with 2).** warrior + 27 clips + one opponent on the 106 rig; delivered as a `rig: 106` clip set. **Gate 2:** same side-by-side with `?rig=65`.
5. **V2's improvements back on top, one PR each, data where possible:** novice brain row, directional heavies, clip trims as timing-set rows, sound built at page load, the Mixamo/library bodies, the Girlscout vs Kachujin pair. Each with 375 stills, each gated on the phone.
6. **Then the combat-101 roadmap continues on V3:** physics package (M3 to M6) installed into V3 instead of V2; step 3 live shared zone; finishers from the physics package. The core reference `COMBAT-101-TOP-25-2026-10-25.md` and its rulings are unchanged; only the host repo changes.

## 6. What happens to V2

- Repo goes read-only after step 3 passes; its data rows (`timing-sets.json`, `behaviours.json`, `specials.json`, `feel.json`, `camera.json`) are the source for step 5.
- The V2 dev becomes the V3 dev (it holds the V1 parity rows and the phone-round history).
- v2.frankendom.com stays up until V3 passes gate 1, then redirects to v3.

## 7. Rules that carry over unchanged

Data layer first (every number a row; the validator rejects unknown rows). One deterministic sim shared by phone and headless Node (V1's `duel.ts` already qualifies). Six-unit fighter contract from day one. GitHub Actions the only gate, merge on green, 375 stills for anything visible, no stacking. Donor games first for any new feature. Dom judges every picture on his phone.

## 8. Sense-check (second dev, 2026-10-26): agreed, with three corrections and six additions (all adopted)

**Corrections to the map**
1. **Lift from a pinned commit, never from `frankendom-main` as it sits.** `frankendom-main` on the Mac is stale (fefb8fe19, 2026-09-20, flat `src/`, no `src/fight`). GitHub trunk is **82a994d15** (2026-10-23) and has `src/fight`; the measured checkout was `frankendom-lead-catalogue` @ 6d236ab62. **V3 seeds from 82a994d15.**
2. **V2 is JavaScript, not TypeScript** (2,683 src lines, 3,946 with tests and scripts). V3 = V1's TypeScript fight and feel inside V2's JS shell. V2's validator (`src/sim/validate.js`) is JS and gates V1's JSON data rows unchanged: a free win.
3. "2.2k lines" was src-only; the parity harness (`test/parity.mjs`, `test/v1-parity.test.mjs`, `scripts/parity-table.mjs`) and the deploy scripts are part of what V3 inherits. Note: that harness drives a frozen fixture (`test/fixtures/v1-combat.json`), not live V1 code; good template, not V3's gate.

**Additions**
1. **Gate 0, before the phone: a headless replay diff in CI.** Both sides are pure 60 Hz. Run recorded input scripts through V1's `src/fight` at 82a994d15 and through V3's lifted copy, hash the state per tick, require identical, on every V3 PR. Port the driver from V2's `parity.mjs`, swap the fixture for live V1 code. "Nothing different" becomes a red/green row and catches any accidental edit during the lift.
2. **One `stubs.ts`**, one line per stub naming the V1 module it replaces, plus a CI grep asserting nothing outside `stubs.ts` imports `core/*` (except `registry.ts`), `net`, `zones`, `legends`, `pit`. "Dropped" becomes enforced.
3. **Page weight is measured and published at Gate 1.** V2's lightness is module weight; V3's first cut is dominated by GLBs (warrior 5.6 MB, opponents up to 8.5 MB). Hashed paths make repeat visits cheap; the first visit is not 12 KB and the number is stated, not assumed.
4. **Inert-rules removal is scheduled right after Gate 1** (~900 lines of spell, missile, mana and stance rules, 13 of `duel.ts`'s 24 imports). They ride along for the first cut and are cut in the first PR after Gate 1, not left.
5. **Seed once, then never pull.** `git filter-repo` seed from V1 history (`src/fight`, `src/audio`, `src/core/registry.ts`, `src/roster.ts`, the assets), the seed commit tagged `v1-seed-82a994d15`; afterwards V1 fixes enter V3 only as manual cherry-picks. Blame stays readable and the repos never entangle.
6. **Fallback named now:** if Gate 1 fails on feel, the fix is in the lift or the cut (copy-only work), never a re-litigation of in-place editing. The only sanctioned re-open is the rig-swap gate with `?rig=65`.

The order of work in section 5 is unchanged: repo + shell, lift, Gate 0 then Gate 1, rig swap, V2 rows one PR each.

## 9. Open questions (now answered)
1. Map read differently from the code: see the three corrections above.
2. Spell/missile/mana rules in `duel.ts`: inert for the first cut, cut in the first PR after Gate 1 (addition 4).
3. V1's HUD stays exactly for Gate 1; V2's HUD labels are a step-5 item.
4. esbuild to ES modules, not Vite: keeps V2's hashed-path loading and no bundle.

## Old section 8 kept for the record: open questions as first posed

1. Anything in section 3 the checker reads differently from the code (the map was taken from import blocks and `wc -l`, not from running it).
2. Whether the ~900 lines of spell/missile/mana rules inside `duel.ts` should be cut in the first lift or left inert (Strategy: leave inert, cut after gate 1).
3. Whether to keep V1's HUD exactly (Strategy: yes for gate 1; V2's HUD labels are a step-5 item).
4. esbuild-to-ESM versus keeping V1's Vite build (Strategy: esbuild, to keep V2's hashed-path loading and no bundle).
