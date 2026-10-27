// ?feel=hero (src/fight/feel-hero.ts): the hero reacting to a landed blow, 375 wide, tick-exact as scripts/limbs-stills.mjs (Playwright's paused fake clock; one rAF frame = one 60 Hz tick).
// The hero stands still (no input, health topped up after every tick so she lives); the foe walks in and strikes. The harness watches her health: at the FIRST drop (the sim's Hit on her) it shoots the frames
// at +0, +SHOTS... ticks. The sim is the same for both queries (the flag is presentation only), so the two runs hit on the same tick; the report lists it and the script exits 3 when they differ.
//   node scripts/hero-feel-stills.mjs <base url> <out dir> [query ...]     (default queries: "" and "feel=hero"; a Mac uses Metal: CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
//   SHOTS=0,4,8,14,22,34 ticks after the hit   FMT=jpg   DPR=2   MAXWAIT=2400 ticks to wait for the blow
//   COST=1   no stills, no fake clock: the fight plays in real time for COST_S seconds with the hero standing; the hero ragdoll's per-frame cost (globalThis.__ragdollHero) and the foe's are printed
//   playwright is not a repo dependency: npm i --no-save playwright@1.62.1
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [base, out, ...queries] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/hero-feel-stills.mjs <base url> <out dir> [query ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const TICK = 1000 / 60, SHOTS = (process.env.SHOTS ?? '0,4,8,14,22,34').split(',').map(Number), MAXWAIT = Number(process.env.MAXWAIT ?? 2400);
const EXT = process.env.FMT === 'jpg' ? 'jpg' : 'png', SHOT = { timeout: 180000, ...(EXT === 'jpg' ? { type: 'jpeg', quality: 70 } : {}) };
const open = async () => {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: Number(process.env.DPR ?? 2), isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') console.error(`console ${m.text()}`); });
  return page;
};
const ready = async (page, query) => {
  await page.goto(`${base}/${query ? `?${query}` : ''}`, { timeout: 180000 });
  await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000, polling: 'raf' });
};
const keep = (page) => page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; h.stamina = h.maxStamina; f.health = Math.max(f.health, Math.ceil(f.maxHealth / 2)); });
const tagOf = (q) => (q.includes('feel=hero') ? 'on' : 'off');

if (process.env.COST) {
  const query = queries[0] ?? 'feel=hero', page = await open();
  await ready(page, query);
  if (query.includes('feel=hero')) await page.waitForFunction(() => globalThis.__ragdollHero?.state === 'alive', null, { timeout: 120000 });
  await page.waitForTimeout(3000);
  const t0 = Date.now();
  while (Date.now() - t0 < Number(process.env.COST_S ?? 30) * 1000) { await keep(page); await page.waitForTimeout(500); }
  const c = await page.evaluate(() => { const strip = (r) => r && { ...r, screenOf: undefined, probe: undefined, leave: undefined, limbDistance: undefined, corpseInfo: undefined, corpseLimb: undefined }; return { hero: strip(globalThis.__ragdollHero), foe: strip(globalThis.__ragdoll), log: globalThis.__heroReactLog ?? [] }; });
  for (const [who, r] of [['hero', c.hero], ['foe', c.foe]]) for (const [mode, m] of Object.entries(r?.byMode ?? {})) console.log(`${who} ragdoll ${mode}: ${(m.totalMs / m.frames).toFixed(3)} ms a frame on average, max ${m.maxMs.toFixed(2)} ms, ${m.frames} frames`);
  console.log(`hero reactions logged: ${c.log.length} ${JSON.stringify(c.log.slice(0, 6))}`);
  writeFileSync(`${out}/hero-cost-${tagOf(query)}.json`, JSON.stringify(c, null, 2));
  await browser.close(); process.exit(0);
}

const hitAt = {};
for (const query of queries.length ? queries : ['', 'feel=hero']) {
  const tag = tagOf(query), page = await open();
  await page.clock.install();
  await ready(page, query);
  for (let slack = 20; ; slack *= 4) { try { await page.clock.pauseAt(await page.evaluate(() => Date.now()) + slack); break; } catch (e) { if (slack > 2000) throw e; } }
  const run = (ticks) => page.clock.runFor(Math.round(ticks * TICK));
  await run(120);
  if (tag === 'on') await page.waitForFunction(() => globalThis.__ragdollHero?.state === 'alive', null, { timeout: 120000 });
  const heroPhase = () => page.evaluate(() => globalThis.__v3Fight.duel.fighters[0].phase);
  for (let i = 0; i < 240 && /sheathed|draw/.test(await heroPhase()); i++) await run(1);
  await run(30);
  await page.screenshot({ path: `${out}/hero-${tag}-idle.${EXT}`, ...SHOT });
  let hitTick = -1, frames = 0;
  for (let n = 0; n < MAXWAIT + 40; n++) {
    const before = await page.evaluate(() => globalThis.__v3Fight.duel.fighters[0].health);
    await run(1);
    const now = await page.evaluate(() => ({ h: globalThis.__v3Fight.duel.fighters[0].health, max: globalThis.__v3Fight.duel.fighters[0].maxHealth }));
    if (hitTick < 0 && now.h < before) hitTick = n;
    if (hitTick >= 0 && SHOTS.includes(n - hitTick)) { await page.screenshot({ path: `${out}/hero-${tag}-${String(n - hitTick).padStart(3, '0')}.${EXT}`, ...SHOT }); frames++; }
    await keep(page);
    if (hitTick >= 0 && n - hitTick > Math.max(...SHOTS)) break;
  }
  const end = await page.evaluate(() => ({ log: globalThis.__heroReactLog ?? [], state: globalThis.__ragdollHero?.state ?? null, cost: globalThis.__ragdollHero ? { frames: globalThis.__ragdollHero.frames, totalMs: globalThis.__ragdollHero.totalMs, maxMs: globalThis.__ragdollHero.maxMs } : null }));
  hitAt[tag] = hitTick;
  console.log(`${tag}: first blow on the hero at tick ${hitTick} after the wait began; ${frames} stills; reaction log ${JSON.stringify(end.log)}; hero ragdoll ${end.state}`);
  writeFileSync(`${out}/hero-${tag}-report.json`, JSON.stringify({ query, hitTick, ...end }, null, 2));
  await page.close();
}
if (hitAt.on !== undefined && hitAt.off !== undefined) {
  console.log(hitAt.on === hitAt.off && hitAt.on >= 0 ? `A/B: one sim, the blow lands on tick ${hitAt.on} in both` : `A/B: DIVERGED (off ${hitAt.off}, on ${hitAt.on}): not one sim, do not use this pair`);
  if (hitAt.on !== hitAt.off || hitAt.on < 0) process.exitCode = 3;
}
await browser.close();
