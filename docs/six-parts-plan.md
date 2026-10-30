# Six parts: head, body, arms, legs, feet, hands (plan)

Dom 2026-10-30: hands and feet must be severable and wearable, six parts as always agreed. Limbs, head and torso wear shipped in #319. This is the plan for hands and feet. Plan only.

## What the rest of the game already gives us
- Physics (3bb5f80, pin PR #320): severable units `hand_left/right`, `foot_left/right`; `rd.cut` carries only what is still attached (a hand goes before its arm). Cut tool opt-in `--hands-feet` adds `piece_hand_*`, `piece_foot_*`, caps `cap_wrist_*`, `cap_ankle_*` (`shown_when_cut` = the unit).
- OpenTrident PR #13: `<body>-106.cut.hf.glb` + `.hf.manifest.json` for Psyche and 9 donors (no caps), wrist/ankle collar rows in parts-manifest.json.
- Stage 1 and 2 are data driven: a part is `<profile>:<slot>`, the slot lists its physics `units` (data/parts.json), `wear.units` maps a unit to its collar and lift, `wearable` rows gate Equip.

## Blocker (not ours)
V3 ships cut GLBs without hand/foot pieces. Physics Dev needs the UNCUT sources for 13 bodies to re-cut with `--hands-feet` (only psyche and minotaur sources are on this Mac). Until the hf cuts land nothing can be cut or worn at the wrist or ankle. Do not mix an hf donor with an original arm/leg piece (the hand would show twice): a body is hf or it is not, per file.

## Steps, in order (each a small PR)
1. **Assets:** hero and the wearable donors switch to the hf cut files (physics's own cut when ready, OpenTrident's skin-weight hf cut as the stopgap). Bytes receipt against firstVisitBytes; the hero finisher/decap paths re-proved (hero-cut tests). Hero hand/foot caps needed (physics's cut has them; OT's has none).
2. **Cut event:** add `hand_left/right`, `foot_left/right` to `data/physics.json` cut.tap.order (after the arm/leg they hang from is NOT right: a hand must come off before its arm, so order head, hand_left, hand_right, foot_left, foot_right, arm_left, arm_right, leg_left, leg_right, torso_waist; a tester can reorder it, it is a row), cue.units + labels, data/pickup.json units, and the validators that hard-code the six unit names (src/sim/validate.js lines for cue/REAL: read the list from the package instead). The `corpse:cut` payload already carries `unit` and `profile`, so collection needs no code change.
3. **Parts slots:** data/parts.json slots `hand_left`, `hand_right`, `foot_left`, `foot_right` (units = the same names), rarity and trophy as the others; save fields unchanged (`parts`/`equipped` are keyed by slot id, old saves load). Panel: seven slot rows become eleven; group "hands/feet" so the ☰ sheet stays one screen at 375.
4. **Wear rows:** `wear.units` gets `hand_*` (collar wrist_l/r) and `foot_*` (collar ankle_l/r, no lift); `parts-fit-rows.json` wearable flags stay per donor; the seamRing rule decides if a wrist/ankle collar is built (donor cuff usually covers it, per OpenTrident).
5. **Finishers:** check each finisher that names a unit (finisher-defs.json, ragdoll.ts cutRig) still works when a hand/foot is already off; no new finisher.
6. **Proof:** 375 stills (idle, walk, attack) for each of the four new slots, perf row (hf donors add 2 pieces per draw group), full suite via hfjob.

## Decisions to record (Dom)
- Cut order: hands and feet first, or limbs first (a tap order row).
- Lord Gourd, Kachujin, Accountant stay not wearable until their source units are fixed (rows).
