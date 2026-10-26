// V3: clip-to-clip blends in milliseconds (data/fight.json `blendMs` and `settleMs`, V2 #70's rows from Frankendom-v2 data/anim.json and
// src/client/render.js combatOf). V1 (characters.ts) fades a combat clip in over its first 1/12 and out over its last 1/10 of the move,
// whatever the move's length, and eases every clip weight at 24/s. With the rows on, a combat clip's weight rises over `<kind>In` ms after
// its move starts and falls over `<kind>Out` ms before it ends (a roll over settleMs.roll, the one row above V2's 150 ms cap), and every
// weight eases so it closes ~95% of its gap in `locomotion` ms. Set by the page before the rigs are built; null (?blend=v1) = V1's exactly.
// Presentation only: it reads the sim's ticks, never writes them.

export type BlendKind = 'attack' | 'special' | 'hurt' | 'roll';
/** Where a pose is in its move, in sim ticks (combat.ts actorPose): honoured only while the body shows this `pose` at this `progress`. */
export type BlendSpan = { pose: string; progress: number; kind: BlendKind; age: number; left: number };
type Rows = { locomotion: number } & Record<`${BlendKind}${'In' | 'Out'}`, number>;

const TICK_MS = 1000 / 60;   // the sim's 60 Hz
const WEIGHT_RATE_V1 = 24;   // V1 characters.ts: every clip weight eases at 24/s
let rows: Rows | null = null, settle: Partial<Record<BlendKind, number>> = {};

export const setBlend = (blendMs: Partial<Record<string, number | string>> | null, settleMs?: Partial<Record<string, number | string>> | null): void => {
  const nums = (o: Partial<Record<string, number | string>> | null | undefined) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => typeof v === 'number')) as Record<string, number>;
  rows = blendMs ? nums(blendMs) as Rows : null;
  settle = blendMs ? nums(settleMs) : {};
};
export const blendOn = (): boolean => rows !== null;

/** The eased-weight step for `step` seconds: V1's 24/s, or the locomotion row's (3000 / ms closes ~95% of a gap in that time). */
export const weightEase = (step: number): number => 1 - Math.exp(-step * (rows ? 3000 / rows.locomotion : WEIGHT_RATE_V1));

/** The combat clip's target weight. V1: in over 1/12 of the move, out over its last 1/10 (none for a death). With the rows: in over
 *  `<kind>In` ms from the start, out over `<kind>Out` (or settleMs.<kind>) ms before the end. A span that does not match the pose shown
 *  (a presentation wrapper restaged it) falls back to V1's. */
export const combatFade = (pose: string, progress: number, dead: boolean, span?: BlendSpan | null): number => {
  if (!rows || !span || dead || span.pose !== pose || span.progress !== progress) return Math.min(1, progress * 12, dead ? 1 : (1 - progress) * 10);
  return Math.min(1, (span.age * TICK_MS) / rows[`${span.kind}In`], (span.left * TICK_MS) / (settle[span.kind] ?? rows[`${span.kind}Out`]));
};
