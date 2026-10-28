# Share clip: design note

Dom: "share clip video that can be uploaded to social media; Frankendom 1 already has a clip feature and it WORKS: reuse how they did it."
Docs only. The implementation is the next PR.

## 1. How V1 does it (DomLynch/RPG-game, trunk `codex/01a09a76/task-1`, PRs #827, #1008)

| Question | V1 answer | File |
|---|---|---|
| Capture | Record-on-trigger. The player taps SHARE then CLIP on the end screen; the game **re-plays the stored deterministic fight record** (last 5 s + finisher + 1 s tail, capped 8 s after the kill) on the live canvas and records that replay in real time. No ring buffer. | `src/clip.ts`, `src/fight/match.ts:217-235` (`startClip`/`endClip`), `src/main.ts` ~936-1020 |
| Encoder | Zero dependencies: `canvas.captureStream(30)` + `MediaRecorder`, `videoBitsPerSecond` 4 Mbps, `recorder.start(1000)`. | `clip.ts` `recordClip` |
| Format | First type `MediaRecorder.isTypeSupported` accepts of `video/mp4;codecs=avc1`, `video/mp4`, `video/webm;codecs=vp9,opus`, `video/webm;codecs=vp8,opus`, `video/webm`. iOS Safari (14.5+) records MP4 natively; Chrome 126+ records MP4; older Android Chrome gets WebM. File `frankendom-<boss>.mp4\|webm`. | `clip.ts` `CLIP_TYPES`, `clipFileName` |
| Frame | A second 2D canvas 720x1280 (9:16). Each rendered frame the WebGL canvas is copied into it with a centre crop (`cropRect`), in the same task as the render (the WebGL drawing buffer is only valid then). The HUD is DOM so it is never in the clip. | `clip.ts` `draw()` |
| Audio | **V1 records audio**: the mixed game audio is tapped off the master gain into a `MediaStreamAudioDestinationNode` and added to the stream. Followed in V3 (see 3). | `src/fight/sound/feedback.ts:190-195` |
| Limits | 10 s nominal, 8 s hard cap after the kill, 720x1280, 30 fps, 4 Mbps (about 3-5 MB). Tuning rows live in `src/present-rows.json:3-9`. No watermark in V1. | |
| Share | `navigator.share({files:[file], title})` when `navigator.canShare({files})`; otherwise an `<a download>` with an object URL (revoked after 60 s). Tried at once after the file is made; **if the browser refuses (no fresh tap) the button reads SEND and a second tap shares**. | `main.ts` `sendClip` |
| Traps handled | `new MediaRecorder`/`start` can throw on phones: stop the track and say so. `onerror` mid-clip resolves null (never hangs). `stop()` guarded on an inactive recorder. A second tap while recording cancels. An epoch counter drops a late file when the next fight began. `clipSupported()` hides the button when the browser cannot record. | `clip.ts`, `main.ts` |
| Cost | Real-time: the player waits the full clip length (Dom found 9 s lead too slow, so the lead went to 5 s). | |

I adapt the shape (type pick, crop, `recordClip` guards, `sendClip` flow, epoch guard, audio tap, file name), not the code verbatim: V1 `clip.ts` `clipType`, `clipFileName`, `cropRect`, `recordClip`; `main.ts` `sendClip`/`endClip`; `feedback.ts` `stream`/`untap`.

## 2. Why V3 cannot copy the replay

V3's zone is real time and not a stored record: the fight is not re-playable (free camera, other attackers, roaming). So V3 needs a **live buffer** of the last seconds. Choices weighed:

| Option | Verdict |
|---|---|
| Re-simulate the kill with the cut camera | Not deterministic in the zone. Rejected. |
| One `MediaRecorder` with a rolling chunk array | The chunks after the first are not a playable file (no header, no keyframe at the cut). Rejected. |
| Frames in memory, encode at the kill | 6 s at 720x1280 is about 660 MB. Rejected. |
| WebCodecs `VideoEncoder` plus a hand-written MP4 muxer, keyframe-aligned ring | Best quality and one encoder, but needs a muxer and iOS WebCodecs encode is newer. Parked as phase 2. |
| **Two staggered `MediaRecorder`s, each restarted every `2L` seconds, offset by `L`** | **Chosen.** Proven in Chromium (below). Zero dependencies, each recorder's output is a complete valid file. |

**The staggered pair.** Recorder A starts when a boss fight is engaged; recorder B starts `L` seconds later; every `L` seconds the older one is stopped and thrown away and a new one starts. At any instant the oldest holds between `L` and `2L` seconds. At the kill the oldest keeps recording for the tail (the finisher plays on the cut camera), then stops: the file is `L..2L` seconds of lead plus the tail. Nothing is concatenated, no remux.

