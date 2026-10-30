// Frankendom parts, stage 2 (src/fight/parts-fit.ts): the checks for data/parts.json `fit` and for data/parts-fit-rows.json. They live here, beside src/sim/validate.js, because diagnostics are
// plain words and src/*.ts is scanned for them by the as-data gate (the same split as validate-rings.js). Pure: each returns one string per problem, [] = fine.

const BONE = /^[A-Za-z0-9_]+$/, KEY = /^[a-z][a-z_]*$/, ID = /^[a-z0-9][a-z0-9-]*$/;
/** The measure keys a body row may carry (data/parts-fit-rows.json `measure`; metres, from the body's bind pose). */
export const MEASURE_KEYS = ['height_m', 'thigh_len', 'shin_len', 'foot_len', 'upper_arm_len', 'forearm_len', 'neck_len', 'torso_len', 'shoulder_w', 'upper_arm_r', 'thigh_r'];

/** Which GLB a donor loads: OpenTrident's derived copy (winding fixed) or V3's own file. */
export const SOURCES = ['derived', 'original'];
const isObj =(o) => !!o && typeof o === 'object' && !Array.isArray(o);

/** `fit`: data/parts.json `fit`. Keys are closed one level deeper than validate.js looks; every number is finite and in range, every name a bone or a measure key the rules can read. */
export function validateFit(fit) {
  const e = [], at0 = 'parts.fit';
  if (!isObj(fit)) return [`${at0}: missing`];
  const num = (at, v, lo, hi) => { if (!(typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi)) e.push(`${at0}.${at}: a number in ${lo}..${hi}`); };
  const int = (at, v, lo, hi) => { if (!(Number.isInteger(v) && v >= lo && v <= hi)) e.push(`${at0}.${at}: an integer in ${lo}..${hi}`); };
  const keys = (at, o, want) => {
    if (!isObj(o)) { e.push(`${at0}.${at}: an object`); return false; }
    for (const k of Object.keys(o)) if (!want.includes(k)) e.push(`${at0}.${at}.${k}: unknown key`);
    return true;
  };
  const name = (at, v, re) => { if (!(typeof v === 'string' && re.test(v))) e.push(`${at0}.${at}: a name (letters, digits, underscore)`); };
  if (keys('limits', fit.limits, ['boneLo', 'boneHi', 'heightLo', 'heightHi', 'coverFrac', 'meanK'])) {
    const l = fit.limits;
    num('limits.boneLo', l.boneLo, 0.05, 1); num('limits.boneHi', l.boneHi, 1, 10); num('limits.heightLo', l.heightLo, 0.05, 1); num('limits.heightHi', l.heightHi, 1, 10);
    num('limits.coverFrac', l.coverFrac, 0.5, 1); num('limits.meanK', l.meanK, 1, 2);
  }
  if (keys('seam', fit.seam, ['bandM', 'minVerts', 'percentile', 'uvPercentile'])) {
    num('seam.bandM', fit.seam.bandM, 0.001, 0.5); int('seam.minVerts', fit.seam.minVerts, 1, 1000); num('seam.percentile', fit.seam.percentile, 0, 1); num('seam.uvPercentile', fit.seam.uvPercentile, 0, 1);
  }
  if (keys('eps', fit.eps, ['heightM', 'boneM'])) { num('eps.heightM', fit.eps.heightM, 0, 0.01); num('eps.boneM', fit.eps.boneM, 0, 0.01); }
  if (keys('bones', fit.bones, ['hips', 'head'])) { name('bones.hips', fit.bones.hips, BONE); name('bones.head', fit.bones.head, BONE); }
  if (keys('lift', fit.lift, ['unit', 'keys'])) {
    name('lift.unit', fit.lift.unit, KEY);
    if (!Array.isArray(fit.lift.keys) || !fit.lift.keys.length || fit.lift.keys.some((k) => !MEASURE_KEYS.includes(k))) e.push(`${at0}.lift.keys: a non-empty list of measure keys`);
  }
  if (keys('skin', fit.skin, ['influences', 'uvStride'])) { int('skin.influences', fit.skin.influences, 1, 8); int('skin.uvStride', fit.skin.uvStride, 1, 4); }
  if (keys('collar', fit.collar, ['segments', 'roundScale', 'heightKey', 'fallback', 'joints', 'rules'])) {
    const c = fit.collar, rules = isObj(c.rules) ? c.rules : {}, fallback = isObj(c.fallback) ? c.fallback : {};
    int('collar.segments', c.segments, 3, 64); num('collar.roundScale', c.roundScale, 1, 1e6);
    if (!MEASURE_KEYS.includes(c.heightKey)) e.push(`${at0}.collar.heightKey: a measure key`);
    if (keys('collar.fallback', c.fallback, Object.keys(fallback)))
      for (const [k, f] of Object.entries(fallback)) {
        if (!MEASURE_KEYS.includes(k)) e.push(`${at0}.collar.fallback.${k}: a measure key`);
        if (keys(`collar.fallback.${k}`, f, ['of', 'k'])) { num(`collar.fallback.${k}.k`, f.k, 0.001, 10); if (f.of !== undefined && !MEASURE_KEYS.includes(f.of)) e.push(`${at0}.collar.fallback.${k}.of: a measure key`); }
      }
    if (keys('collar.rules', c.rules, Object.keys(rules)))
      for (const [id, r] of Object.entries(rules)) {
        if (!keys(`collar.rules.${id}`, r, ['rOf', 'rK', 'hOf', 'hK', 'hMin'])) continue;
        for (const k of ['rOf', 'hOf']) if (!MEASURE_KEYS.includes(r[k])) e.push(`${at0}.collar.rules.${id}.${k}: a measure key`);
        num(`collar.rules.${id}.rK`, r.rK, 0.01, 10); num(`collar.rules.${id}.hK`, r.hK, 0.01, 10); num(`collar.rules.${id}.hMin`, r.hMin, 0, 1);
      }
    if (!Array.isArray(c.joints) || !c.joints.length) e.push(`${at0}.collar.joints: at least one joint`);
    const seen = new Set();
    (Array.isArray(c.joints) ? c.joints : []).forEach((j, i) => {
      if (!keys(`collar.joints[${i}]`, j, ['id', 'bone', 'at', 'rule'])) return;
      if (typeof j.id !== 'string' || !KEY.test(j.id) || seen.has(j.id)) e.push(`${at0}.collar.joints[${i}].id: a unique lower-case id`); else seen.add(j.id);
      name(`collar.joints[${i}].bone`, j.bone, BONE); num(`collar.joints[${i}].at`, j.at, 0, 1);
      if (!rules[j.rule]) e.push(`${at0}.collar.joints[${i}].rule: "${String(j.rule)}" is not a row of collar.rules`);
    });
  }
  if (isObj(fit.limits) && !(fit.limits.boneLo < fit.limits.boneHi && fit.limits.heightLo < fit.limits.heightHi)) e.push(`${at0}.limits: each Lo must be below its Hi`);
  return e;
}

