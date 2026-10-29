// The as-data BACKLOG: allow rows whose reason starts with DEFERRED are counted apart, may only shrink, and the target is 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, isBacklog } from '../scripts/as-data/check.mjs';

function tree(text, allow, backlog) {
  const root = mkdtempSync(join(tmpdir(), 'asdata-b-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/a.ts'), text);
  writeFileSync(join(root, 'scope.json'), JSON.stringify({ globs: ['src/*.ts', 'src/**/*.ts'], exclude: [], legacy: [] }));
  writeFileSync(join(root, 'allow.json'), JSON.stringify({ allow, files: [] }));
  writeFileSync(join(root, 'baseline.json'), JSON.stringify({ counts: {}, totals: {}, ...(backlog === undefined ? {} : { backlog }) }));
  return { root, opts: { scopeFile: join(root, 'scope.json'), allowFile: join(root, 'allow.json'), baselineFile: join(root, 'baseline.json') } };
}
const check = (t, fn) => { try { return fn(run(t.root, t.opts)); } finally { rmSync(t.root, { recursive: true }); } };
const row = (reason) => [{ file: 'src/a.ts', kind: 'number', literal: '5', reason }];

test('isBacklog: only a reason that starts with the word DEFERRED', () => {
  assert.equal(isBacklog({ reason: 'DEFERRED (tuning): later' }), true);
  assert.equal(isBacklog({ reason: 'Math identity, not DEFERRED' }), false);
  assert.equal(isBacklog({ reason: 'Wire constant of the protocol' }), false);
});

test('a plain allow row is not backlog; the result counts none', () => {
  check(tree('const a = 5;\n', row('Wire constant of the protocol, never moved'), 0), (r) => { assert.deepEqual(r.problems, []); assert.equal(r.backlog, 0); });
});

test('adding a DEFERRED row fails the gate', () => {
  check(tree('const a = 5;\n', row('DEFERRED (tuning): to move to a row'), 0), (r) => {
    assert.equal(r.backlog, 1);
    assert.match(r.problems.join('\n'), /backlog: 1 DEFERRED allow row\(s\), the baseline says 0: a DEFERRED row cannot be added/);
  });
  check(tree('const a = 5;\n', row('DEFERRED (tuning): to move to a row')), (r) => assert.match(r.problems.join('\n'), /the baseline says 0/), 'no recorded backlog counts as 0');
});

test('a recorded backlog passes at its count and a shrink demands a lower baseline', () => {
  check(tree('const a = 5;\n', row('DEFERRED (tuning): to move to a row'), 1), (r) => assert.deepEqual(r.problems, []));
  check(tree('const a = 5;\n', row('Wire constant of the protocol, never moved'), 1), (r) => assert.match(r.problems.join('\n'), /backlog: baseline says 1 DEFERRED allow row\(s\), there are 0: lower scripts\/as-data\/baseline\.json/));
});

test('the shipped gate has no backlog (target 0) and the baseline records it', () => {
  const here = new URL('..', import.meta.url).pathname;
  const base = JSON.parse(readFileSync(join(here, 'scripts/as-data/baseline.json'), 'utf8'));
  assert.equal(base.backlog, 0);
  const r = run(here);
  assert.equal(r.backlog, 0);
  assert.deepEqual(r.problems, []);
});
