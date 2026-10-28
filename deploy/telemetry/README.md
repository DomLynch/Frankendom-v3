# Telemetry collector on the VPS (v3.frankendom.com/t): deploy files and apply runbook

## Status (2026-10-28)

NOT deployed. The page ships the client (it posts to `/t` and a missing route is a silent 404/405, never an error in the game). Nothing below has been applied: the collector needs an unprivileged user, a systemd unit and one nginx include, and each of those is a change to the public web server / unit set that needs an explicit go from Dom or Strategy.

```
page  --POST /t (same origin, sendBeacon / fetch keepalive)-->  nginx v3.frankendom.com :443  location = /t  -->  node 127.0.0.1:8796 (systemd, unprivileged, capped)  -->  /var/lib/frankendom-v3-telemetry/telemetry.jsonl
```

| file | goes to | what |
|---|---|---|
| `frankendom-v3-telemetry.service` | `/etc/systemd/system/` | the unit: own user, pinned checkout, `MemoryMax=128M`, `CPUQuota=20%`, sandboxing, writes only its log folder |
| `frankendom-v3-telemetry.conf` | `/etc/nginx/snippets/` | the `location = /t` proxy: POST only, 8k body, per-address `limit_req`, `access_log off`, no address passed on |
| `frankendom-v3-telemetry-limits.conf` | `/etc/nginx/conf.d/` | the `v3_telemetry_req` limit zone (http level) |

The one line to add, once, inside the `:443` block of `/etc/nginx/sites-available/v3.frankendom.com` (the real file; `sites-enabled/` holds a symlink), above the presence include:

```
    include /etc/nginx/snippets/frankendom-v3-telemetry.conf;
```

Port 8796 was free on 2026-10-28 (`ss -ltn` showed 8791 to 8794 taken; 8795 is the parked writer proof). No other service, port or process is touched.

## Apply (on an explicit go; check `uptime` first, apply only while the 1-minute load is under 20)

```bash
SHA=<full sha of main>
# 1. user, pinned checkout (no npm install: node built-ins only)
ssh VPS 'id frankendom-v3-telemetry 2>/dev/null || useradd --system --no-create-home --shell /usr/sbin/nologin frankendom-v3-telemetry'
git archive --format=tar "$SHA" server/telemetry src/telemetry-rows.ts data/telemetry.json package.json \
  | ssh VPS "mkdir -p /opt/frankendom-v3-telemetry/releases/$SHA && tar -x -C /opt/frankendom-v3-telemetry/releases/$SHA"
ssh VPS "chown -R root:root /opt/frankendom-v3-telemetry && ln -sfn releases/$SHA /opt/frankendom-v3-telemetry/current"
# 2. the unit
scp deploy/telemetry/frankendom-v3-telemetry.service VPS:/etc/systemd/system/
ssh VPS 'systemd-analyze verify /etc/systemd/system/frankendom-v3-telemetry.service && systemctl daemon-reload && systemctl enable --now frankendom-v3-telemetry'
ssh VPS 'systemctl is-active frankendom-v3-telemetry; curl -s http://127.0.0.1:8796/t/health; journalctl -u frankendom-v3-telemetry -n 5 --no-pager'
# 3. nginx: zone, snippet, then the one include line. Back the real site file up first.
scp deploy/telemetry/frankendom-v3-telemetry-limits.conf VPS:/etc/nginx/conf.d/
scp deploy/telemetry/frankendom-v3-telemetry.conf        VPS:/etc/nginx/snippets/
ssh VPS 'cp -a /etc/nginx/sites-available/v3.frankendom.com /etc/nginx/sites-available/v3.frankendom.com.bak-YYYYMMDD'
#   add the include line above, once, in the :443 block
ssh VPS 'nginx -t && systemctl reload nginx'      # reload, never restart: other sites share this nginx
```

Smoke test from outside: `curl -si -X POST https://v3.frankendom.com/t -d '{"v":1,"id":"smoke-test-1","sid":"smoke-test-2","sha":"0000000","events":[{"e":"session_start"}]}'` answers `204`; `curl -si https://v3.frankendom.com/t` answers `403` (POST only). The line then shows in the log.

Rollback: remove the include line from the site file (or restore the `.bak-YYYYMMDD` copy), `nginx -t && systemctl reload nginx`, then `systemctl disable --now frankendom-v3-telemetry`. The page keeps working with the route gone.

## Reading the log

`/var/lib/frankendom-v3-telemetry/telemetry.jsonl` (newest), `.1` to `.4` older: 10 MB each, 50 MB at most; the oldest is deleted when the live file fills. One JSON object per line: `{ t (server ms), id (per browser), sid (per visit), sha (build), e, ...fields }`.

```bash
L=/var/lib/frankendom-v3-telemetry
tail -n 20 $L/telemetry.jsonl
cat $L/telemetry.jsonl* | jq -c 'select(.e=="boss_death")' | jq -s 'group_by(.boss) | map({boss: .[0].boss, deaths: length, medianSec: (map(.sec)|sort|.[length/2|floor])})'
cat $L/telemetry.jsonl* | jq -c 'select(.e=="boss_kill")' | jq -s 'group_by(.boss) | map({boss: .[0].boss, kills: length})'
cat $L/telemetry.jsonl* | jq -c 'select(.e=="js_error")' | jq -s 'group_by(.msg) | map({msg: .[0].msg, n: length, sha: .[0].sha}) | sort_by(-.n)'
cat $L/telemetry.jsonl* | jq -c 'select(.e=="session_end")' | jq -s 'group_by(.sid) | map(map(.sec)|max)'      # one length per visit: the last session_end wins
```

## What is collected, what is not

Events (rows in `data/telemetry.json`): `session_start`, `session_end {sec}`, `boss_death {boss, sec, heroHp, bossHp}`, `boss_kill {boss, sec, heroHp, bossHp}`, `js_error {kind, msg, src, line, col, stack}`. Every event also carries the build sha, a random per-browser id and a random per-visit id.

Not collected: IP (the nginx route has `access_log off` and passes no address; the collector keys its limits by the random id), cookies, free text from the player, URLs with query strings (stripped from sources and stacks). Off for `?telemetry=off`, Do-Not-Track, localhost, and any build that is not a deployed sha.
