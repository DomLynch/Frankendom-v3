// The weapon clash (data/feel-clash.json, src/fight/feel-clash.ts, ?feel=clash), 375 wide at the fight camera, tick-exact (Playwright's paused fake clock, one rAF
// frame = one 60 Hz tick, as scripts/cut-stills.mjs). The same inputs for every query, so the default and ?feel=clash frames are the same sim ticks.
// FORCED GUARD AND BLOW (the harness's own mode, set through the page's sim state, never shipped): the HERO's guard is real input (Q, with the side that covers the cut:
// the sim's directional guard); the BLOW is forced: the opponent's fighter is put into a swing (phase 'attack', the move, age 0) at a set distance in front of the hero. The
// sim then runs the swing and decides block / parry on its own rules. MODE=block (a light right cut into a guard held first: the sim's Blocked), MODE=parry (the same
// cut, the guard pressed PARRY_AT ticks into the swing so the parry window is open at contact: the sim's Parried), MODE=heavy (his heavy overhead into a held guard: a heavy
// Blocked or GuardBroken). The opponent is the ATTACKER here, so it is HIS weapon arm that the package ragdoll knocks back; the hero (the defender) takes the presentation lean.
// (The opponent as DEFENDER, his guard arm absorbing, is pinned by test/feel-clash.test.mjs; the sim does not hold a guard for the harness, so no still shows it.)
//   node scripts/clash-stills.mjs <base url> <out dir> [query ...]    e.g. ... http://localhost:8733 out '' feel=clash
// Frames: <out>/<tag>-<mode>/f0000.png ... (LEN frames from START ticks after the press); prints the tick the sim's event lands in and, under ?feel=clash,
// the module's per-frame cost (globalThis.__feelClash.cost) and the whole rAF callback cost, so a number is on the page beside the picture.
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, phoneOptions, waitPlayable } from './lib/browser.mjs';

