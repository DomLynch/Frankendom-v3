// The radar (data/radar.json; Dom 2026-10-28: free look turns the hero away from threats, so a small mini-map). A dark translucent disc in a HUD corner: the hero at its centre, rotated with the
// camera heading (UP = where the camera looks), one small dot per boss / player / NPC, a dot beyond range held on the rim at its bearing. PRESENTATION ONLY: it reads positions and the view yaw and
// draws a handful of dots on a 2D canvas; it never touches the sim, the camera or the input (pointer-events none). The maths below is pure (test/radar.test.mjs); `mountRadar` is the only DOM.
import ROWS from '../../data/radar.json' with { type: 'json' };

export type RadarClass = 'hostile' | 'player' | 'npc' | 'dead';
type Style = { colour: string; alpha: number; sizePx: number };
export type RadarRows = {
  on: boolean; query: string; off: string; corner: string; sizePx: number; marginPx: number; offsetPx: number; zIndex: number; rangeMetres: number; rimInset: number; dprMax: number;
  disc: { colour: string; alpha: number }; rim: { colour: string; alpha: number; widthPx: number }; edgeAlpha: number; hero: Style;
  classes: { hostile: Style; player: Style; npc: Style; dead: Style & { show: boolean } };
  kinds: Record<string, string>; defaultKind: string;
};
const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Throws on a bad row: a colour that is no #rrggbb, an alpha outside 0..1, a size or range that is not positive, a corner or class the code does not know. */
export function validateRadar(r: RadarRows): void {
  const num = (name: string, v: unknown, lo: number, hi: number) => { if (!(typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi)) throw new Error(`radar.${name} ${String(v)} is not a number in ${lo}..${hi}`); };
  const colour = (name: string, v: unknown) => { if (!(typeof v === 'string' && HEX.test(v))) throw new Error(`radar.${name} ${String(v)} is not a #rrggbb colour`); };
  if (typeof r.on !== 'boolean') throw new Error('radar.on is true or false');
  for (const k of ['query', 'off'] as const) if (!(typeof r[k] === 'string' && r[k])) throw new Error(`radar.${k} is a non-empty string`);
  if (!CORNERS.includes(r.corner)) throw new Error(`radar.corner ${r.corner} is not one of ${CORNERS.join(', ')}`);
  num('sizePx', r.sizePx, 32, 240); num('marginPx', r.marginPx, 0, 200); num('offsetPx', r.offsetPx, 0, 400); num('zIndex', r.zIndex, 0, 1000); num('rangeMetres', r.rangeMetres, 1, 1000);
  num('rimInset', r.rimInset, 0, 0.45); num('dprMax', r.dprMax, 1, 4); num('edgeAlpha', r.edgeAlpha, 0, 1);
  colour('disc.colour', r.disc?.colour); num('disc.alpha', r.disc?.alpha, 0, 1);
  colour('rim.colour', r.rim?.colour); num('rim.alpha', r.rim?.alpha, 0, 1); num('rim.widthPx', r.rim?.widthPx, 0, 6);
  colour('hero.colour', r.hero?.colour); num('hero.alpha', r.hero?.alpha, 0, 1); num('hero.sizePx', r.hero?.sizePx, 0.5, 20);
  for (const c of ['hostile', 'player', 'npc', 'dead'] as const) {
    const s = r.classes?.[c];
    colour(`classes.${c}.colour`, s?.colour); num(`classes.${c}.alpha`, s?.alpha, 0, 1); num(`classes.${c}.sizePx`, s?.sizePx, 0.5, 20);
  }
  if (typeof r.classes.dead.show !== 'boolean') throw new Error('radar.classes.dead.show is true or false');
  for (const [kind, cls] of Object.entries(r.kinds ?? {})) if (cls !== 'hostile' && cls !== 'npc') throw new Error(`radar.kinds.${kind} ${String(cls)} is not hostile or npc`);
  if (r.defaultKind !== 'hostile' && r.defaultKind !== 'npc') throw new Error(`radar.defaultKind ${String(r.defaultKind)} is not hostile or npc`);
}
export const RADAR = ROWS as unknown as RadarRows;
validateRadar(RADAR);

/** The radar is on: the row says so and the link does not carry the off switch (?radar=off). */
export const radarOn = (search: string, rows: RadarRows = RADAR): boolean => rows.on && new URLSearchParams(search).get(rows.query) !== rows.off;

/** The class of a zone spawn: the dim dot while it waits to respawn, else its kind's class (data/radar.json kinds). */
export const classOf = (rows: RadarRows, kind: string, dead: boolean): RadarClass => (dead ? 'dead' : (rows.kinds[kind] ?? rows.defaultKind) as RadarClass);

/** Where a thing at offset (dx, dz) from the hero (zone axes, metres) lands on the disc for a view looking along `yaw`: `x` to the right and `y` UP, both in disc radii (the rim is 1; the dot is held at `1 - rimInset`). `clamped`: it was beyond range. */
export type Spot = { x: number; y: number; clamped: boolean };
export function place(rows: RadarRows, dx: number, dz: number, yaw: number, out: Spot): Spot {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  const right = dx * c - dz * s, up = -dx * s - dz * c;   // the camera stands behind the hero at (sin yaw, cos yaw) and looks along (-sin yaw, -cos yaw): that is UP; its right is (cos yaw, -sin yaw)
  const reach = 1 - rows.rimInset, d = Math.hypot(right, up), k = d > rows.rangeMetres ? rows.rangeMetres / d : 1;
  out.x = (right * k / rows.rangeMetres) * reach; out.y = (up * k / rows.rangeMetres) * reach; out.clamped = k < 1;
  return out;
}

