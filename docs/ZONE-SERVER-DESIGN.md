# Zone server design: shared boss health + damage-share credit (live zone, phase 3)

Status: DESIGN. Nothing here is wired into the game, nothing is applied to a database, no secret is in it.
Brief: `frankendom-strategy/docs/V3-LIVE-ZONE-BRIEF-2026-10-27.md` (phase 3 and the traps).
Gate it serves: "two phones on one Minotaur, both see one bar, both get paid by share."

What ships in this PR:

| File | What |
|---|---|
| `data/zone-server-rules.json` | every number, cap, timer, pattern and label (validated by `src/sim/validate.js`, schema `zone-server-rules`) |
| `supabase/migrations/20261027000001_zone_server.sql` (+ `supabase/down/..._down.sql`) | tables and functions; the values arrive through `zone_rules_apply(rows)` |
| `src/server-model/zone-model.ts` | pure reference model of the same rules (no DB, no clock, no game import) |
| `test/zone-model.test.mjs`, `test/zone-migration.test.mjs` | the rules pinned on the model; the migration's grant/RLS/zone-id/no-bonus rules pinned on the SQL text |

## 1. The one idea

The DATABASE holds the boss's hp. A phone never owns a health bar; it only CLAIMS damage, and the server applies at most what the weapon rows and the real elapsed time allow, never more than the hp that is left. Every account's hit is subtracted from the same `zone_spawns.hp` under a row lock, so two phones on one Minotaur lower one bar. The death happens inside the hit that takes hp to 0, and credit is settled in that same transaction from the ledger of APPLIED damage. A claimed kill does not exist. (Armagedom's shape; V1's per-phone health paid two players 100% each, `damage-share.ts:5`.)

## 2. Data model

All tables: RLS on, no policy, no grant to `anon`/`authenticated`. Only the two writer roles call functions.

- **zone_config** (one row) and **zone_weapon_rules**: the loaded rows file. No column default: an unloaded database refuses every call (`O0010`) instead of guessing.
- **zone_spawns** `(instance, layer)`: the shared bar. `instance` is a string `zN:name`; `zone` is generated from the prefix; `kind`, `max_hp`, `respawn_s` fixed at the first engage; `hp`, `alive`, `generation`, `respawn_at`, `killed_at`. A check ties `alive` to `respawn_at` and `hp = 0` when dead. `layer` is part of the key because each presence layer is its own copy of the zone with its own boss.
- **zone_spawn_engages**: the one-use token: `account, character, instance, layer, generation, expires_at, last_hit_at, used_at, result`. One open per account per spawn per layer (unique index).
- **zone_spawn_hits** (the hit log): one row per accepted batch row, `applied` (never claimed) plus `claimed` kept to spot liars. 120 s expiry is applied when credit is read; `zone_hit_log_prune` removes rows older than `log.keepS`.
- **zone_kill_credit**: one row per contributor per LIFE `(instance, layer, generation, account)`: `damage, share_pct, pay_share, paid, reason (paid|floor|cap|cooldown)`. This is the payment record; a reward service reads `paid` rows. There is no bonus column.
- **zone_hit_batches**: spent batch ids with their stored receipt.

### Credit, as implemented in both the SQL and the model

1. Counted damage = the life's hit-log rows newer than `share.hitExpiryS` (120 s) at the moment of death. An expired hit still took hp; it earns nothing.
2. A contributor under the effective floor `min(share.minSharePct, share.floorEqualShareFraction x 100 / N)` percent of the counted total (N = contributors with counted damage) is not paid (`floor`). The second term keeps the floor under an equal share, so a big crowd is always paid (section 6b, item 1).
3. The paid contributors split the reward in proportion to damage; `share.renormalise` makes their shares sum to 1 (a dropped 4% does not shrink the pot; the tests also pin renormalise off).
4. Kill caps per account: `caps.killsPerMin`, `caps.killsPerHour` (paid kills). A capped contributor is recorded unpaid (`cap`); the others' shares do not move.
5. `caps.cooldownAcrossLayers`: an account paid for a spawn id in one layer is not paid again for it in another layer inside the respawn window (V1 `cooldown`).
6. No first-hit and no last-hit bonus. Nothing in the settle reads order, the time of the last blow, or who reported. The tests run the same damages in three orders and get identical shares; `parseRules` rejects any rows key containing "bonus"; the migration test rejects "bonus" in the SQL code.

### The floor: ONE pick, `min_share_pct = 5` of the counted total (Armagedom), not V1's 0.25 of the top

