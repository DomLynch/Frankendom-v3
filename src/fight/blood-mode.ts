// The player's blood setting is a ROW (origins/arena/definitions.json bloodModes), read by flag and never by name: hidden = no blood is drawn or fired at all,
// dark = every blood colour takes its dark variant. A new setting is a row; a new effect of it is a new flag and code. An unknown id is an error, not a silent red.
import rows from '../../origins/arena/definitions.json' with { type: 'json' };

export type BloodMode = string;
export type BloodModeRow = { order: number; hidden?: boolean; dark?: boolean };
export const BLOOD_MODES = rows.bloodModes as Readonly<Record<string, BloodModeRow>>;
export const bloodModeRow = (mode: BloodMode): BloodModeRow => BLOOD_MODES[mode] ?? (() => { throw new Error(`unknown blood mode "${mode}" (origins/arena/definitions.json)`); })();
export const bloodHidden = (mode: BloodMode): boolean => !!bloodModeRow(mode).hidden;
export const bloodDark = (mode: BloodMode): boolean => !!bloodModeRow(mode).dark;
