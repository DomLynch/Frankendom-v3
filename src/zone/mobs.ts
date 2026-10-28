// TRASH MOB SWARMS, the pure core (data/mobs.json; Dom 2026-10-28). Packs of weak mobs in the open world: a deterministic grid of pack sites per ring, a hard cap on mobs in the world, simple group AI
// (seek + leash + separation + an attack-token limit), cheap hits (the caller gives a `hit` function for the hero's swing), distance spawn and despawn, boss-pad exclusion. No scene, no sim, no clock, no
// DOM: the page wires it (src/mobs-run.ts) and the stills and tests drive it directly. Every per-mob field is a typed array allocated once; a tick allocates nothing (an event allocates one small object
// when something dies or a pack is made). Every number and name is a row: scripts/as-data scans src/zone/ at zero.
import ROWS from '../../data/mobs.json' with { type: 'json' };

export type MobKind = { body: string; scale: number; tint: string; tintMix: number; hp: number; speed: number; wanderSpeed: number; damage: number; aggroMetres: number; leashMetres: number; reachMetres: number; bodyMetres: number; windupSeconds: number; recoverSeconds: number; hurtSeconds: number; knockSpeed: number; drag: number; fallSeconds: number; coins: number; xp: number; heat: number };
type RingRow = { density: number; size: [number, number]; kinds: string[] };
type Hash = { a: number; b: number; c: number; s1: number; s2: number; range: number };
export type MobRows = {
  on: boolean; cap: number; capMax: number; scanSeconds: number; activateMetres: number; despawnMetres: number; spawnMinMetres: number; startClearMetres: number; padMetres: number; swingMetres: number; hitScale: number; turnRate: number; speedEase: number; pitArea: string;
  grid: { cellMetres: number; keySpan: number; seed: number; hash: Hash; lcg: { mul: number; add: number; range: number }; salts: Record<'exists' | 'x' | 'z' | 'size' | 'kind' | 'member', number> };
  pack: { radiusMetres: number; wanderMetres: number; wanderSeconds: [number, number]; callMetres: number };
  separation: { metres: number; speed: number };
  attack: { maxAttackers: number; orbitMetres: number; slackMetres: number; arcRadians: number; spreadRadians: number };
  hero: { radiusMetres: number; lethal: boolean; floorHealth: number; guard: number; roll: number; roamStrikes: string[] };
  states: Record<'idle' | 'chase' | 'windup' | 'recover' | 'hurt' | 'dying' | 'lying' | 'home', number>;
  fall: { lyingSeconds: number; fadeSeconds: number };
  rings: Record<string, RingRow>; respawnSeconds: number; kinds: Record<string, MobKind>;
};
export const MOBS = ROWS as unknown as MobRows;

/** The hero as the core reads him each tick: his body, whether he can be hurt at all, and his defence this tick (0 none, the rows' guard, the rows' roll). */
export type Hero = { x: number; z: number; heading: number; alive: boolean; defence: number };
/** The hero's swing this tick: `id` is the same for the whole swing (one hit per mob per swing); `hit` returns the damage the blow does to a mob at (x, z, heading, scale), 0 for a miss. */
export type Swing = { active: boolean; id: number; x: number; z: number; heading: number; knockback: number; hit: (x: number, z: number, heading: number, scale: number) => number };
export type Pad = { x: number; z: number; radius: number };
export type Area = { id: string; x: number; z: number };
export type Killed = { kind: string; pack: number; x: number; z: number; coins: number; xp: number; heat: number; left: number };
/** What the scene and the radar read: the arrays are the core's own, live, never copied. */
export type MobView = { n: number; kind: Uint8Array; state: Uint8Array; x: Float32Array; z: Float32Array; heading: Float32Array; speed: Float32Array; hurt: Float32Array; fall: Float32Array; fade: Float32Array };
type Site = { id: number; x: number; z: number; kind: number; size: number; left: number; alive: number; clearedAt: number; manual: boolean };

