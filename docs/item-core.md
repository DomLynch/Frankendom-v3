# Shared item core: row shape, core_version 1 (platform plan step 1, design only)

Status: SIGNED by ARMAGEDOM Lead in PR #292 (answers folded in below). Still DESIGN ONLY: no code, no data row and no game behaviour changes with this doc. V3 facts checked against `main` 6e8cc81.
Canonical copy (Dom's plan rewrite, 2026-10-29): the schema now lives in `DomLynch/games-platform` (`packages/item-core`, public, schema-only), pinned by commit sha like physics; this file stays V3's design note and `docs/item-core.schema.json` is a byte-identical copy of the one at games-platform `739c6e9`. Neither game repo writes into the other.
Open for both Leads before any change: games-platform's `validate.mjs` is stricter than this doc. It rejects an unknown key beside the core ones (a game's extras go under `ext.<game_id>`), while the signed rule below allows extra keys beside the core ones. The schema file is the same either way; no core key is added or moved by this note.
Plan (Strategy): shared item core = `id`, `game_id`, `type`, `asset` (Lead added `name`); optional typed `weapon` block (damage, rate, range, ammo) and `character` block (rig); cut/dismember stays in V3's extension, ballistics never in the core.

Standing rules (Strategy): new gameplay data uses the core shape once published, no refactor of existing rows; before building loot, inventory, NPC AI or trading, check the other game first (reuse-first); no auth or database change in either repo except through ARMAGEDOM Server & Deploy.

