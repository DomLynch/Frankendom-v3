// DEFAULTS ON (Dom 2026-10-27: everything on the MAIN URL, no ?flags to test). Pins, from the shipped rows (like the 106-rig defaults test): each feature is ON with no query, each has
// its own ?x=v1 revert that turns it OFF (and only it), and the headless sim (Gate 0's tree, src/ alone) never reads these defaults. Presence is NOT in this list: it stays off.
//   ragdoll finishers  data/physics.json finisher {default physics}        revert ?ragdoll=v1
//   M4 hit/cut rules   INTERIM: data/rules.json default v1 (OFF by default), opt in ?rules=m4 until the evaluator's light-hit fall is fixed
//   feel hitreact / limbs / kick / clash   data/feel-defaults.json modules  revert ?hitreact=v1 ?limbs=v1 ?kick=v1 ?clash=v1, all: ?feel=v1
//   sim knockdown      data/feel-sim.json, rides the kick module            revert ?kick=v1 / ?feel=v1
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { validateFile } from '../src/sim/validate.js';
import { feelsOn } from '../src/fight/feel-defaults.ts';
import { FEEL_NAMES } from '../src/fight/feel-modules.ts';
import { activeFeels } from '../src/fight/feel.ts';
import { KNOCK_SIM, knockSimFor, setKnockSim } from '../src/fight/knock-sim.ts';
import { finisherModeFor } from '../src/fight/ragdoll.ts';
import { rulesOnFor } from '../src/fight/rules-eval.ts';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const PHYSICS = read('../data/physics.json'), RULES = read('../data/rules.json'), DEFAULTS = read('../data/feel-defaults.json'), SIM = read('../data/feel-sim.json');
const MODULES = ['hitreact', 'limbs', 'kick', 'clash'];
afterEach(() => setKnockSim(null));

test('the defaults row validates and names real modules, each with a revert query of its own', () => {
  assert.deepEqual(validateFile('feel-defaults', DEFAULTS), []);
  assert.deepEqual([...DEFAULTS.modules].sort(), [...MODULES].sort());
  for (const m of DEFAULTS.modules) {
    assert.ok(FEEL_NAMES.includes(m), `${m} is a module of the feel chunk`);
    assert.deepEqual(Object.keys(DEFAULTS.revert[m]).sort(), ['query', 'value'], m);
    assert.equal(DEFAULTS.revert[m].value, 'v1', `${m} reverts with ?${DEFAULTS.revert[m].query}=v1`);
  }
  assert.deepEqual(Object.keys(DEFAULTS.revert).sort(), [...DEFAULTS.modules].sort(), 'no revert for a module that is not a default');
  assert.equal(new Set(Object.values(DEFAULTS.revert).map((r) => r.query)).size, MODULES.length, 'every module has its own query');
  assert.equal(SIM.flag.query, DEFAULTS.query, 'the sim knockdown rides the same ?feel= name list');
  assert.ok(DEFAULTS.modules.includes(SIM.flag.value), 'and the module it rides (kick) is a default');
});

test('with no query every one of them is ON (read from the shipped rows)', () => {
  assert.equal(finisherModeFor(PHYSICS, ''), 'physics', 'ragdoll finishers: Split Crown / Opened ... play as physics cuts');
  assert.equal(PHYSICS.finisher.default, 'physics');
  assert.equal(rulesOnFor(RULES, ''), false, 'INTERIM (2026-10-27): M4 hit/cut rules are OFF by default: its evaluator torso pool dropped the foe on light hits; ?rules=m4 opts in; flip back only on the proven fix');
  assert.equal(RULES.default, RULES.v1);
  assert.deepEqual(feelsOn(DEFAULTS, ''), DEFAULTS.modules);
  for (const m of MODULES) assert.ok(feelsOn(DEFAULTS, '').includes(m), m);
  assert.notEqual(knockSimFor(SIM, '', DEFAULTS), null, 'the sim knockdown + finish window');
  assert.equal(knockSimFor(SIM, '?postkill=v1', DEFAULTS) !== null, true, 'the single fight (?postkill=v1) is a default page too: only the zone loop is off there');
});