const KIND_IDS = Object.keys(MOBS.kinds);
export const kindIndex = (id: string): number => KIND_IDS.indexOf(id);
export const kindRow = (index: number): MobKind => MOBS.kinds[KIND_IDS[index]!]!;
export const kindIds = (): readonly string[] => KIND_IDS;
const TAU = Math.PI + Math.PI;
const wrap = (a: number): number => { let r = a % TAU; if (r > Math.PI) r -= TAU; else if (r < -Math.PI) r += TAU; return r; };

/** The deterministic unit (0..1) of grid cell (ix, iz) for a salt: the same pack at the same place every visit. */
export function cellUnit(rows: MobRows, ix: number, iz: number, salt: number): number {
  const H = rows.grid.hash;
  let h = Math.imul(ix, H.a) ^ Math.imul(iz, H.b) ^ Math.imul(salt + rows.grid.seed, H.c);
  h = Math.imul(h ^ (h >>> H.s1), H.c); h ^= h >>> H.s2;
  return (h >>> 0) / H.range;
}

export type Deps = {
  rows?: MobRows;
  areas?: readonly Area[];                                   // zone areas by id, centres in the pit frame (spawnPack)
  ringAt?: (dist: number) => string | undefined;              // data/rings.json ring id at a distance from the pit centre; absent = the rows' default
  pads?: () => readonly Pad[];                                // boss spots with the circle no pack stands in and no mob stays in (read each tick; may change as a boss lingers)
};

export class Mobs {
  readonly rows: MobRows; readonly cap: number;
  readonly view: MobView;
  private readonly deps: Deps;
  private readonly kind: Uint8Array; private readonly st: Uint8Array; private readonly pack: Int32Array;
  private readonly px: Float32Array; private readonly pz: Float32Array; private readonly hd: Float32Array; private readonly sp: Float32Array;
  private readonly hx: Float32Array; private readonly hz: Float32Array;          // the mob's home (its pack's spot)
  private readonly kx: Float32Array; private readonly kz: Float32Array;          // knock velocity
  private readonly tx: Float32Array; private readonly tz: Float32Array;          // wander target
  private readonly hp: Float32Array; private readonly timer: Float32Array; private readonly wander: Float32Array; private readonly cool: Float32Array;
  private readonly hurtT: Float32Array; private readonly fallT: Float32Array; private readonly fadeT: Float32Array;
  private readonly seen: Int32Array; private readonly rng: Uint32Array; private readonly slot: Float32Array; private readonly struck: Int32Array;
  private readonly sites = new Map<number, Site>();
  private killedListeners: ((e: Killed) => void)[] = [];
  private clearedListeners: ((pack: number) => void)[] = [];
  private nextPack = 1; private clock = 0; private scanIn = 0; private heroHit = 0; private heroBlocked = 0;
  private n = 0;

  constructor(deps: Deps = {}) {
    this.deps = deps; this.rows = deps.rows ?? MOBS; this.cap = Math.min(this.rows.cap, this.rows.capMax);
    const m = this.rows.capMax;
    this.kind = new Uint8Array(m); this.st = new Uint8Array(m); this.pack = new Int32Array(m);
    this.px = new Float32Array(m); this.pz = new Float32Array(m); this.hd = new Float32Array(m); this.sp = new Float32Array(m);
    this.hx = new Float32Array(m); this.hz = new Float32Array(m); this.kx = new Float32Array(m); this.kz = new Float32Array(m); this.tx = new Float32Array(m); this.tz = new Float32Array(m);
    this.hp = new Float32Array(m); this.timer = new Float32Array(m); this.wander = new Float32Array(m); this.cool = new Float32Array(m);
    this.hurtT = new Float32Array(m); this.fallT = new Float32Array(m); this.fadeT = new Float32Array(m);
    this.seen = new Int32Array(m); this.rng = new Uint32Array(m); this.slot = new Float32Array(m); this.struck = new Int32Array(m);
    this.view = { n: 0, kind: this.kind, state: this.st, x: this.px, z: this.pz, heading: this.hd, speed: this.sp, hurt: this.hurtT, fall: this.fallT, fade: this.fadeT };
  }

