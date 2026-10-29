// The wall-clock bound on a warm-up gate (Lead/Auditor, 2026-10-08: EVERY reveal/compile gate has an explicit bound; Claudecraft's gates have a watchdog only). If `work` has not settled within
// `boundMs`, the gate resolves 'late' anyway so the caller reveals, and logs `warmup timeout <archetype> <ms>`; the caller still awaits `work` before starting the next one (one in flight).
// A late gate's work still has to settle before the next compile starts (one in flight), but that wait is bounded too: a compile that never settles must not leave every later kind a capsule for the session.
// Resolves true when `settled` finished inside `boundMs`; otherwise logs `warmup stuck <archetype> <ms>` and resolves false, and the caller reveals the remaining kinds ungated.
export async function settleWithin(archetype: string, settled: Promise<unknown>, boundMs: number, log: (line: string) => void = console.warn): Promise<boolean> {
  const t0 = Date.now(); let timer: ReturnType<typeof setTimeout> | undefined;
  const ok = await Promise.race([settled.then(() => true, () => true), new Promise<false>((r) => { timer = setTimeout(() => r(false), boundMs); })]); clearTimeout(timer);
  if (!ok) log(`warmup stuck ${archetype} ${Date.now() - t0}`);
  return ok;
}
