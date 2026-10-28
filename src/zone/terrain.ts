// The zone's ground from a seed (data/terrain.json): a pure height(x, z) in metres, shared by the drawing, the hero and foe roots and the camera. Presentation only: the duel sim
// (src/fight/sim.ts) never imports this and stays flat, so replays and tests are byte for byte. Only + - * / sqrt floor and Math.imul are used (all exactly rounded), so any engine
// returns the same height for the same seed. Every number is a row; the as-data gate (scripts/as-data) keeps this file free of literals.
import ROWS from '../../data/terrain.json' with { type: 'json' };
import type { ZoneRow } from './zone-rows.ts';

export type PadRow = { flatMetres: number; blendMetres: number };
export type TerrainRows = {
  on: boolean; seed: number; heightMetres: number; scaleMetres: number; octaves: number; lacunarity: number; gain: number; level: number;
  ridge: { mix: number; fold: number; mid: number }; maxSlope: number; smooth: { a: number; b: number; samples: number };
  hash: { primeX: number; primeZ: number; primeSeed: number; mix1: number; mix2: number; shifts: [number, number, number]; modulus: number };
  pads: { pit: PadRow; camp: PadRow; boss: PadRow; bossMarginMetres: number };
  rings: { multipliers: number[]; maxMultiplier: number };
  mesh: { radiusMetres: number; gridCellsPerVertex: number; anchorCells: number; edgeTaperMetres: number; floorDropMetres: number; gridLiftMetres: number; fadeFlat: boolean };
  camera: { clearanceMetres: number };
  limits: Record<string, [number, number]>;
};
export const TERRAIN = ROWS as unknown as TerrainRows;

/** A flat place: centre in the pit's frame (where the scene draws), flat out to `flatMetres`, rising over `blendMetres`. */
export type Pad = { x: number; z: number; flatMetres: number; blendMetres: number };
export type Terrain = {
  /** Metres above the old flat floor at (x, z) in the pit's frame. 0 on every pad. */
  height(x: number, z: number): number;
  /** The steepest rise over run the rows can give (<= rows.maxSlope), and the height scale the code settled on (<= rows.heightMetres). */
  slopeBound: number; heightMetres: number; pads: readonly Pad[];
};

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** The rows' problems, [] when fine. `bossReach`: each boss's leash + aggro (metres), which a boss pad must cover plus the margin. */
export function checkTerrain(rows: TerrainRows = TERRAIN, bossReach: readonly number[] = []): string[] {
  const e: string[] = [], L = rows.limits, bad = (m: Error) => e.push(m.message);   // diagnostics, not game text (the as-data gate)
  const rng = (name: string, v: number, key: string) => { const r = L[key]!; if (!Number.isFinite(v) || v < r[0] || v > r[1]) bad(new Error(`terrain.${name} ${v} is not in ${r[0]}..${r[1]}`)); };
  rng('heightMetres', rows.heightMetres, 'heightMetres'); rng('scaleMetres', rows.scaleMetres, 'scaleMetres'); rng('octaves', rows.octaves, 'octaves'); rng('lacunarity', rows.lacunarity, 'lacunarity');
  rng('gain', rows.gain, 'gain'); rng('level', rows.level, 'level'); rng('maxSlope', rows.maxSlope, 'maxSlope'); rng('pads.bossMarginMetres', rows.pads.bossMarginMetres, 'bossMarginMetres');
  for (const p of [rows.pads.pit, rows.pads.camp, rows.pads.boss]) { rng('pads.flatMetres', p.flatMetres, 'padFlatMetres'); rng('pads.blendMetres', p.blendMetres, 'padBlendMetres'); }
  rng('mesh.radiusMetres', rows.mesh.radiusMetres, 'radiusMetres'); rng('mesh.gridCellsPerVertex', rows.mesh.gridCellsPerVertex, 'gridCellsPerVertex'); rng('mesh.anchorCells', rows.mesh.anchorCells, 'anchorCells');
  rng('mesh.edgeTaperMetres', rows.mesh.edgeTaperMetres, 'edgeTaperMetres'); rng('mesh.floorDropMetres', rows.mesh.floorDropMetres, 'floorDropMetres'); rng('mesh.gridLiftMetres', rows.mesh.gridLiftMetres, 'gridLiftMetres');
  rng('camera.clearanceMetres', rows.camera.clearanceMetres, 'clearanceMetres');
  if (!Number.isInteger(rows.octaves) || !Number.isInteger(rows.seed) || !Number.isInteger(rows.mesh.gridCellsPerVertex) || !Number.isInteger(rows.mesh.anchorCells)) bad(new Error('terrain: seed, octaves and the mesh cell counts must be whole numbers'));
  if (!(rows.ridge.mix >= 0 && rows.ridge.mix <= 1)) bad(new Error(`terrain.ridge.mix ${rows.ridge.mix} is not in 0..1`));
  if (!(rows.smooth.samples >= 1) || !(rows.smooth.a > 0) || !(rows.smooth.b > 0)) bad(new Error('terrain.smooth rows must be positive'));
  if (!Array.isArray(rows.rings.multipliers) || rows.rings.multipliers.some((m) => !(m >= 0 && m <= rows.rings.maxMultiplier))) bad(new Error('terrain.rings.multipliers must each be 0..maxMultiplier'));
  if (rows.mesh.edgeTaperMetres >= rows.mesh.radiusMetres) bad(new Error('terrain.mesh.edgeTaperMetres must be less than the mesh radius'));
  for (const reach of bossReach) if (rows.pads.boss.flatMetres < reach + rows.pads.bossMarginMetres) bad(new Error(`terrain.pads.boss.flatMetres ${rows.pads.boss.flatMetres} is under a boss's leash + aggro ${reach} m + margin ${rows.pads.bossMarginMetres}: a hero dragged to the end of the leash would stand off the pad`));
  return e;
}

