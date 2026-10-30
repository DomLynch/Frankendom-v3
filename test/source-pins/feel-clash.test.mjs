// SOURCE PINS moved out of test/feel-clash.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - the module never reaches the sim: it imports the event type only, no sim module is changed by it
//      wiring + absence pin (src/fight/feel-clash.ts): pins what the module's source imports or names (an import boundary, a list of row keys it must read); the module imports under node, but no runtime observes an import edge or an unread key, so the text check stays

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the module never reaches the sim: it imports the event type only, no sim module is changed by it (source pin)', () => {
  const src = readFileSync(new URL('../../src/fight/feel-clash.ts', import.meta.url), 'utf8');
  assert.match(src, /import type \{ CombatEvent \} from '\.\/duel\.ts'/);
  assert.doesNotMatch(src, /import \{[^}]*\} from '\.\/duel\.ts'/);
  assert.doesNotMatch(src, /from '\.\/(sim|moves)\.ts'/);
});

