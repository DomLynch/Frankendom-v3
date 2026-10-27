// Sway trace (PR "light hits flinch, heavy hits keep the full reaction"): the opponent takes scripted blows of each class on the paused fake clock (one rAF = one 60 Hz tick) and the script
// logs, per tick, how far his head and chest bones are from where they are in a CONTROL run with no blows (same ticks, same clip), along his own side-to-side axis.
// From that: peak lateral and peak total displacement (cm), the number of side-to-side swings (sign changes of the lateral deviation above SWING_CM), and the settle time (s after the blow
// until the deviation stays under SETTLE_CM). Blows are sim-shaped Hit events added after the sim's step (as scripts/hitreact-clip.mjs does), so the sim never sees them.
//   node scripts/sway-trace.mjs <base url> <out dir> [query]      env: SHOTS=1 (375 stills at +0,+4,+8,+14,+22,+34 ticks for the light torso and heavy torso blows), CHROME
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [base, out, query = ''] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const TICK = 1000 / 60, GAP = 200, SWING_CM = 1, SETTLE_CM = 2;
// at = first tick of each blow; extra = what the sim's Hit carries for its class
const CASES = [
  { name: 'light-torso-front', location: 'torso', rel: Math.PI, extra: { move: 'light_cut' } },
  { name: 'light-torso-side', location: 'torso', rel: Math.PI / 2, extra: { move: 'light_cut' } },
  { name: 'light-head-front', location: 'head', rel: Math.PI, extra: { move: 'light_cut' } },
  { name: 'heavy-torso-front', location: 'torso', rel: Math.PI, extra: { move: 'heavy_overhead', charged: true } },
  { name: 'heavy-torso-side', location: 'torso', rel: Math.PI / 2, extra: { move: 'heavy_overhead', charged: true } },
  { name: 'counter-torso-front', location: 'torso', rel: Math.PI, extra: { move: 'light_cut', counter: true } },
];
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const PATCH = /(\w+)\.push\(\.\.\.(\w+)\.events\)/;

async function run(blows) {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
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
    const p = globalThis.__v3Fight, f = p.duel.fighters[1], h = p.enemy.heading;
    const find = (re) => { let o; globalThis.__v3Scene.traverse((n) => { if (!o && n.isBone && re.test(n.name)) o = n; }); return o; };
    globalThis.__swayBones ??= { head: find(/head$/i), chest: find(/spine2$/i), hips: find(/hips$/i) };
    const rx = Math.cos(h), rz = -Math.sin(h), out = { rd: globalThis.__ragdoll?.state, health: f.health };
    for (const [k, b] of Object.entries(globalThis.__swayBones)) if (b) { const v = b.getWorldPosition(new b.position.constructor()); out[k] = [v.x, v.y, v.z]; out[`${k}Lat`] = v.x * rx + v.z * rz; }
    return out;
  });
  const total = blows.length ? blows.at(-1).at + GAP : 120;
  for (let n = 0; n <= total; n++) {
    for (const b of blows) if (b.at === n) await page.evaluate((x) => { (globalThis.__hitQueue ??= []).push(x); }, { location: b.location, rel: b.rel, extra: b.extra });
    await page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.max(f.health, Math.ceil(f.maxHealth / 2)); });
    samples.push(await sample());
    if (process.env.SHOTS) for (const b of blows) if (b.shots && b.shots.includes(n - b.at - 1)) await page.screenshot({ path: `${out}/shot-${b.name}-${String(n - b.at - 1).padStart(2, '0')}.png`, clip: { x: 0, y: 150, width: 375, height: 520 } });
    await step(1);
  }
  await page.close();
  return samples;
}

const blows = CASES.map((c, i) => ({ ...c, at: 40 + i * GAP, shots: c.name.endsWith('torso-front') ? [0, 4, 8, 14, 22, 34] : [] }));
const control = await run([]);
const live = await run(blows);
const result = {};
for (const b of blows) {
  const row = {};
  for (const bone of ['head', 'chest']) {
    const dev = [];   // metres from the control, per tick after the blow
    for (let n = b.at; n < b.at + GAP - 1; n++) {
      const a = live[n]?.[bone], c = control[n]?.[bone]; if (!a || !c) break;
      const lat = live[n][`${bone}Lat`] - control[n][`${bone}Lat`];
      dev.push({ lat, tot: Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]) });
    }
    const peakLat = Math.max(...dev.map((d) => Math.abs(d.lat))) * 100, peakTot = Math.max(...dev.map((d) => d.tot)) * 100;
    let swings = 0, last = 0;
    for (const d of dev) { if (Math.abs(d.lat) * 100 < SWING_CM) continue; const s = Math.sign(d.lat); if (last && s !== last) swings++; last = s; }
    let settle = 0; dev.forEach((d, i) => { if (d.tot * 100 > SETTLE_CM) settle = i + 1; });
    row[bone] = { peakLatCm: +peakLat.toFixed(1), peakTotalCm: +peakTot.toFixed(1), swings, settleS: +(settle / 60).toFixed(2) };
  }
  row.rdStates = [...new Set(live.slice(b.at, b.at + GAP).map((s) => s.rd))];
  result[b.name] = row;
}
writeFileSync(`${out}/sway-${(query || 'default').replace(/[^a-z0-9]+/gi, '-')}.json`, JSON.stringify(result, null, 2));
console.log(`query "${query}"`);
for (const [k, v] of Object.entries(result)) console.log(k.padEnd(20), 'head', JSON.stringify(v.head), 'chest', JSON.stringify(v.chest), v.rdStates.join('/'));
await browser.close();
