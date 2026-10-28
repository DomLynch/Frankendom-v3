// The page's side of the golden weapon drops (data/golden-weapons.json, src/zone/golden-drops.ts): builds the controller on the page's progression save, the HUD on its view, and the rider's tune.
// Kept out of src/client/main.ts (many lanes edit it): main.ts calls mountGolden once and then step / hits / died / killed. A page with no save (?save=off, ?pitborn=v1) mounts nothing and the game is as before.
import type { Object3D } from 'three';
import { GOLDEN, createGolden, freshGolden, loadWeapon, type GoldenSave } from '../zone/golden-drops.ts';
import { validateGolden } from './golden-check.ts';
import { RINGS } from '../zone/rings.ts';
import { mountGoldenHud } from './golden-hud.ts';
import type { TuneMap } from '../tune.ts';

type Doc = Parameters<typeof mountGoldenHud>[0];
export type GoldenPage = {
  doc: Doc;
  view: { projectInto(x: number, y: number, z: number, out: [number, number]): boolean; heroWeaponNode(): Object3D | undefined };
  kinds: readonly string[];                                 // every data/profiles.json id: the rider is laid over each
  drawable: readonly string[];                              // the weapons the hero can draw (scene.ts CARRIED_WEAPONS)
  isWeapon: (id: string) => boolean;                        // a src/fight/weapon-defs.json row exists
  get(): GoldenSave | undefined; put(next: GoldenSave): void;   // the progression save's optional field, and the page's write-back (which persists)
  retune(extra: TuneMap): void;
};

/** Checks the table (a bad row stops the page at load, like every data file). */
export const checkGolden = (isWeapon: (id: string) => boolean): void => validateGolden(GOLDEN, isWeapon, RINGS.rings);

/** The weapon the hero is built with at load: the golden weapon's own id when he holds one he can draw, else `fallback`. */
export const goldenWeaponAtLoad = (save: GoldenSave | undefined, drawable: readonly string[], fallback: string): string => loadWeapon(save, GOLDEN, drawable, fallback);

export function mountGolden(p: GoldenPage) {
  const ui = mountGoldenHud(p.doc, GOLDEN, () => p.view.heroWeaponNode(), (x, y, z, out) => p.view.projectInto(x, y, z, out), () => performance.now());
  return createGolden({
    rows: GOLDEN, drawable: p.drawable, kinds: p.kinds, ui, get: () => p.get() ?? freshGolden(), put: p.put, retune: p.retune, now: () => Date.now(), rng: Math.random,
  });
}