// The telemetry collector (server/telemetry/): validates, appends JSONL, rotates under a size cap, rate-limits per id, stays on loopback, stores no address.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCollector, createLog } from '../server/telemetry/server.ts';
import { TELEMETRY } from '../src/telemetry-rows.ts';

const dir = () => mkdtempSync(join(tmpdir(), 'tele-'));
const env = (over = {}) => ({ v: 1, id: 'browser-aaaaaa', sid: 'visit-bbbbbb', sha: 'cfb2909e', events: [{ e: 'boss_death', boss: 'gargantua', sec: 20, heroHp: 0, bossHp: 40 }], ...over });
const lines = (d) => readFileSync(join(d, TELEMETRY.server.logName), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('accept: a valid envelope is written as one line per event; junk is a 400 and writes nothing', () => {
  const d = dir(); const c = createCollector({ dir: d, now: () => 5000 });
  assert.equal(c.accept(JSON.stringify(env({ events: [env().events[0], { e: 'session_end', sec: 61.5 }, { e: 'nope' }] }))), 204);
  const l = lines(d);
  assert.equal(l.length, 2);
  assert.deepEqual(l[0], { t: 5000, id: 'browser-aaaaaa', sid: 'visit-bbbbbb', sha: 'cfb2909e', e: 'boss_death', boss: 'gargantua', sec: 20, heroHp: 0, bossHp: 40 });
  for (const bad of ['', 'not json', '[]', 'null', JSON.stringify(env({ v: 2 })), JSON.stringify(env({ id: 'x' })), JSON.stringify(env({ events: [] })), JSON.stringify(env({ events: [{ e: 'nope' }] })), JSON.stringify(env({ sha: 'bad sha!' }))]) assert.equal(c.accept(bad), 400, bad);
  assert.equal(lines(d).length, 2);
  rmSync(d, { recursive: true });
});

test('what is written holds no address and no field outside the table', () => {
  const d = dir(); const c = createCollector({ dir: d });
  c.accept(JSON.stringify(env({ ip: '1.2.3.4', events: [{ e: 'boss_kill', boss: 'arachne', sec: 3, heroHp: 80, bossHp: 0, ip: '1.2.3.4', email: 'a@b.c' }] })));
  const text = readFileSync(join(d, TELEMETRY.server.logName), 'utf8');
  assert.ok(!/1\.2\.3\.4|a@b\.c|email|ip"/.test(text), text);
  rmSync(d, { recursive: true });
});

test('per-id limits: requests and events per minute, then it resets; the global budget and the id table are bounded', () => {
  const d = dir(); let t = 0; const c = createCollector({ dir: d, now: () => t });
  const S = TELEMETRY.server;
  let ok = 0, limited = 0;
  for (let i = 0; i < S.perIdRequestsPerMinute + 5; i++) (c.accept(JSON.stringify(env())) === 204 ? ok++ : limited++);
  assert.equal(ok, S.perIdRequestsPerMinute); assert.equal(limited, 5);
  assert.equal(c.accept(JSON.stringify(env({ id: 'other-cccccc' }))), 204, 'another id is not limited by the first');
  t += 61_000; assert.equal(c.accept(JSON.stringify(env())), 204, 'a new minute');
  const many = { e: 'js_error', kind: 'error', msg: 'm' };
  t += 61_000; let n = 0;
  for (let i = 0; i < 20; i++) if (c.accept(JSON.stringify(env({ events: Array(TELEMETRY.client.maxBatch).fill(many) }))) === 204) n += TELEMETRY.client.maxBatch;
  assert.ok(n <= S.perIdEventsPerMinute, `${n} events in a minute`);
  rmSync(d, { recursive: true });
  // a flood of fresh ids cannot grow the table past maxTrackedIds, nor the log past the global budget
  const d2 = dir(); const defs = structuredClone(TELEMETRY); defs.server.maxTrackedIds = 20; defs.server.globalEventsPerMinute = 15;
  const c2 = createCollector({ dir: d2, defs, now: () => 0 }); let got = 0;
  for (let i = 0; i < 100; i++) if (c2.accept(JSON.stringify(env({ id: `flood-${String(i).padStart(4, '0')}` }))) === 204) got++;
  assert.equal(got, 15); assert.equal(lines(d2).length, 15);
  rmSync(d2, { recursive: true });
});

test('the log rotates at maxFileBytes and keeps keepFiles files: disk use has a ceiling', () => {
  const d = dir(); const log = createLog(d, 'x.jsonl', 200, 3);
  for (let i = 0; i < 100; i++) log.append([JSON.stringify({ i, pad: 'p'.repeat(30) })]);
  const files = readdirSync(d).sort();
  assert.deepEqual(files, ['x.jsonl', 'x.jsonl.1', 'x.jsonl.2']);
  const total = files.reduce((s, f) => s + statSync(join(d, f)).size, 0);
  assert.ok(total <= 3 * (200 + 80), `${total} bytes`);
  assert.ok(readFileSync(join(d, 'x.jsonl'), 'utf8').includes('"i":99'), 'the newest line is in the live file');
  rmSync(d, { recursive: true });
  const d1 = dir(); const one = createLog(d1, 'y.jsonl', 100, 1);   // keepFiles 1: just the live file, truncated on rotation
  for (let i = 0; i < 20; i++) one.append([JSON.stringify({ i, pad: 'p'.repeat(30) })]);
  assert.deepEqual(readdirSync(d1), ['y.jsonl']); assert.ok(statSync(join(d1, 'y.jsonl')).size <= 180);
  rmSync(d1, { recursive: true });
});

test('over HTTP on loopback: 204 for a good POST, 413 for a big body, 404 for the wrong path or method, and no CORS or cookies are handed out', async () => {
  const d = dir(); const c = createCollector({ dir: d });
  await new Promise((r) => c.server.listen(0, TELEMETRY.server.host, r));
  const { port, address } = c.server.address();
  assert.equal(address, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  const post = (path, body, init = {}) => fetch(base + path, { method: 'POST', body, headers: { 'content-type': 'text/plain' }, ...init });
  const ok = await post(TELEMETRY.path, JSON.stringify(env()));
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), null); assert.equal(ok.headers.get('set-cookie'), null);
  assert.equal((await post(TELEMETRY.path, 'x'.repeat(TELEMETRY.caps.maxBodyBytes + 10))).status, 413);
  assert.equal((await post('/other', JSON.stringify(env()))).status, 404);
  assert.equal((await fetch(base + TELEMETRY.path)).status, 404);
  assert.equal((await post(TELEMETRY.path, 'not json')).status, 400);
  const health = await fetch(`${base}${TELEMETRY.path}/health`); assert.equal(health.status, 200);
  assert.equal((await health.json()).accepted, 1);
  assert.equal(lines(d).length, 1);
  await c.close(); rmSync(d, { recursive: true });
});

test('the deploy files exist and agree with the rows: loopback port, unprivileged user, caps, the proxy route, the log folder', () => {
  const D = new URL('../deploy/telemetry/', import.meta.url), S = TELEMETRY.server;
  const read = (f) => readFileSync(new URL(f, D), 'utf8');
  for (const f of ['frankendom-v3-telemetry.service', 'frankendom-v3-telemetry.conf', 'README.md']) assert.ok(existsSync(new URL(f, D)), f);
  const unit = read('frankendom-v3-telemetry.service'), conf = read('frankendom-v3-telemetry.conf');
  assert.match(unit, /^ExecStart=\/usr\/bin\/node server\/telemetry\/main\.ts$/m);
  assert.match(unit, /^User=frankendom-v3-telemetry$/m); assert.match(unit, /^MemoryMax=\d+M$/m); assert.match(unit, /^NoNewPrivileges=yes$/m);
  assert.ok(unit.includes(`ReadWritePaths=${S.logDir}`), 'the unit may write the log folder and nothing else');
  assert.ok(!/TELEMETRY_HOST|PASSWORD|SECRET|TOKEN/i.test(unit));
  assert.ok(conf.includes(`location = ${TELEMETRY.path} {`)); assert.ok(conf.includes(`proxy_pass http://${S.host}:${S.port};`));
  assert.match(conf, /limit_req zone=v3_telemetry_req/); assert.match(conf, /client_max_body_size \d+k/);
  assert.ok(!/X-Real-IP|proxy_set_header X-Forwarded/i.test(conf.replace(/^\s*#.*$/gm, '')), 'the address is not passed on: the collector never sees it');
});
