// The character catalogue's DEFINITIONS (PURE DATA, on the data-only path like catalogue-data.ts): what a row's open `fields` map may hold, and the rig families a row may stand on.
// Nothing here is a closed union a new attribute must edit: a new attribute is ONE `fields` row below (id, kind, and for a ref the table it points at), then any row may carry it in its
// `fields` map. Kinds: 'ref' = a string that must be a member of the named table (`of`), 'number' = a finite number in [min, max]. `required` = every row must carry it. `sim` (true|false, mandatory) = the field changes a fight, so its resolved value is hashed into the record-version digest; a cosmetic field is sim: false and never moves it.
// A new rig family is one `rigs` row (its blade table is baked in src/fight/blade-paths.ts; tests/catalogue.test.ts pins that every rig here has one). Characters 2026-10-12 (Dom: nothing in the catalogue is locked).
const CATALOGUE_DEFS = {
  fields: [
    { id: "weapon", kind: "ref", of: "weapons", required: true, sim: true },
  ],
  rigs: [
    { id: "hero" }, { id: "goblin" }, { id: "nightborn" }, { id: "minotaur" }, { id: "wraith" }, { id: "wolf" }, { id: "boar" }, { id: "bear" },
  ],
} as const;
export default CATALOGUE_DEFS;
