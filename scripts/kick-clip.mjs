// The kick (data/feel-kick.json, src/fight/feel-kick.ts, ?feel=kick), 375 wide, tick-exact as scripts/cut-stills.mjs (Playwright's paused fake clock; one rAF frame = one 60 Hz tick).
// The hero kicks the Pitborn once in a staged spot: SCENE=open (he stands open: a knockdown under ?feel=kick) or SCENE=guard (a raised guard on a side that does not cover the low kick:
// the sim's Hit with guarded: a stagger). Every query plays the same ticks, so the default and ?feel=kick frames are the same sim.
//   node scripts/kick-clip.mjs <base url> <out dir> [query ...]     (default queries: '' and 'feel=kick'; SCENE=open|guard; TICKS=180 STEP=2; on a Mac it uses Metal)
// Frames: <out>/<scene>-<tag>-NNN.png at the fight camera; stitch with ffmpeg (scripts print the command). The sim's events and the feel events are printed.
// COST=1: no fake clock: the fight plays in real time, the hero kicks an open foe every second for COST_S seconds; the page's rAF callback median / p99 / max and the ragdoll's per-mode cost are printed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { collectErrors, launchBrowser, phoneOptions, waitPlayable } from './lib/browser.mjs';

const [base, out, ...queries] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/kick-clip.mjs <base url> <out dir> [query ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await launchBrowser();
const TICK = 1000 / 60, SCENE = process.env.SCENE ?? 'open', TICKS = Number(process.env.TICKS ?? 180), STEP = Number(process.env.STEP ?? 2), GAP = Number(process.env.GAP ?? 1.0);
const open = async () => {
  const page = await browser.newPage(phoneOptions(Number(process.env.DSF ?? 1)));
  collectErrors(page, { echo: true });
  return page;
};
// The staging, run in the page before every tick it is wanted: the foe `GAP` m in front of the hero, facing him, both at full health; scene 'guard' holds his guard up on a side that does not cover a low blow.
const stage = (scene, gap, hold) => {
  const [h, f] = globalThis.__v3Fight.duel.fighters;
  h.health = h.maxHealth; f.health = f.maxHealth; h.stamina = h.maxStamina; f.stamina = f.maxStamina;
  if (!hold) return;
  f.body = { ...f.body, x: h.body.x + Math.sin(h.body.heading) * gap, z: h.body.z + Math.cos(h.body.heading) * gap, heading: h.body.heading + Math.PI };
  f.buffer = null;
  if (scene === 'guard') { if (f.phase === 'guard') f.guardDirection = 'overhead'; } else { f.phase = 'ready'; f.age = 0; }   // guard: the AI's own raised guard, turned to a side that does not cover a low blow (else the sim says Blocked and no kick lands)
};

if (process.env.COST) {
  const query = queries[0] ?? '';
  const page = await open();
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window), frames = globalThis.__frames = [];
    window.requestAnimationFrame = (cb) => raf((t) => { const s = performance.now(); cb(t); frames.push(performance.now() - s); });
  });
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 120000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { globalThis.__frames.length = 0; });
  await page.evaluate(({ stageSrc, gap, seconds }) => new Promise((done) => {
    const stage = new Function(`return (${stageSrc})`)(); let t = 0;
    const id = setInterval(() => {
      t += 1; stage('open', gap, true);
      for (const type of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(type, { code: 'KeyC', bubbles: true }));
      if (t >= seconds) { clearInterval(id); setTimeout(done, 1500); }
    }, 1000);
  }), { stageSrc: stage.toString(), gap: GAP, seconds: Number(process.env.COST_S ?? 12) });
  const c = await page.evaluate(() => ({ byMode: globalThis.__ragdoll.byMode, state: globalThis.__ragdoll.state, frames: globalThis.__frames, feel: globalThis.__v3FeelKick ?? [], events: (globalThis.__feelEvents ?? []).length }));
  const f = [...c.frames].sort((a, b) => a - b);
  for (const [mode, m] of Object.entries(c.byMode)) console.log(`cost ${mode}: ${(m.totalMs / m.frames).toFixed(3)} ms a frame on average, max ${m.maxMs.toFixed(2)} ms, ${m.frames} frames`);
  console.log(`${query || 'default'}: rAF callbacks ${f.length}: median ${f[f.length >> 1]?.toFixed(2)} ms, p99 ${f[Math.floor(f.length * 0.99)]?.toFixed(2)} ms, max ${f.at(-1)?.toFixed(2)} ms; kicks listed ${c.feel.length}; feel events ${c.events}; ragdoll ${c.state}`);
  writeFileSync(`${out}/kick-cost-${query.replace(/[^a-z0-9]+/gi, '-') || 'default'}.json`, JSON.stringify({ ...c, frames: undefined, median: f[f.length >> 1], p99: f[Math.floor(f.length * 0.99)], max: f.at(-1) }, null, 2));
  await browser.close(); process.exit(0);
}

