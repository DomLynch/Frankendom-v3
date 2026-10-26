// Gate 0, V3-only rows (test/gate0/v3-scripts): inputs V1 never had (the directional heavies), so there is no V1 reference. Each row runs this tree's sim against a
// second, independent copy of it (determinism) and is pinned in test/gate0/v3-golden.json, so a later PR cannot drift them silently.
//   node scripts/gate0-v3-golden.mjs           prints the table (markdown), exits 1 on a determinism DIFF or a row off its pinned hash
//   node scripts/gate0-v3-golden.mjs --write   re-pins v3-golden.json (only for a deliberate change to these moves; say why in the PR)
import { existsSync, writeFileSync } from 'node:fs';
import { CONFIGS, V3_GOLDEN, V3_SCRIPTS, loadV3, loadV3Copy, readV3Golden, startedMoves, v3Rows } from '../test/gate0/harness.mjs';

const v3 = await loadV3(), copy = await loadV3Copy();
try {
  const rows = v3Rows(v3, copy.side);
  const pinned = rows.map((r) => {
    const config = CONFIGS.find((c) => c.id === r.config), script = V3_SCRIPTS.find((s) => s.id === r.script), m = startedMoves(v3, config, r.seed, script);
    return { config: r.config, seed: r.seed, script: r.script, ticks: r.ticks[0], hash: r.hash[0], outcome: r.outcome[0], directional: { heavy_right: m.heavy_right ?? 0, heavy_left: m.heavy_left ?? 0, heavy_thrust: m.heavy_thrust ?? 0 } };
  });
  if (process.argv.includes('--write')) {
    writeFileSync(V3_GOLDEN, `${JSON.stringify({ about: 'Gate 0 V3-only rows (test/gate0/v3-scripts; scripts/gate0-v3-golden.mjs --write re-pins). V1 has no reference for these inputs (the directional heavies are V3 only); each row is this tree run twice in independent module copies, hash = running sha256 of duel + ai + events every tick (first 16 hex). directional = the player\'s directional heavies started.', rows: pinned }, null, 1)}\n`);
    console.log(`wrote ${V3_GOLDEN}\n`);
  }
  const golden = new Map((existsSync(V3_GOLDEN) ? readV3Golden().rows : []).map((g) => [`${g.config}/${g.seed}/${g.script}`, g]));
  console.log('V3-only rows (no V1 reference: V1 has no directional heavies). Run 1 vs run 2 = this tree in two independent module copies; pinned = test/gate0/v3-golden.json.\n');
  console.log('| config | seed | script | ticks | end | R / L / stab started | hash | run 2 | pinned |\n|---|---|---|---|---|---|---|---|---|');
  let bad = 0;
  for (const [i, r] of rows.entries()) {
    const p = pinned[i], g = golden.get(`${r.config}/${r.seed}/${r.script}`), pinnedOk = !!g && g.hash === p.hash && g.ticks === p.ticks;
    if (!r.same || !pinnedOk) bad++;
    console.log(`| ${r.config} | ${r.seed} | ${r.script} | ${p.ticks} | ${p.outcome} | ${p.directional.heavy_right} / ${p.directional.heavy_left} / ${p.directional.heavy_thrust} | \`${p.hash}\` | ${r.same ? 'same' : `**DIFF** tick ${r.diff.tick}`} | ${pinnedOk ? 'same' : `**OFF** (pinned \`${g?.hash ?? 'none'}\`)`} |`);
  }
  console.log(`\n${rows.length - bad} of ${rows.length} V3-only rows deterministic and on their pinned hash.`);
  process.exitCode = bad ? 1 : 0;
} finally { copy.dispose(); }
