# Shared item core: row shape (platform plan step 1, design only)

Status: DESIGN ONLY. No code, no data row and no game behaviour changes with this doc. Checked against `main` 6e8cc81.
Plan text (Strategy): shared item core = `id`, `game_id`, `type`, `asset` only; optional typed `weapon` block (damage, rate, range, ammo) and `character` block (rig); cut/dismember stays in V3's extension, ballistics never in the core. ARMAGEDOM Lead signs the core shape; their repo is not touched.

Standing rules (Strategy): new gameplay data uses the core shape once published, no refactor of existing rows; before building loot, inventory, NPC AI or trading, check the other game first (reuse-first); no auth or database change in either repo except through ARMAGEDOM Server & Deploy.

Everything below that describes an existing V3 row was read from the file. Anything that does not exist today is marked PROPOSED.

## 1. Core row (PROPOSED)

One row = one JSON object, rows live in an array under a named key of a data file (V3's existing convention: `rows`, `profiles`, `weapons`, each row has a unique `id`).

| field | type | rule |
|---|---|---|
| `id` | string | required, unique within `game_id` + `type`; lowercase kebab, `^[a-z0-9]+(-[a-z0-9]+)*$` (all V3 ids today fit: `gargantua-maul`, `golden-gladius`, `anime-boy-black`) |
| `game_id` | string | required, which game owns the row; enum, today `frankendom-v3` (ARMAGEDOM's value is theirs to name, see section 5) |
| `type` | string | required, enum: `weapon`, `character` (PROPOSED; more types are added only by Lead sign-off) |
| `asset` | string | required, one reference to the thing that is drawn: a file stem or a path relative to the owning game's asset root; never a URL, never a binary |
| `weapon` | object | optional, only when `type` is `weapon`; section 2 |
| `character` | object | optional, only when `type` is `character`; section 2 |

Rules: no other top-level field is core. A game may carry extra fields beside the core ones (V3's extension, section 3); a consumer from the other game ignores keys it does not know. A row with a `weapon` block and `type: "character"` (or the reverse) is invalid. All numbers are finite; units are fixed by the table below, never by a suffix in a key name.

## 2. Optional typed blocks (PROPOSED)

`weapon` (all four keys optional inside the block, a missing key means "not stated", never zero):

| key | type | unit | rule |
|---|---|---|---|
| `damage` | number | game damage points per landed hit, base value before any multiplier | finite, >= 0 |
| `rate` | number | attacks per second | finite, > 0 |
| `range` | number | metres, reach from the wielder's grip | finite, > 0 |
| `ammo` | integer or null | rounds carried; `null` = infinite | integer >= 0 or null |

`character`:

| key | type | rule |
|---|---|---|
| `rig` | string | id of the skeleton the asset is built on (V3 values today: the `data/rig.json` rigs, 65-bone and Mixamo 106-bone) |

Ballistics (projectile speed, drop, spread, missile mana cost) are NOT in the core. Cut/dismember is NOT in the core (section 3).

## 3. V3's extension, mapped onto the core

V3 keeps its own fields. The core shape does not replace them; a V3 row WOULD gain the four core fields and keep everything else. Existing files are not refactored (standing rule); the tables show the mapping a future new row, or a generated core view of an old row, would use.

V3 extension (stays V3's, never core):
- Cut/dismember: `data/physics.json` `cut`. Units are the strings `head`, `arm_left`, `arm_right`, `leg_left`, `leg_right`, `torso_waist` (`cut.tap.order`); `cut.onKill` maps a sim kill location to a unit (`head` -> `head`); impulse in N s with a `lift` up; seam and cap values are fractions and a radius multiplier. Presentation only, the 60 Hz sim never sees it.
- The blunt flag: `data/rules.json` `weapons.<weapon-defs id>` = `{ "rule": "<physics package weapon row>", "blunt": true }`; `blunt` appears today only on `maul`, `warhammer`, `staff`. It is keyed by weapon id, not stored on the weapon row.
- Fight moves: `src/fight/weapon-defs.json` (not under `data/`), keyed per move (`light_right`, `heavy_overhead`, `thrust`, ...), timing in 60 Hz ticks.

### 3a. `data/boss-weapons.json` (`rows[]`, 10 rows)

Row keys: `id, opponent, [profile], weapon, clipsAs, equip, scale, grip, material, offhand, placeholder`.

| existing key | core field | note |
|---|---|---|
| `id` (e.g. `gargantua-maul`) | `id` | row id, not the weapon's id (see mismatch M1) |
| (none) | `game_id` | would be the constant `frankendom-v3` |
| (none) | `type` | would be `weapon` |
| `equip` (stem of a file under `src/assets/weapons/foe/`, e.g. `maul`) | `asset` | maps cleanly; `offhand.file` (shield mesh stem) is a second asset the core cannot hold (M2) |
| `weapon` (a `weapon-defs.json` id) | extension | which fight row the boss swings; points at the real item (M1) |
| `opponent`, `profile` | extension | who wields it |
| `clipsAs`, `scale`, `grip`, `material`, `offhand`, `placeholder` | extension | drawing and clip detail, V3 only |
| (none) | `weapon.damage`, `weapon.rate`, `weapon.range`, `weapon.ammo` | not on this row; the numbers live on the `weapon-defs.json` row it names (M3) |

### 3b. `src/fight/weapon-defs.json` (`weapons[]`, 13 rows) and `data/rules.json` `weapons`

Row keys seen: `id, skill, rv86, default, look, player, offered, guard, material, reach, grip, fight, moves, paths, extends, guardProfile, natural`.

| existing key | core field | note |
|---|---|---|
| `id` (`longsword`, `maul`, `trident`...) | `id` | |
| `reach` (metres, e.g. gladius 1.77) | `weapon.range` | direct, same unit; present only on some rows, others inherit through `extends` (M4) |
| `moves.<move>.damage` (e.g. cleaver light_right 17) | `weapon.damage` | a damage per MOVE, not one number; the core needs a rule for which move is the base (M3) |
| `moves.<move>.windup` + `recovery` (ticks at 60 Hz) | `weapon.rate` | derived, not stored: attacks per second = 60 / (windup + active + recovery) of a named move; a unit conversion plus a choice of move (M3) |
| (none) | `weapon.ammo` | not a weapon-row field; arrows are fighter state `ammo` (src/fight/duel.ts, "absent = infinite") and missile rows are in the sandbox rules (M5) |
| `moves`, `paths`, `rv86`, `fight`, `guard`, `skill`, `extends`, `look`, `player`, `offered`, `natural` | extension | fight tuning and clip names, V3 only |
| `data/rules.json weapons.<id>.rule` / `.blunt` | extension | cut/hit evaluator mapping (above) |
| (none) | `asset` | the weapon-defs row has no asset field; the drawn part is named on the boss-weapons row (`equip`) or is baked in the hero rig (`look.baked`) (M6) |

### 3c. `data/profiles.json` (`profiles[]`, 12 rows)

Row keys: `id, about, opponent, body, name, brain, foeHealthScale, foeDamageScale, [knobs]`.

| existing key | core field | note |
|---|---|---|
| `id` (e.g. `anime-boy-black`) | `id` | |
| (none) | `game_id`, `type` | `frankendom-v3`, `character` |
| `body` (key of `data/rig.json` `files`, e.g. `minotaur`) | `asset` | the Mixamo 106 body stem; falls back to `defaultBody` when a row has none (M7) |
| (the body's rig, `data/rig.json`) | `character.rig` | not on the row: the rig is implied by the body (the 106 rig for every V3 body going forward) and read from `rig.json`; a core row would state it (M8) |
| `name` | extension | display name; the core has no name (open question 3) |
| `opponent`, `brain`, `foeHealthScale`, `foeDamageScale`, `knobs`, `about` | extension | NPC AI and stat scaling, V3 only (reuse-first check applies before anyone builds NPC AI elsewhere) |

### 3d. `data/golden-weapons.json` (`weapons[]`, 5 rows)

Row keys: `id, name, weapon, power, tell, charges, damageMul, tier, tint`.

| existing key | core field | note |
|---|---|---|
| `id` (`golden-gladius`, `sunblade`, `plasma-spear`...) | `id` | |
| `weapon` (a `weapon-defs.json` id) | extension | the base weapon it re-skins |
| (none) | `asset` | no new art (the row's own rule); the drawn mesh is the base weapon's, tinted by `tint` (M6) |
| `damageMul` (1..3) | `weapon.damage` | NOT equal: it is a multiplier on the base weapon's damage, not a damage value (M9) |
| `charges` (hits landed, 1..99) | `weapon.ammo` | NOT equal: charges are spent per blow landed, ammo per round fired (M9) |
| `name`, `power`, `tell`, `tier`, `tint` | extension | loot presentation and drop tier, V3 only |

### 3e. Mismatches flagged (nothing refactored)

- M1 `boss-weapons` row `id` names a boss-and-weapon pairing, the item is the `weapon` it points at. A core row for the item would be the weapon-defs one; the boss row is a loadout, not an item.
- M2 One `asset` per row; a boss row can carry two meshes (`equip` plus `offhand.file`).
- M3 Core `damage` and `rate` are single numbers; V3 stores damage per move and timing in ticks. Needs a stated rule (base move) or the core says "see extension".
- M4 `reach` is inherited through `extends`; the core wants a resolved value.
- M5 `ammo` is fighter state and sandbox rules in V3, not a row field.
- M6 `weapon-defs.json` and `golden-weapons.json` rows have no asset field.
- M7 `body` is a rig.json key, not a path; a core `asset` string needs a rule on what it resolves against.
- M8 `character.rig` is implied, not stored, on profiles rows.
- M9 `damageMul` and `charges` look like `damage` and `ammo` and are not.
- M10 `weapon-defs.json` lives in `src/fight/`, not `data/`; the as-data gate and `validateFile` do not cover it the way they cover `data/*.json` (see section 4).

## 4. How the as-data gate would validate core rows

What exists (read, not assumed):
- `scripts/as-data/check.mjs` (`npm run check:as-data`, test `test/as-data.test.mjs`) scans CODE in the live-zone files (`scripts/as-data/scope.json` globs) for numbers, labels, string compares and ids that belong in a data row. It does NOT read data rows. It is the reason a core field's value must live in a row and not in code.
- Row validation is `src/sim/validate.js` `validateFile(name, json)`: a per-file table of allowed top-level keys and allowed row keys (`boss-weapons`, `profiles`, `golden-weapons` each have an entry, e.g. `rows: ['id','opponent','profile','weapon','clipsAs','equip','scale','grip','material','offhand','placeholder']`), plus cross-file checks (`checkKinds`, `checkBodies`, `checkDifficulty`) and a load-time value check (`src/fight/golden-check.ts` for golden-weapons). `test/validate.test.mjs` pins it.

PROPOSED core check (a new pure function, in a later code PR, not this one), run over every row that declares `game_id`:
1. Keys: top level of a core row is exactly `id, game_id, type, asset` plus optional `weapon` or `character` plus keys named in that file's V3 allowed list (unknown keys fail, as `validateFile` already does).
2. Types and ranges: the tables in sections 1 and 2 (id regex, enum membership, finite numbers, `ammo` integer or null).
3. Uniqueness: `(game_id, type, id)` unique across all files.
4. Reference resolution: `asset` resolves against the owning game's asset root (a file that exists); a `weapon` row's `id` resolves to a `weapon-defs.json` row; `character.rig` is a `data/rig.json` rig.
5. Block/type agreement: `weapon` only on `type: weapon`, `character` only on `type: character`.
6. Core stays free of ballistics and cut: any key from a deny list (`impulse`, `lift`, `seam`, `unit`, `cut`, `projectile`, `speed`, `spread`, `mana`) inside a block fails.
7. As-data gate unchanged: it keeps scanning code; a new core reader under `src/zone/**` starts at zero findings like any new file.

Existing rows are not forced through 1 to 6 (no refactor): the check would run on rows that opt in with `game_id`, and a generated core view of an old row would be tested in a later PR if Lead wants one.

## 5. Open questions for ARMAGEDOM Lead

1. What is ARMAGEDOM's `game_id` value, and does it have a row convention (array under a named key, unique `id`) like V3's, or a table?
2. `type` enum: is `weapon` and `character` enough, or do armour, consumable and trophy need to be core types (V3 has trophies and body parts in the Flesh Market design)?
3. Is `name` core? V3 profiles and golden rows carry a display `name`; the plan's four fields exclude it.
4. `asset`: relative to whose root, and may it be a stem (V3's `equip: "maul"`) or must it be a path with extension?
5. `weapon.damage` and `weapon.rate`: single base value (which move or fire mode is the base?), or a small map? V3 has per-move damage and tick timing (M3).
6. Is `ammo` finite-count only, and should a "charges per hit landed" item (V3 golden weapons) be represented as `ammo`, as a V3 extension, or as a separate core key (M9)?
7. `character.rig`: does ARMAGEDOM have rig ids to match, or is `rig` free text each game owns?
8. Versioning: a `core_version` field on the file, or is the shape frozen once signed?
9. Where does the one shared copy of the schema live (this repo, theirs, or a third place) without either repo touching the other?
10. Confirmation that nothing here touches auth or database (the plan routes any such change through ARMAGEDOM Server & Deploy).
