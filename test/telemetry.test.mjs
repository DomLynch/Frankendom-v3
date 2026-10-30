// Telemetry, page side (src/telemetry.ts, src/telemetry-rows.ts, data/telemetry.json): the event table is a validated row file, the payload has one shape, every off switch sends nothing, and a failing network never throws or blocks the game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TELEMETRY, loadTelemetry, cleanEvent, cleanEnvelope } from '../src/telemetry-rows.ts';
import { createTelemetry, offReason, startTelemetry } from '../src/telemetry.ts';
import { captureException, setErrorSink } from '../src/stubs.ts';

const SHA = 'cfb2909e0f1a2b3c';
const mk = (over = {}) => {
  const sent = [], store = new Map(); let t = 1_000_000, n = 0;
  const env = {
    search: '', hostname: 'v3.frankendom.com', doNotTrack: false, sha: SHA,
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); } },
    send: (url, body, final) => sent.push({ url, body: JSON.parse(body), final }),
    now: () => t, randomId: () => `rand-${++n}-abcdef`, ...over,
  };
  return { env, sent, store, tick: (ms) => { t += ms; }, tel: createTelemetry(env) };
};
const raw = () => JSON.parse(readFileSync(new URL('../data/telemetry.json', import.meta.url), 'utf8'));

test('the row file loads, names the five events and the same-origin path, and a bad row is refused', () => {
  assert.deepEqual(Object.keys(TELEMETRY.events), ['session_start', 'session_end', 'boss_death', 'boss_kill', 'clip_shared', 'js_error']);
  assert.equal(TELEMETRY.path, '/t');
  assert.equal(TELEMETRY.server.host, '127.0.0.1');
  assert.ok(TELEMETRY.server.maxFileBytes * TELEMETRY.server.keepFiles <= 50 * 1024 * 1024, 'the log ceiling is 50 MB at most');
  const bad = (f) => { const r = raw(); f(r); assert.throws(() => loadTelemetry(r)); };
  bad((r) => { r.path = 't'; });
  bad((r) => { r.client.flushMs = 0; });
  bad((r) => { r.caps.maxStack = -1; });
  bad((r) => { r.server.port = 70000; });
  bad((r) => { r.events.boss_death.fields.boss = 'nonsense'; });
  bad((r) => { r.events.Bad = { about: 'x', fields: {} }; });
  bad((r) => { r.kinds = []; });
});

test('cleanEvent keeps only the table fields, clamps and trims them, and refuses unknown or incomplete events', () => {
  assert.deepEqual(cleanEvent({ e: 'boss_death', boss: 'gargantua', sec: 41.234, heroHp: 0, bossHp: 62.4, extra: 'drop me', name: 'player' }), { e: 'boss_death', boss: 'gargantua', sec: 41.2, heroHp: 0, bossHp: 62 });
  assert.equal(cleanEvent({ e: 'boss_death', boss: 'gargantua' }), null, 'missing numbers');
  assert.equal(cleanEvent({ e: 'boss_death', boss: 'has space', sec: 1, heroHp: 1, bossHp: 1 }), null, 'a boss id is a plain token, never free text');
  assert.equal(cleanEvent({ e: 'nope' }), null);
  assert.equal(cleanEvent({ e: 'constructor' }), null);
  assert.equal(cleanEvent({ e: 'boss_kill', boss: 'arachne', sec: 1e9, heroHp: 500, bossHp: -3 }).sec, TELEMETRY.caps.maxSeconds);
  const err = cleanEvent({ e: 'js_error', kind: 'error', msg: 'x'.repeat(5000), src: 's'.repeat(500), line: 12.7, col: 3, stack: 'a\nb\u0000c'.repeat(500) });
  assert.equal(err.msg.length, TELEMETRY.caps.maxMessage);
  assert.equal(err.src.length, TELEMETRY.caps.maxSource);
  assert.ok(err.stack.length <= TELEMETRY.caps.maxStack && !err.stack.includes('\u0000') && err.stack.includes('\n'));
  assert.equal(cleanEvent({ e: 'js_error', kind: 'weird' }), null);
});

