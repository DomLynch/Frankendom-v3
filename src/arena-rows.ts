// The arena vocabularies that are DATA (src/fight/arena-defs.json, loaded and checked by the registry loader): weather kinds, floors and foot-dust tones. Pure data, no three.js
// and no other imports, so the foot dust and the texture worker can read it without pulling the theme list.
import rows from './fight/arena-defs.json' with { type: 'json' };

// What each kind does is a ROW (src/fight/arena-defs.json, loaded by the registry loader): flags the cloud reads, never a name. A new weather
// is a row; a new MOTION is a new flag and code. falls: spawned through the whole 8 m and drops (6 m/s); rises: climbs from the pit floor and weaves;
// streaks: drawn as the thin rain quads, not Points; low: hangs near the floor; radius: spawn radius (m) instead of the near/far ring;
// phoneCount: the count on a phone tier. Neither falls nor rises = the slow drift (ash, dust).
export type WeatherRow = { order: number; falls?: boolean; rises?: boolean; streaks?: boolean; low?: boolean; radius?: number; phoneCount?: number };
export const WEATHER_ROWS = rows.weather as Readonly<Record<string, WeatherRow>>;
export const weatherRow = (kind: string): WeatherRow => WEATHER_ROWS[kind] ?? (() => { throw new Error(`unknown weather "${kind}" (src/fight/arena-defs.json)`); })();
// Floors and the foot dust they kick are rows too: a floor row names the dust tone it kicks dry (dust) and wet (wetDust), a dust tone row is its colour and opacity.
// The floor GENERATORS (sand / flag / clay in assets/arena/textures.ts) stay code: a new floor needs a generator, then its row.
export type FloorRow = { order: number; dust: string; wetDust: string };
export type DustToneRow = { order: number; color: string; opacity: number };
export const FLOOR_ROWS = rows.floors as Readonly<Record<string, FloorRow>>;
export const DUST_TONES = rows.dustTones as Readonly<Record<string, DustToneRow>>;
// A floor patch (the world-space mask over the pit): `water` = standing water, the floor shader drops its roughness there. The patch GENERATORS (textures.ts patchPixels) stay code, one per row.
export type PatchRow = { order: number; water?: boolean };
export const PATCH_ROWS = rows.patches as Readonly<Record<string, PatchRow>>;
export const patchRow = (kind: string): PatchRow => PATCH_ROWS[kind] ?? (() => { throw new Error(`unknown floor patch "${kind}" (src/fight/arena-defs.json)`); })();
