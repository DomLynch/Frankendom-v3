// The character catalogue's DEFINITIONS (PURE DATA, on the data-only path like catalogue-data.ts): what a row's open `fields` map may hold, and the rig families a row may stand on.
// Nothing here is a closed union a new attribute must edit: a new attribute is ONE `fields` row below (id, kind, and for a ref the table it points at), then any row may carry it in its
// `fields` map. Kinds: 'ref' = a string that must be a member of the named table (`of`), 'number' = a finite number in [min, max], 'boolean' = true or false. `required` = every row must carry it. `sim` (true|false, mandatory) = the field changes a fight, so its resolved value is hashed into the record-version digest; a cosmetic field is sim: false and never moves it.
// A new rig family is one `rigs` row (its blade table is baked in src/fight/blade-paths.ts; tests/catalogue.test.ts pins that every rig here has one). Characters 2026-10-12 (Dom: nothing in the catalogue is locked).
const CATALOGUE_DEFS = {
  fields: [
    { id: "weapon", kind: "ref", of: "weapons", required: true, sim: true },
    { id: "chase", kind: "number", min: 0.1, max: 12, sim: false },
    { id: "leash", kind: "number", min: 1, max: 200, sim: false },
    { id: "giveUp", kind: "number", min: 1, max: 120, sim: false },
    { id: "shieldFromLevel", kind: "number", min: 2, max: 10, sim: false },
    { id: "spectral", kind: "number", min: 1, max: 1, sim: false },
    { id: "nightBronze", kind: "number", min: 1, max: 10, sim: false },
    { id: "crowd", kind: "number", min: 1, max: 8, sim: false },
    { id: "immuneTier", kind: "ref", of: "ccTiers", sim: true },   // the CC families it never takes (cc-ladder.ts CC_LADDER.tiers; programme item 7)
    { id: "firstSight", kind: "boolean", sim: false },   // the zone preview stands the player 15-25 m from this creature's camp and faces it, so it is the first thing he sees (origins/preview/mobs.ts spawnAmong); absent = no
    { id: "resist", kind: "ref", of: "ccResists", sim: true },   // the percent of each CC it keeps (cc-ladder.ts CC_LADDER.resists)
  ],
  rigs: [
    { id: "hero" }, { id: "goblin" }, { id: "nightborn" }, { id: "minotaur" }, { id: "wraith" }, { id: "wolf" }, { id: "boar" }, { id: "bear" },
  ],
} as const;
export default CATALOGUE_DEFS;
