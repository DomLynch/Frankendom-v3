import * as THREE from 'three';

// One colour per spell school (Strategy brief #1507 item 4: WoW, EverQuest). A LOOK TEST behind `?look=schools`, presentation only: no sim, no new particles, no
// new files in the default path. Every special's effect (trail, ground mark, status tint) is drawn in its own scene group (special-presentation.ts); with the flag on
// each material in that group is pulled to its school's colour, so a busy fight reads on a phone by colour. Specials with no school here keep their own colours.
export type School = 'fire' | 'shadow' | 'poison' | 'holy' | 'frost';
export const SCHOOLS: Readonly<Record<School, string>> = { fire: '#ff7a1f', shadow: '#8a4fe0', poison: '#6fd13a', holy: '#f4cd4a', frost: '#9ad4ff' };
// Keyed by the special's id (special-identity.ts / class-special-identity.ts). One line per special, so Strategy can re-map in review.
export const SCHOOL_OF: Readonly<Record<string, School>> = {
  surtr: 'fire', haze: 'fire', wake: 'fire',                          // Ash Fall, Achilles' wrath, the Witch's wake
  hades: 'shadow', nyx: 'shadow', thanatos: 'shadow', echo: 'shadow', price: 'shadow', stirring: 'shadow',
  flies: 'poison', stain: 'poison', breath: 'poison', tempo: 'poison', pulse: 'poison',
  tithe: 'holy', centurion: 'holy',
  mist: 'frost', storm: 'frost',
};
const looks = (search: string) => (new URLSearchParams(search).get('look') ?? '').split(',');
// Dom's pick (Strategy, 2026-10-07): SOFT is the shipped default. `?look=schools-off` is today's own colours (the before frame); `?look=schools` plain and `schools3` dark stay for comparison.
export const schoolsFlag = (search: string) => !looks(search).includes('schools-off');
// Three strengths of the same hues, so Dom picks in one look (Lead 2026-10-07: his rulings want specials grey/dark/unsaturated): ?look=schools is the plain school colour,
// schools2 half the saturation and half the lightness (a soft lavender haze), schools3 a violet-black smoke (saturation x0.4, lightness x0.28).
// soft (the shipped default, Lead 2026-10-07: Dom's specials bar is dark ink, nothing pale or glowing over a fighter) does NOT repaint the effect: it keeps today's own pixels and
// mixes the school hue in at `mix` (20%), so the cloud stays as dark as today's and only leans toward the school.
export const STRENGTH = { plain: { saturation: 1, lightness: 1 }, soft: { mix: 0.2 }, dark: { saturation: 0.4, lightness: 0.28 } } as const;
export type Strength = keyof typeof STRENGTH;
export const schoolsStrength = (search: string): Strength => { const l = looks(search); return l.includes('schools3') ? 'dark' : l.includes('schools') ? 'plain' : 'soft'; };

// The effects paint dark ink into DataTexture maps, and a material colour only multiplies its map (black x any hue is black), so a mapped material's pixels are recoloured in
// place: the school hue at the pixel's own shading (relative to the map's brightest), alpha untouched, so the shape, tear and fade stay the effect's own. An unmapped material
// takes the hue as its colour. Each texture and material is done once.
const SOFT_FLOOR = 12;   // soft: the luminance (0..255) a pixel may rise to when today's own pixel is darker than this
const SHADE = [0.55, 0.45] as const;   // darkest pixel at 55% of the hue, brightest at 100%
type Tintable = THREE.Material & { color?: THREE.Color; map?: THREE.Texture | null };
function recolour(map: THREE.Texture, hue: THREE.Color, mix = 0) {
  const data = (map.image as { data?: unknown } | undefined)?.data;
  if (!(data instanceof Uint8Array) || data.length % 4) return;
  let top = 1;
  for (let i = 0; i < data.length; i += 4) top = Math.max(top, data[i], data[i + 1], data[i + 2]);
  const rgb = [hue.r, hue.g, hue.b];
  if (mix) {   // soft: the effect's own pixel, the school hue (at its darker shade) mixed in at `mix`; alpha untouched
    const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      let nr = r * (1 - mix) + rgb[0] * 255 * SHADE[0] * mix, ng = g * (1 - mix) + rgb[1] * 255 * SHADE[0] * mix, nb = b * (1 - mix) + rgb[2] * 255 * SHADE[0] * mix;
      const cap = Math.max(lum(r, g, b), SOFT_FLOOR), now = lum(nr, ng, nb);   // never lighter than today's pixel (a pale hue such as frost over a violet haze did lift it); the floor lets near-black ink take the faint lean
      if (now > cap) { const k = cap / now; nr *= k; ng *= k; nb *= k; }
      data[i] = nr; data[i + 1] = ng; data[i + 2] = nb;
    }
    map.needsUpdate = true; return;
  }
  for (let i = 0; i < data.length; i += 4) {
    const shade = SHADE[0] + SHADE[1] * (Math.max(data[i], data[i + 1], data[i + 2]) / top);
    data[i] = Math.min(255, hue.r * 255 * shade); data[i + 1] = Math.min(255, hue.g * 255 * shade); data[i + 2] = Math.min(255, hue.b * 255 * shade);
  }
  map.needsUpdate = true;
}
export function schoolTinter(group: THREE.Object3D, school: School, strength: Strength = 'plain') {
  const done = new WeakSet<object>(), hue = new THREE.Color(SCHOOLS[school]);
  const k = STRENGTH[strength], mix = 'mix' in k ? k.mix : 0;
  if ('saturation' in k && strength !== 'plain') { const hsl = { h: 0, s: 0, l: 0 }; hue.getHSL(hsl); hue.setHSL(hsl.h, hsl.s * k.saturation, hsl.l * k.lightness); }
  return () => group.traverse((o) => {
    const m = (o as THREE.Mesh).material as Tintable | Tintable[] | undefined;
    for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
      if (done.has(mat) || !mat.color) continue;
      done.add(mat);
      if (mat.map) { if (!mix) mat.color.set(0xffffff); if (!done.has(mat.map)) { done.add(mat.map); recolour(mat.map, hue, mix); } } else if (mix) mat.color.lerp(hue.clone().multiplyScalar(SHADE[0]), mix); else mat.color.copy(hue);
    }
  });
}
