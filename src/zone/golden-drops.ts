// GOLDEN WEAPON DROPS (data/golden-weapons.json; Dom 2026-10-28). Rare weapons lie in the world as pickups; walking onto one (or tapping its ring) makes it the hero's for N charges (one per blow he
// lands): his blows hurt `damageMul` more (a ?tune= health scale on the bosses, src/tune.ts), the weapon in his hand goes gold, and at 0 charges it is spent and he is back to the weapon he had. Pure rules
// plus one small controller; the DOM lives in src/fight/golden-hud.ts and is handed in (`GoldenUi`), the page wiring is a handful of lines in src/client/main.ts. No literal other than 0 and 1 is written here
// (scripts/as-data scans src/zone/): every number, id and line is a row of the table. Nothing here throws at runtime except validateGolden at load; storage is never trusted (cleanGolden).
import ROWS from '../../data/golden-weapons.json' with { type: 'json' };

export type Tint = { colour: string; emissive: string; emissiveIntensity: number; metalness: number; roughness: number };
export type GoldenRow = { id: string; name: string; weapon: string; power: string; tell: string; charges: number; damageMul: number; tier: number; tint: Tint };
export type RoamPoint = { id: string; weapon: string; ring: string; distance: number; angleDeg: number };
type Range = [number, number];
export type GoldenRows = {
  version: number; halfTurnDegrees: number;
  limits: { charges: Range; damageMul: Range; tier: Range; chance: Range; metres: Range; seconds: Range; pulse: Range; intensity: Range; angle: Range; coord: number; ground: Range; px: Range; alpha: Range };
  spend: { event: string; actor: number; target: number };
  pickup: { reachMetres: number; tapReachMetres: number; tapRadiusPx: number; tapTopFrac: number; tapBottomFrac: number };
  weapons: GoldenRow[];
  drops: {
    bossKill: { chanceByStar: number[]; tierByStar: number[]; scatterMetres: number };
    packChest: { on: boolean; chance: number; tier: number };
    roaming: { respawnSeconds: number; clearanceMetres: number; points: RoamPoint[] };
    maxGround: number;
  };
  lines: { pickup: string; spent: string; lost: string; seconds: number };
  marker: { colour: string; glow: string; ringPx: number; beamPx: number; widthPx: number; alpha: number; pulseSeconds: number; showWithinMetres: number; zIndex: number };
  hud: { colour: string; zIndex: number; topPct: number; sizePx: number; backdropAlpha: number; padPx: number; text: string };
};
export const GOLDEN = ROWS as unknown as GoldenRows;

/** What the hero holds: a row id and the charges left. */
export type Held = { id: string; charges: number };
/** A pickup lying where a kill or a death put it. */
export type Ground = { id: string; x: number; z: number; charges: number };
/** The optional `golden` field of the progression save: what he holds, what lies about, and when each roaming point was last taken (epoch ms). */
export type GoldenSave = { held: Held | null; ground: Ground[]; taken: Record<string, number> };
type At = { x: number; z: number };
export type Rng = () => number;
/** One pickup that can be taken now. `key`: a ground entry's index or a roaming point's id. */
export type Item = { source: Source; key: string; id: string; x: number; z: number; charges: number };
export type Source = typeof SOURCE[keyof typeof SOURCE];
const SOURCE = { ground: 'ground', roaming: 'roaming' } as const;
export type PickupEvent = { id: string; weapon: string; name: string; charges: number; source: Source; x: number; z: number };

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);


export const freshGolden = (): GoldenSave => ({ held: null, ground: [], taken: {} });
export const rowOf = (rows: GoldenRows, id: string): GoldenRow | undefined => rows.weapons.find((w) => w.id === id);

/** The `golden` field of a stored save, cleaned: unknown rows dropped, charges held to the row's, coordinates and counts bounded. undefined when there is nothing in it (the save then carries no field). Never throws. */
export function cleanGolden(raw: unknown, rows: GoldenRows = GOLDEN): GoldenSave | undefined {
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const j = raw as { held?: unknown; ground?: unknown; taken?: unknown }, out = freshGolden();
    const charges = (row: GoldenRow, n: unknown): number => (isNum(n) && Number.isInteger(n) && n >= 1 ? Math.min(n, row.charges) : 0);
    const h = j.held as { id?: unknown; charges?: unknown } | null | undefined;
    if (h && typeof h === 'object') { const row = typeof h.id === 'string' ? rowOf(rows, h.id) : undefined, n = row ? charges(row, h.charges) : 0; if (row && n) out.held = { id: row.id, charges: n }; }
    if (Array.isArray(j.ground)) for (const g of j.ground as { id?: unknown; x?: unknown; z?: unknown; charges?: unknown }[]) {
      const row = g && typeof g.id === 'string' ? rowOf(rows, g.id) : undefined, n = row ? charges(row, g.charges) : 0, c = rows.limits.coord;
      if (row && n && isNum(g.x) && isNum(g.z) && Math.abs(g.x) <= c && Math.abs(g.z) <= c && out.ground.length < rows.drops.maxGround) out.ground.push({ id: row.id, x: g.x, z: g.z, charges: n });
    }
    if (j.taken && typeof j.taken === 'object' && !Array.isArray(j.taken)) for (const [k, t] of Object.entries(j.taken as Record<string, unknown>)) if (rows.drops.roaming.points.some((p) => p.id === k) && isNum(t) && t >= 0) out.taken[k] = t;
    return out.held || out.ground.length || Object.keys(out.taken).length ? out : undefined;
  } catch { return undefined; }
}

