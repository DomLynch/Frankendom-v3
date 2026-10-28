// Nan's IMPALE AND DRAG on the BUILT game with REAL input (keys), 375 wide: the tell appears, a roll out of the frozen line counters it, and standing in it gets you hooked and dragged.
//   node scripts/mechanic-nan-check.mjs <base url> <out dir> [query]      env: DSF (device scale, default 1)
// Places the hero 9 m from Nan's ring-2 spot (the sim's fighter position, as scripts/ground-sky-stills.mjs does), walks him in with W (aggro does the rest), tops his health up so the fight lasts, and reads
// globalThis.__v3Mech (the mechanic's view) in the page. Exit 1 on a failed check; stills land in <out dir>.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { ringedZoneFor } from '../src/zone/zone-rows.ts';

const [base, out, query = 'opener=off'] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/mechanic-nan-check.mjs <base url> <out dir> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const NANP = ringedZoneFor('').spawns.find((s) => s.kind === 'sporty-granny').position, NAN = [NANP.x, NANP.z];   // her ring spot in the sim's frame, from the rows (the ring distances are rows, so no number is copied here)
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: Number(process.env.DSF ?? 1), isMobile: true, hasTouch: true });
const pageErrors = [];
page.on('pageerror', (e) => { pageErrors.push(e.message); console.error('pageerror', e.message); });
await page.goto(`${base}/?${query}`);
await page.waitForFunction(() => globalThis.__v3Zone && document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000 });
await page.waitForTimeout(2000);
const key = (c, t) => page.evaluate(([c, t]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [c, t]);
const state = () => page.evaluate(() => { const z = globalThis.__v3Zone, f = globalThis.__v3Fight, m = globalThis.__v3Mech; return { current: z?.current, engaged: z?.engaged, hero: f && [+f.fighter.x.toFixed(2), +f.fighter.z.toFixed(2)], foe: f && [+f.enemy.x.toFixed(2), +f.enemy.z.toFixed(2)], heroHp: f?.playerHealth, stage: m?.stage ?? 'none', lock: !!m?.lock, tick: f?.duel.tick }; });
const keepAlive = () => page.evaluate(() => { const f = globalThis.__v3Fight; if (f) { const h = f.duel.fighters[0]; h.health = h.maxHealth; } });
// the sampler: every animation frame, push a row when the mechanic's stage changes (so a short stage is never missed by polling)
await page.evaluate(() => { globalThis.__rec = []; let last = ''; const tick = () => { const m = globalThis.__v3Mech, f = globalThis.__v3Fight, s = m?.stage ?? 'none'; if (s !== last) { last = s; const [h, e] = f ? [f.fighter, f.enemy] : []; globalThis.__rec.push({ stage: s, tick: f?.duel.tick, lock: !!m?.lock, gap: h && +Math.hypot(h.x - e.x, h.z - e.z).toFixed(2), hp: f?.playerHealth }); } requestAnimationFrame(tick); }; tick(); });
// 1. down at 9 m south of Nan, then walk in with the real W key until the boss aggros
await page.evaluate(([x, z]) => { const f = globalThis.__v3Fight; globalThis.__pin = setInterval(() => { const g = globalThis.__v3Fight; for (const o of [g.fighter, g.duel.fighters[0].body]) { o.x = x; o.z = z; } }, 16); void f; }, [NAN[0], NAN[1] + 9]);
await page.waitForTimeout(3000);
await page.evaluate(() => clearInterval(globalThis.__pin));
await page.waitForTimeout(6000);   // the far body streams in
console.log('placed', JSON.stringify(await state()));
const fails = [];
const check = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) fails.push(what); };
for (let i = 0; i < 400; i++) {
  const s = await state(); if (s.engaged) break;
  const dz = s.foe[1] - s.hero[1], dx = s.foe[0] - s.hero[0];
  await key('KeyW', Math.hypot(dx, dz) > 2.2 ? 'keydown' : 'keyup'); await page.waitForTimeout(120);
}
await key('KeyW', 'keyup');
check((await state()).engaged, 'the boss aggroed on a hero who walked in');
const shot = (name) => page.screenshot({ path: `${out}/nan-${name}.png` });
const until = async (pred, ms, label) => { const t0 = Date.now(); for (;;) { await keepAlive(); const s = await state(); if (pred(s)) return s; if (Date.now() - t0 > ms) { check(false, `timed out waiting for ${label}`); return null; } await page.waitForTimeout(40); } };

