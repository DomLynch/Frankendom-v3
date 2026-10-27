// The zone's look thumb (data/respawn.json look), 375 wide, real two-finger touches (CDP Input.dispatchTouchEvent, two touch ids at once): the left thumb holds the stick, the right thumb drags on the
// empty right of the screen, and the camera yaw turns while the hero keeps walking. One still per beat plus the numbers, so the pictures and the yaw agree.
//   <tag>-0-before   standing, nobody fighting him, no finger down
//   <tag>-1-held     the left thumb on the stick, the right thumb just down (the hero walking)
//   <tag>-2-turned   the right thumb dragged across, both thumbs still down: the view has turned, the hero is still walking (the stick is relative to the view)
//   <tag>-3-after    both lifted
//   MODE=combat      waits for a boss to engage, then the same gesture: the yaw must not move (the drag does nothing in a fight)
//   node scripts/look-thumb-stills.mjs <base url> <out dir> <tag> [query]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, tag, query = ''] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/look-thumb-stills.mjs <base url> <out dir> <tag> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const MODE = process.env.MODE ?? 'free', DRAG_PX = Number(process.env.DRAG_PX ?? 150), STEPS = Number(process.env.DRAG_STEPS ?? 15);
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: Number(process.env.DSF ?? 1), isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') console.error(`console ${m.text()}`); });
const cdp = await page.context().newCDPSession(page);
const shot = async (n) => { await page.screenshot({ path: `${out}/${tag}-${n}.jpg`, type: 'jpeg', quality: 72 }); };
const where = () => page.evaluate(() => { const r = globalThis.__v3Roam, f = globalThis.__v3Fight?.fighter, p = r ?? f; return { yaw: globalThis.__v3Yaw, hero: [+p.x.toFixed(2), +p.z.toFixed(2)], engaged: !!globalThis.__v3Zone?.engaged, freeShare: globalThis.__v3FreeShare }; });
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, x, y]) => ({ id, x, y })) });
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 180000 });
if (MODE === 'combat') await page.waitForFunction(() => globalThis.__v3Zone?.engaged === true, null, { timeout: 60000 });
await page.waitForTimeout(2500);
if (process.env.EVENTS) await page.evaluate(() => { globalThis.__ev = []; for (const t of ['pointerdown', 'pointerup', 'pointercancel', 'lostpointercapture', 'gotpointercapture', 'touchstart', 'touchend', 'touchcancel']) window.addEventListener(t, (e) => globalThis.__ev.push(`${t} id=${e.pointerId ?? '-'} on=${e.target?.id || e.target?.tagName} touches=${e.touches?.length ?? '-'}`), true); });
const pad = await page.evaluate(() => { const r = document.getElementById('joystick').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
const hit = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? (e.id || e.tagName) : null; }, [300, 420]);
console.log(`${tag} stick pad`, JSON.stringify(pad), `element under the right thumb: ${hit}`);
await shot('0-before'); const w0 = await where(); console.log(`${tag} before`, JSON.stringify(w0));
const PUSH = (process.env.PUSH ?? '30,0').split(',').map(Number);   // where the left thumb pushes the stick from its centre (px): sideways by default, so the pit's wall is not met at once
const left = [1, pad.x + PUSH[0], pad.y + PUSH[1]], R0 = [300, 420];   // the right thumb lands on empty ground
const knob = () => page.evaluate(() => document.querySelector('#joystick > *')?.style.transform ?? null);
await touch('touchStart', [left]);
await page.waitForTimeout(300);
await touch('touchStart', [left, [2, R0[0], R0[1]]]);
await page.waitForTimeout(500);
await shot('1-held'); const w1 = await where(); console.log(`${tag} held`, JSON.stringify(w1));
for (let i = 1; i <= STEPS; i++) { await touch('touchMove', [left, [2, R0[0] - (DRAG_PX * i) / STEPS, R0[1]]]); await page.waitForTimeout(40); if (i % 3 === 0) { const w = await where(); console.log(`${tag} drag ${i}`, JSON.stringify({ yaw: w.yaw, hero: w.hero, knob: await knob() })); } }
await page.waitForTimeout(200);
await shot('2-turned'); const w2 = await where(); console.log(`${tag} turned`, JSON.stringify(w2));
await touch('touchEnd', [left]);
await touch('touchEnd', []);
await page.waitForTimeout(600);
await shot('3-after'); const w3 = await where(); console.log(`${tag} after`, JSON.stringify(w3));
if (process.env.EVENTS) console.log(`${tag} events`, JSON.stringify(await page.evaluate(() => globalThis.__ev), null, 1));
const moved =Math.hypot(w2.hero[0] - w1.hero[0], w2.hero[1] - w1.hero[1]);
console.log(`${tag} RESULT mode=${MODE} yawTurned=${(w2.yaw - w0.yaw).toFixed(3)} rad, heroWalkedWhileTurning=${moved.toFixed(2)} m, engaged=${w2.engaged}`);
await browser.close();
