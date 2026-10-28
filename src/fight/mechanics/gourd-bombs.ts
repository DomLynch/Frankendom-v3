// LORD GOURD, PUMPKIN BOMBS (data/mechanics.json row "gourd"; Dom 2026-10-28: each boss its own fighting identity). Every few seconds, with the hero in range, he stomps (the tell), then lobs a few gourds. Each aims at the hero's spot
// the moment it leaves his hand, lands as a glowing ring on the ground and bursts after a fuse: an area hit with a small shove. Step or roll out of the ring before it bursts (a roll's safe frames take nothing; a raised guard takes
// the row's share). Damage is the boss's OWN move row (`damageMove`) x the row's share, through his sheet's attack dial and the hero's armour: no number of its own. It never kills (the floor), never runs while the boss is down or the
// hero is dead, and everything vanishes at once when the fight ends (the corpse cut is never covered). This file is the pure core (typed arrays made once; a tick allocates nothing) plus the runtime the registry hands the page; the
// drawing is gourd-bombs-view.ts. Outside the duel sim on purpose, like src/mobs-run.ts: it reads the Practice and returns one with the hero's health (and place) changed, so no Pit record, digest or replay moves.
import ROWS from '../../../data/mechanics.json' with { type: 'json' };
import { movesOf, type Fighter } from '../duel.ts';
import { statDown, statUp } from '../sheet-rows.ts';
import { RULES } from '../moves.ts';
import { M } from '../detmath.ts';
import type { Practice } from '../combat.ts';
import { createGourdBombsView, type BombView } from './gourd-bombs-view.ts';
import type { MechanicRuntime } from './runtime.ts';

export type GourdRow = (typeof ROWS.mechanics)['gourd'];
export const GOURD: GourdRow = ROWS.mechanics.gourd;
/** A gourd's life: nothing, in the air, on the ground with its fuse lit, bursting. */
export const BOMB = { free: 0, flight: 1, fuse: 2, burst: 3 } as const;
const TAU = Math.PI + Math.PI, GOLDEN = Math.PI * (3 - Math.sqrt(5));   // the golden angle: successive casts spread their extra gourds round the hero without repeating

/** What the core reads each tick (one object the runtime refills; nothing is copied). */
export type Ctx = {
  active: boolean;            // the boss fights the hero now, both alive
  bossX: number; bossZ: number; bossShare: number;      // his place and his health as a share of his maximum
  heroX: number; heroZ: number; heroRoll: boolean; heroGuard: boolean; heroHurt: boolean;
  damage: number;             // one burst's damage on a bare hero (the boss's move row x his attack dial x the hero's armour x the row's share)
};
/** What the core hands back for the tick: the hero's damage (0 = none), the shove to lay on his place, and how many bursts he rolled out of. Reused, never reallocated. */
export type Out = { damage: number; shoveX: number; shoveZ: number; dodged: number; hit: number };
export const newCtx = (): Ctx => ({ active: false, bossX: 0, bossZ: 0, bossShare: 1, heroX: 0, heroZ: 0, heroRoll: false, heroGuard: false, heroHurt: false, damage: 0 });

