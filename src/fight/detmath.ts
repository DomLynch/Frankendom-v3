// Deterministic transcendentals for the sim (Strategy ruling, 2026-09-29). Math.sin / cos / atan2 / hypot are implementation-approximated
// in ECMAScript: two engines (Node 25's V8 14.1 and Chromium 151's) returned atan2 1 ulp apart on ~4 % of a fight's calls and sin on ~0.1 %,
// enough to turn a Dwarf kill link into a different fight (seed 828: hero win in Node, hero dead in Chromium). Everything here uses only
// + − * / and Math.sqrt, which IEEE 754 rounds exactly in every engine (no fused multiply-add in JS), so every engine gets the same bits.
// Ports of fdlibm (FreeBSD msun: k_sin.c, k_cos.c, s_atan.c, e_atan2.c) with its coefficients; range reduction is Cody–Waite with
// π/2 in three parts, exact for the sim's angles (|x| far below 2^20·π/2). tests/detmath.test.ts pins accuracy against Math.* and bans
// any Math transcendental inside the sim files.

import { underPlayScale } from './play-radius.ts';
import { underStab } from './stab-rule.ts';

const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04,
  S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05,
  C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;
const INV_PIO2 = 6.36619772367581382433e-01, PIO2_1 = 1.57079632673412561417e+00,
  PIO2_2 = 6.07710050630396597660e-11, PIO2_3 = 2.02226624871116645580e-21, PIO2_3T = 8.47842766036889956997e-32;
const ROUND = 6755399441055744;   // 1.5 · 2^52: (v + ROUND) − ROUND is v rounded to the nearest integer, ties to even, in plain doubles

// sin(x + y) and cos(x + y) for |x + y| ≤ π/4, y the tail of the reduced argument.
const kSin = (x: number, y: number): number => {
  const z = x * x, v = z * x, r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return x - ((z * (0.5 * y - v * r) - y) - v * S1);
};
const kCos = (x: number, y: number): number => {
  const z = x * x, r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6))))), hz = 0.5 * z, w = 1 - hz;
  return w + (((1 - w) - hz) + (z * r - x * y));
};
// x = n·π/2 + (y0 + y1): the quadrant n (0–3) and the reduced argument as head + tail.
function reduce(x: number): [number, number, number] {
  if (Math.abs(x) <= 0.785398163397448279) return [0, x, 0];
  const fn = (x * INV_PIO2 + ROUND) - ROUND;
  // Three Cody–Waite steps, always (fdlibm e_rem_pio2.c's medium case run to the end): every engine takes the same path.
  // fdlibm e_rem_pio2.c's medium case, run to its third step every time (every engine takes the same path): fn·PIO2_1 is exact (33-bit
  // PIO2_1), then PIO2_2, then PIO2_3 + PIO2_3T, which stands in for the rest of π/2, carrying the last subtraction's rounding into the tail.
  const t1 = x - fn * PIO2_1, r2 = t1 - fn * PIO2_2;
  const w3 = fn * PIO2_3, r3 = r2 - w3, e3 = fn * PIO2_3T - ((r2 - r3) - w3);
  const y0 = r3 - e3, y1 = (r3 - y0) - e3;
  return [((fn % 4) + 4) % 4, y0, y1];
}

export function sin(x: number): number {
  if (x !== x || x === Infinity || x === -Infinity) return NaN;
  if (Math.abs(x) < 7.450580596923828e-9) return x;   // 2^-27: sin x == x in doubles (keeps −0)
  const [n, a, b] = reduce(x);
  return n === 0 ? kSin(a, b) : n === 1 ? kCos(a, b) : n === 2 ? -kSin(a, b) : -kCos(a, b);
}
export function cos(x: number): number {
  if (x !== x || x === Infinity || x === -Infinity) return NaN;
  const [n, a, b] = reduce(x);
  return n === 0 ? kCos(a, b) : n === 1 ? -kSin(a, b) : n === 2 ? -kCos(a, b) : kSin(a, b);
}

const ATANHI = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00];
const ATANLO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT = [3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
  9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
  4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02];
