// The ?rules=m4 evidence harness (PR "M4 tuning"; playwright is not a repo dependency, install it beside the script): a headless ?rules=m4 (or default) fight at 375 wide on the paused fake clock, one rAF = one 60 Hz tick.
// Plays a mix of strikes (light, directional, heavy, thrust), keeps both fighters alive, lists every hit the evaluator saw (speed, outcome), then kills with a kick,
// moves the corpse aside (ASIDE metres, as scripts/cut-stills.mjs on #71) and shoots stills.
//   node m4-fight.mjs <base> <out> <query> [attacks]     env: ASIDE (m, default 3), AFTER (ticks after the freeze, default 0,10,40,120), GAP (ticks between attacks), MIXJSON (the key combos)
// The table's `anim_m_s` is the hero's measured hand speed, `used_m_s` what the evaluator took (light-equivalent, clamped); `outcome` kill = a deferred kill (shown as a knockdown).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const [base, out, query = '', ATT = '34'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const TICK = 1000 / 60, ASIDE = Number(process.env.ASIDE ?? 3), AFTER = (process.env.AFTER ?? '0,10,40,120').split(',').map(Number), GAP = Number(process.env.GAP ?? 75);
const tag = query ? query.replace(/[^a-z0-9]+/gi, '-') : 'default';
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') console.error(`console ${m.text()}`); });
await page.clock.install();
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000, polling: 'raf' });
await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 20);
const run = (t) => page.clock.runFor(Math.round(t * TICK));
await run(120);
if (!query.includes('physics=v1')) await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 90000 });
const read = () => page.evaluate(() => { const p = globalThis.__v3Fight, [h, f] = p.duel.fighters; return { hero: h.phase, foeHealth: f.health, weapon: h.weapon, foeDead: p.finish?.victim === 1 }; });
for (let i = 0; i < 240 && /sheathed|draw/.test((await read()).hero); i++) await run(1);
await run(30);
console.log(`hero weapon ${(await read()).weapon}`);
const press = async (...codes) => { for (const c of codes) await page.keyboard.down(c); await page.keyboard.up(codes.at(-1)); for (const c of codes.slice(0, -1).reverse()) await page.keyboard.up(c); };
const MIX = process.env.MIXJSON ? JSON.parse(process.env.MIXJSON) : [['KeyF'], ['KeyD', 'KeyF'], ['KeyG'], ['KeyA', 'KeyF'], ['KeyT'], ['KeyG', 'KeyD'].reverse(), ['KeyF'], ['KeyS', 'KeyF']];
await page.keyboard.down('KeyW');
const keep = () => page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; h.stamina = h.maxStamina; f.health = Math.max(f.health, Math.ceil(f.maxHealth / 2)); });
let a = 0;
for (let n = 0; a < Number(ATT) && n < 8000; n++) {
  if (n % GAP === 0) { const m = MIX[a % MIX.length]; if (m.length === 2 && m[0] === 'KeyG') { await page.keyboard.down('KeyG'); await page.keyboard.down(m[1]); await page.keyboard.up(m[1]); await page.keyboard.up('KeyG'); } else await press(...m); a++; }
  await run(1); await keep();
}
if (process.env.KILLSTOP) await page.keyboard.up('KeyW');   // KILLSTOP=1: stop walking so the finishing G is the overhead heavy, not a directional one
for (let n = 0; n < Number(process.env.SETTLE ?? 60); n++) { await run(1); await keep(); }   // SETTLE ticks with no new attack (the last one lands or ends before the finishing blow)
const rules = await page.evaluate(() => globalThis.__v3Rules ?? null);
// kill: the foe at 1 health and one more blow. KILL (default KeyC, a kick: a plain death) = the keys of the finishing blow, e.g. KILL=KeyG for a heavy overhead (the killing blow's evaluator cut then stands and comes off the corpse); KILLGAP ticks between tries (default 30)
const KILL = (process.env.KILL ?? 'KeyC').split(','), KILLGAP = Number(process.env.KILLGAP ?? 30);
await page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; f.health = 1; });
let killed = -1;
for (let n = 0; n < 900 && killed < 0; n++) { if (n % KILLGAP === 0) { for (const c of KILL) await page.keyboard.down(c); for (const c of KILL.slice().reverse()) await page.keyboard.up(c); } await run(1); await page.evaluate(() => { const [h] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; }); if ((await read()).foeDead) killed = n; }
await page.keyboard.up('KeyW');
const rd = () => page.evaluate(() => globalThis.__ragdoll ? { ...globalThis.__ragdoll, screenOf: undefined } : null);
for (let k = 0; k < 900 && query.includes('rules') && (await rd())?.state !== 'frozen'; k += 10) await run(10);
if (ASIDE) { await page.evaluate((m) => { const [h, f] = globalThis.__v3Fight.duel.fighters, dx = f.body.x - h.body.x, dz = f.body.z - h.body.z, n = Math.hypot(dx, dz) || 1; f.body = { ...f.body, x: f.body.x - (dz / n) * m, z: f.body.z + (dx / n) * m }; }, ASIDE); await run(20); }
await run(30);
let k = 0; for (const t of AFTER) { await run(t - k); k = t; await page.screenshot({ path: `${out}/${tag}-corpse-${t}.png` }); }
const end = await rd(), rulesEnd = await page.evaluate(() => globalThis.__v3Rules ?? null);
const rows = (rulesEnd?.last ?? []).map((e, i) => ({ i, tick: e.input.t, weapon: e.input.weapon, kind: e.input.kind, swing: e.input.swing, zone: e.input.zone, counter: e.input.counterHit, anim_m_s: e.measured && +e.measured.toFixed(2), used_m_s: +e.input.handSpeed.toFixed(2), source: e.source, outcome: e.result.outcome, strength: +e.result.strength.toFixed(1), part: e.result.part, cut: e.presentation.cut }));
writeFileSync(`${out}/${tag}-report.json`, JSON.stringify({ query, attacks: a, killed, rules: rulesEnd && { hits: rulesEnd.hits, skipped: rulesEnd.skipped, byOutcome: rulesEnd.byOutcome, deferredKills: rulesEnd.deferredKills, cuts: rulesEnd.cuts, cost: rulesEnd.cost }, rows, ragdoll: end && { state: end.state, cuts: end.cuts, cost: end.cost }, finish: await page.evaluate(() => { const f = globalThis.__v3Fight?.finish; return f ? JSON.parse(JSON.stringify(f)) : null; }) }, null, 2));
console.log(`${tag}: attacks ${a}, kill after ${killed} ticks, ragdoll ${end?.state}, cuts ${JSON.stringify(end?.cuts ?? [])}`);
if (rulesEnd) { console.log(`rules: hits ${rulesEnd.hits}, skipped ${rulesEnd.skipped}, byOutcome ${JSON.stringify(rulesEnd.byOutcome)}, evaluator cuts ${JSON.stringify(rulesEnd.cuts)}`); console.table(rows); }
await browser.close();
