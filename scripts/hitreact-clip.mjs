// ?feel=hitreact clip frames (M7 hit reactions, data/feel-hitreact.json): the opponent takes three SCRIPTED blows, the same ticks for every query, at 375 wide on the fight camera:
//   head from the front (tick 15), stomach from the front (tick 75), torso from his right (tick 135); 180 ticks = 3 s. One screenshot every SHOT_EVERY ticks (default 2 = 30 fps).
// The blows are sim-shaped Hit events added to the frame's events AFTER the sim's step (the harness rewrites the built main.js line `frameEvents.push(...practice.events)` as it is served), so the
// sim never sees them, and the default and ?feel=hitreact pages get identical blows (the default shows today's one stagger). Nothing else in the page is touched.
// Tick-exact like scripts/ragdoll-stills.mjs (Playwright fake clock, paused; one rAF frame = one 60 Hz tick).
//   node scripts/hitreact-clip.mjs <base url> <out dir> [query ...]        default queries: '' and 'feel=hitreact'   -> <out>/<tag>/f-0000.png ...
//   COST=1 node scripts/hitreact-clip.mjs <base url> <out dir> [query ...]  real time, COST_S seconds of a blow every 0.6 s: the ragdoll's per-frame cost (globalThis.__ragdoll.byMode.alive) per query
// On a Mac it uses Metal (CHROME=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome), elsewhere SwiftShader.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [base, out, ...queries] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/hitreact-clip.mjs <base url> <out dir> [query ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const TICK = 1000 / 60, SHOT_EVERY = Number(process.env.SHOT_EVERY ?? 2), TOTAL = Number(process.env.TOTAL ?? 180);
const BLOWS = process.env.BLOWS ? JSON.parse(process.env.BLOWS) : [{ at: 15, location: 'head', rel: Math.PI }, { at: 75, location: 'torso', rel: Math.PI }, { at: 135, location: 'torso', rel: Math.PI / 2 }];   // rel: the attacker's heading minus his (PI = in front, PI/2 = on his right). BLOWS='[{"at":15,"location":"legs","rel":1.57}]' replaces them
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });

// Before any page script: window.__v3Fight becomes an accessor whose setter adds the pending scripted blow to the frame's events.
const INIT = () => {
  globalThis.__hitInject = (p) => {   // called by the page's step loop (patched below): the events to add to this step's, [] when no blow is queued
    const b = globalThis.__hitQueue?.shift();
    if (!b) return [];
    const e = { tick: p.duel.tick, type: 'Hit', actor: 0, target: 1, damage: 0, location: b.location, heading: p.enemy.heading + b.rel };
    (globalThis.__injected ??= []).push({ tick: e.tick, ...b });
    return [e];
  };
};
// main.ts's step loop does `frameEvents.push(...practice.events)` (the built file says `pp.push(...kt.events)`): the queued blow rides along with that step's events, to the scene and the
// ragdoll only (the sim's own state and record never hold it). The build's minified names change; the pattern below is the only coupling.
const PATCH = /(\w+)\.push\(\.\.\.(\w+)\.events\)/;
async function patchMain(page) {
  await page.route('**/client/main.js', async (route) => {
    const res = await route.fetch(), body = await res.text();
    if (!PATCH.test(body)) { console.error('hitreact-clip: main.js has no frameEvents.push(...practice.events); the blows cannot be injected'); process.exit(3); }
    const headers = Object.fromEntries(Object.entries(res.headers()).filter(([k]) => !['content-encoding', 'content-length'].includes(k)));
    await route.fulfill({ status: 200, headers, contentType: 'text/javascript', body: body.replace(PATCH, (_m, a, p) => `${a}.push(...${p}.events,...(globalThis.__hitInject?globalThis.__hitInject(${p}):[]))`) });
  });
}

async function ready(page, query) {
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 180000, polling: 'raf' });
}

for (const query of queries.length ? queries : ['', 'feel=hitreact']) {
  const tag = query ? query.replace(/[^a-z0-9]+/gi, '-') : 'default';
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.error(`${tag}: pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') console.error(`${tag}: console ${m.text()}`); });
  await page.addInitScript(INIT); await patchMain(page);
  if (process.env.COST) {
    await ready(page, query);
    await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 120000 });
    const zones = [['head', Math.PI], ['torso', Math.PI], ['torso', Math.PI / 2], ['legs', Math.PI], ['torso', -Math.PI / 2], ['head', 0]];
    await page.evaluate(([secs, zs]) => new Promise((done) => {
      let t = 0, k = 0;
      const id = setInterval(() => {
        t += 0.6; const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.max(f.health, Math.ceil(f.maxHealth / 2));
        const [location, rel] = zs[k++ % zs.length]; (globalThis.__hitQueue ??= []).push({ location, rel });
        if (t > secs) { clearInterval(id); setTimeout(done, 1000); }
      }, 600);
    }), [Number(process.env.COST_S ?? 20), zones]);
    const c = await page.evaluate(() => ({ byMode: globalThis.__ragdoll.byMode, state: globalThis.__ragdoll.state, injected: globalThis.__injected?.length ?? 0, hitreact: globalThis.__hitreactLog?.length ?? 0 }));
    const a = c.byMode.alive;
    console.log(`cost ${tag}: alive ${(a.totalMs / a.frames).toFixed(3)} ms a frame on average, max ${a.maxMs.toFixed(2)} ms, ${a.frames} frames; blows injected ${c.injected}, hitreact plans ${c.hitreact}, state ${c.state}`);
    writeFileSync(`${out}/cost-${tag}.json`, JSON.stringify(c, null, 2));
    await page.close(); continue;
  }
  await page.clock.install();
  await ready(page, query);
  for (let tries = 0; ; tries++) {   // pauseAt throws 'Cannot fast-forward to the past' when a slow page lets the fake clock run past the time read: ask again with more room
    try { await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 20 + 250 * tries); break; } catch (e) { if (tries >= 6) throw e; }
  }
  const run = (ticks) => page.clock.runFor(Math.round(ticks * TICK));
  await run(120);
  await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 60000 });
  const read = () => page.evaluate(() => globalThis.__v3Fight.duel.fighters[0].phase);
  for (let i = 0; i < 240 && /sheathed|draw/.test(await read()); i++) await run(1);
  await run(30);
  const dir = `${out}/${tag}`; mkdirSync(dir, { recursive: true });
  let shot = 0;
  for (let n = 0; n <= TOTAL; n++) {
    for (const b of BLOWS) if (b.at === n) await page.evaluate((blow) => { (globalThis.__hitQueue ??= []).push(blow); }, { location: b.location, rel: b.rel });
    await page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.max(f.health, Math.ceil(f.maxHealth / 2)); });
    if (n % SHOT_EVERY === 0) await page.screenshot({ path: `${dir}/f-${String(shot++).padStart(4, '0')}.png` });
    await run(1);
  }
  const log = await page.evaluate(() => ({ injected: globalThis.__injected, hitreact: globalThis.__hitreactLog ?? null }));
  console.log(`${tag}: ${shot} frames; injected ${JSON.stringify(log.injected)}; hitreact plans ${JSON.stringify(log.hitreact)}`);
  await page.close();
}
await browser.close();