export function atan(v: number): number {
  if (v !== v) return NaN;
  const neg = v < 0; let x = neg ? -v : v, id: number;
  if (x >= 7.378697629483821e19) return neg ? -(ATANHI[3] + ATANLO[3]) : ATANHI[3] + ATANLO[3];   // 2^66, and ±Infinity
  if (x < 0.4375) { if (x < 7.450580596923828e-9) return v; id = -1; }
  else if (x < 1.1875) { if (x < 0.6875) { id = 0; x = (2 * x - 1) / (2 + x); } else { id = 1; x = (x - 1) / (x + 1); } }
  else if (x < 2.4375) { id = 2; x = (x - 1.5) / (1 + 1.5 * x); } else { id = 3; x = -1 / x; }
  const z = x * x, w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) return neg ? -(x - x * (s1 + s2)) : x - x * (s1 + s2);
  const r = ATANHI[id] - ((x * (s1 + s2) - ATANLO[id]) - x);
  return neg ? -r : r;
}
const PI = Math.PI, PI_LO = 1.2246467991473532e-16, PI_O_2 = Math.PI / 2, PI_O_4 = Math.PI / 4;   // Math.PI is a constant, not a computation: exact everywhere
export function atan2(y: number, x: number): number {
  if (x !== x || y !== y) return NaN;
  const yNeg = y < 0 || (y === 0 && 1 / y < 0), xNeg = x < 0 || (x === 0 && 1 / x < 0);
  if (y === 0) return xNeg ? (yNeg ? -PI : PI) : y;   // ±0 keeps its sign; a negative x gives ±π
  if (x === 0) return yNeg ? -PI_O_2 : PI_O_2;
  if (x === Infinity || x === -Infinity) {
    if (y === Infinity || y === -Infinity) return xNeg ? (yNeg ? -3 * PI_O_4 : 3 * PI_O_4) : (yNeg ? -PI_O_4 : PI_O_4);
    return xNeg ? (yNeg ? -PI : PI) : (yNeg ? -0 : 0);
  }
  if (y === Infinity || y === -Infinity) return yNeg ? -PI_O_2 : PI_O_2;
  const z = atan(Math.abs(y / x));
  if (!xNeg) return yNeg ? -z : z;
  return yNeg ? (z - PI_LO) - PI : PI - (z - PI_LO);
}
// √(Σ aᵢ²). Math.hypot's scaling algorithm differs between engines; the sim's values are far from overflow, so the plain sum is exact enough.
export function hypot(...a: number[]): number {
  let s = 0, nan = false;
  for (const v of a) { if (v === Infinity || v === -Infinity) return Infinity; if (v !== v) nan = true; s += v * v; }
  return nan ? NaN : Math.sqrt(s);
}

// ── The switch (Strategy ruling (b), 2026-09-29) ────────────────────────────────────────────────────────────────────────────────────
// A record from before detmath (version < FIRST_DETMATH_VERSION) replays on the engine's own Math, as it was recorded: a shared link never
// becomes a fresh fight, and old links keep the cross-engine risk they always had. LEGACY is FROZEN: never edit it (tests pin it to the
// engine's own functions). It is reachable ONLY through underRecord(record): a fight record's version field picks the table for the
// synchronous run it wraps, and the table is put back after. Live fights and v20+ records always step on detmath.
export const FIRST_DETMATH_VERSION = 20;
type Table = { sin: (x: number) => number; cos: (x: number) => number; atan2: (y: number, x: number) => number; hypot: (...a: number[]) => number };
const DETMATH: Table = { sin, cos, atan2, hypot };
const LEGACY: Table = Object.freeze({ sin: Math.sin, cos: Math.cos, atan2: Math.atan2, hypot: Math.hypot });   // FROZEN: the pre-v20 sim's own Math
let table = DETMATH;
// What the sim calls. Never Math.<transcendental> in a sim file (tests/detmath.test.ts).
export const M: Table = { sin: (x) => table.sin(x), cos: (x) => table.cos(x), atan2: (y, x) => table.atan2(y, x), hypot: (...a) => table.hypot(...a) };
export function underRecord<T>(record: { readonly v: number; readonly opponent?: string }, run: () => T): T {
  const outer = table; table = record.v < FIRST_DETMATH_VERSION ? LEGACY : DETMATH;
  try { return underPlayScale(record.opponent ?? '', record.v, () => underStab(record.v, run)); } finally { table = outer; }   // and the play circle (play-radius.ts) and the Goblin's stab (stab-rule.ts) the record was fought with
}
export const mathTableFor = (record: { readonly v: number }): 'legacy' | 'detmath' => underRecord(record, () => (table === LEGACY ? 'legacy' : 'detmath'));   // tests
export const LEGACY_TABLE_IS_NATIVE = (): boolean => LEGACY.sin === Math.sin && LEGACY.cos === Math.cos && LEGACY.atan2 === Math.atan2 && LEGACY.hypot === Math.hypot;