// 2. the tell appears (the line follows, then freezes); a REAL roll sideways out of the frozen line counters it
const tell = await until((s) => s.stage === 'tell', 120000, 'the tell');
if (tell) { check(true, 'the tell appeared'); await page.waitForTimeout(250); await shot('tell-follow'); }
const locked = await until((s) => s.stage === 'tell' && s.lock, 20000, 'the frozen line');
if (locked) {
  await shot('tell-locked');
  await key('KeyD', 'keydown'); await key('KeyE', 'keydown'); await page.waitForTimeout(60); await key('KeyE', 'keyup');
  const lunge = await until((s) => s.stage === 'lunge', 6000, 'the lunge');
  if (lunge) await shot('lunge');
  await page.waitForTimeout(600); await key('KeyD', 'keyup');
  const after = await until((s) => s.stage === 'idle' || s.stage === 'none', 8000, 'the move to end');
  const seq = (await page.evaluate(() => globalThis.__rec)).map((r) => r.stage);
  check(!seq.slice(seq.indexOf('tell')).includes('drag'), `rolled out of the line: no hook (${seq.join('>')})`);
  void after;
}
// 3. stand in the line: the stab lands, the hook drags him in
await page.evaluate(() => { globalThis.__rec.length = 0; });
const tell2 = await until((s) => s.stage === 'tell', 120000, 'the second tell');
if (tell2) {
  const drag = await until((s) => s.stage === 'drag', 20000, 'the hook');
  if (drag) { await shot('drag'); const rec = await page.evaluate(() => globalThis.__rec); const lungeRow = rec.find((r) => r.stage === 'lunge'), dragRow = rec.find((r) => r.stage === 'drag'); check(!!dragRow && dragRow.gap < (lungeRow?.gap ?? 99), `stood in the line: hooked and pulled in (gap ${lungeRow?.gap} -> ${dragRow?.gap})`); }
}
// 4. the kill ends the move and the corpse is cut as any other: a real kick (KeyC, with W to close in) lands with her health at 1 while the move is up (the tell), then the stage goes idle, the finish is set, and a tap on a limb cuts it
await page.evaluate(() => { globalThis.__rec.length = 0; });
const tell3 = await until((s) => s.stage === 'tell', 120000, 'a third tell to kill her in');
if (tell3) {
  const killed = await page.evaluate(() => new Promise((done) => {
    const fire = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    fire('KeyW', 'keydown'); let n = 0;
    const id = setInterval(() => {
      const f = globalThis.__v3Fight, [h, foe] = f.duel.fighters; h.health = h.maxHealth; foe.health = Math.min(foe.health, 1);
      fire('KeyC', 'keydown'); fire('KeyC', 'keyup');
      if (f.finish || ++n > 160) { clearInterval(id); fire('KeyW', 'keyup'); done(!!f.finish); }
    }, 250);
  }));
  check(killed, 'a real kick killed her while the move was up');
  await page.waitForTimeout(1500);
  const end = await state();
  check(end.stage === 'idle' || end.stage === 'none', `the move ended with her (stage ${end.stage})`);
  const seq4 = (await page.evaluate(() => globalThis.__rec)).map((r) => r.stage);
  check(!seq4.slice(-1).includes('lunge') && !seq4.slice(-1).includes('drag'), `no lunge or hook left running after the kill (${seq4.join('>')})`);
  for (let i = 0; i < 60 && (await page.evaluate(() => globalThis.__ragdoll?.state)) !== 'frozen'; i++) await page.waitForTimeout(250);
  const rag = await page.evaluate(() => globalThis.__ragdoll?.state ?? 'none');
  check(rag === 'frozen', `the corpse is down and still (ragdoll ${rag})`);
  if (rag === 'frozen') {
    for (const part of ['armLeft', 'armRight', 'thighLeft']) { const at = await page.evaluate((p) => globalThis.__ragdoll.screenOf?.(p), part); if (at) { await page.touchscreen.tap(at[0], at[1]); await page.waitForTimeout(150); } }
    await page.waitForTimeout(2500);
    const cuts = await page.evaluate(() => globalThis.__ragdoll.cuts ?? []);
    check(cuts.length > 0, `a tap cuts the corpse after the kill (${cuts.length} cut${cuts.length === 1 ? '' : 's'})`);
    await shot('after-kill-cut');
  }
}
check(pageErrors.length === 0, `zero page errors (${pageErrors.length})`);
console.log('stages', JSON.stringify((await page.evaluate(() => globalThis.__rec)).map((r) => `${r.tick}:${r.stage}`)));
await browser.close();
process.exit(fails.length ? 1 : 0);
