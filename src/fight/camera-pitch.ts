// The zone follow camera's pitch (data/fight.json camera.pitch). Presentation only: it moves the eye and the look height, never the sim.
// The default pitch is OFF: the lock camera is exactly as it was. A named preset (or ?pitch=<degrees>) flattens the view axis so a phone shows a
// band of horizon/skyline under the HUD; the eye height follows so the hero stays at the same screen position (clear of the buttons).
export type PitchRows = {
  about?: string;
  default: string;   // the preset a page load uses: 'off' = the camera as it was
  presets: Readonly<Record<string, number>>;   // name -> view axis pitch in degrees (how far the axis looks down)
  limits: readonly number[];   // degrees; also bounds ?pitch=<number>
  heroY: number;   // m: the height on the hero the screen position is kept at (his chest)
  minEyeY: number;   // m: the eye never drops below this
  portrait?: { preset: string; belowAspect: number };   // the preset a screen narrower than belowAspect (a portrait phone) gets when the link asks for nothing; landscape keeps `default`
  off: readonly string[];   // query values that mean 'the camera as it was'
  query: string;
};

/** The pitch (degrees) for this page: the `?pitch=` query when it is a preset name, an off word or a number inside the limits, else the row's default. null = the camera as it was. */
export const pitchChoice = (rows: PitchRows, search: string): number | null => {
  const q = new URLSearchParams(search).get(rows.query)?.trim().toLowerCase() ?? '';
  const pick = (v: string): number | null | undefined => {
    if (rows.off.includes(v)) return null;
    if (Object.hasOwn(rows.presets, v)) return rows.presets[v]!;
    const n = v === '' ? NaN : Number(v);
    return Number.isFinite(n) && n >= rows.limits[0] && n <= rows.limits[1] ? n : undefined;
  };
  const asked = pick(q);   // null = asked for 'off' (stays off, even when the row's default is a preset); undefined = nothing usable asked
  return asked !== undefined ? asked : (pick(rows.default) ?? null);
};

/** The portrait pitch: the row's `portrait` preset (degrees) and the aspect below which it applies, or null when the row has none or the link asked for anything usable (?pitch=off = the camera as it was, on a phone too). */
export const portraitPitch = (rows: PitchRows, search: string): { degrees: number; belowAspect: number } | null => {
  const p = rows.portrait, q = new URLSearchParams(search).get(rows.query)?.trim().toLowerCase() ?? '';
  if (!p || !Object.hasOwn(rows.presets, p.preset)) return null;
  if (rows.off.includes(q) || Object.hasOwn(rows.presets, q) || (q !== '' && Number.isFinite(Number(q)) && Number(q) >= rows.limits[0] && Number(q) <= rows.limits[1])) return null;
  return { degrees: rows.presets[p.preset]!, belowAspect: p.belowAspect };
};

export type Pose ={ x: number; y: number; z: number };
/**
 * Re-pitch a lock pose: the view axis looks `degrees` down, and the eye height is set so the hero's `heroY` point sits at the same angle from the axis
 * as it did in the pose given (so his place on the screen is unchanged). Horizontal positions are untouched, so the framing of hero and boss (and the
 * multi-boss widen) holds; only the height of the eye and of the look point change. Returns the new eye y and look y.
 */
export const repitch = (eye: Pose, look: Pose, hero: { x: number; z: number }, degrees: number, rows: Pick<PitchRows, 'heroY' | 'minEyeY'>): { eyeY: number; lookY: number } => {
  const toLook = Math.hypot(look.x - eye.x, look.z - eye.z), toHero = Math.hypot(hero.x - eye.x, hero.z - eye.z);
  if (toLook < 1e-6 || toHero < 1e-6) return { eyeY: eye.y, lookY: look.y };
  const axis0 = Math.atan2(eye.y - look.y, toLook), hero0 = Math.atan2(eye.y - rows.heroY, toHero);
  const axis = (degrees * Math.PI) / 180, below = hero0 - axis0;   // how far under the axis his chest was
  const eyeY = Math.max(rows.minEyeY, rows.heroY + toHero * Math.tan(axis + below));
  return { eyeY, lookY: eyeY - toLook * Math.tan(axis) };
};
