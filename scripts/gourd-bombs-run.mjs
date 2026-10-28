// Lord Gourd's PUMPKIN BOMBS on the BUILT dist at 375, REAL keyboard input (data/mechanics.json "gourd"). One Chromium run:
//   A. the hero stands in range with no key held: a bomb must land on him (the page's own mechanic counts the bursts that hit)
//   B. the hero walks out of a ring after the lob (KeyD held): no hit from that cast
//   C. the hero rolls (KeyE) in the burst's last half second: the burst is dodged
//   D. 375 stills: the stomp, the rings on the ground, the burst
// The hero is teleported to Lord Gourd's spot (the page's own aggro takes it from there) and topped up between phases; every figure is read from the page (window.__v3Mechanics, window.__v3Zone, window.__v3Fight).
//   node scripts/gourd-bombs-run.mjs <base url> <out dir> <tag>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, tag] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/gourd-bombs-run.mjs <base url> <out dir> <tag>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: Number(process.env.DSF ?? 1), isMobile: true, hasTouch: true });
page.on('pageerror', (e) => { console.error(`pageerror ${e.message}`); process.exitCode = 1; });
page.on('console', (m) => { if (m.type() === 'error') console.error(`console ${m.text()}`); });
const shot = (n) => page.screenshot({ path: `${out}/${tag}-${n}.png` });
const fail = (why) => { console.error(`FAIL ${why}`); process.exitCode = 1; };

await page.goto(`${base}/?opener=off`);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 240000 });
await page.waitForTimeout(3000);
const has = await page.evaluate(() => !!globalThis.__v3Mechanics?.of('pumpkinhulk'));
console.log(`${tag} mechanic present: ${has}`);
if (!has) { await browser.close(); process.exit(0); }   // a build without the feature: the "before" run has nothing to measure

// count what the mechanic does, from the page: wrap the core's tick once
await page.evaluate(() => {
  const core = globalThis.__v3Mechanics.of('pumpkinhulk').core, was = core.tick.bind(core);
  globalThis.__gb = { hit: 0, dodged: 0, damage: 0, lobs: 0, stomps: 0, maxLive: 0, shoved: 0, wasStomp: false };
  core.tick = (dt, c) => {
    const o = was(dt, c), g = globalThis.__gb;
    g.ticks = (g.ticks ?? 0) + 1; g.activeTicks = (g.activeTicks ?? 0) + (c.active ? 1 : 0); g.dtSum = (g.dtSum ?? 0) + dt; g.inRange = (g.inRange ?? 0) + (Math.hypot(c.heroX - c.bossX, c.heroZ - c.bossZ) <= core.row.engageMetres ? 1 : 0);
    g.hit += o.hit; g.dodged += o.dodged; g.damage += o.damage; g.shoved += Math.hypot(o.shoveX, o.shoveZ);
    const now = core.view.stomp >= 0; if (now && !g.wasStomp) g.stomps++; g.wasStomp = now;
    let live = 0; for (let i = 0; i < core.view.n; i++) if (core.view.state[i]) live++; g.maxLive = Math.max(g.maxLive, live);
    return o;
  };
});
const reset = () => page.evaluate(() => { globalThis.__gb.hit = globalThis.__gb.dodged = globalThis.__gb.damage = globalThis.__gb.shoved = 0; });
const snap = () => page.evaluate(() => ({ ...globalThis.__gb, heroHp: globalThis.__v3Fight.playerHealth, engaged: globalThis.__v3Zone.engaged }));
const topUp = () => page.evaluate(() => { const f = globalThis.__v3Fight.duel.fighters; f[0].health = f[0].maxHealth; f[1].health = f[1].maxHealth; });
const view = () => page.evaluate(() => { const v = globalThis.__v3Mechanics.of('pumpkinhulk').core.view; return { stomp: v.stomp, state: [...v.state], age: [...v.age].map((a) => +a.toFixed(2)), x: [...v.x].map((a) => +a.toFixed(2)), z: [...v.z].map((a) => +a.toFixed(2)) }; });
const heroAt = () => page.evaluate(() => { const f = globalThis.__v3Fight.duel.fighters[0].body; return { x: +f.x.toFixed(2), z: +f.z.toFixed(2) }; });

// teleport: onto Lord Gourd's aggro (the zone debug lists every spawn in the pit frame)
const spot = await page.evaluate(() => { const s = globalThis.__v3Zone.spawns.find((q) => q.id.includes('pumpkinhulk')); return s ? { x: s.x, z: s.z } : null; });
if (!spot) { fail('no pumpkinhulk spawn in __v3Zone'); await browser.close(); process.exit(1); }
console.log(`${tag} spot`, JSON.stringify(spot));
await page.evaluate((s) => { const b = globalThis.__v3Fight.duel.fighters[0].body; b.x = s.x; b.z = s.z + 1; }, spot);
await page.waitForTimeout(2000);
await page.keyboard.down('KeyW');   // the hand-over stands him at the pose distance, just outside its aggro: one real step in engages
for (let i = 0; i < 20; i++) { await page.waitForTimeout(150); if (await page.evaluate(() => globalThis.__v3Zone.engaged)) break; }
await page.keyboard.up('KeyW');
console.log(`${tag} after teleport`, JSON.stringify({ hero: await heroAt(), zone: await page.evaluate(() => { const z = globalThis.__v3Zone; return { current: z.current, id: z.spawns[z.current]?.id, engaged: z.engaged, spawn: z.spawns[z.current], live: z.live }; }) }));
await page.waitForFunction(() => globalThis.__v3Zone.engaged && globalThis.__v3Zone.spawns[globalThis.__v3Zone.current]?.id.includes('pumpkinhulk'), null, { timeout: 120000 }).catch(async (e) => { console.log(`${tag} not engaged`, JSON.stringify({ hero: await heroAt(), zone: await page.evaluate(() => { const z = globalThis.__v3Zone; return { current: z.current, id: z.spawns[z.current]?.id, engaged: z.engaged }; }) })); throw e; });
console.log(`${tag} engaged`, JSON.stringify(await snap()));