  // ---- the API the Pit Crawl and the page use ----
  /** A pack of `count` mobs of `kind` at the centre of zone area `areaId` (the pit frame). It is live while the hero is near and fills the cap as slots free. Returns the pack id, or -1 for an unknown area or kind. */
  spawnPack(areaId: string, kind: string, count: number): number {
    const area = this.deps.areas?.find((a) => a.id === areaId), k = kindIndex(kind);
    if (!area || k < 0 || !(count >= 1)) return -1;
    return this.makeSite(area.x, area.z, k, Math.floor(count), true).id;
  }
  /** A pack at a point (tests, stills, the Pit Crawl's own spots). */
  spawnPackAt(x: number, z: number, kind: string, count: number): number {
    const k = kindIndex(kind);
    return k < 0 || !(count >= 1) ? -1 : this.makeSite(x, z, k, Math.floor(count), true).id;
  }
  onMobKilled(cb: (e: Killed) => void): () => void { this.killedListeners.push(cb); return () => { this.killedListeners = this.killedListeners.filter((c) => c !== cb); }; }
  onPackCleared(cb: (pack: number) => void): () => void { this.clearedListeners.push(cb); return () => { this.clearedListeners = this.clearedListeners.filter((c) => c !== cb); }; }
  /** Members of pack `id` still to kill (alive or waiting for a slot); 0 when it is cleared or unknown. */
  packLeft(id: number): number { for (const s of this.sites.values()) if (s.id === id) return s.left; return 0; }
  /** Mobs in the world now (alive, dying or lying). */
  get count(): number { return this.n; }
  /** Mobs that can still be fought. */
  get alive(): number { let c = 0; for (let i = 0; i < this.n; i++) if (this.st[i]! < this.rows.states.dying) c++; return c; }
  /** Damage the mobs dealt the hero since the last call (reset). */
  takeHeroDamage(): number { const d = this.heroHit; this.heroHit = 0; return d; }
  /** Blows the hero's guard or roll turned aside since the last call (reset). */
  takeBlocked(): number { const d = this.heroBlocked; this.heroBlocked = 0; return d; }
  /** Calls `emit(x, z)` for every mob that can still be fought (the radar's small dots). */
  forEachAlive(emit: (x: number, z: number) => void): void { for (let i = 0; i < this.n; i++) if (this.st[i]! < this.rows.states.dying) emit(this.px[i]!, this.pz[i]!); }
  /** Drops every mob and pack (a new session, the stills). */
  reset(): void { this.n = 0; this.view.n = 0; this.sites.clear(); this.scanIn = 0; }

  // ---- one tick ----
  /** `suppress`: a boss fight is on (or the hero is down): no pack aggros or spawns and the live mobs go home. `swing`: the hero's blow this tick, or null. */
  tick(dt: number, hero: Hero, swing: Swing | null, suppress: boolean): void {
    const R = this.rows, S = R.states;
    this.clock += dt;
    if (!suppress) {
      this.scanIn -= dt;
      if (this.scanIn <= 0) { this.scanIn = R.scanSeconds; this.scan(hero); }
    }
    const pads = this.deps.pads?.();
    let attackers = 0;
    for (let i = 0; i < this.n; i++) if (this.st[i] === S.windup) attackers++;
    for (let i = 0; i < this.n; i++) this.step(i, dt, hero, suppress, pads, attackers < R.attack.maxAttackers);
    this.separate(dt);
    if (swing && swing.active) this.strike(swing);
    this.cull(hero);
  }

  // ---- internals ----
  private makeSite(x: number, z: number, kind: number, size: number, manual: boolean): Site {
    const s: Site = { id: this.nextPack++, x, z, kind, size, left: size, alive: 0, clearedAt: -1, manual };
    this.sites.set(manual ? -s.id : s.id, s);
    return s;
  }