/** The rows that may drop now: those whose weapon the hero can draw. */
export const usableRows = (rows: GoldenRows, drawable: readonly string[]): GoldenRow[] => rows.weapons.filter((w) => drawable.includes(w.weapon));

/** A roaming point's spot in the pit's frame: `distance` metres from the pit's centre at `angleDeg` clockwise from north (-Z), the way data/rings.json places its spawns. */
export function pointAt(rows: GoldenRows, p: RoamPoint): At {
  const turn = (p.angleDeg * Math.PI) / rows.halfTurnDegrees;
  return { x: Math.sin(turn) * p.distance, z: -Math.cos(turn) * p.distance };
}

/** Every pickup that can be taken at `nowMs`: the ground ones, and each roaming point not taken within `respawnSeconds` whose row is usable. */
export function itemsNow(save: GoldenSave, rows: GoldenRows, usable: readonly GoldenRow[], nowMs: number): Item[] {
  const out: Item[] = save.ground.map((g, i) => ({ source: SOURCE.ground, key: String(i), id: g.id, x: g.x, z: g.z, charges: g.charges }));
  const ms = rows.drops.roaming.respawnSeconds * 1000;
  for (const p of rows.drops.roaming.points) {
    const row = usable.find((w) => w.id === p.weapon), at = save.taken[p.id];
    if (!row || (at !== undefined && nowMs - at < ms)) continue;
    const spot = pointAt(rows, p);
    out.push({ source: SOURCE.roaming, key: p.id, id: row.id, x: spot.x, z: spot.z, charges: row.charges });
  }
  return out;
}

/** The nearest item within `reach` metres of `at`, or null. */
export function nearest(items: readonly Item[], at: At, reach: number): Item | null {
  let best: Item | null = null, bestD = reach;
  for (const it of items) { const d = Math.hypot(it.x - at.x, it.z - at.z); if (d <= bestD) { best = it; bestD = d; } }
  return best;
}

/** A row of tier up to `tier` chosen with `rng`; null when none is usable. */
export function pickRow(usable: readonly GoldenRow[], tier: number, rng: Rng): GoldenRow | null {
  const fit = usable.filter((w) => w.tier <= tier);
  return fit.length ? fit[Math.min(fit.length - 1, Math.floor(rng() * fit.length))]! : null;
}

/** A pickup of `id` lying at `at` with `charges` (the oldest one goes if the ground is full). A new save. */
export function putGround(save: GoldenSave, rows: GoldenRows, id: string, at: At, charges: number): GoldenSave {
  const ground = [...save.ground, { id, x: at.x, z: at.z, charges }];
  while (ground.length > rows.drops.maxGround) ground.shift();
  return { ...save, ground };
}

/** THE entry other lanes call (the Pit Crawl, the trash mobs): a golden weapon of tier up to `tier` appears at `at`. Returns the new save and the pickup, or the same save and null when no row is usable. */
export function dropGolden(save: GoldenSave, rows: GoldenRows, usable: readonly GoldenRow[], at: At, tier: number, rng: Rng): { save: GoldenSave; item: Ground | null } {
  const row = pickRow(usable, tier, rng);
  if (!row) return { save, item: null };
  const next = putGround(save, rows, row.id, at, row.charges);
  return { save: next, item: next.ground[next.ground.length - 1] ?? null };
}

/** A boss of star level `star` has fallen at `at`: the row's chance decides, the star's tier caps the weapon, the pickup lands within `scatterMetres`. */
export function bossDrop(save: GoldenSave, rows: GoldenRows, usable: readonly GoldenRow[], at: At, star: number, rng: Rng): { save: GoldenSave; item: Ground | null } {
  const b = rows.drops.bossKill, level = Math.max(0, Math.min(b.chanceByStar.length - 1, Math.floor(star)));
  if (!(rng() < b.chanceByStar[level]!)) return { save, item: null };
  const turn = rng() * Math.PI * 2, far = rng() * b.scatterMetres;
  return dropGolden(save, rows, usable, { x: at.x + Math.sin(turn) * far, z: at.z - Math.cos(turn) * far }, b.tierByStar[level]!, rng);
}

