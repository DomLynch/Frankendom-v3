// Layers and spatial interest management. Lifted from V1 origins/presence/interest.ts: pure (no sockets, no clock of its own), so the rules are testable. Every number is a row
// (data/presence.json via src/presence/rows.ts). Cut from V1's: accounts (a player is a server-minted key), the v1 legacy frame, zones and quiet zones (V3 has one open walkable square),
// names, guests and worn sets (nothing is introduced: a packet is ids and positions), the 10-minute reconnect memory. The `friend` join stays as World.join's argument (hardCap), unused by the server for now.
import { ENTITY_BYTES, HEAD_BYTES, encodeDown, type Entity, type Pose } from '../../src/presence/wire.ts';
import { PRESENCE, interestRules, presenceRule, type Rules } from '../../src/presence/rows.ts';

export const RULES = interestRules();
export type { Rules };

const MS_PER_SECOND = 1000;
const CELL_STRIDE = 4096;   // a grid cell's key is column * CELL_STRIDE + row; the frame is at most 655 m, so a row never reaches the stride and two cells never share a key
export const SPAWN = { x: PRESENCE.frame.centreCm, z: PRESENCE.frame.centreCm };   // world (0, 0): where every join starts, chosen by the server
/** The ground a pose may be on: the square walkHalfCm around the frame's centre. */
export const walkable = (x: number, z: number): boolean => { const half = presenceRule('walkHalfCm'), c = PRESENCE.frame.centreCm; return Math.abs(x - c) <= half && Math.abs(z - c) <= half; };

export type Player = Pose & { id: number; key: string; layer: Layer; tick: number; movedAt: number; credit: number; fresh: boolean; seenAt: number; strikes: number; strikeAt: number };
export class Layer {
  readonly players = new Map<number, Player>();
  readonly cells = new Map<number, Set<Player>>();
  emptySince: number | null = null;
  readonly id: number;
  constructor(id: number) { this.id = id; }
}

export type MoveResult = 'ok' | 'snapped' | 'drop';
const cellOf = (r: Rules, x: number, z: number): number => Math.floor(x / r.cellCm) * CELL_STRIDE + Math.floor(z / r.cellCm);

export class World {
  readonly layers = new Map<number, Layer>();
  readonly byKey = new Map<string, Player>();
  private nextLayer = 1;
  readonly rules: Rules;
  readonly maxLayers: number;
  constructor(rules: Rules = RULES, maxLayers = presenceRule('maxLayers')) { this.rules = rules; this.maxLayers = maxLayers; }

