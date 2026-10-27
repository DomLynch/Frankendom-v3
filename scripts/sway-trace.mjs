// Sway trace (light hits flinch, heavy hits keep the full reaction): the opponent takes scripted blows of each class on the paused fake clock (one rAF = one 60 Hz tick) and the script logs,
// per tick, where his head and chest bones are on screen (the ragdoll's own cost.screenOf, CSS px at 375 wide) against a CONTROL run with no blows (same ticks, same clip). Screen x is his
// side-to-side (the fight camera looks along the duel). From that: peak lateral and peak total displacement (px), the number of side-to-side swings (sign changes of the lateral deviation
// above SWING_PX) and the settle time (s after the blow until the deviation stays under SETTLE_PX). Blows are sim-shaped Hit events added after the sim's step, as scripts/hitreact-clip.mjs does,
// so the sim never sees them. Playwright is not a repo dependency, install it beside the script.
//   SHOTS=1 node scripts/sway-trace.mjs <base url> <out dir> [query]     (SHOTS: 375 stills at +0,+4,+8,+14,+22,+34 ticks for the front torso blows)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [base, out, query = ''] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const TICK = 1000 / 60, GAP = 200, SWING_PX = 3, SETTLE_PX = 6;
const CASES = [
  { name: 'light-torso-front', location: 'torso', rel: Math.PI, extra: { move: 'light_left' } },
  { name: 'light-torso-side', location: 'torso', rel: Math.PI / 2, extra: { move: 'light_left' } },
  { name: 'light-head-front', location: 'head', rel: Math.PI, extra: { move: 'light_left' } },
  { name: 'heavy-torso-front', location: 'torso', rel: Math.PI, extra: { move: 'heavy_overhead', charged: true } },
  { name: 'heavy-torso-side', location: 'torso', rel: Math.PI / 2, extra: { move: 'heavy_overhead', charged: true } },
  { name: 'counter-torso-front', location: 'torso', rel: Math.PI, extra: { move: 'light_left', counter: true } },
];
// CASES=a,b limits the run to those cases; DSF=2 takes the stills at 2x; on a Mac it uses Metal (CHROME=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome), elsewhere SwiftShader
if (process.env.CASES) CASES.splice(0, CASES.length, ...CASES.filter((c) => process.env.CASES.split(',').includes(c.name)));
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const PATCH = /(\w+)\.push\(\.\.\.(\w+)\.events\)/;

