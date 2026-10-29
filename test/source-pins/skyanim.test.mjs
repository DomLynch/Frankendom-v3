// SOURCE PINS moved out of test/skyanim.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - the layers wired to rows: every layer has an on row, and a layer that looks poor ships off
//      wiring pin (src/fight/skyanim.ts): pins what the module's source imports or names (an import boundary, a list of row keys it must read); the module imports under node, but no runtime observes an import edge or an unread key, so the text check stays [the behaviour half stays in the original test]
//  - sky life is presentation only and costs a clock: the shader gains the lines, ?skyanim=off stills all four, each effect row off stills just that one
//      wiring pin (src/fight/skyanim.ts): pins what the module's source imports or names (an import boundary, a list of row keys it must read); the module imports under node, but no runtime observes an import edge or an unread key, so the text check stays [the behaviour half stays in the original test]
//  - pack 2 rows: eyes, drool and the planet sphere validate, each effect has its own on, bad rows are refused
//      absence pin (src/fight/skyanim.ts): a grep gate, dead or forbidden code must not come back; no runtime can observe an absence [the behaviour half stays in the original test]
//  - planet sphere: the turn wraps once per secondsPerTurn, ?skyanim=off holds it still, sphere.on false is the rollback, the shader wraps the surface and 
//      wiring pin (src/fight/skyanim.ts): pins what the module's source imports or names (an import boundary, a list of row keys it must read); the module imports under node, but no runtime observes an import edge or an unread key, so the text check stays [the behaviour half stays in the original test]

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the layers wired to rows: every layer has an on row, and a layer that looks poor ships off (source pin)', () => {

  const src = readFileSync(new URL('../../src/fight/skyanim.ts', import.meta.url), 'utf8');
  for (const k of ['secondsPerTurn', 'swingDegrees', 'frameSeconds', 'periodSeconds', 'sweepSeconds', 'spreadTexels', 'twinkle', 'readyTimeoutSeconds', 'respectReducedMotion', 'pulseSeconds', 'orbitSeconds', 'rects']) assert.match(src, new RegExp(`\\b${k}\\b`), k);
});

test('sky life is presentation only and costs a clock: the shader gains the lines, ?skyanim=off stills all four, each effect row off stills just that one (source pin)', () => {

  const src = readFileSync(new URL('../../src/fight/skyanim.ts', import.meta.url), 'utf8');
  for (const k of ['featherFraction', 'amplitudePx', 'durationSeconds', 'minGapSeconds', 'maxGapSeconds', 'firstDelaySeconds', 'anchors', 'radiusU']) assert.match(src, new RegExp(`\\b${k}\\b`), k);
});

test('pack 2 rows: eyes, drool and the planet sphere validate, each effect has its own on, bad rows are refused (source pin)', () => {

  assert.doesNotMatch(readFileSync(new URL('../../src/fight/skyanim.ts', import.meta.url), 'utf8'), /\* 0\.85 \*|ss \* 0\.12|ss \* 0\.1\)/, 'the glint shape is rows, not literals');
});

test('planet sphere: the turn wraps once per secondsPerTurn, ?skyanim=off holds it still, sphere.on false is the rollback, the shader wraps the surface and keeps the cut-out alpha; eyes and drop stop under off (source pin)', () => {

  const src = readFileSync(new URL('../../src/fight/skyanim.ts', import.meta.url), 'utf8');
  for (const k of ['secondsPerTurn', 'startTurns', 'discFraction', 'featherPx', 'holdMinSeconds', 'everyEvents', 'spawnMinSeconds', 'fallDistancePx', 'accelPx', 'stretchFromSpeedPx', 'fadeOutPx', 'waves']) assert.match(src, new RegExp(`\\b${k}\\b`), k);
  assert.match(src, /RepeatWrapping/); assert.match(src, /ClampToEdgeWrapping/);
});

