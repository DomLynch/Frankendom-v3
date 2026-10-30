// Every branch of practiceHint (src/fight/combat.ts) as a hand-built Practice state, for test/practice-hints.test.mjs. The golden outputs next to it were recorded from the code BEFORE the lines moved to
// data/practice-hints.json, so the test proves the player reads the same words.
const fighter = (o = {}) => ({ weapon: 'gladius', critical: 0, phase: 'ready', charge: 0, move: 'light_right', charged: false, exhausted: false, chained: false, lastMove: 'light_right', exposed: false, ...o });
const state = (o = {}, f = {}) => ({
  finish: null, playerHealth: 50, health: 50, phase: 'ready', chain: 0, result: 'none', resultAge: 0, resultWalled: false, resultStop: false, resultCounter: false, resultTrip: false, resultPerfect: false,
  resultDamage: 7, resultStamina: 12.6, resultDealt: 9, resultBreak: null, posture: 0, duel: { fighters: [fighter(f)] }, ...o,
});
const RESULTS = ['kicked', 'hit', 'miss', 'hurt', 'blocked', 'parried', 'dodged', 'broken', 'enemyBlocked', 'enemyBroken', 'enemyParried', 'enemyDodged', 'enemyKicked', 'traded', 'postureBroken', 'enemyPostureBroken'];
export function cases() {
  const out = [];
  const add = (label, s, args = []) => out.push({ label, s, args });
  add('both fell', state({ finish: { draw: true } }));
  add('fell', state({ playerHealth: 0 }));
  add('defeated plain', state({ health: 0 }));
  add('defeated foe', state({ health: 0 }), ['Goblin']);
  add('beat legend', state({ health: 0 }), ['Goblin', 'Grendel']);
  add('beat legend but draw', state({ health: 0, finish: { draw: false } }), ['Goblin', 'Grendel']);
  add('sheathed plain', state({ phase: 'sheathed' }));
  add('sheathed foe', state({ phase: 'sheathed' }), ['Centurion']);
  add('sheathed legend', state({ phase: 'sheathed' }), ['Centurion', 'Crixus']);
  add('drawing', state({ phase: 'draw' }));
  add('posture broken', state({}, { critical: 3 }));
  add('chambered', state({}, { phase: 'attack', charge: 4, move: 'light_right' }));
  add('charging', state({}, { phase: 'attack', charge: 4, move: 'heavy_overhead' }));
  add('charged', state({}, { phase: 'attack', charge: 4, move: 'heavy_overhead', charged: true }));
  add('exhausted', state({}, { exhausted: true }));
  add('follow-through', state({ chain: 2 }));
  for (const r of RESULTS) {
    add(`result ${r}`, state({ result: r }));
    add(`result ${r} walled`, state({ result: r, resultWalled: true }));
    add(`result ${r} chained`, state({ result: r }, { chained: true }));
    add(`result ${r} foe`, state({ result: r }), ['Wraith']);
  }
  for (const m of ['light_right', 'light_left', 'heavy_overhead', 'thrust', 'riposte', 'slash_riposte', 'heavy_riposte', 'critical', 'heavy_counter', 'kick', 'heavy_right', 'heavy_left', 'heavy_thrust']) add(`hit via ${m}`, state({ result: 'hit' }, { lastMove: m }));
  add('hit via unnamed move', state({ result: 'hit' }, { lastMove: 'nonesuch' }), ['Goblin', undefined, (k) => (k ? `Special ${k}` : undefined)]);
  for (const flags of [{}, { resultStop: true }, { resultCounter: true }, { resultStop: true, resultCounter: true }]) add(`hit ${JSON.stringify(flags)}`, state({ result: 'hit', ...flags }));
  for (const flags of [{}, { resultStop: true }, { resultTrip: true }, { resultCounter: true }, { resultStop: true, resultTrip: true, resultCounter: true }]) {
    add(`hurt ${JSON.stringify(flags)}`, state({ result: 'hurt', ...flags }));
    add(`hurt walled ${JSON.stringify(flags)}`, state({ result: 'hurt', resultWalled: true, ...flags }));
  }
  for (const [perfect, dmg] of [[false, 0], [true, 0], [false, 3], [true, 3]]) add(`blocked perfect=${perfect} dmg=${dmg}`, state({ result: 'blocked', resultPerfect: perfect, resultDamage: dmg }));
  for (const b of [null, 'charged', 'kick', 'other']) add(`broken ${b}`, state({ result: 'broken', resultBreak: b }));
  add('result aged out, guard', state({ result: 'hit', resultAge: 9999, phase: 'guard' }));
  add('guard', state({ phase: 'guard' }));
  add('parry missed', state({}, { exposed: true }));
  add('posture breaking', state({ posture: 9999 }));
  add('nothing', state());
  return out;
}
