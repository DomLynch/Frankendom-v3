// Bakes the folded floor's own picture, variant B (data/stage.json `skyline.fold.variants.b.file`): the strip's lower cloud band (rows under its horizon, from variant A's
// bandTopFraction down), softened, resampled to a smooth 2048 x 256 and kept wrap-safe, with a little fine cloud grain so a stretched flat floor does not show the streaks
// that a few rows pulled across the ground show. The band is the strip's own, so A and B share colours. Run by hand (the shipped file is committed; the build never runs this):
//   SHARP_FROM=/path/to/dir-with-node_modules node scripts/skyfold-bake.mjs [out.webp]
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const sharp = createRequire(process.env.SHARP_FROM + '/x.js')('sharp');
const stage = JSON.parse(readFileSync(new URL('../data/stage.json', import.meta.url), 'utf8')).skyline;
const fold = stage.fold, A = fold.variants.a, B = fold.variants.b;
const src = new URL(`../src/assets/skyline/${stage.file}`, import.meta.url).pathname;
const out = process.argv[2] ?? new URL(`../src/assets/skyline/${B.file}`, import.meta.url).pathname;
const W = 2048, H = 256, BLUR = Number(process.env.BLUR ?? 3), GRAIN = Number(process.env.GRAIN ?? 0.05), QUALITY = Number(process.env.QUALITY ?? 72);
const meta = await sharp(src).metadata();
const top = Math.round(A.bandTopFraction * meta.height), rows = meta.height - top;
const band = await sharp(src).extract({ left: 0, top, width: meta.width, height: rows }).resize(W, H, { kernel: 'cubic', fit: 'fill' }).removeAlpha().raw().toBuffer();   // the strip's wrap is already cross-faded
// three copies side by side, blurred, middle one kept: the blur sees across the wrap, so the two ends meet with no seam
const wide = Buffer.alloc(W * 3 * H * 3);
for (let y = 0; y < H; y++) for (let k = 0; k < 3; k++) band.copy(wide, (y * W * 3 + k * W) * 3, y * W * 3, (y + 1) * W * 3);
const soft = await sharp(wide, { raw: { width: W * 3, height: H, channels: 3 } }).blur(BLUR).extract({ left: W, top: 0, width: W, height: H }).raw().toBuffer();
// wrap-safe value noise (period divides W), mean 1: a gentle multiplier, finer in v than the band's own rows
let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const GX = 64, GY = 16, grid = Array.from({ length: GY }, () => Array.from({ length: GX }, rnd));
const smooth = (t) => t * t * (3 - 2 * t);
const noise = (x, y) => { const fx = (x / W) * GX, fy = (y / H) * GY, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = smooth(fx - x0), ty = smooth(fy - y0); const g = (i, j) => grid[Math.min(GY - 1, j)][i % GX]; return (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty; };
const px = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const m = 1 + (noise(x, y) - 0.5) * 2 * GRAIN;
  for (let c = 0; c < 3; c++) px[(y * W + x) * 3 + c] = Math.max(0, Math.min(255, Math.round(soft[(y * W + x) * 3 + c] * m)));
}
const buf = await sharp(px, { raw: { width: W, height: H, channels: 3 } }).webp({ quality: QUALITY, effort: 6 }).toBuffer();
writeFileSync(out, buf);
console.log(out, `${W}x${H}`, buf.length, 'bytes', `(rows ${top}..${meta.height} of the strip)`);