/** The hero takes `item`: it becomes what he holds (a ground pickup leaves the ground, a roaming one is stamped taken); what he held goes back down at his feet with the charges it had left. */
export function take(save: GoldenSave, rows: GoldenRows, item: Item, at: At, nowMs: number): { save: GoldenSave; held: Held } {
  let next: GoldenSave = { held: { id: item.id, charges: item.charges }, ground: save.ground, taken: save.taken };
  if (item.source === SOURCE.ground) next = { ...next, ground: save.ground.filter((_, i) => String(i) !== item.key) };
  else next = { ...next, taken: { ...save.taken, [item.key]: nowMs } };
  if (save.held) next = putGround(next, rows, save.held.id, at, save.held.charges);
  return { save: next, held: next.held! };
}

/** One charge spent on a landed blow; at 0 the weapon is spent (`spent` true) and he holds nothing. A new save; the same one when he holds nothing. */
export function spend(save: GoldenSave): { save: GoldenSave; spent: Held | null } {
  const h = save.held;
  if (!h) return { save, spent: null };
  const left = h.charges - 1;
  return left > 0 ? { save: { ...save, held: { id: h.id, charges: left } }, spent: null } : { save: { ...save, held: null }, spent: h };
}

/** He fell at `at`: what he held lies there with the charges it had left. A new save; the same one when he held nothing. */
export function lose(save: GoldenSave, rows: GoldenRows, at: At): { save: GoldenSave; lost: Held | null } {
  const h = save.held;
  if (!h) return { save, lost: null };
  return { save: { ...putGround(save, rows, h.id, at, h.charges), held: null }, lost: h };
}

/** The extra damage a landed blow of `damage` does with `row` in hand: damage * (damageMul - 1), rounded to whole health. */
export const bonusOf = (row: Pick<GoldenRow, 'damageMul'>, damage: number): number => Math.round(damage * (row.damageMul - 1));

/** A practice with `extra` more taken off the fighter at index `target` (the boss), and the copy of that fighter's health the practice itself carries. Never kills: a boss left standing by the sim is left at 1 at least (the sim's own blow decides the kill, so its finisher, events and kill record stay as they are). The same object when there is nothing to do. */
export function boostedBy<P extends { health: number; duel: { fighters: readonly { health: number }[] } }>(p: P, target: number, extra: number): P {
  const foe = p.duel.fighters[target];
  if (!foe || !(extra > 0) || !(foe.health > 0)) return p;
  const health = Math.max(1, foe.health - extra);
  if (health === foe.health) return p;
  return { ...p, health, duel: { ...p.duel, fighters: p.duel.fighters.map((f, i) => (i === target ? { ...f, health } : f)) } };
}

/** The weapon id the hero is drawn with at load when he carries a golden weapon of a drawable id, else `fallback`. */
export const loadWeapon = (save: GoldenSave | undefined, rows: GoldenRows, drawable: readonly string[], fallback: string): string => {
  const row = save?.held ? rowOf(rows, save.held.id) : undefined;
  return row && drawable.includes(row.weapon) ? row.weapon : fallback;
};

/** `template` with {name} {power} {charges} filled from `row`. */
export const lineOf = (template: string, row: Pick<GoldenRow, 'name' | 'power'>, charges: number): string => template.replace('{name}', row.name).replace('{power}', row.power).replace('{charges}', String(charges));

/** The golden blips for the radar: every item that can be taken. */
export function goldenBlips(items: readonly Item[], emit: (x: number, z: number, cls: 'golden') => void): void {
  for (const it of items) emit(it.x, it.z, 'golden');
}

/** What the page hands the controller to show things (src/fight/golden-hud.ts is the real one; a test passes a recorder). */
export type GoldenUi = {
  /** Called every frame with the items and the hero; the UI places the glowing markers and tells `tap` which was tapped. */
  frame(items: readonly Item[], hero: At, tap: (key: string, source: Source) => void): void;
  counter(held: { row: GoldenRow; charges: number } | null): void;
  line(text: string): void;
  tint(row: GoldenRow | null): void;
};
export type GoldenDeps = {
  rows: GoldenRows; drawable: readonly string[]; ui: GoldenUi;
  get(): GoldenSave; put(next: GoldenSave): void;   // the page's save: read, and write back (the page persists)
  now(): number; rng: Rng;
};
type Strikes = { health: number; duel: { fighters: readonly { health: number }[] }; events: readonly { type: string; actor: number; target?: number; damage?: number }[] };

