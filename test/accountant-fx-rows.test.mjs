// The look and tuning numbers that used to be literals in src/fight/mechanics (as-data gate, Dom: zero hard-coding) are rows now. Each value is pinned here byte for byte to the literal it replaced
// (read from git 7c03442d: accountant-parry-wall-fx.ts, envoy-latch-fx.ts, line-fx.ts, nan-impale.ts, accountant-parry-wall.ts), and the validator range-checks each one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateMechanics } from '../src/sim/validate.js';
import { loadLineLook } from '../src/fight/mechanics/line-fx.ts';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const RAW = read('../data/mechanics.json'), clone = (x) => JSON.parse(JSON.stringify(x));
const rows = RAW.mechanics;

const WALL_OLD = { ledgerLines: 6, texturePx: 64, ruleThicknessPx: 2, marginFrac: 0.2, ringInnerFrac: 0.88, ringSegments: 48, mapTint: '#ffffff', renderOrder: 6, sparkRenderOrder: 7, sparkPoolParries: 4, ringLiftM: 0.03,
  ringTellGain: 2.5, ringUpBoost: 0.25, ringPulseMin: 0.6, ringPulseDepth: 0.4, minRise: 0.01, tellRiseShare: 0.5, sparkBackShare: 0.6, sparkSwirlShare: 0.5, sparkArcShare: 0.6, sparkLiftShare: 0.3, parkY: -100 };

test('accountant wall fx: every moved literal is its row, byte for byte (colours unchanged)', () => {
  const fx = rows['accountant-parry-wall'].fx;
  for (const [k, v] of Object.entries(WALL_OLD)) assert.strictEqual(fx[k], v, `fx.${k}`);
  assert.strictEqual(fx.colour, '#f2c14e'); assert.strictEqual(fx.edgeColour, '#fff0b8');
  assert.strictEqual(parseInt(fx.mapTint.slice(1), 16), 0xffffff, 'the textured wall tint is the old 0xffffff');
  assert.strictEqual(rows['accountant-parry-wall'].breakMove, 'kick');
});

test('accountant wall fx: the validator range-checks each new field and refuses an unknown one', () => {
  assert.deepEqual(validateMechanics(clone(RAW)), []);
  const bad = (f) => { const r = clone(RAW); f(r.mechanics['accountant-parry-wall']); return validateMechanics(r); };
  const refused = [['ledgerLines', 99], ['texturePx', 4], ['ruleThicknessPx', 0], ['ringSegments', 3], ['renderOrder', -1], ['sparkRenderOrder', 99], ['sparkPoolParries', 0], ['mapTint', 'white'],
    ['marginFrac', 2], ['ringInnerFrac', -0.1], ['ringPulseMin', 1.5], ['ringPulseDepth', 1.5], ['tellRiseShare', 2], ['sparkBackShare', 2], ['sparkSwirlShare', 2], ['sparkArcShare', 2], ['sparkLiftShare', 2],
    ['ringLiftM', 5], ['ringTellGain', 99], ['ringUpBoost', 5], ['minRise', 0], ['parkY', 5]];
  for (const [k, v] of refused) assert.match(bad((r) => { r.fx[k] = v; }).join('\n'), new RegExp(`fx\\.${k}`), `fx.${k} = ${v} is refused`);
  assert.match(bad((r) => { r.fx.surprise = 1; }).join('\n'), /fx\.surprise: unknown key/);
  assert.match(bad((r) => { r.breakMove = 'Kick!'; }).join('\n'), /breakMove/);
  assert.match(bad((r) => { delete r.fx.parkY; }).join('\n'), /fx\.parkY/);
});

test('envoy tell: the line fx numbers are rows equal to the old literals', () => {
  const t = rows['envoy-latch'].tell;
  assert.deepEqual([t.renderOrder, t.alphaFloor, t.alphaRise, t.pulseBase, t.pulseDepth], [5, 0.35, 0.65, 0.8, 0.2]);
  const bad = (f) => { const r = clone(RAW); f(r.mechanics['envoy-latch'].tell); return validateMechanics(r).join('\n'); };
  assert.match(bad((x) => { x.renderOrder = 99; }), /tell\.renderOrder/);
  for (const k of ['alphaFloor', 'alphaRise', 'pulseBase', 'pulseDepth']) assert.match(bad((x) => { x[k] = 2; }), new RegExp(`tell\\.${k}`));
});

test("nan's impale: the five moved tuning numbers are rows equal to the old literals", () => {
  const r = rows['nan-impale'];
  assert.deepEqual([r.giveUpTicks, r.wallPadM, r.lineOvershootM, r.lungeGraceTicks, r.attackStartTicks], [150, 0.3, 0.8, 90, 2]);
  for (const [k, v] of [['giveUpTicks', 0], ['wallPadM', 9], ['lineOvershootM', 9], ['lungeGraceTicks', 999], ['attackStartTicks', 99]]) {
    const c = clone(RAW); c.mechanics['nan-impale'][k] = v;
    assert.match(validateMechanics(c).join('\n'), new RegExp(`nan-impale\\.${k}`), `${k} = ${v} is refused`);
  }
});

test('the ground line look (line-fx-defs.json) equals the old constants, and the loader refuses a bad row', () => {
  const d = read('../src/fight/mechanics/line-fx-defs.json');
  assert.strictEqual(parseInt(d.colour.slice(1), 16), 0xc9402a);
  assert.deepEqual([d.followWidth, d.followWidthRise, d.followAlpha, d.lockAlpha, d.lungeAlpha, d.liftM, d.renderOrder, d.pulseBase, d.pulseDepth, d.pulseRate, d.hideBelowAlpha, d.meshName],
    [0.4, 0.6, 0.28, 0.62, 0.8, 0.04, 5, 0.8, 0.2, 0.9, 0.01, 'mechanic line']);
  assert.equal(loadLineLook(d).followAlpha, 0.28);
  assert.throws(() => loadLineLook({ ...d, lockAlpha: 2 }), /lockAlpha/);
  assert.throws(() => loadLineLook({ ...d, liftM: -1 }), /liftM/);
  assert.throws(() => loadLineLook({ ...d, colour: 'red' }), /colour/);
  const { pulseRate: _x, ...missing } = d;
  assert.throws(() => loadLineLook(missing), /pulseRate/);
});
