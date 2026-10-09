// Cues for the duel lobby (scripts/build-duel-audio.mjs): an opponent joining, the 3-2-1 tick and GO, the win and loss stings. Each is its own small file because the sprite
// and the arena bank have no headroom. They play through the gate's player; the Duel lane decides when (feedback.wantDuel / feedback.duel, hooked to the lobby's callbacks).
import { fetchAsset, loadFirst, pageUnloading, spriteFormats, type Format } from '../../audio/sprite.ts';
import { playGate } from '../../audio/gate.ts';
export const DUEL_CUES = ['joined', 'tick', 'go', 'win', 'loss'] as const;
export type DuelCue = typeof DUEL_CUES[number];
const URLS = Object.fromEntries(DUEL_CUES.map((cue) => [cue, { opus: new URL(`../assets/duel-audio/${cue}.ogg`, import.meta.url).href, aac: new URL(`../assets/duel-audio/${cue}.m4a`, import.meta.url).href }])) as Record<DuelCue, Record<Format, string>>;
// Fetch and decode the first format that works; null when none does (or the page is leaving), and the lobby plays in silence.
export async function loadDuel(cue: DuelCue, context: BaseAudioContext, formats: Format[] = spriteFormats(), fetcher: typeof fetch = fetchAsset, leaving = pageUnloading): Promise<AudioBuffer | null> {
  return loadFirst(URLS[cue], context, formats, fetcher, leaving);
}
export const playDuel = playGate;
