// The boss weapon rows (data/boss-weapons.json) on the Minotaur body, 375 wide, tick-exact (the page's clock is Playwright's fake clock, paused; one rAF frame = one 60 Hz tick, as scripts/foe-stills.mjs).
// The new bosses' bodies are not in the repo yet, so ?bossweapon=<archetype> draws that row's weapon on the page's own foe (the Minotaur): a stand-in view of the DRAWING (the part scaled, the shield board), not the sim's weapon.
//   <tag>-ready       the fight drawn, both standing
//   <tag>-attack-<n>  his strike, n ticks into it (n = 8 and 22 by default; ATTACK_AGES=8,22)
//   node scripts/boss-weapon-stills.mjs <base url> <out dir> [query ...]    e.g. "" "bossweapon=executioner" "bossweapon=shieldmaiden"
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, ...queries] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/boss-weapon-stills.mjs <base url> <out dir> [query ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const TICK = 1000 / 60, AGES = (process.env.ATTACK_AGES ?? '8,22').split(',').map(Number), CUT_EVERY = Number(process.env.CUT_EVERY ?? 55), MAX_TICKS = Number(process.env.MAX_TICKS ?? 2400);
for (const query of queries.length ? queries : ['']) {
  const tag = query ? query.replace(/[^a-z0-9]+/gi, '-') : 'default';
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.error(`${tag}: pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') console.error(`${tag}: console ${m.text()}`); });
  await page.clock.install();
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1500);   // the VPS is shared and loaded: a short pause point is already past by the time the call lands
  const run = (ticks) => page.clock.runFor(Math.round(ticks * TICK));
  const shoot = async (name) => { await page.waitForTimeout(150); await page.screenshot({ path: `${out}/${tag}-${name}.png` }); console.log(`${tag}: ${name}`); };
  const read = () => page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; return { hero: h.phase, foe: f.phase, age: f.age, weapon: f.weapon }; });
  for (let i = 0; i < 240 && /sheathed|draw/.test((await read()).hero); i++) await run(1);
  await run(30); await shoot('ready');
  console.log(`${tag}: the sim's foe weapon: ${(await read()).weapon}`);
  const want = new Set(AGES);
  await page.keyboard.down('KeyW');
  let n = 0;
  for (; n < MAX_TICKS && want.size; n++) {
    if (n % CUT_EVERY === 0) { await page.keyboard.down('KeyD'); await page.keyboard.down('KeyF'); await page.keyboard.up('KeyF'); await page.keyboard.up('KeyD'); }
    await run(1);
    const s = await read();
    await page.evaluate(() => { const [h] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; });   // stills only: the hero lives
    if (s.foe === 'attack' && want.has(s.age)) { want.delete(s.age); await shoot(`attack-${s.age}`); }
  }
  await page.keyboard.up('KeyW');
  console.log(`${tag}: ${n} ticks; not reached: ${[...want].join(', ') || 'none'}`);
  await page.close();
}
await browser.close();
