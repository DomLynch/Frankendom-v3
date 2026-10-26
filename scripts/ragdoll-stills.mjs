// The opponent's ragdoll (data/physics.json, src/fight/ragdoll.ts), 375 wide, tick-exact (Playwright's fake clock, paused; one rAF frame =
// one 60 Hz tick, as scripts/foe-stills.mjs). The same inputs for every query, so the default and ?physics=v1 shots are the same sim ticks:
//   <tag>-hit-<n>     n ticks after the hero's first landed blow on him (the stagger: 0 .. its end)
//   <tag>-death-<n>   n ticks after the killing blow. The kill is a KICK (C), with his health set to 1 first: a kick kill is a plain death
//                     (finishers.ts selectFinisher), the one kill the ragdoll plays (a cinematic finisher keeps its clip, plainDeathOnly).
// COST=1: no stills and no fake clock (performance.now is real): the fight plays in real time for COST_S seconds, then the kick kill, and the
// ragdoll's own per-frame cost (globalThis.__ragdoll.byMode: alive / dead) is printed.
//   node scripts/ragdoll-stills.mjs <base url> <out dir> [query ...]   (on a Mac it uses Metal, elsewhere SwiftShader)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [base, out, ...queries] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/ragdoll-stills.mjs <base url> <out dir> [query ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const TICK = 1000 / 60, CUT_EVERY = Number(process.env.CUT_EVERY ?? 55), KICK_EVERY = Number(process.env.KICK_EVERY ?? 40), MAX_TICKS = Number(process.env.MAX_TICKS ?? 4000);
const HIT_AT = [0, 4, 10, 20, 35, 55], DEATH_AT = [0, 8, 16, 26, 40, 60, 90, 140, 220];
const report = {};
if (process.env.COST) {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.error(`cost: pageerror ${e.message}`));
  await page.goto(`${base}/${queries[0] ? `?${queries[0]}` : ''}`);
  await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 120000 });
  // the hero closes in and cuts for COST_S seconds (his health held full, the foe's held over half), then kicks him dead
  await page.evaluate((s) => new Promise((done) => {
    const fire = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    fire('KeyW', 'keydown'); let t = 0;
    const id = setInterval(() => {
      t += 0.25; const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth;
      const kill = t > s; f.health = kill ? Math.min(f.health, 1) : Math.max(f.health, Math.ceil(f.maxHealth / 2));
      const code = kill ? 'KeyC' : 'KeyF'; fire(code, 'keydown'); fire(code, 'keyup');
      if (t > s + 12 || (kill && globalThis.__ragdoll.state === 'frozen')) { clearInterval(id); fire('KeyW', 'keyup'); setTimeout(done, 1500); }
    }, 250);
  }), Number(process.env.COST_S ?? 30));
  const c = await page.evaluate(() => ({ ...globalThis.__ragdoll, finish: globalThis.__v3Fight.finish }));
  for (const [mode, m] of Object.entries(c.byMode)) console.log(`cost ${mode}: ${(m.totalMs / m.frames).toFixed(3)} ms a frame on average, max ${m.maxMs.toFixed(2)} ms, ${m.frames} frames`);
  console.log(`cost: state ${c.state}, finish ${JSON.stringify(c.finish)}`);
  writeFileSync(`${out}/ragdoll-cost.json`, JSON.stringify(c, null, 2));
  await browser.close(); process.exit(0);
}
for (const query of queries.length ? queries : ['', 'physics=v1']) {
  const tag = query ? query.replace(/[^a-z0-9]+/gi, '-') : 'default';
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.error(`${tag}: pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') console.error(`${tag}: console ${m.text()}`); });
  // The clock is paused the moment the fight is ready, so every query plays (nearly) the same ticks from there.
  await page.clock.install();
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 180000, polling: 'raf' });
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 20);
  const run = (ticks) => page.clock.runFor(Math.round(ticks * TICK));
  // the physics chunk loads after the first frame (data/physics.json loadAfterFirstFrameMs): the same 2 s of ticks for every query, then (the
  // clock paused) the default waits for the ragdoll to stand
  await run(120);
  if (!query.includes('physics=v1')) await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 60000 });
  const shoot = async (name) => { await page.screenshot({ path: `${out}/${tag}-${name}.png` }); };
  // a frame can step the sim twice (the clock's 17 ms ticks), so a blow and the kill are read off his health and the finish, not one step's events
  const read = () => page.evaluate(() => { const p = globalThis.__v3Fight, [h, f] = p.duel.fighters; return { hero: h.phase, foeHealth: f.health, foeDead: p.finish?.victim === 1, finish: p.finish && { ...p.finish } }; });
  const cost = () => page.evaluate(() => globalThis.__ragdoll ? { ...globalThis.__ragdoll } : null);
  for (let i = 0; i < 240 && /sheathed|draw/.test((await read()).hero); i++) await run(1);
  await run(30);
  let hitAt = -1, killedAt = -1, n = 0, health = (await read()).foeHealth, finish = null;
  await page.keyboard.down('KeyW');
  for (; n < MAX_TICKS; n++) {
    const finishing = hitAt >= 0 && n - hitAt > HIT_AT.at(-1) + 30;
    if (killedAt < 0 && hitAt < 0 && n % CUT_EVERY === 0) { await page.keyboard.down('KeyD'); await page.keyboard.down('KeyF'); await page.keyboard.up('KeyF'); await page.keyboard.up('KeyD'); }
    if (killedAt < 0 && finishing && n % KICK_EVERY === 0) { await page.keyboard.down('KeyC'); await page.keyboard.up('KeyC'); }
    await run(1);
    const s = await read();
    if (killedAt < 0 && !s.foeDead) await page.evaluate((low) => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; if (low) f.health = Math.min(f.health, 1); else f.health = Math.max(f.health, Math.ceil(f.maxHealth / 2)); }, finishing);
    if (hitAt < 0 && s.foeHealth < health) hitAt = n;
    health = s.foeHealth;
    if (hitAt >= 0 && killedAt < 0 && HIT_AT.includes(n - hitAt)) await shoot(`hit-${n - hitAt}`);
    if (killedAt < 0 && s.foeDead) { killedAt = n; finish = s.finish; await page.keyboard.up('KeyW'); }
    if (killedAt >= 0) { const k = n - killedAt; if (DEATH_AT.includes(k)) await shoot(`death-${k}`); if (k >= DEATH_AT.at(-1)) break; }
  }
  await page.keyboard.up('KeyW');
  const dead = await cost();
  report[tag] = { ticks: n, hitAt, killedAt, finish, ragdoll: dead };
  console.log(`${tag}: ${n} ticks, first hit at ${hitAt}, kill at ${killedAt} (${JSON.stringify(finish)}); ragdoll state ${dead?.state}`);
  await page.close();
}
writeFileSync(`${out}/ragdoll-report.json`, JSON.stringify(report, null, 2));
await browser.close();
