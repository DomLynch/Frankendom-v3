// Touch layout A (Dom's approved picture, 2026-10-13; the Combat sandbox's CS31, donor: combat sandbox @93b1138c7, layoutA in sandbox/entry.ts): a tight diamond around one big STRIKE button, its swipe zones drawn on it (a stab on
// top, a slash each side). SPECIAL 1 upper-left, SPECIAL 2 upper-right, Guard lower-left, Roll lower-right, Kick far left, each touching the zone ring with a gap. The game's own buttons keep their handlers and ids; only their place and size change. It
// goes with the oneButton input (input.ts, ON by default since RV80, Dom 2026-10-19: "turn it on"): the layout is applied only while that row is on, so with it off nothing here runs. Every number is a row (touch-layout-defs.json): the base (STRIKE's centre from the right and
// bottom edge, the gap), the three size variants (`?lay=1|2|3`; Dom picked 2) and where each button sits (an angle on the ring). Presentation only. SPECIAL 2 shows only while the second special slot holds a skill (the HUD hides the button otherwise).
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import DEFS from './touch-layout-defs.json' with { type: 'json' };
import MANIFEST from './touch-layout-defs.manifest.json' with { type: 'json' };

loadRegistry((MANIFEST.tables as unknown as Manifest[]).map((m) => tableFromFile(m, DEFS, 'touch-layout-defs.json')));

const BASE = DEFS.base[0]!, WIDE = DEFS.wide[0]!;
const RAD = Math.PI / 180;   // degrees to radians

/** The CSS of layout A for a page's query string (`?lay=1|3` picks another size variant; anything else is the base's own). */
export function touchLayoutCss(search: string): string {
  const lay = new URLSearchParams(search).get('lay'), V = DEFS.variants.find((v) => v.id === lay) ?? DEFS.variants.find((v) => v.id === BASE.variant)!;
  // The centre offset (down is +) of a button of diameter d touching the ring at this angle.
  const near = (deg: number, size: number): [number, number] => { const r = (V.ring + size) / 2 + BASE.gap, a = deg * RAD; return [Math.round(r * Math.cos(a)), Math.round(-r * Math.sin(a))]; };
  const spots = DEFS.buttons.map((b) => { const size = b.own ? V.strike : (b as { size?: number }).size ?? V.button, [dx, dy] = b.own ? [0, 0] : near(b.deg, size); return { ...b, size, dx, dy }; });
  const ids = spots.map((s) => `.actions #${s.id}`);
  return [
    '.actions #heavy-button,.actions #thrust-button,.actions #run-button,.actions #attack-button svg{display:none!important}',
    `${ids.join(',')}{position:fixed!important;left:auto!important;top:auto!important;margin:0!important;border-radius:50%!important;padding:0!important;display:flex!important;align-items:center;justify-content:center;font-size:0!important;line-height:1!important;min-width:0!important;z-index:5}`,
    ...spots.map((s) => `.actions #${s.id}{right:${BASE.cx - s.dx - s.size / 2}px!important;bottom:${BASE.cy - s.dy - s.size / 2}px!important;width:${s.size}px!important;height:${s.size}px!important}`),
    `${ids.map((i) => `${i}::after`).join(',')}{display:block!important;position:static!important;font-size:10px!important;font-weight:600;letter-spacing:.03em;color:inherit;text-align:center;white-space:nowrap}`,
    ...spots.map((s) => `.actions #${s.id}::after{content:"${s.label}"!important}`),
    '.actions #attack-button::after{font-size:13px!important;letter-spacing:.05em}',
    ...spots.filter((s) => (s as { font?: number }).font).map((s) => `.actions #${s.id}::after{font-size:${(s as { font?: number }).font}px!important;letter-spacing:0!important}`),   // SPECIAL 1 / SPECIAL 2 are longer than the other labels: smaller, to stay inside the circle
    ...spots.filter((s) => (s as { nameFont?: number }).nameFont).map((s) => { const n = s as unknown as { nameFont: number; nameLine: number; nameWidth: number }; return `.actions #${s.id}[data-named]::after{content:attr(data-mobile)!important;font-size:${n.nameFont}px!important;line-height:${n.nameLine}px;white-space:normal!important;max-width:${n.nameWidth}px;overflow:hidden;display:-webkit-box!important;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow-wrap:anywhere}`; }),   // a slot holding a named special (hud.ts sets data-named) shows the move's own name, wrapped to two lines inside the circle; an empty slot keeps the row's label above
    '#joystick{bottom:max(56px,env(safe-area-inset-bottom))!important}',
    `@media (min-width:${WIDE.minWidth}px){.actions #camera-button{position:fixed!important;left:auto!important;top:auto!important;margin:0!important;right:${WIDE.right}px!important;bottom:${WIDE.bottom}px!important;z-index:5}}`,   // a tablet's wide screen shows the camera button, which would sit under the Guard / Roll pair: it goes to the cluster's left, clear of it (phones hide it)
    `#touch-zones{position:fixed;z-index:4;pointer-events:none;right:${BASE.cx - V.ring / 2}px;bottom:${BASE.cy - V.ring / 2}px;width:${V.ring}px;height:${V.ring}px;border-radius:50%;border:1px dashed rgba(190,120,80,.7);background:conic-gradient(from -50deg,rgba(150,70,40,.34) 0 100deg,rgba(150,70,40,.16) 100deg 360deg)}`,
    '#touch-zones i{position:absolute;font:600 10px sans-serif;color:rgba(255,235,215,.85);font-style:normal;letter-spacing:.04em}',
  ].join('\n');
}

/** Put layout A on the page: its style, and the dashed zone ring with its three labels. Once only. */
export function applyTouchLayout(doc: Document, search: string): void {
  if (doc.getElementById('touch-layout-style')) return;
  const css = doc.createElement('style'); css.id = 'touch-layout-style'; css.textContent = touchLayoutCss(search); doc.head.append(css);
  const zones = doc.createElement('div'); zones.id = 'touch-zones';
  for (const z of DEFS.zones) { const i = doc.createElement('i'); i.setAttribute('style', z.place); i.textContent = z.label; zones.append(i); }
  doc.body.append(zones);
}
