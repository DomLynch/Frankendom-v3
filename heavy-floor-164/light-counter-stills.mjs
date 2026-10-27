// Same-opponent light COUNTER-hit stills + numbers for Frankendom-v3 PR 164 (light swing never finishes a healthy head/torso).
// Default URL (the Minotaur body fighting as V1's Pitborn, data/fight.json seed 731, longsword hero), 375 wide, Playwright fake clock paused, one rAF = one 60 Hz tick.
// Lands LIGHT blows (KeyF) one per GAP ticks. The harness cannot aim, so with COUNTER=1 (default) every Hit event aimed at the foe is marked counter=true as it is queued (the evaluator
// reads e.counter -> input.counterHit; the trace below prints it), and with ZONE=head|torso the location is rewritten too (default: the natural location, printed).
// For each landed hit: still at +0 / +12 / +30 ticks, and the numbers: evaluator part HP (head/torso), last verdict, ragdoll state, sim foe phase/health.
//   node light-counter-stills.mjs <base url> <out dir> [hits=2]     env: GAP (90), COUNTER (1), ZONE, CHROME
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const [base, out, HITS = '2'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const TICK = 1000 / 60, GAP = Number(process.env.GAP ?? 90), COUNTER = (process.env.COUNTER ?? '1') === '1', ZONE = process.env.ZONE ?? '';
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
await page.addInitScript(([zone, counter]) => {
  globalThis.__hits = [];
  const push = Array.prototype.push;
  Array.prototype.push = function (...a) {
    for (const e of a) if (e && typeof e === 'object' && (e.type === 'Hit' || e.type === 'KnockedDown' || e.type === 'Staggered' || e.type === 'Killed') && e.target !== 0) {
      if (e.type === 'Hit' && e.location && !e.missile) { if (zone) e.location = zone; if (counter) e.counter = true; }
      push.call(globalThis.__hits, { ...e });
    }
    return push.apply(this, a);
  };
}, [ZONE, COUNTER]);
await page.goto(`${base}/`);
await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 300000, polling: 'raf' });
await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 20);
const run = (t) => page.clock.runFor(Math.round(t * TICK));
await run(120);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 120000 });
const snap = () => page.evaluate(() => {
  const p = globalThis.__v3Fight, [h, f] = p.duel.fighters, r = globalThis.__v3Rules, last = r?.last?.at(-1), parts = r?.fighter?.().parts ?? {};
  const hp = (k) => parts[k] ? +parts[k].hp.toFixed(2) : null;
  return { tick: p.duel.tick, hero: h.phase, foe: f.phase, stun: f.stun, down: f.down ?? 0, simHealth: f.health, simMax: f.maxHealth, rd: globalThis.__ragdoll?.state, rulesHits: r?.hits,
    head: hp('head'), headMax: parts.head?.max ?? null, torso: hp('torso'), torsoMax: parts.torso?.max ?? null,
    ev: last ? { zone: last.input.zone, swing: last.input.swing, counterHit: last.input.counterHit, out: last.result.outcome, str: +last.result.strength.toFixed(1), kd: !!last.result.knockdown, events: last.result.events, act: last.presentation.action, cause: last.presentation.cause, deferredKill: last.presentation.deferredKill } : null,
    hits: globalThis.__hits.splice(0) };
});
for (let i = 0; i < 240 && /sheathed|draw/.test((await snap()).hero); i++) await run(1);
await run(30);
const keep = () => page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; h.stamina = h.maxStamina; f.health = Math.max(f.health, Math.ceil(f.maxHealth / 2)); });
await keep();
const ready = await snap();
await page.waitForTimeout(150);
await page.screenshot({ path: `${out}/ready.png`, timeout: 300000 });
console.log('ready', JSON.stringify({ tick: ready.tick, head: ready.head, torso: ready.torso, rd: ready.rd, simHealth: ready.simHealth }));
await page.keyboard.down('KeyW');
const hitsOut = [];
let landed = 0;
for (let b = 0; b < 14 && landed < Number(HITS); b++) {
  await page.keyboard.down('KeyF'); await page.keyboard.up('KeyF');
  for (let n = 0; n < GAP && landed < Number(HITS); n++) {
    await run(1); await keep();
    const s = await snap(); s.blow = b;
    if (!s.hits.some((h) => h.type === 'Hit')) continue;
    const hit = s.hits.find((h) => h.type === 'Hit');
    const n0 = landed; landed++;
    const rec = { hit: n0, blow: b, tick: s.tick, hitEvent: { move: hit.move, location: hit.location, counter: hit.counter, damage: hit.damage, glance: hit.glance }, ev: s.ev, at: { t0: s } };
    let fell = s.rd === 'knockdown';
    for (const [label, d] of [[0, 0], [12, 12], [30, 18]]) {
      for (let i = 0; i < d; i++) { await run(1); await keep(); const q = await snap(); if (q.rd === 'knockdown') fell = true; rec.at[`t${label}`] = q; }
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${out}/hit${n0}-t${label}.png`, timeout: 300000 });
    }
    for (let i = 0; i < 40; i++) { await run(1); await keep(); const q = await snap(); if (q.rd === 'knockdown') fell = true; }
    rec.fell = fell;
    hitsOut.push(rec);
    n += 90;
  }
}
const final = await snap();
const slim = (s) => s && { tick: s.tick, foe: s.foe, rd: s.rd, down: s.down, simHealth: s.simHealth, head: s.head, headMax: s.headMax, torso: s.torso, torsoMax: s.torsoMax, ev: s.ev };
const summary = hitsOut.map((h) => ({ hit: h.hit, tick: h.tick, location: h.hitEvent.location, counterFlag: h.hitEvent.counter, ev: h.ev, ragdollFell: h.fell, t0: slim(h.at.t0), t12: slim(h.at.t12), t30: slim(h.at.t30) }));
writeFileSync(`${out}/trace.json`, JSON.stringify({ base, seed: 731, counterForced: COUNTER, zoneForced: ZONE || null, gap: GAP, ready: slim(ready), hits: summary, final: slim(final) }, null, 1));
console.log(`${base} counterForced=${COUNTER} zone=${ZONE || 'natural'} landed=${landed} falls=${hitsOut.filter((h) => h.fell).length}`);
for (const h of summary) console.log(`hit${h.hit} tick ${h.tick} loc ${h.location} counter ${h.counterFlag} ev ${JSON.stringify(h.ev)} fell ${h.ragdollFell} | head ${h.t0.head}->${h.t30.head}/${h.t0.headMax} torso ${h.t0.torso}->${h.t30.torso}/${h.t0.torsoMax} rd t0 ${h.t0.rd} t12 ${h.t12.rd} t30 ${h.t30.rd} simHealth ${h.t30.simHealth}/${final.simMax}`);
await browser.close();
