# Zone live design: one shared world (PR D, design only)

Status: DESIGN. Docs only. No code, no row, no secret, no deployment in this PR. Everything below is a plan for later PRs; each is listed in section 6 with files, owner and test plan.

Dom's ask (2026-10-27): "a real live MMO feel": free roaming across a zone, many players and many bosses in the same live world, no instanced loading, others can attack a boss at any time.

Reads this builds on (all on main unless marked): `docs/ZONE-CLIENT-CONTRACT.md` (phone to writer, five routes), `docs/ZONE-SERVER-DESIGN.md` (the database holds boss hp, a phone only claims), `docs/PRESENCE.md`, `data/presence.json`, `data/zone-client.json`, `data/zone-server-rules.json`, `data/zones/zone1.row.json`, `src/zone/shared-hp-client.ts`, `server/presence/{server,interest}.ts`, `deploy/presence/README.md`. In flight by other agents and ASSUMED here, not read: PR A (free walk beyond the pit), PR B (spawns across the zone, ground drawn, one held sim near the hero), PR C (cut scene-change cues). If A/B/C land differently from the assumptions in section 1, this doc is amended, not the other way round.

What exists today, so nothing below is mistaken for new:

| Piece | State | Where |
|---|---|---|
| Presence service (positions only, no pay) | LIVE on the VPS (`frankendom-v3-presence`, loopback 8794, nginx `/presence`), page client behind `?presence=` | `server/presence/`, `src/presence/`, `deploy/presence/` |
| Presence zone frame (spawn 226/47, wire carries zone-frame metres) | MERGED (#118) in code and `data/presence.json`; the RUNNING process still has the old build until Deploy restarts it | `data/presence.json` `spawn`, `spawnAbout` |
| Shared hp CLIENT (state machine, fake transport tested) | MERGED, behind `?sharedhp=`, not wired into the fight, no server | `src/zone/shared-hp-*.ts`, `data/zone-client.json` |
| Zone SQL (hp under a row lock, damage-share credit) | MERGED, executed in CI job `zone-sql`, deployed NOWHERE | `supabase/migrations/20261027000001_zone_server.sql` |
| Writer service (`server/zone/`) | DOES NOT EXIST | contract: `docs/ZONE-CLIENT-CONTRACT.md` |
| Local zone loop: spawns, respawn timers, aggro, multi-attacker | MERGED, per page, local-only state | `src/zone/spawns.ts`, `attackers.ts`, `data/zones/zone1.row.json` |

## 1. The authority split

One rule decides every line of this section: **the client simulates and draws; the server remembers what must be the same for everyone.** Nothing the server remembers may change how the local sim plays frame to frame (Gate 0 replay, the single fight).

### 1.1 What stays on the phone (presentation and the local fight)

- The duel sim (`src/fight/sim`): each phone runs its own copy of the boss duel against its own hero, exactly as today. Boss brain, moves, attack timing, the hero's health, stamina, specials, knockdown and finish windows (`data/feel-sim.json`) are local and deterministic. A boss that fights two players is two sims, one per phone; each boss attacks only its own phone's hero. This is the deliberate "solo-sim stays local" answer (section 4).
- Ragdoll, cuts, camera, sound, feel modules: Physics Dev's, presentation only, never an input to a shared number.
- The local copy of "which spawn is held, which are frozen copies" (`src/zone/spawns.ts`, PR B's one held sim near the hero).
- Hero health and death/respawn of the HERO (`zone1.row.json` `respawn`): local. Nobody else needs your hero's hp. Death of a hero is not shared state in this design (open question 8 for PvP).

### 1.2 What the server owns (the shared writer)

| Shared fact | Owner | Today | Wire |
|---|---|---|---|
| A boss's hp, max hp, alive flag, generation (life number) | Postgres `zone_spawns`, via the writer | local per page | `/engage`, `/hits`, `/state` |
| A boss's death moment and respawn time (`respawn_at`) | Postgres, computed from the zone row's `respawnSeconds` at the hit that takes hp to 0 | local `deadFor` timer in `spawns.ts` | `/state` answer carries `respawnAt` |
| Who dealt how much, who is paid | Postgres, `zone_settle_kill` | none | `/kill` (read only) |
| Where the other players are | Presence service memory (no DB, loses nothing on restart) | live | WebSocket `/presence` |

The database stays the ONLY place a boss's hp lives. A phone claims damage; the database applies at most what the weapon rows and real elapsed time allow (`hit.dpsSlack`, `maxElapsedS`, `progression.maxDamageMult`). The phone never sends hp, a kill, a respawn time or an account id (contract section 1).

### 1.3 Presence in the zone frame (226/47 and the redeploy owed)

- Wire coordinates are zone-frame metres encoded as centimetres in a 65535 cm square centred at 32768 cm (`data/presence.json` `frame`). `rules.walkHalfCm` = 30000 gives a walkable square of 300 m each way around the frame centre, so the zone row's coordinates (yard x 186-214, pit x 217-235, z 33-61; later whatever PR A/B adds) fit with room to spare. If PR A/B draw a zone wider than 300 m, `walkHalfCm` must be raised in the same PR (a row; the frame itself caps at 327 m each way).
- New joiners start at `spawn` {226, 47}. The page adds the pit centre before sending and subtracts it before drawing (`spawnAbout` in the row); #118 fixed the page and the row. **Owed to Deploy:** restart `frankendom-v3-presence` on the VPS from a checkout that includes #118 so the running process reads the 226/47 row (`SPAWN` in `server/presence/interest.ts` is computed at import). Receipt required: `GET /presence/health` after the restart plus two phones in one layer seeing each other near the yard, not at world origin. The restart drops all sockets (clients reconnect with the existing backoff, `giveUp` 6 tries); no data is lost because presence holds none. Rollback: `deploy/presence/README.md`.
- Presence positions are NOT trusted for pay. The writer never reads presence for damage. In step 2 (section 3.3) presence clamps reach and rate before a claim is queued; until then the weapon rows alone bound a claim.

### 1.4 The spawn to instance mapping (the key everyone must share)

Every boss in the zone row gets one stable instance id: `z<zoneId>:<spawn id>`, e.g. `z1:yard-pitborn` (matches `ids.instancePattern` in `data/zone-server-rules.json`). Rows are keyed `(instance, layer)`. The page derives it from the zone row (`data/zones/index.json` default zone id, `spawns[].id`), never from an array index (PR B will add spawns; indices move, ids do not). A new function `instanceId(zone, spawn)` in `src/zone/shared-ids.ts` is the one place; a test pins that every spawn id in every zone row matches the pattern and is unique.

### 1.5 Layer is the shard

Presence already puts players into numbered layers (soft cap 20, hard 24, at most 20 layers, `emptyLayerMs` 5 minutes). The SQL already keys a boss by `(instance, layer)`. So the shared world a player sees is "the layer he is in": everyone in layer N shares the same boss hp and respawn timers; layer M has its own copies. This is a shard, not an instance: nobody loads anything, you join the fullest layer under the soft cap and walk. It gives the MMO feel up to ~20 simultaneous players per world copy and bounds every cost. The trade (a "friend" join into a layer up to 24, and a full world needing a second copy) is open question 1.

The page must send the layer it is really in. Today `/engage` takes a page-supplied `layer`; the contract says the writer "should replace it with presence's own record". That replacement is a hard requirement of the live design (section 2.4), otherwise a phone could hit a boss in a layer it is not in.

## 2. What the writer service must own

New node service `server/zone/` (does not exist), loopback bind next to presence, reached through nginx under `/zone` (`data/zone-client.json` `path`). It is the only holder of the database credential. Driver `pg` (not Supabase RPC), reasons in contract section 7. Sketch of files (section 6 owns the split):

```
server/zone/main.ts        env, pg pool (max 4), listen 127.0.0.1:<zonePort row>, graceful close
server/zone/routes.ts      five POST routes + /zone/health; refusal rows -> HTTP status
server/zone/rows.ts        reads data/zone-writer.json (new rows) and data/zone-server-rules.json
server/zone/auth.ts        who is this phone (section 2.4)
server/zone/derive.ts      kind, max_hp, respawn_s from the zone row + profile + difficulty (2.3)
server/zone/flusher.ts     step 2: per-layer coalescing of one presence tick into one batch (3.3)
deploy/zone/               systemd unit, nginx include, README with rollback (copy deploy/presence/ shape)
```

### 2.1 The shared hp client, `?sharedhp=`

The page side (`src/zone/shared-hp-client.ts`, chunk `shared-hp-chunk.ts`, HTTP transport `shared-hp-http.ts`) is built and test-covered against a fake transport. What the writer must honour for it, exactly:

1. The five routes and statuses of contract section 2 (`dead` 409, `too-many` 429, `moved` 409, `weapon` 422, `token` 409, `mismatch` 409), `/hits` answers one slot per row in order, and `credits` stripped from every phone answer.
2. Error classes by SQLSTATE and O-code as in `data/zone-client.json` `sqlClasses` (`O0009` token, `O0010` unloaded, `40*` transient...). A SQL error on `/engage` or `/touch` answers non-2xx with `{error, message}`.
3. Never resend a batch id. The writer drops a tick on timeout; it never retries `zone_spawn_hit_batch` (`hit.retryFailedBatch` false is a pinned row).
4. `statement_timeout` shorter than the HTTP timeout (`timing.timeoutMs` 2000), so a stuck batch is aborted by the database, not left to a client abort that may follow a commit.

### 2.2 Fixes already listed in the state note, as owed PRs

| # | Fix | Where | Why |
|---|---|---|---|
| F1 | **Any error inside a batch slot is a lost row.** A slot of `{error, message}` (a deadlock `40P01` arrives as a slot, not a failed call) must classify through `sqlClasses` and count as lost; today a slot error can read as an ordinary answer | `src/zone/shared-hp-client.ts`, `test/zone-client.test.mjs` | the client must not apply, display or "re-add" a row the database did not apply |
| F2 | **`max_hp` must equal the sim foe's max health.** The writer derives `max_hp` from the zone row, but the sim's foe health comes from the opponent profile times the difficulty rows (`data/difficulty.json`, default level 5). If they differ the bar the player sees (shared) disagrees with the sim's, and the "shared reaches 0 no later than local" invariant (section 4.2) breaks | new pure function `sharedMaxHp(profile, difficultyLevel)` in `src/zone/shared-health.ts`, used by BOTH `server/zone/derive.ts` and the sim setup; test pins writer value == sim value for every spawn kind at every difficulty row | one source of truth, no copied number |
| F3 | **3 server weapon rows vs 13 sim ids.** `data/zone-server-rules.json` `weapons` has `gladius`, `longsword`, `cleaver`; the sim reports 13 weapon ids on its Hit events. An id with no row is refused `weapon` (422) and the client blocks it, so most swings would claim nothing | one derived table: either (a) `weapons` generated from the move table by `scripts/zone-weapons.mjs` into `data/zone-server-rules.json` (CI fails if stale), or (b) a row `weaponMap` {simId -> serverWeaponId} in `data/zone-client.json`; test: every sim weapon id resolves, and the cap for a mapped id is >= the real maximum hit for that id (so a legitimate heavy is never refused) | the database must know every weapon the sim can swing |

F1 is client only and independent; F2 and F3 need Strategy's sign-off on the source of the numbers (rows are Strategy's).

### 2.3 The writer derives, the phone never says

From the zone row and the data rows only: `kind` (profile id of the spawn), `max_hp` (F2 function), `respawn_s` (`spawns[].respawnSeconds`). `zone_spawn_engage` already refuses `mismatch` if the spawn's stored values differ; this is what makes a client on `?difficulty=legacy` or an edited local row unable to poison a shared boss. A mismatching phone is told `mismatch` (`stop`) and plays the boss locally, unshared (its bar is the sim's, its hits are not counted). A shared boss therefore has ONE difficulty per zone: a zone row `difficulty` field (default the live default, 5), not per-player choice. Open question 4.

