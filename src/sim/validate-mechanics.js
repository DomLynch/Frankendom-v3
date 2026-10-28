// data/mechanics.json against its per-mechanic checkers (src/sim/validate.js validateFile calls this). Pure: returns one string per problem, [] = fine. The file is a MAP, mechanic id -> row; each
// mechanic has ONE checker in CHECKS below (one line per boss, added by the lane that builds it), so a boss lane never edits another boss's checks. A row with no checker is a problem.
const HEX = /^#[0-9a-fA-F]{6}$/;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

const ACCOUNTANT_KEYS = ['boss', 'firstTicks', 'triggerRangeM', 'tellTicks', 'wallTicks', 'cooldownTicks', 'cancelCooldownTicks', 'arcDeg', 'parryStunTicks', 'riposteTicks', 'parriesToDrop', 'kickBreakStunTicks', 'specialBreakStunTicks', 'caption', 'fx'];
const ACCOUNTANT_FX = ['colour', 'edgeColour', 'ringRadiusM', 'wallHeightM', 'wallWidthM', 'wallDistanceM', 'tellOpacity', 'wallOpacity', 'sparkCount', 'sparkSpeedMps', 'sparkLifeS', 'sparkSizeM', 'sparkGravityMps2', 'ringPulseHz'];
/** The Accountant's PARRY WALL row (src/fight/mechanics/accountant-parry-wall.ts). Ranges keep the wall readable (a tell of 0.3 s or more) and fair (a window under 5 s, a cooldown that is longer than the wall). */
function accountantParryWall(r, at) {
  const e = [];
  for (const k of Object.keys(r)) if (!ACCOUNTANT_KEYS.includes(k)) e.push(`${at}.${k}: unknown key`);
  if (typeof r.boss !== 'string' || !r.boss) e.push(`${at}.boss: a profile id`);
  if (!int(r.firstTicks, 0, 3600)) e.push(`${at}.firstTicks: an integer 0..3600`);
  if (!num(r.triggerRangeM, 1, 8)) e.push(`${at}.triggerRangeM: 1..8 metres`);
  if (!int(r.tellTicks, 18, 120)) e.push(`${at}.tellTicks: an integer 18..120 (a warning of at least 0.3 s)`);
  if (!int(r.wallTicks, 30, 300)) e.push(`${at}.wallTicks: an integer 30..300 (no wall stands over 5 s)`);
  if (!int(r.cooldownTicks, 300, 7200)) e.push(`${at}.cooldownTicks: an integer 300..7200`);
  if (!int(r.cancelCooldownTicks, 60, 7200)) e.push(`${at}.cancelCooldownTicks: an integer 60..7200`);
  if (int(r.cooldownTicks, 0, 1e9) && int(r.wallTicks, 0, 1e9) && !(r.cooldownTicks > r.wallTicks)) e.push(`${at}.cooldownTicks must be longer than wallTicks`);
  if (!num(r.arcDeg, 30, 240)) e.push(`${at}.arcDeg: 30..240 degrees (the front the wall covers; the rest is open)`);
  if (!int(r.parryStunTicks, 1, 60)) e.push(`${at}.parryStunTicks: an integer 1..60`);
  if (!int(r.riposteTicks, 1, 90)) e.push(`${at}.riposteTicks: an integer 1..90`);
  if (!int(r.parriesToDrop, 1, 10)) e.push(`${at}.parriesToDrop: an integer 1..10`);
  if (!int(r.kickBreakStunTicks, 1, 180)) e.push(`${at}.kickBreakStunTicks: an integer 1..180`);
  if (!int(r.specialBreakStunTicks, 1, 180)) e.push(`${at}.specialBreakStunTicks: an integer 1..180`);
  if (typeof r.caption !== 'string' || !r.caption) e.push(`${at}.caption: a data/commentator.json event id`);
  const fx = r.fx;
  if (!fx || typeof fx !== 'object' || Array.isArray(fx)) return [...e, `${at}.fx: an object`];
  for (const k of Object.keys(fx)) if (!ACCOUNTANT_FX.includes(k)) e.push(`${at}.fx.${k}: unknown key`);
  for (const k of ['colour', 'edgeColour']) if (typeof fx[k] !== 'string' || !HEX.test(fx[k])) e.push(`${at}.fx.${k}: a #rrggbb`);
  for (const k of ['ringRadiusM', 'wallHeightM', 'wallWidthM', 'wallDistanceM']) if (!num(fx[k], 0.1, 6)) e.push(`${at}.fx.${k}: 0.1..6 metres`);
  for (const k of ['tellOpacity', 'wallOpacity']) if (!num(fx[k], 0, 1)) e.push(`${at}.fx.${k}: 0..1`);
  if (!int(fx.sparkCount, 1, 24)) e.push(`${at}.fx.sparkCount: an integer 1..24`);
  for (const k of ['sparkSpeedMps', 'sparkLifeS', 'sparkSizeM', 'sparkGravityMps2', 'ringPulseHz']) if (!num(fx[k], 0.01, 20)) e.push(`${at}.fx.${k}: 0.01..20`);
  return e;
}

/** One checker per mechanic id: the registry of the checks (the code registry is src/fight/mechanics/registry.ts; a test pins that the two list the same ids). */
export const CHECKS = {
  'accountant-parry-wall': accountantParryWall,
};

/** `json`: data/mechanics.json. `bosses` (optional): the data/profiles.json ids, so a row's `boss` must be one. */
export function checkMechanics(json, bosses) {
  const e = [], rows = json.mechanics;
  if (!rows || typeof rows !== 'object' || Array.isArray(rows)) return ['mechanics.mechanics: a map of mechanic id to row'];
  for (const [id, row] of Object.entries(rows)) {
    const at = `mechanics.mechanics.${id}`;
    if (!Object.hasOwn(CHECKS, id)) { e.push(`${at}: no checker for this mechanic id (src/sim/validate-mechanics.js CHECKS)`); continue; }
    if (!row || typeof row !== 'object' || Array.isArray(row)) { e.push(`${at}: an object`); continue; }
    e.push(...CHECKS[id](row, at));
    if (bosses && typeof row.boss === 'string' && !bosses.includes(row.boss)) e.push(`${at}.boss: no data/profiles.json row "${row.boss}"`);
  }
  return e;
}
