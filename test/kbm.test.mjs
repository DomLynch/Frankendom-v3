// Keyboard + mouse and the wide screen (data/input.json, src/fight/kbm.ts, src/fight/input.ts). The DOM is faked, as test/directional-heavies-input.test.mjs does.
// What this pins: the data validates (and a bad row is refused); the key map; the mouse's strike / guard mapping (the same swings the STRIKE thumb makes); Tab; ?input=v1 and a portrait phone are the controls
// and the screen exactly as before; every CSS rule of the keyboard/mouse/wide block is scoped to html[data-kbm] or html[data-layout=...], so a portrait phone (which has neither) matches none of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInput, HEAVY_HOLD_MS, HEAVY_GRACE_MS } from '../src/fight/input.ts';
import { initialPractice } from '../src/fight/combat.ts';
import { validateFile } from '../src/sim/validate.js';
import { validateInput, kbmFor, keyAlias, layoutOf, isWide, hideCss, legendFor, mountKbm, CANON, ARROWS } from '../src/fight/kbm.ts';
import { freshLock, stepLock, toggleLock } from '../src/fight/lock-break.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const INPUT = JSON.parse(read('../data/input.json')), RESPAWN = JSON.parse(read('../data/respawn.json'));
const clone = () => structuredClone(INPUT);

function fake() {
  const handlers = {};
  return {
    handlers, dataset: {}, style: {}, offsetWidth: 0, tagName: 'DIV',
    addEventListener: (t, f) => { (handlers[t] ??= []).push(f); },
    fire(t, e = {}) { for (const f of handlers[t] ?? []) f({ button: 0, pointerId: 1, pointerType: 'mouse', preventDefault() {}, ...e }); },
    setPointerCapture() {}, setAttribute() {}, click() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 72, height: 72 }),
  };
}
function rig(opts = {}) {
  const els = {}, win = fake();
  let now = 0, free = !!opts.free;
  const practice = initialPractice();
  const p = { ...practice, duel: { ...practice.duel, fighters: [{ ...practice.duel.fighters[0], phase: 'ready', stamina: 100 }, practice.duel.fighters[1]] } };
  const controls = createInput({
    element: (id) => (els[id] ??= fake()), window: win, now: () => now, matchMedia: () => ({ matches: false }), innerWidth: () => 400,
    paused: () => false, ready: () => true, practice: () => p, quiet: () => {},
    ...('kbm' in opts ? { kbm: opts.kbm, free: () => free, overPart: opts.overPart } : {}),
  });
  const canvas = els.world;
  const key = (type, code, extra = {}) => win.fire(type, { code, repeat: false, target: { tagName: 'BODY' }, ...extra });
  return {
    controls, canvas, win, els, key, setFree(v) { free = v; },
    at(t) { now = t; },
    frame(t) { now = t; const i = controls.intent(); controls.consumed([]); return i; },
    act(t) { return this.frame(t).action; },
  };
}
const KB = () => kbmFor('');