test('each ?x=v1 revert turns off its own feature and nothing else', () => {
  assert.equal(finisherModeFor(PHYSICS, '?ragdoll=v1'), 'skip', 'ragdoll finishers off: the plain ragdoll death, as before today');
  assert.equal(rulesOnFor(RULES, '?rules=v1'), false, "V1's rules");
  assert.equal(rulesOnFor(RULES, '?rules=m4'), true, 'M4 is an explicit opt-in for now');
  assert.equal(rulesOnFor(RULES, '?ragdoll=v1&kick=v1&feel=v1'), false, 'another revert leaves the default (V1 rules) alone');
  for (const m of MODULES) {
    const q = DEFAULTS.revert[m].query, others = MODULES.filter((o) => o !== m);
    assert.deepEqual(feelsOn(DEFAULTS, `?${q}=v1`), others, `?${q}=v1 turns off ${m} only`);
    assert.equal(feelsOn(DEFAULTS, `?${q}=v1&feel=${m}`).includes(m), false, `and wins over ?feel=${m}`);
    assert.equal(feelsOn(DEFAULTS, `?${q}=on`).includes(m), true, `${q}=on is not a revert`);
  }
  assert.equal(knockSimFor(SIM, '?kick=v1', DEFAULTS), null, '?kick=v1 takes the sim knockdown with the kick');
  assert.notEqual(knockSimFor(SIM, '?clash=v1&hitreact=v1&limbs=v1', DEFAULTS), null, 'the others leave it on');
  assert.deepEqual(feelsOn(DEFAULTS, '?feel=v1'), [], '?feel=v1: no feel module');
  assert.equal(knockSimFor(SIM, '?feel=v1', DEFAULTS), null);
  assert.deepEqual(feelsOn(DEFAULTS, '?feel=v1,clash'), ['clash'], 'a module named beside v1 still runs');
  assert.equal(knockSimFor(SIM, '?feel=v1,kick', DEFAULTS) !== null, true);
  assert.deepEqual(feelsOn(DEFAULTS, '?feel=hitreact,nope'), [...DEFAULTS.modules, 'nope'], 'an unknown name is carried, then ignored by the registry (FEEL_NAMES)');
  assert.deepEqual(feelsOn(undefined, '?feel=clash'), ['clash'], 'no defaults row = the old opt-in grammar');
});

test('without the defaults row the old opt-in grammar is unchanged (Gate 0 callers, older tests)', () => {
  assert.equal(knockSimFor(SIM, ''), null);
  assert.notEqual(knockSimFor(SIM, '?feel=kick'), null);
  assert.deepEqual(activeFeels(''), []);
});

test('Gate 0 and the headless sim never see a default: the sim files import no row, and only the page driver switches the knockdown on', () => {
  assert.equal(KNOCK_SIM, null, 'the sim knockdown is null until main.ts sets it');
  const dir = new URL('../src/fight/', import.meta.url), srcs = readdirSync(dir).filter((f) => f.endsWith('.ts'));
  const readers = srcs.filter((f) => /from '[^']*feel-defaults\.json'/.test(readFileSync(new URL(f, dir), 'utf8')));
  assert.deepEqual(readers, ['ragdoll.ts'], 'only the presentation ragdoll imports the defaults row inside src/fight');
  for (const f of ['duel.ts', 'sim.ts', 'moves.ts', 'match.ts', 'record.ts', 'replay.ts']) if (srcs.includes(f)) assert.doesNotMatch(readFileSync(new URL(f, dir), 'utf8'), /feel-defaults|FEEL_DEFAULTS/, `${f} (the sim) does not read the defaults`);
  const setters = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = new URL(e.name + (e.isDirectory() ? '/' : ''), d); if (e.isDirectory()) walk(p); else if (/\.(ts|js|mjs)$/.test(e.name) && /setKnockSim\(knockSimFor/.test(readFileSync(p, 'utf8'))) setters.push(p.pathname.split('/src/')[1]); } };
  walk(new URL('../src/', import.meta.url));
  assert.deepEqual(setters, ['client/main.ts'], 'only the page driver turns the sim knockdown on');
  assert.match(readFileSync(new URL('../src/client/main.ts', import.meta.url), 'utf8'), /setKnockSim\(knockSimFor\(FEEL_SIM as KnockRows, search, FEEL_DEFAULTS\)\)/);
  assert.match(readFileSync(new URL('./gate0/harness.mjs', import.meta.url), 'utf8').replace(/\s+/g, ' '), /^(?![\s\S]*(feel-defaults|setKnockSim|knockSimFor))/, 'the Gate 0 harness sets and reads none of it');
});