  /** Looks at the grid cells round the hero: makes the packs whose cell holds one, lets the live ones fill free slots, drops far untouched ones. */
  private scan(hero: Hero): void {
    const R = this.rows, g = R.grid, cell = g.cellMetres, reach = R.activateMetres + cell;
    const i0 = Math.floor((hero.x - reach) / cell), i1 = Math.floor((hero.x + reach) / cell), j0 = Math.floor((hero.z - reach) / cell), j1 = Math.floor((hero.z + reach) / cell);
    const pads = this.deps.pads?.();
    for (let ix = i0; ix <= i1; ix++) for (let iz = j0; iz <= j1; iz++) {
      const key = ix * g.keySpan + iz;   // a Map key only
      if (this.sites.has(key)) continue;
      const ring = R.rings[this.deps.ringAt?.(Math.hypot(ix * cell, iz * cell)) ?? ''] ?? R.rings.default!;
      if (cellUnit(R, ix, iz, g.salts.exists) >= ring.density) continue;
      const x = (ix + cellUnit(R, ix, iz, g.salts.x)) * cell, z = (iz + cellUnit(R, ix, iz, g.salts.z)) * cell;
      if (Math.hypot(x, z) < R.startClearMetres) continue;
      if (pads && inPads(pads, x, z, R.padMetres)) continue;
      const k = kindIndex(ring.kinds[Math.floor(cellUnit(R, ix, iz, g.salts.kind) * ring.kinds.length)]!);
      if (k < 0) continue;
      const size = ring.size[0] + Math.floor(cellUnit(R, ix, iz, g.salts.size) * (ring.size[1] - ring.size[0] + 1));
      const s: Site = { id: this.nextPack++, x, z, kind: k, size, left: size, alive: 0, clearedAt: -1, manual: false };
      this.sites.set(key, s);
    }
    for (const [key, s] of this.sites) {
      const d = Math.hypot(s.x - hero.x, s.z - hero.z);
      if (s.left <= 0) {
        if (s.manual) { this.sites.delete(key); continue; }
        if (this.clock - s.clearedAt >= R.respawnSeconds) { s.left = s.size; s.clearedAt = -1; }
        continue;
      }
      if (!s.manual && d > reach + R.despawnMetres) { this.sites.delete(key); continue; }   // far, untouched: made again from the grid when he returns (its count is the grid's)
      if (d <= R.activateMetres && (!pads || !inPads(pads, s.x, s.z, R.padMetres))) this.fill(s, hero);
    }
  }

  /** Brings the pack's waiting members in, one per free slot, never in the hero's face. */
  private fill(s: Site, hero: Hero): void {
    const R = this.rows, g = R.grid, K = kindRow(s.kind);
    while (s.alive < s.left && this.n < this.cap) {
      const slot = s.alive + s.id * R.capMax, a = cellUnit(R, slot, s.id, g.salts.member) * TAU, r = cellUnit(R, s.id, slot, g.salts.member) * R.pack.radiusMetres;
      const x = s.x + Math.sin(a) * r, z = s.z + Math.cos(a) * r;
      if (Math.hypot(x - hero.x, z - hero.z) < R.spawnMinMetres) return;
      this.add(s, x, z, K);
    }
  }

  private add(s: Site, x: number, z: number, K: MobKind): void {
    const R = this.rows, i = this.n++; this.view.n = this.n;
    this.kind[i] = s.kind; this.st[i] = R.states.idle; this.pack[i] = s.id;
    this.px[i] = x; this.pz[i] = z; this.hx[i] = s.x; this.hz[i] = s.z; this.hd[i] = (x + z) % TAU; this.sp[i] = 0; this.kx[i] = 0; this.kz[i] = 0; this.tx[i] = x; this.tz[i] = z;
    this.hp[i] = K.hp; this.timer[i] = 0; this.cool[i] = 0; this.hurtT[i] = 0; this.fallT[i] = 0; this.fadeT[i] = 0; this.seen[i] = 0; this.struck[i] = 0;
    this.rng[i] = (Math.imul(s.id, R.grid.lcg.mul) + Math.imul(i + 1, R.grid.lcg.add)) >>> 0; this.wander[i] = 0; this.slot[i] = this.rand(i) * TAU;
    s.alive++;
  }

  private rand(i: number): number { const L = this.rows.grid.lcg; this.rng[i] = (Math.imul(this.rng[i]!, L.mul) + L.add) >>> 0; return this.rng[i]! / L.range; }

