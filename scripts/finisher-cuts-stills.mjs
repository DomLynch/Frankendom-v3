// The finishers as physics cuts (data/physics.json finisherCuts), 375 wide, tick-exact as scripts/foe-stills.mjs (Playwright's paused fake clock, one rAF frame =
// one 60 Hz tick): the rotation's pick is forced per run (globalThis.__finisherPick, src/fight/ragdoll.ts ragdollFinisher), the hero closes in and cuts, the foe is
// held at 1 hp so the first landed blade blow kills, and stills are taken AFTER ticks after the killing blow (default 4 = the kill cam, 20, 60, 160).
//   FINISHERS=opened,runThrough,splitCrown,decapitation  (default the first three)   AFTER=4,20,60,160   JSON=out.json
//   node scripts/finisher-cuts-stills.mjs <base url> <out dir> [query ...]   e.g. "ragdoll=finishers" "physics=v1"
// Prints, per finisher and query, the console / page errors (must be 0), the ragdoll's state, cut list (__v3Cuts) and per-frame cost by mode (__ragdoll.byMode).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [base, out, ...queries] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/finisher-cuts-stills.mjs <base url> <out dir> [query ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: process.env.GL_ARGS ? process.env.GL_ARGS.split(' ') : ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });   // GL_ARGS: the T4's Vulkan flags (vps-heavy-jobs skill)
const TICK = 1000 / 60, CUT_EVERY = Number(process.env.CUT_EVERY ?? 55), MAX_TICKS = Number(process.env.MAX_TICKS ?? 3000);
const AFTER = (process.env.AFTER ?? '4,20,60,160').split(',').map(Number);
const FINISHERS = (process.env.FINISHERS ?? 'opened,runThrough,splitCrown').split(',');
const REAL = !!process.env.REAL, CAM = process.env.CAM, report = [];   // CAM=belly|head: the close-up (below)
for (const query of queries.length ? queries : ['ragdoll=finishers']) for (const finisher of FINISHERS) {
  const tag = `${finisher}-${query.replace(/[^a-z0-9]+/gi, '-') || 'default'}`, errors = [];
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console ${m.text()}`); });
  await page.addInitScript((id) => { globalThis.__finisherPick = id; }, finisher);
  if (CAM) await page.addInitScript(([boneName, side, rise, front]) => {   // CAM=belly|head: after the kill the camera stands to the foe's side, aimed at the foe's own bone (the one nearest the sim's foe), so the hero never stands between it and the cut (src/fight/camera.ts __v3CamShot)
    const at = { x: 0, y: 0, z: 0 };
    globalThis.__v3CamShot = (cam) => {
      const p = globalThis.__v3Fight; if (!p?.finish || p.finish.victim !== 1) return;
      const [hero, foe] = p.duel.fighters; let dx = hero.body.x - foe.body.x, dz = hero.body.z - foe.body.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const root = globalThis.__v3Scene; if (!root) return;
      let best = null, bd = 1e9; const w = cam.position.clone();
      root.traverse((o) => { if (o.name !== boneName) return; o.getWorldPosition(w); const d = Math.hypot(w.x - foe.body.x, w.z - foe.body.z); if (d < bd) { bd = d; best = w.clone(); } });
      if (best) { at.x = best.x; at.y = best.y; at.z = best.z; }
      if (!at.y) return;
      // CAM_FRONT: from the hero's side of the foe (the face / belly front) instead of the foe's flank
      cam.position.set(at.x - dz * side * (1 - front) + dx * side * front, at.y + rise, at.z + dx * side * (1 - front) + dz * side * front); cam.lookAt(at.x, at.y, at.z); cam.updateMatrixWorld();
    };
  }, CAM === 'head' ? ['mixamorigHead', 1.5, 0.1, process.env.CAM_FRONT ? 1 : 0] : ['mixamorigSpine', 1.9, 0.1, process.env.CAM_FRONT ? 1 : 0]);
  if (REAL) {   // REAL=1: no fake clock, real time: the ragdoll's own per-frame cost by mode (alive / dead), cut included (no stills); and every rAF callback timed, the render inside it (scripts/cut-stills.mjs COST)
    await page.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window), frames = globalThis.__frames = []; let last = null;
      window.requestAnimationFrame = (cb) => raf((t) => { const s = performance.now(); if (last) last[1] = s - last[3]; cb(t); last = [performance.now() - s, 0, (globalThis.__v3Cuts ?? []).length, s, globalThis.__v3Fight?.finish ? 1 : 0]; frames.push(last); });
    });
    await page.goto(`${base}/${query ? `?${query}` : ''}`);
    await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 180000 });
    await page.waitForTimeout(3000);
    await page.keyboard.down('KeyW');
    for (let t = 0; t < 120 && !(await page.evaluate(() => globalThis.__v3Fight.finish?.victim === 1)); t++) {
      await page.keyboard.down('KeyD'); await page.keyboard.down('KeyF'); await page.keyboard.up('KeyF'); await page.keyboard.up('KeyD');
      await page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.min(f.health, 1); });
      await page.waitForTimeout(500);
    }
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(6000);
    const c = await page.evaluate(() => ({ cuts: globalThis.__v3Cuts ?? [], byMode: globalThis.__ragdoll?.byMode, state: globalThis.__ragdoll?.state }));
    const mean = (m) => m ? `${(m.totalMs / m.frames).toFixed(3)} ms mean, ${m.maxMs.toFixed(2)} max over ${m.frames}` : 'none';
    console.log(`${tag} REAL: ragdoll ${c.state}, cuts ${JSON.stringify(c.cuts)}, alive ${mean(c.byMode?.alive)}, dead ${mean(c.byMode?.dead)}, errors ${errors.length}`);
    const frames = await page.evaluate(() => globalThis.__frames), ordinary = frames.filter((f, i) => i && f[2] === frames[i - 1][2] && f[4] === frames[i - 1][4]).map((f) => f[0]).sort((a, b) => a - b);
    const killAt = frames.findIndex((f, i) => i && f[4] && !frames[i - 1][4]);
    console.log(`${tag} frames ${frames.length}: callback median ${ordinary[ordinary.length >> 1]?.toFixed(1)} ms; kill frame ${killAt > 0 ? frames[killAt][0].toFixed(1) : 'n/a'} ms; ${frames.map((f, i) => (i && f[2] > frames[i - 1][2] ? `cut frame ${f[0].toFixed(1)} ms` : '')).filter(Boolean).join(', ') || 'no cut frame'}; worst after the kill ${killAt > 0 ? Math.max(...frames.slice(killAt).map((f) => f[0])).toFixed(1) : 'n/a'} ms`);
    report.push({ tag, finisher, query, real: c, errors }); await page.close(); continue;
  }
  await page.clock.install();
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 180000 });
  await page.waitForTimeout(3000);   // the late kit dresses and the physics chunk imports (loadAfterFirstFrameMs) after the first frame
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 100);
  const run = (ticks) => page.clock.runFor(Math.round(ticks * TICK));
  const read = () => page.evaluate(() => { const p = globalThis.__v3Fight, [h, f] = p.duel.fighters; return { hero: h.phase, foeHealth: f.health, victim: p.finish?.victim ?? -1, move: p.finish?.move, location: p.finish?.location, ragdoll: globalThis.__ragdoll?.state }; });
  const shoot = async (name) => { await page.waitForTimeout(150); await page.screenshot({ path: `${out}/${tag}-${name}.png` }); };
  for (let i = 0; i < 240 && /sheathed|draw/.test((await read()).hero); i++) await run(1);
  await run(30);
  await page.keyboard.down('KeyW');
  let killedAt = -1, n = 0, last = null;
  for (; n < MAX_TICKS; n++) {
    if (n % CUT_EVERY === 0 && killedAt < 0) { await page.keyboard.down('KeyD'); await page.keyboard.down('KeyF'); await page.keyboard.up('KeyF'); await page.keyboard.up('KeyD'); }
    await run(1);
    const s = await read(); last = s;
    if (killedAt < 0) await page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.min(f.health, 1); });
    if (killedAt < 0 && s.victim === 1) { killedAt = n; await page.keyboard.up('KeyW'); }
    if (killedAt >= 0) { const k = n - killedAt; if (AFTER.includes(k)) await shoot(`k${String(k).padStart(3, '0')}`); if (k >= Math.max(...AFTER)) break; }
  }
  if (CAM) console.log(`${tag} caps shown: ${await page.evaluate(() => { const o = []; globalThis.__v3Scene?.traverse((m) => { if (/^cap_(belly|split)/.test(m.name) && m.visible) { const kids = []; m.traverse((c) => { if (c.isMesh) { const bb = c.geometry.boundingBox ?? (c.geometry.computeBoundingBox(), c.geometry.boundingBox), cen = bb.getCenter(c.position.clone()); c.localToWorld(cen); kids.push(`${c.type} vis${c.visible} verts${c.geometry.attributes.position.count} col${c.material?.color?.getHexString?.()} op${c.material?.opacity} dw${c.material?.depthWrite} at ${cen.toArray().map((v) => v.toFixed(2))} scale ${c.scale.x.toFixed(2)}`); } }); o.push(`${m.name} ${kids.join(' | ') || m.material?.color?.getHexString?.()}`); } }); return o.join('; ') || 'none'; })}`);
  const info = await page.evaluate(() => ({ cuts: globalThis.__v3Cuts ?? [], cost: { ...globalThis.__ragdoll, screenOf: undefined, probe: undefined, cuts: undefined }, finish: globalThis.__v3Fight.finish && { ...globalThis.__v3Fight.finish } }));
  report.push({ tag, finisher, query, killedAt, ticks: n, last, errors, cuts: info.cuts, state: info.cost.state, byMode: info.cost.byMode, pieces: info.cost.pieces, finish: info.finish });
  console.log(`${tag}: killed at ${killedAt}, ${n} ticks, ragdoll ${info.cost.state}, cuts ${JSON.stringify(info.cuts)}, errors ${errors.length}${errors.length ? ' ' + errors.slice(0, 3).join(' | ') : ''}, byMode ${JSON.stringify(info.cost.byMode)}`);
  await page.keyboard.up('KeyW');
  await page.close();
}
if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(report, null, 1));
await browser.close();
