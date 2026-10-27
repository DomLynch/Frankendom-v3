// Evidence capture for PR #143 (kick = interrupt only), 375 wide on the paused fake clock (one rAF = one 60 Hz tick), Metal GL on a Mac.
//   node scripts/kick-interrupt-capture.mjs <base url> <out dir> <scenario> [query]
// scenario: light (20 light swings), kick (20 kick presses, spammed), heavy (N heavies), leg (light swings aimed low; counts leg hits, then one more blow)
// env: N (swings), GAP (ticks between presses), STEP (a frame every STEP ticks), CHROME (executable). Both fighters are topped up every tick so only the rules can drop the foe.
// Prints one JSON summary: the sim's own counts (Hit by the hero, KickInterrupted, LegInjured, KnockedDown, sim Fighter.down) and the ragdoll's state trail (a fall = state knockdown).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [base, out, scenario, query = ''] = process.argv.slice(2);
if (!base || !out || !scenario) { console.error('usage: node scripts/kick-interrupt-capture.mjs <base> <out> <light|kick|heavy|leg> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const KEY = { light: 'KeyF', kick: 'KeyC', heavy: 'KeyG', leg: 'KeyF' }[scenario];
const N = Number(process.env.N ?? (scenario === 'heavy' ? 6 : 20)), GAP = Number(process.env.GAP ?? (scenario === 'kick' ? 12 : 90)), STEP = Number(process.env.STEP ?? 4);
const TICK = 1000 / 60;
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
await page.clock.install();
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000, polling: 'raf' });
await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 2000);
const run = (t) => page.clock.runFor(Math.round(t * TICK));
await run(120);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 90000 });
const phase = () => page.evaluate(() => globalThis.__v3Fight.duel.fighters[0].phase);
for (let i = 0; i < 240 && /sheathed|draw/.test(await phase()); i++) await run(1);
await run(30);
const keep = () => page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; h.stamina = h.maxStamina; f.health = f.maxHealth; f.stamina = f.maxStamina; });
// Keep the foe a swing away from the hero (the staging scripts/kick-clip.mjs uses): 1.0 m in front, facing him, on his feet. Only the position is moved, never his state.
const place = (gap) => page.evaluate((g) => { const [h, f] = globalThis.__v3Fight.duel.fighters; f.body = { ...f.body, x: h.body.x + Math.sin(h.body.heading) * g, z: h.body.z + Math.cos(h.body.heading) * g, heading: h.body.heading + Math.PI }; }, Number(process.env.DIST ?? 1.0));
const snap = () => page.evaluate(() => {
  const p = globalThis.__v3Fight, f = p.duel.fighters[1], r = globalThis.__ragdoll;
  return { st: r.state, down: f.down ?? 0, phase: f.phase, legs: (f.legHits ?? []).length, ev: (p.events || []).map((e) => ({ k: `${e.tick}|${e.type}|${e.actor}|${e.target}|${e.move}|${e.count}`, t: e.type, a: e.actor, tg: e.target, mv: e.move, loc: e.location, n: e.count, inj: e.injured, tk: e.ticks })) };
});
const tot = { heroHits: 0, kickInterrupted: 0, legInjured: 0, kickedDownSim: 0, kickedDownEvents: [], ragdollKnockdownTicks: 0, simDownTicks: 0, maxLegHits: 0, hitsByLocation: {}, blowsLanded: [] };
const trail = [], seen = new Set();
let n = 0, tick = 0;
const shoot = async () => { await page.screenshot({ path: `${out}/f-${String(n++).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 82 }); };
await page.keyboard.down('KeyW');
const press = async (c) => { await page.keyboard.down(c); await page.keyboard.up(c); };
const total = N * GAP + (scenario === 'kick' ? 150 : 90);
let swing = 0;
for (let t = 0; t < total; t++) {
  await keep(); await place();
  if (t % GAP === 0 && swing < N) { await press(KEY); swing++; }
  await run(1); tick++;
  const s = await snap();
  tot.maxLegHits = Math.max(tot.maxLegHits, s.legs);
  for (const e of s.ev) {
    if (seen.has(e.k)) continue; seen.add(e.k);   // events persist past their tick: count each once, by the sim's own tick stamp
    if (e.t === 'Hit' && e.a === 0) { tot.heroHits++; tot.hitsByLocation[e.loc] = (tot.hitsByLocation[e.loc] ?? 0) + 1; tot.blowsLanded.push(`t${t}:${e.mv}@${e.loc}`); }
    if (e.t === 'KickInterrupted' && e.a === 0) tot.kickInterrupted++;
    if (e.t === 'LegInjured' && e.a === 0) tot.legInjured++;
    if (e.t === 'KnockedDown' && e.a === 0) { tot.kickedDownSim++; tot.kickedDownEvents.push(`t${t}:${e.mv}${e.inj ? ':injuredLeg' : ''}`); }
  }
  if (s.st === 'knockdown') tot.ragdollKnockdownTicks++;
  if (s.down) tot.simDownTicks++;
  if (t % 30 === 0 || (trail.at(-1) && trail.at(-1).st !== s.st)) trail.push({ t, st: s.st, down: s.down, phase: s.phase });
  if (t % STEP === 0) await shoot();
}
const rules = await page.evaluate(() => { const r = globalThis.__v3Rules; return r && { hits: r.hits, byOutcome: r.byOutcome }; });
const summary = { scenario, query: query || 'default', swingsOrPresses: swing, frames: n, tickHz: 60, frameEveryTicks: STEP, ...tot, ragdollStates: [...new Set(trail.map((x) => x.st))], rules, fell: tot.kickedDownSim > 0 || tot.ragdollKnockdownTicks > 0 || tot.simDownTicks > 0 };
console.log(JSON.stringify(summary));
writeFileSync(`${out}/summary.json`, JSON.stringify({ ...summary, trail }, null, 1));
await browser.close();
