// The stub boundary (PLAN.md section 8, addition 2): nothing under src/ but src/stubs.ts may import V1's dropped systems — src/core/*
// (except registry.ts, and the core files stubs.ts itself passes through), src/net, src/zones, src/legends, src/pit. Every relative
// import is resolved to its file, so a path spelled any way is caught. Exit 1 with the offending lines.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const src = join(root, 'src');
const STUBS = join(src, 'stubs.ts');
import { forbidden } from './stub-patterns.mjs';   // the patterns (src/zones forbidden, V3's own src/zone/ allowed) live there so a test can pin them
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"]+)['"]/g;

const files = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.(ts|js|mjs)$/.test(f) ? [p] : []; });
const inCore = (file) => relative(root, file).startsWith('src/core/');   // V1's core files stubs.ts passes through may import each other
const bad = [];
for (const file of files(src)) {
  if (file === STUBS || inCore(file)) continue;
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    for (const m of line.matchAll(IMPORT)) {
      const target = relative(root, resolve(dirname(file), m[1])).split('\\').join('/');
      if (forbidden(target)) bad.push(`${relative(root, file)}:${i + 1}: imports ${target} (route it through src/stubs.ts)`);
    }
  });
}
if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
console.log('stub boundary: nothing outside src/stubs.ts imports core/*, net, zones, legends or pit');
