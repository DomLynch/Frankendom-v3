// Hit stop as DATA (src/fight/hit-stop-defs.json, one row per kind of contact; Combat, top-30 item 10). The pause a contact holds is PRESENTATION: main.ts pauses the picture for the stop length (hit-stop-rules.json, `ms` by event type) plus `frames` at 60 Hz
// while every sim tick still runs in order, and a live duel holds only what is drawn (pvp-hold.ts). The SIM never reads these rows (timing is sacred: a stop that moved a tick would move every window and
// every net cadence), so this file is outside SIM_FILES and no RECORD_VERSION or digest moves with an edit. `knock` / `push` / `drop` are the camera's jolt (hit-impact.ts), metres.
import rows from './hit-stop-defs.json' with { type: 'json' };

export type ContactId = 'hitLight' | 'hitHeavy' | 'blockLight' | 'blockHeavy' | 'parry' | 'guardBreak' | 'special' | 'postureBreak' | 'kill' | 'kick';
export type ContactRow = { order: number; frames: number; knock: number; push: number; drop?: number };
export const CONTACTS = rows.contacts as Readonly<Record<ContactId, ContactRow>>;
