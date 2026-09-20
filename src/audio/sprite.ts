// Audio sprite loading: one file per format, picked by what the browser says it can play, decoded on the given context.
// Safari plays AAC and not Ogg/Opus; Chrome and Android play both, and Opus is the smaller file.
export type Format = 'opus' | 'aac';
export const SPRITE_URLS: Record<Format, string> = {
  opus: new URL('../assets/audio/sprite.ogg', import.meta.url).href,
  aac: new URL('../assets/audio/sprite.m4a', import.meta.url).href,
};
export function spriteFormats(canPlay: (type: string) => string = type => typeof Audio === 'undefined' ? '' : new Audio().canPlayType(type)): Format[] {
  const opus = canPlay('audio/ogg; codecs="opus"'), aac = canPlay('audio/mp4; codecs="mp4a.40.2"');
  if (opus === 'probably') return ['opus', 'aac'];
  if (!opus && !aac) return ['aac', 'opus'];   // no answer (older WebKit): AAC is the safe first try
  return aac ? ['aac', 'opus'] : ['opus', 'aac'];
}
// Asset fetches die with the page: never retried once the document is leaving, and aborted on pagehide. Navigating away
// cancels a pending fetch or decode, whose catch would otherwise start the codec fallback during teardown — WebKit refuses that
// load ("access control checks") and delivers the rejection after the realm is gone, an unhandled page error no catch can reach.
// The flag rises on beforeunload (the cancel can precede pagehide), and a retry first yields a macrotask: timers are dropped
// with the document where microtasks are not, so a retry that would land in teardown simply never runs.
let unloading = false, aborter = typeof AbortController === 'undefined' ? undefined : new AbortController();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => { unloading = true; });
  window.addEventListener('pagehide', () => { unloading = true; aborter?.abort(); });
  window.addEventListener('pageshow', () => { unloading = false; aborter = new AbortController(); });   // back/forward-cache restore
}
export const pageUnloading = (): boolean => unloading;
export const fetchAsset: typeof fetch = (input, init) => fetch(input, { ...init, signal: aborter?.signal });
export const nextTask = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
// Fetch and decode the first format that works; null when none does (or the page is leaving), and the caller keeps its fallback.
export async function loadSprite(context: BaseAudioContext, formats = spriteFormats(), fetchImpl: typeof fetch = fetchAsset, leaving = pageUnloading): Promise<AudioBuffer | null> {
  for (const [attempt, format] of formats.entries()) {
    if (attempt) await nextTask();
    if (leaving()) break;
    try {
      const response = await fetchImpl(SPRITE_URLS[format]);
      if (!response.ok) continue;
      return await context.decodeAudioData(await response.arrayBuffer());
    } catch { /* try the next format */ }
  }
  return null;
}
