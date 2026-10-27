// The M7 fight-feel modules (src/fight/feel.ts). They are NOT imported here: each lives in the feel chunk (feel-chunk.ts), loaded on demand. A module's PR adds ONE name to FEEL_NAMES and
// ONE export line to feel-chunk.ts (`export { feelHooks as <name> } from './feel-<name>.ts';`), and exports `feelHooks` from its own file instead of calling registerFeel.
import type { FeelHooks } from './feel.ts';

/** The ?feel= names that have a module in the chunk (main.js knows only these names, never the code). */
export const FEEL_NAMES: readonly string[] = ['clash', 'kick'];
/** Fetch the feel chunk (a separate module scripts/build.mjs writes); resolves to the hooks by ?feel= name. */
export const loadFeelChunk = (): Promise<Record<string, FeelHooks>> => import('./feel-chunk.ts') as Promise<Record<string, FeelHooks>>;
