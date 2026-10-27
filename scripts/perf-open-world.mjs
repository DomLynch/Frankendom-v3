// Frame cost of the open world, 375 wide, real time (no fake clock): the zone with its bosses standing, CORPSES bodies left behind (ragdoll cost.leave, the zone loop's own call at a
// respawn), the M7 modules named by the query, and a fight going on (the hero walks and strikes; the foe is forced into swings while the hero guards, so ?feel=clash/kick/hitreact/limbs all have
// work every second). Every rAF callback is timed (the render is inside it): ms avg / median / p95 / p99 / max, N frames; the page's own module counters (__feelClash, __feelLimbs, __ragdoll.byMode)
// are read too. A module's cost is its row minus the no-feel row of the same run set (--delta below), because kick and hitreact keep no counter of their own.
//   node scripts/perf-open-world.mjs <base url> <out dir> [query ...]
//   env: RUNS=3 (best of three by p95, like the M8 row), SECS=20 (measured seconds per run), CORPSES=2 (bodies left before measuring, 0..data/physics.json corpse.max), LOAD=1 (print uptime load)
//   default queries (the modules are default-on, data/feel-defaults.json): "feel=v1&rules=m4" (none: the baseline), "feel=v1,<name>&rules=m4" for clash / kick / hitreact / limbs alone, "rules=m4" (all four)
// Writes <out>/perf-<n>.json (every run, every number) and prints the table. Playwright is not a repo dependency: npm i --no-save playwright@1.62.1
// On a job: hfjob -- bash scripts/perf-open-world-job.sh   (builds, serves dist/, runs this, prints the table to the job log)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadavg, cpus } from 'node:os';

const [base, out, ...argQueries] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/perf-open-world.mjs <base url> <out dir> [query ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const RUNS = Number(process.env.RUNS ?? 3), SECS = Number(process.env.SECS ?? 20), CORPSES = Number(process.env.CORPSES ?? 2), TAG = process.env.TAG ?? `c${CORPSES}`;
// The M7 modules are default-on since #135 (data/feel-defaults.json): ?feel=v1 is none of them, ?feel=v1,<name> is that one alone, no query is all four.
const BASE = 'feel=v1&rules=m4';
const QUERIES = argQueries.length ? argQueries : [BASE, `feel=v1,clash&rules=m4`, `feel=v1,kick&rules=m4`, `feel=v1,hitreact&rules=m4`, `feel=v1,limbs&rules=m4`, 'rules=m4'];
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const MIX = [['KeyF'], ['KeyG'], ['KeyD', 'KeyF'], ['KeyG'], ['KeyA', 'KeyF'], ['KeyF']];
const press = async (page, codes) => { for (const c of codes) await page.keyboard.down(c); for (const c of codes.slice().reverse()) await page.keyboard.up(c); };
const keep = (page) => page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; h.stamina = h.maxStamina; f.health = Math.max(f.health, Math.ceil(f.maxHealth / 2)); });
const q = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

