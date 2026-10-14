// Hit stop as DATA (src/fight/hit-stop-defs.json, one row per kind of contact; Combat, top-30 item 10). The pause a contact holds is PRESENTATION: main.ts pauses the picture for the stop length (hit-stop-rules.json, `ms` by event type) plus `frames` at 60 Hz
// while every sim tick still runs in order, and a live duel holds only what is drawn (pvp-hold.ts). The SIM never reads these rows (timing is sacred: a stop that moved a tick would move every window and
// every net cadence), so this file is outside SIM_FILES and no RECORD_VERSION or digest moves with an edit. `knock` / `push` / `drop` are the camera's jolt (hit-impact.ts), metres.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import DEFS from './hit-stop-defs.json' with { type: 'json' };
import MANIFEST from './hit-stop-defs.manifest.json' with { type: 'json' };

export type ContactId = 'hitLight' | 'hitHeavy' | 'blockLight' | 'blockHeavy' | 'parry' | 'guardBreak' | 'special' | 'postureBreak' | 'kill' | 'kick';
export type ContactRow = { order: number; frames: number; knock: number; push: number; drop?: number };
const TABLE = tableFromFile(MANIFEST.tables[0] as unknown as Manifest, DEFS, 'hit-stop-defs.json');
const FEEL = tableFromFile(MANIFEST.tables[1] as unknown as Manifest, DEFS, 'hit-stop-defs.json');
loadRegistry([TABLE, FEEL]);
export const CONTACTS = Object.fromEntries((TABLE.rows as unknown as ({ id: string } & ContactRow)[]).map(({ id, ...row }) => [id, row])) as Readonly<Record<ContactId, ContactRow>>;
export const KICK_DROP: number = CONTACTS.kick?.drop ?? (() => { throw Error('hit-stop-defs: the kick row needs a drop (the camera jolt)'); })();   // the one row that carries it, so the manifest cannot require it of all
/** Seconds the camera's knock takes to settle back (hit-impact.ts): the `feel` row. */
export const KNOCK_SETTLE: number = (FEEL.rows as unknown as { id: string; value: number }[]).find((r) => r.id === 'knockSettle')?.value ?? (() => { throw Error('hit-stop-defs: no knockSettle feel row'); })();
