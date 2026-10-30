// Hero strike stills, 375 wide, at fixed sim ticks: the page's clock is Playwright's fake clock, paused, so each still is the same tick of
// the swing however fast the GL draws (one rAF frame = one 60 Hz tick). For each query and each strike it shoots the wind-up, the contact
// tick and the follow-through (move-defs.json windup / active), plus a heavy held at its chamber: <tag>-<strike>-<moment>.png.
//   node scripts/clip-stills.mjs <base url> <out dir> [query ...]     (CHROME=<path> picks the browser; on a Mac it uses Metal, elsewhere SwiftShader)
// Keys are V1's (input.ts): D+F the right cut, A+F the left cut, T the thrust, G the heavy (held: it charges), W closes in.
import { mkdirSync } from 'node:fs';
import { launchBrowser, phoneOptions, waitPlayable } from './lib/browser.mjs';

const [base, out, ...queries] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/clip-stills.mjs <base url> <out dir> [query ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await launchBrowser();
// LAG: ticks from the key press to the swing's first tick (the press is read on the next frame and the sim takes it a step later), measured
// 2026-10-26: the stab's blood shows 3-4 ticks after its windup. Every moment below is a tick of the swing (age), so the shot waits LAG more.
const LAG = 3;
const TICK = 1000 / 60, CLOSE_IN = Number(process.env.CLOSE_IN ?? 10);   // ticks of W before the strike (the Centurion walks in too)
// [name, keys pressed (down in order, then up), held key kept down until `release` ticks, moments: [label, tick after the press]]
const STRIKES = [
  ['right', ['KeyD', 'KeyF'], null, [['windup', 12], ['contact', 20], ['follow', 30]]],
  ['left', ['KeyA', 'KeyF'], null, [['windup', 12], ['contact', 20], ['follow', 30]]],
  ['stab', ['KeyT'], null, [['windup', 8], ['contact', 16], ['follow', 26]]],
  ['heavy', ['KeyG'], null, [['windup', 20], ['contact', 32], ['follow', 44]]],
  ['charge', ['KeyG'], 40, [['held', 30]]],
];
// ONLY=<strike>:<tick>,<tick>... shoots just that strike at those ticks (to find a pose's tick)
if (process.env.ONLY) { const [n, t] = process.env.ONLY.split(':'), s = STRIKES.find((x) => x[0] === n); s[3] = t.split(',').map((k) => [`t${k}`, Number(k)]); STRIKES.splice(0, STRIKES.length, s); }
for (const query of queries.length ? queries : ['']) {
  const tag = query ? query.replace(/[^a-z0-9]+/gi, '-') : 'default';
  for (const [name, keys, release, moments] of STRIKES) {
    const page = await browser.newPage(phoneOptions(2));
    page.on('pageerror', (e) => console.error(`${tag}: pageerror ${e.message}`));
    await page.clock.install();
    await page.goto(`${base}/${query ? `?${query}` : ''}`);
    await waitPlayable(page, { timeout: 180000 });
    await page.waitForTimeout(800);
    await page.click('#attack-button');   // Fight: draw
    await page.waitForFunction(() => !/Drawing/.test(document.body.innerText), null, { timeout: 60000 });
    await page.waitForTimeout(1200);
    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(now + 100);
    const run = (ticks) => page.clock.runFor(Math.round(ticks * TICK));
    await page.keyboard.down('KeyW'); await run(CLOSE_IN); await page.keyboard.up('KeyW'); await run(12);   // close in, settle
    for (const k of keys) await page.keyboard.down(k);
    for (const k of keys) if (k !== 'KeyG' || release === null) await page.keyboard.up(k);
    let at = 0;
    for (const [label, age] of moments) {
      const tick = age + LAG;
      await run(tick - at); at = tick;
      await page.waitForTimeout(150);   // let the compositor show the drawn frame
      await page.screenshot({ path: `${out}/${tag}-${name}-${label}.png` });
    }
    if (release !== null) { await run(release + LAG - at); await page.keyboard.up('KeyG'); }
    await page.close();
    console.log(`${tag} ${name}: done`);
  }
}
await browser.close();
