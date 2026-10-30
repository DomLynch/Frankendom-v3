# Pit Crawl (minimal): stage 0 contract

Docs only. Read from main 9d444c1 (#222 save, #240 corpse run, #238 rings merged). One zone, one timer, one exit, one bank. No new URL flag, no new art, no sound.

## The run

3:00 in one compact pad. Goblin and rat packs keep coming. Collect coins, one or two rare parts, a golden weapon. Reach the exit portal: loot is banked. Die or run out of time: the unbanked loot drops as the corpse-run pile (#240) where you fell.

States, one module (`src/pit-crawl.ts`, pure rules like `src/corpse-run.ts`): `idle -> running -> banked | died | timeout -> idle`. The page calls `startRun`, `stepRun(dt, hero)`, `onMobKilled`, `onGoldenPickup`, `onPartPickup`, `exitRun`, `failRun`. The tests and stills call the same functions.

## What is loot, and what "unbanked" means

Loot is whatever the hero CARRIES. #240 already has this idea: coins are carried (`Save.coins`) until banked (`Save.banked`), and a death drops everything carried as ONE pile. The crawl extends that, it adds no second system.

| Loot | Carried field (save) | Banked field (save) | Source |
|---|---|---|---|
| coins | `coins` (exists) | `banked` (exists) | mob kills, coin pickups |
| golden weapon | `carry.golden: {tier, weapon, charges}[]` | `golden: same[]` | golden-drop agent (b) |
| rare parts | `carry.parts: string[]` (part ids) | the parts agent's inventory (c) | pit rolls, pickups |

- Unbanked = in `coins` or `carry`. Banked = `banked`, `golden`, the parts inventory. A death or timeout moves every carried item into `Save.pile` (`Pile` gains optional `parts` and `golden`, default empty, so old piles and old code are unchanged; `Pile.v` stays 1 because a missing field cleans to empty). Retrieval, the one-pile replacement rule (the older pile is lost) and the lingering boss are #240 as it is.
- Banking: `bank()` in `src/corpse-run.ts` gains one branch: it also moves `carry` into banked/inventory. The camp (5 m) still banks, the exit portal calls the same function. A pile left on the pad is retrieved on a later run (it costs timer to reach it).
- Carried coins from the world are carried too: dying in the pit drops them. That is the extraction risk and it is #240's existing rule, not new.
- Save: `carry` and `golden` are optional fields cleaned in `parseSave` through `cleanCorpse` (same pattern as `pile`), caps from the data row. The run record itself is not saved: a reload mid-run ends the run, the carried loot stays carried (it is the hero's). No dupe path, no loss path beyond #240's.
- `?save=off` and no storage: the crawl entry is not shown (nothing could bank). Same gate as the corpse run (`ZONE && PROG`).

## Contract with the other agents (names to agree; none of their PRs is on GitHub yet at 2026-10-28, so these are proposals to confirm)

Events go on the existing feel bus (`corpse:cut` is already there). One payload each, plain objects, emitted on the event only, never per frame.

| Event | Payload | Emitter | Listener |
|---|---|---|---|
| `mob:killed` | `{ areaId, kind, x, z, pack }` | trash-mob agent (a) `onMobKilled` | crawl: coins, golden roll, kill count |
| `golden:pickup` | `{ tier, weapon, charges }` | golden agent (b) `onPickup` | crawl: `carry.golden.push` (cap) |
| `part:pickup` | `{ id }` | crawl (pit part pickup) | parts agent (c), only if it wants a toast |
| `crawl:start` | `{ run, seed }` | crawl | telemetry |
| `crawl:result` | `{ outcome: 'banked'\|'died'\|'timeout', seconds, kills, coins, parts, golden, lostPile }` | crawl | share-clip hook, telemetry. Crawl does NOT build the clip |

Functions the crawl calls: `spawnPack(areaId, kind, count)` (a), `dropGolden(position, tier)` (b), `addPart(save, id)` (c, pure like `earn`). If one lands with another signature, only those lines in `stepRun` change. Ask (a) and (b) to export an `areaId`-scoped `clearArea(areaId)`: a run ends by clearing its mobs and drops in one call.

## Where the zone lives

A dedicated seeded pad, not a ring biome: rings are bands around the pit and carry bosses; the crawl wants a closed arena with one way in and one out. Row: `zone.angleDeg 160`, `zone.distance 210` from the pit centre (outside ring 3, which ends at 150), `zone.radius 28`. At 210 m nothing else loads (ring bosses near-load at 40 m), so the pad costs nothing until entered. It uses the existing ground, sky and ring-3 look; if #241 (terrain from a seed) merges first, one pad row `{x, z, flat: 30}` keeps it level, else the ground is already flat. No new mesh: the edge is the mobs' leash plus a gentle push-back at `radius + 2` (the existing play-radius rule, `src/fight/play-radius.ts`), so no wall art.

Entry is the pad's edge at `entryAngleDeg`; the exit portal is placed by rule: angle = entry angle + 180 deg + a seeded jitter (+/- `exit.jitterDeg`), distance `exit.frac * radius` from the centre. Seed = hash of the run counter, so a run is reproducible in tests and the portal is never beside the entry.

## Entry, timer, exit, result

- **Entry.** V3 has no burger menu (#255 builds one). Smallest real entry: a "Pit Crawl" button beside the existing reset button, shown only when the hero is alive, not engaged and within `bank.radiusMetres` of camp. When #255's panel exists, add a row there (one line). Tap: carried loot stays, the hero is placed at the pad entry through the existing `rematch(pose)` hand-over path at full health, `startRun`.
- **Timer HUD.** One DOM element mounted like `mountCorpseHud` (`src/fight/corpse-hud.ts`): `2:41` top centre and a one-line loot counter (coins, parts, golden). Its z-index sits below the corpse HUD's 29. The exit shows as the corpse marker's ring and beam (same function, colour from the crawl row) and a radar blip class `exit` in `data/radar.json`. The portal is that marker plus an `exit.reachMetres` touch zone: no art.
- **Exit and bank.** Within `exit.reachMetres` and alive: `bank()`, `clearArea`, hero back at camp, result card. The exit opens at `exit.openAtSeconds` (60 s), so the first minute is all risk; the marker pulses when open.
- **Timeout.** At 0:00 the run collapses like a death where he stands (`failRun('timeout')`): the pile drops, he wakes at camp. Decision 1 below.
- **Death.** The existing hero-death loop runs; `onHeroDied` already calls `dropPile`. The crawl only ends the run (`clearArea`) and tags the result `died`. He respawns at camp.
- **Result card.** One plain DOM card (no pop-up animation): outcome, time, kills, banked or lost list, one Back button. `crawl:result` is emitted when the run ends (not when the card closes), the only hook the share clip needs.

## Data rows: `data/pit-crawl.json` (proposed, validated like `corpse-run.json`)

```json
{
  "about": "Pit Crawl (Dom 2026-10-28): a 3-minute run on a seeded pad; loot is carried until the exit banks it, a death or the clock drops it as the corpse-run pile.",
  "version": 1,
  "run": { "seconds": 180, "areaId": "pit-crawl", "line": { "start": "Pit Crawl", "banked": "Banked", "died": "You fell", "timeout": "Time" } },
  "zone": { "angleDeg": 160, "distance": 210, "radius": 28, "entryAngleDeg": 340, "pushBackMetres": 2 },
  "exit": { "openAtSeconds": 60, "frac": 0.8, "jitterDeg": 25, "reachMetres": 2.5 },
  "packs": { "perMinute": [3, 4, 5], "size": [4, 6], "kinds": [ { "kind": "goblin", "weight": 3 }, { "kind": "rat", "weight": 2 } ], "aliveMax": 24, "spawnRingFrac": 0.9, "minFromHeroMetres": 10 },
  "drops": { "coinsPerKill": { "goblin": 2, "rat": 1 }, "goldenChance": [ { "afterKills": 12, "tier": 1, "chance": 0.5 }, { "afterKills": 30, "tier": 2, "chance": 0.35 } ], "parts": [ { "id": "goblin-arm", "weight": 3 }, { "id": "rat-head", "weight": 1 } ], "partsChancePerPack": 0.2 },
  "caps": { "coins": 500, "parts": 3, "golden": 2, "goldenBanked": 20, "dropsOnGroundMax": 12 },
  "perf": { "frameMsMax": 0.15, "mobsAliveMax": 24 },
  "limits": { "seconds": [30, 600], "radius": [10, 60], "distance": [160, 400], "angleDeg": [0, 360], "perMinute": [0, 12], "size": [1, 12], "aliveMax": [1, 32], "chance": [0, 1], "coins": [0, 99999], "parts": [0, 20], "golden": [0, 10], "reachMetres": [0.5, 8], "jitterDeg": [0, 90], "frac": [0.3, 0.95] }
}
```

Validation: `src/pit-crawl.ts validatePitCrawl(rows, mobKinds, partIds)` is called at load like `validateCorpseRun`. Ranges come from `limits`; a pack `kind` must exist in the mob agent's table; a part id must be a parts-inventory id; `packs.size[0] <= size[1]`; `perMinute` has `ceil(seconds/60)` entries; `caps.golden <= caps.goldenBanked`; the pad's `distance - radius` is beyond ring 3's `maxDist` (read from `data/rings.json`); `exit.reachMetres < radius`. `src/sim/validate.js` gets a `'pit-crawl'` shape entry (keys and maps) beside `'corpse-run'`. Nothing is hard-coded in the module.

## Perf budget (375 phone first)

- Mobs: alive cap `aliveMax` 24 (a pack waits when full, never exceeds it). Mobs are the trash agent's pooled actors: the crawl calls `spawnPack`, never constructs one. Drops on the ground capped at 12 (the oldest despawns).
- The crawl's own per-frame work: one time step, one distance check to the exit, one per ground drop (<= 12), HUD text written only when the displayed second or a count changes. No object, array or string is created per frame: state is one preallocated record, drops a fixed array of 12 slots, the portal angle computed at start. Budget row `perf.frameMsMax 0.15`, measured with the existing perf harness shape (`scripts/perf-open-world.mjs`), receipt in the stage 1 PR.
- Zero cost when idle: no listener work and no DOM node until the first run. Mob and golden art load on entry, after first frame; first-visit bytes are unchanged.

## Stage 1 plan (not before the mob and golden PRs are merged or stable drafts)

1. `data/pit-crawl.json`, `src/pit-crawl.ts` (rules + `validatePitCrawl`), `src/fight/pit-crawl-hud.ts` (timer, counter, result card), `validate.js` entry.
2. `src/corpse-run.ts` and `src/progression.ts`: `carry`, `golden`, `Pile.parts/golden` cleaned and saved; `bank` and `dropPile` extended. Fail-first tests; a save without the fields is byte for byte today's.
3. `src/client/main.ts`: a handful of lines (mount, button, `stepRun` beside `corpseStep`, `failRun` inside `onHeroDied`). Nothing else.
4. Tests through real input on the built dist: tap to enter, a pack arrives, kill a mob (coin carried), walk to the exit (banked in the save), die (pile at the spot, carried gone), clock runs out, reload mid-run, `?save=off` shows no button. One Chromium run at a time; suites via `scripts/hf-job.sh`.
5. 375 stills: entry button at camp, timer HUD with a pack on the pad, result card (banked and died). CI: test, zone-sql, built-game boot.

## Decisions for Dom (defaults chosen, change on a word)

1. Timeout = collapse like a death (pile drops). Alternative: he returns to camp keeping the loot carried. Default: collapse; the clock is the pressure.
2. Carried coins from the world are at risk in the crawl. Alternative: bank them at entry. Default: at risk (#240's rule).
3. Entry is a camp button until the parts panel (burger) exists.
