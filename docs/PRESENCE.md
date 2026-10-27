# Presence: other players on screen (live zone, phase 2)

The presence service tells each connected page where the nearby other players are. It is a standalone node process, not part of the game bundle. Others have no collider and play no part in the fight; nothing is rendered yet.

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

The hero's pose is read from `globalThis.__v3HeroPose()` (returns `{ x, z, heading }` in metres, or null); scene.ts fills that seam in the wiring step.

## Rows and layout

- `data/presence.json`: every number (V1's presence rule rows, same ids and values), the frame, the path, the protocol name. `test/presence/rows.test.mjs` pins them.
- `server/presence/`: `server.ts` (WebSocket, 100 ms tick, caps, limits), `interest.ts` (layers, interest tiers, speed clamp), `main.ts`, `smoke.ts`, `test-client.ts`.
- `src/presence/`: `wire.ts`, `rows.ts`, `client.ts` (join), `track.ts` (ease), `chunk.ts` (the API above).

## Not done

No deployment of the server. No accounts or identity (every join is a fresh player the server names). No rendering, names or gear. Origin checking and TLS belong to the proxy in front of it.
