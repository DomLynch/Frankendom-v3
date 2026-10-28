# The Flesh Market: where it lives, the rows, the panel, the anti-exploit rules (stage 0)

Dom: a shady merchant. Trade harvested body parts, rare weapons and monster trophies. 3 items a day, seeded. Sell parts for coins (the #240 corpse-run coins), buy parts and weapons with coins. Local only; a server market is later. Docs only: nothing here changes the game.

## Read first (main 8e95e94, draft #255, Armagedom PRs #479/#483/#481)

- **Coins exist**: `data/corpse-run.json`, 10 per boss kill, `coins` carried (lost on death) and `banked` (safe within 5 m of the camp). The shop spends **banked only** (carried coins are at risk by design; this also teaches banking) and pays sale money into banked.
- **Save**: `frankendom.v3.progress` v1. `writeSave` lists its fields by name, so a new optional field must be added there and in `parseSave`; absent until first used means an old save, and a save that never traded, stay byte for byte the same (the `trophies` field already works this way).
- **Parts** (#255, not merged): `parts: {id: {n, rarity}}` with id `<profileId>:<unit>`, and `equipped: {slot: partId}`, rarity common/rare/epic from the killing star. The market reads and writes `parts` only through a 3-function interface (section 5) so it can be built before #255 stage 1 lands.
- **Weapons**: `Save.unlocked` is rebuilt from the ladder on every parse, so a bought weapon cannot live there. It needs its own field (`market.weapons`) that `heroWeapon()` also reads. Weapon ids must be `src/fight/weapon-defs.json` rows (nothing new); a golden weapon is just another row once the golden-weapons agent ships it.
- **Trophies**: `Save.trophies[tier]` counts star kills (data/stars.json). Sell only; never bought (a trophy is proof of a kill).
- **Armagedom shape (read, not copied)**: a shop is a data row (id, npc, title, radius); tap-to-open when inside the radius; one adapter module is the only thing that touches storage and never throws; stock is a pure function of a template table and the UTC day, no cron; Buy and Sell tabs in one panel; an offline state instead of errors; tests use a mock of the same shape. V3 takes the shape only. No ids, prices, art or Supabase.

## 1. Where the merchant lives

**An NPC in the yard, near the camp, tap to open.** The yard (`areas` yard: x 186-214, z 33-61) is the safe rect: pvp off, no spawns, and the hero respawns at the camp (200, 54). Merchant at **(203, 51)**, 3.6 m from the camp: inside the 5 m bank radius, so a returning hero banks his coins on the way past and the merchant is the first thing he meets. A menu entry is rejected: V3 has no burger menu until #255 stage 1 adds one, and a person you walk up to is the game's flavour.

- **Open**: a DOM chip ("Trade", min 48 px) appears above the merchant when the hero is within **4 m**, same pattern as the pickup hint and corpse-run marker (DOM over the canvas, pointer events only on the chip, never touches sim, camera or input). Tap opens the panel. Walking beyond **6 m**, or dying, closes it. No fight can start in the yard (spawnsAllowed false), so the sim is never paused.
- **Radar**: the existing `npc` class in `data/radar.json` shows him; no new class.
- **Body (no new art)**: reuse a 106 body already in `src/assets`: **`kachujin-106.glb`**. Every 106 body is also a boss profile; Kachujin is a profile row but no zone spawn uses him, and the merchant is not a fight (no profile, brain or spawn row). Swapping is one data row (`merchant.body`; Nan, Sir Reginald or the King also work). Idle uses the existing 106 idle clip; no new animation. **Lazy**: fetched after first frame, only when the hero is within `loadMetres` (40), so first-visit bytes are untouched. **Decision (coordinator): the final merchant body is `mh-crowd-b1-02`** (long-coat MakeHuman crowd body, 106 rig, idle clip, under 1.2 MB, no cut), which OpenTrident Dev is packing as a draft PR; PR number and stem to come. Until it lands the row holds `kachujin` (the small existing body), and the swap is that one data row. ARMAGEDOM's hub NPCs are not used.
- **Name and voice**: "Gristle". Lines show in the existing HUD line style, no pop-up.

## 2. `data/market.json` (every number is a row, validated in `src/sim/validate.js`)

```json
{
  "about": "...",
  "merchant": { "id": "gristle", "name": "Gristle", "body": "kachujin", "x": 203, "z": 51, "openMetres": 4, "closeMetres": 6, "loadMetres": 40 },
  "salt": "flesh-market",
  "stock": { "size": 3, "slots": ["part", "part", "any"], "dayRule": "utc-date" },
  "classes": { "buy": ["part", "weapon"], "sell": ["part", "trophy"] },
  "price": {
    "base":   { "common": 30, "rare": 90, "epic": 250 },
    "buyX": 1.5, "sellX": 0.35,
    "weapon": { "gladius": 150, "cleaver": 220, "maul": 400 },
    "trophy": { "1": 40, "2": 120 }
  },
  "caps": { "buyMax": 2000, "sellPerDay": 400, "perItemPerDay": 1 },
  "weights": { "common": 6, "rare": 3, "epic": 1, "weapon": 2 },
  "lines": { "greet": [], "buy": [], "sell": [], "broke": [], "soldOut": [], "restock": [], "leave": [] },
  "ui": { "zIndex": 30, "chip": "Trade", "sheetHeightFrac": 0.62 }
}
```

- **Price by rarity**: part base common 30 / rare 90 / epic 250. At 10 coins a boss kill, a common part costs about 4-5 kills, an epic about 38. Weapon and trophy values are rows keyed by weapon id and star tier, so a golden weapon is one new row.
- **Sell ratio** `sellX` 0.35 of base (common 10, rare 31, epic 87). **Buy markup** `buyX` 1.5 (common 45, rare 135, epic 375). Weapons bought at base x `buyX`.
- **Daily stock**: 3. Slot classes `["part","part","any"]`: two parts and a wildcard (part or weapon). Trophies are never in stock.
- **Sold to the player**: parts and weapons. **Bought from the player**: parts and trophies. Weapons are not bought back (earned by killing a boss; buying is an extra route, not a loop).
- **Restock rule**: stock is a pure function of the **UTC date** (`YYYY-MM-DD` from `Date.now()`), so it rolls at 00:00 UTC with no timer. Nothing the player owns changes the draw (the pool is the full table, not his inventory).
- **Which parts**: every profile-by-unit kind (`<profileId>:<unit>`, 12 profiles x 6 units) at a rarity drawn by weight. Owned parts still appear (button reads "Owned x2" and still works; with the sell loss a duplicate is a net cost, not a loop). Owned weapons show "Owned" and are disabled.
- **Merchant lines** (rows; index = (day hash + trade count) mod length, no Math.random):
  - greet: "Fresh ones, still warm." / "Mind the floor. It is mostly you."
  - buy: "No refunds. No questions. Mostly no questions." / "It will grow on you. Literally."
  - sell: "Whose leg was it? Never mind." / "I will not ask. I will weigh."
  - broke: "Coins, friend. The shiny round things." / "I do not accept exposure."
  - soldOut: "Gone. Someone has taste." restock: "New day, new corpses." leave: "Come back when you are dead. Or richer."

## 3. Shop panel at 375

A **bottom sheet**, full width, 62% of viewport height, over the HUD (sticks idle while open), the pickup hint's dark style and `#ffd34a` accent. Close = X (48 px), tap outside, or walk away.

```
+-----------------------------+
| Gristle                  [x]|
| "Fresh ones, still warm."   |
| Banked 120      [Buy][Sell] |
|-----------------------------|
| Minotaur: left arm    RARE  |  row 56 px
| 135 coins            [Buy]  |
|-----------------------------|
| Gargantua: head     COMMON  |
| Owned x1 - 45 coins  [Buy]  |
|-----------------------------|
| Cleaver              weapon |
| 330 coins            [Buy]  |
+-----------------------------+
```

- **Buy tab**: the 3 stock rows (name, rarity or "weapon", price, Buy). Not enough banked: Buy disabled and the price says how short. A bought row reads "Sold" until tomorrow.
- **Sell tab**: the player's parts (name, rarity, n, price), then trophies by tier. One tap on Sell sells one item; rare and epic ask "Sure?" on a second tap. The last copy of an equipped part and the weapon in hand are not listed.
- 3 stock rows plus header fit with no scroll; Sell scrolls inside the sheet. Text 11-13 px. No art (rarity as coloured text, epic in star gold), no sound, no haptics, no tutorial.
- `?save=off`: no save, so no merchant (not drawn, chip never shows), same as the corpse run. **No new URL flag.**

## 4. Anti-exploit rules (validated at load, tested)

1. **No sell-then-rebuy gain**: the validator rejects any table where, for any rarity, `floor(base*sellX) >= ceil(base*buyX)`, or `sellX > 0.5`, or `buyX < 1`.
2. **Stock is seeded, not rerollable**: `stock(day)` is a pure function of `(salt, UTC date)`: mulberry32 over `hash32(salt + date)` (the helper `src/stars.ts` uses), weighted draw without replacement. Reload, re-open, buying or selling never change it. Today's purchases are recorded (`market.bought`) so they stay "Sold" after a reload. A clock rolled back only re-shows a past day's stock the player could already buy at full price: no gain.
3. **Caps**: one purchase per stock item per day, `buyMax` 2000 on any price, `sellPerDay` 400 coins of sales per UTC day (a part-duplication bug cannot print coins; `market.soldToday` records it).
4. **Only banked coins** are spent or earned, so the corpse-run death penalty cannot be dodged and the shop is never a way to protect carried coins.
5. **Integers and clamps**: coins are whole numbers capped at the corpse-run `cap`; a purchase that would exceed it is refused; negative or NaN price rows fail validation.
6. Weapons are not sellable; an equipped part cannot be sold unless a second copy exists.
7. Unknown ids in a save (table edited since) are dropped on read, as `progression.json` does for bosses.

## 5. Save fields (optional, cleaned on read, absent until the first trade)

Extend `Save` in `src/progression.ts` (and `writeSave` / `parseSave`) with:

```ts
market?: { day: string; bought: string[]; soldToday: number; weapons: string[]; trades: number }
```

`day` is the UTC date that `bought` and `soldToday` belong to (a different day on read resets both). `weapons` are bought weapon ids (validated against `weapon-defs.json`; `heroWeapon` accepts these too). `trades` seeds the line index. No version bump. `parts` and `equipped` stay owned by the parts stage.

**Parts interface (stub until #255 stage 1 merges)**, `src/market-inventory.ts`: `listParts(save): {id, n, rarity, equipped}[]`, `addPart(save, id, rarity): Save`, `removePart(save, id): Save | null` (null = not owned, or the last copy of an equipped part). Reads `save.parts` in the shape #255 documents; when #255 lands the file shrinks to re-exports.

## 6. The commentator hook

Events on the existing feel bus: `market:open {day, stock}`, `market:buy {item, class, rarity, price, coinsLeft}`, `market:sell {item, class, rarity, price, coinsLeft}`, `market:refuse {reason}` (`broke`, `soldOut`, `capped`), `market:restock {day}` (first open of a UTC date). Merchant lines are `{event, text}` rows in `data/market.json`, so the commentator can subscribe, or replace the line picker, without touching the market.

## 7. Stage 1 plan

- New: `src/market.ts` (pure: `stockFor`, `priceOf`, `buy`, `sell`, line pick; no DOM, the day is passed in), `src/market-view.ts` (chip and sheet), `src/market-inventory.ts` (the stub), `data/market.json`, `validateMarket` in `src/sim/validate.js`.
- Edits: `src/progression.ts` (the `market` field, ~15 lines), `src/client/main.ts` (one init and one tick call), `heroWeapon` accepts `market.weapons`.
- Tests (`test/market.test.mjs`): pure rules; plus real-input runs on the **built dist** (one Chromium, suites via scripts/hf-job.sh): walk to the yard, tap Trade, buy, sell, reload keeps the same stock and the bought item stays Sold; old-save and `?save=off` rows. 375 stills of the sheet. CI: test, zone-sql, built-game boot.
- Starts when the parts stage 1 PR exists (draft or merged); until then it builds on the stub and rebases onto `save.parts`.

## Open questions (none block stage 1)

- Merchant body: Kachujin placeholder; `mh-crowd-b1-02` replaces it when OpenTrident Dev's PR lands (data row switch).
- Price numbers are a first pass against 10 coins a kill; they are rows, so tuning is a data edit.
