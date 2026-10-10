// Rank finishes (grades.ts GRADES) shown on the armour (Strategy via Lead, 2026-09-26): a worn piece wears the grade of the rung it was taken
// at, an opponent's kit the rung he is met at. Metal, trim and leather only (gradeFor); cloth is the house dye and bone, Ruby, Wood stay.
//
// A TINT, never a repaint. The old gradeMaterial set the base colour outright, so map-less Steel went flat Recruit-orange and Master-white and
// ruling C (#705) removed it. Here the map stays in charge of the detail: after the map (`color_fragment`) the albedo keeps its own luminance L
// and takes the grade's hue at a mean brightness moved toward the grade's, rgb = chroma(grade) · L · gain, gain = luma(grade) / luma(source),
// clamped so no rung blows a piece to white or crushes it to black. One program for every rung (the grade rides uniforms).
import { Color, MeshStandardMaterial, type Texture } from 'three';
import { GRADES, classOf, gradeFor, levelOf, type Tier } from '../core/grades.ts';

// How far toward the grade; the gain's bounds. Tuned on the Centurion's ten-rank sheet (375, local preview).
// leatherAsTrim: GRADES' leather ladder is ten near-identical dark browns, so on the first sheet only the helmet carried the rung. Leather
// (boots, straps, belts) takes the rung's trim finish instead, so the kit below the helmet reads the ladder too.
// metal: the metal pieces carry the ladder (Strategy's ruling, 2026-09-26: helmet, greaves, arms, shield boss read at fight-camera
// distance), so metal takes the grade's hue in full, a wider gain and a stronger sheen push than trim and leather.
export const TINT = {
  strength: 0.85, minGain: 0.35, maxGain: 2.5, mapMetal: 0.6, mapRough: 0.7, leatherAsTrim: true,
  metal: { strength: 1, maxGain: 3.2, metalCap: 2.2, roughFloor: 0.2 },
  // stone: a weapon's stone head keeps its own colour half-way (the Witch's stone stays green-led) and its glow runs glowMin..glowMax × its own
  // over the ten rungs.
  stone: { strength: 0.5, glowMin: 0.5, glowMax: 1.8 },
};

const luma = (c: { r: number; g: number; b: number }) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
// The map's mean linear luminance, read once from a 16×16 downscale where a canvas exists; 0.2 (dark worn metal) where none does (node).
const means = new WeakMap<Texture, number>();
function mapMean(map: Texture | null): number {
  if (!map) return 1;
  const known = means.get(map); if (known !== undefined) return known;
  let mean = 0.2;
  try {
    const image = map.image as CanvasImageSource | undefined, canvas = typeof OffscreenCanvas === 'function' && image ? new OffscreenCanvas(16, 16) : undefined, context = canvas?.getContext('2d');
    if (context && image) {
      context.drawImage(image, 0, 0, 16, 16); const data = context.getImageData(0, 0, 16, 16).data; let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += luma({ r: (data[i]! / 255) ** 2.2, g: (data[i + 1]! / 255) ** 2.2, b: (data[i + 2]! / 255) ** 2.2 });
      mean = sum / (data.length / 4);
    }
  } catch { /* a tainted or unreadable image keeps the default */ }
  means.set(map, mean); return mean;
}

const cache = new WeakMap<MeshStandardMaterial, Map<Tier, MeshStandardMaterial>>();
// The material a piece wears at `tier`: the source itself when the grade leaves it alone, else one shared clone per (source, tier).
export function tinted(source: MeshStandardMaterial, tier: Tier): MeshStandardMaterial {
  const kind = classOf(source.name), stone = kind === 'stone';
  const finish = stone || (TINT.leatherAsTrim && kind === 'leather') ? GRADES[tier].trim : gradeFor(tier, source.name);
  if (!finish) return source;
  let byTier = cache.get(source); if (!byTier) cache.set(source, (byTier = new Map()));
  const known = byTier.get(tier); if (known) return known;
  const material = source.clone(), grade = new Color(finish.color), gradeLuma = Math.max(luma(grade), 1e-4);
  const sourceLuma = Math.max(luma(source.color) * mapMean(source.map), 1e-4);
  const metal = kind === 'metal', strength = metal ? TINT.metal.strength : stone ? TINT.stone.strength : TINT.strength;
  const chroma = grade.clone().multiplyScalar(1 / gradeLuma), gain = Math.min(metal ? TINT.metal.maxGain : TINT.maxGain, Math.max(TINT.minGain, gradeLuma / sourceLuma));
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rankTint = { value: [chroma.r, chroma.g, chroma.b, gain] };
    shader.uniforms.rankStrength = { value: strength };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 rankTint;\nuniform float rankStrength;')
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float rankL = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  diffuseColor.rgb = mix( diffuseColor.rgb, rankTint.rgb * rankL * rankTint.a, rankStrength );
}`);
  };
  material.customProgramCacheKey = () => 'rank-tint';
  // The finish: a map-less material takes the grade's factors; a mapped one keeps its map's pattern, scaled toward the grade.
  const toward = (from: number, to: number) => from + (to - from) * strength;
  if (stone) {
    if (source.emissive.getHex()) { material.emissive = source.emissive.clone().lerp(grade, strength); material.emissiveIntensity = source.emissiveIntensity * (TINT.stone.glowMin + (TINT.stone.glowMax - TINT.stone.glowMin) * (levelOf(tier) - 1) / 9); }
    material.userData = { ...source.userData, rankTier: tier, rankTint: [chroma.r, chroma.g, chroma.b, gain, strength] };
    byTier.set(tier, material); return material;
  }
  if (source.metalnessMap) material.metalness = Math.min(1, source.metalness * Math.min(metal ? TINT.metal.metalCap : 1.7, Math.max(0.2, finish.metalness / TINT.mapMetal)));
  else material.metalness = toward(source.metalness, finish.metalness);
  if (source.roughnessMap) material.roughness = Math.min(1, source.roughness * Math.min(1.5, Math.max(metal ? TINT.metal.roughFloor : 0.3, finish.roughness / TINT.mapRough)));
  else material.roughness = toward(source.roughness, finish.roughness);
  material.userData = { ...source.userData, rankTier: tier, rankTint: [chroma.r, chroma.g, chroma.b, gain, strength] };
  byTier.set(tier, material); return material;
}
