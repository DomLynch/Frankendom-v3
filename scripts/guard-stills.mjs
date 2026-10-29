// Hero guard stills, 375 wide, at fixed sim ticks (scripts/clip-stills.mjs's recipe: Playwright's fake clock, paused, one rAF frame = one
// 60 Hz tick). For each query: the guard raising and held (Q), held while walking back (Q + S: the guard-walk legs), a blocked hit (Q held
// until the HUD reads "Blocked"; BLOCK_SIDE picks the guard side, the directional guard covers one), and the hero's cuts into the Centurion's guard (a burst around contact,
// for his scutum block): <tag>-<shot>.png. The sim is the same under every query here (Gate 0), so the same tick is the same moment.
//   node scripts/guard-stills.mjs <base url> <out dir> [query ...]     (CHROME=<path> picks the browser; on a Mac it uses Metal, elsewhere SwiftShader)
import { mkdirSync } from 'node:fs';
import { launchBrowser, phoneOptions, waitPlayable } from './lib/browser.mjs';

const [base, out, ...queries] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/guard-stills.mjs <base url> <out dir> [query ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await launchBrowser();
const LAG = 3, TICK = 1000 / 60, CLOSE_IN = Number(process.env.CLOSE_IN ?? 10);
const want = (part) => !process.env.ONLY || process.env.ONLY.split(',').includes(part);   // ONLY=guard,blocked,foe picks the shot groups; TRACE=1 logs the captions while waiting for a block
const caption = (page) => page.evaluate(() => document.body.innerText);   // the HUD's status line reads "Blocked · −N stamina" on the tick the sim blocks
async function fight(tag) {
  const page = await browser.newPage(phoneOptions(2));
  page.on('pageerror', (e) => console.error(`${tag}: pageerror ${e.message}`));
  await page.clock.install();
  await page.goto(`${base}/${tag === 'default' ? '' : `?${tag}`}`);
  await waitPlayable(page, { timeout: 180000 });
  await page.waitForTimeout(800);
  if (/[?&]start=v1\b/.test(page.url())) await page.click('#attack-button');   // V1's Fight press draws; by default the fight draws itself (data/fight.json start.auto)
  await page.waitForTimeout(400);
  await page.waitForFunction(() => !/Drawing/.test(document.body.innerText), null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  for (let tries = 0; ; tries++) {   // the page's clock can pass the mark before the call lands (a fast GPU, a loaded box): ask again
    try { await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1000); break; } catch (e) { if (tries > 4) throw e; }
  }
  const run = (ticks) => page.clock.runFor(Math.round(ticks * TICK));
  const shot = async (name) => { await page.waitForTimeout(150); await page.screenshot({ timeout: 180000, path: `${out}/${tag.replace(/[^a-z0-9]+/gi, '-')}-${name}.png` }); };
  await page.keyboard.down('KeyW'); await run(CLOSE_IN); await page.keyboard.up('KeyW'); await run(12);   // close in, settle
  return { page, run, shot };
}
for (const query of queries.length ? queries : ['']) {
  const tag = query || 'default';
  if (want('guard')) { // raise, held, walking back
    const { page, run, shot } = await fight(tag);
    await page.keyboard.down('KeyQ');
    await run(LAG + 3); await shot('guard-raising');
    await run(40); await shot('guard-held');
    await page.keyboard.down('KeyS'); await run(30); await shot('guard-walk-back'); await page.keyboard.up('KeyS');
    await page.keyboard.up('KeyQ'); await page.close();
  }
  if (want('blocked')) { // a blocked hit: guard held until the sim blocks one of his blows
    const { page, run, shot } = await fight(tag);
    await page.keyboard.down('KeyQ');
    // The directional guard (rules directionalGuard) covers one side: BLOCK_SIDE=<arrow key> holds that side (ArrowLeft, ArrowRight, ArrowUp, ArrowDown; Q alone is straight)
    if (process.env.BLOCK_SIDE) await page.keyboard.down(process.env.BLOCK_SIDE);
    let t = 0; const seen = new Set();
    for (let c = ''; t < 1500 && !/Blocked ·/.test(c); t++) { await run(1); c = await caption(page); if (process.env.TRACE) { const s = c.split('\n').slice(0, 12).join(' / '); if (!seen.has(s)) { seen.add(s); console.log(t, s); } } }
    if (t < 1500) { await run(3); await shot('blocked'); await run(9); await shot('blocked-after'); console.log(`${tag}: blocked at tick ${t}`); }
    else console.log(`${tag}: no block in ${t} ticks`);
    await page.keyboard.up('KeyQ'); await page.close();
  }
  if (want('foe')) { // the Centurion's guard: the hero's right cuts, a burst of frames around each contact
    const { page, run, shot } = await fight(tag);
    for (let n = 0; n < 3; n++) {
      await page.keyboard.down('KeyD'); await page.keyboard.down('KeyF'); await page.keyboard.up('KeyD'); await page.keyboard.up('KeyF');
      for (const at of [14, 20, 26]) { await run(at === 14 ? at + LAG : 6); await shot(`foe-cut${n}-t${at}`); }
      await run(40);
    }
    await page.close();
  }
  console.log(`${tag}: done`);
}
await browser.close();
