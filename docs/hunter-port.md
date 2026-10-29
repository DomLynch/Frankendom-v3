# Hunter port: Armagedom's heat and marked hunters into V3 (stage 0, design only)

Source read: DomLynch/ARMAGEDOM main (`heat.json`, `heat.js`, `game-data-heat.js`, `marked-hunters.js`, `post-boss-raid.js`, `postBossRaid.json`, `heat-tally-view.js`). V3 read at 8e95e94 plus open PRs #252, #245, #255. Nothing in the game changes in this PR.

## 1. How V3 is shaped for this

V3 has no trash mobs: every kill is a boss, and the game runs ONE duel sim. Standing bosses are frozen copies at fixed spots; the hero walking into a spot's aggro hands the sim to that boss, and up to `maxAttackers` (3) bosses can be on him at once (`src/zone/attackers.ts`, `src/fight/attacker-bout.ts`). So a hunter is a **moving spawn**: a spawn row whose x,z the page updates each frame, which then uses the existing aggro handoff and attacker join. No new fight code.

- **Heat events** (all already fire in `src/client/main.ts`): boss kill `onBossKilled(kind, star)`; star kill (#239, `starById`); ring of the killed boss (#238); kill coins (#240); progression ladder (#222).
- **Where the hunter lives**: a new pure file `src/zone/hunters.ts` (same style as `spawns.ts`: no scene, no clock) holding the heat count, the respawn clock and the hunter spawns. `main.ts` gets about 15 lines: step it, append hunter spawns to `spawns`, draw them through `view.idleFoes` (already takes x,z per spawn). The radar gets one class `hunter` in `data/radar.json` (orange, never mistaken for a camped boss).
- **Spawn rule**: arrive at a bearing behind the hero, `spawnDistanceMetres` away, never inside a camp's aggro or `minSpacing`, with a warning line first. The hunter walks straight at the hero at a speed below his run (he can flee). Beyond `giveUpMetres` it despawns and the clock restarts (Armagedom's "leaving the area").
- **Who the Executioner is**: new profile row `hunter` = archetype `executioner` (Gargantua's, with his maul via the boss-weapons archetype fallback, #246) on the unwired body `big-vegas` (merged, 106 rig, no cut GLB so it dies the plain ragdoll way; no new art). Stars come from `src/stars.ts`, rolled by heat tier instead of kill count. Health and damage ride the same escalation map as every boss (`progression.json` caps), so a hunter is never tougher than the live game. Alternative: re-skin Gargantua with his own body and a gold tell; cheaper to tune, but the first boss stops being unique. Recommend `big-vegas`.

## 2. File map

| Armagedom | V3 | Keep / rewrite / drop |
|---|---|---|
| `data/heat.json` | `data/heat.json`, schema row in `src/sim/validate.js` (closed key set) | Rewrite: keep decay, tiers, maxHeat, off switch; new numbers (below). Drop `world`, `look`, `groupSize`, `valuables.cash`. |
| `engine/heat.js` | `src/zone/hunters.ts` (heat part) | Keep the logic: add, decay one mark per `secondsPerMark`, reset on death, `heatTier`, `heatSeconds`. Rewrite the inputs: events instead of `g.kills`. Drop `heatFromClaim`. |
| `game-data-heat.js` | `validateHeat` beside the schema row | Rewrite in V3's checker style (error strings, ranges in a `limits` block). Keep: tiers ascend, chances sum to at most 1, `maxHeat` reaches the top tier. |
| `marked-hunters.js` | `src/zone/hunters.ts` (spawn, clock, cap) | Rewrite: `markedEntry` path search becomes a bearing-behind-hero rule; death resets the clock like `clearMarkedHunters(death)`. Drop bounty gate, safehouse, area-travel cases. |
| `post-boss-raid.js`, `postBossRaid.json` | `raid` row in `data/heat.json` | Keep the idea only: a boss kill arms a short window that sends extra hunters. In V3 that is `tier.extraHunters` plus a one-time bump after a ring 2 or 3 kill; total cap 2. Drop target zones. |
| star variants (#467) | `src/stars.ts` | Reuse: add a roll by heat tier. Drop `applyStarRow` (V3 stars are scale and tune rows). |
| `heat-tally-view.js` | none | Drop the claw look. Heat shows as plain DOM text in the HUD ("Heat 3" plus pips). |

**Armagedom traps become tests**: no canvas or texture per frame (the tally is DOM, text written only when the count changes; a test counts creations over 300 frames at zero); heat is session-only (a test asserts the save string is byte for byte equal after a heat run); no default-parameter optional-call chains (the PR runs the production-build boot check, #237).

**Retuned numbers (placeholders for Dom to feel, not copied)**: Armagedom gave +1 per trash kill and +3 per boss. V3 has only bosses, so +1 per boss kill, +1 per star, +1 more for ring 2 and 3 bosses; killing a hunter +1. Decay 120 s per mark (fights run 30 to 60 s). Tiers at heat 1 (wait x0.75), 2 (x0.5, +1 hunter), 4 (x0.35, stars: 20 % one star, 5 % two). First hunter after 60 s of free walk at heat 1 or more. Cap 2 hunters at once. Heat resets on hero death.

## 3. What the hunter takes on a win (Armagedom has none)

Proposal, built on the corpse run (#240) and the Frankendom parts save (#255):

- The hero dies to a hunter. The hunter takes **one equipped part**, chosen by a seeded hash (spawn id + death count; no `Math.random`). If nothing is equipped it takes an unequipped part; if he owns none, nothing extra (the pile already holds his carried coins and weapon).
- The part leaves `equipped` and joins the **same single pile** as his coins and weapon, at his death spot. The hunter lingers there for `linger.seconds` (existing rule), then goes home. Walking to the pile returns everything: "Recovered 40 coins and the Wolf arm".
- A second death before retrieval replaces the pile (existing rule). To keep it fair the stolen part is **not destroyed**: it moves to a `stolen` slot in the save and drops from the next hunter killed.
- Heat resets on death, as in Armagedom, so the next hunt starts calm.

**Dom must decide**: (1) equipped only, or either; (2) pile-only recovery, or also drop-on-hunter-kill; (3) can a part ever be lost for good; (4) steal from heat 1, or only from heat 3 (recommend 3: the first hunter just chases); (5) are starter parts exempt.

## 4. PR plan (3 PRs, one off switch `?hunt=off`)

1. **Heat tally, no hunter** (small, about 250 lines). `data/heat.json`, `validateHeat`, step from kill events, DOM text in the HUD, reset on death. Tests: rows validate, +1/star/ring arithmetic, decay by time, reset, save byte-equal, no allocation per frame. Weight: none.
2. **Hunter spawn and chase** (medium, about 450 lines). `hunters.ts` spawn, walk, give-up; `hunter` profile row; radar class; warning line; stars by tier; cap 2. Tests: never spawns inside a camp, walks slower than the hero, cap, deterministic star roll, handoff via `inAggro`, up to 3 attackers, despawn resets the clock. Stills at 375 (warning, approach, radar dot). Perf: at most 2 extra rigs; `big-vegas` is fetched only when the first hunter is due (reuse `withinLoad`), so the 5.5 MB first-visit budget is untouched; run perf rows with 2 hunters plus the held boss.
3. **Steal on win** (medium, about 300 lines). Pile gets a `part` field (`cleanCorpse`, pile `version` bump), a `stolen` slot, the recovery line. Blocked until `parts` and `equipped` are on main. Tests: seeded choice, equipped-first, second death keeps the part in `stolen`, old pile versions ignored.

## 5. Collisions

- **#252 (cut fix)**: touches cut input and `corpse:cut`; hunters never cut. Overlap is `main.ts` only; rebase after it merges.
- **#245 (rings)**: edits `data/rings.json` and `validate-rings.js`. Hunters read ring multipliers by the hero's distance from the pit; the hunter is not added to a ring spawn list. Rebase PR 2 on it.
- **Frankendom parts (#255)**: both change `Save` and `cleanCorpse` in `progression.ts`. PR 3 follows parts stage 1; PRs 1 and 2 do not touch the save.
- **Commentator**: not on main yet. Publish named events (`hunter-warning`, `hunter-arrived`, `hunter-stole`, `heat-tier-up`) on the existing event list so it can speak them; no lines written here.
- **Shared risk**: `main.ts` is 682 lines and every PR touches it; keep logic in `hunters.ts`. `check:as-data` scans `src/zone/` at zero literals, so every number is a `heat.json` row.