Change policy: ADDITIVE ONLY after signing. A new optional key, a new enum value or a new block may be added; nothing is removed, renamed, retyped or tightened within `core_version` 1. A breaking change is `core_version` 2 and needs Lead sign-off. Ids are stable keys, never infer meaning from one (ARMAGEDOM's `railgun` is now the light machine gun, legacy id kept).

Everything below that describes an existing V3 row was read from the file. Anything that does not exist today is marked PROPOSED (V3 side).

## 1. Core row

One row = one JSON object, unique `id`. The shared core schema has a FIXED wrapper: `{ "core_version": 1, "rows": [ ... ] }`. A game's own files may keep their named keys (V3: `rows`, `profiles`, `weapons`; ARMAGEDOM: an array under a named key); a generated core view of a file is `{core_version, rows[]}`.

| field | type | rule |
|---|---|---|
| `id` | string | required; kebab `^[a-z0-9-]{1,48}$` (ARMAGEDOM's Supabase `arma_items.id` rule; every V3 id fits: `gargantua-maul`, `golden-gladius`, `anime-boy-black`); unique within `game_id` + `type` |
| `game_id` | string | required; enum: `armagedom` (ARMAGEDOM), `frankendom-v3` (V3) |
| `type` | string | required; enum: `weapon`, `character`, `consumable`, `part`, `relic`, `bodypart`. No armour (cut from ARMAGEDOM's alpha). `bodypart` is V3's addition (cut body parts); `part` is ARMAGEDOM's loot parts and is not used for V3 cut parts. New types need Lead sign-off. Consumers key on `game_id` + `type` + `id` |
| `name` | string | required; 1 to 48 characters; display name |
| `asset` | string | required; path relative to the owning game's public asset root, extension preferred (`weapons/foe/maul.glb`). A bare stem only where that game's loader documents it (ARMAGEDOM: stems like `mh-npc-marsh` under `Web/public/assets/<dir>/<stem>.glb`). Never a URL |
| `weapon` | object | optional, only when `type` is `weapon` |
| `character` | object | optional, only when `type` is `character` |

Where rows live: ARMAGEDOM in `Web/src/data/*.json` (array under a named key, unique kebab ids) and Supabase `arma_items` (`id text`, `^[a-z0-9-]{1,48}$`); V3 in `data/*.json` and `src/fight/weapon-defs.json`.

Rules: no other top-level field is core. A game may carry extra keys beside the core ones (V3's extension, section 3); a consumer from the other game ignores keys it does not know. A `weapon` block on a non-weapon row, or a `character` block on a non-character row, is invalid. All numbers are finite; units are fixed by the tables, never by a suffix in a key name.

## 2. Optional typed blocks

`weapon` (every key optional inside the block; a missing key means "not stated", never zero):

| key | type | unit | rule |
|---|---|---|---|
| `damage` | number | game damage points, ONE base value: a fully mastered hit in the held-fire mode | finite, >= 0 |
| `rate` | number | attacks per second, ONE base value, same mode | finite, > 0 |
| `range` | number | metres, reach from the wielder's grip | finite, > 0 |
| `ammo` | integer or null | rounds carried; `null` = infinite | integer >= 0, or null; nothing else |

`character`:

| key | type | rule |
|---|---|---|
| `rig` | string | id from the shared list: `mixamo-106`, `v1-65`, `mixamo-19` (same vocabulary as V3's `data/rig.json`) |

Per-move damage maps, tick timing, charges, multipliers, ballistics (projectile speed, drop, spread, mana) and cut units are NOT in the core; each game keeps them as extension keys.

### V3: which move is the base (answer 5)

V3's `src/fight/weapon-defs.json` stores damage per move (`moves.<move>.damage`) and timing in 60 Hz ticks. For the core, V3's rule is: the base move of every weapon is `light_right` (the held light swing), resolved through `extends`. `weapon.damage` = that move's `damage`; `weapon.rate` = 60 / (windup + active + recovery) ticks of the same move, where the row or its `extends` chain states all three; `weapon.range` = the row's `reach` (resolved through `extends`). Per-move maps stay V3's extension.

What the rows give today (read from `weapon-defs.json`, `light_right`, through `extends`):

| weapon id | base damage | windup / recovery (ticks) | reach (m) | note |
|---|---|---|---|---|
| trident | 12 | 22 / 24 | 2.25 | |
| cleaver | 17 | 22 / 26 | none stated | |
| knife | 10 | 14 / 16 | 1.45 | bow, bite inherit damage and timing |
| gladius | 12 | not on row | 1.77 | timing inherited from longsword |
| scythe | 16 | 24 / 26 | 2.1 | |
| maul | 17 (cleaver's) | 22 / 26 (cleaver's) | none stated | |
| warhammer | 15 | 22 / 26 (cleaver's) | 1.4 | |
| estoc, reaper | 9 | not on row | 2.3, 2.55 | |
| staff | 12 (trident's) | 22 / 24 (trident's) | none stated | |
| longsword | NOT on row | `rv86` states active 5 / recovery 25, no windup | 2 | its `moves` is empty; damage comes from V1 rules code |

Active ticks are only stated in `rv86` for the longsword. So `weapon.rate` cannot be derived from the rows for most weapons without reading code; see V3 open items.

## 3. V3's extension, mapped onto the core

V3 keeps its own fields. A V3 row WOULD gain `game_id`, `type`, `name`, `asset` (and blocks) and keep everything else. Existing files are not refactored (standing rule): the tables are the mapping a NEW row, or a generated core view of an old row, would use.

V3 extension (stays V3's, never core):
- Cut/dismember: `data/physics.json` `cut`. Units are `head`, `arm_left`, `arm_right`, `leg_left`, `leg_right`, `torso_waist` (`cut.tap.order`); `cut.onKill` maps a sim kill location to a unit; impulse in N s with a `lift` up; seam and cap values are fractions and a radius multiplier. Presentation only; the 60 Hz sim never sees it.
- The blunt flag: `data/rules.json` `weapons.<weapon-defs id>` = `{ "rule": "<physics package weapon row>", "blunt": true }`; `blunt` is on `maul`, `warhammer`, `staff` only. Keyed by weapon id, not stored on the weapon row.
- Fight moves and timing: `src/fight/weapon-defs.json` (not under `data/`).
- Golden `charges` (hits landed) and `damageMul`: V3 extension, not `ammo` or `damage` (answer 6).

SIGNED by Lead: cut body parts use core `type: "bodypart"` (not `part`, which is ARMAGEDOM's loot parts): one `bodypart` row per harvestable unit, `id` = `<profile id>-<cut unit>` in kebab form (`gargantua-arm-left`), `name` display, `asset` the cut piece mesh path, and the cut unit string stays an extension key (`cutUnit`). V3 trophies are not proposed here; V3 proposes a type for them separately.

### 3a. `data/boss-weapons.json` (`rows[]`, 10 rows)

Row keys: `id, opponent, [profile], weapon, clipsAs, equip, scale, grip, material, offhand, placeholder`.

| existing key | core field | note |
|---|---|---|
| `id` (`gargantua-maul`) | `id` | a loadout id, not the item's id (M1) |
| (none) | `game_id`, `type` | `frankendom-v3`, `weapon` |
| (none) | `name` | no display name on the row (M11) |
| `equip` (file stem under `src/assets/weapons/foe/`, e.g. `maul`) | `asset` | becomes `weapons/foe/maul.glb`; a stem needs V3's loader to document it (M7); `offhand.file` is a second asset (M2) |
| `weapon` (a `weapon-defs.json` id) | extension | points at the real item |
| `opponent`, `profile`, `clipsAs`, `scale`, `grip`, `material`, `offhand`, `placeholder` | extension | who wields it, drawing and clip detail |
| (none) | `weapon.*` | numbers live on the `weapon-defs.json` row it names (section 2 table) |

### 3b. `src/fight/weapon-defs.json` (`weapons[]`, 13 rows) and `data/rules.json` `weapons`

Row keys: `id, skill, rv86, default, look, player, offered, guard, material, reach, grip, fight, moves, paths, extends, guardProfile, natural`.

| existing key | core field | note |
|---|---|---|
| `id` | `id` | |
| (none) | `name` | none on the row (M11) |
| `reach` (m) | `weapon.range` | same unit; inherited through `extends` (M4) |
| `moves.light_right.damage` | `weapon.damage` | base move rule above; longsword has none (M3) |
| `moves.light_right` windup, active, recovery (ticks) | `weapon.rate` | 60 / total ticks; not derivable for most rows (M3) |
| (none) | `weapon.ammo` | not a row field; arrows are fighter state in `duel.ts`, "absent = infinite" (M5) |
| (none) | `asset` | no asset field; drawn part is on the boss row (`equip`) or baked in the hero rig (`look.baked`) (M6) |
| `moves`, `paths`, `rv86`, `fight`, `guard`, `skill`, `extends`, `look`, `player`, `offered`, `natural`, rules.json `rule`/`blunt` | extension | |

### 3c. `data/profiles.json` (`profiles[]`, 12 rows)

Row keys: `id, about, opponent, body, name, brain, foeHealthScale, foeDamageScale, [knobs]`.

| existing key | core field | note |
|---|---|---|
| `id` | `id` | |
| `name` | `name` | resolved by answer 3; 1 to 48 chars to be checked (a few rows may lack `name`, M11) |
| (none) | `game_id`, `type` | `frankendom-v3`, `character` |
| `body` (key of `data/rig.json` `files`, e.g. `minotaur`; default `defaultBody`) | `asset` | a stem, not a path (M7) |
| (rig implied by the body) | `character.rig` | not stored on the row; every V3 body is Mixamo 106 going forward, so `mixamo-106` (M8) |
| `opponent`, `brain`, `foeHealthScale`, `foeDamageScale`, `knobs`, `about` | extension | NPC AI and stat scaling (reuse-first applies before anyone builds NPC AI elsewhere) |

### 3d. `data/golden-weapons.json` (`weapons[]`, 5 rows)

Row keys: `id, name, weapon, power, tell, charges, damageMul, tier, tint`.

| existing key | core field | note |
|---|---|---|
| `id` | `id` | |
| `name` | `name` | direct |
| `weapon` (a `weapon-defs.json` id) | extension | base weapon it re-skins |
| (none) | `asset` | no new art; the base weapon's mesh, tinted (M6) |
| `damageMul` | extension | a multiplier, not `weapon.damage` |
| `charges` | extension | per landed hit; not `ammo` (answer 6) |
| `power`, `tell`, `tier`, `tint` | extension | |

### 3e. Mismatches

Resolved by Lead's answers:
- R1 `name`: core field, required, 1 to 48 chars (was open question 3). `golden-weapons` rows already carry it; `profiles` rows carry it optionally.
- R2 `asset`: a path relative to the game's public asset root, extension preferred, stem only where the loader documents it (was open question 4).
- R3 `damage` and `rate`: ONE base value each (was M3's "needs a rule"). V3 states the base move above.
- R4 `ammo`: finite integer or null only; `charges` and `damageMul` are V3 extension (was M9).
- R5 `character.rig`: shared id list, same vocabulary as `rig.json` (was open question 7).

Still open on V3's side:
- M1 `boss-weapons` row `id` is a boss-and-weapon loadout, the item is the `weapon` it points at.
- M2 One `asset` per row; a boss row can carry two meshes (`equip` plus `offhand.file`).
- M3 Longsword has no base damage on its row (comes from V1 rules code); `rate` is not derivable from rows for most weapons (active and windup ticks missing on gladius, estoc, reaper, longsword). V3 to add the numbers as data in a later PR, or state `rate` as not stated.
- M4 `reach` is inherited through `extends` and absent on cleaver, maul, staff, bow, bite; the core wants a resolved value.
- M5 `ammo` is fighter state and sandbox rules in V3, not a row field.
- M6 `weapon-defs.json` and `golden-weapons.json` rows have no `asset`.
- M7 `body` and `equip` are stems; V3's loader must document the stem rule (answer 4) or rows gain a path.
- M8 `character.rig` is implied, not stored, on profiles rows.
- M10 `weapon-defs.json` lives in `src/fight/`, not `data/`; the as-data gate and `validateFile` do not cover it as they cover `data/*.json` (section 4).
- M11 Some existing rows have no `name` (boss-weapons, weapon-defs); a core view needs a name source.

## 4. How the as-data gate would validate core rows

What exists (read, not assumed):
- `scripts/as-data/check.mjs` (`npm run check:as-data`, test `test/as-data.test.mjs`) scans CODE in the live-zone files (`scripts/as-data/scope.json` globs) for numbers, labels, string compares and ids that belong in a data row. It does NOT read data rows. It is why a core value must live in a row, not in code.
- Row validation is `src/sim/validate.js` `validateFile(name, json)`: a per-file table of allowed top-level and row keys (`boss-weapons`, `profiles`, `golden-weapons` each have an entry), plus cross-file checks (`checkKinds`, `checkBodies`, `checkDifficulty`) and a load-time value check (`src/fight/golden-check.ts`). `test/validate.test.mjs` pins it.

PROPOSED core check (a pure function in a later code PR, not this one), run on every row that declares `game_id`, with `docs/item-core.schema.json` as its structural half:
1. Structure: validate the file against the JSON Schema (required fields, enums, id and name patterns, number ranges, `ammo` integer or null, `rig` enum, block-to-type agreement).
2. Keys: unknown keys beside the core ones must be in that file's `validateFile` allowed list (the schema permits extras; the gate does not, as today).
3. Uniqueness: `(game_id, type, id)` unique across all files.
4. References: `asset` resolves to a file under the game's public asset root (or its documented stem rule); a `weapon` field on an extension points at a `weapon-defs.json` row.
5. Core stays free of ballistics and cut: a deny list (`impulse`, `lift`, `seam`, `unit`, `cut`, `projectile`, `speed`, `spread`, `mana`, `charges`, `damageMul`) inside a block fails.
6. As-data gate unchanged: it keeps scanning code; a new core reader under `src/zone/**` starts at zero findings.

Existing rows are not forced through this (no refactor): it runs on rows that opt in with `game_id`. Rows without a `name`, or with an undefined `rate`, stay V3 extension (not core rows) until fixed.

## 5. Open items

For ARMAGEDOM Lead: answered in PR #292 (ten answers folded in above). None remain from the first list.

For V3 (owners: V3 Dev, later PRs, none blocking the signed shape):
1. Document V3's stem rule for `equip` and `body` (R2, M7), or move to paths.
2. Add base `damage` and `rate` inputs for longsword, gladius, estoc, reaper as data (M3, M4).
3. Propose a V3 type for trophies, with Lead sign-off.
4. (Done: `bodypart`, id `<profile>-<unit>`, signed by Lead.)
5. Decide whether the core view of V3 rows is generated or hand-written.