async function one(query) {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window), frames = globalThis.__cb = []; let on = false; globalThis.__cbOn = (v) => { on = v; };
    window.requestAnimationFrame = (cb) => raf((t) => { const s = performance.now(); cb(t); if (on) frames.push(performance.now() - s); });
  });
  await page.goto(`${base}/${query ? `?${query}` : ''}`, { timeout: 240000 });
  await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000, polling: 'raf' });
  await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 180000 });
  await page.waitForTimeout(3000);
  // the corpses: kill the live foe (health 1, a kick), let the body freeze, leave it where it lies (the zone loop's call at a respawn), repeat
  let left = 0;
  for (let i = 0; i < CORPSES; i++) {
    await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 120000 });
    await page.evaluate(() => new Promise((done) => {
      const fire = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
      const id = setInterval(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.min(f.health, 1); fire('KeyC', 'keydown'); fire('KeyC', 'keyup'); if (globalThis.__ragdoll.state === 'frozen') { clearInterval(id); setTimeout(() => done(true), 1500); } }, 250);
      setTimeout(() => { clearInterval(id); done(false); }, 90000);   // a kill that never froze: go on with what stands, and say so
    })).then((froze) => { if (!froze) console.error(`corpse ${i + 1}: the body did not freeze in 90 s`); });
    left = await page.evaluate(() => globalThis.__ragdoll.leave?.() ?? null);
    console.error(`corpse ${i + 1}/${CORPSES} left: ${left}`);
    await page.waitForTimeout(1500);
  }
  await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const corpses = await page.evaluate(() => globalThis.__ragdoll.corpses);
  const rt0 = await page.evaluate(() => ({ rd: JSON.parse(JSON.stringify(globalThis.__ragdoll.byMode ?? {})), clash: globalThis.__feelClash && { ...globalThis.__feelClash, last: undefined, impulses: undefined }, limbs: globalThis.__feelLimbs && { ...globalThis.__feelLimbs } }));
  const load0 = loadavg()[0];
  await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW');
  await page.evaluate(() => globalThis.__cbOn(true));
  const t0 = Date.now(); let n = 0, damaged = false;
  while (Date.now() - t0 < SECS * 1000) {
    await press(page, MIX[n++ % MIX.length]); await keep(page);
    if (n % 3 === 0) {   // the forced swing, as clash-stills COST: the hero guards (ArrowLeft + Q), the foe in front of him mid light_right, so a clash lands every few seconds
      await page.keyboard.down('ArrowLeft'); await page.keyboard.down('KeyQ'); await page.waitForTimeout(150);
      await page.evaluate(() => {
        const [h, f] = globalThis.__v3Fight.duel.fighters, hh = h.body.heading;
        f.body = { ...f.body, x: h.body.x + Math.sin(hh) * 1.3, z: h.body.z + Math.cos(hh) * 1.3, heading: hh + Math.PI };
        Object.assign(f, { phase: 'attack', move: 'light_right', age: 0, stall: 0, stun: 0, buffer: null, landed: false, chained: false, charge: 0, charged: false, stamina: f.maxStamina, attackFrom: null });
      });
      await page.waitForTimeout(700); await page.keyboard.up('KeyQ'); await page.keyboard.up('ArrowLeft');
    }
    if (!damaged && Date.now() - t0 > SECS * 400) damaged = await page.evaluate(() => globalThis.__v3Rules?.setPartHp?.('leg_left', 0) ?? false);   // limbs: a leg to 0 mid-run
    await page.waitForTimeout(500);
  }
  const r = await page.evaluate(() => ({ cb: globalThis.__cb, rd: JSON.parse(JSON.stringify(globalThis.__ragdoll.byMode ?? {})), corpses: globalThis.__ragdoll.corpses, clash: globalThis.__feelClash && { frames: globalThis.__feelClash.frames, totalMs: globalThis.__feelClash.totalMs, maxMs: globalThis.__feelClash.maxMs, clashes: globalThis.__feelClash.clashes }, limbs: globalThis.__feelLimbs && { frames: globalThis.__feelLimbs.frames, totalMs: globalThis.__feelLimbs.totalMs, maxMs: globalThis.__feelLimbs.maxMs }, zone: globalThis.__v3Zone ?? null, hitreact: (globalThis.__hitreactLog ?? []).length, events: (globalThis.__feelEvents ?? []).map((e) => e.name), cuts: (globalThis.__v3Cuts ?? []).length }));
  await page.close();
  const cb = [...r.cb].sort((a, b) => a - b), avg = cb.reduce((a, b) => a + b, 0) / cb.length;
  const per = (m, m0) => m && { avgMs: +((m.totalMs - (m0?.totalMs ?? 0)) / Math.max(1, m.frames - (m0?.frames ?? 0))).toFixed(4), maxMs: +m.maxMs.toFixed(3), frames: m.frames - (m0?.frames ?? 0) };
  const ragdoll = Object.fromEntries(Object.entries(r.rd).map(([k, m]) => [k, per(m, rt0.rd[k])]));
  const events = r.events.reduce((a, e) => ((a[e] = (a[e] ?? 0) + 1), a), {});
  return { query, tag: TAG, corpsesAsked: CORPSES, corpses, left, n: cb.length, avgMs: +avg.toFixed(3), medianMs: +q(cb, 0.5).toFixed(3), p95Ms: +q(cb, 0.95).toFixed(3), p99Ms: +q(cb, 0.99).toFixed(3), maxMs: +cb.at(-1).toFixed(3), ragdoll, clashModule: per(r.clash, rt0.clash), limbsModule: per(r.limbs, rt0.limbs), clashes: r.clash?.clashes, hitreactPlans: r.hitreact, events, cuts: r.cuts, zone: r.zone, loadBefore: +load0.toFixed(2), cores: cpus().length };
}

const all = [];
for (const query of QUERIES) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) { const r = await one(query).catch((e) => { console.error(`run ${i + 1} ${query}: ${e.message.split('\n')[0]}`); return null; }); if (!r) continue; runs.push(r); console.log(`run ${i + 1}/${RUNS} ${query || 'default'} [${TAG}] n=${r.n} avg ${r.avgMs} median ${r.medianMs} p95 ${r.p95Ms} p99 ${r.p99Ms} max ${r.maxMs} ms; corpses ${r.corpses}; load ${r.loadBefore}/${r.cores}`); }
  if (!runs.length) continue;
  const best = runs.reduce((a, b) => (b.p95Ms < a.p95Ms ? b : a));   // best of three by p95, as the M8 row
  all.push({ query, best, runs });
}
const base0 = all.find((a) => a.query === BASE)?.best;
console.log(`\n| query | N | avg ms | median | p95 | p99 | max | d avg vs default | d p95 vs default | module counter |\n|---|---|---|---|---|---|---|---|---|---|`);
for (const { query, best: b } of all) {
  const mod = b.clashModule ? `clash ${b.clashModule.avgMs} ms/frame (${b.clashes} clashes)` : b.limbsModule ? `limbs ${b.limbsModule.avgMs} ms/frame` : '';
  console.log(`| ${query || '(default)'} | ${b.n} | ${b.avgMs} | ${b.medianMs} | ${b.p95Ms} | ${b.p99Ms} | ${b.maxMs} | ${base0 ? (b.avgMs - base0.avgMs).toFixed(3) : ''} | ${base0 ? (b.p95Ms - base0.p95Ms).toFixed(3) : ''} | ${mod} |`);
}
writeFileSync(`${out}/perf-${TAG}.json`, JSON.stringify({ when: new Date().toISOString(), runs: RUNS, secs: SECS, corpses: CORPSES, all }, null, 2));
await browser.close();