// a software-GL box runs the sim far slower than real time (frames are capped at frameDtMaxS), so every wait below is in SIM seconds (the mechanic's own tick counter), never wall seconds
await page.evaluate(() => { setInterval(() => { const f = globalThis.__v3Fight?.duel.fighters; if (f) { f[0].health = f[0].maxHealth; f[1].health = f[1].maxHealth; } }, 250); });   // the boss's own blows never end the run
const simWait = (s) => page.evaluate((s) => new Promise((res) => { const t0 = globalThis.__gb.dtSum, id = setInterval(() => { if (globalThis.__gb.dtSum >= t0 + s) { clearInterval(id); res(true); } }, 16); }), s);
// A. stand still, no key: wait for a burst on him
await reset();
await page.waitForFunction(() => globalThis.__gb.hit >= 1, null, { timeout: 420000, polling: 100 });
const A = await snap(); console.log(`${tag} A stand`, JSON.stringify(A));
if (!(A.hit >= 1 && A.damage > 0 && A.shoved > 0)) fail('A: no bomb landed on a hero who stood still');
if (!(A.heroHp >= 1)) fail('A: a bomb ended the fight');

// One cast, played with `act` once its gourds are in the air; resolves with what that cast did to the hero. (The extra gourds land a scatter away in a direction that turns every cast, so which way is out differs per cast:
// the counter is read from the rings, and the trials below try more than one way.)
const flying = () => page.waitForFunction(() => globalThis.__v3Mechanics.of('pumpkinhulk').core.view.state.some((s) => s === 1), null, { timeout: 420000, polling: 8 });
const settled = () => page.waitForFunction(() => { const v = globalThis.__v3Mechanics.of('pumpkinhulk').core.view; return v.stomp < 0 && v.state.every((s) => s === 0); }, null, { timeout: 420000, polling: 8 });
const cast = async (act) => { await settled().catch(() => {}); await flying(); const h0 = (await snap()); await act(); await settled(); const h1 = await snap(); return { hit: h1.hit - h0.hit, dodged: h1.dodged - h0.dodged }; };
const walk = (key) => async () => { await page.keyboard.down(key); await page.keyboard.down('ShiftLeft'); await simWait(2.0); await page.keyboard.up('ShiftLeft'); await page.keyboard.up(key); };
const roll = async () => {   // the last 0.15 s of the fuse: the press lands, its safe frames cover the burst
  await page.waitForFunction(() => { const c = globalThis.__v3Mechanics.of('pumpkinhulk').core, v = c.view; for (let i = 0; i < v.n; i++) if (v.state[i] === 2 && v.age[i] > c.row.fuseSeconds - 0.15) return true; return false; }, null, { timeout: 420000, polling: 4 });
  await page.keyboard.press('KeyE');
};
const TRIES = Number(process.env.TRIES ?? 3);
if (!process.env.STILLS_ONLY) {
  // B. walk out of the rings after the lob: at least one cast must miss a hero who ran (the key is the camera-relative way he runs)
  const B = [];
  for (const key of ['KeyD', 'KeyA', 'KeyS', 'KeyW', 'KeyD'].slice(0, TRIES + 1)) { B.push({ key, ...(await cast(walk(key))) }); if (B.at(-1).hit === 0) break; }
  console.log(`${tag} B walk out`, JSON.stringify(B));
  if (!B.some((r) => r.hit === 0)) fail('B: no cast missed a hero who ran out of the rings');
  // C. roll in the burst's last 0.15 s: at least one cast must take nothing (a dodge, or the roll carried him out)
  const C = [];
  for (let i = 0; i < TRIES; i++) { C.push(await cast(roll)); if (C.at(-1).hit === 0) break; }
  console.log(`${tag} C roll`, JSON.stringify(C));
  if (!C.some((r) => r.hit === 0)) fail('C: no cast was dodged by a hero who rolled');
}

// D. stills at 375: the stomp, the rings on the ground, the burst (the burst is held longer for the picture only)
await page.waitForFunction(() => globalThis.__v3Mechanics.of('pumpkinhulk').core.view.stomp >= 0.5, null, { timeout: 420000, polling: 8 });
await shot('1-stomp'); console.log(`${tag} still stomp`, JSON.stringify(await view()));
await page.waitForFunction(() => globalThis.__v3Mechanics.of('pumpkinhulk').core.view.state.some((s) => s === 2), null, { timeout: 420000, polling: 8 });
await page.waitForTimeout(600); await shot('2-rings'); console.log(`${tag} still rings`, JSON.stringify(await view()));
await page.evaluate(() => { globalThis.__v3Mechanics.of('pumpkinhulk').core.row.burstSeconds = 6; });
await page.waitForFunction(() => globalThis.__v3Mechanics.of('pumpkinhulk').core.view.state.some((s) => s === 3), null, { timeout: 420000, polling: 8 });
await page.waitForTimeout(150); await shot('3-burst'); console.log(`${tag} still burst`, JSON.stringify(await view()));
await page.evaluate(() => { globalThis.__v3Mechanics.of('pumpkinhulk').core.row.burstSeconds = 0.4; });
await browser.close();
