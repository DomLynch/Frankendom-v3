// Two-client smoke for other players drawn (live zone phase 2): two headless Chromium pages in one browser, both on ?presence=<ws url>; page B walks, page A holds still and takes a 375-wide still
// that shows B's hero; the printed numbers are the proof (B's own pose, what A's presence handle shows, what A's draw pool holds and where its figure stands in the scene).
//   node scripts/presence-two-pages.mjs <game url> <presence ws url> <out dir>
//   (playwright: not a dependency of this repo; PLAYWRIGHT_MODULE=/abs/path/to/playwright/index.mjs when it is not resolvable from here)
// Start first: `npm run build && node scripts/serve.mjs 8733` and `npm run presence` (docs/PRESENCE.md).
import { mkdirSync } from 'node:fs';
import { launchBrowser, phoneOptions, waitPlayable } from './lib/browser.mjs';

const [base, ws, out] = process.argv.slice(2);
if (!base || !ws || !out) { console.error('usage: node scripts/presence-two-pages.mjs <game url> <presence ws url> <out dir>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await launchBrowser({ angle: 'swiftshader', chromeEnv: null });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const open = async (tag) => {
  const ctx = await browser.newContext(phoneOptions(2));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(`${tag}: pageerror ${e.message}`));
  const requests = []; page.on('request', (r) => requests.push(r.url()));
  await page.goto(`${base}/?presence=${encodeURIComponent(ws).replace(/%3A/g, ':').replace(/%2F/g, '/')}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPlayable(page, { timeout: 180000 });
  return { page, requests };
};
const A = await open('A'), B = await open('B');
await A.page.waitForFunction(() => window.__v3Presence?.state() === 'live', null, { timeout: 30000 });
await B.page.waitForFunction(() => window.__v3Presence?.state() === 'live', null, { timeout: 30000 });
await pause(1500);
const readA = () => A.page.evaluate(() => ({ remotes: window.__v3Presence.remotes().map((r) => ({ id: r.id, x: +r.x.toFixed(2), z: +r.z.toFixed(2), speed: +r.speed.toFixed(2) })), drawn: window.__v3Presence.drawn(), self: window.__v3Presence.self() }));
const readB = () => B.page.evaluate(() => ({ pose: (() => { const p = globalThis.__v3HeroPose(); return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), heading: +p.heading.toFixed(2), anim: p.anim }; })(), self: window.__v3Presence.self() }));
console.log('before walk  B', JSON.stringify(await readB()));
console.log('before walk  A', JSON.stringify(await readA()));
await A.page.keyboard.down('KeyA'); await pause(1500); await A.page.keyboard.up('KeyA');   // A steps aside so B's hero is not drawn on top of A's own (both join at the same spot)
await B.page.keyboard.down('KeyD');   // B's hero strafes right (the auto-started fight's own movement; W would walk into the opponent and stop)
const anims = [];
for (let i = 0; i < 4; i++) { await pause(300); anims.push((await readB()).pose.anim); }   // the anim byte B sends (1 stands, 2 walks, 3 runs): a software-GL page moves in bursts, so it flickers
console.log('B anim bytes while walking', JSON.stringify(anims));
await A.page.screenshot({ path: `${out}/page-a-sees-b-walking.png` });
console.log('B walking    B', JSON.stringify(await readB()));
console.log('B walking    A', JSON.stringify(await readA()));
await pause(600);
console.log('B walking+.6 A', JSON.stringify(await readA()));
await B.page.keyboard.up('KeyD');
await pause(1500);
console.log('B stopped    B', JSON.stringify(await readB()));
console.log('B stopped    A', JSON.stringify(await readA()));
await A.page.screenshot({ path: `${out}/page-a-sees-b-stopped.png` });
// B leaves: A's figure goes (remoteExpire 1500 ms, then the slot is freed)
await B.page.close();
await pause(4000);
console.log('B left       A', JSON.stringify(await readA()));
console.log('fetched by A: presence chunk', A.requests.filter((u) => /vendor\/presence\./.test(u)).length, '; total requests', A.requests.length);
const health = await fetch(`${ws.replace(/^ws/, 'http').replace(/\/presence.*$/, '')}/presence/health`).then((r) => r.text()).catch(() => '(no health)');
console.log('server health', health.slice(0, 400));
await browser.close();
