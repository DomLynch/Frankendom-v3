// ?debug=1 counters for the specials' presentation (Dom 2026-10-19: specials must look and sound like specials on BOTH pages, and a script must be able to prove it).
// `window.__specials = { fx, cues }` and `#debug` data-special-fx / data-special-cues: fx = a special's effect actually spawned (the skill-impact flash, the shard burst, a special effect cast),
// cues = a special's sound actually handed to the audio engine (a specialSound row's cue, a boss/class special cue). Counted only where the real spawn / play happens, never faked.
// Off (no ?debug) the counter is null: every call below is one null check, nothing is allocated, nothing is written. Presentation only; no sim file.
export type SpecialCounts = { fx: number; cues: number };
let counts: SpecialCounts | null = null, mirror: { dataset: DOMStringMap } | null = null;

export const specialDebugWanted = (search: string): boolean => /[?&]debug\b/.test(search);

/** Turn the counter on for a page that asked for ?debug. Returns it (also published as `host.__specials`), or null when debug is off. `el`: the #debug element, mirrored as data attributes. */
export function enableSpecialCounter(search: string, host: object = globalThis, el: { dataset: DOMStringMap } | null = null): SpecialCounts | null {
  if (!specialDebugWanted(search)) return null;
  counts ??= { fx: 0, cues: 0 };
  (host as { __specials?: SpecialCounts }).__specials = counts;
  mirror = el; if (mirror) { mirror.dataset.specialFx = String(counts.fx); mirror.dataset.specialCues = String(counts.cues); }
  return counts;
}

export const specialCounting = (): boolean => counts !== null;

export function countSpecial(kind: keyof SpecialCounts, n = 1): void {
  if (!counts || !(n > 0)) return;
  counts[kind] += n;
  if (mirror) mirror.dataset[kind === 'fx' ? 'specialFx' : 'specialCues'] = String(counts[kind]);
}

/** Tests only: drop the counter back to the debug-off state. */
export function resetSpecialCounter(host: object = globalThis): void { counts = null; mirror = null; delete (host as { __specials?: SpecialCounts }).__specials; }
