# Live world design: one endless open world, shared and live (PR D, design only)

Status: DESIGN. Docs only. No code, no row, no secret, no deployment in this PR. Everything below is a plan for later PRs; each is listed in section 6 with files, owner and test plan. Rewritten on Strategy's final ruling (Dom): the file keeps its name `docs/ZONE-LIVE-DESIGN.md`, and the file, row and column names it quotes (`server/zone/`, `data/zones/`, the `instance` column) keep their old words; the design itself does not.

## 0. The world model

V3 is ONE endless open world. There is no fenced fighting place, no limit on where a body may stand, no held duel and no edge that a player can meet. The ground streams around the hero as he walks; the only frame the machine keeps is a streaming and interest window around him, which is a performance row (how much to load and poll), never a boundary. Bosses (and later other creatures) are placed across the world by data rows, they stand where their rows put them, and a fight happens wherever the bodies happen to stand: the hero walks into a creature's aggro and the fight starts there, and a second creature in range joins it. Everything that must be the same for everyone (a boss's hp, its death, its respawn clock, who dealt what, where the other players are) is held by the server; everything about how a fight looks and feels is local to each phone. The server groups players into shards of 20 (24 with a friend) purely to bound cost; a shard is invisible plumbing, never a border, and a player never sees a loading step, a gate or a barrier between one place and another.

Rules that follow, and that every later PR must keep:
1. No code path may clamp the hero, a boss or another player to a region, and no row may name a place the world ends. Anything that looks like a limit is a stream/interest distance (a perf row) or a creature's own tether (behaviour, section 4.4).
2. A fight is local bodies and local rules anchored where the bodies stand, not a place the bodies are taken to.
3. The server never learns "which place"; it learns spawn keys and positions in world metres.

Reads this builds on (all on main unless marked): `docs/ZONE-CLIENT-CONTRACT.md` (phone to writer, five routes), `docs/ZONE-SERVER-DESIGN.md` (the database holds boss hp, a phone only claims), `docs/PRESENCE.md`, `data/presence.json`, `data/zone-client.json`, `data/zone-server-rules.json`, `data/zones/zone1.row.json`, `src/zone/shared-hp-client.ts`, `server/presence/{server,interest}.ts`, `deploy/presence/README.md`. In flight by other agents and ASSUMED here, not read: PR A (free walk across the world), PR B (spawns across the world, ground drawn), PR C (cut scene-change cues). PR B is assumed to stop treating one place as the whole drawn world; if A/B/C land differently from the assumptions below (marked "assumes"), this doc is amended, not the other way round.

What exists today, so nothing below is mistaken for new:

