// The second as-data pass: tuning and player text that sat in code moved into the module's data row. Every moved value is pinned to the literal it replaced, byte for byte,
// and every stylesheet the code builds from a row is compared with the string the old template literal produced.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFile, checkProgressionCaps } from '../src/sim/validate.js';
import { freshSave, parseSave, recordKill, addTrophy, validateProgression } from '../src/progression.ts';
import { scaledOpponent } from '../src/difficulty.ts';
import { cleanDaily } from '../src/daily-pit.ts';
import { dailyCss } from '../src/daily-pit-ui.ts';
import { CORPSE, markerAlpha, validateCorpseRun } from '../src/corpse-run.ts';
import { captionCss } from '../src/commentator.ts';
import { buttonCss } from '../src/share-clip.ts';
import { kitWorn } from '../src/stubs.ts';
import { WEAPON_IRON, WEAPON_METAL_FROM, validateLadderRungs } from '../src/core/career-ladder.ts';
import { GRADES, gradeFor } from '../src/core/grades.ts';

const read = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const P = read('data/progression.json'), D = read('data/difficulty.json'), DP = read('data/daily-pit.json'), CR = read('data/corpse-run.json'), F = read('data/fight.json');
const ST = read('data/stubs.json'), CM = read('data/commentator.json'), SC = read('data/share-clip.json'), CAREER = read('src/core/career-rules.json').ladderRule[0];

test('progression.countCap is the old 99999 and caps kills, trophies and the loaded save', () => {
  assert.equal(P.countCap, 99999);
  const s = recordKill({ ...freshSave(), kills: { gargantua: 99999 }, ladder: ['gargantua'], unlocked: ['gladius'] }, 'gargantua', P);
  assert.equal(s.save.kills.gargantua, 99999);
  assert.equal(addTrophy({ ...freshSave(), trophies: { 2: 99999 } }, 2).trophies[2], 99999);
  const raw = (n) => JSON.stringify({ v: P.version, kills: { gargantua: n }, ladder: ['gargantua'], trophies: { 3: n } });
  assert.equal(parseSave(raw(99999), P).kills.gargantua, 99999);
  assert.equal(parseSave(raw(100000), P).kills.gargantua, undefined, 'a count above the cap is dropped, as before');
  assert.equal(parseSave(raw(99999), P).trophies['3'], 99999);
});
test('progression.countCap is range checked', () => {
  for (const bad of [0, -1, 1.5, '99999', undefined, NaN]) assert.equal(checkProgressionCaps({ countCap: bad }).length, 1, String(bad));
  assert.deepEqual(validateProgression(structuredClone(P), P.bosses.map((b) => b.id), () => true), []);
  assert.ok(validateProgression({ ...P, countCap: 0 }, P.bosses.map((b) => b.id), () => true).some((m) => /countCap/.test(m)));
  assert.ok(validateFile('progression', { ...P, extra: 1 }).some((m) => /unknown key/.test(m)));
});

test('difficulty.attackDialScale is the old 100 and the attack dial is unchanged', () => {
  assert.equal(D.attackDialScale, 100);
  const body = { health: 100, sheet: { attack: 0 } };
  for (const d of [0.5, 1.37, 2]) assert.equal(scaledOpponent(body, { foeHealthScale: 1, foeDamageScale: d }).sheet.attack, Math.round((d - 1) * 100));
});

test('daily-pit.saveCaps are the old 1e7 and 999 and the save cleaner still cuts there', () => {
  assert.deepEqual(DP.saveCaps, { points: 1e7, count: 999 });
  const rec = (attempts, bestEver) => ({ daily: { date: '2026-10-29', attempts, bestEver, best: null, last: null } });
  assert.equal(cleanDaily(rec(999, 1e7)).daily.attempts, 999);
  assert.equal(cleanDaily(rec(999, 1e7)).daily.bestEver, 1e7);
  assert.deepEqual(cleanDaily(rec(1000, 0)), {});
  assert.deepEqual(cleanDaily(rec(0, 1e7 + 1)), {});
  const row = (over) => ({ score: 1, timeSeconds: 1, damage: 1, parts: 1, won: true, boss: 'a', modifier: 'b', ...over });
  assert.ok(cleanDaily({ daily: { ...rec(1, 1).daily, best: row({ parts: 999, damage: 1e7, score: 1e7 }) } }).daily.best);
  assert.equal(cleanDaily({ daily: { ...rec(1, 1).daily, best: row({ parts: 1000 }) } }).daily.best, null);
  for (const bad of [0, 1.5, 'x', undefined]) assert.ok(validateFile('daily-pit', { ...DP, saveCaps: { points: bad, count: 999 } }).some((m) => /saveCaps\.points/.test(m)), String(bad));
  assert.ok(validateFile('daily-pit', { ...DP, saveCaps: { points: 1e7 } }).some((m) => /saveCaps\.count/.test(m)));
});