test('the payload shape: { v, id, sid, sha, events } with a random id kept in storage and nothing else', () => {
  const { tel, sent, store, tick } = mk();
  tel.event('boss_death', { boss: 'minotaur', sec: 30, heroHp: 0, bossHp: 55 });
  tick(1000); tel.flush();
  assert.equal(sent.length, 1);
  const { url, body, final } = sent[0];
  assert.equal(url, '/t'); assert.equal(final, false);
  assert.deepEqual(Object.keys(body).sort(), ['events', 'id', 'sha', 'sid', 'v']);
  assert.equal(body.v, 1); assert.equal(body.sha, SHA);
  assert.notEqual(body.id, body.sid);
  assert.equal(store.get(TELEMETRY.client.storageKey), body.id);
  assert.deepEqual(body.events.map((e) => e.e), ['session_start', 'boss_death']);
  assert.ok(cleanEnvelope(body), 'the collector accepts what the page sends');
  assert.ok(!/ip|email|name|user/i.test(Object.keys(body.events[1]).join(',')), 'no personal fields');
  const again = mk({ storage: { getItem: () => body.id, setItem() {} } });
  again.tel.flush(); assert.equal(again.sent[0].body.id, body.id, 'the same browser keeps its id');
});

test('session length: leaving sends session_end with the seconds, as a final (sendBeacon) send; a second leave within a second is not doubled', () => {
  const { tel, sent, tick } = mk();
  tick(95_400); tel.leave(); tel.leave();
  assert.equal(sent.length, 1); assert.equal(sent[0].final, true);
  const end = sent[0].body.events.find((e) => e.e === 'session_end');
  assert.equal(end.sec, 95.4);
  assert.equal(sent[0].body.events.filter((e) => e.e === 'session_end').length, 1);
});

test('errors: message, source, line, trimmed stack; the query string is stripped; the same error is sent once; the per-visit cap holds', () => {
  const { tel, sent } = mk();
  const e = new Error('boom'); e.stack = `Error: boom\n    at f (https://v3.frankendom.com/b/${SHA}/src/client/main.js?presence=wss://x:1:2)`;
  tel.error('error', e, { src: 'https://v3.frankendom.com/b/x/main.js?secret=1#h', line: 10, col: 5 });
  tel.error('error', e, { line: 10 });
  tel.flush();
  const js = sent[0].body.events.filter((x) => x.e === 'js_error');
  assert.equal(js.length, 1);
  assert.equal(js[0].msg, 'boom'); assert.equal(js[0].line, 10); assert.equal(js[0].kind, 'error');
  assert.ok(!js[0].src.includes('secret') && !js[0].stack.includes('presence'), 'queries never leave the page');
  tel.error('error', 'failed https://v3.frankendom.com/x.js?presence=wss://secret#frag now', {});
  tel.flush();
  const withQ = sent.flatMap((s) => s.body.events).find((x) => x.e === 'js_error' && x.msg.startsWith('failed'));
  assert.ok(withQ && !withQ.msg.includes('secret') && !withQ.msg.includes('?') && !withQ.msg.includes('#'), 'the message is query-stripped too');
  for (let i = 0; i < 50; i++) tel.error('rejection', `distinct ${i}`);
  tel.flush();
  const total = sent.flatMap((s) => s.body.events).filter((x) => x.e === 'js_error').length;
  assert.equal(total, TELEMETRY.client.maxErrorsPerVisit);
});

test('rate limits: queue, per-minute and per-event caps bound what a page can send', () => {
  const { tel, sent } = mk();
  for (let i = 0; i < 500; i++) tel.event('boss_kill', { boss: 'gargantua', sec: i, heroHp: 50, bossHp: 0 });
  tel.flush();
  const events = sent.flatMap((s) => s.body.events);
  assert.ok(events.length <= TELEMETRY.client.maxEventsPerMinute, `${events.length} events`);
  assert.ok(sent.every((s) => s.body.events.length <= TELEMETRY.client.maxBatch));
});

test('every off switch sends nothing: ?telemetry=off, Do-Not-Track, localhost and its kin, and a dev build', () => {
  const base = { search: '', hostname: 'v3.frankendom.com', doNotTrack: false, sha: SHA };
  assert.equal(offReason(base), null);
  assert.match(offReason({ ...base, search: '?x=1&telemetry=off' }), /telemetry=off/);
  assert.equal(offReason({ ...base, search: '?telemetry=on' }), null, 'only "off" switches it off');
  assert.equal(offReason({ ...base, doNotTrack: true }), 'do-not-track');
  for (const h of ['localhost', '127.0.0.1', '[::1]', 'a.localhost', 'x.test', '']) assert.equal(offReason({ ...base, hostname: h }), 'local host', h);
  for (const sha of [null, 'dev', 'zzzzzzz']) assert.equal(offReason({ ...base, sha }), 'not a deployed build', String(sha));
  for (const over of [{ search: '?telemetry=off' }, { doNotTrack: true }, { hostname: 'localhost' }, { sha: null }]) {
    const { tel, sent, store } = mk(over);
    tel.event('boss_death', { boss: 'a', sec: 1, heroHp: 0, bossHp: 1 }); tel.error('error', 'x'); tel.leave(); tel.flush(true);
    assert.equal(tel.on, false); assert.equal(sent.length, 0, JSON.stringify(over)); assert.equal(store.size, 0, 'nothing even written to storage');
  }
});

