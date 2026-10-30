// Which sounds the live zone plays (data/sound.json `zone`; Dom 2026-10-27: "I still see an instant fight scene, like a ding, which means it's not MMO free flow real time").
// An engagement or a kill in the zone is not a new bout, so the beats that read as a scene change are rows: each gateable cue id -> 'on' | 'off' | 'once'.
// Pure: the page hands the gate to the sound (src/fight/sound/feedback.ts); no gate (the single fight, ?postkill=v1) means every cue plays, exactly as before.
import { checkSoundZone } from '../sim/validate.js';

type CueMode = 'on' | 'off' | 'once';
export type ZoneSoundRows = { cues: Readonly<Record<string, CueMode>>; toastSeconds: number };
export type CueGate = {
  /** Whether cue `name` plays now, spending a 'once' cue's token (for a cue that surely sounds: a one-shot from the cue list). */
  allow(name: string): boolean;
  /** Whether cue `name` may play now, without spending anything (the bell asks first, and spends only when the arena really rang it). */
  peek(name: string): boolean;
  /** Spends a 'once' cue's token: it never plays again for the life of this gate (the page visit). */
  spend(name: string): void;
};

/** The zone's rows, checked at load (the shipped file is checked in CI too): throws on a missing or bad row, so a typo never silently leaves a toast that never clears. */
export function zoneSoundRows(raw: unknown): ZoneSoundRows {
  const errors = checkSoundZone(raw);
  if (errors.length) throw new Error(`sound.json zone: ${errors.join('; ')}`);
  return raw as ZoneSoundRows;
}

/** The gate for the zone's rows; null (every cue plays) when there is no zone. */
export function zoneCueGate(rows: ZoneSoundRows | null): CueGate | null {
  if (!rows) return null;
  const spent = new Set<string>();
  const peek = (name: string): boolean => {
    const mode = rows.cues[name];
    return mode === undefined || mode === 'on' || (mode === 'once' && !spent.has(name));
  };
  const spend = (name: string): void => { if (rows.cues[name] === 'once') spent.add(name); };
  return { peek, spend, allow(name) { const ok = peek(name); if (ok) spend(name); return ok; } };
}

/** Whether the zone's kill toast has shown long enough (the foe fell, the hero stands, `age` seconds after the kill). No zone rows: never over. */
export const toastOver = (rows: ZoneSoundRows | null, age: number): boolean => !!rows && age >= rows.toastSeconds;
