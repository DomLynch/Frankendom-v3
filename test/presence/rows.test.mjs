// The presence rows (data/presence.json): every default is pinned (V1's values, same ids), the file validates against the data layer's closed schema, the loader refuses a broken table,
// and the page side (src/presence/) stays free of the node service (server/presence/) so the client chunk can never pull the server into a bundle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { validateFile } from '../../src/sim/validate.js';
import { NAMED, PRESENCE, interestRules, loadPresence, presenceRule } from '../../src/presence/rows.ts';
import { RULES } from '../../server/presence/interest.ts';
import { LIMITS, PATH, PROTOCOL } from '../../server/presence/server.ts';
import { MAX_ENTITIES } from '../../src/presence/wire.ts';

const DEFS = JSON.parse(readFileSync(new URL('../../data/presence.json', import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));

test('every presence rule equals V1\'s value (origins/presence/presence-rules-defs.json, same ids) or is a named V3 addition (softCap/hardCap: yard-sized 20/24 for the shared VPS, V1 had 80/100)', () => {
  assert.deepEqual(RULES, { cellCm: 1600, radiusCm: 4000, nearCap: 40, tiers: [[1200, 1], [2500, 2], [4000, 5]], tickMs: 100, softCap: 20, hardCap: 24, maxSpeedCmS: 700, speedSlack: 1.5, strikesToDrop: 5, strikeWindowMs: 10_000, emptyLayerMs: 300_000, jitterMs: 500 });
  assert.deepEqual(RULES, interestRules());
  assert.deepEqual(LIMITS, { maxMessage: 64, perSecond: 30, idleMs: 30_000, ipSockets: 16, ipJoinsPerMinute: 30, beatMs: 2000, maxWriteBytes: 65_536 });
  assert.deepEqual([presenceRule('maxLayers'), presenceRule('tickRing'), presenceRule('tickFloorMs'), presenceRule('tickChecksPerTick'), presenceRule('closeGraceMs'), presenceRule('logEveryMs')], [20, 40_000, 5, 4, 1000, 60_000]);
  assert.deepEqual([presenceRule('walkHalfCm'), presenceRule('presencePort'), presenceRule('sweepEveryMs')], [30_000, 8794, 60_000], 'V3 additions: the walkable square, the port (V1 used 8793), the per-IP sweep');
  assert.deepEqual([presenceRule('giveUp'), presenceRule('retryBaseMs'), presenceRule('retryMaxMs'), presenceRule('remoteSnap'), presenceRule('remoteExpire')], [6, 1000, 30_000, 6, 1500], 'the client: V1 preview-rules presenceGiveUp / remoteSnap / remoteExpire and the backoff literals');
  assert.deepEqual(PRESENCE.frame, { centreCm: 32768, sizeCm: 65535 });
  assert.deepEqual([PRESENCE.query, PRESENCE.path, PRESENCE.protocol, PRESENCE.poseGlobal, PATH, PROTOCOL], ['presence', '/presence', 'frankendom.v3.presence.1', '__v3HeroPose', '/presence', 'frankendom.v3.presence.1']);
  assert.equal(PRESENCE.host, '127.0.0.1', 'the service binds loopback unless PRESENCE_HOST says otherwise');
  assert.deepEqual(['drawMax', 'drawIdle', 'drawSmooth', 'animIdle', 'animWalk', 'animRun', 'animRunMps', 'poseMinDtMs', 'drawDtMaxS', 'drawContact'].map((id) => presenceRule(id)), [8, 0.3, 14, 1, 2, 3, 4.5, 250, 0.1, 0.35],'the drawing rows (src/presence/draw.ts)');
  assert.equal(PRESENCE.rules.length, 49);
  assert.equal(PRESENCE.rules.length, NAMED.length, 'every row is read by name and every name has a row');
  assert.equal(MAX_ENTITIES, 255, 'the packet count is one byte');
});

test('the file validates against the closed schema, and an unknown key or row key is refused', () => {
  assert.deepEqual(validateFile('presence', DEFS), []);
  assert.match(validateFile('presence', { ...clone(DEFS), cap: 1 }).join('\n'), /presence\.cap: unknown key/);
  const row = clone(DEFS); row.rules[0].why = 'x';
  assert.match(validateFile('presence', row).join('\n'), /presence\.rules\[0\] \(cellCm\)\.why: unknown key/);
  const frame = clone(DEFS); frame.frame.sizeCm = null;
  assert.match(validateFile('presence', frame).join('\n'), /presence\.frame\.sizeCm: must be a finite number/);
});

test('the loader refuses a missing named rule, a non-positive value, a duplicate id and a frame outside u16; a new row is one entry', () => {
  const rows = DEFS.rules;
  assert.throws(() => loadPresence({ ...DEFS, rules: rows.filter((r) => r.id !== 'cellCm') }), /"cellCm" rule by name/);
  assert.throws(() => loadPresence({ ...DEFS, rules: rows.map((r) => (r.id === 'tickMs' ? { ...r, value: 0 } : r)) }), /needs a value > 0/);
  assert.throws(() => loadPresence({ ...DEFS, rules: [...rows, rows[0]] }), /given twice/);
  assert.throws(() => loadPresence({ ...DEFS, frame: { centreCm: 32768, sizeCm: 70000 } }), /u16/);
  assert.throws(() => loadPresence({ ...DEFS, path: '' }), /"path"/);
  assert.equal(loadPresence({ ...DEFS, rules: [...rows, { id: 'extra', value: 2, unit: 'm' }] }).rules.length, 50);
  assert.throws(() => loadPresence({ ...DEFS, host: '' }), /"host"/);
});

test('the spawn row (zone-frame metres): is the pit\'s centre in the zone row (pitOrigin, one source), validates as a closed {x, z} map, and the loader refuses a missing or unwalkable one', async () => {
  const { pitOrigin, WORLD } = await import('../../src/zone/spawns.ts'), { zoneFor } = await import('../../src/zone/zone-rows.ts');
  assert.deepEqual(PRESENCE.spawn, pitOrigin(zoneFor(''), WORLD), 'the service places a join where the page puts the pit: change one and this fails');
  const bad = clone(DEFS); bad.spawn.x = 'a';
  assert.match(validateFile('presence', bad).join('\n'), /presence\.spawn\.x: must be a finite number/);
  assert.match(validateFile('presence', { ...clone(DEFS), spawn: { x: 1, z: 2, y: 3 } }).join('\n'), /spawn/);
  assert.throws(() => loadPresence({ ...DEFS, spawn: undefined }), /spawn is \{ x, z \}/);
  assert.throws(() => loadPresence({ ...DEFS, spawn: { x: 400, z: 0 } }), /walkable/);
});

test('the zone-frame guard: presence starts only when the page\'s pit origin IS the spawn row; no origin or another zone is refused; every shipped zone row (data/zones/*.row.json) is either equal or refused', async () => {
  const { zoneFrameOk } = await import('../../src/presence/chunk.ts'), { pitOrigin, WORLD } = await import('../../src/zone/spawns.ts');
  assert.equal(zoneFrameOk({ ...PRESENCE.spawn }), true);
  assert.equal(zoneFrameOk(undefined), false, 'no zone, no origin: the pit frame would be a jump from the spawn');
  assert.equal(zoneFrameOk({ x: PRESENCE.spawn.x + 1, z: PRESENCE.spawn.z }), false);
  const dir = new URL('../../data/zones/', import.meta.url), rows = readdirSync(dir).filter((n) => n.endsWith('.row.json'));
  assert.ok(rows.length >= 1);
  for (const f of rows) {
    const o = pitOrigin(JSON.parse(readFileSync(new URL(f, dir), 'utf8')), WORLD);
    assert.equal(zoneFrameOk(o), o.x === PRESENCE.spawn.x && o.z === PRESENCE.spawn.z, `${f}: equal to the spawn row or refused`);
  }
  assert.equal(zoneFrameOk(pitOrigin(JSON.parse(readFileSync(new URL('zone1.row.json', dir), 'utf8')), WORLD)), true, 'the shipped default zone starts presence');
});

test('src/presence (the page side) imports nothing from server/, and nothing in it touches node: it can only ever be bundled for the browser', () => {
  const dir = new URL('../../src/presence/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.doesNotMatch(src, /from\s+['"][^'"]*server\//, `${f} does not import the service`);
    assert.doesNotMatch(src, /from\s+['"]node:/, `${f} does not import a node module`);
  }
});

test('nothing in the game bundle statically imports the presence chunk: main.ts reaches it only through a dynamic import behind ?presence=', () => {
  const main = readFileSync(new URL('../../src/client/main.ts', import.meta.url), 'utf8');
  const hits = main.split('\n').filter((l) => /import\(.*presence\/chunk\.ts/.test(l) || /^import .*presence\/chunk/.test(l));
  assert.equal(hits.length, 1);
  assert.match(hits[0], /\/\[\?&\]presence=\/\.test\(search\)\) void import\('\.\.\/presence\/chunk\.ts'\)/, 'one dynamic import, behind the flag');
  assert.doesNotMatch(main, /^import .*presence/m, 'no static import');
  for (const f of readdirSync(new URL('../../src/', import.meta.url), { recursive: true }).filter((n) => /\.(ts|js)$/.test(n) && !n.startsWith('presence/') && n !== 'client/main.ts')) {
    assert.doesNotMatch(readFileSync(new URL(`../../src/${f}`, import.meta.url), 'utf8'), /(from\s+|import\()['"][^'"]*presence\/(chunk|client|track|rows)/, `${f} does not reach the presence code`);
  }
});
