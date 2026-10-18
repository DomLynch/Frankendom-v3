// Touch layout A (Dom's approved picture, 2026-10-13; the Combat sandbox's CS31, donor: combat sandbox @93b1138c7, layoutA in sandbox/entry.ts): a tight diamond around one big STRIKE button, its swipe zones drawn on it (a stab on
// top, a slash each side). Special upper-left, Guard lower-left, Roll lower-right, Kick far left, each touching the zone ring with a gap. The game's own buttons keep their handlers and ids; only their place and size change. It
// goes with the oneButton input (input.ts, off by default): the layout is applied only while that is on, so with it off nothing here runs. Every number is a row (touch-layout-defs.json): the base (STRIKE's centre from the right and
// bottom edge, the gap), the three size variants (`?lay=1|2|3`; Dom picked 2) and where each button sits (an angle on the ring). Presentation only. The sandbox's second special button is not here: it comes with the second special slot.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import DEFS from './touch-layout-defs.json' with { type: 'json' };
import MANIFEST from './touch-layout-defs.manifest.json' with { type: 'json' };

loadRegistry((MANIFEST.tables as unknown as Manifest[]).map((m) => tableFromFile(m, DEFS, 'touch-layout-defs.json')));

const BASE = DEFS.base[0]!;
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
    '#joystick{bottom:max(56px,env(safe-area-inset-bottom))!important}',
    `#touch-zones{position:fixed;z-index:4;pointer-events:none;right:${BASE.cx - V.ring / 2}px;bottom:${BASE.cy - V.ring / 2}px;width:${V.ring}px;height:${V.ring}px;border-radius:50%;border:1px dashed rgba(190,120,80,.7);background:conic-gradient(from -50deg,rgba(150,70,40,.34) 0 100deg,rgba(150,70,40,.16) 100deg 360deg)}`,
    '#touch-zones i{position:absolute;font:600 10px sans-serif;color:rgba(255,235,215,.85);font-style:normal;letter-spacing:.04em}',
  ].join('\n');
}

/** Put layout A on the page: its style, and the dashed zone ring with its three labels. Once only. */
export function applyTouchLayout(doc: Document, search: string): void {
  if (doc.getElementById('touch-layout-style')) return;
  const css = doc.createElement('style'); css.id = 'touch-layout-style'; css.textContent = touchLayoutCss(search); doc.head.append(css);
  const zones = doc.createElement('div'); zones.id = 'touch-zones';
  zones.innerHTML = '<i style="left:50%;top:5px;transform:translateX(-50%)">stab</i><i style="left:6px;top:50%;transform:translateY(-50%)">sl</i><i style="right:6px;top:50%;transform:translateY(-50%)">sh</i>';
  doc.body.append(zones);
}
