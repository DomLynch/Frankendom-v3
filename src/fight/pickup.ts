// The cut hint (data/pickup.json; Dom 2026-10-28: the select + Take UI of #219 is out, the corpse works as before: tap a part to CUT it, the part flies and lands). What stays is #219's small bobbing yellow arrow
// with ONE short line of small caps above the corpse, a hint that it can be cut. It shows once the corpse has frozen (`delayS`), and goes after the first cut, after `hintSeconds`, or when the hero walks `walkAwayM` away.
// PRESENTATION ONLY and DOM/CSS (no art): pointer-events none, it never touches the sim, the camera or the input. The state (`plan`) and the safe box are pure (test/pickup.test.mjs); `mountHint` is the only DOM.
import ROWS from '../../data/pickup.json' with { type: 'json' };

type Pt = { x: number; y: number; z: number };
/** A frozen corpse with a unit still to cut (ragdoll.ts hintsOf): `cuts` units are cut already, `centre` its hips in world metres, `frozenS` seconds it has lain still. */
export type HintBody = { corpseId: string; frozenS: number; cuts: number; centre: Pt };
type HintSource = (units: readonly string[]) => HintBody[];
/** A body as the camera sees it: cx/cy CSS px of its hips, `dist` metres from the hero (ground plane). */
type Seen = HintBody & { cx: number; cy: number; onScreen: boolean; dist: number };

type PickupRows = {
  on: boolean; query: string; off: string; units: string[]; delayS: number; hintSeconds: number; walkAwayM: number; zIndex: number; colour: string; fadeS: number;
  text: { label: string; sizePx: number; letterSpacingEm: number; shadow: string; maxWidthPx: number; lineHeight: number };
  arrow: { sizePx: number; bobPx: number; bobS: number; liftPx: number; textGapPx: number };
  safe: { topFrac: number; bottomFrac: number; sideMarginPx: number };
};
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Throws on a bad row: a colour that is no #rrggbb, a time or size that is not positive, a fraction outside 0..1, an empty text. */
export function validatePickup(r: PickupRows): void {
  const num = (name: string, v: unknown, lo: number, hi: number) => { if (!(typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi)) throw new Error(`pickup.${name} ${String(v)} is not a number in ${lo}..${hi}`); };
  const word = (name: string, v: unknown, max = 60) => { if (!(typeof v === 'string' && v.length > 0 && v.length <= max)) throw new Error(`pickup.${name} is a non-empty string of at most ${max} characters`); };
  if (typeof r.on !== 'boolean') throw new Error('pickup.on is true or false');
  word('query', r.query); word('off', r.off);
  if (!Array.isArray(r.units) || !r.units.length || r.units.some((u) => typeof u !== 'string' || !/^[a-z_]+$/.test(u))) throw new Error('pickup.units is a list of unit names');
  num('delayS', r.delayS, 0, 10); num('hintSeconds', r.hintSeconds, 1, 120); num('walkAwayM', r.walkAwayM, 1, 200); num('zIndex', r.zIndex, 0, 1000); num('fadeS', r.fadeS, 0, 2);
  if (!(typeof r.colour === 'string' && HEX.test(r.colour))) throw new Error(`pickup.colour ${String(r.colour)} is not a #rrggbb colour`);
  word('text.label', r.text?.label, 40); num('text.sizePx', r.text?.sizePx, 6, 24); num('text.letterSpacingEm', r.text?.letterSpacingEm, 0, 1); word('text.shadow', r.text?.shadow, 100); num('text.maxWidthPx', r.text?.maxWidthPx, 40, 300); num('text.lineHeight', r.text?.lineHeight, 0.8, 3);
  num('arrow.sizePx', r.arrow?.sizePx, 6, 60); num('arrow.bobPx', r.arrow?.bobPx, 0, 30); num('arrow.bobS', r.arrow?.bobS, 0.2, 5); num('arrow.liftPx', r.arrow?.liftPx, 0, 300); num('arrow.textGapPx', r.arrow?.textGapPx, 0, 40);
  num('safe.topFrac', r.safe?.topFrac, 0, 0.6); num('safe.bottomFrac', r.safe?.bottomFrac, 0, 0.6); num('safe.sideMarginPx', r.safe?.sideMarginPx, 0, 100);
}
export const PICKUP = ROWS as unknown as PickupRows;
validatePickup(PICKUP);

/** The hint is on: the row says so and the link does not carry the off switch (?pickup=v1). */
export const pickupOn = (search: string, rows: PickupRows = PICKUP): boolean => rows.on && new URLSearchParams(search).get(rows.query) !== rows.off;

// The bodies come from the ragdolls (one per body kind the page has made): each registers a source when it is built; the page's hint reads them all.
const sources = new Set<HintSource>();
export function registerHintSource(s: HintSource): () => void { sources.add(s); return () => { sources.delete(s); }; }

type PickupState = { hintFor: string | null; hintAge: number; baseCuts: number; done: Set<string> };
export const newPickupState = (): PickupState => ({ hintFor: null, hintAge: 0, baseCuts: 0, done: new Set() });

