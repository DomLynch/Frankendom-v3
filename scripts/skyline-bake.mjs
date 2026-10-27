// Bakes the skyline strip (data/stage.json `skyline`) from its source PNG: cross-fades the last `seamOverlapPx` columns into the first ones so the
// 360-degree wrap has no seam (the source's two edges differ by ~55/255 per channel), then writes a WebP at the row's width/quality.
// Run by hand (the shipped file is committed; the build never runs this). sharp is not a repo dependency, so point at a scratch install:
//   SHARP_FROM=/path/to/dir-with-node_modules node scripts/skyline-bake.mjs <source 8192x820 png> [out.webp]
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const sharp = createRequire(process.env.SHARP_FROM + '/x.js')('sharp');
const row = JSON.parse(readFileSync(new URL('../data/stage.json', import.meta.url), 'utf8')).skyline;
const [src, out = new URL(`../src/assets/skyline/${row.file}`, import.meta.url).pathname] = process.argv.slice(2);
if (!src) throw Error('usage: skyline-bake.mjs <source png> [out.webp]');
const O = row.seamOverlapPx;
const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info, outW = W - O, px = Buffer.alloc(outW * H * 3);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < outW; x++) {
    for (let c = 0; c < 3; c++) {
      let v = data[(y * W + x) * 3 + c];
      if (x < O) { const t = x / O, s = t * t * (3 - 2 * t); v = (1 - s) * data[(y * W + W - O + x) * 3 + c] + s * v; }   // out[0] = src[W - O], out[O] = src[O]; the strip's last column is src[W - O - 1], next to out[0]
      px[(y * outW + x) * 3 + c] = Math.round(v);
    }
  }
}
const buf = await sharp(px, { raw: { width: outW, height: H, channels: 3 } }).webp({ quality: row.quality, effort: 6 }).toBuffer();
writeFileSync(out, buf);
console.log(out, outW + 'x' + H, buf.length, 'bytes');