test('a failing network, a throwing send and refused storage never throw or block', () => {
  const boom = () => { throw new Error('offline'); };
  const { tel } = mk({ send: boom, storage: { getItem: boom, setItem: boom } });
  assert.equal(tel.on, true);
  assert.doesNotThrow(() => { tel.event('boss_death', { boss: 'a', sec: 1, heroHp: 0, bossHp: 1 }); tel.error('caught', new Error('x')); tel.error('caught', null); tel.error('caught', undefined); tel.flush(); tel.leave(); });
  assert.doesNotThrow(() => { tel.event('nope', 1); tel.event(undefined); tel.event('boss_death', null); });
  const noStorage = mk({ storage: null });
  noStorage.tel.flush(); assert.equal(noStorage.sent.length, 1, 'storage unavailable: the visit sends under its own id');
  assert.doesNotThrow(() => { for (let i = 0; i < 2000; i++) tel.event('boss_death', { boss: 'a', sec: 1, heroHp: 0, bossHp: 1 }); }, 'a flood of events never throws (its cost: test/perf/telemetry-cost.perf.mjs)');
});

test('startTelemetry wires the page: DNT and localhost stay silent; on a deployed host it installs the listeners and sends over beacon, then falls back to fetch keepalive that cannot reject', async () => {
  const listeners = {}, docListeners = {}, beacons = [], fetches = []; let timer = null;
  const g = (over = {}) => ({
    location: { search: '', hostname: 'v3.frankendom.com' }, navigator: { doNotTrack: null, sendBeacon: (u, b) => { beacons.push([u, b]); return true; } },
    localStorage: { getItem: () => null, setItem() {} }, crypto: { randomUUID: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
    fetch: (u, o) => { fetches.push([u, o]); return Promise.reject(new Error('offline')); },
    addEventListener: (k, f) => { listeners[k] = f; }, document: { visibilityState: 'visible', addEventListener: (k, f) => { docListeners[k] = f; } }, setInterval: (f, ms) => { timer = [f, ms]; return 1; }, ...over,
  });
  const url = `https://v3.frankendom.com/b/${SHA}/src/client/main.js`;
  assert.equal(startTelemetry(g({ navigator: { doNotTrack: '1' } }), url).on, false);
  assert.equal(startTelemetry(g({ location: { search: '', hostname: 'localhost' } }), url).on, false);
  assert.equal(startTelemetry(g(), 'http://localhost/b/dev/src/client/main.js').on, false);
  const page = g(); const t = startTelemetry(page, url);
  assert.equal(t.on, true); assert.equal(timer[1], TELEMETRY.client.flushMs);
  listeners.error({ message: 'oops', filename: 'x.js', lineno: 3, colno: 4, error: new Error('oops') });
  listeners.unhandledrejection({ reason: new Error('nope') });
  page.document.visibilityState = 'hidden'; docListeners.visibilitychange();
  assert.equal(beacons.length, 1);
  const sent = JSON.parse(beacons[0][1]).events.map((e) => e.e);
  assert.deepEqual(sent, ['session_start', 'js_error', 'js_error', 'session_end']);
  timer[0](); t.event('boss_kill', { boss: 'a', sec: 1, heroHp: 1, bossHp: 0 }); timer[0]();
  assert.equal(fetches.length, 1); assert.equal(fetches[0][1].keepalive, true);
  await new Promise((r) => setTimeout(r, 5));   // the rejected fetch is already caught: no unhandled rejection fails this run
});

test('the existing captureException seam feeds the sink and a throwing sink never breaks it', () => {
  const seen = []; const log = console.error; console.error = () => {};
  try {
    setErrorSink((e) => seen.push(e)); captureException(new Error('a'));
    setErrorSink(() => { throw new Error('sink'); }); assert.doesNotThrow(() => captureException(new Error('b')));
    setErrorSink(null); assert.doesNotThrow(() => captureException(new Error('c')));
  } finally { console.error = log; setErrorSink(null); }
  assert.equal(seen.length, 1);
});
