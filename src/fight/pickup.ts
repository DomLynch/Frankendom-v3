// Taking a defeated boss's body parts (data/pickup.json; Dom 2026-10-28, option 1 "floating arrow" of "tap a part to select it, then press Take"). PRESENTATION ONLY and no body change yet: after a kill, once the
// corpse has frozen, a small bobbing yellow arrow and a short line of small caps ("Take your body parts") stand by the corpse; a tap on a cut part selects it (a thin outline, a mini arrow, a small Take pill); Take
// hides the part, a chip flies to the hero, and `part:taken` goes on the bus. The arrow and line go after a Take or a selection, after `hintSeconds` with no tap, when nothing is takeable, or when the hero walks away.
// Everything is DOM/CSS (no art), every number is a row, nothing here touches the sim, the camera or the input: the elements are pointer-events none (the Take pill aside) and a tap on a part rides the corpse tap's own
// pointerup (ragdoll.listenTaps asks `pickupTapGate`), so free look, the soft lock and the thumb controls keep working. The state machine (`plan`, `pick`, `clampTo`) is pure (test/pickup.test.mjs); `mountPickup` is the DOM.
import ROWS from '../../data/pickup.json' with { type: 'json' };

export type Pt = { x: number; y: number; z: number };
/** One cut part of a frozen corpse that can be taken now (ragdoll.ts takeablesOf). `at`: its bone in world metres; `centre`: the corpse's hips; `frozenS`: seconds the corpse has lain still; `take()`: hides its pieces and tells the bus (false: already taken). */
export type Takeable = { corpseId: string; unit: string; boss: string; frozenS: number; at: Pt; centre: Pt; take: () => boolean };
export type TakeSource = (units: readonly string[]) => Takeable[];
/** A takeable as the camera sees it: sx/sy and cx/cy are CSS px (the part, the corpse's hips), `dist` metres from the hero (ground plane). */
export type Seen = Takeable & { sx: number; sy: number; cx: number; cy: number; onScreen: boolean; cOnScreen: boolean; dist: number };

