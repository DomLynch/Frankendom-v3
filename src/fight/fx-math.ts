// Presentation math shared by the special-move and charge effects (one copy instead of up to sixteen). Pure, no imports, never the sim: nothing
// here is in SIM_FILES, and every "random" an effect draws is this index hash, never Math.random. Each body is byte-for-byte the copy it replaced.
export const hash = (i: number, salt: number) => { const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return x - Math.floor(x); };
export const clamp01 = (k: number) => Math.min(1, Math.max(0, k));
export const smooth = (k: number) => { const c = clamp01(k); return c * c * (3 - 2 * c); };   // clamped smoothstep; four files keep an UNCLAMPED one of their own
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const cell = (x: number, y: number, seed: number) => hash(x * 127 + y * 311, seed);
export const noise = (x: number, y: number, seed: number) => {   // 2-D value noise
  const ix = Math.floor(x), iy = Math.floor(y), kx = smooth(x - ix), ky = smooth(y - iy);
  return lerp(lerp(cell(ix, iy, seed), cell(ix + 1, iy, seed), kx), lerp(cell(ix, iy + 1, seed), cell(ix + 1, iy + 1, seed), kx), ky);
};