test('the shipped table validates and a bad row is refused', () => {
  assert.deepEqual(validateFile('input', INPUT), []);
  assert.deepEqual(validateInput(INPUT), []);
  assert.ok(KB(), 'on by default');
  assert.equal(kbmFor('?input=v1'), null);
  assert.equal(kbmFor('?input=v1&x=1'), null);
  assert.ok(kbmFor('?input=2'));
  const off = clone(); off.on = false; assert.equal(kbmFor('', off), null);
  const twice = clone(); twice.keys.kick = ['KeyF']; assert.match(validateInput(twice).join('|'), /KeyF is bound to both strike and kick/);
  const arrow = clone(); arrow.keys.roll = ['ArrowUp']; assert.match(validateInput(arrow).join('|'), /fixed/);
  const missing = clone(); delete missing.keys.lock; assert.match(validateInput(missing).join('|'), /keys\.lock/);
  const stray = clone(); stray.keys.jump = ['KeyJ']; assert.match(validateInput(stray).join('|'), /unknown action/);
  const same = clone(); same.mouse.guard = 'primary'; assert.match(validateInput(same).join('|'), /different buttons/);
  const html = clone(); html.hints[0].text = '<img src=x>'; assert.match(validateInput(html).join('|'), /plain text/);
  const ghost = clone(); ghost.hints[1].keys = ['jump']; assert.match(validateInput(ghost).join('|'), /no action/);
  assert.equal(legendFor(KB()), '<kbd>W A S D</kbd> move · <kbd>Shift</kbd> run · <kbd>Click/F</kbd> strike (A/D slash, W stab, hold = heavy) · <kbd>Right-click/Q</kbd> guard · <kbd>E</kbd> roll · <kbd>C</kbd> kick · <kbd>1</kbd> Skull Crack · <kbd>2</kbd> Whirlwind · <kbd>Tab</kbd> lock on/off');
  const sel = clone(); sel.hide = ['body > div']; assert.match(validateInput(sel).join('|'), /selector/);
  const noPortrait = clone(); noPortrait.layout.rows = noPortrait.layout.rows.filter((r) => r.id !== 'portrait'); assert.match(validateInput(noPortrait).join('|'), /portrait/);
  assert.match(validateFile('input', { ...INPUT, extra: 1 }).join('|'), /unknown key/);
  assert.throws(() => kbmFor('', twice), /data\/input\.json/);
});

test('the key map: every action is a canonical code, Space rolls, Z and X are the specials, the arrows are fixed', () => {
  const a = keyAlias(KB());
  for (const [action, canon] of Object.entries(CANON)) for (const c of INPUT.keys[action]) assert.equal(a.get(c), canon, `${c} -> ${action}`);
  assert.equal(a.get('Space'), 'KeyE'); assert.equal(a.get('KeyZ'), 'Digit1'); assert.equal(a.get('KeyX'), 'Digit2'); assert.equal(a.get('Tab'), 'Tab');
  for (const k of ARROWS) assert.equal(a.get(k), k);
  assert.equal(a.get('KeyJ'), undefined);
  const re = clone(); re.keys.strike = ['KeyJ']; const b = keyAlias(re);
  assert.equal(b.get('KeyJ'), 'KeyF'); assert.equal(b.get('KeyF'), undefined, 'a rebound key frees the old one');
  // V1's seven keys are the first code of their actions, so the old keyboard is the new one
  for (const [action, code] of [['strike', 'KeyF'], ['heavy', 'KeyG'], ['stab', 'KeyT'], ['roll', 'KeyE'], ['guard', 'KeyQ'], ['kick', 'KeyC'], ['recenter', 'KeyR'], ['forward', 'KeyW'], ['back', 'KeyS'], ['left', 'KeyA'], ['right', 'KeyD']]) assert.equal(INPUT.keys[action][0], code);
});

test('the screen shape rows: portrait carries no mark, a landscape phone and desktop do, 16:9 is wide', () => {
  const k = KB();
  assert.equal(layoutOf(k, 375, 812), 'portrait'); assert.equal(layoutOf(k, 768, 1024), 'portrait'); assert.equal(layoutOf(k, 1000, 1000), 'portrait');
  assert.equal(layoutOf(k, 812, 375), 'landscape'); assert.equal(layoutOf(k, 844, 390), 'landscape'); assert.equal(layoutOf(k, 932, 430), 'landscape');
  assert.equal(layoutOf(k, 1280, 720), 'desktop'); assert.equal(layoutOf(k, 1920, 1080), 'desktop'); assert.equal(layoutOf(k, 1024, 768), 'desktop');
  assert.equal(layoutOf(k, 0, 0), null);
  assert.ok(isWide(k, 1280, 720) && isWide(k, 1920, 1080) && isWide(k, 812, 375) && isWide(k, 2560, 1080));
  assert.ok(!isWide(k, 1024, 768) && !isWide(k, 375, 812) && !isWide(k, 768, 1024));
});

