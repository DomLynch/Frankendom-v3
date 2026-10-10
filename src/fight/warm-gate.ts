// The wall-clock bound on a warm-up gate (Lead/Auditor, 2026-10-08: EVERY reveal/compile gate has an explicit bound; Claudecraft's gates have a watchdog only). If `work` has not settled within
// `boundMs`, the gate resolves 'late' anyway so the caller reveals, and logs `warmup timeout <archetype> <ms>`; the caller still awaits `work` before starting the next one (one in flight).
export type GateResult = 'ok' | 'failed' | 'late';
export async function gateWithBound(archetype: string, work: Promise<unknown>, boundMs: number, log: (line: string) => void = console.warn): Promise<{ result: GateResult; settled: Promise<unknown> }> {
  const t0 = Date.now(), done = work.then(() => 'ok' as const, (error: unknown) => { log(`warmup failed ${archetype} ${String(error).slice(0, 120)}`); return 'failed' as const; });
  let timer: ReturnType<typeof setTimeout> | undefined; const bound = new Promise<'late'>((r) => { timer = setTimeout(() => r('late'), boundMs); });
  const result = await Promise.race([done, bound]); clearTimeout(timer);
  if (result === 'late') log(`warmup timeout ${archetype} ${Date.now() - t0}`);
  return { result, settled: done };
}

// A late gate's work still has to settle before the next compile starts (one in flight), but that wait is bounded too: a compile that never settles must not leave every later kind a capsule for the session.
// Resolves true when `settled` finished inside `boundMs`; otherwise logs `warmup stuck <archetype> <ms>` and resolves false, and the caller reveals the remaining kinds ungated.
export async function settleWithin(archetype: string, settled: Promise<unknown>, boundMs: number, log: (line: string) => void = console.warn): Promise<boolean> {
  const t0 = Date.now(); let timer: ReturnType<typeof setTimeout> | undefined;
  const ok = await Promise.race([settled.then(() => true, () => true), new Promise<false>((r) => { timer = setTimeout(() => r(false), boundMs); })]); clearTimeout(timer);
  if (!ok) log(`warmup stuck ${archetype} ${Date.now() - t0}`);
  return ok;
}