  private step(i: number, dt: number, hero: Hero, suppress: boolean, pads: readonly Pad[] | undefined, token: boolean): void {
    const R = this.rows, S = R.states, K = kindRow(this.kind[i]!), st = this.st[i]!;
    if (this.hurtT[i]! > 0) this.hurtT[i] = Math.max(0, this.hurtT[i]! - dt / K.hurtSeconds);
    // knock velocity: applies in every state, drags away
    const drag = Math.exp(-K.drag * dt);
    this.px[i] = this.px[i]! + this.kx[i]! * dt; this.pz[i] = this.pz[i]! + this.kz[i]! * dt; this.kx[i] = this.kx[i]! * drag; this.kz[i] = this.kz[i]! * drag;
    if (st === S.dying) { this.fallT[i] = Math.min(1, this.fallT[i]! + dt / K.fallSeconds); if (this.fallT[i] === 1) { this.st[i] = S.lying; this.timer[i] = R.fall.lyingSeconds; } this.sp[i] = 0; return; }
    if (st === S.lying) { this.timer[i] = this.timer[i]! - dt; if (this.timer[i]! <= 0) this.fadeT[i] = Math.min(1, this.fadeT[i]! + dt / R.fall.fadeSeconds); this.sp[i] = 0; return; }
    this.cool[i] = Math.max(0, this.cool[i]! - dt);
    const dxh = hero.x - this.px[i]!, dzh = hero.z - this.pz[i]!, dh = Math.hypot(dxh, dzh), toHome = Math.hypot(this.hx[i]! - this.px[i]!, this.hz[i]! - this.pz[i]!);
    let vx = 0, vz = 0, want = this.hd[i]!;
    if (st === S.hurt) { this.timer[i] = this.timer[i]! - dt; if (this.timer[i]! <= 0) this.st[i] = S.chase; }
    else if (st === S.windup) {
      want = Math.atan2(dxh, dzh); this.timer[i] = this.timer[i]! - dt;
      if (suppress) { this.st[i] = S.home; this.seen[i] = 0; }   // a boss fight began mid-wind-up: the blow is called off
      else if (this.timer[i]! <= 0) { this.land(i, K, hero, dh); this.st[i] = S.recover; this.timer[i] = K.recoverSeconds; this.cool[i] = K.recoverSeconds; }
    } else if (st === S.recover) { this.timer[i] = this.timer[i]! - dt; if (this.timer[i]! <= 0) this.st[i] = suppress ? S.home : S.chase; }
    else {
      const sees = !suppress && hero.alive && dh <= K.aggroMetres && toHome <= K.leashMetres;
      if (sees) this.alert(i, hero);
      const hunting = !suppress && hero.alive && (st === S.chase || this.seen[i]! > 0) && toHome <= K.leashMetres;
      if (hunting) {
        this.st[i] = S.chase;
        const reach = K.reachMetres + R.hero.radiusMetres;
        if (dh <= reach && this.cool[i]! <= 0 && token) { this.st[i] = S.windup; this.timer[i] = K.windupSeconds; want = Math.atan2(dxh, dzh); }
        else {
          // a point on a ring round the hero, a slot each: surround, not stack; the ones without an attack token wait further out
          const ring = token || dh <= reach ? reach * R.attack.slackMetres + R.hero.radiusMetres : R.attack.orbitMetres;
          const tx = hero.x - Math.sin(this.slot[i]!) * ring, tz = hero.z - Math.cos(this.slot[i]!) * ring, ex = tx - this.px[i]!, ez = tz - this.pz[i]!, e = Math.hypot(ex, ez);
          if (e > R.attack.slackMetres * K.bodyMetres) { vx = (ex / e) * K.speed; vz = (ez / e) * K.speed; }
          want = Math.atan2(dxh, dzh);
        }
      } else {
        if (this.seen[i]! > 0 && (suppress || toHome > K.leashMetres || !hero.alive)) { this.seen[i] = 0; this.st[i] = S.home; }
        if (this.st[i] === S.home) {
          if (toHome <= R.pack.wanderMetres) this.st[i] = S.idle;
          else { vx = ((this.hx[i]! - this.px[i]!) / toHome) * K.speed; vz = ((this.hz[i]! - this.pz[i]!) / toHome) * K.speed; want = Math.atan2(vx, vz); }
        } else {
          this.wander[i] = this.wander[i]! - dt;
          if (this.wander[i]! <= 0) {
            const w = R.pack.wanderSeconds, a = this.rand(i) * TAU, r = this.rand(i) * R.pack.wanderMetres;
            this.wander[i] = w[0] + this.rand(i) * (w[1] - w[0]); this.tx[i] = this.hx[i]! + Math.sin(a) * r; this.tz[i] = this.hz[i]! + Math.cos(a) * r;
          }
          const ex = this.tx[i]! - this.px[i]!, ez = this.tz[i]! - this.pz[i]!, e = Math.hypot(ex, ez);
          if (e > K.bodyMetres) { vx = (ex / e) * K.wanderSpeed; vz = (ez / e) * K.wanderSpeed; want = Math.atan2(vx, vz); }
        }
      }
    }
    this.px[i] = this.px[i]! + vx * dt; this.pz[i] = this.pz[i]! + vz * dt;
    if (pads) this.leave(i, pads);
    const turn = wrap(want - this.hd[i]!); this.hd[i] = wrap(this.hd[i]! + turn * Math.min(1, R.turnRate * dt));
    const speed = Math.hypot(vx, vz); this.sp[i] = this.sp[i]! + (speed - this.sp[i]!) * Math.min(1, R.speedEase * dt);
  }