async function run(blows) {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: Number(process.env.DSF ?? 1), isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
  await page.addInitScript(() => {
    globalThis.__hitInject = (p) => {
      const b = globalThis.__hitQueue?.shift();
      if (!b) return [];
      return [{ tick: p.duel.tick, type: 'Hit', actor: 0, target: 1, damage: 0, location: b.location, heading: p.enemy.heading + b.rel, ...b.extra }];
    };
  });
  await page.route('**/client/main.js', async (route) => {
    const res = await route.fetch(), body = await res.text();
    if (!PATCH.test(body)) { console.error('sway-trace: no frameEvents.push(...practice.events) to patch'); process.exit(3); }
    const headers = Object.fromEntries(Object.entries(res.headers()).filter(([k]) => !['content-encoding', 'content-length'].includes(k)));
    await route.fulfill({ status: 200, headers, contentType: 'text/javascript', body: body.replace(PATCH, (_m, a, p) => `${a}.push(...${p}.events,...(globalThis.__hitInject?globalThis.__hitInject(${p}):[]))`) });
  });
  if (process.env.LIGHT) await page.route(/vendor\/feel\.[^/]*\.js$/, async (route) => {   // a probe: LIGHT='impulse:.1,twist:.1,...' replaces the built light class row (rows are bundled into the feel chunk)
    const res = await route.fetch(), body = await res.text();
    const next = body.replace(/light:\{[^}]*\}/, `light:{${process.env.LIGHT}}`);
    if (next === body && !/light:\{/.test(body)) console.error('sway-trace: LIGHT probe found no light row');
    const headers = Object.fromEntries(Object.entries(res.headers()).filter(([k]) => !['content-encoding', 'content-length'].includes(k)));
    await route.fulfill({ status: 200, headers, contentType: 'text/javascript', body: next });
  });
  await page.clock.install();
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000, polling: 'raf' });
  for (let tries = 0; ; tries++) { try { await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 20 + 250 * tries); break; } catch (e) { if (tries >= 6) throw e; } }
  const step = (n) => page.clock.runFor(Math.round(n * TICK));
  await step(120);
  await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 120000 });
  for (let i = 0; i < 240 && /sheathed|draw/.test(await page.evaluate(() => globalThis.__v3Fight.duel.fighters[0].phase)); i++) await step(1);
  await step(30);
  const samples = [];
  const sample = () => page.evaluate(() => {
    const r = globalThis.__ragdoll, o = { rd: r?.state };
    for (const [k, part] of [['head', 'head'], ['chest', 'spine2']]) o[k] = r?.screenOf?.(part) ?? null;
    return o;
  });
  const total = process.env.SEQ ? SEQ_TOTAL : 40 + CASES.length * GAP;
  for (let n = 0; n <= total; n++) {
    for (const b of blows) if (b.at === n) await page.evaluate((x) => { (globalThis.__hitQueue ??= []).push(x); }, { location: b.location, rel: b.rel, extra: b.extra });
    await page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.max(f.health, Math.ceil(f.maxHealth / 2)); });
    samples.push(await sample());
    if (process.env.SHOTS) for (const b of blows) if (b.shots?.includes(n - b.at - 1)) await page.screenshot({ path: `${out}/shot-${b.name}-${String(n - b.at - 1).padStart(2, '0')}.png` });
    await step(1);
  }
  if (blows.length) console.log(`  hitreact plans seen: ${await page.evaluate(() => JSON.stringify((globalThis.__hitreactLog ?? []).map((l) => l.cls)))}`);   // the module must have planned every blow (it loads a moment after the page)
  await page.close();
  return samples;
}

