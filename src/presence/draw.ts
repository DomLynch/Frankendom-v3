// Other players, drawn (live zone phase 2). Lifted from V1 origins/preview/remote-heroes.ts (a pool of rigs, each eased by the track, the gait from the speed it covers, a slot freed when its player leaves),
// cut to the plain figure: no name tags, no crowd ladder, no cheap rungs (a later item). Others have NO collider and take no part in the fight: nothing here touches the sim, the hero or the opponent.
// This file imports no THREE: the page hands it `spawn`, a body made from the hero's already-loaded rig (scene.ts `spawnRemote`: buildWarriors clones the hero's asset, so nothing is fetched or parsed and
// the materials and shader programs are the hero's own). It is bundled into the presence chunk (chunk.ts), so a page without ?presence= carries none of it. Every number is a row (data/presence.json).
import { PRESENCE, presenceRule } from './rows.ts';
import type { Shown } from './track.ts';

/** One drawn figure, as scene.ts builds it: `group` is its root in the scene (position, rotation.y, visible), `update` poses it for a gait speed (m/s) over dt seconds. */
export type RemoteBody = {
  group: { visible: boolean; position: { set(x: number, y: number, z: number): unknown }; rotation: { y: number } };
  update(speed: number, dt: number, contact: number): void;   // contact: the ready pose's contact argument (row drawContact)
};
type Slot = { body: RemoteBody; id: number | null; speed: number };

/** The pool of drawn figures. `frame(dt)` reads who is near (the presence handle's remotes()), gives each its slot (the nearest `max`), and frees the slot of anyone who left. */
export function createDraw(d: { remotes: (now: number) => readonly Shown[]; spawn: () => RemoteBody | null; now: () => number; max?: number; idle?: number; smooth?: number }) {
  const max = d.max ?? presenceRule('drawMax'), idle = d.idle ?? presenceRule('drawIdle'), smooth = d.smooth ?? presenceRule('drawSmooth'), contact = presenceRule('drawContact');
  const pool: Slot[] = [], live = new Map<number, Slot>();
  return {
    frame(dt: number): void {
      const seen = new Set<number>();
      for (const s of d.remotes(d.now()).slice(0, max)) {
        let slot = live.get(s.id);
        if (!slot) {
          slot = pool.find((p) => p.id === null);
          if (!slot) { const body = d.spawn(); if (!body) continue; slot = { body, id: null, speed: 0 }; pool.push(slot); }   // the hero's rig is not built yet: try again next frame
          slot.id = s.id; slot.speed = 0; live.set(s.id, slot);
        }
        seen.add(s.id);
        slot.speed += ((s.speed < idle ? 0 : s.speed) - slot.speed) * (1 - Math.exp(-dt * smooth)); if (slot.speed < idle) slot.speed = 0;
        slot.body.group.position.set(s.x, 0, s.z); slot.body.group.rotation.y = s.heading; slot.body.group.visible = true;
        slot.body.update(slot.speed, dt, contact);
      }
      for (const [id, slot] of live) if (!seen.has(id)) { slot.body.group.visible = false; slot.id = null; slot.speed = 0; live.delete(id); }
    },
    /** For the browser checks and the smoke: who is drawn, where, at what gait speed. */
    debug: () => ({ pool: pool.length, shown: [...live.entries()].map(([id, s]) => ({ id, x: +(s.body.group.position as unknown as { x: number }).x.toFixed(2), z: +(s.body.group.position as unknown as { z: number }).z.toFixed(2), speed: +s.speed.toFixed(2) })) }),
  };
}

/** The hero's pose for the presence service: where he stands and faces (the page's own state), and the anim byte from the speed he covers between two reads (row ids animIdle / animWalk / animRun). */
export function heroPoseFn(read: () => { x: number; z: number; heading: number }, now: () => number = () => performance.now()): () => { x: number; z: number; heading: number; anim: number } {
  const minDt = presenceRule('poseMinDtMs'), idle = presenceRule('drawIdle'), runAt = presenceRule('animRunMps');
  let at: { x: number; z: number; t: number } | null = null, anim = presenceRule('animIdle');
  return () => {
    const p = read(), t = now();
    if (!at) at = { x: p.x, z: p.z, t };
    else if (t - at.t >= minDt) {
      const v = Math.hypot(p.x - at.x, p.z - at.z) / ((t - at.t) / 1000);
      anim = presenceRule(v < idle ? 'animIdle' : v < runAt ? 'animWalk' : 'animRun'); at = { x: p.x, z: p.z, t };
    }
    return { x: p.x, z: p.z, heading: p.heading, anim };
  };
}

/** The page's draw loop on its own requestAnimationFrame (so main.ts's frame is untouched); returns stop. */
export function startDrawLoop(draw: { frame(dt: number): void }, raf: (fn: (t: number) => void) => number = (fn) => requestAnimationFrame(fn), cancel: (id: number) => void = (id) => cancelAnimationFrame(id)): () => void {
  let last = 0, id = 0, stopped = false;
  const dtMax = presenceRule('drawDtMaxS');
  const tick = (t: number): void => {
    if (stopped) return;
    const dt = last ? Math.min(dtMax, Math.max(0, (t - last) / 1000)) : 0; last = t;
    draw.frame(dt); id = raf(tick);
  };
  id = raf(tick);
  return () => { stopped = true; cancel(id); };
}

export const SEAM: string = PRESENCE.poseGlobal;
