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
// Fetch and decode the first format that works; null when none does, and the caller keeps its fallback.
export async function loadSprite(context: BaseAudioContext, formats = spriteFormats(), fetchImpl: typeof fetch = (...args) => fetch(...args)): Promise<AudioBuffer | null> {
  for (const format of formats) {
    try {
      const response = await fetchImpl(SPRITE_URLS[format]);
      if (!response.ok) continue;
      return await context.decodeAudioData(await response.arrayBuffer());
    } catch { /* try the next format */ }
  }
  return null;
}
