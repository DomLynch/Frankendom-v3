// Gate 0: V3's src/fight must replay every input script tick for tick as V1's at the seed tag (harness.mjs). A row that fails names
// the config, seed, script, first differing tick and field. The two break checks prove the gate can fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONFIGS, SCRIPTS, compare, describe, intentsOf, loadSide, loadV1, loadV3, runSide } from './harness.mjs';
import { V1_DIR } from './extract.mjs';

const v1 = await loadV1(), v3 = await loadV3();
const career = CONFIGS.find((c) => c.id === 'career'), lightMash = SCRIPTS.find((s) => s.id === 'light-mash');

test('V1 at the seed tag is deterministic: every script replays the same against itself', () => {
  for (const config of CONFIGS) for (const seed of config.seeds) for (const script of SCRIPTS) {
    const r = compare(v1, v1, config, seed, script);
    assert.ok(r.same, describe(r));
  }
});

for (const config of CONFIGS) for (const seed of config.seeds) for (const script of SCRIPTS) {
  test(`gate 0: V3 = V1, ${config.id} seed ${seed} ${script.id}`, (t) => {
    const r = compare(v1, v3, config, seed, script);
    t.diagnostic(describe(r));
    assert.ok(r.same, describe(r));
    assert.ok(r.ticks[0] > 1, 'the script steps the fight');
  });
}

test('the picked-clip sweeps reach the sim: page-first-clips is a different fight from page-first-novice, and the switch goes back off', () => {
  const novice = CONFIGS.find((c) => c.id === 'page-first-novice'), clips = CONFIGS.find((c) => c.id === 'page-first-clips');
  const intents = intentsOf(lightMash, v3.record.quantizeIntent);
  const off = runSide(v3, novice, 731, intents), on = runSide(v3, clips, 731, intents), again = runSide(v3, novice, 731, intents);
  assert.notEqual(on.hash, off.hash, 'the picks must change where the blade meets the Centurion');
  assert.equal(again.hash, off.hash, 'a config without picks is V1\'s sweeps again');
});

test('deliberate break: one changed data value in a copy of V1 is reported as a DIFF at its tick and field', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate0-break-'));
  try {
    cpSync(join(V1_DIR, 'src'), join(dir, 'src'), { recursive: true });
    const file = join(dir, 'src', 'fight', 'move-defs.json'), text = readFileSync(file, 'utf8');
    const broken = text.replace(/("id":"light_right"[^\n]*?"damage":)14,/, '$115,');
    assert.notEqual(broken, text, 'the break applied');
    writeFileSync(file, broken);
    const r = compare(v1, await loadSide(dir), career, 731, lightMash);
    assert.equal(r.same, false, 'a light that hits for 15, not 14, must not pass');
    assert.ok(r.diff.tick > 1 && r.diff.path.length > 0, describe(r));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('deliberate break: one flipped intent is reported at the first tick it changes', () => {
  const idle = SCRIPTS.find((s) => s.id === 'idle'), at = 100;   // drawn and standing, the warden not yet on him: a guard press starts a guard that tick
  const intents = intentsOf(idle, v1.record.quantizeIntent), flipped = intents.slice();
  flipped[at] = { ...flipped[at], guard: true };
  const r = compare(v1, v1, career, 731, idle, { a: intents, b: flipped });
  assert.equal(r.same, false);
  assert.equal(r.diff.tick, at + 1, describe(r));
  assert.match(r.diff.path, /^\./, describe(r));
});
