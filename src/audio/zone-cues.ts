// Which sounds the live zone plays (data/sound.json `zone`; Dom 2026-10-27: "I still see an instant fight scene, like a ding, which means it's not MMO free flow real time").
// An engagement or a kill in the zone is not a new bout, so the beats that read as a scene change are rows: each gateable cue id -> 'on' | 'off' | 'once'.
// Pure: the page hands the gate to the sound (src/fight/sound/feedback.ts); no gate (the single fight, ?postkill=v1) means every cue plays, exactly as before.
export type CueMode = 'on' | 'off' | 'once';
export type ZoneSoundRows = { cues: Readonly<Record<string, CueMode>>; toastSeconds: number };
export type CueGate = {
  /** Whether cue `name` plays now. A cue with no row always plays; 'once' answers true the first time it is asked and false after, for the life of this gate (the page visit). */
  allow(name: string): boolean;
};

/** The gate for the zone's rows; null (every cue plays) when there is no zone. */
export function zoneCueGate(rows: ZoneSoundRows | null): CueGate | null {
  if (!rows) return null;
  const spent = new Set<string>();
  return {
    allow(name) {
      const mode = rows.cues[name];
      if (mode === undefined || mode === 'on') return true;
      if (mode === 'off') return false;
      if (spent.has(name)) return false;
      spent.add(name);
      return true;
    },
  };
}

/** Whether the zone's kill toast has shown long enough (the foe fell, the hero stands, `age` seconds after the kill). No zone rows: never over. */
export const toastOver = (rows: ZoneSoundRows | null, age: number): boolean => !!rows && age >= rows.toastSeconds;