/** The controller: the page calls `step` each frame, `strike` with each sim step's practice, `died` when the hero dies, `killed` when a boss falls; other lanes call `dropGolden` and `onPickup`. */
export function createGolden(d: GoldenDeps) {
  const usable = usableRows(d.rows, d.drawable), listeners: ((e: PickupEvent) => void)[] = [];
  let armed = true;   // a pickup is taken once per visit: after one (or a swap that put his old weapon at his feet) he must step off everything before the next
  let cache: Item[] | null = null;   // the items of this frame: built once (step), dropped whenever the save changes
  const put = (next: GoldenSave) => { cache = null; d.put(next); };
  const list = (): Item[] => (cache ??= itemsNow(d.get(), d.rows, usable, d.now()));
  const show = () => {
    const h = d.get().held, row = h ? rowOf(d.rows, h.id) : undefined;
    d.ui.counter(h && row ? { row, charges: h.charges } : null); d.ui.tint(h && row ? row : null);
  };
  function grab(item: Item, hero: At) {
    const out = take(d.get(), d.rows, item, hero, d.now()), row = rowOf(d.rows, item.id)!;
    put(out.save); show(); d.ui.line(lineOf(d.rows.lines.pickup, row, out.held.charges));
    const e: PickupEvent = { id: row.id, weapon: row.weapon, name: row.name, charges: out.held.charges, source: item.source, x: item.x, z: item.z };
    for (const fn of listeners) try { fn(e); } catch { /* a listener never breaks the page */ }
  }
  let hero: At = { x: 0, z: 0 };
  const tap = (key: string, source: Source) => {
    const it = list().find((i) => i.key === key && i.source === source);
    if (it && Math.hypot(it.x - hero.x, it.z - hero.z) <= d.rows.pickup.tapReachMetres) grab(it, hero);
  };
  show();
  return {
    /** Every frame: the markers, and a pickup under the hero's feet is taken. `alive`: a fallen hero takes nothing. */
    step(at: At, alive: boolean) {
      hero = at; cache = null;   // the clock moved: this frame's list is built once, here, and read by the taps, the radar and the markers
      const under = alive ? nearest(list(), at, d.rows.pickup.reachMetres) : null;
      if (under && armed) { armed = false; grab(under, at); } else if (!under) armed = true;
      d.ui.frame(list(), at, tap);
    },
    /**
     * The sim step's practice: each blow the hero lands in it does the held weapon's extra damage to the boss RIGHT NOW (the same step, the same tick) and spends one charge; the blow that spends the last
     * charge still gets its bonus, and the next blow is plain. Returns the practice with the boss's health lowered (the same object with nothing held or no blow).
     */
    strike<P extends Strikes>(p: P): P {
      const s = d.rows.spend;
      let extra = 0;
      for (const e of p.events) {
        const held = d.get().held, row = held ? rowOf(d.rows, held.id) : undefined;
        if (!row || e.type !== s.event || e.actor !== s.actor || e.target !== s.target) continue;
        extra += bonusOf(row, e.damage ?? 0);
        const out = spend(d.get()); put(out.save); show();
        if (out.spent) d.ui.line(lineOf(d.rows.lines.spent, rowOf(d.rows, out.spent.id)!, 0));
      }
      return boostedBy(p, s.target, extra);
    },
    /** The hero died at `at`: his golden weapon lies where he fell. */
    died(at: At) {
      const out = lose(d.get(), d.rows, at);
      if (!out.lost) return;
      put(out.save); show(); d.ui.line(lineOf(d.rows.lines.lost, rowOf(d.rows, out.lost.id)!, out.lost.charges));
    },
    /** A boss of star level `star` fell at `at`. */
    killed(at: At, star: number) {
      const out = bossDrop(d.get(), d.rows, usable, at, star, d.rng);
      if (out.item) put(out.save);
      return out.item;
    },
    /** For other lanes: a golden weapon of tier up to `tier` appears at `position`. */
    dropGolden(position: At, tier: number): Ground | null {
      const out = dropGolden(d.get(), d.rows, usable, position, tier, d.rng);
      if (out.item) put(out.save);
      return out.item;
    },
    /** For other lanes: `fn` runs when the hero picks one up. Returns the way to stop listening. */
    onPickup(fn: (e: PickupEvent) => void): () => void {
      listeners.push(fn);
      return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
    },
    items: (): readonly Item[] => list(),
    held: () => d.get().held,
  };
}