### 2.4 Who is this phone (authentication)

V3 has no accounts table. Contract section 8 leaves this open. Plan (smallest thing that is honest):
- Presence already mints a server-side key per joined socket (`World.join(key, ...)`, "a fresh player whose key the server mints"). Presence adds, in its join reply, a short-lived HMAC `session` = `hmac(secret, key | layer | expiry)`. The page sends it as a bearer on every `/zone/*` call.
- The writer verifies the HMAC with the same secret (env on both, never in rows, argv, commits or chat) and takes `account = key` and `layer` from it. This is what replaces the page-supplied layer (section 1.5) and gives the SQL an account id it can credit.
- Consequence: an anonymous key pays nothing real yet. Credit rows accrue to a throwaway id until real accounts exist; the SQL is already account-agnostic. Real accounts is Strategy's call (open question 3). Until then shared hp works (the point of the gate "two phones, one bar") and "paid" means "recorded".
- The HMAC secret and the database credential are secrets: Deploy creates and stores them; nothing here contains one.

### 2.5 The database

`supabase/migrations/20261027000001_zone_server.sql` is deployed nowhere. Two ways: a Postgres on the VPS (no new spend, a service to run and back up), or a Supabase project (a monthly cost). **Spending money Dom has not approved is fixed**, so the default in this plan is Postgres on the existing VPS behind loopback, with a nightly `pg_dump`. Supabase only on Dom's explicit approval (open question 2). Either way: apply the migration as the admin role, then `zone_rules_apply(data/zone-server-rules.json)` as the admin step; the writer role is a LOGIN role that is a member of `frankendom_zone_writer` (contract section 7).

