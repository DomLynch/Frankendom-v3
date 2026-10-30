// Strategy ruling B: the default suite is deterministic, so no test/**/*.test.mjs asserts elapsed wall-clock time (a timing budget on a shared CPU node is noise).
// Timing budgets live in test/perf/*.perf.mjs (npm run perf:rows, Mac only). This guard reads the test sources and fails on a clock call that is subtracted from
// (or subtracted from another clock call) -- the shape of an elapsed-time measurement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const ROOT = new URL('./', import.meta.url);
// radar-flash uses performance.now() as an INPUT clock (a flash armed 300 ms ago), not as a measurement.
// (This file is listed too: its self-test strings contain the shapes it hunts.)
const ALLOW = new Set(['radar-flash.test.mjs', 'no-wall-clock-asserts.test.mjs']);
const CLOCK = String.raw`(?:performance\.now\(\)|Date\.now\(\)|process\.hrtime(?:\.bigint)?\([^)]*\)|hrtime(?:\.bigint)?\([^)]*\))`;

function sources(dir = ROOT, rel = '') {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (e.name !== 'perf' && e.name !== 'node_modules') out.push(...sources(new URL(`${e.name}/`, dir), `${rel}${e.name}/`)); }
    else if (e.name.endsWith('.test.mjs')) out.push({ rel: rel + e.name, name: e.name, text: readFileSync(new URL(e.name, dir), 'utf8') });
  }
  return out;
}

// the offending shapes in one source: `<clock> - <ident or clock>` where the ident was set from a clock, or `<ident> - <clock-set ident>`, or `<clock> - <clock>`
export function elapsedShapes(text) {
  const vars = [...text.matchAll(new RegExp(String.raw`\b([A-Za-z_$][\w$]*)\s*=\s*${CLOCK}\s*[;,)]`, 'g'))].map((m) => m[1]);
  const hits = [];
  const bad = [new RegExp(String.raw`${CLOCK}\s*-\s*${CLOCK}`, 'g')];
  if (vars.length) {
    const v = `(?:${vars.join('|')})\\b`;
    bad.push(new RegExp(String.raw`${CLOCK}\s*-\s*${v}`, 'g'), new RegExp(String.raw`\b[A-Za-z_$][\w$]*\s*-\s*${v}`, 'g'));
  }
  for (const re of bad) for (const m of text.matchAll(re)) hits.push(m[0]);
  return hits;
}

test('no default-suite test asserts elapsed wall-clock time (those are test/perf rows)', () => {
  const offenders = sources().filter((s) => !ALLOW.has(s.name)).map((s) => [s.rel, elapsedShapes(s.text)]).filter(([, h]) => h.length);
  assert.deepEqual(offenders, [], 'move the timing assertion to test/perf/*.perf.mjs (npm run perf:rows)');
});

test('the guard itself: it flags an elapsed measurement and ignores an input clock', () => {
  assert.ok(elapsedShapes('const t0 = Date.now(); work(); assert.ok(Date.now() - t0 < 500);').length);
  assert.ok(elapsedShapes('const t0 = performance.now(); f(); assert.ok((performance.now() - t0) / 100 < 4);').length);
  assert.ok(elapsedShapes('const s = process.hrtime.bigint(); f(); const d = process.hrtime.bigint() - s;').length);
  assert.deepEqual(elapsedShapes('r.armFlash(performance.now() - 300);'), []);
  assert.deepEqual(elapsedShapes('const x = 5 - 3;'), []);
});

test('the allow list names a file that exists, so a rename cannot silently widen it', () => {
  const names = new Set(sources().map((s) => s.name));
  for (const a of ALLOW) assert.ok(names.has(a), `${a} is allow-listed but missing`);
});
