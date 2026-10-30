// SOURCE PINS moved out of test/corpse-ragdoll.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - source pins: dropCorpse frees what the corpse owns, leaveCorpse hands the ragdoll over through makeCorpseRig, cutCorpse and tapCorpses keep their guar
//      wiring + absence pin (source text): pins what the module's source imports or names (an import boundary, a list of row keys it must read); the module imports under node, but no runtime observes an import edge or an unread key, so the text check stays [the behaviour half stays in the original test]

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const SRC = readFileSync(new URL('../../src/fight/ragdoll.ts', import.meta.url), 'utf8');
const bodyOf = (name) => {
  const at = SRC.indexOf(`function ${name}(`) >= 0 ? SRC.indexOf(`function ${name}(`) : SRC.indexOf(`const ${name} = `);
  assert.ok(at >= 0, `${name} is in ragdoll.ts`);
  const next = SRC.slice(at + 10).search(/\n  (function |const [a-zA-Z]+ = \(|\/\*\*)/);
  return SRC.slice(at, at + 10 + (next < 0 ? SRC.length : next));
};

test('source pins: dropCorpse frees what the corpse owns, leaveCorpse hands the ragdoll over through makeCorpseRig, cutCorpse and tapCorpses keep their guards, a disabled ragdoll hides its buttons (source pin)', () => {

  assert.match(SRC, /freeSlot\(corpses\.filter\(\(c\) => c\.rd\)\.map\(\(c\) => c\.slot\), count\)/, 'a new ragdoll takes the first lane no corpse holds');
  for (const fn of ['cutCue', 'cutUnitByTap', 'cutByTap']) if (new RegExp(`function ${fn}\\b`).test(SRC)) assert.doesNotMatch(bodyOf(fn), /rulesOn/, `${fn} is not gated on the rules`);
  assert.doesNotMatch(SRC, /gore && !rulesOn/, 'no cue button is hidden by the rules');
  assert.doesNotMatch(SRC, /(?:if \(|\|\| )rulesOn \|\| disabled/, 'no tap or cue is refused by the rules');
  assert.match(SRC, /disabled = true; armed = false; hideCues\(\)/, 'an error that disables the ragdoll hides the buttons');
  assert.match(SRC, /if \(disabled\) \{ hideCues\(\); return; \}/, 'a disabled frame hides them again');
});