| Piece | State | Where |
|---|---|---|
| Presence service (positions only, no pay) | LIVE on the VPS (`frankendom-v3-presence`, loopback 8794, nginx `/presence`), page client behind `?presence=` | `server/presence/`, `src/presence/`, `deploy/presence/` |
| Presence start point 226/47 in world metres | MERGED (#118) in code and `data/presence.json`; the RUNNING process still has the old build until Deploy restarts it | `data/presence.json` `spawn`, `spawnAbout` |
| Shared hp CLIENT (state machine, fake transport tested) | MERGED, behind `?sharedhp=`, not wired into the fight, no server | `src/zone/shared-hp-*.ts`, `data/zone-client.json` |
| Spawn SQL (hp under a row lock, damage-share credit) | MERGED, executed in CI job `zone-sql`, deployed NOWHERE | `supabase/migrations/20261027000001_zone_server.sql` |
| Writer service (`server/zone/`) | DOES NOT EXIST | contract: `docs/ZONE-CLIENT-CONTRACT.md` |
| Local spawn loop: respawn timers, aggro, multi-attacker | MERGED, per page, local-only state | `src/zone/spawns.ts`, `attackers.ts`, `data/zones/zone1.row.json` |

Known today and to be removed by this plan (these are the places that still assume a fixed, limited place; each is owned by a PR below): the presence walkable square (`walkHalfCm`, `walkable()` in `server/presence/interest.ts`) and its 16-bit wire frame (`frame`, `src/presence/wire.ts`); the zone row's `areas` rectangles and `pitArea`/`world` placement rows (`src/zone/spawns.ts`); one duel sim "held" near the hero with the other bosses drawn as frozen copies; the sim's play limit on how far bodies may move (`src/fight/play-radius.ts`, `setPlayScale`).

## 1. The authority split

One rule decides every line of this section: **the client simulates and draws; the server remembers what must be the same for everyone.** Nothing the server remembers may change how the local sim plays frame to frame (Gate 0 replay, the legacy single fight).

### 1.1 What stays on the phone (the fight and the feel)

- The fight sims: each phone runs its own duel rules for each creature it is engaged with (at most `maxAttackers`, 3). Boss brain, moves, attack timing, the hero's health, stamina, specials, knockdown and finish windows (`data/feel-sim.json`) are local and deterministic. A boss that fights two players is two sims, one per phone; each boss attacks only its own phone's hero. This is the deliberate "solo-sim stays local" answer (section 4).
- Ragdoll, cuts, camera, sound, feel modules: Physics Dev's, presentation only, never an input to a shared number.
- Streaming and drawing: which ground and which creatures are loaded around the hero (section 3.2).
- Hero health and death/respawn of the HERO (`zone1.row.json` `respawn`: a mark where he stands again): local. Nobody else needs your hero's hp. Hero death is not shared state in this design (open question 4).

### 1.2 What the server owns (the shared writer)

| Shared fact | Owner | Today | Wire |
|---|---|---|---|
| A boss's hp, max hp, alive flag, generation (life number) | Postgres `zone_spawns`, via the writer | local per page | `/engage`, `/hits`, `/state` |
| A boss's death moment and respawn time (`respawn_at`) | Postgres, computed from the spawn row's `respawnSeconds` at the hit that takes hp to 0 | local `deadFor` timer in `spawns.ts` | `/state` answer carries `respawnAt` |
| Who dealt how much, who is paid | Postgres, `zone_settle_kill` | none | `/kill` (read only) |
| Where the other players are | Presence service memory (no DB, loses nothing on restart) | live | WebSocket `/presence` |

The database stays the ONLY place a boss's hp lives. A phone claims damage; the database applies at most what the weapon rows and real elapsed time allow (`hit.dpsSlack`, `maxElapsedS`, `progression.maxDamageMult`). The phone never sends hp, a kill, a respawn time or an account id (contract section 1).

### 1.3 Presence in world metres, with no edge (changes the presence wire)

Today the wire carries centimetres in a 65535 cm square (655 m) centred at 32768 cm, and `walkable()` refuses poses more than `walkHalfCm` (300 m) from the centre. That is a fixed, limited place: a player who walks far enough meets it. In an endless world it cannot stay. The change (PR D5b):
- The server keeps every player's absolute position in world centimetres as a 32-bit integer (no frame, no clamp; speed clamp `maxSpeedCmS`/`speedSlack` stays, it is anti-teleport, not a limit on where).
- The wire carries positions RELATIVE TO THE RECEIVER'S OWN ANCHOR (the receiver's last acknowledged position, rebased whenever he has moved more than `anchor.rebaseCm`, a new row). Neighbours are at most `radiusCm` (40 m) away, so a 16-bit offset (a 655 m span) holds them with room; the receiver adds his anchor. A client's up-message carries its own position as an offset from its last acknowledged anchor; the server applies the same speed clamp. Rebase is a small down-message field; the page's existing eased `remotes()` is unchanged.
- `walkHalfCm`, `walkable()` and `frame.centreCm` leave the rows. The start point row `spawn` {226, 47} stays as WHERE A NEW JOINER STANDS the first time (a place on the map, not a limit); it is expressed in world metres, as #118 made it.
- The page keeps full-precision world coordinates only as long as float precision holds; the renderer uses a floating origin (the scene is shifted back toward 0 whenever the hero is more than `render.rebaseMetres`, a new row, from it). That is PR A/B's streaming work; this doc only requires it.
- **Owed to Deploy** (unchanged): restart `frankendom-v3-presence` from a checkout that includes #118 so the running process reads the 226/47 start point (`SPAWN` in `server/presence/interest.ts` is computed at import). Receipt: `GET /presence/health` and two phones in one shard seeing each other near the start point, not at world origin. The restart drops all sockets (clients reconnect with the existing backoff, `giveUp` 6 tries); no data is lost. Rollback: `deploy/presence/README.md`. D5b needs a second restart; the old wire stays selectable by a protocol string (`protocol` row) until both ends have moved.
- Presence positions are NOT trusted for pay. The writer never reads presence for damage.

### 1.4 The spawn key (the key everyone must share)

Every boss is placed by a spawn row, and every spawn row has one stable key: `z<worldId>:<id>`, e.g. `z1:x12z-4.0` (matches `ids.instancePattern` in `data/zone-server-rules.json`, where `x12z-4` is the streaming cell the row sits in and `.0` its number there; `-` and `.` are legal in the pattern). Rows are keyed `(spawn key, shard)` in the column named `instance`. The page derives the key from the spawn row (assumes PR B: spawns are rows across the world, grouped in streaming cells whose size is a perf row `stream.cellMetres`), never from an array index. A function `spawnKey(world, row)` in `src/zone/shared-ids.ts` is the one place; a test pins that every spawn row in the world data matches the pattern and is unique. Because the world is endless and rows are generated or authored per cell, the server (writer) loads the same spawn rows the page does, from the same data files, to derive each boss's kind, max hp and respawn time; a key that no row produces is refused (`mismatch`).

### 1.5 The shard is invisible plumbing

