// Trash mobs on the BUILT dist at 375 (data/mobs.json). One Chromium run: frame time idle vs a live swarm (relative numbers only: headless software GL), a real STRIKE kill through the keyboard
// (the page's own input layer), and 375 stills of a pack. On a build without the feature (no window.__v3Mobs) only the idle frame time is taken, which is the "before" number.
//   node scripts/mobs-run.mjs <base url> <out dir> <tag>
import { mkdirSync } from 'node:fs';
import { collectErrors, launchBrowser, phoneOptions } from './lib/browser.mjs';

const [base, out, tag] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/mobs-run.mjs <base url> <out dir> <tag>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await launchBrowser();
const page = await browser.newPage(phoneOptions(Number(process.env.DSF ?? 1)));
collectErrors(page, { echo: true });
let bytes = 0;   // bytes on the wire (CDP encodedDataLength: after compression)
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.enable');
cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
const THROTTLE = Number(process.env.THROTTLE ?? 4);   // CPU slowdown: a phone-ish main thread, so the frame cost shows instead of the display's 60 Hz
if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
await page.goto(`${base}/__reset`).catch(() => {});
await page.goto(`${base}/?opener=off`);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 240000 });
await page.waitForTimeout(2000);
console.log(`${tag} wire bytes at ready: ${bytes}`);

const frames = (ms) => page.evaluate((ms) => new Promise((res) => {
  const dts = []; let last = performance.now(), end = last + ms;
  const f = (t) => { dts.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else { dts.shift(); dts.sort((a, b) => a - b); const n = dts.length; res({ frames: n, meanMs: +(dts.reduce((a, b) => a + b, 0) / n).toFixed(2), p50Ms: +dts[Math.floor(n / 2)].toFixed(2), p95Ms: +dts[Math.floor(n * 0.95)].toFixed(2), maxMs: +dts[n - 1].toFixed(2) }); } };
  requestAnimationFrame(f);
}), ms);
const hero = () => page.evaluate(() => { const f = globalThis.__v3Roam ?? globalThis.__v3Fight.fighter; return { x: f.x, z: f.z, heading: f.heading }; });

const hasMobs = await page.evaluate(() => !!globalThis.__v3Mobs);
console.log(`${tag} idle`, JSON.stringify(await frames(8000)), `mobs feature: ${hasMobs}`);
if (!hasMobs) { await browser.close(); process.exit(0); }

// a swarm: 12 goblins (the cap) in the open, walking in on the hero; frame time while they fight him
// the start stands inside the three boss circles (no pack is made there, by design): walk west along z = 2.6 until clear of them, then make a 20-strong pack 26 m ahead
await page.keyboard.down('KeyA');
for (let i = 0; i < 60; i++) { await page.waitForTimeout(500); if (Math.abs((await hero()).x) >= 40) break; }
await page.keyboard.up('KeyA');
const h = await hero(), side = h.x < 0 ? -1 : 1;
await page.evaluate(({ x, z, side }) => { globalThis.__v3Mobs.core.spawnPackAt(x + side * 26, z, 'goblin', 20); }, { ...h, side });
await page.waitForTimeout(1500);
await page.keyboard.down('KeyA');   // walk in: the goblins see him at 9 m
for (let i = 0; i < 60; i++) {   // until the nearest goblin is within 4 m
  await page.waitForTimeout(250);
  const d = await page.evaluate(() => { const m = globalThis.__v3Mobs.core, v = m.view, f = globalThis.__v3Roam ?? globalThis.__v3Fight.fighter; let d = 1e9; for (let k = 0; k < v.n; k++) d = Math.min(d, Math.hypot(v.x[k] - f.x, v.z[k] - f.z)); return d; });
  if (d < 4) break;
}
await page.keyboard.up('KeyA');
await page.waitForTimeout(1500);
console.log(`${tag} swarm state`, JSON.stringify(await page.evaluate(() => { const m = globalThis.__v3Mobs.core; return { count: m.count, alive: m.alive, cap: m.cap, drawn: null }; })));
await page.screenshot({ path: `${out}/${tag}-1-swarm.jpg`, type: 'jpeg', quality: 82 });
console.log(`${tag} swarm`, JSON.stringify(await frames(8000)));
await page.screenshot({ path: `${out}/${tag}-2-swarm.jpg`, type: 'jpeg', quality: 82 });
console.log(`${tag} wire bytes after the first pack: ${bytes}`);

// a real STRIKE: the keyboard's strike key (the page's input layer), the hero turned to the nearest goblin by the stick key held toward it is not needed: the goblins walk in and surround him; he strikes and turns
const kills0 = await page.evaluate(() => { globalThis.__kills = 0; globalThis.__v3Mobs.core.onMobKilled(() => { globalThis.__kills++; }); return 0; });
void kills0;
const coins0 = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => /v3|save|prog/i.test(k)) ?? '') ?? '{}').coins ?? null);
for (let i = 0; i < 40; i++) {
  await page.evaluate(() => {
    const m = globalThis.__v3Mobs.core, v = m.view, f = globalThis.__v3Roam ?? globalThis.__v3Fight.fighter;
    let best = -1, d = 1e9;
    for (let k = 0; k < v.n; k++) { if (v.state[k] >= m.rows.states.dying) continue; const dd = Math.hypot(v.x[k] - f.x, v.z[k] - f.z); if (dd < d) { d = dd; best = k; } }
    globalThis.__want = best < 0 ? null : { dx: v.x[best] - f.x, dz: v.z[best] - f.z, d };
  });
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(450);
}
const after = await page.evaluate(() => { const m = globalThis.__v3Mobs.core; return { kills: globalThis.__kills, count: m.count, alive: m.alive, heroHp: globalThis.__v3Fight.playerHealth }; });
const coins1 = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => /v3|save|prog/i.test(k)) ?? '') ?? '{}').coins ?? null);
console.log(`${tag} strike`, JSON.stringify(after), `coins ${coins0} -> ${coins1}`);
await page.screenshot({ path: `${out}/${tag}-3-after-strikes.jpg`, type: 'jpeg', quality: 82 });
console.log(`${tag} swarm after`, JSON.stringify(await frames(4000)));
await browser.close();