type Box = { sizePx: number };
export type PickupRows = {
  on: boolean; query: string; off: string; event: string; units: string[]; delayS: number; hintSeconds: number; walkAwayM: number; rangeM: number; hitRadiusPx: number; zIndex: number; colour: string; fadeS: number;
  text: { label: string; sizePx: number; letterSpacingEm: number; shadow: string; maxWidthPx: number; lineHeight: number };
  arrow: Box & { bobPx: number; bobS: number; liftPx: number; textGapPx: number };
  mini: Box & { bobPx: number; bobS: number; gapPx: number };
  outline: { widthPx: number; radiusPx: number; fillAlpha: number; glowPx: number };
  pill: { label: string; sizePx: number; letterSpacingEm: number; textColour: string; padXPx: number; padYPx: number; radiusPx: number; gapPx: number; weight: number };
  safe: { topFrac: number; bottomFrac: number; sideMarginPx: number; pillRightFrac: number };
  fly: { seconds: number; sizePx: number; arcPx: number; heroLiftM: number };
};
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Throws on a bad row: a colour that is no #rrggbb, a time or size that is not positive, a fraction outside 0..1, a unit that is not a cuttable unit. */
export function validatePickup(r: PickupRows): void {
  const num = (name: string, v: unknown, lo: number, hi: number) => { if (!(typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi)) throw new Error(`pickup.${name} ${String(v)} is not a number in ${lo}..${hi}`); };
  const colour = (name: string, v: unknown) => { if (!(typeof v === 'string' && HEX.test(v))) throw new Error(`pickup.${name} ${String(v)} is not a #rrggbb colour`); };
  const word = (name: string, v: unknown) => { if (!(typeof v === 'string' && v.length > 0 && v.length <= 60)) throw new Error(`pickup.${name} is a non-empty string`); };
  if (typeof r.on !== 'boolean') throw new Error('pickup.on is true or false');
  for (const k of ['query', 'off', 'event'] as const) word(k, r[k]);
  if (!Array.isArray(r.units) || !r.units.length || r.units.some((u) => typeof u !== 'string' || !/^[a-z_]+$/.test(u))) throw new Error('pickup.units is a list of unit names');
  if (new Set(r.units).size !== r.units.length) throw new Error('pickup.units has a unit twice');
  num('delayS', r.delayS, 0, 10); num('hintSeconds', r.hintSeconds, 1, 120); num('walkAwayM', r.walkAwayM, 1, 200); num('rangeM', r.rangeM, 1, 200); num('hitRadiusPx', r.hitRadiusPx, 8, 120); num('zIndex', r.zIndex, 0, 1000); num('fadeS', r.fadeS, 0, 2);
  if (r.walkAwayM > r.rangeM) throw new Error('pickup.walkAwayM is within pickup.rangeM');
  colour('colour', r.colour);
  word('text.label', r.text?.label); num('text.sizePx', r.text?.sizePx, 6, 24); num('text.letterSpacingEm', r.text?.letterSpacingEm, 0, 1); word('text.shadow', r.text?.shadow); num('text.maxWidthPx', r.text?.maxWidthPx, 40, 300); num('text.lineHeight', r.text?.lineHeight, 0.8, 3);
  num('arrow.sizePx', r.arrow?.sizePx, 6, 60); num('arrow.bobPx', r.arrow?.bobPx, 0, 30); num('arrow.bobS', r.arrow?.bobS, 0.2, 5); num('arrow.liftPx', r.arrow?.liftPx, 0, 300); num('arrow.textGapPx', r.arrow?.textGapPx, 0, 40);
  num('mini.sizePx', r.mini?.sizePx, 4, 40); num('mini.bobPx', r.mini?.bobPx, 0, 20); num('mini.bobS', r.mini?.bobS, 0.2, 5); num('mini.gapPx', r.mini?.gapPx, 0, 100);
  num('outline.widthPx', r.outline?.widthPx, 0.5, 6); num('outline.radiusPx', r.outline?.radiusPx, 8, 80); num('outline.fillAlpha', r.outline?.fillAlpha, 0, 1); num('outline.glowPx', r.outline?.glowPx, 0, 30);
  word('pill.label', r.pill?.label); num('pill.sizePx', r.pill?.sizePx, 8, 30); num('pill.letterSpacingEm', r.pill?.letterSpacingEm, 0, 1); colour('pill.textColour', r.pill?.textColour);
  num('pill.padXPx', r.pill?.padXPx, 2, 60); num('pill.padYPx', r.pill?.padYPx, 1, 30); num('pill.radiusPx', r.pill?.radiusPx, 0, 40); num('pill.gapPx', r.pill?.gapPx, 0, 150); num('pill.weight', r.pill?.weight, 100, 900);
  num('safe.topFrac', r.safe?.topFrac, 0, 0.6); num('safe.bottomFrac', r.safe?.bottomFrac, 0, 0.6); num('safe.sideMarginPx', r.safe?.sideMarginPx, 0, 100); num('safe.pillRightFrac', r.safe?.pillRightFrac, 0.2, 1);
  num('fly.seconds', r.fly?.seconds, 0.05, 3); num('fly.sizePx', r.fly?.sizePx, 4, 40); num('fly.arcPx', r.fly?.arcPx, 0, 200); num('fly.heroLiftM', r.fly?.heroLiftM, 0, 4);
}
export const PICKUP = ROWS as unknown as PickupRows;
validatePickup(PICKUP);

/** The pickup is on: the row says so and the link does not carry the off switch (?pickup=v1). */
export const pickupOn = (search: string, rows: PickupRows = PICKUP): boolean => rows.on && new URLSearchParams(search).get(rows.query) !== rows.off;

// The takeable parts come from the ragdolls (one per body kind the page has made): each registers a source when it is built; the page's pickup reads them all.
const sources = new Set<TakeSource>();
export function registerTakeSource(s: TakeSource): () => void { sources.add(s); return () => { sources.delete(s); }; }
let gate: ((x: number, y: number) => boolean) | null = null;
/** ragdoll.listenTaps asks this on every tap (CSS px): true = the tap selected a cut part and is used up (the corpse is not cut under it). False with no pickup mounted (?pickup=v1). */
export const pickupTapGate = (x: number, y: number): boolean => gate?.(x, y) ?? false;

export type PickupState = { hintFor: string | null; hintAge: number; done: Set<string>; selected: { corpseId: string; unit: string } | null };
export const newPickupState = (): PickupState => ({ hintFor: null, hintAge: 0, done: new Set(), selected: null });
const same = (t: { corpseId: string; unit: string }, s: { corpseId: string; unit: string } | null): boolean => !!s && t.corpseId === s.corpseId && t.unit === s.unit;

/** What can be selected or hinted now: the corpse has frozen for `delayS` and the part is within `rangeM`. */
export const eligible = (rows: PickupRows, seen: readonly Seen[]): Seen[] => seen.filter((t) => t.frozenS >= rows.delayS && t.dist <= rows.rangeM);

