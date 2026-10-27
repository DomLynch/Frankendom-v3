// Evidence for V3 #171 (head fbb916d+): natural kills on the default foe, light or heavy blows, fresh page per kill, the hero's start offset/heading varied by seed (5 seeds).
//   node scripts/gore-kills2.mjs <base url> <N> <light|heavy> <query|-> <out dir>   prints one JSON line per kill (__v3Picked, cuts, ragdoll); saves the first still of each resolved kind
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [base, n = '25', blow = 'light', q = '-', out = 'evidence/kills2'] = process.argv.slice(2), query = q === '-' ? '' : q;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const TICK = 1000 / 60, saved = new Set();
const rng = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
for (let i = 0; i < Number(n); i++) {
  const seed = i % 5, r = rng(1000 + seed * 7919 + Math.floor(i / 5) * 31), errors = [];
  const dx = (r() - 0.5) * 3, dz = (r() - 0.5) * 2, dh = (r() - 0.5) * 2.4, every = 35 + Math.floor(r() * 50), lead = 20 + Math.floor(r() * 80), side = r() < 0.5 ? 'KeyA' : 'KeyD';
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text().slice(0, 120)); });
  await page.clock.install();
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 120000 });
  await page.waitForTimeout(3000);
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 100);
  const run = (t) => page.clock.runFor(Math.round(t * TICK));
  const read = () => page.evaluate(() => { const p = globalThis.__v3Fight, [h] = p.duel.fighters; return { hero: h.phase, victim: p.finish?.victim ?? -1 }; });
  for (let k = 0; k < 240 && /sheathed|draw/.test((await read()).hero); k++) await run(1);
  await run(lead);
  const moved = await page.evaluate(([dx, dz, dh]) => { try { const [h] = globalThis.__v3Fight.duel.fighters; h.body = { ...h.body, x: h.body.x + dx, z: h.body.z + dz, heading: h.body.heading + dh }; return 'ok'; } catch (e) { return String(e); } }, [dx, dz, dh]);
  const key = blow === 'heavy' ? 'KeyG' : 'KeyF', t0 = Date.now();
  await page.keyboard.down('KeyW');
  let killedAt = -1;
  for (let t = 0; t < 4000 && Date.now() - t0 < 90000; t++) {
    if (t % every === 0 && killedAt < 0) { await page.keyboard.down(side); await page.keyboard.down(key); await run(blow === 'heavy' ? 3 : 0); await page.keyboard.up(key); await page.keyboard.up(side); }
    await run(1);
    if (killedAt < 0) await page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.min(f.health, 1); });
    if (killedAt < 0 && (await read()).victim === 1) { killedAt = t; await page.keyboard.up('KeyW'); }
    if (killedAt >= 0 && t - killedAt >= 90) break;   // kill + 1.5 s
  }
  const info = await page.evaluate(() => ({ picked: globalThis.__v3Picked ?? null, cuts: (globalThis.__v3Cuts ?? []).map((c) => c.unit), ragdoll: globalThis.__ragdoll?.state }));
  const row = { i: i + 1, seed, blow, query: query || 'default', moved, killed: killedAt >= 0, ...info, errors: errors.length };
  const kind = info.picked?.played ?? 'none';
  if (killedAt >= 0 && !saved.has(kind) && !query) {
    saved.add(kind);
    await page.screenshot({ path: `${out}/${blow}-${kind}-full.png` });
    await page.screenshot({ path: `${out}/${blow}-${kind}-crop.png`, clip: { x: 90, y: 150, width: 195, height: 260 } });
    row.saved = kind;
  }
  console.log(JSON.stringify(row));
  await page.close();
}
await browser.close();
