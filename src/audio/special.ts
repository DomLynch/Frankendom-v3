// Cues for the boss specials (scripts/build-special-audio.mjs). Centurion: the charge's hooves, the quake's sand thud, the tithe's crowd swell.
// Nightborn: Set's red wind, Hades' shadow, Nyx's nightfall. Goblin: fistful, gone, liars. Pitborn: cracking, ashfall, windwall; they start with the cast and their payoff sits on the strike (1.983 s).
// Each is its own small file because the sprite and the arena bank have no headroom. They play through the gate's player: same fade-out on a skipped beat.
import { fetchAsset, nextTask, pageUnloading, spriteFormats, type Format } from './sprite.ts';
import { playGate } from './gate.ts';
export const SPECIAL_CUES = ['charge', 'quake', 'tithe', 'redwind', 'hades', 'nyx', 'fistful', 'gone', 'liars', 'cracking', 'ashfall', 'windwall'] as const;
export type SpecialCue = typeof SPECIAL_CUES[number];
const URLS: Record<SpecialCue, Record<Format, string>> = {
  charge: { opus: new URL('../assets/special-audio/charge.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/charge.m4a', import.meta.url).href },
  quake: { opus: new URL('../assets/special-audio/quake.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/quake.m4a', import.meta.url).href },
  tithe: { opus: new URL('../assets/special-audio/tithe.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/tithe.m4a', import.meta.url).href },
  redwind: { opus: new URL('../assets/special-audio/redwind.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/redwind.m4a', import.meta.url).href },
  hades: { opus: new URL('../assets/special-audio/hades.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/hades.m4a', import.meta.url).href },
  nyx: { opus: new URL('../assets/special-audio/nyx.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/nyx.m4a', import.meta.url).href },
  fistful: { opus: new URL('../assets/special-audio/fistful.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/fistful.m4a', import.meta.url).href },
  gone: { opus: new URL('../assets/special-audio/gone.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/gone.m4a', import.meta.url).href },
  liars: { opus: new URL('../assets/special-audio/liars.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/liars.m4a', import.meta.url).href },
  cracking: { opus: new URL('../assets/special-audio/cracking.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/cracking.m4a', import.meta.url).href },
  ashfall: { opus: new URL('../assets/special-audio/ashfall.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/ashfall.m4a', import.meta.url).href },
  windwall: { opus: new URL('../assets/special-audio/windwall.ogg', import.meta.url).href, aac: new URL('../assets/special-audio/windwall.m4a', import.meta.url).href },
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
