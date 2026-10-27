// The M4 rules evaluator on the Minotaur's ragdoll (data/rules.json, src/fight/rules-eval.ts), 375 wide, tick-exact (Playwright's fake clock, paused;
// one rAF frame = one 60 Hz tick, as scripts/ragdoll-stills.mjs). The hero closes in and throws a heavy (G) every HEAVY_EVERY ticks with his health held
// full and the foe's held over half; each landed blow starts a sequence shot AT_TICKS after it: <tag>-<n>-<outcome>-<ticks>.png, where <outcome> is the
// evaluator's (?rules=m4: knockdown, cut, stick, hit; its deferred kills count as knockdown) or `v1` (?rules=v1: every blow is the same stagger).
// Prints the rules' own record (globalThis.__v3Rules: totals, cuts, per-hit cost) and every console error.
//   node scripts/rules-stills.mjs <base url> <out dir> [query ...]    (default queries: 'rules=m4' = M4 and 'rules=v1' = V1's rules, so a bare run compares the two whatever data/rules.json `default` is; pass '' to shoot the bare link; on a Mac it uses Metal, elsewhere SwiftShader)
//   SEQUENCES=3 HEAVY_EVERY=70 MAX_TICKS=3000 (env)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [base, out, ...queries] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/rules-stills.mjs <base url> <out dir> [query ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const TICK = 1000 / 60, EVERY = Number(process.env.HEAVY_EVERY ?? 70), MAX_TICKS = Number(process.env.MAX_TICKS ?? 3000), SEQ = Number(process.env.SEQUENCES ?? 3);
const AT_TICKS = [0, 4, 10, 20, 35, 60, 100, 140, 200];
const report = {};
for (const query of queries.length ? queries : ['rules=m4', 'rules=v1']) {
  const tag = query ? query.replace(/[^a-z0-9]+/gi, '-') : 'default', errors = [];
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console ${m.text()}`); });
  await page.clock.install();
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 180000, polling: 'raf' });
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 20);
  const run = (ticks) => page.clock.runFor(Math.round(ticks * TICK));
  await run(120);
  await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 60000 });
  const read = () => page.evaluate(() => { const p = globalThis.__v3Fight, [h, f] = p.duel.fighters, r = globalThis.__v3Rules; return { hero: h.phase, foeHealth: f.health, dead: p.finish?.victim === 1, hits: r?.hits ?? null, last: r?.last.at(-1)?.presentation ?? null, cuts: r?.cuts.length ?? 0, state: globalThis.__ragdoll?.state }; });
  for (let i = 0; i < 240 && /sheathed|draw/.test((await read()).hero); i++) await run(1);
  await run(30);
  let health = (await read()).foeHealth, hits = 0, seqs = 0, n = 0, hitN = 0, since = EVERY, shots = [];
  await page.keyboard.down('KeyW');
  for (; n < MAX_TICKS && (seqs < SEQ || shots.length); n++) {
    if (!shots.length && ++since >= EVERY) { since = 0; await page.keyboard.down('KeyG'); await run(14); await page.keyboard.up('KeyG'); n += 14; }
    await run(1);
    const s = await read();
    if (!s.dead) await page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.max(f.health, Math.ceil(f.maxHealth / 2)); });
    const landed = s.hits === null ? s.foeHealth < health : s.hits > hits;
    health = s.foeHealth; if (s.hits !== null) hits = s.hits;
    if (landed && !shots.length) {
      seqs++; hitN = n;
      const outcome = s.last ? (s.last.cut ? 'cut' : s.last.deferredKill ? 'knockdown' : s.last.outcome) : 'v1';
      shots = AT_TICKS.map((t) => [t, `${tag}-${seqs}-${outcome}-${t}`]);
    }
    while (shots.length && n - hitN >= shots[0][0]) { await page.screenshot({ path: `${out}/${shots[0][1]}.png`, timeout: 120000 }); shots.shift(); if (!shots.length) since = 0; }
  }
  await page.keyboard.up('KeyW');
  const r = await page.evaluate(() => ({ rules: globalThis.__v3Rules ?? null, ragdoll: globalThis.__ragdoll ? { state: globalThis.__ragdoll.state, byMode: globalThis.__ragdoll.byMode } : null }));
  report[tag] = { ticks: n, sequences: seqs, errors, ...r };
  console.log(`${tag}: ${n} ticks, ${seqs} sequences, ${errors.length} console/page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  if (r.rules) console.log(`${tag}: rules ${JSON.stringify({ hits: r.rules.hits, byOutcome: r.rules.byOutcome, deferredKills: r.rules.deferredKills, cuts: r.rules.cuts, cost: r.rules.cost })}`);
  await page.close();
}
writeFileSync(`${out}/rules-report.json`, JSON.stringify(report, null, 2));
await browser.close();
