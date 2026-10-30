# Fighting-style audit and proposal (read-only; no game code or data changed)

Base: main `e3e94a5` (2026-10-28). Table: `docs/fighting-style-audit.json` (generated, one row per boss).
Not duplicated here: the Arachne axe+shield regression after #238/#246 (another agent is auditing it; no PR for it was visible on gh when this was written).
Weapon rows still open and not on main: Kachujin katana #251, Nan polearm #248 (draft), The Accountant mace #254.

## 0. The finding in one paragraph

Twelve bosses are three fighters. Every boss resolves to one of three V1 archetypes (`pitborn` x7, `shieldmaiden` x4, `executioner` x1) and, at the default difficulty, the nine AI knobs that make a fighter feel different are overwritten by the one global ladder row, so the archetype tables only contribute stats, weapon and a few non-ladder knobs. Gargantua's "maul" has the cleaver's numbers. Arachne has no shield guard in the sim at all. Only 3 of 12 bosses can be tuned, escalated or appear in the Daily Pit.

## 1. Inventory

Resolution path, for every boss: `data/profiles.json` row -> `opponent` (archetype) -> `OPPONENTS[opp]` (`src/fight/moves.ts:180`, built from `src/fight/archetype-defs.json` via `archetype-rows.ts`) -> weapon swapped by `bossOpponent` (`src/fight/boss-weapon.ts:81`, called `src/fight/spawn-kind.ts:51`) -> AI knobs = `profileAt(opponent, 18)` with the difficulty row's 9 knobs laid over (`src/difficulty.ts:38` resolveFight, `spawn-kind.ts:54`) -> health/damage scales (`difficulty.ts:47` scaledOpponent) -> tune/stars/progression multipliers (`spawn-kind.ts:48-49`).

