// The as-data gate (scripts/as-data/check.mjs): what it catches, what it names as exempt, and that the live tree is clean.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dataIds, run, scan } from '../scripts/as-data/check.mjs';

const kinds = (src, ids) => scan(src, new Set(ids)).map((f) => `${f.kind}:${f.literal}`);

test('the live tree is clean: no new finding, no stale allow row, no stale baseline count', () => {
  const r = run(new URL('..', import.meta.url).pathname);
  assert.deepEqual(r.problems, []);
  assert.ok(r.scanned >= 6, 'the scoped donor files are scanned');
});

test('a number past 0 and 1 is a finding: timers, caps, radii, fractions, hex', () => {
  assert.deepEqual(kinds('setTimeout(f, 2000); const CAP = 4; x > 0.5; r = 9.8; m = 0xff; n = 1_000_000;'), ['number:2000', 'number:4', 'number:0.5', 'number:9.8', 'number:0xff', 'number:1_000_000']);
  assert.deepEqual(kinds('const a = 0, b = 1, c = a + b; arr[0]; x === -1;'), [], '0, 1 and -1 are the identity numbers');
});

test('named exemptions are counted, never failures: Math.PI geometry and ms<->s', () => {
  const f = scan('a = Math.PI * 2; b = Math.PI / 2; c = 2 * Math.PI; d = ms / 1000; e = s * 1000;');
  assert.deepEqual(f.map((h) => h.kind), ['exempt', 'exempt', 'exempt', 'exempt', 'exempt']);
  assert.deepEqual(kinds('x = 2; y = a * 1000 + 60;'), ['number:2', 'number:60'], 'a bare 2 and 60 still count');
});

test('a label is a finding; diagnostics, imports and typeof are not', () => {
  assert.deepEqual(kinds("toast('You died'); const t = 'Killed';"), ['label:You died', 'label:Killed']);
  assert.deepEqual(kinds("console.warn('unknown zone x'); throw new Error('no zone here'); assert(ok, 'it must hold');"), []);
  assert.deepEqual(kinds("import a from './x.ts'; export { b } from './y.ts'; const m = await import('./z.ts'); typeof q === 'undefined';"), []);
  assert.deepEqual(kinds('const s = `You died in ${zone}`;'), ['label:You died in  ']);
  assert.deepEqual(kinds('const s = `${a}${b}`;'), []);
});

test("a compare against a string literal is a finding (=== !== == != case, either side)", () => {
  assert.deepEqual(kinds("if (k === 'pitborn') {} if (k !== 'x') {} if ('y' == k) {} switch (k) { case 'z': break; }"), ['compare:pitborn', 'compare:x', 'compare:y', 'compare:z']);
});

test('a string equal to a data id is a finding (the code names what the data already names)', () => {
  assert.deepEqual(kinds("spawn('pitborn'); const z = { id: 'yard' };", ['pitborn', 'yard']), ['data-id:pitborn', 'data-id:yard']);
  assert.deepEqual(kinds("const k = 'pitborn';"), [], 'with no ids given, only labels and compares are known');
});

test('comments, regexes and strings do not leak numbers or ids', () => {
  const src = "// 4 seconds\n/* 5 and 'Hello World' */\nconst re = /ab+c{3}/g; const d = a / b / c; const u = 'x/y';\n";
  assert.deepEqual(kinds(src), []);
});

test('line numbers follow the source, templates and comments included', () => {
  const f = scan("// one\n/* two\nthree */\nconst a = 7;\nconst s = `a\n${9}\n`;\n");
  assert.deepEqual(f.map((h) => [h.literal, h.line]), [['7', 4], ['9', 6]]);
});

test('dataIds reads the zone rows, the fight opponent and the brain ids from the tree', () => {
  const ids = dataIds(new URL('..', import.meta.url).pathname);
  for (const id of ['pitborn', 'yard', 'duel-pit', 'yard-pitborn']) assert.ok(ids.has(id), id);
  assert.ok(!ids.has('1'), 'the bare zone id "1" is too common a string to ban');
});

