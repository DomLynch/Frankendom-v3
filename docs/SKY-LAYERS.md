# Sky layers: what the designer supplies

The skyline plate (Dom's smiling cosmic titan, `src/assets/skyline/skyline-titan.webp`, 2508x627, exactly 4:1) has small coded motion on top of it
(`src/fight/skyanim.ts`, rows in `data/stage.json` under `skyline.plate.anim`). Today every effect is made from the one flattened picture, so it
costs no extra bytes. A proper layer set replaces the made-from-flat parts, one row at a time, with no code change.

All files are WebP, go in `src/assets/skyline/`, and are named in the row (`data/stage.json`). Keep the total of new files under about 150 KB:
the first visit is under a 5.5 MB wire budget (`data/build.json` firstVisitBytes) and the plate is part of it.

| Layer | Row | File spec | What it replaces |
| --- | --- | --- | --- |
| Clean plate | `skyline.plate.file` | Same 4:1 shape (2508x627 or 4096x1024), sRGB. The sky, titan, ring technology and cloud sea WITHOUT the small globe in his hand and WITHOUT the red-pink planet. Set `cropAspect` and `face` if the shape or face position changes. | The flattened plate. Then the globe and planet are drawn only by their own layers (below). |
| Globe surface map | `skyline.plate.anim.globe.file` | Equirectangular (2:1) sphere surface, 256x128 or 512x256, sRGB, alpha allowed (alpha = see-through), seamless left to right. | The fake spin of the globe's own pixels. With a map it spins for real (continuous turn every `secondsPerTurn`) and is lit by `anim.light` (`mapLit` 0..1; 0 = flat). |
| Planet surface map | `skyline.plate.anim.planet.file` | Equirectangular (2:1) surface, 1024x512, sRGB, seamless left to right. Alpha = atmosphere edge. | The slow swing of the planet's disc. With a map it turns for real and is lit by `anim.light`. |
| Glisten mask | `skyline.plate.anim.glisten.file` | Greyscale, red channel used: white where the ring technology should glisten, black elsewhere. Same aspect as the plate, 1254x314 is plenty (about 10 KB). | The mask the shader derives from bright, high-contrast edge pixels. |

Positions are fractions of the plate picture (u across, v down, y down), radii are fractions of the picture's width:

* `globe.centre`, `globe.radius` (now 0.680, 0.670, r 0.0078: the small world left of the raised hand)
* `planet.centre`, `planet.radius` (now 0.336, 0.722, r 0.057)
* `glisten.box` (u0, u1, v0, v1) limits where the sweep can show

If the clean plate moves the globe or planet, change those rows to match; nothing else moves. To check a layer, open the page with and without
`?skyanim=off` (the off link shows the plate on its own). Layers are optional per row: leave a `file` as `''` and that effect is made from the plate.

Not needed from the designer: a turn-frame sheet is not used. The globe spin is a surface map turned by the shader, which is smaller (one 512x256 map
instead of a frame sheet) and never shows a frame step.
