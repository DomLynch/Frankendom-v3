# Skull Crack and Whirlwind: reducing the special effects (proposal, 2026-10-26)

Status: PROPOSAL ONLY. No code or data changed. For Strategy to review before anyone builds it.
Base: main 515f2c1 (live v3.frankendom.com). Dom, twice: "they still seem a bit too much special effected."
PR #30 (the swing trail, `data/fight.json` `trail`) is a different thing and is not touched here.

## 1. What I found (this changes the shape of the ask)

The effects the brief lists (ground shock rings, dust, shards, screen dim, vignette, bloom, exposure, slow-motion, screen shake) are not on the hero's Skull Crack (`cleave`) or Whirlwind (`reaping`) in V3 today:

- Every `special-fx-*.ts`, `special-look.ts`, `special-modes.ts`, `special-lighting.ts`, `special-cues.json`, `special-fx-*-rows.json` and `special-defs.json` row is an OPPONENT, boss or class special (Pitborn Antaeus/Surtr/Typhon, Executioner Arawn/Thanatos/Reaper, Dwarf, Goblin, Quake, Wind...). The `cast.move: skill_cleave` / `skill_reaping` in `special-defs.json` is the Pitborn's and Executioner's own cast. Nothing there runs for the hero. (`special-presentation.ts` only loads a mode for a foe's cast.)
- The hero's melee-special pipelines all exist but ship with ZERO rows: `specialLook`, `specialTrail`, `specialShards` in `src/fight/sandbox-rules-defs.json:369-371` are `[]`. So there are no shard chips, no special trail ribbon, and no per-special flash tuning. (Confirmed in the live stills: no chips, no ring, no dim.)
- The hero's windup ground ring (`boss-telegraph.ts`, `scene-rows.json` `boss-telegraph.world-windup`) is only drawn in the open world (`zone-fx.ts`). The V3 fight (`scene.ts:922`) calls it with `world = false`, so a hero's own special draws no ring there.
- There is no slow-motion, no screen shake and no vignette/exposure change on these two moves. The only time manipulation is a short hit-stop.

So what Dom sees as "too much special effects" is the shared contact kit that a landing special fires, plus the sounds and the Whirlwind's wide arc. Everything below is measured or read from those.

## 2. Capture (375 wide, live site, Mac Metal)

Method: Playwright with the cached chrome-headless-shell-1248, `--use-angle=metal`, fake clock stepping one 60 Hz tick per frame, driven through `window.__v3Fight` as `scripts/foe-stills.mjs` does. Load 3.3 to 9 (under the 12 gate) when started. I waited for two other audits' chrome processes to exit and ran one browser at a time (one earlier run overlapped a starting browser for a few seconds; it only affected timing, not stills). Scripts are in my scratchpad, not committed.

Stills: `docs/stills/special-fx-2026-10-26/` (JPEG, 750 x 1624 = 375 at 2x), today's build, no query:

| Move | Windup (+10 ticks) | Release (the landing tick) | Landing (+8 ticks) |
| --- | --- | --- | --- |
| Skull Crack (24-tick windup at x0.75, lands tick 24) | `today-skull-1-windup.jpg` | `today-skull-2-release.jpg` | `today-skull-3-landing.jpg` |
| Whirlwind (lands tick 32) | `today-whirl-1-windup.jpg` | `today-whirl-2-release.jpg` | `today-whirl-3-landing.jpg` |

What the stills show:
- Skull Crack release/landing: a few small red specks and a dark blood splat on the floor; no visible orange flash (`#e0561c`) at either frame (it is short, 0.12 s, and the stills sit one frame on the contact tick, so I may have caught it early or late). The pale arc beside the Minotaur in these two frames is his own swing trail, not the hero's, and the hero's weapon is not visible in the Skull Crack frames. The hit-stop and camera push cannot be seen in a still.
- Whirlwind release: a big pink-red additive flash on the Minotaur's shoulder (the `#c0202a` impact tint), the pale arc wider than the Skull Crack's, golden puffs at both fighters' feet, the "Clean Whirlwind hit - 7" line and the floating "7". The landing frame has the spark fan and blood.
- A bright white bloom on the hero's shirt appears in every frame including before the cast. It is not special-owned (Hero Look's material or light, I have not traced it). Flagging it so nobody reduces a special effect to chase it.
- The golden foot puffs in the Whirlwind frames look like the generic foot dust (inference from the colour and place; I did not trace it to a row).

Frame time and overdraw (real clock, 375 x 812 at 2x, Metal; 30 s with both specials pressed on every cooldown):

| State | frames | frame dt p50 / p95 / max (ms) | GL draw calls per frame p50 |
| --- | --- | --- | --- |
| Not in a special | 993 | 16.7 / 16.8 / 16.8 | 35 |
| Skull Crack windup | 45 | 16.7 / 16.8 / 16.8 | 38 |
| Whirlwind swing | 229 | 16.7 / 16.8 / 16.8 | 49 |