## 3. Interest management and caps

### 3.1 Players (presence, already built)

Spatial grid (`cellCm` 1600 = 16 m), `radiusCm` 4000 (40 m) neighbourhood, distance tiers (`tier1Cm` 12 m every tick, `tier2Cm` 25 m every 2nd, `tier3Cm` 40 m every 5th), `nearCap` 40 per client, `drawMax` 8 drawn, `maxMessage` 64 bytes, `perSecond` 30 messages, per-IP 16 sockets and 30 joins/minute. A layer holds 20 (soft) to 24 (hard); at most 20 layers (480 players per box). These rows are unchanged by this design. Free roaming over a 300 m square with 20 players is far under every cap: the grid already makes cost proportional to neighbours, not to the zone.

### 3.2 Bosses (new: scoped `/state`)

Today `/state` takes `{instances:[...], layer}` and answers every instance listed. With spawns across a zone (PR B) the phone must not poll all of them every `stateMs` (250 ms). Rules (new rows in `data/zone-client.json`):
- `state.radiusMetres` (suggest 80): the phone lists only spawns within that distance of the hero, from the zone row it already has. At most `state.maxInstances` (suggest 8) per call; the writer refuses more (input class, `stop`).
- Spawns outside the radius refresh at a slow `state.farMs` (suggest 5000), only the alive/dead flag and `respawnAt` matter for a distant frozen copy.
- The writer caches `/state` per `(instance, layer)` for one tick (100 ms) so N phones in one layer cost one read per tick, not N.
- A boss the hero engages is polled at `stateMs` as today; the batch answer already carries hp for his own hits.

