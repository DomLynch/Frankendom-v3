// THE HUNT (data/heat.json hunt, tiers; Dom 2026-10-28, ported from Armagedom's marked hunters, docs/hunter-port.md). Pure rules over the zone's spawn list: while the hero has heat a hunter is announced, arrives behind him,
// walks at him and, once inside its aggro, is an ordinary boss (the existing aggro hand-over starts the 1v1; a hero already fighting is joined as an attacker, the world's maxAttackers still caps it). No scene, no sim,
// no clock of its own, no storage (heat and the hunt are session only). A hunter owns a PARKED slot: a spawn row in the list (kind hunt.kind) that is dead and never respawns on its own timer (parkedSeconds), so
// every index the page holds (current, attackers, radar) stays put. While it walks, the slot is still "dead" to the page's own rules and this file moves its x, z; when it is close it STANDS, and from then on
// the page treats it like any boss. No string or number literal lives here: scripts/as-data/check.mjs scans src/zone/ at zero (every number is a heat.json row).
import { M } from '../fight/detmath.ts';
import { HEAT, heatSeconds, heatStar, huntersAllowed, type Heat, type HeatRows } from '../heat.ts';
import { isStanding, type Spawn } from '../stubs.ts';

type At = { x: number; z: number };
/** One hunter's place in the spawn list and where it is in its life: announced (`warnedAt`), walking (`chasing`), or a standing boss (`engaged`). All false/null = parked. */
export type Slot = { index: number; warnedAt: number | null; arriveAt: number; chasing: boolean; engaged: boolean };
export type Hunt = { slots: Slot[]; nextAt: number; armed: boolean; arrivals: number };
/** What the last step did, for the page to say and draw. One object reused by every step (no allocation per frame). */
export type HuntNote = { warned: boolean; arrived: boolean; gone: boolean; index: number; star: number };

const NOTE: HuntNote = { warned: false, arrived: false, gone: false, index: 0, star: 0 };
const dist = (a: At, b: At): number => M.hypot(a.x - b.x, a.z - b.z);

/** The parked spawn rows for the list: `hunt.maxHunters` of them, named `<kind>-<n>`, dead, never respawning on their own timer. The page appends them after the zone's own spawns. */
export function hunterSpawns(rows: HeatRows = HEAT): Spawn[] {
  const u = rows.hunt, out: Spawn[] = [];
  for (let i = 0; i < u.maxHunters; i++) out.push({ id: `${u.kind}-${i + 1}`, kind: u.kind, x: 0, z: 0, aggro: u.aggro, leash: u.leash, respawnSeconds: u.parkedSeconds, deadFor: 0 });
  return out;
}

/** A fresh hunt over the slots that start at list index `first`. */
export function freshHunt(first: number, rows: HeatRows = HEAT): Hunt {
  const slots: Slot[] = [];
  for (let i = 0; i < rows.hunt.maxHunters; i++) slots.push({ index: first + i, warnedAt: null, arriveAt: 0, chasing: false, engaged: false });
  return { slots, nextAt: 0, armed: false, arrivals: 0 };
}

const park = (spawns: Spawn[], slot: Slot): void => { spawns[slot.index] = { ...spawns[slot.index]!, deadFor: 0 }; };
function reset(slot: Slot): void { slot.warnedAt = null; slot.chasing = false; slot.engaged = false; }

/**
 * One step. `spawns` is this frame's list (the hunter slots are written in place); `hero` where he stands and which way he faces (the arrival is behind him); `inFight(i)`: list index i is in a fight with him right now.
 * With no heat every hunter loses him: the walkers and the announced ones go, a standing one goes unless it is fighting him, and the clock re-arms for the next time he has heat.
 */
export function stepHunt(hunt: Hunt, spawns: Spawn[], hero: At & { heading: number }, heat: Heat, now: number, dt: number, inFight: (index: number) => boolean, rows: HeatRows = HEAT): HuntNote {
  const u = rows.hunt, allowed = huntersAllowed(heat, rows);
  NOTE.warned = false; NOTE.arrived = false; NOTE.gone = false;
  const lose = (slot: Slot): void => { NOTE.gone = true; hunt.nextAt = Math.max(hunt.nextAt, now + heatSeconds(heat, u.respawnDelaySeconds, rows)); if (isStanding(spawns[slot.index]!)) park(spawns, slot); reset(slot); };
  if (!allowed) {
    hunt.armed = false;
    for (const slot of hunt.slots) if (slot.warnedAt !== null || slot.chasing || (slot.engaged && !inFight(slot.index))) { reset(slot); if (isStanding(spawns[slot.index]!)) park(spawns, slot); }
    return NOTE;
  }
  if (!hunt.armed) { hunt.armed = true; hunt.nextAt = now + heatSeconds(heat, u.arrivalDelaySeconds, rows); }
  let active = 0;
  for (const slot of hunt.slots) {
    const s = spawns[slot.index]!;
    if (slot.engaged) {
      if (!isStanding(s)) { slot.engaged = false; hunt.nextAt = Math.max(hunt.nextAt, now + heatSeconds(heat, u.respawnDelaySeconds, rows)); continue; }   // it fell to him
      if (dist(s, hero) > u.giveUpMetres && !inFight(slot.index)) { lose(slot); continue; }   // he got away from the one that stood
      active++;
    } else if (slot.chasing) {
      const d = dist(s, hero);
      if (d > u.giveUpMetres) { lose(slot); continue; }
      if (d <= u.aggro) { spawns[slot.index] = { ...s, deadFor: null }; slot.chasing = false; slot.engaged = true; active++; continue; }   // close enough: it stands, the page's aggro takes over
      const k = Math.min(1, (u.speedMetresPerSecond * dt) / d);
      spawns[slot.index] = { ...s, x: s.x + (hero.x - s.x) * k, z: s.z + (hero.z - s.z) * k };
      active++;
    } else if (slot.warnedAt !== null) {
      active++;
      if (now < slot.arriveAt) continue;
      const at = { x: hero.x - M.sin(hero.heading) * u.spawnDistanceMetres, z: hero.z - M.cos(hero.heading) * u.spawnDistanceMetres };
      if (spawns.some((o, i) => i !== slot.index && isStanding(o) && dist(o, at) < u.campClearMetres + o.aggro)) { slot.arriveAt = now + u.retrySeconds; continue; }   // a camp is there: try again a moment later
      spawns[slot.index] = { ...s, x: at.x, z: at.z };
      slot.warnedAt = null; slot.chasing = true; hunt.arrivals += 1;
      hunt.nextAt = now + heatSeconds(heat, u.spawnCooldownSeconds, rows);
      NOTE.arrived = true; NOTE.index = slot.index; NOTE.star = heatStar(heat, hunt.arrivals, rows);
    }
  }
  if (active < allowed && now >= hunt.nextAt) {
    const free = hunt.slots.find((slot) => slot.warnedAt === null && !slot.chasing && !slot.engaged);
    if (free) { free.warnedAt = now; free.arriveAt = now + u.warningSeconds; hunt.nextAt = free.arriveAt; NOTE.warned = true; NOTE.index = free.index; }
  }
  return NOTE;
}
