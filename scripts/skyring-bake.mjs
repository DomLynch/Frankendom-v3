// Bakes the sky ring's pictures (data/stage.json `skyline.ring`, src/fight/skyring.ts) from the designer's plates 2 to 4 (FRANKENDOM_SKY_PLATES_2_TO_4.zip, 4096 x 1640 each, horizon y = 1443).
// Per plate: the registered layers named in `bake.layers` (the south creature, the east and west planets: they match the master to 0..4 grey levels, the base is blank where they go) are
// composited over the clean base; then the crop `bake` keeps (the feathered pink/blue margin left and right is cut off, the flat blue above `topPx` is kept as a cheap flat strip so the
// top matches the sky, everything under the horizon row `bottomPx` is cut off: the game lays its own cloud band there); then one WebP for the desktop and one at `mobileScale` for the phone.
// Run by hand (the shipped files are committed; the build never runs this):
//   SHARP_FROM=/path/to/dir-with-node_modules node scripts/skyring-bake.mjs <plates dir> [out dir]
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const sharp = createRequire(process.env.SHARP_FROM + '/x.js')('sharp');
const ring = JSON.parse(readFileSync(new URL('../data/stage.json', import.meta.url), 'utf8')).skyline.ring, B = ring.bake;
const [plates, outDir = new URL('../src/assets/skyline/', import.meta.url).pathname] = process.argv.slice(2);
if (!plates) { console.error('usage: SHARP_FROM=... node scripts/skyring-bake.mjs <plates dir> [out dir]'); process.exit(2); }
const W = B.sourceWidthPx - B.cropLeftPx - B.cropRightPx, H = B.bottomPx - B.topPx;
for (const p of ring.plates) {
  const dir = `${plates}/${p.bake.dir}`;
  let img = sharp(`${dir}/02_base_clean_4096x1640.png`).removeAlpha();
  if (p.bake.layers.length) img = sharp(await img.composite(p.bake.layers.map((l) => ({ input: `${dir}/${l}` }))).png().toBuffer());
  const crop = await img.extract({ left: B.cropLeftPx, top: B.topPx, width: W, height: H }).png().toBuffer();
  const desk = await sharp(crop).webp({ quality: B.quality, effort: 6 }).toBuffer();
  const mw = Math.round(W * B.mobileScale), mh = Math.round(H * B.mobileScale);
  const mob = await sharp(crop).resize(mw, mh, { kernel: 'lanczos3' }).webp({ quality: B.quality, effort: 6 }).toBuffer();
  writeFileSync(`${outDir}/${p.desktop}`, desk); writeFileSync(`${outDir}/${p.mobile}`, mob);
  console.log(p.id, `${p.desktop} ${W}x${H} ${desk.length} B`, `${p.mobile} ${mw}x${mh} ${mob.length} B`);
}
