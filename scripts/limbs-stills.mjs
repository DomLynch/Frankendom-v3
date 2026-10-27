// M7 limb damage (data/feel-limbs.json, src/fight/feel-limbs.ts), 375 wide, tick-exact as scripts/cut-stills.mjs (Playwright's paused fake clock; one rAF frame = one 60 Hz tick):
// the same hero inputs for every query, so ?rules=m4 (default) and ?rules=m4&feel=limbs are the same sim ticks. The fight plays (the hero walks in and strikes, the foe is kept alive), then at tick
// AT the harness sets one part's HP to 0 through the evaluator's own state (window.__v3Rules.setPartHp: the stills' hook, local hosts only) and a frame is shot every EVERY ticks for SECONDS s.
//   LIMB=leg   leg_left to 0 (the limp, the stumble under a heavy blow)       LIMB=arm   arm_right (the sword arm) to 0 (the guard drops, then the weapon leaves his hand)
//   COST=1     no stills, no fake clock: the fight plays in real time for COST_S seconds with the part at 0; the module's own per-frame cost and the ragdoll's are printed
//   node scripts/limbs-stills.mjs <base url> <out dir> [query ...]     (default queries: "rules=m4" and "rules=m4&feel=limbs"; a Mac uses Metal: CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
//   playwright is not a repo dependency: npm i --no-save playwright@1.62.1
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [base, out, ...queries] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/limbs-stills.mjs <base url> <out dir> [query ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const TICK = 1000 / 60, LIMB = process.env.LIMB ?? 'leg', PART = { leg: 'leg_left', arm: 'arm_right' }[LIMB];
const QUIET = Number(process.env.QUIET ?? 0), AT = Number(process.env.AT ?? 240), SECONDS = Number(process.env.SECS ?? process.env.SECONDS ?? 3)   /* SECS from a bash script: SECONDS is bash's own clock (and an integer: `export SECONDS=2.5` is an error there) */, EVERY = Number(process.env.EVERY ?? 3), GAP = Number(process.env.GAP ?? 45);
const FROM = Number(process.env.FROM ?? 0), EXT = process.env.FMT === 'jpg' ? 'jpg' : 'png', SHOT = { timeout: 180000, ...(EXT === 'jpg' ? { type: 'jpeg', quality: 70 } : {}) };   // software GL on a job can take over the 30 s default for one shot
const MIX =[['KeyF'], ['KeyG'], ['KeyD', 'KeyF'], ['KeyG'], ['KeyA', 'KeyF'], ['KeyF']];
const open = async () => {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: Number(process.env.DPR ?? 2), isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') console.error(`console ${m.text()}`); });
  return page;
};
const press = async (page, codes) => { for (const c of codes) await page.keyboard.down(c); for (const c of codes.slice().reverse()) await page.keyboard.up(c); };
const keep = (page) => page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; h.stamina = h.maxStamina; f.health = Math.max(f.health, Math.ceil(f.maxHealth / 2)); });
const ready = async (page, query) => {
  await page.goto(`${base}/${query ? `?${query}` : ''}`, { timeout: 180000 });
  await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000, polling: 'raf' });
};

