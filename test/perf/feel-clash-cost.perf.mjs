// PERF ROW (wall-clock budget): Mac only, run with MAC_HEAVY_OK=1 and load < 12 (check `uptime`). Never in CI or hfjob. Run: npm run perf:rows
// Moved out of test/feel-clash.test.mjs (Strategy ruling B): a quiet clash frame costs under the row's perf.frameBudgetMs * 4.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClash } from '../../src/fight/feel-clash.ts';

const ROWS = JSON.parse(readFileSync(new URL('../../data/feel-clash.json', import.meta.url), 'utf8'));
const skip = process.env.MAC_HEAVY_OK === '1' ? false : 'perf row: set MAC_HEAVY_OK=1 (Mac only, load < 12)';

test('a quiet clash frame costs under the row\'s frame budget (x4)', { skip }, () => {
  const fc = createClash(ROWS), emit = () => {};
  const rd = { state: 'alive', applyImpulse: () => {}, stagger: () => {}, setMotorStrength: () => {} };
  const t0 = performance.now();
  for (let i = 0; i < 100; i++) fc.frame(1 / 60, [], { rd, emit });
  const per = (performance.now() - t0) / 100;
  console.log(`# quiet clash frame: ${per.toFixed(5)} ms (budget ${ROWS.perf.frameBudgetMs * 4})`);
  assert.ok(per < ROWS.perf.frameBudgetMs * 4, `${per} ms`);
});
