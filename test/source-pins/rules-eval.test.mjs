// SOURCE PINS moved out of test/rules-eval.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - ?rules=m4b is M4 with only the wider-sample rungs (Strategy 2026-10-27); m4, v1 and the default are unchanged
//      wiring pin (src/fight/feel-limbs.ts): pins what the module's source imports or names (an import boundary, a list of row keys it must read); the module imports under node, but no runtime observes an import edge or an unread key, so the text check stays [the behaviour half stays in the original test]

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('?rules=m4b is M4 with only the wider-sample rungs (Strategy 2026-10-27); m4, v1 and the default are unchanged (source pin)', () => {

  // limbs reads the evaluator's part HP from window.__v3Rules whatever the rules query says, so m4b (an evaluator is built) feeds it like m4
  const limbsSrc = readFileSync(new URL('../../src/fight/feel-limbs.ts', import.meta.url), 'utf8');
  const from = limbsSrc.indexOf('function harnessFractions'), to = limbsSrc.indexOf('const hv = ');
  assert.ok(from >= 0 && to > from, 'both source markers are found (harnessFractions, then const hv)');
  const harness = limbsSrc.slice(from, to);
  assert.ok(harness.includes('__v3Rules') && !harness.includes('URLSearchParams') && !harness.includes('location'), 'harnessFractions does not look at the rules query');
});