/** The pads of a zone in the pit's frame: the pit itself, the camp where the hero stands again, every boss spawn. `origin`: the pit's centre in the zone's frame (spawns.ts pitOrigin). */
export function padsFor(zone: Pick<ZoneRow, 'respawn' | 'spawns'>, origin: { x: number; z: number }, rows: TerrainRows = TERRAIN): Pad[] {
  const at = (x: number, z: number, p: PadRow): Pad => ({ x: x - origin.x, z: z - origin.z, flatMetres: p.flatMetres, blendMetres: p.blendMetres });
  return [at(origin.x, origin.z, rows.pads.pit), at(zone.respawn.x, zone.respawn.z, rows.pads.camp), ...zone.spawns.map((s) => at(s.position.x, s.position.z, rows.pads.boss))];
}
/** Each spawn's leash + aggro, what a boss pad must cover (checkTerrain). */
export const bossReaches = (zone: Pick<ZoneRow, 'spawns'>): number[] => zone.spawns.map((s) => s.behaviour.leash + s.behaviour.aggro);

/** Integer hash of a lattice point to [0, 1): Math.imul and xor-shifts only. */
function lattice(rows: TerrainRows, octave: number, ix: number, iz: number): number {
  const H = rows.hash, [s0, s1, s2] = H.shifts;
  let h = Math.imul(ix, H.primeX) ^ Math.imul(iz, H.primeZ) ^ Math.imul(rows.seed + octave, H.primeSeed);
  h = Math.imul(h ^ (h >>> s0), H.mix1); h ^= h >>> s1; h = Math.imul(h, H.mix2); h ^= h >>> s2;
  return (h >>> 0) / H.modulus;
}

/** The steepest slope of t*t*(a - b*t) over 0..1, found from `samples` steps (the smooth curve's steepest rise, what the slope guarantee needs). */
function curveSteepest(rows: TerrainRows): number {
  const { a, b, samples } = rows.smooth;
  let best = 0;
  for (let i = 0; i <= samples; i++) { const t = i / samples; best = Math.max(best, Math.abs(t * (a + a) - t * t * (b + b + b))); }
  return best;
}

