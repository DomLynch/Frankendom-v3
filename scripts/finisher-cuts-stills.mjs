// The finishers as physics cuts (data/physics.json finisherCuts), 375 wide, tick-exact as scripts/foe-stills.mjs (Playwright's paused fake clock, one rAF frame =
// one 60 Hz tick): the rotation's pick is forced per run (globalThis.__finisherPick, src/fight/ragdoll.ts ragdollFinisher), the hero closes in and cuts, the foe is
// held at 1 hp so the first landed blade blow kills, and stills are taken AFTER ticks after the killing blow (default 4 = the kill cam, 20, 60, 160).
//   FINISHERS=opened,runThrough,splitCrown,decapitation  (default the first three)   AFTER=4,20,60,160   JSON=out.json
//   node scripts/finisher-cuts-stills.mjs <base url> <out dir> [query ...]   e.g. "ragdoll=finishers" "physics=v1"
// Prints, per finisher and query, the console / page errors (must be 0), the ragdoll's state, cut list (__v3Cuts) and per-frame cost by mode (__ragdoll.byMode).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [base, out, ...queries] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/finisher-cuts-stills.mjs <base url> <out dir> [query ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: process.env.GL_ARGS ? process.env.GL_ARGS.split(' ') : ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });   // GL_ARGS: the T4's Vulkan flags (vps-heavy-jobs skill)
const TICK = 1000 / 60, CUT_EVERY = Number(process.env.CUT_EVERY ?? 55), MAX_TICKS = Number(process.env.MAX_TICKS ?? 3000);
const AFTER = (process.env.AFTER ?? '4,20,60,160').split(',').map(Number);
const FINISHERS = (process.env.FINISHERS ?? 'opened,runThrough,splitCrown').split(',');
const report = [];
for (const query of queries.length ? queries : ['ragdoll=finishers']) for (const finisher of FINISHERS) {
  const tag = `${finisher}-${query.replace(/[^a-z0-9]+/gi, '-') || 'default'}`, errors = [];
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console ${m.text()}`); });
  await page.addInitScript((id) => { globalThis.__finisherPick = id; }, finisher);
  await page.clock.install();
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 180000 });
  await page.waitForTimeout(3000);   // the late kit dresses and the physics chunk imports (loadAfterFirstFrameMs) after the first frame
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 100);
  const run = (ticks) => page.clock.runFor(Math.round(ticks * TICK));
  const read = () => page.evaluate(() => { const p = globalThis.__v3Fight, [h, f] = p.duel.fighters; return { hero: h.phase, foeHealth: f.health, victim: p.finish?.victim ?? -1, move: p.finish?.move, location: p.finish?.location, ragdoll: globalThis.__ragdoll?.state }; });
  const shoot = async (name) => { await page.waitForTimeout(150); await page.screenshot({ path: `${out}/${tag}-${name}.png` }); };
  for (let i = 0; i < 240 && /sheathed|draw/.test((await read()).hero); i++) await run(1);
  await run(30);
  await page.keyboard.down('KeyW');
  let killedAt = -1, n = 0, last = null;
  for (; n < MAX_TICKS; n++) {
    if (n % CUT_EVERY === 0 && killedAt < 0) { await page.keyboard.down('KeyD'); await page.keyboard.down('KeyF'); await page.keyboard.up('KeyF'); await page.keyboard.up('KeyD'); }
    await run(1);
    const s = await read(); last = s;
    if (killedAt < 0) await page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.min(f.health, 1); });
    if (killedAt < 0 && s.victim === 1) { killedAt = n; await page.keyboard.up('KeyW'); }
    if (killedAt >= 0) { const k = n - killedAt; if (AFTER.includes(k)) await shoot(`k${String(k).padStart(3, '0')}`); if (k >= Math.max(...AFTER)) break; }
  }
  const info = await page.evaluate(() => ({ cuts: globalThis.__v3Cuts ?? [], cost: { ...globalThis.__ragdoll, screenOf: undefined, probe: undefined, cuts: undefined }, finish: globalThis.__v3Fight.finish && { ...globalThis.__v3Fight.finish } }));
  report.push({ tag, finisher, query, killedAt, ticks: n, last, errors, cuts: info.cuts, state: info.cost.state, byMode: info.cost.byMode, pieces: info.cost.pieces, finish: info.finish });
  console.log(`${tag}: killed at ${killedAt}, ${n} ticks, ragdoll ${info.cost.state}, cuts ${JSON.stringify(info.cuts)}, errors ${errors.length}${errors.length ? ' ' + errors.slice(0, 3).join(' | ') : ''}, byMode ${JSON.stringify(info.cost.byMode)}`);
  await page.keyboard.up('KeyW');
  await page.close();
}
if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(report, null, 1));
await browser.close();
