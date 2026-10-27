// The stub boundary's forbidden targets (scripts/check-stubs.mjs; test/zone-client.test.mjs pins them). A target is a repo-relative path with no extension forced: `src/zones` (a bare folder import) counts.
// src/zones/ (plural) and src/zone.ts / src/zone-*.ts are V1's dropped zone system. src/zone/ (singular folder) is V3's OWN live-zone code (spawns, zone rows, shared hp): its files and the chunk that
// imports them may import each other, so only the plural folder and the singular-with-a-dot-or-dash names stay forbidden.
export const FORBIDDEN = [/^src\/core\/(?!registry\.ts$)/, /^src\/net\//, /^src\/zones(?:[/.-]|$)/, /^src\/zone[.-]/, /^src\/legends?[/.-]/, /^src\/pit\//];
export const forbidden = (target) => FORBIDDEN.some((re) => re.test(target));
