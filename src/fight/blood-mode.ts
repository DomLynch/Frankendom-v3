// The player's blood setting is a ROW (src/fight/arena-defs.json bloodModes), read by flag and never by name: hidden = no blood is drawn or fired at all,
// dark = every blood colour takes its dark variant. A new setting is a row; a new effect of it is a new flag and code. An unknown id is an error, not a silent red.
import rows from './arena-defs.json' with { type: 'json' };

export type BloodMode = string;
export type BloodModeRow = { order: number; hidden?: boolean; dark?: boolean };
export const BLOOD_MODES = rows.bloodModes as Readonly<Record<string, BloodModeRow>>;
export const bloodModeRow = (mode: BloodMode): BloodModeRow => BLOOD_MODES[mode] ?? (() => { throw new Error(`unknown blood mode "${mode}" (src/fight/arena-defs.json)`); })();
export const bloodHidden = (mode: BloodMode): boolean => !!bloodModeRow(mode).hidden;
export const bloodDark = (mode: BloodMode): boolean => !!bloodModeRow(mode).dark;
