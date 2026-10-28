// ROLL and GUARD out of combat, on the BUILT dist at 375 wide with REAL touches (CDP touch events through the pointer layer, no synthetic handler calls).
//   <tag>-0-open        the open world, no fight: the buttons visible (their rectangles are checked for overlap)
//   <tag>-1-roll        mid roll (touch held on ROLL past the hold, stick pushed): the hero moved, the roll clip
//   <tag>-2-guard       GUARD held: the guard pose, the button pressed
//   <tag>-3-kill        the kill (a kick, the foe's health set low), then the walk
//   <tag>-4-walk-roll   mid roll on the walk after the kill
//   <tag>-5-walk-guard  GUARD held on the walk after the kill
//   node scripts/roll-guard-stills.mjs <base url> <out dir> <tag> [query]      (on a Mac it uses Metal, elsewhere SwiftShader; CHROME=<path> for a browser)
// Prints one JSON line per check and exits 1 when any check fails.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, tag, query = ''] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/roll-guard-stills.mjs <base url> <out dir> <tag> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const cdp = await page.context().newCDPSession(page);
let failed = 0;
page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
const check = (name, ok, extra = {}) => { if (!ok) failed++; console.log(JSON.stringify({ check: name, ok, ...extra })); };
const shot = (n) => page.screenshot({ path: `${out}/${tag}-${n}.jpg`, type: 'jpeg', quality: 72, timeout: 120000 });
const centre = (id) => page.evaluate((i) => { const r = document.getElementById(i).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, id);
const down = async (id, finger, at) => { const c = at ?? await centre(id); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y, id: finger }] }); return c; };
const move = (finger, x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: finger }] });
const up = (finger) => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }).then(() => finger);
const hero = () => page.evaluate(() => { const f = globalThis.__v3Free ?? globalThis.__v3FreeHero ?? globalThis.__v3Fight.duel.fighters[0], r = globalThis.__v3Roam, h = globalThis.__v3Fight.duel.fighters[0]; const p = r ?? h.body; return { phase: (globalThis.__v3FreeHero ?? h).phase, x: +p.x.toFixed(2), z: +p.z.toFixed(2), roam: !!r, stamina: +(globalThis.__v3FreeHero ?? h).stamina.toFixed(1) }; });
const until = (phase) => page.waitForFunction((p) => (globalThis.__v3FreeHero ?? globalThis.__v3Fight.duel.fighters[0]).phase === p, phase, { timeout: 20000, polling: 'raf' }).then(() => true, () => false);
const state = (id) => page.evaluate((i) => { const e = document.getElementById(i), r = e.getBoundingClientRect(), s = getComputedStyle(e); return { disabled: e.getAttribute('aria-disabled'), pressed: e.getAttribute('aria-pressed'), shown: !e.hidden && s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0, rect: [r.x, r.y, r.right, r.bottom] }; }, id);
const overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 180000 });
await page.waitForTimeout(3000);

// 0: the open world, no fight
const ids = ['dodge-button', 'guard-button', 'attack-button', 'heavy-button', 'kick-button', 'skill-button', 'run-button', 'joystick'];
const st = {}; for (const id of ids) st[id] = await state(id);
check('open world: no fight (hero sheathed, nothing engaged)', (await hero()).phase === 'sheathed');
check('open world: ROLL and GUARD shown and enabled', ['dodge-button', 'guard-button'].every((id) => st[id].shown && st[id].disabled === 'false'), { dodge: st['dodge-button'], guard: st['guard-button'] });
const shown = ids.filter((id) => st[id].shown);
const clash = []; for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) if (overlap(st[shown[i]].rect, st[shown[j]].rect)) clash.push([shown[i], shown[j]]);
check('open world: ROLL and GUARD overlap no other control', !clash.some(([a, b]) => ['dodge-button', 'guard-button'].includes(a) || ['dodge-button', 'guard-button'].includes(b)), { clash });
await shot('0-open');

// 1: roll with a real hold on ROLL while the stick is pushed (a second finger on the joystick)
const before = await hero();
const j = await centre('joystick');
await down('joystick', 1, j); await move(1, j.x, j.y + 40);   // stick down = away from the boss, so the roll stays a plain roll (walking into the boss's reach would begin a fight)
await page.waitForTimeout(150);
await down('dodge-button', 2);
const rolled = await until('roll');   // the box may be slow: wait for the phase, not a fixed time
const mid = await hero();
if (rolled) await shot('1-roll');
check('open world: ROLL rolls (roll clip phase, hero moved)', rolled && Math.hypot(mid.x - before.x, mid.z - before.z) > 0.2, { before, mid });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
check('open world: the roll ends back in the sheath, no fight began', await until('sheathed'));

// 2: guard held
await down('guard-button', 3);
const up2 = await until('guard'), g = await state('guard-button'), gh = await hero();
if (up2) await shot('2-guard');
check('open world: GUARD raises while held and the button shows it', up2 && g.pressed === 'true', { gh, pressed: g.pressed });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
check('open world: GUARD releases', await until('sheathed'), { gh: await hero() });

// 3: the kill, then the walk (a fresh page: the kill routine kicks from the start spot)
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 180000 });
await page.waitForTimeout(3000);
await page.evaluate(() => new Promise((done) => {
  const fire = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  const id = setInterval(() => {
    const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.min(f.health, 1);
    fire('KeyC', 'keydown'); fire('KeyC', 'keyup');
    if (globalThis.__ragdoll.state === 'frozen') { clearInterval(id); setTimeout(done, 3000); }
  }, 250);
}));
await shot('3-kill');
// the walk starts on the first press (a roll here ends the ceremony as the stick does)
const j2 = await centre('joystick');
await down('joystick', 1, j2); await move(1, j2.x, j2.y + 40);
await page.evaluate(() => { const h = globalThis.__v3Fight.duel.fighters[0]; h.stamina = h.maxStamina; });   // the kill left him winded: the roll costs the fight's stamina, so start it full
await down('dodge-button', 2);
const wrolled = await until('roll'), wr = await hero();
if (wrolled) await shot('4-walk-roll');
check('after the kill: ROLL rolls on the walk', wrolled, { wr });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await until('ready');
await down('guard-button', 3);
const wgu = await until('guard'), wg = await hero(), wgs = await state('guard-button');
if (wgu) await shot('5-walk-guard');
check('after the kill: GUARD raises on the walk and the button shows it', wgu && wgs.pressed === 'true' && wgs.disabled === 'false', { wg, wgs });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
check('after the kill: GUARD releases', await until('ready'));
await browser.close();
process.exit(failed ? 1 : 0);
