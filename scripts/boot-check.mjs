// Built-game boot check (CI): serves the PRODUCTION build (dist/, via scripts/serve.mjs) and boots it in headless Chromium (SwiftShader WebGL),
// 375 wide. Shape copied from ARMAGEDOM's Web/scripts/boot-check.mjs (#445). Two live breaks shipped because nothing booted the BUILT game
// before merge (the Gargantua freeze; the hero sword missing from live #228). Reads the game's own hooks only, no URL flag:
//   window.__v3Fight  the sim (src/client/main.ts): both fighters exist with health, and duel.tick advances (the loop is alive)
//   window.__ragdoll  the opponent's body (src/fight/ragdoll.ts): state 'alive' = the first boss is loaded and standing
//   window.__weaponShapes.player  the hero's sword file, set only when its mesh really loaded (src/fight/scene.ts reshape)
// Fails on: any uncaught page error, console.error, failed or >= 400 same-origin request, a missing hero/boss/sword, or the timeout.
//   node scripts/boot-check.mjs [--out boot-check-out]      (needs `playwright` + chromium; run `npm run build` first)
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchBrowser, phoneOptions, waitPlayable } from './lib/browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outArg = process.argv.indexOf('--out');
const out = path.resolve(root, outArg > 0 ? process.argv[outArg + 1] : 'boot-check-out');
const TOTAL_MS = 170_000;   // tuning-ok: CI tool, hard cap for the whole check (software GL on a 2-core runner)
const READY_MS = 120_000;   // tuning-ok: CI tool, the fight must be playable within this
const SETTLE_MS = 45_000;   // tuning-ok: CI tool, boss body and hero sword (both load after the first frame) within this after playable

if (!existsSync(path.join(root, 'dist/index.html'))) { console.error('no production build at dist/ (run npm run build first)'); process.exit(2); }
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const { chromium } = await import('playwright');
const port = await new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const server = spawn(process.execPath, [path.join(root, 'scripts/serve.mjs'), String(port)], { stdio: 'ignore' });
const origin = `http://localhost:${port}`;
const t0 = Date.now(), log = [], problems = [];
const note = (l) => { const s = `${((Date.now() - t0) / 1000).toFixed(1)}s ${l}`; log.push(s); console.log(s); };
const browser = await launchBrowser({ angle: 'swiftshader', extra: ['--enable-unsafe-swiftshader', '--mute-audio'], chromeEnv: null });
let page, done = false;
async function finish(code) {
  if (done) return; done = true;
  try { await page?.screenshot({ path: path.join(out, code ? 'failure-375.png' : 'boot-375.png'), timeout: 30_000 }); } catch (e) { note(`screenshot failed: ${String(e.message).split('\n')[0]}`); }   // software GL: a frame can take seconds
  writeFileSync(path.join(out, 'boot-check.log'), `${log.join('\n')}\n${problems.map((p) => `PROBLEM ${p}`).join('\n')}\n`);
  for (const p of problems) console.error(`BOOT CHECK FAIL: ${p}`);
  console.log(code ? 'built-game boot: FAIL' : 'built-game boot: PASS (hero, boss, sword, loop alive, no errors, no 404s)');
  await browser.close().catch(() => {}); server.kill();
  process.exit(code);
}
setTimeout(() => { problems.push(`timeout: exceeded ${TOTAL_MS / 1000} s`); void finish(1); }, TOTAL_MS);
try {
  page = await browser.newPage(phoneOptions(2));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => problems.push(`uncaught page error: ${String(e.stack ?? e).slice(0, 500)}`));
  page.on('requestfailed', (r) => { if (r.url().startsWith(origin)) problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`); });
  page.on('response', (r) => { if (r.url().startsWith(origin) && r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  note('load');
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
  await waitPlayable(page, { timeout: READY_MS });
  note('playable');
  const sim = () => page.evaluate(() => { const p = globalThis.__v3Fight, f = p?.duel?.fighters; return { tick: p?.duel?.tick ?? -1, hero: f?.[0]?.health ?? 0, boss: f?.[1]?.health ?? 0 }; });
  const a = await sim();
  await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive' && typeof globalThis.__weaponShapes?.player === 'string' && typeof globalThis.__bossArms === 'function', null, { timeout: SETTLE_MS })
    .catch(async () => problems.push(`not settled in ${SETTLE_MS / 1000} s: ${JSON.stringify(await page.evaluate(() => ({ ragdoll: globalThis.__ragdoll?.state ?? null, shapes: globalThis.__weaponShapes ?? null })))} (boss body alive, hero sword loaded)`));
  const b = await sim();
  // Every boss body: the page's own resolution (window.__bossArms, src/fight/scene.ts, the very functions bodyRig uses) must give the row and sim weapon test/fixtures/boss-expect.json expects, and the
  // grafted part, the off-hand mesh and the body file it would fetch must each return 200 from the HASHED production build (zero 404s is also enforced for the whole page, above).
  const EXPECT = JSON.parse(readFileSync(path.join(root, 'test/fixtures/boss-expect.json'), 'utf8'));
  const arms = await page.evaluate(async (bodies) => {
    const hook = globalThis.__bossArms, out = {};
    if (typeof hook !== 'function') return null;
    for (const [kind, w] of Object.entries(bodies)) {
      const got = hook(w.body), status = {};
      for (const k of ['equip', 'offhand', 'body']) status[k] = got[k] ? (await fetch(got[k], { method: 'GET', cache: 'no-store' }).then((r) => r.status, () => 0)) : null;
      out[kind] = { ...got, status };
    }
    return out;
  }, EXPECT.bosses);
  if (!arms) problems.push('window.__bossArms is missing (no boss weapon resolution hook in the built page)');
  else for (const [kind, w] of Object.entries(EXPECT.bosses)) {
    const g = arms[kind], at = `boss ${kind} (${w.body})`;
    if (g.row !== w.row) problems.push(`${at}: weapon row ${g.row} (expected ${w.row})`);
    if (g.weapon !== w.weapon) problems.push(`${at}: sim weapon ${g.weapon} (expected ${w.weapon})`);
    if (!g.equip || !g.equip.includes(`/${w.equip}.`) || g.status.equip !== 200) problems.push(`${at}: equip part ${g.equip} -> HTTP ${g.status.equip} (expected the ${w.equip} part, 200)`);
    if (w.offhand ? (!g.offhand || !g.offhand.includes(`/${w.offhand}.`) || g.status.offhand !== 200) : g.offhand) problems.push(`${at}: off-hand ${g.offhand} -> HTTP ${g.status.offhand} (expected ${w.offhand ?? 'none'}, 200)`);
    if (!g.body || g.status.body !== 200) problems.push(`${at}: body file ${g.body} -> HTTP ${g.status.body}`);
  }
  note(`boss arms checked: ${Object.keys(EXPECT.bosses).length} bodies`);
  if (!(a.hero > 0)) problems.push('hero not spawned (no fighter 0 with health)');
  if (!(a.boss > 0)) problems.push('first boss not spawned (no fighter 1 with health)');
  if (!(b.tick > a.tick)) problems.push(`render/sim loop frozen (tick ${a.tick} -> ${b.tick})`);
  note(`state ${JSON.stringify({ a, b })}`);
  await finish(problems.length ? 1 : 0);
} catch (error) {
  problems.push(String(error?.message ?? error).split('\n')[0]);
  await finish(1);
}
