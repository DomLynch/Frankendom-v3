#!/usr/bin/env bash
# Builds src/assets/psyche.glb: Mixamo's Psyche (OpenTrident models/mixamo, id ch22-nonpbr) as the hero, on V1's 65-joint hero skeleton with
# every V1 clip and every row of data/hero-clips.json, the way warrior.glb is built (Dom 2026-10-26: "switch out the current one").
# Run on the VPS from a V3 checkout that has the seed tag (git fetch origin tag v1-seed-82a994d15), where the Mixamo library lives:
#   bash scripts/hero-body/build-psyche.sh [models/mixamo dir = /srv/dev-jobs/opentrident-site/models/mixamo]
# 1. prep-mixamo-body.py: Psyche scaled once so her hips stand where V1's hero pelvis does (the clips key it by height); textures to WebP 1024;
#    materials matte like V1's Exo (metallic 0; roughness cloth 0.9, hair 0.65, sneakers 0.6, skin 0.55; Mixamo's glossiness map dropped).
# 2. hero-exo.mjs (V1's, as V1 put Exo Gray on the hero): the hero's 65 joints moved onto Psyche's, her mesh and weights on them, V1's 27 clips
#    byte for byte, the sword nodes (SwordDrawn / SwordSheathed) as they are. Ch22_Body (her skin, with the base and normal map) is `Steel`.
# 3. scripts/hero-clips/build.py: Dom's picked clips (data/hero-clips.json) baked in beside V1's, the same step that makes warrior.glb. A new
#    row there (a new guard, say) reaches Psyche by running this again.
set -euo pipefail
MIXAMO=${1:-/srv/dev-jobs/opentrident-site/models/mixamo}
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
git show v1-seed-82a994d15:src/assets/warrior.glb > "$TMP/v1-warrior.glb"
python3 -I scripts/hero-body/prep-mixamo-body.py "$MIXAMO/phone/ch22-nonpbr.glb" "$TMP/v1-warrior.glb" "$TMP/psyche-prep.glb"
node scripts/hero-body/hero-exo.mjs "$TMP/v1-warrior.glb" "$TMP/psyche-prep.glb" "$TMP/psyche-base.glb" Ch22_Body
python3 -I scripts/hero-clips/build.py "$TMP/psyche-base.glb" "$MIXAMO" data/hero-clips.json src/assets/psyche.glb
ls -l src/assets/psyche.glb
