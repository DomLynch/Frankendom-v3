# Presence proof: two phones, one shard, one boss, a recorded kill credit

Strategy's MMO milestone, smallest slice. Everything is OFF by default and in memory. Nothing is deployed or public.

## What already existed (reused, unchanged)

| Piece | Where |
|---|---|
| Presence service (WebSocket, shards, interest, speed clamp, health) | `server/presence/`, `data/presence.json`, `docs/PRESENCE.md`, `test/presence/` |
| "Shard" = presence **layer**: 20 players soft cap, 24 hard (friend join), at most 20 shards per box (`softCap`, `hardCap`, `maxLayers`). "20 shards" in the brief means shards of 20 players. Invisible plumbing, never a border (`docs/ZONE-LIVE-DESIGN.md`, PR #122 branch `docs/zone-live-design`) | |
| Client flag `?presence=1` (or `=ws(s)://...`), remote players drawn with the hero's own Psyche body, `window.__v3Presence` | `src/presence/*`, `src/client/main.ts` |
| Client flag `?sharedhp=1`, the shared-hp client (engage, claim, flush, state, kill credit read) and its fetch transport | `src/zone/shared-hp-*.ts`, `data/zone-client.json` |
| The writer's rules and reference model (one bar per (spawn, shard), damage-share credit settled in the killing hit) | `data/zone-server-rules.json`, `src/server-model/zone-model.ts`; SQL twin `supabase/migrations/20261027000001_zone_server.sql`, run against Postgres by the `zone-sql` CI job |
| Two-page browser smoke for presence | `scripts/presence-two-pages.mjs` |

Missing: the writer service itself (`server/zone/`), and the sim to client wiring (hits are not fed to the shared-hp client yet).

## What this PR adds

- `server/zone/writer.ts`, `main.ts`, `writer-rows.json` (kept out of `data/` because the build ships `data/*.json`): the five contract routes over the reference model, in memory, loopback, port row 8795 (`npm run zone-writer`). Proof only: the account is a random cookie it mints; the page-supplied shard is trusted.
- `test/zone/writer.test.mjs`: two presence bots in one shard see each other; two real shared-hp clients (separate cookie jars) kill one boss; two paid credits that add up to the bar; another shard has its own bar; forged claims are capped; replayed batch ids apply nothing; default-off pins.
- `scripts/presence-proof.mjs` (`npm run presence:proof -- <out dir>`): the same walk with two headless 375-wide Chromium phones on the built game, one origin, `?presence=1&sharedhp=1`.
- No file under `src/`, `data/` or `index.html` changed, so with the flags off the page is byte-identical and `firstVisitBytes` cannot move. Receipt: the sorted sha256 list of every non-gzip file in `dist/`, built from this branch and from origin/main on the VPS, is identical (see the PR).

Flags: none new. `?presence=1` (bodies) and `?sharedhp=1` (shared bar and credit).

## Finding

A hit that arrives after another phone's kill finds its token used; the model and the SQL raise `O0009`, which the client treats as "token unknown" and drops its token, so that phone can no longer ask for its credit. The proof writer answers `dead` for a token the kill closed (keeps the token). The model and SQL are not changed here; the same rule should move into `zone_spawn_hit` and the model, with a twin test.

## Not done

Sim to shared-hp wiring (the swings in the proof are fed by the script), accounts and the HMAC session, persistence (credits live in the writer's memory), hosting, TLS and a public proxy.