export function createGourdBombs(row: GourdRow = GOURD) {
  const n = row.pool;
  const view: BombView = {
    n, state: new Uint8Array(n), age: new Float32Array(n), x: new Float32Array(n), z: new Float32Array(n), fromX: new Float32Array(n), fromZ: new Float32Array(n),
    stomp: -1, stompX: 0, stompZ: 0,
  };
  const out: Out = { damage: 0, shoveX: 0, shoveZ: 0, dodged: 0, hit: 0 };
  let wait = row.firstSeconds, stomping = -1, casts = 0, shoveLeft = 0, pendX = 0, pendZ = 0;

  const clear = () => { view.state.fill(0); view.stomp = -1; stomping = -1; shoveLeft = 0; pendX = pendZ = 0; };
  const anyLive = (): boolean => { for (let i = 0; i < n; i++) if (view.state[i] !== BOMB.free) return true; return false; };
  const slot = (): number => { for (let i = 0; i < n; i++) if (view.state[i] === BOMB.free) return i; return -1; };

  /** The lob: one gourd on the hero's spot, the rest round it (the angle walks on every cast), all leaving the boss's hand now. */
  function lob(c: Ctx): void {
    const count = c.bossShare <= row.lowShare ? row.countLow : row.count;
    for (let k = 0; k < count; k++) {
      const i = slot(); if (i < 0) break;
      const a = (casts + k) * GOLDEN, r = k === 0 ? 0 : row.scatterMetres;
      view.state[i] = BOMB.flight; view.age[i] = 0;
      view.x[i] = c.heroX + M.sin(a) * r; view.z[i] = c.heroZ + M.cos(a) * r; view.fromX[i] = c.bossX; view.fromZ[i] = c.bossZ;
    }
    casts++;
  }
  /** One burst at gourd `i`: the hero inside the ring (and not rolling) takes the damage and a shove away from its centre. */
  function burst(i: number, c: Ctx): void {
    const dx = c.heroX - view.x[i]!, dz = c.heroZ - view.z[i]!, gap = M.hypot(dx, dz);
    if (gap > row.radiusMetres + row.heroRadiusMetres) return;
    if (c.heroRoll) { out.dodged++; return; }
    const share = c.heroGuard ? row.guardShare : 1;
    out.damage += c.damage * share; out.hit++;
    const ux = gap > 0 ? dx / gap : M.sin(GOLDEN * casts), uz = gap > 0 ? dz / gap : M.cos(GOLDEN * casts);   // dead centre: shoved the way the golden angle points (still deterministic)
    pendX += ux * row.knockbackMetres * share; pendZ += uz * row.knockbackMetres * share; shoveLeft = row.shoveSeconds;
  }

  return {
    view, out, row,   // row: the live row object (the stills lengthen a time on it to hold a frame)
    reset(): void { clear(); wait = row.firstSeconds; casts = 0; },
    /** One tick of `dt` seconds. Fills `out` (cleared first). An inactive tick (the fight is over, the boss is down, the hero is dead) wipes every gourd and rearms the first wait. */
    tick(dt: number, c: Ctx): Out {
      out.damage = out.shoveX = out.shoveZ = out.dodged = out.hit = 0;
      if (!c.active) { if (view.stomp >= 0 || stomping >= 0 || anyLive() || shoveLeft > 0) clear(); wait = row.firstSeconds; return out; }
      if (wait > 0) wait -= dt;
      if (stomping < 0 && wait <= 0 && M.hypot(c.heroX - c.bossX, c.heroZ - c.bossZ) <= row.engageMetres && !(row.waitWhileHeroHurt && c.heroHurt)) { stomping = row.stompSeconds; view.stompX = c.bossX; view.stompZ = c.bossZ; }
      if (stomping >= 0) {
        stomping -= dt; view.stomp = Math.min(1, Math.max(0, 1 - stomping / row.stompSeconds)); view.stompX = c.bossX; view.stompZ = c.bossZ;
        if (stomping <= 0) { lob(c); stomping = -1; view.stomp = -1; wait = row.cooldownSeconds; }
      }
      for (let i = 0; i < n; i++) {
        const s = view.state[i]!;
        if (s === BOMB.free) continue;
        view.age[i] = view.age[i]! + dt;
        if (s === BOMB.flight && view.age[i]! >= row.flightSeconds) { view.state[i] = BOMB.fuse; view.age[i] = 0; }
        else if (s === BOMB.fuse && view.age[i]! >= row.fuseSeconds) { view.state[i] = BOMB.burst; view.age[i] = 0; burst(i, c); }
        else if (s === BOMB.burst && view.age[i]! >= row.burstSeconds) view.state[i] = BOMB.free;
      }
      if (shoveLeft > 0) {   // the shove is spread over the row's seconds: the hero is pushed, not teleported
        const frac = Math.min(dt, shoveLeft) / shoveLeft;
        out.shoveX = pendX * frac; out.shoveZ = pendZ * frac; pendX -= out.shoveX; pendZ -= out.shoveZ; shoveLeft -= dt;
        if (shoveLeft <= 0) pendX = pendZ = 0;
      }
      return out;
    },
  };
}

/** The hero's defence this tick, from the Pit's own rules: inside a roll's safe frames, or guarding. */
const rolling = (f: Fighter): boolean => f.phase === 'roll' && f.age >= RULES.safeStart && f.age <= RULES.safeEnd;

/** The registry's runtime for this mechanic: the core, its drawing, and the Practice in -> Practice out step main.ts calls once per sim tick (the same shape as src/mobs-run.ts). */
export function createGourdBombsRuntime(row: GourdRow = GOURD): MechanicRuntime {
  const core = createGourdBombs(row), ctx = newCtx(), drawing = createGourdBombsView(core.view, row);
  return {
    boss: row.boss, group: drawing.group, core, ctx,
    reset: () => core.reset(),
    tick(practice: Practice, on: boolean, dt: number): Practice {
      const [hero, boss] = practice.duel.fighters;
      ctx.active = on && !practice.finish && hero.health > 0 && hero.phase !== 'dead' && boss.health > 0 && boss.phase !== 'dead';
      if (ctx.active) {
        ctx.bossX = boss.body.x; ctx.bossZ = boss.body.z; ctx.bossShare = boss.maxHealth > 0 ? boss.health / boss.maxHealth : 1;
        ctx.heroX = hero.body.x; ctx.heroZ = hero.body.z; ctx.heroRoll = rolling(hero); ctx.heroGuard = hero.phase === 'guard'; ctx.heroHurt = hero.phase === 'hurt';
        ctx.damage = statDown(hero.sheet, 'armour', statUp(boss.sheet, 'attack', movesOf(boss)[row.damageMove]!.damage * row.damageShare));
      }
      const o = core.tick(dt, ctx);
      if (!(o.damage > 0) && o.shoveX === 0 && o.shoveZ === 0) return practice;
      const hit = o.damage > 0 ? Math.max(1, Math.round(o.damage)) : 0, floor = Math.min(hero.health, row.floorHealth), health = hit > 0 ? Math.max(floor, hero.health - hit) : hero.health;
      const moved: Fighter = { ...hero, health, body: { ...hero.body, x: hero.body.x + o.shoveX, z: hero.body.z + o.shoveZ } };
      return { ...practice, playerHealth: health, fighter: moved.body, duel: { ...practice.duel, fighters: [moved, boss] } };
    },
    frame: (dt: number) => drawing.update(dt),
  };
}
