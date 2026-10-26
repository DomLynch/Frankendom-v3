// sandbox-mech spell slot 2 (Dom 2026-10-15: both SPELL buttons real, a spell in either): the second spell the sandbox equips (sandbox/entry.ts sets `globalThis.__SANDBOX_SPELL2__` from ?spell2= / ?cast2= before the page boots).
// Absent on every other build, so nothing changes there. Read at fight start only, never mid-fight.
// The opponent's spell (sandbox: `?foespell=<legend id>&foecast=<0-100>`, sandbox/entry.ts sets `globalThis.__SANDBOX_FOE_SPELL__`): the foe casts it through its special slot under the same range rows as the player. Absent elsewhere.
export const foeSpellPick = (): { id: string; skill: number } | undefined => (globalThis as { __SANDBOX_FOE_SPELL__?: { id: string; skill: number } }).__SANDBOX_FOE_SPELL__;
// A melee special in slot 2 (sandbox `?special2=<skill id>`, entry.ts sets `globalThis.__SANDBOX_SKILL2__`): an existing class skill row, no new animation. Absent elsewhere.
export const skill2Pick = (): string | undefined => (globalThis as { __SANDBOX_SKILL2__?: string }).__SANDBOX_SKILL2__;
export const slot2Pick =():{ id: string; skill: number } | undefined => (globalThis as { __SANDBOX_SPELL2__?: { id: string; skill: number } }).__SANDBOX_SPELL2__;
