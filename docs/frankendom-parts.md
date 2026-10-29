# Frankendom parts: feasibility and design (stage 0)

Dom: "you become what you kill": cut a boss, keep the part, wear it. Cut stays tap-only. No Take button, no yellow circles; collection is automatic on cut.

## What exists (read from main 8e95e94)

- **Hero**: `psyche-106.glb`, 1.6 MB, Mixamo 106 rig. Two skinned draws (`Steel` 24.8k verts = body and kit in one draw, `Ch22_Eyelashes`). No cut version.
- **Boss cut GLBs**: `minotaur|gargantua|arachne-106.glb` (2.4 / 2.8 / 3.3 MB) are the whole body already split: `piece_root`, `piece_upper_torso`, `piece_head` (Minotaur: `head_left` + `head_right`), `piece_arm_left/right`, `piece_leg_left/right`, plus `cap_*` stump meshes. All are skinned to the same 106 skeleton; `*.cut.manifest.json` maps region id to mesh and to the cut unit (`head`, `arm_left`, `arm_right`, `leg_left`, `leg_right`, `torso_waist`). Only these three bosses have cut GLBs; the other ring bosses wear one of the three bodies.
- **Cut event**: `corpse:cut` on the feel bus, payload `{ unit, gear, source, corpseId }`, `corpseId = <archetype>#<life>` (e.g. `pitborn#3`). The archetype is shared by several profiles (Arachne, Sir Reginald and The Accountant are all `shieldmaiden`), so the profile id has to be added to the payload or read from the zone loop's last-killed kind (`onBossKilled(kind, star)` in `src/client/main.ts` already has both kind and star).
- **Save**: `frankendom.v3.progress` v1 (`src/progression.ts` parseSave/writeSave). Fields are optional and cleaned on read, so an `inventory`/`equipped` pair can be added without bumping the version. Old saves load with empty values.
- **Weapon reward**: `Save.unlocked` plus `heroWeapon()`; shown as the weapon slot, no new rule.
- **Burger menu**: V3 has none. `index.html` states it ships "less the journal"; `style.css` keeps dead `#journal` / `.stance-menu` rules and a glint on `#journal-button`. Stage 1 must add a small ☰ button and panel, reusing those V1 journal styles. This differs from the brief ("existing burger menu").

## How a cut part attaches to the hero

Both bodies use the same 106 bone names, but proportions and rest poses differ (an ogre arm, an anime-girl leg). Plain skinning to the hero skeleton would use the boss's inverse bind matrices against the hero's bones and mis-place the part where the rests differ.

Plan, all CPU at load (parts are 2-6k verts per region, sub-millisecond):

1. Take the boss region mesh (e.g. `piece_arm_left`), a `SkinnedMesh`.
2. Re-bind per vertex: `v_hero = heroBindWorld[bone] * bossBindInverse[bone] * v_boss`, blended over the vertex's four weights, then keep the boss's skinIndex/skinWeight remapped to the hero skeleton **by bone name**. The part now moves with the hero's bones, its joint end sits on the hero's joint, and the rest of its shape is its own (ogre arm stays fat and long).
3. Add it as a `SkinnedMesh` under the hero's armature with the hero skeleton. One extra draw per equipped region (max 6), no new bones, no new clips.
4. Hide the hero's replaced region: reuse `createPieceCutter` (`src/fight/cut-pieces.ts`), which already filters a skinned draw's triangles by bone-subtree dominance and has `restore()`. `Steel` is a single-material draw, which the cutter requires. This works with no new art; the seam is open at the joint, covered by the part's own stump end (and the boss cap meshes where they exist).
5. Unequip = `restore()` for that region and remove the part mesh. Waist/torso is the riskiest region (it carries the belly and every other region attaches to it), so ship it last.

Fit risks, honest: a leg far longer than the hero's changes his height and foot contact (needs a root offset or accept floaty/sunk feet, solve with a per-part `scale`/`lift` data row); heads sit on the neck joint, fine; a part with its own gear baked in (shield arm, helmet) comes with it, which is funny and wanted.

## Budget

- First-visit bytes are untouched in stage 1 and 2: parts are lazy, fetched only when something is equipped, after first frame. A new player has none.
- Today a part needs its boss's **whole** cut GLB (2.4-3.3 MB for 6 regions) even for one arm. Up to three bodies equipped = about 8 MB on a returning player's later load, not first visit. Acceptable for the alpha but it should not need the 6.5 MB budget raise, because it is not on the first-visit path. Parts-only GLBs (ask 3 below) cut this to roughly 0.3-1 MB per region.
- Perf: +6 skinned draws at most, hero already runs one skinned draw plus eyelashes. Measure with the existing perf rows in stage 2.

## Exact asks for Physics Dev

1. **Cut Psyche**: `psyche-106.cut.glb` plus `psyche-106.cut.manifest.json` in the same `cut-pieces/1` schema (pieces: head, arm L/R, leg L/R, torso/root; caps for each stump). Then a replaced hero region hides cleanly and shows a proper stump end, instead of the runtime triangle filter. Nice to have, not blocking: the triangle filter is the stage 2 fallback.
2. **Cut GLBs for the rest of the ring cast** so every boss gives its own parts: `anime-girl-blonde-106` (the anime-girl legs in Dom's example), `anime-boy-black-106`, `pumpkinhulk-106`, `the-boss-106`, `kachujin-106`, `castle-guard-106`, `sporty-granny-106`, `parasite-106`, `big-vegas-106`. Today they all fall back to one of the three cut bodies on the corpse. Without these, the "anime girl legs" example cannot ship; with only three, parts are the Minotaur's, Gargantua's, Arachne's.
3. **Parts-only exports** per region from each cut GLB (`<body>.<region>.glb`: one mesh, its stump cap, bone names). Same bones, a fraction of the bytes. Optional, saves about 5 MB on a returning player's load.
4. **Bind-pose table** per body (rest rotation and joint positions, or a flag that all bodies share the Mixamo T/A rest) so step 2's re-bind can be a fixed matrix instead of a load-time computation. Optional.
5. **Cut event payload**: add `profile` (data/profiles.json id) to `corpse:cut`. Small, Physics or V3 Dev, since the archetype alone cannot name the boss.

## Stages

- **Stage 1** (no rendering): collection on `corpse:cut` (part id = `<profileId>:<unit>`, one row each, re-cut of the same boss only raises its count), rarity from the killing star (0/1/2 = common/rare/epic via `data/stars.json`), trophy tie-in (a star kill's part carries its tier). Save `parts: {id: {n, rarity}}` and `equipped: {slot: partId}`, validated like `progression.json`. ☰ button and a Frankendom panel at 375: seven slots (head, arm L, arm R, leg L, leg R, torso, weapon), boss name and rarity text per part (no new art), Equip / Unequip. Weapon slot shows `heroWeapon`.
- **Stage 2** (if the re-bind passes a still at 375): render equipped parts on the hero with the plan above; stats from data rows (health/damage/speed nudge per rarity) and one set-bonus row (3 parts of one boss).

## Decision needed from Dom

None for stage 1. The missing burger menu is built small and reuses the journal styles. Stage 2 wants Physics asks 1 and 2 for quality; it can start without them.