/** One frame of the hint's clock. The nearest frozen corpse (within `walkAwayM`) gets the arrow; it ends for that corpse at the first cut made while it shows, or after `hintSeconds`; walking away hides it without spending it. */
export function plan(rows: PickupRows, st: PickupState, seen: readonly Seen[], dt: number): Seen | null {
  let near: Seen | null = null;
  for (const t of seen) if (t.frozenS >= rows.delayS && !st.done.has(t.corpseId) && t.dist <= rows.walkAwayM && (!near || t.dist < near.dist)) near = t;
  if (!near) { st.hintFor = null; return null; }
  if (st.hintFor !== near.corpseId) { st.hintFor = near.corpseId; st.hintAge = 0; st.baseCuts = near.cuts; }
  st.hintAge += dt;
  if (near.cuts > st.baseCuts || st.hintAge >= rows.hintSeconds) { st.done.add(near.corpseId); st.hintFor = null; return null; }
  return near;
}

/** `v` held inside [lo, hi] (lo wins when the box is too small). */
export const clampTo = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** The box the arrow and the line stay in for a viewport: below the HUD bars, above the thumb controls, off the edges. */
export function safeBox(rows: PickupRows, w: number, h: number): { left: number; right: number; top: number; bottom: number } {
  const m = rows.safe.sideMarginPx;
  return { left: m, right: w - m, top: h * rows.safe.topFrac, bottom: h * (1 - rows.safe.bottomFrac) };
}

type Doc = { createElement(tag: string): HTMLElement; body: HTMLElement; head: HTMLElement };
type PickupHost = {
  canvas: { getBoundingClientRect(): { left: number; top: number; width: number; height: number } };
  /** World point to NDC (-1..1), or null when it cannot be projected. */
  project: (p: Pt) => Pt | null;
  /** The hero's feet in world metres, or null before he stands. */
  hero: () => Pt | null;
};

/** Builds the arrow and the line (hidden) in `parent`. `frame(dt)` once a frame; `remove()` takes it away. */
export function mountHint(doc: Doc, host: PickupHost, rows: PickupRows = PICKUP, parent: HTMLElement = doc.body) {
  const st = newPickupState(), c = rows.colour;
  const style = doc.createElement('style');
  const s = rows.arrow.sizePx;
  style.textContent = `.pk-root{position:fixed;left:0;top:0;width:0;height:0;z-index:${rows.zIndex};pointer-events:none;font-family:Georgia,'Times New Roman',serif;font-variant-caps:all-small-caps;user-select:none;-webkit-user-select:none}`
    + `.pk-hint{position:fixed;left:0;top:0;opacity:0;transition:opacity ${rows.fadeS}s ease;will-change:transform;display:flex;flex-direction:column;align-items:center}`
    + `.pk-text{color:${c};font-size:${rows.text.sizePx}px;letter-spacing:${rows.text.letterSpacingEm}em;line-height:${rows.text.lineHeight};text-shadow:${rows.text.shadow};text-align:center;max-width:${rows.text.maxWidthPx}px;margin-bottom:${rows.arrow.textGapPx}px;font-weight:700}`
    + `.pk-arrow{width:0;height:0;border-left:${s / 2}px solid transparent;border-right:${s / 2}px solid transparent;border-top:${Math.round(s * 0.85)}px solid ${c};filter:drop-shadow(0 1px 2px rgba(0,0,0,0.6));animation:pk-bob ${rows.arrow.bobS}s ease-in-out infinite}`
    + `@keyframes pk-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(${rows.arrow.bobPx}px)}}`;
  doc.head.append(style);
  const root = doc.createElement('div'); root.className = 'pk-root'; root.dataset.pickup = 'true';
  const hintEl = doc.createElement('div'), textEl = doc.createElement('div'), arrowEl = doc.createElement('div');
  hintEl.className = 'pk-hint'; hintEl.dataset.pk = 'hint'; textEl.className = 'pk-text'; textEl.textContent = rows.text.label; arrowEl.className = 'pk-arrow'; hintEl.append(textEl, arrowEl);
  root.append(hintEl); parent.append(root);

  function look(rect: { left: number; top: number; width: number; height: number }): Seen[] {
    const hero = host.hero(), out: Seen[] = [];
    for (const src of sources) for (const t of src(rows.units)) {
      const q = host.project(t.centre), ok = !!q && q.z <= 1 && Math.abs(q.x) <= 1.1 && Math.abs(q.y) <= 1.1;
      out.push({ ...t, cx: q ? rect.left + ((q.x + 1) / 2) * rect.width : 0, cy: q ? rect.top + ((1 - q.y) / 2) * rect.height : 0, onScreen: ok, dist: hero ? Math.hypot(t.centre.x - hero.x, t.centre.z - hero.z) : 0 });
    }
    return out;
  }
  return {
    state: st,
    element: root,
    frame(dt: number): void {
      const r = host.canvas.getBoundingClientRect(), hint = plan(rows, st, look(r), dt);
      if (hint && hint.onScreen) {
        const box = safeBox(rows, typeof innerWidth === 'number' ? innerWidth : r.width, typeof innerHeight === 'number' ? innerHeight : r.height);
        const w = rows.text.maxWidthPx, h = rows.arrow.sizePx * 0.85 + rows.arrow.textGapPx + rows.text.sizePx * rows.text.lineHeight * 2.2;
        const x = clampTo(hint.cx, box.left + w / 2, box.right - w / 2), y = clampTo(hint.cy - rows.arrow.liftPx, box.top + h, box.bottom);
        hintEl.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`; hintEl.style.opacity = '1';
      } else hintEl.style.opacity = '0';
    },
    remove(): void { root.remove(); style.remove(); },
  };
}
