# First-visit weight receipt (V3 main dc8425b)

Measured 2026-10-27 09:47 (+04) on the live build `dc8425b` (`curl https://v3.frankendom.com/build.txt`). Target (docs/V3-OWED-2026-10-26.md section 2): **5 MB first visit**.

## Result

| | Bytes |
|---|---|
| Wire (gzip where served), cold load, 375x812 | **5,333,274 (5.33 MB)** |
| Raw (decoded) | **11,692,483 (11.69 MB)** |
| Requests | 37 |
| Playable (STRIKE enabled) | 4.1 s (Mac M5, Metal, fast network, load 2.5; one run, unthrottled) |

**Over the 5 MB target by about 0.33 MB.** The biggest wire items: the two bodies (1.74 MB together), the physics vendor chunk (0.97 MB), the sound sprite (0.47 MB, ogg, not compressible), main.js (0.35 MB), the two weapon GLBs (0.53 MB). The real cut meshes (3.3 MB and 4.8 MB raw, to be wired) will add weight: they must go through `scripts/optimize-glb.mjs` and be measured against this baseline.

## Psyche GLB: gzip and cache-hashed

`/src/assets/psyche-106.11c8e72d.glb`: `Content-Encoding: gzip` (1,011,809 bytes gzip against 1,601,388 identity), `Cache-Control: public, max-age=31536000, immutable`, content-hashed file name (`11c8e72d`), `Vary: Accept-Encoding`. The Minotaur GLB is the same (`214eaa44`, 724,511 wire).

## By file, largest first (wire / raw bytes; all gzip unless noted)

| File | Wire | Raw |
|---|---|---|
| `psyche-106.11c8e72d.glb` | 1,012,264 | 1,601,388 |
| `vendor/physics.0c76372b.js` | 969,212 | 3,648,097 |
| `minotaur-106.214eaa44.glb` | 724,511 | 1,154,824 |
| `audio/sprite.40e6abe7.ogg` (no gzip) | 467,945 | 467,546 |
| `src/client/main.js` | 346,805 | 973,369 |
| `weapons/shapes/longsword-plain.a3defee2.glb` | 202,148 | 238,288 |
| `vendor/three.050bbc6d.js` | 184,714 | 719,079 |
| `weapons/foe/cleaver.9a60033a.glb` | 171,796 | 233,820 |
| `weapons/shapes/cleaver-plain.b530612c.glb` | 158,458 | 170,700 |
| 8 special clip modules (groundslam, whirlwind, lunge, skullcrack, for Psyche and Minotaur) | 611,243 | 1,809,898 |
| `style.css` | 40,466 | 159,316 |
| 14 blood and splash PNGs (no gzip) | 405,575 | 400,015 |
| 2 hamstrung clips, `/`, measure json, build.txt | 38,137 | 116,143 |

The full per-request list (every URL, status, encoding, cache header, wire and raw bytes) is in `docs/V3-WEIGHT-RECEIPT-2026-10-27.json`. All 37 responses were 200 and every hashed asset carries `max-age=31536000, immutable`; only `/` and `/build.txt` are `no-cache`.

## How it was measured

Playwright Chromium on the Mac, viewport 375x812 at 2x, mobile, cache disabled, fresh context, CDP `Network` events: wire = `loadingFinished.encodedDataLength`, raw = sum of `dataReceived.dataLength` (decoded). Loaded the live URL, waited for STRIKE enabled, then 3 s more. The command (script committed with this receipt): `node scripts/weight-receipt.mjs https://v3.frankendom.com/ docs/V3-WEIGHT-RECEIPT-<date>.json` (needs playwright and its Chromium). The 6.88 MB in section 2 was measured on 553faa6 with a different harness (VPS Chromium); this run is lower mainly because the packed bodies are smaller now. Not measured: a throttled 4G run, or a second (warm) visit.