V1's floor is relative to the top damager. A whale who deals half the bar would erase everyone under a quarter of that, so five players at 10% each (a perfectly good fight) would get nothing. A relative floor also moves with who else showed up, so a player cannot know in advance what counts. 5% of the total is one fixed, explainable line ("under one twentieth of the bar earns nothing"), and still stops a one-hit tag-along. (A flat 5% alone paid at most 20 contributors and paid NOBODY once 21 or more dealt equal damage; the review ruled that a defect, and the effective floor above caps it at an equal share.) A test (`why 5% of the total and not 0.25 of the top`) pins the whale case. V1's 0.25-of-top is not in the rows file; if Dom wants it, it is a different `share` row shape and a one-function change in both settle implementations.

## 3. API (writer ops; the page never talks to the database)

| Op | DB function | Notes |
|---|---|---|
| `spawn_state` | `zone_spawn_state(instances[], layer)` | read-only: the bar and the database clock; every phone draws this each tick |
| `engage` | `zone_spawn_engage(account, character, token, instance, layer, kind, max_hp, respawn_s)` | token minted by the writer (`engage.tokenBytes`); refusals `dead`, `too-many`, `mismatch`; creates the spawn at first engage from the zone row |
| `touch` | `zone_spawn_touch(account, token)` | extends the token |
| `hit batch` | `zone_spawn_hit_batch(batch_id, rows)` | ONE transaction per presence tick, rows `{account, token, weapon, claimed, hits, layer}` already clamped by presence (reach, rate, weapon); each row goes through `zone_spawn_hit`, which clamps again; a failed row is reported in its slot |
| `kill_report` | `zone_kill_report(account, token)` | READ-ONLY and idempotent: returns `alive`, `settled` (with the stored share) or `unpaid`. It cannot kill. |

Change from V1: V1's `kill_report` carried the kill and so needed min hits, min time, reach vs presence and server-side replay (`world-verify.ts`) to distrust the phone. Here the phone never reports a kill, so those become the batch's own clamps: the min-hits and min-time checks are replaced by the rate/dps ceiling over real elapsed time (a boss cannot die faster than the fastest weapon could kill it); reach vs presence is checked by presence when it builds the batch (Armagedom `server/presence/server.js`); `moved` is the layer on the token vs the layer on the row. The replay verifier is not needed for hp or credit (its only remaining use is cosmetic, outside this design).

## 4. Which values are rows

All of them are in `data/zone-server-rules.json`: id patterns, token bytes and TTL, max open engages, batch size, hits per row, first-hit allowance, max elapsed, dps slack, `retryFailedBatch: false` (pinned: `parseRules` and `zone_rules_apply` both refuse true), progression damage ceiling, weapon rows (id, max damage per hit, max hits per second), `minSharePct`, `renormalise`, `hitExpiryS`, kill caps, cooldown flag, respawn min/max/default, log retention, and the refusal and pay-reason labels with HTTP statuses. The SQL carries only sanity ranges in check constraints, no value; `test/zone-migration.test.mjs` fails if a `zone_config` column has a default or is not loaded from a rows path, or if a loader path does not exist in the file. The ADMIN / migration role calls `zone_rules_apply(<file contents>)` at deploy (the writer and verifier roles cannot: it is in `adminOnlyFunctions`); the model reads the same file through `parseRules`.

