#!/usr/bin/env bash
# Builds src/assets/minotaur.glb and src/assets/loot/carriers-minotaur.glb: Mixamo's Minotaur (OpenTrident models/mixamo, id ch25-nonpbr) as the
# opponent's body on the Centurion's own rig (Dom 2026-10-26; Strategy: only the body changes, so Gate 0 and everything he does stay the same).
# Run on the VPS from a V3 checkout, where the Mixamo library lives:
#   bash scripts/foe-body/build-minotaur.sh [models/mixamo dir = /srv/dev-jobs/opentrident-site/models/mixamo]
# The hero-body chain (scripts/hero-body/build-psyche.sh), pointed at veteran.glb instead of warrior.glb (same 65 joints and rest rotations):
# 1. prep-mixamo-body.py: the Minotaur scaled once so his hips stand where the Centurion's pelvis does (his clips key it by height); textures to
#    WebP 1024; materials matte (metallic 0; Mixamo's glossiness map dropped), as Psyche's.
# 2. hero-exo.mjs: the Centurion's 65 joints moved onto the Minotaur's, his mesh and weights on them; ALL 39 of veteran.glb's clips byte for byte,
#    his weapon sockets (WeaponDrawn, SwordDrawn, SwordSheathed) as they are. The Centurion's own draws (CreatureBody, Photo face, bronze
#    helmet) are dropped. The Minotaur's mesh node (Ch25) becomes `Steel`.
# 3. finish-foe.py: the Centurion's empty slot markers unlinked; the body split one node per texture tile, the largest `Steel` with slot Body.
# 4. cut-kit.mjs: his kit cut to the scutum (the Shield slot) from carriers-veteran.glb. The armour is cut for the Centurion's body.
set -euo pipefail
MIXAMO=${1:-/srv/dev-jobs/opentrident-site/models/mixamo}
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
python3 -I scripts/hero-body/prep-mixamo-body.py "$MIXAMO/phone/ch25-nonpbr.glb" src/assets/veteran.glb "$TMP/minotaur-prep.glb"
node scripts/hero-body/hero-exo.mjs src/assets/veteran.glb "$TMP/minotaur-prep.glb" "$TMP/minotaur-base.glb" Ch25
python3 -I scripts/foe-body/finish-foe.py "$TMP/minotaur-base.glb" src/assets/minotaur.glb
node scripts/foe-body/cut-kit.mjs src/assets/loot/carriers-veteran.glb src/assets/loot/carriers-minotaur.glb Shield
ls -l src/assets/minotaur.glb src/assets/loot/carriers-minotaur.glb
