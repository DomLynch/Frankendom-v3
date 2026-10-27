// The Minotaur's cuts (data/physics.json `cut`, src/fight/ragdoll.ts), 375 wide, tick-exact as scripts/ragdoll-stills.mjs (Playwright's paused fake clock; one
// rAF frame = one 60 Hz tick). The same inputs for every query, so the default and ?physics=v1 shots are the same sim ticks.
//   HEAD=1   the kill is a KICK (health set to 1 first: a kick kill is a plain death) and the ragdoll's own tuning hook says the torso blow is the head-zone
//            kill (__ragdollTune.onKill), so the head leaves with the killing blow: <tag>-head-<n>, n ticks after it.
//   TAP=part  the corpse is let lie until it is frozen, then a touch tap lands on that part of it (armLeft, armRight, thighLeft, thighRight, spine1, head):
//            <tag>-tap-<n>, n ticks after the tap (the first shot, -1, is the frozen corpse before it).
// COST=1: no stills, no fake clock: the fight plays in real time, the kick kill and (CUT_AT s later) the head cut and a tap on each arm; the ragdoll's own
// per-frame cost by mode is printed (globalThis.__ragdoll.byMode: alive / dead).
//   node scripts/cut-stills.mjs <base url> <out dir> [query ...]     (HEAD=1 or TAP=armLeft; on a Mac it uses Metal, elsewhere SwiftShader)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [base, out, ...queries] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/cut-stills.mjs <base url> <out dir> [query ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const TICK = 1000 / 60, KICK_EVERY = Number(process.env.KICK_EVERY ?? 40), CUT_EVERY = Number(process.env.CUT_EVERY ?? 55), MAX_TICKS = Number(process.env.MAX_TICKS ?? 4000);
const AFTER = (process.env.AFTER ?? '0,4,10,20,40,90,200').split(',').map(Number), TAP = process.env.TAP, HEAD = !!process.env.HEAD;
const report = {};
const open = async (query, tune) => {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') console.error(`console ${m.text()}`); });
  if (process.env.CUTDEBUG) await page.addInitScript((v) => { globalThis.__cutDebug = v; }, process.env.CUTDEBUG);
  if (tune) await page.addInitScript((t) => { globalThis.__ragdollTune = t; }, tune);
  return page;
};
if (process.env.COST) {
  const page = await open(queries[0] ?? '', HEAD ? { onKill: { torso: 'head' } } : undefined);
  // The whole frame, not the ragdoll's share: every rAF callback is timed (the render is inside it), a frame in which the cut list grew is a cut frame, and the gap to the
  // next frame (a GPU stall or a shader compile shows there) is kept too. __frames: [callback ms, gap to the next callback ms, cuts listed after it].
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window), frames = globalThis.__frames = []; let last = null;
    window.requestAnimationFrame = (cb) => raf((t) => {
      const s = performance.now(); if (last) last[1] = s - last[3];
      cb(t); const e = performance.now(); last = [e - s, 0, (globalThis.__v3Cuts ?? []).length, s, globalThis.__v3Fight?.finish ? 1 : 0]; frames.push(last);
    });
  });
  await page.goto(`${base}/${queries[0] ? `?${queries[0]}` : ''}`);
  await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 120000 });
  await page.waitForTimeout(3000);   // the physics chunk, the hidden cut art and the warm-up draws are in by now
  const heap0 = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);   // first-visit memory: the JS heap once the ragdoll stands (typed arrays count), before any fight
  console.log(`heap after load ${heap0 === null ? 'n/a' : (heap0 / 1048576).toFixed(1)} MB`);
  await page.evaluate((s) => new Promise((done) => {
    const fire = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    fire('KeyW', 'keydown'); let t = 0;
    const id = setInterval(() => {
      t += 0.25; const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth;
      const kill = t > s; f.health = kill ? Math.min(f.health, 1) : Math.max(f.health, Math.ceil(f.maxHealth / 2));
      const code = kill ? 'KeyC' : 'KeyF'; fire(code, 'keydown'); fire(code, 'keyup');
      if (t > s + 12 || (kill && globalThis.__ragdoll.state === 'frozen')) { clearInterval(id); fire('KeyW', 'keyup'); setTimeout(done, 1500); }
    }, 250);
  }), Number(process.env.COST_S ?? 20));
  const tap = async (part) => { const at = await page.evaluate((p) => globalThis.__ragdoll.screenOf?.(p), part); if (at) { await page.touchscreen.tap(at[0], at[1]); await page.waitForTimeout(100); } };
  for (const part of ['armLeft', 'armRight', 'thighLeft']) await tap(part);
  await page.waitForTimeout(Number(process.env.CUT_S ?? 4) * 1000);
  const c = await page.evaluate(() => ({ ...globalThis.__ragdoll, screenOf: undefined, finish: globalThis.__v3Fight.finish }));
  for (const [mode, m] of Object.entries(c.byMode)) console.log(`cost ${mode}: ${(m.totalMs / m.frames).toFixed(3)} ms a frame on average, max ${m.maxMs.toFixed(2)} ms, ${m.frames} frames`);
  console.log(`cost: state ${c.state}; cuts ${JSON.stringify(c.cuts)}`);
  const frames = await page.evaluate(() => globalThis.__frames), cutFrames = [];
  frames.forEach((f, i) => { if (i && f[2] > frames[i - 1][2]) cutFrames.push({ unit: c.cuts[f[2] - 1]?.unit, source: c.cuts[f[2] - 1]?.source, callbackMs: +f[0].toFixed(2), gapToNextMs: +f[1].toFixed(2), prevMs: +frames[i - 1][0].toFixed(2) }); });
  const ordinary = frames.filter((f, i) => i && f[2] === frames[i - 1][2]).map((f) => f[0]).sort((a, b) => a - b);
  console.log(`frames ${frames.length}: callback median ${ordinary[ordinary.length >> 1]?.toFixed(2)} ms, p99 ${ordinary[Math.floor(ordinary.length * 0.99)]?.toFixed(2)} ms, max ${ordinary.at(-1)?.toFixed(2)} ms (frames with no cut)`);
  const killAt = frames.findIndex((f, i) => i && f[4] && !frames[i - 1][4]);   // the frame the kill lands in (the same with or without the head cut: the control)
  if (killAt > 0) console.log(`kill frame: callback ${frames[killAt][0].toFixed(2)} ms, gap to next ${frames[killAt][1].toFixed(2)} ms, previous ${frames[killAt - 1][0].toFixed(2)} ms; next frames ${frames.slice(killAt + 1, killAt + 4).map((f) => f[0].toFixed(1)).join(', ')} ms`);
  for (const f of cutFrames) console.log(`cut frame ${f.unit} (${f.source}): callback ${f.callbackMs} ms, gap to next ${f.gapToNextMs} ms, previous frame ${f.prevMs} ms`);
  for (const s of c.cutSteps ?? []) console.log(`cut steps ${JSON.stringify(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(2) : v])))}`);
  c.cutFrames = cutFrames; c.frameStats = { frames: frames.length, medianMs: ordinary[ordinary.length >> 1], maxMs: ordinary.at(-1) };
  writeFileSync(`${out}/cut-cost.json`, JSON.stringify(c, null, 2));
  await browser.close(); process.exit(0);
}
for (const query of queries.length ? queries : ['', 'physics=v1']) {
  const tag = query ? query.replace(/[^a-z0-9]+/gi, '-') : 'default', v1 = query.includes('physics=v1');
  const page = await open(query, HEAD ? { onKill: { torso: 'head' } } : undefined);
  await page.clock.install();
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 180000, polling: 'raf' });
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 20);
  const run = (ticks) => page.clock.runFor(Math.round(ticks * TICK));
  await run(120);
  if (!v1) await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 60000 });
  const shoot = async (name) => { await page.screenshot({ path: `${out}/${tag}-${name}.png` }); };
  const read = () => page.evaluate(() => { const p = globalThis.__v3Fight, [h, f] = p.duel.fighters; return { hero: h.phase, foeHealth: f.health, foeDead: p.finish?.victim === 1, finish: p.finish && { ...p.finish } }; });
  const cost = () => page.evaluate(() => globalThis.__ragdoll ? { ...globalThis.__ragdoll, screenOf: undefined } : null);
  for (let i = 0; i < 240 && /sheathed|draw/.test((await read()).hero); i++) await run(1);
  await run(30);
  let hitAt = -1, killedAt = -1, n = 0, health = (await read()).foeHealth, finish = null;
  await page.keyboard.down('KeyW');
  for (; n < MAX_TICKS; n++) {
    const finishing = hitAt >= 0 && n - hitAt > 90;
    if (killedAt < 0 && hitAt < 0 && n % CUT_EVERY === 0) { await page.keyboard.down('KeyD'); await page.keyboard.down('KeyF'); await page.keyboard.up('KeyF'); await page.keyboard.up('KeyD'); }
    if (killedAt < 0 && finishing && n % KICK_EVERY === 0) { await page.keyboard.down('KeyC'); await page.keyboard.up('KeyC'); }
    await run(1);
    const s = await read();
    if (killedAt < 0 && !s.foeDead) await page.evaluate((low) => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; if (low) f.health = Math.min(f.health, 1); else f.health = Math.max(f.health, Math.ceil(f.maxHealth / 2)); }, finishing);
    if (hitAt < 0 && s.foeHealth < health) hitAt = n;
    health = s.foeHealth;
    if (killedAt < 0 && s.foeDead) { killedAt = n; finish = s.finish; await page.keyboard.up('KeyW'); break; }
  }
  await page.keyboard.up('KeyW');
  if (killedAt < 0) { console.error(`${tag}: no kill in ${n} ticks`); await page.close(); continue; }
  if (HEAD) { let k = 0; for (const at of AFTER) { await run(at - k); k = at; await shoot(`head-${at}`); } }
  else if (TAP) {
    // let him lie until the package freezes him (the same ticks for every query), then tap
    for (let k = 0; k < 900 && !v1 && (await cost())?.state !== 'frozen'; k += 10) await run(10);
    // ASIDE=dx,dz: the test hook: the hero is moved off the corpse's line (his sim position shifted by dx, dz metres) so the camera sees the corpse unhidden
    // ORBIT=dx: the camera is dragged dx CSS px sideways on the sand (a drag never cuts), so the corpse is seen from the side, not over the hero's shoulder
    if (process.env.ORBIT) { const dx = Number(process.env.ORBIT); await page.mouse.move(187 - dx / 2, 560); await page.mouse.down(); for (let i = 1; i <= 10; i++) { await page.mouse.move(187 - dx / 2 + (dx * i) / 10, 560); await run(1); } await page.mouse.up(); await run(30); }
    // ASIDE=m: the test hook: the hero and the corpse are moved apart sideways (the corpse's sim position shifted m metres across the line from the hero to him; the camera rides the hero), so the corpse is not behind the hero
    if (process.env.ASIDE) { await page.evaluate((m) => { const [h, f] = globalThis.__v3Fight.duel.fighters, dx = f.body.x - h.body.x, dz = f.body.z - h.body.z, n = Math.hypot(dx, dz) || 1; f.body = { ...f.body, x: f.body.x - (dz / n) * m, z: f.body.z + (dx / n) * m }; }, Number(process.env.ASIDE)); await run(20); }
    await run(30);
    await shoot('tap--1');
    // TAP is a unit (arm_left ...: the first grid point of the screen a tap would cut that unit at) or a part (armLeft ...: that bone's own screen point)
    const at = v1 ? null : /_/.test(TAP) || TAP === 'head' ? await page.evaluate((u) => { for (let y = 120; y < 700; y += 5) for (let x = 20; x < 360; x += 5) if (globalThis.__ragdoll.probe?.(x, y) === u) return [x, y]; return null; }, TAP) : await page.evaluate((p) => globalThis.__ragdoll.screenOf?.(p), TAP);
    if (at) { console.log(`${tag}: tapping ${TAP} at ${at.map((x) => x.toFixed(0))}`); await page.touchscreen.tap(at[0], at[1]); }
    // LIMB=<unit> (default: the tapped unit when it is one): print the metres from that unit's cut bone to the chest bone at each AFTER tick (the harness read, no picture needed)
    const unit = process.env.LIMB ?? (/_/.test(TAP) ? TAP : null), dist = [];
    let k = 0; for (const t of AFTER) { await run(t - k); k = t; await shoot(`tap-${t}`); if (unit) dist.push(`${(t / 60).toFixed(2)}s ${(await page.evaluate((u) => globalThis.__ragdoll.limbDistance?.(u), unit))?.toFixed(3)} m`); }
    if (unit) console.log(`${tag}: ${unit} bone to chest, by time after the tap: ${dist.join(' | ')}`);
  }
  const state = await cost();
  report[tag] = { ticks: n, hitAt, killedAt, finish, ragdoll: state, pieces: await page.evaluate(() => globalThis.__ragdoll?.debug?.()) };
  console.log(`${tag}: ${n} ticks, kill at ${killedAt} (${JSON.stringify(finish)}); ragdoll state ${state?.state}; cuts ${JSON.stringify(state?.cuts ?? [])}${state?.lastTap ? `; last tap: ${state.lastTap}` : ''}`);
  await page.close();
}
writeFileSync(`${out}/cut-report.json`, JSON.stringify(report, null, 2));
await browser.close();