test('mountKbm: a portrait touch phone gets no mark and no node; a mouse or a key marks the page, a touch clears it', () => {
  const mk = (matches, w, h) => {
    const attrs = new Map(), appended = [], listeners = {};
    const help = { innerHTML: 'old keys' };
    const doc = { documentElement: { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k) }, head: { append: (n) => appended.push(n) }, createElement: () => ({}), querySelector: () => help, addEventListener() {} };
    const win = { innerWidth: w, innerHeight: h, matchMedia: () => ({ matches }), addEventListener: (t, f) => { (listeners[t] ??= []).push(f); } };
    const fire = (t, e) => (listeners[t] ?? []).forEach((f) => f(e));
    return { attrs, appended, help, fire, win, doc, kbm: mountKbm(doc, win, KB()) };
  };
  const phone = mk(false, 375, 812);
  assert.equal(phone.attrs.size, 0, 'no data-kbm, no data-layout, no data-wide'); assert.equal(phone.appended.length, 0); assert.equal(phone.help.innerHTML, 'old keys');
  phone.fire('pointerdown', { pointerType: 'touch' }); phone.fire('keydown', { code: 'KeyJ' });
  assert.equal(phone.attrs.size, 0, 'a touch, and a key in no row, change nothing');
  const desk = mk(true, 1280, 720);
  assert.deepEqual([...desk.attrs.keys()].sort(), ['data-kbm', 'data-layout', 'data-wide']); assert.equal(desk.attrs.get('data-layout'), 'desktop'); assert.equal(desk.appended.length, 1); assert.match(desk.help.innerHTML, /Click/);
  desk.fire('pointerdown', { pointerType: 'touch' }); assert.ok(!desk.attrs.has('data-kbm')); assert.equal(desk.help.innerHTML, 'old keys');
  desk.fire('pointermove', { pointerType: 'mouse', clientX: 0, clientY: 0 }); assert.ok(!desk.attrs.has('data-kbm'), 'one point is not a move');
  desk.fire('pointermove', { pointerType: 'mouse', clientX: 30, clientY: 0 }); assert.ok(desk.attrs.has('data-kbm'));
  desk.fire('pointerdown', { pointerType: 'touch' }); desk.fire('keydown', { code: 'KeyW' }); assert.ok(desk.attrs.has('data-kbm'));
  desk.fire('pointerdown', { pointerType: 'touch' }); desk.fire('keydown', { code: 'KeyW', ctrlKey: true }); assert.ok(!desk.attrs.has('data-kbm'), 'Ctrl+W is the browser\'s');
  const land = mk(false, 812, 375); assert.equal(land.attrs.get('data-layout'), 'landscape'); assert.ok(!land.attrs.has('data-kbm'), 'a landscape phone has touch controls until a mouse or key is used');
  assert.equal(hideCss(KB()), 'html[data-kbm] :is(#joystick, #run-button, #attack-button, #heavy-button, #thrust-button, #dodge-button, #guard-button, #kick-button, #touch-zones) { display: none !important; }');
});