Presence already puts players into numbered layers (soft cap 20, hard 24, at most 20 layers, `emptyLayerMs` 5 minutes). The SQL already keys a boss by `(spawn key, layer)`. So the shared world a player meets is "the shard he joined": everyone in shard N shares the same boss hp and respawn timers; shard M is a second copy of the same world with its own bosses. Nobody loads anything; you join the fullest shard under the soft cap and walk anywhere. A shard never shows: no border, no portal, no "you are in layer 3" on screen. RULED (Strategy, decision 1): shards of 20, 24 with a friend join, a new copy opens when every shard is full, V1's layer model as presence already implements it, no load test. One world of 50+ is a later experiment behind a row (`softCap`/`hardCap` in `data/presence.json` plus the presence tuning pass), not part of this plan. The only visible effect of the cost cap is at login: if every shard is full and no more may open, the join is refused with a plain message (an existing presence behaviour, `maxLayers`), never in the middle of play.

The shard comes from the server, never from the page. Today `/engage` takes a page-supplied `layer`; the contract says the writer "should replace it with presence's own record". That replacement is a hard requirement (section 2.4), otherwise a phone could hit a boss in a shard it is not in.

## 2. What the writer service must own

New node service `server/zone/` (does not exist), loopback bind next to presence, reached through nginx under `/zone` (`data/zone-client.json` `path`). It is the only holder of the database credential. RULED (decision 4): its own small service, built only after PRs A to C have passed, modelled on V1 `origins/server/world-spawns.ts` (engage/touch/kill_report ops). RULED (decision 2): V1's pattern, the writer calls the SQL functions through `psql` against Postgres on the existing VPS, with the migrations in this repo; no Supabase. This supersedes the `pg` driver preference in `docs/ZONE-CLIENT-CONTRACT.md` section 7 (the reasons there about error fidelity become a requirement: the writer must surface the SQLSTATE and O-code of every raised error, e.g. `psql -v VERBOSITY=verbose`, and a test pins that `O0009` and `40P01` reach the client unchanged). Sketch of files (section 6 owns the split):

