# Boss bodies: the 106 roster, and how a boss gets another body

Dom, 2026-10-27: "later, with the data layer, one or two lines: just switch in a different boss from the Mixamo character directory."
This is the path, what is drop-in today, and what is not. Checked against `main` 3be579d.

## The row

`data/profiles.json` (the opponent profile rows from #85):

```json
"defaultBody": "minotaur",
"bodyQuery": "boss",
"profiles": [ { "id": "pitborn", "opponent": "pitborn", "body": "minotaur", ... } ]
```

- `body` is a key of `data/rig.json` `files` (a 65 body stem, `psyche` or `minotaur` today). A row without one gets `defaultBody`.
- `src/sim/validate.js` `checkBodies` rejects a body that is not a `rig.json files` row, a body whose 106 file has no `rig.json clips106.dir` folder (its specials and finishers would not play), a bad `bodyQuery`, and two profiles drawing one `opponent` in two bodies. `src/fight/foe-body.ts` runs the same check when the page loads and throws on a bad row.
- `?boss=<body>` (the `bodyQuery`) draws every boss in that body for one page view. A bad value is ignored with a console warning. This is a preview flag; the default row is unchanged and pinned by `test/boss-body.test.mjs`.
- Switching the boss is one line: change `"body": "minotaur"` to another `rig.json files` stem on the profile, once that body is in the repo (below).
- A boss cannot be drawn in the hero's body (`src/fight/hero-body-rows.json`, Psyche): the check rejects it.

## What is drop-in today

| body | file | in the repo | 106 rig | clips in the file | `clips106` set (specials, finishers) | cut mesh | physics measure row | drop-in as a boss |
|---|---|---|---|---|---|---|---|---|
| minotaur | `src/assets/minotaur-106.glb` (2.37 MB) | yes | yes (106 joints) | 26 | `106/minotaur/` (8 files) | yes: the file is the cut GLB (19 `piece_`/`cap_` nodes), manifest `minotaur-106.cut.manifest.json` | `physics/bodies/minotaur-106.measure.json` (data/physics.json) | yes, it is the boss today |
| psyche | `src/assets/psyche-106.glb` (1.60 MB) | yes | yes (106 joints) | 32 (lacks `ArmedRun`; `rig.json gapFill` plays Run) | `106/psyche/` (8 files) | no: no cut nodes in the repo file | the package has `psyche-106.measure.json`, but `data/physics.json opponents` has no row for it | no, she is the hero. Tried 2026-10-27 as `?boss=psyche` on a build of this branch (VPS, headless Chromium): the page stops at "The fighters (106-joint rig) could not load" with `Error: A shared rig carries one weapon` (characters.ts `loadWarriors` hands two actors of one file one shared rig, and the hero's longsword and the Pitborn's cleaver differ). The check now rejects a boss in the hero's body, in the row and in `?boss=` |
| every other body | not in the repo | no | the library says 106 joints | Mixamo clips bound raw | none | none | none | no, needs work (below) |

**So no second body is drop-in today.** The repo holds two 106 bodies, one is the hero, so the boss is the other. The row and the check are built and tested (with a synthetic third body in `test/boss-body.test.mjs`); the first real second boss is the work in the next section, and no demo still is shown because there is nothing to show. A hero and a boss on one body would also need `loadWarriors` to load the file twice (as `loadPeerWarriors` does with its `#peer` key), a `characters.ts` change this PR does not make.

### What a boss body has to be to work, today

1. A 106-joint Mixamo GLB under `src/assets/` carrying the 65 rig's clip names (V1's clips, retargeted: OpenTrident's `docs/retarget-106-20261026/`, which produced psyche and minotaur). A body with raw Mixamo clips only plays through `rig.json gapFill` (everything is Idle, Walk, Attack, Hit, Death, Guard); it would stand and shuffle.
2. Its eight baked clip JSONs (special-skullcrack, whirlwind, groundslam, lunge, execution killer and victim, hamstrung killer and victim) retargeted to it, in `src/assets/106/<body>/` (OpenTrident `v3-clips-106/`; each body has its own because the hips height factors differ: 1.03844 for Psyche, 1.02732 for the Minotaur).
3. Rows: `data/rig.json` `files` (`"<stem>": "<stem>-106"`) and `clips106.dir` (`"<stem>-106": "106/<stem>"`).
4. One line in `src/fight/scene.ts` `fighterUrls` for the file. This is the only part that is code and not a row: the bundler needs a literal `new URL('../assets/<stem>-106.glb', import.meta.url)` to put the file in the build with its hashed name. `test/rig-bones.test.mjs` pins the table to the `files` rows. (A generated table would remove it; left alone so this PR does not touch scene.ts.)
5. Optional, for the ragdoll and the cut: the package's `bodies/<body>-106.measure.json` (psyche has one), a `data/physics.json opponents` row for it, and a physics cut GLB with its manifest (`physics-chunk.ts` exports the Minotaur's manifest only). Without them the boss dies the plain way.
6. Optional, for the cleaver's reach: `data/fight.json foeReach` is a bake fitted to the Minotaur's drawn cleaver (`blade-minotaur.ts`). Another body sweeps V1's cleaver table unchanged (`foeSweepsFor` returns null for it). Re-bake with `scripts/foe-body/bake-blades.mjs` if reach matters.
7. Optional, display: `data/fight.json foeName` names every boss "Minotaur".

