// Light-hit-fall attribution harness (playwright is not a repo dependency, install it beside the script).
//   node light-hit-fall.mjs <base> [query] [swings=20] [keys=KeyF]     env: CHROME (executable), OUT (dir for the json), GAP (ticks between swings, 90), V=1 (print every swing)
// Headless Chromium at 375x812 on the paused fake clock (one rAF = one 60 Hz tick). The hero engages the foe at full stamina (both sides topped up each tick, so only
// the page's own rules can drop him), swings KeyF (light) / KeyG (heavy) / KeyC (kick) every GAP ticks. Per swing it records the sim events, the evaluator's result
// (hand speed, outcome, part HP, ragdoll action), the ragdoll state trail and the head's screen drop; a fall = ragdoll state 'knockdown' or the sim's Fighter.down.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const [base, query = '', N = '20', KEYS = 'KeyF'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const TICK = 1000 / 60, GAP = Number(process.env.GAP ?? 90);
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
await page.clock.install();
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000, polling: 'raf' });
await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 2000);
const run = (t) => page.clock.runFor(Math.round(t * TICK));
await run(120);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 90000 });
const read = () => page.evaluate(() => globalThis.__v3Fight.duel.fighters[0].phase);
for (let i = 0; i < 240 && /sheathed|draw/.test(await read()); i++) await run(1);
await run(30);
const keep = () => page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; h.stamina = h.maxStamina; f.health = f.maxHealth; f.stamina = f.maxStamina; });
const snap = () => page.evaluate(() => {
  const p = globalThis.__v3Fight, f = p.duel.fighters[1], r = globalThis.__ragdoll, s = r.screenOf?.('head');
  const ev = (p.events || []).map((e) => e.type + (e.move ? ':' + e.move : '') + (e.force ? '=' + e.force : '') + (e.location ? '@' + e.location : ''));
  return { st: r.state, hy: s ? Math.round(s[1]) : null, down: f.down ?? 0, ev };
});
await page.keyboard.down('KeyW');
const press = async (c) => { for (const k of c.split('+')) await page.keyboard.down(k); for (const k of c.split('+').reverse()) await page.keyboard.up(k); };
const keys = KEYS.split(',');
const res = [];
let baseHy = null, seen = 0;
for (let a = 0; a < Number(N); a++) {
  await keep(); await press(keys[a % keys.length]);
  const evs = [], states = new Set(); let maxdrop = 0;
  for (let n = 0; n < GAP; n++) {
    await run(1); await keep();
    const s = await snap();
    for (const e of s.ev) evs.push(n + ':' + e);
    states.add(s.st);
    if (baseHy === null && s.st === 'alive' && s.hy !== null) baseHy = s.hy;
    if (baseHy !== null && s.hy !== null) maxdrop = Math.max(maxdrop, s.hy - baseHy);
    if (s.down) states.add('SIMDOWN');
  }
  if (process.env.STILL && a === Number(process.env.STILL_AT ?? 9)) await page.screenshot({ path: process.env.STILL });   // STILL=<png>: the picture after swing STILL_AT (default the 10th)
  const lastR =await page.evaluate(() => (globalThis.__v3Rules?.last ?? []).map((e) => `${e.input.swing}@${e.input.handSpeed.toFixed(1)}m/s ${e.input.zone}:${e.result.outcome} dmg${e.result.damage} ${e.result.part}->${e.result.partHpAfter} act=${e.presentation.action}${e.presentation.deferredKill ? '(deferredKill)' : ''}`));
  const ro = lastR.slice(seen); seen = lastR.length;
  res.push({ a, ro: ro.join(' ; '), states: [...states].join('|'), maxdrop, ev: evs.filter((e) => /Hit|Stagger|Knock|Parried|Block|Guard|Posture|Exhaust/.test(e)).join(' ') });
}
const fell = res.filter((r) => /knockdown|SIMDOWN/.test(r.states) || r.ev.includes('KnockedDown'));
console.log(JSON.stringify({ query, N, swingsWithHit: res.filter((r) => /Hit/.test(r.ev)).length, falls: fell.length, maxdropAll: Math.max(...res.map((r) => r.maxdrop)), rules: await page.evaluate(() => { const r = globalThis.__v3Rules; return r && { hits: r.hits, byOutcome: r.byOutcome }; }) }));
if (process.env.V) console.log(res.map((r) => JSON.stringify(r)).join('\n'));
if (process.env.OUT) writeFileSync(`${process.env.OUT}/fall-${(query || 'default').replace(/[^a-z0-9]+/gi, '-')}.json`, JSON.stringify(res, null, 1));
await browser.close();
