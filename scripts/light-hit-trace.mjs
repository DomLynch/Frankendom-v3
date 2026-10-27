// Light-hit knockdown trace (PR "a light hit only flinches"): a headless default-URL fight at 375 wide on the paused fake clock, one rAF = one 60 Hz tick.
// Lands LIGHT blows (KeyF) on the opponent, one per GAP ticks, and logs per tick from each blow's landing: the sim's foe phase / stun / down, the ragdoll state, the evaluator's last result
// (window.__v3Rules.last) and the Hit events. A tick where the ragdoll state turns 'knockdown' is printed with every input of that tick. Playwright is not a repo dependency, install it beside the script.
//   node light-hit-trace.mjs <base> <out> [query] [blows]     env: ZONE (head|torso|legs: rewrite the location of every Hit on the foe), KEYS (default KeyF; KeyG = heavy, KeyC = kick), GAP (default 90), CHROME
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const [base, out, query = '', BLOWS = '12'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const TICK = 1000 / 60, GAP = Number(process.env.GAP ?? 90), KEYS = (process.env.KEYS ?? 'KeyF').split(','), ZONE = process.env.ZONE ?? '';
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
await page.addInitScript((zone) => {
  globalThis.__hits = [];
  const push = Array.prototype.push;
  Array.prototype.push = function (...a) { for (const e of a) if (e && typeof e === 'object' && (e.type === 'Hit' || e.type === 'KnockedDown' || e.type === 'Staggered' || e.type === 'Killed') && e.target !== 0) { if (zone && e.type === 'Hit' && e.location && !e.missile) e.location = zone; push.call(globalThis.__hits, { ...e }); } return push.apply(this, a); };
}, ZONE);
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000, polling: 'raf' });
await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 20);
const run = (t) => page.clock.runFor(Math.round(t * TICK));
await run(120);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 90000 });
const snap = () => page.evaluate(() => {
  const p = globalThis.__v3Fight, [h, f] = p.duel.fighters, r = globalThis.__v3Rules, last = r?.last?.at(-1);
  return { tick: p.duel.tick, hero: h.phase, foe: f.phase, stun: f.stun, down: f.down ?? 0, health: f.health, rd: globalThis.__ragdoll?.state, rules: r?.hits, ev: last ? { zone: last.input.zone, swing: last.input.swing, out: last.result.outcome, str: +last.result.strength.toFixed(1), kd: last.result.knockdown, act: last.presentation.action, cause: last.presentation.cause } : null, hits: globalThis.__hits.splice(0) };
});
for (let i = 0; i < 240 && /sheathed|draw/.test((await snap()).hero); i++) await run(1);
await run(30);
await page.keyboard.down('KeyW');
const keep = () => page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; h.stamina = h.maxStamina; f.health = Math.max(f.health, Math.ceil(f.maxHealth / 2)); });
const log = [], fell = [];
let landed = 0, prevRd = 'alive', stills = 0;
for (let b = 0; b < Number(BLOWS); b++) {
  for (const c of KEYS) await page.keyboard.down(c);
  for (const c of KEYS.slice().reverse()) await page.keyboard.up(c);
  for (let n = 0; n < GAP; n++) {
    await run(1); await keep();
    const s = await snap(); s.blow = b;
    const interesting = s.hits.length || s.rd !== 'alive' || s.foe === 'hurt';
    if (interesting) log.push(s);
    if (s.hits.some((h) => h.type === 'Hit')) {
      landed++;
      // STILLS=<n>: shoot the first n landed hits at +0, +12, +30 ticks (the flinch, then the recovery), named by hit number and the evaluator's verdict
      if (process.env.STILLS && stills < Number(process.env.STILLS)) {
        const tag = `${out}/hit${stills}-${s.ev?.out ?? 'none'}-${s.ev?.act ?? 'none'}`;
        await page.screenshot({ path: `${tag}-t0.png`, timeout: 300000 });
        for (const [t, d] of [[12, 12], [30, 18]]) { for (let i = 0; i < d; i++) { await run(1); await keep(); } await page.screenshot({ path: `${tag}-t${t}.png`, timeout: 300000 }); }
        stills++; n += 30;
      }
    }
    if (s.rd === 'knockdown' && prevRd !== 'knockdown') fell.push(s);
    prevRd = s.rd;
  }
}
writeFileSync(`${out}/trace.json`, JSON.stringify({ query, zone: ZONE, keys: KEYS, blows: Number(BLOWS), landed, falls: fell.length, fell, log }, null, 1));
console.log(`${query || 'default'} zone=${ZONE || 'natural'} keys=${KEYS} blows=${BLOWS} landedHits=${landed} ragdollFalls=${fell.length}`);
for (const f of fell) console.log('FALL', JSON.stringify({ tick: f.tick, blow: f.blow, foe: f.foe, stun: f.stun, down: f.down, ev: f.ev, hits: f.hits }));
await browser.close();
