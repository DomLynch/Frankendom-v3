// V3 (V2 PR #48, src/client/sound.js keepAwake): iOS keeps Web Audio under the ringer's silent switch unless the page is also playing a
// media element. A looping clip of silence, started from the first touch, puts the page in "playback" like a game; V1's
// navigator.audioSession 'playback' (feedback.ts) covers Safari 17+, this covers the rest. Its size, rate and volume are data/sound.json keep.
type KeepRow = { samples: number; rate: number; volume: number };
export function createKeep(row: KeepRow) {
  let keep: HTMLAudioElement | undefined;
  function wav(): Blob {   // 8-bit mono PCM, every sample at the midpoint (silence)
    const bytes = new Uint8Array(44 + row.samples), view = new DataView(bytes.buffer);
    const tag = (at: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i)); };
    tag(0, 'RIFF'); view.setUint32(4, 36 + row.samples, true); tag(8, 'WAVEfmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, row.rate, true); view.setUint32(28, row.rate, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true); tag(36, 'data'); view.setUint32(40, row.samples, true);
    bytes.fill(128, 44);
    return new Blob([bytes], { type: 'audio/wav' });
  }
  return {
    // From a gesture: start it once, or restart it if the page paused it.
    play() {
      if (typeof Audio === 'undefined') return;
      if (!keep) { keep = new Audio(URL.createObjectURL(wav())); keep.loop = true; keep.volume = row.volume; keep.setAttribute('playsinline', ''); }
      if (keep.paused) keep.play().catch(() => {});
    },
    playing: () => !!keep && !keep.paused,
  };
}
