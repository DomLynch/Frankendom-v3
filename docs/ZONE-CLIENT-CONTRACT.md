# Zone client contract: what a phone says to the zone server (live zone, phase 3, step 1)

Status: CONTRACT + CLIENT. The page side (`src/zone/shared-hp-client.ts`, `shared-hp-http.ts`, `shared-hp-chunk.ts`, rows `data/zone-client.json`) is built and tested against a fake transport. NO server exists: no writer service, no database is deployed, no secret is in this PR. Everything below about the writer is a requirement on a service that is not written yet; everything below about the SQL is read from `supabase/migrations/20261027000001_zone_server.sql` and is exact.
Reads: `docs/ZONE-SERVER-DESIGN.md` (the one idea: the database holds the boss's hp; a phone only CLAIMS damage), the PR #83/#88/#89 review notes, `data/zone-server-rules.json` (the server's rows), `src/server-model/zone-model.ts`. Donors: V1 `origins/server/world-spawns.ts` (engage/touch/kill_report ops), Armagedom `server/presence/server.js` (a clamped claim queued per tick, one batch per tick, never retried) and `writer-client.js`.

## 1. Parties and the path of one hit

```
sim Hit event (hero -> foe)            phone: shared-hp-client          writer (node, owns the DB credential)        Postgres
  damage, weapon      ->  claim per weapon, capped by the rows  ->  POST /zone/hits {batchId, rows:[1 row]}  ->  zone_spawn_hit_batch(batch_id, rows)
                                                                                                                  -> zone_spawn_hit (row lock on the spawn)
  shared bar  <-  hp in the batch answer + POST /zone/state every stateMs  <-  {hp, maxHp, killed} per row   <-  hp = hp - applied, death + credit in the same transaction
```

The phone never talks to the database, never sends an account id, never sends hp, a kill, a max hp, a kind or a respawn time. The writer authenticates the account, derives `kind`, `max_hp` and `respawn_s` from the zone row (`data/zones/zone1.row.json` and the profile row its `kind` points at), mints the engage token, and calls the SQL functions. The database applies at most what the weapon rows and the real elapsed time allow, never more than the hp left; a death settles credit in the same transaction (`zone_settle_kill`). A claimed kill does not exist.

## 2. The five routes (phone to writer)

JSON in, JSON out, POST, one base URL (`?sharedhp=1` = this page's own host at `data/zone-client.json` `path` = `/zone`; or `?sharedhp=https://host/path`, accepted ONLY when that host is this page's own host or is listed in the `hosts` row of `data/zone-client.json`, default none; a link cannot aim the fetch at an arbitrary host. Cookies are sent `same-origin`, and `include` only for a listed cross-origin host). Routes are rows (`routes`): `/engage`, `/touch`, `/hits`, `/state`, `/kill`. Credentials ride the writer's own session (cookie or bearer; not designed here: V3 has no accounts table yet, see section 8). A refusal is DATA: the body has `refused` and the HTTP status is the row's status (`dead` 409, `too-many` 429, `moved` 409, `weapon` 422, `token` 409, `mismatch` 409); the client reads the body whatever the status. Any other non-2xx must carry `{error: <SQLSTATE or O-code>, message}` when a SQL function raised, so the client can class it (section 5).

