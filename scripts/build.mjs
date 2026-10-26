// Builds the site into dist/: all the code bundled by esbuild into ONE module (b/<build>/src/client/main.js), served under b/<build>/ so a
// phone never runs a cached older module after a deploy. It replaced one module per source file (402 modules, 3.1 MB, which a phone
// resolved import level by import level: 30-60 s to a playable fight on Dom's phone, 2026-10-26). three.js stays external, from the CDN
// import map in index.html. Data JSON a module imports statically is bundled into it. Code that loads on demand (specials, finishers,
// the gfx lift) rides the same file, still run only when first asked for (esbuild's lazy module wrappers); only the big clip JSON loaded
// by a dynamic import (special-*.json, the finishers' killer/victim clips, ~1.5 MB) stays a separate .json.js module, fetched when used.
// Binary assets (GLB, audio, textures, fonts) are served under content-hashed names outside b/ (see "Content-hashed art" below), so a
// deploy that does not touch them costs a repeat visitor nothing and one that does is a new URL (the nginx site caches hashed names for
// good and revalidates plain paths; its copy is /srv/frankendom-v3/conf/nginx-v3-tls.conf on the VPS).
// Every text and GLB file also gets a .gz twin (gzip -9) that nginx's gzip_static serves as it is: the GLBs halve (raw float geometry).
//   node scripts/build.mjs            -> dist/, build id "dev"
//   BUILD=<sha> node scripts/build.mjs -> dist/, build id <sha> (CI deploy)
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { optimizeGlb } from './optimize-glb.mjs';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const out = join(root, 'dist');
const id = process.env.BUILD || 'dev';
const code = join(out, 'b', id);
const ENTRY = 'src/client/main.ts';
const ENTRY_DIR = join(code, 'src/client');   // where main.js lands: lazy JSON specifiers are relative to it
const ENTRY_CSS = ['src/style.css'];   // V1's stylesheet, linked from index.html
const CODE = /\.(ts|js|mjs)$/;
const GZ = /\.(js|css|json|glb|svg|txt|html)$/;   // precompressed for gzip_static; images and audio are compressed already

