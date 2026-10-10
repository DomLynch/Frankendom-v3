import * as THREE from 'three';

const RED = new THREE.Color(1, 0.36, 0.3);   // what each light's colour is multiplied toward at full red
export function lightRig(scene: THREE.Scene) {
  const colours: [THREE.Color, THREE.Color, number][] = [], seen = new Set<THREE.Color>(), gates: [THREE.Material, number][] = [];
  const add = (c: THREE.Color | null | undefined, k = 1) => { if (c && !seen.has(c)) { seen.add(c); colours.push([c, c.clone(), k]); } };
  scene.traverse((o) => {
    if ((o as THREE.Light).isLight) { const l = o as THREE.HemisphereLight & THREE.DirectionalLight; add(l.color); add(l.groundColor); }
    const m = (o as THREE.Mesh).material as THREE.Material & { color?: THREE.Color } | undefined;
    if (m && m.name === 'sky') add(m.color);
    if (m && (m.name === 'gate-light' || m.name === 'light-shafts')) gates.push([m, m.opacity]);
  });
  add(scene.background as THREE.Color | null); add(scene.fog?.color);
  const env = scene.environmentIntensity;
  return {
    set(amount: number) {   // 0 = the arena as it was, 1 = full red
      for (const [c, base, k] of colours) c.copy(base).lerp(base.clone().multiply(RED), Math.min(1, amount * k));
      for (const [m, base] of gates) m.opacity = base * (1 - Math.min(1, amount * 1.6));
      scene.environmentIntensity = env * (1 - 0.35 * amount);
    },
    restore() { for (const [c, base] of colours) c.copy(base); for (const [m, base] of gates) m.opacity = base; scene.environmentIntensity = env; },
  };
}


export type TitheLight = ReturnType<typeof lightRig>;
// One arena transform composes independent Tithe casts; clearing one never restores another.
export function createTitheLighting(scene: THREE.Scene) {
  const contributions = new Map<THREE.Scene, number>(), background = scene.background instanceof THREE.Color ? scene.background.clone() : null;
  let rig: TitheLight | undefined;
  const beginFrame = () => { rig?.restore(); if (background && scene.background instanceof THREE.Color) scene.background.copy(background); };
  const apply = (dim = 1) => {
    const heat = Math.max(0, ...contributions.values());
    if (heat > 0) (rig ??= lightRig(scene)).set(heat); else beginFrame();
    if (scene.background instanceof THREE.Color) scene.background.multiplyScalar(dim);
  };
  return {
    beginFrame, apply,
    forGroup(group: THREE.Scene): TitheLight { return { set(amount) { contributions.set(group, amount); }, restore() { contributions.delete(group); apply(); } }; },
    clear() { contributions.clear(); beginFrame(); },
  };
}