  /** The pack takes up the fight: members within the call radius of one that saw the hero hunt him too. */
  private alert(i: number, hero: Hero): void {
    const R = this.rows;
    for (let j = 0; j < this.n; j++) {
      if (this.pack[j] !== this.pack[i] || this.st[j]! >= R.states.dying || this.seen[j] === 1 || Math.hypot(this.px[j]! - this.px[i]!, this.pz[j]! - this.pz[i]!) > R.pack.callMetres) continue;
      this.seen[j] = 1;
      this.slot[j] = Math.atan2(hero.x - this.px[j]!, hero.z - this.pz[j]!) + (this.rand(j) - this.rand(j)) * R.attack.spreadRadians;   // each takes the side it came from, so a pack arrives from one way and spreads round him
    }
    this.seen[i] = 1; if (this.st[i] === R.states.idle || this.st[i] === R.states.home) this.st[i] = R.states.chase;
  }

  /** A mob's blow at the end of its wind-up: lands on the hero unless he guards or rolls or has stepped out of reach. */
  private land(i: number, K: MobKind, hero: Hero, dh: number): void {
    const R = this.rows;
    if (!hero.alive || dh > K.reachMetres + R.hero.radiusMetres + R.attack.slackMetres) return;
    if (Math.abs(wrap(Math.atan2(hero.x - this.px[i]!, hero.z - this.pz[i]!) - this.hd[i]!)) > R.attack.arcRadians) return;
    if (hero.defence === R.hero.guard || hero.defence === R.hero.roll) { this.heroBlocked++; return; }
    this.heroHit += K.damage;
  }

  /** Walks mob `i` out of every boss circle. */
  private leave(i: number, pads: readonly Pad[]): void {
    for (const p of pads) {
      const dx = this.px[i]! - p.x, dz = this.pz[i]! - p.z, d = Math.hypot(dx, dz);
      if (d < p.radius) { const f = d > 0 ? p.radius / d : 1; this.px[i] = p.x + (d > 0 ? dx * f : p.radius); this.pz[i] = p.z + (d > 0 ? dz * f : 0); }
    }
  }