if (process.env.COST) {
  const query = queries[0] ?? 'rules=m4&feel=limbs', page = await open();
  await ready(page, query);
  await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 120000 });
  await page.waitForTimeout(3000);
  await page.keyboard.down('KeyW');
  const t0 = Date.now(); let n = 0, damaged = false;
  while (Date.now() - t0 < Number(process.env.COST_S ?? 20) * 1000) {
    await press(page, MIX[n++ % MIX.length]); await keep(page);
    if (!damaged && Date.now() - t0 > 4000) { damaged = await page.evaluate((p) => globalThis.__v3Rules?.setPartHp?.(p, 0), PART); }
    await page.waitForTimeout(700);
  }
  await page.keyboard.up('KeyW');
  const c = await page.evaluate(() => ({ ragdoll: { ...globalThis.__ragdoll, screenOf: undefined, probe: undefined, leave: undefined, limbDistance: undefined }, feel: globalThis.__feelLimbs ?? null, events: globalThis.__feelEvents ?? [], hits: globalThis.__v3Rules?.hits }));
  for (const [mode, m] of Object.entries(c.ragdoll.byMode)) console.log(`ragdoll ${mode}: ${(m.totalMs / m.frames).toFixed(3)} ms a frame on average, max ${m.maxMs.toFixed(2)} ms, ${m.frames} frames`);
  if (c.feel) console.log(`feel-limbs: ${(c.feel.totalMs / c.feel.frames).toFixed(3)} ms a frame on average, max ${c.feel.maxMs.toFixed(2)} ms, ${c.feel.frames} frames, ${c.feel.stumbles} stumbles`);
  console.log(`events ${JSON.stringify(c.events.map((e) => e.name))}; part ${PART} set: ${damaged}; hits ${c.hits}`);
  writeFileSync(`${out}/limbs-cost-${LIMB}.json`, JSON.stringify(c, null, 2));
  await browser.close(); process.exit(0);
}

