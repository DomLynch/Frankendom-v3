// Other players, where each one is drawn, between the server's packets (presence ticks). Lifted from V1 origins/preview/remote-track.ts. Pure: no THREE, no DOM, no clock of its own (the page passes `now`).
// A presence packet carries only the entities DUE that tick (10 / 5 / 2 Hz by distance: the interest tiers), not a snapshot: so a packet MERGES by id, and an id is dropped (its record gone, so a
// reused id starts fresh, never easing from the old player's last pose) once it has had no update for `remoteExpire` ms. Each remote eases from where it is SHOWN to its newest position over the
// time its last two updates were apart (a tick at least, the slowest tier's interval at most): no jump when a packet lands mid-ease, and a far player reads as smoothly as a near one.
// A jump beyond `remoteSnap` metres is a teleport, not a run. The tick, the interest cap and the tiers are presence's rows (data/presence.json). No gameplay: this only says where to draw.
import { presenceRule } from './rows.ts';

export type Remote = { id: number; x: number; z: number; heading: number; anim: number; flags: number };
export type Shown = { id: number; x: number; z: number; heading: number; speed: number };   // speed: metres a second along the current ease (0 at rest, after a snap, or once the ease is done)
type Rec = { fx: number; fz: number; fh: number; tx: number; tz: number; th: number; t0: number; dur: number; last: number; snapped: boolean };

const TAU = Math.PI * 2;
export const arc = (from: number, to: number): number => ((((to - from + Math.PI) % TAU) + TAU) % TAU) - Math.PI;   // the short way round, in -PI..PI

export function createTrack(o: { tickMs?: number; slowestEvery?: number; snap?: number; cap?: number; expire?: number } = {}) {
  const tick = o.tickMs ?? presenceRule('tickMs'), longest = tick * (o.slowestEvery ?? presenceRule('tier3Every')), snap = o.snap ?? presenceRule('remoteSnap'), cap = o.cap ?? presenceRule('nearCap'), expire = o.expire ?? presenceRule('remoteExpire');
  const recs = new Map<number, Rec>();
  const at = (r: Rec, now: number): Shown & { done: boolean } => {
    const a = Math.min(1, Math.max(0, (now - r.t0) / r.dur));
    return { id: 0, x: r.fx + (r.tx - r.fx) * a, z: r.fz + (r.tz - r.fz) * a, heading: r.fh + arc(r.fh, r.th) * a, speed: 0, done: a >= 1 };
  };
  return {
    /** The packet's entities (the ones due this tick): new ids start where they are, known ids ease from where they are shown to the new place. Ids not in the packet are left alone (expired in `shown`). */
    push(list: readonly Remote[], now: number): void {
      for (const p of list) {
        const r = recs.get(p.id);
        if (!r) { recs.set(p.id, { fx: p.x, fz: p.z, fh: p.heading, tx: p.x, tz: p.z, th: p.heading, t0: now, dur: tick, last: now, snapped: false }); continue; }
        const s = at(r, now), jump = Math.hypot(p.x - s.x, p.z - s.z) > snap;
        r.fx = jump ? p.x : s.x; r.fz = jump ? p.z : s.z; r.fh = jump ? p.heading : s.heading; r.tx = p.x; r.tz = p.z; r.th = p.heading;
        r.t0 = now; r.dur = Math.min(longest, Math.max(tick, now - r.last)); r.last = now; r.snapped = jump;
      }
    },
    /** What to draw now: the nearest `cap` to the hero (ties by id), each with the speed along its ease. */
    shown(now: number, hero: { x: number; z: number }): Shown[] {
      const out: (Shown & { d: number })[] = [];
      for (const [id, r] of recs) {
        if (now - r.last > expire) { recs.delete(id); continue; }   // no update for remoteExpire ms: gone, and the record with it
        const s = at(r, now), run = r.snapped || s.done ? 0 : Math.hypot(r.tx - r.fx, r.tz - r.fz) / (r.dur / 1000);
        out.push({ id, x: s.x, z: s.z, heading: s.heading, speed: run, d: Math.hypot(s.x - hero.x, s.z - hero.z) });
      }
      return out.sort((a, b) => a.d - b.d || a.id - b.id).slice(0, cap).map((s) => ({ id: s.id, x: s.x, z: s.z, heading: s.heading, speed: s.speed }));
    },
    size: (): number => recs.size,
  };
}
