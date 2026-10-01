// Cues for the Centurion's rank 8-10 specials (scripts/build-special-audio.mjs): the charge's hooves, the quake's sand thud, the tithe's crowd swell.
// Each is its own small file because the sprite and the arena bank have no headroom. They play through the gate's player: same fade-out on a skipped beat.
import { fetchAsset, nextTask, pageUnloading, spriteFormats, type Format } from './sprite.ts';
import { playGate } from './gate.ts';
export const SPECIAL_CUES = ['charge', 'quake', 'tithe'] as const;
export type SpecialCue = typeof SPECIAL_CUES[number];
const URLS: Record<SpecialCue, Record<Format, string>> = {
  charge: { opus: new URL('../assets/special-audio/charge.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/charge.m4a', import.meta.url).href },
  quake: { opus: new URL('../assets/special-audio/quake.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/quake.m4a', import.meta.url).href },
  tithe: { opus: new URL('../assets/special-audio/tithe.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/tithe.m4a', import.meta.url).href },
};
// Fetch and decode the first format that works; null when none does (or the page is leaving), and the special plays in silence.
export async function loadSpecial(cue: SpecialCue, context: BaseAudioContext, formats: Format[] = spriteFormats(), fetcher: typeof fetch = fetchAsset, leaving = pageUnloading): Promise<AudioBuffer | null> {
  for (const [attempt, format] of formats.entries()) {
    if (attempt) await nextTask();
    if (leaving()) break;   // never start the other codec while the page unloads (see sprite.ts)
    try { const response = await fetcher(URLS[cue][format]); if (response.ok) return await context.decodeAudioData(await response.arrayBuffer()); }
    catch { /* try the other codec, then leave the special silent */ }
  }
  return null;
}
// playSpecial(context, buffer, destination, gain = 1, delay = 0) → { duration, stop() }; the buffer's own length is the beat.
export const playSpecial = playGate;