test('corpse-run marker rows are the old 0.75, 0.25, 0.15 and 99 and the alpha is the old formula', () => {
  const m = CR.marker;
  assert.deepEqual([m.pulseMid, m.pulseSwing, m.heightMetres, m.deadDistanceMetres], [0.75, 0.25, 0.15, 99]);
  for (const [dist, sec] of [[99, 0], [99, 0.4], [10, 1.3], [3, 7.7], [0.5, 2]]) {
    const old = m.alpha * (0.75 + 0.25 * Math.sin((sec / m.pulseSeconds) * Math.PI * 2)) * (m.fadeWithinMetres > 0 ? Math.min(1, Math.max(0, (dist - CR.pile.reachMetres) / m.fadeWithinMetres)) : 1);
    assert.equal(markerAlpha(CORPSE, dist, sec), old);
  }
  assert.doesNotThrow(() => validateCorpseRun());
  const bad = (over) => { const c = structuredClone(CORPSE); Object.assign(c.marker, over); return c; };
  for (const over of [{ pulseSwing: 0.8 }, { pulseMid: 0.9, pulseSwing: 0.2 }, { pulseMid: 0 }, { heightMetres: 9 }, { deadDistanceMetres: 2 }, { deadDistanceMetres: 5000 }]) assert.throws(() => validateCorpseRun(bad(over)), /marker\./, JSON.stringify(over));
});

test('fight.clockJumpS and buildLabelChars are the old 60 and 7 and are range checked', () => {
  assert.equal(F.clockJumpS, 60);
  assert.equal(F.buildLabelChars, 7);
  assert.equal(validateFile('fight', F).filter((m) => /clockJumpS|buildLabelChars/.test(m)).length, 0);
  for (const over of [{ clockJumpS: 0.05 }, { clockJumpS: 99999 }, { clockJumpS: 'x' }, { buildLabelChars: 0 }, { buildLabelChars: 2.5 }, { buildLabelChars: 99 }]) assert.equal(validateFile('fight', { ...F, ...over }).filter((m) => /clockJumpS|buildLabelChars/.test(m)).length, 1, JSON.stringify(over));
});

test('stubs rows are the old Shield, Crest and Recruit and kitWorn leaves the same slots out', () => {
  assert.deepEqual([ST.twoHandedHides, ST.bareTierHides, ST.bareTier], ['Shield', 'Crest', 'Recruit']);
  const slots = read('src/core/loot-pieces.json').lootPiece.find((r) => r.id === 'veteran').slots;
  const names = (a) => a.map((id) => id.split('.')[1]);
  assert.ok(names(kitWorn('veteran', false, 'Master')).includes('Shield') && names(kitWorn('veteran', false, 'Master')).includes('Crest'));
  assert.ok(!names(kitWorn('veteran', true, 'Master')).includes('Shield'), 'two-handed leaves the shield off');
  assert.ok(!names(kitWorn('veteran', false, 'Recruit')).includes('Crest'), 'a Recruit wears no crest');
  assert.ok(names(kitWorn('veteran', false, 'Recruit')).includes('Shield'));
  assert.ok(slots.includes(ST.twoHandedHides) && slots.includes(ST.bareTierHides));
});

test('the weapon-metal rungs are the old Veteran and Praetorian and gradeFor floors the same way', () => {
  assert.equal(CAREER.weaponMetalFrom, 'Veteran');
  assert.equal(CAREER.weaponIron, 'Praetorian');
  assert.equal(WEAPON_METAL_FROM, 'Veteran');
  assert.equal(WEAPON_IRON, 'Praetorian');
  assert.equal(gradeFor('Recruit', 'WeaponLongsword'), GRADES.Praetorian.metal, 'below Veteran a blade is floored at the iron');
  assert.equal(gradeFor('Veteran', 'WeaponLongsword'), GRADES.Veteran.metal);
  assert.throws(() => validateLadderRungs(['Recruit', 'Origin'], { weaponMetalFrom: 'Veteran', weaponIron: 'Recruit' }), /weaponMetalFrom: Veteran is not one of the 2 career titles/);
  assert.throws(() => validateLadderRungs(['Recruit', 'Origin'], { weaponMetalFrom: 'Recruit', weaponIron: 5 }), /weaponIron: 5 is not one of/);
});

// ---- stylesheets: the string the code builds from the row is the string the old template literal built ---------------------------------------

