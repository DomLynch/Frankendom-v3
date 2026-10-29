// ?debug=1 counters for the specials' presentation (Dom 2026-10-19: specials must look and sound like specials on BOTH pages, and a script must be able to prove it).
// `window.__specials = { fx, cues }` and `#debug` data-special-fx / data-special-cues: fx = a special's effect actually spawned (the skill-impact flash, the shard burst, a special effect cast),
// cues = a special's sound actually handed to the audio engine (a specialSound row's cue, a boss/class special cue). Counted only where the real spawn / play happens, never faked.
// Off (no ?debug) the counter is null: every call below is one null check, nothing is allocated, nothing is written. Presentation only; no sim file.
type SpecialCounts = { fx: number; cues: number };
let counts: SpecialCounts | null = null, mirror: { dataset: DOMStringMap } | null = null;

export const specialCounting = (): boolean => counts !== null;

export function countSpecial(kind: keyof SpecialCounts, n = 1): void {
  if (!counts || !(n > 0)) return;
  counts[kind] += n;
  if (mirror) mirror.dataset[kind === 'fx' ? 'specialFx' : 'specialCues'] = String(counts[kind]);
}