Read: no frame is dropped on the Mac, so this proposal is about how it looks, not speed. The Whirlwind swing frames cost about 14 extra draw calls over an idle frame (trail ribbon, the impact point sprite pool, blood, foot dust); the Skull Crack windup about 3. On a slow phone that is the only place a perf win could exist; I did not measure a phone. (The one `max 15840` draw count in the raw run was the counter's first sample at hook-in and is discarded.)

## 3. Audit and proposal, effect by effect

"Now" is read from the file named. "V1 / V3" says who added it. "Risk" is the risk to the move still reading.

| # | Effect | Source (file:line / row) | Now | Proposed | V1 or V3 | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Contact hit-stop (the only hit-stop in the game: every `hit-stop-rules.json` ms is 0) | `src/fight/hit-stop-defs.json` `contacts.special.frames` | 6 frames = 100 ms, on the Skull Crack's `SpecialLanded` and the Whirlwind's `Hit` on a `skill_` move | 4 frames = 67 ms (x0.67) | V1 (BULK-CS `hitImpactSpecial`) | Medium. It is what makes the hit read. Do not go below 3 |
| 2 | Camera kick on the landing (push toward the foe) | `hit-stop-defs.json` `contacts.special.push` | 0.08 m (about 9 px at 375) | 0.04 m (x0.5) | V1 | Low |
| 3 | Camera kick: sideways/dip knock | `hit-stop-defs.json` `contacts.special.knock` | 0.03 m | 0.015 m (x0.5) | V1 | Low |
| 4 | Camera kick: along and drop literals | `src/fight/hit-impact.ts:66` `{ along: 0.05, drop: 0.06, hold: 2/60, settle: 0.22 }` (hard-coded; breaks the data-layer rule) | along 0.05, drop 0.06, settle 0.22 s | along 0.025, drop 0.03 (x0.5), settle unchanged; move all four to rows | V1 literal | Low. Needs a code move |
| 5 | Impact flash (additive sprite at the contact) | `src/fight/feel-rules.json` `skillImpactRule.flash` 0.12 s, `flashSize` 0.9 m; per-skill `specialLook` rows `sandbox-rules-defs.json:369` | 100% (no `specialLook` rows); the Whirlwind flash is the big pink glow in the still | flash size x0.55 for the hero's two specials only | V1 (SKILL-IMPACT kit, 2026-09-26) | Low. Flash is the landing telegraph; keep the tint |
| 6 | Impact spark fan (additive points) | `feel-rules.json` `skillImpactRule.sparks` 10, `life` 0.4 s | 10 sparks, 0.4 s | 5 sparks (x0.5), life 0.4 unchanged; spread and lift 100% | V1 | Low |
| 7 | Impact tint (identity colour) | `src/fight/skill-defs.json` `impactTint`: cleave `#e0561c`, reaping `#c0202a` | as listed | LEAVE. The colours are what tell the two moves apart | V1 | None |
| 8 | Special weapon trail | `sandbox-rules-defs.json:370` `specialTrail` = `[]`; the swing trail applies, keyed `heavy` | opacity 0.12 x 0.5 = 0.06 already (PR #30), both moves | Skull Crack: LEAVE. Whirlwind: x0.7 (0.06 to 0.042) under a new row, because its spin arc is the widest ribbon in the game | V3 (#30) | Low. Needs a small code hook: `swingTrailOpacity` does not know the swing is a special |
| 9 | Shard chips, shock ring, ground dust, dim, vignette, bloom, exposure, slow-motion, screen shake | `specialShards` `[]`, `special-lighting.ts` and `special-fx-*.ts` (opponent only), `hit-stop-defs.json` has no shake row | None exist for the hero | NOTHING to reduce. Do not add any | n/a | None |
| 10 | Special sounds | `sandbox-rules-defs.json` `specialSound`: cleave whoosh_heavy 650 @280 ms, bone_crack 850, hit_heavy 600; reaping whoosh_heavy 600 @120, whoosh_heavy 750 @300, hit_heavy 750, flesh_cut 550 | as listed (gains per mille; the bus compressor roughly halves a cut) | cleave hit_heavy 600 to 450; reaping second whoosh 750 to 550, hit_heavy 750 to 550, flesh_cut 550 to 450; LEAVE bone_crack 850 and the first whooshes (the crack is the Skull Crack's identity) | V1 (sandbox rows 2026-10-17) | Low. Sound lane may overrule. `specialSound` is a sandbox/era file, so do it as a V3 gain multiplier, not an edit there |
| 11 | Windup ground ring | `boss-telegraph.ts`, `scene-rows.json` `boss-telegraph.world-windup` 1, `world-color` 8377599 | Not drawn in the V3 fight (`scene.ts:922`, `world = false`); open world only | LEAVE | V1 | None |
| 12 | Ready ring on the SPECIAL buttons (the "ready" telegraph) | `data/fight.json` `readyRing`: `#f2c14e`, width 2, glow 5, gap 3, pulse 1600 ms | as listed | LEAVE. Dom asked for it on 10-26 and it is the player's readiness signal | V3 (Dom) | None |
| 13 | Victim stagger, knockback, posture; cast pushback | `sandbox-rules-defs.json` `specialReactStagger` 160, `Knock` 450, `Posture` 150, `castPushback` 30 | as listed | LEAVE. Sim rules (they move the Gate 0 digest), not effects | V1 | n/a |
| 14 | Windup pose, the clip itself, "Clean Whirlwind hit" line, floating damage number, blood | clips, hud.ts | as shipped | LEAVE. They are the windup telegraph and the feedback the player needs | V1 | None |

Net: 8 data values change on the hero's two specials: 3 camera rows (+ the literals moved to rows), 1 hit-stop row, flash size, spark count, the Whirlwind trail, and the sound gains. Windup, release pose and the landing flash colour stay as they are.

## 4. Where the numbers live, and the toggle

Do NOT edit `hit-stop-defs.json` `contacts.special`, `feel-rules.json` `skillImpactRule` or `sandbox-rules-defs.json`: they are shared with every opponent special and every other skill (and `sandbox-rules-defs.json` is era-gated and replayed by Gate 0), so an edit there would also soften the Minotaur's and Pitborn's moves and could move records. Instead one new V3 row, the same pattern as `trail`, `specialPace` and `specialTerms`:

`data/fight.json` `specialFx` (registered with the validator, applied only where `actor === 0` and the move is the hero's `skill` or `skill2`, presentation only, so no digest or RECORD_VERSION moves and Gate 0 never reads it):

```json
"specialFx": {
  "about": "...why, the Dom quote, the ?fx=v1 line...",
  "hitStopFrames": 4,
  "cameraKick": 0.5,
  "flash": 0.55,
  "sparks": 0.5,
  "trailReaping": 0.7,
  "soundGain": 0.75
}
```

Toggle: default ON; `?fx=v1` reads the row as null and gives today's behaviour exactly (as `?trail=v1`, `?skull=v1`, `?spec=v1`, `?ring=v1` do in `src/client/main.ts`). No existing `?fx=` is in use (only `?gfx=`).

Code touch points for the builder (a follow-up PR, not this one): `hit-impact.ts` (the `special` tier's frames and the shove for actor 0, lines 40 and 66), `skill-impact.ts` (apply a scale to the flash and spark count when the actor is the hero and the move is one of his two specials; today `look` is applied only on `SpecialLanded`, so the Whirlwind, which lands as a plain `Hit`, needs the scale passed for `Hit` too), `trail-opacity.ts` / `characters.ts:1027` (a special flag for the Whirlwind), `sound/cues.ts:56,67` (a gain multiplier for the hero's special rows).

## 5. Mock-up plan: exact numbers, before to after

| Row (in `specialFx` unless named) | Before (today) | After (default) | `?fx=v1` |
| --- | --- | --- | --- |
| `hitStopFrames` | 6 (`contacts.special.frames`) = 100 ms | 4 = 67 ms | 6 |
| `cameraKick` multiplier on push / knock / along / drop | 0.08 / 0.03 / 0.05 / 0.06 m | x0.5 = 0.04 / 0.015 / 0.025 / 0.03 m (about 4.4 px of push at 375) | 0.08 / 0.03 / 0.05 / 0.06 |
| `flash` multiplier on flash size | 1.0 (flashSize 0.9 m) | 0.55 (about 0.5 m) | 1.0 |
| `sparks` multiplier on spark count | 10 | 5 | 10 |
| `trailReaping` on the Whirlwind swing trail | 0.06 | 0.042 | 0.06 |
| `soundGain`: cleave hit_heavy / reaping whoosh 2, hit_heavy, flesh_cut | 600 / 750 / 750 / 550 | 450 / 560 / 560 / 410 (x0.75; bone_crack 850 and the first whooshes untouched) | as today |
| Skull Crack trail, impact tints, ready ring, windup pose | unchanged | unchanged | unchanged |

Proof required before merge of the build (Dom's stills rule and `visual-pr-stills`): 375 pairs, `?fx=v1` against default, at the three beats (windup, release, landing) of both moves, plus the same frame-time table, and a verdict on the stills. The windup and the landing must still read in the default stills; if the Whirlwind release flash or the Skull Crack landing no longer reads, raise `flash` to 0.7 and `hitStopFrames` to 5 first. Add a unit test that pins the row's keys and that `?fx=v1` gives today's numbers (as `test/skull.test.mjs` does for `?skull=v1`).

## 6. What I would leave alone, and why

- The windup pose, the ready ring, the impact tints and the Skull Crack's bone-crack sound: the player needs these to read when to act and which move landed.
- The Skull Crack's trail: it is already 0.06 after PR #30 and its arc is short.
- Anything on the opponent side or in `special-fx-*.ts`: not hero effects, and they are the opponent's own telegraphs.
- The sim rules (reach, stagger, knock, posture, pushback): not effects.

## 7. Open questions for Strategy / Dom

1. Is hit-stop part of what Dom calls "special effected"? It is the only hold in the game and the strongest candidate, but it is also the weight. I propose 6 to 4, not to 0.
2. Whirlwind first? If a single change is wanted, the biggest visible one is the Whirlwind flash and arc (rows 5 and 8).
3. Does the white bloom on the hero's shirt (all frames) belong to Hero Look? It reads like a special glow and is not one.
