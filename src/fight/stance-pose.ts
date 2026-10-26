// `?look=stances&stance=<name>` (a look test, presentation only): the four stances (docs/specs/origins/combat-study.md, Dom 2026-10-07) read from how the weapon is held, never from a
// HUD icon. Neutral is today's ready pose. The others are bones-only offsets on the calm ready layer (radians, in the bone's own frame; the pelvis drop in rig-scale metres), restored
// before every update like the tired body. No sim state, no hitbox, no blade table: the stance sim is Combat's and is not wired here.
export type Stance = 'neutral' | 'aggressive' | 'defensive' | 'trickster';
export const STANCES: readonly Stance[] = ['neutral', 'aggressive', 'defensive', 'trickster'];

/** The look-test flag: `?look=stances` plus `stance=<name>`; anything else (or no flag) is neutral, i.e. today's frame. */
export function stanceFrom(search: string): Stance {
  const q = new URLSearchParams(search);
  if (!(q.get('look') ?? '').split(',').includes('stances')) return 'neutral';
  const s = q.get('stance') as Stance | null;
  return s && STANCES.includes(s) ? s : 'neutral';
}

export type StancePose = { drop: number; sway: number; hip: number; knee: number; spine1: number; spine2: number; spine3: number; neck: number; head: number; headTilt: number; arm: number; fore: number; offArm: number; lean: number };
export const NO_STANCE: StancePose = { drop: 0, sway: 0, hip: 0, knee: 0, spine1: 0, spine2: 0, spine3: 0, neck: 0, head: 0, headTilt: 0, arm: 0, fore: 0, offArm: 0, lean: 0 };

// hip/knee: thigh and calf bend together so the feet stay put while the pelvis drops; arm/fore: sword arm up (negative) or down; lean: side-to-side sway of the spine.
const FULL: Record<Stance, Partial<StancePose>> = {
  neutral: {},
  aggressive: { spine1: .1, spine2: .1, spine3: .06, neck: -.08, head: -.1, arm: -.55, fore: -.5, hip: -.12, knee: .24, drop: .035, offArm: -.2 },
  defensive: { drop: .06, hip: -.14, knee: .32, spine1: .18, spine2: .12, spine3: .08, neck: -.05, head: -.12, arm: .15, fore: -.35, offArm: -.15 },
  trickster: { arm: .3, fore: .2, spine1: .04, headTilt: .12, hip: -.1, knee: .2, drop: .03, offArm: .25, sway: .06, lean: .1 },
};
/** 0..1 weight (eased by the caller) -> the stance's offsets; `t` is the stance clock in seconds (only the Trickster moves). */
export function stancePose(stance: Stance, w: number, t: number): StancePose {
  if (stance === 'neutral' || w <= 0) return NO_STANCE;
  const f = FULL[stance], out = { ...NO_STANCE };
  for (const k of Object.keys(f) as (keyof StancePose)[]) out[k] = (f[k] ?? 0) * w;
  if (stance === 'trickster') { const s = Math.sin(t * 2 * Math.PI / 1.7), s2 = Math.sin(t * 2 * Math.PI / 0.9 + 1); out.sway = .05 * s * w; out.lean = .1 * s * w; out.headTilt = .12 * s2 * w; out.arm = (.3 + .08 * s2) * w; }
  return out;
}
