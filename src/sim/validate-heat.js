// data/heat.json against the rest of the data (src/heat.ts reads the rows; the checks live here, beside src/sim/validate-mobs.js, because diagnostics are plain text).
// Pure: returns one string per problem, [] = fine. `ringIds`: the data/rings.json ring ids.
const HEX = /^#[0-9a-fA-F]{6}$/;

export function validateHeat(rows, ringIds = []) {
  const e = [], L = rows.limits;
  const inside = (name, v, key, whole = true) => {
    const r = L?.[key];
    if (!r || !(typeof v === 'number' && Number.isFinite(v) && v >= r[0] && v <= r[1] && (!whole || Number.isInteger(v)))) e.push(`heat.${name}: ${String(v)} is not ${whole ? 'a whole number ' : ''}in ${r ? `${r[0]}..${r[1]}` : 'a limits row'}`);
  };
  if (!Number.isInteger(rows.version) || rows.version < 1) e.push('heat.version: a whole number from 1');
  if (typeof rows.on !== 'boolean') e.push('heat.on: true or false');
  if (typeof rows.query !== 'string' || !/^[a-z][a-z0-9-]{0,15}$/.test(rows.query)) e.push('heat.query: a short lowercase word');
  if (typeof rows.value !== 'string' || !rows.value.trim()) e.push('heat.value: a non-empty string');
  inside('maxHeat', rows.maxHeat, 'maxHeat');
  inside('decay.secondsPerMark', rows.decay?.secondsPerMark, 'secondsPerMark', false);
  inside('gain.kill', rows.gain?.kill, 'gain'); inside('gain.perStar', rows.gain?.perStar, 'gain'); inside('gain.coinsPerHeat', rows.gain?.coinsPerHeat, 'coinsPerHeat');
  for (const [id, n] of Object.entries(rows.gain?.ring ?? {})) { if (!ringIds.includes(id)) e.push(`heat.gain.ring.${id}: no data/rings.json ring`); inside(`gain.ring.${id}`, n, 'gain'); }
  if (!Array.isArray(rows.tiers) || !rows.tiers.length) e.push('heat.tiers: at least one tier');
  let last = 0;
  for (const t of rows.tiers ?? []) {
    inside(`tiers.${String(t.name)}.minHeat`, t.minHeat, 'minHeat');
    if (t.minHeat <= last) e.push(`heat.tiers.${String(t.name)}: tiers ascend (minHeat ${t.minHeat} is not above ${last})`);
    if (typeof t.name !== 'string' || !t.name.trim() || t.name.length > L?.nameChars) e.push('heat.tiers.name: 1-16 characters');
    last = t.minHeat;
  }
  if (rows.tiers?.length && rows.tiers[0].minHeat !== 1) e.push('heat.tiers: the first tier starts at heat 1');
  if (rows.tiers?.length && rows.tiers[rows.tiers.length - 1].minHeat > rows.maxHeat) e.push('heat.maxHeat: below the top tier, which could never be reached');
  const h = rows.hud;
  if (!h || typeof h.label !== 'string' || !h.label.trim() || h.label.length > L?.labelChars) e.push('heat.hud.label: 1-12 characters');
  if (!h || !HEX.test(h.colour)) e.push('heat.hud.colour: #rrggbb');
  if (!h || typeof h.css !== 'string' || !h.css.trim()) e.push('heat.hud.css: the line style');
  if (h) { inside('hud.zIndex', h.zIndex, 'zIndex'); inside('hud.topOffsetPx', h.topOffsetPx, 'topOffsetPx'); }
  return e;
}
