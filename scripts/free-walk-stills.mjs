// The zone's free walk after a kill (data/respawn.json postKill.walkRadiusMetres), 375 wide: the Pitborn is killed by a kick, the corpse is let lie until frozen, then the hero
// walks straight back from the corpse (S held) in steps, one still per step with his distance from the pit's centre, past the old pit wall; then turns and walks back in.
//   <tag>-0-kill        the kill at the fight camera
//   <tag>-1-walk-<n>    after n steps of STEP_S seconds (default 1.2) walking away
//   <tag>-2-back-<n>    after n steps walking back toward the corpse
//   node scripts/free-walk-stills.mjs <base url> <out dir> <tag> [query]      (on a Mac it uses Metal, elsewhere SwiftShader)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, tag, query = ''] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/free-walk-stills.mjs <base url> <out dir> <tag> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const STEP_S = Number(process.env.STEP_S ?? 1.2), STEPS = Number(process.env.STEPS ?? 6), BACK = Number(process.env.BACK ?? 2);
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: Number(process.env.DSF ?? 1), isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') console.error(`console ${m.text()}`); });
const shot = async (n) => { await page.screenshot({ path: `${out}/${tag}-${n}.jpg`, type: 'jpeg', quality: 72 }); };
const key = (code, type) => page.evaluate(([c, t]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [code, type]);
const where = () => page.evaluate(() => { const r = globalThis.__v3Roam, f = globalThis.__v3Fight?.fighter, p = r ?? f; return { roam: !!r, x: +p.x.toFixed(2), z: +p.z.toFixed(2), radius: +Math.hypot(p.x, p.z).toFixed(2), zone: globalThis.__v3Zone?.current }; });
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 180000 });
await page.waitForTimeout(3000);
await page.evaluate(() => new Promise((done) => {
  const fire = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  const id = setInterval(() => {
    const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.min(f.health, 1);
    fire('KeyC', 'keydown'); fire('KeyC', 'keyup');
    if (globalThis.__ragdoll.state === 'frozen') { clearInterval(id); setTimeout(done, 5000); }
  }, 250);
}));
await shot('0-kill'); console.log(`${tag} kill`, JSON.stringify(await where()));
await key('KeyS', 'keydown');
for (let n = 1; n <= STEPS; n++) { await page.waitForTimeout(STEP_S * 1000); await shot(`1-walk-${n}`); console.log(`${tag} walk ${n}`, JSON.stringify(await where())); }
await key('KeyS', 'keyup'); await key('KeyW', 'keydown');
for (let n = 1; n <= BACK; n++) { await page.waitForTimeout(STEP_S * 1000); await shot(`2-back-${n}`); console.log(`${tag} back ${n}`, JSON.stringify(await where())); }
await key('KeyW', 'keyup');
await browser.close();