Proof (headless Chromium 1234 on the Mac, 360x640 animated source, `L` = 3 s, "kill" at 10.3 s, 1.5 s tail): the oldest recorder had held 4.3 s before the kill (inside L..2L); the file is `video/mp4;codecs=avc1`, ffprobe `h264 720x1280, duration 5.80 s, 936 KB`. The pair costs two encoders while a boss fight is engaged and zero otherwise; both share one 2D frame canvas and one audio tap, so there is only one `drawImage` per frame.

With the data defaults (`L` = 4 s, tail 3 s) a clip is 7-11 s and about 3-5 MB.

## 3. Mapping to V3

- **Canvas**: `#world`, a `THREE.WebGLRenderer` without `preserveDrawingBuffer` (`src/fight/scene.ts`). Copy right after `view.render(...)` in `frame()` (`src/client/main.ts` ~655), same task, as V1 does. At 60 Hz the copy runs every other frame (30 fps).
- **Buffer window**: records only while `engaged` is true (a boss fight), so roaming costs nothing.
- **The moment**: the existing `reportFight('boss_kill', ...)` call (`main.ts` ~447, where `killMarked` latches). The module is told "moment now"; it lets the finisher and cut camera play for `tailSeconds`, then stops the oldest recorder, makes the file and shows the button. The kill coins (`onBossKilled` / corpse-run `earn`) land at the same instant and are DOM, so they are not in the video.
- **Extension point (Daily Pit, Pit Crawl)**: one DOM event on `window`, `v3:clip-moment`, `detail: { label: string }` (`label` is a boss kind or `pit-result`; a lower-case id only). `share-clip.ts` listens; `main.ts` dispatches it at the boss kill; the Pit agents dispatch the same event at their result and set `window.__v3Clip.arm(true/false)` if they are not driven by `engaged`. No new import is needed in their code.
- **Button**: a small DOM button in the kill HUD (copy from `data/share-clip.json`), shown after the clip is made, hidden when the player moves on or the next fight starts. States: Making / Share clip / Send (second tap) / Saved.
- **Audio**: V1 records audio, so V3 does too: a tap on the `feedback.ts` master (`stream()` / `untap()`, about 6 lines) attached to both recorders; null when there is no AudioContext (silent clip).
- **Watermark**: V1 has none; V3 adds a small text (data row, "frankendom.com") drawn on the 2D frame canvas, bottom corner, after the game copy. It is in the file, not in the page.
- **Data**: `data/share-clip.json` rows (seconds before/after, resolution, fps, bitrate, watermark, button copy, jank guard), validated in `src/sim/validate.js`. Logic in `src/share-clip.ts`; `main.ts` gets a short block.

## 4. Perf cost on phones

- One extra `drawImage(webglCanvas -> 2D)` per recorded frame (30 fps) plus two hardware encoders only during a boss fight. Memory: about 4 Mbps x 2 x up to `2L` s = about 4 MB of chunks, no frame store.
- **Jank guard** (data row): the module averages the frame interval over the first `guardSeconds` of a recording; above `maxFrameMs` it switches buffering off for the visit (no clip, the still fallback is offered instead) so a slow phone never loses frames for a clip nobody asked for. Never throws; any failure leaves the game untouched.
- Not measurable headless: real phone frame rate under two H.264 encoders. Dom's phone test (section 7) covers it.

## 5. Fallbacks

1. No `MediaRecorder` / `captureStream` / supported type: no video. Offer **Save picture**: a PNG of the 2D frame canvas taken at the moment (with the watermark), shared with `navigator.share({files})` or downloaded.
2. Constructor or `start` throws, or `onerror` mid-clip: stop tracks, drop the recorders, offer the still.
3. `navigator.share` missing or `canShare({files})` false: `<a download>`.
4. `share` refused (no fresh tap): button reads Send; the second tap shares. `AbortError` (player closed the sheet) just returns to idle.

## 6. Privacy and telemetry

- The file holds only the rendered game frame, the game audio and the watermark text. No account, player id, name, URL, timestamp or device data; the file name is `frankendom-<boss>.<ext>` and the share title is a fixed string. The page's HUD (DOM) is not in the canvas.
- Telemetry `clip_shared` through the existing rows (`data/telemetry.json` `events`, `src/telemetry-rows.ts`, collector re-validates): fields `{ boss, sec }` where `sec` is the **clip length in seconds** only. It fires when the share sheet resolves or the file is downloaded, never carries the file or any free text, and is off wherever telemetry is off (`?telemetry=off`, Do-Not-Track, localhost).

## 7. What cannot be tested headless (Dom, on a phone)

iOS Safari MP4 recording; the iOS and Android share sheet with a file; TikTok / Instagram / X accepting the file; real phone frame rate while recording; audio in the file; the Send (second tap) path. The implementation PR lists exact steps.

## 8. Open choices

- `L` = 4 s and tail 3 s are defaults in the row; Dom can change them.
- Phase 2: WebCodecs ring for a single exact-length encoder, only if the staggered pair costs too much on phones.