/** One frame of the state: drops a selection that is no longer takeable, runs the hint's clock. Returns what the view shows: `hint` (the nearest corpse's nearest part: its hips carry the arrow; null = no hint) and `selected`. */
export function plan(rows: PickupRows, st: PickupState, seen: readonly Seen[], dt: number): { hint: Seen | null; selected: Seen | null } {
  const ok = eligible(rows, seen);
  const selected = st.selected ? ok.find((t) => same(t, st.selected)) ?? null : null;
  if (!selected) st.selected = null;
  let hint: Seen | null = null;
  if (selected) { st.hintFor = null; return { hint, selected }; }
  let near: Seen | null = null;
  for (const t of ok) if (!st.done.has(t.corpseId) && t.dist <= rows.walkAwayM && (!near || t.dist < near.dist)) near = t;
  if (!near) { st.hintFor = null; return { hint, selected: null }; }
  if (st.hintFor !== near.corpseId) { st.hintFor = near.corpseId; st.hintAge = 0; }
  st.hintAge += dt;
  if (st.hintAge >= rows.hintSeconds) { st.done.add(near.corpseId); st.hintFor = null; } else hint = near;
  return { hint, selected: null };
}

/** The part a tap at (x, y) CSS px lands on: the nearest eligible part on screen within `hitRadiusPx`, else null. */
export function pick(rows: PickupRows, seen: readonly Seen[], x: number, y: number): Seen | null {
  let best: Seen | null = null, bd = rows.hitRadiusPx;
  for (const t of eligible(rows, seen)) { if (!t.onScreen) continue; const d = Math.hypot(t.sx - x, t.sy - y); if (d <= bd) { bd = d; best = t; } }
  return best;
}
/** Select a part (a tap on it): the hint is over for its corpse. */
export function select(st: PickupState, t: { corpseId: string; unit: string }): void { st.selected = { corpseId: t.corpseId, unit: t.unit }; st.done.add(t.corpseId); st.hintFor = null; }

/** `v` held inside [lo, hi] (lo wins when the box is too small). */
export const clampTo = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** The box the arrow, the line and the pill stay in for a viewport: below the HUD bars, above the thumb controls, off the edges. */
export function safeBox(rows: PickupRows, w: number, h: number): { left: number; right: number; top: number; bottom: number; pillRight: number } {
  const m = rows.safe.sideMarginPx;
  return { left: m, right: w - m, top: h * rows.safe.topFrac, bottom: h * (1 - rows.safe.bottomFrac), pillRight: Math.min(w - m, w * rows.safe.pillRightFrac) };
}

type Doc = { createElement(tag: string): HTMLElement; body: HTMLElement; head: HTMLElement };
export type PickupHost = {
  /** The canvas the camera draws on (CSS px come from its rect). */
  canvas: { getBoundingClientRect(): { left: number; top: number; width: number; height: number } };
  /** World point to NDC (-1..1), or null when it cannot be projected. */
  project: (p: Pt) => Pt | null;
  /** The hero's feet in world metres, or null before he stands. */
  hero: () => Pt | null;
};

