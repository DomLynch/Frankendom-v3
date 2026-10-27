// Which ?feel= modules a page runs when it names none (data/feel-defaults.json, Dom 2026-10-27: everything on the main URL, no flags to test). Pure and import-free, so the sim's
// driver (knock-sim.ts, src/client/main.ts) and the presentation registry (feel.ts) read the SAME answer, and Gate 0's tree (src/ alone, no main.ts) never sees a default.
export type FeelDefaultRows = {
  /** The query that lists modules (`?feel=a,b`). */
  query: string;
  /** `?feel=<off>`: none of the default modules (only the ones named beside it run). */
  off: string;
  /** The modules on without a query, in the order their hooks run. */
  modules: readonly string[];
  /** Per module, its own revert query: `?<revert.query>=<revert.value>` (?kick=v1) turns that module off, whatever else the page asks. */
  revert: Readonly<Record<string, { query: string; value: string }>>;
};

const words = (v: string | null): string[] => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** The module names this page runs: the defaults (unless `?feel=v1`) plus any named in `?feel=`, minus each module its own revert query turned off. With no rows: only the named ones (the old, opt-in grammar). */
export function feelsOn(rows: FeelDefaultRows | undefined, search: string): string[] {
  const q = new URLSearchParams(search), named = words(q.get(rows?.query ?? 'feel'));
  if (!rows) return named;
  const base = named.includes(rows.off) ? [] : rows.modules;
  return [...new Set([...base, ...named])].filter((n) => {
    const r = rows.revert[n];
    return n !== rows.off && !(r && q.get(r.query) === r.value);
  });
}
