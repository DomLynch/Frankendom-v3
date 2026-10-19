import * as THREE from 'three';
import type { Fighter } from './duel.ts';
import { healOf, missileOf, spellLookOf, spellRangeOf, vfxOf, SPELL_FX } from './sandbox-rules.ts';   // SPELL_FX on: the designed special effect lands the spell (special-presentation.ts), so no plain landing burst over it
import { spellRoot } from './spell-cast.ts';
import { createSpellVfx } from './spell-vfx.ts';

// sandbox-mech: missiles, the bolt in flight. A small cold core with a soft halo and a short fading trail, drawn from the fighter's `missile` state (position by tick along its line), so it always matches the sim's arrival. Presentation only:
// it reads the duel, never changes it, allocates once, draws nothing while no missile is in flight (so with no missile rows this file draws nothing).
const HEIGHT = 1.2, TRAIL = 3, TRAIL_GAP = 0.22;   // metres
export function createMissileFx(scene: THREE.Scene) {
  const n = 64, pixels = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const r = Math.hypot(x - (n - 1) / 2, y - (n - 1) / 2) / ((n - 1) / 2); pixels.set([255, 255, 255, 255 * Math.max(0, 1 - r) ** 2], (y * n + x) * 4); }
  const glow = new THREE.DataTexture(pixels, n, n); glow.needsUpdate = true; glow.magFilter = glow.minFilter = THREE.LinearFilter;
  const sprite = (size: number, color: string, opacity: number) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, opacity, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.setScalar(size); s.visible = false; s.frustumCulled = false; scene.add(s); return s; };
  const bolts = [0, 1].map(() => ({ core: sprite(0.2, '#e8f3ff', 1), halo: sprite(0.65, '#6aa8ff', 0.55), trail: Array.from({ length: TRAIL }, (_, k) => sprite(0.4 - k * 0.08, '#6aa8ff', 0.4 - k * 0.1)) }));
  // Bow arrow: a simple shaft + head + fins mesh (staff keeps the white orb). One per fighter, pointing along the flight line; shapes are rows-free presentation only.
  const SHAPE = { bow: { len: 0.95, r: 0.014, shaft: '#8a6a43', head: '#8d9399', fin: '#7a6a4c' } } as const;
  const makeShaft = () => {
    const g = new THREE.Group(), mat = (c: string) => new THREE.MeshBasicMaterial({ color: c });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6), mat('#fff')), head = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 6), mat('#fff')), fins = [0, 1].map(() => new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#fff', side: THREE.DoubleSide })));
    fins[1]!.rotation.x = Math.PI / 2;   // two crossed fins at the tail
    g.add(shaft, head, ...fins); g.visible = false; scene.add(g); return { g, shaft, head, fins };
  };
  const shafts = [0, 1].map(makeShaft), sides = [0, 1].map(() => [makeShaft(), makeShaft()]);   // sides: the two outer arrows of a bow volley (sandbox bowSpecial lanes), hidden unless one flies
  const dress = (s: (typeof shafts)[number], kind: 'bow') => {
    const k = SHAPE[kind], headLen = k.r * 6;
    s.shaft.scale.set(k.r, k.len, k.r); s.shaft.rotation.z = Math.PI / 2; (s.shaft.material as THREE.MeshBasicMaterial).color.set(k.shaft);   // lies along +x
    s.head.scale.set(k.r * 2, headLen, k.r * 2); s.head.rotation.z = -Math.PI / 2; s.head.position.x = k.len / 2 + headLen / 2; (s.head.material as THREE.MeshBasicMaterial).color.set(k.head);
    s.fins.forEach((f) => { f.scale.set(k.r * 4, k.r * 4, 1); f.position.x = -k.len / 2 + k.r * 5; (f.material as THREE.MeshBasicMaterial).color.set(k.fin); });   // small dark fletching: at 9 radii the pale planes read as white squares at the fight camera (bow frames 2026-10-18)
  };
  const dressed = [undefined, undefined] as (string | undefined)[], VOLLEY_SPREAD = 0.7;   // metres the outer arrows of a volley bow out from the line at mid-flight
  // Spell bursts (Dom 2026-10-16: a cast must be clearly visible): a flash + swelling halo on the foe where a spell lands (colour from its range row, else violet) and a small flash on the caster when the cast starts. Fed from the tick's events.
  const bursts = Array.from({ length: 6 }, () => ({ core: sprite(1, '#ffffff', 1), halo: sprite(1, '#b070ff', 0.8), at: -1, x: 0, z: 0, big: 1, life: 42 })); let next = 0;   // life: ticks the burst lasts (a spellLook row's pulse; 42 without one)
  const BURST_TICKS = 42;
  const vfx = createSpellVfx(scene);   // the spells' own looks (spell-vfx.ts): heal, dust shock, Ash Fall, Wind Wall, Nyx; nothing built without heal rows
  return {
    /** Shows the spell looks' parts for one `compile()` so their shader programs and light exist before the first cast. */
    warm(compile: () => void): void { vfx.warm(compile); },
    burst(events: readonly { type: string; actor: number; target?: number; spell?: string; tick: number; heal?: number }[], fighters: readonly Pick<Fighter, 'body'>[]): void {
      vfx.trigger(events, fighters);
      for (const e of events) {
        const own = e.spell !== undefined && (healOf(e.spell) !== undefined || vfxOf(e.spell) !== undefined);   // a spell with its own look (spell-vfx.ts): no violet flash at the cast or the landing
        const land = !SPELL_FX && !own && e.type === 'SpecialLanded' && e.spell && e.target !== undefined, start = !own && e.type === 'SpecialStarted' && e.spell;
        if (!land && !start) continue;
        const who = fighters[land ? e.target! : e.actor]; if (!who) continue;
        const b = bursts[next++ % bursts.length]!, root = e.spell ? spellRoot(e.spell) : undefined, look = e.spell ? spellLookOf(e.spell) : undefined, tint = look?.tint || (root && spellRangeOf(root)?.tint) || '#b070ff';   // the spell's own look row first, then its root's range tint
        (b.halo.material as THREE.SpriteMaterial).color.set(tint); b.at = e.tick; b.x = who.body.x; b.z = who.body.z; b.big = (land ? 1 : 0.4) * (look?.size ?? 1000) / 1000; b.life = look?.pulse ?? BURST_TICKS;
      }
    },
    update(tick: number, fighters: readonly Pick<Fighter, 'missile' | 'weapon'>[]): void {
      for (const b of bursts) {
        const age = tick - b.at, live = b.at >= 0 && age >= 0 && age < b.life, k = live ? age / b.life : 1;
        b.core.visible = b.halo.visible = live; if (!live) continue;
        b.core.position.set(b.x, HEIGHT, b.z); b.halo.position.copy(b.core.position);
        b.core.scale.setScalar(b.big * (1.1 - k * 0.6)); b.halo.scale.setScalar(b.big * (0.8 + k * 2.6));
        (b.core.material as THREE.SpriteMaterial).opacity = 1 - k; (b.halo.material as THREE.SpriteMaterial).opacity = 0.85 * (1 - k * k);
      }
      vfx.update(tick);
      this.fly(tick, fighters);
    },
    fly(tick: number, fighters: readonly Pick<Fighter, 'missile' | 'weapon'>[]): void {
      fighters.forEach((f, i) => {
        const b = bolts[i]!, m = f.missile, live = !!m && tick < m.arrives;
        const kind = missileOf(f.weapon)?.kind, arrow = kind === 'bow' ? kind : undefined, sh = shafts[i]!;
        b.core.visible = live && !arrow; b.halo.visible = live && !arrow; for (const t of b.trail) t.visible = live && !arrow; sh.g.visible = live && !!arrow;   // an arrow or bolt is plain wood and iron: no glow, no trail (the staff keeps its white orb)
        const outer = (m?.lanes ?? []).filter((l) => l !== 0);
        sides[i]!.forEach((s, k) => { s.g.visible = live && !!arrow && k < outer.length; });
        if (!m || !live) return;
        if (arrow && dressed[i] !== arrow) { dress(sh, arrow); for (const s of sides[i]!) dress(s, arrow); dressed[i] = arrow; }
        const tint = m.tint ?? missileOf(f.weapon)?.tint;   // a spell's own colour, else the row's colour for this weapon's bolt (staff blue, arrow tan)
        if (tint) { (b.halo.material as THREE.SpriteMaterial).color.set(tint); for (const t of b.trail) (t.material as THREE.SpriteMaterial).color.set(tint); }
        const along = m.range * Math.min(1, Math.max(0, (tick - m.launched) / Math.max(1, m.arrives - m.launched)));
        b.core.position.set(m.x + m.dx * along, HEIGHT, m.z + m.dz * along); b.halo.position.copy(b.core.position);
        sh.g.position.set(b.core.position.x, HEIGHT, b.core.position.z); sh.g.rotation.y = Math.atan2(-m.dz, m.dx);
        const frac = (tick - m.launched) / Math.max(1, m.arrives - m.launched), bow = VOLLEY_SPREAD * Math.sin(Math.PI * Math.min(1, Math.max(0, frac)));
        outer.forEach((l, k) => { const s = sides[i]![k]!; s.g.position.set(sh.g.position.x + m.dz * l * bow, HEIGHT, sh.g.position.z - m.dx * l * bow); s.g.rotation.y = sh.g.rotation.y; });
        if (arrow) b.halo.scale.setScalar(0.3);
        b.trail.forEach((t, k) => { const back = Math.max(0, along - (k + 1) * TRAIL_GAP); t.position.set(m.x + m.dx * back, HEIGHT, m.z + m.dz * back); });
      });
    },
  };
}