/**
 * `file`: data/parts-fit-rows.json. `fit`: data/parts.json `fit` (the joints a body's collars must name). `profileIds`: the data/profiles.json ids (optional: every row but the hero must be one).
 * A `measure` is null (no row: the lift is 0 and there are no collars) or an object of positive finite metres over MEASURE_KEYS with height, thigh and shin present.
 */
export function validateFitRows(file, fit, profileIds) {
  const e = [], at0 = 'parts-fit-rows';
  if (!isObj(file) || !Array.isArray(file.bodies) || !file.bodies.length) return [`${at0}.bodies: a non-empty list`];
  const joints = new Map(((isObj(fit) && isObj(fit.collar) && Array.isArray(fit.collar.joints)) ? fit.collar.joints : []).map((j) => [j.id, j]));
  const ids = new Set(), ranks = new Set(), positive = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  if (typeof file.hero !== 'string' || !ID.test(file.hero)) e.push(`${at0}.hero: the id of the player's body row`);
  file.bodies.forEach((b, i) => {
    const at = `${at0}.bodies[${i}]`;
    if (!isObj(b)) { e.push(`${at}: an object`); return; }
    if (typeof b.id !== 'string' || !ID.test(b.id) || ids.has(b.id)) { e.push(`${at}.id: a unique lower-case id`); return; }
    ids.add(b.id);
    if (profileIds && b.id !== file.hero && !profileIds.has(b.id)) e.push(`${at}.id: "${b.id}" is neither the hero nor a data/profiles.json id`);
    if (typeof b.measuredOn !== 'string' || !ID.test(b.measuredOn)) e.push(`${at}.measuredOn: the OpenTrident body id the numbers came from`);
    if (b.id === file.hero) { for (const k of ['source', 'wearable', 'quality', 'reason']) if (k in b) e.push(`${at}.${k}: the hero row has none (it is worn on, not worn)`); }
    else {
      if (!SOURCES.includes(b.source)) e.push(`${at}.source: one of ${SOURCES.join(', ')}`);
      if (typeof b.wearable !== 'boolean') e.push(`${at}.wearable: true or false`);
      if (!Number.isInteger(b.quality) || b.quality < 1) e.push(`${at}.quality: a rank, 1 = best`); else if (ranks.has(b.quality)) e.push(`${at}.quality: rank ${b.quality} twice`); else ranks.add(b.quality);
      if (typeof b.reason !== 'string' || !b.reason.trim()) e.push(`${at}.reason: why, in words`);
    }
    if (b.measure === null) { if (Array.isArray(b.collars) && b.collars.length) e.push(`${at}.collars: none without a measure row`); }
    else if (!isObj(b.measure)) e.push(`${at}.measure: null or an object`);
    else {
      for (const k of Object.keys(b.measure)) if (!MEASURE_KEYS.includes(k)) e.push(`${at}.measure.${k}: unknown key`); else if (!positive(b.measure[k])) e.push(`${at}.measure.${k}: a positive number of metres`);
      for (const k of [fit?.collar?.heightKey, ...(fit?.lift?.keys ?? [])]) if (k && !positive(b.measure[k])) e.push(`${at}.measure.${k}: required (the lift and the collars read it)`);
    }
    if (!Array.isArray(b.collars)) { e.push(`${at}.collars: a list`); return; }
    const seen = new Set();
    b.collars.forEach((c, j) => {
      const cat = `${at}.collars[${j}]`;
      if (!isObj(c)) { e.push(`${cat}: an object`); return; }
      for (const k of Object.keys(c)) if (!['id', 'bone', 'at', 'r', 'h'].includes(k)) e.push(`${cat}.${k}: unknown key`);
      const joint = joints.get(c.id);
      if (!joint) e.push(`${cat}.id: "${String(c.id)}" is not a joint of data/parts.json fit.collar.joints`);
      else {
        if (seen.has(c.id)) e.push(`${cat}.id: "${c.id}" twice`);
        if (c.bone !== joint.bone || c.at !== joint.at) e.push(`${cat}: bone and at must be the joint's (${joint.bone}, ${joint.at})`);
      }
      seen.add(c.id);
      if (!positive(c.r)) e.push(`${cat}.r: a positive radius in metres`);
      if (!positive(c.h)) e.push(`${cat}.h: a positive height in metres`);
    });
  });
  if (typeof file.hero === 'string' && !ids.has(file.hero)) e.push(`${at0}.hero: "${file.hero}" is not a row`);
  return e;
}
