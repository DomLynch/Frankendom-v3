// Frankendom parts, stage 2 wear (data/parts.json wear), 375 wide stills of the hero wearing a forced loadout (?wear=<profile>:<slot>,...), on the Mac GPU: ready (idle), mid-walk and mid-attack per loadout,
// at the fight camera and through a close 3/4 front lens (src/fight/camera.ts __v3CamShot, as scripts/boss-weapon-hand-stills.mjs) so the seams can be judged.
//   MAC_HEAVY_OK=1 node scripts/wear-stills.mjs <dist dir> <out dir> [name=loadout ...]      loadout = comma list of profile:slot ('none' = nothing worn); default: the Dom set
// Writes <out>/<name>-{idle,walk,attack}.png (fight camera, 375 wide) and <name>-{idle,walk,attack}-close.png (the lens); prints one line per loadout: what was worn and the hero's skinned draws.
// env: W (375) H (812) DPR (2), EXTRA (more query, e.g. "opener=off"), SETTLE (ms, 3000), LENS_DIST (2.3 m), LENS_SIDE (1 = the hero's left, -1 right), LENS_LOOK (1.15 m, the aim height).
import { mkdirSync } from 'node:fs';
import { collectErrors, launchBrowser, phoneOptions, serveDist, waitPlayable } from './lib/browser.mjs';

const [dist, out, ...named] = process.argv.slice(2);
if (!dist || !out) { console.error('usage: node scripts/wear-stills.mjs <dist dir> <out dir> [name=loadout ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const SET = {
  none: 'none', 'minotaur-head': 'pitborn:head', 'minotaur-arm-left': 'pitborn:arm_left', 'reginald-leg-left': 'castle-guard:leg_left', 'anime-girl-arm-right': 'anime-girl-blonde:arm_right',
  'anime-boy-head': 'anime-boy-black:head', 'arachne-arm-left': 'arachne:arm_left', 'gargantua-arm-left': 'gargantua:arm_left', 'gargantua-head': 'gargantua:head', 'king-arm-left': 'big-vegas:arm_left', 'king-head': 'big-vegas:head',
  'minotaur-torso': 'pitborn:torso', 'reginald-torso': 'castle-guard:torso', 'anime-boy-torso': 'anime-boy-black:torso', 'arachne-torso': 'arachne:torso', 'gargantua-torso': 'gargantua:torso',
  'minotaur-hand-left': 'pitborn:hand_left', 'minotaur-hand-right': 'pitborn:hand_right', 'reginald-foot-left': 'castle-guard:foot_left', 'reginald-foot-right': 'castle-guard:foot_right', 'arachne-hand-left': 'arachne:hand_left', 'anime-girl-hand-left': 'anime-girl-blonde:hand_left',
  'granny-foot-left': 'sporty-granny:foot_left', 'gargantua-hand-left': 'gargantua:hand_left', 'king-hand-left': 'big-vegas:hand_left', 'parasite-foot-left': 'parasite:foot_left', 'anime-boy-foot-left': 'anime-boy-black:foot_left',
  'loadout-hf5': 'pitborn:head,arachne:arm_left,pitborn:hand_left,castle-guard:leg_left,castle-guard:foot_left',
  'loadout-3': 'pitborn:head,arachne:arm_left,castle-guard:leg_left', 'loadout-5': 'anime-boy-black:head,pitborn:arm_left,arachne:arm_right,castle-guard:leg_left,anime-girl-blonde:leg_right',
};
const jobs = named.length ? named.map((s) => { const i = s.indexOf('='); return i < 0 ? [s, SET[s] ?? s] : [s.slice(0, i), s.slice(i + 1)]; }) : Object.entries(SET);
const num = (k, d) => Number(process.env[k] ?? d);
const W = num('W', 375), H = num('H', 812), DPR = num('DPR', 2), extra = process.env.EXTRA ? `&${process.env.EXTRA}` : '';
const server = await serveDist(dist), browser = await launchBrowser({ angle: 'metal' });
for (const [name, loadout] of jobs) {
  const page = await browser.newPage(phoneOptions(DPR, { viewport: { width: W, height: H } }));
  const errors = collectErrors(page);
  await page.addInitScript(([dist, side, look]) => {   // the close lens: a 3/4 front view of the hero, only while globalThis.__lens is on
    globalThis.__v3CamShot = (cam) => {
      if (!globalThis.__lens) return;
      const p = globalThis.__v3Fight; if (!p) return;
      const [h, f] = p.duel.fighters; let dx = f.body.x - h.body.x, dz = f.body.z - h.body.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const px = -dz * side, pz = dx * side;
      cam.position.set(h.body.x + (dx * 0.8 + px * 0.6) * dist, look + 0.25, h.body.z + (dz * 0.8 + pz * 0.6) * dist); cam.lookAt(h.body.x, look, h.body.z); cam.updateMatrixWorld();
    };
  }, [num('LENS_DIST', 2.3), num('LENS_SIDE', 1), num('LENS_LOOK', 1.15)]);
  await page.goto(`${server.url}/?wear=${loadout === 'none' ? '' : loadout}&save=off${extra}`);
  await waitPlayable(page, { timeout: 180000 });
  const want = loadout === 'none' ? 0 : loadout.split(',').length;
  await page.waitForFunction((n) => (globalThis.__v3Wear?.info().worn.length ?? 0) >= n, want, { timeout: 90000 }).catch(() => {});
  const phase = () => page.evaluate(() => globalThis.__v3Fight.duel.fighters[0].phase);
  for (let i = 0; i < 200 && /sheathed|draw/.test(await phase()); i++) await page.waitForTimeout(100);
  await page.waitForTimeout(num('SETTLE', 3000));
  const shoot = async (tag) => {
    await page.screenshot({ path: `${out}/${name}-${tag}.png` });
    await page.evaluate(() => { globalThis.__lens = true; }); await page.waitForTimeout(120);
    await page.screenshot({ path: `${out}/${name}-${tag}-close.png` });
    await page.evaluate(() => { globalThis.__lens = false; });
  };
  await shoot('idle');
  const info = await page.evaluate(() => ({ ...globalThis.__v3Wear.info(), phase: globalThis.__v3Fight.duel.fighters[0].phase }));
  await page.keyboard.down('KeyW'); await page.waitForTimeout(700);
  await shoot('walk');
  await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyF'); await page.waitForTimeout(240);
  await shoot('attack');
  console.log(`${name}: ${JSON.stringify(info)}${errors.length ? ` ERRORS ${JSON.stringify(errors.slice(0, 3))}` : ''}`);
  await page.close();
}
await browser.close(); await server.close();
