// The presence proof, in browsers (docs/PRESENCE-PROOF.md): two headless phones (375 wide) open the built game on ONE origin with the existing flags ?presence=1&sharedhp=1, land in the same presence shard,
// each draws the other's body (the hero's own Psyche), and both fight one shared boss through the real shared-hp client until it dies; the proof writer records the kill credit by damage share.
//   node scripts/presence-proof.mjs <out dir>          (needs dist/: npm run build; playwright via PLAYWRIGHT_MODULE=/abs/path/to/playwright/index.mjs if not resolvable)
// Everything binds 127.0.0.1 on ephemeral ports: a gateway (one origin: static dist/ from scripts/serve.mjs, /zone/* to the proof writer, the /presence WebSocket to presence), presence, the writer.
// The sim does not yet feed the shared-hp client (the "wiring PR", docs/ZONE-CLIENT-CONTRACT.md section 3), so the swings are fed to the client by the page script below; the page, the transport, the
// client, the cookies, the writer and the model are the real ones. Exit 0 = every claim held.
import { createServer, request } from 'node:http';
import { connect } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createPresence } from '../server/presence/server.ts';
import { createWriter, WRITER } from '../server/zone/writer.ts';

const out = process.argv[2];
if (!out) { console.error('usage: node scripts/presence-proof.mjs <out dir>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const listen = (server) => new Promise((r) => server.listen(0, '127.0.0.1', r));
const INSTANCE = 'z1:pit-pitborn-east';

const presence = createPresence({ log: () => {} }), writer = createWriter();
await listen(presence.server); await listen(writer.server);
const staticPort = 20000 + Math.floor(Math.random() * 20000);
const serve = spawn(process.execPath, [new URL('./serve.mjs', import.meta.url).pathname, String(staticPort)], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => serve.stdout.once('data', r));
const gateway = createServer((req, res) => {
  const to = req.url.startsWith(WRITER.path) ? writer.port() : staticPort;
  const up = request({ host: '127.0.0.1', port: to, method: req.method, path: req.url, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  up.on('error', () => { res.writeHead(502); res.end(); }); req.pipe(up);
});
gateway.on('upgrade', (req, socket, head) => {   // the presence WebSocket: a raw pipe to the presence service
  const up = connect(presence.port(), '127.0.0.1', () => { up.write(`${req.method} ${req.url} HTTP/1.1\r\n${Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n`); up.write(head); socket.pipe(up); up.pipe(socket); });
  up.on('error', () => socket.destroy()); socket.on('error', () => up.destroy());
});
await listen(gateway);
const base = `http://127.0.0.1:${gateway.address().port}`;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const failures = [], claim = (ok, what, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${extra ? '  ' + extra : ''}`); if (!ok) failures.push(what); };
const open = async (tag) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(`${tag}: pageerror ${e.message}`));
  await page.goto(`${base}/?presence=1&sharedhp=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 180000 });
  await page.waitForFunction(() => window.__v3Presence?.state() === 'live' && window.__v3SharedHp, null, { timeout: 30000 });
  return page;
};
try {
  const [A, B] = [await open('A'), await open('B')];
  const selfOf = (p) => p.evaluate(() => window.__v3Presence.self());
  const sa = await selfOf(A), sb = await selfOf(B);
  claim(sa && sb && sa.layer === sb.layer, 'both phones are in the same shard', `A ${JSON.stringify(sa)} B ${JSON.stringify(sb)}`);
  // each phone draws the other's body (the hero's own rig, no new art)
  await A.keyboard.down('KeyA'); await B.keyboard.down('KeyD'); await pause(1500); await A.keyboard.up('KeyA'); await B.keyboard.up('KeyD');   // each steps aside (the existing two-pages script does the same): both joined at one spot
  // A standing remote is dropped from `shown` after remoteExpire ms without a packet (presence sends none when nothing moves), so catch the moment the body is up: the first frame it is shown.
  const caught = (p) => p.evaluate(() => new Promise((res) => { const t0 = performance.now(); const tick = () => { const d = window.__v3Presence.drawn(); if (d.shown.length === 1) res(d); else if (performance.now() - t0 > 40000) res(d); else requestAnimationFrame(tick); }; tick(); }));
  const [drawnA, drawnB] = await Promise.all([caught(A), caught(B)]);
  claim(drawnA.shown.length === 1 && drawnB.shown.length === 1, 'each phone has the other\'s body on screen', `A draws ${JSON.stringify(drawnA)} B draws ${JSON.stringify(drawnB)}`);
  await A.screenshot({ path: `${out}/phone-a-sees-b.png` }); await B.screenshot({ path: `${out}/phone-b-sees-a.png` });
  // both fight the one shared boss through the page's real shared-hp client
  const fight = (p, tag) => p.evaluate(async ({ instance, tag }) => {
    const h = window.__v3SharedHp, layer = window.__v3Presence.self().layer;
    const c = h.create({ instance, layer: () => layer, weapon: () => 'gladius' });
    await c.start(performance.now());
    const t = setInterval(() => c.hit({ type: 'Hit', actor: 0, target: 1, damage: 30, weapon: 'gladius' }), 120);
    const t0 = performance.now();
    while (performance.now() - t0 < 30000 && !c.kill()) await new Promise((r) => setTimeout(r, 100));
    clearInterval(t);
    return { tag, phase: c.phase(), bar: c.bar(), kill: c.kill(), counters: c.counters() };
  }, { instance: INSTANCE, tag });
  const [ra, rb] = await Promise.all([fight(A, 'A'), fight(B, 'B')]);
  console.log('A', JSON.stringify(ra)); console.log('B', JSON.stringify(rb));
  claim(ra.phase === 'dead' && rb.phase === 'dead' && ra.bar.hp === 0 && rb.bar.hp === 0, 'both phones saw the one shared boss die');
  claim(ra.kill?.paid === true && rb.kill?.paid === true, 'both phones were told they were paid', `A ${ra.kill?.sharePct}% B ${rb.kill?.sharePct}%`);
  const credits = writer.credits();
  claim(credits.length === 2 && credits.every((c) => c.paid && c.instance === INSTANCE && c.layer === sa.layer), 'the writer recorded two paid kill credits for this shard', JSON.stringify(credits.map((c) => ({ dmg: +c.damage.toFixed(1), pct: c.sharePct }))));
  claim(Math.round(credits.reduce((n, c) => n + c.damage, 0)) === 137 && writer.stats().kills === 1, 'applied damage = the one bar (137) and exactly one kill');
  await A.screenshot({ path: `${out}/phone-a-after-kill.png` });
  writeFileSync(`${out}/receipt.json`, JSON.stringify({ shard: sa.layer, drawnA, drawnB, a: ra, b: rb, credits: credits.map(({ account, ...c }) => c), writer: writer.stats(), presence: presence.stats() }, null, 1));
} catch (e) { console.error(e); failures.push('crashed'); }
await browser.close(); serve.kill(); gateway.close(); await presence.close(); writer.server.close();
console.log(failures.length ? `FAILED: ${failures.join('; ')}` : 'ALL CLAIMS HELD');
process.exit(failures.length ? 1 : 0);