/** Builds the arrow, the line, the outline, the pill and the flying chips (all hidden) in `parent`. `frame(dt)` once a frame; `remove()` takes it all away. */
export function mountPickup(doc: Doc, host: PickupHost, rows: PickupRows = PICKUP, parent: HTMLElement = doc.body) {
  const st = newPickupState(), c = rows.colour, fade = `opacity ${rows.fadeS}s ease`;
  const style = doc.createElement('style');
  const tri = (s: number) => `width:0;height:0;border-left:${s / 2}px solid transparent;border-right:${s / 2}px solid transparent;border-top:${Math.round(s * 0.85)}px solid ${c};filter:drop-shadow(0 1px 2px rgba(0,0,0,0.6))`;
  style.textContent = `.pk-root{position:fixed;left:0;top:0;width:0;height:0;z-index:${rows.zIndex};pointer-events:none;font-family:Georgia,'Times New Roman',serif;font-variant-caps:all-small-caps;user-select:none;-webkit-user-select:none}`
    + `.pk-hint,.pk-sel,.pk-mini,.pk-pill{position:fixed;left:0;top:0;opacity:0;transition:${fade};will-change:transform}`
    + `.pk-hint{display:flex;flex-direction:column;align-items:center}`
    + `.pk-text{color:${c};font-size:${rows.text.sizePx}px;letter-spacing:${rows.text.letterSpacingEm}em;line-height:${rows.text.lineHeight};text-shadow:${rows.text.shadow};text-align:center;max-width:${rows.text.maxWidthPx}px;margin-bottom:${rows.arrow.textGapPx}px;font-weight:700}`
    + `.pk-arrow{${tri(rows.arrow.sizePx)};animation:pk-bob ${rows.arrow.bobS}s ease-in-out infinite}`
    + `.pk-minia{${tri(rows.mini.sizePx)};animation:pk-bob-mini ${rows.mini.bobS}s ease-in-out infinite}`
    + `.pk-sel{box-sizing:border-box;width:${rows.outline.radiusPx * 2}px;height:${Math.round(rows.outline.radiusPx * 1.6)}px;border:${rows.outline.widthPx}px solid ${c};border-radius:${Math.round(rows.outline.radiusPx * 0.45)}px;background:${c}${Math.round(rows.outline.fillAlpha * 255).toString(16).padStart(2, '0')};box-shadow:0 0 ${rows.outline.glowPx}px ${c}88}`
    + `button.pk-pill,button.pk-pill:hover{min-height:0;min-width:0;line-height:1.1;backdrop-filter:none;background:${c};border:0}`   // (the page's own button rules, style.css, are 44 px tall and blurred: not for this pill)
    + `.pk-pill{pointer-events:auto;touch-action:manipulation;cursor:pointer;color:${rows.pill.textColour};border-radius:${rows.pill.radiusPx}px;padding:${rows.pill.padYPx}px ${rows.pill.padXPx}px;font:${rows.pill.weight} ${rows.pill.sizePx}px Georgia,'Times New Roman',serif;font-variant-caps:all-small-caps;letter-spacing:${rows.pill.letterSpacingEm}em;box-shadow:0 2px 6px rgba(0,0,0,0.5);-webkit-tap-highlight-color:transparent}`
    + `.pk-chip{position:fixed;left:0;top:0;width:${rows.fly.sizePx}px;height:${rows.fly.sizePx}px;margin:${-rows.fly.sizePx / 2}px 0 0 ${-rows.fly.sizePx / 2}px;background:${c};transform:rotate(45deg);box-shadow:0 0 8px ${c}cc;pointer-events:none;will-change:transform,opacity}`
    + `@keyframes pk-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(${rows.arrow.bobPx}px)}}@keyframes pk-bob-mini{0%,100%{transform:translateY(0)}50%{transform:translateY(${rows.mini.bobPx}px)}}`;
  doc.head.append(style);
  const root = doc.createElement('div'); root.className = 'pk-root'; root.dataset.pickup = 'true';
  const hintEl = doc.createElement('div'), textEl = doc.createElement('div'), arrowEl = doc.createElement('div');
  hintEl.className = 'pk-hint'; textEl.className = 'pk-text'; textEl.textContent = rows.text.label; arrowEl.className = 'pk-arrow'; hintEl.append(textEl, arrowEl);
  const selEl = doc.createElement('div'), miniEl = doc.createElement('div'), miniA = doc.createElement('div'), pillEl = doc.createElement('button') as HTMLButtonElement;
  selEl.className = 'pk-sel'; miniEl.className = 'pk-mini'; miniA.className = 'pk-minia'; miniEl.append(miniA);
  pillEl.className = 'pk-pill'; pillEl.type = 'button'; pillEl.textContent = rows.pill.label; pillEl.setAttribute('aria-label', rows.pill.label);
  hintEl.dataset.pk = 'hint'; selEl.dataset.pk = 'selected'; miniEl.dataset.pk = 'mini'; pillEl.dataset.pk = 'take';
  root.append(hintEl, selEl, miniEl, pillEl); parent.append(root);
  pillEl.style.visibility = 'hidden';

  let seen: Seen[] = [], rect = { left: 0, top: 0, width: 1, height: 1 }, current: Seen | null = null;
  const chips: { el: HTMLElement; age: number; from: { x: number; y: number }; to: { x: number; y: number } }[] = [];
  const at = (el: HTMLElement, x: number, y: number, tx: string) => { el.style.transform = `translate(${x}px,${y}px) ${tx}`; };
  const show = (el: HTMLElement, on: boolean) => { el.style.opacity = on ? '1' : '0'; };

  function look(): Seen[] {
    const hero = host.hero(), out: Seen[] = [];
    for (const s of sources) for (const t of s(rows.units)) {
      const p = host.project(t.at), q = host.project(t.centre);
      const ok = (n: Pt | null): n is Pt => !!n && n.z <= 1 && Math.abs(n.x) <= 1.1 && Math.abs(n.y) <= 1.1;
      const px = (n: Pt) => rect.left + ((n.x + 1) / 2) * rect.width, py = (n: Pt) => rect.top + ((1 - n.y) / 2) * rect.height;
      out.push({ ...t, sx: p ? px(p) : 0, sy: p ? py(p) : 0, cx: q ? px(q) : 0, cy: q ? py(q) : 0, onScreen: ok(p), cOnScreen: ok(q), dist: hero ? Math.hypot(t.at.x - hero.x, t.at.z - hero.z) : 0 });
    }
    return out;
  }
  function takeIt(): void {
    const t = current; if (!t) return;
    const hero = host.hero(), q = hero ? host.project({ x: hero.x, y: hero.y + rows.fly.heroLiftM, z: hero.z }) : null;
    const from = { x: t.sx, y: t.sy }, to = q ? { x: rect.left + ((q.x + 1) / 2) * rect.width, y: rect.top + ((1 - q.y) / 2) * rect.height } : { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.55 };
    if (!t.take()) return;
    st.selected = null;
    if (t.onScreen) { const el = doc.createElement('div'); el.className = 'pk-chip'; root.append(el); chips.push({ el, age: 0, from, to }); }
  }
  pillEl.addEventListener('pointerdown', (e) => e.stopPropagation());   // the stick and the look finger never see the press on the pill
  pillEl.addEventListener('click', (e) => { e.stopPropagation(); takeIt(); });
  gate = (x, y) => {
    const hit = pick(rows, seen, x, y);
    if (hit) { select(st, hit); current = hit; return true; }   // a tap on a cut part selects it and is used up
    st.selected = null;   // a tap anywhere else lets go (and falls through to the corpse tap, as it always did)
    return false;
  };
  (globalThis as { __pickup?: unknown }).__pickup = { seen: () => seen.map((t) => ({ corpseId: t.corpseId, unit: t.unit, boss: t.boss, sx: t.sx, sy: t.sy, onScreen: t.onScreen, dist: t.dist, frozenS: t.frozenS })), selected: () => st.selected, done: () => [...st.done] };   // the stills and the tests read it

  return {
    state: st,
    element: root,
    frame(dt: number): void {
      const r = host.canvas.getBoundingClientRect(); rect = r;
      seen = look();
      const { hint, selected } = plan(rows, st, seen, dt);
      current = selected;
      const box = safeBox(rows, typeof innerWidth === 'number' ? innerWidth : r.width, typeof innerHeight === 'number' ? innerHeight : r.height);
      // the arrow: tip `liftPx` above the corpse's hips, its line above it; both inside the safe box
      if (hint && hint.cOnScreen) {
        const w = Math.min(rows.text.maxWidthPx, 120), x = clampTo(hint.cx, box.left + w / 2, box.right - w / 2), h = rows.arrow.sizePx * 0.85 + rows.arrow.textGapPx + rows.text.sizePx * rows.text.lineHeight * 2.2;
        const y = clampTo(hint.cy - rows.arrow.liftPx, box.top + h, box.bottom);
        at(hintEl, x, y, 'translate(-50%,-100%)'); show(hintEl, true);
      } else show(hintEl, false);
      if (selected && selected.onScreen) {
        const oh =Math.round(rows.outline.radiusPx * 1.6);
        at(selEl, selected.sx, selected.sy, 'translate(-50%,-50%)'); show(selEl, true);
        at(miniEl, selected.sx, selected.sy - oh / 2 - rows.mini.gapPx, 'translate(-50%,-100%)'); show(miniEl, true);
        const pw = pillEl.offsetWidth || 64, ph = pillEl.offsetHeight || 26;   // the pill sits under the outline, held in the safe box (left of the thumb cluster, above the controls)
        const px = clampTo(selected.sx, box.left + pw / 2, box.pillRight - pw / 2), py = clampTo(selected.sy + oh / 2 + rows.pill.gapPx, box.top + ph / 2, box.bottom - ph / 2);
        at(pillEl, px, py, 'translate(-50%,-50%)'); show(pillEl, true); pillEl.style.visibility = 'visible';
      } else { show(selEl, false); show(miniEl, false); show(pillEl, false); pillEl.style.visibility = 'hidden'; }
      for (let i = chips.length - 1; i >= 0; i--) {
        const k = chips[i]!; k.age += dt;
        const u = Math.min(1, k.age / rows.fly.seconds), e = u * u * (3 - 2 * u);
        const x = k.from.x + (k.to.x - k.from.x) * e, y = k.from.y + (k.to.y - k.from.y) * e - Math.sin(Math.PI * e) * rows.fly.arcPx;
        k.el.style.transform = `translate(${x}px,${y}px) rotate(45deg) scale(${1 - 0.7 * u})`; k.el.style.opacity = String(1 - u * u);
        if (u >= 1) { k.el.remove(); chips.splice(i, 1); }
      }
    },
    remove(): void { gate = null; root.remove(); style.remove(); chips.length = 0; },
  };
}