| Route | Phone sends | Writer calls | Answer (exactly the SQL's jsonb, minus what the phone must not see) |
|---|---|---|---|
| `/engage` | `{instance, layer}` (`layer`: the page's presence layer; the writer should replace it with presence's own record when it can) | `zone_spawn_engage(account, character, token, instance, layer, kind, max_hp, respawn_s)`; `token` = `engage.tokenBytes` (12) random bytes as base64url (16 chars, matches `ids.tokenPattern`); `kind`, `max_hp`, `respawn_s` from the zone row | ok `{token, instance, layer, generation, hp, maxHp, expiresAt}`; refused `{refused:'mismatch'}` or `{refused:'dead', respawnAt}` or `{refused:'too-many'}`. Engaging the same live life again returns the SAME open token (the minted one is ignored), so engage is idempotent |
| `/touch` | `{token}` | `zone_spawn_touch(account, token)` | `{expiresAt}`; raises `O0009` when the token is unknown, used or expired. Sent when the phone has not reported a hit for `timing.touchMs` (30 s; the token lives `engage.ttlS` = 120 s after its last hit or touch) |
| `/hits` | `{batchId, rows:[{token, weapon, claimed, hits, layer}]}` (the client sends exactly ONE row) | `zone_spawn_hit_batch(batch_id, rows)` with `account` added to each row by the writer | `{replayed, results:[slot]}`, one slot per row in order. A slot is `{token} ||` one of: `{applied, hp, maxHp, killed:false}`; `{applied, hp:0, maxHp, killed:true, respawnAt, credits:[...]}`; `{refused:'weapon'|'moved'}`; `{refused:'dead', respawnAt}`; `{error:<sqlstate>, message}` for a row whose function raised (a deadlock `40P01` is here, not a failed call). The writer MUST strip `credits` before answering a phone (it lists other accounts) |
| `/state` | `{instances:[...], layer}` | `zone_spawn_state(instances, layer)` (read-only; a dead spawn whose `respawn_at` has passed reads alive at full hp, `generation + 1`) | `{now, spawns:[{instance, layer, zone, kind, alive, hp, maxHp, respawnAt, generation}]}`; a never-engaged spawn is not listed. This is what every phone in the area draws as THE bar. Presence may push the same `spawns` entries to everyone each tick instead (Armagedom does); the client takes either through the same `applyView` |
| `/kill` | `{token}` | `zone_kill_report(account, token)` (read-only, idempotent, cannot kill) | `{state:'settled', paid, reason, sharePct, payShare}` (`reason` one of `paid`, `floor`, `cap`, `cooldown`), or `{state:'alive', hp, maxHp, open}`, or `{state:'unpaid', reason}`; raises `O0009` for a token this account never had |

### Batch ids

`batchId` matches `ids.batchIdPattern` (`^[A-Za-z0-9_.:-]{8,96}$`). The client builds it from rows: `<idPrefix>.<session>.<counter>` (`hp.<uuid>-1.7`): the session is random per page load, the counter only ever goes up, and an id is never reused, not even after a failure. Two layers dedupe on the server side:
1. The writer keeps a short in-memory set of batch ids it has already forwarded per account; a repeat is answered `{replayed:true, results:[]}` and never reaches SQL.
2. In SQL, `zone_hit_batches.batch_id` is spent on first sight; a repeat returns the stored receipt and applies nothing.
When the writer coalesces many phones' rows into one SQL batch per presence tick (the recommended path, section 7), it mints the SQL batch id itself (`w.<boot id>.<tick>`); the phone's id is then only the writer's dedupe key.

### One row per token per batch

`now()` is frozen for a whole batch, so a SECOND row for the same token in one batch sees elapsed 0 and applies 0 damage (PR #89 review). The client therefore sends one row per batch; if two weapons were swung in a window, the weapon with more pending damage goes and the other waits for the next flush. A coalescing writer must keep one row per token per SQL batch.

## 3. The state machine (what the page does)

`createSharedHp({transport, instance, layer, session, weapon?, onBar, onPhase, onKill})`, pure: no timer, no clock, no fetch inside. The host calls `start(nowMs)`, feeds `hit(simEvent)`, and calls `tick(nowMs)` every `timing.tickMs` (the chunk's one `setInterval` does that for every client).

Phases: `idle` -> `engaging` -> `engaged` -> `dead` -> (respawn) `engaging` ...; `off` is terminal for this boss (stop class: the sim's own bar stays the truth).

- **engage**: `/engage`; ok -> `engaged`, bar from the answer; `refused` -> the refusal row's action.
- **claim** (`hit`): only a sim `Hit` with actor = `sim.heroSide` and target = `sim.foeSide`, while `engaged`. Weapon = the event's `weapon`, else the page's `weapon()`. Per hit `min(damage, weaponCap)`, summed with a hit count per weapon. A non-number, NaN, Infinity, zero, negative damage or a weapon with no server row is dropped and counted (`dropped`).
- **flush** (every `timing.flushMs` = 250 ms, one batch in flight at a time): build one row (section 4), send, handle the answer. The part above the ceiling is dropped (the server would drop it); pending damage is never saved up to be sent later.
- **read back**: the batch answer carries the hp after this row; `/state` every `timing.stateMs` (250 ms) carries everyone's. The bar is monotone inside one life (`min` with the current value), so a slow answer cannot raise it; an answer for an older generation is ignored; a new generation resets it.
- **heartbeat**: `/touch` after `timing.touchMs` without a report.
- **death**: own slot `killed:true`, or a `dead` refusal, or `/state` showing the spawn dead at our generation (another phone struck the last blow): bar to 0, pending dropped, phase `dead`. If this phone had ANY applied damage in the life it asks `/kill` (the credit is by damage share, never the last hit) every `kill.retryMs` up to `kill.tries` while the answer is `alive`/an error, then tells the page once (`onKill`): `paid: true|false` only when the server said so, `null` when it never answered. A phone that applied nothing does not ask.
- **respawn**: `/state` shows the next generation alive -> engage again (after the credit of the last life has been read; it needs that life's token).
- **offline**: any failed whole call sets a backoff (`backoff.baseMs` x `factor`^(n-1), at most `maxMs`; every channel waits). After `backoff.offlineAfter` consecutive failures the bar is marked `stale` and `shownHealth` falls back to the sim's own bar. A call that gets through ends the stale mark; it does not cancel a backoff another call set.

### How the shared bar and the sim's bar relate in THIS step

The sim's own health is the truth of the local fight and nothing changes it: the sim is untouched (Gate 0 unaffected), nothing feeds `hit()` from the page and nothing draws `bar()` yet. The shared bar is a second number, presentation only. `shownHealth(sim, bar)` / `presentBar(meter, sim, bar)` are the one place that will choose what the boss's `#target-health` meter shows (the fresh shared bar, else the sim's), called from the wiring PR where `hud.ts` feeds the meter. Until that PR, with the flag on, the chunk makes an inert handle (`window.__v3SharedHp`) and calls nothing. What the wiring PR owes: feed `practice.events` Hit events; make the sim's foe max health equal the writer's `max_hp` for that kind (one profile row, pinned by a test, since the claim is in the sim's damage units); decide what the sim does when the shared bar reaches 0 before the sim's own hp does (the kill, the corpse and the cut stay the sim's).

## 4. Clamp rules (every number a row)

The phone's claim is held to the same rows the database caps with: `data/zone-server-rules.json` `weapons` x `progression.maxDamageMult` (the client imports the file, so there is one source), `hit.*`.

| Rule | Value (rows) |
|---|---|
| per-hit damage cap | `weapon.maxDamagePerHit x progression.maxDamageMult` (gladius 14 x 2.5 = 35, longsword 20 x 2.5 = 50, cleaver 30 x 2.5 = 75) |
| elapsed | first report of a token: `hit.firstHitAllowanceS` (1 s); later: real seconds since the last send, at most `hit.maxElapsedS` (5 s) |
| hits in a row | `min(pending hits, hit.maxHitsPerRow (50), ceil(weapon.maxHitsPerS x elapsed x hit.dpsSlack (1.25)))`, at least 1 or the row waits |
| claimed in a row | `min(pending claimed, hits x cap, cap x weapon.maxHitsPerS x elapsed x dpsSlack)` |
| always | a finite number > 0 (`NaN` passes the SQL as the string `'NaN'` and is then capped, so the phone and the writer must never forward it) |
| rows per batch | 1 from this client; SQL allows `hit.maxBatchRows` (200) |
| server side | the database clamps again (the same formula over the token's own `last_hit_at`, then `s.hp`); presence/writer should reject a row whose `claimed`/`hits` are not finite numbers and re-clamp with the same caps |

Gap (honest, owed): the sim has 13 weapon ids (`longsword, trident, cleaver, estoc, knife, gladius, scythe, maul, reaper, warhammer, bow, staff, bite`) and the server rows have 3 placeholders. A hit with an unlisted weapon cannot be capped, so the client drops it (`dropped`). The wiring PR derives the rows from the move table and calls `checkWeaponCoverage` so a missing weapon stops the start.

## 5. Error handling, by CLASS (rows `refusals`, `sqlClasses`, `transportClasses`, `fallback`)

The PR #89 review: the writer treats ANY error in a result slot as a lost row (40P01 included), never assumes a batch id can be resent, and handles `z01` (SQL `23502`, model `O0002`) and the duplicate token (SQL `23505`, the model overwrites) by CLASS, not by one exact code. A code is matched by PREFIX against the rows in order, first row wins; nothing matched is the fallback row (`lost`). Actions are a closed set: `lost` (this row's damage is gone), `reengage` (drop the token, engage again after `delayMs` or `timing.engageRetryMs`), `dead`, `backoff` (every channel waits; a failure, counts toward stale), `wait` (every channel waits, not a failure), `stop` (stop sharing this boss), `block` (never claim this weapon again).

Where a code appears: a slot's `error` in `/hits`; the body `error` of a failed `/touch`, `/kill`, `/engage`, `/state`.

| Class | Codes (prefix) | Cause | Action |
|---|---|---|---|
| `token` | `O0009` | token unknown, used or expired | `reengage` |
| `unloaded` | `O0010` | the rows were never loaded into `zone_config` | `wait` (the row is lost; every channel waits `backoff.baseMs`; a server ANSWER, so it never counts toward a stale bar) |
| `privilege` | `42501`, `42883` | a function not granted to this role / not there (the both-writer-roles trap) | `stop` |
| `input` | `O0002`, `22`, `23502`, `23514`, `42` | bad shape: token/batch id pattern, `z01:` instance (`23502` on the generated zone column), a check constraint | `stop` (a client bug; retrying cannot help) |
| `conflict` | `23505` | duplicate token (the writer minted a colliding one) | `reengage` (a new token) |
| `transient` | `40` (`40P01` deadlock, `40001`), `55P03`, `57` (`57014` timeout), `53`, `08`, `25` | lock/timeout/connection class | `lost` (the row only; the fight goes on) |
| anything else | any other code | unknown | `lost` (fallback) |

| Whole-call failure | Match | Action |
|---|---|---|
| `offline` | no answer (`kind: offline`) or timeout (`kind: timeout`, `timing.timeoutMs` 2 s) | `backoff`; a hit batch is lost |
| `auth` | HTTP 401-403 | `stop` |
| `busy` | HTTP 429 (not a refusal body), 500-599 | `backoff` |
| anything else | other statuses | `lost` |

| Refusal (data, any status) | Action |
|---|---|
| `dead` | `dead`: bar 0, wait for the respawn, ask for credit if this phone contributed |
| `too-many` | `reengage` after 5 s |
| `moved` | `reengage` at once, naming the page's current layer |
| `weapon` | `block` that weapon |
| `token` | `reengage` |
| `mismatch` | `stop` (the spawn does not match its first engage: a zone row problem, not a retry problem) |

Also by design: a batch answer with the wrong slot count, another token, or `replayed:true` is a lost row (a replay applies nothing; counted `replays`); a whole-call error leaves it unknown whether the batch committed, so it is lost and never resent.

## 6. The retry rule

- NEVER resend a batch id. A failed batch is LOST (a lost tick beats a doubled one): timeout, 5xx, a dropped connection, an error slot, `replayed`, a wrong-size answer. The rows pin it: `hit.retryFailedBatch` is `false`, `parseRules` and `zone_rules_apply` both refuse true, and the client has no resend path (`test/zone-client.test.mjs` pins that nothing is sent twice after a lost row).
- A whole-batch SQL error rolls the batch id back (it is unspent in the database), and a statement timeout aborts the whole batch the same way; the rule does not change: the writer cannot know the first attempt did not commit (a timeout can follow a commit), so it drops the tick.
- Idempotent calls may be asked again, under the backoff: `engage` (same live life -> same token), `touch`, `state`, `kill_report` (read-only).
- The damage of a lost batch is not re-added to the next one: the next batch carries only the hits made since.

## 7. Where the writer sits, and pg or Supabase RPC

NEW node service `server/zone/` (not in this PR), next to `server/presence/`, same VPS, loopback bind like presence (`data/presence.json` `host`), reached through the same reverse proxy under the `/zone` path (`data/zone-client.json` `path`). It is the only holder of the database credential. Presence does not hold one (Armagedom's rule: presence calls the writer's internal routes with a shared key). Two ways to reach it, same SQL:
- Step 1 (simplest, what the client speaks today): the phone POSTs to the writer; one SQL batch per phone flush (one row). Cost: one transaction per phone per `flushMs` = 4 per second per fighter.
- Step 2 (recommended before a crowd): phones send their claim over the presence socket; presence clamps (reach, rate, weapon: it knows positions) and the writer coalesces ALL rows of a presence tick (100 ms, `presence.json` `tickMs`) into ONE `zone_spawn_hit_batch`, with its own batch id, one flusher per layer (also what keeps the cross-row deadlock of the design rare). The client's transport is replaced by a socket transport; the state machine does not change.

**Driver: `pg` (node-postgres), not Supabase RPC.** `pg` 8.16.3 is already a devDependency (the CI `zone-sql` job runs the SQL through it). Reasons:
1. The SQL functions are revoked from `public`, `anon` and `authenticated` on purpose and granted only to the NOLOGIN roles `frankendom_zone_writer` / `frankendom_zone_verifier`. A direct `pg` connection as a LOGIN role that is a member of the writer role (INHERIT) calls them as designed. Supabase's REST RPC would run them as one of Supabase's own API roles (`service_role` with the secret key) and would need the Data API exposed on the schema and that role granted: more surface, and not what the migration grants.
2. Error fidelity: the classes in section 5 are SQLSTATEs and O-codes. `pg` gives `err.code` exactly; how PostgREST relays a custom `O0009` is not verified here.
3. One statement, one transaction: `select public.zone_spawn_hit_batch($1, $2::jsonb)` is a single implicit transaction, so the row locks, the per-row subtransactions, the advisory kill-cap lock (`pg_advisory_xact_lock`, transaction-scoped) and the death settle behave the same through any pooler.

Pooler caveats (from the PR #89 limits; NOT verified on Supabase): prefer a direct or session-mode connection from the long-lived writer (it is not serverless; a small pool, `max` 4 or so, is plenty with one flusher per layer); if the transaction-mode pooler is used, run only single-statement calls, do not name prepared statements, never use session state (`SET ROLE`, session advisory locks, `LISTEN`): use `begin; set local role ...; select ...; commit` in one round trip if a role switch is needed; set a `statement_timeout` shorter than the writer's HTTP timeout (a timeout aborts the whole batch, id unspent, tick dropped); a connection drop mid-call has an unknown outcome (drop the tick). Supabase's real role set, RLS as Supabase configures it, extensions and load are unverified (design doc, section 6).

## 8. Not decided here / owed

- No writer, no auth: how the writer learns the account and character (V3 has no accounts table; `arma_allowed`/`arma_owns` were omitted from the migration). The account must be authenticated before any SQL call.
- No deployment of any database; `zone_rules_apply(data/zone-server-rules.json)` is an admin step at deploy.
- The wiring PR: feed the sim's Hit events, weapon rows from the move table, sim max health equal to `max_hp`, drawing the bar, what the sim does at shared 0, the corpse and cut cue.
- Phone feel (latency of the bar at `flushMs`/`stateMs` 250 ms) is a Dom-phone judgement, not tested here; the two timings are placeholders in `data/zone-client.json`.