for (const query of queries.length ? queries : ['', 'feel=kick']) {
  const tag = query ? query.replace(/[^a-z0-9]+/gi, '-') : 'default';
  const page = await open();
  await page.clock.install();
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  await waitPlayable(page, { timeout: 180000, polling: 'raf' });
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 300);
  const run = (ticks) => page.clock.runFor(Math.round(ticks * TICK));
  await run(120);
  await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 60000 });
  const phase = () => page.evaluate(() => globalThis.__v3Fight.duel.fighters[0].phase);
  await page.keyboard.down('KeyF'); await page.keyboard.up('KeyF');   // the first attack key draws the sword
  for (let i = 0; i < 240 && /sheathed|draw/.test(await phase()); i++) await run(1);
  for (let i = 0; i < 240 && (await phase()) !== 'ready'; i++) await run(1);
  const hold = (on) => page.evaluate(`(${stage.toString()})('${SCENE}', ${GAP}, ${on})`);
  for (let i = 0; i < 40; i++) { await hold(true); await run(1); }   // settle in the staged spot
  if (SCENE === 'guard') {   // provoke the AI into raising a guard (light attacks from the staged spot), then kick the moment it is up; the same ticks for every query
    let found = false;
    for (let i = 0; i < 1500 && !found; i++) {
      await hold(true);
      if (i % 45 === 0) { await page.keyboard.down('KeyF'); await page.keyboard.up('KeyF'); }
      await run(1);
      found = await page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; return f.phase === 'guard' && f.age > 6 && h.phase === 'ready'; });
    }
    console.log(`${SCENE} ${tag}: guard ${found ? 'up' : 'NOT found'}`);
  }
  const seen = [], sim = []; let n = 0;
  console.log(`${SCENE} ${tag}: hero phase before the kick: ${await phase()}`);
  const shoot = async () => page.screenshot({ path: `${out}/${SCENE}-${tag}-${String(n).padStart(3, '0')}.png` });
  await page.keyboard.down('KeyC'); await page.keyboard.up('KeyC');
  for (let t = 0; t < TICKS; t++) {
    if (t < 30) await hold(true); else await hold(false);   // (the staged spot and the guard side for the first 30 ticks, the kick lands at tick 18)   // after the kick lands the sim is on its own (the foe may act); both stay at full health
    await run(1);
    if (t % STEP === 0) { await shoot(); n++; }
    const types = await page.evaluate(() => (globalThis.__v3Fight.events ?? []).map((e) => `${e.type}${e.move ? `:${e.move}` : ''}${e.guarded ? ':guarded' : ''}`));
    if (types.length) sim.push(`t${t} ${types.join(',')}`);
    if (t % 10 === 0) seen.push(await page.evaluate((k) => ({ foe: globalThis.__v3Fight.duel.fighters[1].phase, ragdoll: globalThis.__ragdoll?.state, kicks: (globalThis[k] ?? []).length }), '__v3FeelKick'));
  }
  const events = await page.evaluate(() => ({ feel: globalThis.__v3FeelKick ?? [], bus: globalThis.__feelEvents ?? [], cost: globalThis.__ragdoll?.byMode }));
  console.log(`${SCENE} ${tag}: ${n} frames; kick results ${JSON.stringify(events.feel.map((e) => [e.outcome, e.stance, +e.force.toFixed(2), e.finisherWindowS]))}; ragdoll every 10 ticks: ${seen.map((s) => `${s.foe}/${s.ragdoll}`).join(' ')}`);
  console.log(`${SCENE} ${tag}: sim events ${sim.join(' | ')}`);
  console.log(`${SCENE} ${tag}: ragdoll cost ${JSON.stringify(events.cost)}`);
  await page.close();
}
console.log(`stitch: ffmpeg -framerate ${Math.round(60 / STEP / 2)} -pattern_type glob -i '${out}/${SCENE}-<tag>-*.png' -c:v libx264 -pix_fmt yuv420p ${out}/${SCENE}-<tag>.mp4`);
await browser.close();
