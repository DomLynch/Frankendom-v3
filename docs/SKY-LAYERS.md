# Sky layers: the designer's file list (as delivered 2026-10-27)

The skyline plate (Dom's smiling cosmic titan) is a CLEAN plate with registered layers over it, plus small coded motion
(`src/fight/skyanim.ts`, rows in `data/stage.json` under `skyline.plate` and `skyline.plate.anim`). Every file is named by a row, all live in
`src/assets/skyline/`, and a re-delivery is a file swap (same name = replace the file; a new name = change the row's `file`). Everything is registered to the 4096x1024 plate.

| File | Row | Spec | Used for |
| --- | --- | --- | --- |
| `13_plate_fixed.webp` (pack 2; replaces `01_clean_plate.webp`) | `skyline.plate.file` | 4096x1024 (4:1), sRGB, no globe, no planet; the ghost smudge near the planet and the horizon blur of pack 1 are fixed. Delivered at 79 KB (the pack-1 plate was recompressed 251 KB to 134 KB). | The base picture, shown at native aspect. |
| `07_eyes_closed.webp`, `08_eyes_wink.webp` (pack 2) | `anim.eyes.blink.file`, `anim.eyes.wink.file` | RGBA patches, 227x81, both at plate rect [2246,606,2473,687], straight alpha, no scaling. | Blink (both closed) and wink (viewer-left closed) overlays; edge feathered `featherPx`. |
| `09_drool_mask.png` (pack 2) | `anim.drool.shimmer.file` | 8-bit greyscale, full plate size; the streak is within [2394,679,2421,752]. | A slow light running down the stationary streak. |
| `10_drop_sprite.png`, `10_drop_sprite_stretched.png` (pack 2) | `anim.drool.drop.file`, `.stretchedFile` | RGBA 24x48 and 24x96, anchor (12,0), spawn at plate (2407,745). | The falling droplet: plain at low speed, stretched at higher. |
| `11_planet_surface.webp`, `12_planet_shading.webp` (pack 2) | `anim.planet.sphere.file`, `.shading.file` | 2048x1024 equirectangular (wraps across, clamps up and down), and a 512x512 RGBA shading disc. | The planet as a real turning sphere; `03_red_planet_cutout.webp`'s alpha still hides the part behind the clouds. |
| `03_red_planet_cutout.webp` | `anim.planet.file` | RGBA, full plate size (4096x1024), registered; only the lit half disc above the cloud horizon has alpha. | Composited over the plate at its place (the plate has no planet), plus a faint rim glow pulse. |
| `02_globe_cutout.webp` | `anim.globe.file` | RGBA, full plate size, registered. | Composited over the plate; its own pixels are spun a little (fake spin) and a glint drifts over it. |
| `04_glisten_mask.png` | `anim.glisten.file` | 8-bit greyscale, full plate size; white = may shimmer. | Drives the additive shimmer on the ring technology. The halo never moves. |
| `05_globe_turn_24_frames.webp` | `anim.globe.sprite.file` | 4096x1024 sheet, 8x3 frames, each frame a 222 px cell with a sphere of radius about 104 px, per-frame x,y,w,h in the manifest (`anim.globe.sprite.rects`). | The globe turn by sprite steps, 0.15 s per frame. Off by default (see below). |
| `06_red_planet_tileable_texture.webp` | not used | 1024x512, mirrored symmetric pink image. | Not wired: a slow drift under the cut-out's alpha would show the mirror seam. A re-delivery that is a true seamless texture can be wired as a row. |
| `manifest.json` | the registration rows | globe centre 2787.0, 681.9 px, radius 32.7 px; planet centre 1367.8, 736.6 px, radius 249.1 px; sprite frames 24, 0.15 s. | `anim.globe.centre/radius`, `anim.planet.centre/radius` are these divided by the plate size (radius by its width); `anim.globe.sprite.rects` are the manifest's frame rects. |

Cut-outs and the mask are cropped to their `rect` (a row, in plate fractions) when they land, so the GPU never holds a full 4096x1024 texture per layer. They are fetched
after the first frame and the plate waits for them (up to `readyTimeoutSeconds`), so nothing pops in. A layer with `on` false is not fetched.

Switches: `?skyanim=off` stops the motion (the cut-outs still composite: they are part of the picture); prefers-reduced-motion does the same; `?skyflat=1` shows the old flattened plate
(`skyline.plate.flatFile`) with no layers; `?skyplate=v1` draws the old 360-degree strip.

What would help in the next delivery: a globe turn sheet that reads as one clean world (the frames now show a pink arch pattern on a blue ball), the planet cut-out with its lower part
kept at full alpha (it is faded near the horizon) or a full disc, a glisten mask with wider soft shapes (the speckles are about a pixel across), and a true seamless planet texture.