test('the keyboard: the old keys give the same intents with the rows on and off; Space rolls', () => {
  const script = [['KeyF'], ['KeyD', 'KeyF'], ['KeyC'], ['KeyG'], ['KeyT'], ['KeyE'], ['KeyW', 'KeyE'], ['KeyQ'], ['KeyQ', 'ArrowLeft'], ['ShiftLeft', 'KeyW']];
  const run = (opts) => {
    const out = [];
    for (const keys of script) {
      const r = rig(opts); let t = 0;
      for (const k of keys) r.key('keydown', k);
      out.push(JSON.stringify(r.frame(t += 20)));
      for (const k of keys) r.key('keyup', k);
      out.push(JSON.stringify(r.frame(t += 400)));
    }
    return out;
  };
  const v1 = run({}), bare = run({ kbm: null }), on = run({ kbm: KB() });
  assert.deepEqual(bare, v1, '?input=v1 is the bare layer'); assert.deepEqual(on, v1, 'the rows on, the old keys: the same intents');
  const roll = (code, moving) => { const r = rig({ kbm: KB() }); if (moving) r.key('keydown', 'KeyW'); r.key('keydown', code); return r.act(20); };
  assert.equal(roll('Space', false), roll('KeyE', false)); assert.equal(roll('Space', true), roll('KeyE', true)); assert.equal(roll('Space', true), 'dodge'); assert.equal(roll('Space', false), 'backstep');
  const spaceOnButton = rig({ kbm: KB() }); spaceOnButton.key('keydown', 'Space', { target: { tagName: 'BUTTON' } }); assert.equal(spaceOnButton.act(20), null, 'Space on a focused button is that button\'s');
  const plain = rig({ kbm: null }); plain.key('keydown', 'Space'); assert.equal(plain.act(20), null, 'v1: Space does nothing');
  const mod = rig({ kbm: KB() }); mod.key('keydown', 'KeyF', { ctrlKey: true }); assert.equal(mod.act(20), null);
});

test('the specials and the lock key: 1 / Z and 2 / X press the two SPECIAL buttons\' actions, Tab toggles once per press, Esc lets go', () => {
  const press = (opts, fire) => { const r = rig(opts); fire(r); return r.act(20); };
  const button = press({ kbm: KB() }, (r) => r.els['skill-button'].fire('pointerdown')), button2 = press({ kbm: KB() }, (r) => r.els['skill2-button'].fire('pointerdown'));
  for (const code of ['Digit1', 'KeyZ']) assert.equal(press({ kbm: KB() }, (r) => r.key('keydown', code)), button, code);
  for (const code of ['Digit2', 'KeyX']) assert.equal(press({ kbm: KB() }, (r) => r.key('keydown', code)), button2, code);
  assert.equal(press({ kbm: null }, (r) => r.key('keydown', 'Digit1')), null, 'v1: no key for the specials');
  const r = rig({ kbm: KB() });
  assert.equal(r.controls.takeLockToggle(), false);
  r.key('keydown', 'Tab'); r.key('keydown', 'Tab', { repeat: true }); assert.equal(r.controls.takeLockToggle(), true); assert.equal(r.controls.takeLockToggle(), false, 'read once');
  const v1 = rig({ kbm: null }); v1.key('keydown', 'Tab'); assert.equal(v1.controls.takeLockToggle(), false);
  const esc = rig({ kbm: KB() }); esc.key('keydown', 'KeyW'); esc.key('keydown', 'KeyQ'); esc.key('keydown', 'Escape');
  const i = esc.frame(20); assert.equal(i.z, 0); assert.equal(i.guard, false);
});

