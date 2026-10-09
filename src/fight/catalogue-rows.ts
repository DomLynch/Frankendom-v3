// The catalogue's rows (src/fight/catalogue.ts): the goblin is row #1 (Lead 2026-10-09). A new character is one row here. Measured numbers come from scripts/world-body-check.mjs; the world asset is
// generated from the engine asset by scripts/character/world_body.py (no hand work). Finisher bones are the rig's own skin joints (the hero skeleton: neck_01, Head, upperarm, thigh).
import type { CatalogueRow } from './catalogue.ts';

export const CATALOGUE: readonly CatalogueRow[] = [
  {
    id: 'goblin', name: 'the Goblin', rig: 'goblin', shape: 'biped',
    engine: { asset: 'src/assets/goblin.glb', tris: 62361 },
    world: { asset: 'public/world/goblin.glb', tris: 7999, generator: 'scripts/character/world_body.py', maxTris: 8200 },
    armour: ['goblin.Helmet', 'goblin.Body', 'goblin.Arms', 'goblin.Greaves', 'goblin.Boots', 'goblin.Gloves'],
    stats: { archetype: 'goblin', levels: [1, 10] },
    animations: { clips: ['Idle', 'Walk', 'Jog', 'Run', 'Armed', 'Attack', 'Hit', 'Death', 'Draw', 'Roll', 'Guard', 'Return', 'Heavy', 'Riposte', 'ArmedWalk', 'StrafeLeft', 'StrafeRight', 'Kick', 'BlockImpact', 'Parry', 'Deflected', 'Death_SplitCrown', 'Death_RunThrough', 'Fin_RunThrough', 'Death_QuietOne'] },
    finisher: {
      cut: { head: ['Head'], neck: ['neck_01'], limbs: { armL: ['upperarm_l'], armR: ['upperarm_r'], legL: ['thigh_l'], legR: ['thigh_r'] } },
      finishers: ['splitCrown', 'decapitation', 'runThrough', 'opened', 'plainDeath'],
    },
    blood: { start: '#5a1410', end: '#1c0604', amount: 0.6 },
    loot: { table: 'loottable:pit-goblin' },
    legend: { work: 'Historia Ecclesiastica (the demon St Taurinus drove from the temple of Diana at Evreux, whom the people call Gobelinus)', author: 'Orderic Vitalis', year: 1141, locator: 'Bk. V (Le Prevost, vol. 3, p. 331; ch. 7 in Chibnall)' },
  },
];
export const catalogueRow = (id: string): CatalogueRow | null => CATALOGUE.find((r) => r.id === id) ?? null;