| Boss | profile id | body (rings.json) | V1 archetype | sim weapon / clipsAs / drawn | weapon row | HP @ diff 5 | shared with |
|---|---|---|---|---|---|---|---|
| Gargantua | gargantua | gargantua | executioner | maul / cleaver / maul | archetype row `gargantua-maul` | 137.1 (160 x 1.19 x 0.72) | none |
| Arachne | arachne | arachne | shieldmaiden | cleaver / cleaver / axe + shield | archetype row `arachne-axe-shield` | 136.8 | Nan, Reginald, Accountant |
| Minotaur | pitborn | minotaur | pitborn | cleaver / none / V1 cleaver | none (V1) | 136.8 | 6 others |
| Lord Gourd | pumpkinhulk | pumpkinhulk | pitborn | maul / cleaver / mace x2 | profile row `lord-gourd-mace` | 136.8 | |
| Kachujin | kachujin | kachujin | pitborn | cleaver / none / V1 cleaver | none (#251 open) | 136.8 | |
| Sir Reginald | castle-guard | castle-guard | shieldmaiden | cleaver / cleaver / halberd | profile row `reginald-halberd` | 136.8 | |
| Nan | sporty-granny | sporty-granny | shieldmaiden | cleaver / cleaver / axe + shield (Arachne's) | archetype fallback (#248 draft) | 136.8 | |
| The Accountant | the-boss | the-boss | shieldmaiden | cleaver / cleaver / axe + shield (Arachne's) | archetype fallback (#254 open) | 136.8 | |
| Titan's Envoy | parasite | parasite | pitborn | cleaver / none / V1 cleaver | none | 136.8 | |
| Ryo | anime-boy-black | anime-boy-black | pitborn | cleaver / cleaver / sword | profile row `ryo-sword` | 136.8 | |
| Akane | anime-girl-blonde | anime-girl-blonde | pitborn | cleaver / none / V1 cleaver | none | 136.8 | |
| The King | big-vegas | big-vegas | pitborn | cleaver / none / V1 cleaver | none | 136.8 | |

Column notes. Body: the profile `body` field is the clone source's (`minotaur` or `arachne`) for the 9 ring bosses; the body actually drawn is `data/rings.json` bosses[].body (`rings.json` `bosses[]`) and `foe-body.ts:54 bodyProfileOf`. `mechanic` is null for all 9 ring bosses (`rings.json`); Gargantua, Arachne, Minotaur have no field.

### 1a. Stats, moves, guard, specials, AI: what is per archetype and what is shared

| Aspect | Value today | Where | Per boss? |
|---|---|---|---|
| Body scale | pitborn 1.13, shieldmaiden 1.0, executioner 1.36 | `archetype-defs.json` ids at lines 133 / 230 / 759 | per archetype |
| Base HP | 190 / 190 / 160; x profile scale (only Gargantua != 1: 1.19) x difficulty 0.72 = about 137 | `archetype-defs.json`, `profiles.json:8`, `difficulty.json` row 5 | the 137 is a hand-derived coincidence |
| Poise | 16 / 16 / 12, ramps 0 -> full over L1-18 for pitborn and shieldmaiden | `archetype-defs.json`, `moves.ts:224`, `moves-tables-defs.json` poise rows | per archetype |
| Speed, regen | absent (1, 1) for all three | `archetype-defs.json` | shared; `?tune=` speed only for 3 kinds |
| Weapon moves, reach, timing | cleaver = longsword + overrides (light 17/9 dmg, heavy 26 dmg, windup 22/36); reach 2 inherited from longsword; maul `extends cleaver` and changes only thrust (stepIn .3, reach 1.4), guard shaft, wood, two-hand | `src/fight/weapon-defs.json` (cleaver, maul, scythe rows) | per weapon id, shared by every wielder |
| Guard | default blade guard for all three. `guard` override exists on nightborn / plagueDoctor only. Shieldmaiden has NO guard override | `archetype-defs.json:230-` (no `guard` key), `moves.ts:217 SCUTUM` used only by the veteran (`moves.ts:220 LOADOUT_FROM`) | none |
| Specials (sim) | the foe's `aiSkill` = `skillOf(opponent)`: pitborn `cleave` (Butcher's Cleave, clip Special_SkullCrack), executioner `reaping`, shieldmaiden `hewer`; share `special.bossDamage` .25 / `damage`; cadence = global `RULES.special.cooldown` and first = `rows80 foeSpecialFirst`; fired when gap <= reach | `src/fight/skill-defs.json`, `replay.ts:17`, `duel.ts:218-220`, `ai.ts:105` | per archetype skill; cadence global |
| Specials (look) | class families pitborn cleaverset/earthfold, executioner heelreap/blackfurrow, shieldmaiden cutmark/gatherededge, chosen by archetype in the page | `class-special-defs.json`, `special-modes.ts:71-113` | per archetype (CODE keyed on archetype, presentation) |
| AI, 9 ladder knobs | reaction, accuracy, parry, dodge, aggression, pressure, discipline, lapse, read are the difficulty row's for ALL bosses (row 5: 40 / .43 / .07 / .04 / .44 / .31 / 58 / .49 / .32) | `difficulty.ts:38` `for (const k of KNOBS) knobs[k] = d[k]` | NOT per boss |
| AI, identity knobs | feint, guard, disengage, circle, step, interrupt, kick, dash, stab, tactic absent for all three (= warden defaults) | `moves.ts:75-` AiProfile, `moves-tables-defs.json` absent rows | none |
| AI, non-ladder knobs that survive | executioner `anticipate 3` (normal tier); shieldmaiden `braceHeavy .6`, own_knobs `spamRun 5 spamBoth 1`; pitborn own_knobs `spamRun 6` | `archetype-defs.json`, `moves-tables-defs.json own_knobs` | the ONLY real AI differences between the 3 archetypes |
| AI dials (spacing, wait, guard hold, bait chance, kick weight) | global rows | `src/fight/ai-dial-defs.json`, `ai-read-defs.json` | shared by all |
| Combo patterns | no table: the chain is the weapon's `chain` rows plus `pressure` (light vs heavy) | `weapon-defs.json`, `ai.ts decide()` | none |
| Punish / tells | `tellReaction`, `anticipate`, `lapse` only; global READ rows | `ai-read-defs.json` | none per boss |
| Phases | mechanism exists, rows empty | `src/fight/boss-phase-defs.json` (`"phases": []`), `duel.ts:782` | unused |
| World behaviour (not duel) | aggro 2.5, leash 20, roam 2.6, camp [1,1], respawn 90/120 for all nine ring bosses | `rings.json bosses[]`, `zones/zone1.row.json spawns[].behaviour` | per spawn, but identical values |
| Scaling hooks | stars (any kind, `stars.ts starTune` -> health/damage); `?tune=` kinds gargantua / arachne / minotaur only (`data/tune.json`); progression bosses 3 (`data/progression.json`); Daily Pit bosses 3 (`data/daily-pit.json`) | | 9 ring bosses missing from tune, progression, Daily Pit |

### 1b. Places where behaviour is decided by CODE keyed on archetype (not by a row)

1. `src/fight/moves.ts:180-184` OPPONENTS built from ROSTER archetype; `moves.ts:224` `POISE_FULL_AT[o.id]`, `:220` `LOADOUT_FROM` (veteran only).
2. `src/fight/spawn-kind.ts:50-54` `OPPONENTS[resolved.opponent]`, `scaled = resolved.opponent === opponentId`.
3. `src/fight/boss-weapon.ts:74-81` weapon lookup keyed by archetype with profile override; `:83` `bossRowOfBody` looks the archetype row up through the archetype's body.
4. `src/fight/replay.ts:17-18` and `moves.ts:199` `specialOf(opponent, level)` / `skillOf(opponent)`: specials keyed by archetype id.
5. `src/fight/special-modes.ts:71-113`, `special-fx-executioner.ts`, `special-fx-pitborn.ts`: one drawing module per archetype; `special-look.ts:24-35` opponent-keyed.
6. `src/fight/characters.ts:273 SHIELD_CARRIERS = {shieldmaiden, veteran}` and `:451 SOURCE_DYE` (draw only).
7. `src/fight/rank-look.ts:60-66`, `play-radius.ts:12 ARENA_ONE`, `catalogue-data.ts` (look and catalogue, not combat).
8. `src/fight/ai.ts` itself has NO archetype ids: the roster comment says "adding an individual must not add AI branches" (`src/roster.ts` header). The AI is already pure `AiProfile` + weapon + guard. That is the good news: a style row can drive it without touching the AI's branches.

## 2. Ambiguity list

1. **Arachne's shield guard does not exist.** The shieldmaiden archetype row has no `guard` (`archetype-defs.json:230-`); `boss-weapons.json` "about" says the sim "keeps her shield guard". The shield is a drawing. Her `braceHeavy .6` is inert: `ai.ts:184` and `:392` need `guardOf(self).stopsHeavy`, which only SCUTUM (veteran) sets. Same for Sir Reginald and the other two shieldmaidens.
2. **Gargantua's maul is the cleaver.** `maul` extends `cleaver` and overrides only thrust reach and guard/material/grip (`weapon-defs.json`). "Slow maul bruiser" is not in the data: same windups, damage and reach as the Minotaur's cleaver. Lord Gourd uses the same maul row.
3. **clipsAs hack on every row.** All 5 weapon rows say `clipsAs: cleaver`: maul, axe, halberd, sword and mace are all drawn swinging the sword clip family; sim timing is the weapon's, animation is another's. Blade sweeps are V1 hero-rig tables, not re-baked (every row's `placeholder`).
4. **Weapon mismatch between roster, archetype and boss row.** Minotaur roster weapon is `maul` (`catalogue-data.ts` minotaur row) but he fights the pitborn cleaver; shieldmaiden roster weapon is `gladius` but all four shieldmaidens fight `cleaver`; executioner roster is `scythe` (reach 2.1, dead band under 1.4 m, `Scythe_*` clips) replaced by maul, so the scythe identity is gone while `archetype-defs.json` comments still describe it.
5. **Halberd and polearm are cleaver numbers.** Reginald's halberd is 1.8 m drawn, reach 2 simulated; #248 will add a second polearm (Nan) with no reach difference.
6. **Fallback clones.** Nan and The Accountant draw Arachne's axe+shield (archetype fallback, `boss-weapon.ts:74`) until #248/#254 merge. Four bosses share one weapon row.
7. **The ladder erases archetype AI.** `difficulty.ts:38` overwrites the 9 knobs for every kind. The pitborn `normal` table equals difficulty row 10 exactly; shieldmaiden's lower `parry`/`aggression`, executioner's `lapse .2 read .75` are overwritten. `profiles.json` `brain` is null and `knobs` (supported: `difficulty.ts:12`, `validate.js checkKinds`) is unused by all 12 rows. This is the existing hook for per-boss AI.
8. **137 hp is arithmetic, not a row.** 190 x 0.72 and 160 x 1.19 x 0.72. Prose in `rings.json`, `tune.json` ("137"), memory; no single value pins it. Changing difficulty 5 moves all bosses together.
9. **Duplicated and cloned rows.** Nine profile rows are copies with "see the pumpkinhulk row" prose; ring behaviour (aggro/leash/roam/camp) is identical in nine rows; `profiles.json` `body` is the clone source's (minotaur/arachne), real body in `rings.json` (two sources of body truth; `validate.js checkBodies` forces one body per archetype id).
10. **Missing from the scaling layers.** `tune.json` kinds, `progression.json` bosses and `daily-pit.json` bosses list only gargantua, arachne, pitborn. Nine bosses cannot be tuned by URL, escalate with kills or be the Daily Pit boss.
11. **Probably dead rows (verify before deleting).** Zone fights run at level 18; named specials start at level 36 (`special-set-defs.json` ranks 36/41/46, `special.bossFrom` 36), so the rank 8-10 specials of pitborn / executioner / shieldmaiden (`bosses.json`, `special-set-defs.json`) and `special.bossDamage` are not reached by these bosses. The class-special family (level >= 16) is what is shown. The Minotaur "keeps Shield Quake" memory could not be matched to any pitborn row in main: `quake` is the veteran's.
12. **Values pinned by source text.** `test/boss-weapons.test.mjs:122` regex-matches `bossOpponent(base, ctx.search, undefined, kind)` in `spawn-kind.ts`; 30 test files read `src/*.ts` source text (grep `readFileSync(new URL('../src/`), unaudited. Renaming a call site in the migration will trip them.
13. **Replay records.** `archetype-rows.ts` header: a fight record carries (opponent, level) and the profile is rebuilt from `OPPONENTS[opponent].profiles[level]`; any style divergence changes old records' fights. `RECORD_VERSION` is 91 (`record.ts:27`).

## 3. Proposal

### 3a. `data/fighting-styles.json`

One row per boss. The row replaces the archetype for combat, and the profile row points at it. The difficulty ladder stays the global skill scale; the style supplies identity and per-knob offsets.

```json
{ "id": "maul-bruiser", "name": "Maul Bruiser",
  "identity": "two lines, shown in the codex",
  "seed": { "archetype": "executioner" },                      // migration only: copy stats from this archetype, then diverge
  "body": { "scale": 1.36, "health": 160, "poise": 12, "speed": 1, "regen": 1 },
  "weapon": "maul",                                              // weapon-defs.json id (own row, not an alias of cleaver)
  "weaponDraw": "gargantua-maul",                                // boss-weapons.json id (art only: clipsAs, equip, offhand)
  "guard": { "policy": "never", "profile": null },               // never | block | parry | shield-wall; profile = GuardProfile overrides
  "ai": {
    "ladderOffsets": { "aggression": -0.2, "pressure": -0.4, "parry": 0, "dodge": 0 },   // added to the difficulty row, clamped; keeps "difficulty 1-10 works for every boss"
    "identity": { "feint": 0, "disengage": 0, "circle": 0, "step": 0, "interrupt": 0, "kick": 0, "dash": 0, "stab": 0, "braceHeavy": 0, "anticipate": 3, "tellReaction": null },
    "range": { "prefer": 1.9, "tolerance": 0.3 },                // NEW hook
    "combos": [ { "moves": ["heavy_overhead"], "weight": 5 } ],  // NEW hook (weighted move chains)
    "punishWindow": { "afterWhiffTicks": 30 },                   // NEW hook
    "tells": { "windupScale": 1.3 }                              // NEW hook (readability: longer telegraph)
  },
  "special": { "skill": "reaping", "cadenceScale": 1.0, "trigger": "gap<=reach", "family": "executioner" },
  "stagger": { "poise": 12, "superArmourWindup": true },
  "mechanic": null,                                              // rings.json bosses[].mechanic id, one signature move per boss
  "scaling": { "tune": true, "progression": true, "dailyPit": true }
}
```

Fields marked NEW hook have no sim support today (`range`, `combos`, `punishWindow`, `tells`, `superArmourWindup`); the rest map onto code that exists (`AiProfile`, `Opponent`, `GuardProfile`, skill rows, `boss-phase-defs.json`). Profile row change: `"style": "<id>"` replaces `opponent` as the combat key; `opponent` stays only as the `seed` during PR1.

### 3b. One style per boss (max 2 overlapping pairs)

| Boss | Style | Identity (what the player feels) |
|---|---|---|
| Gargantua | Maul Bruiser | One huge heavy at a time with a long, readable windup. Never guards, never rolls. Dodge it and he is open for a long recovery; get hit and you lose a third of the bar. |
| Arachne | Shield Counter | A real shield (wide, stops heavies, `braceHeavy` live). She waits, blocks, then answers with an axe riposte. Beat her by baiting the block, kicking it open, or striking the axe side. |
| Minotaur | Brawler (baseline) | Relentless light chains, rushes in, stamina-greedy. The tutorial boss and the reference all other styles are measured against. |
| Lord Gourd | Mace Crusher | Slow two-hit combos (light-light-heavy) that drive you back; very high poise so interrupts fail; area stomp special. Overlap pair A with Gargantua (heavy blunt weapon) but a combo fighter. |
| Kachujin | Katana Duelist | Fast reaction, high parry that commits (Nightborn-style guard), feints. Wins by punishing mistimed attacks; dies to feint-bait. |
| Sir Reginald | Halberd Gatekeeper | Holds a spacing line, thrusts at the edge of reach, backs off if closed, never chases. Beat him by diving inside the reach with a roll. |
| Nan the Impaler | Lunge Stabber | Aggressive long thrusts with dash and circling; low poise, glass cannon. Overlaps in weapon family with Reginald only; behaviour is the opposite (chases vs holds). |
| The Accountant | Patient Punisher | Never swings first. Baits, then punishes any whiff with a heavy counter. Pressure him and he folds; stand off and nothing happens. |
| Titan's Envoy | Swarm Skitter | Short erratic jabs, hit-and-run (`disengage`, `circle`, `step`, `interrupt`), low poise. Fast, small damage, hard to line up. |
| Ryo | Sword Flow | Long mixed light chains with delayed strikes to break the player's rhythm; dash gap-close. Overlap pair B with Kachujin (blade) but offence-led, not counter-led. |
| Akane | Evader | Rolls and backsteps, kicks rollers, lands one clean hit and hops out. Punishes greed; a patient player wins by cornering. |
| The King | Phase Champion | Uses `boss-phase-defs.json`: three phases, each faster with a shorter special cooldown; the only boss whose fight changes mid-way. Signature mechanic row filled last. |

Declared overlaps: A = Gargantua / Lord Gourd (heavy blunt, different cadence); B = Kachujin / Ryo (katana vs sword, counter vs flow). Everything else is a distinct playstyle.

### 3c. How it meets the existing layers

- **Stars (#239)**: multiplies health, damage and scale on top (`stars.ts starTune`); styles untouched. Optionally a star could add an `ai.identity` rider later.
- **Progression (#222)**, **Daily Pit twists (#261)**: both are `?tune=` multipliers. The style row's `scaling` flags replace the three hard-coded lists (`tune.json` kinds, `progression.json` bosses, `daily-pit.json` bosses) so a new boss is in all three automatically.
- **Hunter heat (#256)** and **Frankendom parts (#258)**: by their titles, heat spawns a hunter and parts change the hero's stats. A hunter would reference a style row like any boss; parts never touch boss rows. These docs were not read in depth.
- **Ladder**: unchanged as the skill axis; the style adds `ladderOffsets`, so difficulty 1-10 still works.
- **Validation** (`src/sim/validate.js`): add a `fighting-styles` schema; checks: unique ids, every profile names a style, every style's `weapon` exists in `weapon-defs.json`, offsets keep every knob in the ladder range, `guard.policy` consistent with the guard profile (a style with `braceHeavy > 0` must have `stopsHeavy`, which would have caught Arachne), `special.skill` exists in `skill-defs.json`.
- **Tests**: every boss in `data/rings.json` + zone row has a style; every style row valid; no style shares all of (weapon, guard.policy, ladderOffsets) with another except the 2 declared pairs; source of truth for 137 hp becomes a test on `body.health x scale x ladder`.

## 4. Staged migration (5 PRs)

1. **Rows, no behaviour change.** Add `data/fighting-styles.json` with 12 rows that are exact copies of today's resolved values (`seed.archetype`), plus loader, validator and profile `style` key; `kindFightFor` builds the same `Opponent`/`AiProfile` from the row. Proof: golden duel traces. Record, on main BEFORE the change, a sha256 per boss (12 kinds x 3 seeds x a fixed scripted hero input) in the existing `test/gate0/` harness style (`v3-golden.json`, `harness.mjs`), and assert the PR yields the same hashes. Effort: M. Order: first.
2. **Sim hooks, still behaviour-preserving.** Add the NEW hooks (`range`, `combos`, `punishWindow`, `tells`, `superArmourWindup`) to `ai.ts`/`duel.ts`, all no-op when absent; goldens must still pass. Fix the pinned-source-text tests to read rows. Effort: L (the only real code in the plan).
3. **Diverge zone 1 and give them real weapons.** Gargantua gets a slow maul weapon row (not `extends cleaver`), Arachne a real shield guard (`stopsHeavy`, wide), Minotaur the baseline. Win-rate battery per boss (hero brain bot, 24 seeds, as past combat work); bump `RECORD_VERSION`. Effort: M.
4. **Diverge ring 2** (Lord Gourd, Kachujin, Reginald, Nan, Accountant), one commit per boss, each with a battery receipt. Effort: M.
5. **Diverge ring 3** (Envoy, Ryo, Akane, King), then delete the archetype-keyed paths: `tune.json`/`progression.json`/`daily-pit.json` lists derived from `scaling`, `OPPONENTS` reads rows, archetype fallbacks in `boss-weapon.ts` removed. Effort: M.

Risks: V1 clips are byte-pinned (gate0): PR1/PR2 must not move them, diverging PRs touch rows only; physics and cut manifests are keyed by body, unaffected. Old fight records and share links replay a different fight after PR3 (needs the `RECORD_VERSION` accept-list decision below). The ladder and styles interact: a mis-set offset can push a knob out of range, which the validator must catch. Without battery receipts per boss, balance will drift (the Gargantua health went 600 -> 300 -> 137 in three merges).

Needs Dom: (1) approve the 12 styles and the 2 overlaps, in particular Envoy (what weapon: none/bite/knife?) and the King's phases; (2) are old replays and shared clips allowed to break at PR3, or keep a legacy path; (3) should Gargantua's maul really be slower (it lowers his damage rate at the same 137 hp); (4) are `range`/`combos`/`punishWindow` new sim code acceptable now, given Gate 0; (5) shield guard for Arachne means her fight gets harder for pure-heavy players.
