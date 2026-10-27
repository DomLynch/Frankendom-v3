# Presence: other players on screen (live zone, phase 2)

The presence service tells each connected page where the nearby other players are. It is a standalone node process, not part of the game bundle. Others have no collider and play no part in the fight. With `?presence=` the page now draws them (see "Drawn" and "Testing with two phones" below).

## Run it

```
npm run presence          # listens on 127.0.0.1:8794 (data/presence.json presencePort), WebSocket path /presence
npm run presence:smoke    # starts a service on a free port, connects two clients, walks them, prints what each sees; exit 0 = both saw the other
```

The one env override is `PRESENCE_HOST`, the bind address (default: the `host` row, `127.0.0.1`; keep loopback and put a reverse proxy in front for anything public). Port, caps and limits are rows in `data/presence.json`. A socket that pings faster than `perSecond` or lets more than `maxWriteBytes` queue unread is closed. `GET /presence/health` returns the counters.

Needs node 22.18+ (it runs the `.ts` files directly). No npm dependency.

## Try it in the page

Default OFF: with no `?presence=` nothing is fetched. Add `?presence=ws://127.0.0.1:8794/presence` (or `?presence=1` for this page's own host at `/presence`, wss on https). The client chunk (`b/vendor/presence.<hash>.js`, 4 KB gzip) loads on demand and the handle is `window.__v3Presence`:

```
p.remotes(now?, hero?)   // other players nearest first, eased between packets: [{ id, x, z, heading, speed }] metres
p.on('hello' | 'others' | 'state', fn)   // returns an unsubscribe
p.self()  p.state()  p.flush()  p.stop()
```

The hero's pose is read from `globalThis.__v3HeroPose()` (returns `{ x, z, heading, anim }`: metres, radians, and the anim byte 1 stands / 2 walks / 3 runs from the speed he covers). `startZonePresence` (chunk.ts, called by main.ts only behind `?presence=`) installs it; on a page without `?presence=` the function does not exist.

## Drawn

`src/presence/draw.ts` (inside the presence chunk, no THREE import, so the default page carries none of it): for each entry of `remotes()` (nearest first, eased between packets by `track.ts`) it takes a body from a small pool, places it at x/z on the ground, turns it to the heading and plays the hero's own idle/walk/run from the speed it covers; a player who leaves (or whose packets stop for `remoteExpire` ms) has the body hidden and recycled. The body is `view.spawnRemote()` (the one marked block added to `src/fight/scene.ts`): `buildWarriors` clones the hero's already-loaded Psyche 106 asset, so nothing is fetched or parsed and the materials and shader programs are the hero's. Others have no collider, no tap target and no part in the sim. The number drawn is the `drawMax` row (8); speed easing, the idle threshold and the anim ids are rows too (`data/presence.json`). `window.__v3Presence.drawn()` lists who is on screen.

## Testing with two phones

Honest first: **a presence server has to be running somewhere both phones can reach before this does anything, and this PR does not deploy one.** Nothing in the live site starts it; with no `?presence=` the game is exactly as before.

What Dom does, once a server is up (a box with node 22.18+, this repo, `npm run presence`, and a reverse proxy giving it `wss://` on the same host as the page, because an https page cannot open a plain `ws://`):

1. On the proxy, forward `/presence` (WebSocket upgrade) to `127.0.0.1:8794`.
2. On each phone open the game with `?presence=1` (this page's own host at `/presence`, `wss` on https), or `?presence=wss://<host>/presence` for a server on another host.
3. Wait for the fight to load (both phones). Each phone shows the other as a second Psyche; walk one (not W into the Minotaur: it stops against him; strafing sideways shows it best) and the other sees it walk, then stand when it stops. Close one phone's tab: its figure disappears from the other within about two seconds.

Without a deployed server, on one Mac: `npm run build && node scripts/serve.mjs 8733`, `npm run presence`, then open `http://127.0.0.1:8733/?presence=ws://127.0.0.1:8794/presence` in two browser windows (or `node scripts/presence-two-pages.mjs http://127.0.0.1:8733 ws://127.0.0.1:8794/presence <out dir>`: two headless pages, one walks, a 375 still from the other, positions printed; needs playwright, `PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs` if it is not resolvable here). A phone on the same wifi can use `http://<mac lan ip>:8733/?presence=ws://<mac lan ip>:8794/presence` with `PRESENCE_HOST=0.0.0.0 npm run presence` (plain ws is allowed from a plain http page; keep that open only on a trusted network).

Known limits of the first draw: everyone joins at world (0, 0) and the page's hero starts about 2 m away, so a joiner's first poses are inside the server's speed credit but a hero that starts farther than a few metres from (0, 0) would be struck and could be dropped; a remote shows the plain figure (no name, gear or weapon state, no attacks or deaths: just standing and walking).

## Rows and layout

- `data/presence.json`: every number (V1's presence rule rows, same ids and values), the frame, the path, the protocol name. `test/presence/rows.test.mjs` pins them.
- `server/presence/`: `server.ts` (WebSocket, 100 ms tick, caps, limits), `interest.ts` (layers, interest tiers, speed clamp), `main.ts`, `smoke.ts`, `test-client.ts`.
- `src/presence/`: `wire.ts`, `rows.ts`, `client.ts` (join), `track.ts` (ease), `chunk.ts` (the API above).

## Not done

No deployment of the server. No accounts or identity (every join is a fresh player the server names). No names, gear, attacks or deaths on the drawn others (a plain standing/walking figure). Crowd handling (cheap rungs, frustum hiding) is not lifted from V1 yet: the cap is 8. Origin checking and TLS belong to the proxy in front of it.
