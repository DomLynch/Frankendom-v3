// Stills for the folded floor (data/stage.json skyline.fold, src/fight/skyfold.ts): 375x812, the game's own camera, ?skyfold=v1 (before), a (the strip's own lower band) and b (the re-baked band).
// Per tag: ready idle, mid-fight (a few attacks), and a far boss (the boss pinned FAR metres from the hero, the lock camera frames the pair). Same fight state for every tag.
//   FAR=30,40 node scripts/skyfold-stills.mjs <base url> <out dir> [tags ...]      (default tags: v1 a b; tag 'default' = no link)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, ...tags] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/skyfold-stills.mjs <base url> <out dir> [tags ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const TAGS = tags.length ? tags : ['v1', 'a', 'b'], FAR = (process.env.FAR ?? '30').split(',').map(Number), WAIT = Number(process.env.WAIT_MS ?? 9000), PLACE = Number(process.env.PLACE_MS ?? 15000);
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
for (const tag of TAGS) {
  const query = tag === 'default' ? '' : `skyfold=${tag}`;
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: Number(process.env.DSF ?? 1), isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.error(`${tag}: pageerror ${e.message}`));
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000 });
  await page.waitForTimeout(WAIT);   // the strip (and B's band) are fetched after the first frame and fade in
  await page.screenshot({ path: `${out}/${tag}-ready-375.jpg`, type: 'jpeg', quality: 88 });
  for (let i = 0; i < 6; i++) { await page.evaluate(() => document.getElementById('attack-button')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))); await page.waitForTimeout(350); await page.evaluate(() => document.getElementById('attack-button')?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))); await page.waitForTimeout(250); }
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${tag}-mid-375.jpg`, type: 'jpeg', quality: 88 });
  await page.evaluate(() => { globalThis.__pin = { x: 0, z: 0, far: 3.25 }; setInterval(() => { const f = globalThis.__v3Fight, p = globalThis.__pin; if (f?.fighter) { f.fighter.x = p.x; f.fighter.z = p.z; if (f.fighter.health < 50) f.fighter.health = f.fighter.maxHealth; } if (f?.enemy) { f.enemy.x = p.x; f.enemy.z = p.z - p.far; } }, 4); });
  for (const far of FAR) {
    await page.evaluate((far) => { globalThis.__pin.far = far; }, far);
    await page.waitForTimeout(PLACE);   // the follow camera eases: wait for it
    await page.screenshot({ path: `${out}/${tag}-far${far}-375.jpg`, type: 'jpeg', quality: 88 });
    console.log(tag, 'far', far, JSON.stringify(await page.evaluate(() => { const c = globalThis.__v3Scene.userData.camera; const f = globalThis.__v3Fight; return { cam: c ? [c.position.x, c.position.y, c.position.z].map((n) => +n.toFixed(1)) : null, hero: [f.fighter.x, f.fighter.z], boss: [f.enemy.x, f.enemy.z] }; })));
  }
  await page.close();
}
await browser.close();
console.log('done', out);
