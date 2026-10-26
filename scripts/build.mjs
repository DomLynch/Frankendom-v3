// Builds the site into dist/: every source module compiled on its own to an ES module (esbuild, no bundle),
// served under b/<build>/ so a phone never runs a cached older module after a deploy. Data JSON imported by code
// becomes a .json.js module beside it (so it rides the same hashed path); binary assets (GLB, audio, textures)
// stay at stable root paths, so a deploy that does not touch them costs a repeat visitor nothing.
//   node scripts/build.mjs            -> dist/, build id "dev"
//   BUILD=<sha> node scripts/build.mjs -> dist/, build id <sha> (CI deploy)
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const out = join(root, 'dist');
const id = process.env.BUILD || 'dev';
const code = join(out, 'b', id);
const ENTRIES = ['src/client/main.ts'];
const ENTRY_CSS = ['src/style.css'];   // V1's stylesheet, linked from index.html
const CODE = /\.(ts|js|mjs)$/;

const rel = (p) => relative(root, p).split('\\').join('/');
// a relative specifier as it will be served: .ts compiles to .js, imported JSON becomes a .json.js module
const served = (spec) => spec.replace(/\.ts$/, '.js').replace(/\.json$/, '.json.js');

// The module graph from the entries, read off each file's import specifiers (static and dynamic).
function graph() {
  const seen = new Set(), json = new Set(), assets = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    // type-only imports and exports are erased by the compiler, so they are not edges of the served graph
    const src = readFileSync(file, 'utf8').replace(/^\s*(?:import|export)\s+type\b[^;]*;/gm, '');
    for (const m of src.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const target = resolve(dirname(file), m[1]);
      if (target.endsWith('.json')) json.add(target);
      else if (CODE.test(target)) visit(target);
    }
    // new URL('<relative>', import.meta.url): a fixed asset, or a template whose folder is copied whole
    for (const m of src.matchAll(/new URL\(\s*(['"`])(\.{1,2}\/[^'"`]*)\1\s*,\s*import\.meta\.url\s*\)/g)) {
      const spec = m[2], cut = spec.indexOf('${');
      const target = resolve(dirname(file), cut < 0 ? spec : spec.slice(0, spec.lastIndexOf('/', cut) + 1));
      if (existsSync(target)) assets.add(target);
    }
  };
  ENTRIES.forEach((e) => visit(join(root, e)));
  return { modules: [...seen], json: [...json], assets: [...assets] };
}

// Specifiers rewritten for the browser: relative .ts -> .js, .json -> .json.js (attributes dropped), and
// asset URLs made root-absolute so they resolve to the stable copy, not one under b/<build>/.
function rewrite(file, src) {
  return src
    .replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\2(\s*with\s*\{\s*type\s*:\s*['"]json['"]\s*\})?/g,
      (_, head, q, spec) => `${head}${q}${served(spec)}${q}`)
    .replace(/new URL\(\s*(['"`])(\.{1,2}\/[^'"`]*)\1\s*,\s*import\.meta\.url\s*\)/g,
      (_, q, spec) => `new URL(${q}/${rel(resolve(dirname(file), spec.replace(/\$\{/g, '\u0000'))).replace(/\u0000/g, '${')}${q}, import.meta.url)`);
}

rmSync(out, { recursive: true, force: true });
const { modules, json, assets } = graph();
await build({
  entryPoints: modules, outdir: join(code, 'src'), outbase: join(root, 'src'), format: 'esm', target: 'es2022', bundle: false,
  logLevel: 'warning', charset: 'utf8',
  plugins: [{ name: 'specifiers', setup(b) {
    b.onLoad({ filter: CODE }, (args) => ({ contents: rewrite(args.path, readFileSync(args.path, 'utf8')), loader: args.path.endsWith('.ts') ? 'ts' : 'js' }));
  } }],
});
for (const f of json) {
  const dest = join(code, rel(f) + '.js');
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, `export default ${JSON.stringify(JSON.parse(readFileSync(f, 'utf8')))};\n`);
}
for (const a of assets) cpSync(a, join(out, rel(a)), { recursive: true });
cpSync(join(root, 'data'), join(out, 'data'), { recursive: true });
if (existsSync(join(root, 'public'))) cpSync(join(root, 'public'), out, { recursive: true });   // root-absolute files V1 names by URL (/weapons/shapes/, /game/fonts/)
for (const css of ENTRY_CSS) cpSync(join(root, css), join(code, css));   // stylesheets ride the build's folder, as the code does
const html = readFileSync(join(root, 'index.html'), 'utf8').replaceAll('./src/', `./b/${id}/src/`);
if (!html.includes(`./b/${id}/src/client/main.js`)) throw new Error('index.html: entry script not found');
writeFileSync(join(out, 'index.html'), html);
writeFileSync(join(out, 'build.txt'), id);

const size = (p) => statSync(p).isDirectory() ? readdirSync(p).reduce((s, f) => s + size(join(p, f)), 0) : statSync(p).size;
console.log(`dist/ build ${id}: ${modules.length} modules + ${json.length} json, code ${(size(code) / 1024).toFixed(0)} KB, assets ${assets.length} (${(assets.reduce((s, a) => s + size(a), 0) / 1048576).toFixed(1)} MB)`);
