// The `?gfx=1` look flag (gfx-lift.ts). Its own tiny file so the page can ask without pulling the post-processing code in: off = the page is exactly as before and that chunk is never fetched.
// On by default since 2026-10-20 (Dom: the better graphics go on for everyone; the default is the `gfx.default` row in fx-rows.json, handed in by the page). `?gfx=0` opts out, `?gfx=1` forces it on.
export const gfxOn = (search: string, byDefault = false): boolean => /[?&;]gfx=1\b/.test(search) || (byDefault && !/[?&;]gfx=0\b/.test(search));