test('the mouse STRIKE: a click is the light, A / D slash, W stabs, a flick picks, a hold is the heavy', () => {
  const S = INPUT.strike.slidePx, click = (setup, move, hold = 80) => {
    const r = rig({ kbm: KB() }); setup?.(r);
    r.at(0); r.canvas.fire('pointerdown', { button: 0, clientX: 100, clientY: 100 });
    if (move) { r.at(40); r.canvas.fire('pointermove', { clientX: 100 + move[0], clientY: 100 + move[1] }); }
    r.at(hold); r.canvas.fire('pointerup', { button: 0, clientX: 100, clientY: 100 });
    return r.act(hold);
  };
  assert.equal(click(), 'light');
  assert.equal(click((r) => r.key('keydown', 'KeyD')), 'light_right'); assert.equal(click((r) => r.key('keydown', 'KeyA')), 'light_left');
  assert.equal(click((r) => r.key('keydown', 'ArrowRight')), 'light_right');
  assert.equal(click((r) => r.key('keydown', 'KeyW')), 'thrust', 'W + click = the stab');
  assert.equal(click((r) => { r.key('keydown', 'KeyW'); r.key('keydown', 'KeyD'); }), 'light_right', 'a side key beats the stab');
  assert.equal(click((r) => r.key('keydown', 'KeyQ')) , 'light');
  assert.equal(click(null, [0, -S]), 'thrust'); assert.equal(click(null, [-S, 0]), 'light_left'); assert.equal(click(null, [S, 0]), 'light_right');
  assert.equal(click(null, [0, -(S - 2)]), 'light', 'a flick shorter than slidePx is a plain click');
  // a hold: armed at the heavy hold, V1's heavy after the grace; a flick inside the grace is that side's heavy / the heavy stab
  let r = rig({ kbm: KB() }); r.at(0); r.canvas.fire('pointerdown', { button: 0, clientX: 100, clientY: 100 });
  assert.equal(r.act(HEAVY_HOLD_MS), null); assert.equal(r.act(HEAVY_HOLD_MS + HEAVY_GRACE_MS), 'heavy');
  for (const [m, want] of [[[-S, 0], 'heavy_left'], [[S, 0], 'heavy_right'], [[0, -S], 'heavy_thrust']]) {
    r = rig({ kbm: KB() }); r.at(0); r.canvas.fire('pointerdown', { button: 0, clientX: 100, clientY: 100 }); r.act(HEAVY_HOLD_MS);
    r.at(HEAVY_HOLD_MS + 20); r.canvas.fire('pointermove', { clientX: 100 + m[0], clientY: 100 + m[1] }); assert.equal(r.act(HEAVY_HOLD_MS + 20), want);
  }
  // the held level: the click's button level is dropped on release
  r = rig({ kbm: KB() }); r.at(0); r.canvas.fire('pointerdown', { button: 0, clientX: 1, clientY: 1 }); assert.equal(r.frame(10).held, true); r.canvas.fire('pointerup', { button: 0, clientX: 1, clientY: 1 }); assert.equal(r.frame(20).held, false);
});

test('the mouse: touch and pen never strike; the right button holds the guard with the slide for the side; a click on a cut part, or a drag in the free camera, is not a strike', () => {
  const r = rig({ kbm: KB() });
  r.canvas.fire('pointerdown', { button: 0, pointerType: 'touch', clientX: 1, clientY: 1 }); r.canvas.fire('pointerup', { button: 0, pointerType: 'touch', clientX: 1, clientY: 1 });
  r.canvas.fire('pointerdown', { button: 0, pointerType: 'pen', clientX: 1, clientY: 1 }); r.canvas.fire('pointerup', { button: 0, pointerType: 'pen', clientX: 1, clientY: 1 });
  assert.equal(r.act(100), null);
  const g = rig({ kbm: KB() }); g.at(0); g.canvas.fire('pointerdown', { button: 2, clientX: 50, clientY: 50 });
  let i = g.frame(10); assert.equal(i.guard, true); assert.equal(i.guardDirection, null); assert.equal(i.action, 'parry');
  g.canvas.fire('pointermove', { clientX: 50 - 40, clientY: 50 }); i = g.frame(20); assert.equal(i.guardDirection, 'left');
  g.canvas.fire('pointermove', { clientX: 50, clientY: 50 - 40 }); i = g.frame(30); assert.equal(i.guardDirection, 'overhead');
  g.canvas.fire('pointerup', { button: 2, clientX: 50, clientY: 50 }); i = g.frame(40); assert.equal(i.guard, false); assert.equal(i.guardDirection, null);
  const part = rig({ kbm: KB(), overPart: (x) => x === 7 }); part.canvas.fire('pointerdown', { button: 0, clientX: 7, clientY: 7 }); part.canvas.fire('pointerup', { button: 0, clientX: 7, clientY: 7 }); assert.equal(part.act(100), null);
  const away = rig({ kbm: KB(), overPart: (x) => x === 7 }); away.canvas.fire('pointerdown', { button: 0, clientX: 8, clientY: 8 }); away.canvas.fire('pointerup', { button: 0, clientX: 8, clientY: 8 }); assert.equal(away.act(100), 'light');
  const free = rig({ kbm: KB(), free: true });
  free.at(0); free.canvas.fire('pointerdown', { button: 0, clientX: 100, clientY: 100 }); free.at(30); free.canvas.fire('pointermove', { clientX: 100 + INPUT.mouse.lookDragPx, clientY: 100 });
  free.at(60); free.canvas.fire('pointerup', { button: 0, clientX: 160, clientY: 100 }); assert.equal(free.act(60), null, 'a look drag is not a swing');
  const click = rig({ kbm: KB(), free: true }); click.at(0); click.canvas.fire('pointerdown', { button: 0, clientX: 100, clientY: 100 }); click.at(60); click.canvas.fire('pointerup', { button: 0, clientX: 100, clientY: 100 }); assert.equal(click.act(60), 'light', 'a click that stays put still strikes');
  const v1 = rig({ kbm: null }); assert.equal(v1.canvas, undefined, '?input=v1 never touches the canvas');
});

