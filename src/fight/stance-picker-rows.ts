// The stance setting's labels, colours, icons, one-line effects, texts and button numbers as rows (Dom 2026-10-19: the stance is a character setting in the menu, not a fight-screen panel; "everything on the data layer").
// Presentation only: not a sim file, not in the record digest. stance-panel.ts reads these; the ids are the record's own pick ids (stance.ts PICKS).
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import DEFS from './stance-picker-defs.json' with { type: 'json' };
import MANIFEST from './stance-picker-defs.manifest.json' with { type: 'json' };

const PICK_TABLE = tableFromFile(MANIFEST.tables[0] as unknown as Manifest, DEFS, 'stance-picker-defs.json');
const DIAL_TABLE = tableFromFile(MANIFEST.tables[1] as unknown as Manifest, DEFS, 'stance-picker-defs.json');
const TEXT_TABLE = tableFromFile(MANIFEST.tables[2] as unknown as Manifest, DEFS, 'stance-picker-defs.json');
loadRegistry([PICK_TABLE, DIAL_TABLE, TEXT_TABLE]);

export type StancePickRow = { id: string; pick: string; order: number; label: string; colour: string; icon: string; effect: string };
export const STANCE_PICK_ROWS: readonly StancePickRow[] = [...(PICK_TABLE.rows as unknown as StancePickRow[])].sort((a, b) => a.order - b.order);
const DIALS = new Map((DIAL_TABLE.rows as unknown as { id: string; value: number }[]).map((r) => [r.id, r.value]));
export const stancePickerDial = (id: string): number => {
  const v = DIALS.get(id);
  if (v === undefined) throw Error(`stance-picker-defs: no stancePickerDial ${id}`);
  return v;
};
const TEXTS = new Map((TEXT_TABLE.rows as unknown as { id: string; text: string }[]).map((r) => [r.id, r.text]));
export const stanceMenuText = (id: string): string => {
  const v = TEXTS.get(id);
  if (v === undefined) throw Error(`stance-picker-defs: no stanceMenuText ${id}`);
  return v;
};
export const stancePickRow = (id: string): StancePickRow => {
  const row = STANCE_PICK_ROWS.find((r) => r.pick === id);   // the row id is `picker.<name>` (a row id of the record's own pick id would turn every 'neutral' literal in the sim files into a new content-id branch for the as-data gate)
  if (!row) throw Error(`stance-picker-defs: no stancePick ${id}`);
  return row;
};
