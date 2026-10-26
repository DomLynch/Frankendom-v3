// V3's arena: V2's flat stage (src/client/stage.js createGround, data/stage.json) in the slot V1's pit filled (arena.ts buildArena,
// arena-themes.ts arenaFor). V1's scene keeps its own lights, shadows and environment; this hands it V2's sky and light values as the
// theme it reads, and a floor with nothing to animate. No crowd, gate, weather or backdrop: the stage is the floor and the sky.
import * as THREE from 'three';
import { createGround } from './client/stage.js';
import STAGE from '../data/stage.json' with { type: 'json' };
import type { OpponentId } from './fight/moves.ts';

const { light, duel } = STAGE;

// The fields of V1's ArenaTheme the duel scene and its effects read (scene.ts, foot-dust.ts dustToneFor, special-presentation.ts exposure).
export type ArenaTheme = {
  id: string; fog: string; fogDensity: number; exposure: number;
  hemisphere: [string, string, number]; sun: [string, number];
  light: { sun: [number, number, number]; flicker?: number };
  textures: { floor: string }; wet?: number;
};
const THEME: ArenaTheme = {
  id: duel.id, fog: STAGE.sky, fogDensity: duel.fogDensity, exposure: light.exposure,
  hemisphere: [light.hemi.sky, light.hemi.ground, light.hemi.intensity], sun: [light.sun.color, light.sun.intensity],
  light: { sun: duel.sunPosition as [number, number, number] }, textures: { floor: duel.floor },
};
export const arenaFor = (_opponent: OpponentId, _override?: string): ArenaTheme => THEME;

// V1's Arena, by shape: the scene scales `group` with the play circle, reads `sky.image.width` (a 1-px sky keeps the studio environment),
// waits on `ready`, and calls update / raiseGate / thinCrowd / dispose; there is nothing behind them here.
export type Arena = {
  group: THREE.Group; floor: THREE.Mesh; readonly sky: THREE.Texture; readonly materials: undefined; ready: Promise<void>;
  update(...args: unknown[]): void; raiseGate(open: boolean): void; thinCrowd(): void; dispose(): void; readonly guards: { built: number; of: number };
};
export function buildArena(scene: THREE.Scene, _theme: ArenaTheme): Arena {
  const group = createGround(STAGE) as THREE.Group;
  scene.add(group);
  const sky = Object.assign(new THREE.Texture(), { image: { width: 1 } });
  return {
    group, floor: group.getObjectByName('floor') as THREE.Mesh, sky, materials: undefined, ready: Promise.resolve(),
    update() {}, raiseGate() {}, thinCrowd() {}, dispose() { scene.remove(group); }, guards: { built: 0, of: 0 },
  };
}
// arena.ts crowdWave: the Harvest Sweep leans the crowd; there is no crowd.
export const crowdWave: { lean: ((angle: number) => number) | null } = { lean: null };
