// The fight camera per screen shape, headless: the hero's on-screen height as a fraction of the viewport, and the camera's distance, pitch and fields of view.
//   node scripts/camera-measure.mjs <base url> <out dir> <tag> [query]      (PLAYWRIGHT_MOD=<path to playwright's index.mjs> when it is not installed here)
// For each of 375x812 (portrait phone), 812x375 (landscape phone) and 1440x900 (desktop) it takes two states: `fight` (the hero engaged with the first boss) and `walk` (the boss killed,
// the hero walking away from the corpse). One JSON line per state and a <tag>-<shape>-<state>.jpg still. The hero is measured as a 1.8 m column on his own position.
import { mkdirSync } from 'node:fs';
import { launchBrowser } from './lib/browser.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MOD ?? 'playwright');

const [base, out, tag, query = ''] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/camera-measure.mjs <base url> <out dir> <tag> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const SHAPES = [['portrait', 375, 812], ['landscape', 812, 375], ['desktop', 1440, 900]];
const only = process.env.SHAPES ? process.env.SHAPES.split(',') : null;
const HERO_M = Number(process.env.HERO_M ?? 1.8);
const browser = await launchBrowser();
for (const [shape, width, height] of SHAPES) {
  if (only && !only.includes(shape)) continue;
  const mobile = shape !== 'desktop';
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  page.on('pageerror', (e) => console.error(`${shape} pageerror ${e.message}`));
  await page.addInitScript(() => { globalThis.__v3CamShot = (c) => { globalThis.__cam = c; }; });
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive' && globalThis.__cam, null, { timeout: 240000 });
  await page.waitForTimeout(Number(process.env.SETTLE_MS ?? 4000));   // SETTLE_MS: long enough for the lazy ground texture to load, so two runs compare like for like
  const read = (state) => page.evaluate(([name, heroM]) => {
    const c = globalThis.__cam, f = globalThis.__v3Fight, p = globalThis.__v3Roam ?? f.fighter, foe = f.enemy;
    const proj = (x, y, z) => { const v = c.position.clone().set(x, y, z).project(c); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; };
    const feet = proj(p.x, 0, p.z), head = proj(p.x, heroM, p.z), foeFeet = proj(foe.x, 0, foe.z), foeHead = proj(foe.x, heroM, foe.z);
    const dir = c.getWorldDirection(c.position.clone());
    const vfov = c.fov, hfov = 2 * Math.atan(Math.tan(vfov * Math.PI / 360) * c.aspect) * 180 / Math.PI;
    const r = (n) => +n.toFixed(2);
    return { state: name, w: innerWidth, h: innerHeight, aspect: r(c.aspect), vfov: r(vfov), hfov: r(hfov), camY: r(c.position.y), camToHero: r(Math.hypot(c.position.x - p.x, c.position.y - 0.9, c.position.z - p.z)), pitchDeg: r(Math.asin(dir.y) * 180 / Math.PI), gap: r(Math.hypot(p.x - foe.x, p.z - foe.z)),
      heroPx: r(feet[1] - head[1]), heroFrac: r((feet[1] - head[1]) / innerHeight), heroFeetY: r(feet[1] / innerHeight), heroX: r(feet[0] / innerWidth), foePx: r(foeFeet[1] - foeHead[1]), foeFeetY: r(foeFeet[1] / innerHeight) };
  }, [state, HERO_M]);
  const shot = (state) => page.screenshot({ path: `${out}/${tag}-${shape}-${state}.jpg`, type: 'jpeg', quality: 80 });
  const say = (m) => console.log(`${tag} ${shape}`, JSON.stringify(m));
  say(await read('open')); await shot('open');   // the zone's opener: the boss still stands well off
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true })));   // walk at him until the engaged distance
  await page.waitForFunction(() => { const f = globalThis.__v3Fight; return Math.hypot(f.fighter.x - f.enemy.x, f.fighter.z - f.enemy.z) < Number(3.2); }, null, { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true })));
  await page.waitForTimeout(1500);
  say(await read('fight')); await shot('fight');
  await page.evaluate(() => new Promise((done) => {
    const fire = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    const id = setInterval(() => {
      const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.min(f.health, 1);
      fire('KeyC', 'keydown'); fire('KeyC', 'keyup');
      if (globalThis.__ragdoll.state === 'frozen') { clearInterval(id); setTimeout(done, 5000); }
    }, 250);
  }));
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', bubbles: true })));
  await page.waitForTimeout(Number(process.env.WALK_MS ?? 4000));
  say(await read('walk')); await shot('walk');
  await page.close();
}
await browser.close();
