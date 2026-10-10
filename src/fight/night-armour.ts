// Brynhildr's L9 armour in the Night Pit (Strategy via Armour ticket 2026-10-02): the baked map is a saturated green on a full-metal, rough-1
// material, and the pit's orange firelight at exposure 1.85 turns it into a green-gold glow from frame 1 (shield9-night2). Here the map keeps
// its luminance pattern and takes a dark bronze hue, with the sheen pulled down. Night Pit only; the day look and the shape are untouched.
import { MeshStandardMaterial, type Mesh } from 'three';
import type { RankLook } from './characters.ts';

export const NIGHT_BRONZE = { color: [0.34, 0.215, 0.1], gain: 1.5, metalness: 0.55, roughness: 0.62, env: 0.55 } as const;
export const nightBronzeApplies = (arenaId: string, opponent: string, level: number): boolean => arenaId === 'a' && opponent === 'shieldmaiden' && level === 9;

export function toneNightBronze(look: RankLook): void {
  const done = new Set<MeshStandardMaterial>();
  for (const draw of look.draws) for (const m of [(draw as Mesh).material].flat()) {
    if (!(m instanceof MeshStandardMaterial) || done.has(m)) continue;
    done.add(m);
    m.metalness = Math.min(m.metalness, NIGHT_BRONZE.metalness); m.roughness = Math.max(m.roughness, NIGHT_BRONZE.roughness); m.envMapIntensity = NIGHT_BRONZE.env;
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
{
  float nightL = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  diffuseColor.rgb = vec3( ${NIGHT_BRONZE.color.join(', ')} ) * nightL * ${NIGHT_BRONZE.gain.toFixed(2)};
}`);
    };
    m.customProgramCacheKey = () => 'night-bronze'; m.needsUpdate = true;
  }
}
