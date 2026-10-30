// Keyboard + mouse and the wide screen (data/input.json; Dom 2026-10-28: "keyboard + mouse input and a 16:9 landscape layout, Steam needs it").
// Pure rules first (the key map, the validator, the screen shape), then `mountKbm`, the page's one DOM part: it marks <html data-kbm> while a keyboard or mouse is in use (the touch controls the
// row lists are not drawn then), swaps the footer legend, and marks <html data-layout> / data-wide from the window's shape. ?input=v1 (or the row off) builds none of it: `kbmFor` returns null and
// the page is exactly the one before. INPUT and PRESENTATION only: the sim never reads this file. The bindings themselves are src/fight/input.ts (it asks `keyAlias`); the CSS is the block at the
// end of src/style.css, every rule of it scoped to html[data-kbm] or html[data-layout=...] so a portrait phone (no keyboard, no mouse) matches none of it.
import ROWS from '../../data/input.json' with { type: 'json' };

type LayoutRow = { id: string; minAspect?: number; maxAspect?: number; minHeight?: number; maxHeight?: number };
export type KbmRows = {
  on: boolean; query: string; off: string;
  detect: { media: string; attribute: string; mouseMovePx: number };
  hide: string[];
  keys: Record<string, string[]>;
  schema_version: number;
  mouseButtons: string[];   // DOM button 0, 1, 2 by name (ARMAGEDOM inputKeys.json)
  mouse: { strike: string; guard: string; lookDragPx: number };
  strike: { forwardStab: boolean; slidePx: number };
  partJoin: string;
  keyNames: Record<string, string>; mouseNames: Record<string, string>;
  hints: { text: string; keys?: string[]; mouse?: string[]; join?: string }[];
  layout: { attribute: string; wideAttribute: string; wideAspect: number; rows: LayoutRow[] };
};

/** The actions a key can be bound to, and the code input.ts reads each by (V1's own code for the ones that already had a key; a new action's first default). */
export const CANON: Readonly<Record<string, string>> = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', run: 'ShiftLeft', strike: 'KeyF', heavy: 'KeyG', stab: 'KeyT', roll: 'KeyE', guard: 'KeyQ', kick: 'KeyC',
  skill: 'Digit1', skill2: 'Digit2', lock: 'Tab', recenter: 'KeyR', escape: 'Escape',
};
/** The arrow keys: fixed (they move, and with guard held they pick the guard side). */
export const ARROWS: readonly string[] = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

