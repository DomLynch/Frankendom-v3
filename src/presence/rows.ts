// The presence rows (data/presence.json), read by the node service (server/presence/) and by the page client chunk. Lifted from V1 origins/presence/presence-rules.ts: one row per rule
// (id, value, unit); a duplicate id, a missing or non-positive value, or a rule the code reads by name with no row is refused when the file loads. test/presence/rows.test.mjs pins every default.
// Pure: no DOM, no node API, so the same file is bundled into the page chunk and run by node.
import DEFS from '../../data/presence.json' with { type: 'json' };

export type PresenceRule = { readonly id: string; readonly value: number; readonly unit: string };
export type PresenceDefs = { query: string; path: string; host: string; protocol: string; poseGlobal: string; frame: { centreCm: number; sizeCm: number }; rules: readonly PresenceRule[] };

/** Every rule the code reads by name (presenceRule's argument type). */
export const NAMED = ['cellCm', 'radiusCm', 'nearCap', 'tier1Cm', 'tier1Every', 'tier2Cm', 'tier2Every', 'tier3Cm', 'tier3Every', 'tickMs', 'tickFloorMs', 'tickChecksPerTick', 'softCap', 'hardCap', 'maxLayers',
  'maxSpeedCmS', 'speedSlack', 'jitterMs', 'strikesToDrop', 'strikeWindowMs', 'emptyLayerMs', 'maxMessage', 'perSecond', 'idleMs', 'ipSockets', 'ipJoinsPerMinute', 'beatMs', 'maxWriteBytes', 'closeGraceMs', 'tickRing', 'logEveryMs',
  'sweepEveryMs', 'presencePort', 'walkHalfCm', 'giveUp', 'retryBaseMs', 'retryMaxMs', 'remoteSnap', 'remoteExpire',
  'drawMax', 'drawIdle', 'drawSmooth', 'animIdle', 'animWalk', 'animRun', 'animRunMps', 'poseMinDtMs', 'drawDtMaxS', 'drawContact'] as const;
export type RuleId = (typeof NAMED)[number];

/** The one loader: the file's shape, rules keyed by id (a duplicate is refused), a positive number for each, and a row for every rule read by name. */
export function loadPresence(raw: Partial<PresenceDefs>): PresenceDefs {
  for (const k of ['query', 'path', 'host', 'protocol', 'poseGlobal'] as const) if (typeof raw[k] !== 'string' || !raw[k]) throw Error(`presence: "${k}" is a non-empty string`);
  const f = raw.frame;
  if (!(f && Number.isInteger(f.centreCm) && Number.isInteger(f.sizeCm) && f.centreCm > 0 && f.sizeCm <= 0xffff && f.centreCm <= f.sizeCm)) throw Error('presence: frame is { centreCm, sizeCm } whole centimetres inside the u16 range');
  const rows = raw.rules ?? [], seen = new Set<string>();
  for (const r of rows) {
    if (typeof r.id !== 'string' || typeof r.unit !== 'string') throw Error(`presence: a rule row is { id, value, unit } (${JSON.stringify(r)})`);
    if (seen.has(r.id)) throw Error(`presence: rule "${r.id}" is given twice`);
    seen.add(r.id);
    if (!(Number.isFinite(r.value) && r.value > 0)) throw Error(`presence: rule "${r.id}" needs a value > 0`);
  }
  for (const must of NAMED) if (!seen.has(must)) throw Error(`presence: the code reads the "${must}" rule by name, so it needs a row`);
  return raw as PresenceDefs;
}
export const PRESENCE: PresenceDefs = loadPresence(DEFS as PresenceDefs);
export const presenceRule = (id: RuleId): number => PRESENCE.rules.find((r) => r.id === id)!.value;

/** The interest-management rules, one row each (V1 interest.ts interestRules, same names). */
export const interestRules = () => {
  const r = presenceRule;
  return {
    cellCm: r('cellCm'),                 // grid cell side
    radiusCm: r('radiusCm'),             // visual radius
    nearCap: r('nearCap'),               // nearest-first cap on other players sent at once
    tiers: [[r('tier1Cm'), r('tier1Every')], [r('tier2Cm'), r('tier2Every')], [r('tier3Cm'), r('tier3Every')]] as const,   // [distance cm, send every N ticks]: 10 Hz near, 5 Hz mid, 2 Hz far
    tickMs: r('tickMs'),
    softCap: r('softCap'),               // a layer accepts joins until here, then arrivals go to another layer
    hardCap: r('hardCap'),               // a join that names a player to join (World.join's `friend`) may fill to here
    maxSpeedCmS: r('maxSpeedCmS'),       // the sprint speed
    speedSlack: r('speedSlack'),
    strikesToDrop: r('strikesToDrop'),
    strikeWindowMs: r('strikeWindowMs'),
    emptyLayerMs: r('emptyLayerMs'),
    jitterMs: r('jitterMs'),             // extra movement credit a walker may bank so packets that bunch on a jittery link are not struck (the credit cap is 1 s + this)
  };
};
export type Rules = ReturnType<typeof interestRules>;