## The library (OpenTrident `site/data/custom-bodies.json`, 108 bodies, all 106 joints, "additive ok")

None of these is in this repo and none has the V3 clip set or the eight baked clips. The phone GLBs (2 to 5 MB, 5 MB phone cap; `*` = over it with Dom's recorded exception) live on opentrident.org under `models/custom/<id>-full-phone-mixamorig.glb` (the local checkout at `~/Developer/opentrident-steam` holds the list, not the files).

Sizes in MB. Standard: x-bot 2.26, kachujin 2.59, ybot 2.77, pirate 2.73, exo 4.61, aj 1.29, akai-e-espiritu 1.32, arissa 2.30, big-vegas 1.00, claire 1.32, copzombie-l-actisdato 2.70, demon-t-wiezzorek 2.78, dreyar-by-m-aure 2.62, ely-by-k-atienza 2.27, erika-archer 2.93, eve-by-j-gonzales 2.75, ganfaul-m-aure 1.60, girlscout-t-masuyama 3.13, goblin-d-shareyko 2.53, heraklios-by-a-dizon 2.92, kaya 1.33, knight-d-pelegrini 2.00, lola-b-styperek 1.92, maria-j-j-ong 2.52, maria-wprop-j-j-ong 2.53, medea-by-m-arrebola 2.64, nightshade-j-friedrich 2.53, paladin-j-nordstrom 2.08, paladin-wprop-j-nordstrom 2.09, parasite-l-starkie 2.50, passive-marker-man 1.93, peasant-girl 2.03, pumpkinhulk-l-shaw 1.92, skeletonzombie-t-avelange 2.34, sporty-granny 1.40, survivor-a-lusth 2.70, swat 3.94, uriel-a-plotexia 2.65, vampire-a-lusth 2.72, vanguard-by-t-choonyung 2.82, warrok-w-kurniawan 2.21, warzombie-f-pedroso 2.39, whiteclown-n-hallin 1.75, yaku-j-ignite 2.56, brute 4.40, castle-guard-01 1.74, castle-guard-02 1.80, erika-archer-with-bow-arrow 3.52, exo-red 4.52, maw-j-laygo 2.49, mremireh-o-desbiens 2.73, peasant-man 1.53, remy 5.20*, the-boss 1.92, ty 1.63, zombiegirl-w-kurniawan 2.44, prisoner-b-styperek 2.12, mutant 5.67*.

Legends (the `chNN-nonpbr` set): ch01 Iris 2.86, ch02 Atalanta 5.02*, ch03 Anansi 2.33, ch04 Lamia 4.14, ch05 Beowulf 4.35, ch06 Puck 4.51, ch07 Themis 4.88, ch08 Merlin 5.36*, ch09 Tom Thumb 2.37, ch10 Draugr 4.42, ch11 Yuki Onna 4.65, ch12 Sundiata 3.70, ch13 Deirdre 4.70, ch14 Reynard 1.67, ch15 Hector 4.86, ch16 Asclepius 5.77*, ch17 Daedalus 5.64*, ch18 Erebus 3.17, ch19 Kobold 3.62, ch20 Phaethon 3.61, ch21 Penelope 5.55*, **ch22 Psyche 5.34* (the repo's psyche-106, pruned to 1.60 MB)**, ch23 Gawain 4.87, ch24 Jiraiya 2.44, **ch25 Minotaur 3.77 (the repo's minotaur-106, 2.37 MB)**, ch26 Calypso 4.24, ch27 Guinevere 4.98, ch28 Nyx 4.08, ch29 Titania 3.18, ch30 Marsyas 4.11, ch31 Orpheus 3.88, ch32 Prometheus 3.05, ch33 Lancelot 5.33*, ch34 Sprite 3.66, ch35 Fenrir 5.49*, ch36 Galatea 2.51, ch37 Camilla 5.06*, ch38 Achilles 4.78, ch39 Wayland 3.01, ch40 Bastet 5.47*, ch41 Jason 4.64, ch42 Perseus 4.68, ch43 Gargantua 3.45, ch44 Apep 4.69, ch45 Kraken 2.93, ch46 Kaguya 2.16, ch47 Arachne 3.32, ch48 Selene 5.67*, ch49 Roland 4.89, ch50 Scylla 4.66.

The repo's two files are smaller than their library originals (Psyche 5.34 to 1.60 MB, Minotaur 3.77 to 2.37 MB: the V3 builds are packed separately), so expect a new body to need the same packing step. Only a body that is added to the repo costs first-visit weight, and only a page whose boss row names it fetches it.

## First-visit weight

At the default nothing is added: the boss is still `minotaur-106.glb`, `fighterUrls` is unchanged, and no new asset is requested. The PR adds data keys to `profiles.json` and the body check to the bundle (see the PR body for the measured bundle delta and the CDP wire count).

## Per-spawn body (built; no second body ships yet)

A zone spawn row (`data/zones/zone1.row.json spawns[]`) may carry an optional `"body": "<rig.json files stem>"`. Absent (every shipped spawn), the spawn draws its kind's profile body, exactly as before. `validateZone(row, kinds, rig)` checks it with the same `bodyProblem` a profile body gets; the page also refuses the hero's body (`spotBodyProblems`). `?boss=<body>` still wins for the whole page.

`scene.ts` keeps a rig cache keyed by the body's 106 file stem (`bodyAssets`, filled by `characters.ts loadFoeBody`, the first time a spawn of that body stands or attacks) and builds the actor with `buildWarriors(...).spawnBody(asset, weapon)`. A spawn in the live rig's body takes the old paths unchanged (frozen copies, `spawnFoe`). A spawn in another body is drawn standing (`idleFoes`) or attacking (`liveFoes`) from its own rig, and is simply not drawn until that body's file has loaded.

Not covered yet: the spawn the sim HOLDS (the page's one live foe, which carries the ragdoll, cuts and finishers) is always the page's body, so a held spawn with another body draws in the live body until it is handed back to a standing/attacking draw. Mixed bodies are therefore for the standing and attacking bosses; the held duel foe is the next step (it needs the live rig rebuilt per hand-over). A boss body in the repo other than the Minotaur is still the work listed above.

## Mixed bosses in one zone ("all spawns must be the same kind"), exactly what blocks it

- `src/zone/spawns.ts validateSpots(..., kind)` throws when a spawn row's `kind` differs from the page's one foe (`ZONE.spawn.kind`, `src/client/main.ts` line ~190). That is a guard, not the cause.
- The cause is that `src/client/main.ts` has ONE `opponentId` (from `data/fight.json`), and everything is built from it once at load: the duel sim's opponent, brain, specials, the HUD name, `foeSweepsFor`, and `scene.ts` `loadWarriors(hero, foeUrl(opponentId), ...)`, which builds one foe rig. The standing copies of the other spawns are cloned from that rig, so they can only be that body.
- The smallest honest change is a rig cache in `scene.ts` keyed by body id (`foeUrl(id)` already takes an id and `fighterUrls` is a table), loading a second body lazily the first time a spawn of that body is held or drawn, and `spawns.ts` allowing a kind per spawn. But the sim also holds one opponent id for the moves, stats and specials, so each spawn's `kind` must also swap the sim's opponent on a hand-over (the multi-aggro work in `main.ts` and `scene.ts`). That collides with the open multi-aggro changes, so it is not in this PR. This PR gives it the row it will read: `profiles.json body`, resolved by profile, validated.
