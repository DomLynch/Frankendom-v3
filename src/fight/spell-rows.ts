import { SPELL_OF_LEGEND, type CatalogueSpell } from './spell-legends.ts';
import { SPECIALS, type SpecialRow } from './special-rows.ts';

// A grimoire spell casts through the existing special template (programme 2b: "the fight engine never knows a spell was composed"). A catalogue spell's `bricks.root` IS a special template
// name (longShadow, crack, gale, ashfall, theWord, threeBlows, baying, theRing, harvest), so the row it draws is the special row of that template: same family, cast and params, with the
// spell's id. Modifier and suffix bricks are empty in the catalogue today; when they carry numbers they overlay `params` here. Presentation only. Donor: Ryzom spell (a root effect plus bricks), shape only.
export const specialOf = (spell: CatalogueSpell): SpecialRow | undefined => SPECIALS.find((s) => s.template === spell.bricks.root);
export const spellCast = (spell: CatalogueSpell): SpecialRow => {
  const base = specialOf(spell);
  if (!base) throw Error(`${spell.id}: root "${spell.bricks.root}" is not a special template`);
  return { ...base, id: spell.id };
};
export const castOfLegend = (legend: string): SpecialRow | undefined => (Object.hasOwn(SPELL_OF_LEGEND, legend) ? spellCast(SPELL_OF_LEGEND[legend]!) : undefined);