test('dailyCss equals the old template-literal stylesheet', () => {
  const { colour } = DP.ui, z = DP.ui.zIndex;
  const old = [
    `.dp-btn{position:fixed;left:8px;top:calc(env(safe-area-inset-top,0px) + 104px);z-index:${z};padding:7px 12px;border-radius:999px;border:1px solid ${colour.line};background:${colour.panel};color:${colour.gold};`
      + "font:11px/1 Georgia,'Times New Roman',serif;font-variant-caps:all-small-caps;letter-spacing:.14em;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}",
    `.dp-card{position:fixed;left:8px;top:calc(env(safe-area-inset-top,0px) + 140px);z-index:${z};width:min(260px,calc(100vw - 16px));box-sizing:border-box;padding:12px 14px;border-radius:10px;border:1px solid ${colour.line};background:${colour.panel};color:${colour.ink};`
      + "font:13px/1.35 Georgia,'Times New Roman',serif}",
    '.dp-card[hidden],.dp-result[hidden],.dp-banner[hidden]{display:none}',
    `.dp-card h2,.dp-result h2{margin:0 0 6px;font:600 15px/1.2 Georgia,serif;font-variant-caps:all-small-caps;letter-spacing:.14em;color:${colour.gold}}`,
    '.dp-card p,.dp-result p{margin:3px 0}',
    '.dp-card small,.dp-result small{display:block;opacity:.75;font-size:11px}',
    `.dp-row{display:flex;gap:8px;margin-top:10px}.dp-row button{flex:1;padding:9px 6px;border-radius:8px;border:1px solid ${colour.line};background:transparent;color:${colour.ink};font:13px Georgia,serif;cursor:pointer;touch-action:manipulation}`,
    `.dp-row button.dp-go{background:${colour.gold};color:#171e20;font-weight:600}`,
    `.dp-banner{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 142px);transform:translateX(-50%);z-index:${z - 1};pointer-events:none;text-align:center;max-width:calc(100vw - 32px);`
      + `color:${colour.gold};font:11px/1.3 Georgia,serif;font-variant-caps:all-small-caps;letter-spacing:.14em;text-shadow:0 1px 3px rgba(0,0,0,.85)}`,
    '.dp-banner small{display:block;color:' + colour.ink + ';font-size:10px;letter-spacing:.04em;font-variant-caps:normal;opacity:.9}',
    `.dp-result{position:fixed;inset:0;z-index:${z + 1};display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(6,8,10,.72);color:${colour.ink};font:14px/1.4 Georgia,serif}`,
    `.dp-panel{width:min(320px,100%);box-sizing:border-box;padding:18px 18px 14px;border-radius:12px;border:1px solid ${colour.line};background:${colour.panel}}`,
    '.dp-big{font:600 34px/1.1 Georgia,serif;margin:4px 0 8px}',
    '.dp-line{display:flex;justify-content:space-between;margin:2px 0}',
  ].join('\n');
  assert.equal(dailyCss(DP.ui), old);
  assert.ok(!/\{[a-z]+\}/.test(dailyCss(DP.ui)), 'no slot is left unfilled');
  assert.ok(validateFile('daily-pit', { ...DP, ui: { ...DP.ui, css: [...DP.ui.css, '.x{z-index:{nope}}'] } }).some((m) => /\{nope\} is not a slot/.test(m)));
  assert.ok(validateFile('daily-pit', { ...DP, ui: { ...DP.ui, css: [] } }).some((m) => /ui\.css/.test(m)));
});

test('captionCss equals the old template-literal stylesheet', () => {
  const c = CM.caption;
  const old = `.cm-line{position:fixed;left:50%;top:${c.topPct}%;transform:translateX(-50%);z-index:${c.zIndex};pointer-events:none;opacity:0;transition:opacity ${c.fadeMs}ms ease;text-align:center;`
    + `max-width:${c.maxWidthPct}%;color:${c.colour};font:italic ${c.fontPx}px/1.25 Georgia,'Times New Roman',serif;text-shadow:${c.shadow};user-select:none;-webkit-user-select:none}`
    + '@media (prefers-reduced-motion:reduce){.cm-line{transition:none}}';
  assert.equal(captionCss(c), old);
  assert.ok(validateFile('commentator', { ...CM, caption: { ...c, css: '.x{top:{nope}}' } }).some((m) => /\{nope\} is not a slot/.test(m)));
  assert.ok(validateFile('commentator', { ...CM, caption: { ...c, css: '' } }).some((m) => /caption\.css/.test(m)));
});

test('buttonCss equals the old template-literal stylesheet', () => {
  const B = SC.button;
  const old = `.sc-btn{position:fixed;left:50%;bottom:calc(${B.bottomPx}px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:${B.zIndex};padding:6px 14px;border:1px solid ${B.colour};border-radius:999px;background:rgba(10,8,6,.72);color:${B.colour};font:${B.sizePx}px/1.2 Georgia,'Times New Roman',serif;font-variant-caps:all-small-caps;letter-spacing:.14em;touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;cursor:pointer}.sc-btn[disabled]{opacity:.6;cursor:default}`;
  assert.equal(buttonCss(B), old);
  assert.ok(!/\{\w+\}/.test(buttonCss(B)));
});
