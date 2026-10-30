// PERF ROW (wall-clock budget): Mac only, run with MAC_HEAVY_OK=1 and load < 12 (check `uptime`). Never in CI or hfjob. Run: npm run perf:rows
// Moved out of test/telemetry.test.mjs (Strategy ruling B): the 2000 failing events must stay cheap, but a timing assertion does not belong in the deterministic suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTelemetry } from '../../src/telemetry.ts';

const skip = process.env.MAC_HEAVY_OK === '1' ? false : 'perf row: set MAC_HEAVY_OK=1 (Mac only, load < 12)';

test('2000 events are cheap (< 500 ms) even when the network, the send and the storage all fail', { skip }, () => {
  const boom = () => { throw new Error('offline'); };
  const tel = createTelemetry({ search: '', hostname: 'v3.frankendom.com', doNotTrack: false, sha: 'cfb2909e0f1a2b3c', storage: { getItem: boom, setItem: boom }, send: boom, now: () => 1_000_000, randomId: () => 'rand-1-abcdef' });
  const t0 = Date.now();
  for (let i = 0; i < 2000; i++) tel.event('boss_death', { boss: 'a', sec: 1, heroHp: 0, bossHp: 1 });
  const ms = Date.now() - t0;
  console.log(`# 2000 failing events: ${ms} ms (budget 500)`);
  assert.ok(ms < 500, `${ms} ms`);
});
