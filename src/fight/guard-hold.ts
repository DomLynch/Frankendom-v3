// V3: a one-shot guard clip held as a guard (data/hero-clips.json, the Guard row's `hold`: Dom's pick 2026-10-26, Great Sword Blocking).
// Presentation only: no sim file reads it, and a guard never sweeps a blade. No three.js, so the tests can call it.
export type GuardHold = { raise: number; sway: number; period: number; knock: number };
// Where the held guard's clip plays (seconds), `clock` seconds after the guard went up: the whole clip into the block over `raise`, then the
// block held, swaying `sway` seconds back into the clip's settle once every `period`. A blocked hit (`impact`, 0-1 through the block
// reaction) knocks it back `knock` seconds of clip and re-sets it. Never past `end` (the mixer's last-key clamp, CLIP_END_MAX x duration).
export function guardClipTime(hold: GuardHold, duration: number, end: number, clock: number, impact: number | null = null): number {
  const raised = Math.min(1, clock / Math.max(1e-6, hold.raise)), held = Math.max(0, clock - hold.raise);
  const sway = hold.sway * (1 - Math.cos(2 * Math.PI * held / hold.period)) / 2, knock = impact === null ? 0 : hold.knock * Math.sin(Math.PI * Math.min(1, Math.max(0, impact)));
  return Math.max(0, Math.min(end, raised * duration - sway - knock));
}
