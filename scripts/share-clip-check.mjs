// Share clip on the BUILT game (docs/share-clip.md): serves dist/, boots it in headless Chromium at 375 wide, arms the buffer (the same code path the boss kill takes: the kill calls shareClip.moment),
// lets two staggered MediaRecorders run, fires the moment, waits out the tail, then taps the real button. Writes the clip the page produced (a download, or what navigator.share was handed), a 375 still
// of the button and a frame cut from the clip (ffmpeg), and prints the frame interval with and without the buffer. ffprobe the file afterwards.
//   node scripts/share-clip-check.mjs <out dir> [--share]      (--share: navigator.share is stubbed to capture the File; default: no share support, so the file downloads)
//   CHROME=<path> picks the browser; GL=swiftshader for software GL (default on a Mac: Metal)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { waitPlayable } from './lib/browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] ?? 'share-clip-out'), shareMode = process.argv.includes('--share');
mkdirSync(out, { recursive: true });
const { chromium } = await import('playwright');
const port = await new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const server = spawn(process.execPath, [path.join(root, 'scripts/serve.mjs'), String(port)], { stdio: 'ignore' });
const soft = process.env.GL === 'swiftshader' || process.platform !== 'darwin';
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', soft ? '--use-angle=swiftshader' : '--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const problems = [], result = { mode: shareMode ? 'share' : 'download' };
let code = 0, page;
try {
  page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => problems.push(`page error: ${String(e.stack ?? e).slice(0, 400)}`));
  await page.addInitScript((share) => {
    if (share) {
      Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
      Object.defineProperty(navigator, 'share', { value: async (d) => { const f = d.files[0]; const b = new Uint8Array(await f.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); window.__shared = { name: f.name, type: f.type, size: f.size, title: d.title, b64: btoa(s) }; }, configurable: true });
    } else { Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true }); Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); }
  }, shareMode);
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
  await waitPlayable(page, { timeout: 150_000 });
  await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive' && globalThis.__v3Clip, null, { timeout: 60_000 });
  const frames = (ms) => page.evaluate((ms) => new Promise((res) => { const d = []; let last = performance.now(), t0 = last; const f = (n) => { d.push(n - last); last = n; if (n - t0 < ms) requestAnimationFrame(f); else res(d); }; requestAnimationFrame(f); }), ms)
    .then((d) => ({ meanMs: +(d.reduce((a, b) => a + b, 0) / d.length).toFixed(1), p95Ms: +[...d].sort((a, b) => a - b)[Math.floor(d.length * 0.95)].toFixed(1), n: d.length }));
  result.mode0 = await page.evaluate(() => globalThis.__v3Clip.mode());
  result.idleState = await page.evaluate(() => globalThis.__v3Clip.state());
  result.idleFrames = await frames(3000);   // before the fight is engaged the buffer is idle (when idleState says so)
  await page.waitForFunction(() => globalThis.__v3Zone?.engaged === true, null, { timeout: 120_000 });
  result.bufferFrames = await frames(6000);   // engaged: one recorder from the start, a second after `lead` seconds
  result.stateBefore = await page.evaluate(() => globalThis.__v3Clip.state());
  // the REAL kill: the same trick as scripts/look-after-kill.mjs (boss health to 1, attack) so main.ts's own kill path calls shareClip.moment
  await page.evaluate(() => { globalThis.__kill = setInterval(() => { const k = (c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })); const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.min(f.health, 1); k('KeyC', 'keydown'); k('KeyC', 'keyup'); if (globalThis.__v3Fight.finish) clearInterval(globalThis.__kill); }, 100); });
  await page.waitForFunction(() => !!globalThis.__v3Fight?.finish, null, { timeout: 120_000 });
  result.stateAtKill = await page.evaluate(() => globalThis.__v3Clip.state());
  await page.waitForSelector('button.sc-btn:not([disabled])', { timeout: 20_000 });
  result.label = await page.textContent('button.sc-btn');
  await page.screenshot({ path: path.join(out, 'button-375.png') });
  // Where the button sits next to the cut hint and the corpse's cut circles, at 375, 320 and landscape: its box must overlap neither the hint's safe band nor any hint / cut-cue element, and a tap at the hint's centre must not land on the button.
  result.geometry = [];
  for (const [w, h] of [[375, 812], [320, 568], [812, 375]]) {
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(600);
    const g = await page.evaluate(() => {
      const r = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; }, hit = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
      const btn = r(document.querySelector('button.sc-btn')), others = [...document.querySelectorAll('.pk-hint, .pk-text, .pk-arrow, .cut-cue')].filter((e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).opacity !== '0').map((e) => ({ c: e.className, ...r(e) }));
      const H = innerHeight, band = { l: 0, r: innerWidth, t: H * 0.2, b: H * 0.7 };   // pickup.json safe.topFrac / bottomFrac: the band the hint lives in
      const centre = others.find((o) => o.c.includes('pk-hint')), onHint = centre ? document.elementFromPoint((centre.l + centre.r) / 2, (centre.t + centre.b) / 2) : null;
      return { viewport: [innerWidth, innerHeight], button: btn, inHintBand: hit(btn, band), overlapsHintOrCutCircle: others.some((o) => hit(btn, o)), hintVisible: !!centre, tapAtHintHitsButton: !!onHint?.closest?.('button.sc-btn'), insideViewport: btn.l >= 0 && btn.r <= innerWidth && btn.b <= innerHeight && btn.t >= 0 };
    });
    result.geometry.push(g);
    await page.screenshot({ path: path.join(out, `button-${w}x${h}.png`) });
  }
  await page.setViewportSize({ width: 375, height: 812 }); await page.waitForTimeout(300);
  if (shareMode) {
    await page.click('button.sc-btn');
    await page.waitForFunction(() => window.__shared, null, { timeout: 10_000 });
    const s = await page.evaluate(() => window.__shared);
    result.shared = { name: s.name, type: s.type, size: s.size, title: s.title };
    writeFileSync(path.join(out, s.name), Buffer.from(s.b64, 'base64'));
  } else {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10_000 }), page.click('button.sc-btn')]);
    result.download = dl.suggestedFilename();
    await dl.saveAs(path.join(out, dl.suggestedFilename()));
  }
  await page.waitForTimeout(300);
  result.after = await page.textContent('button.sc-btn').catch(() => null);
} catch (error) { problems.push(String(error?.message ?? error).split('\n')[0]); code = 1; result.debug = await page?.evaluate(() => ({ state: globalThis.__v3Clip?.state(), button: document.querySelector('button.sc-btn')?.textContent ?? null })).catch(() => null); }
result.problems = problems;
console.log(JSON.stringify(result, null, 1));
await browser.close().catch(() => {}); server.kill();
process.exit(code || (problems.length ? 1 : 0));
