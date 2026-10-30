// The fight HUD's own words moved from src/fight/hud.ts to data/hud-text.json (as-data gate, label kind): pinned byte-for-byte against the old literals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HUD_TEXT } from '../src/fight/hud-text.ts';
import { HINTS } from '../src/fight/practice-hints.ts';
import { validateFile } from '../src/sim/validate.js';

const FILE = JSON.parse(readFileSync(new URL('../data/hud-text.json', import.meta.url), 'utf8'));

test('hud-text.json validates', () => assert.deepEqual(validateFile('hud-text', FILE), []));

test('every word reads as the old literal did', () => {
  assert.deepEqual(HUD_TEXT, {
    about: HUD_TEXT.about, rematchTail: ' Ready for a rematch?', dummyNeverAttacks: 'The dummy never attacks.', zoneDied: 'You died.',
    stamina: { plain: 'Stamina', exhaustedMobile: 'Stamina · exhausted', woundMobile: 'Stamina · wound', exhaustedAria: 'Stamina — exhausted: no attacks or guard until it recovers', woundAria: 'Stamina — wounded: recovery reduced 20 percent' },
    attack: { fight: 'Fight', light: 'Light attack', mobileFight: 'Fight', mobileSlash: 'Slash' },
    reset: { playNow: 'PLAY NOW', next: 'Next fight', rematch: 'Rematch' },
  });
});

test('the edits the HUD makes still find their text in the practice lines', () => {
  assert.ok(HINTS.lines.defeated.endsWith(HUD_TEXT.rematchTail));
  assert.ok(HINTS.lines.beatLegend.endsWith(HUD_TEXT.rematchTail));
  assert.equal(HINTS.lines.fell, 'You fell. Rematch?');
  assert.equal(HINTS.lines.bothFell, 'You both fell. Rematch?');
});

test('a blank word is refused', () => {
  const bad = structuredClone(FILE); bad.reset.next = ' ';
  assert.match(validateFile('hud-text', bad).join('\n'), /reset\.next: must be a non-blank/);
});
