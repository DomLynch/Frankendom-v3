// The widened as-data gate: per-file total ratchet, whole-file exemptions, name-compare kind, summary table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, summaryTable } from '../scripts/as-data/check.mjs';

function tree(files, { allow = [], exemptFiles = [], totals = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'asdata-w-'));
  mkdirSync(join(root, 'src/audio'), { recursive: true });
  for (const [f, text] of Object.entries(files)) writeFileSync(join(root, f), text);
  writeFileSync(join(root, 'scope.json'), JSON.stringify({ globs: ['src/*.ts', 'src/**/*.ts'], exclude: ['**/*.d.ts'], legacy: [] }));
  writeFileSync(join(root, 'allow.json'), JSON.stringify({ allow, files: exemptFiles }));
  writeFileSync(join(root, 'baseline.json'), JSON.stringify({ counts: {}, totals }));
  return { root, opts: { scopeFile: join(root, 'scope.json'), allowFile: join(root, 'allow.json'), baselineFile: join(root, 'baseline.json') } };
}
const check = (t, fn) => { try { return fn(run(t.root, t.opts)); } finally { rmSync(t.root, { recursive: true }); } };

const OLD = 'src/audio/a.ts';

test('a file at its recorded total passes; a new hit in a legacy file fails', () => {
  check(tree({ [OLD]: 'const a = 5, b = 6;\n' }, { totals: { [OLD]: { number: 2 } } }), (r) => assert.deepEqual(r.problems, []));
  check(tree({ [OLD]: 'const a = 5, b = 6, c = 7;\n' }, { totals: { [OLD]: { number: 2 } } }), (r) => {
    assert.equal(r.problems.length, 1);
    assert.match(r.problems[0], /src\/audio\/a\.ts: number count 3 is over the baseline 2/);
  });
});

test('a new kind in a legacy file fails, and a file with no row starts at zero', () => {
  check(tree({ [OLD]: "const a = 5; const s = 'You died';\n" }, { totals: { [OLD]: { number: 1 } } }), (r) => assert.match(r.problems.join('\n'), /label "You died" belongs in a data row/));
  check(tree({ 'src/fresh.ts': 'const a = 5;\n' }), (r) => assert.match(r.problems.join('\n'), /src\/fresh\.ts:1 number "5" belongs in a data row/));
});

test('a drop demands a lower baseline', () => {
  check(tree({ [OLD]: 'const a = 5;\n' }, { totals: { [OLD]: { number: 3 } } }), (r) => assert.match(r.problems.join('\n'), /baseline says 3 x number, the file has 1: lower scripts\/as-data\/baseline\.json/));
});

test('name-compare is its own kind: a branch on an id string ratchets apart from other compares', () => {
  check(tree({ [OLD]: "if (k === 'minotaur') {} if (k === '') {} if (k === '#fff') {}\n" }, { totals: { [OLD]: { 'name-compare': 1 } } }), (r) => {
    const p = r.problems.join('\n');
    assert.match(p, /compare "#fff" belongs in a data row/, 'the non-id compare is a different kind');
    assert.ok(!/minotaur/.test(p), 'the one name-compare is within its total');
  });
});

test('an exempt-file row skips that kind for that file only; other kinds still count', () => {
  const ex = [{ file: OLD, kind: 'number', category: 'baked-geometry', reason: 'generated sweep table, not tuning' }];
  check(tree({ [OLD]: "const a = [5, 6, 7]; const s = 'You died';\n" }, { exemptFiles: ex }), (r) => {
    assert.equal(r.problems.length, 1);
    assert.match(r.problems[0], /label "You died" belongs/);
    assert.equal(r.areas.audio.exempt, 3);
  });
});

test('a stale exempt row fails (the file has no hit of that kind)', () => {
  const ex = [{ file: OLD, kind: 'number', category: 'baked-geometry', reason: 'generated sweep table, not tuning' }];
  check(tree({ [OLD]: 'const a = 1;\n' }, { exemptFiles: ex }), (r) => assert.match(r.problems.join('\n'), /stale exempt file src\/audio\/a\.ts number/));
  check(tree({ [OLD]: 'const a = 5;\n' }, { exemptFiles: [{ ...ex[0], file: 'src/audio/gone.ts' }] }), (r) => assert.match(r.problems.join('\n'), /stale exempt file src\/audio\/gone\.ts/));
});

test('a reasonless or untagged exempt row fails', () => {
  const base = { file: OLD, kind: 'number', category: 'baked-geometry', reason: 'generated sweep table, not tuning' };
  check(tree({ [OLD]: 'const a = 5;\n' }, { exemptFiles: [{ ...base, reason: 'short' }] }), (r) => assert.match(r.problems.join('\n'), /needs a real reason/));
  check(tree({ [OLD]: 'const a = 5;\n' }, { exemptFiles: [{ ...base, category: undefined }] }), (r) => assert.match(r.problems.join('\n'), /needs a category tag/));
  check(tree({ [OLD]: 'const a = 5;\n' }, { exemptFiles: [{ ...base, category: 'because' }] }), (r) => assert.match(r.problems.join('\n'), /needs a category tag/));
});

test('.d.ts files are out of scope, and the summary table has a row per area plus a total', () => {
  check(tree({ [OLD]: 'const a = 5;\n', 'src/types.d.ts': 'declare const x: 9;\n' }, { totals: { [OLD]: { number: 1 } } }), (r) => {
    assert.deepEqual(r.problems, []);
    assert.equal(r.scanned, 1);
    const t = summaryTable(r);
    assert.match(t, /^area/);
    assert.match(t, /\naudio\s+1\s+1\s/);
    assert.match(t, /\ntotal\s/);
  });
});