### 3.3 Hits (step 1 now, step 2 before a crowd)

- Step 1 (what the client speaks): one `/hits` call per phone per `flushMs` (250 ms), one row per call: 4 transactions per second per fighter. Fine for the two-phone gate and a handful of testers; at 20 fighters in one layer that is 80 tx/s on one VPS Postgres, still modest, but with row-lock contention when many hit one boss.
- Step 2 (recommended before more than ~8 fighters on a layer): phones send claims over the presence socket (new up-message in `src/presence/wire.ts`, size inside `maxMessage` 64 bytes); presence clamps reach (it knows positions) and rate, and `server/zone/flusher.ts` coalesces ALL claims of one presence tick (100 ms) of one layer into ONE `zone_spawn_hit_batch` with its own batch id: one transaction per layer per tick, lock order identical, the cross-row deadlock of the design stays rare. The client transport is swapped, the state machine does not change. Gate to enter step 2: the load test in section 6 shows p95 batch latency over 250 ms at the target fighter count.

### 3.4 Caps that bound the whole design

| Resource | Cap | Row |
|---|---|---|
| Players per layer | 20 soft, 24 hard | `presence.json` `softCap`, `hardCap` |
| Layers | 20 | `maxLayers` |
| Open engage tokens per account | 4 | `zone-server-rules.json` `engage.maxOpenPerAccount` |
| Bosses an account can fight at once | 3 | `src/fight/world-rules-defs.json` `maxAttackers` (client) |
| Rows per batch | 200 | `hit.maxBatchRows` |
| Instances per `/state` call | 8 (new) | `zone-client.json` `state.maxInstances` |
| Writer DB connections | 4 | `server/zone` pool `max` |

