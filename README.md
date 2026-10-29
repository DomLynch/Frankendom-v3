# Frankendom V3

A mobile-first arena fighter that runs in the browser: you fight a boss in a sand pit, one duel at a time, on a deterministic 60 Hz sim. V3 is V1's fight core (sim, feel layer, data) in V2's light shell: one code bundle, hashed paths, push-to-deploy on green. Live at https://v3.frankendom.com. V1 (frankendom.com) stays the reference.

Read `docs/PLAN.md` first: the decision, the measured V1 map, the gates, and the handoff log at the top.

## Run, build, test

Node 22.18 or newer.

```
npm ci
npm run build          # dist/, build id "dev" (BUILD=<sha> for a release id); needs jpegtran for the GLB pack
npm run serve [port]   # serves dist/ for a local look
npm test               # the whole unit suite (node --test test/**/*.test.mjs)
npm run check:stubs    # nothing outside src/stubs.ts imports core/*, net, zones, legends or pit
npm run check:as-data  # no number, timer, cap or label that belongs in a data row, in the live-zone code
npm run gate0          # Gate 0 (below)
node scripts/boot-check.mjs   # boots the BUILT game in headless Chromium at 375 wide (needs playwright, see ci.yml)
```

CI (`.github/workflows/ci.yml`) runs the same on every PR: test, built-game boot, zone SQL against a real Postgres. Both `test` and `built-game boot` must be green to merge.

Heavy jobs (suites, builds, Chromium) go to the Hugging Face CPU box: on the VPS, `scripts/hf-job.sh <full-sha> -- <cmd>` runs `<cmd>` at a pushed sha and prints the job id; follow it with `hf jobs logs <id>`. The sha must be pushed first. The job carries no secrets.

## Layout

| Path | What |
|---|---|
| `src/` | the game: `sim/` and `fight/` (the duel, camera, meters, effects), `client/` (entry, HUD), `core/`, `zone/`, `presence/`, `assets/` (GLBs, textures), `style.css` |
| `data/` | every tunable value as a validated row (`*.json`); `src/sim/validate.js` checks them |
| `test/` | `node --test` suites; `test/gate0/` is the V1 equivalence gate |
| `scripts/` | build (`build.mjs`), checks, weight receipt, stills and clip tools, `hf-job.sh` |
| `server/`, `deploy/`, `supabase/` | presence and telemetry servers, their systemd/nginx units, SQL migrations |
| `public/` | files copied as-is into `dist/` (V1 names some by URL) |
| `bench/` | standalone tools that are NOT shipped (the `physics1` frame-time bench) |
| `docs/` | plan, designs, weight receipts (`docs/V3-WEIGHT-RECEIPT-*.json`), PR evidence |

## Rules

- **Data rows, not literals.** A value, map or choice lives in a validated `data/*.json` row, not a number in code. `check:as-data` enforces it for the live-zone code.
- **No URL flags.** Behaviour is not switched by query strings; a choice is a data row.
- **Test the BUILT dist.** A green unit suite is not a green game: the built-game boot (`scripts/boot-check.mjs`) must pass on the production build, with zero console errors and zero failed requests.
- **Gate 0.** `src/fight` must replay V1's input scripts tick for tick as V1 at the seed tag `v1-seed-82a994d15`. In a shallow clone fetch the tag first: `git fetch --no-tags --depth=1 origin refs/tags/v1-seed-82a994d15:refs/tags/v1-seed-82a994d15`. A deliberate change re-pins with its reason; the feature is never reverted to make a pin pass.
- **Weight budget.** First-visit bytes are budgeted. A PR that touches shipped files carries a receipt from `scripts/weight-receipt.mjs`.
- **Heavy work goes to `hf-job.sh`**, not a busy laptop.
- **Repo hygiene.** No build output (`dist` is ignored), no video files (`*.mp4` is ignored), no PR-body files at the root. Evidence for a visible PR is attached to the PR; commit it under `docs/` only when a doc or test names it.