const rel = (p) => relative(root, p).split('\\').join('/');
// new URL('<relative>', import.meta.url): made root-absolute so it resolves to the stable copy, not one under b/<build>/ (the bundle's
// own URL is no longer the source file's). A fixed asset is copied; a template's folder (up to its first ${) is copied whole.
const ASSET_URL = /new URL\(\s*(['"`])(\.{1,2}\/[^'"`]*)\1\s*,\s*import\.meta\.url\s*\)/g;
// The path then goes through artUrl (src/art-url.ts), which names the content-hashed copy (see "Content-hashed art" below).
const ART_URL = join(root, 'src/art-url.ts');
const assets = new Set(), lazyJson = new Set();
function rewrite(file, src) {
  let hits = 0;
  const out = src.replace(ASSET_URL, (_, q, spec) => {
    const cut = spec.indexOf('${'), target = resolve(dirname(file), cut < 0 ? spec : spec.slice(0, spec.lastIndexOf('/', cut) + 1));
    if (existsSync(target)) assets.add(target);
    hits++;
    return `new URL(__v3artUrl(${q}/${rel(resolve(dirname(file), spec.replace(/\$\{/g, '\u0000'))).replace(/\u0000/g, '${')}${q}), import.meta.url)`;
  });
  return hits ? `import { artUrl as __v3artUrl } from ${JSON.stringify(ART_URL)};\n${out}` : out;
}
// import('<relative>.json'): left as a dynamic import of a .json.js module written beside the code (b/<build>/<source path>.json.js)
const lazyModule = (file) => join(code, rel(file) + '.js');

rmSync(out, { recursive: true, force: true });
const result = await build({
  entryPoints: [join(root, ENTRY)], outdir: ENTRY_DIR, entryNames: '[name]',
  bundle: true, splitting: false, format: 'esm', target: 'es2022', minify: true, keepNames: true, legalComments: 'none', metafile: true,
  external: ['three', 'three/*'], logLevel: 'warning', charset: 'utf8',
  plugins: [{ name: 'v3', setup(b) {
    b.onResolve({ filter: /\.json$/ }, (args) => {
      if (args.kind !== 'dynamic-import') return undefined;
      const file = resolve(args.resolveDir, args.path); lazyJson.add(file);
      const spec = relative(ENTRY_DIR, lazyModule(file)).split('\\').join('/');
      return { path: spec.startsWith('.') ? spec : './' + spec, external: true };
    });
    b.onLoad({ filter: CODE }, (args) => ({ contents: rewrite(args.path, readFileSync(args.path, 'utf8')), loader: args.path.endsWith('.ts') ? 'ts' : 'js' }));
  } }],
});
for (const f of lazyJson) {
  mkdirSync(dirname(lazyModule(f)), { recursive: true });
  writeFileSync(lazyModule(f), `export default ${JSON.stringify(JSON.parse(readFileSync(f, 'utf8')))};\n`);
}
for (const a of assets) cpSync(a, join(out, rel(a)), { recursive: true });
cpSync(join(root, 'data'), join(out, 'data'), { recursive: true });
if (existsSync(join(root, 'public'))) cpSync(join(root, 'public'), out, { recursive: true });   // root-absolute files V1 names by URL (/weapons/shapes/, /game/fonts/)
const html = readFileSync(join(root, 'index.html'), 'utf8').replaceAll('./src/', `./b/${id}/src/`);
if (!html.includes(`./b/${id}/src/client/main.js`)) throw new Error('index.html: entry script not found');
writeFileSync(join(out, 'index.html'), html);
writeFileSync(join(out, 'build.txt'), id);

// V1's production GLB packing (scripts/optimize-glb.mjs, copied from V1 as it is): meshopt-coded buffers, int8 normals and uint8 skin
// weights, unused images dropped, JPEGs recoded losslessly by jpegtran. The Centurion's two files come out as V1's live site serves them
// (carriers-veteran.glb byte for byte; veteran.glb the same but with every image kept inside, where V1 moves two shared ones to their own files).
// The hero's warrior.glb (V1's 27 clips + Dom's picks, #19) is packed the same way, as V1's live hero is; its animation stays bit-exact, and
// the sim's blade sweeps are baked data (blade-paths.ts, blade-picks.ts), never read from the GLB.
// Only the dist copy is packed: the sources stay plain for Blender and the bakes (scripts/hero-clips/*).
// ?load=v1 does not unpack them: the loaders have had the meshopt decoder since V1.
// Psyche (the hero since 2026-10-26) is packed the same way as warrior.glb (?hero=v1).
const PACKED = ['src/assets/psyche.glb', 'src/assets/warrior.glb', 'src/assets/veteran.glb', 'src/assets/loot/carriers-veteran.glb'];
for (const glb of PACKED) {
  const target = join(out, glb);
  if (existsSync(target)) writeFileSync(target, await optimizeGlb(readFileSync(target)));
}

// Content-hashed art (2026-10-26: a phone kept the pre-#19 warrior.glb, the old hero clips, for a day, because art sat at fixed paths
// cached a day). Every art file outside b/ (after packing, so the hash is of the bytes served) gets a copy named <name>.<sha256 8 hex>.<ext>
// beside it; the bundle's artUrl map (src/art-url.ts) and the stylesheet's url()s name the copies. nginx caches those names for good and
// revalidates the plain paths (kept for anything that names a file directly), so a changed file is a new URL and an unchanged one stays
// cached across deploys. The .gz twins below are made for the hashed names too.
const files = (p) => statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => files(join(p, f))) : [p];
const ART = /\.(glb|ogg|m4a|png|webp|jpg|woff2)$/;
const artMap = {};
for (const f of files(out).filter((f) => ART.test(f) && !relative(out, f).startsWith('b/'))) {
  const hashed = f.replace(/(\.[^./]+)$/, `.${createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 8)}$1`);
  cpSync(f, hashed);
  artMap['/' + relative(out, f).split('\\').join('/')] = '/' + relative(out, hashed).split('\\').join('/');
}
const mainJs = join(ENTRY_DIR, 'main.js'), PLACEHOLDER = /(["'`])__V3_ART_MANIFEST__\1/g, bundle = readFileSync(mainJs, 'utf8');
if ((bundle.match(PLACEHOLDER) || []).length !== 1) throw new Error('main.js: art manifest placeholder not found exactly once');
writeFileSync(mainJs, bundle.replace(PLACEHOLDER, () => JSON.stringify(JSON.stringify(artMap))));
for (const css of ENTRY_CSS) {   // stylesheets ride the build's folder, as the code does; their root-absolute url()s name the hashed copies
  writeFileSync(join(code, css), readFileSync(join(root, css), 'utf8').replace(/url\((['"]?)(\/[^)'"]+)\1\)/g, (m, q, p) => artMap[p] ? `url(${q}${artMap[p]}${q})` : m));
}

// .gz twins, only where they save something (gzip_static falls back to the plain file, gzipped on the fly or not at all)
let raw = 0, packed = 0;
for (const f of files(out).filter((f) => GZ.test(f))) {
  const body = readFileSync(f), gz = gzipSync(body, { level: 9 });
  if (gz.length < body.length * 0.9) { writeFileSync(f + '.gz', gz); raw += body.length; packed += gz.length; }
}

const main = join(ENTRY_DIR, 'main.js'), kb = (n) => (n / 1024).toFixed(0);
console.log(`dist/ build ${id}: ${Object.keys(result.metafile.inputs).length} sources -> main.js ${kb(statSync(main).size)} KB (gzip ${kb(statSync(main + '.gz').size)} KB) + ${lazyJson.size} lazy JSON modules, assets ${assets.size}, art files hashed ${Object.keys(artMap).length}; .gz twins ${(raw / 1048576).toFixed(1)} MB -> ${(packed / 1048576).toFixed(1)} MB`);