  // Join: the friend's layer if they are in and it has room (up to hardCap), else the fullest layer under the soft cap (fill first), else a new layer. Starts at `at` when given, else SPAWN.
  // A client's first pose never places anyone: it is one more move through the speed clamp. Null when every layer is at its cap and no more may open, or the key is already in.
  join(key: string, now: number, friend?: string, at?: { x: number; z: number }): Player | null {
    if (this.byKey.has(key)) return null;
    const { softCap, hardCap } = this.rules;
    let layer: Layer | undefined;
    const pal = friend ? this.byKey.get(friend) : undefined;
    if (pal && pal.layer.players.size < hardCap) layer = pal.layer;
    if (!layer) for (const l of this.layers.values()) if (l.players.size < softCap && (!layer || l.players.size > layer.players.size)) layer = l;
    if (!layer) {
      if (this.layers.size >= this.maxLayers) return null;
      layer = new Layer(this.nextLayer++); this.layers.set(layer.id, layer);
    }
    let id = 1; while (layer.players.has(id)) id++;
    const wanted = at ?? SPAWN, from = walkable(Math.round(wanted.x), Math.round(wanted.z)) ? wanted : SPAWN;   // a spot the clamp would refuse starts at the spawn
    const x = Math.round(from.x), z = Math.round(from.z);
    const p: Player = { id, key, layer, x, z, heading: 0, anim: 0, flags: 0, tick: 0, movedAt: now, credit: 0, fresh: true, seenAt: now, strikes: 0, strikeAt: now };
    layer.players.set(id, p); layer.emptySince = null; this.byKey.set(key, p);
    this.cellOf(layer, p).add(p);
    return p;
  }
  leave(p: Player, now: number): void {
    const layer = p.layer;
    if (layer.players.get(p.id) !== p) return;
    layer.cells.get(cellOf(this.rules, p.x, p.z))?.delete(p);
    layer.players.delete(p.id); this.byKey.delete(p.key);
    if (!layer.players.size) layer.emptySince = now;
  }
  // The client's claimed pose, clamped: somewhere walkable, at most the sprint speed (with slack). A pose off the walkable ground or a jump past the speed keeps the old position ("snapped": the
  // client is told nothing, it simply sees itself pulled back by the next packet) and counts a strike; repeated, the player is dropped.
  // The reach is a CREDIT, not a per-packet window (V1 Lead 2026-10-17): it accrues in real time at the speed limit, is capped at one second plus the jitter row, and each accepted step spends what it
  // moved. So packets that bunch on a jittery link draw on what the walker earned while they were in flight, a refused pose spends nothing (and the clock still runs, so one hiccup cannot snowball),
  // and a speed hack still cannot average more than the limit: the cap bounds any burst.
  move(p: Player, pose: Pose, now: number): MoveResult {
    const { strikesToDrop, strikeWindowMs, jitterMs, tickMs } = this.rules;
    if (now - p.strikeAt > strikeWindowMs) { p.strikes = 0; p.strikeAt = now; }
    const rate = (this.rules.maxSpeedCmS * this.rules.speedSlack) / MS_PER_SECOND;   // cm of reach earned per ms
    p.credit = Math.min(rate * (MS_PER_SECOND + jitterMs), p.credit + rate * Math.max(0, now - p.movedAt));
    p.movedAt = now; p.seenAt = now;
    const step = Math.hypot(pose.x - p.x, pose.z - p.z);
    const reach = Math.max(p.credit, p.fresh ? rate * tickMs : 0);   // one tick's worth for the FIRST pose after a join only (the client's opening step); after that, only what time has earned
    p.fresh = false;
    if (!walkable(pose.x, pose.z) || step > reach) {
      if (++p.strikes > strikesToDrop) return 'drop';
      return 'snapped';
    }
    p.credit = Math.max(0, p.credit - step);
    return this.place(p, pose.x, pose.z, pose);
  }
  private place(p: Player, x: number, z: number, pose: Pose): MoveResult {
    const from = cellOf(this.rules, p.x, p.z), to = cellOf(this.rules, x, z);
    if (from !== to) { p.layer.cells.get(from)?.delete(p); this.cellOf(p.layer, { x, z }).add(p); }
    p.x = x; p.z = z; p.heading = pose.heading; p.anim = pose.anim; p.flags = pose.flags; p.tick++;
    return 'ok';
  }
  private cellOf(layer: Layer, at: { x: number; z: number }): Set<Player> {
    const key = cellOf(this.rules, at.x, at.z);
    let set = layer.cells.get(key);
    if (!set) { set = new Set(); layer.cells.set(key, set); }
    return set;
  }
  // The entities one player is sent this tick: others within the radius, nearest first, capped, each at its distance tier's rate.
  // Entities are spread over the ticks of their period by id, so the 2 Hz and 5 Hz rings do not all fire on the same tick.
  seenBy(p: Player, tickNo: number): Entity[] {
    const { cellCm, radiusCm, nearCap, tiers } = this.rules, near: { e: Player; d: number }[] = [];
    const cx = Math.floor(p.x / cellCm), cz = Math.floor(p.z / cellCm), span = Math.ceil(radiusCm / cellCm);
    for (let i = cx - span; i <= cx + span; i++) for (let j = cz - span; j <= cz + span; j++) {
      if (i < 0 || j < 0) continue;
      const set = p.layer.cells.get(i * CELL_STRIDE + j);
      if (set) for (const e of set) if (e !== p) { const d = Math.hypot(e.x - p.x, e.z - p.z); if (d <= radiusCm) near.push({ e, d }); }
    }
    near.sort((a, b) => a.d - b.d);
    const out: Entity[] = [];
    for (const { e, d } of near.slice(0, nearCap)) {
      const every = (tiers.find(t => d <= t[0]) ?? tiers[tiers.length - 1])[1];
      if ((tickNo + e.id) % every === 0) out.push({ id: e.id, x: e.x, z: e.z, heading: e.heading, anim: e.anim, flags: e.flags, tick: e.tick });
    }
    return out;
  }
  // One tick: a packet for every player who has anything to be told (never an empty packet).
  tick(tickNo: number): Map<Player, Uint8Array> {
    const out = new Map<Player, Uint8Array>();
    for (const layer of this.layers.values()) for (const p of layer.players.values()) {
      const seen = this.seenBy(p, tickNo);
      if (seen.length) out.set(p, encodeDown(tickNo, seen));
    }
    return out;
  }
  // Layers with nobody in them for a while are closed.
  sweep(now: number): number {
    let closed = 0;
    for (const [id, l] of this.layers) if (!l.players.size && l.emptySince !== null && now - l.emptySince >= this.rules.emptyLayerMs) { this.layers.delete(id); closed++; }
    return closed;
  }
  stats(): { layers: number; players: number; perLayer: Record<number, number> } {
    const perLayer: Record<number, number> = {}; let players = 0;
    for (const l of this.layers.values()) { perLayer[l.id] = l.players.size; players += l.players.size; }
    return { layers: this.layers.size, players, perLayer };
  }
}
export const maxPacketBytes = (rules: Rules = RULES): number => HEAD_BYTES + rules.nearCap * ENTITY_BYTES;