Raising player caps beyond 24 is NOT in scope; it needs a load test and a decision (open question 1).

## 4. How a boss's fight works with several players

### 4.1 Who holds the sim: everybody, for himself

No player and no server "holds" a boss fight. Each phone runs its own duel sim for the one boss it is engaged with (PR B: one held sim near the hero; the other bosses it can see are frozen copies). Player A and player B both striking `z1:yard-pitborn` each have a local Pitborn in their own sim, that attacks only them. The server never runs a sim and never sees a move. This keeps the single fight, Gate 0 replay, determinism and the phone's frame budget exactly as they are: the shared layer is a bookkeeping layer around the sim, not a netcode.

Consequence stated plainly (a limit to tell Dom): in this design you see another player's sword on his remote avatar (presence, #98/#103), and you see the boss's shared bar drop when he hits it, but you do not see the boss turn to him: A's boss is fighting A. A true shared fight (one boss body reacting to two heroes in the same world) needs a host-authoritative or server-authoritative boss and is a separate, larger design (section 7, open question 6). The design here is the staged path to the live feel, not the final netcode.

### 4.2 The reconciliation rule (the one new piece of client logic)

Per engaged boss, each frame the host (wiring PR) does three things, all outside the sim step so the sim stays deterministic:

1. **Claim (already built).** The sim's Hit events from the hero on the foe become claims (`shared-hp-client` `hit`), flushed per `flushMs`.
2. **Pull the local foe down, never up.** If `bar.fraction` (shared) is below `sim.hp / sim.max`, the host applies an external-damage record to the sim foe to the shared fraction. It enters the sim as a recorded input event with its own type (like `feel:kick` rows), is deterministic on replay, and `shownHealth` (already written) draws the shared bar. The bar only goes down within one life (the client already enforces it), so a late answer cannot heal the boss.
3. **Kill follows the server.** When shared `hp` reaches 0 (`killed:true` in a slot, or `alive:false` from `/state`), the host kills the local foe through the existing kill path (`spawns.kill`, ragdoll, corpse, loot/credit toast). Whoever struck the last blow, the kill is the same event for everyone; credit is by damage share, no last-hit bonus (`zone-server-design` section 2).

Invariant that makes it sane: with F2 (shared max hp equals sim max hp) and caps with slack, each phone's own damage is a subset of the shared damage, so shared hp reaches 0 no later than the local foe's would. Two cases break it, both handled by rows (new, `data/zone-client.json` `reconcile`):
- **Local kill before the server agrees** (the server clamped some claims, so shared is above 0 while the sim foe is dead): the host holds the foe at the sim's last frame in a "reeling" state for at most `reconcile.settleSeconds` (suggest 2) while one more claim for the remainder is flushed; if the server still says alive, the local kill stands (the player's feel wins), the bar shows what the server says, the claim counts as `unpaid` for the missing share, and the spawn is not marked dead for others. Strategy confirms (open question 5).
- **Server says dead, local sim says alive** (another player finished it): the host plays the existing kill sequence, with a presentation cue "felled by the party" (a row; copy and cue are Physics Dev's and PR C's cue vocabulary, not new code here).

### 4.3 Respawn

