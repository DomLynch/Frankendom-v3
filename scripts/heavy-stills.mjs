// Directional heavies stills, 375 wide, at fixed sim ticks (scripts/clip-stills.mjs's method: Playwright's fake clock, paused, one rAF frame = one
// 60 Hz tick, so each still is the same tick of the swing however fast the GL draws). For each query and each heavy it shoots the wind-up, the
// contact tick and the follow-through (heavy_overhead 32 / 5 / 31: ages 20, 32, 44), plus the heavy held at its chamber: <tag>-<heavy>-<moment>.png.
//   node scripts/heavy-stills.mjs <base url> <out dir> [query ...]     (CHROME=<path> picks the browser; on a Mac it uses Metal, elsewhere SwiftShader)
// Inputs (input.ts): G = the overhead; D+G / A+G = heavy_right / heavy_left (keyboard); heavy_thrust is touch-only: hold STRIKE past
// input.heavy-hold-ms (220) and slide up inside the grace. Under ?heavy=v1 the same inputs all give V1's overhead (touch fires it at 220 ms of
// hold, before the slide: HOLD_V1 counts from there, so its ages line up within a tick).
import { mkdirSync } from 'node:fs';
import { launchBrowser, phoneOptions, waitPlayable } from './lib/browser.mjs';

const [base, out, ...queries] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/heavy-stills.mjs <base url> <out dir> [query ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await launchBrowser();
const LAG = 3, TICK = 1000 / 60, CLOSE_IN = Number(process.env.CLOSE_IN ?? 10);   // LAG: ticks from the press to the swing's first tick (clip-stills.mjs)
const HOLD = 16, HOLD_V1 = 14;   // ticks STRIKE is held before the slide: past 220 ms and inside the 100 ms grace; V1 fires its heavy on the 14th
const SWING = [['windup', 20], ['contact', 32], ['follow', 44]], HELD = [['held', 30]];
// [name, how: keys (down together, then up unless held) or 'touch-up' (hold + slide up), held?, moments]
const HEAVIES = [
  ['overhead', ['KeyG'], false, SWING], ['right', ['KeyD', 'KeyG'], false, SWING], ['left', ['KeyA', 'KeyG'], false, SWING], ['thrust', 'touch-up', false, SWING],
  ['overhead-charge', ['KeyG'], true, HELD], ['right-charge', ['KeyD', 'KeyG'], true, HELD], ['left-charge', ['KeyA', 'KeyG'], true, HELD], ['thrust-charge', 'touch-up', true, HELD],
];
if (process.env.ONLY) { const [n, t] = process.env.ONLY.split(':'), s = HEAVIES.find((x) => x[0] === n); s[3] = t.split(',').map((k) => [`t${k}`, Number(k)]); HEAVIES.splice(0, HEAVIES.length, s); }
for (const query of queries.length ? queries : ['']) {
  const tag = query ? query.replace(/[^a-z0-9]+/gi, '-') : 'default', v1 = /heavy=v1/.test(query);
  for (const [name, how, held, moments] of HEAVIES) {
    const page = await browser.newPage(phoneOptions(2));
    page.on('pageerror', (e) => console.error(`${tag}: pageerror ${e.message}`));
    await page.clock.install();
    await page.goto(`${base}/${query ? `?${query}` : ''}`);
    await waitPlayable(page, { timeout: 180000 });
    await page.waitForTimeout(800);
    if (/start=v1/.test(query)) await page.click('#attack-button');   // the Fight button: since #15 the fight starts by itself, and a click there throws a strike
    await page.waitForFunction(() => !/Drawing/.test(document.body.innerText), null, { timeout: 60000 });
    await page.waitForTimeout(1200);
    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(now + 100);
    const run = (ticks) => page.clock.runFor(Math.round(ticks * TICK));
    await page.keyboard.down('KeyW'); await run(CLOSE_IN); await page.keyboard.up('KeyW'); await run(12);   // close in, settle
    let release;
    if (how === 'touch-up') {
      const box = await page.locator('#attack-button').boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
      await page.mouse.move(x, y); await page.mouse.down(); await run(v1 ? HOLD_V1 : HOLD);
      await page.mouse.move(x, y - 40, { steps: 3 });
      release = () => page.mouse.up();
    } else {
      for (const k of how) await page.keyboard.down(k);
      for (const k of how) if (k !== 'KeyG') await page.keyboard.up(k);
      release = () => page.keyboard.up('KeyG');
    }
    if (!held) await release();
    let at = 0;
    for (const [label, age] of moments) {
      const tick = age + LAG;
      await run(tick - at); at = tick;
      await page.waitForTimeout(150);   // let the compositor show the drawn frame
      await page.screenshot({ path: `${out}/${tag}-${name}-${label}.png` });
      if (process.env.DEBUG) console.log(`${tag} ${name} ${label}:`, (await page.evaluate(() => document.body.innerText)).split('\n').filter((l) => /hit|block|parr|miss|dodg/i.test(l)).join(' | '));
    }
    if (held) await release();
    await page.close();
    console.log(`${tag} ${name}: done`);
  }
}
await browser.close();