/** Why `r` is not a good input table (one string per problem; empty = fine). */
export function validateInput(r: KbmRows): string[] {
  const e: string[] = [];
  const num = (name: string, v: unknown, lo: number, hi: number) => { if (!(typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi)) e.push(`input.${name} ${String(v)} is not a number in ${lo}..${hi}`); };
  if (typeof r.on !== 'boolean') e.push('input.on is true or false');
  if (!/^[a-z]+$/.test(r.query ?? '') || !/^[a-z0-9]+$/.test(r.off ?? '')) e.push('input.query and input.off are words');
  if (typeof r.detect?.media !== 'string' || !/^[a-z0-9 ():\-,]+$/i.test(r.detect.media)) e.push('input.detect.media is a media query');
  if (!/^[a-z]+$/.test(r.detect?.attribute ?? '')) e.push('input.detect.attribute is a lower-case word');
  num('detect.mouseMovePx', r.detect?.mouseMovePx, 1, 200);
  for (const sel of r.hide ?? []) if (typeof sel !== 'string' || !/^[#.][A-Za-z0-9_-]+$/.test(sel)) e.push(`input.hide "${String(sel)}" is a #id or .class selector`);
  const seen = new Map<string, string>();
  for (const action of Object.keys(CANON)) {
    const codes = r.keys?.[action];
    if (!Array.isArray(codes) || !codes.length) { e.push(`input.keys.${action}: at least one code`); continue; }
    for (const c of codes) {
      if (typeof c !== 'string' || !/^[A-Za-z0-9]+$/.test(c)) { e.push(`input.keys.${action}: "${String(c)}" is no KeyboardEvent.code`); continue; }
      if (ARROWS.includes(c)) e.push(`input.keys.${action}: ${c} is fixed (arrows move and pick the guard side)`);
      const prior = seen.get(c);
      if (prior) e.push(`input.keys: ${c} is bound to both ${prior} and ${action}`); else seen.set(c, action);
    }
  }
  for (const action of Object.keys(r.keys ?? {})) if (!(action in CANON)) e.push(`input.keys.${action}: unknown action`);
  if (r.schema_version !== 1) e.push('input.schema_version is 1');
  if (JSON.stringify(r.mouseButtons) !== '["primary","middle","secondary"]') e.push('input.mouseButtons is primary, middle, secondary');
  for (const k of ['strike', 'guard'] as const) if (!(r.mouseButtons ?? []).includes(r.mouse?.[k])) e.push(`input.mouse.${k} is a button name`);
  for (const h of r.hints ?? []) {
    if (typeof h.text !== 'string' || !h.text.length || /[<>&]/.test(h.text)) e.push(`input.hints "${String(h.text)}" is plain text`);
    for (const a of h.keys ?? []) if (!(a in CANON)) e.push(`input.hints "${h.text}": ${a} is no action`);
    for (const m of h.mouse ?? []) if (!(m in (r.mouseNames ?? {}))) e.push(`input.hints "${h.text}": ${m} has no mouseNames row`);
  }
  if (!r.hints?.length) e.push('input.hints: at least one');
  if (typeof r.partJoin !== 'string') e.push('input.partJoin is text');
  if (r.mouse?.strike === r.mouse?.guard) e.push('input.mouse: strike and guard are different buttons');
  num('mouse.lookDragPx', r.mouse?.lookDragPx, 1, 60);
  num('strike.slidePx', r.strike?.slidePx, 4, 120);
  if (typeof r.strike?.forwardStab !== 'boolean') e.push('input.strike.forwardStab is true or false');
  const L = r.layout;
  if (!/^[a-z]+$/.test(L?.attribute ?? '') || !/^[a-z]+$/.test(L?.wideAttribute ?? '')) e.push('input.layout.attribute and wideAttribute are lower-case words');
  num('layout.wideAspect', L?.wideAspect, 1, 3);
  const ids = new Set<string>();
  for (const row of L?.rows ?? []) {
    if (!/^[a-z]+$/.test(row.id ?? '') || ids.has(row.id)) e.push(`input.layout.rows: "${String(row.id)}" is a unique lower-case word`); else ids.add(row.id);
    for (const k of ['minAspect', 'maxAspect', 'minHeight', 'maxHeight'] as const) if (row[k] !== undefined) num(`layout.rows.${row.id}.${k}`, row[k], 0, 10000);
  }
  if (!ids.has('portrait')) e.push('input.layout.rows: a "portrait" row (the layout that shipped)');
  return e;
}

const SHIPPED = ROWS as unknown as KbmRows;
{ const bad = validateInput(SHIPPED); if (bad.length) throw new Error(`data/input.json: ${bad.join('; ')}`); }

/** The rows this page plays: null when the row is off or the link says `?input=v1` (the controls and the screen exactly as before). Throws on a bad row. */
export function kbmFor(search = '', rows: KbmRows = SHIPPED): KbmRows | null {
  const bad = validateInput(rows);
  if (bad.length) throw new Error(`data/input.json: ${bad.join('; ')}`);
  return !rows.on || new URLSearchParams(search).get(rows.query) === rows.off ? null : rows;
}

/** KeyboardEvent.code -> the code input.ts reads it by (the action's canonical code); the arrows map to themselves. A code in no row is not in the map (and so does nothing). */
export function keyAlias(rows: KbmRows): Map<string, string> {
  const m = new Map<string, string>(ARROWS.map((a) => [a, a]));
  for (const [action, codes] of Object.entries(rows.keys)) for (const c of codes) m.set(c, CANON[action]!);
  return m;
}

/** The first row of `rows.layout.rows` whose bounds all hold for a window `w` x `h` (a portrait window is the "portrait" row: aspect w/h at most 1). Null for a window with no size. */
export function layoutOf(rows: KbmRows, w: number, h: number): string | null {
  if (!(w > 0 && h > 0)) return null;
  const aspect = w / h;
  for (const r of rows.layout.rows) {
    if (r.minAspect !== undefined && aspect < r.minAspect) continue;
    if (r.maxAspect !== undefined && aspect > r.maxAspect) continue;
    if (r.minHeight !== undefined && h < r.minHeight) continue;
    if (r.maxHeight !== undefined && h > r.maxHeight) continue;
    return r.id;
  }
  return null;
}
export const isWide = (rows: KbmRows, w: number, h: number): boolean => w > 0 && h > 0 && w / h >= rows.layout.wideAspect;

/** The DOM button number (0 left, 1 middle, 2 right) of a mouse button name. */
export const buttonOf = (rows: KbmRows, name: string): number => rows.mouseButtons.indexOf(name);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nameOf = (rows: KbmRows, code: string) => rows.keyNames[code] ?? code.replace(/^(Key|Digit)/, '');
/** The footer legend, built from the hint rows: `<kbd>keys</kbd> text` joined by " · ". A hint's keys use each action's first code (the move hint joins W A S D with its own `join`), its mouse names come first. */
export function legendFor(rows: KbmRows): string {
  return rows.hints.map((h) => {
    const names = [...(h.mouse ?? []).map((m) => rows.mouseNames[m]!), ...(h.keys ?? []).map((a) => nameOf(rows, rows.keys[a]![0]!))];
    const join = h.join ?? rows.partJoin;
    return `<kbd>${esc(names.join(join === '' ? ' ' : join))}</kbd> ${esc(h.text)}`;
  }).join(' · ');
}

/** The CSS that hides the touch controls while <html data-kbm> is set: one rule from the row's selector list. */
export const hideCss = (rows: KbmRows): string => `html[data-${rows.detect.attribute}] :is(${rows.hide.join(', ')}) { display: none !important; }`;

type Doc = Pick<Document, 'documentElement' | 'head' | 'createElement' | 'querySelector' | 'addEventListener'>;
type Win = Pick<Window, 'addEventListener' | 'matchMedia'> & { innerWidth: number; innerHeight: number };

/** Mark the page. Returns `on()` (is a keyboard or mouse in use) for the tests and the stills. */
export function mountKbm(doc: Doc, win: Win, rows: KbmRows, alias: Map<string, string> = keyAlias(rows)) {
  const root = doc.documentElement, attr = `data-${rows.detect.attribute}`;
  let style: HTMLStyleElement | null = null;   // made when a keyboard or mouse is first in use: a portrait phone gets no extra node
  const help = doc.querySelector('.desktop-help');
  const original = help?.innerHTML ?? '';
  let on = false, moved = 0, lastX = NaN, lastY = NaN;
  const set = (value: boolean) => {
    if (value === on) return;
    on = value;
    if (on && !style) { style = doc.createElement('style'); style.textContent = hideCss(rows); doc.head.append(style); }
    if (on) root.setAttribute(attr, ''); else root.removeAttribute(attr);
    if (help) help.innerHTML = on ? legendFor(rows) : original;
  };
  set(!!win.matchMedia?.(rows.detect.media)?.matches);
  win.addEventListener('keydown', (e) => { const k = e as KeyboardEvent; if (!k.metaKey && !k.ctrlKey && alias.has(k.code)) set(true); });
  win.addEventListener('pointermove', (e) => {
    const p = e as PointerEvent;
    if (p.pointerType !== 'mouse') return;
    if (!Number.isNaN(lastX)) moved += Math.hypot(p.clientX - lastX, p.clientY - lastY);
    lastX = p.clientX; lastY = p.clientY;
    if (moved >= rows.detect.mouseMovePx) set(true);
  });
  win.addEventListener('pointerdown', (e) => { const p = e as PointerEvent; if (p.pointerType === 'touch' || p.pointerType === 'pen') { moved = 0; lastX = lastY = NaN; set(false); } });
  const shape = () => {
    const id = layoutOf(rows, win.innerWidth, win.innerHeight), la = rows.layout.attribute, wa = rows.layout.wideAttribute;
    if (id && id !== 'portrait') root.setAttribute(`data-${la}`, id); else root.removeAttribute(`data-${la}`);   // portrait is the layout that shipped: it carries no mark and no rule
    if (isWide(rows, win.innerWidth, win.innerHeight)) root.setAttribute(`data-${wa}`, ''); else root.removeAttribute(`data-${wa}`);
  };
  shape();
  win.addEventListener('resize', shape);
  win.addEventListener('orientationchange', shape);
  return { on: () => on, shape };
}