const [base, out, ...queries] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/clash-stills.mjs <base url> <out dir> [query ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await launchBrowser();
const TICK = 1000 / 60, LEN = Number(process.env.LEN ?? 60), CLOSE_IN = Number(process.env.CLOSE_IN ?? 10), SKIP = !!process.env.NO_FRAMES;
const MODES = {
  block: { move: 'light_right', side: 'ArrowLeft', guardAt: -30, start: Number(process.env.START_BLOCK ?? 6) },
  parry: { move: 'light_right', side: 'ArrowLeft', guardAt: Number(process.env.PARRY_AT ?? 14), start: Number(process.env.START_PARRY ?? 6) },
  heavy: { move: 'heavy_overhead', side: 'ArrowUp', guardAt: -30, start: Number(process.env.START_HEAVY ?? 16) },
};
const modes = (process.env.MODE ?? 'block,parry,heavy').split(',');
const report = {};
if (process.env.COST) {
  // COST=1: no fake clock. The fight plays in real time; every COST_EVERY ms the opponent is forced into a swing (the forced blow above) while the hero holds a guard, so
  // clashes happen all the time. Every rAF callback is timed (the render is inside it); under ?feel=clash the module's own per-frame cost (globalThis.__feelClash) is read too.
  const modeName = (process.env.COST_MODE ?? 'block'), m = MODES[modeName];
  for (const query of queries.length ? queries : ['', 'feel=clash']) {
    const page = await browser.newPage(phoneOptions(2));
    await page.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window), frames = globalThis.__cb = [], clashFrames = globalThis.__cbClash = []; let on = false; globalThis.__cbOn = (v) => { on = v; };
      window.requestAnimationFrame = (cb) => raf((t) => { const s = performance.now(); cb(t); if (on) frames.push(performance.now() - s); });
    });
    await page.goto(`${base}/${query ? `?${query}` : ''}`);
    await waitPlayable(page, { timeout: 180000 });
    if (/feel=/.test(query)) await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 60000 });
    await page.waitForTimeout(4000);
    await page.keyboard.down('KeyF'); await page.keyboard.up('KeyF'); await page.waitForTimeout(2500);   // the draw
    await page.keyboard.down('KeyW'); await page.waitForTimeout(600); await page.keyboard.up('KeyW');
    await page.keyboard.down(m.side); await page.keyboard.down('KeyQ'); await page.waitForTimeout(500);
    await page.evaluate(() => globalThis.__cbOn(true));
    const swings = Number(process.env.COST_SWINGS ?? 12);
    for (let i = 0; i < swings; i++) {
      await page.evaluate(([move, dist]) => {
        const [h, f] = globalThis.__v3Fight.duel.fighters, hh = h.body.heading;
        f.body = { ...f.body, x: h.body.x + Math.sin(hh) * dist, z: h.body.z + Math.cos(hh) * dist, heading: hh + Math.PI };
        h.stamina = h.maxStamina; h.health = h.maxHealth;
        Object.assign(f, { phase: 'attack', move, age: 0, stall: 0, stun: 0, buffer: null, landed: false, chained: false, charge: 0, charged: false, stamina: f.maxStamina, attackFrom: null });
      }, [m.move, Number(process.env.DIST ?? 1.3)]);
      await page.waitForTimeout(1200);
    }
    const r = await page.evaluate(() => ({ cb: globalThis.__cb, fc: globalThis.__feelClash && { frames: globalThis.__feelClash.frames, totalMs: globalThis.__feelClash.totalMs, maxMs: globalThis.__feelClash.maxMs, clashes: globalThis.__feelClash.clashes }, rd: globalThis.__ragdoll && { byMode: globalThis.__ragdoll.byMode } }));
    const cb = [...r.cb].sort((a, b) => a - b), q = (p) => cb[Math.min(cb.length - 1, Math.floor(cb.length * p))]?.toFixed(2);
    console.log(`${query || 'default'} (${modeName}, ${swings} forced swings): ${cb.length} frames, rAF callback median ${q(0.5)} ms, p95 ${q(0.95)} ms, p99 ${q(0.99)} ms, max ${cb.at(-1)?.toFixed(2)} ms${r.fc ? `; clash module ${(r.fc.totalMs / r.fc.frames).toFixed(4)} ms/frame avg over ${r.fc.frames} frames, ${r.fc.maxMs.toFixed(3)} ms max, ${r.fc.clashes} clashes` : ''}; ragdoll alive ${JSON.stringify(r.rd?.byMode?.alive && { avgMs: +(r.rd.byMode.alive.totalMs / r.rd.byMode.alive.frames).toFixed(3), maxMs: +r.rd.byMode.alive.maxMs.toFixed(2) })}`);
    await page.close();
  }
  await browser.close(); process.exit(0);
}
for (const query of queries.length ? queries : ['', 'feel=clash']) {
  const tag = query ? query.replace(/[^a-z0-9]+/gi, '-') : 'default';
  for (const name of modes) {
    const m = MODES[name], dir = `${out}/${tag}-${name}`; mkdirSync(dir, { recursive: true });
    const page = await browser.newPage(phoneOptions(Number(process.env.DSF ?? 1)));
    page.on('pageerror', (e) => console.error(`${tag}-${name}: pageerror ${e.message}`));
    await page.clock.install();
    await page.goto(`${base}/${query ? `?${query}` : ''}`);
    await waitPlayable(page, { timeout: 180000, polling: 'raf' });
    await page.waitForTimeout(800);   // the fight draws itself (data/fight.json start.auto), in real time, as scripts/guard-stills.mjs waits for it
    await page.waitForFunction(() => !/Drawing/.test(document.body.innerText), null, { timeout: 60000 });
    await page.waitForTimeout(1200);
    for (let tries = 0; ; tries++) { try { await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1000); break; } catch (e) { if (tries > 4) throw e; } }
    const run = (ticks) => page.clock.runFor(Math.round(ticks * TICK));
    await run(120);
    if (/feel=/.test(query)) await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 60000 });
    const read = () => page.evaluate(() => { const p = globalThis.__v3Fight, [h, f] = p.duel.fighters; return { hero: h.phase, ev: p.duel.events.filter((e) => ['Blocked', 'Parried', 'GuardBroken'].includes(e.type)).map((e) => `${e.type}:${e.move}`) }; });
    if (/sheathed/.test((await read()).hero)) { await page.keyboard.down('KeyF'); await page.keyboard.up('KeyF'); }   // the draw press (a sheathed hero's light press is the draw; the auto-start driver does it in a live page)
    for (let i = 0; i < 400 && /sheathed|draw/.test((await read()).hero); i++) await run(1);
    await run(60);   // the draw ends and the opponent engages; the harness takes the fight over from here
    await run(30);
    await page.keyboard.down('KeyW'); await run(CLOSE_IN); await page.keyboard.up('KeyW'); await run(12);
    // the blow forced (the harness mode): the opponent's fighter is put into a swing, DIST metres in front of the hero, facing him; the sim runs it from there
    const swing = () => page.evaluate(([move, dist]) => {
      const [h, f] = globalThis.__v3Fight.duel.fighters, hh = h.body.heading;
      f.body = { ...f.body, x: h.body.x + Math.sin(hh) * dist, z: h.body.z + Math.cos(hh) * dist, heading: hh + Math.PI };
      Object.assign(f, { phase: 'attack', move, age: 0, stall: 0, stun: 0, buffer: null, landed: false, chained: false, charge: 0, charged: false, stamina: f.maxStamina, attackFrom: null });
    }, [m.move, Number(process.env.DIST ?? 1.3)]);
    const guard = async () => { await page.keyboard.down(m.side); await page.keyboard.down('KeyQ'); };
    if (m.guardAt < 0) { await guard(); await run(-m.guardAt); }
    await swing();
    let eventAt = -1, kind = '';
    for (let n = 0; n < m.start + LEN; n++) {
      if (n === m.guardAt) await guard();
      await run(1);
      if (process.env.DEBUG) console.log(n, await page.evaluate(() => { const p = globalThis.__v3Fight, [h, f] = p.duel.fighters; return `${h.phase}/${h.move}/${h.age} foe ${f.phase}/${f.age} dist ${Math.hypot(h.body.x - f.body.x, h.body.z - f.body.z).toFixed(2)} ev ${p.duel.events.map((e) => e.type).join(',')} | ${document.body.innerText.split('\n').filter((l) => /block|parr|hit|miss/i.test(l)).join(' ')}`; }));
      if (eventAt < 0) { const s = await read(); if (s.ev.length) { eventAt = n; kind = s.ev[0]; } }
      if (n >= m.start && !SKIP) await page.screenshot({ path: `${dir}/f${String(n - m.start).padStart(4, '0')}.png` });
    }
    const cost = await page.evaluate((len) => ({ clash: globalThis.__feelClash ? { frames: globalThis.__feelClash.frames, totalMs: globalThis.__feelClash.totalMs, maxMs: globalThis.__feelClash.maxMs, clashes: globalThis.__feelClash.clashes, impulses: globalThis.__feelClash.impulses } : null, events: globalThis.__feelEvents ?? [], cb: [0] }), LEN);   // (timings under the fake clock read 0: the cost numbers come from COST=1 below, in real time)
    const cb = [...cost.cb].sort((a, b) => a - b);
    report[`${tag}-${name}`] = { eventAtTick: eventAt, sim: kind, rafCallbackMedianMs: +cb[cb.length >> 1]?.toFixed(2), rafCallbackMaxMs: +cb.at(-1)?.toFixed(2), clashModule: cost.clash && { ...cost.clash, avgMs: +(cost.clash.totalMs / cost.clash.frames).toFixed(4), totalMs: undefined }, emitted: cost.events };
    console.log(`${tag}-${name}: sim event ${kind} at tick ${eventAt}; rAF callback median ${report[`${tag}-${name}`].rafCallbackMedianMs} ms, max ${report[`${tag}-${name}`].rafCallbackMaxMs} ms${cost.clash ? `; clash module ${report[`${tag}-${name}`].clashModule.avgMs} ms/frame avg, ${cost.clash.maxMs.toFixed(3)} ms max, ${cost.clash.clashes} clash(es), emitted ${cost.events.map((e) => `${e.name}:${e.payload?.kind}/${e.payload?.pushbackM}`).join(',')}` : ''}`);
    await page.close();
  }
}
writeFileSync(`${out}/clash-report.json`, JSON.stringify(report, null, 2));
await browser.close();
