// The top-level data-layer shift: values that left src/*.ts for data rows keep their old numbers and text byte-for-byte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFile } from '../src/sim/validate.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(read(p));
const code = (p) => read(p).split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');   // the source without line comments

test('input.json detect.doubleTapMs is the 350 ms double-tap window src/zoom-guard.ts held, and the file validates', () => {
  const INPUT = json('data/input.json');
  assert.equal(INPUT.detect.doubleTapMs, 350);
  assert.deepEqual(validateFile('input', INPUT), []);
  assert.ok(!/\b350\b/.test(code('src/zoom-guard.ts')));
});

test('commentator.json: the minute window 60, the low-bar reset 15, the idle step 0.05 and the second star level 2 are the old literals', () => {
  const C = json('data/commentator.json');
  assert.equal(C.caps.minuteSeconds, 60);
  assert.equal(C.thresholds.lowResetPct, 15);
  assert.equal(C.thresholds.idleMoveEpsilon, 0.05);
  assert.equal(C.thresholds.starTwoLevel, 2);
  assert.deepEqual(validateFile('commentator', C), []);
  const src = code('src/commentator.ts');
  for (const gone of [/< 60\)/, /\+ 15\)/, /> 0\.05/, /star >= 2/]) assert.ok(!gone.test(src), String(gone));
});

test('retry.json: 3 attempts, 800 ms back-off and the MissingTextures text', () => {
  const R = json('data/retry.json');
  assert.equal(R.attempts, 3);
  assert.equal(R.delayMs, 800);
  assert.equal(R.missingTexturesMessage, 'Warrior textures did not load');
  assert.deepEqual(validateFile('retry', R), []);
  assert.ok(!/attempts = 3|delayMs = 800|Warrior textures/.test(code('src/retry.ts')));
});

test('stubs.json: the eleven weapon slots in their order and the two lesson lines', () => {
  const S = json('data/stubs.json');
  assert.deepEqual(S.weaponSlots, ['Trident', 'Cleaver', 'Knife', 'Estoc', 'Gladius', 'Scythe', 'Warhammer', 'Maul', 'Longsword', 'Bow', 'Staff']);
  assert.equal(S.lessonFell, 'You fell. That was the lesson.');
  assert.equal(S.lessonNext, 'Fight for real');
  assert.deepEqual(validateFile('stubs', S), []);
});

test('career-rules.json ladderRule: the ten titles in order and the first-fifty record version 27', () => {
  const L = json('src/core/career-rules.json').ladderRule[0];
  assert.deepEqual(L.titles, ['Recruit', 'Legionary', 'Gladiator', 'Veteran', 'Champion', 'Praetorian', 'Master', 'Primus', 'Invictus', 'Origin']);
  assert.equal(L.firstFiftyVersion, 27);
});

test('telemetry.json: the off reasons, the 60 s rate window and the 80-char dedupe key are the old literals', () => {
  const T = json('data/telemetry.json');
  assert.deepEqual(T.off.reasons, { localHost: 'local host', notDeployed: 'not a deployed build' });
  assert.equal(T.client.rateWindowMs, 60000);
  assert.equal(T.client.dedupeChars, 80);
  assert.deepEqual(validateFile('telemetry', T), []);
});

test('share-clip.json: watermark font and line height, the still quality, the revoke delay and the two message holds', () => {
  const S = json('data/share-clip.json');
  assert.equal(S.watermark.font, "600 {px}px Georgia, 'Times New Roman', serif");
  assert.equal(S.watermark.lineHeight, 1.4);
  assert.equal(S.file.stillQuality, 0.92);
  assert.equal(S.file.revokeSeconds, 60);
  assert.equal(S.button.failedSeconds, 3);
  assert.equal(S.button.savedSeconds, 2);
  assert.deepEqual(validateFile('share-clip', S), []);
});

test('corpse-run.json limits: the pile coordinate bound 100000 and the 20 lost weapons', () => {
  const C = json('data/corpse-run.json');
  assert.deepEqual(C.limits.pileCoordMax, [0, 100000]);
  assert.deepEqual(C.limits.lostMax, [0, 20]);
  assert.deepEqual(validateFile('corpse-run', C), []);
});

test('hit-stop-rules.json heavyRoles: the heavy hit is Hit and the heavy block is Blocked', () => {
  const H = json('src/hit-stop-rules.json');
  assert.deepEqual(H.heavyRoles, { hit: 'Hit', block: 'Blocked' });
  assert.ok(H.heavy.some((r) => r.id === 'Hit') && H.heavy.some((r) => r.id === 'Blocked'));
});
