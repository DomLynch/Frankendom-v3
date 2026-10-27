// The presence deploy files (deploy/presence/) cannot rot: the unit and the nginx files are only read here, never applied. They must exist, hold the lines a runaway or a broken WebSocket proxy would need,
// and agree with data/presence.json (port, path) and with the real entry file. The apply step itself is the runbook in deploy/presence/README.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PRESENCE, presenceRule } from '../src/presence/rows.ts';

const DIR = new URL('../deploy/presence/', import.meta.url);
const read = (f) => readFileSync(new URL(f, DIR), 'utf8');
const lines = (s) => s.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const FILES = ['frankendom-v3-presence.service', 'frankendom-v3-presence.conf', 'frankendom-v3-presence-limits.conf', 'README.md'];

test('the deploy files exist and are not empty', () => {
  for (const f of FILES) { assert.ok(existsSync(new URL(f, DIR)), `${f} exists`); assert.ok(read(f).trim().length > 200, `${f} is not a stub`); }
});

test('the unit: own user, pinned checkout, the real entry file, restarts on failure, and memory / CPU / task caps so a runaway cannot take the shared box', () => {
  const unit = lines(read('frankendom-v3-presence.service'));
  const has = (re) => unit.some((l) => re.test(l));
  for (const re of [/^\[Unit\]$/, /^\[Service\]$/, /^\[Install\]$/, /^Restart=on-failure$/, /^MemoryMax=\d+M$/, /^CPUQuota=\d+%$/, /^TasksMax=\d+$/, /^NoNewPrivileges=yes$/, /^ProtectSystem=strict$/, /^PrivateTmp=yes$/, /^WantedBy=multi-user\.target$/]) assert.ok(has(re), `unit has ${re}`);
  const user = unit.find((l) => l.startsWith('User='))?.slice(5);
  assert.ok(user && user !== 'root' && !/^\d+$/.test(user), 'an unprivileged named user, never root');
  assert.equal(unit.find((l) => l.startsWith('Group='))?.slice(6), user);
  assert.match(unit.find((l) => l.startsWith('WorkingDirectory=')), /^WorkingDirectory=\/opt\/frankendom-v3-presence\/current$/, 'the pinned checkout path (a symlink to releases/<sha>)');
  const exec = unit.find((l) => l.startsWith('ExecStart=')).slice('ExecStart='.length).split(/\s+/);
  assert.deepEqual(exec, ['/usr/bin/node', 'server/presence/main.ts'], 'node runs the presence entry');
  assert.ok(existsSync(new URL(`../${exec[1]}`, import.meta.url)), 'the entry file exists in the repo');
  assert.ok(!has(/^PRESENCE_HOST=/) && !has(/^Environment=.*PRESENCE_HOST/), 'the bind address stays the loopback default row');
  assert.ok(!has(/^Environment=.*(TOKEN|KEY|SECRET|PASSWORD)/i), 'no secret in the unit');
  const sectionOf = (key) => { let s = ''; for (const l of unit) { if (/^\[.+\]$/.test(l)) s = l; else if (l.startsWith(`${key}=`)) return s; } return null; };
  assert.equal(sectionOf('StartLimitIntervalSec'), '[Unit]', 'StartLimitIntervalSec belongs in [Unit] (systemd ignores it in [Service])');
  assert.equal(sectionOf('StartLimitBurst'), '[Unit]', 'StartLimitBurst belongs in [Unit]');
  assert.ok(!/frankendom-presence\.service/.test(unit.join('\n')), 'never names V1\'s unit');
  const mem = Number(unit.find((l) => l.startsWith('MemoryMax=')).match(/\d+/)[0]), cpu = Number(unit.find((l) => l.startsWith('CPUQuota=')).match(/\d+/)[0]);
  assert.ok(mem <= 512 && cpu <= 100, 'capped: at most 512 MB and one core');
});