/** Every boss of the zone as a blip: its live position (`liveAt(i)`, the boss the sim holds or an attacker, else undefined) or its spot, as the dim dead class while it waits to respawn. `emit(x, z, class)` in the same frame as the hero. */
export function bossBlips(rows: RadarRows, spawns: readonly { x: number; z: number; kind: string; deadFor: number | null }[], liveAt: (i: number) => { x: number; z: number } | undefined, emit: (x: number, z: number, cls: RadarClass) => void): void {
  for (let i = 0; i < spawns.length; i++) {
    const s = spawns[i]!, dead = s.deadFor !== null, at = dead ? s : liveAt(i) ?? s;
    emit(at.x, at.z, classOf(rows, s.kind, dead));
  }
}

/** Other players from the presence handle (src/presence/chunk.ts `remotes(now)`: zone-frame metres, nearest first) in the page's pit frame (take `origin` off). No handle (presence off) = none. */
export function playerBlips(handle: { remotes?: (now: number) => readonly { x: number; z: number }[] } | undefined, now: number, origin: { x: number; z: number }, emit: (x: number, z: number, cls: RadarClass) => void): void {
  if (!handle || typeof handle.remotes !== 'function') return;
  for (const p of handle.remotes(now)) emit(p.x - origin.x, p.z - origin.z, 'player');
}

const rgba = (hex: string, a: number): string => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

/** What the radar reads each frame: `each(emit)` calls emit for every boss and player once (the page builds it once; no allocation per frame). */
export type RadarSources = { each: (emit: (x: number, z: number, cls: RadarClass) => void) => void };
type Doc = { createElement(tag: string): HTMLElement; body: HTMLElement; hidden?: boolean };

/** Builds the disc and its canvas and puts them in `parent`. `frame(heroX, heroZ, yaw)` redraws (nothing while the page is hidden); `remove()` takes it away. Dots: dead first, the live on top. */
export function mountRadar(doc: Doc, src: RadarSources, rows: RadarRows = RADAR, parent: HTMLElement = doc.body, dpr = (globalThis as { devicePixelRatio?: number }).devicePixelRatio ?? 1) {
  const box = doc.createElement('div'), canvas = doc.createElement('canvas') as HTMLCanvasElement, ctx = canvas.getContext('2d');
  const size = rows.sizePx, ratio = Math.min(Math.max(dpr, 1), rows.dprMax), [v, h] = rows.corner.split('-') as [string, string];
  const inner = size - 2 * rows.rim.widthPx, centre = inner / 2;   // the canvas fills the disc inside its rim
  canvas.width = canvas.height = Math.round(inner * ratio);
  canvas.style.cssText = `display:block;width:${inner}px;height:${inner}px`;
  box.setAttribute('aria-hidden', 'true'); box.dataset.radar = 'true';
  box.style.cssText = `position:fixed;${v}:calc(env(safe-area-inset-${v}, 0px) + ${rows.marginPx + rows.offsetPx}px);${h}:calc(env(safe-area-inset-${h}, 0px) + ${rows.marginPx}px);width:${size}px;height:${size}px;box-sizing:border-box;border-radius:50%;`
    + `background:${rgba(rows.disc.colour, rows.disc.alpha)};border:${rows.rim.widthPx}px solid ${rgba(rows.rim.colour, rows.rim.alpha)};overflow:hidden;pointer-events:none;user-select:none;z-index:${rows.zIndex};contain:strict`;
  box.append(canvas); parent.append(box);
  const spot: Spot = { x: 0, y: 0, clamped: false };
  let hx = 0, hz = 0, yaw = 0, pass: 'dead' | 'live' = 'dead';
  const dot = (x: number, z: number, cls: RadarClass) => {
    if ((cls === 'dead') !== (pass === 'dead')) return;
    if (cls === 'dead' && !rows.classes.dead.show) return;
    const st = rows.classes[cls];
    place(rows, x - hx, z - hz, yaw, spot);
    ctx!.globalAlpha = st.alpha * (spot.clamped ? rows.edgeAlpha : 1); ctx!.fillStyle = st.colour;
    ctx!.beginPath(); ctx!.arc(centre + spot.x * centre, centre - spot.y * centre, st.sizePx, 0, Math.PI * 2); ctx!.fill();
  };
  return {
    element: box,
    frame(heroX: number, heroZ: number, viewYaw: number): void {
      if (!ctx || doc.hidden) return;
      hx = heroX; hz = heroZ; yaw = viewYaw;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, inner, inner);
      const hs = rows.hero.sizePx;   // the hero: a small chevron at the centre, tip up (the camera looks up the disc)
      ctx.globalAlpha = rows.hero.alpha; ctx.fillStyle = rows.hero.colour;
      ctx.beginPath(); ctx.moveTo(centre, centre - hs); ctx.lineTo(centre + hs * 0.8, centre + hs * 0.8); ctx.lineTo(centre, centre + hs * 0.35); ctx.lineTo(centre - hs * 0.8, centre + hs * 0.8); ctx.closePath(); ctx.fill();
      pass = 'dead'; src.each(dot); pass = 'live'; src.each(dot);
      ctx.globalAlpha = 1;
    },
    remove(): void { box.remove(); },
  };
}
