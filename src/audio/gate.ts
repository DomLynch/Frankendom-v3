// The one-shot buffer player the special and duel cues share (audio/special.ts, audio/duel.ts): starts a decoded buffer now or after a
// delay; a skipped beat calls stop(), which goes out on a short fade. (Its first user, the Pit gate's winch, was removed with the Pit room.)
export const GATE_CUT = .06;   // seconds: long enough that a skip never clicks, short enough to read as "cut"
// Start the buffer now (or after `delay` seconds) at `gain`; the buffer's own length is the beat. stop() is safe to call twice.
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
