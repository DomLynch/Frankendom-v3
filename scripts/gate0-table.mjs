// prints the Gate 0 replay-diff table as markdown (for PR bodies): node scripts/gate0-table.mjs
// Every (config, seed, script) row: V1 at the seed tag against V3's src/fight (test/gate0/harness.mjs). Exits 1 on any DIFF.
import { allRows, loadV1, loadV3 } from '../test/gate0/harness.mjs';
import { TAG } from '../test/gate0/extract.mjs';

const rows = allRows(await loadV1(), await loadV3());
console.log(`V1: tag \`${TAG}\` (src/fight, core/registry.ts, roster.ts) vs V3: this tree's src/fight. Hash = running sha256 of duel + ai + events, every tick (first 16 hex).\n`);
console.log('| config | seed | script | ticks | end | V1 hash | V3 hash | |\n|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  const ticks = r.ticks[0] === r.ticks[1] ? r.ticks[0] : `${r.ticks[0]} / ${r.ticks[1]}`, end = r.outcome[0] === r.outcome[1] ? r.outcome[0] : r.outcome.join(' / ');
  console.log(`| ${r.config} | ${r.seed} | ${r.script} | ${ticks} | ${end} | \`${r.hash[0]}\` | \`${r.hash[1]}\` | ${r.same ? 'same' : `**DIFF** tick ${r.diff.tick} \`${r.diff.path}\``} |`);
}
const diffs = rows.filter((r) => !r.same).length;
console.log(`\n${rows.length - diffs} of ${rows.length} rows same, ${rows.reduce((s, r) => s + r.ticks[0], 0)} ticks stepped per side.`);
process.exitCode = diffs ? 1 : 0;
