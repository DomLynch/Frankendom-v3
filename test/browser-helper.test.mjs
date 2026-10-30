// The shared Playwright helper the stills / check scripts use (scripts/lib/browser.mjs, audit 12): the static dist server, error collection, the phone options and the GL flags. No browser is launched here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectErrors, glArgs, phoneOptions, serveDist } from '../scripts/lib/browser.mjs';

test('serveDist serves a dist dir: files, the index.html fallback, 404s, gzip twins; close frees the port', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'v3-dist-'));
  mkdirSync(join(dir, 'b'));
  writeFileSync(join(dir, 'index.html'), '<h1>hi</h1>');
  writeFileSync(join(dir, 'b', 'x.json'), '{"a":1}');
  writeFileSync(join(dir, 'b', 'y.json'), '{"gz":false}');
  writeFileSync(join(dir, 'b', 'y.json.gz'), gzipSync('{"gz":true}'));
  const srv = await serveDist(dir);
  try {
    assert.match(srv.url, /^http:\/\/127\.0\.0\.1:\d+$/);
    const root = await fetch(`${srv.url}/`);
    assert.equal(root.status, 200); assert.equal(root.headers.get('content-type'), 'text/html'); assert.equal(await root.text(), '<h1>hi</h1>');
    const json = await fetch(`${srv.url}/b/x.json`);
    assert.equal(json.headers.get('content-type'), 'application/json'); assert.deepEqual(await json.json(), { a: 1 });
    assert.equal(await (await fetch(`${srv.url}/some/route`)).text(), '<h1>hi</h1>', 'a path with no extension falls back to index.html');
    assert.equal((await fetch(`${srv.url}/missing.png`)).status, 404);
    const gz = await fetch(`${srv.url}/b/y.json`, { headers: { 'accept-encoding': 'gzip' } });
    assert.equal(gz.headers.get('content-encoding'), 'gzip'); assert.deepEqual(await gz.json(), { gz: true });
  } finally { await srv.close(); rmSync(dir, { recursive: true, force: true }); }
  await assert.rejects(fetch(`${srv.url}/`), 'the server is closed');
});

test('serveDist refuses a directory with no index.html', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'v3-nodist-'));
  try { await assert.rejects(serveDist(dir), /not a built dist/); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('collectErrors collects page errors and console.error lines, and only those', () => {
  const handlers = {};
  const page = { on: (ev, fn) => { handlers[ev] = fn; } };
  const errors = collectErrors(page);
  handlers.pageerror(new Error('boom'));
  handlers.console({ type: () => 'log', text: () => 'fine' });
  handlers.console({ type: () => 'error', text: () => 'bad thing' });
  assert.deepEqual(errors, ['pageerror boom', 'console bad thing']);
});

test('phoneOptions is the 375x812 touch phone; no scale factor means Playwright default', () => {
  assert.deepEqual(phoneOptions(2), { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  assert.equal('deviceScaleFactor' in phoneOptions(), false);
  assert.deepEqual(phoneOptions(1, { acceptDownloads: true }).acceptDownloads, true);
});

test('glArgs: ANGLE with the chosen backend, the blocklist ignored, extras appended', () => {
  assert.deepEqual(glArgs({ angle: 'swiftshader', extra: ['--mute-audio'] }), ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--mute-audio']);
  assert.equal(glArgs({ angle: 'metal' })[1], '--use-angle=metal');
  assert.equal(glArgs()[1], process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader');
});