test('the lock key: Tab lets go of a held lock and only Tab (not an attack, not the stick) locks it on again', () => {
  const rows = RESPAWN.lockBreak, f = (over = {}) => ({ dt: 0.016, fighting: true, stick: { x: 0, z: 0 }, yaw: 0, hero: { x: 0, z: 0 }, foe: { x: 0, z: -3 }, action: null, ...over });
  let s = freshLock();
  assert.equal(toggleLock(s).broken, true); assert.equal(toggleLock(s).manual, true);
  s = toggleLock(s);
  for (let n = 0; n < 200; n++) s = stepLock(rows, s, f({ stick: { x: 0, z: -1 }, action: n % 10 === 0 ? 'light' : null })).state;   // toward the foe, attacking: still free
  assert.equal(s.broken, true);
  s = toggleLock(s); assert.equal(s.broken, false); assert.equal(s.manual, undefined);
  assert.equal(stepLock(rows, s, f({ fighting: false })).state.broken, false);
  // the stick's own break and re-lock are as they were
  let a = freshLock(); for (let n = 0; n < 60; n++) a = stepLock(rows, a, f({ stick: { x: 0, z: 1 } })).state; assert.equal(a.broken, true); assert.equal(a.manual, undefined);
  a = stepLock(rows, a, f({ action: 'light' })).state; assert.equal(a.broken, false, 'an attack still locks a stick-broken lock on');
  // a broken lock toggled once locks on (Tab after the stick broke it)
  let b = freshLock(); for (let n = 0; n < 60; n++) b = stepLock(rows, b, f({ stick: { x: 0, z: 1 } })).state; assert.equal(toggleLock(b).broken, false);
  // free fight ends: the next fight starts locked
  assert.deepEqual(stepLock(rows, toggleLock(freshLock()), f({ fighting: false })).state, freshLock());
});

test('portrait phone: every rule of the keyboard/mouse/wide CSS block is scoped to html[data-kbm] or html[data-layout=...], and the data-layout rows never name portrait in a selector', () => {
  const css = read('../src/style.css'), at = css.indexOf('/* === keyboard + mouse and the wide screen');
  assert.ok(at > 0, 'the block is marked');
  const block = css.slice(at).replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [];
  const walk = (text) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i); if (open < 0) break;
      const head = text.slice(i, open).trim();
      let depth = 1, j = open + 1; while (j < text.length && depth) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
      const body = text.slice(open + 1, j - 1);
      if (head.startsWith('@media') || head.startsWith('@supports')) walk(body); else if (head.startsWith('@')) { /* keyframes: not selectors */ } else selectors.push(head);
      i = j;
    }
  };
  walk(block);
  assert.ok(selectors.length > 5, `${selectors.length} rules`);
  for (const group of selectors) for (const sel of group.split(/,(?![^(]*\))/).map((s) => s.trim())) assert.match(sel, /^html\[data-(kbm|layout=['"]?(landscape|desktop)['"]?|wide)[\]\s=]/, `unscoped selector: ${sel}`);
  assert.doesNotMatch(block, /data-layout=['"]?portrait/);
});
