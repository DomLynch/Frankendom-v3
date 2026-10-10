import { bladePathsByRig } from './blade-paths.ts';
import type { State } from './sim.ts';
import { M } from './detmath.ts';   // never Math.<transcendental> in the sim: engines round them differently (tests/detmath.test.ts)

// Preserve the authored contact pose while sharpening the release through contact.
export function swingProgress(progress: number, contact = .35, sourceContact = .34): number {
  const keys = [[0, 0], [contact * .7, sourceContact * .44], [contact, sourceContact], [contact + .16, sourceContact + (1 - sourceContact) * .56], [1, 1]];
  const p = Math.max(0, Math.min(1, progress));
  for (let i = 1; i < keys.length; i++) if (p <= keys[i][0]) {
    const [x, y] = keys[i - 1], [end, value] = keys[i];
    return y + (value - y) * (p - x) / (end - x);
  }
  return 1;
}

type Point = number[];
const sub = (a: Point, b: Point) => a.map((v, i) => v - b[i]);
const dot = (a: Point, b: Point) => a.reduce((s, v, i) => s + v * b[i], 0);
const mix = (a: Point, b: Point, t: number) => a.map((v, i) => v + (b[i] - v) * t);
const clamp = (x: number) => Math.max(0, Math.min(1, x));
// Closest points between finite segments, including parallel and zero-length blades.
export function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  const u = sub(b, a), v = sub(d, c), w = sub(a, c), aa = dot(u,u), bb = dot(u,v), cc = dot(v,v), dd = dot(u,w), ee = dot(v,w);
  const denominator = aa*cc-bb*bb;
  let s = aa < 1e-12 ? 0 : cc < 1e-12 ? clamp(-dd/aa) : denominator > 1e-12 ? clamp((bb*ee-cc*dd)/denominator) : 0;
  let t = cc < 1e-12 ? 0 : (bb*s+ee)/cc;
  if (t < 0) { t = 0; s = aa < 1e-12 ? 0 : clamp(-dd/aa); }
  else if (t > 1) { t = 1; s = aa < 1e-12 ? 0 : clamp((bb-dd)/aa); }
  return M.hypot(...sub(mix(a,b,s),mix(c,d,t)));
}
// Offline-sampled rig paths are immutable simulation data. Never query rendered bones for damage.
// A table belongs to the rig it was baked on (blade-paths.ts `bladePathsByRig[rig][weapon]`): the lookup is strict, a weapon a rig has no
// bake for is an error here, never another rig's sweep. tests/blade-rig.test.ts pins every shipped (rig, weapon) pair so this cannot throw in play.
export function bladeFrames(rig: string, weapon: string, kind: string): number[][] {
  const frames = bladePathsByRig[rig]?.[weapon]?.[kind];
  if (!frames) throw new Error(`no blade table for ${weapon} ${kind} on the ${rig} rig`);
  return frames;
}
export function bladePose(rig: string, weapon: string, kind: string, age: number): number[] {
  const frames = bladeFrames(rig, weapon, kind), frame = Math.max(0,Math.min(frames.length-1,age)), index = Math.floor(frame);
  return mix(frames[index],frames[Math.min(index+1,frames.length-1)],frame-index);
}
export type HitLocation = 'head' | 'torso' | 'legs';
// `targetScale` is the target's body scale (moves.ts `Opponent`): the upright capsule and its regions grow with the man.
export function bladeImpact(rig: string, weapon: string, kind: string, fromAge: number, toAge: number, before: State, after: State, targetBefore: State, targetAfter: State, targetScale = 1): HitLocation | null {
  const world = (pose: number[], actor: State, target: State) => [0,3].map(offset => {
    const [x,y,z] = pose.slice(offset,offset+3), c = M.cos(actor.heading), s = M.sin(actor.heading);
    return [actor.x-target.x+x*c+z*s,y,actor.z-target.z+z*c-x*s];
  });
  const a = world(bladePose(rig,weapon,kind,fromAge),before,targetBefore), b = world(bladePose(rig,weapon,kind,toAge),after,targetAfter);
  // Sample the swept segment at <=2cm intervals; conservative 1cm padding closes sampling gaps.
  const steps = Math.max(1,Math.ceil(Math.max(M.hypot(...sub(a[0],b[0])),M.hypot(...sub(a[1],b[1])))/.02));
  for (let i=0;i<=steps;i++) {
    const start=mix(a[0],b[0],i/steps),end=mix(a[1],b[1],i/steps);
    const k = targetScale;
    if (segmentDistance(start,end,[0,.55*k,0],[0,1.45*k,0]) > .31*k) continue;
    // Coarse upright hit regions; not animated per-limb anatomy or precision head aiming.
    const regions: [HitLocation,number,number][] = [['head',1.45*k,1.45*k],['torso',.85*k,1.3*k],['legs',.55*k,.7*k]];
    return regions.sort((x,y)=>segmentDistance(start,end,[0,x[1],0],[0,x[2],0])-segmentDistance(start,end,[0,y[1],0],[0,y[2],0]))[0][0];
  }
  return null;
}

export function bladeContact(...args: Parameters<typeof bladeImpact>): boolean { return bladeImpact(...args) !== null; }