// SEQ=1: a fight-like sequence instead of isolated blows: 5 lights (torso front and side mixed) 0.7 s apart, then 3 heavies 0.7 s apart after a long settle. Per sequence: the peak lateral
// deviation over the whole sequence (px), the side-to-side swings over it, and the seconds after the last blow until the foe is back within SETTLE_PX of where he stood before the first.
const SEQ_GAP = 42, SEQ_START = 40, SEQ_REST = 300;
const SEQS = {
  'light-sequence': [['torso', Math.PI], ['torso', Math.PI / 2], ['torso', Math.PI], ['torso', -Math.PI / 2], ['head', Math.PI]].map(([location, rel], i) => ({ location, rel, extra: { move: 'light_left' }, at: SEQ_START + i * SEQ_GAP })),
  'heavy-sequence': [['torso', Math.PI], ['torso', Math.PI / 2], ['torso', Math.PI]].map(([location, rel], i) => ({ location, rel, extra: { move: 'heavy_overhead', charged: true }, at: SEQ_START + 5 * SEQ_GAP + SEQ_REST + i * SEQ_GAP })),
};
const SEQ_TOTAL = SEQ_START + 8 * SEQ_GAP + 2 * SEQ_REST + 150;
if (process.env.SEQ) {
  const flat = Object.values(SEQS).flat().map((b, i) => ({ ...b, name: `seq${i}`, shots: [] }));
  const ctl = await run([]), REP = Number(process.env.REPEATS ?? 1), res = [];
  for (let r = 0; r < REP; r++) {
    const live = await run(flat), one = {};
    for (const [name, list] of Object.entries(SEQS)) {
      const first = list[0].at, last = list.at(-1).at;
      for (const bone of ['head']) {
        const a0 = live[first - 1][bone], c0 = ctl[first - 1][bone], d0 = [a0[0] - c0[0], a0[1] - c0[1]], dev = [];
        for (let n = first; n < last + 150; n++) { const a = live[n][bone], c = ctl[n][bone]; dev.push({ lat: a[0] - c[0] - d0[0], tot: Math.hypot(a[0] - c[0] - d0[0], a[1] - c[1] - d0[1]) }); }
        let swings = 0, prev = 0; for (const d of dev) { if (Math.abs(d.lat) < SWING_PX) continue; const s = Math.sign(d.lat); if (prev && s !== prev) swings++; prev = s; }
        let settle = 0; dev.forEach((d, i) => { if (d.tot > SETTLE_PX) settle = i + 1; });
        one[name] = { peakLatPx: Math.max(...dev.map((d) => Math.abs(d.lat))), swings, settleAfterLastS: Math.max(0, (settle - (last - first)) / 60) };
      }
    }
    res.push(one);
  }
  const stat = (xs) => { const m = xs.reduce((a, x) => a + x, 0) / xs.length, sd = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length); return `${m.toFixed(1)}+-${sd.toFixed(1)}`; };
  console.log(`SEQ query "${query}" repeats ${REP}`);
  for (const name of Object.keys(SEQS)) console.log(`${name.padEnd(15)} head peakLat ${stat(res.map((r) => r[name].peakLatPx))} px  swings ${stat(res.map((r) => r[name].swings))}  settle after last ${stat(res.map((r) => r[name].settleAfterLastS))} s`);
  writeFileSync(`${out}/seq-${(query || 'default').replace(/[^a-z0-9]+/gi, '-')}.json`, JSON.stringify(res, null, 2));
  await browser.close();
  process.exit(0);
}
const blows = CASES.map((c, i) => ({ ...c, at: 40 + i * GAP, shots: c.name.endsWith('torso-front') ? [0, 4, 8, 14, 22, 34] : [] }));
const control = await run([]);
const REPEATS = Number(process.env.REPEATS ?? 1), runs = [];   // REPEATS=3: three live runs against the one control; the table is mean (+- sd) of the runs
for (let r = 0; r < REPEATS; r++) runs.push(await run(blows));
const analyze = (live) => {
const result = {};
for (const b of blows) {
  const row = {};
  for (const bone of ['head', 'chest']) {
    const dev = [];   // px from the control, per tick after the blow, minus where the live run already was against the control the tick before (the earlier blows' drift is not this blow's sway)
    const a0 = live[b.at - 1]?.[bone], c0 = control[b.at - 1]?.[bone], d0 = a0 && c0 ? [a0[0] - c0[0], a0[1] - c0[1]] : [0, 0];
    for (let n = b.at; n < b.at + GAP - 1; n++) {
      const a = live[n]?.[bone], c = control[n]?.[bone]; if (!a || !c) break;
      dev.push({ lat: a[0] - c[0] - d0[0], tot: Math.hypot(a[0] - c[0] - d0[0], a[1] - c[1] - d0[1]) });
    }
    const peakLat = Math.max(0, ...dev.map((d) => Math.abs(d.lat))), peakTot = Math.max(0, ...dev.map((d) => d.tot));
    let swings = 0, last = 0;
    for (const d of dev) { if (Math.abs(d.lat) < SWING_PX) continue; const s = Math.sign(d.lat); if (last && s !== last) swings++; last = s; }
    let settle = 0; dev.forEach((d, i) => { if (d.tot > SETTLE_PX) settle = i + 1; });
    row[bone] = { peakLatPx: +peakLat.toFixed(1), peakTotalPx: +peakTot.toFixed(1), swings, settleS: +(settle / 60).toFixed(2) };
  }
  row.rdStates = [...new Set(live.slice(b.at, b.at + GAP).map((s) => s.rd))];
  result[b.name] = row;
}
return result;
};
const all = runs.map(analyze), stat = (xs) => { const m = xs.reduce((a, x) => a + x, 0) / xs.length, sd = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length); return `${m.toFixed(1)}+-${sd.toFixed(1)}`; };
writeFileSync(`${out}/sway-${(query || 'default').replace(/[^a-z0-9]+/gi, '-')}.json`, JSON.stringify(all, null, 2));
console.log(`query "${query}" repeats ${REPEATS}`);
for (const name of Object.keys(all[0])) for (const bone of ['head', 'chest']) {
  const pick = (k) => all.map((r) => r[name][bone][k]);
  console.log(`${name.padEnd(20)} ${bone.padEnd(5)} peakLat ${stat(pick('peakLatPx'))} px  swings ${stat(pick('swings'))}  settle ${stat(pick('settleS'))} s  ${all[0][name].rdStates.join('/')}`);
}
await browser.close();
