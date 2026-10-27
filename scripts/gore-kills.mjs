// Evidence for V3 #171: N short fights against the Minotaur (default foe), each a fresh page on the paused fake clock (as scripts/finisher-cuts-stills.mjs); no forced finisher.
// Per kill: the sim's finish (move, location), the ragdoll's cuts (__v3Cuts), the cut meshes shown, console/page errors. Varied per kill: strafe side, swing cadence, walk-in delay.
//   node scripts/gore-kills.mjs <base url> <N> [query]     query "" = after (default), "gore=v1" = before
import { chromium } from 'playwright';
const [base, n = '10', query = ''] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const TICK = 1000 / 60, rows = [];
for (let i = 0; i < Number(n); i++) {
  const errors = [], warns = [];
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console ${m.text()}`); if (m.type() === 'warning' && /rank look|finisher/i.test(m.text())) warns.push(m.text().slice(0, 160)); });
  await page.clock.install();
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 300000 });
  await page.waitForTimeout(3000);
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 100);
  const run = (t) => page.clock.runFor(Math.round(t * TICK));
  const read = () => page.evaluate(() => { const p = globalThis.__v3Fight, [h] = p.duel.fighters; return { hero: h.phase, victim: p.finish?.victim ?? -1, move: p.finish?.move, location: p.finish?.location, heading: p.finish?.heading }; });
  for (let k = 0; k < 240 && /sheathed|draw/.test((await read()).hero); k++) await run(1);
  await run(30 + i * 11);
  const side = i % 2 ? 'KeyA' : 'KeyD', every = 40 + i * 9;
  await page.keyboard.down('KeyW');
  let killedAt = -1, s = null;
  for (let t = 0; t < 3000; t++) {
    if (t % every === 0 && killedAt < 0) { await page.keyboard.down(side); await page.keyboard.down('KeyF'); await page.keyboard.up('KeyF'); await page.keyboard.up(side); }
    await run(1); s = await read();
    if (killedAt < 0) await page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.min(f.health, 1); });
    if (killedAt < 0 && s.victim === 1) { killedAt = t; await page.keyboard.up('KeyW'); }
    if (killedAt >= 0 && t - killedAt >= 90) break;   // 1.5 s after the kill: cuts have been made and the pieces shown
  }
  const info = await page.evaluate(() => { const shown = []; globalThis.__v3Scene?.traverse((m) => { if (m.visible && /^(cap_|piece_)/.test(m.name)) shown.push(m.name); }); return { cuts: globalThis.__v3Cuts ?? [], ragdoll: globalThis.__ragdoll?.state, shown }; });
  rows.push({ kill: i + 1, query: query || 'default', killed: killedAt >= 0, ...s, ...info, errors: errors.length, warns });
  console.log(JSON.stringify(rows.at(-1)));
  await page.close();
}
await browser.close();