// a throwaway tree: scope, allow and baseline behave as the file says
function tree(files, { allow = [], baseline, legacy = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'asdata-'));
  mkdirSync(join(root, 'src/zone'), { recursive: true });
  mkdirSync(join(root, 'data/zones'), { recursive: true });
  for (const [f, text] of Object.entries(files)) writeFileSync(join(root, f), text);
  writeFileSync(join(root, 'scope.json'), JSON.stringify({ globs: ['src/zone/**'], legacy }));
  writeFileSync(join(root, 'allow.json'), JSON.stringify({ allow }));
  if (baseline) writeFileSync(join(root, 'baseline.json'), JSON.stringify({ counts: baseline }));
  return { root, opts: { scopeFile: join(root, 'scope.json'), allowFile: join(root, 'allow.json'), baselineFile: join(root, 'baseline.json') } };
}

test('a new file under src/zone with a hard-coded timer fails the gate; the same file with an allow row passes', () => {
  const { root, opts } = tree({ 'src/zone/a.ts': 'export const wait = () => setTimeout(go, 2000);\n' });
  try {
    const r = run(root, opts);
    assert.equal(r.problems.length, 1);
    assert.match(r.problems[0], /src\/zone\/a\.ts:1 number "2000" belongs in a data row/);
  } finally { rmSync(root, { recursive: true }); }
  const ok = tree({ 'src/zone/a.ts': 'export const wait = () => setTimeout(go, 2000);\n' }, { allow: [{ file: 'src/zone/a.ts', kind: 'number', literal: '2000', reason: 'a protocol timeout, not tuning' }] });
  try { assert.deepEqual(run(ok.root, ok.opts).problems, []); } finally { rmSync(ok.root, { recursive: true }); }
});

test('an allow row needs a real reason, and a row nothing matches is stale', () => {
  const t = tree({ 'src/zone/a.ts': 'export const a = 1;\n' }, { allow: [{ file: 'src/zone/a.ts', kind: 'number', literal: '9', reason: 'short' }] });
  try {
    const p = run(t.root, t.opts).problems.join('\n');
    assert.match(p, /needs a real reason/);
    assert.match(p, /stale allow entry src\/zone\/a\.ts number 9/);
  } finally { rmSync(t.root, { recursive: true }); }
});

test('the ratchet: a legacy file keeps its counted sites, a new one is red, a removed one makes the baseline stale', () => {
  const src = 'const a = 5; const b = 5;\n';
  const same = tree({ 'src/zone/old.ts': src }, { legacy: ['src/zone/old.ts'], baseline: { 'src/zone/old.ts': { 'number:5': 2 } } });
  try { assert.deepEqual(run(same.root, same.opts).problems, []); } finally { rmSync(same.root, { recursive: true }); }
  const grown = tree({ 'src/zone/old.ts': `${src}const c = 5;\n` }, { legacy: ['src/zone/old.ts'], baseline: { 'src/zone/old.ts': { 'number:5': 2 } } });
  try { assert.match(run(grown.root, grown.opts).problems.join('\n'), /old\.ts:2 number "5"/); } finally { rmSync(grown.root, { recursive: true }); }
  const shrunk = tree({ 'src/zone/old.ts': 'const a = 5;\n' }, { legacy: ['src/zone/old.ts'], baseline: { 'src/zone/old.ts': { 'number:5': 2 } } });
  try { assert.match(run(shrunk.root, shrunk.opts).problems.join('\n'), /baseline says 2 x number:5, the file has 1/); } finally { rmSync(shrunk.root, { recursive: true }); }
});

test('a baseline cannot shelter a file that is not legacy: new files start at zero', () => {
  const t = tree({ 'src/zone/new.ts': 'const a = 5;\n' }, { baseline: { 'src/zone/new.ts': { 'number:5': 1 } } });
  try {
    const p = run(t.root, t.opts).problems.join('\n');
    assert.match(p, /new\.ts:1 number "5"/);
    assert.match(p, /baseline names src\/zone\/new\.ts/);
  } finally { rmSync(t.root, { recursive: true }); }
});

test('a zone-code line that names a data id fails (the data row is the one place)', () => {
  const t = tree({ 'src/zone/b.ts': "export const first = spawn('yard-pitborn');\n", 'data/zones/z.row.json': JSON.stringify({ spawns: [{ id: 'yard-pitborn', kind: 'pitborn' }] }) });
  try { assert.match(run(t.root, t.opts).problems.join('\n'), /data-id "yard-pitborn"/); } finally { rmSync(t.root, { recursive: true }); }
});
