// The first frame, drawn behind the versus card. The fight is not rendered while the card is up (main.ts paused()), so the first real draw landed the
// instant it lifted and uploaded every map and buffer of both rigs and the arena in one 2-3 s long task (Chromium, 375 x 812, 4x CPU, software GL: veteran
// 3005 ms, pitborn 2259 ms, setfoot 3242 ms). Here the maps go up a slice per frame, then one whole draw, all before the card may lift; a slow device
// stops uploading after `budgetMs` and the card lifts anyway (the rest of the warm-up is dropped). Pixels are untouched: the draw is what the first frame was.
export type FirstFrame = {
  textures: readonly unknown[];               // every map in the scene
  upload(texture: unknown): void;             // renderer.initTexture
  draw(): void;                               // renderer.render(scene, camera)
  frame(): Promise<void>;                     // yield to the event loop (a macrotask, never requestAnimationFrame: see warmFirstFrame)
  budgetMs: number;
  sliceMs: number;                            // uploads per frame stop once a frame has spent this long
  now(): number;
  lost(): boolean;                            // the GL context is gone: skip, as the rank-look warm-up does
};
// No timer and no animation frame: the warm-up must finish on promises and `now()` alone, so a page whose clock is paused (the release rows' harness
// clock, a throttled tab) still boots to a playable fight. The budget is checked between slices; `frame()` is a macrotask yield, not a rAF.
export async function warmFirstFrame(w: FirstFrame): Promise<'done' | 'timeout' | 'skipped'> {
  if (w.lost()) return 'skipped';
  const begin = w.now();
  try {
    for (let i = 0; i < w.textures.length;) {   // as many maps as fit a slice (at least one): a yield each would stretch the card by a second or more
      await w.frame(); if (w.lost()) return 'skipped';
      if (w.now() - begin > w.budgetMs) return 'timeout';
      const start = w.now(); do w.upload(w.textures[i++]); while (i < w.textures.length && w.now() - start < w.sliceMs);
    }
    await w.frame(); if (w.lost()) return 'skipped';
    if (w.now() - begin > w.budgetMs) return 'timeout';
    w.draw(); return 'done';
  } catch { return 'skipped'; }   // a warm-up that throws only costs the warm-up: the first real frame pays as before
}
