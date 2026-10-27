# Presence server on the VPS (v3.frankendom.com/presence): deploy files and apply runbook

Nothing here has been applied. These files are the reviewable half; the apply step changes the live production VPS and needs an explicit go from Dom or Strategy.

Shape (Strategy's ruling, 2026-10-27): the same VPS as V1, mirroring V1's nginx include + systemd unit, under `v3.frankendom.com`, with yard-sized caps (layers soft 20 / hard 24, rows in `data/presence.json`, V1 used 80/100).

```
page ?presence=1 --wss--> nginx v3.frankendom.com :443  location = /presence  --ws--> node 127.0.0.1:8794 (systemd, unprivileged, capped)
```

## Files

| file | goes to | what |
|---|---|---|
| `frankendom-v3-presence.service` | `/etc/systemd/system/` | the unit: own user, pinned checkout, `Restart=on-failure`, `MemoryMax=256M`, `CPUQuota=50%`, sandboxing |
| `frankendom-v3-presence.conf` | `/etc/nginx/snippets/` | the `location = /presence` WebSocket proxy (Upgrade headers, 90 s timeouts, per-IP `limit_conn` / `limit_req`) |
| `frankendom-v3-presence-limits.conf` | `/etc/nginx/conf.d/` | the two `v3_presence_*` limit zones (http level) |

Names differ from V1's on purpose. The VPS already runs V1's `frankendom-presence.service` (port 8793, `/opt/frankendom-presence`) and has `/etc/nginx/snippets/frankendom-presence.conf`; the `-v3-` names, port 8794 and the `v3_presence_*` zones cannot clash with them. Read-only look at the box on 2026-10-27: node v22.23.2 at `/usr/bin/node` (needs 22.18+), nginx 1.24.0, nothing listening on 8794, no `frankendom-v3-presence` user, 16 cores, load average about 3.5-4.8.

The exact line to add to `/etc/nginx/sites-available/v3.frankendom.com` (the real file; `sites-enabled/v3.frankendom.com` is a symlink to it), once, inside the `server { listen 443 ssl; ... }` block (the second server block; the first is the :80 redirect), for example just above `location ^~ /b/ {`:

```
    include /etc/nginx/snippets/frankendom-v3-presence.conf;
```

Not proxied on purpose: `/presence/health`. Read it on the box: `curl -s http://127.0.0.1:8794/presence/health`.

## Before you start

1. Merge this PR and pick the commit to run. `SHA=<full 40-char sha of main>`. Everything below pins that sha.
2. Keep the ssh key out of every file and log. All VPS commands: `ssh -o BatchMode=yes -i ~/.ssh/binance_futures_tool root@49.12.7.18`.
3. Check the load first (`uptime`). The box is shared; apply only while the 1-minute load is under 20 (Strategy's gate); above that, wait.
4. Do not touch `/var/www/frankendom`, `/srv/frankendom-v3/live` (the game's own deploy), V1's presence unit, or any other lane's service.

## Apply (in this order; each step is safe to stop after)

Run the git steps on a checkout of the repo (the Mac or CI); the VPS never needs repo credentials.

```bash
# 1. The dedicated unprivileged user (no shell, no home, owns nothing)
ssh VPS 'id frankendom-v3-presence 2>/dev/null || useradd --system --no-create-home --shell /usr/sbin/nologin frankendom-v3-presence'

# 2. The pinned checkout: only the files the service imports, at exactly $SHA, root-owned and read-only to the service
git archive --format=tar "$SHA" server/presence src/presence data/presence.json package.json \
  | ssh VPS "mkdir -p /opt/frankendom-v3-presence/releases/$SHA && tar -x -C /opt/frankendom-v3-presence/releases/$SHA"
ssh VPS "chown -R root:root /opt/frankendom-v3-presence && ln -sfn releases/$SHA /opt/frankendom-v3-presence/current"

# 3. Dependencies: none (no npm install). Prove the checkout runs before anything is enabled:
ssh VPS "cd /opt/frankendom-v3-presence/current && node server/presence/smoke.ts"      # exit 0 = two bots saw each other (uses a free port, not 8794)

# 4. The unit
scp deploy/presence/frankendom-v3-presence.service VPS:/etc/systemd/system/
ssh VPS 'systemd-analyze verify /etc/systemd/system/frankendom-v3-presence.service && systemctl daemon-reload && systemctl enable --now frankendom-v3-presence'
ssh VPS 'systemctl is-active frankendom-v3-presence; curl -s http://127.0.0.1:8794/presence/health; journalctl -u frankendom-v3-presence -n 5 --no-pager'
# the journal says: presence listening on 127.0.0.1:8794 (layers: soft 20, hard 24)

# 5. nginx: the zones, the snippet, then the one include line. Back the site file up first.
scp deploy/presence/frankendom-v3-presence-limits.conf VPS:/etc/nginx/conf.d/
scp deploy/presence/frankendom-v3-presence.conf        VPS:/etc/nginx/snippets/
#    /etc/nginx/sites-enabled/v3.frankendom.com is a SYMLINK to /etc/nginx/sites-available/v3.frankendom.com (read 2026-10-27): back up and edit the REAL file there,
#    as the V3 convention does (v3.frankendom.com.bak-20261026 sits beside it). Never put a copy in sites-enabled: nginx would load it as a second server block.
ssh VPS 'cp -a /etc/nginx/sites-available/v3.frankendom.com /etc/nginx/sites-available/v3.frankendom.com.bak-YYYYMMDD'     # YYYYMMDD = the apply day
#   edit /etc/nginx/sites-available/v3.frankendom.com: add the include line shown above, once, in the :443 block (the symlink picks it up)
ssh VPS 'nginx -t'                                  # must say "syntax is ok" and "test is successful"; if not, go to Rollback step B and stop
ssh VPS 'systemctl reload nginx'                    # reload, never restart: other sites share this nginx
```

## Smoke test from outside (any machine with node 22+)

```bash
node -e "
const ws = new WebSocket('wss://v3.frankendom.com/presence', 'frankendom.v3.presence.1');
ws.binaryType = 'arraybuffer';
const t = setTimeout(() => { console.log('FAIL: no frame in 5 s'); process.exit(1); }, 5000);
ws.onmessage = (e) => { console.log('OK: first message', typeof e.data === 'string' ? e.data : e.data.byteLength + ' bytes', '| protocol', ws.protocol); clearTimeout(t); ws.close(); };
ws.onerror = (e) => { console.log('FAIL:', e.message || 'error'); process.exit(1); };
"
```

Expect `OK: first message {"t":"hello","id":1,"layer":1,...}` (this exact client was run against a local copy of the service on 2026-10-27 and printed that; only the wss URL and nginx hop are untested). Then check the guards: a plain `curl -si https://v3.frankendom.com/presence` (no Upgrade) is refused (the service answers 404, not a hang); `curl -si https://v3.frankendom.com/presence/health` falls through to the site (the SPA's index.html, 200 from `try_files`), not the service; opening 10 sockets from one address gets 429 on the ones past 8. Finally load `https://v3.frankendom.com/?presence=1` in two browsers and see `window.__v3Presence.state()`.

## Expected resource use

A guard, not a measurement (nothing has run on this box yet). One node process, about 40-80 MB resident idle (V1's same service is about 75 MB on this box), 10 ticks a second, one binary packet per player per due tick (a packet is 4 + 11 per other player, at most 40 others). At 24 players: well under 1% of a core and tens of kB/s out. Hard limits in the unit: `MemoryMax=256M` (kernel kill, then `Restart=on-failure` after 3 s), `MemoryHigh=192M`, `CPUQuota=50%`, `TasksMax=64`, at most 5 restarts per minute. Layers: 20 layers x 24 is the ceiling of the `maxLayers` row (480 players); a yard-sized trial will sit in one.

## What to watch (first hour, then daily)

- `systemctl status frankendom-v3-presence` (Active, restart count) and `journalctl -u frankendom-v3-presence -f`; a restart loop shows as `start-limit-hit`.
- `curl -s http://127.0.0.1:8794/presence/health` (players per layer, tick time; tick p99 should stay under the 100 ms tick) and `systemctl show frankendom-v3-presence -p MemoryCurrent,CPUUsageNSec`.
- `uptime` and `ss -ltn | grep 8794` (loopback only, never `0.0.0.0` or `*`).
- nginx: `grep ' 429 ' /var/log/nginx/access.log | grep presence` (a real player behind a shared address could trip `limit_conn` 8; raise the number in the snippet if so).
- Other lanes: if load climbs, `systemctl stop frankendom-v3-presence` first, ask second. The game itself runs without it (presence is default OFF in the page).

## Rollback

A. Take presence out of service (keeps the files for later): `systemctl disable --now frankendom-v3-presence`. The page's `?presence=` client then fails to connect and gives up after its retries; the game is unaffected.

B. Take the route out of nginx. Primary: remove the one `include .../frankendom-v3-presence.conf;` line from `/etc/nginx/sites-available/v3.frankendom.com` (the real file behind the sites-enabled symlink), `nginx -t`, `systemctl reload nginx`. Secondary, only if the edit left the file damaged: `cp -a /etc/nginx/sites-available/v3.frankendom.com.bak-YYYYMMDD /etc/nginx/sites-available/v3.frankendom.com` (the backup from apply step 5), then `nginx -t` and reload. Then remove `/etc/nginx/snippets/frankendom-v3-presence.conf` and `/etc/nginx/conf.d/frankendom-v3-presence-limits.conf` (leave the zone file if the include is still there: nginx would fail `nginx -t` on an unknown zone).

C. Remove everything: A and B, then `rm /etc/systemd/system/frankendom-v3-presence.service && systemctl daemon-reload`, `rm -rf /opt/frankendom-v3-presence`, `userdel frankendom-v3-presence`.

D. Change the pinned commit: repeat apply steps 2 and 3 for the new `$SHA` (the `ln -sfn` is the switch), then `systemctl restart frankendom-v3-presence`. Roll back by pointing `current` at the old `releases/<sha>` and restarting. Old releases are a few hundred kB each.

## What keeps these files honest

`test/deploy-presence.test.mjs` (runs in CI) reads these three files and the rows: the unit has `Restart=`, `MemoryMax=`, `CPUQuota=` and an `ExecStart` that names the real entry file; the snippet has the Upgrade and Connection headers, the `limit_*` lines and the port and path from `data/presence.json`; every zone the snippet names is defined in the limits file; the README names the three files.