The weapon rows are placeholders for the design (gladius, longsword, cleaver); the wiring PR derives them from the move table and calls `checkWeaponCoverage` so a weapon with no row stops the start. The zone row (`data/zones/zone1.row.json`, phase 1) supplies `kind`, `max_hp` (from the profile row the spawn's kind points at) and `respawnSeconds` per spawn; the DB pins them at the first engage.

## 5. Trap-by-trap

| Trap (brief) | Answer | Where it is pinned |
|---|---|---|
| Per-phone health pays twice | hp lives in `zone_spawns`; every hit subtracts from it under `for update`; applied is capped at the hp left | model `SHARED HP IS SINGLE-SOURCED`, `two clients who each "deal a full bar"`; SQL test `shared hp is single-sourced in SQL` |
| Every new DB function granted to every writer role, same migration | one revoke + one grant statement lists every function; roles come from `writerRoles` and are created in the migration | `TRAP: every new function is granted to EVERY writer role` and the roles/revoke/RLS tests |
| Zone ids are strings; `z01:` refused; zone 0 once stored as zone 1 | `instance` check `^z(0\|[1-9][0-9]*):...$`; `zone` is a generated text column with no fallback; `z0:` is a real zone | `zone ids are strings` (model and SQL pattern equal to the rows file) |
| A failed hit batch is never retried | `retryFailedBatch: false` is a pinned row; the batch id is spent on first sight (`zone_hit_batches`) and a resend returns the stored receipt and applies nothing; a whole-batch error rolls the id back, so the writer drops the tick (a lost tick beats a doubled one) | `a failed batch is never retried`, `TRAP: no bonus ... never retried` |
| Weapon damage caps must rise with progression | cap = `maxDamagePerHit x progression.maxDamageMult`; the mult is a row | `weapon caps carry the progression ceiling`. OWED: the wiring PR pins the row to the progression rows' top multiplier |
| Seamless: compile every loadout program before the zone says ready | not a server concern; the server side is `checkWeaponCoverage(ids)` so every weapon id the loadouts can send has a cap row before the zone says ready | model coverage test; the client compile step belongs to phase 1/2 (V1 `scripts/origins-seamless-check.mjs`) |
| Layer change mid-fight = `moved`; spawn `kind` fixed at first engage; rotation needs pool ids | token binds its layer; a hit naming another layer is refused `moved`, writes nothing, token stays open; `kind`, `max_hp`, `respawn_s` fixed at first engage (`mismatch` after); layers are separate bars; cooldown stops a layer hop from paying twice | `a layer change mid-fight is "moved"`, `respawn seconds are the spawn row's`, `cooldown across layers`. Rotation pool ids are the zone row's job (not designed here) |
| Phone loading and feel judged on a phone | not testable here; no client change in this PR | Dom's phone gate belongs to the wiring PR |
| Hit expiry 120 s | `share.hitExpiryS`, strict: a hit exactly 120 s old is out | `hit expiry` test |
| Kill caps per minute/hour | `caps.killsPerMin/Hour` counted from paid credit rows | the two cap tests |
| No last-hit bonus | no row, no column, no code path; order-invariance test | `NO last-hit bonus` |
| respawn_at = now + respawn_s | `respawn_at = now() + respawn_s` (the spawn's own pinned seconds, clamped to rows); lazy respawn on `spawn_state`/engage | `respawn_at` test |

## 6. Honest limits

- **The SQL is now executed in CI against a throwaway Postgres 16** (job `zone-sql`, `test/sql/zone-sql.test.mjs`, bootstrap `test/sql/bootstrap.sql`): migration, DOWN, re-apply, then every function compared with the model (60/30/10, whale, 21 and 100 equal, one player, replays, batch ids, 120 s expiry, caps, grants) and two-connection lock tests. Still NOT verified: Supabase itself (its real role set, RLS as Supabase configures it, extensions, pooler behaviour), and any load beyond the test cases. The test clock is a test-only shift of the stored timestamps (`zt.advance`); the functions take no `now` parameter.
- The model and the SQL are two implementations of the same rules; they can drift. The migration tests pin the structural rules (locks, config paths, grants, the floor and cap formulas), not every arithmetic line.
- `now()` in a batch is the transaction start, so all rows of one tick share one timestamp (deterministic, and expiry is measured from the tick of the death).
- Deadlock (partly fixed): one global lock order now holds inside a single call: the spawn row, then the engage rows of that spawn, then the per-account kill-cap advisory lock (see "Open risks from the PR #83 review"). Still open: one batch that kills on spawn C and then hits spawn D holds C's account locks while it waits for D, and a concurrent batch can hold D and want an account lock. Postgres detects the deadlock and aborts one transaction (the batch id rolls back; a lost tick is accepted, never retried). Today there is one flusher per layer (Armagedom's presence tick), which makes it rare; if that changes, sort rows by `(instance, layer)` inside the function (it then stops being "in the order given").
- Expiry only drops credit; it does not heal the boss. If Dom wants hp to regenerate when nobody has hit it for a while, that is a new `regen` row and a lazy-regen step in `zone_spawn_view`.
- A contributor paid by share gets the share as a number (`pay_share`); what the reward IS (CP, loot rolls) is the reward service's job and not designed here. Loot rolls must stay deterministic from `instance|generation|account|slot` like Armagedom's so a retry rolls the same.
- Account existence/ownership checks (Armagedom's `arma_allowed`, `arma_owns`) are omitted: V3 has no accounts table yet. The writer must authenticate the account before calling.
- Weapon rows are placeholders; the progression ceiling row is a placeholder number.
- No accounts' kill-cap state is cached; every settle counts rows (indexed). Fine at this scale.

## 6b. Open risks from the PR #83 review: what is fixed and what remains

| # | Review item | Status | How |
|---|---|---|---|
| 1 | Crowd floor: with a flat 5% row, 21 or more equal players paid nobody | FIXED in the model and the SQL | The floor is now the EFFECTIVE floor `min(share.minSharePct, share.floorEqualShareFraction x 100 / N)` percent of the counted total, N = contributors with counted damage (row `share.floorEqualShareFraction` = 0.5, validated 0 to 1). With a fraction of at most 1, an equal share always clears it, so a crowd of any size is paid and the paid shares sum to 100%. It is written as two cross-multiplied comparisons joined by OR (no division) in both `settle` and `zone_settle_kill`. A small group is unchanged (60/30/10, the whale case, a 4% tag-along in a pair are still as before); a real freeloader inside a crowd is still floored. Tests: 60/30/10, whale, 21 and 100 equal, 1 player, freeloader in a crowd. |
| 2 | Lock order: `zone_spawn_hit` locked engage then spawn; `zone_spawn_engage` locked spawn then engage | FIXED | One global order: (1) the `zone_spawns` row `FOR UPDATE`, (2) the `zone_spawn_engages` rows OF THAT SPAWN, (3) the per-account kill-cap advisory lock. `zone_spawn_hit` now peeks the token without a lock to find its spawn, locks the spawn, then locks and re-reads the token row. `zone_spawn_engage`'s expiry sweep was account-wide (it could touch tokens on other spawns while holding one spawn) and is now limited to this spawn's tokens; expired tokens on other spawns are not counted toward `engage.maxOpenPerAccount` (`expires_at > now()`) and are removed by `zone_hit_log_prune`. A text-parsing test asserts the order in the SQL. |
| 3 | Kill caps per minute/hour were not serialised across spawns (overshoot) | FIXED in the design | `zone_settle_kill` takes `pg_advisory_xact_lock(hashtextextended('zone_kill_cap:' \|\| account, 0))` per contributor, in ascending account order, before it counts that account's paid credits and holds it to the end of the transaction. A concurrent kill of the same account on another spawn waits, then counts with a fresh read-committed snapshot that includes the first kill's credit row. Tests: text-parse (lock before both counts and before the credit insert; transaction-scoped form only) and a model test (seven same-instant kills on seven spawns pay exactly `caps.killsPerMin`). The concurrency itself is NOT proven until the scratch-database run. |
| 4 | `zone_rules_apply` was granted to the verifier role too (it can rewrite caps) | FIXED | New row `adminOnlyFunctions: ["zone_rules_apply"]`. The function has no grant at all, and is revoked from public, anon, authenticated, the writer and the verifier; only the migration/admin role (the function owner) runs it, at deploy. The writer no longer loads rows at boot (section 4 is updated). The grant test excludes admin-only functions from the writer grant and asserts they appear in no grant. |
| 5 | No SQL test for the spawn-kind / max hp / respawn mismatch refusal | FIXED | A text-parse test asserts `zone_spawn_engage` refuses `mismatch` from the locked spawn row, before the dead/token logic and before any token is minted, and that the first engage is `on conflict do nothing`. |
| 6 | First scratch-database run must compare SQL and model on 60/30/10 and the whale | DONE in CI (job `zone-sql`) | Compared on 60/30/10, the whale, 21 and 100 equal, one player; two concurrent kills of one account (cap: exactly one paid, the other waits on the advisory lock); concurrent hit/engage on one spawn (both arrival orders, no deadlock); concurrent identical batch id (second returns the receipt). The cross-spawn batch hazard of section 6 was measured: Postgres broke the cycle (40P01), and the per-row exception handler swallowed it into that row's slot. |

Not fixed by this change (listed so nobody assumes): the cross-row deadlock inside one batch (section 6, "Deadlock"); N counts every account with counted damage, so a crowd of 1000 sock-puppets each dealing a sliver lowers the floor for everyone (the kill caps, the per-account hit ceilings and the 120 s expiry bound it, but there is no per-account minimum-damage row); the advisory-lock key is a 64-bit hash of the account id (a collision would only make two accounts wait on each other, never miscount).

## 7. Donor files read

Armagedom: `supabase/migrations/20261024000002_arma_world.sql` (whole), `server/presence/caps.js`, `server/data/world-rows.js` (progression ceiling), `server/presence/server.js` (hit rate clamp and flush, the "never retried" comment; the brief's `server.js:141`).
V1: `origins/server/world-spawns.ts` (ops, zone key parse, refusals), `origins/server/damage-share.ts`, `origins/server/server-rules.json` (`worldShare`), migrations `20261019113226_origins_damage_share.sql`, `20261022110000_origins_spawn_zone_zero.sql`. `world-verify.ts` was NOT read in detail (only its place in the `kill_report` flow, from `world-spawns.ts`); section 3 says why its role is not carried over, and that claim rests on `world-spawns.ts` only.