test('the nginx snippet: one exact /presence location, the WebSocket upgrade headers, the proxy target from the rows, long read timeout, per-IP limits', () => {
  const conf = read('frankendom-v3-presence.conf'), code = lines(conf).join('\n');
  assert.match(code, new RegExp(`^location = ${PRESENCE.path} \\{`, 'm'), 'an exact-match location on the presence path');
  assert.equal([...code.matchAll(/^location /gm)].length, 1, 'one location only: /presence/health is not proxied');
  assert.match(code, new RegExp(`proxy_pass http://127\\.0\\.0\\.1:${presenceRule('presencePort')};`), 'the loopback port is the presencePort row');
  for (const re of [/proxy_http_version 1\.1;/, /proxy_set_header Upgrade \$http_upgrade;/, /proxy_set_header Connection "upgrade";/, /proxy_set_header X-Real-IP \$remote_addr;/, /proxy_buffering off;/]) assert.match(code, re);
  assert.ok(Number(code.match(/proxy_read_timeout (\d+)s;/)?.[1]) >= 60, 'a long read timeout (the service beats every 2 s, drops idle at 30 s)');
  assert.match(code, /limit_conn v3_presence_conn \d+;/);
  assert.match(code, /limit_req zone=v3_presence_req burst=\d+/);
  assert.ok(Number(code.match(/limit_conn v3_presence_conn (\d+);/)[1]) <= presenceRule('ipSockets'), 'nginx never allows more sockets per IP than the service does');
  assert.match(conf, /include \/etc\/nginx\/snippets\/frankendom-v3-presence\.conf;/, 'the header comment names the exact include line');
});

test('every limit zone the snippet uses is defined in the limits file (http level), with v3_ names that cannot clash with the other sites\' zones', () => {
  const used = [...read('frankendom-v3-presence.conf').matchAll(/limit_conn (\w+) |limit_req zone=(\w+)/g)].map((m) => m[1] ?? m[2]);
  const limits = lines(read('frankendom-v3-presence-limits.conf')).join('\n');
  const defined = [...limits.matchAll(/^limit_(?:conn|req)_zone .* zone=(\w+):/gm)].map((m) => m[1]);
  assert.deepEqual([...new Set(used)].sort(), defined.sort());
  for (const z of defined) assert.match(z, /^v3_presence_/);
  assert.doesNotMatch(limits, /\blocation\b|\bserver\b/, 'http-level directives only');
});

test('the README is the runbook: it names every file, the include line, nginx -t, the reload, the smoke test and the rollback', () => {
  const md = read('README.md');
  for (const f of FILES.slice(0, 3)) assert.ok(md.includes(f), `README names ${f}`);
  for (const s of ['include /etc/nginx/snippets/frankendom-v3-presence.conf;', 'useradd', 'git archive', 'systemctl enable --now', 'nginx -t', 'systemctl reload nginx', 'new WebSocket(', '## Rollback', '## Expected resource use', '## What to watch']) assert.ok(md.includes(s), `README has ${s}`);
  assert.match(md, /cp -a \/etc\/nginx\/sites-available\/v3\.frankendom\.com \/etc\/nginx\/sites-available\/v3\.frankendom\.com\.bak-YYYYMMDD/, 'the backup is a copy of the real file in sites-available');
  assert.doesNotMatch(md, /cp -a \/etc\/nginx\/sites-enabled|sites-enabled\/v3\.frankendom\.com\.bak/, 'never copy the symlink or leave a .bak in sites-enabled (nginx would load it twice)');
  assert.ok(md.indexOf('Primary: remove the one `include') > 0 && md.indexOf('Primary:') < md.indexOf('Secondary,'), 'rollback B: removing the include line is primary, the file restore secondary');
  assert.match(md, /1-minute load is under 20/, 'the load gate is Strategy\'s: under 20');
  assert.doesNotMatch(md, /hf_[A-Za-z0-9]{10,}|BEGIN [A-Z ]*PRIVATE KEY|sk-[A-Za-z0-9]{20,}/, 'no token or key in the runbook');
  assert.ok(md.indexOf('useradd') < md.indexOf('git archive') && md.indexOf('git archive') < md.indexOf('systemctl enable --now') && md.indexOf('systemctl enable --now') < md.indexOf('nginx -t') && md.indexOf('nginx -t') < md.indexOf('systemctl reload nginx'), 'the steps are in order');
});