The server owns the clock. At the hit that takes hp to 0, Postgres writes `respawn_at = now + respawn_s`. `/state` returns `respawnAt` as a server timestamp; the phone converts it to seconds-from-now by the server's own `now` carried in each answer (a `serverNow` field added to `/state` and the batch receipt) so a wrong phone clock does not matter. The local `deadFor` timer in `src/zone/spawns.ts` becomes a derived display value in shared mode: `deadFor = respawn_s - (respawnAt - serverNow)`. `spawns.tick` still advances locally between polls (smooth countdown), and a poll corrects it. On `respawnAt` the server's next engage starts generation + 1 at full hp; every phone that is near re-stands the boss at its spot. The corpse rule (Physics Dev's `corpse.keepSeconds`) is unchanged and local.

### 4.4 Several bosses, several players, roaming

- Each boss is its own `(instance, layer)` row; locks are per spawn, so players on different bosses never contend.
- A hero inside two aggro ranges is attacked by both (merged #110 multi-attack): each is a separate engage token and a separate sim; at most `maxAttackers` 3 and `engage.maxOpenPerAccount` 4 (the cap above the client's 3 leaves a spare for a re-engage in flight).
- Walking out of a boss's leash resets the LOCAL sim to full (today). In shared mode the shared hp does NOT reset: it is the world's state; the local sim re-syncs to the shared fraction on re-engage. This is the biggest felt change from today (a boss you abandoned stays hurt for others). A row `reconcile.leashResetsShared` = false pins it; a boss left alone regenerates on a server rule (Strategy's, open question 7), default none in v1 to keep the SQL unchanged.
- Hero death in a fight: the engage token expires after `engage.ttlS` (120 s) or is replaced on the next engage; the damage already applied stays applied and still earns credit.

## 5. Migration order and flags (nothing breaks the single fight or Gate 0)

Principle: every new behaviour is OFF unless its link query is present, until Dom's two-phone pass; each step is independently revertible; no step changes a default.

| Step | What is on | Flag | Default | Break-glass |
|---|---|---|---|---|
| 0 (today) | local zone loop, presence, shared-hp client unwired | `?presence=`, `?sharedhp=` | off | none needed |
| 1 | F1 client fix; F2/F3 shared functions and tests; no behaviour change (pure functions, sim untouched) | none | n/a | revert the PR |
| 2 | Writer on the VPS + DB, behind nginx `/zone`, health only; Deploy receipt | server side only | not reachable by any page default | stop the systemd unit |
| 3 | Presence `session` HMAC (join reply gains a field; old clients ignore it) | none | on server, additive | roll back presence unit, README |
| 4 | Wire `shared-hp` into the fight: claims out, bar in, kill follows; `?sharedhp=1` only | `?sharedhp=` | off | drop the link query; `data/zone-client.json` `on:false` |
| 5 | Scoped `/state` and many bosses (PR B's spawns) | same flag | off | same |
| 6 | Dom's two-phone pass on `?presence=1&sharedhp=1` | | | |
| 7 | Default-on of both via ONE umbrella row `data/live.json` `on` (a single query `?live=` and one default), `?live=0` reverts to today | `?live=` | flip only on Dom's go | `on:false` redeploy |
| 8 | Step 2 transport (claims over presence, per-layer flusher), only after the load test says so | row `transport` | `http` | `http` |

Gate 0 and the single fight (`?postkill=v1`, `/?fight=1`, no zone): none of the shared code is imported without the flag (lazy chunk, 4 KB for presence, the same pattern for `shared-hp-chunk`), the sim never reads a shared value except through the external-damage input event of 4.2, which is absent without the flag. The Gate 0 replay test runs with the flag off and must stay byte-identical; a new test runs the replay once with a scripted shared bar to prove the event path is deterministic. The default page bundle size must not grow (the weight receipt, 5.42 MB wire at 375, is already 0.42 MB over the 5 MB target); every new client module goes in the lazy chunks.

Dependencies on the in-flight PRs: step 4 needs PR B (it names the spawns) and rebases over it; PR A (free walk) needs nothing from this design except the `walkHalfCm` check of 1.3; PR C's cue vocabulary supplies the "felled by the party" cue. PRs in section 6 are written to touch separate files so they do not collide with A/B/C (the one file that cannot be avoided, `src/client/main.ts`, is touched only by D5 and D6, one at a time).

## 6. Task breakdown: independent PRs, files, owners, tests

Owners are proposals for Strategy to confirm. "Rows" are Strategy's; "presentation" is Physics Dev's; infra is Deploy's.

| PR | Title | Files (own files only) | Owner | Needs |
|---|---|---|---|---|
| D1 | Client fix F1: slot errors are lost rows | `src/zone/shared-hp-client.ts`, `test/zone-client.test.mjs` | Strategy dev (sim/client) | none |
| D2 | Shared ids + shared max hp + weapon map (F2, F3) | `src/zone/shared-ids.ts`, `src/zone/shared-health.ts`, `scripts/zone-weapons.mjs` or `data/zone-client.json` `weaponMap`, `data/zone-server-rules.json` (rows), tests `test/zone-shared-health.test.mjs` | Strategy dev + Strategy (rows) | none |
| D3 | Writer service | `server/zone/*`, `data/zone-writer.json` (port, pool, timeouts, cache ms), `test/zone-writer.test.mjs`, `package.json` script `zone` | Strategy dev | D2 (derive), SQL on main |
| D4 | Deploy: DB, writer unit, nginx `/zone`, secrets, presence restart | `deploy/zone/*`, `docs/ZONE-DEPLOY.md` | Deploy | D3, Strategy go for spend (DB), secrets stored by Deploy |
| D5 | Presence `session` HMAC + presence layer to writer | `server/presence/server.ts` (join reply), `src/presence/wire.ts`, `src/presence/client*.ts`, `docs/PRESENCE.md`, tests | Strategy dev | none (additive) |
| D6 | Wire shared hp into the fight (claims, shownHealth, kill follows), `?sharedhp=` | `src/client/main.ts` (small seam), `src/zone/shared-hp-wiring.ts` (new), `data/zone-client.json` `reconcile` rows, tests incl. the Gate 0 byte-identical replay | Strategy dev (sim input event) + Physics Dev (cue) | D1, D2, D3 live; PR B merged |
| D7 | Scoped `/state` and respawn from the server clock | `src/zone/shared-state.ts`, `server/zone/routes.ts` (cache), `data/zone-client.json` `state` rows, tests | Strategy dev | D6 |
| D8 | "Felled by the party" cue and shared-bar HUD polish | `src/fight/cues/*` or PR C's vocabulary, rows | Physics Dev | PR C, D6; visible, so it needs 375 stills vs toggle and a verdict |
| D9 | Umbrella `?live=` row and default flip | `data/live.json`, `src/client/live-flags.ts` | Strategy dev; flip is Dom's call | two-phone pass |
| D10 | Step 2 transport (claims over presence, flusher) | `server/zone/flusher.ts`, `src/presence/wire.ts`, `src/zone/shared-hp-socket.ts` | Strategy dev | load test result |
| D11 | Load and chaos test | `scripts/zone-load.mjs`, `docs/ZONE-LOAD.md` | Deploy + Strategy dev | D3, D4 |

Order: D1, D2, D5 in parallel (no shared files). D3 after D2. D4 after D3. D6 after D1+D2+D3+D4+PR B. D7, D8 after D6. D9 after Dom. D10, D11 when the number says so.

### Test and CI plan

- Every PR: the CI jobs `test` and `zone-sql` on GitHub (`.github/workflows/ci.yml`) are the gate; `npm run check:as-data` and `npm run check:stubs` stay green (no literal numbers or strings in new `src/zone` code: every number is a row, per `scripts/as-data`).
- Unit and integration suites: `hfjob --box v3 -- npm test` (the Mac hook blocks heavy suites; the box is the run, with a receipt of the job id in the PR). Writer tests use `node --test` against the repo's existing throwaway Postgres pattern (`ZONE_SQL_URL`, as in `test/sql/zone-sql.test.mjs`), so the writer is exercised through real `pg`, real SQL and the fake HTTP client, no mock of the database.
- New pinned tests: (a) every sim weapon id has a cap (F3); (b) writer `max_hp` == sim foe max for every kind and difficulty row (F2); (c) an error slot is a lost row (F1); (d) nothing is sent twice after a lost row (already pinned, kept); (e) the Gate 0 replay is byte-identical with the flag off, and deterministic with a scripted shared bar; (f) a spawn id outside `ids.instancePattern` fails the zone-row validation; (g) the HMAC session: a forged layer is refused, an expired session is refused (`401`), a session for layer 2 cannot hit layer 3; (h) scoped `/state` refuses more than `maxInstances`.
- Two-phone gate (manual, Dom): two phones, one layer, one boss: both see one bar; one kills, both see it die; both see the respawn at about the same time. Receipts: `GET /zone/health` and `GET /presence/health` counters and the batch log lines.
- Load test (D11): N simulated fighters on one layer (N = 4, 8, 12, 20) hitting one boss and spread across eight; report p50/p95/p99 batch latency, lost rows per minute, deadlocks seen, DB CPU. Run on the VPS or `hfjob --box v3` (CPU), never on the Mac. Pass for the step-2 switch: p95 under 250 ms at 12 fighters on one boss with HTTP; step 2 must beat it.
- Visual PRs (D6 if it draws, D8): 375-wide before/after stills against the toggle and a posted reviewer verdict before merge (rule `v3-stills-before-merge`).

## 7. Open questions for Strategy

Ranked by how much they block. 1, 2 and 3 block D3/D4; 5 blocks D6.

1. **Layer as shard, and the player cap.** Is "everyone in the same live world" = one layer of at most 20 (24 with a friend), with a second world copy opening at the cap (the design here), or must the cap be raised toward 50+ in one world? The latter needs a load test, a presence tuning pass (tiers, `nearCap`, `drawMax`) and a decision on what players see when a layer is full. A "join a friend" layer is already supported.
2. **Where the database lives and who pays.** Postgres on the VPS (default in this plan, no new spend) or a Supabase project (a monthly cost, Dom's approval)? Also: who runs backups, and the data-retention row (`log.keepS`).
3. **Identity.** Is the presence-minted anonymous session (2.4) acceptable for the live gate, with "paid" meaning "recorded" until real accounts, or must accounts (and what login) come first? What does a "paid" kill actually give the player (the reward service is unspecified)?
4. **One difficulty per shared boss.** The shared boss has a fixed difficulty from the zone row; a player on a different `?difficulty=` plays that boss locally and unshared. Is that right, or should the server have per-player scaling (which breaks one shared bar)?
5. **A local kill the server has not confirmed (4.2).** Hold the boss "reeling" up to `settleSeconds` then let the player's kill stand and mark it unpaid, or never let a local kill stand without the server (kill follows the server always, at the cost of a stalled finish on a lag spike)? Dom's feel for the finish decides.
6. **True shared fights.** Do we ever need A to SEE B's boss turn on B (one boss body, two heroes)? That needs a host or a server-authoritative boss and a boss-in-presence entity; it contradicts "solo-sim stays local". If yes it is a separate design and the finish-window/knockdown rows (`data/feel-sim.json`) become server-visible. If no, the limit in 4.1 stands and Dom should hear it.
7. **Boss regeneration and leash reset in shared mode.** A boss left alone: stays hurt forever until killed, heals on a server timer (a new SQL rule), or resets when no engage token is live for N seconds (a sweep in the writer, no SQL change)? Default in this plan: stays hurt until killed (simplest; may feel wrong when a player flees).
8. **PvP and hero death.** Presence says "others have no collider, play no part in the fight". Does the live zone ever allow hero versus hero (the zone row has `pvp` flags per area), and if so which side is authoritative on a hero's hp? Not in this plan.
9. **Number ownership for F3.** Generate the server weapon table from the move table (one source, can't drift) or hand-keep a `weaponMap` row (small, explicit, drifts)? And is `maxDamageMult` 2.5 still the real progression ceiling?
10. **Umbrella flag.** One `?live=` row for presence + sharedhp (D9) or keep the two queries forever? Needs Dom's default-on go after the two-phone pass either way.
