// Plain (non-DEFERRED) allow rows are shrink-only per file and kind (baseline.json allowTotals): an allow row cannot be how a value stays in code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../scripts/as-data/check.mjs';

const F = 'src/audio/a.ts';
const row = (literal, reason = 'Wire constant of the protocol, never moved') => ({ file: F, kind: 'number', literal, reason });

function tree(text, allow, allowTotals) {
  const root = mkdtempSync(join(tmpdir(), 'asdata-ar-'));
  mkdirSync(join(root, 'src/audio'), { recursive: true });
  writeFileSync(join(root, F), text);
  writeFileSync(join(root, 'scope.json'), JSON.stringify({ globs: ['src/*.ts', 'src/**/*.ts'], legacy: [] }));
  writeFileSync(join(root, 'allow.json'), JSON.stringify({ allow, files: [] }));
  writeFileSync(join(root, 'baseline.json'), JSON.stringify({ counts: {}, totals: {}, ...(allowTotals ? { allowTotals } : {}) }));
  return { root, opts: { scopeFile: join(root, 'scope.json'), allowFile: join(root, 'allow.json'), baselineFile: join(root, 'baseline.json') } };
}
const check = (t, fn) => { try { return fn(run(t.root, t.opts)); } finally { rmSync(t.root, { recursive: true }); } };

test('plain allow rows at their recorded count pass, and the area column counts them', () => {
  check(tree('const a = 5, b = 6;\n', [row('5'), row('6')], { [F]: { number: 2 } }), (r) => {
    assert.deepEqual(r.problems, []);
    assert.equal(r.areas.audio.plain, 2);
    assert.deepEqual(r.allowTotals, { [F]: { number: 2 } });
  });
});

test('adding a plain allow row fails: lower another in that file or move a value into data', () => {
  check(tree('const a = 5, b = 6;\n', [row('5'), row('6')], { [F]: { number: 1 } }), (r) => assert.match(r.problems.join('\n'), /src\/audio\/a\.ts: 2 plain number allow row\(s\), the baseline says 1: a new allow row needs the same PR to lower another in that file or move a value into data/));
  check(tree('const a = 5;\n', [row('5')]), (r) => assert.match(r.problems.join('\n'), /1 plain number allow row\(s\), the baseline says 0/), 'no recorded count is zero');
});

test('lowering a plain allow row demands the baseline drop', () => {
  check(tree('const a = 5;\n', [row('5')], { [F]: { number: 3 } }), (r) => assert.match(r.problems.join('\n'), /baseline allowTotals says 3 x number allow row\(s\), there are 1: lower scripts\/as-data\/baseline\.json/));
});

test('a DEFERRED row is backlog, not a plain row; a reason under 12 characters still fails', () => {
  check(tree('const a = 5;\n', [row('5', 'DEFERRED (tuning): to move to a row')], { [F]: { number: 0 } }), (r) => { assert.ok(!r.problems.some((p) => /plain \w+ allow/.test(p))); assert.equal(r.areas.audio.plain, 0); });
  check(tree('const a = 5;\n', [row('5', 'short')], { [F]: { number: 1 } }), (r) => assert.match(r.problems.join('\n'), /needs a real reason \(12\+ characters\)/));
});

test('--write-baseline refuses to raise the plain allow count and lowers it when it dropped', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'asdata-wb-')));   // the script runs only when argv[1] equals its real path (macOS /var is a link)
  try {
    mkdirSync(join(dir, 'src'), { recursive: true });
    mkdirSync(join(dir, 'scripts/as-data'), { recursive: true });
    writeFileSync(join(dir, 'src/a.ts'), 'const a = 5, b = 6;\n');
    writeFileSync(join(dir, 'scripts/as-data/check.mjs'), readFileSync(new URL('../scripts/as-data/check.mjs', import.meta.url)));
    writeFileSync(join(dir, 'scripts/as-data/scope.json'), JSON.stringify({ globs: ['src/*.ts'], legacy: [] }));
    const two = [{ ...row('5'), file: 'src/a.ts' }, { ...row('6'), file: 'src/a.ts' }];
    const gate = (rows, n) => {
      writeFileSync(join(dir, 'scripts/as-data/allow.json'), JSON.stringify({ allow: rows, files: [] }));
      writeFileSync(join(dir, 'scripts/as-data/baseline.json'), JSON.stringify({ counts: {}, totals: {}, allowTotals: { 'src/a.ts': { number: n } } }));
      return spawnSync(process.execPath, [join(dir, 'scripts/as-data/check.mjs'), '--write-baseline'], { encoding: 'utf8' });
    };
    const raise = gate(two, 1);
    assert.equal(raise.status, 1, 'raising is refused');
    assert.match(raise.stderr, /not writing the baseline[\s\S]*plain number allow rows 2 > 1/);
    writeFileSync(join(dir, 'src/a.ts'), 'const a = 5;\n');   // the value moved into data: its allow row goes with it
    const lower = gate(two.slice(0, 1), 2);
    assert.equal(lower.status, 0, 'lowering is written');
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'scripts/as-data/baseline.json'), 'utf8')).allowTotals, { 'src/a.ts': { number: 1 } });
  } finally { rmSync(dir, { recursive: true }); }
});

test('the shipped baseline records every plain allow row of allow.json', () => {
  const allow = JSON.parse(readFileSync(new URL('../scripts/as-data/allow.json', import.meta.url), 'utf8')).allow.filter((a) => !/^DEFERRED\b/.test(a.reason.trim()));
  const base = JSON.parse(readFileSync(new URL('../scripts/as-data/baseline.json', import.meta.url), 'utf8')).allowTotals;
  assert.equal(Object.values(base).flatMap(Object.values).reduce((a, b) => a + b, 0), allow.length);
});
