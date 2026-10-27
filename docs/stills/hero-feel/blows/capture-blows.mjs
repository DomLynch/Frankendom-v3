// scratch variant of scripts/hero-feel-stills.mjs: keep the hero alive and shoot +4,+8,+14 after EACH distinct (zone, damage) blow, up to 4 blows. Same harness otherwise.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const [base, out, ...queries] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const TICK = 1000 / 60, SH = [4, 8, 14];
for (const query of queries) {
  const tag = query.includes('feel=hero') ? 'on' : 'off';
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.clock.install();
  await page.goto(`${base}/${query ? `?${query}` : ''}`, { timeout: 180000 });
  await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000, polling: 'raf' });
  for (let slack = 20; ; slack *= 4) { try { await page.clock.pauseAt(await page.evaluate(() => Date.now()) + slack); break; } catch (e) { if (slack > 2000) throw e; } }
  const run = (t) => page.clock.runFor(Math.round(t * TICK));
  await run(120);
  if (tag === 'on') await page.waitForFunction(() => globalThis.__ragdollHero?.state === 'alive', null, { timeout: 120000 });
  for (let i = 0; i < 240 && /sheathed|draw/.test(await page.evaluate(() => globalThis.__v3Fight.duel.fighters[0].phase)); i++) await run(1);
  await run(30);
  const seen = new Set(), pend = [], log = [];
  let lastHp = null;
  for (let n = 0; n < 6000 && (seen.size < 4 || pend.some((p) => n - p.at < 15)); n++) {
    await run(1);
    const s = await page.evaluate(() => { const f = globalThis.__v3Fight.duel.fighters[0]; return { hp: f.health, ev: (globalThis.__v3Fight.events ?? []).filter((e) => e.type === 'Hit' && e.target === 0).map((e) => ({ location: e.location, damage: e.damage, heading: e.heading })) }; });
    for (const b of s.ev) { const key = `${b.location}-${b.damage}`; if (!seen.has(key)) { seen.add(key); pend.push({ key, at: n, b }); log.push({ n, ...b }); console.log(`${tag} blow ${seen.size}: ${JSON.stringify(b)} at tick ${n}`); } }
    for (const p of pend) { const k = n - p.at; if (SH.includes(k)) { await page.screenshot({ path: `${out}/blow${[...seen].indexOf(p.key) + 1}-${tag}-${String(k).padStart(3, '0')}.jpg`, type: 'jpeg', quality: 70, timeout: 600000 }); } }
    await page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; h.stamina = h.maxStamina; f.health = Math.max(f.health, Math.ceil(f.maxHealth / 2)); });
  }
  for (let k = 0; k < 20; k++) { await run(1); for (const p of pend) { const kk = (6000) && 0; } }
  writeFileSync(`${out}/blows-${tag}.json`, JSON.stringify(log, null, 2));
  await page.close();
}
await browser.close();
