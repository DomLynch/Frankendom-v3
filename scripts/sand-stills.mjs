// The zone's far sand (Dom 2026-10-27: "glassy, fake reflection, wavy bands"): one still of the hero standing, looking at the horizon, per build and query, at 375x812 and 812x375.
// Serves a built dist/ itself (any copy: origin/main, the commit before #127, this branch), pins the hero, waits, shoots.
//   node scripts/sand-stills.mjs <dist dir> <out dir> <tag> [query] [probe.js]      env: W=375 H=812 DSF=1 WAIT_MS=9000 PLACE_MS=6000 PORT=8811
// A probe file (optional) is JS run in the page once the hero is placed (the temporary window.__dbg = { renderer, scene } hook); its JSON result is printed.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, mkdirSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const [distArg, out, tag, query = '', probeFile] = process.argv.slice(2);
if (!distArg || !out || !tag) { console.error('usage: node scripts/sand-stills.mjs <dist dir> <out dir> <tag> [query] [probe.js]'); process.exit(2); }
const dist = resolve(distArg), port = Number(process.env.PORT ?? 8811);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(dist, path.endsWith('/') ? path + 'index.html' : path);
  let body = await readFile(file).catch(() => null);
  if (!body && !extname(path)) { file = join(dist, 'index.html'); body = await readFile(file); }
  if (!body) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  res.end(body);
}).listen(port);
mkdirSync(out, { recursive: true });
const W = Number(process.env.W ?? 375), H = Number(process.env.H ?? 812);
const browser = await chromium.launch({ args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: Number(process.env.DSF ?? 1), isMobile: W < 700, hasTouch: W < 700 });
page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
await page.goto(`http://localhost:${port}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 240000 });
await page.waitForTimeout(Number(process.env.WAIT_MS ?? 9000));
await page.evaluate(() => { globalThis.__pin = { x: 0, z: 0 }; setInterval(() => { const f = globalThis.__v3Fight, p = globalThis.__pin; if (f?.fighter) { f.fighter.x = p.x; f.fighter.z = p.z; } if (f?.enemy) { f.enemy.x = p.x; f.enemy.z = p.z - 3.25; } }, 4); });
await page.waitForTimeout(Number(process.env.PLACE_MS ?? 6000));
if (probeFile) {
  const code = readFileSync(probeFile, 'utf8');
  const steps = await page.evaluate(code);   // the probe may return { steps: [{ name, js }] } to toggle and shoot one by one
  if (steps?.info) console.log(JSON.stringify(steps.info));
  if (steps?.steps) {
    for (const st of steps.steps) {
      await page.evaluate(st.js); await page.waitForTimeout(700);
      await page.screenshot({ path: `${out}/${tag}-${st.name}.jpg`, type: 'jpeg', quality: 92 });
    }
  } else console.log(JSON.stringify(steps, null, 1));
}
await page.screenshot({ path: `${out}/${tag}.jpg`, type: 'jpeg', quality: 92 });
console.log('shot', `${out}/${tag}.jpg`);
await browser.close(); server.close();
