// The zone's far sand (Dom 2026-10-27: "glassy, fake reflection, wavy bands"): one still of the hero standing, looking at the horizon, per build and query, at 375x812 and 812x375.
// Serves a built dist/ itself (any copy: origin/main, the commit before #127, this branch), pins the hero, waits, shoots.
//   node scripts/sand-stills.mjs <dist dir> <out dir> <tag> [query] [probe.js]      env: W=375 H=812 DSF=1 WAIT_MS=9000 PLACE_MS=6000 PORT=8811
// A probe file (optional) is JS run in the page once the hero is placed (the temporary window.__dbg = { renderer, scene } hook); its JSON result is printed.
import { readFileSync, mkdirSync } from 'node:fs';
import { launchBrowser, serveDist } from './lib/browser.mjs';

const [distArg, out, tag, query = '', probeFile] = process.argv.slice(2);
if (!distArg || !out || !tag) { console.error('usage: node scripts/sand-stills.mjs <dist dir> <out dir> <tag> [query] [probe.js]'); process.exit(2); }
const server = await serveDist(distArg, Number(process.env.PORT ?? 8811));
mkdirSync(out, { recursive: true });
const W = Number(process.env.W ?? 375), H = Number(process.env.H ?? 812);
const browser = await launchBrowser({ chromeEnv: null });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: Number(process.env.DSF ?? 1), isMobile: W < 700, hasTouch: W < 700 });
page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
await page.goto(`${server.url}/${query ? `?${query}` : ''}`);
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
await browser.close(); await server.close();
