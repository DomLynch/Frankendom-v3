# Audit: hero weapon and guard, boss weapons, Arachne cut (2026-10-28, main c1e7ef0)

Status: phase 1 (read-only findings, partly verified). Items marked UNVERIFIED have no run behind them yet.

## A. Hero weapon changed to a cleaver (VERIFIED by code)
- Cause: #222 progression (bcbd35b, 16:06Z). `src/progression.ts heroWeapon()` returns the NEWEST unlocked weapon; `data/progression.json` unlocks gladius (Gargantua), cleaver (Arachne), maul (pitborn). After killing Arachne the hero is armed with the cleaver. Intentional design of #222 ("weapon per boss"), but not what Dom wants: the longsword is the default (`data/fight.json weapon`, verified live on a fresh save: phase `longsword`).
- Guard in the left hand: UNVERIFIED. Likely the cleaver/gladius clip family (one-handed, off-hand guard) replacing the longsword's two-hand guard. Confirm with stills at 0/1/2 kills.
- Fix plan: unlocks stay saved and selectable (`?weapon=<id>` already exists), but the default hero weapon is always the fight row's longsword. Data row `autoEquip: false` in `data/progression.json`.

## B. All bosses' weapons (partly verified)
- Live Gargantua draws the maul (verified: node `WeaponDrawn` = `hammer-01`).
- Node probe of the real functions on main: `bossRowOfBody` resolves gargantua-106 -> gargantua-maul, arachne-106 -> arachne-axe-shield; minotaur-106 -> none (pitborn has NO archetype row: the Minotaur's cleaver is by design, not a regression); castle-guard/sporty-granny resolve via archetype/profile. So the coordinator's #238 archetype-collision lead is NOT supported by the function outputs (profileBodyOf('shieldmaiden') = arachne-106).
- UNVERIFIED: whether the live Arachne actually draws axe + shield. My first live probe stood at a stale spot in `scripts/boss-walkin-stills.mjs` (Arachne spot is out of date since the rings; the boss met had a cleaver and no shield, most likely the Minotaur). A re-run at Arachne's real spot (local ~[56, 30]) is pending.
- Test to add: for every spawned boss body assert drawn weapon id, equip and offhand against the rows.

## C. Arachne cut (UNVERIFIED, not started)
- Candidates: her shield offhand mesh blocking the pick ray, hair triangles all in `piece_head`, physics row choice (arachne under pitborn and executioner), held-body cut wiring. Coordinate with PR #252 (cut any attack press).