  /** Pushes mobs that overlap apart (all pairs: n is at most the cap). */
  private separate(dt: number): void {
    const R = this.rows, S = R.states, m = R.separation.metres;
    for (let i = 0; i < this.n; i++) {
      if (this.st[i]! >= S.dying) continue;
      for (let j = i + 1; j < this.n; j++) {
        if (this.st[j]! >= S.dying) continue;
        const dx = this.px[j]! - this.px[i]!, dz = this.pz[j]! - this.pz[i]!, d = Math.hypot(dx, dz);
        if (d >= m) continue;
        const nx = d > 0 ? dx / d : 1, nz = d > 0 ? dz / d : 0, push = ((m - d) / m) * R.separation.speed * dt;
        this.px[i] = this.px[i]! - nx * push; this.pz[i] = this.pz[i]! - nz * push; this.px[j] = this.px[j]! + nx * push; this.pz[j] = this.pz[j]! + nz * push;
      }
    }
  }

  /** The hero's blow: every mob within reach of him, not yet hit by this swing, is tested with the caller's `hit`; a hit wounds, shoves away from him, and a kill is an event. */
  private strike(sw: Swing): void {
    const R = this.rows, S = R.states, near = R.swingMetres;
    for (let i = 0; i < this.n; i++) {
      if (this.st[i]! >= S.dying || this.struck[i] === sw.id) continue;
      if (Math.abs(this.px[i]! - sw.x) > near || Math.abs(this.pz[i]! - sw.z) > near) continue;
      const K = kindRow(this.kind[i]!), dmg = sw.hit(this.px[i]!, this.pz[i]!, this.hd[i]!, Math.max(K.scale, R.hitScale));
      if (!(dmg > 0)) continue;
      this.struck[i] = sw.id;
      this.hp[i] = this.hp[i]! - dmg;
      const dx = this.px[i]! - sw.x, dz = this.pz[i]! - sw.z, d = Math.hypot(dx, dz) || 1;
      this.kx[i] = (dx / d) * K.knockSpeed * sw.knockback; this.kz[i] = (dz / d) * K.knockSpeed * sw.knockback;
      this.hurtT[i] = 1; this.seen[i] = 1;
      if (this.hp[i]! <= 0) this.die(i, K);
      else { this.st[i] = S.hurt; this.timer[i] = K.hurtSeconds; }
    }
  }

  private die(i: number, K: MobKind): void {
    const R = this.rows;
    this.st[i] = R.states.dying; this.fallT[i] = 0;
    let left = 0;
    for (const s of this.sites.values()) if (s.id === this.pack[i]) {
      s.left = Math.max(0, s.left - 1); s.alive = Math.max(0, s.alive - 1); left = s.left;
      if (s.left === 0) { s.clearedAt = this.clock; for (const cb of this.clearedListeners) cb(s.id); }
    }
    const e: Killed = { kind: KIND_IDS[this.kind[i]!]!, pack: this.pack[i]!, x: this.px[i]!, z: this.pz[i]!, coins: K.coins, xp: K.xp, heat: K.heat, left };
    for (const cb of this.killedListeners) cb(e);
  }

  /** Frees finished bodies and mobs the hero has left far behind (the pack keeps its count and brings them back when he returns). */
  private cull(hero: Hero): void {
    const R = this.rows, S = R.states;
    for (let i = this.n - 1; i >= 0; i--) {
      const gone = this.fadeT[i]! >= 1 && this.st[i] === S.lying;
      const far = this.st[i]! < S.dying && Math.hypot(this.px[i]! - hero.x, this.pz[i]! - hero.z) > R.despawnMetres;
      if (!gone && !far) continue;
      if (far) for (const s of this.sites.values()) if (s.id === this.pack[i]) s.alive = Math.max(0, s.alive - 1);
      this.remove(i);
    }
  }

  private remove(i: number): void {
    const last = --this.n; this.view.n = this.n;
    if (i === last) return;
    for (const a of [this.kind, this.st, this.pack, this.px, this.pz, this.hd, this.sp, this.hx, this.hz, this.kx, this.kz, this.tx, this.tz, this.hp, this.timer, this.wander, this.cool, this.hurtT, this.fallT, this.fadeT, this.seen, this.rng, this.slot, this.struck] as { [k: number]: number }[]) a[i] = a[last]!;
  }
}

function inPads(pads: readonly Pad[], x: number, z: number, extra: number): boolean {
  for (const p of pads) if (Math.hypot(x - p.x, z - p.z) < p.radius + extra) return true;
  return false;
}