```
server/zone/main.ts        env, psql runner (small pool), listen 127.0.0.1:<port row>, graceful close
server/zone/routes.ts      five POST routes + /zone/health; refusal rows -> HTTP status
server/zone/rows.ts        reads data/zone-writer.json (new rows) and data/zone-server-rules.json
server/zone/auth.ts        who is this phone (section 2.4)
server/zone/derive.ts      kind, max_hp, respawn_s from the spawn row + profile + difficulty (2.3)
server/zone/flusher.ts     optional step 2: per-shard coalescing of one presence tick (3.3)
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
| F2 | **`max_hp` must equal the sim foe's max health.** The writer derives `max_hp` from the spawn row, but the sim's foe health comes from the opponent profile times the difficulty rows (`data/difficulty.json`, default level 5). If they differ the bar the player sees (shared) disagrees with the sim's, and the "shared reaches 0 no later than local" invariant (section 4.2) breaks | new pure function `sharedMaxHp(profile, difficultyLevel)` in `src/zone/shared-health.ts`, used by BOTH `server/zone/derive.ts` and the sim setup; test pins writer value == sim value for every spawn kind at every difficulty row | one source of truth, no copied number |
| F3 | **3 server weapon rows vs 13 sim ids.** `data/zone-server-rules.json` `weapons` has `gladius`, `longsword`, `cleaver`; the sim reports 13 weapon ids on its Hit events. An id with no row is refused `weapon` (422) and the client blocks it, so most swings would claim nothing | one derived table: either (a) `weapons` generated from the move table by `scripts/zone-weapons.mjs` into `data/zone-server-rules.json` (CI fails if stale), or (b) a row `weaponMap` {simId -> serverWeaponId} in `data/zone-client.json`; test: every sim weapon id resolves, and the cap for a mapped id is >= the real maximum hit for that id | the database must know every weapon the sim can swing |

F1 is client only and independent; F2 and F3 need Strategy's sign-off on the source of the numbers (rows are Strategy's).

### 2.3 The writer derives, the phone never says

From the spawn rows and the data rows only: `kind` (profile id of the spawn), `max_hp` (F2 function), `respawn_s` (`spawns[].respawnSeconds`). `zone_spawn_engage` already refuses `mismatch` if the spawn's stored values differ; this is what makes a client on `?difficulty=legacy` or an edited local row unable to poison a shared boss. A mismatching phone is told `mismatch` (`stop`) and plays that boss locally, unshared (its bar is the sim's, its hits are not counted). A shared boss therefore has ONE difficulty per world: a world row `difficulty` field (default the live default, 5), not per-player choice. Open question 1.

### 2.4 Who is this phone (authentication)

V3 has no accounts table. Contract section 8 leaves this open. Plan (smallest thing that is honest):
- Presence already mints a server-side key per joined socket (`World.join(key, ...)`, "a fresh player whose key the server mints"). Presence adds, in its join reply, a short-lived HMAC `session` = `hmac(secret, key | shard | expiry)`. The page sends it as a bearer on every `/zone/*` call.
- The writer verifies the HMAC with the same secret (env on both, never in rows, argv, commits or chat) and takes `account = key` and the shard from it. This replaces the page-supplied layer (section 1.5) and gives the SQL an account id it can credit.
- RULED (decision 3): this anonymous presence-issued session is enough for the alpha. Credit rows accrue to a throwaway id until real accounts exist; the SQL is already account-agnostic. Shared hp works (the point of the gate "two phones, one bar") and "paid" means "recorded".
- The HMAC secret and the database credential are secrets: Deploy creates and stores them; nothing here contains one.

### 2.5 The database

`supabase/migrations/20261027000001_zone_server.sql` is deployed nowhere. RULED (decision 2): Postgres on the existing VPS behind loopback, V1's pattern (psql writer, migrations in the repo), no Supabase and no new cost, with a nightly `pg_dump` (a Deploy chore). Apply the migration as the admin role, then `zone_rules_apply(data/zone-server-rules.json)` as the admin step; the writer role is a LOGIN role that is a member of `frankendom_zone_writer`. The CI `zone-sql` job already runs the same SQL on a throwaway Postgres. Rows for an endless world are created lazily: a `zone_spawns` row appears at the first engage of a key, so the table holds only bosses someone has met, not the whole world; `zone_hit_log_prune` and a sweep of long-dead idle rows (`log.keepS`, a Deploy chore) bound its growth.

## 3. Interest management and caps

### 3.1 Players (presence)

Spatial grid (`cellCm` 1600 = 16 m), neighbourhood `radiusCm` 4000 (40 m), distance tiers (`tier1Cm` 12 m every tick, `tier2Cm` 25 m every 2nd, `tier3Cm` 40 m every 5th), `nearCap` 40 per client, `drawMax` 8 drawn, `maxMessage` 64 bytes, `perSecond` 30 messages, per-IP 16 sockets and 30 joins/minute. A shard holds 20 (soft) to 24 (hard); at most 20 shards (480 players per box). These rows are unchanged by this design (the wire change in 1.3 is encoding only). Cost is proportional to neighbours, never to how far anyone has walked: the grid is sparse and keyed by absolute cell, so wandering to coordinates nobody else has visited costs nothing.

### 3.2 Streaming and bosses (new: a window of interest, all perf rows)

There is no zone to be inside, so what the phone loads and polls is a window around the hero, every number a perf row in `data/zone-client.json` (`stream`, `state`):
- `stream.loadMetres`: ground and spawn rows within this distance of the hero are loaded and drawn; beyond `stream.unloadMetres` (greater, so there is no flicker) they are dropped. This is PR A/B's streaming; the shared layer only reuses the same list of spawn keys.
- `state.nearMetres` (suggest 80): the phone lists in `/state` only spawn keys within that distance of the hero, from the spawn rows it already has. At most `state.maxInstances` (suggest 8) per call; the writer refuses more (input class, `stop`).
- Spawns beyond `state.nearMetres` but inside the loaded window refresh at a slow `state.farMs` (suggest 5000): only the alive/dead flag and `respawnAt` matter for a distant standing body.
- The writer caches `/state` per `(spawn key, shard)` for one tick (100 ms), so N phones in one shard cost one read per tick, not N.
- A boss the hero has engaged is polled at `stateMs` (250 ms) as today; the batch answer already carries hp for his own hits.
- These distances are tuning, not borders: they only decide what is fetched, and a body that falls outside them still exists on the server and in the next phone's window.

### 3.3 Hits (step 1 now, step 2 later and optional)

- Step 1 (what the client speaks): one `/hits` call per phone per `flushMs` (250 ms), one row per call: 4 transactions per second per fighter. Fine for the two-phone gate and a handful of testers; at 20 fighters in one shard that is 80 tx/s on one VPS Postgres, still modest, but with row-lock contention when many hit one boss.
- Step 2 (optional, not scheduled; Strategy ruled no load test): phones send claims over the presence socket (new up-message in `src/presence/wire.ts`, size inside `maxMessage` 64 bytes); presence clamps reach (it knows positions) and rate, and `server/zone/flusher.ts` coalesces ALL claims of one presence tick (100 ms) of one shard into ONE `zone_spawn_hit_batch` with its own batch id: one transaction per shard per tick, lock order identical, the cross-row deadlock of the design stays rare. The client transport is swapped, the state machine does not change. Step 2 is entered only if the live counters (`GET /zone/health`: lost rows, batch latency, deadlocks) show a problem in real play; it is a row (`transport`), default `http`.

### 3.4 Caps that bound the whole design

| Resource | Cap | Row |
|---|---|---|
| Players per shard | 20 soft, 24 hard | `presence.json` `softCap`, `hardCap` |
| Shards | 20 | `maxLayers` |
| Open engage tokens per account | 4 | `zone-server-rules.json` `engage.maxOpenPerAccount` |
| Bosses an account can fight at once | 3 | `src/fight/world-rules-defs.json` `maxAttackers` (client) |
| Rows per batch | 200 | `hit.maxBatchRows` |
| Spawn keys per `/state` call | 8 (new) | `zone-client.json` `state.maxInstances` |
| Writer DB connections | 4 | `server/zone` psql pool |

Raising player caps beyond 24 is NOT in scope (decision 1: a later experiment behind a row). None of these caps is a place; they are counts.

## 4. How a boss's fight works with several players

### 4.1 Who holds the fight: everybody, for himself

No player and no server "holds" a boss fight. Each phone runs its own fight sim for each creature it is engaged with, anchored at where the bodies stand when the fight begins; creatures it is not engaged with stand as ordinary bodies in the loaded window, drawn from the spawn rows and the shared state (alive, dead, hp bar), with no sim until aggro engages them (merged multi-attacker behaviour, `src/zone/attackers.ts`). Player A and player B both striking the same spawn key each have a local copy of that boss in their own sim that attacks only them. The server never runs a sim and never sees a move. This keeps Gate 0 replay, determinism and the phone's frame budget exactly as they are: the shared layer is a bookkeeping layer around the sim, not a netcode.

The sim must fight with no limit on where bodies move: they may go wherever the ground lets them. The legacy play limit (`src/fight/play-radius.ts`) and its scale row belong to the legacy single fight (`?postkill=v1`, `/?fight=1`) only; in the world the fight frame is local coordinates with the engaged bodies in them and nothing that stops a body. This is a requirement on the sim/fight lane (PR A assumes it; if the sim still needs a limit, that is open question 7, not a design element).

Consequence stated plainly (a limit to tell Dom): in this design you see another player's sword on his remote avatar (presence, #98/#103), and you see the boss's shared bar drop when he hits it, but you do not see the boss turn to him: A's boss is fighting A. A true shared fight (one boss body reacting to two heroes in the same world) needs a host-authoritative or server-authoritative boss and is a separate, larger design (section 7, open question 3). The design here is the staged path to the live feel, not the final netcode.

### 4.2 The reconciliation rule (the one new piece of client logic)

Per engaged boss, each frame the host (wiring PR) does three things, all outside the sim step so the sim stays deterministic:

1. **Claim (already built).** The sim's Hit events from the hero on the foe become claims (`shared-hp-client` `hit`), flushed per `flushMs`.
2. **Pull the local foe down, never up.** If `bar.fraction` (shared) is below `sim.hp / sim.max`, the host applies an external-damage record to the sim foe to the shared fraction. It enters the sim as a recorded input event with its own type (like `feel:kick` rows), is deterministic on replay, and `shownHealth` (already written) draws the shared bar. The bar only goes down within one life (the client already enforces it), so a late answer cannot heal the boss.
3. **The local kill stands at once; the server settles credit afterwards.** RULED (decision 3): the phone is the feel and the boss never waits for the server. When the LOCAL sim kills the foe, the kill sequence (`spawns.kill`, ragdoll, corpse) plays immediately, whatever the shared bar says. The host then asks the idempotent `kill_report` (`/kill`, V1's shape, retried under `kill.tries`/`kill.retryMs`) for the credit; the server either records it (`paid`, `settled`) or refuses it (`unpaid`, with the `reason`), and the phone shows the answer as a toast when it arrives. When the SERVER reports the boss dead first (`killed:true` in a slot, or `alive:false` from `/state`, because another player finished it), the host kills the local foe through the same kill path. Whoever struck the last blow, credit is by damage share, no last-hit bonus (`zone-server-design` section 2).

Invariant that makes it sane: with F2 (shared max hp equals sim max hp) and caps with slack, each phone's own damage is a subset of the shared damage, so shared hp normally reaches 0 no later than the local foe's would. Two cases break it, both handled by rows (new, `data/zone-client.json` `reconcile`):
- **Local kill before the server agrees** (the server clamped some claims, so shared is above 0 while the sim foe is dead): the local kill stands, with no hold and no wait. The bar shows what the server says; `kill_report` answers `unpaid` or a smaller share for the missing damage, and the spawn is not marked dead for other players until the server's own hp reaches 0 (their copy of that boss keeps standing; this is the accepted cost of "the phone is the feel").
- **Server says dead, local sim says alive** (another player finished it): the host plays the existing kill sequence, with a presentation cue "felled by the party" (a row; copy and cue are Physics Dev's and PR C's cue vocabulary, not new code here).

### 4.3 Respawn

The server owns the clock. At the hit that takes hp to 0, Postgres writes `respawn_at = now + respawn_s`. `/state` returns `respawnAt` as a server timestamp; the phone converts it to seconds-from-now by the server's own `now` carried in each answer (a `serverNow` field added to `/state` and the batch receipt) so a wrong phone clock does not matter. The local `deadFor` timer in `src/zone/spawns.ts` becomes a derived display value in shared mode: `deadFor = respawn_s - (respawnAt - serverNow)`. `spawns.tick` still advances locally between polls (smooth countdown), and a poll corrects it. On `respawnAt` the server's next engage starts generation + 1 at full hp; every phone that has the spawn loaded stands the boss again at its spawn row's spot. A phone that was away and comes back simply loads the spawn and asks `/state`: dead or alive, no catch-up needed. The corpse rule (Physics Dev's `corpse.keepSeconds`) is unchanged and local.

### 4.4 Many bosses, many players, roaming

- Each boss is its own `(spawn key, shard)` row; locks are per spawn, so players on different bosses never contend.
- A hero inside two aggro ranges is attacked by both (merged multi-attacker): each is a separate engage token and a separate sim; at most `maxAttackers` 3 and `engage.maxOpenPerAccount` 4 (the cap above the client's 3 leaves a spare for a re-engage in flight).
- A creature's tether (the spawn row's `leash`) is its own behaviour: past it, the creature lets go and walks home. It is not a place the hero is held in; he can walk on forever. In shared mode the shared hp does NOT reset when the local fight ends: it is the world's state; the local sim re-syncs to the shared fraction on the next engage. This is the biggest felt change from today (a boss you walked away from stays hurt for others). A row `reconcile.tetherResetsShared` = false pins it; whether a boss left alone heals is open question 2, default none in v1 to keep the SQL unchanged.
- Hero death in a fight: the engage token expires after `engage.ttlS` (120 s) or is replaced on the next engage; the damage already applied stays applied and still earns credit.

## 5. Migration order and flags (nothing breaks the legacy single fight or Gate 0)

Principle: every new behaviour is OFF unless its link query is present, until Dom's two-phone pass; each step is independently revertible; no step changes a default. The world itself (free walk, streamed ground, spawns across it) is PR A/B's flagged work and lands before the steps below that depend on it.

| Step | What is on | Flag | Default | Break-glass |
|---|---|---|---|---|
| 0 (today) | local spawn loop, presence, shared-hp client unwired | `?presence=`, `?sharedhp=` | off | none needed |
| 1 | F1 client fix; F2/F3 shared functions and tests; no behaviour change (pure functions, sim untouched) | none | n/a | revert the PR |
| 2 | Writer on the VPS + DB, behind nginx `/zone`, health only; Deploy receipt | server side only | not reachable by any page default | stop the systemd unit |
| 3 | Presence `session` HMAC (join reply gains a field; old clients ignore it) | none | on server, additive | roll back presence unit, README |
| 3b | Presence relative wire (1.3), selectable by `protocol` string | none | old wire until both ends moved | old `protocol` string |
| 4 | Wire `shared-hp` into the fight: claims out, bar in, kill follows; `?sharedhp=1` only | `?sharedhp=` | off | drop the link query; `data/zone-client.json` `on:false` |
| 5 | Scoped `/state` and bosses across the world (PR B's spawns) | same flag | off | same |
| 6 | Dom's two-phone pass on `?presence=1&sharedhp=1` | | | |
| 7 | Default-on of both via ONE umbrella row `data/live.json` `on` (a single query `?live=` and one default), `?live=0` reverts to today | `?live=` | flip only on Dom's go | `on:false` redeploy |
| 8 | Step 2 transport (claims over presence, per-shard flusher), only if live counters show a need; optional | row `transport` | `http` | `http` |

Gate 0 and the legacy single fight (`?postkill=v1`, `/?fight=1`): none of the shared code is imported without the flag (lazy chunk, 4 KB for presence, the same pattern for `shared-hp-chunk`), the sim never reads a shared value except through the external-damage input event of 4.2, which is absent without the flag. The Gate 0 replay test runs with the flag off and must stay byte-identical; a new test runs the replay once with a scripted shared bar to prove the event path is deterministic. The default page bundle size must not grow (the weight receipt, 5.42 MB wire at 375, is already 0.42 MB over the 5 MB target); every new client module goes in the lazy chunks.

Dependencies on the in-flight PRs: step 4 needs PR B (it names the spawns) and rebases over it; PR A (free walk) needs from this design the presence wire change (3b) before a hero can walk past 300 m with others seeing him; PR C's cue vocabulary supplies the "felled by the party" cue. PRs in section 6 are written to touch separate files so they do not collide with A/B/C (the one file that cannot be avoided, `src/client/main.ts`, is touched only by D5 and D6, one at a time).

## 6. Task breakdown: independent PRs, files, owners, tests

Owners are proposals for Strategy to confirm. "Rows" are Strategy's; "presentation" is Physics Dev's; infra is Deploy's.

| PR | Title | Files (own files only) | Owner | Needs |
|---|---|---|---|---|
| D1 | Client fix F1: slot errors are lost rows | `src/zone/shared-hp-client.ts`, `test/zone-client.test.mjs` | Strategy dev (sim/client) | none |
| D2 | Spawn keys + shared max hp + weapon map (F2, F3) | `src/zone/shared-ids.ts`, `src/zone/shared-health.ts`, `scripts/zone-weapons.mjs` or `data/zone-client.json` `weaponMap`, `data/zone-server-rules.json` (rows), tests `test/zone-shared-health.test.mjs` | Strategy dev + Strategy (rows) | none |
| D3a | FIRST writer PR: `server/zone/` skeleton + migrations + `kill_report` | `server/zone/{main,routes,rows,psql}.ts` (listen, health, `/kill` route wired to the SQL's read-only kill report, psql runner that surfaces SQLSTATE), `data/zone-writer.json` (port, timeouts, psql path), the migration files under `supabase/migrations/` kept as they are plus a `deploy/zone/apply.sh` runner (admin step, `zone_rules_apply`), `test/zone-writer.test.mjs` (real Postgres, as `zone-sql`), `package.json` script `zone` | Strategy dev | PRs A to C passed (decision 4); no D2 needed (kill_report derives nothing) |
| D3b | Writer: engage, touch, hits, state | `server/zone/{routes,derive,auth}.ts` + tests | Strategy dev | D3a, D2 (derive), D5 (session) |
| D4 | Deploy: Postgres on the existing VPS, writer unit, nginx `/zone`, secrets, presence restart | `deploy/zone/*`, `docs/ZONE-DEPLOY.md` | Deploy | D3a (health + kill_report is enough to deploy and probe); no new cost (decision 2); secrets stored by Deploy |
| D5 | Presence `session` HMAC + shard to writer | `server/presence/server.ts` (join reply), `src/presence/wire.ts`, `src/presence/client*.ts`, `docs/PRESENCE.md`, tests | Strategy dev | none (additive) |
| D5b | Presence relative wire, no walkable limit (1.3) | `server/presence/interest.ts`, `src/presence/wire.ts`, `src/presence/rows.ts`, `data/presence.json` (rows: remove `walkHalfCm`, add `anchor.rebaseCm`; `protocol` string), `docs/PRESENCE.md`, tests incl. a walker at 5 km in both axes seen by a neighbour | Strategy dev | before PR A can let a hero walk past 300 m live; D5 touches the same files, so land D5 first |
| D6 | Wire shared hp into the fight (claims, shownHealth, local kill stands then `kill_report`), `?sharedhp=` | `src/client/main.ts` (small seam), `src/zone/shared-hp-wiring.ts` (new), `data/zone-client.json` `reconcile` rows, tests incl. the Gate 0 byte-identical replay | Strategy dev (sim input event) + Physics Dev (cue) | D1, D2, D3b, D4 live; PR B merged |
| D7 | Scoped `/state` and respawn from the server clock | `src/zone/shared-state.ts`, `server/zone/routes.ts` (cache), `data/zone-client.json` `state` rows, tests | Strategy dev | D6 |
| D8 | "Felled by the party" cue and shared-bar HUD polish | `src/fight/cues/*` or PR C's vocabulary, rows | Physics Dev | PR C, D6; visible, so it needs 375 stills vs toggle and a verdict |
| D9 | Umbrella `?live=` row and default flip | `data/live.json`, `src/client/live-flags.ts` | Strategy dev; flip is Dom's call | two-phone pass |
| D10 | OPTIONAL step 2 transport (claims over presence, flusher) | `server/zone/flusher.ts`, `src/presence/wire.ts`, `src/zone/shared-hp-socket.ts` | Strategy dev | live counters show a need |

Order: D1, D2, D5 in parallel (no shared files, and none of them needs A to C to have passed). D5b after D5. D3a starts only once PRs A to C have passed. D3b after D3a+D2+D5. D4 after D3a (it can run in parallel with D3b). D6 after D1+D2+D3b+D4+PR B. D7, D8 after D6. D9 after Dom. D10 only on need.

### Test and CI plan

- Every PR: the CI jobs `test` and `zone-sql` on GitHub (`.github/workflows/ci.yml`) are the gate; `npm run check:as-data` and `npm run check:stubs` stay green (no literal numbers or strings in new `src/zone` code: every number is a row, per `scripts/as-data`).
- Unit and integration suites: `hfjob --box v3 -- npm test` (the Mac hook blocks heavy suites; the box is the run, with a receipt of the job id in the PR). Writer tests use `node --test` against the repo's existing throwaway Postgres pattern (`ZONE_SQL_URL`, as in `test/sql/zone-sql.test.mjs`), so the writer is exercised through the real `psql` runner, real SQL and the fake HTTP client, no mock of the database (the CI `zone-sql` job already has `psql`).
- New pinned tests: (a) every sim weapon id has a cap (F3); (b) writer `max_hp` == sim foe max for every kind and difficulty row (F2); (c) an error slot is a lost row (F1); (d) nothing is sent twice after a lost row (already pinned, kept); (e) the Gate 0 replay is byte-identical with the flag off, and deterministic with a scripted shared bar; (f) a spawn row whose key fails `ids.instancePattern`, or collides, fails world-data validation; (g) the HMAC session: a forged shard is refused, an expired session is refused (`401`), a session for shard 2 cannot hit shard 3; (h) scoped `/state` refuses more than `maxInstances`; (i) no-edge pins: a presence walker 5 km out in every direction is accepted by the speed clamp and seen by a neighbour with correct offsets, and no row or source file under `src/zone`, `src/presence`, `server/presence` or `server/zone` mentions a walkable limit (`walkHalfCm`, `walkable`) once D5b lands.
- Two-phone gate (manual, Dom): two phones, one shard, one boss somewhere in the world: both see one bar; one kills, both see it die; both see the respawn at about the same time; then both walk a long way from the start point and still see each other. Receipts: `GET /zone/health` and `GET /presence/health` counters and the batch log lines.
- No load test (Strategy ruling). The writer logs the same counters presence does (`/zone/health`: batches, lost rows, replays, deadlock slots, p95 batch ms, per minute) so real play shows any problem.
- Visual PRs (D6 if it draws, D8): 375-wide before/after stills against the toggle and a posted reviewer verdict before merge (rule `v3-stills-before-merge`).

## 7. Decisions (Strategy) and open questions

### Decisions

Strategy ruled on this design; the sections above are written to match.

0. **Final ruling (Dom): one endless open world.** No fenced fighting place, no held duel, no copy-per-fight, no edge the player can meet; ground streams around the hero; the old frame is a streaming/interest window (a perf row), never a boundary; spawns are placed across the world by rows; fights happen wherever bodies stand; shards are invisible server plumbing (section 0).
1. **Shards of 20 (24 with a friend), a new copy when full, V1's layer model, no load test.** One world of 50+ is a later experiment behind a row (1.5, 3.4).
2. **Postgres on the existing VPS, V1's pattern (psql writer, migrations in the repo). No Supabase, no new cost** (2, 2.5).
3. **The anonymous presence-issued session is enough for the alpha ("paid" = recorded). The local kill STANDS at once (the phone is the feel); the server records or refuses credit afterwards (V1's `kill_report` shape); the boss never waits for the server** (2.4, 4.2).
4. **The writer is its own small service `server/zone/`, built only after PRs A to C have passed, modelled on V1 `origins/server/world-spawns.ts`.** The first writer PR is the `server/zone/` skeleton plus migrations plus `kill_report` (D3a in section 6).

### Open questions for Strategy

Ranked by how much they block. 1 and 5 block D3b/D6; 7 blocks PR A's live walk; the rest can follow the two-phone pass.

1. **One difficulty per shared boss.** The shared boss has a fixed difficulty from the world row; a player on a different `?difficulty=` plays that boss locally and unshared. Is that right, or should the server have per-player scaling (which breaks one shared bar)?
2. **Boss regeneration after a walk-away.** A boss left alone: stays hurt forever until killed, heals on a server timer (a new SQL rule), or resets when no engage token is live for N seconds (a sweep in the writer, no SQL change)? Default in this plan: stays hurt until killed (simplest; may feel wrong when a player flees).
3. **True shared fights.** Do we ever need A to SEE B's boss turn on B (one boss body, two heroes)? That needs a host or a server-authoritative boss and a boss-in-presence entity; it contradicts "solo-sim stays local". If yes it is a separate design and the finish-window/knockdown rows (`data/feel-sim.json`) become server-visible. If no, the limit in 4.1 stands and Dom should hear it.
4. **PvP and hero death.** Presence says "others have no collider, play no part in the fight". Does the world ever allow hero versus hero (the zone row has `pvp` flags per area), and if so which side is authoritative on a hero's hp? Not in this plan; and the area flags themselves are rectangles, so they too must become something that is not a border (a rule that follows the hero's position, not a gate).
5. **Number ownership for F3.** Generate the server weapon table from the move table (one source, can't drift) or hand-keep a `weaponMap` row (small, explicit, drifts)? And is `maxDamageMult` 2.5 still the real progression ceiling?
6. **Umbrella flag.** One `?live=` row for presence + sharedhp (D9) or keep the two queries forever? Needs Dom's go to flip the default after the two-phone pass either way.
7. **Who removes the sim's play limit, and the world row format.** The design needs the fight sim to run with no play limit and the spawn placement to be rows across the world with a stable per-spawn key (1.4, 4.1). It assumes PR A/B do this. Confirm the owner, and that the spawn key format (`z1:x12z-4.0`: world, streaming cell, number) is acceptable, since the SQL's `instancePattern` and every stored boss row will carry it.
8. **Shard visibility edge cases.** Two friends who log in apart land in different shards and cannot see each other until one joins the other's (the existing friend join). Is login-time friend join enough for the alpha, or does Dom want a mid-play "join friend" (a shard switch with no loading step is not possible without a short fade)? Default: login-time only.
