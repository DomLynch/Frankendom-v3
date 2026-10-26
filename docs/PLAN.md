## HANDOFF (V3 dev; keep at the top, update every PR)
### 2026-10-26 18:30 (+04) — READ FIRST, then the plan below, then memory (~/.claude/projects/-Users-domininclynch-Developer-frankendom-v3/memory/)
1. **LIVE 965ca5f** (curl https://v3.frankendom.com/build.txt at 18:30); **no open PRs**. Push-to-deploy on green main: user `frankendom-v3` rrsync-locked to `/srv/frankendom-v3/live`; nginx site `v3.frankendom.com` (gzip; HTTPS by Let's Encrypt, valid to 2027-01-24, certbot.timer + v3-only reload hook `/etc/letsencrypt/renewal-hooks/deploy/frankendom-v3-nginx`); conf copies in `/srv/frankendom-v3/conf/`. Secrets V3_DEPLOY_KEY/KNOWN_HOSTS/USER/HOST set. DNS A `v3` → 49.12.7.18 at Namecheap (Dom added). No run in flight at 14:21.
2. **Live today:** #1 seed (tag `v1-seed-82a994d15`), #2 V2 shell, #3 Gate 0, #4 the lift, #5 doc. **Gate 1 PASSED** on Dom's phone (14:00: "it worked… I really like it"). Then Dom: "ok yes do all these" → V2 improvements, each default-on with a `?…=v1` toggle back to V1: #6 camera like V2 (`?cam=v1`), #9 easier first opponent = V2 novice brain on the level-18 Centurion (`?ai=v1`), #8 sound built at page load (`?snd=v1`; `?snd=1` shows audio state; real iOS unverified), #7 legs walk under a held guard (`?guard=v1`). After Dom played (15:00): #12 PLAN step-5 list; #13 fast first load (one esbuild bundle, gzip GLBs, nginx cache headers, Centurion kit after the first frame, `?load=v1`; throttled 4G 35 s → 11.1 s to playable, measured live); #14 Skull Crack 25% faster (`specialPace` {cleave, 0.75}, windup 32→24, recovery 45→34; `?skull=v1`); #15 fight starts by itself, no Fight button (`start.auto`, `?start=v1`); #16 and #17 their stills + review (merged after the fact: see memory v3-stills-before-merge). Evening (all with an independent verdict on the PR): #19 Dom's hero clips (`?clips=v1`), #21 V1 reach under them via per-clip `pullback` (`?reach=clip` = the longer re-baked reach), #22 V1's packed Centurion + kit fetched with the bodies (pop-in 3.65 → 0.19 s), #23 packed warrior, #24 **content-hashed art URLs** (a phone kept a day-old warrior.glb under a fixed name; nginx now `no-cache` on fixed art paths, immutable on hashed ones), #10 directional heavies (`?heavy=v1`; held heavies show the raised wind-up), #25 **Psyche is the hero** (`?hero=v1`), #28 stab = Mixamo 100770901 mirrored to the right hand, #29 cut twist fix (the left cut's trunk ran 153° against the hips; capped at 60°; #27's matte materials reverted: Dom keeps Mixamo's), #26 guard = 122380901 Great Sword Blocking held (`src/fight/guard-hold.ts`; shield carriers keep V1's procedural left-arm raise), #30 softer trails (cuts ×0.5, stab ×0.7, `?trail=v1`), #31 **the Minotaur is the opponent's body** (`?foe=v1`), #32 the hero's specials every 9 s, no stamina (`?spec=v1`) + honest buttons + thin yellow ready ring (`?ring=v1`).
3. **Rebuild rule:** any change to `data/hero-clips.json` or the clip pipeline must rebuild BOTH `warrior.glb` (scripts/hero-clips build.py → bake-blades) and `psyche.glb` (`bash scripts/hero-body/build-psyche.sh`) on the VPS/HF, never pick a side in a binary conflict. Same for the Minotaur (`scripts/foe-body/build-minotaur.sh`).
4. **Sessions:** none down. Strategy = "Project Strategy - Fable 5.1" (rules on scope; reply via SendMessage to its uds address or by title). "z- Agent Micro-Manager" (V3 PM) kept asking to revert defaults to V1 before Gate 1; answered twice that Gate 1 passed — do not revert unless Dom or Strategy says so.
5. **Rulings today (memory files):** v3-first-fight-level-18; v3-gate1-passed-v2-items; v3-stage-untouched; v3-keep-opponent-spells; v3-stills-on-vps-not-wait; v3-hero-clip-picks; v3-stills-before-merge (verdict on the FINAL head, posted, a few minutes, then merge); v3-hero-psyche; v3-specials-9s.
6. **QUEUE:** (a) blend/settle rows like V2's render.js blendMs/settleMs with `?blend=v1` (PM asked; "roll blend" on the step-5 list); (b) a Minotaur moveset of his own only on Dom's word (V1's bosses.json has no minotaur row); (c) Strategy rules on the rig-swap proposal (section 10) before any rig work: the 106-rig Psyche (ch22, 5.3 MB, over the 5 MB phone limit) and Minotaur (ch25) already exist on opentrident.org; (d) the stab still reads upward from the game camera: Dom judges on the phone; (e) sword PNG textures, nginx HTTP/2 (Strategy: affects every site). NOT to do: the stage (Dom: "ignore this"), cutting the opponent's spells (Dom keeps them).
   - **The Minotaur is the opponent's body** (branch `art/foe-minotaur`, Dom 10-26; Strategy: only the body changes): `src/assets/minotaur.glb` = Mixamo ch25-nonpbr on veteran.glb's 65-joint rig, all 39 clips byte for byte, the Centurion's gladius + scutum, AI, specials, stats and level; his armour kit dropped (cut to the scutum, `loot/carriers-minotaur.glb`); no rank looks on him. `?foe=v1` = the Centurion exactly. Rebuild: `bash scripts/foe-body/build-minotaur.sh` on the VPS. Stills: `scripts/foe-stills.mjs` (reads `window.__v3Fight`). 106-rig Minotaur: `https://opentrident.org/models/custom/ch25-nonpbr-full-phone-mixamorig.glb`.
   - **Psyche is the hero** (branch `art/hero-psyche`, Dom 10-26): `src/assets/psyche.glb` = Mixamo Psyche on V1's 65-joint hero skeleton (V1's `hero-exo.mjs`, as V1 did Exo Gray), V1's 27 clips byte for byte + `data/hero-clips.json` rows; `?hero=v1` = warrior.glb. **Any new hero-clips row (the guard pick) needs a Psyche rebuild:** on the VPS, `bash scripts/hero-body/build-psyche.sh` in a checkout with the seed tag, commit `src/assets/psyche.glb`. Her 106-rig version already exists: `https://opentrident.org/models/custom/ch22-nonpbr-full-phone-mixamorig.glb` (VPS `/srv/dev-jobs/opentrident-site/models/custom/`).
7. **No crons.** Main checkout `/Users/domininclynch/Developer/frankendom-v3` on main. Agent worktrees under `.claude/worktrees/agent-*` are all merged and can be removed. VPS scratch dirs: `/root/f3v-dev`, `/root/f3v-guard`, `/root/f3v-stills`, `/root/f3v-chain` (has git + the seed tag for Gate 0), `/root/f3v-load`. Mac stills: Playwright in the session scratchpad with the cached chrome-headless-shell-1248 and `--use-angle=metal` when the Mac's load is under 12. Stills recipe: usage lines at the top of `scripts/vps-stills-job.sh`. Mac builds get blocked by V1's deploy hook while V1 deploys: build/test on the VPS.
- **Known differences from frankendom.com (by plan):** V2's flat stage and sky instead of the pit; no legend names (the HUD says "Centurion"); no rank row, menu, loot, share or versus card. First visit was ~20 MB (GLBs 17.5 MB); after #13: one code bundle, gzipped GLBs, the Centurion's kit after the first frame (`?load=v1` = old order), ~9.3 MB before playable.

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
5. **V2's improvements back on top, one PR each, data where possible, each default-on with a `?…=v1` toggle back to V1 (Dom, 2026-10-26).** Each with 375 stills, each gated on the phone.
   - **Done:** camera like V2, lower and over the right shoulder ([#6](https://github.com/DomLynch/Frankendom-v3/pull/6), `?cam=v1`); novice brain on the first opponent ([#9](https://github.com/DomLynch/Frankendom-v3/pull/9), `?ai=v1`); sound built at page load ([#8](https://github.com/DomLynch/Frankendom-v3/pull/8), `?snd=v1`); legs walk under a held guard ([#7](https://github.com/DomLynch/Frankendom-v3/pull/7), `?guard=v1`).
   - **In review, not merged:** directional heavies ([#10](https://github.com/DomLynch/Frankendom-v3/pull/10), `?heavy=v1`); hero clips Dom picked: stab, outward slash and its mirror, gladius heavy (branch `anim/hero-clips-dom-picks`, `?clips=v1`; data/hero-clips.json, scripts/hero-clips/).
   - **To do:** clip-length timing as a switch: a timing-set row turned on by a query flag, V1 timing still reachable (Dom rejected clip *trims*); roll blend; feet grounding; strafe clips; the Mixamo/library bodies; the Girlscout vs Kachujin pair, which rides on the rig swap (step 4, likely next) and also cuts the ~20 MB first visit.
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

## 10. Rig-swap proposal (V3 dev, 2026-10-26, for Strategy to rule; measured unless marked est.)

Three corrections to section 4: the 106-rig bodies are not in any repo (V2 streams them from opentrident.org; licence "unconfirmed" in V2 `assets/opentrident/SOURCES.json`); the swap is ~3-4 days, not half a day; warrior.glb is 4.84 MB, not 5.6.

**What it is.** Girlscout and Kachujin replace warrior and veteran (Kachujin's own armour layers drop carriers-veteran.glb). 74 bone-name lookups in 20 files change (26 in `characters.ts`, 13 in `scene.ts`), mapping one-to-one to `mixamorig:*`; the 35 `WeaponDrawn`/`SwordDrawn` sword-node lookups have no match, and the new rig offers `fk_socket_hand_r`. `?rig=65` keeps today's fight; Gate 2 is both side by side on Dom's phone.

**First-visit weight (MB, raw files, before #13's gzip).**

| | Today | After the swap |
|---|---|---|
| Player | warrior 4.84 | Girlscout 3.13 |
| Opponent | veteran 7.32 + carriers 3.04 | Kachujin 2.59 |
| Clips | inside the bodies | 0.80 (V2's 19 files) or ~1.5 est. (V1's 27 retargeted) |
| Weapons, code, audio, blood | 2.25 + 0.91 + 0.65 + 0.40 | same |
| **Total** | **19.4** | **~10.7-11.4 est.** |

**Risks.** V2's clip set has no Jog, Draw, Riposte, Skill_Pommel, Skill_WitchArm, Death_SplitCrown, Death_RunThrough or Fin_RunThrough. 13 baked specials/execution/hamstrung JSONs (1.37 MB) are keyed by the old bone names. Then the usual: foot slide, sword offset, parry pose.

**Order (est.).** Bone table + `?rig=65` 0.5 d; bodies + sword socket 0.5 d; clips 0.5 d (V2's set) or 1 d (V1's 27); the 13 baked files and clip gaps 1 d; stills + Gate 2 0.5 d.

**Strategy to rule.** (1) V1's 27 clips retargeted (keeps "nothing different"; recommended) or V2's set; (2) the player is Girlscout or Kachujin; (3) the missing finisher clips: retarget or drop; (4) bodies copied into V3 or streamed (licence first); (5) whether the Centurion keeps gladius + scutum on Kachujin. Note: Dom's 10-26 clip picks (memory v3-hero-clip-picks) are Mixamo clips, so they carry over to the 106 rig unchanged.
