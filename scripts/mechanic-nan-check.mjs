// Nan's IMPALE AND DRAG on the BUILT game with REAL input (keys), 375 wide: the tell appears, a roll out of the frozen line counters it, and standing in it gets you hooked and dragged.
//   node scripts/mechanic-nan-check.mjs <base url> <out dir> [query]      env: DSF (device scale, default 1)
// Places the hero 9 m from Nan's ring-2 spot (the sim's fighter position, as scripts/ground-sky-stills.mjs does), walks him in with W (aggro does the rest), tops his health up so the fight lasts, and reads
// globalThis.__v3Mech (the mechanic's view) in the page. Exit 1 on a failed check; stills land in <out dir>.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, query = 'opener=off'] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/mechanic-nan-check.mjs <base url> <out dir> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
let NAN = [0, 0];   // her ring spot in the sim's frame, read off the live zone once the page is up (the ring distances are rows, so no number is copied here)
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: Number(process.env.DSF ?? 1), isMobile: true, hasTouch: true });
const pageErrors = [];
page.on('pageerror', (e) => { pageErrors.push(e.message); console.error('pageerror', e.message); });
await page.goto(`${base}/?${query}`);
await page.waitForFunction(() => globalThis.__v3Zone && document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000 });
await page.waitForTimeout(2000);
NAN = await page.evaluate(() => { const s = globalThis.__v3Zone.spawns.find((o) => /sporty-granny/.test(o.id)); return [s.x, s.z]; });
const key = (c, t) => page.evaluate(([c, t]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [c, t]);
const state = () => page.evaluate(() => { const z = globalThis.__v3Zone, f = globalThis.__v3Fight, m = globalThis.__v3Mech; return { current: z?.current, engaged: z?.engaged, hero: f && [+f.fighter.x.toFixed(2), +f.fighter.z.toFixed(2)], foe: f && [+f.enemy.x.toFixed(2), +f.enemy.z.toFixed(2)], heroHp: f?.playerHealth, stage: m?.stage ?? 'none', lock: !!m?.lock, tick: f?.duel.tick }; });
const keepAlive = () => page.evaluate(() => { const f = globalThis.__v3Fight; if (f) { const h = f.duel.fighters[0]; h.health = h.maxHealth; } });
// the sampler: every animation frame, push a row when the mechanic's stage changes (so a short stage is never missed by polling)
await page.evaluate(() => { globalThis.__rec = []; let last = ''; const tick = () => { const m = globalThis.__v3Mech, f = globalThis.__v3Fight, s = m?.stage ?? 'none'; if (s !== last) { last = s; const [h, e] = f ? [f.fighter, f.enemy] : []; globalThis.__rec.push({ stage: s, tick: f?.duel.tick, lock: !!m?.lock, gap: h && +Math.hypot(h.x - e.x, h.z - e.z).toFixed(2), hp: f?.playerHealth }); } requestAnimationFrame(tick); }; tick(); });
// LOCAL FIX (a): a per-frame record of the hook: every frame the stage is `drag` push the hero-foe gap and the hero's sim position, so the drag is judged on the drag stage's own rows, not on a stage-change row.
await page.evaluate(() => { globalThis.__drag = []; const tick = () => { const m = globalThis.__v3Mech, f = globalThis.__v3Fight; if (m?.stage === 'drag' && f) globalThis.__drag.push({ tick: f.duel.tick, gap: Math.hypot(f.fighter.x - f.enemy.x, f.fighter.z - f.enemy.z), hx: f.fighter.x, hz: f.fighter.z, fx: f.enemy.x, fz: f.enemy.z }); requestAnimationFrame(tick); }; tick(); });
// LOCAL FIX (b): the corpse is judged on the DEAD fighter's OWN ragdoll record. Every `__ragdoll*` cost record (the page's `__ragdoll`, a held body's `__ragdoll:<body>`, the hero's) is kept BY REFERENCE the frame it appears and its state changes are logged, so the zone retargeting `__ragdoll` to the next boss cannot hide it.
await page.evaluate(() => { globalThis.__rds = []; globalThis.__rdLog = []; const tick = () => { for (const k of Object.keys(globalThis)) if (k.startsWith('__ragdoll') && k !== '__ragdollHero' && !k.startsWith('__ragdollT')) { const r = globalThis[k]; if (r && typeof r === 'object' && 'state' in r) { let e = globalThis.__rds.find((x) => x.rec === r); if (!e) { e = { key: k, rec: r, last: '' }; globalThis.__rds.push(e); } if (e.last !== r.state) { e.last = r.state; globalThis.__rdLog.push({ key: k, id: globalThis.__rds.indexOf(e), state: r.state, tick: globalThis.__v3Fight?.duel.tick, corpses: r.corpses }); } } } requestAnimationFrame(tick); }; tick(); });
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
  // LOCAL FIX (a): the hero is HELD at 5 m from her on the line from the moment the line freezes until she lets the stab go (the lunge), so the drag starts from a real gap; after that nothing touches him (the drag moves him or it does not)
  await until((s) => s.stage === 'tell' && s.lock, 20000, 'the frozen line (second tell)');
  await page.evaluate(() => { globalThis.__held = setInterval(() => { const g = globalThis.__v3Fight, m = globalThis.__v3Mech; if (!g) return; if (m?.stage !== 'tell') { clearInterval(globalThis.__held); return; } const h = g.duel.fighters[0], n = g.duel.fighters[1], dx = h.body.x - n.body.x, dz = h.body.z - n.body.z, d = Math.hypot(dx, dz) || 1; for (const o of [g.fighter, h.body]) { o.x = n.body.x + (dx / d) * 5; o.z = n.body.z + (dz / d) * 5; } }, 8); });
  await until((s) => s.stage === 'lunge', 6000, 'the lunge (second)');
  await page.evaluate(() => clearInterval(globalThis.__held));
  const drag =await until((s) => s.stage === 'drag', 20000, 'the hook');
  if (drag) {
    await shot('drag'); await until((s) => s.stage !== 'drag', 4000, 'the drag to end');
    const rows = await page.evaluate(() => globalThis.__drag), first = rows[0], last = rows[rows.length - 1];
    check(rows.length >= 2, `the drag stage was reached and sampled (${rows.length} frames)`);
    if (rows.length >= 2) {
      const toward = (last.hx - first.hx) * (first.fx - first.hx) + (last.hz - first.hz) * (first.fz - first.hz);   // the hero's own move projected on the hero->Nan direction at the hook
      console.log('drag rows', JSON.stringify({ first, last }), 'moved-toward', toward.toFixed(3));
      check(last.gap < first.gap - 0.02 && toward > 0, `stood in the line: hooked and pulled in (drag gap ${first.gap.toFixed(2)} -> ${last.gap.toFixed(2)}, the hero moved toward her by ${toward.toFixed(2)} m-ish)`);
    }
  }
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
  // LOCAL FIX (b): the dead Nan's own ragdoll record is the one that left 'alive' after the kill (kept by reference above), not the retargeted __ragdoll
  const deadId = async () => page.evaluate(() => { const l = globalThis.__rdLog.filter((r) => r.state !== 'alive' && r.state !== 'loading'); return l.length ? l[0].id : -1; });
  for (let i = 0; i < 80 && (await page.evaluate(([id]) => globalThis.__rds[id]?.rec.state, [await deadId()])) !== 'frozen'; i++) await page.waitForTimeout(250);
  const id = await deadId();
  const rag = await page.evaluate((i) => globalThis.__rds[i]?.rec.state ?? 'none', id);
  console.log('ragdoll log', JSON.stringify(await page.evaluate(() => globalThis.__rdLog)), 'dead record', id, 'key', await page.evaluate((i) => globalThis.__rds[i]?.key, id), 'corpses', await page.evaluate((i) => globalThis.__rds[i]?.rec.corpses, id));
  check(rag === 'frozen', `the corpse is down and still (the dead Nan's own ragdoll record: ${rag})`);
  if (rag === 'frozen') {
    for (const part of ['armLeft', 'armRight', 'thighLeft']) { const at = await page.evaluate(([i, p]) => globalThis.__rds[i].rec.screenOf?.(p), [id, part]); if (at) { await page.touchscreen.tap(at[0], at[1]); await page.waitForTimeout(150); } }
    await page.waitForTimeout(2500);
    const cuts = await page.evaluate((i) => globalThis.__rds[i].rec.cuts ?? [], id);
    check(cuts.length > 0, `a tap cuts the corpse after the kill (${cuts.length} cut${cuts.length === 1 ? '' : 's'})`);
    await shot('after-kill-cut');
  }
}
check(pageErrors.length === 0, `zero page errors (${pageErrors.length})`);
console.log('stages', JSON.stringify((await page.evaluate(() => globalThis.__rec)).map((r) => `${r.tick}:${r.stage}`)));
await browser.close();
process.exit(fails.length ? 1 : 0);
