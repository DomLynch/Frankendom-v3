// The golden weapon drops' presentation (data/golden-weapons.json; rules in src/zone/golden-drops.ts): a glowing ring and beam at each pickup's spot on screen (DOM, from existing parts only: no art, no 3D
// object), a small tap disc on a ring in reach, the charges counter ("Golden Axe x10"), the one-line toast, and the gold tint on the weapon in the hero's hand. PRESENTATION ONLY: everything is
// pointer-events none except a tap disc on a pickup within tap reach, and nothing touches the sim, the camera or the input. The tint swaps the held weapon's materials for a gold one and puts the file's
// own back when the weapon is spent or lost; the weapon's geometry, clips and reach are untouched.
import { Mesh, MeshStandardMaterial, type Material, type Object3D } from 'three';
import type { GoldenRow, GoldenRows, GoldenUi, Item, Source } from '../zone/golden-drops.ts';

type Doc = { createElement(tag: string): HTMLElement; body: HTMLElement; head: HTMLElement };
type Project = (x: number, y: number, z: number, out: [number, number]) => boolean;

/** Gold on `node`'s meshes (their own materials remembered in `saved`); `row` null puts them back. Returns whether anything changed. */
function tintHeld(node: Object3D | undefined, row: GoldenRow | null, saved: Map<Mesh, Material | Material[]>): void {
  if (!node) return;
  if (!row) { for (const [mesh, mat] of saved) { mesh.material = mat; delete mesh.userData.golden; } saved.clear(); return; }
  const t = row.tint;
  node.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    if (!saved.has(o)) saved.set(o, o.material);
    if (o.userData.golden === row.id) return;
    const gold = new MeshStandardMaterial({ color: t.colour, emissive: t.emissive, emissiveIntensity: t.emissiveIntensity, metalness: t.metalness, roughness: t.roughness });
    o.material = gold; o.userData.golden = row.id;
  });
}

export function mountGoldenHud(doc: Doc, rows: GoldenRows, heroNode: () => Object3D | undefined, project: Project, clock: () => number): GoldenUi & { remove(): void } {
  const m = rows.marker, h = rows.hud, style = doc.createElement('style');
  style.textContent = `.gw-mark{position:fixed;left:0;top:0;width:${m.ringPx}px;height:${m.ringPx * 0.4}px;margin:${-m.ringPx * 0.2}px 0 0 ${-m.ringPx / 2}px;z-index:${m.zIndex};pointer-events:none;opacity:0;border:${m.widthPx}px solid ${m.colour};`
    + `border-radius:50%;box-shadow:0 0 12px 2px ${m.glow};will-change:transform,opacity}`
    + `.gw-mark::after{content:"";position:absolute;left:50%;bottom:50%;width:${m.widthPx}px;height:${m.beamPx}px;margin-left:${-m.widthPx / 2}px;background:linear-gradient(to top,${m.colour},transparent)}`
    + `.gw-hit{position:absolute;left:50%;top:50%;width:${rows.pickup.tapRadiusPx * 2}px;height:${rows.pickup.tapRadiusPx * 2}px;margin:${-rows.pickup.tapRadiusPx}px 0 0 ${-rows.pickup.tapRadiusPx}px;border-radius:50%;pointer-events:auto;display:none;touch-action:manipulation}`
    + `.gw-count,.gw-line{position:fixed;left:50%;transform:translateX(-50%);z-index:${h.zIndex};pointer-events:none;white-space:nowrap;color:${h.colour};opacity:0;transition:opacity .4s ease;`
    + `font:${h.sizePx}px/1.25 Georgia,'Times New Roman',serif;font-variant-caps:all-small-caps;letter-spacing:.14em;text-shadow:0 0 6px ${m.glow},0 1px 3px rgba(0,0,0,.85);user-select:none;-webkit-user-select:none}`
    + `.gw-count,.gw-line{background:rgba(8,10,22,${h.backdropAlpha});padding:${h.padPx / 2}px ${h.padPx * 2}px;border-radius:${h.padPx * 2}px}`   // a dark pill behind the text: it reads over the bright sky too
    + `.gw-count{top:${h.topPct}%}.gw-line{top:calc(${h.topPct}% + ${h.sizePx * 2 + h.padPx * 2}px)}`;
  doc.head.append(style);
  const pool = new Map<string, HTMLElement>(), xy: [number, number] = [0, 0], saved = new Map<Mesh, Material | Material[]>();
  let count: HTMLElement | null = null, lineEl: HTMLElement | null = null, lineTimer: ReturnType<typeof setTimeout> | null = null, want: GoldenRow | null = null, applied: Object3D | undefined;
  const make = (cls: string, key: string): HTMLElement => { const el = doc.createElement('div'); el.className = cls; el.dataset.golden = key; el.setAttribute('aria-hidden', 'true'); doc.body.append(el); return el; };
  return {
    frame(items: readonly Item[], hero: { x: number; z: number }, tap: (key: string, source: Source) => void) {
      const node = heroNode();
      if (node !== applied) { applied = node; if (want) tintHeld(node, want, saved); }   // the rig was rebuilt: the tint goes on its new weapon
      const live = new Set<string>(), t = clock() / (m.pulseSeconds * 1000);
      for (const it of items) {
        const id = it.source + it.key, d = Math.hypot(it.x - hero.x, it.z - hero.z);
        let el = pool.get(id);
        if (d > m.showWithinMetres || !project(it.x, 0.15, it.z, xy)) { if (el) el.style.opacity = '0'; continue; }
        if (!el) {
          el = make('gw-mark', id); const hit = doc.createElement('div'); hit.className = 'gw-hit';
          hit.addEventListener('pointerup', (e) => { e.stopPropagation(); tap(it.key, it.source); });
          el.append(hit); pool.set(id, el);
        }
        live.add(id);
        el.style.transform = `translate(${xy[0].toFixed(1)}px,${xy[1].toFixed(1)}px)`;
        el.style.opacity = (m.alpha * (0.65 + 0.35 * Math.sin(t * Math.PI * 2))).toFixed(3);
        const high = (globalThis as { innerHeight?: number }).innerHeight ?? 0;   // the tap disc only where no control lives: clear of the stick, STRIKE, roll, guard and the bars
        (el.firstChild as HTMLElement).style.display = d <= rows.pickup.tapReachMetres && xy[1] >= rows.pickup.tapTopFrac * high && xy[1] <= rows.pickup.tapBottomFrac * high ? 'block' : 'none';
      }
      for (const [id, el] of pool) if (!live.has(id) && !items.some((i) => i.source + i.key === id)) { el.remove(); pool.delete(id); }   // a pickup that is gone (taken, expired) loses its marker
    },
    counter(held) {
      if (!held && !count) return;
      count ??= make('gw-count', 'count');
      count.textContent = held ? h.text.replace('{name}', held.row.name).replace('{charges}', String(held.charges)) : '';
      count.style.opacity = held ? '1' : '0';
    },
    line(text) {
      lineEl ??= make('gw-line', 'line'); lineEl.textContent = text; lineEl.style.opacity = '1';
      if (lineTimer !== null) clearTimeout(lineTimer);
      lineTimer = setTimeout(() => { if (lineEl) lineEl.style.opacity = '0'; lineTimer = null; }, rows.lines.seconds * 1000);
    },
    tint(row) { want = row; applied = heroNode(); tintHeld(applied, row, saved); },
    remove() { for (const el of pool.values()) el.remove(); count?.remove(); lineEl?.remove(); style.remove(); if (lineTimer !== null) clearTimeout(lineTimer); tintHeld(applied, null, saved); },
  };
}
