// Content-hashed art URLs (2026-10-26: a phone kept the old warrior.glb, so the old hero clips, for a day after #19 went live, because art
// sat at fixed paths cached a day). scripts/build.mjs copies every art file the page loads to <name>.<sha256 8 hex>.<ext> beside it and
// writes the map (root path -> hashed path) over the placeholder below; nginx caches the hashed names for good. A changed file is a new
// URL; an unchanged one keeps its URL, and its cache, across deploys. Unbuilt (tests, a raw source serve) the map is empty: paths as given.
const parse = (map: string): Record<string, string> => (map.charAt(0) === '{' ? JSON.parse(map) : {});
const art = parse('__V3_ART_MANIFEST__');   // the build asserts this literal appears exactly once in main.js
export const artUrl = (path: string): string => art[path] ?? path;