/** Builds the terrain for `pads`. `ringMultiplier` (optional): the per-ring height multiplier from data/rings.json when that lands, 0..rows.rings.maxMultiplier, smooth across ring edges. */
export function createTerrain(pads: readonly Pad[], rows: TerrainRows = TERRAIN, ringMultiplier?: (x: number, z: number) => number): Terrain {
  const bad = checkTerrain(rows);
  if (bad.length) throw new Error(bad.join('; '));
  const { octaves, lacunarity, gain, ridge, level } = rows;
  const steep = curveSteepest(rows), diag = Math.sqrt(1 + 1);
  // The steepest the terrain can be, per metre of height scale: the octaves' gradients (value noise: at most `steep` per cell on each axis), the ridge fold and the level stretch, plus the pad blend's slope times the tallest hill.
  let sumGain = 0, sumRate = 0, amp = 1, freq = 1 / rows.scaleMetres;
  for (let o = 0; o < octaves; o++) { sumGain += amp; sumRate += amp * freq; amp *= gain; freq *= lacunarity; }
  const stretch = 1 / (1 - level), fold = (1 - ridge.mix) + ridge.mix * ridge.fold, ringMax = rows.rings.maxMultiplier;
  const minBlend = pads.reduce((m, p) => Math.min(m, p.blendMetres), Infinity);
  const noiseSlope = stretch * fold * (sumRate / sumGain) * steep * diag * ringMax;
  const blendSlope = pads.length ? steep / minBlend * ringMax : 0;
  const unit = noiseSlope + blendSlope;
  const heightMetres = unit * rows.heightMetres > rows.maxSlope ? rows.maxSlope / unit : rows.heightMetres;
  const slopeBound = unit * heightMetres;

  const noise = (x: number, z: number): number => {
    let sum = 0, a = 1, f = 1 / rows.scaleMetres;
    for (let o = 0; o < octaves; o++) {
      const px = x * f, pz = z * f, x0 = Math.floor(px), z0 = Math.floor(pz), tx = px - x0, tz = pz - z0;
      const sx = tx * tx * (rows.smooth.a - rows.smooth.b * tx), sz = tz * tz * (rows.smooth.a - rows.smooth.b * tz);
      const n00 = lattice(rows, o, x0, z0), n10 = lattice(rows, o, x0 + 1, z0), n01 = lattice(rows, o, x0, z0 + 1), n11 = lattice(rows, o, x0 + 1, z0 + 1);
      const top = n00 + (n10 - n00) * sx, bot = n01 + (n11 - n01) * sx;
      sum += a * (top + (bot - top) * sz);
      a *= gain; f *= lacunarity;
    }
    return sum / sumGain;
  };
  const height = (x: number, z: number): number => {
    let pad = 1;
    for (const p of pads) {
      const dx = x - p.x, dz = z - p.z, d = Math.sqrt(dx * dx + dz * dz);
      const t = clamp01((d - p.flatMetres) / p.blendMetres);
      pad = Math.min(pad, t * t * (rows.smooth.a - rows.smooth.b * t));
      if (pad === 0) return 0;
    }
    const n = noise(x, z), r = 1 - ridge.fold * Math.abs(n - ridge.mid), g = n + (r - n) * ridge.mix;
    return heightMetres * (ringMultiplier ? ringMultiplier(x, z) : 1) * pad * clamp01((g - level) * stretch);
  };
  return { height, slopeBound, heightMetres, pads };
}

/** The page's one read: the terrain for the zone (pit frame), or null when the rows say off. Throws on a bad row or a boss pad narrower than its leash. */
export function terrainFor(zone: Pick<ZoneRow, 'respawn' | 'spawns'>, origin: { x: number; z: number }, rows: TerrainRows = TERRAIN): Terrain | null {
  if (!rows.on) return null;
  const bad = checkTerrain(rows, bossReaches(zone));
  if (bad.length) throw new Error(bad.join('; '));
  return createTerrain(padsFor(zone, origin, rows), rows);
}
