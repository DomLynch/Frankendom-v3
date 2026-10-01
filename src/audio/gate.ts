// The arena gate's winch (scripts/build-gate-audio.mjs): ~5 s of chain and drawbridge lift, in its own small file because the sprite
// and the arena bank have no headroom. Web decides when it plays; a skipped beat calls stop(), which goes out on a short fade.
import { fetchAsset, nextTask, pageUnloading, spriteFormats, type Format } from './sprite.ts';
const URLS: Record<Format, string> = {
  opus: new URL('../assets/gate-audio/gate.ogg', import.meta.url).href,
  aac: new URL('../assets/gate-audio/gate.m4a', import.meta.url).href,
};
export const GATE_CUT = .06;   // seconds: long enough that a skip never clicks, short enough to read as "cut"
// Fetch and decode the first format that works; null when none does (or the page is leaving), and the gate opens in silence.
export async function loadGate(context: BaseAudioContext, formats: Format[] = spriteFormats(), fetcher: typeof fetch = fetchAsset, leaving = pageUnloading): Promise<AudioBuffer | null> {
  for (const [attempt, format] of formats.entries()) {
    if (attempt) await nextTask();
    if (leaving()) break;   // never start the other codec while the page unloads (see sprite.ts)
    try { const response = await fetcher(URLS[format]); if (response.ok) return await context.decodeAudioData(await response.arrayBuffer()); }
    catch { /* try the other codec, then leave the beat silent */ }
  }
  return null;
}
// Start the winch now (or after `delay` seconds) at `gain`; the buffer's own length is the beat. stop() is safe to call twice.
export function playGate(context: BaseAudioContext, buffer: AudioBuffer, destination: AudioNode, gain = 1, delay = 0) {
  const time = context.currentTime + delay, source = context.createBufferSource(), envelope = context.createGain();
  source.buffer = buffer; source.connect(envelope); envelope.connect(destination); envelope.gain.value = gain;
  source.onended = () => { source.disconnect(); envelope.disconnect(); };
  source.start(time);
  let stopped = false;
  return {
    duration: buffer.duration,
    stop() {
      if (stopped) return; stopped = true;
      // Not started yet: silence it outright and cancel it at its start time; a fade would still play a tick of the winch.
      if (context.currentTime < time) { envelope.gain.value = 0; try { source.stop(time); } catch { /* ended */ } return; }
      const at = context.currentTime;
      envelope.gain.cancelScheduledValues(at); envelope.gain.setValueAtTime(gain, at); envelope.gain.linearRampToValueAtTime(0, at + GATE_CUT);
      try { source.stop(at + GATE_CUT + .01); } catch { /* ended */ }
    },
  };
}
