// The zone's free follow camera (data/respawn.json freeCamera), 375 wide: a fight at the fight camera, the kill, then the hero walks away from the corpse (S held from the instant the kill lands) and the camera
// follows him. One still per beat plus where the hero and the camera are, so the numbers and the pictures agree.
//   <tag>-0-fight       the fight, just before the kill (hero and boss at the fight camera)
//   <tag>-1-kill        the kill, the stick pushed the same instant
//   <tag>-2-walk-<n>    after n steps of STEP_S seconds (default 1.2) walking away
//   node scripts/free-camera-stills.mjs <base url> <out dir> <tag> [query]      (query ?freecam=v1 = the lock camera as it was; ?postkill=v1 = the single fight)
import { mkdirSync } from 'node:fs';
import { collectErrors, launchBrowser, phoneOptions } from './lib/browser.mjs';

const [base, out, tag, query = ''] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/free-camera-stills.mjs <base url> <out dir> <tag> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const STEP_S = Number(process.env.STEP_S ?? 1.2), STEPS = Number(process.env.STEPS ?? 4);
const browser = await launchBrowser();
const page = await browser.newPage(phoneOptions(Number(process.env.DSF ?? 1)));
collectErrors(page, { echo: true });
const shot = async (n) => { await page.screenshot({ path: `${out}/${tag}-${n}.jpg`, type: 'jpeg', quality: 72 }); };
const key = (code, type) => page.evaluate(([c, t]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [code, type]);
const where = () => page.evaluate(() => { const r = globalThis.__v3Roam, f = globalThis.__v3Fight?.fighter, p = r ?? f, e = globalThis.__v3Fight?.enemy; return { roam: !!r, hero: [+p.x.toFixed(2), +p.z.toFixed(2)], toCorpse: +Math.hypot(p.x - e.x, p.z - e.z).toFixed(2), freeShare: globalThis.__v3FreeShare ?? null }; });
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 180000 });
await page.waitForFunction(() => globalThis.__v3Zone?.engaged === true || globalThis.__v3Fight?.duel?.fighters?.[0]?.phase !== 'sheathed', null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2500);
await shot('0-fight'); console.log(`${tag} fight`, JSON.stringify(await where()));
await page.evaluate(() => new Promise((done) => {
  const fire = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  const id = setInterval(() => {
    const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.min(f.health, 1);
    fire('KeyC', 'keydown'); fire('KeyC', 'keyup');
    if (globalThis.__v3Fight.finish) { clearInterval(id); fire('KeyS', 'keydown'); done(); }   // the instant the kill lands, the stick goes down
  }, 100);
}));
await page.waitForTimeout(400);
await shot('1-kill'); console.log(`${tag} kill`, JSON.stringify(await where()));
for (let n = 1; n <= STEPS; n++) { await page.waitForTimeout(STEP_S * 1000); await shot(`2-walk-${n}`); console.log(`${tag} walk ${n}`, JSON.stringify(await where())); }
await key('KeyS', 'keyup');
await browser.close();
