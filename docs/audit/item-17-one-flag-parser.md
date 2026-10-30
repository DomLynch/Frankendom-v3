# Audit item 17: one flag parser (design only, no code motion)

Base: origin/main 22610bb, read statically, no builds. Rulings kept: every flag and every `?<name>=v1` toggle STAYS (removal is Dom's call after alpha), everything default-on through data rows, no NEW flags. The goal is ONE parser, not fewer flags.

Counts are from a mechanical grep, so treat them as +/- a few: 91 distinct `?name` URL flags (the audit said 84; the gap is the 7 sparring params, `ai`-style two-reader flags and the `data/*.json` rows that name a flag only through `query`; PR 0 below settles the number by building data/flags.json and failing on any name it cannot place). 90 files under src/ read the URL (72 `URLSearchParams`, 20 regex, 9 ambient `location.search`, some in more than one style).

## 1. Inventory

### The four parse styles (plus one data-driven variant)

- **A**: `new URLSearchParams(search).get('name')` on a `search: string` argument. Pure and testable; the majority (72 files). Variant **A-row**: the name and the off value come from a data row (`rows.query`, `rows.off`/`rows.v1`), e.g. skyline.ts:20, kbm.ts:87, pickup.ts:38, radar.ts:49. Each module re-implements `!== v1` / `=== off` / `=== on`.
- **B**: regex on the raw string, `/[?&]name=v1\b/.test(search)`: hero-reach.ts:14, auto-start.ts:8, quality.ts:28-29, standoff.ts:11, camera.ts:16, input.ts:59,74, scene.ts:330, feedback.ts:50, main.ts:162,202-221,724-725, replay.ts:71, signature.ts:85, special-look.ts:48, stance-panel.ts:11,38, tap-log.ts:12, gfx-flag.ts:3, power-words.ts:16, creature.ts:12. Variant **B-row**: `new RegExp(`[?&]${query}=...`)` built from a row: zone/ground.ts:20,23. Differences between the regexes that a parser would silently unify: separator class is `[?&]` in most, `[?&;]` in input.ts/gfx-flag.ts/tap-log.ts, `look=foe(?:&|$)` vs `\b`; case-insensitive in one (power-words.ts:16) and sensitive in the rest; and `\b` accepts `heavy=v1-foo` where style A's exact `=== 'v1'` rejects it.
- **C**: a comma-list value split and tested with `.includes`: `?look=` (upright-ready.ts:14, kick-close.ts:6, defence-grade.ts:16, miasma-mark.ts:9, victory-headline.ts:7, spell-school.ts:14, stance-pose.ts:9, fatigue-preview.ts:10-11, breath.ts:12), `?feel=` (feel.ts:33, feel-defaults.ts:18, knock-sim.ts:39, feel-limbs.ts:29, armfeel.ts:17, ragdoll.ts:110), `?off=` (off-flag.ts:2, used by fatigue-read.ts:14, rank-look.ts:146, scene.ts:591). Trim/lowercase rules differ per module (feel.ts trims, spell-school does not, camera-pitch lowercases).
- **D**: ambient read of the global `location.search`, behind `typeof location === 'undefined'` guards, at module load or at call time: late-art.ts:7, input.ts:59,74,370-371, camera.ts:13-16, scene.ts:52-53,127,173,214-218,330,340,372-375,407-413,586-591,662,934, characters.ts:689, feel-hitreact.ts:120 (call time), main.ts:106 (the one boot read: `const search = location.search`) and main.ts:684 (call time, per frame).

Flags that are also parsed twice in different styles: `look` (A+C+B: camera.ts:16, power-words.ts:16, creature.ts:12), `special` (A in 3 files, B in special-look.ts:48), `feel` (C in 6 modules), `ai` (A in brain.ts:15 and spawn-kind.ts:54), `pitborn` (A in foe-pick.ts:10,13 and boss-order.ts), `gfx` (B in quality.ts:28-29 and gfx-flag.ts:3, two different meanings: `phone|full` vs `0|1`).

### Hot paths: re-parsed every frame (exact sites)

- **src/client/main.ts:679**, inside `frame()` (main.ts:592): `cameraZoom(FIGHT.camera.zoom, search)` runs `new URLSearchParams(search).get('zoom')` (camera-zoom.ts:9) on EVERY frame of a multi-attacker zone fight (`if (multi)` block, :678). The same value is already computed once at boot (main.ts:240, `view.setZoom(cameraZoom(...))`).
- **src/client/main.ts:684**, inside `frame()`: `if (roam && bossLoadAfterKill(location.search)) bossKilled = true;` runs `new URLSearchParams(...).get('bossload')` (zone/spawns.ts:81) every frame while in the open world (`roam`), even after `bossKilled` is already true, and reads the ambient `location` (style D) rather than the boot `search`.
- Per EVENT, not per frame (cheap but the same smell): feel-hitreact.ts:120/123 `swayRevert()` parses on every blow via `blowClass`; ragdoll.ts:590 `cueShown` parses per cue-set build; rules-eval.ts:28,35 per rules lookup.
- Everything else is boot/scene-creation time (scene.ts builds run per scene, main.ts:106 once).

### Flag table

Columns: **Parse** = style (A, A-row, B, B-row, C, D); **Default** = what a bare URL does (`on` = shipped on, `off` = opt-in); **Tests** = number of test files that mention `?name=` (heuristic grep over test/, so a flag exercised only through a data-row helper may read 0); **Dead** = nothing reads it. Hot sites are in the section above, none of the rest are per-frame.

| flag | file(s) | parse | default | tests | dead |
|---|---|---|---|---|---|
| ai | brain.ts:15, fight/spawn-kind.ts:54 | A (x2) | on (`=v1` reverts) | 2 | |
| aggro | zone/attackers.ts:19 (respawn.json attackers) | A-row | on | 1 | |
| blend | client/main.ts:221 | B | on (`=v1`) | 1 | |
| boss | fight/foe-body.ts:29 (profiles.json bodyQuery) | A-row | row | 2 | |
| bossload | zone/spawns.ts:81 (respawn.json world.loadQuery) | A-row, called via D | on | 1 | |
| bossweapon | fight/boss-weapon.ts:72,79 (boss-weapons.json) | A-row | on | 4 | |
| cam | client/main.ts:202,204 | B | on (`=v1`) | 3 | |
| clash | feel-defaults.json revert -> feel-defaults.ts:21 | A-row + C | on | 1 | |
| clips | hero-reach.ts:14 | B | on (`=v1`) | 2 | |
| cues | fight/ragdoll.ts:590 (physics.json cut.cue) | A-row | off (hidden) | 1 | |
| difficulty | difficulty.ts:18 | A | row | 2 | |
| dip | client/main.ts:212 | B | on (`=v1`) | 1 | |
| dpr | fight/quality.ts:41,44 (withoutDpr strips it from the address) | A | auto | 0 | |
| feel | armfeel.ts:17, feel.ts:33, feel-defaults.ts:18, knock-sim.ts:39, feel-limbs.ts:29, feel-clash.ts:35, ragdoll.ts:110 | A+C | defaults list | 9 | |
| finishercam | fight/finisher-cam.ts:15 | A | off (`=v1` is the ON value, inverted) | 1 | |
| foefade | fight/foefade.ts:19 (stage.json) | A-row | on | 1 | |
| foeweapon | fight/foe-weapon.ts:14 | A | on | 1 | |
| freecam | fight/free-camera.ts:38 (respawn.json) | A-row | on | 3 | |
| fx | fight/hero-special-fx.ts:27 | A | on | 1 | |
| gfx | fight/quality.ts:28-29 (`phone`/`full`), fight/gfx-flag.ts:3 (`0`/`1`) | B (x2) | auto | 2 | |
| gore | fight/ragdoll.ts:91 | A | on | 1 | |
| ground | zone/ground.ts:20 (zone-ground.json) | B-row | on | 1 | |
| guard | client/main.ts:206 | B | on (`=v1`) | 0 | |
| heavy | fight/input.ts:74 | B+D | on (`=v1`) | 1 | |
| herodeath | fight/hero-death.ts:35 | A-row | on | 1 | |
| hitreact | feel-defaults.json revert | A-row + C | on | 2 | |
| input | fight/hand-over-input.ts:11 (respawn.json), input.json | A-row | on | 3 | |
| kick | feel-defaults.json revert | A-row + C | on | 1 | |
| lay | fight/touch-layout.ts:16 | A | row | 0 | |
| leash | zone/walk-back.ts:22 (respawn.json) | A-row | on | 1 | |
| limbs | feel-defaults.json revert | A-row + C | on | 1 | |
| load | fight/scene.ts:330 | B+D | on (`=v1`) | 0 | |
| lock | fight/lock-break.ts:37 | A-row | on | 2 | |
| lockswitch | fight/lock-switch.ts:26 | A-row | on | 1 | |
| look | camera.ts:16 (B+D); C in upright-ready, kick-close, defence-grade, miasma-mark, victory-headline, spell-school, stance-pose, fatigue-preview, breath; power-words.ts:16, creature.ts:12 (B); look-drag.ts:35 (A-row, respawn.json look) | A+B+C+D | per value (see below) | 2 | `powerwords`, `headline` values |
| lookbake | fight/rank-look.ts:146 | A+C | on | 0 | |
| mana | fight/hero-mana.ts:14 | A | on | 1 | |
| off | off-flag.ts:2 (+ fatigue-read.ts:14, rank-look.ts:146, scene.ts:591, armfeel.ts, signature.ts, stance-panel.ts, armfeel-sound.ts, commentator.ts, share-clip.ts) | C | n/a | 0 | |
| onebutton | fight/input.ts:59 | B+D | off | 0 | |
| opener | zone/spawns.ts:168 (respawn.json) | A-row | on | 1 | |
| opponent | fight/sparring-specials.ts:42-55 | A | n/a | 0 | |
| order | fight/foe-pick.ts:13 (fight.json order) | A-row | on | 8 | |
| physics | fight/ragdoll.ts:111 (physics.json) | A-row | on | 7 | |
| pickup | fight/pickup.ts:38 | A-row | on | 1 | |
| pitborn | fight/foe-pick.ts:10, boss-order.ts:10 | A (x2) | on (`=v1`) | 13 | |
| pitch | fight/camera-pitch.ts:18,31 (fight.json) | A-row | on | 2 | |
| postkill | fight/zone-loop.ts:39 (respawn.json flag) | A-row | on | 12 | |
| presence | presence/chunk.ts:26, client/main.ts:725 (B, `presence=`) | A-row + B | off | 4 | |
| radar | fight/radar.ts:49 | A-row | on | 2 | |
| ragdoll | fight/ragdoll.ts:81 (physics.json finisher) | A-row | row | 3 | |
| ranklook | fight/rank-look.ts:52 | A | row | 0 | |
| reach | hero-reach.ts:18, fight/foe-reach.ts:15 (fight.json, hero-clips.json) | A-row (x2) | row | 5 | |
| replay | fight/replay.ts:71 | B | n/a | 0 | |
| ring | client/main.ts:162, fight/special-fx-boss.ts | B | on (`=v1`) | 2 | |
| rules | fight/rules-eval.ts:28,35 (rules.json default m4) | A-row | `default` row = m4 | 7 | |
| sand | zone/ground.ts:23 | B-row | on | 1 | |
| save | progression.ts:43 (progression.json) | A-row | row | 2 | |
| shapes | fight/weapon-shapes.ts:54 | A | on | 1 | |
| sharedhp | zone/shared-hp-chunk.ts:13, client/main.ts:724 | A-row + B | off | 1 | |
| signature | fight/signature.ts:85 | B | n/a | 0 | |
| skill | fight/sparring-specials.ts | A | n/a | ? | |
| skull | fight/special-pace.ts:15 | A | on | 1 | |
| sky | fight/skyline.ts:20 (stage.json) | A-row | on | 4 | |
| skyanim | fight/skyanim.ts:21 | A-row | on | 1 | |
| skyflat | fight/skyplate.ts:17 | A-row | off | 1 | |
| skyfold | fight/skyfold.ts:21 | A-row | row | 1 | |
| skyfollow | fight/skyline.ts:31 | A-row | on | 2 | |
| skyplate | fight/skyplate.ts:13 | A-row | on | 5 | |
| skyring | fight/skyring.ts:18 | A-row | on | 1 | |
| skyview | fight/skyview.ts:19 | A-row | row | 3 | |
| snd | client/main.ts (`get('snd')`) | A | off | 0 | |
| sound | fight/sound/feedback.ts:50 (`sound=0`) | B+D | on | 0 | |
| spar | fight/sparring-specials.ts | A | n/a | ? | |
| spec | fight/special-terms.ts:15 | A | on | 2 | |
| special | special-look.ts:48 (B), sparring-specials.ts:42-47 (A), foe-special-reach.ts:16 (A), scene.ts | A+B | on (`=v1`) | 1 | |
| spell, spellskill | fight/boss-telegraph.ts:21 | A | off | 0 | |
| stamina | fight/fatigue-preview.ts:12-13 (needs `look=fatigue-preview`) | A | off | 0 | |
| stance | fight/stance-pose.ts (needs `look=stances`) | A | off | 0 | |
| stances | fight/stance-panel.ts:11,38 | B | off | 0 | **dead candidate**: stance-panel.ts has zero importers in src/ and test/ |
| standoff | fight/standoff.ts:11 | B | on (`=0`/`off`) | 0 | |
| start | auto-start.ts:8 (`start=v1`) | B | on | 1 | |
| sway | feel-hitreact.ts:120 (feel-hitreact.json) | A-row via D, per blow | on | 2 | |
| taplog | fight/tap-log.ts:12 (input.ts:370 reads `location.search`) | B+D | off | 0 | |
| telegraph | fight/boss-telegraph.ts:14 | B | off | 0 | |
| telemetry | telemetry.ts:20 (telemetry.json off) | A-row | on | 1 | |
| tier | core/grades.ts:23,33 (withoutTier strips it) | A | auto | 0 | |
| trail | client/main.ts:208 | B | on (`=v1`) | 3 | |
| tune | tune.ts:29 (tune.json) | A-row | row | 5 | |
| weapon | progression.ts:113 (weaponQuery), parts-panel.ts, world-record.ts | A-row | row | 1 | |
| wide | fight/camera-zoom.ts:23 | A | row | 1 | |
| yourSpecial | fight/sparring-specials.ts:41,50 | A | n/a | ? | |
| zone | zone/zone-rows.ts:51 | A | row | 1 | |
| zoom | fight/camera-zoom.ts:9 | A, HOT at main.ts:679 | row | 2 | |

`?look=` values, per module (all C): `slouch`, `stances`, `kickclose`, `defence`, `marks`, `headline`, `schools`/`schools-off`, `fatigue-preview`, `powerwords`, `creatures`, `foe`. `?feel=` values: `hitreact`, `limbs`, `kick`, `clash`, `hero`, `foe`, `v1`. `?off=` values: `fatigue-read`, `lookbake`, plus the names in armfeel, signature, stance-panel, armfeel-sound, commentator, share-clip.

**Dead, with evidence** (zero importers in src/ and none in test/, only comments mention them): `?stances=` (stance-panel.ts), `?look=powerwords` (power-words.ts:16 `powerWordsLook`, no caller), `?look=headline` (victory-headline.ts:7 `headlineFlag`, no caller). Not removed: Dom's ruling keeps them; they become `owner: dead` rows in data/flags.json so the next audit sees them. Not dead despite looking so: `kill`, `head`, `neck`, `portrait` are `Set.has` on ids, not URL flags (arena.ts:96, catalogue.ts:126, kbm.ts:76).

**The `?x=v1` family**: 13 data rows with `"off": "v1"` and 11 with `"v1": "v1"` plus 5 `"off": "off"`, and the literal ones in code (ai, spec, skull, mana, fx, gore, foeweapon, pitborn, finishercam, cam, guard, trail, dip, blend, ring, load, clips, heavy, start, special, physics via row). Inverted semantics exist: `finishercam=v1` turns something ON; `?feel=v1` turns the default list off; `?rules=v1`, `?physics=v1` revert. The data file must carry per flag which value means "revert" and which means "on".

## 2. Design

### data/flags.json (the single source of truth)

One row per flag, validated by the as-data gate (add a `'flags'` entry to the `validateFile` key table in src/sim/validate.js, like `'feel-defaults'`, and register it in scripts/as-data):

```
{ "name": "zoom", "type": "number", "default": null, "range": [0.5, 2], "owner": "camera-zoom.ts", "hot": false, "note": "..." }
{ "name": "sky",  "type": "enum",   "values": ["v1"], "default": "on", "owner": "stage.json", "revert": "v1" }
{ "name": "look", "type": "list",   "values": ["slouch","stances",...], "owner": "look-*" }
{ "name": "stances", "type": "enum", "values": ["aggressive","defensive","trickster","neutral"], "owner": "dead" }
```
Types: `enum` (closed value set, unknown value = default), `bool`, `number` (range, unusable = default, matching today's "ignored, not clamped"), `list` (comma values), `string` (free: replay id, zone id, tune). Gate rules: unique names, every `owner` file exists, `values` non-empty for enum/list, default is in values, and a `query` row in any other data file must name a flag that exists here (that fold-in check is the point).

### src/flags.ts

- `parseFlags(search: string, rows: FlagRow[] = FLAGS): Flags` pure, no globals, no DOM, never throws on a bad string (today `try { ... } catch` exists only in telemetry.ts:20): returns a deep-frozen `{ get(name): string | undefined, is(name, value): boolean, list(name): readonly string[], num(name): number | undefined }` backed by one `URLSearchParams` pass. Unknown names are not errors (links in the wild carry other params: utm, `?fbclid`); unknown VALUES of a known flag resolve to the row default exactly as each module does today.
- `flags` = `Object.freeze(parseFlags(typeof location === 'undefined' ? '' : location.search))` created once at module load. Node tests and Gate 0's tree get `''`, same as today's `typeof location` guards.
- Accessors keep today's function signatures so call sites change by one line: the existing exported helpers (`cameraZoom(row, search)`, `bossLoadAfterKill(search)`, `skylineOn(search, row)` and the rest) keep taking `search: string` and internally call `parseFlags(search)` through a tiny memo keyed by the string (a `Map<string, Flags>`, size 1 to 4), so every existing unit test that passes a literal `'?sky=v1'` still works unchanged and the real page pays one parse. This is what makes the migration behaviour-preserving: the public function shapes do not move, only the body.
- Compatibility accessors to preserve each style's exact semantics: `flags.re(name, value)` replicates the regex's `\b` quirk only where a test pins it (see risk 1); the default is to normalise to `get(name) === value` and the differential test lists any URL where the two disagree so Dom/Strategy rules on it.

### Per-frame readers

main.ts:679 and :684 switch to values captured once: `const ZOOM = cameraZoom(FIGHT.camera.zoom, search)` at boot (main.ts:240 already computes it; reuse that constant) and `const BOSS_LOAD_AFTER_KILL = bossLoadAfterKill(search)` computed once next to `const search = location.search` (main.ts:106), using the boot string rather than the ambient `location` (the page's search does not change at runtime except `withoutTier`/`withoutDpr` address cleanup, which happens after module load by design, see quality.ts:38; the boot read is the one that already matters). The per-event ones (feel-hitreact.ts:120, ragdoll.ts:590, rules-eval.ts:28,35) read `flags` once at module or build time. Add a lint-style check (a test, not a new tool) that no function whose name matches `frame|tick|update|render|step` calls `parseFlags` or `new URLSearchParams` in src/.

### How scattered `query` rows fold in

The `query`/`off`/`v1`/`value` fields in data/*.json (about 52 rows: boss-weapons, feel-*, fight, hero-clips, hero-death, input, physics, pickup, presence, profiles, progression, radar, respawn, rules, stage, telemetry, tune, zone-client, zone-ground) STAY where they are and keep their meaning: each module still reads `rows.query` and `rows.off` from its own file. The only change is that the module calls `flags.get(rows.query)` instead of `new URLSearchParams(search).get(rows.query)`, and data/flags.json carries a row of the same name that the gate cross-checks (row `query` exists in flags.json; the flag's `revert`/`on` value equals the module row's `off`/`v1`). No semantics move; the gate only proves the two files agree. A later, separate decision (not in this plan) could generate the module rows from flags.json.

## 3. Migration order (small, behaviour-preserving PRs)

Every PR carries the same **differential test** (`test/flags-diff.test.mjs`): a table of about 60 URLs (bare; each flag with its on value, its `v1`/revert value, an unknown value `=zzz`, an empty `=`, a repeated key `?sky=v1&sky=on`, mixed case `?SKY=V1`, comma lists with spaces `?feel=kick, clash`, `?look=` with each value, `?off=a,b`, the `?x=v1` family as one big URL, a 4 KB junk query, a malformed `%` escape, `?feel=v1,clash`, `?rules=m4b`, the `?tier=`/`?dpr=` strip cases) is fed to BOTH the old reader (kept as `legacy-flags.mjs` in test/, frozen copies of today's functions) and the new one; the assertion is equal effective config for each URL. The legacy copy is deleted in the last PR.

0. **PR 0, docs only** (this file) plus data/flags.json rows with owner and the gate check; no src change. Settles the real flag count.
1. **src/flags.ts + data/flags.json + gate + the differential harness + the hot-path check**, nothing wired. Test: `parseFlags` against the URL table.
2. **Hot paths first** (main.ts:679, :684, plus feel-hitreact.ts:120): the only PR that touches main.ts's frame loop, tiny. Test: same URLs, plus a call-count test that `frame()`'s bodies make zero `URLSearchParams` constructions (spy on the constructor).
3. **Style A pure modules, in batches of about 8 files by directory** (src/fight/sky*.ts, then camera/lock/free, then zone/, then core/, tune, difficulty, progression, telemetry). Body-only change to call `parseFlags(search)`; signatures unchanged. Tests are the existing per-module tests plus the diff rows for those flags.
4. **Style C list flags** (`look`, `feel`, `off`): one shared `flags.list()` with ONE trim/lowercase rule. Behaviour differences between modules are real (see style C) so the diff table pins each module's current answer first; if two modules disagree for a URL, the PR keeps the more permissive one and names the URL in the PR body for a ruling.
5. **Style B regex flags** (hero-reach, auto-start, quality, standoff, input, camera, feedback, main.ts 162-221 and 724-725, replay, signature, special-look, stance-panel, tap-log, gfx-flag, power-words, creature, ground/sand B-row). The riskiest: the `\b` / `[?&;]` / case differences. Each regex becomes `flags.is(name, value)`; the diff table includes `?heavy=v1-foo`, `?look=foe,x`, `?onebutton=1;a=b`, `?SOUND=0`.
6. **Style D ambient reads** (late-art.ts:7, input.ts:59,74,370, camera.ts:13-16, scene.ts, characters.ts:689): replace `typeof location === 'undefined' ? '' : location.search` with `flags` (module constant). scene.ts is serialised after audit C.
7. **Delete the legacy copies and the now-unused `offFlag`/regex helpers; add the lint test** that bans `new URLSearchParams` and `location.search` in src/ outside src/flags.ts.

**Order against #289 and #298**: nothing starts until both merge (main.ts, scene.ts, duel.ts are theirs). PR 0, PR 1 and the pure Style A batches that touch NO file in those three (zone/, core/, the sky*.ts modules, tune.ts, difficulty.ts, progression.ts, telemetry.ts) could start earlier without conflict, but Dom's rule is code after both merge, so the whole list waits. Rebase order after: 1, 3 (A batches), 4, 5, then 2 and 6 (the ones that touch main.ts and scene.ts) last, each rebased onto the latest main.

## 4. Risks

1. **Regex vs URLSearchParams differ**: `[?&]heavy=v1\b` matches `?heavy=v1-x` and a bare `?heavy=v1` inside a hash (`#...&heavy=v1` if `search` is built by hand); `URLSearchParams.get` decodes `%20` and `+`, the regex does not. The differential table has these rows; any URL where old and new differ is listed and ruled, never silently changed.
2. **Flags read before DOM ready**: module-load constants (input.ts:59,74, camera.ts:13-16, late-art.ts:7, scene.ts:52-53, quality.ts at module load) run before main.ts. `flags` must be a self-contained module with no imports of DOM or three so import order cannot change a value. quality.ts:38 documents that `?dpr=` is read at module load BEFORE main.ts strips it from the address: `flags` is created at that same moment, and `withoutDpr`/`withoutTier` keep operating on the string and rewriting the address afterwards, so a boot-time `flags` never sees the stripped URL. Pinned by a test.
3. **Stills scripts and tests that set search strings**: scripts/*.mjs and stills/ (opener has 8 script hits, postkill 3, feel 9, physics 2) pass `?flag=` through page URLs, so the browser gets the same string; node tests call the exported helpers with literal strings (kept working by the string-keyed memo). Risk: a test that mutates `globalThis.location` after `flags` froze would see stale values. Fix: such tests call the `search`-taking helpers (the existing pattern); the plan adds `__resetFlagsForTest()` ONLY to the test-only export, not to the game build.
4. **Share links and telemetry include the query**: telemetry.ts:20 reads `?telemetry=off` from `env.search` (injected, keep it injected: it must not read the frozen global, the test pins each off switch with literal search strings); share-clip.ts and withoutTier/withoutDpr read or rewrite the address. `flags` is read-only, no module may write back to `location` through it; the address rewrite stays where it is.
5. **SSR / Node tests with no `location`**: `flags` falls back to `''` exactly like today's `typeof location === 'undefined'` guards; Gate 0's tree (src/ alone, no main.ts, see feel-defaults.ts header) must still import clean: flags.ts has no imports. Keep `parseFlags` free of `window`/`document`.
6. **Unknown or repeated keys**: today `get` returns the FIRST of a repeated key; sparring-specials.ts uses `getAll` and rejects repeats (line 45, 51). `parseFlags` must keep first-wins for `get` and expose `getAll` for that module, or the sparring refusal logic changes.
7. **Count mismatch with the audit (84 vs 91)** could hide a flag in the migration; the gate (every flag row has an owner file and every `query` row maps to a flag) is the net.

## 5. NOT touched

- No flag is removed, renamed, or given a new default; no new flag is added; `?x=v1` toggles and every `?look=`/`?feel=`/`?off=` value keep today's meaning, including the inverted ones (`finishercam=v1`).
- data/*.json `query`/`off`/`v1` rows stay in their files (only cross-checked).
- No change to the sim (src/sim, duel.ts logic), Gate 0 inputs, record digests, presentation behaviour, telemetry's injected `env.search`, or the address rewrite (`withoutTier`, `withoutDpr`).
- No SSR work, no router, no `history`/`pushState` handling, no new URL param for share links.
- main.ts, scene.ts, duel.ts are not edited until #289 and #298 merge.
- Dead flags (`?stances=`, `?look=powerwords`, `?look=headline`) are listed, not deleted; removal is Dom's call after alpha.