const traces = {};
for (const query of queries.length ? queries : ['rules=m4', 'rules=m4&feel=limbs']) {
  const tag = `${LIMB}-${query.includes('feel=limbs') ? 'limbs' : 'default'}`, page = await open();
  await page.clock.install();
  await ready(page, query);
  for (let slack = 20; ; slack *= 4) { try { await page.clock.pauseAt(await page.evaluate(() => Date.now()) + slack); break; } catch (e) { if (slack > 2000) throw e; } }   // the page's clock ran on while it was asked: a little more slack each try
  const run = (ticks) => page.clock.runFor(Math.round(ticks * TICK));
  await run(120);
  await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 60000 });
  const read = () => page.evaluate(() => { const p = globalThis.__v3Fight, [h, f] = p.duel.fighters; return { hero: h.phase, foeHealth: f.health, foeDead: p.finish?.victim === 1, foe: f.phase }; });
  for (let i = 0; i < 240 && /sheathed|draw/.test((await read()).hero); i++) await run(1);
  await run(30);
  await page.screenshot({ path: `${out}/${tag}-idle.${EXT}`, ...SHOT });   // ready idle, before any input (the clock is paused: the shot changes nothing)
  await page.keyboard.down('KeyW');
  let a = 0, frame = 0;
  const total = AT + SECONDS * 60, trace = [];
  for (let n = 0; n < total; n++) {
    // QUIET=<tick>: no hero strikes from that tick on (an AT later than it lets the foe stand up from the last knockdown) (a landed blow would knock the evaluator's foe down and the limp would not be seen); HEAVY=<ticks after AT>: one heavy blow then (the stumble)
    if (n % GAP === 0 && !(QUIET && n >= QUIET)) await press(page, MIX[a++ % MIX.length]);
    if (process.env.HEAVY && n === AT + Number(process.env.HEAVY)) await press(page, ['KeyG']);
    if (QUIET && n === QUIET) await page.keyboard.up('KeyW');
    // ASIDE=m: the foe's sim position is shifted m metres across the line from the hero (as scripts/cut-stills.mjs does for a corpse), so the camera over the hero's shoulder sees him unhidden; at AT - 30, the same ticks for every query
    // ORBIT=dx: the camera is dragged dx CSS px sideways on the sand over 10 ticks at AT - 60 (as scripts/cut-stills.mjs does), so the foe is seen from the side, not over the hero's shoulder
    if (process.env.ORBIT && n === AT - 60) { const dx = Number(process.env.ORBIT); await page.mouse.move(187 - dx / 2, 300); await page.mouse.down(); for (let i = 1; i <= 10; i++) { await page.mouse.move(187 - dx / 2 + (dx * i) / 10, 300); await run(1); } await page.mouse.up(); n += 10; }
    // AWAY=m: the hero's sim position is moved m metres straight back from the foe at AT - 30, so the foe is not behind him on screen and walks to him (the limp is seen in the walk)
    if (process.env.AWAY && n === AT - 30) await page.evaluate((m) => { const [h, f] = globalThis.__v3Fight.duel.fighters, dx = h.body.x - f.body.x, dz = h.body.z - f.body.z, d = Math.hypot(dx, dz) || 1; h.body = { ...h.body, x: h.body.x + (dx / d) * m, z: h.body.z + (dz / d) * m }; }, Number(process.env.AWAY));
    if (process.env.ASIDE && n === AT - 30) await page.evaluate((m) => { const [h, f] = globalThis.__v3Fight.duel.fighters, dx = f.body.x - h.body.x, dz = f.body.z - h.body.z, d = Math.hypot(dx, dz) || 1; f.body = { ...f.body, x: f.body.x - (dz / d) * m, z: f.body.z + (dx / d) * m }; }, Number(process.env.ASIDE));
    if (n === AT) { const ok = await page.evaluate((p) => globalThis.__v3Rules?.setPartHp?.(p, 0), PART); console.log(`${tag}: ${PART} to 0 at tick ${n}: ${ok}`); }
    await run(1); await keep(page);
    if (n >= AT - 30 && (n - (AT - 30)) % EVERY === 0) {
      const idx = frame++, id = String(idx).padStart(3, '0');
      const skip = idx < FROM;   // FROM=<frame index>: the frames before it are counted but not shot (a slow software-GL job takes only the moments it needs)
      if (!skip) await page.screenshot({ path: `${out}/${tag}-${id}.${EXT}`, ...SHOT });   // FMT=jpg: small files (a job that can only print its results to a log)
      // the foe is small at the fight camera: a second shot of the 110 x 150 CSS px around his hips (a crop of the same frame, the camera and the sim untouched), for a close look
      const at = skip ? null : await page.evaluate(() => globalThis.__ragdoll?.screenOf?.('hips'));
      if (at) await page.screenshot({ path: `${out}/${tag}-crop-${id}.${EXT}`, ...SHOT, clip: { x: Math.min(265, Math.max(0, at[0] - 55)), y: Math.min(662, Math.max(0, at[1] - 60)), width: 110, height: 150 } });
    }
    if (n >= AT && n % 3 === 0) trace.push(await page.evaluate(() => { const r = globalThis.__ragdoll, p = globalThis.__v3Fight, at = (b) => r?.screenOf?.(b)?.map((v) => +v.toFixed(1)); return { n: 0, state: r?.state, foePhase: p.duel.fighters[1].phase, hits: globalThis.__v3Rules?.hits, thighMotor: globalThis.__feelLimbs?.last?.strength?.thighLeft ?? null, footL: at('footLeft'), shinL: at('shinLeft'), footR: at('footRight') }; }));
  }
  await page.keyboard.up('KeyW');
  const end = await page.evaluate(() => ({ events: globalThis.__feelEvents ?? [], feel: globalThis.__feelLimbs ?? null, hits: globalThis.__v3Rules?.hits, fighter: globalThis.__v3Rules?.fighter?.() }));
  console.log(`${tag}: ${frame} frames; rule hits ${end.hits}; events ${JSON.stringify(end.events.map((e) => e.name))}; stumbles ${end.feel?.stumbles ?? 'n/a'}`);
  writeFileSync(`${out}/${tag}-report.json`, JSON.stringify({ query, frames: frame, ...end, trace }, null, 2));
  traces[query.includes('feel=limbs') ? 'limbs' : 'default'] = trace;
  await page.close();
}
// A/B guard: the two runs are one sim only when they were paused on the same tick (the fake clock's pause can land a tick or more apart on a busy machine). Compared by the foe's phase and the rule hits per sample.
if (traces.default && traces.limbs) {
  const d = traces.default, l = traces.limbs, at = d.findIndex((x, i) => !l[i] || x.foePhase !== l[i].foePhase || x.hits !== l[i].hits);
  console.log(at < 0 ? `A/B: aligned over ${d.length} samples` : `A/B: DIVERGED at sample ${at} (foe ${d[at].foePhase} vs ${l[at]?.foePhase}, hits ${d[at].hits} vs ${l[at]?.hits}): not one sim, do not use this pair, run it again`);
  if (at >= 0) process.exitCode = 3;
}
await browser.close();
