// Headless difficulty check for an opponent brain (data/brains.json): N seeded bouts of the Gate 0 input scripts against the fight V3 plays
// with V1's profile (?ai=v1, Gate 0 config page-first) and with the brain (config page-first-novice), through V3's own src/fight.
//   node scripts/ai-bouts.mjs [bouts=200] [tickCap=10800]
// Bout i: fight seed = page-first's seed + i; the random-mix script draws from its own seed + i (a fresh minute of random play per bout,
// stretched to the tick cap); light-mash is the same presses every bout, so only the fight seed (the AI's rolls) moves.
// Prints a markdown table: player wins / deaths / unfinished at the cap, the win rate and the mean bout length of the finished bouts.
import { CONFIGS, SCRIPTS, intentsOf, loadV3, runSide, startFight } from '../test/gate0/harness.mjs';

const bouts = Number(process.argv[2] ?? 200), cap = Number(process.argv[3] ?? 10800);
const v3 = await loadV3();
const configs = ['page-first', 'page-first-novice'].map((id) => CONFIGS.find((c) => c.id === id));
const scripts = ['random-mix', 'light-mash'].map((id) => SCRIPTS.find((s) => s.id === id));

// a script's intents for bout i, cycled up to the cap (the fight stops at its finish)
function intents(script, i) {
  const s = script.random ? { ...script, random: { ...script.random, seed: script.random.seed + i, ticks: cap } } : script;
  const once = intentsOf(s, v3.record.quantizeIntent), out = [];
  while (out.length < cap) out.push(...once.slice(0, cap - out.length));
  return out;
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const start = startFight(v3, configs[0], configs[0].seeds[0]).practice.duel.fighters;
console.log(`${bouts} bouts per row, cap ${cap} ticks (${(cap / 60).toFixed(0)} s), the level-${configs[0].level} Centurion (gladius + scutum, specials on; health ${start[1].health}, the player's ${start[0].health}), V3 src/fight.\n`);
console.log('| brain | script | player wins | player deaths | unfinished | win rate | mean bout (s, finished) | foe health left on a loss |\n|---|---|---|---|---|---|---|---|');
for (const script of scripts) for (const config of configs) {
  const pre = script.random ? null : intents(script, 0);
  let wins = 0, deaths = 0, open = 0;
  const lengths = [], foeLeft = [];
  for (let i = 0; i < bouts; i++) {
    const r = runSide(v3, config, config.seeds[0] + i, pre ?? intents(script, i));
    if (r.outcome === 'killed') wins++;
    else if (r.outcome === 'died') { deaths++; foeLeft.push(r.practice.duel.fighters[1].health); }
    else open++;
    if (r.outcome !== 'none') lengths.push(r.ticks / 60);
  }
  const brain = config.brain ?? 'V1 normal (?ai=v1)';
  console.log(`| ${brain} | ${script.id} | ${wins} | ${deaths} | ${open} | ${((100 * wins) / bouts).toFixed(1)} % | ${mean(lengths).toFixed(1)} | ${mean(foeLeft).toFixed(0)} |`);
}
