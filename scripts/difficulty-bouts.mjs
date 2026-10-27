// Headless win-rate per difficulty row (data/difficulty.json) against V3's fight: the level-18 Pitborn (data/profiles.json `pitborn`), V3's
// default hero picks (longsword, Skull Crack + Whirlwind), seeded, through V3's own src/fight. The hero is a SCRIPTED POLICY, not a human:
//   guard  = a reactive policy that walks into reach, answers a visible windup by holding guard (and a roll when hurt badly), lights in reach,
//            presses the specials when legal. It reads only what a player sees (distance, the foe's phase), never the AI's rolls.
//   mash   = Gate 0's light-mash input script (the same presses every bout).
// Bout i: fight seed = data/fight.json seed + i. Headless runs do not apply the page-only rules (hero special terms, foe special reach), as Gate 0.
//   node scripts/difficulty-bouts.mjs [bouts=40] [rows=1,2,...,10,legacy,v1] [policy=guard,mash] [tickCap=10800]
// `v1` is ?ai=v1 on the profile with scales 1 (V1's hard fight); `legacy` is the named pre-difficulty fight (novice brain, scales 1).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONFIGS, SCRIPTS, intentsOf, loadV3, recordSpecials } from '../test/gate0/harness.mjs';
import { KNOBS, profileFor, resolveFight, scaledOpponent, scaledPractice } from '../src/difficulty.ts';

const read = (f) => JSON.parse(readFileSync(fileURLToPath(new URL(`../data/${f}`, import.meta.url)), 'utf8'));
const FIGHT = read('fight.json'), BRAINS = read('brains.json').brains, PROFILES = read('profiles.json'), DIFF = read('difficulty.json');
const bouts = Number(process.argv[2] ?? 40);
const rowIds = (process.argv[3] ?? '1,2,3,4,5,6,7,8,9,10,legacy,v1').split(',');
const policies = (process.argv[4] ?? 'guard,mash').split(',');
const cap = Number(process.argv[5] ?? 10800);
const v3 = await loadV3();
const { combat, moves, playRadius, stabRule, stanceEra, record } = v3;

function build(rowId, seed) {
  const v1 = rowId === 'v1';
  const r = resolveFight({ profile: PROFILES.default, difficulty: v1 ? DIFF.default : (/^\d+$/.test(rowId) ? Number(rowId) : rowId) }, PROFILES.profiles, DIFF, BRAINS);
  const opp = moves.OPPONENTS[r.opponent];
  playRadius.setPlayScale(playRadius.playScaleFor(r.opponent, Infinity)); playRadius.setLateNotice(true); stabRule.setStab(true); stanceEra.setStanceRows(true);
  const rv = v1 ? { ...r, foeHealthScale: 1, foeDamageScale: 1 } : r;
  const body = scaledOpponent(moves.opponentAt(opp, FIGHT.level), rv);
  const practice = scaledPractice(combat.initialPractice(seed, body, FIGHT.weapon, FIGHT.skill, recordSpecials(v3, { specials: true, level: FIGHT.level, opponent: r.opponent }), undefined, FIGHT.stance, undefined, undefined, undefined, undefined, undefined, FIGHT.skill2), rv);
  return { practice, profile: profileFor(moves.profileAt(opp, FIGHT.level), rv, v1) };
}

const idle = { move: { x: 0, z: 0, yaw: 0, run: false }, action: null, guard: false, lock: true };
const dist = (p) => Math.hypot(p.duel.fighters[0].body.x - p.duel.fighters[1].body.x, p.duel.fighters[0].body.z - p.duel.fighters[1].body.z);
// the reactive hero: draw, then per tick decide from the visible state
function guardPolicy() {
  let nextSwing = 0;
  return (p, t) => {
    if (t === 0) return { ...idle, action: 'light' };
    if (t < 46) return idle;
    const d = dist(p), me = p.duel.fighters[0], foe = p.duel.fighters[1];
    if (me.phase === 'attack' || me.phase === 'hurt') return { ...idle, held: false };
    if (p.enemyAttacking && d < 3.2) return { ...idle, guard: true };
    if (d > 1.9) return { ...idle, move: { x: 0, z: 1, yaw: 0, run: d > 4 } };
    if (t >= nextSwing) {
      nextSwing = t + 12;
      const act = t % 540 < 12 ? 'skill' : t % 540 >= 270 && t % 540 < 282 ? 'skill2' : ['light', 'light_left', 'light_right'][Math.floor(t / 12) % 3];
      return { ...idle, action: act };
    }
    return idle;
  };
}
const mashScript = SCRIPTS.find((s) => s.id === 'light-mash');
function mashPolicy() { const ints = intentsOf(mashScript, record.quantizeIntent); return (p, t) => ints[t % ints.length]; }
const POLICY = { guard: guardPolicy, mash: mashPolicy };

function bout(rowId, policyId, i) {
  let { practice, profile } = build(rowId, FIGHT.seed + i);
  const pol = POLICY[policyId]();
  for (let t = 0; t < cap; t++) {
    practice = combat.stepPractice(practice, record.quantizeIntent(pol(practice, t)), profile);
    if (practice.duel.finish) {
      const [h, f] = practice.duel.fighters;
      return { win: f.health <= 0 && h.health > 0, ticks: t + 1, heroLeft: h.health, foeLeft: f.health };
    }
  }
  const [h, f] = practice.duel.fighters;
  return { win: null, ticks: cap, heroLeft: h.health, foeLeft: f.health };
}

const start = build('10', FIGHT.seed).practice.duel.fighters;
console.log(`${bouts} bouts per row and policy, cap ${cap} ticks, level-${FIGHT.level} ${PROFILES.profiles.find((p) => p.id === PROFILES.default).opponent} (health ${start[1].health} at scale 1), hero health ${start[0].health}.\n`);
console.log('| row | policy | wins | losses | unfinished | win rate | mean bout (s) | foe health left on a loss |\n|---|---|---|---|---|---|---|---|');
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
for (const policyId of policies) for (const rowId of rowIds) {
  let wins = 0, losses = 0, open = 0; const len = [], left = [];
  for (let i = 0; i < bouts; i++) {
    const r = bout(rowId, policyId, i);
    if (r.win === true) wins++; else if (r.win === false) { losses++; left.push(r.foeLeft); } else open++;
    if (r.win !== null) len.push(r.ticks / 60);
  }
  console.log(`| ${rowId} | ${policyId} | ${wins} | ${losses} | ${open} | ${((100 * wins) / bouts).toFixed(1)} % | ${mean(len).toFixed(1)} | ${mean(left).toFixed(0)} |`);
}
